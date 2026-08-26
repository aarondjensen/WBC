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
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { createElement as h, useState } from "react";
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

  // The Full Scorecard is a whole second render path — its own grid, and the
  // ring-and-dots cell every other card in the app is now drawn from. Opened
  // on a part-played card, so it covers a hole with a score, a hole without
  // one, and the strokes that fall on both.
  it("opens the full scorecard", () => {
    mount();
    fireEvent.click(screen.getByText("Full Scorecard"));
    // One head per nine, and the legend that says what the rings mean.
    expect(screen.getAllByText("HOLE")).toHaveLength(2);
    expect(screen.getByText("Bogey+")).toBeTruthy();
  });

  it("opens the full scorecard on a round nobody has posted to", () => {
    mount({ holeData: {} });
    fireEvent.click(screen.getByText("Full Scorecard"));
    expect(screen.getAllByText("HOLE")).toHaveLength(2);
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

// ── A guest, looking around ────────────────────────────────────────
// Somebody who came in through the Guest button has no account and no name in
// the draw, so this screen resolves no group for them. It offers the picker
// instead — the same one a director gets, minus the button that finalizes a
// card — because the alternative is a permanent "waiting for pairings" on the
// one tab a tester most wants to open. Nothing they tap here is written: see
// lib/guestMode and the latch on the data layer.
describe("OnCourseScoring for a guest", () => {
  const GUEST = { id: "guest", name: "Guest", isDirector: false, isGuest: true };

  it("offers the draw to watch rather than a wait", () => {
    render(h(OnCourseScoring, { ...baseProps, user: GUEST }));
    expect(screen.getByText("Select Group to Watch")).toBeTruthy();
    expect(screen.getByText("Group 1")).toBeTruthy();
    expect(screen.getByText(/Thru 4/)).toBeTruthy();
  });

  it("opens a group's card when one is picked", () => {
    render(h(OnCourseScoring, { ...baseProps, user: GUEST }));
    fireEvent.click(screen.getByText("Group 1"));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  // The picker's one write. A finished card shows a director a Finalize
  // button beside the group; a guest must not be offered one, because the
  // write behind it would be swallowed and the tap would look broken.
  it("does not offer to finalize a completed card", () => {
    render(h(OnCourseScoring, { ...baseProps, user: GUEST, holeData: cards(18) }));
    expect(screen.queryByText("✓ Finalize")).toBeNull();
    expect(screen.getByText("18 ✓ Ready")).toBeTruthy();
  });

  it("renders on a round nobody has drawn", () => {
    render(h(OnCourseScoring, { ...baseProps, user: GUEST, pairingsData: {}, holeData: {} }));
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  // The one that cost a live round. A guest's taps land in local state and
  // stop there (lib/guestMode), so the card fills in, the totals move and the
  // leaderboard behind it re-ranks — on that device and no other. Somebody
  // whose sign-in bounced and who came in through the Live Leaderboard button
  // instead has no way to tell that apart from scoring, and the app-wide guest
  // strip is a header and a nav bar away from the buttons being pressed.
  it("says on the card itself that nothing typed here is saved", () => {
    render(h(OnCourseScoring, { ...baseProps, user: GUEST }));
    expect(screen.getByText("WATCHING — NOT SCORING")).toBeTruthy();
    fireEvent.click(screen.getByText("Group 1"));
    expect(screen.getByText(/Nothing typed here is saved/)).toBeTruthy();
    expect(screen.getByText(/Sign in to post scores/)).toBeTruthy();
  });

  it("says none of it to a player whose scores really do post", () => {
    mount();
    expect(screen.queryByText("WATCHING — NOT SCORING")).toBeNull();
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

// ══════════════════════════════════════════════════════════════════
//  A round nobody has played is not a finished round
// ══════════════════════════════════════════════════════════════════
//
// The bug this is written for: a director opened Scoring on a freshly cut
// edition and was handed the sign-your-scorecard prompt over a card with no
// scores in it, warning that every player was missing all eighteen holes.
//
// `allRoundComplete` asked `gPlayers.every(everyHoleScored)` — and [].every()
// is TRUE. `group` comes from the pairings and `players` comes from the
// roster: two loads, arriving in either order. In the window where the draw
// has landed and the roster has not, every `players.find` answers undefined,
// `.filter(Boolean)` empties the list, and an empty list satisfies `.every`.
// The round read as finished, the effect jumped to hole 18 and scheduled the
// prompt, and by the time the 400ms timer fired the roster HAD arrived — so
// the card it opened over was fully populated and entirely blank.
//
// This is the shape CLAUDE.md names: a value derived from two things that load
// separately, and a test that lands them the slow way round.
//
// ── Two things these tests have to get right to be worth anything ──
// The prompt is a MODAL titled "Sign Scorecard — Round N". There is also a
// "✍️ Sign Scorecard" BUTTON on the screen all round, which is a legitimate
// manual affordance — asserting on /sign/i matches the button and can never
// fail. And the modal opens on a 400ms timer, so the timers must be advanced
// INSIDE act() or React never flushes the state change and the DOM read is
// stale. An earlier draft of this suite got both wrong and passed against the
// unfixed code.
const advance = async (ms = 1200) => {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
};
// The modal, never the button.
const signPrompt = () => screen.queryByText(/Sign Scorecard — Round/);

describe("the finish prompt and a half-loaded round", () => {
  // The exact mid-load state: the draw knows who is in the group, the roster
  // has not answered yet.
  it("does not call a round complete when the roster has not loaded", async () => {
    vi.useFakeTimers();
    try {
      mount({ players: [], tPlayers: [], holeData: {} });
      await advance();
      expect(signPrompt()).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  // Partly loaded is the same answer. One unresolved id might be a man with an
  // empty card, and "complete" is the guess that ends in a signed scorecard
  // nobody played.
  it("does not call it complete when only some of the group resolves", async () => {
    vi.useFakeTimers();
    try {
      mount({
        players: [PLAYERS[0]],
        tPlayers: [{ player_id: "aaron_j", handicap_index: 12, status: "active" }],
        holeData: { aaron_j_1: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, 4])) },
      });
      await advance();
      expect(signPrompt()).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  // ── The full outage, in order ──
  // Roster absent, prompt scheduled, roster arrives, prompt must not open. The
  // ref that guards the prompt is reset when completion goes false, but a ref
  // cannot recall a timeout already in flight — only the effect's cleanup can.
  it("cancels a scheduled prompt when the roster lands mid-delay", async () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(h(OnCourseScoring, {
        ...baseProps, players: [], tPlayers: [], holeData: {},
      }));
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      rerender(h(OnCourseScoring, { ...baseProps, holeData: {} }));
      await advance();
      expect(signPrompt()).toBeNull();
      // And no warning listing everybody as missing everything.
      expect(screen.queryByText(/Missing scores/i)).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  // ── The timer cleanup, on its own ──
  // The guard above stops the half-loaded case ever scheduling a prompt, so it
  // masks the second half of the fix. This exercises it directly: a card that
  // IS complete schedules the prompt, and something changes inside the 400ms
  // that makes it incomplete again — a score edited or discarded, a group
  // switched. Without the cleanup the prompt still opens, over a card that is
  // no longer finished.
  it("cancels the prompt when the card stops being complete inside the delay", async () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(h(OnCourseScoring, { ...baseProps, holeData: cards(18) }));
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
      // A hole goes away before the prompt lands.
      rerender(h(OnCourseScoring, { ...baseProps, holeData: cards(17) }));
      await advance();
      expect(signPrompt()).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  // The other direction still has to work: a genuinely finished card is what
  // the prompt exists for, and a guard that suppressed it would be the worse
  // bug — a group that cannot sign off.
  it("still opens the prompt on a card that really is complete", async () => {
    vi.useFakeTimers();
    try {
      mount({ holeData: cards(18) });
      await advance();
      expect(signPrompt()).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });
});

// ══════════════════════════════════════════════════════════════════
//  The closest-to-the-pin prompt.
// ══════════════════════════════════════════════════════════════════
//
// The one thing in this feature nothing had ever exercised. lib/ctp.test.js
// covers the rules — who beats whom, how a tie settles — and the rules were
// never where CTP broke. It broke in WHEN THE PROMPT FIRES, three times:
//
//   • the session guard was keyed without the group, so the first group to
//     answer silenced every group behind it
//   • a stuck editingCompleted flag did the same thing by a second route
//   • the sign-the-card sheet draws at zIndex 1000 and this at 350, so a card
//     completed ON a par 3 buried the question under an opaque sheet — and the
//     guard had already been consumed, so it never came back
//
// All three shipped with unit tests, lint and a build green, because the
// prompt is a popup behind a state machine and nothing had ever driven it.
//
// COURSE's hole_pars puts a par 3 at index 1 (hole 2), which is the hole these
// drive: post hole 1 for everybody, leave hole 2 open, and the screen lands on
// it the way a group walking up to a par 3 does.

const par3Props = {
  ...baseProps,
  holeData: Object.fromEntries(PLAYERS.map(p => [`${p.id}_1`, { 0: 4 }])),
};

// A live component that keeps its own scores, so posting a hole moves the
// screen the way it does on a tee box. A stubbed onSaveHole would leave the
// card unchanged and the prompt would never fire at all.
const Live = ({ start, ...extra }) => {
  const [holeData, setHoleData] = useState(start);
  return h(OnCourseScoring, {
    ...par3Props, ...extra, holeData,
    onSaveHole: (pid, rnd, hole, val) => setHoleData(prev => ({
      ...prev, [`${pid}_${rnd}`]: { ...(prev[`${pid}_${rnd}`] || {}), [hole]: val },
    })),
  });
};

const ctpPrompt = () => screen.queryByText("Closest to Pin");
// The score buttons carry the only stable names on this screen — the visible
// digits repeat all over the card, the aria-label does not.
const postHole = (name, score = 3) =>
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}, ${score},`) }));
const postAll = (score = 3) => PLAYERS.forEach(p => postHole(p.name, score));

describe("the CTP prompt", () => {
  it("asks the group who was closest when a par 3 completes", () => {
    render(h(Live, { start: par3Props.holeData }));
    expect(ctpPrompt()).toBeNull();
    postAll();
    expect(ctpPrompt()).toBeTruthy();
    expect(screen.getByText("Who was closest?")).toBeTruthy();
  });

  // The regression the comments describe twice. CTP is tournament-wide, so a
  // standing tag from an earlier group must NOT suppress the question — it is
  // the number to beat, and every group gets asked.
  it("still asks a later group when another group has already tagged it", () => {
    render(h(Live, {
      start: par3Props.holeData,
      ctpData: { 1: { 2: { playerId: "dave_s", distanceFt: 12, distance: "12 ft", taggedByName: "Dave S", confirmedBy: [], answeredGroups: ["1_x"] } } },
    }));
    postAll();
    expect(ctpPrompt()).toBeTruthy();
    expect(screen.getByText("Current CTP")).toBeTruthy();
    expect(screen.getByText("Who was closer?")).toBeTruthy();
  });

  // C1. A card finished ON a par 3 opened both this and the sign-the-card
  // sheet in the same commit, and the sheet — 650 z-index higher — covered the
  // question completely. The group never saw it and the guard was already
  // spent, so the pin was lost with every check green.
  it("holds the scorecard back until the pin question is answered", async () => {
    vi.useFakeTimers();
    try {
      // Everything in but the par 3, so posting it completes the card.
      const start = Object.fromEntries(PLAYERS.map(p => [`${p.id}_1`,
        Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i, 4]).filter(([i]) => i !== 1))]));
      render(h(Live, { start }));
      postAll(4);
      await advance();
      expect(ctpPrompt()).toBeTruthy();
      expect(signPrompt()).toBeNull();
      // Answering it lets the card through.
      fireEvent.click(screen.getByText("None of us — skip"));
      await advance();
      expect(ctpPrompt()).toBeNull();
      expect(signPrompt()).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  // C2. The guard is stamped on the ANSWER now, so a question closed without
  // one can be asked again — and a par 3 the group has finished carries the
  // way back to it.
  it("offers the question again on a par 3 the group has already scored", () => {
    const onSetCtp = vi.fn();
    render(h(Live, { start: par3Props.holeData, onSetCtp }));
    postAll();
    fireEvent.click(screen.getByText("None of us — skip"));
    expect(ctpPrompt()).toBeNull();
    fireEvent.click(screen.getByText(/Set closest to pin/));
    expect(ctpPrompt()).toBeTruthy();
  });

  // The other half of the guard: an answer really does settle it, so a group
  // walking back over its own par 3 is not nagged for a question it answered.
  it("does not re-ask a group that has answered", () => {
    render(h(Live, { start: par3Props.holeData }));
    postAll();
    fireEvent.click(screen.getByText("None of us — skip"));
    expect(ctpPrompt()).toBeNull();
    // Change a score on the hole and put it back — the effect re-evaluates
    // and must stay quiet.
    postHole("Aaron J", 4);
    postHole("Aaron J", 3);
    expect(ctpPrompt()).toBeNull();
  });

  it("records a pass as an answer rather than writing nothing at all", () => {
    const onPassCtp = vi.fn();
    render(h(Live, { start: par3Props.holeData, onPassCtp }));
    postAll();
    fireEvent.click(screen.getByText("None of us — skip"));
    expect(onPassCtp).toHaveBeenCalledWith(1, 2, { key: "1_aaron_j,dave_s", order: 0 });
  });

  it("confirms a standing tag with the group, not with whoever is holding the phone", () => {
    const onConfirmCtp = vi.fn();
    render(h(Live, {
      start: par3Props.holeData, onConfirmCtp,
      ctpData: { 1: { 2: { playerId: "dave_s", distanceFt: 12, distance: "12 ft", taggedByName: "Dave S", confirmedBy: [] } } },
    }));
    postAll();
    fireEvent.click(screen.getByText(/^Confirm —/));
    expect(onConfirmCtp).toHaveBeenCalledWith(1, 2, { key: "1_aaron_j,dave_s", order: 0 });
  });

  it("tags the pin with the claiming group and its tee order", () => {
    const onSetCtp = vi.fn();
    render(h(Live, { start: par3Props.holeData, onSetCtp }));
    postAll();
    fireEvent.click(screen.getByText("Aaron J", { selector: "button" }));
    // The wheel is null until it is spun, so Tag stays dead — a distance
    // nobody chose must never ride onto the card looking like one they did.
    expect(screen.getByText("Tag CTP").closest("button").disabled).toBe(true);
    expect(screen.getByText(/Spin the wheel/)).toBeTruthy();
  });

  // R3. The buy-in list lives in Betting, so a group used to tag a man who was
  // not in the game and find out four holes later from a director.
  it("marks a player who is not in the CTP game", () => {
    render(h(Live, { start: par3Props.holeData, ctpField: ["aaron_j"] }));
    postAll();
    expect(screen.getByText("NOT IN CTP")).toBeTruthy();
    fireEvent.click(screen.getByText("Dave S", { selector: "button" }));
    expect(screen.getByText(/not in the CTP game/)).toBeTruthy();
  });

  it("says nothing about buy-ins when the director has never set any", () => {
    render(h(Live, { start: par3Props.holeData, ctpField: null }));
    postAll();
    expect(screen.queryByText("NOT IN CTP")).toBeNull();
  });

  // C4. The advance effect stops for this popup; the banner did not, so the
  // group was told the app was moving on while it was refusing to.
  it("does not claim to be advancing while it is waiting for an answer", () => {
    render(h(Live, { start: par3Props.holeData }));
    postAll();
    expect(screen.queryByText(/advancing/)).toBeNull();
  });

  // A par 3 nobody in the field hit rolls its share onto the next one, and the
  // group on the green is the only audience that can do anything about it —
  // the number used to live on a tab nobody opens mid-round.
  it("tells the group when the pin has a carry riding on it", () => {
    render(h(Live, {
      start: par3Props.holeData,
      ctpByHole: { 1: { 2: { shares: 3, carriedIn: 2 } } },
    }));
    postAll();
    expect(screen.getByText(/This pin is worth 3×/)).toBeTruthy();
    expect(screen.getByText(/Nobody hit the last 2/)).toBeTruthy();
  });

  it("says nothing about a carry on an ordinary pin", () => {
    render(h(Live, {
      start: par3Props.holeData,
      ctpByHole: { 1: { 2: { shares: 1, carriedIn: 0 } } },
    }));
    postAll();
    expect(screen.queryByText(/worth 1×/)).toBeNull();
    expect(screen.queryByText(/carried onto this hole/)).toBeNull();
  });

  it("is not raised on a hole the group is only looking at", () => {
    render(h(OnCourseScoring, { ...baseProps, holeData: cards(18) }));
    expect(ctpPrompt()).toBeNull();
  });
});
