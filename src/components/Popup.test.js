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
// The half worth pinning is the REFUSAL. `noBackdropClose` marks the
// destructive and blocking modals — the withdrawal confirm, the scorecard
// sheet — and it gates the key handler as well as the backdrop click. A
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
    render(h(Popup, { onClose, noBackdropClose: true }, "body"));
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

// ── The shape shared with Bourbon Cup and MnQ ──
// WBC's card used to be its own scroller, which is fine right up until
// something is positioned against it. These pin the frame/scroller split that
// makes the first `showClose` here safe rather than a bug — the other two apps
// both shipped that bug before fixing it this way.
describe("Popup structure", () => {
  it("scrolls on an inner element, not on the card holding the ✕", () => {
    const { container } = render(h(Popup, { onClose: vi.fn(), showClose: true }, "body"));
    const card = container.querySelector("[data-popup] > div");
    const scroller = card.querySelector(":scope > div");
    expect(card.style.overflow).toBe("hidden");
    expect(scroller.style.overflowY).toBe("auto");
    // The ✕ is a SIBLING that precedes the scroller, not a descendant of it.
    expect(card.querySelector("[aria-label='Close']")).not.toBeNull();
    expect(scroller.querySelector("[aria-label='Close']")).toBeNull();
  });

  it("only renders a close button when asked", () => {
    const { container } = render(h(Popup, { onClose: vi.fn() }, "body"));
    expect(container.querySelector("[aria-label='Close']")).toBeNull();
  });

  // Callers pass display:flex to size their CHILDREN, and the children now sit
  // a level deeper than they did — that flex context has to travel with them.
  it("carries a caller's flex layout through to where the children are", () => {
    const { container } = render(h(Popup, {
      onClose: vi.fn(), innerStyle: { display: "flex", flexDirection: "column" },
    }, "body"));
    const card = container.querySelector("[data-popup] > div");
    const scroller = card.querySelector(":scope > div");
    expect(scroller.style.flexDirection).toBe("column");
  });

  // The rest of innerStyle dresses the frame. A background that moved inward
  // would leave the card showing the default surface around a different colour.
  it("leaves a caller's background on the frame", () => {
    const { container } = render(h(Popup, {
      onClose: vi.fn(), innerStyle: { background: "rgb(1, 2, 3)" },
    }, "body"));
    const card = container.querySelector("[data-popup] > div");
    expect(card.style.background).toBe("rgb(1, 2, 3)");
  });

  // Numbers are a deliberate ladder here (a confirm at 4000 over an admin sheet
  // at 3000); the names are for new code that just wants "above the page".
  it("takes a z-index as a number or as a name", () => {
    const num = render(h(Popup, { onClose: vi.fn(), zIndex: 3200 }, "x"));
    expect(num.container.querySelector("[data-popup]").style.zIndex).toBe("3200");
    cleanup();
    const named = render(h(Popup, { onClose: vi.fn(), zIndex: "modal" }, "x"));
    expect(named.container.querySelector("[data-popup]").style.zIndex).toBe("900");
  });
});
