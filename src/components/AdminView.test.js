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
const { unfinalizeKeys } = await import("../lib/groupSwitch");

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

// "Test One" is not in the record books — see the player-editor tests, where
// the difference between a career and a name somebody typed decides whether
// the delete is offered at all.
const PLAYERS = [
  { id: "test_one", name: "Test One", handicap_index: 20 },
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
  deletePlayer: vi.fn(), editionsHolding: vi.fn(async () => []),
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

  // ── One door onto the editions ──
  // The Event tab used to open the SAME edition switcher More → Tournaments
  // opens, with the same New/clone/delete controls, three taps further in off
  // a sibling row of the same menu. It is a label now. What this guards is the
  // easy regression: somebody puts a switcher back and the app has two places
  // that create and delete tournament years again.
  it("names the active edition on Event without offering to switch it", () => {
    mount();
    fireEvent.click(screen.getByText("Event"));
    // Still says which year the fields under it are writing into — that is
    // what the card is for, and all it is for. No pointer back at the menu.
    expect(screen.getByText("Active edition")).toBeTruthy();
    // The id sits in its own accent span, so match that rather than the whole
    // "Edition \u00b7 wbc_2026" line — getByText reads an element's own text nodes.
    expect(screen.getByText("wbc_2026")).toBeTruthy();
    expect(screen.queryByText(/More \u203a Tournaments/)).toBeNull();
    // And no door: nothing on this tab opens the switcher.
    expect(screen.queryByText(/Open \/ clone a year/)).toBeNull();
    // "Tournaments" on its own is the switcher's heading — the state it opens
    // in. The label above reads "More \u203a Tournaments to change", which is a
    // different text node, so this is the sheet and not the sentence.
    expect(screen.queryByText("Tournaments")).toBeNull();
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

  // ── The way back out of a finalized round ──
  // The sheet's "↩ Unfinalize" hands ONE key up to the app, and the lock it is
  // clearing is not always that key: a round closed from the "Round N Complete"
  // prompt stores a bare ROUND NUMBER, so its groups read as final without
  // carrying a key of their own. This asserts the seam rather than the button —
  // whatever key the sheet hands up has to be one that actually unlocks this
  // card, which is what lib/groupSwitch unfinalizeKeys answers.
  //
  // That is the half nothing covered before: the sheet passed a group key that
  // was never in the map, the app deleted nothing, and the card stayed locked
  // with the tap doing nothing at all — green everywhere, because the button
  // and what the app does with its key had never been asked about together.
  const openFinalizeSheet = (props) => {
    // The sheet is reached from the banner, which needs a round whose draw is
    // complete and unfinalized — so round 2 is the one being closed out, and
    // round 1 is the one already finalized by number.
    mount({
      finalizedRounds: { 1: true },
      pairingsData: {
        1: [["aaron_j", "dave_s", "matt_r", "pete_l"]],
        2: [["aaron_j", "dave_s", "matt_r", "pete_l"]],
      },
      holeData: Object.fromEntries(PLAYERS.flatMap(p => [
        [`${p.id}_1`, card(4)], [`${p.id}_2`, card(5)],
      ])),
      ...props,
    });
    fireEvent.click(screen.getByText(/Round ready to finalize/));
  };

  it("hands up a key that actually unlocks a round finalized from Admin", () => {
    const onUnfinalizeRound = vi.fn();
    openFinalizeSheet({ onUnfinalizeRound });
    // Round 1's group is final — by the round's key, not its own.
    const [unfinalize] = screen.getAllByText(/Unfinalize/);
    fireEvent.click(unfinalize);
    expect(onUnfinalizeRound).toHaveBeenCalled();
    const key = onUnfinalizeRound.mock.calls[0][0];
    expect(unfinalizeKeys({ 1: true }, key)).toEqual(["1"]);
  });

  it("still offers Finalize for the round being closed out", () => {
    const onFinalizeRound = vi.fn();
    openFinalizeSheet({ onFinalizeRound });
    const finalize = screen.getAllByText(/Finalize$/).find(el => el.closest("button"));
    fireEvent.click(finalize);
    expect(onFinalizeRound).toHaveBeenCalled();
  });

  // ── The player editor ──
  // Where both halves of "delete a player" are decided: whether the button is
  // there at all, and what the confirmation promises before it runs. A career
  // is not deletable from a phone at a golf course, and the enforcement that
  // matters most is the one that never draws the button.
  const openPlayer = (name) => {
    fireEvent.click(screen.getByText("Players"));
    fireEvent.click(screen.getByText(name));
  };

  it("offers Delete for a player the record books don't know", async () => {
    mount();
    openPlayer("Test One");
    expect(screen.getByText("Move to inactive")).toBeTruthy();
    expect(screen.getByText("Delete player")).toBeTruthy();
  });

  it("offers only Move to inactive for a career", () => {
    // Aaron J has fourteen years behind that id. Deleting the record would cut
    // every one of those rounds loose from his name.
    mount();
    openPlayer("Aaron J");
    expect(screen.getByText("Move to inactive")).toBeTruthy();
    expect(screen.queryByText("Delete player")).toBeNull();
  });

  it("says what a delete takes before it runs", async () => {
    const deletePlayer = vi.fn();
    mount({ deletePlayer, holeData: { test_one_1: card(4) } });
    openPlayer("Test One");
    fireEvent.click(screen.getByText("Delete player"));
    // The confirmation is raised behind an await — the other-edition check
    // is a read, and a refusal there is the whole point of taking it.
    expect(await screen.findByText("Delete Test One?")).toBeTruthy();
    expect(screen.getByText(/18 scored holes/)).toBeTruthy();
    expect(deletePlayer).not.toHaveBeenCalled();
  });

  it("lists records off the roster so a demo name can still be deleted", async () => {
    // The gap this closes: a player moved to inactive has no roster row, so the
    // editor above cannot open him at all. Without this list a demo name is
    // visible in the returning picker forever and removable only from the
    // Firebase console.
    const deletePlayer = vi.fn();
    mount({
      deletePlayer,
      registry: [...baseProps.registry, { id: "junk_one", name: "Junk One", first_name: "Junk", last_name: "One" }],
    });
    fireEvent.click(screen.getByText("Players"));
    expect(screen.getByText("Junk One")).toBeTruthy();
    fireEvent.click(screen.getByText("Delete"));
    expect(await screen.findByText("Delete Junk One?")).toBeTruthy();
  });

  it("refuses when the player is on another edition's roster", async () => {
    const notify = vi.fn();
    const deletePlayer = vi.fn();
    mount({ notify, deletePlayer, editionsHolding: vi.fn(async () => ["wbc_2027"]) });
    openPlayer("Test One");
    fireEvent.click(screen.getByText("Delete player"));
    await vi.waitFor(() => expect(notify).toHaveBeenCalled());
    expect(notify.mock.calls[0][0]).toContain("2027");
    expect(deletePlayer).not.toHaveBeenCalled();
  });

  it("opens on the tab the shell asks for", () => {
    // Admin is reachable from a nudge elsewhere in the app — "set this round's
    // course" jumps straight here — and that routing crosses the chunk
    // boundary now.
    mount({ externalSettingsOpen: true, externalSettingsTab: "players" });
    expect(screen.getByText("Players")).toBeTruthy();
  });
});
