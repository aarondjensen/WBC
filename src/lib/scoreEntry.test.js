import { describe, it, expect } from "vitest";
import { scoreWindow, nudgeUpTarget, nudgeDownTarget } from "./scoreEntry";

describe("scoreWindow", () => {
  it("shows par−1 through par+3 with nothing entered", () => {
    expect(scoreWindow(4, 0)).toEqual({ btns: [3, 4, 5, 6, 7], shifted: false });
  });

  it("leaves the window alone for a score already on it", () => {
    expect(scoreWindow(4, 7)).toEqual({ btns: [3, 4, 5, 6, 7], shifted: false });
    expect(scoreWindow(4, 3)).toEqual({ btns: [3, 4, 5, 6, 7], shifted: false });
  });

  it("slides up to keep a big number on screen", () => {
    expect(scoreWindow(4, 9)).toEqual({ btns: [5, 6, 7, 8, 9], shifted: true });
  });

  it("slides down for an ace on a par 3", () => {
    expect(scoreWindow(3, 1)).toEqual({ btns: [1, 2, 3, 4, 5], shifted: true });
  });
});

describe("nudgeUpTarget", () => {
  // The point of the fix: a cold + is for numbers the row does NOT show, so
  // it skips past the buttons the player could have tapped instead.
  it("opens one past the top of the row when nothing is entered", () => {
    expect(nudgeUpTarget(0, 4)).toBe(8);
    expect(nudgeUpTarget(undefined, 3)).toBe(7);
    expect(nudgeUpTarget(0, 5)).toBe(9);
  });

  it("steps up from a score already entered", () => {
    expect(nudgeUpTarget(5, 4)).toBe(6);
    expect(nudgeUpTarget(9, 4)).toBe(10);
  });
});

describe("nudgeDownTarget", () => {
  it("opens on a birdie from cold", () => {
    expect(nudgeDownTarget(0, 4)).toBe(3);
    expect(nudgeDownTarget(undefined, 3)).toBe(2);
  });

  it("steps down from a score already entered", () => {
    expect(nudgeDownTarget(6, 4)).toBe(5);
  });

  it("never goes below 1", () => {
    expect(nudgeDownTarget(1, 3)).toBe(1);
  });
});
