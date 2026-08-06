import { describe, it, expect } from "vitest";
import {
  playerIdFor, historyCourseId, isHistoryCourseId, bestFitIndex,
  editionDocFor, stateDocFor, rosterDocFor, courseDocFor, roundDocFor,
  teeDocFor, holeDocFor, buildEdition, countDocs,
} from "./historyImport";

describe("playerIdFor", () => {
  it("derives the same id the app derives when a director adds a player", () => {
    expect(playerIdFor("Aaron J")).toBe("aaron_j");
    expect(playerIdFor("Brian K")).toBe("brian_k");
  });
  it("is stable against stray whitespace and case", () => {
    expect(playerIdFor("  AARON   J  ")).toBe("aaron_j");
  });
  it("is empty for nothing, so a blank row can be skipped rather than written", () => {
    expect(playerIdFor(undefined)).toBe("");
    expect(playerIdFor("  ")).toBe("");
  });
});

describe("historyCourseId", () => {
  it("scopes a course to its year, so a re-rated course is two documents", () => {
    expect(historyCourseId(2013, 4, "FOREST DUNES")).toBe("hist_2013_r4_forest_dunes");
    expect(historyCourseId(2019, 4, "FOREST DUNES")).toBe("hist_2019_r4_forest_dunes");
  });
  // 2016 played CALDERONE twice off different tees. Keyed on the name alone
  // those were one document and round 3 inherited round 4's rating.
  it("separates the same course played twice in one year", () => {
    expect(historyCourseId(2016, 3, "CALDERONE"))
      .not.toBe(historyCourseId(2016, 4, "CALDERONE"));
  });
  it("survives punctuation without leaving stray underscores", () => {
    expect(historyCourseId(2015, 1, "Gull Lake West")).toBe("hist_2015_r1_gull_lake_west");
    expect(historyCourseId(2016, 2, "  Stonehedge — South!  ")).toBe("hist_2016_r2_stonehedge_south");
  });
  it("is recognisable, which is what keeps the old courses out of the picker", () => {
    expect(isHistoryCourseId(historyCourseId(2015, 1, "Yarrow"))).toBe(true);
    expect(isHistoryCourseId("treetops_masterpiece")).toBe(false);
    expect(isHistoryCourseId(undefined)).toBe(false);
  });
});

describe("bestFitIndex", () => {
  // A year whose handicaps varied by course is the modern model, so an index
  // exists that reproduces it exactly.
  it("finds the exact index when the record follows the modern model", () => {
    const hi = 12.4;
    const calc = (s, r, p) => Math.round(hi * (s / 113) + (r - p));
    const rounds = [
      { slope: 128, rating: 71.9, par: 72, courseHandicap: calc(128, 71.9, 72) },
      { slope: 139, rating: 72.2, par: 72, courseHandicap: calc(139, 72.2, 72) },
      { slope: 124, rating: 69.1, par: 71, courseHandicap: calc(124, 69.1, 71) },
    ];
    const fit = bestFitIndex(rounds);
    expect(fit.exact).toBe(true);
    expect(fit.worstError).toBe(0);
    // NOT `toBeCloseTo(hi)`: calcCH rounds, so a band of indices reproduces the
    // same handicaps exactly and 12.3 is as correct an answer as 12.4. What
    // matters is that the index it returns REPRODUCES the record — assert that,
    // not that it recovered the particular seed.
    for (const r of rounds) {
      expect(Math.round(fit.index * (r.slope / 113) + (r.rating - r.par))).toBe(r.courseHandicap);
    }
  });

  // A flat year cannot be reproduced — that is the finding this module is built
  // around, and the fit must REPORT it rather than pretend.
  it("reports the error on a flat year instead of pretending it fits", () => {
    const rounds = [
      { slope: 143, rating: 72.8, par: 73, courseHandicap: 13 },
      { slope: 144, rating: 74.4, par: 72, courseHandicap: 13 },
      { slope: 130, rating: 71.4, par: 72, courseHandicap: 13 },
      { slope: 139, rating: 72.4, par: 72, courseHandicap: 13 },
    ];
    const fit = bestFitIndex(rounds);
    expect(fit.exact).toBe(false);
    expect(fit.worstError).toBeGreaterThanOrEqual(1);
  });

  it("returns null when there is nothing to fit", () => {
    expect(bestFitIndex([])).toBeNull();
    expect(bestFitIndex([{ slope: null, rating: null, par: null, courseHandicap: null }])).toBeNull();
  });

  it("ignores unusable rows rather than being derailed by one", () => {
    const hi = 8;
    const good = { slope: 130, rating: 71, par: 72, courseHandicap: Math.round(hi * (130 / 113) + (71 - 72)) };
    expect(bestFitIndex([good, { slope: NaN, rating: 71, par: 72, courseHandicap: 9 }]).exact).toBe(true);
  });

  it("lands on a tenth, not on a float that merely looks like one", () => {
    const fit = bestFitIndex([{ slope: 130, rating: 71, par: 72, courseHandicap: 9 }]);
    expect(Number.isInteger(Math.round(fit.index * 10))).toBe(true);
    expect(fit.index).toBe(Math.round(fit.index * 10) / 10);
  });
});

