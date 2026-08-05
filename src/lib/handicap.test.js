import { describe, it, expect } from "vitest";
import {
  differential, wbcIndex, historyFor, indexFor, indexTable, matchHistoryName,
  WINDOW, COUNTING, SPAN_LIMIT,
} from "./handicap";

// A round, as wbcIndex wants one. Differentials are handed in directly so the
// window/selection rules can be tested without doing the arithmetic twice.
const rd = (year, round, differential) => ({ year, round, key: `${year}-${round}`, differential });

// n rounds, one per year going back from `to`, all the same differential.
const yearly = (to, n, diff = 10) =>
  Array.from({ length: n }, (_, i) => rd(to - i, 1, diff));

describe("differential", () => {
  it("is the round rescaled onto a slope-113 course", () => {
    // (79 − 71.3) × 113/135 = 6.446…
    expect(differential({ gross: 79, rating: 71.3, slope: 135 })).toBe(6.4);
  });
  it("gives an easy course less credit than a hard one for the same score", () => {
    const hard = differential({ gross: 92, rating: 74.4, slope: 144 });
    const easy = differential({ gross: 92, rating: 70.2, slope: 124 });
    expect(hard).toBeLessThan(easy);
  });
  it("goes negative for a round under the rating", () => {
    expect(differential({ gross: 68, rating: 71.9, slope: 128 })).toBe(-3.4);
  });
  it("ignores par entirely — the rating already carries it", () => {
    const a = differential({ gross: 85, rating: 71.4, slope: 134, par: 71 });
    const b = differential({ gross: 85, rating: 71.4, slope: 134, par: 72 });
    expect(a).toBe(b);
  });
  it("is null without a rating or a slope, rather than zero", () => {
    expect(differential({ gross: 85, rating: null, slope: 130 })).toBe(null);
    expect(differential({ gross: 85, rating: 71.4, slope: null })).toBe(null);
    expect(differential({ gross: 0, rating: 71.4, slope: 130 })).toBe(null);
  });
});

