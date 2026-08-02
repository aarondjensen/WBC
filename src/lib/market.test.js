import { describe, it, expect } from "vitest";
import {
  MARKET_OPENING_SHARES, MARKET_MID_SHARES, midRoundFor,
  normalizeLots, totalShares, sharesOn, setLotShares,
  roundStarted, roundComplete, marketWindows,
  lotsFor, allLots, marketBoard, marketHoldings, marketPayouts, eligibleBets,
} from "./market";

const players = [
  { id: "aaron_j", name: "Aaron" },
  { id: "brad_k", name: "Brad" },
  { id: "cole_m", name: "Cole" },
];

// A round's worth of scores for one player, all 18 filled unless `thru`.
const card = (thru = 18) => {
  const s = {};
  for (let h = 0; h < thru; h++) s[h] = 4;
  return s;
};

describe("midRoundFor", () => {
  it("is round 2 for the four-round event WBC plays", () => {
    expect(midRoundFor(4)).toBe(2);
    expect(midRoundFor(5)).toBe(2);
  });
  it("never lands on the last round", () => {
    expect(midRoundFor(3)).toBe(2);
  });
  it("does not exist for an event with no room for it", () => {
    expect(midRoundFor(2)).toBeNull();
    expect(midRoundFor(1)).toBeNull();
    expect(midRoundFor(undefined)).toBeNull();
  });
});

describe("normalizeLots", () => {
  it("drops zero, negative and fractional-to-zero holdings", () => {
    expect(normalizeLots([{ pid: "a", shares: 0 }, { pid: "b", shares: -3 }, { pid: "c", shares: 0.4 }]))
      .toEqual([]);
  });
  it("merges duplicate lots on the same golfer", () => {
    expect(normalizeLots([{ pid: "a", shares: 3 }, { pid: "a", shares: 2 }]))
      .toEqual([{ pid: "a", shares: 5 }]);
  });
  it("sorts biggest holding first, then by id so the order is deterministic", () => {
    expect(normalizeLots([{ pid: "b", shares: 4 }, { pid: "a", shares: 9 }, { pid: "c", shares: 4 }]))
      .toEqual([{ pid: "a", shares: 9 }, { pid: "b", shares: 4 }, { pid: "c", shares: 4 }]);
  });
  it("survives junk", () => {
    expect(normalizeLots(null)).toEqual([]);
    expect(normalizeLots([null, {}, { shares: 4 }])).toEqual([]);
  });
});

describe("totalShares / sharesOn", () => {
  const lots = [{ pid: "a", shares: 12 }, { pid: "b", shares: 8 }];
  it("adds a portfolio up", () => expect(totalShares(lots)).toBe(20));
  it("reads one golfer's line", () => {
    expect(sharesOn(lots, "a")).toBe(12);
    expect(sharesOn(lots, "zz")).toBe(0);
  });
});

describe("setLotShares", () => {
  it("caps the window rather than overspending it", () => {
    const lots = [{ pid: "a", shares: 15 }];
    expect(setLotShares(lots, "b", 99, 20)).toEqual([{ pid: "a", shares: 15 }, { pid: "b", shares: 5 }]);
  });
  it("computes the cap against the OTHER lots, so a holding can be raised in place", () => {
    const lots = [{ pid: "a", shares: 15 }, { pid: "b", shares: 5 }];
    // Raising `a` is allowed up to 15 (20 minus b's 5), not blocked because
    // the portfolio is already full.
    expect(setLotShares(lots, "a", 15, 20)).toEqual([{ pid: "a", shares: 15 }, { pid: "b", shares: 5 }]);
    expect(setLotShares(lots, "a", 99, 20)).toEqual([{ pid: "a", shares: 15 }, { pid: "b", shares: 5 }]);
  });
  it("removes a golfer taken to zero", () => {
    expect(setLotShares([{ pid: "a", shares: 4 }, { pid: "b", shares: 1 }], "a", 0, 20))
      .toEqual([{ pid: "b", shares: 1 }]);
  });
  it("is uncapped when no cap is given", () => {
    expect(setLotShares([], "a", 500, null)).toEqual([{ pid: "a", shares: 500 }]);
  });
});

