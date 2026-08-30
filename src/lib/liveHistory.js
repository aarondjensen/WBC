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
// It comes from two places, and both are needed:
//
//   the PAST years          read from Firestore once per device and cached —
//                           loadLiveRounds
//   the year being PLAYED   built out of what the app already holds in memory,
//                           for no reads at all — liveRoundsHere
//
// The second half is not an optimisation. The app opens into the LIVE
// tournament for everybody but a director building next year (see
// lib/editionHome), so the edition on screen is normally the very year the
// bundled history is missing. Reading it from Firestore a second time would
// put a tournament's worth of documents on every phone in the field; leaving
// it out was worse — it meant that on the screen most people are looking at,
// nobody's rounds from this year existed at all.
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

import { editionRounds } from "./handicap.js";

// Nothing known yet — the shape every consumer can render without checking for
// null. Frozen all the way down, so a caller cannot fill it in and quietly hand
// its own state to the next one: freezing the wrapper alone would leave
// `byPlayer` a perfectly writable object shared by every consumer.
export const EMPTY_LIVE_ROUNDS = Object.freeze({
  byPlayer: Object.freeze({}), slots: Object.freeze([]),
});

// Newest first, the order the index math takes a window in.
const newestFirst = (a, b) => b.year - a.year || b.round - a.round;

// Newest first, as `year-round` keys — the shape recentRoundSlots wants.
const slotOrder = (keys) => [...keys]
  .map(key => { const [year, round] = key.split("-").map(Number); return { key, year, round }; })
  .sort(newestFirst)
  .map(s => s.key);

// ── liveRoundsFrom ─────────────────────────────────────────────────
// One bundle out of the per-edition cache map:
//
//   { [editionId]: { scores, byPlayer: { [pid]: [round, …] } } }
//
// `skip` is the edition to leave out — in practice the ACTIVE one, which is
// not missing from the answer but arrives by the other door: its scores are
// already streaming into the app over a live listener, so liveRoundsHere
// builds it from memory and reading it again here would put a tournament's
// worth of documents on every phone in the field.
export function liveRoundsFrom(byEdition = {}, { skip = null } = {}) {
  const byPlayer = {};
  const held = {};
  const slots = new Set();
  for (const [id, entry] of Object.entries(byEdition || {})) {
    if (!entry || (skip && id === skip)) continue;
    for (const [pid, rounds] of Object.entries(entry.byPlayer || {})) {
      for (const r of rounds || []) {
        if (!r?.key) continue;
        // One entry per round. The same round can arrive twice — a cached year
        // and the same year rebuilt from memory — and counting it twice would
        // spend two of the twelve slots in the window on one card.
        const seen = (held[pid] ||= new Set());
        if (seen.has(r.key)) continue;
        seen.add(r.key);
        slots.add(r.key);
        (byPlayer[pid] ||= []).push(r);
      }
    }
  }
  for (const list of Object.values(byPlayer)) list.sort(newestFirst);
  return { byPlayer, slots: slotOrder(slots) };
}

// ── liveRoundsHere ─────────────────────────────────────────────────
// The edition being played, out of what the app is already holding: no reads
// at all. `holeData` and `teeData` are App.jsx's in-memory shapes —
//
//   holeData  { "aaron_j_1": { 0: 5, 1: 4, … } }   pid_round → holeIdx → strokes
//   teeData   { 1: { aaron_j: "BLUE" } }           round → pid → tee name
//
// — reshaped into the flat rows editionRounds takes, so there is exactly one
// piece of arithmetic turning cards into differentials and it is the one with
// the tests. Only complete cards survive it, which is what makes this safe to
// run mid-round: a card thru 11 is not a round anybody can be handicapped on.
//
// ── `field`, and why a round in progress is not a slot ────────────
// A round belongs in the tournament's last-12 yardstick once the TOURNAMENT
// has played it, not once the first group has signed for it. Without that
// distinction the first group off the course would turn every man still out
// there into an asterisk for an afternoon — measured against a round he had
// not finished yet.
//
// So `field` is who is expected to post — the active roster, withdrawals
// already dropped — and a round becomes a slot only once every one of them
// has a complete card in it. The rounds themselves count for whoever finished
// them, immediately; it is only the yardstick that waits.
export function liveRoundsHere({
  year, holeData = {}, tRounds = [], courses = [], teeData = {}, field = [],
} = {}) {
  const holeScores = [];
  for (const [key, card] of Object.entries(holeData || {})) {
    // `pid_round`. Split on the LAST underscore: a player id has them
    // ("aaron_j"), a round number does not.
    const at = String(key).lastIndexOf("_");
    if (at < 1) continue;
    const player_id = key.slice(0, at);
    const round_number = Number(key.slice(at + 1));
    if (!player_id || !Number.isFinite(round_number)) continue;
    for (const [holeIdx, score] of Object.entries(card || {})) {
      holeScores.push({
        player_id, round_number, hole_number: Number(holeIdx) + 1, score,
      });
    }
  }

  const teeAssignments = [];
  for (const [round, byPid] of Object.entries(teeData || {})) {
    for (const [player_id, tee_name] of Object.entries(byPid || {})) {
      teeAssignments.push({ round_number: Number(round), player_id, tee_name });
    }
  }

  const byPlayer = editionRounds({ year, holeScores, tRounds, courses, teeAssignments });

  const posted = new Set((field || []).map(String).filter(Boolean));
  const done = new Map();
  for (const [pid, rounds] of Object.entries(byPlayer)) {
    if (!posted.has(String(pid))) continue;
    for (const r of rounds) done.set(r.key, (done.get(r.key) || 0) + 1);
  }
  const slots = posted.size
    ? slotOrder([...done.entries()].filter(([, n]) => n >= posted.size).map(([k]) => k))
    : [];

  return { byPlayer, slots };
}

// ── mergeLiveRounds ────────────────────────────────────────────────
// Two bundles into one — the past years read from Firestore, and the year
// being played built from memory. One entry per round, earlier bundles
// winning, which is what stops a year that is somehow in both from spending
// two of the twelve slots on the same card.
export function mergeLiveRounds(...bundles) {
  const live = bundles.filter(Boolean);
  if (live.length < 2) return live[0] || EMPTY_LIVE_ROUNDS;
  const merged = liveRoundsFrom(Object.fromEntries(
    live.map((b, i) => [`b${i}`, { byPlayer: b.byPlayer || {} }]),
  ));
  return {
    byPlayer: merged.byPlayer,
    slots: slotOrder(new Set(live.flatMap(b => b.slots || []))),
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
