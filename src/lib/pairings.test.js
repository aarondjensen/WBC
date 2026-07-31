import { describe, it, expect } from "vitest";
import { groupsForRound, assignToGroup, removeFromGroup, clearGroup, swapIntoGroup } from "./pairings";

// These transforms replaced logic that used to live inline in PairingsEditor,
// spread across a prop-syncing effect and a pair of setState updaters that had
// to be sequenced with setTimeout(0). The refactor was supposed to preserve
// behaviour exactly, so several tests below re-implement the original and
// assert the new function agrees with it — a rename or a reordering that
// changes who ends up in which group fails here rather than at a tee box.

// ── the original implementations, transcribed ───────────────────────────────

// From the load effect: `if (existing && existing.length > 0) { padded =
// [...existing.map(g => [...g])]; while (padded.length < numGroups) padded.push([]) }
// else { Array.from({ length: numGroups }, () => []) }`
const legacyLoad = (pairingsData, rnd, numGroups) => {
  const existing = (pairingsData || {})[rnd];
  if (existing && existing.length > 0) {
    const padded = [...existing.map(g => [...g])];
    while (padded.length < numGroups) padded.push([]);
    return padded;
  }
  return Array.from({ length: numGroups }, () => []);
};

// From tapGroupPlayer: removeFromGroup(gi, pid), then on the next tick a second
// updater that filtered `selected` out of every group and re-seated them.
const legacySwap = (groups, gi, tappedPid, selectedPid) => {
  const afterRemove = groups.map((g, i) => i === gi ? g.filter(id => id !== tappedPid) : g);
  const ng = afterRemove.map(g => g.filter(id => id !== selectedPid));
  if (ng[gi].length < 4) ng[gi] = [...ng[gi], selectedPid];
  return ng;
};

describe("groupsForRound", () => {
  it("pads saved pairings out to the group count the roster needs", () => {
    const saved = { 2: [["a", "b"], ["c"]] };
    expect(groupsForRound(saved, 2, 4)).toEqual([["a", "b"], ["c"], [], []]);
  });

  it("returns all-empty groups for a round with nothing saved", () => {
    expect(groupsForRound({}, 1, 3)).toEqual([[], [], []]);
    expect(groupsForRound(undefined, 1, 2)).toEqual([[], []]);
    expect(groupsForRound({ 1: [] }, 1, 2)).toEqual([[], []]);
  });

  it("never pads away groups that are already there", () => {
    const saved = { 1: [["a"], ["b"], ["c"], ["d"], ["e"]] };
    expect(groupsForRound(saved, 1, 2)).toHaveLength(5);
  });

  it("copies, so editing the result cannot write through to the saved prop", () => {
    const saved = { 1: [["a", "b"]] };
    const loaded = groupsForRound(saved, 1, 2);
    loaded[0].push("c");
    loaded[1].push("d");
    expect(saved[1]).toEqual([["a", "b"]]);
  });

  it("agrees with the load effect it replaced", () => {
    const cases = [
      [{ 1: [["a", "b", "c", "d"], ["e", "f"]] }, 1, 4],
      [{ 1: [["a"]] }, 1, 1],
      [{}, 3, 5],
      [undefined, 1, 0],
      [{ 2: [] }, 2, 3],
      [{ 1: [["a"], ["b"], ["c"]] }, 1, 2],
    ];
    for (const [data, rnd, n] of cases) {
      expect(groupsForRound(data, rnd, n)).toEqual(legacyLoad(data, rnd, n));
    }
  });
});

describe("assignToGroup", () => {
  it("seats a player and pulls them out of their previous group", () => {
    const groups = [["a", "b"], ["c"]];
    expect(assignToGroup(groups, 1, "a")).toEqual([["b"], ["c", "a"]]);
  });

  it("is a no-op in effect when the player is already in that group", () => {
    const groups = [["a", "b"], []];
    expect(assignToGroup(groups, 0, "a")).toEqual([["b", "a"], []]);
  });

  it("does not mutate the groups it was given", () => {
    const groups = [["a"], ["b"]];
    const snapshot = JSON.parse(JSON.stringify(groups));
    assignToGroup(groups, 1, "a");
    expect(groups).toEqual(snapshot);
  });
});

describe("removeFromGroup", () => {
  it("removes only from the group named", () => {
    const groups = [["a", "b"], ["a"]];
    expect(removeFromGroup(groups, 0, "a")).toEqual([["b"], ["a"]]);
  });

  it("leaves the groups alone when the player is not there", () => {
    const groups = [["a"], ["b"]];
    expect(removeFromGroup(groups, 0, "z")).toEqual([["a"], ["b"]]);
  });
});

describe("clearGroup", () => {
  it("empties one group and leaves the rest", () => {
    expect(clearGroup([["a", "b"], ["c"]], 0)).toEqual([[], ["c"]]);
  });
});

describe("swapIntoGroup", () => {
  it("swaps the tapped player out and the selected player in", () => {
    const groups = [["a", "b"], ["c", "d"]];
    expect(swapIntoGroup(groups, 0, "a", "c")).toEqual([["b", "c"], ["d"]]);
  });

  it("fills the seat the tapped player vacated even when the group was full", () => {
    const groups = [["a", "b", "c", "d"], ["e"]];
    const out = swapIntoGroup(groups, 0, "a", "e");
    expect(out[0]).toEqual(["b", "c", "d", "e"]);
    expect(out[1]).toEqual([]);
    expect(out[0]).toHaveLength(4);
  });

  it("never seats a fifth player", () => {
    // The tapped player is not in the group, so nothing is vacated.
    const groups = [["a", "b", "c", "d"], ["e"]];
    const out = swapIntoGroup(groups, 0, "zz", "e");
    expect(out[0]).toHaveLength(4);
    expect(out[0]).not.toContain("e");
    expect(out[1]).toEqual([]);
  });

  it("handles the selected player already being in the target group", () => {
    const groups = [["a", "b"], ["c"]];
    expect(swapIntoGroup(groups, 0, "a", "b")).toEqual([["b"], ["c"]]);
  });

  it("does not mutate the groups it was given", () => {
    const groups = [["a", "b"], ["c", "d"]];
    const snapshot = JSON.parse(JSON.stringify(groups));
    swapIntoGroup(groups, 0, "a", "c");
    expect(groups).toEqual(snapshot);
  });

  it("agrees with the two-step setTimeout version it replaced", () => {
    const layouts = [
      [["a", "b", "c", "d"], ["e", "f", "g", "h"]],
      [["a", "b"], ["c"], []],
      [["a"], ["b", "c", "d", "e"]],
      [[], ["a", "b"]],
      [["a", "b", "c", "d"], []],
    ];
    for (const groups of layouts) {
      const everyone = groups.flat();
      for (let gi = 0; gi < groups.length; gi++) {
        for (const tapped of everyone) {
          for (const selected of everyone) {
            if (tapped === selected) continue;
            expect(swapIntoGroup(groups, gi, tapped, selected))
              .toEqual(legacySwap(groups, gi, tapped, selected));
          }
        }
      }
    }
  });
});
