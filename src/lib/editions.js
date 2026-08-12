// ══════════════════════════════════════════════════════════════════
//  editions — the top-level list of tournament years.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup. `wbc_editions` is deliberately NOT tournament-
// scoped — it IS the index of tournaments. Each doc:
//   { id, year, name, status, created_from }
//     status:       "draft" | "published" | "archived"
//     id:           the tournament_id every other collection filters on
//                   (wbc_2026), and the source of the slug baked into
//                   document ids (see getEditionSlug in firebase.js)
//     created_from: source edition id when this one was cloned, else null
//
// Switching editions flips the active-edition pointer in firebase.js and hard-
// reloads. The reload is not laziness: a live db.subscribe captures its filter
// value when it is created, so App.jsx's dozen open subscriptions would keep
// streaming the OLD edition's rows into the new edition's state. Tearing the
// whole tree down is the simplest correct re-init.
//
// Difference from Bourbon Cup worth knowing: BC clones its player ROSTER into
// each edition, because its players are edition-scoped documents. WBC's
// `players` collection is a global career registry (player_id is a permanent
// identity shared with 16 years of historical data), and it is
// `tournament_players` that binds a player to an edition with that year's
// handicap index. So cloning a WBC roster copies the binding rows and leaves
// the player records alone — the same golfers, a new year's indexes.
import { collection, doc, getDocs, setDoc, deleteDoc, query, where, getCountFromServer } from "firebase/firestore";
import { _db, getActiveTournamentId, setActiveTournamentId, getEditionSlug } from "../firebase";
import {
  editionDoc, cloneMeta, cloneSideGames, cloneRosterRow, cloneRoundRow,
} from "./editionClone";
import { editionRounds, indexFor, matchHistoryName } from "./handicap";
import { editionYear } from "./editionId";
import { editionState, deleteVerdict } from "./editionLifecycle";
import {
  countByTournament, firstByTournament, needsPairings,
  readSummaryCache, writeSummaryCache, forgetSummary,
} from "./editionSummary";
import { rowsToPairings } from "./pairings";
import { clampRounds } from "../constants";

export const EDITIONS_COL = "wbc_editions";

// This module talks to Firestore directly rather than through App.jsx's `db`
// helper: that helper is defined inside App.jsx, and importing it here would
// make App.jsx ↔ editions.js circular.
const _get = async (col, filters = []) => {
  const ref = collection(_db, col);
  const q = filters.length ? query(ref, ...filters.map(f => where(f.field, f.op, f.value))) : ref;
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
};
const _upsert = async (col, data) => {
  if (!data?.id) return null;
  await setDoc(doc(_db, col, String(data.id)), data, { merge: true });
  return data;
};
const _deleteDoc = async (col, id) => { await deleteDoc(doc(_db, col, String(id))); };

const byYearDesc = (rows) => [...rows].sort((a, b) => (b.year || 0) - (a.year || 0));

export const loadEditions = async () => byYearDesc(await _get(EDITIONS_COL));

// ── How much is actually in each year ───────────────────────────────
// The picker's ONE reliable signal. `status` is a label somebody's phone
// stamped — see the note at the top of lib/editionClone.js for how it ends up
// reading PUBLISHED on an empty year and DRAFT on a finished tournament — so
// what a year holds has to be counted rather than believed.
//
// ── How it is gathered, and why not one query per year ────────────
// See the header of lib/editionSummary for the shape of the problem. The short
// version: the roster, the round setup and the state document are TINY across
// the whole history — a few hundred documents between them — so each is read
// ONCE, whole, and split by tournament_id. That is three round trips in place
// of fifty-one, and it also collapses a hop: the state documents arrive with
// the finalization map already on them, where before the state could only be
// fetched after a score count came back saying the year had been played.
//
// hole_scores is the exception and stays a server-side aggregation, one per
// edition. getCountFromServer, not getDocs: a year with thirteen hundred hole
// scores costs one small response instead of downloading every score to call
// `.length` on it. Opening the picker must not pull a tournament's worth of
// data across a phone's connection.
const BULK_COLS = ["tournament_players", "tournament_rounds", "tournament_state"];

const _count = async (col, tid) => {
  const snap = await getCountFromServer(
    query(collection(_db, col), where("tournament_id", "==", tid)),
  );
  return snap.data().count || 0;
};

const _tidFilter = (tid) => [{ field: "tournament_id", op: "==", value: tid }];

