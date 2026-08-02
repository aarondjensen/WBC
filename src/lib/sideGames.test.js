import { describe, it, expect } from "vitest";
import { fieldFor, potFor, computeSkins, allSkins, skinCounts, buyInSheet, toggleIn } from "./sideGames";
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

describe("buyInSheet", () => {
  const games = [
    { key: "skins", amount: 20, ids: null },
    { key: "ctp", amount: 10, ids: null },
    { key: "market", amount: 25, ids: ["a", "b"] },
    { key: "rebuy", amount: 25, ids: ["a"] },
  ];

  it("adds up what each man owes across every buy-in", () => {
    const { rows } = buyInSheet({ players, games });
    expect(rows.map(r => [r.name, r.owes])).toEqual([["Aaron", 80], ["Brad", 55], ["Cole", 30]]);
  });

  it("says which games each player is in", () => {
    const { rows } = buyInSheet({ players, games });
    expect(rows[2].games).toEqual({ skins: true, ctp: true, market: false, rebuy: false });
  });

  it("totals each game's count and money", () => {
    const { totals } = buyInSheet({ players, games });
    expect(totals.skins).toMatchObject({ count: 3, amount: 60, all: true, none: false });
    expect(totals.rebuy).toMatchObject({ count: 1, amount: 25, all: false, none: false });
  });

  it("reads a never-configured list as everybody, not as an empty column", () => {
    const { totals } = buyInSheet({ players, games: [{ key: "skins", amount: 20, ids: null }] });
    expect(totals.skins.all).toBe(true);
  });

  it("reads an empty list as nobody", () => {
    const { totals, grand } = buyInSheet({ players, games: [{ key: "skins", amount: 20, ids: [] }] });
    expect(totals.skins).toMatchObject({ count: 0, all: false, none: true });
    expect(grand).toBe(0);
  });

  it("gives the grand total the director counts cash against", () => {
    expect(buyInSheet({ players, games }).grand).toBe(165);
  });

  it("survives a game with no price set", () => {
    const { rows, grand } = buyInSheet({ players, games: [{ key: "skins", ids: null }] });
    expect(rows[0].owes).toBe(0);
    expect(grand).toBe(0);
  });

  it("is empty with no roster", () => {
    expect(buyInSheet({ players: [], games }).rows).toEqual([]);
    expect(buyInSheet({ players: [], games }).totals.skins.all).toBe(false);
  });
});

describe("toggleIn", () => {
  it("materialises a never-configured list before removing anybody", () => {
    // The trap this exists to avoid: returning [] here would read straight
    // back as "nobody configured it, so everybody is in" — putting the player
    // back into the game they were just taken out of.
    expect(toggleIn(null, players, "b")).toEqual(["a", "c"]);
  });
  it("adds a player who is out", () => {
    expect(toggleIn(["a"], players, "c")).toEqual(["a", "c"]);
  });
  it("removes a player who is in", () => {
    expect(toggleIn(["a", "c"], players, "a")).toEqual(["c"]);
  });
  it("can empty a list completely", () => {
    expect(toggleIn(["a"], players, "a")).toEqual([]);
  });
});

// A derived column is one the director does not tag — the market rebuy is
// incurred by placing halfway shares. buyInSheet does not care where the
// list came from, but the sheet has to BILL for it either way, which is the
// property worth pinning.
describe("buyInSheet with a derived column", () => {
  const games = [
    { key: "market", amount: 25, ids: null },
    { key: "rebuy", amount: 25, ids: ["a"], derived: true },
  ];

  it("charges a derived buy-in exactly like a tagged one", () => {
    const { rows, grand } = buyInSheet({ players, games });
    expect(rows.map(r => r.owes)).toEqual([50, 25, 25]);
    expect(grand).toBe(100);
  });

  it("counts and totals it too", () => {
    expect(buyInSheet({ players, games }).totals.rebuy).toMatchObject({ count: 1, amount: 25 });
  });

  it("bills nobody for it while it is empty", () => {
    const empty = [{ key: "rebuy", amount: 25, ids: [], derived: true }];
    expect(buyInSheet({ players, games: empty }).grand).toBe(0);
  });
});
