/** @vitest-environment jsdom */
// jsdom for localStorage alone — the cache half of this module is the half
// with somewhere to hide, and testing it against a real Storage beats testing
// it against a stub that cannot throw the way Safari's private mode does.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  firstByTournament, needsPairings,
  readSummaryCache, writeSummaryCache, forgetSummary,
  readEditionsCache, writeEditionsCache,
  SUMMARY_CACHE_KEY, SUMMARY_CACHE_VERSION,
  EDITIONS_CACHE_KEY, EDITIONS_CACHE_VERSION,
} from "./editionSummary";

beforeEach(() => localStorage.clear());

describe("firstByTournament", () => {
  it("keeps the first state document per year", () => {
    const rows = [
      { tournament_id: "wbc_2015", meta: { rounds: 4 } },
      { tournament_id: "wbc_2015", meta: { rounds: 3 } },
    ];
    expect(firstByTournament(rows).get("wbc_2015").meta.rounds).toBe(4);
  });

  it("has nothing for a year with no state document", () => {
    expect(firstByTournament([]).get("wbc_2015")).toBeUndefined();
  });

  it("drops a row carrying no tournament_id instead of filing it somewhere", () => {
    // A row that belongs to no year must not land on one — that would put one
    // tournament's round count and finalization map on another.
    const m = firstByTournament([{ tournament_id: "" }, {}, null, { tournament_id: "wbc_2015" }]);
    expect([...m.keys()]).toEqual(["wbc_2015"]);
  });

  it("survives being handed nothing", () => {
    expect(firstByTournament().size).toBe(0);
    expect(firstByTournament(null).size).toBe(0);
  });
});

describe("needsPairings", () => {
  // The whole point of the second hop being conditional: a finished year
  // answers out of its finalization map and costs no read at all.
  it("is false for a finished year — its rounds are all signed off by number", () => {
    expect(needsPairings({
      scores: 1368, roundCount: 4,
      finalizedRounds: { 1: true, 2: true, 3: true, 4: true }, pairings: {},
    })).toBe(false);
  });

  it("is true for a year still being played", () => {
    expect(needsPairings({
      scores: 200, roundCount: 4, finalizedRounds: { 1: true }, pairings: {},
    })).toBe(true);
  });

  it("is false for a year nobody has played — there is nothing to finalize", () => {
    expect(needsPairings({ players: 12, rounds: 4, scores: 0 })).toBe(false);
    expect(needsPairings(null)).toBe(false);
  });
});

describe("the summary cache", () => {
  const SUMS = {
    wbc_2015: { players: 6, rounds: 4, scores: 432 },
    wbc_2024: { players: 12, rounds: 4, scores: 864 },
  };

  it("gives back what was written, so the picker paints before the network", () => {
    writeSummaryCache(SUMS);
    expect(readSummaryCache(["wbc_2015", "wbc_2024"])).toEqual(SUMS);
  });

  it("returns null when it knows nothing about any of these years", () => {
    // Null, not {} — the picker shows "Counting…" for the first and a real
    // summary line for the second, and an empty year is a real answer.
    expect(readSummaryCache(["wbc_2015"])).toBeNull();
    writeSummaryCache({ wbc_2015: { players: 0, rounds: 0, scores: 0 } });
    expect(readSummaryCache(["wbc_2019"])).toBeNull();
    expect(readSummaryCache(["wbc_2015"])).toEqual({ wbc_2015: { players: 0, rounds: 0, scores: 0 } });
  });

  it("returns only the years asked about", () => {
    writeSummaryCache(SUMS);
    expect(readSummaryCache(["wbc_2015"])).toEqual({ wbc_2015: SUMS.wbc_2015 });
  });

  it("merges rather than replaces, so refreshing one year keeps the rest", () => {
    writeSummaryCache(SUMS);
    writeSummaryCache({ wbc_2015: { players: 6, rounds: 4, scores: 999 } });
    const back = readSummaryCache(["wbc_2015", "wbc_2024"]);
    expect(back.wbc_2015.scores).toBe(999);
    expect(back.wbc_2024).toEqual(SUMS.wbc_2024);
  });

  it("forgets a deleted year, so no row is painted for a tournament that is gone", () => {
    writeSummaryCache(SUMS);
    expect(forgetSummary("wbc_2015")).toBe(true);
    expect(readSummaryCache(["wbc_2015"])).toBeNull();
    expect(readSummaryCache(["wbc_2024"])).toEqual({ wbc_2024: SUMS.wbc_2024 });
    // Forgetting one that was never there is not a failure worth reporting on.
    expect(forgetSummary("wbc_2015")).toBe(false);
    expect(forgetSummary(null)).toBe(false);
  });

  it("drops a cache written by a build with a different summary shape", () => {
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify({
      v: SUMMARY_CACHE_VERSION + 1, byId: SUMS,
    }));
    expect(readSummaryCache(["wbc_2015"])).toBeNull();
  });

  it("ignores a corrupt cache rather than failing the open", () => {
    localStorage.setItem(SUMMARY_CACHE_KEY, "not json{");
    expect(readSummaryCache(["wbc_2015"])).toBeNull();
    // And writing over it recovers.
    expect(writeSummaryCache(SUMS)).toBe(true);
    expect(readSummaryCache(["wbc_2015"])).toEqual({ wbc_2015: SUMS.wbc_2015 });
  });

  it("survives storage that throws, which is Safari in private mode", () => {
    // A picker that cannot open because a CACHE is unavailable would be a
    // worse bug than the slow open this cache is fixing.
    const setItem = vi.spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => { throw new Error("QuotaExceededError"); });
    expect(writeSummaryCache(SUMS)).toBe(false);
    expect(forgetSummary("wbc_2015")).toBe(false);
    setItem.mockRestore();

    const getItem = vi.spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => { throw new Error("SecurityError"); });
    expect(readSummaryCache(["wbc_2015"])).toBeNull();
    getItem.mockRestore();
  });
});

