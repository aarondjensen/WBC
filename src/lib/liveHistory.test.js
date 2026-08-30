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
  liveRoundsFrom, readLiveRoundsCache, writeLiveRoundsCache,
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