describe("roundStarted / roundComplete", () => {
  it("a round nobody has teed off in has not started", () => {
    expect(roundStarted({}, players, 1)).toBe(false);
    expect(roundComplete({}, players, 1)).toBe(false);
  });
  it("one score starts it", () => {
    expect(roundStarted({ aaron_j_1: { 0: 5 } }, players, 1)).toBe(true);
  });
  it("a group still out on 14 keeps it open", () => {
    const hd = { aaron_j_1: card(18), brad_k_1: card(14) };
    expect(roundComplete(hd, players, 1)).toBe(false);
  });
  it("everybody who posted having posted 18 completes it", () => {
    const hd = { aaron_j_1: card(18), brad_k_1: card(18) };
    // Cole never teed off — a withdrawal does not hold the round open.
    expect(roundComplete(hd, players, 1)).toBe(true);
  });
});

describe("marketWindows", () => {
  it("opens the first window before anybody has teed off", () => {
    const w = marketWindows({ holeData: {}, players, numRounds: 4 });
    expect(w.opening.open).toBe(true);
    expect(w.opening.shares).toBe(MARKET_OPENING_SHARES);
    expect(w.mid.open).toBe(false);
  });

  it("shuts the first window on the first score of Round 1", () => {
    const w = marketWindows({ holeData: { aaron_j_1: { 0: 4 } }, players, numRounds: 4 });
    expect(w.opening.open).toBe(false);
    expect(w.opening.closed).toBe(true);
  });

  it("opens the second window once Round 2 is complete", () => {
    const holeData = {
      aaron_j_1: card(), brad_k_1: card(),
      aaron_j_2: card(), brad_k_2: card(),
    };
    const w = marketWindows({ holeData, players, numRounds: 4 });
    expect(w.mid.open).toBe(true);
    expect(w.mid.shares).toBe(MARKET_MID_SHARES);
    expect(w.mid.round).toBe(2);
  });

  it("shuts the second window on the first score of Round 3", () => {
    const holeData = {
      aaron_j_1: card(), brad_k_1: card(),
      aaron_j_2: card(), brad_k_2: card(),
      aaron_j_3: { 0: 4 },
    };
    const w = marketWindows({ holeData, players, numRounds: 4 });
    expect(w.mid.open).toBe(false);
    expect(w.mid.closed).toBe(true);
  });

  it("gives a two-round event no second window at all", () => {
    const w = marketWindows({ holeData: {}, players, numRounds: 2 });
    expect(w.mid.exists).toBe(false);
    expect(w.mid.open).toBe(false);
  });
});

describe("lotsFor / allLots", () => {
  const bet = { pid: "aaron_j", opening: [{ pid: "brad_k", shares: 20 }], mid: [{ pid: "brad_k", shares: 4 }, { pid: "cole_m", shares: 6 }] };
  it("reads one window", () => {
    expect(lotsFor(bet, "opening")).toEqual([{ pid: "brad_k", shares: 20 }]);
    expect(lotsFor(bet, "mid")).toEqual([{ pid: "cole_m", shares: 6 }, { pid: "brad_k", shares: 4 }]);
  });
  it("adds the two windows into one portfolio", () => {
    expect(allLots(bet)).toEqual([{ pid: "brad_k", shares: 24 }, { pid: "cole_m", shares: 6 }]);
  });
});

describe("marketBoard", () => {
  const bets = [
    { pid: "aaron_j", opening: [{ pid: "brad_k", shares: 20 }] },
    { pid: "brad_k", opening: [{ pid: "brad_k", shares: 10 }, { pid: "cole_m", shares: 10 }] },
  ];

  it("totals the shares held in each golfer, richest first", () => {
    const rows = marketBoard({ bets, players, pot: 400 });
    expect(rows.map(r => [r.pid, r.shares])).toEqual([["brad_k", 30], ["cole_m", 10]]);
  });

  it("prices a share at the pot divided by the shares on that golfer", () => {
    const rows = marketBoard({ bets, players, pot: 400 });
    expect(rows[0].perShare).toBeCloseTo(400 / 30);
    expect(rows[1].perShare).toBe(40);
  });

  it("reports each golfer's slice of the market", () => {
    const rows = marketBoard({ bets, players, pot: 0 });
    expect(rows[0].pct).toBeCloseTo(75);
    expect(rows[1].pct).toBeCloseTo(25);
  });

  it("names golfers off the roster", () => {
    expect(marketBoard({ bets, players, pot: 0 })[0].name).toBe("Brad");
  });

  it("is empty before anybody bets", () => {
    expect(marketBoard({ bets: [], players, pot: 100 })).toEqual([]);
  });
});

describe("marketHoldings", () => {
  it("lists each bettor and what they are holding, biggest book first", () => {
    const bets = [
      { pid: "aaron_j", opening: [{ pid: "brad_k", shares: 20 }], mid: [{ pid: "cole_m", shares: 10 }] },
      { pid: "brad_k", opening: [{ pid: "cole_m", shares: 5 }] },
      { pid: "cole_m", opening: [] },
    ];
    const rows = marketHoldings({ bets, players });
    expect(rows.map(r => [r.name, r.shares])).toEqual([["Aaron", 30], ["Brad", 5]]);
  });
});

