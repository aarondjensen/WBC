import { describe, it, expect } from "vitest";
import { groupKey, roundOfGroupKey, sameGroup, liveRound, switchableGroups, groupProgress, roundFinalized, unfinalizeKeys, isGroupKey } from "./groupSwitch";

// n holes posted for a player, as holeData files them: `${pid}_${round}`.
const card = (n, s = 4) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, s]));

describe("groupKey", () => {
  it("is order-independent, so a re-drawn group keeps its card", () => {
    expect(groupKey(2, ["c", "a", "b"])).toBe(groupKey(2, ["a", "b", "c"]));
  });

  it("carries the round, so the same four in round 2 are a different card", () => {
    expect(groupKey(1, ["a", "b"])).not.toBe(groupKey(2, ["a", "b"]));
  });
});

describe("roundOfGroupKey", () => {
  it("reads back the round groupKey wrote", () => {
    expect(roundOfGroupKey(groupKey(3, ["a", "b"]))).toBe(3);
  });

  it("handles a round in double figures", () => {
    expect(roundOfGroupKey(groupKey(12, ["a"]))).toBe(12);
  });

  it("answers a bare round number as itself — finalizedRounds holds both", () => {
    expect(roundOfGroupKey(2)).toBe(2);
    expect(roundOfGroupKey("2")).toBe(2);
  });

  it("answers null rather than guessing round 1", () => {
    expect(roundOfGroupKey("")).toBe(null);
    expect(roundOfGroupKey(null)).toBe(null);
    expect(roundOfGroupKey(undefined)).toBe(null);
    expect(roundOfGroupKey("aaron_j,dave_s")).toBe(null);
  });
});

describe("sameGroup", () => {
  it("matches the same people in any order", () => {
    expect(sameGroup(["a", "b"], ["b", "a"])).toBe(true);
  });

  it("does not match a different draw, or nothing at all", () => {
    expect(sameGroup(["a", "b"], ["a", "c"])).toBe(false);
    expect(sameGroup(null, ["a"])).toBe(false);
  });
});

describe("liveRound", () => {
  it("is the first round nobody has finalized", () => {
    expect(liveRound({ 1: true }, 4)).toBe(2);
  });

  // A group-level key finalizes ONE card, not the round — the round is still
  // being played by everybody else in it.
  it("ignores group-level finalizations", () => {
    expect(liveRound({ "1_a,b": true }, 4)).toBe(1);
  });

  it("is null once every round is in — the event is over", () => {
    expect(liveRound({ 1: true, 2: true }, 2)).toBe(null);
  });
});

describe("switchableGroups", () => {
  const pairings = { 1: [["a", "b"], ["c", "d"]], 3: [["a", "c"]] };

  it("lists every group in every round, rounds ascending", () => {
    const gs = switchableGroups(pairings, 4);
    expect(gs.map(g => `${g.round}/${g.index}`)).toEqual(["1/0", "1/1", "3/0"]);
  });

  it("keeps each group's position in its own round, which is its number", () => {
    const gs = switchableGroups(pairings, 4);
    expect(gs[1]).toMatchObject({ round: 1, index: 1, ids: ["c", "d"] });
  });

  // The pairings editor leaves empty slots behind while a director fills
  // groups in. There is nothing to point a scoring screen at.
  it("skips empty groups", () => {
    expect(switchableGroups({ 1: [[], ["a"]] }, 1)).toHaveLength(1);
  });

  it("stops at the event's round count", () => {
    expect(switchableGroups(pairings, 2).every(g => g.round <= 2)).toBe(true);
  });

  it("survives a tournament with no pairings at all", () => {
    expect(switchableGroups(undefined, 4)).toEqual([]);
  });
});

describe("groupProgress", () => {
  it("reports the furthest player, not the group's agreed position", () => {
    const hd = { a_1: card(9), b_1: card(7) };
    expect(groupProgress(1, ["a", "b"], hd, {})).toMatchObject({ thru: 9, complete: false });
  });

  it("is complete only when every player has all 18", () => {
    expect(groupProgress(1, ["a", "b"], { a_1: card(18), b_1: card(18) }, {}))
      .toMatchObject({ complete: true, thru: 18 });
    expect(groupProgress(1, ["a", "b"], { a_1: card(18), b_1: card(17) }, {}).complete).toBe(false);
  });

  it("counts a cleared score as unplayed", () => {
    expect(groupProgress(1, ["a"], { a_1: { ...card(6), 3: 0 } }, {}).thru).toBe(5);
  });

  it("reads finalized off the group's own key or the whole round's", () => {
    expect(groupProgress(1, ["a", "b"], {}, { "1_a,b": true }).finalized).toBe(true);
    expect(groupProgress(1, ["a", "b"], {}, { 1: true }).finalized).toBe(true);
    expect(groupProgress(1, ["a", "b"], {}, { 2: true }).finalized).toBe(false);
  });

  it("does not call an empty group complete", () => {
    expect(groupProgress(1, [], {}, {}).complete).toBe(false);
  });
});

