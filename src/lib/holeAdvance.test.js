import { describe, it, expect } from "vitest";
import { openingHole, nineComplete, HOLES } from "./holeAdvance";

// A reader over { pid: { holeIdx: strokes } }.
const reader = (map) => (pid, h) => map?.[pid]?.[h] || 0;
// n holes posted for a player.
const card = (n, s = 4) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, s]));

describe("openingHole", () => {
  it("opens on the first hole the group has not all finished", () => {
    const r = openingHole(["a", "b"], reader({ a: card(7), b: card(7) }));
    expect(r).toMatchObject({ hole: 7, allComplete: false, resolved: true });
  });

  // The group moves together — one player short means the hole isn't done.
  it("waits for the slowest player on a hole", () => {
    const r = openingHole(["a", "b"], reader({ a: card(9), b: card(4) }));
    expect(r.hole).toBe(4);
  });

  it("lands on the last hole when everything is in", () => {
    const r = openingHole(["a", "b"], reader({ a: card(18), b: card(18) }));
    expect(r).toMatchObject({ hole: HOLES - 1, allComplete: true, resolved: true });
  });

  // A back-filled gap: the live edge is the GAP, not the far end.
  it("returns to a gap left behind", () => {
    const a = { ...card(18) }; delete a[5];
    const r = openingHole(["a"], reader({ a }));
    expect(r.hole).toBe(5);
    expect(r.allComplete).toBe(false);
  });

  it("treats a cleared score (0) as unplayed", () => {
    const r = openingHole(["a"], reader({ a: { ...card(6), 3: 0 } }));
    expect(r.hole).toBe(3);
  });

  // ── The cold-load distinction, which is the point of `resolved` ──
  // An empty map and a genuinely untouched card both answer "hole 1". Only
  // the caller knows which it is, so the answer says whether it came from
  // real data.
  it("is unresolved when nothing has been posted", () => {
    const r = openingHole(["a", "b"], reader({}));
    expect(r).toMatchObject({ hole: 0, hasAnyScores: false, resolved: false });
  });

  it("is unresolved with no players", () => {
    expect(openingHole([], reader({}))).toMatchObject({ hole: 0, resolved: false });
    expect(openingHole(undefined, reader({}))).toMatchObject({ hole: 0, resolved: false });
  });

  it("is resolved as soon as one score exists", () => {
    const r = openingHole(["a", "b"], reader({ a: { 0: 5 } }));
    expect(r).toMatchObject({ hole: 0, hasAnyScores: true, resolved: true });
  });

  it("ignores falsy holes from a reader that returns undefined", () => {
    const r = openingHole(["a"], () => undefined);
    expect(r).toMatchObject({ hole: 0, resolved: false });
  });

  it("drops empty slots in the player list", () => {
    const r = openingHole(["a", null, undefined], reader({ a: card(3) }));
    expect(r.hole).toBe(3);
  });

  it("honours a shorter card for a nine-hole round", () => {
    const r = openingHole(["a"], reader({ a: card(9) }), 9);
    expect(r).toMatchObject({ hole: 8, allComplete: true });
  });
});

describe("nineComplete", () => {
  it("is true when every player has every hole of the front", () => {
    expect(nineComplete(["a", "b"], reader({ a: card(9), b: card(9) }))).toBe(true);
  });

  it("waits for the slowest player", () => {
    expect(nineComplete(["a", "b"], reader({ a: card(9), b: card(8) }))).toBe(false);
  });

  it("does not count a gap in the middle of the nine", () => {
    const holed = { ...card(9) };
    delete holed[4];
    expect(nineComplete(["a"], reader({ a: holed }))).toBe(false);
  });

  it("reads the back nine from hole 10", () => {
    const back = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 9, 5]));
    expect(nineComplete(["a"], reader({ a: back }), 9)).toBe(true);
    expect(nineComplete(["a"], reader({ a: back }), 0)).toBe(false);
  });

  it("counts a WD sentinel as posted — the card is structurally complete", () => {
    expect(nineComplete(["a"], reader({ a: card(9, 99) }))).toBe(true);
  });

  it("is false with nobody in the group", () => {
    expect(nineComplete([], reader({}))).toBe(false);
    expect(nineComplete(undefined, reader({}))).toBe(false);
  });

  it("drops empty slots in the player list", () => {
    expect(nineComplete(["a", null], reader({ a: card(9) }))).toBe(true);
  });
});
