import { describe, it, expect } from "vitest";
import { dragOffset, dismisses, DISMISS_PX } from "./useSheetDrag";

// The hook itself needs a React renderer, which WBC has no jsdom environment
// for. What the tests can hold is the decision underneath it, which is the
// part that was actually getting the scrolling sheet wrong.

describe("dragOffset — how far the sheet follows the finger", () => {
  it("follows a downward drag one-for-one", () => {
    expect(dragOffset({ startY: 100, currentY: 160, atTop: true })).toBe(60);
  });

  it("ignores an upward drag — the sheet is already on the bottom edge", () => {
    expect(dragOffset({ startY: 100, currentY: 40, atTop: true })).toBe(0);
  });

  // The whole reason this is not MoreMenu's four lines. A drag that began
  // partway down a scrolling sheet is a scroll for its whole length, so the
  // content moves under the finger and the sheet stays put.
  it("stays put when the gesture began mid-scroll", () => {
    expect(dragOffset({ startY: 100, currentY: 300, atTop: false })).toBe(0);
  });

  it("stays put when no gesture is in progress", () => {
    expect(dragOffset({ startY: null, currentY: 300, atTop: true })).toBe(0);
  });

  it("reports no movement for a tap that never travelled", () => {
    expect(dragOffset({ startY: 100, currentY: 100, atTop: true })).toBe(0);
  });
});

describe("dismisses — let go, close or spring back", () => {
  it("closes past the threshold", () => {
    expect(dismisses(DISMISS_PX + 1)).toBe(true);
  });

  // A short drag is someone deciding not to. It springs back rather than
  // closing a sheet they were looking at.
  it("springs back at or under the threshold", () => {
    expect(dismisses(DISMISS_PX)).toBe(false);
    expect(dismisses(12)).toBe(false);
    expect(dismisses(0)).toBe(false);
  });

  it("takes a threshold of its own", () => {
    expect(dismisses(30, 20)).toBe(true);
    expect(dismisses(30, 200)).toBe(false);
  });
});