describe("document shapes", () => {
  it("an edition row carries no status — the lifecycle derives it", () => {
    const d = editionDocFor({ year: 2015, name: "WBC 2015", champion: "Brian K" });
    expect(d.id).toBe("wbc_2015");
    expect(d.year).toBe(2015);
    expect(d).not.toHaveProperty("status");
    expect(d.champion).toBe("Brian K");
    expect(d.created_from).toBeNull();
  });

  it("a three-round year says three, and closes all three", () => {
    const s = stateDocFor({ year: 2022, rounds: 3 });
    expect(s.id).toBe("ts_wbc_2022");
    expect(s.meta.rounds).toBe(3);
    expect(s.finalized_rounds).toEqual({ 1: true, 2: true, 3: true });
  });

  it("a finished four-round year closes all four", () => {
    expect(stateDocFor({ year: 2024, rounds: 4 }).finalized_rounds)
      .toEqual({ 1: true, 2: true, 3: true, 4: true });
  });

  it("roster, round, tee and hole ids match the app's own id scheme", () => {
    expect(rosterDocFor({ year: 2015, playerId: "aaron_j", handicapIndex: 9.4 }).id)
      .toBe("tp_2015_aaron_j");
    expect(roundDocFor({ year: 2015, round: 2, courseName: "Yarrow" }).id)
      .toBe("tr_2015_r2");
    expect(roundDocFor({ year: 2015, round: 2, courseName: "Yarrow" }).course_id)
      .toBe("hist_2015_r2_yarrow");
    expect(teeDocFor({ year: 2015, round: 2, playerId: "aaron_j", courseHandicap: 11 }).id)
      .toBe("ta_2015_r2_aaron_j");
    // hole is one-based in the source; the id is one-based too, off a
    // zero-based index — matching holeDataToRow in App.jsx.
    expect(holeDocFor({ year: 2015, round: 2, playerId: "aaron_j", hole: 4, gross: 5, courseName: "Yarrow" }).id)
      .toBe("hs_2015_r2_aaron_j_h4");
  });

  it("stores the recorded course handicap, including a scratch 0", () => {
    expect(teeDocFor({ year: 2015, round: 1, playerId: "x", courseHandicap: 0 }).course_handicap).toBe(0);
    expect(teeDocFor({ year: 2015, round: 1, playerId: "x", courseHandicap: 14 }).course_handicap).toBe(14);
  });

  it("omits the handicap entirely when there isn't one, rather than writing a fake 0", () => {
    const d = teeDocFor({ year: 2015, round: 1, playerId: "x", courseHandicap: NaN });
    expect(d).not.toHaveProperty("course_handicap");
  });

  it("a course carries the rating in force that year, and one tee to fall back on", () => {
    const c = courseDocFor({
      year: 2013, round: 4, name: "FOREST DUNES", rating: 72.4, slope: 139, par: 72,
      holePars: [4, 5, 3], holeHandicaps: [1, 2, 3],
    });
    expect(c.id).toBe("hist_2013_r4_forest_dunes");
    expect(c.rating).toBe(72.4);
    expect(c.tee_boxes).toHaveLength(1);
    expect(c.tee_boxes[0]).toMatchObject({ rating: 72.4, slope: 139, par: 72 });
    expect(c.hole_pars).toEqual([4, 5, 3]);
  });
});

