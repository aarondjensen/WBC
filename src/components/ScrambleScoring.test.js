/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the scramble card appear, and does one tap post one score?
// ══════════════════════════════════════════════════════════════════
//
// The same low ceiling every screen test in this repo has, and the same
// specific job: this screen is LAZY and reached from a button that only
// exists while a director has the switch on, so a broken import here cannot
// fail anywhere before somebody standing on a tee box taps it. Nothing else
// in the project would find that.
//
// Beyond mounting, three behaviours are worth pinning because they are the
// difference between this screen and the tournament one it is modelled on:
//
//   • ONE input. A scramble team plays one ball, and a screen that grew a
//     second score row would be a different game.
//   • It opens where the team's card runs out, not on hole 1 — and it does
//     that by derivation rather than in an effect, so a card that arrives
//     late still lands right.
//   • The switcher reaches the other two cards, because any of the three
//     might be the one in your hand.
//
// The arithmetic behind all of it is lib/scramble's, tested there.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { createElement as h } from "react";
import { ScrambleScoring } from "./ScrambleScoring";

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

const card = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i, 4]));

const SCRAMBLE = {
  on: true,
  courseId: "c1",
  teams: { og: ["aaron_j", "dave_s"], yg: ["finn_w"], ng: ["bo_li"] },
  scores: {},
};

const baseProps = (over = {}) => ({
  scramble: SCRAMBLE,
  players: PLAYERS,
  courses: [COURSE],
  user: { id: "aaron_j", name: "Aaron J", isDirector: false },
  onSaveHole: vi.fn(),
  onGoToSetup: vi.fn(),
  ...over,
});

// The hole banner's big number.
const holeShown = () => screen.getByText("Hole").parentElement.querySelectorAll("div")[1].textContent;

describe("ScrambleScoring renders", () => {
  it("mounts a scramble nobody has teed off in", () => {
    render(h(ScrambleScoring, baseProps()));
    expect(screen.getByText("Full Scorecard")).toBeTruthy();
    expect(holeShown()).toBe("1");
  });

  it("mounts a finished one", () => {
    render(h(ScrambleScoring, baseProps({
      scramble: { ...SCRAMBLE, scores: { og: card(18), yg: card(18), ng: card(18) } },
    })));
    // Every hole in, so the card sits on the last one rather than a next one.
    expect(holeShown()).toBe("18");
  });

  it("says so, rather than throwing, when no course is set", () => {
    render(h(ScrambleScoring, baseProps({ scramble: { ...SCRAMBLE, courseId: null } })));
    expect(screen.getByText("No course set for the scramble")).toBeTruthy();
    expect(screen.getByText(/Waiting on your tournament director/)).toBeTruthy();
  });

  it("points a director at the setup screen from that empty state", () => {
    const props = baseProps({
      scramble: { ...SCRAMBLE, courseId: null },
      user: { id: "aaron_j", isDirector: true },
    });
    render(h(ScrambleScoring, props));
    fireEvent.click(screen.getByText(/Tap to set it up/));
    expect(props.onGoToSetup).toHaveBeenCalled();
  });

  it("opens the full scorecard on all three teams", () => {
    render(h(ScrambleScoring, baseProps({
      scramble: { ...SCRAMBLE, scores: { og: card(18), yg: card(9), ng: {} } },
    })));
    fireEvent.click(screen.getByText("Full Scorecard"));
    expect(screen.getByText("OUT")).toBeTruthy();
    expect(screen.getByText("IN")).toBeTruthy();
  });
});

