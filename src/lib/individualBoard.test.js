import { describe, it, expect } from "vitest";
import {
  calcCH,
  buildStrokesMap,
  computeRoundLine,
  computeIndividualBoard,
  rankIndividualBoard,
  rankIndividualBoardIds,
  WD_SCORE,
} from "./individualBoard";

// A flat par-72 course whose stroke indexes run 1..18 in hole order, so
// "the first N strokes land on the first N holes" and the expected numbers
// stay checkable by hand.
const PARS = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
const HCPS = Array.from({ length: 18 }, (_, i) => i + 1);

const COURSE = {
  id: "c1", slope: 113, rating: 72, par: 72,
  hole_pars: PARS, hole_handicaps: HCPS,
};

// Every hole scored `n`.
const fullRound = (n) => Object.fromEntries(PARS.map((_, i) => [i, n]));
// The first `k` holes scored `n`.
const partialRound = (k, n) => Object.fromEntries(Array.from({ length: k }, (_, i) => [i, n]));

describe("calcCH", () => {
  it("is the index itself on a neutral course (slope 113, rating = par)", () => {
    expect(calcCH(12, 113, 72, 72)).toBe(12);
  });

  it("scales by slope and adds the rating-minus-par adjustment", () => {
    // 10 * (130/113) + (73.5 - 72) = 11.504… + 1.5 = 13.00… → 13
    expect(calcCH(10, 130, 73.5, 72)).toBe(13);
  });

  it("returns 0 for a missing index but honours a real zero", () => {
    expect(calcCH(null, 130, 72, 72)).toBe(0);
    expect(calcCH(undefined, 130, 72, 72)).toBe(0);
    expect(calcCH(0, 130, 72, 72)).toBe(0);
  });

  it("keeps a plus handicap negative", () => {
    expect(calcCH(-2, 113, 72, 72)).toBe(-2);
  });
});

describe("buildStrokesMap", () => {
  it("allocates one stroke per hole in stroke-index order", () => {
    const m = buildStrokesMap(3, HCPS);
    expect(m).toEqual({ 0: 1, 1: 1, 2: 1 });
  });

  it("wraps to a second stroke past 18", () => {
    const m = buildStrokesMap(20, HCPS);
    expect(m[0]).toBe(2);
    expect(m[1]).toBe(2);
    expect(m[2]).toBe(1);
    expect(Object.values(m).reduce((a, b) => a + b, 0)).toBe(20);
  });

  it("follows the stroke index, not the hole order", () => {
    // Hardest hole is #18 (index 17), then #17.
    const reversed = Array.from({ length: 18 }, (_, i) => 18 - i);
    expect(buildStrokesMap(2, reversed)).toEqual({ 17: 1, 16: 1 });
  });

  it("allocates a plus handicap by magnitude, leaving the sign to the caller", () => {
    expect(buildStrokesMap(-2, HCPS)).toEqual({ 0: 1, 1: 1 });
  });

  it("falls back to hole order when the course has no stroke indexes", () => {
    expect(buildStrokesMap(2, [])).toEqual({ 0: 1, 1: 1 });
  });
});

