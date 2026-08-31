// ══════════════════════════════════════════════════════════════════
//  The four collections that are read rather than subscribed
// ══════════════════════════════════════════════════════════════════
//
// These shapes were written twice — once for the mount load, once for
// pull-to-refresh — and the copies disagreed. That is the thing worth pinning
// here: not that a course comes back with its tees, but that it comes back
// with the SAME tees whichever door asked for it.
import { describe, it, expect } from "vitest";
import { registryRows, roundRows, courseIdsOf, stitchCourses, mergeCourses } from "./staticData";

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

  // The field lib/playerScope filters on. Dropped here, a sandbox player would
  // read as a career record and show up in every edition again.
  it("carries the owning edition, and defaults it to none", () => {
    expect(registryRows([{ id: "p1", edition_id: "wbc_demo" }])[0].edition_id).toBe("wbc_demo");
    expect(registryRows([{ id: "p1" }])[0].edition_id).toBeNull();
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

  // The bug this closes: the scramble's course is on no round, so it was never
  // fetched, and every phone but the director's showed "No course set for the
  // scramble" over a course that had been set.
  it("asks for the scramble's course too, which no round points at", () => {
    expect(courseIdsOf([{ round_number: 1, course_id: "treetops" }], ["timber_ridge"]))
      .toEqual(["treetops", "timber_ridge"]);
  });

  it("does not ask twice when the scramble is played on a round's course", () => {
    expect(courseIdsOf([{ round_number: 1, course_id: "treetops" }], ["treetops"])).toEqual(["treetops"]);
  });

  it("ignores a scramble with no course picked", () => {
    expect(courseIdsOf([{ round_number: 1, course_id: "treetops" }], [null])).toEqual(["treetops"]);
    expect(courseIdsOf([], [null])).toEqual([]);
  });

  // A scramble on a course and no rounds set up yet is still a course to
  // fetch — the early return that used to sit in front of this in App.jsx
  // meant a scramble-first edition never asked for one.
  it("asks for the scramble's course with no rounds at all", () => {
    expect(courseIdsOf([], ["timber_ridge"])).toEqual(["timber_ridge"]);
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

describe("mergeCourses", () => {
  // The scramble's course is not on any round, so it is fetched on its own
  // and folded into a list that has already been built. Twice, in practice:
  // once off this phone's cache and again off the server.
  it("adds a course the list does not hold", () => {
    const out = mergeCourses([{ id: "a", name: "Augusta" }], [{ id: "s", name: "Scramble Hills" }]);
    expect(out.map(c => c.id)).toEqual(["a", "s"]);
  });

  it("replaces rather than duplicates when the same course arrives again", () => {
    const cached = [{ id: "s", name: "Scramble Hills", hole_pars: [] }];
    const fromServer = [{ id: "s", name: "Scramble Hills", hole_pars: [4, 3, 5] }];
    const out = mergeCourses(mergeCourses([], cached), fromServer);
    expect(out).toHaveLength(1);
    expect(out[0].hole_pars).toEqual([4, 3, 5]);
  });

  it("leaves the rounds' own courses alone", () => {
    const list = [{ id: "a", name: "Augusta" }, { id: "b", name: "Bethpage" }];
    expect(mergeCourses(list, [{ id: "s", name: "Scramble Hills" }]).slice(0, 2)).toEqual(list);
  });

  it("ignores a row with no id and survives empty arguments", () => {
    expect(mergeCourses([{ id: "a" }], [{ name: "nameless" }])).toEqual([{ id: "a" }]);
    expect(mergeCourses()).toEqual([]);
  });
});
