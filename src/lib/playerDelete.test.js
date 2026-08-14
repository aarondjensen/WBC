import { describe, it, expect } from "vitest";
import { deleteVerdict, deletionLines, editionLabel } from "./playerDelete";

describe("deleteVerdict", () => {
  it("allows a player with no record and no other roster", () => {
    const v = deleteVerdict({ historyName: null, otherEditions: [] });
    expect(v.allowed).toBe(true);
    expect(v.warnings).toEqual([]);
  });

  // The rule the whole module exists for.
  it("refuses anybody in the record books", () => {
    const v = deleteVerdict({ historyName: "Aaron J", otherEditions: [] });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("career");
    expect(v.why).toContain("Aaron J");
    expect(v.why).toContain("inactive");
  });

  // A career beats every other consideration — it is checked first so the
  // refusal names the right reason.
  it("refuses a career even when nothing else is in the way", () => {
    expect(deleteVerdict({ historyName: "Matt V", otherEditions: [], scoredHoles: 0 }).reason).toBe("career");
  });

  it("refuses somebody still on another edition's roster", () => {
    const v = deleteVerdict({ historyName: null, otherEditions: ["wbc_2026"] });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("other-edition");
    expect(v.why).toContain("2026");
  });

  // Not being able to check is not permission — same posture as deleteEdition.
  it("refuses when the other-edition check could not run", () => {
    const v = deleteVerdict({ historyName: null, otherEditions: null });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("unreadable");
  });

  it("names the scores that go with them", () => {
    const v = deleteVerdict({ otherEditions: [], scoredHoles: 18 });
    expect(v.allowed).toBe(true);
    expect(v.warnings.join(" ")).toContain("18 scored holes");
  });

  it("singularizes one hole", () => {
    expect(deleteVerdict({ otherEditions: [], scoredHoles: 1 }).warnings.join(" "))
      .toContain("1 scored hole in");
  });

  it("warns about a bound sign-in without refusing", () => {
    const v = deleteVerdict({ otherEditions: [], claimed: true });
    expect(v.allowed).toBe(true);
    expect(v.warnings.join(" ")).toContain("signed in");
  });
});

describe("editionLabel", () => {
  it("says a year as a year and the sandbox as the demo", () => {
    expect(editionLabel("wbc_2026")).toBe("2026");
    expect(editionLabel("wbc_demo")).toBe("the demo");
    expect(editionLabel("")).toBe("another edition");
  });
});

describe("deletionLines", () => {
  it("inventories what goes and points at the softer action", () => {
    const text = deletionLines({
      name: "Test One",
      warnings: ["1 scored hole in this edition goes with them."],
    }).join("\n");
    expect(text).toContain("Test One");
    expect(text).toContain("roster row");
    expect(text).toContain("1 scored hole");
    expect(text).toContain("Move to inactive");
  });
});
