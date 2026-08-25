import { describe, it, expect } from "vitest";
import { chDeltasFor, CH_DELTA_MS } from "./chDeltas";

const TEES = [
  { name: "Blue", slope: 130, rating: 72.4, par: 72 },
  { name: "White", slope: 124, rating: 70.2, par: 72 },
  { name: "Gold", slope: 118, rating: 68.1, par: 72 },
];

// Aaron off Blue is 15, off Gold 9. Dave off Blue is 10, off Gold 4.
const PLAYERS = [
  { id: "aaron", handicap_index: 12.4 },
  { id: "dave", handicap_index: 8 },
];

describe("chDeltasFor", () => {
  it("gives the change for one player moved between tees", () => {
    const d = chDeltasFor(PLAYERS, TEES, { aaron: "Blue", dave: "Blue" }, { aaron: "Gold", dave: "Blue" });
    expect(d).toEqual({ aaron: -6 });
  });

  it("gives a change for every player when the whole field is moved", () => {
    // This is the one the console used to say nothing about. A set-all is the
    // move that shifts the most strokes, so it is the one that most needs it.
    const before = { aaron: "Blue", dave: "Blue" };
    const after = { aaron: "Gold", dave: "Gold" };
    expect(chDeltasFor(PLAYERS, TEES, before, after)).toEqual({ aaron: -6, dave: -6 });
  });

  it("leaves out the players a set-all does not actually move", () => {
    // Half the field is already on the tee being set. Their rows should not
    // flash — nothing happened to them.
    const before = { aaron: "Blue", dave: "Gold" };
    const after = { aaron: "Gold", dave: "Gold" };
    expect(chDeltasFor(PLAYERS, TEES, before, after)).toEqual({ aaron: -6 });
  });

  it("gives no delta for a player who had no tee at all", () => {
    // A first assignment is not a change — there was no course handicap to
    // move. The row goes from an em dash to a number, which says it itself.
    const d = chDeltasFor(PLAYERS, TEES, { aaron: "Blue" }, { aaron: "Blue", dave: "Gold" });
    expect(d).toEqual({});
  });

  it("gives no delta when two different tees play to the same number", () => {
    const flat = [
      { name: "Blue", slope: 113, rating: 72, par: 72 },
      { name: "White", slope: 113, rating: 72, par: 72 },
    ];
    expect(chDeltasFor(PLAYERS, flat, { aaron: "Blue" }, { aaron: "White" })).toEqual({});
  });

  it("gives no delta when an assignment names a tee the course no longer has", () => {
    const d = chDeltasFor(PLAYERS, TEES, { aaron: "Championship" }, { aaron: "Blue" });
    expect(d).toEqual({});
  });

  it("survives being handed nothing", () => {
    expect(chDeltasFor()).toEqual({});
    expect(chDeltasFor(PLAYERS, TEES)).toEqual({});
  });

  it("keeps the badge up long enough to read a full field", () => {
    // Guards the intent, not the constant: a value back down near the 3.5s
    // this started at is gone before a director has scrolled the list.
    expect(CH_DELTA_MS).toBeGreaterThanOrEqual(10000);
  });
});
