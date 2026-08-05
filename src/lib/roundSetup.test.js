import { describe, it, expect } from "vitest";
import { groupTrouble, roundTrouble, describeTrouble, blocksScoring, missingTees, describeMissingTees, GROUP_MAX } from "./roundSetup";

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

describe("missingTees", () => {
  const players = [{ id: "a", name: "Aaron" }, { id: "b", name: "Bob" }, { id: "c", name: "Carl" }];
  const teeNames = ["BLUE", "WHITE"];

  it("passes a round where everybody has a tee", () => {
    expect(missingTees({ players, assignments: { a: "BLUE", b: "BLUE", c: "WHITE" }, teeNames })).toEqual([]);
  });

  it("names the player with no assignment at all", () => {
    expect(missingTees({ players, assignments: { a: "BLUE", c: "BLUE" }, teeNames })).toEqual(["b"]);
  });

  it("treats a blank assignment as missing", () => {
    expect(missingTees({ players, assignments: { a: "BLUE", b: "", c: "  " }, teeNames })).toEqual(["b", "c"]);
  });

  // The failure this exists to catch a second time: a tee name that no longer
  // resolves — a tee renamed or deleted in the course editor — falls through to
  // the course rating in exactly the way a blank does.
  it("counts an assignment naming a tee the course does not have", () => {
    expect(missingTees({ players, assignments: { a: "BLUE", b: "GOLD", c: "WHITE" }, teeNames })).toEqual(["b"]);
  });

  it("does not second-guess the name when the course has no tee boxes", () => {
    expect(missingTees({ players, assignments: { a: "BLUE", b: "GOLD", c: "WHITE" }, teeNames: [] })).toEqual([]);
  });

  it("reports everybody when nothing has been assigned", () => {
    expect(missingTees({ players, teeNames })).toEqual(["a", "b", "c"]);
  });

  it("keeps roster order, not object order", () => {
    expect(missingTees({ players, assignments: { c: "BLUE" }, teeNames })).toEqual(["a", "b"]);
  });

  it("has nothing to say about an empty field", () => {
    expect(missingTees({ players: [], assignments: {}, teeNames })).toEqual([]);
    expect(missingTees()).toEqual([]);
  });
});

describe("roundTrouble — tee assignments", () => {
  const players = [{ id: "a" }, { id: "b" }];
  const groups = [["a", "b"]];

  it("reports them alongside the draw's other faults", () => {
    const r = roundTrouble({
      groups, teeTimes: ["8:00 AM"], rosterIds: ["a", "b"],
      players, teeAssignments: { a: "BLUE" }, teeNames: ["BLUE"],
    });
    expect(r.missingTees).toEqual(["b"]);
    expect(r.broken).toEqual([]);
  });

  it("is empty when every player has a tee", () => {
    const r = roundTrouble({
      groups, teeTimes: ["8:00 AM"], rosterIds: ["a", "b"],
      players, teeAssignments: { a: "BLUE", b: "BLUE" }, teeNames: ["BLUE"],
    });
    expect(r.missingTees).toEqual([]);
  });

  // Callers that predate this — the scoring screen's setup check — pass no
  // players, and must not start reporting a field of nobody as unassigned.
  it("says nothing when the caller does not pass a field", () => {
    expect(roundTrouble({ groups, teeTimes: ["8:00 AM"], rosterIds: ["a", "b"] }).missingTees).toEqual([]);
  });
});

describe("describeMissingTees", () => {
  const nameOf = (pid) => ({ a: "Aaron", b: "Bob", c: "Carl" })[pid] || pid;

  it("names the player and says what to do about it", () => {
    const s = describeMissingTees(["a"], nameOf);
    expect(s).toContain("Aaron");
    expect(s).toContain("has no tee");
    expect(s).toContain("Assign a tee");
  });

  // There is no default tee and leaving it unassigned is not an option, so the
  // warning must not describe what the app would fall back to — spelling that
  // out reads as offering it.
  it("does not describe a fallback", () => {
    const s = describeMissingTees(["a", "b"], nameOf);
    expect(s).not.toMatch(/default|rating|longest/i);
  });

  it("lists several names readably", () => {
    expect(describeMissingTees(["a", "b", "c"], nameOf)).toContain("Aaron, Bob and Carl");
  });

  it("agrees its verb with the number of players", () => {
    expect(describeMissingTees(["a"], nameOf)).toContain("has no tee");
    expect(describeMissingTees(["a", "b"], nameOf)).toContain("have no tee");
  });

  it("is empty when nobody is missing one", () => {
    expect(describeMissingTees([], nameOf)).toBe("");
  });
});
