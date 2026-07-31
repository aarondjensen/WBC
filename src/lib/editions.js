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
import { collection, doc, getDocs, setDoc, deleteDoc, query, where } from "firebase/firestore";
import { _db, getActiveTournamentId, setActiveTournamentId, getEditionSlug } from "../firebase";

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
  const eid = id || editionId(year);
  const doc_ = {
    id: eid,
    year: Number(year),
    name: name?.trim() || `WBC ${year}`,
    status: "draft",
    created_from: null,
  };
  await _upsert(EDITIONS_COL, doc_);
  return doc_;
};

// ── Clone an existing edition into a new draft ──────────────────────
// Copies only the STRUCTURAL setup the caller opts into. RESULTS ARE NEVER
// CLONED — scores, pairings, tee assignments, skins/CTP, scorecard signatures
// and finalization state always start empty. A new year begins with nobody
// having played a hole; anything else would show last year's leaderboard under
// this year's name.
//
// options = { players, courses, rounds, tournamentName } booleans.
export const cloneEdition = async (sourceId, { year, name, id }, options = {}) => {
  const newTid = id || editionId(year);
  const srcSlug = getEditionSlug(sourceId);
  const newSlug = getEditionSlug(newTid);
  const f = (tid) => [{ field: "tournament_id", op: "==", value: tid }];

  await _upsert(EDITIONS_COL, {
    id: newTid,
    year: Number(year),
    name: name?.trim() || `WBC ${year}`,
    status: "draft",
    created_from: sourceId,
  });

  // Roster — the tournament_players binding rows, carrying each golfer's
  // handicap index forward as this year's starting point. player_id is a
  // permanent career identity and is deliberately NOT regenerated: it is what
  // ties a golfer to their history across every edition.
  //
  // `status` is dropped rather than copied: it carries last year's WD, and a
  // player who withdrew from 2026 starts 2027 in the field like everyone else.
  if (options.players) {
    const rows = await _get("tournament_players", f(sourceId));
    for (const tp of rows) {
      const pid = tp.player_id;
      if (!pid) continue;
      const { status: _drop, ...rest } = tp;
      await _upsert("tournament_players", {
        ...rest,
        id: `tp_${newSlug}_${pid}`,
        tournament_id: newTid,
      });
    }
  }

  // Courses are a GLOBAL registry keyed by course id, not edition-scoped —
  // Treetops is Treetops in any year — so there is nothing to copy. What is
  // edition-scoped is which course each ROUND plays, which is `rounds` below.
  // The option is accepted and ignored so the caller's shape stays stable.

  // Round setup — which course each round is played on. The course_id points
  // at the shared registry and carries over as-is.
  if (options.rounds) {
    const rows = await _get("tournament_rounds", f(sourceId));
    for (const r of rows) {
      const { id: _old, ...rest } = r;
      await _upsert("tournament_rounds", {
        ...rest,
        id: `tr_${newSlug}_r${r.round_number}`,
        tournament_id: newTid,
      });
    }
  }

  // Tournament name/location, off the tournament_state singleton. Only `meta`
  // is carried: the rest of that document is results state (finalized rounds,
  // saved tees, round dates, scoring-open flags) and must start clean.
  if (options.tournamentName) {
    const rows = await _get("tournament_state", f(sourceId));
    const meta = rows[0]?.meta;
    if (meta) {
      await _upsert("tournament_state", {
        id: `ts_${newTid}`, tournament_id: newTid, meta,
      });
    }
  }

  return { id: newTid, year: Number(year), name, created_from: sourceId, srcSlug };
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
  "wbc_rounds_state",
];

// Delete an edition AND all of its data. Irreversible.
//
// Refuses to delete the ACTIVE edition: doing so would pull the running app's
// data out from under it, leaving a signed-in director staring at an empty
// tournament with no obvious way back. Switch away first.
export const deleteEdition = async (id) => {
  if (!id || id === getActiveTournamentId()) return false;
  const f = [{ field: "tournament_id", op: "==", value: id }];
  for (const col of EDITION_DATA_COLS) {
    const rows = await _get(col, f);
    for (const r of rows) if (r.id) await _deleteDoc(col, r.id);
  }
  await _deleteDoc(EDITIONS_COL, id);
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
