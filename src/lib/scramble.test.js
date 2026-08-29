import { describe, it, expect } from "vitest";
import {
  SCRAMBLE_TEAMS, SCRAMBLE_TEAM_KEYS, teamLabel,
  mergeScramble, teamOf, assignToTeam, unassignedIds, teamPlayers, autoSplit,
  teamLine, scrambleStandings, scrambleBlockers, canTurnOn, scrambleLive, emptyTeams,
} from "./scramble";

const PARS = [4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5];

const PLAYERS = [
  { id: "a", name: "Aaron", handicap_index: 12 },
  { id: "b", name: "Bo", handicap_index: 4 },
  { id: "c", name: "Cal", handicap_index: 8 },
  { id: "d", name: "Dan", handicap_index: 20 },
];

// A team's card: n holes at `s` strokes, filed the way the store keeps them.
const card = (n, s = 4) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, s]));

describe("the three teams", () => {
  it("is OG, YG and NG, in that order", () => {
    expect(SCRAMBLE_TEAMS.map(t => t.label)).toEqual(["OG", "YG", "NG"]);
    expect(SCRAMBLE_TEAM_KEYS).toEqual(["og", "yg", "ng"]);
  });

  it("labels a key, and says nothing for one it does not know", () => {
    expect(teamLabel("yg")).toBe("YG");
    expect(teamLabel("zz")).toBe("");
  });
});

describe("mergeScramble", () => {
  it("answers a full shape for an edition that has never opened the screen", () => {
    const sc = mergeScramble(undefined);
    expect(sc.on).toBe(false);
    expect(sc.courseId).toBe(null);
    SCRAMBLE_TEAMS.forEach(t => {
      expect(sc.teams[t.key]).toEqual([]);
      expect(sc.scores[t.key]).toEqual({});
    });
  });

  it("keeps what is there and fills in what is not", () => {
    const sc = mergeScramble({ on: true, courseId: "c1", teams: { og: ["a"] }, scores: { og: { 0: 4 } } });
    expect(sc.on).toBe(true);
    expect(sc.teams.og).toEqual(["a"]);
    expect(sc.teams.yg).toEqual([]);
    expect(sc.scores.og).toEqual({ 0: 4 });
    expect(sc.scores.ng).toEqual({});
  });

  it("refuses a roster that is not a list", () => {
    expect(mergeScramble({ teams: { og: { 0: "a" } } }).teams.og).toEqual([]);
  });

  it("copies the cards rather than aliasing the document", () => {
    const raw = { scores: { og: { 0: 4 } } };
    mergeScramble(raw).scores.og[1] = 5;
    expect(raw.scores.og).toEqual({ 0: 4 });
  });
});

describe("assignToTeam", () => {
  it("places a player on a team", () => {
    expect(assignToTeam({}, "a", "yg").yg).toEqual(["a"]);
  });

  it("takes them off the team they were on — nobody plays two balls", () => {
    const teams = assignToTeam(assignToTeam({}, "a", "og"), "a", "ng");
    expect(teams.og).toEqual([]);
    expect(teams.ng).toEqual(["a"]);
    expect(teamOf({ teams }, "a")).toBe("ng");
  });

  it("removes them from every team when the team is null", () => {
    const teams = assignToTeam(assignToTeam({}, "a", "og"), "a", null);
    expect(SCRAMBLE_TEAM_KEYS.every(k => teams[k].length === 0)).toBe(true);
    expect(teamOf({ teams }, "a")).toBe(null);
  });

  it("leaves the rosters it was given alone", () => {
    const teams = { og: ["a"], yg: [], ng: [] };
    assignToTeam(teams, "a", "yg");
    expect(teams.og).toEqual(["a"]);
  });
});

describe("the pool", () => {
  it("is everybody nobody has placed", () => {
    const teams = assignToTeam({}, "b", "og");
    expect(unassignedIds(PLAYERS, teams)).toEqual(["a", "c", "d"]);
  });

  it("reads a roster back as players, in the order they were placed", () => {
    const teams = assignToTeam(assignToTeam({}, "d", "og"), "a", "og");
    expect(teamPlayers(teams, "og", PLAYERS).map(p => p.name)).toEqual(["Dan", "Aaron"]);
  });

  it("drops an id with no player behind it rather than rendering a blank", () => {
    expect(teamPlayers({ og: ["a", "ghost"] }, "og", PLAYERS)).toHaveLength(1);
  });
});

