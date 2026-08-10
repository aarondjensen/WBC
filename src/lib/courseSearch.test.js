import { describe, it, expect } from "vitest";
import { stateMatches, decodeHtml, hasRealSlope, parseRapidAPI, parseGolfCourseAPI } from "./courseSearch";

describe("stateMatches", () => {
  it("matches a state to itself", () => {
    expect(stateMatches("MI", "MI")).toBe(true);
    expect(stateMatches("mi", "MI")).toBe(true);
    expect(stateMatches(" MI ", "MI")).toBe(true);
  });

  // The two APIs disagree about this, which is the only reason it exists.
  it("matches an abbreviation to a full name, both ways", () => {
    expect(stateMatches("Michigan", "MI")).toBe(true);
    expect(stateMatches("MI", "Michigan")).toBe(true);
  });

  // The bug this was extracted with: three hand-written cases, two of which
  // tested the same thing, and the missing one dropped every course.
  it("matches when the filter is a full name and the course an abbreviation", () => {
    expect(stateMatches("MI", "Michigan")).toBe(true);
    expect(stateMatches("mi", "michigan")).toBe(true);
  });

  it("refuses a different state", () => {
    expect(stateMatches("OH", "MI")).toBe(false);
    expect(stateMatches("Ohio", "MI")).toBe(false);
  });

  // No filter means the director did not narrow the search, so everything is
  // a match — not nothing.
  it("matches everything when there is no filter", () => {
    expect(stateMatches("MI", "")).toBe(true);
    expect(stateMatches("MI", null)).toBe(true);
    expect(stateMatches(null, "MI")).toBe(true);
  });
});

describe("decodeHtml", () => {
  it("unescapes what the APIs send", () => {
    expect(decodeHtml("Bear&#39;s Club")).toBe("Bear's Club");
    expect(decodeHtml("Tom &amp; Jerry GC")).toBe("Tom & Jerry GC");
    expect(decodeHtml("&quot;The Links&quot;")).toBe('"The Links"');
  });

  it("leaves a plain name alone", () => {
    expect(decodeHtml("Treetops")).toBe("Treetops");
  });

  it("survives nothing at all", () => {
    expect(decodeHtml("")).toBe("");
    expect(decodeHtml(null)).toBe(null);
  });
});

// 113 is the slope of an AVERAGE course, and it is what these APIs emit when
// they do not know. A tournament played off handicaps derived from it is wrong
// in a way no screen would show.
describe("hasRealSlope", () => {
  it("is false when every tee is the 113 placeholder", () => {
    expect(hasRealSlope({ tee_boxes: [{ slope: 113 }, { slope: 113 }] })).toBe(false);
    expect(hasRealSlope({ tee_boxes: [{ slope: "113" }] })).toBe(false);
  });

  it("is true as soon as one tee carries a real number", () => {
    expect(hasRealSlope({ tee_boxes: [{ slope: 113 }, { slope: 130 }] })).toBe(true);
  });

  it("falls back to the course's own slope when there are no tees", () => {
    expect(hasRealSlope({ tee_boxes: [], slope: 128 })).toBe(true);
    expect(hasRealSlope({ tee_boxes: [], slope: 113 })).toBe(false);
    expect(hasRealSlope({ tee_boxes: [] })).toBe(false);
  });
});

