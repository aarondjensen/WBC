/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the picker open, and does it stay still while it loads?
// ══════════════════════════════════════════════════════════════════
//
// The mount half is the usual one: a screen in src/components/ gets a test
// that it APPEARS, for a director and for a player, because nothing else in
// the project renders this file.
//
// The second half is the bug it was written for. The create form used to sit
// open under the year list, and everything in it — the source dropdown, the
// planned year, the "what comes across" panel — filled in only once the counts
// landed. The popup is centered, so a panel arriving at the BOTTOM grows the
// card both ways and walks the year rows upwards under a thumb already on its
// way down. A director reaching for one year opened another, and opening a
// year reloads the app.
//
// So what is pinned here is that nothing below the list appears on its own:
// the section is one button until it is tapped, and the form's defaults are
// not even worked out before then.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { createElement as h } from "react";

const EDITIONS = [
  { id: "wbc_2026", year: 2026, name: "WBC 2026" },
  { id: "wbc_2025", year: 2025, name: "WBC 2025" },
  // Frozen: the finished year a director locked so a beta tester with the
  // event password cannot post a score into it.
  { id: "wbc_2015", year: 2015, name: "WBC 2015", locked: true },
  // The sandbox: an edition with no year, sorted last the way loadEditions
  // leaves it. In the shared list rather than a special case, because every
  // assertion about the rows has to hold with one present — that is the state
  // the app is in for the whole beta test.
  { id: "wbc_demo", year: null, name: "DEMO Sandbox" },
];
const SUMMARIES = {
  wbc_2026: { players: 0, rounds: 0, scores: 0 },
  wbc_2025: { players: 16, rounds: 4, scores: 1152, roundCount: 4, finalizedRounds: { 1: true, 2: true, 3: true, 4: true }, pairings: {} },
  wbc_2015: { players: 12, rounds: 4, scores: 864, roundCount: 4, finalizedRounds: { 1: true, 2: true, 3: true, 4: true }, pairings: {} },
  wbc_demo: { players: 16, rounds: 4, scores: 900 },
};

// Every (id, locked) the picker asked lib/editions to write. vi.hoisted, and
// declared up here, because the mock factory below is lifted over the imports
// and closes over it.
const locks = vi.hoisted(() => []);
// Every (sourceId, options) the picker asked for a sandbox rebuild with.
const sandboxes = vi.hoisted(() => []);

// firebase.js initializes an app at import time, and lib/editions is the
// module that talks to Firestore — both are mocked, so this is a render test
// rather than a network one.
vi.mock("../firebase", () => ({ getActiveTournamentId: () => "wbc_2026" }));

// Driven by hand so the test can hold the counts in flight and look at what
// is on screen while they are still coming — including handing over ONE year,
// the way the real load reports each as its own counts land.
let load;
const releaseSummaries = (map = SUMMARIES) => load.resolve(map);
const streamYear = (id) => act(() => { load.onEdition?.(id, SUMMARIES[id]); });

vi.mock("../lib/editions", () => ({
  ensureActiveEditionDoc: async () => EDITIONS,
  loadEditions: async () => EDITIONS,
  loadEditionSummaries: (_ids, { onEdition } = {}) => new Promise((res) => {
    load = { onEdition, resolve: (map) => res(map) };
  }),
  cachedEditionSummaries: () => null,
  cachedEditions: () => null,
  createEdition: async () => ({ id: "wbc_2027" }),
  cloneEdition: async () => ({ id: "wbc_2027" }),
  deleteEdition: async () => true,
  switchEdition: () => {},
  setEditionLocked: (...a) => { locks.push(a); return Promise.resolve({ id: a[0], locked: a[1] }); },
  resetSandbox: (...a) => { sandboxes.push(a); return Promise.resolve({ id: "wbc_demo" }); },
}));

const { EditionSwitcher } = await import("./EditionSwitcher");

afterEach(() => { cleanup(); locks.length = 0; sandboxes.length = 0; });

const open = (props = {}) =>
  render(h(EditionSwitcher, { open: true, onClose: () => {}, canManage: true, ...props }));

