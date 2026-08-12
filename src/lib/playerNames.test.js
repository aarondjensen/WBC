import { describe, it, expect } from "vitest";
import { toDisplayName, legacyDisplayName, displayNameFor, shortName, fullName, splitName } from "./playerNames";

describe("toDisplayName", () => {
  it("is a first initial and the surname", () => {
    expect(toDisplayName("Aaron", "Jensen")).toBe("A Jensen");
  });

  it("capitalises the initial whatever was typed", () => {
    expect(toDisplayName("dave", "Smith")).toBe("D Smith");
  });

  // The id a new player files under is this string with the spaces knocked
  // out, so a full stop here would sit in the middle of it.
  it("puts no full stop after the initial", () => {
    expect(toDisplayName("Aaron", "Jensen")).not.toContain(".");
  });

  it("is just the first name when there is no last", () => {
    expect(toDisplayName("Finn", "")).toBe("Finn");
    expect(toDisplayName("Finn", null)).toBe("Finn");
  });

  it("is just the surname when there is no first", () => {
    expect(toDisplayName("", "Walsh")).toBe("Walsh");
  });

  it("trims what somebody typed with a stray space", () => {
    expect(toDisplayName("  Aaron ", " Jensen ")).toBe("A Jensen");
  });

  it("is empty for nothing at all", () => {
    expect(toDisplayName("", "")).toBe("");
    expect(toDisplayName(null, null)).toBe("");
  });
});

describe("legacyDisplayName", () => {
  it("is the convention the app used before — first name, last initial", () => {
    expect(legacyDisplayName("Aaron", "Jensen")).toBe("Aaron J");
    expect(legacyDisplayName("Dave", "smith")).toBe("Dave S");
    expect(legacyDisplayName("Finn", "")).toBe("Finn");
  });
});

describe("displayNameFor", () => {
  it("restyles a name the app generated under the old convention", () => {
    expect(displayNameFor({ name: "Aaron J", first_name: "Aaron", last_name: "Jensen" })).toBe("A Jensen");
  });

  it("leaves a name already in the current convention alone", () => {
    expect(displayNameFor({ name: "A Jensen", first_name: "Aaron", last_name: "Jensen" })).toBe("A Jensen");
  });

  // A director typed this one. A name somebody chose outranks a format.
  it("keeps a nickname", () => {
    expect(displayNameFor({ name: "Chief", first_name: "Aaron", last_name: "Jensen" })).toBe("Chief");
  });

  // The roster predates first/last being stored. There is nothing to restyle
  // one of these from, and its name is the only record of who it is.
  it("prints a legacy row exactly as stored", () => {
    expect(displayNameFor({ name: "Aaron J" })).toBe("Aaron J");
    expect(displayNameFor({ name: "Van Der Berg" })).toBe("Van Der Berg");
  });

  it("builds one from the parts when there is no stored name at all", () => {
    expect(displayNameFor({ first_name: "Aaron", last_name: "Jensen" })).toBe("A Jensen");
  });

  it("is empty for nothing at all", () => {
    expect(displayNameFor({})).toBe("");
    expect(displayNameFor(null)).toBe("");
  });
});

describe("shortName", () => {
  it("is the surname", () => {
    expect(shortName({ name: "A Jensen", first_name: "Aaron", last_name: "Jensen" })).toBe("Jensen");
    expect(shortName({ name: "A Jensen" })).toBe("Jensen");
  });

  // A legacy row's surname is a single initial, which tells nobody anything.
  it("is the first name when the surname is only an initial", () => {
    expect(shortName({ name: "Aaron J" })).toBe("Aaron");
    expect(shortName({ name: "Aaron J." })).toBe("Aaron");
    expect(shortName({ first_name: "Dave", last_name: "S" })).toBe("Dave");
  });

  it("copes with a one-word name", () => {
    expect(shortName({ name: "Chief" })).toBe("Chief");
  });

  it("is empty for nothing at all", () => {
    expect(shortName({})).toBe("");
    expect(shortName(null)).toBe("");
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
    expect(fullName({ name: "A Jensen", first_name: "Aaron", last_name: "Jensen" })).toBe("Aaron Jensen");
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
    expect(toDisplayName(first, last)).toBe("A Jensen");
  });
});
