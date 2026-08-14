/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Popup — the ways it can be dismissed, and the ones it must refuse
// ══════════════════════════════════════════════════════════════════
//
// ESC-to-close arrived late here. Bourbon Cup and MNQ both had it from the
// start; WBC had no Escape handler anywhere in the app, so on a desktop
// browser a popup could only be dismissed by finding its Cancel button or
// clicking the backdrop.
//
// The half worth pinning is the REFUSAL. `dismissOnBackdrop={false}` marks
// the destructive and blocking modals — the withdrawal confirm, the scorecard
// sheet — and it now gates the key handler as well as the backdrop click. A
// regression there does not look like a bug: the popup closes, which is what
// a popup normally does. It just closes on a stray keypress in front of a
// decision somebody was supposed to make deliberately.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { Popup } from "./Popup";

afterEach(cleanup);

const esc = () => fireEvent.keyDown(window, { key: "Escape" });

describe("Popup dismissal", () => {
  it("closes on ESC by default", () => {
    const onClose = vi.fn();
    render(h(Popup, { onClose }, "body"));
    esc();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores ESC when backdrop dismissal is off", () => {
    const onClose = vi.fn();
    render(h(Popup, { onClose, dismissOnBackdrop: false }, "body"));
    esc();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    render(h(Popup, { onClose }, "body"));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  // The listener is on `window`, so an unmounted popup that never removed it
  // would keep closing a modal that is no longer on screen — and with several
  // popups opening over each other during a round, that lands as "the sheet
  // under the one I just closed disappeared too".
  it("stops listening once unmounted", () => {
    const onClose = vi.fn();
    const { unmount } = render(h(Popup, { onClose }, "body"));
    unmount();
    esc();
    expect(onClose).not.toHaveBeenCalled();
  });

  // Marks the subtree for usePullToRefresh, which walks up from the touch
  // target and bails when it crosses one. Nothing in the rendered output says
  // so, which is why removing it would look harmless.
  it("marks the backdrop for the pull-to-refresh walk", () => {
    const { container } = render(h(Popup, { onClose: vi.fn() }, "body"));
    expect(container.querySelector("[data-popup]")).not.toBeNull();
  });
});
