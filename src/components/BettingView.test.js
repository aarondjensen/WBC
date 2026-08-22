/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does this screen actually render?
// ══════════════════════════════════════════════════════════════════
//
// A test with a low ceiling and a very specific job. It does not check that
// the skins are right or the pot divides correctly — lib/sideGames and
// lib/market have their own suites for that, and they are where the money
// lives. This asks only the question nothing else in the repo could answer:
//
//   if somebody taps this tab, does a screen appear?
//
// It exists because the answer was no. Pulling this view out of App.jsx left
// two of its components behind, and every check in the project stayed green:
// `no-undef` cannot see JSX element names, the bundler does not resolve them,
// and no test had ever mounted the thing. The first person to find out was
// somebody tapping Betting and getting "can't find variable StickyTop".
//
// So every sub-tab gets mounted, because the missing component was inside one
// of them and a test that only rendered the default tab would have shipped it
// just the same.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { BettingView } from "./BettingView";

afterEach(cleanup);

// A tournament with enough in it that every branch has something to draw: two
// rounds on a real course with a par 3, two players, a card each, and a book.
const COURSE = {
  id: "c1", name: "Treetops", slope: 130, rating: 72.4, par: 72,
  hole_pars: [4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5],
  hole_handicaps: Array.from({ length: 18 }, (_, i) => i + 1),
  tee_boxes: [{ name: "Blue", color: "#3b82f6", slope: 130, rating: 72.4, par: 72 }],
};

const PLAYERS = [
  { id: "aaron_j", name: "Aaron J", handicap_index: 12 },
  { id: "dave_s", name: "Dave S", handicap_index: 8 },
];

const card = (base) => Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, base + (i % 3)]));

const baseProps = {
  players: PLAYERS,
  round: 1,
  numRounds: 2,
  tRounds: [{ round_number: 1, course_id: "c1" }, { round_number: 2, course_id: "c1" }],
  courses: [COURSE],
  holeData: { aaron_j_1: card(4), dave_s_1: card(4), aaron_j_2: card(5), dave_s_2: card(4) },
  ctpData: { 1: { 2: { playerId: "aaron_j", distanceFt: 14, distance: "14 ft", taggedByName: "Dave S", confirmedBy: [] } } },
  onSetCtp: vi.fn(),
  user: { id: "aaron_j", name: "Aaron J", isDirector: false },
  getPlayerTee: () => COURSE.tee_boxes[0],
  getPlayerCH: () => null,
  sideGames: {
    skins: { amount: 20, in: null, pot: 0, paid: [] },
    ctp: { amount: 10, in: null, paid: [] },
    lownet: { amount: 10, in: null, paid: [] },
    market: { amount: 25, in: null, paid: [] },
    rebuy: { amount: 25, in: null, paid: [] },
  },
  onUpdateSideGames: vi.fn(),
  marketBets: [{ pid: "aaron_j", opening: [{ pid: "dave_s", shares: 20 }], mid: [] }],
  onSaveMarketBet: vi.fn(),
  leaderboard: PLAYERS.map(p => ({ ...p, roundsPlayed: 2, totalNetToPar: 3, isWD: false, withdrew: false })),
  finalizedRounds: {},
  pairingsData: { 1: [["aaron_j", "dave_s"]] },
  firstTeeAt: null,
  marketNudge: false,
  teeTimesData: { 1: ["8:00 AM"], 2: ["8:00 AM"] },
  roundDates: { 1: "2026-08-26", 2: "2026-08-27" },
  // The fifth tab, which is a ledger rather than a game — see components/
  // SideBets. Its own suite covers what it says; what matters here is that it
  // is mounted alongside the other four, since it is the newest thing on the
  // tab and the one an import could most easily leave behind.
  sideBets: [{
    id: "sb1", tournament_id: "wbc_2026", created_by: "uid_aaron",
    player_a: "aaron_j", player_b: "dave_s", amount: 20,
    detail: "Low score on the back", settled_by: [], created_at: 1000,
  }],
  authUid: "uid_aaron",
  onAddSideBet: vi.fn(),
  onDeleteSideBet: vi.fn(),
  onSettleSideBet: vi.fn(),
};