describe("EditionSwitcher", () => {
  it("mounts and lists every year", async () => {
    open();
    await screen.findByText("2026");
    expect(screen.getByText("2025")).toBeTruthy();
    expect(screen.getByText("2015")).toBeTruthy();
  });

  it("shows a player the years and none of the director's controls", async () => {
    open({ canManage: false });
    await screen.findByText("2026");
    expect(screen.queryByText("Create new tournament")).toBeNull();
  });

  it("opens with the create form collapsed, and nothing under the list moves as the counts land", async () => {
    open();
    await screen.findByText("2026");
    // The button is there from the first frame — this is the thing that must
    // not arrive late, because arriving late is what moved the years.
    expect(screen.getByText("Create new tournament")).toBeTruthy();
    expect(screen.queryByText("Copy from")).toBeNull();

    releaseSummaries();
    await waitFor(() => expect(screen.getByText(/1,152 scores/)).toBeTruthy());
    // The counts have landed and the form is still put away.
    expect(screen.queryByText("Copy from")).toBeNull();
    expect(screen.queryByText("What comes across")).toBeNull();
  });

  it("fills a row in as that year's counts land, without waiting for the rest", async () => {
    open();
    await screen.findByText("2026");
    // Nothing counted yet: every row says so rather than claiming a year is
    // empty when we simply have not looked.
    expect(screen.getAllByText("Counting…").length).toBe(EDITIONS.length);

    streamYear("wbc_2025");
    expect(screen.getByText("16 players · 4 rounds · 1,152 scores")).toBeTruthy();
    // And the years still in flight are still saying so.
    expect(screen.getAllByText("Counting…").length).toBe(EDITIONS.length - 1);
  });

  it("tells a year it could not read apart from one it has not counted yet", async () => {
    // Opposite sentences, and the second one is what puts a delete button on a
    // finished tournament — so a year is only called unreadable once the whole
    // load has settled without it.
    open();
    await screen.findByText("2026");
    expect(screen.queryByText("Couldn't read")).toBeNull();

    // 2026 is left out of the answer: its counts failed.
    const { wbc_2026: _gone, ...rest } = SUMMARIES;
    await act(async () => { releaseSummaries(rest); });
    expect(screen.getByText("Couldn't read")).toBeTruthy();
    expect(screen.queryByText("Counting…")).toBeNull();
  });

  it("builds the form only once it is expanded, pointed at the next year from the last one played", async () => {
    open();
    await screen.findByText("2026");
    releaseSummaries();
    await waitFor(() => expect(screen.getByText(/1,152 scores/)).toBeTruthy());

    fireEvent.click(screen.getByText("Create new tournament"));
    expect(screen.getByText("Copy from")).toBeTruthy();
    // 2026 exists but is empty, so it is the year being built rather than one
    // to skip past; 2025 is the newest year that actually holds a tournament.
    expect(screen.getByPlaceholderText("Year").value).toBe("2026");
    expect(screen.getByText("Build 2026 from 2025")).toBeTruthy();

    // And it folds away again.
    fireEvent.click(screen.getByText("Create new tournament"));
    expect(screen.queryByText("Copy from")).toBeNull();
  });

  it("keeps what the director typed when the counts land behind them", async () => {
    open();
    await screen.findByText("2026");
    fireEvent.click(screen.getByText("Create new tournament"));
    fireEvent.change(screen.getByPlaceholderText("Year"), { target: { value: "2030" } });

    releaseSummaries();
    // The row AND the source option both say it once the form is open, which
    // is itself the proof the counts reached the form.
    await waitFor(() => expect(screen.getAllByText(/1,152 scores/).length).toBeGreaterThan(1));
    // The seeding runs until the real counts arrive; a year already typed is
    // not one of the things it may correct.
    expect(screen.getByPlaceholderText("Year").value).toBe("2030");
  });

  // ── The padlock ──────────────────────────────────────────────────
  // firestore.rules is what a lock actually IS — firestore.rules.test.mjs
  // proves a member's write into a frozen year is refused. What is pinned
  // here is only the picker's half: that a director is offered the control,
  // that a member is shown the state without it, and that the one tap which
  // can stop a live tournament asks first.
  describe("locking a year", () => {
    const padlocks = () => screen.getAllByTitle(/^(Lock|Unlock) /);

    it("offers a director a control on every year", async () => {
      open();
      await screen.findByText("2026");
      expect(padlocks().length).toBe(EDITIONS.length);
      // Pointed the right way round: 2015 is the locked one.
      expect(screen.getByTitle(/^Unlock 2015/)).toBeTruthy();
      expect(screen.getByTitle(/^Lock 2026/)).toBeTruthy();
    });

    // A member cannot write wbc_editions, so a padlock they could tap would be
    // a control whose every use comes back refused. They still need to see
    // WHY their scores will not save.
    it("shows a member the state and no control", async () => {
      open({ canManage: false });
      await screen.findByText("2015");
      expect(screen.queryAllByTitle(/^(Lock|Unlock) /).length).toBe(0);
      expect(screen.getByLabelText("Locked")).toBeTruthy();
    });

    it("unlocks on one tap, without a dialog", async () => {
      open();
      await screen.findByText("2015");
      fireEvent.click(screen.getByTitle(/^Unlock 2015/));
      await waitFor(() => expect(locks).toEqual([["wbc_2015", false]]));
    });

    // Locking is the direction that takes something away, so it asks — and
    // nothing is written until it is answered.
    it("asks before freezing a year, and writes nothing if cancelled", async () => {
      open();
      await screen.findByText("2025");
      fireEvent.click(screen.getByTitle(/^Lock 2025/));
      expect(screen.getByText("Lock 2025?")).toBeTruthy();
      fireEvent.click(screen.getByText("Cancel"));
      expect(locks).toEqual([]);
    });

    it("writes the lock once the director confirms", async () => {
      open();
      await screen.findByText("2025");
      fireEvent.click(screen.getByTitle(/^Lock 2025/));
      fireEvent.click(screen.getByText("Lock it"));
      await waitFor(() => expect(locks).toEqual([["wbc_2025", true]]));
    });

    // The dangerous one. 2026 is the ACTIVE edition here (see the firebase
    // mock), so freezing it stops scoring for everybody currently on it —
    // and the director doing it is exempt, so nothing on their own screen
    // will look any different afterwards.
    it("warns that locking the active year stops the field", async () => {
      open();
      await screen.findByText("2026");
      fireEvent.click(screen.getByTitle(/^Lock 2026/));
      expect(screen.getByText(/right now/i)).toBeTruthy();
      expect(screen.getByText(/directors are exempt/i)).toBeTruthy();
    });
  });

  // ── Every year at once ───────────────────────────────────────────
  // Seventeen taps is the chore this button removes, and the one thing it
  // must never do is take the tournament being played down with the history.
  // 2026 is the active edition here (see the firebase mock); 2015 arrives
  // already locked, so only 2025 is left to freeze.
  describe("locking every year at once", () => {
    const bulk = () => screen.getByText(/Lock all but|Unlock all|Lock every other/);

    it("offers to lock everything except the active year", async () => {
      open();
      await screen.findByText("2026");
      expect(bulk().textContent).toContain("Lock all but 2026");
    });

    it("is not offered to a member", async () => {
      open({ canManage: false });
      await screen.findByText("2026");
      expect(screen.queryByText(/Lock all but|Unlock all/)).toBeNull();
    });

    it("locks only the open years, sparing the active one", async () => {
      open();
      await screen.findByText("2026");
      fireEvent.click(bulk());
      // Only 2025 is both open and inactive — 2015 is already locked, 2026 is
      // the tournament being played.
      expect(screen.getByText("Lock 1 year?")).toBeTruthy();
      fireEvent.click(screen.getByText("Lock 1 year"));
      await waitFor(() => expect(locks).toEqual([["wbc_2025", true]]));
    });

    it("writes nothing if the confirm is cancelled", async () => {
      open();
      await screen.findByText("2026");
      fireEvent.click(bulk());
      fireEvent.click(screen.getByText("Cancel"));
      expect(locks).toEqual([]);
    });

    // Once there is nothing left to lock the slot has to turn into something
    // useful, or a director who just locked everything is back to seventeen
    // taps to undo it.
    it("becomes Unlock all once nothing else is open", async () => {
      open();
      await screen.findByText("2026");
      fireEvent.click(bulk());
      fireEvent.click(screen.getByText("Lock 1 year"));
      await waitFor(() => expect(bulk().textContent).toContain("Unlock all"));

      locks.length = 0;
      fireEvent.click(bulk());
      fireEvent.click(screen.getByText("Unlock 2 years"));
      // Both frozen years come back, and the active one was never in it.
      await waitFor(() => expect(locks.map(l => l[0]).sort()).toEqual(["wbc_2015", "wbc_2025"]));
      expect(locks.every(l => l[1] === false)).toBe(true);
    });
  });

  // ── The sandbox ──────────────────────────────────────────────────
  // A permanent edition with no year, so testers have somewhere to play that
  // is not a tournament. What is pinned here is the picker's half: that it is
  // labelled so it cannot be mistaken for a year, that it can never be picked
  // as the year to clone NEXT year's tournament from, and that rebuilding it
  // says out loud that it wipes.
  describe("the sandbox", () => {
    const settled = async () => {
      open();
      await screen.findByText("2026");
      await act(async () => { releaseSummaries(); });
    };

    // One already exists in the shared list, so the control offers a REBUILD.
    // 2026 is empty; 2025 is the newest year actually played, and the sandbox
    // itself is never the source.
    it("offers to rebuild from the newest year that holds a tournament", async () => {
      await settled();
      expect(screen.getByText("Rebuild sandbox from 2025")).toBeTruthy();
    });

    it("is not offered to a member", async () => {
      open({ canManage: false });
      await screen.findByText("2026");
      await act(async () => { releaseSummaries(); });
      expect(screen.queryByText(/sandbox from/i)).toBeNull();
      // The row is still THERE for them, just not the control — a member who
      // cannot tell the sandbox from a tournament is the whole failure mode.
      expect(screen.getByText("DEMO")).toBeTruthy();
    });

    // A sandbox cloned from an empty year is an empty sandbox, and that
    // failure is silent — it looks like one that worked until a tester finds
    // no roster on the first tee.
    it("is not offered while no year holds a tournament", async () => {
      open();
      await screen.findByText("2026");
      await act(async () => {
        load.resolve({ wbc_2026: { players: 0, rounds: 0, scores: 0 },
                       wbc_2025: { players: 0, rounds: 0, scores: 0 },
                       wbc_2015: { players: 0, rounds: 0, scores: 0 },
                       wbc_demo: { players: 0, rounds: 0, scores: 0 } });
      });
      expect(screen.queryByText(/sandbox from/i)).toBeNull();
    });

    it("says the rebuild wipes, and only builds once confirmed", async () => {
      await settled();
      fireEvent.click(screen.getByText("Rebuild sandbox from 2025"));
      // Names what is about to be thrown away, in a count — "are you sure?"
      // is the dialog everybody taps through. Scoped to the modal's own
      // paragraph: the row behind it says "900 scores" too.
      const body = screen.getByText(/Everything in the current sandbox/);
      expect(body.textContent).toMatch(/900 scores/);
      expect(body.textContent).toMatch(/opens as a tournament nobody has played/i);
      fireEvent.click(screen.getByText("Cancel"));
      expect(sandboxes).toEqual([]);

      fireEvent.click(screen.getByText("Rebuild sandbox from 2025"));
      fireEvent.click(screen.getByText("Rebuild it"));
      await waitFor(() => expect(sandboxes.length).toBe(1));
      expect(sandboxes[0][0]).toBe("wbc_2025");
    });

    // The row itself, once one exists. `openWithSandbox` swaps the summaries
    // only — the rows come from the module mock — so this asserts against the
    // list the picker was handed.
    // The reason it is `wbc_demo` and not `wbc_2026_demo`: tapping a row
    // reloads the app into that edition, and two rows both reading a year is
    // a director in a hurry opening the wrong one mid-tournament.
    it("labels the row DEMO, and never as a year", async () => {
      await settled();
      expect(screen.getByText("DEMO")).toBeTruthy();
      // Not a year, not a stringified null, not a zero.
      for (const bad of ["null", "0", "NaN", "undefined"]) {
        expect(screen.queryByText(bad)).toBeNull();
      }
      // Exactly one row per edition, and the real years are all still years.
      for (const y of ["2026", "2025", "2015"]) expect(screen.getByText(y)).toBeTruthy();
    });

    it("still shows what the sandbox holds", async () => {
      await settled();
      expect(screen.getByText("16 players · 4 rounds · 900 scores")).toBeTruthy();
    });

    // The one path that could corrupt a real tournament: building next year's
    // roster and buy-ins out of a fortnight of testers' scribbles. The
    // sandbox's year reads 0, which would sail through the "earlier than the
    // target" filter if it were not excluded by id.
    it("is never in the Copy-from list", async () => {
      await settled();
      fireEvent.click(screen.getByText("Create new tournament"));
      const options = Array.from(document.querySelectorAll("option")).map(o => o.textContent);
      expect(options.some(t => /demo|sandbox/i.test(t))).toBe(false);
      expect(options.some(t => t.includes("2025"))).toBe(true);
    });
  });
});
