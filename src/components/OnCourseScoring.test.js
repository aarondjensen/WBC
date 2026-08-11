/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the scoring screen appear?
// ══════════════════════════════════════════════════════════════════
//
// Same narrow question BettingView.test.js asks, for the screen it matters
// most on. This one is held on a tee box by somebody with a glove on, and it
// is the only screen whose failure stops the tournament rather than
// inconveniencing it.
//
// It does not check what the scores add up to — lib/individualBoard and
// lib/scoringGate own that and have their own suites. It checks that the
// screen renders, in the states a round actually passes through: before the
// gate opens, mid-round, on a completed card, on a round nobody has drawn, and
// with no course assigned at all.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement as h } from "react";
import { OnCourseScoring } from "./OnCourseScoring";
import { localDateISO } from "../lib/format";

afterEach(cleanup);

const COURSE = {
  id: "c1", name: "Treetops", slope: 130, rating: 72.4, par: 72,
  hole_pars: [4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5],
  hole_handicaps: Array.from({ length: 18 }, (_, i) => i + 1),
  tee_boxes: [{ name: "Blue", color: "#2d8fd4", slope: 130, rating: 72.4, par: 72 }],
};

const PLAYERS = [
  { id: "aaron_j", name: "Aaron J", handicap_index: 12 },
  { id: "dave_s", name: "Dave S", handicap_index: 8 },
];

// `thru` holes posted for both players.
const cards = (thru) => Object.fromEntries(PLAYERS.map(p =>
  [`${p.id}_1`, Object.fromEntries(Array.from({ length: thru }, (_, i) => [i, 4]))]));

// Today, so the gate's date check passes and the screen is live rather than
// waiting. The tee time is early enough that scoring is open.
const TODAY = localDateISO();

const baseProps = {
  user: { id: "aaron_j", name: "Aaron J", isDirector: false },
  players: PLAYERS,
  round: 1,
  tRounds: [{ round_number: 1, course_id: "c1" }],
  courses: [COURSE],
  holeData: cards(4),
  tPlayers: PLAYERS.map(p => ({ player_id: p.id, handicap_index: p.handicap_index, status: "active" })),
  onSaveHole: vi.fn(),
  notify: vi.fn(),
  pairingsData: { 1: [["aaron_j", "dave_s"]] },
  teeTimesData: { 1: ["7:00 AM"] },
  roundDates: { 1: TODAY },
  scoringOpen: { 1: true },
  setTee: vi.fn(),
  getPlayerTee: () => COURSE.tee_boxes[0],
  getPlayerCH: () => null,
  finalizedRounds: {},
  scorecardSigs: {},
  onSignScorecard: vi.fn(),
  onAttestScorecard: vi.fn(),
  onUnsignScorecard: vi.fn(),
  onFinalizeRound: vi.fn(),
  onUnfinalizeRound: vi.fn(),
  onGoToAdminCourses: vi.fn(),
  markPlayerWD: vi.fn(),
  ctpData: {},
  onSetCtp: vi.fn(),
  onConfirmCtp: vi.fn(),
  directorPick: null,
  onGroupChange: vi.fn(),
  onSetRound: vi.fn(),
};

const mount = (extra = {}) => render(h(OnCourseScoring, { ...baseProps, ...extra }));
const rendered = () => document.body.textContent || "";

describe("OnCourseScoring renders", () => {
  it("mounts mid-round with a card in progress", () => {
    mount();
    expect(rendered().length).toBeGreaterThan(0);
    expect(screen.getByText("Aaron J")).toBeTruthy();
  });

  it("mounts on a fresh card with nothing posted", () => {
    mount({ holeData: {} });
    expect(rendered().length).toBeGreaterThan(0);
  });

  it("mounts on a completed card, which opens the finalize path", () => {
    mount({ holeData: cards(18) });
    expect(rendered().length).toBeGreaterThan(0);
  });

  it("mounts on a signed card awaiting attestation", () => {
    mount({
      holeData: cards(18),
      scorecardSigs: { "1_aaron_j,dave_s": { signedBy: "dave_s", signedByName: "Dave S", attestedBy: [], present: ["aaron_j", "dave_s"] } },
    });
    expect(rendered().length).toBeGreaterThan(0);
  });

  it("mounts on a finalized round", () => {
    mount({ holeData: cards(18), finalizedRounds: { 1: true } });
    expect(rendered().length).toBeGreaterThan(0);
  });

  // The gate shut: the round is not today. A closed door is still a screen.
  it("mounts with scoring not yet open", () => {
    mount({ scoringOpen: {}, roundDates: { 1: "2026-01-01" } });
    expect(rendered().length).toBeGreaterThan(0);
  });

  it("mounts for a director, who is never gated", () => {
    mount({
      user: { id: "aaron_j", name: "Aaron J", isDirector: true },
      scoringOpen: {}, roundDates: {},
    });
    expect(rendered().length).toBeGreaterThan(0);
  });

  // A round nobody has drawn yet — the app's state for most of the year.
  it("mounts with no pairings for the round", () => {
    mount({ pairingsData: {}, holeData: {} });
    expect(rendered().length).toBeGreaterThan(0);
  });

  // The director has not assigned a course. This screen has a dedicated card
  // for it that deep-links into Admin.
  it("mounts with no course assigned", () => {
    mount({ tRounds: [], courses: [], holeData: {} });
    expect(rendered().length).toBeGreaterThan(0);
  });

  it("mounts with a withdrawn player in the group", () => {
    mount({
      tPlayers: [
        { player_id: "aaron_j", handicap_index: 12, status: "active" },
        { player_id: "dave_s", handicap_index: 8, status: "WD" },
      ],
      holeData: { ...cards(4), dave_s_1: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, i < 4 ? 4 : 99])) },
    });
    expect(rendered().length).toBeGreaterThan(0);
  });

  // A par 3 with a standing tag — the CTP prompt's inputs.
  it("mounts with a closest-to-the-pin already tagged", () => {
    mount({
      ctpData: { 1: { 2: { playerId: "dave_s", distanceFt: 12, distance: "12 ft", taggedByName: "Dave S", confirmedBy: [] } } },
    });
    expect(rendered().length).toBeGreaterThan(0);
  });

  it("mounts on a three-round event", () => {
    mount({ round: 3, tRounds: [{ round_number: 3, course_id: "c1" }], holeData: {}, pairingsData: { 3: [["aaron_j", "dave_s"]] }, roundDates: { 3: TODAY }, scoringOpen: { 3: true }, teeTimesData: { 3: ["7:00 AM"] } });
    expect(rendered().length).toBeGreaterThan(0);
  });
});

// ── Somebody who is not playing ────────────────────────────────────
// The market takes people who are not in this year's field — see lib/market
// marketOutsiders — and they sign in as themselves, which means this screen
// can be handed a `user` who is on no roster and in no group. It has nothing
// to show him, and "nothing to show" has to be a screen rather than a throw.
describe("OnCourseScoring for a player who is not in the field", () => {
  it("renders for a signed-in man with no roster row and no group", () => {
    render(h(OnCourseScoring, { ...baseProps, user: { id: "gus_p", name: "Gus P", isDirector: false } }));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });
});