describe("autoSplit", () => {
  it("snakes down the handicap order rather than dealing the lowest three to one team", () => {
    const teams = autoSplit(PLAYERS);
    // b(4) c(8) a(12) across, then d(20) back onto the team that took a(12).
    expect(teams.og).toEqual(["b"]);
    expect(teams.yg).toEqual(["c"]);
    expect(teams.ng).toEqual(["a", "d"]);
  });

  it("gives every player exactly one team", () => {
    const teams = autoSplit(PLAYERS);
    expect(SCRAMBLE_TEAM_KEYS.flatMap(k => teams[k]).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("deals the same roster the same way twice", () => {
    expect(autoSplit(PLAYERS)).toEqual(autoSplit(PLAYERS));
  });

  it("handles an empty roster", () => {
    expect(autoSplit([])).toEqual({ og: [], yg: [], ng: [] });
  });
});

describe("teamLine", () => {
  it("counts only holes with a ball in", () => {
    const line = teamLine(card(3, 4), PARS);
    expect(line.thru).toBe(3);
    expect(line.total).toBe(12);
    // 4 + 3 + 5 = 12 of par, so level.
    expect(line.toPar).toBe(0);
    expect(line.complete).toBe(false);
  });

  it("reads under par as a negative", () => {
    expect(teamLine({ 0: 3, 1: 2 }, PARS).toPar).toBe(-2);
  });

  it("says nothing at all about a team that has not teed off", () => {
    const line = teamLine({}, PARS);
    expect(line.thru).toBe(0);
    expect(line.toPar).toBe(null);
  });

  it("ignores a zero, which is how a cleared hole is filed", () => {
    expect(teamLine({ 0: 0, 1: 3 }, PARS).thru).toBe(1);
  });

  it("is complete on eighteen", () => {
    expect(teamLine(card(18, 4), PARS).complete).toBe(true);
  });

  it("survives a course with no pars on it yet", () => {
    expect(teamLine(card(2, 4), undefined).total).toBe(8);
  });
});

describe("scrambleStandings", () => {
  it("ranks by score, and puts a team that has not started last", () => {
    const rows = scrambleStandings({
      scores: { og: card(3, 4), yg: card(3, 3), ng: {} },
    }, PARS);
    expect(rows.map(r => r.key)).toEqual(["yg", "og", "ng"]);
  });

  it("breaks a tie on to-par by who has played more of it", () => {
    const rows = scrambleStandings({
      scores: { og: { 0: 4 }, yg: { 0: 4, 1: 3 }, ng: {} },
    }, PARS);
    expect(rows[0].key).toBe("yg");
  });

  it("names every team even before a ball is struck", () => {
    expect(scrambleStandings(undefined, PARS).map(r => r.label).sort()).toEqual(["NG", "OG", "YG"]);
  });
});

describe("what stops the switch", () => {
  const ready = { courseId: "c1", teams: assignToTeam(assignToTeam({}, "a", "og"), "b", "yg") };

  it("wants a course", () => {
    expect(canTurnOn({ teams: ready.teams })).toBe(false);
    expect(scrambleBlockers({ teams: ready.teams }, PLAYERS)[0]).toMatch(/course/i);
  });

  it("wants two teams with somebody on them", () => {
    const oneTeam = { courseId: "c1", teams: assignToTeam({}, "a", "og") };
    expect(canTurnOn(oneTeam)).toBe(false);
    expect(scrambleBlockers(oneTeam, PLAYERS).some(s => /two teams/i.test(s))).toBe(true);
  });

  it("clears once both are answered", () => {
    expect(canTurnOn(ready)).toBe(true);
  });

  it("still names the players left out, without blocking on them", () => {
    const lines = scrambleBlockers(ready, PLAYERS);
    expect(canTurnOn(ready)).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("2 players are not on a team yet.");
  });

  it("counts one leftover player in the singular", () => {
    const teams = assignToTeam(assignToTeam(assignToTeam({}, "a", "og"), "b", "yg"), "c", "ng");
    expect(scrambleBlockers({ courseId: "c1", teams }, PLAYERS)[0]).toBe("1 player is not on a team yet.");
  });

  it("says nothing when everybody is placed", () => {
    expect(scrambleBlockers({ courseId: "c1", teams: autoSplit(PLAYERS) }, PLAYERS)).toEqual([]);
  });
});

describe("scrambleLive", () => {
  it("is off for an edition that has never had one", () => {
    expect(scrambleLive(undefined)).toBe(false);
  });

  it("is on once the switch is thrown", () => {
    expect(scrambleLive({ on: true })).toBe(true);
  });
});

describe("emptyTeams", () => {
  it("is three empty rosters, and a fresh object each time", () => {
    const a = emptyTeams();
    expect(a).toEqual({ og: [], yg: [], ng: [] });
    a.og.push("x");
    expect(emptyTeams().og).toEqual([]);
  });
});
