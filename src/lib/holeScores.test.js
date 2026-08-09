import { describe, it, expect } from "vitest";
import { applyScoreChanges, cardKey, roundOf } from "./holeScores";

const row = (pid, round, hole, score) => ({
  player_id: pid,
  round_number: round,
  hole_number: hole,
  score,
  round_score_id: `rs_2026_r${round}_${pid}`,
});

const added = (r) => ({ type: "added", row: r });
const removed = (r) => ({ type: "removed", row: r });
const modified = (r) => ({ type: "modified", row: r });

describe("roundOf", () => {
  it("prefers the round_number field", () => {
    expect(roundOf({ round_number: 3, round_score_id: "rs_2026_r1_aaron_j" })).toBe(3);
  });

  it("falls back to the round in the round_score_id", () => {
    expect(roundOf({ round_score_id: "rs_2026_r2_aaron_j" })).toBe(2);
  });

  it("falls back to the document id when there is no round_score_id", () => {
    expect(roundOf({ id: "hs_2026_r4_aaron_j_h7" })).toBe(4);
  });

  it("defaults to round 1 when nothing says otherwise", () => {
    expect(roundOf({})).toBe(1);
    expect(roundOf(null)).toBe(1);
  });
});

describe("applyScoreChanges — scores arriving", () => {
  it("adds a hole to an empty map", () => {
    const out = applyScoreChanges({}, [added(row("aaron_j", 1, 4, 5))]);
    expect(out).toEqual({ aaron_j_1: { 3: 5 } });
  });

  it("stores holes zero-indexed, off a one-indexed hole_number", () => {
    const out = applyScoreChanges({}, [added(row("aaron_j", 1, 1, 4))]);
    expect(out.aaron_j_1).toEqual({ 0: 4 });
  });

  it("merges into a card that already has holes", () => {
    const out = applyScoreChanges({ aaron_j_1: { 0: 4 } }, [added(row("aaron_j", 1, 2, 6))]);
    expect(out.aaron_j_1).toEqual({ 0: 4, 1: 6 });
  });

  it("overwrites a hole on modify", () => {
    const out = applyScoreChanges({ aaron_j_1: { 0: 4 } }, [modified(row("aaron_j", 1, 1, 7))]);
    expect(out.aaron_j_1).toEqual({ 0: 7 });
  });

  it("keeps rounds and players apart", () => {
    const out = applyScoreChanges({}, [
      added(row("aaron_j", 1, 1, 4)),
      added(row("aaron_j", 2, 1, 5)),
      added(row("dave_s", 1, 1, 6)),
    ]);
    expect(out).toEqual({
      aaron_j_1: { 0: 4 },
      aaron_j_2: { 0: 5 },
      dave_s_1: { 0: 6 },
    });
  });

  it("does not mutate the map it was given", () => {
    const before = { aaron_j_1: { 0: 4 } };
    const out = applyScoreChanges(before, [added(row("aaron_j", 1, 2, 5))]);
    expect(before).toEqual({ aaron_j_1: { 0: 4 } });
    expect(out).not.toBe(before);
  });
});

// The bug this module exists for: a discarded card stayed on every phone but
// the one that discarded it.
describe("applyScoreChanges — scores going away", () => {
  it("removes a deleted hole", () => {
    const out = applyScoreChanges({ aaron_j_1: { 0: 4, 1: 5 } }, [removed(row("aaron_j", 1, 1, 4))]);
    expect(out.aaron_j_1).toEqual({ 1: 5 });
  });

  it("drops the card entirely once its last hole goes", () => {
    const out = applyScoreChanges({ aaron_j_1: { 0: 4 } }, [removed(row("aaron_j", 1, 1, 4))]);
    expect(out).toEqual({});
    expect("aaron_j_1" in out).toBe(false);
  });

  it("clears a whole round the way a discard sends it", () => {
    const card = {};
    for (let h = 0; h < 18; h++) card[h] = 4;
    const out = applyScoreChanges(
      { aaron_j_1: card, dave_s_1: { 0: 5 } },
      Array.from({ length: 18 }, (_, h) => removed(row("aaron_j", 1, h + 1, 4))),
    );
    expect(out).toEqual({ dave_s_1: { 0: 5 } });
  });

  it("leaves other players' cards alone", () => {
    const out = applyScoreChanges(
      { aaron_j_1: { 0: 4 }, dave_s_1: { 0: 5 } },
      [removed(row("aaron_j", 1, 1, 4))],
    );
    expect(out.dave_s_1).toEqual({ 0: 5 });
  });

  it("leaves the same player's OTHER rounds alone", () => {
    const out = applyScoreChanges(
      { aaron_j_1: { 0: 4 }, aaron_j_2: { 0: 5 } },
      [removed(row("aaron_j", 1, 1, 4))],
    );
    expect(out.aaron_j_2).toEqual({ 0: 5 });
  });

  it("ignores a removal for a hole this map never had", () => {
    const before = { aaron_j_1: { 0: 4 } };
    const out = applyScoreChanges(before, [removed(row("aaron_j", 1, 9, 4))]);
    expect(out).toBe(before);
  });

  it("ignores a removal for a card this map never had", () => {
    const before = { dave_s_1: { 0: 5 } };
    const out = applyScoreChanges(before, [removed(row("aaron_j", 1, 1, 4))]);
    expect(out).toBe(before);
  });

  it("applies a delete and a re-post in the same snapshot, in order", () => {
    const out = applyScoreChanges({ aaron_j_1: { 0: 4 } }, [
      removed(row("aaron_j", 1, 1, 4)),
      added(row("aaron_j", 1, 1, 6)),
    ]);
    expect(out.aaron_j_1).toEqual({ 0: 6 });
  });
});

describe("applyScoreChanges — nothing to do", () => {
  it("hands back the same object for an empty change list", () => {
    const before = { aaron_j_1: { 0: 4 } };
    expect(applyScoreChanges(before, [])).toBe(before);
    expect(applyScoreChanges(before, null)).toBe(before);
  });

  it("skips rows with no player", () => {
    const before = { aaron_j_1: { 0: 4 } };
    expect(applyScoreChanges(before, [added({ round_number: 1, hole_number: 1, score: 4 })])).toBe(before);
  });

  it("skips rows with no hole number", () => {
    const before = { aaron_j_1: { 0: 4 } };
    expect(applyScoreChanges(before, [added({ player_id: "aaron_j", round_number: 1, score: 4 })])).toBe(before);
  });

  it("carries the WD sentinel through like any other score", () => {
    const out = applyScoreChanges({}, [added(row("aaron_j", 1, 10, 99))]);
    expect(out.aaron_j_1).toEqual({ 9: 99 });
  });
});

describe("cardKey", () => {
  it("is the pid_round shape every screen reads", () => {
    expect(cardKey("aaron_j", 2)).toBe("aaron_j_2");
  });
});
