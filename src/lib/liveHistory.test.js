/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  The half of the record that is still in Firestore
// ══════════════════════════════════════════════════════════════════
//
// The merge and the cache — the pure half of lib/liveHistory. What it costs to
// FILL is lib/editions' business and has its own suite beside it
// (editions.liveRounds.test.js).
//
// jsdom for localStorage, on the same argument editionSummary.test makes: the
// cache is the half of this module with somewhere to hide, and a real Storage
// beats a stub that cannot throw the way Safari's private mode does.
import { describe, it, expect, beforeEach } from "vitest";
import {
  liveRoundsFrom, liveRoundsHere, mergeLiveRounds,
  readLiveRoundsCache, writeLiveRoundsCache,
  EMPTY_LIVE_ROUNDS, LIVE_ROUNDS_CACHE_KEY, LIVE_ROUNDS_CACHE_VERSION,
} from "./liveHistory";

beforeEach(() => localStorage.clear());

const round = (year, r, extra = {}) => ({ year, round: r, key: `${year}-${r}`, ...extra });

const CACHE = {
  wbc_2026: {
    scores: 864,
    byPlayer: {
      matt_v: [round(2026, 1, { gross: 88 }), round(2026, 3, { gross: 91 })],
      aaron_j: [round(2026, 1, { gross: 84 })],
    },
  },
  wbc_2027: {
    scores: 216,
    byPlayer: { matt_v: [round(2027, 1, { gross: 86 })] },
  },
};

describe("liveRoundsFrom", () => {
  it("gathers every year's rounds under the player who played them", () => {
    const { byPlayer } = liveRoundsFrom(CACHE);
    expect(byPlayer.matt_v.map(r => r.key)).toEqual(["2027-1", "2026-3", "2026-1"]);
    expect(byPlayer.aaron_j.map(r => r.key)).toEqual(["2026-1"]);
  });

  it("reports the rounds the tournament played, newest first", () => {
    expect(liveRoundsFrom(CACHE).slots).toEqual(["2027-1", "2026-3", "2026-1"]);
  });

  // The year being played is already streaming into the app over a live
  // listener, and its rounds are not part of anybody's record yet. Reading
  // them again here would put a tournament's worth of documents on every phone
  // in the field every time somebody opened the Players tab.
  it("leaves out the edition being played", () => {
    const live = liveRoundsFrom(CACHE, { skip: "wbc_2027" });
    expect(live.slots).toEqual(["2026-3", "2026-1"]);
    expect(live.byPlayer.matt_v.map(r => r.key)).toEqual(["2026-3", "2026-1"]);
  });

  it("says nothing when it knows nothing", () => {
    expect(liveRoundsFrom()).toEqual({ byPlayer: {}, slots: [] });
    expect(liveRoundsFrom({ wbc_2026: null })).toEqual({ byPlayer: {}, slots: [] });
    expect(liveRoundsFrom({ wbc_2026: { scores: 0, byPlayer: {} } })).toEqual({ byPlayer: {}, slots: [] });
  });

  // EMPTY_LIVE_ROUNDS is handed to every consumer as a default, so a component
  // that filled it in would hand its own state to the next one.
  it("hands out an empty bundle nobody can write into", () => {
    expect(() => { EMPTY_LIVE_ROUNDS.byPlayer.matt_v = []; }).toThrow();
  });
});

// ── The year being played ─────────────────────────────────────────
// Not read from Firestore at all: the app already holds this year's cards, and
// the app OPENS into this year for everybody but a director building next one
// (see lib/editionHome). Left out, the screen most people look at showed a
// career that stopped before the tournament they had just played.
describe("liveRoundsHere", () => {
  const COURSES = [{
    id: "treetops", name: "THE MASTERPIECE", rating: 71.4, slope: 134, par: 71,
    tee_boxes: [{ name: "BLUE", rating: 70.1, slope: 128, par: 71 }],
  }];
  const T_ROUNDS = [
    { round_number: 1, course_id: "treetops" },
    { round_number: 2, course_id: "treetops" },
  ];
  const card = (strokes) => Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, strokes]));
  const base = {
    year: 2026, tRounds: T_ROUNDS, courses: COURSES,
    field: ["matt_v", "aaron_j"],
  };

  it("turns this year's cards into rounds, off the tee each man played", () => {
    const { byPlayer } = liveRoundsHere({
      ...base,
      holeData: { matt_v_1: card(5), aaron_j_1: card(4) },
      teeData: { 1: { matt_v: "BLUE" } },
    });
    expect(byPlayer.matt_v[0].gross).toBe(90);
    expect(byPlayer.matt_v[0].differential).toBe(17.6);   // (90 − 70.1) × 113 / 128, the BLUE tee
    expect(byPlayer.aaron_j[0].differential).toBe(0.5);   // (72 − 71.4) × 113 / 134, the course
  });

  // The reason this is safe to run in the middle of a round: a card thru 11 is
  // not a round anybody can be handicapped on.
  it("ignores a card still being played", () => {
    const half = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i, 5]));
    const { byPlayer, slots } = liveRoundsHere({ ...base, holeData: { matt_v_1: half } });
    expect(byPlayer).toEqual({});
    expect(slots).toEqual([]);
  });

  it("reads a player id that has underscores in it", () => {
    const { byPlayer } = liveRoundsHere({
      ...base, field: ["mary_jo_s"], holeData: { mary_jo_s_2: card(5) },
    });
    expect(byPlayer.mary_jo_s[0].key).toBe("2026-2");
  });

  // The yardstick waits for the field. Without this the first group off the
  // course turns every man still out there into an asterisk for an afternoon.
  it("makes a round a slot only once every man in the field has posted it", () => {
    const half = liveRoundsHere({ ...base, holeData: { matt_v_1: card(5) } });
    expect(half.byPlayer.matt_v).toHaveLength(1);
    expect(half.slots).toEqual([]);

    const whole = liveRoundsHere({ ...base, holeData: { matt_v_1: card(5), aaron_j_1: card(4) } });
    expect(whole.slots).toEqual(["2026-1"]);
  });

  it("claims no slots at all before the roster is known", () => {
    const out = liveRoundsHere({ ...base, field: [], holeData: { matt_v_1: card(5) } });
    expect(out.byPlayer.matt_v).toHaveLength(1);
    expect(out.slots).toEqual([]);
  });

  it("survives being handed nothing", () => {
    expect(liveRoundsHere()).toEqual({ byPlayer: {}, slots: [] });
    expect(liveRoundsHere({ year: 2026 })).toEqual({ byPlayer: {}, slots: [] });
  });
});

