import { describe, it, expect } from "vitest";
import { bootEdition, bootEditionMoved } from "./editionHome";

const HOME = "wbc_2026";

describe("bootEdition", () => {
  it("opens the live tournament on a device that has never switched", () => {
    expect(bootEdition({ stored: null, home: HOME })).toBe(HOME);
  });

  it("keeps the live tournament when that is what is stored", () => {
    expect(bootEdition({ stored: HOME, home: HOME })).toBe(HOME);
  });

  // The one this file exists for: a player who looked at a past year last
  // week, then opened the app on the first tee.
  it("comes back to the live tournament after a past year was left behind", () => {
    expect(bootEdition({ stored: "wbc_2014", visit: null, home: HOME })).toBe(HOME);
  });

  it("comes back from the sandbox too", () => {
    expect(bootEdition({ stored: "wbc_demo", visit: null, home: HOME })).toBe(HOME);
  });

  // Switching hard-reloads the app, so a visit that did not survive a reload
  // would mean Tournaments could not open a past year at all.
  it("stays in the year just switched to, across the switch's own reload", () => {
    expect(bootEdition({ stored: "wbc_2014", visit: "wbc_2014", home: HOME })).toBe("wbc_2014");
  });

  it("ignores a visit to some OTHER edition than the one stored", () => {
    expect(bootEdition({ stored: "wbc_2014", visit: "wbc_2019", home: HOME })).toBe(HOME);
  });

  it("leaves a director where they left off, so next year can be built", () => {
    expect(bootEdition({ stored: "wbc_2027", visit: null, home: HOME, isDirector: true })).toBe("wbc_2027");
  });

  it("honours the pointer when sessionStorage cannot be read", () => {
    expect(bootEdition({ stored: "wbc_2014", visit: null, home: HOME, sessionKnown: false })).toBe("wbc_2014");
  });

  it("falls back to what is stored when there is no live edition to go to", () => {
    expect(bootEdition({ stored: "wbc_2014", home: "" })).toBe("wbc_2014");
    expect(bootEdition({})).toBe(null);
  });
});

describe("bootEditionMoved", () => {
  it("is true only when the decision differs from the pointer", () => {
    expect(bootEditionMoved("wbc_2014", HOME)).toBe(true);
    expect(bootEditionMoved(HOME, HOME)).toBe(false);
    expect(bootEditionMoved(null, HOME)).toBe(true);
    expect(bootEditionMoved("wbc_2014", null)).toBe(false);
  });
});
