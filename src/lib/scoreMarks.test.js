// The convention every scorecard in the app draws from — see scoreMarks.js
// for why it is one function rather than one per screen.
import { describe, it, expect } from "vitest";
import { scoreMarks, scoreCellMetrics, WD_FLOOR, MAX_DOTS } from "./scoreMarks";
import { FS } from "../theme";

describe("scoreMarks", () => {
  it("rings a birdie as a circle and a bogey as a square", () => {
    expect(scoreMarks(3, 4)).toMatchObject({ text: "3", ring: "circle", double: false, tone: "under" });
    expect(scoreMarks(5, 4)).toMatchObject({ text: "5", ring: "square", double: false, tone: "over" });
  });

  it("leaves a par unringed", () => {
    expect(scoreMarks(4, 4)).toMatchObject({ text: "4", ring: null, double: false, tone: "par" });
  });

  it("doubles the ring at two either side of par", () => {
    expect(scoreMarks(2, 4)).toMatchObject({ ring: "circle", double: true });
    expect(scoreMarks(6, 4)).toMatchObject({ ring: "square", double: true });
    // One off par is a single ring on both sides of it.
    expect(scoreMarks(3, 4).double).toBe(false);
    expect(scoreMarks(5, 4).double).toBe(false);
  });

  it("prints a withdrawal as a dash, not as the sentinel it is stored as", () => {
    expect(scoreMarks(WD_FLOOR, 4)).toMatchObject({ text: "—", ring: null });
    expect(scoreMarks(99, 4)).toMatchObject({ text: "—", ring: null });
  });

  it("prints nothing at all for a hole not yet played", () => {
    expect(scoreMarks(0, 4)).toMatchObject({ text: "", ring: null, dots: 0 });
    expect(scoreMarks(undefined, 4)).toMatchObject({ text: "", ring: null });
  });

  // The card is read on the way round, and a stroke over an empty hole is the
  // player being shown where their shots are before they play them.
  it("still marks the strokes on a hole nobody has played yet", () => {
    expect(scoreMarks(0, 4, 1)).toMatchObject({ text: "", ring: null, dots: 1 });
    expect(scoreMarks(undefined, 4, 2).dots).toBe(2);
  });

  it("draws a dot per stroke received, capped", () => {
    expect(scoreMarks(4, 4, 0).dots).toBe(0);
    expect(scoreMarks(4, 4, 1).dots).toBe(1);
    expect(scoreMarks(4, 4, 2).dots).toBe(MAX_DOTS);
    // A hole giving three strokes still only has room for the cap.
    expect(scoreMarks(4, 4, 3).dots).toBe(MAX_DOTS);
  });

  it("draws nothing for a plus handicap, which gives strokes back", () => {
    expect(scoreMarks(4, 4, -1).dots).toBe(0);
  });

  // An imported year can carry a score for a hole whose par never made it in.
  it("still prints the score when the hole has no par", () => {
    expect(scoreMarks(5, 0)).toMatchObject({ text: "5", ring: null, tone: null });
    expect(scoreMarks(5, undefined, 1)).toMatchObject({ text: "5", ring: null, dots: 1 });
  });
});

describe("scoreCellMetrics", () => {
  // The numbers the Full Scorecard on the scoring screen was drawn in before
  // any of this was shared. Everything else derives from the same ratios, so
  // if this drifts, every card in the app drifts with it.
  it("reproduces the scoring card at its own type size", () => {
    expect(scoreCellMetrics(FS.label)).toEqual({ cell: 32, ring: 20, outer: 24, dot: 3 });
  });

  it("keeps the second ring outside the first at every size", () => {
    for (const size of [FS.micro, FS.label, FS.small, FS.body, FS.lead]) {
      const m = scoreCellMetrics(size);
      expect(m.outer).toBeGreaterThan(m.ring);
      expect(m.cell).toBeGreaterThan(m.outer);
      expect(m.dot).toBeGreaterThanOrEqual(3);
    }
  });
});
