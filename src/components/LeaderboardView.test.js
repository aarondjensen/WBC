/** @vitest-environment jsdom */
// Does the board appear? Same narrow question as the other two mount tests.
//
// The ranking itself is lib/individualBoard's, with its own suite — this
// component is handed an already-ordered board and draws it. What is tested
// here is the drawing, in the states the board passes through across a
// tournament: nothing posted, mid-round, finished, a withdrawal, ties, and the
// expanded scorecard behind a row.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { LeaderboardView } from "./LeaderboardView";

afterEach(cleanup);

const COURSE = {
  id: "c1", name: "Treetops", slope: 130, rating: 72.4, par: 72,
  hole_pars: [4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5],
  hole_handicaps: Array.from({ length: 18 }, (_, i) => i + 1),
  tee_boxes: [{ name: "Blue", color: "#2d8fd4", slope: 130, rating: 72.4, par: 72 }],
};

const card = (n, s = 4) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, s]));

// Already ranked, the way computeIndividualBoard + rankIndividualBoard hand it over.
const row = (id, name, net, extra = {}) => ({
  id, name, handicap_index: 12,
  totalNetToPar: net, totalGrossToPar: net + 12, totalGross: 84,
  roundsPlayed: 1, totalThru: 18, withdrew: false, isWD: false,
  rds: [{ netToPar: net, thru: 18, wd: false }, { netToPar: null, thru: 0, wd: false },
        { netToPar: null, thru: 0, wd: false }, { netToPar: null, thru: 0, wd: false }],
  ...extra,
});

const baseProps = {
  lb: [row("aaron_j", "Aaron J", -2), row("dave_s", "Dave S", 1)],
  round: 1,
  holeData: { aaron_j_1: card(18), dave_s_1: card(18, 5) },
  tRounds: [{ round_number: 1, course_id: "c1" }],
  courses: [COURSE],
  tPlayers: [
    { player_id: "aaron_j", handicap_index: 12, status: "active" },
    { player_id: "dave_s", handicap_index: 8, status: "active" },
  ],
  getPlayerTee: () => COURSE.tee_boxes[0],
  getPlayerCH: () => null,
  finalizedRounds: {},
  skinWins: { aaron_j: 2 },
  pairingsData: { 1: [["aaron_j", "dave_s"]] },
  teeTimesData: { 1: ["8:00 AM"] },
  loaded: true,
};

const mount = (extra = {}) => render(h(LeaderboardView, { ...baseProps, ...extra }));
const rendered = () => document.body.textContent || "";

describe("LeaderboardView renders", () => {
  it("draws the board with players on it", () => {
    mount();
    expect(screen.getByText("Aaron J")).toBeTruthy();
    expect(screen.getByText("Dave S")).toBeTruthy();
  });

  // The gate that stops "no scores yet" flashing up before the roster lands —
  // and the exact state the roster outage left the app stuck in.
  it("says nothing while the roster is still loading", () => {
    mount({ lb: [], loaded: false });
    expect(rendered()).not.toMatch(/no scores yet/i);
  });

  it("says so once loaded with nobody on the board", () => {
    mount({ lb: [], loaded: true });
    expect(rendered()).toMatch(/no scores yet/i);
  });

  it("draws a round nobody has played", () => {
    mount({ holeData: {}, lb: [row("aaron_j", "Aaron J", 0, { roundsPlayed: 0, totalThru: 0, rds: [] })] });
    expect(rendered().length).toBeGreaterThan(0);
  });

  it("draws a withdrawal, which ranks last rather than disappearing", () => {
    mount({ lb: [...baseProps.lb, row("finn_w", "Finn W", 0, { isWD: true, withdrew: true, roundsPlayed: 0 })] });
    expect(screen.getByText("Finn W")).toBeTruthy();
  });

  it("draws a tie", () => {
    mount({ lb: [row("aaron_j", "Aaron J", -2), row("dave_s", "Dave S", -2)] });
    expect(rendered().length).toBeGreaterThan(0);
  });

  it("draws a finalized tournament", () => {
    mount({ finalizedRounds: { 1: true, 2: true, 3: true, 4: true } });
    expect(rendered().length).toBeGreaterThan(0);
  });

  it("switches between net and gross, and to-par and total", () => {
    mount();
    fireEvent.click(screen.getByText("Gross"));
    fireEvent.click(screen.getByText("Total"));
    expect(rendered().length).toBeGreaterThan(0);
  });

  // Tapping a row opens that player's card, which is a whole second render
  // path — its own grid, its own stroke dots, its own front/back totals.
  it("opens a player's scorecard", () => {
    mount();
    fireEvent.click(screen.getByText("Aaron J"));
    expect(rendered().length).toBeGreaterThan(0);
  });

  // And closes it again on the second tap. The card is wrapped in the grid
  // track it grows out of, so open and closed are two different trees.
  it("closes the scorecard on a second tap", () => {
    mount();
    fireEvent.click(screen.getByText("Aaron J"));
    fireEvent.click(screen.getByText("Aaron J"));
    expect(rendered().length).toBeGreaterThan(0);
  });

  // The morning of a round, which is the state the row is tightest in: one
  // group is out (so the round is "in play" and Thru switches to today), and
  // everybody still waiting holds a TEE TIME in the column beside a total they
  // already have from the round before.
  it("draws a round in play, with tee times beside the totals", () => {
    mount({
      round: 2,
      tRounds: [{ round_number: 1, course_id: "c1" }, { round_number: 2, course_id: "c1" }],
      // Two groups: the first is out on the course, the second still waiting.
      teeTimesData: { 2: ["7:00 AM", "10:24 AM"] },
      pairingsData: { 2: [["aaron_j"], ["dave_s"]] },
      lb: [
        row("aaron_j", "A Jensen", -2, { rds: [{ netToPar: -2, thru: 18, wd: false }, { netToPar: null, thru: 9, wd: false }, { netToPar: null, thru: 0, wd: false }, { netToPar: null, thru: 0, wd: false }] }),
        row("dave_s", "D Smith", 1, { rds: [{ netToPar: 1, thru: 18, wd: false }, { netToPar: null, thru: 0, wd: false }, { netToPar: null, thru: 0, wd: false }, { netToPar: null, thru: 0, wd: false }] }),
      ],
    });
    expect(screen.getByText("A Jensen")).toBeTruthy();
    expect(rendered()).toMatch(/10:24/);
  });

  it("draws a board with no course assigned yet", () => {
    mount({ tRounds: [], courses: [], holeData: {} });
    expect(rendered().length).toBeGreaterThan(0);
  });
});
