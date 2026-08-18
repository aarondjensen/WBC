/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the first-login ask actually appear, and do both buttons work?
// ══════════════════════════════════════════════════════════════════
//
// The mount test every screen gets — and it matters here because this is the
// first thing a new player sees on their first login. A ReferenceError in it
// is a player who cannot get past a modal to the tournament.
//
// The behaviour it checks past the mount is the one thing this component is
// FOR: the permission request comes out of the button press. See the file for
// why an ask that fires from an effect is silently ignored on iOS.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { NotificationPrompt } from "./NotificationPrompt";

afterEach(cleanup);

describe("NotificationPrompt", () => {
  it("appears, and says what will be sent", () => {
    render(h(NotificationPrompt, { onEnable: () => {}, onDismiss: () => {} }));
    expect(screen.getByText("Turn on notifications?")).toBeTruthy();
    expect(screen.getByText(/tee time and your group/i)).toBeTruthy();
  });

  it("asks for permission only when the button is pressed", async () => {
    const onEnable = vi.fn().mockResolvedValue(undefined);
    render(h(NotificationPrompt, { onEnable, onDismiss: () => {} }));
    expect(onEnable).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Turn on notifications"));
    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it("hands Not now back to the caller, which is what records the ask", () => {
    const onDismiss = vi.fn();
    render(h(NotificationPrompt, { onEnable: () => {}, onDismiss }));
    fireEvent.click(screen.getByText("Not now"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // The browser's own sheet is modal and slow; a second tap while it is up
  // would queue a second request behind it.
  it("goes quiet while the browser's own sheet is up", async () => {
    let release;
    const onEnable = vi.fn(() => new Promise(r => { release = r; }));
    render(h(NotificationPrompt, { onEnable, onDismiss: () => {} }));
    fireEvent.click(screen.getByText("Turn on notifications"));
    expect(screen.getByText("Turning on…")).toBeTruthy();
    fireEvent.click(screen.getByText("Turning on…"));
    expect(onEnable).toHaveBeenCalledTimes(1);
    release();
  });
});
