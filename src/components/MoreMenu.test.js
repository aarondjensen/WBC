/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the More menu appear, and with the right rows in it?
// ══════════════════════════════════════════════════════════════════
//
// The same mount question the other screens get, plus the one thing this
// component decides on its own: WHICH rows exist. Two of them are conditional
// and both conditions are about who is holding the phone — Admin for a
// director, Photos for anybody who is not a guest — so a mount test that only
// asked "did it render" would pass with either of them inverted.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { MoreMenu } from "./MoreMenu";

afterEach(cleanup);

const mount = (extra = {}) => render(h(MoreMenu, {
  open: true,
  onClose: vi.fn(),
  onSelect: vi.fn(),
  isDirector: false,
  isGuest: false,
  adminFlag: false,
  notifFlag: false,
  activeYear: 2026,
  ...extra,
}));

describe("MoreMenu", () => {
  it("renders nothing while closed", () => {
    mount({ open: false });
    expect(document.body.textContent).toBe("");
  });

  it("shows a player the tournament and their account", () => {
    mount();
    expect(screen.getByText("Players")).toBeTruthy();
    expect(screen.getByText("Tournaments")).toBeTruthy();
    expect(screen.getByText("2026")).toBeTruthy();
    expect(screen.getByText("Photos")).toBeTruthy();
    expect(screen.getByText("My Account")).toBeTruthy();
    expect(screen.queryByText("Admin Settings")).toBeNull();
  });

  it("gives a director the console", () => {
    mount({ isDirector: true, adminFlag: true });
    expect(screen.getByText("Admin Settings")).toBeTruthy();
  });

  // Director-only for now — setting the game up is the director's job, and
  // once it is running everybody reaches the card from the header button
  // instead of from here.
  it("gives a director the scramble, and nobody else", () => {
    mount({ isDirector: true });
    expect(screen.getByText("Scramble")).toBeTruthy();
    cleanup();
    mount();
    expect(screen.queryByText("Scramble")).toBeNull();
  });

  it("says on the row whether the scramble is running", () => {
    mount({ isDirector: true, scrambleOn: true });
    expect(screen.getByText("ON")).toBeTruthy();
    cleanup();
    mount({ isDirector: true, scrambleOn: false });
    expect(screen.queryByText("ON")).toBeNull();
  });

  // Everything else behind this menu is the tournament — scores, groups,
  // indexes, years. The gallery is the sixteen of them off the course, and a
  // guest is a stranger.
  it("keeps the photo library from a guest", () => {
    mount({ isGuest: true });
    expect(screen.queryByText("Photos")).toBeNull();
    expect(screen.getByText("Players")).toBeTruthy();
    expect(screen.getByText("Tournaments")).toBeTruthy();
  });

  it("reports the row that was tapped and closes behind it", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    mount({ onSelect, onClose });
    fireEvent.click(screen.getByText("Players"));
    expect(onSelect).toHaveBeenCalledWith("players");
    expect(onClose).toHaveBeenCalled();
  });
});
