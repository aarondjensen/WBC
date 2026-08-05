import { describe, it, expect } from "vitest";
import {
  differential, wbcIndex, historyFor, indexFor, indexTable, matchHistoryName,
  recentRoundSlots, countingFor, WINDOW, COUNTING,
} from "./handicap";

// A round, as wbcIndex wants one. Differentials are handed in directly so the
// window/selection rules can be tested without doing the arithmetic twice.
const rd = (year, round, differential) => ({ year, round, key: `${year}-${round}`, differential });

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
    // Three rounds take the best 1, not the best 3 — averaging everything a
    // player has ever done is a scoring average, not a handicap.
    it("takes fewer rounds, on the taper, and says the sample is short", () => {
      const r = wbcIndex([rd(2025, 1, 12), rd(2025, 2, 8), rd(2025, 3, 10)]);
      expect(r.provisional).toBe(true);
      expect(r.counting).toHaveLength(1);
      expect(r.index).toBe(8);
    });
    it("is null with nothing to work from", () => {
      const r = wbcIndex([]);
      expect(r.index).toBe(null);
      expect(r.provisional).toBe(true);
      expect(r.window).toEqual([]);
    });
  });

  // ── The asterisk ──
  // A window is unmarked only when it is the tournament's own last 12 rounds,
  // round for round. Every other shape gets the mark.
  describe("the asterisk", () => {
    // Three tournaments of four rounds — the yardstick these tests measure to.
    const slots = [2025, 2024, 2023].flatMap(y => [4, 3, 2, 1].map(n => `${y}-${n}`));
    const played = (years) => years.flatMap(y => [1, 2, 3, 4].map(n => rd(y, n, 10)));

    it("stays off for a player who played every one of them", () => {
      const r = wbcIndex(played([2023, 2024, 2025]), { recentSlots: slots });
      expect(r.missed).toEqual([]);
      expect(r.stale).toBe(false);
      expect(r.spanFrom).toBe(2023);
      expect(r.spanTo).toBe(2025);
    });

    it("goes on when a missed year pushes the window further back", () => {
      // Skipped 2024, so 2022 is pulled in to fill the twelve.
      const r = wbcIndex(played([2022, 2023, 2025]), { recentSlots: slots });
      expect(r.stale).toBe(true);
      expect(r.missed).toEqual(["2024-4", "2024-3", "2024-2", "2024-1"]);
    });

    it("goes on for a single withdrawn round", () => {
      const rounds = played([2023, 2024, 2025]).filter(r => r.key !== "2025-4");
      const r = wbcIndex([...rounds, rd(2022, 4, 10)], { recentSlots: slots });
      expect(r.stale).toBe(true);
      expect(r.missed).toEqual(["2025-4"]);
    });

    // The case a span rule could not see: four rounds inside one year, but that
    // year is nine years ago. One year of span, entirely outside the recent 12.
    it("goes on for a career that ended years ago", () => {
      const r = wbcIndex(played([2017]), { recentSlots: slots });
      expect(r.spanYears).toBe(1);
      expect(r.stale).toBe(true);
      expect(r.missed).toHaveLength(12);
    });

    // And the other case it could not see: recent rounds, but not twelve of
    // them, so the sample is not the same sample everyone else's index uses.
    it("goes on for a short career, even a current one", () => {
      const r = wbcIndex(played([2025]), { recentSlots: slots });
      expect(r.window).toHaveLength(4);
      expect(r.stale).toBe(true);
      expect(r.missed).toHaveLength(8);
    });

    it("ignores rounds older than the window when judging it", () => {
      const r = wbcIndex([...played([2023, 2024, 2025]), rd(2012, 1, 10)], { recentSlots: slots });
      expect(r.stale).toBe(false);
    });

    it("has nothing to compare against with no slots, so marks nothing", () => {
      expect(wbcIndex(played([2017]), { recentSlots: [] }).stale).toBe(false);
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

  it("knows the tournament's own last 12 rounds", () => {
    const slots = recentRoundSlots();
    expect(slots).toHaveLength(WINDOW);
    expect(slots[0]).toBe("2025-4");
    expect(slots[slots.length - 1]).toBe("2023-1");
  });

  it("leaves the every-year regulars unmarked", () => {
    for (const name of ["Bob B", "Brian K", "Scott R", "Eric O", "Aaron J"]) {
      const p = indexFor(name);
      expect(p.window, name).toHaveLength(WINDOW);
      expect(p.missed, name).toEqual([]);
      expect(p.stale, name).toBe(false);
    }
  });

  it("asterisks the players whose recent 12 reach back a decade", () => {
    const matt = indexFor("Matt V");
    expect(matt.window).toHaveLength(WINDOW);
    expect(matt.stale).toBe(true);
    expect(matt.missed.length).toBeGreaterThan(0);
  });

  // John C withdrew from the last round of 2025, so his window reaches one
  // round further back than the field's and is not the same twelve.
  it("asterisks a single withdrawn round", () => {
    const john = indexFor("John C");
    expect(john.window).toHaveLength(WINDOW);
    expect(john.missed).toContain("2025-4");
    expect(john.stale).toBe(true);
  });

  // Steve V's four rounds are all from 2017 — one year of span, and the case
  // the old span rule waved through.
  it("asterisks a career that ended years ago", () => {
    const steve = indexFor("Steve V");
    expect(steve.spanYears).toBe(1);
    expect(steve.stale).toBe(true);
  });

  it("calls a four-round career provisional, and marks it too", () => {
    const ray = indexFor("Ray H");
    expect(ray.rounds).toHaveLength(4);
    expect(ray.provisional).toBe(true);
    expect(ray.counting).toHaveLength(1);
    expect(ray.stale).toBe(true);
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

// ── The taper ──
// How many rounds count, for every window size the app can produce. The table
// is the spec; these are the rows.
describe("countingFor", () => {
  it("takes 5 from a full window", () => {
    expect(countingFor(WINDOW)).toBe(5);
    expect(COUNTING).toBe(5);
  });

  it.each([
    [1, 1], [2, 1], [3, 1], [4, 1],
    [5, 2], [6, 2],
    [7, 3], [8, 3],
    [9, 4], [10, 4], [11, 4],
    [12, 5],
  ])("takes %i → %i", (rounds, counts) => {
    expect(countingFor(rounds)).toBe(counts);
  });

  it("has nothing to take from nothing", () => {
    expect(countingFor(0)).toBe(0);
    expect(countingFor(-1)).toBe(0);
  });

  it("never takes more than a full window would, however many it is handed", () => {
    expect(countingFor(20)).toBe(5);
  });

  it("holds roughly to the 40% the full window is", () => {
    for (let n = 5; n <= WINDOW; n++) {
      const share = countingFor(n) / n;
      expect(share, `${n} rounds`).toBeGreaterThanOrEqual(0.3);
      expect(share, `${n} rounds`).toBeLessThanOrEqual(0.45);
    }
  });

  it("never takes more rounds than exist", () => {
    for (let n = 1; n <= WINDOW; n++) expect(countingFor(n)).toBeLessThanOrEqual(n);
  });

  it("never takes fewer as the sample grows", () => {
    for (let n = 2; n <= WINDOW; n++) expect(countingFor(n)).toBeGreaterThanOrEqual(countingFor(n - 1));
  });
});

describe("the taper, applied", () => {
  const diffs = [22, 30, 26, 40, 24, 34, 28, 36];

  it("takes the best 1 of a four-round career", () => {
    const r = wbcIndex(diffs.slice(0, 4).map((d, i) => rd(2025, i + 1, d)));
    expect(r.counting).toHaveLength(1);
    expect(r.index).toBe(22);
  });

  it("takes the best 2 of six", () => {
    const r = wbcIndex(diffs.slice(0, 6).map((d, i) => rd(2025, i + 1, d)));
    expect(r.counting).toHaveLength(2);
    expect(r.index).toBe(23);   // 22 and 24
  });

  it("takes the best 3 of eight", () => {
    const r = wbcIndex(diffs.map((d, i) => rd(2025, i + 1, d)));
    expect(r.counting).toHaveLength(3);
    expect(r.index).toBe(24);   // 22, 24 and 26
  });

  // The two players in the record books this actually moves.
  it("brings a four-round career down to its best round", () => {
    for (const name of ["Ray H", "Steve V"]) {
      const p = indexFor(name);
      expect(p.window, name).toHaveLength(4);
      expect(p.counting, name).toHaveLength(1);
      expect(p.index, name).toBe(Math.min(...p.window.map(r => r.differential)));
    }
  });

  it("leaves a full window alone", () => {
    for (const name of ["Aaron J", "Bob B", "Matt V"]) {
      expect(indexFor(name).counting, name).toHaveLength(COUNTING);
    }
  });
});

// ── A hand-set index ──
// An override replaces the number without erasing the arithmetic behind it, so
// the detail page can show a director's figure and what the rounds actually say
// at the same time.
describe("indexFor with an override", () => {
  it("reports the computed index when there is no override", () => {
    const p = indexFor("Aaron J");
    expect(p.overridden).toBe(false);
    expect(p.index).toBe(6.6);
    expect(p.computed).toBe(6.6);
  });

  it("replaces the index and says so", () => {
    const p = indexFor("Aaron J", { override: 8 });
    expect(p.overridden).toBe(true);
    expect(p.index).toBe(8);
  });

  it("keeps the computed index alongside it", () => {
    const p = indexFor("Aaron J", { override: 8 });
    expect(p.computed).toBe(6.6);
  });

  it("leaves the working untouched, so the page can still show it", () => {
    const plain = indexFor("Aaron J");
    const over = indexFor("Aaron J", { override: 8 });
    expect(over.window.map(r => r.key)).toEqual(plain.window.map(r => r.key));
    expect(over.counting.map(r => r.key)).toEqual(plain.counting.map(r => r.key));
    expect(over.stale).toBe(plain.stale);
  });

  it("quotes a hand-set index to the same tenth as a computed one", () => {
    expect(indexFor("Aaron J", { override: 8.25 }).index).toBe(8.3);
    expect(indexFor("Aaron J", { override: "12" }).index).toBe(12);
  });

  it("gives a player with no rounds at all a real index", () => {
    const p = indexFor("Nobody X", { override: 14.2 });
    expect(p.computed).toBe(null);
    expect(p.index).toBe(14.2);
    expect(p.overridden).toBe(true);
    expect(p.rounds).toEqual([]);
  });

  it("treats a cleared override as no override", () => {
    for (const v of [null, undefined, "", NaN]) {
      const p = indexFor("Aaron J", { override: v });
      expect(p.overridden, String(v)).toBe(false);
      expect(p.index, String(v)).toBe(6.6);
    }
  });

  // Zero is a legal handicap index — a scratch player — and must not be read as
  // "no override" the way a falsy check would.
  it("accepts a scratch override of zero", () => {
    const p = indexFor("Aaron J", { override: 0 });
    expect(p.overridden).toBe(true);
    expect(p.index).toBe(0);
  });

  it("accepts a plus handicap", () => {
    expect(indexFor("Aaron J", { override: -1.4 }).index).toBe(-1.4);
  });
});