describe("roundFinalized", () => {
  const pairings = { 1: [["a", "b"], ["c", "d"]], 2: [["a", "c"], ["b", "d"]] };

  it("is true when the director finalized the whole round from Admin", () => {
    expect(roundFinalized({ 1: true }, pairings, 1)).toBe(true);
  });

  it("is true when every group has finalized its own card", () => {
    const fr = { [groupKey(1, ["a", "b"])]: true, [groupKey(1, ["c", "d"])]: true };
    expect(roundFinalized(fr, pairings, 1)).toBe(true);
  });

  it("is false while one group is still out", () => {
    const fr = { [groupKey(1, ["a", "b"])]: true };
    expect(roundFinalized(fr, pairings, 1)).toBe(false);
  });

  it("does not leak across rounds", () => {
    expect(roundFinalized({ 1: true }, pairings, 2)).toBe(false);
    const fr = { [groupKey(1, ["a", "b"])]: true, [groupKey(1, ["c", "d"])]: true };
    expect(roundFinalized(fr, pairings, 2)).toBe(false);
  });

  it("reads the group key off the ids in any order", () => {
    const fr = { [groupKey(1, ["b", "a"])]: true, [groupKey(1, ["d", "c"])]: true };
    expect(roundFinalized(fr, pairings, 1)).toBe(true);
  });

  it("is false for a round nobody has drawn — an empty draw is not a finished round", () => {
    expect(roundFinalized({}, {}, 1)).toBe(false);
    expect(roundFinalized({}, { 1: [] }, 1)).toBe(false);
    expect(roundFinalized({}, { 1: [[], []] }, 1)).toBe(false);
  });

  it("still honours the director's flag on a round with no draw", () => {
    expect(roundFinalized({ 3: true }, {}, 3)).toBe(true);
  });

  it("survives missing arguments", () => {
    expect(roundFinalized(null, null, 1)).toBe(false);
  });
});

describe("unfinalizeKeys", () => {
  const gk = groupKey(1, ["a", "b", "c", "d"]);

  it("takes the group's own key when that is what is locking it", () => {
    expect(unfinalizeKeys({ [gk]: true }, gk)).toEqual([gk]);
  });

  // The one this exists for: Admin's "Round N Complete" prompt writes a bare
  // round number, so no group in that round carries a key of its own, and
  // deleting the group key alone left the card locked and the button dead.
  it("takes the ROUND's key when the round was closed out from Admin", () => {
    expect(unfinalizeKeys({ 1: true }, gk)).toEqual(["1"]);
  });

  it("takes both when both are set", () => {
    expect(unfinalizeKeys({ 1: true, [gk]: true }, gk).sort()).toEqual([gk, "1"].sort());
  });

  it("answers with just the number when handed a bare round", () => {
    expect(unfinalizeKeys({ 1: true }, 1)).toEqual(["1"]);
    expect(unfinalizeKeys({ 1: true }, "1")).toEqual(["1"]);
  });

  it("leaves another round's finalization alone", () => {
    expect(unfinalizeKeys({ 2: true }, gk)).toEqual([]);
    expect(unfinalizeKeys({ 2: true }, groupKey(2, ["a", "b"]))).toEqual(["2"]);
  });

  it("is empty when nothing is locking this card, so a caller can skip the write", () => {
    expect(unfinalizeKeys({}, gk)).toEqual([]);
    expect(unfinalizeKeys(null, gk)).toEqual([]);
    expect(unfinalizeKeys({ [groupKey(1, ["e", "f"])]: true }, gk)).toEqual([]);
  });
});

describe("isGroupKey", () => {
  it("tells a card's key from a round's", () => {
    expect(isGroupKey(groupKey(1, ["a", "b"]))).toBe(true);
    expect(isGroupKey(1)).toBe(false);
    expect(isGroupKey("1")).toBe(false);
    expect(isGroupKey(null)).toBe(false);
  });
});
