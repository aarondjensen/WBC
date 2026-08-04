import { describe, it, expect } from "vitest";
import { groupTrouble, roundTrouble, describeTrouble, blocksScoring, GROUP_MAX } from "./roundSetup";

const roster = ["a", "b", "c", "d", "e", "f", "g", "h"];

describe("groupTrouble", () => {
  it("passes a clean foursome", () => {
    expect(groupTrouble(["a", "b", "c", "d"], { rosterIds: roster })).toBeNull();
  });

  it("passes a threesome — a short group is a draw, not a fault", () => {
    expect(groupTrouble(["a", "b", "c"], { rosterIds: roster })).toBeNull();
  });

  // The reported failure: the scoring screen holding the whole field.
  it("catches a group carrying more than four", () => {
    expect(groupTrouble(roster, { rosterIds: roster })).toMatchObject({ code: "oversized" });
  });

  it("catches the same player listed twice", () => {
    expect(groupTrouble(["a", "b", "a"], { rosterIds: roster })).toMatchObject({ code: "duplicate", pids: ["a"] });
  });

  it("catches a player who is not on the roster", () => {
    expect(groupTrouble(["a", "zz"], { rosterIds: roster })).toMatchObject({ code: "unknown", pids: ["zz"] });
  });

  it("skips the roster check when the roster has not loaded", () => {
    expect(groupTrouble(["a", "zz"], { rosterIds: [] })).toBeNull();
  });

  it("catches a player drawn in two groups", () => {
    const t = groupTrouble(["a", "b"], { rosterIds: roster, otherGroups: [["b", "c"]] });
    expect(t).toMatchObject({ code: "shared", pids: ["b"] });
  });

  it("reports an empty group", () => {
    expect(groupTrouble([], { rosterIds: roster })).toMatchObject({ code: "empty" });
    expect(groupTrouble(null)).toMatchObject({ code: "empty" });
  });

  it("reports the worst problem first", () => {
    // Five players AND a repeat: the size is the thing to say.
    expect(groupTrouble(["a", "b", "c", "d", "a"], { rosterIds: roster })).toMatchObject({ code: "oversized" });
  });
});

describe("roundTrouble", () => {
  const groups = [["a", "b", "c", "d"], ["e", "f", "g", "h"]];

  it("reports a clean round as fine", () => {
    const r = roundTrouble({ groups, teeTimes: ["8:00 AM", "8:08 AM"], rosterIds: roster });
    expect(r).toMatchObject({ hasDraw: true, groupCount: 2 });
    expect(r.broken).toEqual([]);
    expect(r.missingTeeTimes).toEqual([]);
  });

  it("reports no draw at all", () => {
    expect(roundTrouble({ groups: [], rosterIds: roster })).toMatchObject({ hasDraw: false, groupCount: 0 });
    expect(roundTrouble({ groups: [[], []], rosterIds: roster })).toMatchObject({ hasDraw: false });
  });

  it("names every broken group with its index in the stored draw", () => {
    const r = roundTrouble({ groups: [["a", "b"], roster], rosterIds: roster });
    expect(r.broken).toHaveLength(2);          // group 2 oversized, group 1 shares its players with it
    expect(r.broken.map(b => b.index)).toEqual([0, 1]);
    expect(r.broken[1].trouble.code).toBe("oversized");
  });

  it("reports missing tee times by stored index, not by position among drawn groups", () => {
    // An empty slot at index 0 is what the pairings editor leaves behind while
    // a director is still filling groups in — the times stay aligned to it.
    const r = roundTrouble({ groups: [[], ["a", "b"], ["c", "d"]], teeTimes: ["", "", "8:16 AM"], rosterIds: roster });
    expect(r.missingTeeTimes).toEqual([1]);
  });

  it("counts a blank string tee time as missing", () => {
    const r = roundTrouble({ groups, teeTimes: ["8:00 AM", "   "], rosterIds: roster });
    expect(r.missingTeeTimes).toEqual([1]);
  });
});

describe("blocksScoring", () => {
  it("stops a card that cannot be a card", () => {
    expect(blocksScoring({ code: "oversized" })).toBe(true);
    expect(blocksScoring({ code: "duplicate" })).toBe(true);
    expect(blocksScoring({ code: "empty" })).toBe(true);
  });

  // A group standing on a tee box does not get stranded over a stale draw:
  // a departed player renders no row, and a player drawn twice still has one
  // set of scores, since hole data is keyed by player and round.
  it("lets a stale draw through", () => {
    expect(blocksScoring({ code: "unknown" })).toBe(false);
    expect(blocksScoring({ code: "shared" })).toBe(false);
  });

  it("is false for no trouble at all", () => {
    expect(blocksScoring(null)).toBe(false);
    expect(blocksScoring(undefined)).toBe(false);
  });
});

describe("describeTrouble", () => {
  const nameOf = (pid) => ({ a: "Aaron", b: "Bob", c: "Carl" })[pid] || pid;

  it("says how many are in an oversized group", () => {
    expect(describeTrouble(groupTrouble(roster, { rosterIds: roster }), nameOf))
      .toContain(`${roster.length} players`);
  });

  it("names the player drawn twice", () => {
    expect(describeTrouble({ code: "shared", pids: ["a"] }, nameOf)).toContain("Aaron");
  });

  it("lists several names readably", () => {
    expect(describeTrouble({ code: "shared", pids: ["a", "b", "c"] }, nameOf))
      .toContain("Aaron, Bob and Carl");
  });

  it("is empty for no trouble", () => {
    expect(describeTrouble(null)).toBe("");
  });

  it("keeps GROUP_MAX and the message in step", () => {
    expect(describeTrouble({ code: "oversized", pids: ["a", "b", "c", "d", "e"] }))
      .toContain(String(GROUP_MAX));
  });
});
