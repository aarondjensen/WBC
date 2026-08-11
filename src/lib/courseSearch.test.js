import { describe, it, expect, vi, afterEach } from "vitest";
import { stateMatches, decodeHtml, hasRealSlope, parseRapidAPI, fetchCourseTees } from "./courseSearch";

describe("stateMatches", () => {
  it("matches a state to itself", () => {
    expect(stateMatches("MI", "MI")).toBe(true);
    expect(stateMatches("mi", "MI")).toBe(true);
    expect(stateMatches(" MI ", "MI")).toBe(true);
  });

  // The API and the director disagree about this, which is why it exists.
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

// 113 is the slope of an AVERAGE course, and it is what the API emits when it
// does not know. A tournament played off handicaps derived from it is wrong in
// a way no screen would show.
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

// The course editor's "refetch tees" button. It talks to one endpoint now —
// there used to be a second, and the merge between them is what this replaced.
describe("fetchCourseTees", () => {
  afterEach(() => vi.unstubAllGlobals());

  const holes = (yards) => Array.from({ length: 18 }, (_, i) => ({
    Par: 4, Handicap: i + 1, tees: { teeBox1: { yards, color: "Blue" }, teeBox2: { yards: yards - 30, color: "White" } },
  }));
  const course = (name, slopeRating = 130) => ({
    _id: name, name, city: "Gaylord", state: "MI",
    courseRating: 72.4, slopeRating, scorecard: holes(380),
  });

  // Records what got asked for, so the "asks once" case can prove it.
  const stubFetch = (body, { ok = true } = {}) => {
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      calls.push(url);
      return { ok, json: async () => body };
    }));
    return calls;
  };

  it("returns the tees of the course it found", async () => {
    stubFetch([course("Treetops Resort")]);
    const tees = await fetchCourseTees("Treetops Resort", "MI");
    expect(tees.map(t => t.name).sort()).toEqual(["Blue", "White"]);
  });

  // The whole point of deleting the other API: one course database, one call.
  it("asks the one endpoint, once, with the state", async () => {
    const calls = stubFetch([course("Treetops Resort")]);
    await fetchCourseTees("Treetops Resort", "MI");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/api/courses2?search=Treetops%20Resort");
    expect(calls[0]).toContain("state=MI");
  });

  // Both are real courses with real numbers, and the near-miss comes back
  // first — the exact name still has to win.
  it("prefers an exact name match over a course that merely contains it", async () => {
    stubFetch([course("Treetops Resort North", 141), course("Treetops Resort", 130)]);
    const tees = await fetchCourseTees("Treetops Resort", "MI");
    expect(tees[0].slope).toBe(130);
  });

  // A row of 113s is the API saying it does not know. Given the choice between
  // two matches, take the one carrying a real number.
  it("prefers real ratings over a row of 113s", async () => {
    stubFetch([course("Treetops Resort", 113), course("Treetops Resort", 128)]);
    const tees = await fetchCourseTees("Treetops Resort", "MI");
    expect(tees[0].slope).toBe(128);
  });

  // Nothing to show beats a wrong tee list: the editor keeps what it has.
  it("is empty when the query is too short to search on", async () => {
    const calls = stubFetch([course("Treetops Resort")]);
    expect(await fetchCourseTees("T", "MI")).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("is empty when the endpoint errors or returns nothing", async () => {
    stubFetch([], { ok: false });
    expect(await fetchCourseTees("Treetops Resort", "MI")).toEqual([]);
    stubFetch([]);
    expect(await fetchCourseTees("Treetops Resort", "MI")).toEqual([]);
  });

  it("is empty rather than throwing when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(fetchCourseTees("Treetops Resort", "MI")).resolves.toEqual([]);
  });
});