describe("computeRoundLine", () => {
  it("scores an even-par scratch round as E", () => {
    const line = computeRoundLine({ scores: fullRound(4), holePars: PARS, holeHcps: HCPS, ch: 0 });
    expect(line).toMatchObject({ gross: 72, grossToPar: 0, netToPar: 0, thru: 18, wd: false, played: true });
  });

  it("subtracts every stroke of a full-round handicap", () => {
    // 90 gross, +18 to par gross, 18 strokes → E net.
    const line = computeRoundLine({ scores: fullRound(5), holePars: PARS, holeHcps: HCPS, ch: 18 });
    expect(line.grossToPar).toBe(18);
    expect(line.netToPar).toBe(0);
  });

  it("counts only the strokes falling on holes actually played", () => {
    // Thru 5 at +1 per hole = +5 gross. A ch of 18 gives a stroke on every
    // hole, but only 5 of them are on the card → net E, NOT -13.
    const line = computeRoundLine({ scores: partialRound(5, 5), holePars: PARS, holeHcps: HCPS, ch: 18 });
    expect(line.thru).toBe(5);
    expect(line.grossToPar).toBe(5);
    expect(line.netToPar).toBe(0);
  });

  it("scores a partial round against the par of the holes played", () => {
    // Thru 5, all pars, scratch → E (not -52 against a full 72).
    const line = computeRoundLine({ scores: partialRound(5, 4), holePars: PARS, holeHcps: HCPS, ch: 0 });
    expect(line.netToPar).toBe(0);
    expect(line.gross).toBe(20);
  });

  it("adds strokes back for a plus handicap", () => {
    // Scratch-even card, ch -2 → the two hardest holes give a stroke BACK.
    const line = computeRoundLine({ scores: fullRound(4), holePars: PARS, holeHcps: HCPS, ch: -2 });
    expect(line.grossToPar).toBe(0);
    expect(line.netToPar).toBe(2);
  });

  it("excludes WD sentinel holes from gross, par and strokes", () => {
    const scores = { ...partialRound(9, 4) };
    for (let h = 9; h < 18; h++) scores[h] = WD_SCORE;
    const line = computeRoundLine({ scores, holePars: PARS, holeHcps: HCPS, ch: 0 });
    expect(line.wd).toBe(true);
    expect(line.thru).toBe(9);
    expect(line.gross).toBe(36);
    expect(line.netToPar).toBe(0);
  });

  it("marks a round played when it is nothing but WD sentinels", () => {
    const scores = Object.fromEntries(PARS.map((_, i) => [i, WD_SCORE]));
    const line = computeRoundLine({ scores, holePars: PARS, holeHcps: HCPS, ch: 10 });
    expect(line).toMatchObject({ wd: true, played: true, thru: 0, gross: 0, netToPar: 0 });
  });

  it("is unplayed, not zero, when no scores exist", () => {
    const line = computeRoundLine({ scores: {}, holePars: PARS, holeHcps: HCPS, ch: 10 });
    expect(line.played).toBe(false);
  });

  it("defaults a missing par to 4 rather than dropping the hole", () => {
    const line = computeRoundLine({ scores: { 0: 5 }, holePars: [], holeHcps: HCPS, ch: 0 });
    expect(line.grossToPar).toBe(1);
  });
});

describe("computeIndividualBoard", () => {
  const tRounds = [
    { round_number: 1, course_id: "c1" },
    { round_number: 2, course_id: "c1" },
  ];
  const players = [
    { id: "a", name: "Alice", handicap_index: 0 },
    { id: "b", name: "Bob", handicap_index: 18 },
  ];
  const board = (holeData, extra = {}) => computeIndividualBoard({
    players, numRounds: 2, holeData, tRounds, courses: [COURSE], ...extra,
  });

  it("accumulates net to par across rounds", () => {
    const rows = board({
      a_1: fullRound(4),   // E
      a_2: fullRound(5),   // +18
      b_1: fullRound(5),   // +18 gross, 18 strokes → E
    });
    const alice = rows.find(r => r.id === "a");
    const bob = rows.find(r => r.id === "b");
    expect(alice.totalNetToPar).toBe(18);
    expect(alice.roundsPlayed).toBe(2);
    expect(alice.totalGross).toBe(162);
    expect(bob.totalNetToPar).toBe(0);
    expect(bob.roundsPlayed).toBe(1);
  });

  it("emits one rds entry per round, null for rounds not played", () => {
    const rows = board({ a_1: fullRound(4) });
    const alice = rows.find(r => r.id === "a");
    expect(alice.rds).toHaveLength(2);
    expect(alice.rds[0]).toEqual({ netToPar: 0, thru: 18, wd: false });
    expect(alice.rds[1]).toEqual({ netToPar: null, thru: 0, wd: false });
  });

  it("carries the player's own fields through untouched", () => {
    const rows = board({});
    expect(rows.find(r => r.id === "a").name).toBe("Alice");
  });

  it("leaves rounds with no assigned course unscored", () => {
    const rows = computeIndividualBoard({
      players, numRounds: 2, holeData: { a_1: fullRound(4) },
      tRounds: [], courses: [COURSE],
    });
    const alice = rows.find(r => r.id === "a");
    expect(alice.roundsPlayed).toBe(0);
    expect(alice.rds).toEqual([
      { netToPar: null, thru: 0, wd: false },
      { netToPar: null, thru: 0, wd: false },
    ]);
  });

  it("records the round a player withdrew in", () => {
    const wdRound = Object.fromEntries(PARS.map((_, i) => [i, WD_SCORE]));
    const rows = board({ a_1: fullRound(4), a_2: wdRound });
    const alice = rows.find(r => r.id === "a");
    expect(alice.withdrew).toBe(true);
    expect(alice.wdRound).toBe(2);
  });

  it("uses the assigned tee's ratings over the course defaults", () => {
    // A tee at slope 130 / rating 73.5 turns a 10 index into a 13 course
    // handicap; on the course defaults it would be 10. A +18 gross round
    // therefore nets +5 rather than +8.
    const rows = computeIndividualBoard({
      players: [{ id: "t", name: "Tee", handicap_index: 10 }],
      numRounds: 1,
      holeData: { t_1: fullRound(5) },
      tRounds: [{ round_number: 1, course_id: "c1" }],
      courses: [COURSE],
      getPlayerTee: () => ({ slope: 130, rating: 73.5, par: 72 }),
    });
    expect(rows[0].totalNetToPar).toBe(5);
  });
});