// { [editionId]: { players, rounds, scores, roundCount, finalizedRounds, pairings } }
//
// An edition whose reads fail is left OUT of the map rather than reported as
// zero — "we couldn't read it" and "there is nothing in it" are opposite
// answers, and the second one would have the form offering to clone from a
// year it just failed to see, and the delete button offering to bin it. A
// failure of one of the WHOLE-collection reads takes every year with it, which
// is the same rule applied honestly: nothing was readable, so nothing is
// reported, and deleteVerdict refuses across the board.
export const loadEditionSummaries = async (ids = []) => {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return {};
  const out = {};

  // One hop: the three small collections and every score count together,
  // rather than the counts first and the state documents behind them. A score
  // count that fails resolves to null and leaves that year unsummarised,
  // exactly as its own try/catch used to.
  let bulk, scored;
  try {
    [bulk, scored] = await Promise.all([
      Promise.all(BULK_COLS.map(col => _get(col))),
      Promise.all(list.map(id => _count("hole_scores", id).then(n => [id, n], () => [id, null]))),
    ]);
  } catch { return out; }

  const [playerRows, roundRows, stateRows] = bulk;
  const players = countByTournament(playerRows);
  const rounds = countByTournament(roundRows);
  const states = firstByTournament(stateRows);

  for (const [id, scores] of scored) {
    if (scores === null) continue;
    const state = states.get(id);
    const summary = {
      players: players.get(id) || 0,
      rounds: rounds.get(id) || 0,
      scores,
    };
    // A year nobody has played cannot be finished, so there is nothing to ask
    // about it — and `finalizedRounds` on an empty year would read as a claim
    // about rounds that were never played.
    if (scores > 0) {
      summary.roundCount = clampRounds(state?.meta?.rounds);
      summary.finalizedRounds = state?.finalized_rounds || {};
      summary.pairings = {};
    }
    out[id] = summary;
  }

  // The second hop, and only for the years the finalization map could not
  // settle on its own — a round that ended by every group signing its card
  // stores a GROUP KEY, which cannot be checked without knowing the groups.
  // In practice that is the tournament being played, if any: one read, not
  // seventeen.
  await Promise.all(Object.entries(out)
    .filter(([, s]) => needsPairings(s))
    .map(async ([id, s]) => {
      try { s.pairings = rowsToPairings(await _get("pairings", _tidFilter(id))); }
      catch { delete out[id]; }
    }));

  writeSummaryCache(out);
  return out;
};

// What the picker already knows, read synchronously so the list can paint its
// summary lines on the frame it opens instead of showing "Counting…" for as
// long as the network takes. Replaced by loadEditionSummaries the moment that
// resolves — see the cache note in lib/editionSummary for why a stale count
// here cannot become a wrong delete.
export const cachedEditionSummaries = (ids = []) => readSummaryCache(ids);

// Seed the currently-active edition into the collection if it isn't there yet,
// so the picker always shows at least the running year. Idempotent — safe to
// call on every open. Derives the year from the id (wbc_2026 → 2026).
export const ensureActiveEditionDoc = async (name) => {
  const id = getActiveTournamentId();
  const rows = await _get(EDITIONS_COL);
  if (rows.some(e => e.id === id)) return byYearDesc(rows);
  const year = parseInt(String(id).replace(/\D/g, ""), 10) || new Date().getFullYear();
  await _upsert(EDITIONS_COL, {
    id, year, name: name || `WBC ${year}`, status: "published", created_from: null,
  });
  return byYearDesc(await _get(EDITIONS_COL));
};

export const editionId = (year) => `wbc_${year}`;

// Create a new, empty draft edition. Cloning is `cloneEdition`.
export const createEdition = async ({ year, name, id }) => {
  const doc_ = editionDoc({ year, id: id || editionId(year), name });
  await _upsert(EDITIONS_COL, doc_);
  return doc_;
};

// There was a setEditionStatus here, and a draft/published/archived pill in
// the picker to drive it. Both are gone: a year's state is DERIVED from what
// it holds now (see lib/editionLifecycle.js), which is the only version of it
// that cannot be stale. The `status` field is still written by editionDoc
// because every existing document carries one and dropping it mid-flight would
// leave a half-populated collection — nothing reads it.

