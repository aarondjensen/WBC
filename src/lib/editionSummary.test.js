/** @vitest-environment jsdom */
// jsdom for localStorage alone — the cache half of this module is the half
// with somewhere to hide, and testing it against a real Storage beats testing
// it against a stub that cannot throw the way Safari's private mode does.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  countByTournament, firstByTournament, needsPairings,
  readSummaryCache, writeSummaryCache, forgetSummary,
  SUMMARY_CACHE_KEY, SUMMARY_CACHE_VERSION,
} from "./editionSummary";

beforeEach(() => localStorage.clear());

describe("countByTournament", () => {
  it("splits one whole-collection read into a count per edition", () => {
    // The read that replaced seventeen count queries: every roster row for
    // every year in one response, grouped here rather than by the server.
    const rows = [
      { tournament_id: "wbc_2015" }, { tournament_id: "wbc_2015" },
      { tournament_id: "wbc_2024" },
    ];
    const counts = countByTournament(rows);
    expect(counts.get("wbc_2015")).toBe(2);
    expect(counts.get("wbc_2024")).toBe(1);
  });

  it("gives no count for a year with no rows, rather than zero", () => {
    // The caller defaults a miss to 0. A Map entry of 0 and no entry at all
    // read the same there, but only one of them can be told apart later.
    expect(countByTournament([{ tournament_id: "wbc_2015" }]).has("wbc_2019")).toBe(false);
  });

  it("drops a row carrying no tournament_id instead of counting it somewhere", () => {
    // A row that belongs to no year must not land on one — that would put a
    // phantom score on a real tournament.
    const counts = countByTournament([{ tournament_id: "" }, {}, null, { tournament_id: "wbc_2015" }]);
    expect([...counts.keys()]).toEqual(["wbc_2015"]);
    expect(counts.get("wbc_2015")).toBe(1);
  });

  it("survives being handed nothing", () => {
    expect(countByTournament().size).toBe(0);
    expect(countByTournament(null).size).toBe(0);
  });
});

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