describe("rankIndividualBoard", () => {
  const row = (over) => ({
    id: "x", name: "X", totalNetToPar: 0, totalThru: 0,
    roundsPlayed: 1, withdrew: false, isWD: false, ...over,
  });

  it("puts the lowest net to par first", () => {
    const ranked = rankIndividualBoardIds([
      row({ id: "a", name: "A", totalNetToPar: 5 }),
      row({ id: "b", name: "B", totalNetToPar: -3 }),
      row({ id: "c", name: "C", totalNetToPar: 0 }),
    ]);
    expect(ranked).toEqual(["b", "c", "a"]);
  });

  it("breaks a tie on holes played, more first", () => {
    const ranked = rankIndividualBoardIds([
      row({ id: "a", name: "A", totalNetToPar: 2, totalThru: 18 }),
      row({ id: "b", name: "B", totalNetToPar: 2, totalThru: 36 }),
    ]);
    expect(ranked).toEqual(["b", "a"]);
  });

  it("breaks a full tie deterministically by name then id", () => {
    const rows = [
      row({ id: "z", name: "Same", totalNetToPar: 1, totalThru: 18 }),
      row({ id: "a", name: "Same", totalNetToPar: 1, totalThru: 18 }),
      row({ id: "m", name: "Alpha", totalNetToPar: 1, totalThru: 18 }),
    ];
    expect(rankIndividualBoardIds(rows)).toEqual(["m", "a", "z"]);
    // Same input in a different order must produce the same ranking — this is
    // the property that stops two phones disagreeing about who is 2nd.
    expect(rankIndividualBoardIds([...rows].reverse())).toEqual(["m", "a", "z"]);
  });

  it("sorts players yet to post a round below those who have", () => {
    const ranked = rankIndividualBoardIds([
      row({ id: "none", name: "None", roundsPlayed: 0, totalNetToPar: 0 }),
      row({ id: "bad", name: "Bad", roundsPlayed: 1, totalNetToPar: 40 }),
    ]);
    expect(ranked).toEqual(["bad", "none"]);
  });

  it("sorts withdrawn players last however well they were scoring", () => {
    const ranked = rankIndividualBoardIds([
      row({ id: "wd", name: "WD", totalNetToPar: -10, withdrew: true }),
      row({ id: "ok", name: "OK", totalNetToPar: 20 }),
      row({ id: "none", name: "None", roundsPlayed: 0 }),
    ]);
    expect(ranked).toEqual(["ok", "none", "wd"]);
  });

  it("treats the roster-level isWD flag as withdrawn too", () => {
    const ranked = rankIndividualBoardIds([
      row({ id: "wd", name: "WD", totalNetToPar: -10, isWD: true }),
      row({ id: "ok", name: "OK", totalNetToPar: 20 }),
    ]);
    expect(ranked).toEqual(["ok", "wd"]);
  });

  it("does not mutate its input", () => {
    const rows = [row({ id: "a", totalNetToPar: 5 }), row({ id: "b", totalNetToPar: 1 })];
    rankIndividualBoard(rows);
    expect(rows.map(r => r.id)).toEqual(["a", "b"]);
  });

  it("is idempotent, so re-ranking an already-ranked board is a no-op", () => {
    const rows = [
      row({ id: "a", name: "A", totalNetToPar: 5 }),
      row({ id: "b", name: "B", totalNetToPar: -3 }),
      row({ id: "c", name: "C", totalNetToPar: 0 }),
    ];
    const once = rankIndividualBoard(rows);
    expect(rankIndividualBoardIds(once)).toEqual(once.map(r => r.id));
  });
});