// ── Clone an existing edition into another year ─────────────────────
// Copies only the STRUCTURAL setup the caller opts into. RESULTS ARE NEVER
// CLONED — scores, pairings, tee assignments, skins/CTP, scorecard signatures
// and finalization state always start empty. A new year begins with nobody
// having played a hole; anything else would show last year's leaderboard under
// this year's name. What each row keeps and what it drops is decided in
// lib/editionClone.js, where it can be tested without Firebase.
//
// The target does not have to be new. `wbc_2026` gets seeded into the list the
// moment a director's phone points at it, so the year they are about to build
// usually already exists as an empty row — refusing to clone into it would
// mean deleting a year in order to create it. Cloning into a year that already
// holds data is an OVERWRITE of the parts being copied, and the caller is
// expected to have confirmed that; see EditionSwitcher.
//
// options = { players, courses, rounds, tournamentName, buyIns } booleans.
// ── freshIndexes ───────────────────────────────────────────────────
// Every player's WBC Index recomputed to include the rounds of ONE edition,
// keyed by player_id.
//
// The index math lives in lib/handicap and knows nothing about Firestore; this
// is the read that feeds it. Five collections, once, for a director action that
// happens once a year:
//
//   hole_scores      the cards themselves, one row per hole
//   tournament_rounds  which course each round was played on
//   courses / tee_boxes  the ratings those cards are measured against
//   tee_assignments  which tee each player actually played
//
// Returns { [playerId]: { index, playedRounds } }. `playedRounds` is what tells
// the caller whether this player has anything new to say — see rosterHandicap.
export const freshIndexes = async (sourceId) => {
  const year = editionYear(sourceId);
  const f = (tid) => [{ field: "tournament_id", op: "==", value: tid }];
  const [players, holeScores, tRounds, courses, teeBoxes, teeAssignments] = await Promise.all([
    _get("players"),
    _get("hole_scores", f(sourceId)),
    _get("tournament_rounds", f(sourceId)),
    _get("courses"),
    _get("tee_boxes"),
    _get("tee_assignments", f(sourceId)),
  ]);

  // Courses carry their tees in a separate collection, and the rating a round
  // is measured against is the TEE's — so they have to be stitched back
  // together before the math can resolve one.
  const withTees = (courses || []).map(c => ({
    ...c,
    tee_boxes: (teeBoxes || []).filter(t => t.course_id === c.id),
  }));

  const byPlayer = editionRounds({ year, holeScores, tRounds, courses: withTees, teeAssignments });

  const out = {};
  for (const p of players || []) {
    const extraRounds = byPlayer[p.id] || [];
    const name = matchHistoryName(p);
    // Somebody with neither a history name nor a card here has no index to
    // recompute, and saying so is what makes the caller carry theirs forward.
    if (!name && !extraRounds.length) continue;
    const idx = indexFor(name, { override: p.index_override ?? null, extraRounds });
    out[p.id] = { index: idx.index, playedRounds: extraRounds.length };
  }
  return out;
};

export const cloneEdition = async (sourceId, { year, name, id }, options = {}) => {
  const newTid = id || editionId(year);
  const srcSlug = getEditionSlug(sourceId);
  const newSlug = getEditionSlug(newTid);
  const f = (tid) => [{ field: "tournament_id", op: "==", value: tid }];
  const at = { slug: newSlug, tournamentId: newTid };

  // One read of the index for both ends of the clone: the target (whose own
  // status and name must survive it) and the source (whose YEAR is what the
  // cloned tournament name gets re-yeared off).
  const index = await _get(EDITIONS_COL);
  const existing = index.find(e => e.id === newTid) || null;
  const source = index.find(e => e.id === sourceId) || null;

  await _upsert(EDITIONS_COL, editionDoc({ year, id: newTid, name, sourceId, existing }));

  // Roster — the tournament_players binding rows, each starting on a handicap
  // that INCLUDES the year being cloned from.
  //
  // The source edition has just been played, and its rounds are in Firestore
  // rather than in the bundled history (which only moves when data/rounds.csv
  // is re-exported). Reading them here is what stops a new year opening on
  // indexes that predate four rounds of evidence — see freshIndexes.
  if (options.players) {
    const rows = await _get("tournament_players", f(sourceId));
    const fresh = await freshIndexes(sourceId);
    for (const tp of rows) {
      const seed = fresh[tp.player_id] || {};
      const row = cloneRosterRow(tp, { ...at, index: seed.index ?? null, playedRounds: seed.playedRounds || 0 });
      if (row) await _upsert("tournament_players", row);
    }
  }

  // Courses are a GLOBAL registry keyed by course id, not edition-scoped —
  // Treetops is Treetops in any year — so there is nothing to copy. What is
  // edition-scoped is which course each ROUND plays, which is `rounds` below.
  // The option is accepted and ignored so the caller's shape stays stable.

  // Round setup — which course each round is played on.
  if (options.rounds) {
    const rows = await _get("tournament_rounds", f(sourceId));
    for (const r of rows) {
      const row = cloneRoundRow(r, at);
      if (row) await _upsert("tournament_rounds", row);
    }
  }

  // The two halves of the tournament_state singleton worth carrying — the
  // tournament's identity, and what a seat in each betting game costs. Written
  // as ONE upsert so a clone can't land half of them. Everything else on that
  // document is results state (finalized rounds, saved tees, round dates,
  // scoring-open flags) and must start clean.
  if (options.tournamentName || options.buyIns) {
    const rows = await _get("tournament_state", f(sourceId));
    const src = rows[0];
    const patch = {};
    if (options.tournamentName) {
      const meta = cloneMeta(src?.meta, { fromYear: source?.year, toYear: Number(year) });
      if (meta) patch.meta = meta;
    }
    if (options.buyIns) {
      const sideGames = cloneSideGames(src?.side_games);
      if (sideGames) patch.side_games = sideGames;
    }
    if (Object.keys(patch).length) {
      await _upsert("tournament_state", { id: `ts_${newTid}`, tournament_id: newTid, ...patch });
    }
  }

  return { id: newTid, year: Number(year), name, created_from: sourceId, srcSlug, existed: !!existing };
};

