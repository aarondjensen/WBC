import { describe, it, expect } from "vitest";
import { fieldFor, potFor, computeSkins, allSkins, skinCounts } from "./sideGames";
import { WD_SCORE } from "./individualBoard";

const players = [
  { id: "a", name: "Aaron" },
  { id: "b", name: "Brad" },
  { id: "c", name: "Cole" },
];

const pars = Array.from({ length: 18 }, () => 4);

describe("fieldFor", () => {
  it("a never-configured list means everybody", () => {
    expect(fieldFor(null, players)).toEqual(players);
    expect(fieldFor(undefined, players)).toEqual(players);
  });
  it("an empty list means nobody — not everybody", () => {
    expect(fieldFor([], players)).toEqual([]);
  });
  it("a list means exactly those players", () => {
    expect(fieldFor(["a", "c"], players).map(p => p.id)).toEqual(["a", "c"]);
  });
});

describe("potFor", () => {
  it("counts the pot from the buy-in once there is a price", () => {
    expect(potFor({ amount: 20, count: 16, typed: 999 })).toBe(320);
  });
  it("falls back to the hand-typed pot until there is one", () => {
    expect(potFor({ amount: 0, count: 16, typed: 250 })).toBe(250);
    expect(potFor({ amount: undefined, count: 0, typed: 250 })).toBe(250);
  });
  it("is zero when there is neither", () => {
    expect(potFor({})).toBe(0);
  });
});

describe("computeSkins", () => {
  it("low gross takes the hole", () => {
    const holeData = { a_1: { 0: 3 }, b_1: { 0: 4 }, c_1: { 0: 5 } };
    const out = computeSkins({ players, holeData, round: 1, pars });
    expect(out[0].winner.pid).toBe("a");
    expect(out[0].score).toBe(3);
  });

  it("a tie pushes the hole", () => {
    const holeData = { a_1: { 0: 3 }, b_1: { 0: 3 } };
    const out = computeSkins({ players, holeData, round: 1, pars });
    expect(out[0].winner).toBeNull();
    expect(out[0].tied).toBe(true);
  });

  it("one player alone on a hole wins nothing", () => {
    const holeData = { a_1: { 0: 2 } };
    expect(computeSkins({ players, holeData, round: 1, pars })[0].winner).toBeNull();
  });

  it("ignores the withdrawal sentinel, so a solo card is still not a skin", () => {
    const holeData = { a_1: { 0: 5 }, b_1: { 0: WD_SCORE } };
    expect(computeSkins({ players, holeData, round: 1, pars })[0].winner).toBeNull();
  });

  it("nets a stroke off the hole it falls on", () => {
    const holeData = { a_1: { 0: 4 }, b_1: { 0: 4 } };
    const strokeMaps = { a: { 0: 1 } };
    const out = computeSkins({ players, holeData, round: 1, pars, strokeMaps, chFor: () => 6 });
    expect(out[0].winner.pid).toBe("a");
    expect(out[0].score).toBe(3);
  });

  it("gives a plus player's strokes back instead of taking them off", () => {
    const holeData = { a_1: { 0: 4 }, b_1: { 0: 4 } };
    const strokeMaps = { a: { 0: 1 }, b: {} };
    // a is a +1, so their net on a stroke hole is 5 — the hole goes to b.
    const out = computeSkins({ players, holeData, round: 1, pars, strokeMaps, chFor: (pid) => (pid === "a" ? -1 : 0) });
    expect(out[0].winner.pid).toBe("b");
  });

  it("keeps the gross alongside the net, for the card", () => {
    const holeData = { a_1: { 0: 4 }, b_1: { 0: 6 } };
    const out = computeSkins({ players, holeData, round: 1, pars, strokeMaps: { a: { 0: 2 } }, chFor: () => 20 });
    expect(out[0].winner).toMatchObject({ score: 2, gross: 4 });
  });

  it("returns a row for every hole whether or not it was played", () => {
    expect(computeSkins({ players, holeData: {}, round: 1, pars })).toHaveLength(18);
  });
});

describe("allSkins / skinCounts", () => {
  const holeData = {
    a_1: { 0: 3, 1: 4 }, b_1: { 0: 4, 1: 4 },
    a_2: { 0: 5 }, b_2: { 0: 4 },
  };
  const roundSetup = () => ({ pars });

  it("tags each skin with the round it came from", () => {
    const won = allSkins({ players, holeData, rounds: [1, 2], roundSetup });
    expect(won.map(s => [s.round, s.hole, s.winner.pid])).toEqual([[1, 0, "a"], [2, 0, "b"]]);
  });

  it("counts them per player", () => {
    expect(skinCounts(allSkins({ players, holeData, rounds: [1, 2], roundSetup }))).toEqual({ a: 1, b: 1 });
  });

  it("counts nothing before anybody plays", () => {
    expect(skinCounts(allSkins({ players, holeData: {}, rounds: [1], roundSetup }))).toEqual({});
  });
});