describe("parseRapidAPI", () => {
  // The real shape: state at the top level, a `scorecard` array of holes, and
  // tee boxes hanging off each hole under arbitrary keys (teeBox1, teeBox2…).
  const hole = (par, hcp, yards) => ({
    Par: par, Handicap: hcp,
    tees: { teeBox1: { yards, color: "Blue" }, teeBox2: { yards: yards - 30, color: "White" } },
  });
  const raw = [{
    _id: "abc", name: "Treetops Resort", city: "Gaylord", state: "MI",
    courseRating: 72.4, slopeRating: 130,
    scorecard: Array.from({ length: 18 }, (_, i) => hole(4, i + 1, 380)),
  }];

  it("reads a course out of the response", () => {
    const [c] = parseRapidAPI(raw, "MI");
    expect(c.name).toBe("Treetops Resort");
    expect(c.city).toBe("Gaylord");
  });

  it("carries the course's real ratings onto every tee", () => {
    const [c] = parseRapidAPI(raw, "MI");
    expect(c.slope).toBe(130);
    expect(c.rating).toBe(72.4);
    expect(c.tee_boxes.every(t => t.slope === 130)).toBe(true);
  });

  it("finds a tee box per key, across all the holes", () => {
    const [c] = parseRapidAPI(raw, "MI");
    expect(c.tee_boxes).toHaveLength(2);
    expect(c.tee_boxes.map(t => t.name).sort()).toEqual(["Blue", "White"]);
  });

  it("keeps the hole tables, which is what a scorecard needs", () => {
    const [c] = parseRapidAPI(raw, "MI");
    expect(c.hole_pars).toHaveLength(18);
    expect(c.hole_handicaps).toHaveLength(18);
    expect(c.par).toBe(72);
  });

  it("totals the yardage per tee", () => {
    const [c] = parseRapidAPI(raw, "MI");
    expect(c.tee_boxes.find(t => t.name === "Blue").yardage).toBe(18 * 380);
  });

  it("unescapes the course name", () => {
    const [c] = parseRapidAPI([{ ...raw[0], name: "Bear&#39;s Club" }], "MI");
    expect(c.name).toBe("Bear's Club");
  });

  it("filters by state, whichever way either side is spelled", () => {
    expect(parseRapidAPI(raw, "OH")).toHaveLength(0);
    expect(parseRapidAPI(raw, "MI")).toHaveLength(1);
    // The case that used to drop every course: filter typed as a full name,
    // course returned as an abbreviation.
    expect(parseRapidAPI(raw, "Michigan")).toHaveLength(1);
    expect(parseRapidAPI([{ ...raw[0], state: "Michigan" }], "MI")).toHaveLength(1);
  });

  it("gives a course with no scorecard a default tee rather than none", () => {
    const [c] = parseRapidAPI([{ ...raw[0], scorecard: [] }], "MI");
    expect(c.tee_boxes).toHaveLength(1);
    expect(c.tee_boxes[0].name).toBe("Default");
    expect(c.par).toBe(72);
  });

  it("survives an empty response", () => {
    expect(parseRapidAPI([], "MI")).toEqual([]);
  });
});

describe("parseGolfCourseAPI", () => {
  // The other API's shape: tees grouped by male/female, each with its own
  // rating and slope, and holes hanging off the tee rather than the course.
  const raw = {
    courses: [{
      id: 9, course_name: "Yarrow G&CC", location: { state: "Michigan" },
      tees: {
        male: [{
          tee_name: "White", course_rating: 70.2, slope_rating: 124, par_total: 72, total_yards: 6100,
          holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, handicap: i + 1, yardage: 340 })),
        }],
      },
    }],
  };

  it("reads a course out of the other API's shape", () => {
    const [c] = parseGolfCourseAPI(raw);
    expect(c.name).toMatch(/Yarrow/);
    expect(c.tee_boxes).toHaveLength(1);
  });

  it("takes rating and slope from the TEE, which is where this API puts them", () => {
    const [c] = parseGolfCourseAPI(raw);
    expect(c.tee_boxes[0].slope).toBe(124);
    expect(c.tee_boxes[0].rating).toBe(70.2);
  });

  it("falls back to the women's tees when there are no men's", () => {
    const womensOnly = { courses: [{ ...raw.courses[0], tees: { male: [], female: raw.courses[0].tees.male } }] };
    expect(parseGolfCourseAPI(womensOnly)[0].tee_boxes).toHaveLength(1);
  });

  it("accepts a bare array as well as a wrapped one", () => {
    expect(parseGolfCourseAPI(raw.courses)).toHaveLength(1);
  });

  it("survives an empty or malformed response", () => {
    expect(parseGolfCourseAPI({ courses: [] })).toEqual([]);
    expect(parseGolfCourseAPI([])).toEqual([]);
  });
});
