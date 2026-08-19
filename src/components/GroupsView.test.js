/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the draw appear, and is it sized to the room it is in NOW?
// ══════════════════════════════════════════════════════════════════
//
// The arithmetic of the fit belongs to lib/pairingsFit and has its own suite.
// This asks the two things only a mounted screen can answer: that the tab
// renders at all, and that it re-fits when its floor moves.
//
// The second one is the one that bit. The stack listened for `window.resize`
// and nothing else, so everything that shortens it from ABOVE — the round
// pills gaining a line when the course names load, or wrapping to three on a
// phone with a large system font — went unheard. The fit kept sizing against
// the height the tab had before, the draw came out a rung too big for the room
// it was now in, and a tab whose whole promise is that it does not scroll
// scrolled.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { createElement as h } from "react";
import { GroupsView } from "./GroupsView";
import { PAIRING_RUNGS, pairingsHeight } from "../lib/pairingsFit";

afterEach(cleanup);

const COURSE = { id: "c1", name: "Treetops", par: 72, slope: 130, rating: 72.4 };
const PLAYERS = [
  { id: "aaron_j", name: "Aaron J", handicap_index: 12 },
  { id: "dave_s", name: "Dave S", handicap_index: 8.4 },
  { id: "finn_w", name: "Finn W", handicap_index: 3.1 },
  { id: "bo_li", name: "Bo Li", handicap_index: 21 },
];

const baseProps = {
  players: PLAYERS,
  round: 1,
  tRounds: [{ round_number: 1, course_id: "c1" }],
  courses: [COURSE],
  pairingsData: { 1: [["aaron_j", "dave_s"], ["finn_w", "bo_li"]] },
  teeTimesData: { 1: ["7:40 AM", "7:50 AM"] },
  getPlayerTee: () => ({ name: "Blue", color: "#3b82f6", slope: 130, rating: 72.4, par: 72 }),
  user: { id: "aaron_j" },
};

// jsdom does no layout, so the stack would measure 0 and the fit would hold at
// rung 0 forever. `height` is what the stack reports, and the observer stub
// below is how the test moves it — which is the whole point of the exercise.
let height = 0;
let observers = [];

// The stack is the scrolling column the cards sit in.
const stackEl = () => document.querySelector('[style*="overflow-y: auto"]');

beforeEach(() => {
  height = 0;
  observers = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe() {}
    disconnect() { observers = observers.filter(o => o !== this); }
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true, get() { return this === stackEl() ? height : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true, get() { return this === stackEl() ? 350 : 0; },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete HTMLElement.prototype.clientHeight;
  delete HTMLElement.prototype.clientWidth;
});

// The rung a row was actually drawn at, read off the name cell.
const nameSize = () => parseInt(screen.getByText("Aaron J").style.fontSize, 10);
const resizeStack = (px) => {
  height = px;
  act(() => { observers.forEach(o => o.cb([])); });
};

describe("GroupsView", () => {
  it("renders the draw with its tee times", () => {
    render(h(GroupsView, baseProps));
    expect(screen.getByText("Round 1")).toBeTruthy();
    expect(screen.getByText("7:40 AM")).toBeTruthy();
    expect(screen.getByText("Aaron J")).toBeTruthy();
    expect(screen.getByText("Bo Li")).toBeTruthy();
  });

  it("says so plainly when there is no draw yet", () => {
    render(h(GroupsView, { ...baseProps, pairingsData: {} }));
    expect(screen.getByText("No Pairings Set")).toBeTruthy();
  });

  it("renders a round with no course set", () => {
    render(h(GroupsView, { ...baseProps, tRounds: [], courses: [] }));
    expect(screen.getByText("Aaron J")).toBeTruthy();
  });

  it("re-fits when its floor moves without the window resizing", () => {
    const sizes = [2, 2];
    // Room for the top rung, then only for the bottom one — the pills above
    // gaining two wrapped lines on a large-font phone.
    const roomy = pairingsHeight(PAIRING_RUNGS[PAIRING_RUNGS.length - 1], sizes);
    const tight = pairingsHeight(PAIRING_RUNGS[0], sizes);

    render(h(GroupsView, baseProps));
    resizeStack(roomy);
    const big = nameSize();

    resizeStack(tight);
    expect(nameSize()).toBeLessThan(big);
    expect(nameSize()).toBe(PAIRING_RUNGS[0].name);
  });

  it("never draws a stack taller than the room it measured", () => {
    const sizes = [2, 2];
    render(h(GroupsView, baseProps));
    // Every height from cramped to generous: the chosen rung has to fit.
    for (let room = 120; room <= 900; room += 17) {
      resizeStack(room);
      const rung = PAIRING_RUNGS.find(r => r.name === nameSize());
      expect(pairingsHeight(rung, sizes)).toBeLessThanOrEqual(Math.max(room, pairingsHeight(PAIRING_RUNGS[0], sizes)));
    }
  });
});
