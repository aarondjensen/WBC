import { describe, it, expect } from "vitest";
import {
  PAIRING_MODES, defaultPairingMode, resolvePairingCfg,
  balancedGroupSizes, buildPriorPartners, countRepeatPairs,
  optimizeAvoidRepeats, groupByLeaderboard,
} from "./pairingDraw";

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

// A deterministic stand-in for Math.random, so a randomized search can be
// tested at all. Cycles a fixed sequence — the point is repeatability, not
// realism; the quality assertions below hold for any seed.
const seeded = (seed = 1) => {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
};

describe("the default method per round", () => {
  // R1 is somebody's decision; R2 is the whole point of the week; R3 follows
  // the standings.
  it("is manual, then avoid_repeats, then leaderboard", () => {
    expect(defaultPairingMode(1)).toBe("manual");
    expect(defaultPairingMode(2)).toBe("avoid_repeats");
    expect(defaultPairingMode(3)).toBe("leaderboard");
    expect(defaultPairingMode(4)).toBe("leaderboard");
  });

  it("only ever names a method that exists", () => {
    for (let r = 1; r <= 6; r++) expect(PAIRING_MODES).toContain(defaultPairingMode(r));
  });
});

describe("resolvePairingCfg", () => {
  it("falls back to the round's default", () => {
    expect(resolvePairingCfg({}, 1)).toEqual({ mode: "manual", leadersLast: true });
    expect(resolvePairingCfg(null, 3)).toEqual({ mode: "leaderboard", leadersLast: true });
  });

  it("honours what the director stored", () => {
    expect(resolvePairingCfg({ 1: { mode: "leaderboard" } }, 1).mode).toBe("leaderboard");
  });

  // Final pairings go off last, so this defaults on — but false is a real
  // answer and must not be read as "unset".
  it("keeps leadersLast false rather than defaulting it back to true", () => {
    expect(resolvePairingCfg({ 2: { mode: "leaderboard", leadersLast: false } }, 2).leadersLast).toBe(false);
  });
});

describe("balancedGroupSizes", () => {
  it("splits a full field evenly", () => {
    expect(balancedGroupSizes(12, 3)).toEqual([4, 4, 4]);
    expect(balancedGroupSizes(16, 4)).toEqual([4, 4, 4, 4]);
  });

  it("puts the remainder in the early groups", () => {
    expect(balancedGroupSizes(10, 3)).toEqual([4, 3, 3]);
    expect(balancedGroupSizes(13, 4)).toEqual([4, 3, 3, 3]);
  });

  it("never differs by more than one", () => {
    for (let n = 1; n <= 24; n++) {
      for (let g = 1; g <= 6; g++) {
        const sizes = balancedGroupSizes(n, g);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      }
    }
  });

  it("is empty rather than dividing by zero", () => {
    expect(balancedGroupSizes(12, 0)).toEqual([]);
  });
});

describe("buildPriorPartners", () => {
  const draw = { 1: [["a", "b", "c"], ["d", "e", "f"]], 2: [["a", "d", "e"], ["b", "c", "f"]] };

  it("reads only the rounds BEFORE the one being drawn", () => {
    const p = buildPriorPartners(draw, 2);
    expect([...p.a]).toEqual(expect.arrayContaining(["b", "c"]));
    expect(p.a.has("d")).toBe(false);   // round 2 has not happened yet
  });

  it("accumulates across every earlier round", () => {
    const p = buildPriorPartners(draw, 3);
    expect(p.a.has("b")).toBe(true);
    expect(p.a.has("d")).toBe(true);
  });

  it("is symmetric, and nobody partners themselves", () => {
    const p = buildPriorPartners(draw, 3);
    expect(p.b.has("a")).toBe(true);
    expect(p.a.has("a")).toBe(false);
  });

  it("is empty for round 1", () => {
    expect(buildPriorPartners(draw, 1)).toEqual({});
    expect(buildPriorPartners(null, 2)).toEqual({});
  });
});

describe("optimizeAvoidRepeats", () => {
  it("returns every player exactly once, in balanced groups", () => {
    const players = ids(12);
    const { groups } = optimizeAvoidRepeats(players, 3, {}, 20, seeded());
    expect(groups.flat().sort()).toEqual(players.slice().sort());
    expect(groups.map(g => g.length)).toEqual([4, 4, 4]);
  });

  // With no history there is nothing to avoid.
  it("reports no repeats when nobody has played together", () => {
    expect(optimizeAvoidRepeats(ids(12), 3, {}, 20, seeded()).repeats).toBe(0);
  });

  // The real case: after round 1, three foursomes redrawn into three
  // foursomes. Every group of four must contain at least one prior pair —
  // 12 players in 4s cannot avoid it — so 3 is the mathematical floor and
  // finding it is the whole job.
  it("finds the mathematical minimum for 12 players in foursomes", () => {
    const round1 = { 1: [["p1", "p2", "p3", "p4"], ["p5", "p6", "p7", "p8"], ["p9", "p10", "p11", "p12"]] };
    const partners = buildPriorPartners(round1, 2);
    const { groups, repeats } = optimizeAvoidRepeats(ids(12), 3, partners, 80, seeded(7));
    expect(repeats).toBe(3);
    expect(countRepeatPairs(groups, partners)).toBe(3);
  });

  // Threesomes with four groups CAN reach zero, and should.
  it("reaches zero repeats when the shape allows it", () => {
    const round1 = { 1: [["p1", "p2", "p3"], ["p4", "p5", "p6"], ["p7", "p8", "p9"], ["p10", "p11", "p12"]] };
    const partners = buildPriorPartners(round1, 2);
    expect(optimizeAvoidRepeats(ids(12), 4, partners, 80, seeded(3)).repeats).toBe(0);
  });

  it("is deterministic for a given seed", () => {
    const partners = buildPriorPartners({ 1: [["p1", "p2", "p3", "p4"], ["p5", "p6", "p7", "p8"]] }, 2);
    const a = optimizeAvoidRepeats(ids(8), 2, partners, 30, seeded(42));
    const b = optimizeAvoidRepeats(ids(8), 2, partners, 30, seeded(42));
    expect(a.groups).toEqual(b.groups);
  });

  it("handles an odd field", () => {
    const { groups } = optimizeAvoidRepeats(ids(11), 3, {}, 20, seeded());
    expect(groups.flat().sort()).toEqual(ids(11).sort());
    expect(groups.map(g => g.length).sort()).toEqual([3, 4, 4]);
  });
});

describe("groupByLeaderboard", () => {
  const order = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

  // "Final pairings go off last" — the leaders take the latest tee time.
  it("puts the leaders in the LAST group by default", () => {
    const groups = groupByLeaderboard(order, 2, true);
    expect(groups[groups.length - 1]).toContain("1st");
    expect(groups[0]).toContain("8th");
  });

  it("can lead off with them instead", () => {
    const groups = groupByLeaderboard(order, 2, false);
    expect(groups[0]).toContain("1st");
  });

  it("keeps everybody, in balanced groups", () => {
    const groups = groupByLeaderboard(order, 3, true);
    expect(groups.flat().sort()).toEqual(order.slice().sort());
    expect(groups.map(g => g.length)).toEqual([3, 3, 2]);
  });
});
