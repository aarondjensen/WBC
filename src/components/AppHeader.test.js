/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the header say where this tournament was played?
// ══════════════════════════════════════════════════════════════════
//
// One job, and it is the one nothing else could catch. lib/editionLocation has
// its own suite for what city a year is in; this checks that the header
// actually ASKS it — the bug was not a wrong table, it was a literal
// "Gaylord, MI" sitting in this component as the fallback for every edition
// that had no location of its own. Which is all sixteen imported ones.
//
// firebase.js initializes a Firebase app at import time, so it is mocked
// rather than imported: getTournamentYear() is the only thing this component
// wants from it, and standing it up for real would mean a network client in a
// unit test.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement as h } from "react";

let year = 2026;
let activeId = "wbc_2026";
vi.mock("../firebase", () => ({
  getTournamentYear: () => year,
  getActiveTournamentId: () => activeId,
}));

import { AppHeader } from "./AppHeader";

afterEach(() => { cleanup(); year = 2026; activeId = "wbc_2026"; });

describe("AppHeader", () => {
  it("shows the director's location when the edition has one", () => {
    render(h(AppHeader, { location: "Gaylord, MI" }));
    expect(screen.getByText("2026 · Gaylord, MI")).toBeTruthy();
  });

  it("falls back to the year's own location, not the current year's", () => {
    // A historical edition carries no meta.location — the import had no city
    // to write. Before this it read "2015 · Gaylord, MI"; 2015 was played at
    // Gull Lake View, three hours south.
    year = 2015;
    render(h(AppHeader, { location: "" }));
    expect(screen.getByText("2015 · Gull Lake View, MI")).toBeTruthy();
  });

  it("gives two historical editions two different locations", () => {
    year = 2021;
    const { unmount } = render(h(AppHeader, {}));
    expect(screen.getByText("2021 · Garland, MI")).toBeTruthy();
    unmount();
    year = 2019;
    render(h(AppHeader, {}));
    expect(screen.getByText("2019 · Tullymore, MI")).toBeTruthy();
  });

  it("prints a long location in full rather than truncating it", () => {
    // 2013 has no home base, so its location is the four courses. The caption
    // wraps to two lines for exactly this — the whole string has to be there.
    year = 2013;
    render(h(AppHeader, {}));
    expect(screen.getByText(
      "2013 · Black Forest / Lochenheath / The Legend / Forest Dunes")).toBeTruthy();
  });

  it("shows the bare year for an edition with no city anywhere", () => {
    year = 2031;
    render(h(AppHeader, { location: "" }));
    expect(screen.getByText("2031")).toBeTruthy();
  });

  it("mounts with the countdown and the right-hand controls", () => {
    render(h(AppHeader, {
      location: "Gaylord, MI",
      countdownAt: Date.now() + 60 * 60 * 1000,
      right: h("button", null, "Account"),
    }));
    expect(screen.getByText("Account")).toBeTruthy();
  });
});

// ── The sandbox, one tap deeper than the picker ────────────────────
// This header is the only thing on screen that names the edition you are in,
// and it names it by YEAR — the tournament's NAME appears nowhere in it. So
// renaming the sandbox in Admin changed nothing, which is how the bug was
// found: the sandbox header read "2026 · Gaylord, MI", identical to the live
// tournament, because editionYear finds no digits in "wbc_demo" and falls back
// to the current year.
//
// The DEMO badge in the Tournaments picker did not help. That is a screen you
// leave; this is the one you stay on.
describe("AppHeader and the sandbox", () => {
  it("says DEMO Sandbox instead of a year", () => {
    activeId = "wbc_demo";
    render(h(AppHeader, { location: "" }));
    expect(screen.getByText("DEMO Sandbox")).toBeTruthy();
  });

  // The location came across in the clone, so without this the sandbox reads
  // "DEMO Sandbox · Gaylord, MI" — which is better, but still dresses a
  // scratch copy in the live tournament's town.
  it("does not borrow the live tournament's town", () => {
    activeId = "wbc_demo";
    render(h(AppHeader, { location: "" }));
    expect(screen.queryByText(/Gaylord/)).toBeNull();
  });

  // A director who has typed a location into the sandbox on purpose still gets
  // it — the fallback is what is suppressed, not the answer.
  it("still honours a location set by hand", () => {
    activeId = "wbc_demo";
    render(h(AppHeader, { location: "Test Course" }));
    expect(screen.getByText("DEMO Sandbox · Test Course")).toBeTruthy();
  });

  it("leaves a real year alone", () => {
    activeId = "wbc_2015";
    year = 2015;
    render(h(AppHeader, { location: "" }));
    expect(screen.getByText("2015 · Gull Lake View, MI")).toBeTruthy();
  });
});
