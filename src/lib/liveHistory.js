// ══════════════════════════════════════════════════════════════════
//  liveHistory — the WBCs the bundled record books have not caught up
//  with yet.
// ══════════════════════════════════════════════════════════════════
//
// The index math reads data/history.js, which is GENERATED from
// data/rounds.csv and only moves when somebody re-exports that file and runs
// `npm run build:history`. It stops at 2025.
//
// Every WBC played in this app since then is in FIRESTORE, as hole scores —
// and so was invisible to the one screen whose whole job is showing a career.
// A director who opened 2027 saw Matt V's index built from 2014, 2015 and
// 2024, with the tournament he had just played in 2026 nowhere on the chart.
// The clone already knew better (freshIndexes in lib/editions has read those
// cards into a seeded handicap since editions existed); the Players tab did
// not, so the number a golfer plays off and the number the app showed him came
// from two different records.
//
// This module is the SHAPE of that second half — the merge and the cache. The
// reads live in lib/editions (loadLiveRounds), where the Firestore helpers
// already are; everything testable is here.
//
//   { byPlayer: { [player_id]: [round, …] }, slots: ["2026-4", …] }
//
// `byPlayer` is what a player's window is extended with; `slots` is what the
// tournament's last-12 yardstick is extended with. Both halves matter and they
// travel together — see the note above indexFor.
//
// ── Why it is cached, and keyed on a count ────────────────────────
// A year holds twelve players × four rounds × eighteen holes of documents, and
// Firestore bills a read per document. Paying ~900 reads on every open of the
// Players tab, on every phone, is not a way to draw a bar chart. So each
// finished year's rounds are derived ONCE and kept in localStorage, and what
// decides whether that copy is still good is the year's SCORE COUNT — one
// server-side count query, one billed read, whatever the answer.
//
// The count is not a perfect fingerprint: a director correcting one stroke on
// a card leaves it unchanged. It is the right trade anyway. What it certainly
// catches is the case this exists for — a year that has just been played, or
// one somebody is still entering — and a corrected stroke moves a differential
// by a tenth on a screen that redraws itself the next time the count does
// change. Deleting the cache is a hard refresh away, and nothing decides
// anything irreversible off these numbers.

// Nothing known yet — the shape every consumer can render without checking for
// null. Frozen all the way down, so a caller cannot fill it in and quietly hand
// its own state to the next one: freezing the wrapper alone would leave
// `byPlayer` a perfectly writable object shared by every consumer.
export const EMPTY_LIVE_ROUNDS = Object.freeze({
  byPlayer: Object.freeze({}), slots: Object.freeze([]),
});

// Newest first, the order the index math takes a window in.
const newestFirst = (a, b) => b.year - a.year || b.round - a.round;

// ── liveRoundsFrom ─────────────────────────────────────────────────
// One bundle out of the per-edition cache map:
//
//   { [editionId]: { scores, byPlayer: { [pid]: [round, …] } } }
//
// `skip` is the edition to leave out — in practice the ACTIVE one. Its rounds
// are already streaming into the app over a live listener, and reading them a
// second time here would put a tournament's worth of documents on every phone
// in the field every time somebody opened the Players tab. The year being
// played is also the one year whose rounds are not yet part of anybody's
// record: an index is what a golfer arrived with.
export function liveRoundsFrom(byEdition = {}, { skip = null } = {}) {
  const byPlayer = {};
  const slots = new Set();
  for (const [id, entry] of Object.entries(byEdition || {})) {
    if (!entry || (skip && id === skip)) continue;
    for (const [pid, rounds] of Object.entries(entry.byPlayer || {})) {
      for (const r of rounds || []) {
        if (!r?.key) continue;
        slots.add(r.key);
        (byPlayer[pid] ||= []).push(r);
      }
    }
  }
  for (const list of Object.values(byPlayer)) list.sort(newestFirst);
  return {
    byPlayer,
    slots: [...slots]
      .map(key => { const [year, round] = key.split("-").map(Number); return { key, year, round }; })
      .sort(newestFirst)
      .map(s => s.key),
  };
}

// ── The cache ─────────────────────────────────────────────────────
export const LIVE_ROUNDS_CACHE_KEY = "wbc_live_rounds";
// Bumped when the shape of a stored round changes. A mismatch drops the whole
// cache rather than migrating it: it is derived data, and re-deriving it costs
// one load of a screen nobody opens twice a minute.
export const LIVE_ROUNDS_CACHE_VERSION = 1;

// localStorage is wrapped everywhere it is touched in this app — Safari in
// private mode throws on read as well as write, and a tab that cannot open
// because a cache is unavailable would be a worse bug than the slow one this
// is fixing.
const _store = () => {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch { return null; }
};

// {} when there is nothing to say — an empty map renders as an empty bundle,
// which is exactly what "we have never loaded this" should look like.
export const readLiveRoundsCache = () => {
  const s = _store();
  if (!s) return {};
  try {
    const raw = JSON.parse(s.getItem(LIVE_ROUNDS_CACHE_KEY) || "null");
    if (!raw || raw.v !== LIVE_ROUNDS_CACHE_VERSION) return {};
    return raw.byEdition && typeof raw.byEdition === "object" ? raw.byEdition : {};
  } catch { return {}; }
};

// REPLACED, not merged. This is every year the loader looked at, so a year
// missing from it has been deleted or has moved into the bundled history —
// merging would keep counting rounds that are now counted twice.
export const writeLiveRoundsCache = (byEdition = {}) => {
  const s = _store();
  if (!s) return false;
  try {
    s.setItem(LIVE_ROUNDS_CACHE_KEY, JSON.stringify({
      v: LIVE_ROUNDS_CACHE_VERSION, byEdition: byEdition || {},
    }));
    return true;
  } catch { return false; }
};
