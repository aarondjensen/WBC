import { describe, it, expect } from "vitest";
import { fieldFor, potFor, perUnit, computeSkins, allSkins, skinCounts, buyInSheet, toggleIn, togglePaid, lowNetRounds, lowNetRoundField } from "./sideGames";
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

describe("perUnit", () => {
  it("splits a pot evenly", () => {
    expect(perUnit(320, 16)).toBe(20);
    expect(perUnit(100, 3)).toBeCloseTo(33.333);
  });

  it("is zero rather than Infinity when there is nothing to divide by", () => {
    expect(perUnit(320, 0)).toBe(0);
    expect(perUnit(320, undefined)).toBe(0);
    expect(perUnit(320, null)).toBe(0);
  });

  it("is zero on an empty pot", () => {
    expect(perUnit(0, 12)).toBe(0);
    expect(perUnit(undefined, 12)).toBe(0);
  });

  // The CTP rule the divisor exists for: a pin is worth the same whether or
  // not the other holes get claimed. Dividing by pins TAKEN would make an
  // early winner's pin shrink every time somebody else took one.
  it("holds a CTP pin's value steady as other pins are taken", () => {
    const PAR_3S = 8, POT = 160;
    expect(perUnit(POT, PAR_3S)).toBe(20);
    // Two more pins claimed later in the week — same divisor, same value.
    expect(perUnit(POT, PAR_3S)).toBe(20);
  });

  // And the skins rule, which genuinely does move: ties push holes out of
  // the count, so the value of a skin is only final when the cards are in.
  it("lets a skin's value move as more are won", () => {
    expect(perUnit(120, 4)).toBe(30);
    expect(perUnit(120, 8)).toBe(15);
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

  // A withdrawal stays on the sheet and stays billed: he paid, and walking in
  // does not refund a buy-in. The flag is only so the sheet can say why he is
  // still there.
  it("keeps a withdrawn player on the sheet, billed, and marked", () => {
    const roster = [{ id: "a", name: "Aaron" }, { id: "b", name: "Brad", isWD: true }];
    const { rows, grand } = buyInSheet({ players: roster, games });
    expect(rows.map(r => [r.name, r.wd, r.owes])).toEqual([["Aaron", false, 80], ["Brad", true, 55]]);
    expect(grand).toBe(135);
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

describe("lowNetRounds", () => {
  // A finished card unless told otherwise.
  // A finished card: gross is par (72) + to-par + whatever strokes were given.
  const line = (net, strokes = 0, over = {}) => ({
    played: true, wd: false, thru: 18,
    netToPar: net, grossToPar: net + strokes, gross: 72 + net + strokes, ...over,
  });
  const from = (map) => (pid, round) => (map[`${pid}_${round}`] ?? null);

  it("pays the lowest net of the day", () => {
    const rounds = lowNetRounds({
      players, rounds: [1],
      lineFor: from({ a_1: line(-3), b_1: line(1), c_1: line(4) }),
    });
    expect(rounds[0]).toMatchObject({ round: 1, net: -3, decided: true });
    expect(rounds[0].winners.map(w => w.pid)).toEqual(["a"]);
  });

  it("returns every player tied at the low, so the round can be split", () => {
    const rounds = lowNetRounds({
      players, rounds: [1],
      lineFor: from({ a_1: line(-2), b_1: line(-2), c_1: line(5) }),
    });
    expect(rounds[0].winners.map(w => w.pid)).toEqual(["a", "b"]);
  });

  // The rule the whole thing turns on: computeRoundLine scores a partial card
  // against the holes actually played, so a man walking in after nine would
  // otherwise sit on a net that wins the day from the clubhouse.
  it("ignores a card that is not through 18", () => {
    const rounds = lowNetRounds({
      players, rounds: [1],
      lineFor: from({ a_1: line(-6, 0, { thru: 9 }), b_1: line(2) }),
    });
    expect(rounds[0].winners.map(w => w.pid)).toEqual(["b"]);
    expect(rounds[0].net).toBe(2);
  });

  it("ignores a withdrawal and an unplayed card", () => {
    const rounds = lowNetRounds({
      players, rounds: [1],
      lineFor: from({ a_1: line(-9, 0, { wd: true }), b_1: { played: false }, c_1: line(3) }),
    });
    expect(rounds[0].winners.map(w => w.pid)).toEqual(["c"]);
  });

  it("leaves a round nobody has finished undecided rather than naming a leader", () => {
    const rounds = lowNetRounds({
      players, rounds: [1],
      lineFor: from({ a_1: line(-4, 0, { thru: 14 }) }),
    });
    expect(rounds[0]).toMatchObject({ decided: false, net: null, winners: [] });
  });

  it("does a round per round, in order", () => {
    const rounds = lowNetRounds({
      players, rounds: [1, 2],
      lineFor: from({ a_1: line(-1), b_1: line(3), a_2: line(5), b_2: line(0) }),
    });
    expect(rounds.map(r => [r.round, r.winners.map(w => w.pid)])).toEqual([[1, ["a"]], [2, ["b"]]]);
  });

  // The same answer said the other way: a 90 with 22 strokes is a 68 net,
  // which is what gets read out in a car park.
  it("reports the low net as a score as well as to par", () => {
    const rounds = lowNetRounds({
      players, rounds: [1],
      lineFor: from({ a_1: line(-4, 22), b_1: line(1, 4) }),
    });
    expect(rounds[0].winners[0]).toMatchObject({ pid: "a", net: -4, gross: 90, strokes: 22, netScore: 68 });
  });

  it("survives an event with no rounds", () => {
    expect(lowNetRounds({ players, rounds: [], lineFor: () => null })).toEqual([]);
  });
});

describe("buyInSheet payment tracking", () => {
  // The market rebuy is the one buy-in where entering and paying are separate
  // acts: a man enters it by placing halfway shares from a tee box, hours
  // before he can hand anybody $25.
  const games = (paid) => [
    { key: "skins", amount: 20, ids: null },
    { key: "rebuy", amount: 25, ids: ["a", "b"], paid },
  ];

  it("bills a man the moment he enters, paid or not", () => {
    // Nobody has paid the rebuy, and both men in it still owe it.
    const sheet = buyInSheet({ players, games: games([]) });
    expect(sheet.rows.map(r => r.owes)).toEqual([45, 45, 20]);
    expect(sheet.grand).toBe(110);
    // Paying changes what is outstanding, never what is owed.
    expect(buyInSheet({ players, games: games(["a", "b"]) }).grand).toBe(110);
  });

  it("counts what is still to come in", () => {
    expect(buyInSheet({ players, games: games([]) }).outstanding).toBe(50);
    expect(buyInSheet({ players, games: games(["a"]) }).outstanding).toBe(25);
    expect(buyInSheet({ players, games: games(["a", "b"]) }).outstanding).toBe(0);
  });

  it("marks each row paid or not, per game", () => {
    const { rows } = buyInSheet({ players, games: games(["a"]) });
    expect(rows.find(r => r.pid === "a").paid).toEqual({ skins: true, rebuy: true });
    expect(rows.find(r => r.pid === "b").paid).toEqual({ skins: true, rebuy: false });
    // Cole is not in the rebuy at all — not in is not the same as unpaid.
    expect(rows.find(r => r.pid === "c")).toMatchObject({ unpaid: 0, paid: { rebuy: false } });
  });

  it("reports the column's payment state for its heading", () => {
    expect(buyInSheet({ players, games: games([]) }).totals.rebuy)
      .toMatchObject({ count: 2, paidCount: 0, paidAmount: 0, allPaid: false });
    expect(buyInSheet({ players, games: games(["a", "b"]) }).totals.rebuy)
      .toMatchObject({ paidCount: 2, paidAmount: 50, allPaid: true });
  });

  // A game with no `paid` array is not tracking payment — ticking its box IS
  // the cash changing hands — so it must never show up as outstanding.
  it("treats an untracked game as settled", () => {
    const untracked = [{ key: "skins", amount: 20, ids: null }];
    const sheet = buyInSheet({ players, games: untracked });
    expect(sheet.outstanding).toBe(0);
    expect(sheet.totals.skins).toMatchObject({ allPaid: true, paidCount: 3 });
  });
});

describe("togglePaid", () => {
  it("marks a player paid", () => expect(togglePaid([], "a")).toEqual(["a"]));
  it("un-marks one, for the tap that was a mistake", () => {
    expect(togglePaid(["a", "b"], "a")).toEqual(["b"]);
  });
  // No null-means-everybody rule here: nobody has paid until somebody says so.
  it("treats a missing list as nobody paid", () => {
    expect(togglePaid(null, "a")).toEqual(["a"]);
    expect(togglePaid(undefined, "a")).toEqual(["a"]);
  });
});

// The three-state cycle a cell runs, expressed on the data it moves. The
// component owns the taps; these are the transitions they have to produce.
describe("the owed → paid → out cycle", () => {
  const roster = players;
  const game = (ids, paid) => [{ key: "skins", amount: 20, ids, paid }];

  it("in with nobody paid bills everybody and collects nothing", () => {
    const sheet = buyInSheet({ players: roster, games: game(null, []) });
    expect(sheet.grand).toBe(60);
    expect(sheet.outstanding).toBe(60);
    expect(sheet.totals.skins).toMatchObject({ count: 3, paidCount: 0, allPaid: false });
  });

  it("paying moves money off the outstanding line, never off the owed one", () => {
    const sheet = buyInSheet({ players: roster, games: game(null, ["a", "b"]) });
    expect(sheet.grand).toBe(60);
    expect(sheet.outstanding).toBe(20);
    expect(sheet.totals.skins).toMatchObject({ paidCount: 2, paidAmount: 40, allPaid: false });
  });

  it("everybody paid clears the outstanding line", () => {
    const sheet = buyInSheet({ players: roster, games: game(null, ["a", "b", "c"]) });
    expect(sheet.outstanding).toBe(0);
    expect(sheet.totals.skins.allPaid).toBe(true);
  });

  // The trap the third tap has to avoid: dropping a man from `in` while
  // leaving his paid flag behind would mark him settled the instant anybody
  // put him back in.
  it("a man taken out and put back in is owing again, not paid", () => {
    const out = { ids: ["b", "c"], paid: ["b"] };   // 'a' removed from both
    const back = { ids: ["a", "b", "c"], paid: ["b"] };
    expect(buyInSheet({ players: roster, games: [{ key: "skins", amount: 20, ...out }] }).rows
      .find(r => r.pid === "a")).toMatchObject({ owes: 0, unpaid: 0 });
    expect(buyInSheet({ players: roster, games: [{ key: "skins", amount: 20, ...back }] }).rows
      .find(r => r.pid === "a")).toMatchObject({ owes: 20, unpaid: 20, paid: { skins: false } });
  });

  it("a paid flag on somebody who is not in bills nothing", () => {
    const sheet = buyInSheet({ players: roster, games: game(["a"], ["a", "b"]) });
    expect(sheet.grand).toBe(20);
    expect(sheet.outstanding).toBe(0);
    expect(sheet.totals.skins).toMatchObject({ count: 1, paidCount: 1 });
  });
});

describe("lowNetRoundField", () => {
  const line = (net, strokes = 0, over = {}) => ({
    played: true, wd: false, thru: 18,
    netToPar: net, grossToPar: net + strokes, gross: 72 + net + strokes, ...over,
  });
  const from = (map) => (pid, round) => (map[`${pid}_${round}`] ?? null);

  it("sorts the finished field by net, lowest first", () => {
    const rows = lowNetRoundField({
      players, round: 1,
      lineFor: from({ a_1: line(4), b_1: line(-2), c_1: line(1) }),
    });
    expect(rows.map(r => r.pid)).toEqual(["b", "c", "a"]);
  });

  it("puts everybody still out BELOW the finished cards, whatever their net", () => {
    // The man on the 14th at -6 is not leading anybody — he has no round yet.
    const rows = lowNetRoundField({
      players, round: 1,
      lineFor: from({ a_1: line(-6, 0, { thru: 14 }), b_1: line(3), c_1: line(5) }),
    });
    expect(rows.map(r => r.pid)).toEqual(["b", "c", "a"]);
    expect(rows[2]).toMatchObject({ complete: false, thru: 14 });
  });

  it("orders the unfinished by how far round they are", () => {
    const rows = lowNetRoundField({
      players, round: 1,
      lineFor: from({
        a_1: line(0, 0, { thru: 6 }), b_1: line(0, 0, { thru: 15 }), c_1: line(0, 0, { thru: 11 }),
      }),
    });
    expect(rows.map(r => [r.pid, r.thru])).toEqual([["b", 15], ["c", 11], ["a", 6]]);
  });

  it("keeps a withdrawal, ranked with the unfinished — its holes are real", () => {
    const rows = lowNetRoundField({
      players, round: 1,
      lineFor: from({ a_1: line(-9, 0, { wd: true }), b_1: line(2) }),
    });
    expect(rows.map(r => r.pid)).toEqual(["b", "a"]);
    expect(rows[1]).toMatchObject({ wd: true, complete: false });
  });

  it("drops a card nobody has started", () => {
    const rows = lowNetRoundField({
      players, round: 1,
      lineFor: from({ a_1: { played: false }, b_1: line(1) }),
    });
    expect(rows.map(r => r.pid)).toEqual(["b"]);
  });

  it("breaks a tie on net by name, so the order does not wander between renders", () => {
    const rows = lowNetRoundField({
      players, round: 1,
      lineFor: from({ a_1: line(2), b_1: line(2), c_1: line(2) }),
    });
    expect(rows.map(r => r.name)).toEqual(["Aaron", "Brad", "Cole"]);
  });

  it("reports the net as a score alongside to-par, the way the ledger prints it", () => {
    const rows = lowNetRoundField({
      players, round: 1,
      lineFor: from({ a_1: line(-4, 22) }),
    });
    expect(rows[0]).toMatchObject({ gross: 90, strokes: 22, net: -4, netScore: 68 });
  });

  it("survives an empty field", () => {
    expect(lowNetRoundField({ players: [], round: 1, lineFor: () => null })).toEqual([]);
  });
});

// ── The man who is not playing ─────────────────────────────────────
// The market is a bet on who wins, so somebody off this year's roster can be
// in it. He arrives on the sheet flagged `outside`, and the whole of what that
// flag does is stop the word "everybody" meaning him.
describe("buyInSheet with a player who is not in the field", () => {
  const roster = [
    { id: "a", name: "Aaron" },
    { id: "b", name: "Brad" },
    { id: "x", name: "Xavier", outside: true },
  ];
  // Skins is untagged (everybody); the market names him explicitly.
  const games = [
    { key: "skins", amount: 20, ids: null, paid: [] },
    { key: "market", amount: 25, ids: ["a", "b", "x"], paid: [] },
  ];
  const rowFor = (sheet, pid) => sheet.rows.find(r => r.pid === pid);

  it("does not bill him for a game nobody has tagged", () => {
    const sheet = buyInSheet({ players: roster, games });
    // The players get both; he gets the one he was named in.
    expect(rowFor(sheet, "a").owes).toBe(45);
    expect(rowFor(sheet, "x")).toMatchObject({ owes: 25, outside: true, games: { skins: false, market: true } });
    expect(sheet.grand).toBe(115);
  });

  it("counts a column as full without him", () => {
    // Skins can never hold him, so `all` has to be true or the heading's
    // all-in → all-paid → clear cycle sticks on its first step forever.
    const sheet = buyInSheet({ players: roster, games });
    expect(sheet.totals.skins).toMatchObject({ count: 2, all: true });
    expect(sheet.totals.market).toMatchObject({ count: 3, all: true });
  });

  it("counts him once he is actually in the column", () => {
    const tagged = [{ key: "skins", amount: 20, ids: ["a", "x"], paid: [] }];
    const sheet = buyInSheet({ players: roster, games: tagged });
    // Brad is in the field and out of the game, so it is not full.
    expect(sheet.totals.skins).toMatchObject({ count: 2, all: false });
    expect(rowFor(sheet, "x").owes).toBe(20);
  });

  it("bills and collects from him like anybody else", () => {
    const paid = [{ key: "market", amount: 25, ids: ["a", "x"], paid: ["x"] }];
    const sheet = buyInSheet({ players: roster, games: paid });
    expect(rowFor(sheet, "x")).toMatchObject({ owes: 25, unpaid: 0 });
    expect(rowFor(sheet, "a")).toMatchObject({ owes: 25, unpaid: 25 });
    expect(sheet.grand).toBe(50);
    expect(sheet.outstanding).toBe(25);
  });

  // An empty field with one outsider is a real state on the morning an
  // edition is created: the roster has not been entered yet.
  it("survives a sheet with nobody but him on it", () => {
    const sheet = buyInSheet({ players: [roster[2]], games });
    expect(sheet.grand).toBe(25);
    expect(sheet.totals.skins).toMatchObject({ count: 0, all: false });
  });
});
