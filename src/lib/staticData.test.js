// ══════════════════════════════════════════════════════════════════
//  The four collections that are read rather than subscribed
// ══════════════════════════════════════════════════════════════════
//
// These shapes were written twice — once for the mount load, once for
// pull-to-refresh — and the copies disagreed. That is the thing worth pinning
// here: not that a course comes back with its tees, but that it comes back
// with the SAME tees whichever door asked for it.
import { describe, it, expect } from "vitest";
import { registryRows, roundRows, courseIdsOf, stitchCourses } from "./staticData";

describe("registryRows", () => {
  it("applies the display convention, not whatever is stored", () => {
    // The bug this closes: pull-to-refresh rebuilt the registry straight off
    // `name`, so a pull on the 1st tee turned every player's name back into
    // the one the app generated years ago.
    // "Aaron J" is a name the app generated years ago; the surname comes from
    // data/surnames.js and the convention displays it as "A Jensen".
    const [row] = registryRows([{ id: "aaron_j", name: "Aaron J" }]);
    expect(row.name).toBe("A Jensen");
    // The stored id is identity — sixteen years of history hang off it — and
    // is never restyled.
    expect(row.id).toBe("aaron_j");
  });

  it("keeps a name a director typed", () => {
    const [row] = registryRows([{ id: "p1", name: "Tiger", first_name: "Tiger", last_name: "Woods" }]);
    expect(row.first_name).toBe("Tiger");
    expect(row.last_name).toBe("Woods");
  });

  it("sorts by the displayed name, so the list reads the way it looks", () => {
    const rows = registryRows([
      { id: "z", name: "Zack", first_name: "Zack", last_name: "Zimmer" },
      { id: "a", name: "Adam", first_name: "Adam", last_name: "Ames" },
    ]);
    expect(rows.map(r => r.id)).toEqual(["a", "z"]);
  });

  it("carries a hand-set index override, and defaults it to none", () => {
    expect(registryRows([{ id: "p1", index_override: 8.4 }])[0].index_override).toBe(8.4);
    expect(registryRows([{ id: "p1" }])[0].index_override).toBeNull();
  });

  it("drops a row with no id and survives being handed nothing", () => {
    expect(registryRows([{ name: "Nobody" }])).toEqual([]);
    expect(registryRows()).toEqual([]);
    expect(registryRows(null)).toEqual([]);
  });
});

describe("roundRows", () => {
  it("puts the rounds in order and keeps only what the app stores", () => {
    const rows = roundRows([
      { id: "r2", tournament_id: "wbc_2026", round_number: 2, course_id: "c2", stray: "x" },
      { id: "r1", tournament_id: "wbc_2026", round_number: 1, course_id: "c1" },
    ]);
    expect(rows.map(r => r.round_number)).toEqual([1, 2]);
    expect(rows[0]).toEqual({ id: "r1", tournament_id: "wbc_2026", round_number: 1, course_id: "c1" });
    expect(rows[1]).not.toHaveProperty("stray");
  });

  it("drops a row with no round number rather than sorting it somewhere", () => {
    expect(roundRows([{ id: "r1" }, { id: "r2", round_number: 1 }]).map(r => r.id)).toEqual(["r2"]);
    expect(roundRows()).toEqual([]);
  });
});

describe("courseIdsOf", () => {
  it("asks for each course once, however many rounds play it", () => {
    // Two rounds on the same course is one course to fetch, and a `where in`
    // clause has limited room to spend on repeats.
    expect(courseIdsOf([
      { round_number: 1, course_id: "treetops" },
      { round_number: 2, course_id: "treetops" },
      { round_number: 3, course_id: "gull_lake" },
    ])).toEqual(["treetops", "gull_lake"]);
  });

  it("skips a round with no course picked yet", () => {
    expect(courseIdsOf([{ round_number: 1 }, { round_number: 2, course_id: "c1" }])).toEqual(["c1"]);
    expect(courseIdsOf()).toEqual([]);
  });
});

describe("stitchCourses", () => {
  const COURSES = [{ id: "c1", name: "Treetops" }, { id: "c2", name: "Gull Lake View" }];
  const TEES = [
    { course_id: "c1", name: "Blue", color: "#3b82f6", rating: "72.4", slope: "130", par: "72", yardage: "6800" },
    { course_id: "c2", name: "White", color: "#fff", rating: 70.1, slope: 124, par: 71, yardage: 6200 },
  ];

  it("gives each course only its own tees", () => {
    const [c1, c2] = stitchCourses(COURSES, TEES);
    expect(c1.tee_boxes.map(t => t.name)).toEqual(["Blue"]);
    expect(c2.tee_boxes.map(t => t.name)).toEqual(["White"]);
  });

  it("parses a rating and slope written as text", () => {
    // A round is scored against the TEE's numbers, and Firestore holds some of
    // them as strings — one of the two old copies parsed them and the other
    // handed the string straight to the handicap math.
    const [c1] = stitchCourses(COURSES, TEES);
    expect(c1.tee_boxes[0]).toMatchObject({ rating: 72.4, slope: 130, par: 72, yardage: 6800 });
  });

  it("leaves a number nobody recorded missing rather than NaN", () => {
    const [c] = stitchCourses([{ id: "c1" }], [{ course_id: "c1", name: "Blue" }]);
    expect(c.tee_boxes[0].slope).toBeUndefined();
    expect(c.tee_boxes[0].rating).toBeUndefined();
  });

  it("gives a course with no tees an empty list, not a missing one", () => {
    expect(stitchCourses([{ id: "c9", name: "Nowhere" }], TEES)[0].tee_boxes).toEqual([]);
    expect(stitchCourses(COURSES, null)[0].tee_boxes).toEqual([]);
  });

  it("defaults the hole tables, which every scorecard indexes into", () => {
    const [c] = stitchCourses([{ id: "c1" }], []);
    expect(c.hole_pars).toEqual([]);
    expect(c.hole_handicaps).toEqual([]);
  });

  it("survives being handed nothing", () => {
    expect(stitchCourses()).toEqual([]);
  });
});
