import { describe, it, expect } from "vitest";
import {
  holesEntered, roundScoreProgress, scoredAmong, pairingScoreImpact,
  orphanedScores, incomingScores, describeScored, totalHoles, WD_SENTINEL,
} from "./scoreGuard";

// n holes posted for a player in a round.
const card = (n, score = 4) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, score]));
const hd = (entries) => Object.fromEntries(Object.entries(entries));

describe("holesEntered", () => {
  it("counts posted holes", () => {
    expect(holesEntered(hd({ a_1: card(7) }), "a", 1)).toBe(7);
  });

  it("is zero for an unknown player, round, or empty map", () => {
    expect(holesEntered(hd({ a_1: card(7) }), "b", 1)).toBe(0);
    expect(holesEntered(hd({ a_1: card(7) }), "a", 2)).toBe(0);
    expect(holesEntered(undefined, "a", 1)).toBe(0);
  });

  it("ignores cleared holes, which are written as 0 rather than removed", () => {
    expect(holesEntered(hd({ a_1: { 0: 4, 1: 0, 2: 5 } }), "a", 1)).toBe(2);
  });

  // A withdrawn player's remaining holes carry the sentinel so their card stays
  // structurally complete. Counting those as posted would report someone who
  // walked in after nine as having a full round at risk.
  it("excludes WD sentinel holes", () => {
    const scores = { ...card(9) };
    for (let h = 9; h < 18; h++) scores[h] = WD_SENTINEL;
    expect(holesEntered(hd({ a_1: scores }), "a", 1)).toBe(9);
  });
});

describe("roundScoreProgress", () => {
  const groups = [["a", "b"], ["c"]];

  it("totals over every player in every group", () => {
    const p = roundScoreProgress(groups, hd({ a_1: card(18), b_1: card(9), c_1: card(0) }), 1);
    expect(p.total).toBe(54);
    expect(p.entered).toBe(27);
    expect(p.missing).toBe(27);
    expect(p.complete).toBe(false);
  });

  it("is complete only when everyone has all 18", () => {
    const p = roundScoreProgress(groups, hd({ a_1: card(18), b_1: card(18), c_1: card(18) }), 1);
    expect(p.complete).toBe(true);
    expect(p.missing).toBe(0);
  });

  // An empty draw has nothing to be complete about — reporting it complete
  // would fire the ready-to-finalize prompt on a round nobody has played.
  it("is not complete when no groups are drawn", () => {
    expect(roundScoreProgress([], {}, 1).complete).toBe(false);
    expect(roundScoreProgress(undefined, {}, 1).complete).toBe(false);
  });

  it("lists who is missing most, first", () => {
    const p = roundScoreProgress(groups, hd({ a_1: card(17), b_1: card(2), c_1: card(9) }), 1);
    expect(p.missingBy.map(m => m.pid)).toEqual(["b", "c", "a"]);
    expect(p.missingBy[0].missing).toBe(16);
  });

  // A stray key outside 0–17 must not be able to push a partial round past
  // complete, because `entered` is compared against a players × 18 total.
  it("clamps a player's count at 18", () => {
    const bad = { ...card(18), 99: 4 };
    const p = roundScoreProgress([["a"]], hd({ a_1: bad }), 1);
    expect(p.entered).toBe(18);
    expect(p.complete).toBe(true);
  });

  it("counts a player in two groups once", () => {
    const p = roundScoreProgress([["a"], ["a", "b"]], hd({ a_1: card(18), b_1: card(18) }), 1);
    expect(p.total).toBe(36);
  });
});

describe("scoredAmong", () => {
  const data = hd({ a_1: card(12), b_1: card(7), c_1: card(0) });

  it("drops players with nothing posted and sorts heaviest first", () => {
    expect(scoredAmong(data, 1, ["a", "b", "c"])).toEqual([
      { pid: "a", holes: 12 },
      { pid: "b", holes: 7 },
    ]);
  });

  it("breaks a tie deterministically", () => {
    const tie = hd({ z_1: card(5), a_1: card(5) });
    expect(scoredAmong(tie, 1, ["z", "a"]).map(s => s.pid)).toEqual(["a", "z"]);
    expect(scoredAmong(tie, 1, ["a", "z"]).map(s => s.pid)).toEqual(["a", "z"]);
  });

  it("de-duplicates its input", () => {
    expect(scoredAmong(data, 1, ["a", "a"])).toHaveLength(1);
  });
});

describe("pairingScoreImpact", () => {
  it("totals the holes a re-draw would disturb", () => {
    const r = pairingScoreImpact({
      groups: [["a", "b"], ["c"]],
      holeData: hd({ a_1: card(12), b_1: card(7), c_1: card(0) }),
      round: 1,
    });
    expect(r.hasScores).toBe(true);
    expect(r.holes).toBe(19);
    expect(r.scored.map(s => s.pid)).toEqual(["a", "b"]);
  });

  it("reports nothing at risk before anyone tees off", () => {
    const r = pairingScoreImpact({ groups: [["a", "b"]], holeData: {}, round: 1 });
    expect(r).toMatchObject({ hasScores: false, holes: 0 });
  });
});

describe("orphanedScores", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }];

  // The wreckage of a re-draw that already happened: live in the database,
  // still counting on the leaderboard, invisible on the scoring screen.
  it("finds scores no current group accounts for", () => {
    const out = orphanedScores({
      holeData: hd({ a_1: card(18), c_1: card(6) }),
      groups: [["a", "b"]],
      round: 1,
      players,
    });
    expect(out).toEqual([{ pid: "c", holes: 6 }]);
  });

  it("finds everyone once the draw is cleared", () => {
    const out = orphanedScores({
      holeData: hd({ a_1: card(18), c_1: card(6) }),
      groups: [],
      round: 1,
      players,
    });
    expect(out.map(o => o.pid)).toEqual(["a", "c"]);
  });

  it("is empty when every scorer is still in a group", () => {
    const out = orphanedScores({
      holeData: hd({ a_1: card(18) }),
      groups: [["a"]],
      round: 1,
      players,
    });
    expect(out).toEqual([]);
  });
});

describe("incomingScores", () => {
  // The mirror hazard: a new pairing inherits these holes the moment it saves.
  it("reports holes the players being added already have", () => {
    const out = incomingScores({
      holeData: hd({ a_1: card(4), b_1: card(0) }),
      round: 1,
      pids: ["a", "b"],
    });
    expect(out).toEqual([{ pid: "a", holes: 4 }]);
  });
});

describe("describeScored / totalHoles", () => {
  const nameOf = (pid) => pid.toUpperCase();

  it("lists names with hole counts", () => {
    expect(describeScored([{ pid: "a", holes: 12 }, { pid: "b", holes: 7 }], nameOf))
      .toBe("A (12), B (7)");
  });

  it("summarises the tail past the cap", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((pid, i) => ({ pid, holes: 10 - i }));
    expect(describeScored(many, nameOf)).toBe("A (10), B (9), C (8), D (7), +2 more");
  });

  it("handles empty input", () => {
    expect(describeScored([], nameOf)).toBe("");
    expect(totalHoles([])).toBe(0);
    expect(totalHoles(undefined)).toBe(0);
  });

  it("sums holes", () => {
    expect(totalHoles([{ pid: "a", holes: 12 }, { pid: "b", holes: 7 }])).toBe(19);
  });
});
