import { describe, it, expect } from "vitest";
import { groupsForRound, assignToGroup, removeFromGroup, clearGroup, swapIntoGroup, dedupeGroups, duplicateSeats, rowsToPairings } from "./pairings";

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

// ══════════════════════════════════════════════════════════════════
//  Nobody is in two groups
// ══════════════════════════════════════════════════════════════════
//
// A real corruption, found by a director whose round would not go green with
// every player visibly in a group and every group visibly timed. A player was
// seated TWICE, so the seat count exceeded the roster and the setup check
// failed — and nothing on the screen said so, because counting thirteen names
// across four groups by eye is precisely the check a person does not perform.
//
// How it got there: a pairing's document id carries its group number
// (pr_demo_r1_g2_aaron_j), so MOVING a player writes a new document and leaves
// the old one to be deleted separately. The delete list comes from a read of
// the server, and a FAILED read used to collapse to "nothing stored, nothing
// to delete" — so both rows survived and the fold placed the man in both.
//
// Fixed at the source (App.jsx aborts the save when that read fails), and
// guarded here in both directions, because rows written before the fix are
// still in the database.
describe("dedupeGroups", () => {
  it("leaves a sound draw exactly as it is", () => {
    const g = [["a", "b", "c", "d"], ["e", "f", "g"], ["h", "i", "j"]];
    expect(dedupeGroups(g)).toEqual(g);
  });

  // First seating wins. The caller sorts by group number then player id before
  // folding, so "first" is the lower group — deterministic, and the same
  // answer on every phone rather than whichever row Firestore returned first.
  it("keeps the earlier group when a player is seated twice", () => {
    expect(dedupeGroups([["a", "b"], ["c", "a"]])).toEqual([["a", "b"], ["c"]]);
  });

  it("handles a player seated three times", () => {
    expect(dedupeGroups([["a"], ["a"], ["a", "b"]])).toEqual([["a"], [], ["b"]]);
  });

  // An emptied group stays in place rather than collapsing: the tee sheet is
  // matched to groups BY INDEX, so removing an element would slide every later
  // group's time onto the wrong foursome.
  it("does not re-index the groups it empties", () => {
    expect(dedupeGroups([["a", "b"], ["a"], ["c"]])).toEqual([["a", "b"], [], ["c"]]);
  });

  it("drops blanks without disturbing anything else", () => {
    expect(dedupeGroups([["a", null, "b"], [undefined, "c"]])).toEqual([["a", "b"], ["c"]]);
  });

  it("survives the shapes a cold load hands it", () => {
    expect(dedupeGroups([])).toEqual([]);
    expect(dedupeGroups(null)).toEqual([]);
    expect(dedupeGroups(undefined)).toEqual([]);
    expect(dedupeGroups([null, ["a"]])).toEqual([[], ["a"]]);
  });
});

describe("duplicateSeats", () => {
  it("says nothing about a sound draw", () => {
    expect(duplicateSeats([["a", "b"], ["c"]])).toEqual([]);
  });

  it("names everybody seated more than once, once each", () => {
    expect(duplicateSeats([["a", "b"], ["a", "c"], ["a"]]).sort()).toEqual(["a"]);
    expect(duplicateSeats([["a", "b"], ["a", "b"]]).sort()).toEqual(["a", "b"]);
  });
});

// ── The fold heals what is already stored ──
// The rows below are exactly what the database holds after a move whose
// delete never landed: the same player filed under two group numbers.
describe("rowsToPairings and a stale row", () => {
  const row = (rnd, grp, pid) => ({ round_number: rnd, group_number: grp, player_id: pid });

  it("does not seat a player twice from two rows", () => {
    const pd = rowsToPairings([
      row(1, 1, "aaron_j"), row(1, 1, "mike_d"),
      row(1, 2, "aaron_j"), row(1, 2, "carl_x"),
    ]);
    expect(pd[1]).toEqual([["aaron_j", "mike_d"], ["carl_x"]]);
    expect(pd[1].flat().filter(p => p === "aaron_j").length).toBe(1);
  });

  // The seat count is what the setup check compares against the roster, and it
  // exceeding the roster is the symptom that has no explanation on screen.
  it("brings the seat count back to the roster size", () => {
    const pd = rowsToPairings([
      row(1, 1, "a"), row(1, 1, "b"), row(1, 1, "c"),
      row(1, 2, "a"), row(1, 2, "d"), row(1, 2, "e"),
    ]);
    expect(pd[1].flat().length).toBe(5);
  });

  // Per round. Being in group 1 on Friday and group 3 on Saturday is a draw,
  // not a duplicate, and a dedupe that spanned rounds would delete the
  // tournament.
  it("lets a player be in a different group in a different round", () => {
    const pd = rowsToPairings([row(1, 1, "a"), row(2, 3, "a")]);
    expect(pd[1]).toEqual([["a"]]);
    expect(pd[2]).toEqual([[], [], ["a"]]);
  });
});