describe("buildEdition", () => {
  const tournament = { year: 2015, num_rounds: 2, champion: "Aaron J" };
  const courses = [
    { round: 1, course: "Yarrow", rating: 70.2, slope: 124, par: 72, hole_pars: Array(18).fill(4), hole_handicaps: Array.from({ length: 18 }, (_, i) => i + 1) },
    { round: 2, course: "Bedford Valley", rating: 69.3, slope: 135, par: 72, hole_pars: Array(18).fill(4), hole_handicaps: Array.from({ length: 18 }, (_, i) => i + 1) },
  ];
  const rounds = [
    { round: 1, player: "Aaron J", course_handicap: 11 },
    { round: 2, player: "Aaron J", course_handicap: 11 },
    { round: 1, player: "Brian K", course_handicap: 14 },
    { round: 2, player: "Brian K", course_handicap: 14 },
  ];
  const holes = [
    { round: 1, player: "Aaron J", hole: 1, gross: 5 },
    { round: 1, player: "Aaron J", hole: 2, gross: 4 },
    { round: 2, player: "Brian K", hole: 1, gross: 6 },
  ];

  it("produces every collection an edition is made of", () => {
    const e = buildEdition({ tournament, rounds, courses, holes });
    expect(e.editionId).toBe("wbc_2015");
    expect(e.wbc_editions).toHaveLength(1);
    expect(e.tournament_state).toHaveLength(1);
    expect(e.tournament_players).toHaveLength(2);
    expect(e.courses).toHaveLength(2);
    expect(e.tournament_rounds).toHaveLength(2);
    expect(e.tee_assignments).toHaveLength(4);
    expect(e.hole_scores).toHaveLength(3);
    expect(countDocs(e)).toBe(15);
  });

  it("every hole points at the course that round was played on", () => {
    const e = buildEdition({ tournament, rounds, courses, holes });
    const r2 = e.hole_scores.find(h => h.round_number === 2);
    expect(r2.course_id).toBe("hist_2015_r2_bedford_valley");
    expect(e.hole_scores.every(h => h.tournament_id === "wbc_2015")).toBe(true);
  });

  it("drops holes with no gross, so an unplayed hole is absent not zero", () => {
    const e = buildEdition({
      tournament, rounds, courses,
      holes: [...holes, { round: 1, player: "Aaron J", hole: 3, gross: null },
                        { round: 1, player: "Aaron J", hole: 4, gross: 0 }],
    });
    expect(e.hole_scores).toHaveLength(3);
  });

  it("gives a scoreless year an edition and a roster and no holes", () => {
    const e = buildEdition({
      tournament: { year: 2010, num_rounds: 4, champion: "Scott R" },
      rounds: [{ round: null, player: "Scott R", course_handicap: null }],
      courses: [], holes: [],
    });
    expect(e.wbc_editions).toHaveLength(1);
    expect(e.tournament_players).toHaveLength(1);
    expect(e.hole_scores).toHaveLength(0);
    expect(e.tee_assignments).toHaveLength(0);   // no round to hang one on
  });

  it("ids are unique across every collection it emits", () => {
    const e = buildEdition({ tournament, rounds, courses, holes });
    for (const k of ["tournament_players", "courses", "tournament_rounds", "tee_assignments", "hole_scores"]) {
      const ids = e[k].map(d => d.id);
      expect(new Set(ids).size, `${k} has a duplicate id`).toBe(ids.length);
    }
  });

  it("two different years never collide on a document id", () => {
    const a = buildEdition({ tournament, rounds, courses, holes });
    const b = buildEdition({ tournament: { ...tournament, year: 2016 }, rounds, courses, holes });
    const idsA = new Set(a.hole_scores.map(d => d.id));
    expect(b.hole_scores.some(d => idsA.has(d.id))).toBe(false);
  });
});