describe("mergeLiveRounds", () => {
  const r = (year, n) => ({ year, round: n, key: `${year}-${n}`, differential: 12 });
  const past = { byPlayer: { matt_v: [r(2026, 1)] }, slots: ["2026-1"] };
  const here = { byPlayer: { matt_v: [r(2027, 1)], new_guy: [r(2027, 1)] }, slots: ["2027-1"] };

  it("puts the two halves of the record together, newest first", () => {
    const both = mergeLiveRounds(past, here);
    expect(both.byPlayer.matt_v.map(x => x.key)).toEqual(["2027-1", "2026-1"]);
    expect(both.byPlayer.new_guy.map(x => x.key)).toEqual(["2027-1"]);
    expect(both.slots).toEqual(["2027-1", "2026-1"]);
  });

  it("counts a round once when both halves carry it", () => {
    const both = mergeLiveRounds(past, past);
    expect(both.byPlayer.matt_v).toHaveLength(1);
    expect(both.slots).toEqual(["2026-1"]);
  });

  // A round somebody has finished counts for him straight away; the slot it
  // would claim waits for the rest of the field. So the two lists are merged
  // separately rather than one being derived from the other.
  it("keeps a round whose slot the field has not earned yet", () => {
    const both = mergeLiveRounds(past, { byPlayer: { matt_v: [r(2027, 1)] }, slots: [] });
    expect(both.byPlayer.matt_v.map(x => x.key)).toEqual(["2027-1", "2026-1"]);
    expect(both.slots).toEqual(["2026-1"]);
  });

  it("hands back the one bundle it was given, or nothing", () => {
    expect(mergeLiveRounds(past)).toBe(past);
    expect(mergeLiveRounds()).toBe(EMPTY_LIVE_ROUNDS);
    expect(mergeLiveRounds(null, past)).toBe(past);
  });
});

describe("the cache", () => {
  it("reads back what it wrote", () => {
    expect(writeLiveRoundsCache(CACHE)).toBe(true);
    expect(readLiveRoundsCache()).toEqual(CACHE);
  });

  it("knows nothing before anything is written", () => {
    expect(readLiveRoundsCache()).toEqual({});
  });

  // REPLACED, not merged: a year that has moved into the bundled history — or
  // been deleted — must stop being counted, and a merge would keep it forever.
  it("replaces rather than merges", () => {
    writeLiveRoundsCache(CACHE);
    writeLiveRoundsCache({ wbc_2027: CACHE.wbc_2027 });
    expect(Object.keys(readLiveRoundsCache())).toEqual(["wbc_2027"]);
  });

  it("drops a cache written by an older shape", () => {
    localStorage.setItem(LIVE_ROUNDS_CACHE_KEY, JSON.stringify({
      v: LIVE_ROUNDS_CACHE_VERSION - 1, byEdition: CACHE,
    }));
    expect(readLiveRoundsCache()).toEqual({});
  });

  it("survives a cache somebody else scribbled on", () => {
    localStorage.setItem(LIVE_ROUNDS_CACHE_KEY, "not json{");
    expect(readLiveRoundsCache()).toEqual({});
    localStorage.setItem(LIVE_ROUNDS_CACHE_KEY, JSON.stringify({
      v: LIVE_ROUNDS_CACHE_VERSION, byEdition: "wbc_2026",
    }));
    expect(readLiveRoundsCache()).toEqual({});
  });
});
