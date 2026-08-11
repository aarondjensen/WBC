import { describe, it, expect } from "vitest";
import {
  MARKET_OPENING_SHARES, MARKET_MID_SHARES, midRoundFor,
  normalizeLots, totalShares, sharesOn, setLotShares,
  roundStarted, roundComplete, marketWindows, teeOffAt, countdown, countdownTick, countdownTone, openingSharesLeft,
  lotsFor, allLots, marketBoard, marketHoldings, marketPayouts, eligibleBets, rebuyers, marketRoster,
  marketOutsiders,
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

  it("shuts the first window on the first score of Round 1, with no bell set", () => {
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

describe("teeOffAt", () => {
  const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();

  it("is the EARLIEST tee time on the round's date", () => {
    expect(teeOffAt("2026-08-14", [510, 450, 540])).toBe(at(2026, 8, 14, 7, 30));
  });

  it("is local time — the phones reading it are standing on the course", () => {
    const t = new Date(teeOffAt("2026-08-14", [8 * 60 + 5]));
    expect([t.getHours(), t.getMinutes()]).toEqual([8, 5]);
  });

  it("is null with no date or no tee sheet — there is no bell to ring", () => {
    expect(teeOffAt("", [420])).toBeNull();
    expect(teeOffAt("2026-08-14", [])).toBeNull();
    expect(teeOffAt("2026-08-14", null)).toBeNull();
    expect(teeOffAt(null, [420])).toBeNull();
  });

  it("ignores tee times that would not parse", () => {
    expect(teeOffAt("2026-08-14", [null, undefined, NaN, 480])).toBe(at(2026, 8, 14, 8, 0));
  });

  it("rejects a date that is not a date", () => {
    expect(teeOffAt("August 14", [420])).toBeNull();
  });
});

describe("countdown", () => {
  const s = 1000, m = 60 * s, h = 60 * m, d = 24 * h;

  it("reads days and hours when the tournament is still days away", () => {
    expect(countdown(2 * d + 5 * h + 40 * m).label).toBe("2d 5h");
  });

  it("reads hours and minutes through the day before", () => {
    expect(countdown(5 * h + 12 * m + 30 * s).label).toBe("5h 12m");
  });

  it("pads the minutes so the label does not change width as it counts", () => {
    expect(countdown(5 * h + 4 * m).label).toBe("5h 04m");
  });

  it("switches to a ticking clock inside the last hour", () => {
    expect(countdown(12 * m + 4 * s).label).toBe("12:04");
    expect(countdown(59 * m + 59 * s).label).toBe("59:59");
  });

  it("counts the last minute down second by second", () => {
    expect(countdown(9 * s).label).toBe("0:09");
  });

  it("rounds UP, so the last tick reads 0:01 rather than 0:00", () => {
    // A market that says nothing is left while it is still taking shares is
    // lying about the more important of the two.
    expect(countdown(400).label).toBe("0:01");
    expect(countdown(1).label).toBe("0:01");
  });

  it("is Closed at zero and stays there past it", () => {
    expect(countdown(0).label).toBe("Closed");
    expect(countdown(0).done).toBe(true);
    expect(countdown(-5 * m).label).toBe("Closed");
    expect(countdown(-5 * m).total).toBe(0);
  });

  it("survives a missing argument", () => {
    expect(countdown().label).toBe("Closed");
    expect(countdown(null).done).toBe(true);
  });

  it("flags the last hour urgent, and nothing outside it", () => {
    expect(countdown(59 * m).urgent).toBe(true);
    expect(countdown(60 * m).urgent).toBe(true);
    expect(countdown(60 * m + s).urgent).toBe(false);
    // Rung is not urgent — there is nothing left to hurry for.
    expect(countdown(0).urgent).toBe(false);
  });

  it("breaks the remainder out for a caller that wants its own layout", () => {
    const c = countdown(2 * d + 5 * h + 12 * m + 4 * s);
    expect([c.days, c.hours, c.mins, c.secs]).toEqual([2, 5, 12, 4]);
  });
});

describe("countdownTick", () => {
  it("ticks every second once the seconds are moving", () => {
    expect(countdownTick(59 * 60 * 1000)).toBe(1000);
    expect(countdownTick(0)).toBe(1000);
  });

  it("drops to every thirty seconds above an hour, where the label cannot change faster", () => {
    expect(countdownTick(60 * 60 * 1000 + 1)).toBe(30_000);
    expect(countdownTick(3 * 24 * 60 * 60 * 1000)).toBe(30_000);
    expect(countdownTick(Infinity)).toBe(30_000);
  });
});

describe("the opening bell", () => {
  const bell = new Date(2026, 7, 14, 7, 0).getTime();
  const win = (over) => marketWindows({ holeData: {}, players, numRounds: 4, firstTeeAt: bell, ...over }).opening;

  it("is open right up to the tee time", () => {
    expect(win({ now: bell - 60_000 })).toMatchObject({ open: true, closed: false });
  });

  it("shuts ON the tee time, not a minute after", () => {
    expect(win({ now: bell })).toMatchObject({ open: false, closed: true });
    // One closed sentence whatever shut it — the bell or the first score.
    expect(win({ now: bell }).note).toMatch(/tournament in progress/i);
  });

  it("stays shut once the field is out", () => {
    expect(win({ now: bell + 3 * 3600_000 }).open).toBe(false);
  });

  // The backstop. A tournament with no date or no tee sheet has no bell, so
  // the old rule still has to close the window.
  it("falls back to the first score when there is no bell", () => {
    const noBell = { holeData: { aaron_j_1: { 0: 4 } }, players, numRounds: 4 };
    expect(marketWindows(noBell).opening).toMatchObject({ open: false, closed: true });
    expect(marketWindows({ ...noBell, holeData: {} }).opening.open).toBe(true);
  });

  // And a round already being played must never leave the market open,
  // whatever the clock says — a wrong date must not hand the field a market
  // it can bet into from the 4th fairway.
  it("a score shuts it even if the bell has not rung", () => {
    expect(win({ now: bell - 3600_000, holeData: { aaron_j_1: { 0: 4 } } })).toMatchObject({ open: false });
  });

  it("carries the bell time so the screen can print it", () => {
    expect(win({ now: bell - 1 }).at).toBe(bell);
    expect(marketWindows({ holeData: {}, players, numRounds: 4 }).opening.at).toBeNull();
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
    { pid: "brad_k", opening: [{ pid: "brad_k", shares: 20 }], mid: [] },
    { pid: "cole_m", opening: [{ pid: "cole_m", shares: 20 }], mid: [] },
  ];

  it("keeps everybody still in the market game", () => {
    expect(eligibleBets({ bets, inMarket: () => true }).map(b => b.pid)).toEqual(["aaron_j", "brad_k", "cole_m"]);
  });

  it("drops a bettor the director has taken out of the market", () => {
    expect(eligibleBets({ bets, inMarket: pid => pid !== "cole_m" }).map(b => b.pid)).toEqual(["aaron_j", "brad_k"]);
  });

  it("leaves the halfway shares alone — they are open to everybody in", () => {
    expect(eligibleBets({ bets, inMarket: () => true })[0].mid).toEqual([{ pid: "cole_m", shares: 10 }]);
  });
});

describe("rebuyers", () => {
  it("is whoever placed into the second window — nobody tags it", () => {
    const bets = [
      { pid: "aaron_j", opening: [{ pid: "cole_m", shares: 20 }], mid: [{ pid: "cole_m", shares: 10 }] },
      { pid: "brad_k", opening: [{ pid: "brad_k", shares: 20 }], mid: [] },
      { pid: "cole_m", opening: [], mid: [{ pid: "brad_k", shares: 1 }] },
    ];
    expect(rebuyers(bets)).toEqual(["aaron_j", "cole_m"]);
  });

  it("charges a seat, not a share — one counts the same as ten", () => {
    const one = rebuyers([{ pid: "a", mid: [{ pid: "x", shares: 1 }] }]);
    const ten = rebuyers([{ pid: "a", mid: [{ pid: "x", shares: 10 }] }]);
    expect(one).toEqual(ten);
  });

  it("drops off again when every share is taken back", () => {
    expect(rebuyers([{ pid: "a", mid: [{ pid: "x", shares: 0 }] }])).toEqual([]);
    expect(rebuyers([{ pid: "a", mid: [] }])).toEqual([]);
    expect(rebuyers([{ pid: "a" }])).toEqual([]);
  });

  it("ignores the opening window entirely", () => {
    expect(rebuyers([{ pid: "a", opening: [{ pid: "x", shares: 20 }], mid: [] }])).toEqual([]);
  });

  it("is empty before anybody bets", () => {
    expect(rebuyers([])).toEqual([]);
    expect(rebuyers(null)).toEqual([]);
  });
});

describe("marketRoster", () => {
  const bets = [
    { pid: "cole_m", opening: [{ pid: "aaron_j", shares: 20 }], mid: [{ pid: "aaron_j", shares: 4 }] },
    { pid: "aaron_j", opening: [{ pid: "brad_k", shares: 12 }], mid: [] },
  ];

  it("counts each window without saying what it was placed on", () => {
    const { rows } = marketRoster({ players, bets });
    expect(rows).toEqual([
      { pid: "aaron_j", name: "Aaron", opening: 12, mid: 0, placed: 12 },
      { pid: "brad_k", name: "Brad", opening: 0, mid: 0, placed: 0 },
      { pid: "cole_m", name: "Cole", opening: 20, mid: 4, placed: 24 },
    ]);
  });

  // The gap this exists to close: marketHoldings only knows about people who
  // have already bet, so the man who never opened the app was missing from
  // the one screen meant to chase him.
  it("lists a player who has placed nothing at all", () => {
    const { rows } = marketRoster({ players, bets });
    expect(rows.find(r => r.pid === "brad_k")).toMatchObject({ placed: 0 });
  });

  it("counts who is still outstanding", () => {
    expect(marketRoster({ players, bets }).outstanding).toBe(1);
    expect(marketRoster({ players, bets: [] }).outstanding).toBe(3);
    expect(marketRoster({ players: [], bets }).outstanding).toBe(0);
  });

  it("is alphabetical, because it is read by looking for a name", () => {
    const shuffled = [players[2], players[0], players[1]];
    expect(marketRoster({ players: shuffled, bets }).rows.map(r => r.name)).toEqual(["Aaron", "Brad", "Cole"]);
  });

  it("survives missing arguments", () => {
    expect(marketRoster({})).toEqual({ rows: [], outstanding: 0 });
  });
});

describe("openingSharesLeft", () => {
  it("is the full twenty for somebody who has never opened the book", () => {
    expect(openingSharesLeft([], "aaron_j")).toBe(20);
    expect(openingSharesLeft(null, "aaron_j")).toBe(20);
  });

  it("counts down as the book fills", () => {
    const bets = [{ pid: "aaron_j", opening: [{ pid: "brad_k", shares: 12 }, { pid: "cole_m", shares: 3 }] }];
    expect(openingSharesLeft(bets, "aaron_j")).toBe(5);
  });

  it("is zero once the window is spent", () => {
    const bets = [{ pid: "aaron_j", opening: [{ pid: "brad_k", shares: 20 }] }];
    expect(openingSharesLeft(bets, "aaron_j")).toBe(0);
  });

  it("ignores the halfway lots — they are a different window", () => {
    const bets = [{ pid: "aaron_j", opening: [{ pid: "brad_k", shares: 20 }], mid: [{ pid: "cole_m", shares: 4 }] }];
    expect(openingSharesLeft(bets, "aaron_j")).toBe(0);
  });

  it("never goes negative on a hand-edited document", () => {
    const bets = [{ pid: "aaron_j", opening: [{ pid: "brad_k", shares: 40 }] }];
    expect(openingSharesLeft(bets, "aaron_j")).toBe(0);
  });

  it("does not confuse one player's book for another's", () => {
    const bets = [{ pid: "brad_k", opening: [{ pid: "cole_m", shares: 20 }] }];
    expect(openingSharesLeft(bets, "aaron_j")).toBe(20);
  });
});

describe("the halfway bell", () => {
  const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
  const bell = at(2026, 8, 16, 7, 0);
  // Rounds 1 and 2 in the book, so the halfway window has opened.
  const played = { aaron_j_1: card(), brad_k_1: card(), aaron_j_2: card(), brad_k_2: card() };
  const win = (over) => marketWindows({ holeData: played, players, numRounds: 4, midTeeAt: bell, ...over }).mid;

  it("is open right up to Round 3's tee time", () => {
    expect(win({ now: bell - 60_000 })).toMatchObject({ open: true, closed: false });
  });

  it("shuts ON that tee time", () => {
    expect(win({ now: bell })).toMatchObject({ open: false, closed: true });
    expect(win({ now: bell }).note).toMatch(/under way/i);
  });

  it("falls back to the first score of Round 3 when there is no bell", () => {
    const noBell = { holeData: { ...played, aaron_j_3: { 0: 4 } }, players, numRounds: 4 };
    expect(marketWindows(noBell).mid).toMatchObject({ open: false, closed: true });
    expect(marketWindows({ holeData: played, players, numRounds: 4 }).mid.open).toBe(true);
  });

  it("says what it is counting to when a bell is set", () => {
    expect(win({ now: bell - 3600_000 }).note).toMatch(/tees off/i);
    expect(win({ now: bell - 3600_000 }).at).toBe(bell);
  });

  it("is still shut before Round 2 is finished, bell or no bell", () => {
    const early = marketWindows({ holeData: {}, players, numRounds: 4, midTeeAt: bell, now: bell - 86400_000 }).mid;
    expect(early.open).toBe(false);
    expect(early.note).toMatch(/opens when round 2/i);
  });
});

describe("countdownTone", () => {
  const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
  const tee = at(2026, 8, 16, 7, 0);
  const tone = (now) => countdownTone(tee - now, tee, now);

  it("is far while the deadline is another day away", () => {
    expect(tone(at(2026, 8, 14, 9, 0))).toBe("far");
    // 8pm the night before is still tomorrow's problem.
    expect(tone(at(2026, 8, 15, 20, 0))).toBe("far");
  });

  it("turns amber on the calendar day of the tee time", () => {
    // Midnight on the morning of the round, six hours out.
    expect(tone(at(2026, 8, 16, 0, 30))).toBe("today");
    expect(tone(at(2026, 8, 16, 5, 0))).toBe("today");
  });

  it("turns red inside the last hour", () => {
    expect(tone(at(2026, 8, 16, 6, 1))).toBe("urgent");
    expect(tone(at(2026, 8, 16, 6, 59))).toBe("urgent");
  });

  it("takes the hour boundary exactly", () => {
    expect(tone(at(2026, 8, 16, 6, 0))).toBe("urgent");
    expect(tone(at(2026, 8, 16, 5, 59))).toBe("today");
  });

  it("is closed once the deadline has passed, or with nothing to count to", () => {
    expect(tone(tee)).toBe("closed");
    expect(tone(at(2026, 8, 16, 9, 0))).toBe("closed");
    expect(countdownTone(5000, null, Date.now())).toBe("closed");
    expect(countdownTone(5000, tee, null)).toBe("closed");
  });

  it("is urgent on a deadline that lands just after midnight, not merely today", () => {
    const midnightish = at(2026, 8, 16, 0, 30);
    expect(countdownTone(midnightish - at(2026, 8, 16, 0, 5), midnightish, at(2026, 8, 16, 0, 5))).toBe("urgent");
  });
});

// ── Betting without playing ────────────────────────────────────────
// The market's `in` list may name somebody with no roster row. These are the
// ids that come back as people, and — just as important — the ones that do not.
describe("marketOutsiders", () => {
  const roster = [{ id: "aaron_j", name: "Aaron" }, { id: "dave_s", name: "Dave" }];
  const registry = [
    { id: "aaron_j", name: "Aaron" },
    { id: "gus_p", name: "Gus" },
    { id: "hank_r", name: "Hank" },
  ];

  it("resolves the names of everybody in the market who is not playing", () => {
    const out = marketOutsiders({ ids: ["aaron_j", "dave_s", "hank_r", "gus_p"], roster, pool: registry });
    expect(out.map(p => p.name)).toEqual(["Gus", "Hank"]);
    expect(out.every(p => p.outside === true)).toBe(true);
  });

  // The flag is the whole contract with lib/sideGames: it is what keeps
  // "everybody is in for skins" from meaning a man who is not at the golf
  // course. A row without it would be billed for the whole sheet.
  it("marks every one of them outside the field", () => {
    expect(marketOutsiders({ ids: ["gus_p"], roster, pool: registry })).toEqual([{ id: "gus_p", name: "Gus", outside: true }]);
  });

  // A null list is the never-configured market, which means the FIELD and has
  // never meant anybody beyond it.
  it("returns nobody for a market nobody has configured", () => {
    expect(marketOutsiders({ ids: null, roster, pool: registry })).toEqual([]);
    expect(marketOutsiders({ ids: undefined, roster, pool: registry })).toEqual([]);
  });

  it("never returns somebody who is on the roster", () => {
    // Even if the pool offers him — a registry holds every player, playing or not.
    expect(marketOutsiders({ ids: ["aaron_j"], roster, pool: registry })).toEqual([]);
  });

  it("ignores an id nothing can name", () => {
    // An id with no registry row is a name nobody could print. Dropping it
    // beats a sheet row that reads "ghost_p" and bills somebody for it.
    expect(marketOutsiders({ ids: ["ghost_p"], roster, pool: registry })).toEqual([]);
  });

  it("lists a man once, however many times the pool holds him", () => {
    const dupes = [...registry, { id: "gus_p", name: "Gus" }];
    expect(marketOutsiders({ ids: ["gus_p"], roster, pool: dupes })).toHaveLength(1);
  });

  it("survives an empty everything", () => {
    expect(marketOutsiders({ ids: [] })).toEqual([]);
    expect(marketOutsiders({ ids: ["gus_p"], roster: null, pool: null })).toEqual([]);
  });
});