describe("wbcIndex", () => {
  it("averages the best 5 of the most recent 12", () => {
    // 12 recent rounds at 10, plus one brilliant round too old to count.
    const rounds = [
      ...Array.from({ length: 12 }, (_, i) => rd(2025, 12 - i, 10)),
      rd(2024, 1, -5),
    ];
    const r = wbcIndex(rounds);
    expect(r.window).toHaveLength(WINDOW);
    expect(r.counting).toHaveLength(COUNTING);
    expect(r.index).toBe(10);
  });

  it("picks the five lowest differentials out of the window", () => {
    const rounds = Array.from({ length: 12 }, (_, i) => rd(2025, i + 1, i + 1));
    const r = wbcIndex(rounds);
    expect(r.counting.map(x => x.differential).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(r.index).toBe(3);
  });

  it("marks which rounds counted so the view can show the working", () => {
    const rounds = Array.from({ length: 12 }, (_, i) => rd(2025, i + 1, i + 1));
    const r = wbcIndex(rounds);
    expect(r.countingKeys.has("2025-1")).toBe(true);
    expect(r.countingKeys.has("2025-12")).toBe(false);
  });

  it("breaks a tie towards the more recent round", () => {
    const rounds = [
      rd(2025, 1, 8), rd(2024, 1, 8),
      ...Array.from({ length: 10 }, (_, i) => rd(2023, i + 1, 20)),
    ];
    const r = wbcIndex(rounds);
    // Five count: both 8s, then three of the 20s — the three most recent.
    expect(r.counting.map(x => x.key)).toEqual(["2025-1", "2024-1", "2023-10", "2023-9", "2023-8"]);
  });

  it("returns the window newest first whatever order it was handed", () => {
    const r = wbcIndex([rd(2020, 1, 10), rd(2025, 2, 10), rd(2025, 1, 10)]);
    expect(r.window.map(x => x.key)).toEqual(["2025-2", "2025-1", "2020-1"]);
  });

  describe("a short sample", () => {
    it("uses the rounds that exist and says the sample is short", () => {
      const r = wbcIndex([rd(2025, 1, 12), rd(2025, 2, 8), rd(2025, 3, 10)]);
      expect(r.provisional).toBe(true);
      expect(r.counting).toHaveLength(3);
      expect(r.index).toBe(10);
    });
    it("is null with nothing to work from", () => {
      const r = wbcIndex([]);
      expect(r.index).toBe(null);
      expect(r.provisional).toBe(true);
      expect(r.window).toEqual([]);
    });
  });

  describe("the span asterisk", () => {
    it("stays off for a player who has been every year", () => {
      // Three tournaments of four rounds — 2023, 2024, 2025.
      const rounds = [2023, 2024, 2025].flatMap(y => [1, 2, 3, 4].map(n => rd(y, n, 10)));
      const r = wbcIndex(rounds);
      expect(r.spanFrom).toBe(2023);
      expect(r.spanTo).toBe(2025);
      expect(r.spanYears).toBe(3);
      expect(r.stale).toBe(false);
    });
    it("goes on once the recent 12 reach back further than four years", () => {
      const r = wbcIndex(yearly(2025, 12));
      expect(r.spanYears).toBe(12);
      expect(r.stale).toBe(true);
    });
    it("sits exactly on the line at four years", () => {
      const rounds = [2022, 2023, 2024, 2025].flatMap(y => [1, 2, 3].map(n => rd(y, n, 10)));
      const r = wbcIndex(rounds);
      expect(r.spanYears).toBe(SPAN_LIMIT);
      expect(r.stale).toBe(false);
    });
    it("measures the window, not the whole career", () => {
      const rounds = [
        ...[2024, 2025].flatMap(y => [1, 2, 3, 4, 5, 6].map(n => rd(y, n, 10))),
        rd(2012, 1, 10),
      ];
      const r = wbcIndex(rounds);
      expect(r.spanFrom).toBe(2024);
      expect(r.stale).toBe(false);
    });
  });

  describe("a round with no course rating", () => {
    it("is set aside rather than counted as a zero", () => {
      const rounds = [
        rd(2025, 1, null),
        ...Array.from({ length: 5 }, (_, i) => rd(2024, i + 1, 10)),
      ];
      const r = wbcIndex(rounds);
      expect(r.index).toBe(10);
      expect(r.unrated.map(x => x.key)).toEqual(["2025-1"]);
    });
    it("does not use up one of the twelve slots", () => {
      const rounds = [
        rd(2025, 1, null),
        ...Array.from({ length: 12 }, (_, i) => rd(2024, i + 1, 10)),
      ];
      expect(wbcIndex(rounds).window).toHaveLength(WINDOW);
    });
  });
});

describe("matchHistoryName", () => {
  const names = ["Aaron J", "Bob B", "Scott R"];
  it("matches the canonical form the registry already uses", () => {
    expect(matchHistoryName({ name: "Aaron J" }, names)).toBe("Aaron J");
  });
  it("reduces a full surname to its initial", () => {
    expect(matchHistoryName({ name: "Aaron Jensen" }, names)).toBe("Aaron J");
  });
  it("takes the initial off first_name / last_name when they are there", () => {
    expect(matchHistoryName({ name: "AJ", first_name: "Aaron", last_name: "Jensen" }, names)).toBe("Aaron J");
  });
  it("ignores a punctuated initial", () => {
    expect(matchHistoryName({ name: "Bob B." }, names)).toBe("Bob B");
  });
  it("is case-insensitive", () => {
    expect(matchHistoryName({ name: "scott r" }, names)).toBe("Scott R");
  });
  it("returns null for a first-timer rather than guessing", () => {
    expect(matchHistoryName({ name: "Neil A" }, names)).toBe(null);
    expect(matchHistoryName({ name: "Aaron K" }, names)).toBe(null);
    expect(matchHistoryName(null, names)).toBe(null);
  });
});

// ── Against the real dataset ───────────────────────────────────────
// These guard the join between src/data/history.js and the math, which is the
// part a regenerated dataset could silently break.
describe("the recorded history", () => {
  it("gives every round a course and a differential", () => {
    for (const name of ["Bob B", "Aaron J", "Joe S"]) {
      for (const r of historyFor(name)) {
        expect(r.course, `${name} ${r.key}`).toBeTruthy();
        expect(r.differential, `${name} ${r.key}`).toBeTypeOf("number");
      }
    }
  });

  it("reads Bob B's career newest first", () => {
    const rounds = historyFor("Bob B");
    expect(rounds.length).toBeGreaterThan(50);
    expect(rounds[0].year).toBe(2025);
    expect(rounds[rounds.length - 1].year).toBe(2012);
  });

  it("gives the every-year regulars a window inside the span limit", () => {
    for (const name of ["Bob B", "Brian K", "Scott R", "Eric O"]) {
      const p = indexFor(name);
      expect(p.window, name).toHaveLength(WINDOW);
      expect(p.stale, name).toBe(false);
    }
  });

  it("asterisks the players whose recent 12 reach back a decade", () => {
    const matt = indexFor("Matt V");
    expect(matt.window).toHaveLength(WINDOW);
    expect(matt.stale).toBe(true);
    expect(matt.spanYears).toBeGreaterThan(SPAN_LIMIT);
  });

  it("calls a four-round career provisional", () => {
    const ray = indexFor("Ray H");
    expect(ray.rounds).toHaveLength(4);
    expect(ray.provisional).toBe(true);
    expect(ray.counting).toHaveLength(4);
  });

  it("ranks the table best index first, unplayed last", () => {
    const table = indexTable();
    expect(table).toHaveLength(14);
    const played = table.filter(p => p.index != null);
    for (let i = 1; i < played.length; i++) {
      expect(played[i].index).toBeGreaterThanOrEqual(played[i - 1].index);
    }
    expect(table.map(p => p.name)).toContain("Aaron J");
  });

  it("returns nothing for a name with no history", () => {
    expect(historyFor("Nobody X")).toEqual([]);
    expect(indexFor("Nobody X").index).toBe(null);
  });
});
