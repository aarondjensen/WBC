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
  SANDBOX_NAME, sandboxScoringOpen,
} from "./editionClone";
import { editionRounds, indexFor, matchHistoryName } from "./handicap";
import { editionYear, SANDBOX_EDITION_ID, isSandboxEdition } from "./editionId";
import { editionState, deleteVerdict } from "./editionLifecycle";
import {
  firstByTournament, needsPairings,
  readSummaryCache, writeSummaryCache, forgetSummary,
  readEditionsCache, writeEditionsCache,
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

// Newest first, and remembered — every path that produces the index writes it
// to the cache the picker paints from, including the one after a delete, so
// the list on screen next time is the list as it was left.
const _index = (rows) => {
  const out = byYearDesc(rows);
  writeEditionsCache(out);
  return out;
};

export const loadEditions = async () => _index(await _get(EDITIONS_COL));

// The years we already know about, read synchronously so the picker opens with
// its rows in place instead of "Loading…". Replaced by the real read on the
// same open — see the cache note in lib/editionSummary for why a stale row
// here cannot become a wrong switch or a wrong delete.
export const cachedEditions = () => readEditionsCache();

// Fetch the years a tap early, so the picker has rows to draw the frame it
// opens instead of a round trip to wait on. More → Tournaments is the door
// nearly everybody uses, and the moment the menu opens is a free half-second.
//
// Once. A device that has opened Tournaments before already has the list and
// pays nothing here; one that hasn't pays a single read of a collection that
// holds one small document per year. Fire and forget — nothing is waiting on
// it, and a failure just means the picker loads the way it used to.
export const warmEditions = () => {
  if (readEditionsCache()) return;
  loadEditions().catch(() => {});
};

// ── How much is actually in each year ───────────────────────────────
// The picker's ONE reliable signal. `status` is a label somebody's phone
// stamped — see the note at the top of lib/editionClone.js for how it ends up
// reading PUBLISHED on an empty year and DRAFT on a finished tournament — so
// what a year holds has to be counted rather than believed.
//
// ── How it is gathered: counts on the server, state in bulk ───────
// Two different tricks, because ROUND TRIPS and DOCUMENT READS are different
// costs and the picker has to be cheap in both.
//
// A COUNT is one billed read per thousand index entries it matches, so asking
// the server how many roster rows a year has costs one read whatever the
// answer is. Reading the roster collection whole to count it in JavaScript
// costs one read PER ROW — 131 of them across the history, against 17 for the
// counts. So players, rounds and scores are all counted on the server, and all
// three counts for all editions go out in ONE burst.
//
// Reading a collection whole is only the cheaper move when the documents are
// few and something other than their number is wanted. That is exactly
// tournament_state: one document per year, seventeen in total, and the picker
// needs the finalization map inside it rather than a count of it. Read whole it
// costs 17 reads instead of 14, and it collapses a HOP — the state used to be
// fetched only after a score count came back saying the year had been played,
// so it could not start until the counts had finished.
//
// This file briefly read the roster and round collections in bulk too, which
// cut the same hop but took the picker from ~107 billed reads to ~250. Counting
// on the server gets the hop back for ~93.
const BULK_COLS = ["tournament_state"];
// Counted per edition, never read whole. hole_scores is the one that would be
// ruinous — a year holds hundreds of scores and 7,632 sit in the imported
// years alone — but the roster and the round setup are the same argument at a
// smaller scale.
const COUNT_COLS = [["players", "tournament_players"], ["rounds", "tournament_rounds"],
                    ["scores", "hole_scores"]];

const _count = async (col, tid) => {
  const snap = await getCountFromServer(
    query(collection(_db, col), where("tournament_id", "==", tid)),
  );
  return snap.data().count || 0;
};

const _tidFilter = (tid) => [{ field: "tournament_id", op: "==", value: tid }];

// { [editionId]: { players, rounds, scores, location, roundCount, finalizedRounds, pairings } }
//
// An edition whose reads fail is left OUT of the map rather than reported as
// zero — "we couldn't read it" and "there is nothing in it" are opposite
// answers, and the second one would have the form offering to clone from a
// year it just failed to see, and the delete button offering to bin it. A
// failure of one of the WHOLE-collection reads takes every year with it, which
// is the same rule applied honestly: nothing was readable, so nothing is
// reported, and deleteVerdict refuses across the board.
// ── Reported one year at a time ────────────────────────────────────
// `onEdition(id, summary)` is called the moment THAT year's counts land,
// before the others have. It is the difference between a list that fills in
// over a second and a list that sits on "Counting…" for a second and then
// fills in at once: fifty-one requests go out together, and the list used to
// wait on the slowest of them to say anything about any year.
//
// The map is still returned whole at the end, and it is the answer of record
// — a year left out of it could not be read, and a caller that only listened
// to the callback would never hear that.
export const loadEditionSummaries = async (ids = [], { onEdition } = {}) => {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return {};
  const out = {};

  // ONE hop: every count for every edition, and the state documents, all in
  // flight together — rather than the counts first and the state behind them.
  // A year whose counts fail resolves to null and is left unsummarised,
  // exactly as its own try/catch used to do.
  const bulk = Promise.all(BULK_COLS.map(col => _get(col)));
  const counted = list.map(id =>
    Promise.all(COUNT_COLS.map(([, col]) => _count(col, id)))
      .then(ns => [id, ns], () => [id, null]));

  let stateRows;
  try {
    [stateRows] = await bulk;
  } catch {
    // Nothing was readable, so nothing is reported — but the counts are
    // already in flight and their failures have to be collected, or a
    // rejection lands with nobody listening.
    await Promise.allSettled(counted);
    return out;
  }
  const states = firstByTournament(stateRows);

  await Promise.all(counted.map(p => p.then(async ([id, ns]) => {
    if (ns === null) return;
    const state = states.get(id);
    const summary = Object.fromEntries(COUNT_COLS.map(([key], i) => [key, ns[i]]));
    // WHERE it was played, which is what a row now says about a year instead
    // of how many scores are in it. Free: the state documents are already in
    // this hop for the finalization map, and the location is the field beside
    // it. Blank for a year no director has filled in — the picker falls back
    // to the hand-kept table in lib/editionLocation, which covers the imported
    // years and is the only source they have.
    summary.location = state?.meta?.location || "";
    const scores = summary.scores;
    // A year nobody has played cannot be finished, so there is nothing to ask
    // about it — and `finalizedRounds` on an empty year would read as a claim
    // about rounds that were never played.
    if (scores > 0) {
      summary.roundCount = clampRounds(state?.meta?.rounds);
      summary.finalizedRounds = state?.finalized_rounds || {};
      summary.pairings = {};
    }
    // The second hop, and only for the years the finalization map could not
    // settle on its own — a round that ended by every group signing its card
    // stores a GROUP KEY, which cannot be checked without knowing the groups.
    // In practice that is the tournament being played, if any: one read, not
    // seventeen.
    //
    // That year is held back until the draw lands rather than reported early:
    // without the groups it reads as still being played, and a dot that turns
    // from orange to green a moment later is a worse answer than one that
    // arrives a moment late. The other sixteen do not wait for it.
    if (needsPairings(summary)) {
      try { summary.pairings = rowsToPairings(await _get("pairings", _tidFilter(id))); }
      catch { return; }
    }
    out[id] = summary;
    // A painter that throws is the picker's problem, not this load's — the
    // remaining years must still be gathered and cached.
    try { onEdition?.(id, summary); } catch { /* ignore */ }
  })));

  writeSummaryCache(out);
  return out;
};

// What the picker already knows, read synchronously so the list can paint its
// summary lines on the frame it opens instead of showing "Counting…" for as
// long as the network takes. Replaced by loadEditionSummaries the moment that
// resolves — see the cache note in lib/editionSummary for why a stale count
// here cannot become a wrong delete.
// ── What a year was PLAYED ON, one year at a time ──────────────────
// For the sheet, which opens on one tapped year and is the only place that
// wants this. Deliberately not part of the picker's bulk load: course names
// need the round setup AND the course rows behind it, and gathering that for
// seventeen years on every open would put ~70 reads on a screen whose whole
// design note is about keeping them down. Tapping one year costs a handful.
//
// Two hops, both small: the year's round rows (four of them), then the courses
// they name — fetched by ID rather than by reading the whole library, which is
// sixty-odd documents most of which belong to other years.
//
// Returned in round order as [{ round, name }]. A round whose course row has
// gone missing keeps its place with no name rather than vanishing: "R3" with a
// blank beside it is the honest rendering of a course that was deleted out
// from under a finished tournament.
const _courseNames = new Map();

export const loadEditionCourses = async (id) => {
  if (!id) return [];
  if (_courseNames.has(id)) return _courseNames.get(id);
  const rounds = (await _get("tournament_rounds", _tidFilter(id)))
    .filter(r => Number(r?.round_number) > 0)
    .sort((a, b) => Number(a.round_number) - Number(b.round_number));
  const ids = [...new Set(rounds.map(r => r.course_id).filter(Boolean))];
  const named = new Map();
  await Promise.all(ids.map(async cid => {
    try {
      const snap = await getDocs(query(collection(_db, "courses"), where("id", "==", cid)));
      const row = snap.docs[0]?.data();
      if (row?.name) named.set(cid, row.name);
    } catch { /* a course that cannot be read is a round with no name */ }
  }));
  const out = rounds.map(r => ({ round: Number(r.round_number), name: named.get(r.course_id) || "" }));
  // Remembered for as long as the app is up. The picker reloads the app when
  // it switches years, so this is exactly the life of one visit to it — long
  // enough to stop a director paying twice for tapping the same row twice.
  _courseNames.set(id, out);
  return out;
};

// Forget one year's courses — after a clone or a sandbox rebuild lands in it,
// when the rounds it holds are no longer the rounds this cached.
export const forgetEditionCourses = (id) => { if (id) _courseNames.delete(id); };

export const cachedEditionSummaries = (ids = []) => readSummaryCache(ids);

// Seed the currently-active edition into the collection if it isn't there yet,
// so the picker always shows at least the running year. Idempotent — safe to
// call on every open. Derives the year from the id (wbc_2026 → 2026).
export const ensureActiveEditionDoc = async (name) => {
  const id = getActiveTournamentId();
  const rows = await _get(EDITIONS_COL);
  if (rows.some(e => e.id === id)) return _index(rows);
  const year = parseInt(String(id).replace(/\D/g, ""), 10) || new Date().getFullYear();
  await _upsert(EDITIONS_COL, {
    id, year, name: name || `WBC ${year}`, status: "published", created_from: null,
  });
  return _index(await _get(EDITIONS_COL));
};

export const editionId = (year) => `wbc_${year}`;

// Create a new, empty draft edition. Cloning is `cloneEdition`.
export const createEdition = async ({ year, name, id }) => {
  const doc_ = editionDoc({ year, id: id || editionId(year), name });
  await _upsert(EDITIONS_COL, doc_);
  return doc_;
};

// ── Rename a tournament ─────────────────────────────────────────────
// Ported from Bourbon Cup, where a rename is one field on one document. Here
// it is TWO, because WBC keeps the name in two places and a director renaming
// "WBC 2026" would rightly expect both to change:
//
//   wbc_editions/{id}.name        what the picker lists, and what a confirm
//                                 dialog calls the year it is about to touch.
//   tournament_state.meta.name    the event's own name, edited in Admin →
//                                 Event and shown on the sign-in screens.
//
// Only the second is the tournament's name to a player; only the first exists
// for a year nobody has opened yet. Writing one and not the other is how they
// drift, and a picker that disagrees with the header about which tournament
// this is undoes the whole point of naming one.
//
// The state write is a nested-map merge, so meta.location, meta.rounds and
// everything else the event carries are left exactly as they are — and it is
// addressed by edition rather than by the active pointer, because this renames
// the year a director TAPPED, which is usually not the one they are standing
// in. A year with no state document yet gets one holding just its name; the
// first save from Admin fills in the rest.
//
// The id and the year are never touched. The id is the tournament_id every
// other collection filters on and the slug every document id is built from —
// changing it would orphan a whole tournament while the picker went on looking
// right. Only a director can land either write; wbc_editions has been
// director-only since before this existed.
export const renameEdition = async (id, name) => {
  if (!id) return { ok: false, error: "No tournament to rename." };
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return { ok: false, error: "A tournament needs a name." };
  await _upsert(EDITIONS_COL, { id: String(id), name: trimmed });
  await _upsert("tournament_state", {
    id: `ts_${id}`, tournament_id: String(id), meta: { name: trimmed },
  });
  // The picker paints from the cached index on its next open, so a stale name
  // in there would show the old one until something else forced a reload —
  // the same reason setEditionLocked patches it below.
  const cached = readEditionsCache();
  if (cached) writeEditionsCache(cached.map(e => (e.id === String(id) ? { ...e, name: trimmed } : e)));
  return { ok: true, name: trimmed };
};

// There was a setEditionStatus here, and a draft/published/archived pill in
// the picker to drive it. Both are gone: a year's state is DERIVED from what
// it holds now (see lib/editionLifecycle.js), which is the only version of it
// that cannot be stale. The `status` field is still written by editionDoc
// because every existing document carries one and dropping it mid-flight would
// leave a half-populated collection — nothing reads it.

// ── Freeze a year against everybody but a director ──────────────────
// The one stored flag on an edition that something actually reads, and what
// reads it is firestore.rules — see canWriteEdition() there, and
// lib/editionLock.js for why a lock is stored when the lifecycle state is not.
//
// A single-field merge, deliberately: rewriting the whole document would mean
// reading it first, and a stale read would put back a name or a year that
// somebody else had just changed. Nothing else on the row is this caller's
// business.
//
// Only a director can land this — `wbc_editions` has been director-only since
// before the flag existed — so there is no client-side guard here. The picker
// hides the control from a member so they are not offered a tap that comes
// back refused, which is the same division of labour as everywhere else in
// this app: the rules decide, the UI declines to lie about it.
export const setEditionLocked = async (id, locked) => {
  if (!id) return null;
  const row = { id: String(id), locked: locked === true };
  await _upsert(EDITIONS_COL, row);
  // The cached index is what the picker paints from on its next open, and it
  // is written by loadEditions. Leaving a stale `locked` in it would show the
  // padlock back to front until something else forced a reload.
  const cached = readEditionsCache();
  if (cached) writeEditionsCache(cached.map(e => (e.id === row.id ? { ...e, locked: row.locked } : e)));
  return row;
};

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
  const verdict = deleteVerdict(editionState(summary), {
    isActive: id === getActiveTournamentId(),
    // Or a sandbox that testers filled with four finished rounds — which is
    // what a good beta test looks like — reads "complete" and becomes
    // permanent, with the Firestore console the only way out.
    isSandbox: isSandboxEdition(id),
  });
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

// ── Cut a fresh sandbox ─────────────────────────────────────────────
// WIPE, then clone — not a clone on top of what is there. Every other clone in
// this app lands in a year a director is building and merges into it, because
// dates they have already typed and a roster they have already edited are
// worth keeping. A sandbox is the opposite: its whole value is that it looks
// like a tournament nobody has played yet, and a re-cut that left last week's
// testing scores in place would hand the next tester a half-finished event and
// a leaderboard full of strangers' numbers.
//
// So this is destructive on purpose, and the caller is expected to have said
// so. Nothing it destroys is a record of anything — see deleteVerdict, which
// exempts the sandbox from every "this is the event" refusal for the same
// reason.
//
// deleteEdition first, which also removes the wbc_editions row; cloneEdition
// writes it back. A sandbox that does not exist yet simply skips the delete —
// deleteEdition returns false for an id with nothing behind it rather than
// throwing, so first cut and re-cut are the same call.
export const resetSandbox = async (sourceId, options = {}) => {
  if (!sourceId) throw new Error("Pick a year to build the sandbox from.");
  if (isSandboxEdition(sourceId)) throw new Error("The sandbox can't be built from itself.");
  try {
    await deleteEdition(SANDBOX_EDITION_ID);
  } catch (e) {
    // The only refusal that can reach here is "it is the active edition", and
    // that one is worth passing on: re-cutting the sandbox out from under the
    // phone currently showing it would leave the app pointed at nothing.
    if (e?.code !== "edition-delete/active") throw e;
    throw new Error("Switch to another year before rebuilding the sandbox.");
  }

  // ── ROUND SETUP IS FORCED ON, whatever the caller asked for ──
  // It is OFF by default everywhere else, and rightly: WBC plays somewhere new
  // nearly every year, so carrying last year's courses into next year's
  // tournament seeds four rounds that all have to be re-picked, each arriving
  // with a rating and a slope and nothing saying it is stale.
  //
  // A sandbox is the opposite case. Without a course there are no holes, no
  // pars and nothing to score against, so the one screen a tester most needs
  // to exercise cannot be opened at all — and a stale course is exactly what a
  // sandbox wants, because it is not measuring anybody.
  // `tournamentName` is forced on alongside it because meta carries the ROUND
  // COUNT, and a sandbox without one falls back to a default that may not match
  // the tournament it was cut from — four rounds of setup with three rounds of
  // app around it.
  const made = await cloneEdition(
    sourceId,
    { year: null, name: SANDBOX_NAME, id: SANDBOX_EDITION_ID },
    { ...options, rounds: true, tournamentName: true },
  );

  // ── AND SCORING IS FORCED OPEN ON EVERY ROUND ──
  // lib/scoringGate closes the scoring screen for anybody who is not a
  // director unless the round's date is TODAY and their tee time is within
  // half an hour. A freshly cut sandbox has no dates (cloneMeta drops them on
  // purpose), no pairings and no tee times, so every one of those checks fails
  // and a tester gets a closed door where the app's main screen should be.
  //
  // That gate exists to stop Round 3 scores landing in Round 1 on a real
  // leaderboard somebody has to go and repair. In the sandbox there is no
  // wrong round to file against and no leaderboard that matters, so the reason
  // for the gate is absent and the gate is pure obstruction. `scoring_open` is
  // the director's own force-open switch — the same one Admin writes — so this
  // is not a new mechanism, just the switch already thrown.
  //
  // ── AND THE TOURNAMENT RENAMES ITSELF ──
  // cloneEdition has just copied the source's meta wholesale, name included,
  // and reyearName leaves that name alone for the sandbox: it re-years by
  // string replacement and the sandbox has no year to replace 2026 WITH. So
  // without this the app header inside the sandbox reads "WBC 2026", which is
  // the live tournament's name exactly, and the DEMO badge in the picker stops
  // helping the moment anybody is a tap deep.
  //
  // A nested map under merge is a FIELD-WISE merge in Firestore, so writing
  // meta.name here leaves meta.location and meta.rounds exactly as the clone
  // left them. Folded into the same upsert as scoring_open rather than a
  // second write.
  const rounds = clampRounds((await _get("tournament_state", _tidFilter(sourceId)))[0]?.meta?.rounds);
  await _upsert("tournament_state", {
    id: `ts_${SANDBOX_EDITION_ID}`, tournament_id: SANDBOX_EDITION_ID,
    scoring_open: sandboxScoringOpen(rounds),
    meta: { name: SANDBOX_NAME },
  });

  return made;
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
