import { describe, it, expect } from "vitest";
import { scoreWindow, nudgeUpTarget, nudgeDownTarget, scoreTerm } from "./scoreEntry";

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
  // Mirror of the + fix: par−1 is the Birdie button, so a cold − skips past it.
  it("opens one under the bottom of the row when nothing is entered", () => {
    expect(nudgeDownTarget(0, 4)).toBe(2);
    expect(nudgeDownTarget(undefined, 5)).toBe(3);
  });

  it("steps down from a score already entered", () => {
    expect(nudgeDownTarget(6, 4)).toBe(5);
  });

  it("never goes below 1", () => {
    expect(nudgeDownTarget(1, 3)).toBe(1);
    // A cold − on a par 3 wants par−2, which is a 0. It gives an ace instead.
    expect(nudgeDownTarget(0, 3)).toBe(1);
  });
});

describe("scoreTerm", () => {
  it("names the ordinary ones", () => {
    expect(scoreTerm(3, 4)).toBe("birdie");
    expect(scoreTerm(4, 4)).toBe("par");
    expect(scoreTerm(5, 4)).toBe("bogey");
    expect(scoreTerm(6, 4)).toBe("double bogey");
    expect(scoreTerm(7, 4)).toBe("triple bogey");
  });

  it("names the good ones", () => {
    expect(scoreTerm(3, 5)).toBe("eagle");
    expect(scoreTerm(2, 5)).toBe("albatross");
  });

  // The case the printed labels get wrong, which is why they are dropped on a
  // shifted window and this exists instead.
  it("calls a one a hole in one, not a birdie on a par 3", () => {
    expect(scoreTerm(1, 3)).toBe("hole in one");
    expect(scoreTerm(1, 4)).toBe("hole in one");
    expect(scoreTerm(1, 5)).toBe("hole in one");
  });

  it("says nothing past a triple, because golf does not", () => {
    expect(scoreTerm(8, 4)).toBe("");
    expect(scoreTerm(12, 4)).toBe("");
  });

  it("says nothing for a hole with no score or no par", () => {
    expect(scoreTerm(0, 4)).toBe("");
    expect(scoreTerm(null, 4)).toBe("");
    expect(scoreTerm(4, 0)).toBe("");
    expect(scoreTerm(99, 4)).toBe("");
  });
});
