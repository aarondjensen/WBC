import { describe, it, expect } from "vitest";
import { toDisplayName, legacyDisplayName, displayNameFor, isGeneratedName, withKnownSurname, shortName, fullName, splitName } from "./playerNames";
import { SURNAMES } from "../data/surnames";

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

describe("isGeneratedName", () => {
  it("knows its own work under either convention", () => {
    expect(isGeneratedName("A Jensen", "Aaron", "Jensen")).toBe(true);
    expect(isGeneratedName("Aaron J", "Aaron", "Jensen")).toBe(true);
  });

  it("knows a name a person typed", () => {
    expect(isGeneratedName("Chief", "Aaron", "Jensen")).toBe(false);
    expect(isGeneratedName("Aaron Jensen", "Aaron", "Jensen")).toBe(false);
  });

  it("is false for no name at all", () => {
    expect(isGeneratedName("", "Aaron", "Jensen")).toBe(false);
    expect(isGeneratedName(null, "Aaron", "Jensen")).toBe(false);
  });

  // The bug this exists to stop: a roster name written under the old
  // convention read as hand-chosen, so the editor pre-filled it into the
  // nickname box, where it then outranked the surname the director had just
  // typed. The name never changed and nothing said why.
  it("does not mistake a legacy roster name for a nickname", () => {
    expect(isGeneratedName("Dave S", "Dave", "Smith")).toBe(true);
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
  it("is the first name", () => {
    expect(shortName({ name: "A Jensen", first_name: "Aaron", last_name: "Jensen" })).toBe("Aaron");
    expect(shortName({ name: "Aaron J" })).toBe("Aaron");
  });

  // THE reason it is the first name and not the surname. A group line reading
  // "Vigo, Vigo, Kelley" identifies nobody; this field has three of one and
  // two of the other, and every first name in it is distinct.
  it("tells the three Vigos apart, which a surname cannot", () => {
    const vigos = ["Andy", "Matt", "Steve"].map(f => shortName({ first_name: f, last_name: "Vigo" }));
    expect(new Set(vigos).size).toBe(3);
    expect(vigos).toEqual(["Andy", "Matt", "Steve"]);
  });

  it("falls back to the surname when the first name is only an initial", () => {
    expect(shortName({ name: "A Jensen" })).toBe("Jensen");
    expect(shortName({ first_name: "A", last_name: "Jensen" })).toBe("Jensen");
  });

  it("copes with a one-word name", () => {
    expect(shortName({ name: "Chief" })).toBe("Chief");
  });

  it("is empty for nothing at all", () => {
    expect(shortName({})).toBe("");
    expect(shortName(null)).toBe("");
  });
});

describe("withKnownSurname", () => {
  it("fills in the surname the record never carried", () => {
    expect(withKnownSurname({ id: "aaron_j", name: "Aaron J" }))
      .toMatchObject({ first_name: "Aaron", last_name: "Jensen" });
  });

  // What a director typed beats a file in the repo, always.
  it("leaves a record that knows its own parts alone", () => {
    const row = { id: "aaron_j", name: "Chief", first_name: "Aaron", last_name: "Jensen-Smith" };
    expect(withKnownSurname(row)).toBe(row);
  });

  it("leaves a player it has never heard of alone", () => {
    const row = { id: "gus_p", name: "Gus P" };
    expect(withKnownSurname(row)).toBe(row);
  });

  it("copes with nothing at all", () => {
    expect(withKnownSurname(null)).toBe(null);
  });

  // The whole point, end to end: an id and a legacy name in, a board name out.
  it("carries every man in the field to the new convention", () => {
    const board = Object.keys(SURNAMES).map(id => {
      const legacy = id.split("_");
      const name = `${legacy[0][0].toUpperCase()}${legacy[0].slice(1)} ${legacy[1].toUpperCase()}`;
      return displayNameFor(withKnownSurname({ id, name }));
    });
    expect(board).toContain("A Jensen");
    expect(board).toContain("B Bergeron");
    expect(board).toContain("S Rhoades");
    // A first initial, a space, then a surname of more than one letter.
    board.forEach(n => expect(n).toMatch(/^[A-Z] [A-Z][a-z]+$/));
    // Nobody comes out looking like anybody else.
    expect(new Set(board).size).toBe(board.length);
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