// Every tournament-scoped collection, purged when an edition is deleted.
//
// Deliberately absent:
//   players, courses, tee_boxes    global registries shared by every edition —
//                                  deleting 2026 must not delete Treetops or
//                                  erase a golfer's career identity
//   wbc_notifications_tokens       a push token belongs to a DEVICE, not to an
//                                  edition; deleting last year must not
//                                  unsubscribe everyone's phone from this year
//   wbc_accounts / wbc_users       who is signed in, and who they claimed —
//                                  account-level, not edition-level
const EDITION_DATA_COLS = [
  "tournament_players", "tournament_rounds", "pairings", "tee_assignments",
  "hole_scores", "skins", "wbc_scorecard_sigs", "tournament_state",
  "wbc_rounds_state", "wbc_market_result",
];

// Delete an edition AND all of its data. Irreversible.
//
// The guard lives HERE, not on the button. A disabled button is a suggestion —
// it survives exactly as long as nobody refactors the component around it, and
// what it is protecting is the only record that a tournament happened. So the
// check is re-derived from Firestore at the moment of deletion, by the function
// that does the deleting, and every caller inherits it:
//
//   active     refused — it would pull the running app's data out from under
//              itself. Switch away first.
//   complete   refused. A finished tournament is the record of the event, and
//              there is no confirm dialog that makes destroying one a thing
//              this app should help with. It goes through the Firebase console
//              or it does not go.
//   unreadable refused. Not being able to check is not permission.
//
// Throws with the reason rather than returning false, so a refusal reaches the
// director as a sentence instead of a button that quietly did nothing.
export const deleteEdition = async (id) => {
  if (!id) return false;
  const summary = (await loadEditionSummaries([id]))[id];
  const verdict = deleteVerdict(editionState(summary), { isActive: id === getActiveTournamentId() });
  if (!verdict.allowed) {
    const e = new Error(verdict.why || "That tournament can't be deleted.");
    e.code = `edition-delete/${verdict.reason}`;
    throw e;
  }
  for (const col of EDITION_DATA_COLS) {
    const rows = await _get(col, _tidFilter(id));
    for (const r of rows) if (r.id) await _deleteDoc(col, r.id);
  }
  await _deleteDoc(EDITIONS_COL, id);
  // Or the picker paints a row for it from the cache the next time it opens.
  forgetSummary(id);
  return true;
};

// Flip the active pointer, then hard-reload — see the header for why a reload
// rather than a re-subscribe.
//
// The stored player session is cleared: the signed-in golfer may have no
// tournament_players row in the edition being switched to, and carrying a
// stale one across would show them a roster position that does not exist.
// Firebase Auth is untouched, so the director stays signed in and lands on the
// claim screen for the new edition rather than on a login screen.
export const switchEdition = (id, { reload = true } = {}) => {
  setActiveTournamentId(id);
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem("wbc_user");
  } catch { /* blocked storage */ }
  if (reload && typeof window !== "undefined") window.location.reload();
};