const mount = (extra = {}) => render(h(BettingView, { ...baseProps, ...extra }));

const TABS = ["Skins", "CTP", "Low Net", "Market", "Side"];

describe("BettingView renders", () => {
  it("mounts on its default tab", () => {
    mount();
    expect(screen.getByText("Skins")).toBeTruthy();
  });

  // The one that would have caught the crash. StickyTop was missing and sits
  // above the tab switcher — so every tab, not just the default one.
  it.each(TABS)("opens the %s tab without throwing", (label) => {
    mount();
    fireEvent.click(screen.getByText(label));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  it("renders for a director, who sees the whole board", () => {
    mount({ user: { id: "aaron_j", name: "Aaron J", isDirector: true } });
    TABS.forEach(label => fireEvent.click(screen.getByText(label)));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  // A player holding only their own book — the shape lib/marketSeal hands over
  // on every non-director phone now that the market is sealed server-side.
  it("renders with only this player's own book", () => {
    mount({ marketBets: [{ pid: "aaron_j", opening: [{ pid: "dave_s", shares: 20 }], mid: [] }] });
    fireEvent.click(screen.getByText("Market"));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  it("renders with no bets placed at all", () => {
    mount({ marketBets: [] });
    TABS.forEach(label => fireEvent.click(screen.getByText(label)));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  // Opening night: an edition that has been created and nothing else. Every
  // one of these was a real empty state at some point in a tournament's life.
  it("renders a tournament with no course, no cards and no money", () => {
    mount({
      tRounds: [], courses: [], holeData: {}, ctpData: {}, marketBets: [],
      sideBets: [],
      pairingsData: {}, teeTimesData: {}, roundDates: {}, leaderboard: [],
      sideGames: {
        skins: { amount: 0, in: null, pot: 0, paid: [] },
        ctp: { amount: 0, in: null, paid: [] },
        lownet: { amount: 0, in: null, paid: [] },
        market: { amount: 0, in: null, paid: [] },
        rebuy: { amount: 0, in: null, paid: [] },
      },
    });
    TABS.forEach(label => fireEvent.click(screen.getByText(label)));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  it("renders once every round is complete and the market pays out", () => {
    mount({
      finalizedRounds: { 1: true, 2: true },
      user: { id: "aaron_j", name: "Aaron J", isDirector: true },
    });
    TABS.forEach(label => fireEvent.click(screen.getByText(label)));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  // A course with no par 3 has no pin to win, and a withdrawal has no round to
  // rank — two shapes that have each broken a golf screen somewhere.
  it("renders a course with no par 3, and a withdrawal", () => {
    const flat = { ...COURSE, hole_pars: Array.from({ length: 18 }, () => 4) };
    mount({
      courses: [flat],
      players: [PLAYERS[0], { ...PLAYERS[1], isWD: true }],
      leaderboard: [{ ...PLAYERS[0], roundsPlayed: 2, totalNetToPar: 3 }],
    });
    TABS.forEach(label => fireEvent.click(screen.getByText(label)));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });
});

// ── The man who is not playing ─────────────────────────────────────
//
// The market is a bet on who wins, so somebody off this year's roster can buy
// in and place a book. He reaches this screen the same way anybody does — he
// signs in as himself — and his own id is not on the roster, which is a shape
// nothing on this tab had ever been handed.
const GUS = { id: "gus_p", name: "Gus P" };
const withGus = (extra = {}) => mount({
  inactivePlayers: [{ ...GUS, note: "12 recorded · last played 2024" }],
  sideGames: { ...baseProps.sideGames, market: { amount: 25, in: ["aaron_j", "dave_s", "gus_p"], paid: [] } },
  ...extra,
});

describe("BettingView with a market-only player", () => {
  it("gives him a book on a tab whose roster he is not on", () => {
    withGus({ user: { id: "gus_p", name: "Gus P", isDirector: false } });
    fireEvent.click(screen.getByText("Market"));
    // His own sheet — not the "you are not in the market game" notice, which
    // is what an id the market could not resolve used to produce.
    expect(screen.getByText(/Your wagers|Wager shares|Wagered/)).toBeTruthy();
    expect(screen.queryByText(/not in the market/i)).toBeNull();
  });

  // What he must NOT be: a name on the sheet of golfers to back. Nothing he
  // does this week can win the tournament, because he is not in it.
  it("does not offer him as somebody to wager on", () => {
    withGus({ user: { id: "gus_p", name: "Gus P", isDirector: false } });
    fireEvent.click(screen.getByText("Market"));
    // His own name appears nowhere in the list of golfers — the other two do.
    expect(screen.getByText("Aaron J")).toBeTruthy();
    expect(screen.queryByText("Gus P")).toBeNull();
  });

  it("bills him on the director's collection sheet", () => {
    withGus({ user: { id: "aaron_j", name: "Aaron J", isDirector: true } });
    fireEvent.click(screen.getByText("Market"));
    fireEvent.click(screen.getByText(/^BUY-INS/));
    expect(screen.getByText(/NOT PLAYING/)).toBeTruthy();
    // Three in the market at $25, him included.
    expect(screen.getByText(/^3 IN/)).toBeTruthy();
  });

  it("still renders when nobody outside the field is in the market", () => {
    mount({ inactivePlayers: [{ ...GUS, note: "12 recorded" }] });
    TABS.forEach(label => fireEvent.click(screen.getByText(label)));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  // An id in the market that nothing can name — a registry row deleted, or a
  // roster rebuilt under a different edition. It must not print a raw id.
  it("ignores a market id no list can put a name to", () => {
    mount({ sideGames: { ...baseProps.sideGames, market: { amount: 25, in: ["aaron_j", "ghost_p"], paid: [] } } });
    fireEvent.click(screen.getByText("Market"));
    expect(screen.queryByText("ghost_p")).toBeNull();
  });
});

// ── The halfway ten, for somebody who is not playing ───────────────
//
// The second window is the whole point of the market — twenty shares are a
// guess, and the halfway ten are a correction bought with two rounds of
// evidence. A man in the market without playing gets both, for the same
// reason he gets the first: the game is picking a winner, and he watched the
// same two rounds everybody else did.
//
// Round 1 and 2 in, round 3 untouched: the halfway window is open.
const HALFWAY = Object.fromEntries(PLAYERS.flatMap(p =>
  [[`${p.id}_1`, card(4)], [`${p.id}_2`, card(4)]]));

const atHalfway = (extra = {}) => mount({
  numRounds: 4,
  round: 3,
  tRounds: [1, 2, 3, 4].map(n => ({ round_number: n, course_id: "c1" })),
  holeData: HALFWAY,
  teeTimesData: {}, roundDates: {},
  inactivePlayers: [{ ...GUS, note: "12 recorded · last played 2024" }],
  sideGames: {
    ...baseProps.sideGames,
    market: { amount: 25, in: ["aaron_j", "dave_s", "gus_p"], paid: [] },
    rebuy: { amount: 25, in: null, paid: [] },
  },
  marketBets: [],
  ...extra,
});

describe("the halfway window for a market-only player", () => {
  const asGus = { user: { id: "gus_p", name: "Gus P", isDirector: false } };

  it("opens the second window to him and says what it will cost", () => {
    atHalfway(asGus);
    fireEvent.click(screen.getByText("Market"));
    expect(screen.getByText(/After Round 2/)).toBeTruthy();
    // The rebuy is INCURRED by placing, so the price is said before the first
    // tap rather than after it.
    expect(screen.getByText(/puts you in for the \$25 rebuy/)).toBeTruthy();
  });

  it("takes his ten and saves them to the halfway window", () => {
    const onSaveMarketBet = vi.fn();
    atHalfway({ ...asGus, onSaveMarketBet });
    fireEvent.click(screen.getByText("Market"));
    // Five on one golfer, five on the other, through the same steppers the
    // field uses.
    const plus5 = screen.getAllByText("+5");
    fireEvent.click(plus5[0]);
    fireEvent.click(plus5[1]);
    fireEvent.click(screen.getByText("Wager shares"));
    expect(onSaveMarketBet).toHaveBeenCalledWith("gus_p", expect.objectContaining({
      mid: [{ pid: "aaron_j", shares: 5 }, { pid: "dave_s", shares: 5 }],
    }));
  });

  // Placing is what takes on the rebuy, so the money has to follow him onto
  // the sheet without anybody tagging anything.
  it("bills him the rebuy the moment he places, like anybody else", () => {
    atHalfway({
      user: { id: "aaron_j", name: "Aaron J", isDirector: true },
      marketBets: [{ pid: "gus_p", opening: [], mid: [{ pid: "aaron_j", shares: 10 }] }],
    });
    fireEvent.click(screen.getByText("Market"));
    fireEvent.click(screen.getByText(/^BUY-INS/));
    // $25 market + $25 rebuy, on a man who is in no other buy-in.
    const row = screen.getByText(/NOT PLAYING/).closest("div");
    expect(row.lastChild.textContent).toBe("$50");
    // And the pot he is betting into grew by his rebuy: three seats at $25,
    // plus the one halfway seat that has been taken so far.
    expect(screen.getByText("$100")).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════
//  A hole nobody has played is a dash, not "00"
// ══════════════════════════════════════════════════════════════════
//
// The skins card printed "00" on every hole the field had not reached yet.
//
// It is React's oldest trap and it took a director noticing it on a live
// board. An unplayed hole normalises to the NUMBER 0, and the cell drew its
// circles with `{s && …}` — `0 && <div/>` evaluates to 0, and React renders
// the number 0 rather than nothing, the way `false`, `null` and `undefined`
// all do. Two such lines per cell, so two zeros, sitting in front of the dash
// the cell was correctly choosing.
//
// Nothing else could have caught it: the arithmetic in lib/sideGames was
// right — computeSkins reports an unplayed hole as no winner and no score —
// and the mount tests rendered a tournament where every hole was played.
const HALF_PLAYED = {
  aaron_j_1: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [i, 4])),
  dave_s_1: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [i, 5])),
};

// Scoped to the scorecard's own cells. A bare "0" elsewhere on the tab is
// legitimate — a skins count, a pot — and asserting against the whole screen
// would be testing the wrong thing and breaking on unrelated copy.
const scoreCells = () =>
  [...document.querySelectorAll("table td")].map(td => (td.textContent || "").trim());

describe("the skins card mid-round", () => {
  const openSkins = (extra) => {
    mount({ holeData: HALF_PLAYED, round: 1, ...extra });
    fireEvent.click(screen.getByText("Skins"));
  };

  it("draws no stray zero on the holes still to play", () => {
    openSkins();
    const cells = scoreCells();
    expect(cells.length).toBeGreaterThan(0);
    // A lone "0" is never a golf score, and "00" or "00–" is the bug exactly.
    expect(cells.filter(t => t === "0")).toHaveLength(0);
    expect(cells.filter(t => t.includes("00"))).toHaveLength(0);
  });

  it("still draws the dash it was choosing all along", () => {
    openSkins();
    expect(screen.queryAllByText("–").length).toBeGreaterThan(0);
  });

  // The scores that ARE posted must be untouched — a guard that hid the zero
  // by hiding the cell would pass the assertion above and lose the card.
  it("still shows the scores that have been posted", () => {
    openSkins();
    expect(screen.queryAllByText("4").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("5").length).toBeGreaterThan(0);
  });

  // And a round nobody has started at all takes the empty-state path rather
  // than drawing eighteen columns of zeros.
  it("says so when the round has no scores at all", () => {
    mount({ holeData: {}, round: 1 });
    fireEvent.click(screen.getByText("Skins"));
    // The empty-state card, not eighteen columns of zeros.
    expect(scoreCells().filter(t => t.includes("00"))).toHaveLength(0);
  });
});
