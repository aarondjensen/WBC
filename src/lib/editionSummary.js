// ══════════════════════════════════════════════════════════════════
//  editionSummary — the shape of "what is in each year", and the
//  cache that makes the picker paint before Firestore answers.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React. lib/editions.js does the talking; this is the
// half that can be tested, which is why it is a file rather than four helpers
// inside that one.
//
// ── The problem this exists for ───────────────────────────────────
// Opening Tournaments cost about SIXTY-SEVEN Firestore round trips on a
// sixteen-year history, over four hops that each had to finish before the next
// could start:
//
//   1  read wbc_editions                        (ensureActiveEditionDoc)
//   2  read wbc_editions AGAIN                  (loadEditions, same data)
//   3  51 count queries — players, rounds and scores, one each per edition
//   4  14 more reads for tournament_state, which could only start once the
//      score counts came back, because the state was only fetched for a year
//      that turned out to have scores
//
// Three of those four collections are TINY across every year there has ever
// been — a roster row per golfer per year (~140 documents), four round rows a
// year (~60), one state document a year (~17). Reading each of them whole, once,
// is one round trip where the per-edition query was seventeen, and it hands
// back more than a count: the state documents carry the finalization map, so
// hop 4 disappears into hop 3 rather than waiting behind it.
//
// hole_scores is the exception and stays a server-side aggregation, one per
// edition. It is thousands of documents — 7,632 in the imported years alone —
// and downloading them to call `.length` is exactly what getCountFromServer
// exists to avoid.
//
// ── And the cache ─────────────────────────────────────────────────
// Switching editions HARD-RELOADS the app (see switchEdition), so a director
// comparing three years pays the whole cost three times and an in-memory cache
// would be thrown away at the moment it would have helped. The counts are
// therefore kept in localStorage: the picker paints from them immediately and
// replaces them with the real answer when it lands.
//
// Stale-while-revalidate, and the staleness is bounded by what it can affect.
// A wrong count on screen is corrected within the same open. It cannot cause a
// wrong DELETE — deleteEdition re-reads the year's summary itself and enforces
// the verdict against fresh counts, precisely because the picker's copy is a
// display artefact.
import { allRoundsFinalized } from "./editionLifecycle";

// ── Grouping whole-collection reads by edition ────────────────────
// Both take the rows of an entire collection and split them by the
// `tournament_id` every edition-scoped document carries. A row without one is
// dropped rather than counted against some default edition — it belongs to no
// year, and guessing which would put a phantom score on a real tournament.
export const countByTournament = (rows = []) => {
  const out = new Map();
  for (const r of rows || []) {
    const tid = r?.tournament_id;
    if (tid) out.set(tid, (out.get(tid) || 0) + 1);
  }
  return out;
};

// The FIRST document per edition. tournament_state is a singleton per year, so
// a second one is a duplicate rather than a sibling, and taking the first is
// the same thing the per-edition query did when it read `[0]`.
export const firstByTournament = (rows = []) => {
  const out = new Map();
  for (const r of rows || []) {
    const tid = r?.tournament_id;
    if (tid && !out.has(tid)) out.set(tid, r);
  }
  return out;
};

// ── Does this year still need its pairings read? ──────────────────
// A round ends either because the director finalized it (which stores the
// ROUND NUMBER, and settles the question with no draw at all) or because every
// group signed its own card (which stores a GROUP KEY each, and cannot be
// checked without knowing the groups). So the pairings are fetched only for a
// year the finalization map alone could not finish — in practice the one that
// is being played, if any.
export const needsPairings = (summary) =>
  !!summary && Number(summary.scores) > 0 && !allRoundsFinalized(summary);

// ── The cache ─────────────────────────────────────────────────────
export const SUMMARY_CACHE_KEY = "wbc_edition_summaries";
// Bumped when the SHAPE of a summary changes, so a build that reads a field
// the last one never wrote does not paint a row from a summary that cannot
// have it. A mismatch drops the cache rather than migrating it: these are
// counts, and re-counting them costs one open.
export const SUMMARY_CACHE_VERSION = 1;

// localStorage is wrapped everywhere it is touched in this app — Safari in
// private mode throws on read as well as write, and a picker that cannot open
// because a cache is unavailable would be a worse bug than the slow one this
// is fixing.
const _store = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch { return null; }
};

const _readAll = () => {
  const s = _store();
  if (!s) return {};
  try {
    const raw = JSON.parse(s.getItem(SUMMARY_CACHE_KEY) || "null");
    if (!raw || raw.v !== SUMMARY_CACHE_VERSION) return {};
    return raw.byId && typeof raw.byId === "object" ? raw.byId : {};
  } catch { return {}; }
};

// What we already know about these years, or null if we know nothing about any
// of them. Null rather than an empty object so the caller can tell "no cache"
// from "cached, and every one of them is empty" — the picker shows "Counting…"
// for the first and a real summary line for the second.
export const readSummaryCache = (ids = []) => {
  const all = _readAll();
  const out = {};
  let hit = false;
  for (const id of ids || []) {
    if (id && Object.prototype.hasOwnProperty.call(all, id)) { out[id] = all[id]; hit = true; }
  }
  return hit ? out : null;
};

// MERGED, not replaced: a caller refreshing one year must not drop what is
// known about the other fifteen. Editions left out of `byId` keep their entry.
export const writeSummaryCache = (byId = {}) => {
  const s = _store();
  if (!s) return false;
  try {
    const next = { ..._readAll(), ...(byId || {}) };
    s.setItem(SUMMARY_CACHE_KEY, JSON.stringify({ v: SUMMARY_CACHE_VERSION, byId: next }));
    return true;
  } catch { return false; }
};

// Drop one year — after a delete, so the picker does not paint a row for a
// tournament that no longer exists the next time it opens.
export const forgetSummary = (id) => {
  const s = _store();
  if (!s || !id) return false;
  try {
    const next = _readAll();
    if (!Object.prototype.hasOwnProperty.call(next, id)) return false;
    delete next[id];
    s.setItem(SUMMARY_CACHE_KEY, JSON.stringify({ v: SUMMARY_CACHE_VERSION, byId: next }));
    return true;
  } catch { return false; }
};
