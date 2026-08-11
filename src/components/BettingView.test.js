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
};

const mount = (extra = {}) => render(h(BettingView, { ...baseProps, ...extra }));

const TABS = ["Skins", "CTP", "Low Net", "Market"];

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
