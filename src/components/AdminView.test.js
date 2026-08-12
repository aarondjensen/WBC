/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the director's console actually appear?
// ══════════════════════════════════════════════════════════════════
//
// The same low-ceilinged, high-value question BettingView.test asks, and for
// the same reason it was written: this file is LAZY-LOADED, so its chunk is
// only fetched when a director taps Admin. A component used but never
// imported lints clean and builds clean, and nothing else in the project
// renders this one — the first person to find out would be a director on the
// 1st tee with a draw to set.
//
// It matters more here than anywhere else in the repo, because this view was
// three thousand lines inside App.jsx until it became its own file. Every
// module-level helper it used to sit beside — the tee palette, the calendar
// helpers, the portal, the registry — had to come with it or be passed in,
// and a single one left behind is a blank screen with a ReferenceError.
//
// So: mount it, click through all four sub-tabs, and mount the states nobody
// develops against — the empty tournament and the finished one.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";

vi.mock("../firebase", () => ({
  TOURNAMENT_ID: "wbc_2026",
  getTournamentYear: () => 2026,
  getEditionSlug: () => "2026",
  getActiveTournamentId: () => "wbc_2026",
}));

const { AdminView } = await import("./AdminView");

// jsdom implements no scrolling at all, and the round strip scrolls the
// selected round into view on every change. Not a thing under test — but an
// unstubbed call throws and takes the mount with it.
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

const COURSE = {
  id: "c1", name: "Treetops", slope: 130, rating: 72.4, par: 72,
  hole_pars: [4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5],
  hole_handicaps: Array.from({ length: 18 }, (_, i) => i + 1),
  tee_boxes: [
    { name: "Blue", color: "#3b82f6", slope: 130, rating: 72.4, par: 72, yardage: 6500 },
    { name: "White", color: "#ffffff", slope: 124, rating: 70.2, par: 72, yardage: 6100 },
  ],
};

const PLAYERS = [
  { id: "aaron_j", name: "Aaron J", handicap_index: 12 },
  { id: "dave_s", name: "Dave S", handicap_index: 8 },
  { id: "matt_r", name: "Matt R", handicap_index: 15 },
  { id: "pete_l", name: "Pete L", handicap_index: 4 },
];

const card = (base) => Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, base + (i % 3)]));

const baseProps = {
  registry: PLAYERS.map(p => ({ ...p, first_name: p.name.split(" ")[0], last_name: "" })),
  activePlayers: PLAYERS,
  marketPool: PLAYERS,
  sideGames: { skins: { amount: 20, in: null, pot: 0 }, ctp: { amount: 10, in: null } },
  onUpdateSideGames: vi.fn(),
  rebuyIds: [],
  tournament: { id: "wbc_2026", name: "WBC 2026", year: 2026, num_rounds: 2, status: "active" },
  tPlayers: PLAYERS.map(p => ({ id: `tp_${p.id}`, tournament_id: "wbc_2026", player_id: p.id, handicap_index: p.handicap_index, status: "active" })),
  tRounds: [
    { id: "r1", tournament_id: "wbc_2026", round_number: 1, course_id: "c1" },
    { id: "r2", tournament_id: "wbc_2026", round_number: 2, course_id: "c1" },
  ],
  courses: [COURSE],
  setCourseForRound: vi.fn(), addCourse: vi.fn(), addPlayerToTournament: vi.fn(),
  updateHI: vi.fn(), updateName: vi.fn(), removePlayer: vi.fn(),
  pairingsData: { 1: [["aaron_j", "dave_s", "matt_r", "pete_l"]] },
  setPairings: vi.fn(),
  teeData: { aaron_j_1: "Blue", dave_s_1: "Blue", matt_r_1: "White", pete_l_1: "White" },
  setTeeBulk: vi.fn(),
  teeTimesData: { 1: ["08:00"] }, setTeeTimesData: vi.fn(),
  roundDates: { 1: "2026-08-26" }, onSetRoundDate: vi.fn(),
  scoringOpen: {}, onSetScoringOpen: vi.fn(),
  pairingStrategy: {}, onSetPairingStrategy: vi.fn(),
  leaderboard: PLAYERS.map((p, i) => ({ ...p, rank: i + 1, total: 0, thru: 18 })),
  holeData: { aaron_j_1: card(4), dave_s_1: card(4) },
  finalizedRounds: {},
  onFinalizeRound: vi.fn(), onUnfinalizeRound: vi.fn(), onDiscardRoundScores: vi.fn(),
  notify: vi.fn(),
  getPlayerTee: () => COURSE.tee_boxes[0],
  startFresh: vi.fn(),
  externalSettingsOpen: false, externalSettingsTab: "players", externalSettingsRound: null,
  onExternalSettingsHandled: vi.fn(),
  teesSaved: {}, onTeesSave: vi.fn(), teesModified: {}, onTeesModify: vi.fn(),
  memberships: [], onSetDirector: vi.fn(), claims: {}, authUid: "uid_1",
  tournamentMeta: { name: "WBC 2026", location: "Gaylord, MI", startDate: "2026-08-26", endDate: "2026-08-29", rounds: 2 },
  onSaveTournamentMeta: vi.fn(),
};

const TABS = ["Players", "Rounds", "Betting", "Event"];

const mount = (props = {}) => render(h(AdminView, { ...baseProps, ...props }));

describe("AdminView renders", () => {
  it("mounts on its default tab", () => {
    mount();
    expect(screen.getByText("Rounds")).toBeTruthy();
  });

  it("renders every sub-tab", () => {
    mount();
    for (const tab of TABS) {
      fireEvent.click(screen.getByText(tab));
      // Nothing threw, and the console is still on screen after the switch.
      expect(screen.getByText(tab)).toBeTruthy();
    }
  });

  it("renders a tournament nobody has set up yet", () => {
    // The state a director is actually in the first time they open this: no
    // roster, no rounds, no courses, no draw. Every list here has to cope with
    // being empty, and this is the only place that checks.
    mount({
      registry: [], activePlayers: [], marketPool: [], tPlayers: [], tRounds: [],
      courses: [], pairingsData: {}, teeData: {}, teeTimesData: {}, roundDates: {},
      holeData: {}, leaderboard: [], tournamentMeta: null,
    });
    for (const tab of TABS) {
      fireEvent.click(screen.getByText(tab));
      expect(screen.getByText(tab)).toBeTruthy();
    }
  });

  it("renders a finished tournament", () => {
    // Every round signed off. The finalize controls, the discard guards and
    // the handicap lock all read differently here than mid-round.
    mount({
      finalizedRounds: { 1: true, 2: true },
      holeData: Object.fromEntries(PLAYERS.flatMap(p => [
        [`${p.id}_1`, card(4)], [`${p.id}_2`, card(5)],
      ])),
    });
    for (const tab of TABS) {
      fireEvent.click(screen.getByText(tab));
      expect(screen.getByText(tab)).toBeTruthy();
    }
  });

  it("opens on the tab the shell asks for", () => {
    // Admin is reachable from a nudge elsewhere in the app — "set this round's
    // course" jumps straight here — and that routing crosses the chunk
    // boundary now.
    mount({ externalSettingsOpen: true, externalSettingsTab: "players" });
    expect(screen.getByText("Players")).toBeTruthy();
  });
});
