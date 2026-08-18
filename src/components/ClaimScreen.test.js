/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the claim screen appear, in each state somebody arrives in?
// ══════════════════════════════════════════════════════════════════
//
// The mount half is the usual one. The rest is the way OUT, which is the part
// with a bug in it worth pinning: the roster on this screen belongs to the
// edition the device has open, so a phone left in a past year offers that
// year's field — and a man whose name is not in it has nothing to tap.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";

// The switcher reaches Firestore through lib/editions, and firebase.js
// initializes an app at import time. Neither belongs in a render test.
vi.mock("./EditionSwitcher", () => ({
  EditionSwitcher: ({ open }) => (open ? h("div", null, "TOURNAMENT PICKER") : null),
}));

const { ClaimScreen } = await import("./ClaimScreen");

afterEach(cleanup);

const FIELD = [{ id: "aaron_j", name: "Aaron Jensen" }, { id: "matt_s", name: "Matt Smith" }];

const show = (props = {}) =>
  render(h(ClaimScreen, {
    fbUser: { email: "a@example.com", displayName: "Aaron" },
    candidates: FIELD, onClaim: () => {}, onCancel: () => {}, ...props,
  }));

describe("ClaimScreen", () => {
  it("offers every unclaimed name", () => {
    show();
    expect(screen.getByText("Aaron Jensen")).toBeTruthy();
    expect(screen.getByText("Matt Smith")).toBeTruthy();
  });

  it("says so rather than showing an empty grid when every name is taken", () => {
    show({ candidates: [] });
    expect(screen.getByText(/already been claimed/)).toBeTruthy();
  });

  it("offers the way to another tournament, and opens the picker", () => {
    show();
    fireEvent.click(screen.getByText("Not your tournament? Switch"));
    expect(screen.getByText("TOURNAMENT PICKER")).toBeTruthy();
  });

  // A frozen year takes no scores from a member, so claiming a name in one
  // binds an account to a tournament it cannot play.
  it("says a frozen tournament is frozen, before anything is tapped", () => {
    show({ locked: true, tournamentName: "WBC 2015" });
    expect(screen.getByText("This tournament is frozen")).toBeTruthy();
    expect(screen.getByText(/WBC 2015 is finished/)).toBeTruthy();
    // One way out, not two: the notice carries it.
    expect(screen.queryByText("Not your tournament? Switch")).toBeNull();
    fireEvent.click(screen.getByText("Choose a tournament"));
    expect(screen.getByText("TOURNAMENT PICKER")).toBeTruthy();
  });

  it("says nothing about freezing in the tournament being played", () => {
    show();
    expect(screen.queryByText("This tournament is frozen")).toBeNull();
  });
});
