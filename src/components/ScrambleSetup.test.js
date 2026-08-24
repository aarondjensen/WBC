/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the scramble console appear, and does the switch hold?
// ══════════════════════════════════════════════════════════════════
//
// The arithmetic — who is on which team, what is still missing, how a roster
// deals out — is lib/scramble's and has its own suite. What this asks is the
// question nothing else in the repo can: if a director taps More → Scramble,
// does a screen come up?
//
// It is worth having for the reason the Betting tab's mount test is: this
// screen is LAZY, so a component used and never imported cannot fail anywhere
// before somebody opens the tab, and `no-undef` cannot see a JSX element name.
// The three states nobody develops against get mounted too — an edition with
// no courses, one with no players, and a scramble already running.
//
// The one behaviour asserted beyond "it rendered" is the switch, because it is
// the control with consequences: throwing it is what puts the OG/YG/NG button
// in front of the whole field, and it must not be throwable over a scramble
// with no course or no teams.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { ScrambleSetup } from "./ScrambleSetup";

afterEach(cleanup);

const COURSE = {
  id: "c1", name: "Treetops", par: 72, slope: 130, rating: 72.4,
  hole_pars: [4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5],
  hole_handicaps: Array.from({ length: 18 }, (_, i) => i + 1),
};

const PLAYERS = [
  { id: "aaron_j", name: "Aaron J", handicap_index: 12 },
  { id: "dave_s", name: "Dave S", handicap_index: 8.4 },
  { id: "finn_w", name: "Finn W", handicap_index: 3.1 },
  { id: "bo_li", name: "Bo Li", handicap_index: 21 },
];

const baseProps = () => ({
  scramble: null,
  onUpdate: vi.fn(),
  players: PLAYERS,
  courses: [COURSE],
  notify: vi.fn(),
  onOpenScoring: vi.fn(),
});

const READY = {
  on: false,
  courseId: "c1",
  teams: { og: ["aaron_j"], yg: ["dave_s"], ng: ["finn_w", "bo_li"] },
  scores: {},
};

const theSwitch = () => screen.getByRole("switch", { name: "Scramble round" });

describe("ScrambleSetup renders", () => {
  it("mounts an edition that has never had a scramble", () => {
    render(h(ScrambleSetup, baseProps()));
    expect(screen.getByText("Scramble round off")).toBeTruthy();
    expect(screen.getByText("Teams")).toBeTruthy();
    // All three teams are on screen from the start, empty or not.
    ["OG", "YG", "NG"].forEach(l => expect(screen.getByText(l)).toBeTruthy());
  });

  it("mounts one that is already running", () => {
    render(h(ScrambleSetup, { ...baseProps(), scramble: { ...READY, on: true } }));
    expect(screen.getByText("Scramble round on")).toBeTruthy();
    expect(screen.getByText("Open the scramble card →")).toBeTruthy();
  });

  it("mounts an edition with no courses on it yet", () => {
    render(h(ScrambleSetup, { ...baseProps(), courses: [] }));
    expect(screen.getByText(/No courses on this tournament yet/)).toBeTruthy();
  });

  it("mounts an edition with no players on it yet", () => {
    render(h(ScrambleSetup, { ...baseProps(), players: [] }));
    expect(screen.getByText("No players on this tournament yet.")).toBeTruthy();
  });

  it("mounts a scramble whose teams have started scoring", () => {
    const { container } = render(h(ScrambleSetup, { ...baseProps(), scramble: { ...READY, on: true, scores: { og: { 0: 4, 1: 3 } } } }));
    // OG is two holes in and level: 4 + 3 against pars of 4 and 3.
    expect(container.textContent).toContain("Thru 2");
    expect(container.textContent).toContain("E");
    // Changing the course under a started card is the warning worth printing.
    expect(screen.getByText(/Cards have been started/)).toBeTruthy();
  });
});

describe("the switch", () => {
  it("will not throw over a scramble with no course and no teams", () => {
    const props = baseProps();
    render(h(ScrambleSetup, props));
    fireEvent.click(theSwitch());
    expect(props.onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(/Pick the course/)).toBeTruthy();
    expect(screen.getByText(/at least two teams/)).toBeTruthy();
  });

  it("will not throw with a course but only one team", () => {
    const props = { ...baseProps(), scramble: { courseId: "c1", teams: { og: ["aaron_j"] } } };
    render(h(ScrambleSetup, props));
    fireEvent.click(theSwitch());
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it("throws once there is a course and two teams", () => {
    const props = { ...baseProps(), scramble: READY };
    render(h(ScrambleSetup, props));
    fireEvent.click(theSwitch());
    expect(props.onUpdate).toHaveBeenCalledWith({ on: true });
    expect(props.notify).toHaveBeenCalled();
  });

  it("turns back off without asking anything of the setup", () => {
    const props = { ...baseProps(), scramble: { on: true, courseId: null, teams: {} } };
    render(h(ScrambleSetup, props));
    fireEvent.click(theSwitch());
    expect(props.onUpdate).toHaveBeenCalledWith({ on: false });
  });
});

describe("building the teams", () => {
  it("places a player on the team tapped after them", () => {
    const props = { ...baseProps(), scramble: { courseId: "c1" } };
    render(h(ScrambleSetup, props));
    // Two "Dave" targets exist once placed; before placing there is one — the
    // pool tile.
    fireEvent.click(screen.getByText("Dave"));
    fireEvent.click(screen.getByText("YG"));
    expect(props.onUpdate).toHaveBeenCalledWith({ teams: { og: [], yg: ["dave_s"], ng: [] } });
  });

  it("deals every player out in one tap", () => {
    const props = { ...baseProps(), scramble: { courseId: "c1" } };
    render(h(ScrambleSetup, props));
    fireEvent.click(screen.getByText("Auto-split"));
    const [[patch]] = props.onUpdate.mock.calls;
    expect(Object.values(patch.teams).flat().sort()).toEqual(PLAYERS.map(p => p.id).sort());
  });

  it("clears them all", () => {
    const props = { ...baseProps(), scramble: READY };
    render(h(ScrambleSetup, props));
    fireEvent.click(screen.getByText("Clear"));
    expect(props.onUpdate).toHaveBeenCalledWith({ teams: { og: [], yg: [], ng: [] } });
  });

  it("takes a placed player back off by tapping them", () => {
    const props = { ...baseProps(), scramble: READY };
    render(h(ScrambleSetup, props));
    // The pool tile and the team chip both say "Aaron"; either tap means the
    // same thing for somebody already placed.
    fireEvent.click(screen.getAllByText("Aaron")[0]);
    expect(props.onUpdate).toHaveBeenCalledWith({
      teams: { og: [], yg: ["dave_s"], ng: ["finn_w", "bo_li"] },
    });
  });
});

describe("the course", () => {
  it("picks one, and unpicks the one already picked", () => {
    const props = baseProps();
    const { rerender } = render(h(ScrambleSetup, props));
    fireEvent.click(screen.getByText("Treetops"));
    expect(props.onUpdate).toHaveBeenCalledWith({ courseId: "c1" });

    // Two of them once a course is picked: the chip under the round pill, and
    // the tile in the picker. The picker's is the one you can tap.
    rerender(h(ScrambleSetup, { ...props, scramble: { courseId: "c1" } }));
    const tiles = screen.getAllByText("Treetops");
    fireEvent.click(tiles[tiles.length - 1]);
    expect(props.onUpdate).toHaveBeenLastCalledWith({ courseId: null });
  });
});
