/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the Players tab appear?
// ══════════════════════════════════════════════════════════════════
//
// A mount test, not a test of the index. The handicap arithmetic belongs to
// lib/handicap and has its own suite; this asks the one question only a
// rendered screen can answer — that the tab comes up at all, with a roster,
// without one, and for a director, who gets the override field nobody else
// does.
//
// It matters more here than it looks. This screen is `lazy` now: its chunk is
// only fetched when somebody taps Players, so a broken import inside it can
// not fail anywhere else first — not in a build, not in a lint, and not in any
// other test. See the note in CLAUDE.md; the Betting tab shipped dead on tap
// for exactly this reason.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { createElement as h } from "react";
import { PlayersView } from "./PlayersView";
import { HISTORY_PLAYERS } from "../data/history";

afterEach(cleanup);

const PLAYERS = [
  { id: "aaron_j", name: "Aaron Jensen", handicap_index: 12 },
  { id: "dave_s", name: "Dave S", handicap_index: 8.4 },
];
const REGISTRY = [
  { id: "aaron_j", name: "Aaron Jensen", index_override: null },
  { id: "dave_s", name: "Dave S", index_override: 9.2 },
];

describe("PlayersView", () => {
  it("mounts with a roster", () => {
    render(h(PlayersView, { players: PLAYERS, registry: REGISTRY, meId: "aaron_j", year: 2026 }));
    expect(screen.getByText(/Aaron Jensen/i)).toBeTruthy();
    expect(screen.getByText(/Dave S/i)).toBeTruthy();
  });

  // The state nobody develops against: a brand new edition, before a director
  // has put anybody in it. The screen still has something to draw, because the
  // career record is not this edition's — see the fromHistory half.
  it("mounts with no roster at all", () => {
    expect(() => render(h(PlayersView, {}))).not.toThrow();
    if (HISTORY_PLAYERS.length) {
      expect(screen.getByText(new RegExp(HISTORY_PLAYERS[0], "i"))).toBeTruthy();
    }
  });

  it("mounts for a director, who may set an index by hand", () => {
    expect(() => render(h(PlayersView, {
      players: PLAYERS, registry: REGISTRY, meId: "aaron_j", year: 2026,
      isDirector: true, onSetOverride: () => {},
    }))).not.toThrow();
    expect(screen.getByText(/Aaron Jensen/i)).toBeTruthy();
  });

  // Opening a row is the one interaction the tab has, and it renders a whole
  // second layer — the scoring window, the counting rounds — that nothing else
  // draws.
  // ── The bug ──
  // data/history.js stops at the last export of data/rounds.csv, and the WBC
  // played since is in Firestore. Without it on screen, a man who played last
  // year opened next year's edition and found none of it on his chart — and
  // the app quoted him an index a year out of date beside a roster handicap
  // that had been seeded from those very cards.
  it("shows a round played since the record books were generated", () => {
    const live = {
      byPlayer: {
        aaron_j: [{
          year: 2026, round: 1, key: "2026-1", player: "aaron_j", gross: 84,
          ch: null, net: null,
          course: { name: "THE MASTERPIECE", rating: 71.4, slope: 134, par: 71 },
          differential: 10.6,
        }],
      },
      slots: ["2026-1"],
    };
    render(h(PlayersView, {
      players: PLAYERS, registry: REGISTRY, meId: "aaron_j", year: 2027, liveRounds: live,
    }));
    act(() => screen.getByText(/Aaron Jensen/i).closest("button").click());
    expect(screen.getAllByText(/THE MASTERPIECE/i).length).toBeGreaterThan(0);
  });

  // A first WBC played after the bundle was generated is a career the record
  // books have never heard of. He is in the registry and nowhere else, so
  // leaving him out of the roster is what used to make him disappear.
  it("lists a career that exists only in the years since", () => {
    render(h(PlayersView, {
      players: PLAYERS, registry: [...REGISTRY, { id: "new_guy", name: "New Guy", index_override: null }],
      meId: "aaron_j", year: 2027,
      liveRounds: {
        byPlayer: {
          new_guy: [{
            year: 2026, round: 1, key: "2026-1", player: "new_guy", gross: 90,
            ch: null, net: null,
            course: { name: "THE MASTERPIECE", rating: 71.4, slope: 134, par: 71 },
            differential: 15.7,
          }],
        },
        slots: ["2026-1"],
      },
    }));
    expect(screen.getByText(/New Guy/i)).toBeTruthy();
    expect(screen.getByText("15.7")).toBeTruthy();
  });

  // ── The chart's one interaction ──
  // The bars say what the rounds were; the line through them says what they
  // did. Tapping a bar is how you read a point off that line, and it is the
  // only thing on this screen that responds to a touch — so if it stops
  // working, nothing else fails first.
  it("names the round and the index it left behind when a bar is tapped", () => {
    render(h(PlayersView, { players: PLAYERS, registry: REGISTRY, meId: "aaron_j", year: 2026 }));
    act(() => screen.getByText(/Aaron Jensen/i).closest("button").click());

    expect(screen.getByText(/Tap a round for the index/i)).toBeTruthy();
    const bars = screen.getAllByLabelText(/differential/i);
    expect(bars.length).toBeGreaterThan(0);

    // The oldest bar in the window — the one whose point on the line is built
    // from the fewest rounds, and so the one most likely to have no number.
    const oldest = bars[bars.length - 1];
    const [, year, rnd] = oldest.getAttribute("aria-label").match(/^(\d{4}) round (\d+)/);
    act(() => oldest.click());

    expect(screen.queryByText(/Tap a round for the index/i)).toBe(null);
    const readout = screen.getByText("index").closest("div").textContent;
    expect(readout).toMatch(new RegExp(`${year} R${rnd}`));
    expect(readout).toMatch(/index\s*\d+\.\d/);

    // Tapping the same bar again puts the hint back — a selection you cannot
    // clear is a selection that outstays its welcome.
    act(() => oldest.click());
    expect(screen.getByText(/Tap a round for the index/i)).toBeTruthy();
  });

  it("opens a player's detail without throwing", () => {
    render(h(PlayersView, { players: PLAYERS, registry: REGISTRY, meId: "aaron_j", year: 2026 }));
    const row = screen.getByText(/Aaron Jensen/i).closest("div");
    expect(row).toBeTruthy();
    expect(() => act(() => row.click())).not.toThrow();
  });
});