describe("one ball, one score", () => {
  it("draws a single score row, not one per player", () => {
    render(h(ScrambleScoring, baseProps()));
    // The row is five par-relative buttons; a per-player screen with OG's two
    // men on it would draw ten.
    const posted = screen.getAllByRole("button").filter(b => b.getAttribute("aria-pressed") != null);
    expect(posted).toHaveLength(5);
  });

  it("posts the hole for the team on screen", () => {
    const props = baseProps();
    render(h(ScrambleScoring, props));
    fireEvent.click(screen.getByRole("button", { name: /^OG, 4, par/ }));
    expect(props.onSaveHole).toHaveBeenCalledWith("og", 0, 4);
  });

  it("clears a posted hole when the same number is tapped again", () => {
    const props = baseProps({ scramble: { ...SCRAMBLE, scores: { og: { 0: 4 } } } });
    render(h(ScrambleScoring, props));
    // Hole 1 has a 4 on it, so the card opens on hole 2 — walk back to it.
    fireEvent.click(screen.getByRole("button", { name: "Previous hole" }));
    fireEvent.click(screen.getByRole("button", { name: /^OG, 4, par/ }));
    expect(props.onSaveHole).toHaveBeenCalledWith("og", 0, 0);
  });
});

describe("where it opens, and where it goes", () => {
  it("lands where the team's card runs out rather than on hole 1", () => {
    render(h(ScrambleScoring, baseProps({ scramble: { ...SCRAMBLE, scores: { og: card(6) } } })));
    expect(holeShown()).toBe("7");
  });

  it("corrects itself when the card arrives after the screen does", () => {
    const props = baseProps();
    const { rerender } = render(h(ScrambleScoring, props));
    expect(holeShown()).toBe("1");
    // The card lands a moment later, as a cold load does. Nothing has been
    // tapped, so the screen is free to move to where the team actually is.
    rerender(h(ScrambleScoring, baseProps({ scramble: { ...SCRAMBLE, scores: { og: card(4) } } })));
    expect(holeShown()).toBe("5");
  });

  it("stays where a thumb put it once one has moved", () => {
    const props = baseProps();
    const { rerender } = render(h(ScrambleScoring, props));
    fireEvent.click(screen.getByRole("button", { name: "Next hole" }));
    expect(holeShown()).toBe("2");
    rerender(h(ScrambleScoring, baseProps({ scramble: { ...SCRAMBLE, scores: { og: card(9) } } })));
    expect(holeShown()).toBe("2");
  });

  it("does not slide out from under the tap that posted a score, then walks on", () => {
    vi.useFakeTimers();
    try {
      const props = baseProps();
      render(h(ScrambleScoring, props));
      fireEvent.click(screen.getByRole("button", { name: /^OG, 4, par/ }));
      // Still on the hole that was just scored — the number has to be readable
      // back before the card walks on.
      expect(holeShown()).toBe("1");
      act(() => { vi.advanceTimersByTime(2000); });
      expect(holeShown()).toBe("2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays put when a hole that already had a number is corrected", () => {
    vi.useFakeTimers();
    try {
      const props = baseProps({ scramble: { ...SCRAMBLE, scores: { og: { 0: 4 } } } });
      render(h(ScrambleScoring, props));
      fireEvent.click(screen.getByRole("button", { name: "Previous hole" }));
      fireEvent.click(screen.getByRole("button", { name: /^OG, 5, bogey/ }));
      act(() => { vi.advanceTimersByTime(2000); });
      // A correction is somebody working on THIS hole.
      expect(holeShown()).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the team switcher", () => {
  it("opens on the team you are on", () => {
    render(h(ScrambleScoring, baseProps({ user: { id: "finn_w", name: "Finn W" } })));
    expect(screen.getByRole("button", { name: /^YG, 4, par/ })).toBeTruthy();
  });

  it("opens on the first team for somebody who is on none", () => {
    render(h(ScrambleScoring, baseProps({ user: { id: "nobody", isGuest: true } })));
    expect(screen.getByRole("button", { name: /^OG, 4, par/ })).toBeTruthy();
  });

  it("reaches the other two cards", () => {
    const props = baseProps();
    render(h(ScrambleScoring, props));
    // Two NGs on screen: the switcher's segment and the standings row. The
    // switcher is the first.
    fireEvent.click(screen.getAllByText("NG")[0]);
    fireEvent.click(screen.getByRole("button", { name: /^NG, 4, par/ }));
    expect(props.onSaveHole).toHaveBeenCalledWith("ng", 0, 4);
  });

  it("switches from the standings row too — it names the same three teams", () => {
    const props = baseProps();
    render(h(ScrambleScoring, props));
    fireEvent.click(screen.getAllByText("YG")[1]);
    fireEvent.click(screen.getByRole("button", { name: /^YG, 4, par/ }));
    expect(props.onSaveHole).toHaveBeenCalledWith("yg", 0, 4);
  });

  it("keeps each team's position when you come back to it", () => {
    render(h(ScrambleScoring, baseProps()));
    fireEvent.click(screen.getByRole("button", { name: "Next hole" }));
    fireEvent.click(screen.getByRole("button", { name: "Next hole" }));
    expect(holeShown()).toBe("3");
    fireEvent.click(screen.getAllByText("NG")[0]);
    expect(holeShown()).toBe("1");
    fireEvent.click(screen.getAllByText("OG")[0]);
    expect(holeShown()).toBe("3");
  });
});

// ── The mini leaderboard ───────────────────────────────────────────
// The scramble's whole field is three rows, which is why it rides under the
// card rather than getting a Board tab of its own. What it has to get right is
// the case a three-row board makes obvious: a team that has not teed off.
describe("the mini leaderboard", () => {
  it("shows all three teams from the first hole, in order of score", () => {
    render(h(ScrambleScoring, baseProps({
      scramble: { ...SCRAMBLE, scores: { og: { 0: 5 }, yg: { 0: 3 }, ng: { 0: 4 } } },
    })));
    // Hole 1 is a par 4, so YG is under, NG level, OG over.
    const rows = screen.getAllByRole("button", { name: /^Show the .. card/ });
    expect(rows.map(r => r.textContent.slice(1, 3))).toEqual(["YG", "NG", "OG"]);
  });

  it("gives a team that has not teed off no position and no score", () => {
    render(h(ScrambleScoring, baseProps({
      scramble: { ...SCRAMBLE, scores: { og: { 0: 4 }, yg: { 0: 4 } } },
    })));
    const ng = screen.getByRole("button", { name: /^Show the NG card/ });
    // A dash where the position and the score would be — not "1st" and not "E".
    expect(ng.textContent).toContain("NG");
    expect(ng.textContent).not.toContain("Thru");
    expect(ng.textContent).not.toContain("E");
  });

  it("sorts a team that has not started last, whatever the others are doing", () => {
    render(h(ScrambleScoring, baseProps({
      scramble: { ...SCRAMBLE, scores: { og: { 0: 8 }, yg: {}, ng: { 0: 9 } } },
    })));
    const rows = screen.getAllByRole("button", { name: /^Show the .. card/ });
    expect(rows[rows.length - 1].textContent).toContain("YG");
  });

  it("names the players on each team", () => {
    render(h(ScrambleScoring, baseProps()));
    const og = screen.getByRole("button", { name: /^Show the OG card/ });
    expect(og.textContent).toContain("Aaron");
    expect(og.textContent).toContain("Dave");
  });

  it("moves as a score lands", () => {
    const props = baseProps({ scramble: { ...SCRAMBLE, scores: { og: { 0: 5 }, yg: { 0: 3 }, ng: { 0: 4 } } } });
    const { rerender } = render(h(ScrambleScoring, props));
    expect(screen.getAllByRole("button", { name: /^Show the .. card/ })[0].textContent).toContain("YG");
    rerender(h(ScrambleScoring, baseProps({
      scramble: { ...SCRAMBLE, scores: { og: { 0: 2 }, yg: { 0: 3 }, ng: { 0: 4 } } },
    })));
    expect(screen.getAllByRole("button", { name: /^Show the .. card/ })[0].textContent).toContain("OG");
  });
});
