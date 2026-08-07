import { describe, it, expect } from "vitest";
import { groupTeeOrder, groupLabel, tagAheadOfPlay } from "./ctp";

const PAIRINGS = {
  1: [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
    ["i", "j", "k", "l"],
  ],
};

describe("groupTeeOrder", () => {
  it("gives a group's index in the round's draw", () => {
    expect(groupTeeOrder(PAIRINGS, 1, ["a", "b", "c", "d"])).toBe(0);
    expect(groupTeeOrder(PAIRINGS, 1, ["i", "j", "k", "l"])).toBe(2);
  });

  it("matches on the roster, not the order it arrived in", () => {
    expect(groupTeeOrder(PAIRINGS, 1, ["h", "f", "e", "g"])).toBe(1);
  });

  it("is null for a group that is not in the draw", () => {
    expect(groupTeeOrder(PAIRINGS, 1, ["x", "y"])).toBe(null);
  });

  it("is null for a round with no pairings, and for no group at all", () => {
    expect(groupTeeOrder(PAIRINGS, 2, ["a", "b", "c", "d"])).toBe(null);
    expect(groupTeeOrder({}, 1, ["a", "b"])).toBe(null);
    expect(groupTeeOrder(PAIRINGS, 1, [])).toBe(null);
    expect(groupTeeOrder(PAIRINGS, 1, null)).toBe(null);
  });

  // Off first is index 0, and a group that is not in the draw must not read
  // as the first one off.
  it("tells 'not in the draw' apart from 'off first'", () => {
    expect(groupTeeOrder(PAIRINGS, 1, ["x"])).not.toBe(0);
  });
});

describe("groupLabel", () => {
  it("counts from one, the way the tee sheet does", () => {
    expect(groupLabel(0)).toBe("Group 1");
    expect(groupLabel(2)).toBe("Group 3");
  });

  it("has something to say when the order is unknown", () => {
    expect(groupLabel(null)).toBe("another group");
  });
});

describe("tagAheadOfPlay", () => {
  // The case this exists for: group 2 walks off a par 3 without entering,
  // group 3 finishes the hole and tags it, and group 2 finally puts their
  // scores in twenty minutes later against a tag from behind them.
  it("flags a tag made by a group playing behind this one", () => {
    expect(tagAheadOfPlay({ leaderOrder: 2, myOrder: 1 })).toEqual({
      leaderOrder: 2,
      label: "Group 3",
    });
  });

  it("says nothing when the tag came from a group ahead", () => {
    expect(tagAheadOfPlay({ leaderOrder: 0, myOrder: 1 })).toBe(null);
  });

  it("says nothing when the tag is this group's own", () => {
    expect(tagAheadOfPlay({ leaderOrder: 1, myOrder: 1 })).toBe(null);
    expect(tagAheadOfPlay({ leaderOrder: 3, leaderKey: "g", myOrder: 1, myKey: "g" })).toBe(null);
  });

  // A director's override off the Betting tab carries no group, and neither
  // does a tag written before tags recorded one. Both are unknown, not early.
  it("says nothing when either order is unknown", () => {
    expect(tagAheadOfPlay({ leaderOrder: null, myOrder: 1 })).toBe(null);
    expect(tagAheadOfPlay({ leaderOrder: 2, myOrder: null })).toBe(null);
    expect(tagAheadOfPlay({})).toBe(null);
  });
});