describe("marketPayouts", () => {
  const bets = [
    { pid: "aaron_j", opening: [{ pid: "brad_k", shares: 20 }] },
    { pid: "brad_k", opening: [{ pid: "brad_k", shares: 10 }, { pid: "cole_m", shares: 10 }] },
    { pid: "cole_m", opening: [{ pid: "cole_m", shares: 20 }] },
  ];

  it("divides the whole pot by the shares on the winner", () => {
    const out = marketPayouts({ bets, winnerId: "brad_k", pot: 300 });
    expect(out.totalShares).toBe(30);
    expect(out.perShare).toBe(10);
    expect(out.rows).toEqual([
      { pid: "aaron_j", shares: 20, payout: 200 },
      { pid: "brad_k", shares: 10, payout: 100 },
    ]);
  });

  it("pays nothing to shares on anybody else", () => {
    const out = marketPayouts({ bets, winnerId: "brad_k", pot: 300 });
    expect(out.rows.find(r => r.pid === "cole_m")).toBeUndefined();
  });

  it("hands the whole pot to a single backer", () => {
    const out = marketPayouts({ bets: [{ pid: "aaron_j", opening: [{ pid: "cole_m", shares: 3 }] }], winnerId: "cole_m", pot: 250 });
    expect(out.rows).toEqual([{ pid: "aaron_j", shares: 3, payout: 250 }]);
  });

  it("flags a winner nobody backed instead of dividing by zero", () => {
    const out = marketPayouts({ bets, winnerId: "aaron_j", pot: 300 });
    expect(out.totalShares).toBe(0);
    expect(out.perShare).toBe(0);
    expect(out.unclaimed).toBe(true);
    expect(out.rows).toEqual([]);
  });

  it("is not 'unclaimed' merely because the tournament has no winner yet", () => {
    expect(marketPayouts({ bets, winnerId: null, pot: 300 }).unclaimed).toBe(false);
  });
});

describe("eligibleBets", () => {
  const bets = [
    { pid: "aaron_j", opening: [{ pid: "cole_m", shares: 20 }], mid: [{ pid: "cole_m", shares: 10 }] },
    { pid: "brad_k", opening: [{ pid: "brad_k", shares: 20 }], mid: [{ pid: "brad_k", shares: 10 }] },
    { pid: "cole_m", opening: [{ pid: "cole_m", shares: 20 }], mid: [] },
  ];
  const all = () => true;

  it("keeps the opening twenty of somebody who did not rebuy, and drops their ten", () => {
    const out = eligibleBets({ bets, inMarket: all, inRebuy: pid => pid === "aaron_j" });
    expect(out.find(b => b.pid === "brad_k")).toEqual({ pid: "brad_k", opening: [{ pid: "brad_k", shares: 20 }], mid: [] });
    expect(out.find(b => b.pid === "aaron_j").mid).toEqual([{ pid: "cole_m", shares: 10 }]);
  });

  it("drops a bettor who is not in the market game at all", () => {
    const out = eligibleBets({ bets, inMarket: pid => pid !== "cole_m", inRebuy: all });
    expect(out.map(b => b.pid)).toEqual(["aaron_j", "brad_k"]);
  });

  it("leaves the stored bet untouched — the prune is a read, not a write", () => {
    eligibleBets({ bets, inMarket: all, inRebuy: () => false });
    expect(bets[0].mid).toEqual([{ pid: "cole_m", shares: 10 }]);
  });

  it("un-tagging a rebuy takes those shares off the board and out of the payout", () => {
    const withRebuy = eligibleBets({ bets, inMarket: all, inRebuy: all });
    const without = eligibleBets({ bets, inMarket: all, inRebuy: pid => pid !== "brad_k" });
    expect(marketBoard({ bets: withRebuy, players, pot: 0 }).find(r => r.pid === "brad_k").shares).toBe(30);
    expect(marketBoard({ bets: without, players, pot: 0 }).find(r => r.pid === "brad_k").shares).toBe(20);
    // And the pot follows: 30 shares on the winner at a 300 pot is 10 each,
    // 20 is 15 each.
    expect(marketPayouts({ bets: withRebuy, winnerId: "brad_k", pot: 300 }).perShare).toBe(10);
    expect(marketPayouts({ bets: without, winnerId: "brad_k", pot: 300 }).perShare).toBe(15);
  });
});
