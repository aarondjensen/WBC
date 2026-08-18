import { describe, it, expect } from "vitest";
import { bootEdition, bootEditionMoved, defaultEdition, liveEdition, WEB_DEFAULT_EDITION_ID } from "./editionHome";

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

describe("defaultEdition", () => {
  it("is the tournament being played, by default", () => {
    expect(defaultEdition()).toBe(WEB_DEFAULT_EDITION_ID);
    expect(defaultEdition({ override: "" })).toBe(WEB_DEFAULT_EDITION_ID);
    expect(defaultEdition({ override: "   " })).toBe(WEB_DEFAULT_EDITION_ID);
  });

  // So next year is a deploy setting rather than a code change, and so a
  // store build could be pointed at the sandbox.
  it("takes the deploy's override when there is one", () => {
    expect(defaultEdition({ override: "wbc_2027" })).toBe("wbc_2027");
    expect(defaultEdition({ override: " wbc_demo " })).toBe("wbc_demo");
  });
});

describe("liveEdition", () => {
  it("trusts the constant on a device that has never loaded the list", () => {
    expect(liveEdition([], HOME)).toBe(HOME);
    expect(liveEdition(null, HOME)).toBe(HOME);
  });

  it("confirms the home edition against a list that has loaded", () => {
    expect(liveEdition([{ id: "wbc_2014" }, { id: HOME }], HOME)).toBe(HOME);
  });

  // Nothing to point at is not the same as pointing anywhere — the banner
  // draws nothing rather than offering a year that does not exist.
  it("answers with nothing when the home edition is not in the list", () => {
    expect(liveEdition([{ id: "wbc_2014" }, { id: "wbc_2015" }], HOME)).toBe("");
  });
});
