import { describe, it, expect } from "vitest";
import { toDisplayName, fullName, splitName } from "./playerNames";

describe("toDisplayName", () => {
  it("is first name plus a last initial", () => {
    expect(toDisplayName("Aaron", "Jensen")).toBe("Aaron J");
  });

  it("capitalises the initial whatever was typed", () => {
    expect(toDisplayName("Dave", "smith")).toBe("Dave S");
  });

  it("is just the first name when there is no last", () => {
    expect(toDisplayName("Finn", "")).toBe("Finn");
    expect(toDisplayName("Finn", null)).toBe("Finn");
  });

  it("trims what somebody typed with a stray space", () => {
    expect(toDisplayName("  Aaron ", " Jensen ")).toBe("Aaron J");
  });

  it("is empty for nothing at all", () => {
    expect(toDisplayName("", "")).toBe("");
    expect(toDisplayName(null, null)).toBe("");
  });
});

describe("fullName", () => {
  it("joins the stored parts", () => {
    expect(fullName({ first_name: "Aaron", last_name: "Jensen" })).toBe("Aaron Jensen");
  });

  it("copes with only one part stored", () => {
    expect(fullName({ first_name: "Finn" })).toBe("Finn");
    expect(fullName({ last_name: "Walsh" })).toBe("Walsh");
  });

  // The roster predates first/last being stored, so a row may only have the
  // display name — and it still has to answer this.
  it("falls back to the display name for a legacy row", () => {
    expect(fullName({ name: "Aaron J" })).toBe("Aaron J");
  });

  it("prefers the parts over the display name when both exist", () => {
    expect(fullName({ name: "Aaron J", first_name: "Aaron", last_name: "Jensen" })).toBe("Aaron Jensen");
  });

  it("is empty for nothing at all", () => {
    expect(fullName({})).toBe("");
    expect(fullName(null)).toBe("");
  });
});

describe("splitName", () => {
  it("returns the stored parts untouched", () => {
    expect(splitName({ first_name: "Aaron", last_name: "Jensen" })).toEqual({ first: "Aaron", last: "Jensen" });
  });

  it("guesses from a display name when there are no parts", () => {
    expect(splitName({ name: "Aaron Jensen" })).toEqual({ first: "Aaron", last: "Jensen" });
  });

  it("puts everything after the first space in the last name", () => {
    expect(splitName({ name: "Van Der Berg" })).toEqual({ first: "Van", last: "Der Berg" });
  });

  it("handles a one-word name", () => {
    expect(splitName({ name: "Finn" })).toEqual({ first: "Finn", last: "" });
  });

  it("is empty for nothing at all", () => {
    expect(splitName({})).toEqual({ first: "", last: "" });
    expect(splitName(null)).toEqual({ first: "", last: "" });
  });

  it("round-trips a name it split, back through toDisplayName", () => {
    const { first, last } = splitName({ name: "Aaron Jensen" });
    expect(toDisplayName(first, last)).toBe("Aaron J");
  });
});