describe("the years cache", () => {
  const ROWS = [
    { id: "wbc_2026", year: 2026, name: "WBC 2026", status: "published", created_from: null },
    { id: "wbc_2015", year: 2015, name: "Gull Lake View", status: "draft", created_from: null },
  ];

  it("hands the years straight back, in the order they were written", () => {
    expect(writeEditionsCache(ROWS)).toBe(true);
    expect(readEditionsCache()).toEqual([
      { id: "wbc_2026", year: 2026, name: "WBC 2026", locked: false },
      { id: "wbc_2015", year: 2015, name: "Gull Lake View", locked: false },
    ]);
  });

  it("keeps only what a row is drawn from", () => {
    writeEditionsCache(ROWS);
    // `status` is the field lib/editionLifecycle exists because nobody
    // maintains — a cached copy of it would be a second, staler source for
    // something nothing here reads. `locked` is the exception and earns it:
    // it is drawn (the padlock on the row) and it cannot be derived from
    // anything, so leaving it out means the picker paints every frozen year
    // as open for the length of a Firestore read.
    expect(Object.keys(readEditionsCache()[0]).sort()).toEqual(["id", "locked", "name", "year"]);
  });

  // Cached as a real boolean, whatever the row carried. A row read out of a
  // pre-lock edition document has no `locked` at all, and `undefined` would
  // vanish through JSON.stringify and come back as a missing key.
  it("caches the lock as a boolean, even when the row has no such field", () => {
    writeEditionsCache([{ id: "wbc_2019", year: 2019, name: "WBC 2019" }]);
    expect(readEditionsCache()[0].locked).toBe(false);
    writeEditionsCache([{ id: "wbc_2019", year: 2019, name: "WBC 2019", locked: true }]);
    expect(readEditionsCache()[0].locked).toBe(true);
  });

  it("drops a row with no id, which nothing could be keyed on", () => {
    writeEditionsCache([{ year: 2026 }, ...ROWS]);
    expect(readEditionsCache().map(e => e.id)).toEqual(["wbc_2026", "wbc_2015"]);
  });

  it("REPLACES rather than merges, so a deleted year stops being painted", () => {
    writeEditionsCache(ROWS);
    writeEditionsCache([ROWS[0]]);
    expect(readEditionsCache().map(e => e.id)).toEqual(["wbc_2026"]);
  });

  it("says nothing rather than empty when there is nothing to say", () => {
    // Null and [] are different answers to the picker: the first shows
    // "Loading…", the second would show an account with no tournaments at all.
    expect(readEditionsCache()).toBeNull();
    writeEditionsCache([]);
    expect(readEditionsCache()).toBeNull();
  });

  it("drops a cache written by a build with a different row shape", () => {
    localStorage.setItem(EDITIONS_CACHE_KEY, JSON.stringify({
      v: EDITIONS_CACHE_VERSION + 1, rows: ROWS,
    }));
    expect(readEditionsCache()).toBeNull();
  });

  it("ignores a corrupt cache, and anything that isn't a list of years", () => {
    localStorage.setItem(EDITIONS_CACHE_KEY, "not json{");
    expect(readEditionsCache()).toBeNull();
    localStorage.setItem(EDITIONS_CACHE_KEY, JSON.stringify({ v: EDITIONS_CACHE_VERSION, rows: "wbc_2026" }));
    expect(readEditionsCache()).toBeNull();
    expect(writeEditionsCache(ROWS)).toBe(true);
    expect(readEditionsCache()).toHaveLength(2);
  });

  it("survives storage that throws, which is Safari in private mode", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => { throw new Error("QuotaExceededError"); });
    expect(writeEditionsCache(ROWS)).toBe(false);
    setItem.mockRestore();

    const getItem = vi.spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => { throw new Error("SecurityError"); });
    expect(readEditionsCache()).toBeNull();
    getItem.mockRestore();
  });
});
