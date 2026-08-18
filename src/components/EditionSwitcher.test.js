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
  // 2026 is not in the hand-kept table (that covers the imported years only),
  // so its location can only come from what the director typed — which makes
  // it the year that proves the row reads one off the counts load.
  wbc_2026: { players: 0, rounds: 0, scores: 0, location: "Boyne Falls, MI" },
  wbc_2025: { players: 16, rounds: 4, scores: 1152, location: "Gaylord, MI", roundCount: 4, finalizedRounds: { 1: true, 2: true, 3: true, 4: true }, pairings: {} },
  wbc_2015: { players: 12, rounds: 4, scores: 864, roundCount: 4, finalizedRounds: { 1: true, 2: true, 3: true, 4: true }, pairings: {} },
  wbc_demo: { players: 16, rounds: 4, scores: 900 },
};

// Every (id, locked) the picker asked lib/editions to write. vi.hoisted, and
// declared up here, because the mock factory below is lifted over the imports
// and closes over it.
const locks = vi.hoisted(() => []);
// Every (sourceId, options) the picker asked for a sandbox rebuild with.
const sandboxes = vi.hoisted(() => []);
// Every (id, name) the picker asked lib/editions to rename.
const renames = vi.hoisted(() => []);

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
  renameEdition: (...a) => { renames.push(a); return Promise.resolve({ ok: true, name: a[1] }); },
  // The sheet's own read: the tapped year's rounds, with the course each was
  // played on. Two small reads in the real thing, and only for one year.
  loadEditionCourses: async (id) => (id === "wbc_2025"
    ? [{ round: 1, name: "Black Forest" }, { round: 2, name: "The Loop" }]
    : []),
  forgetEditionCourses: () => {},
}));

const { EditionSwitcher } = await import("./EditionSwitcher");

afterEach(() => { cleanup(); locks.length = 0; sandboxes.length = 0; renames.length = 0; });

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
    expect(screen.queryByText("+ New")).toBeNull();
  });

  it("opens on the list, and nothing under it moves as the counts land", async () => {
    open();
    await screen.findByText("2026");
    // The door into the composer is in the header from the first frame — this
    // is the thing that must not arrive late, because arriving late is what
    // moved the years under a reaching thumb.
    expect(screen.getByText("+ New")).toBeTruthy();
    expect(screen.queryByText("Copy from")).toBeNull();

    releaseSummaries();
    await waitFor(() => expect(screen.getByText("Boyne Falls, MI")).toBeTruthy());
    // The counts have landed and the form is still put away.
    expect(screen.queryByText("Copy from")).toBeNull();
    expect(screen.queryByText("What comes across")).toBeNull();
  });

  // ── A year and where it was played ────────────────────────────────
  // The row used to carry the counts. Nobody scans a list of sixteen
  // tournaments looking for a score total — they look for the year at Gull
  // Lake View — so the counts moved to the sheet and the two places a
  // director decides on them, and the row says where instead.
  it("says where each year was played, not how many scores are in it", async () => {
    open();
    await screen.findByText("2026");
    // The imported years have a location before anything is counted: it comes
    // from the hand-kept table, which is the only source they have.
    expect(screen.getByText("Gull Lake View, MI")).toBeTruthy();

    releaseSummaries();
    await waitFor(() => expect(screen.getByText("Boyne Falls, MI")).toBeTruthy());
    // And no counts anywhere on the list.
    expect(screen.queryByText(/1,152 scores/)).toBeNull();
    expect(screen.queryByText(/16 players/)).toBeNull();
  });

  it("fills a row in as that year's counts land, without waiting for the rest", async () => {
    open();
    await screen.findByText("2026");
    // Until a year is counted, nothing about its state is claimed — the dot
    // and its label are what say so, and every row is still saying it.
    const counting = () => screen.getAllByTitle("Counting…").length;
    expect(counting()).toBe(EDITIONS.length);

    streamYear("wbc_2025");
    expect(counting()).toBe(EDITIONS.length - 1);
    // 2025's own row now knows what it holds: a finished tournament.
    expect(screen.getByTitle("Complete")).toBeTruthy();
  });

  it("tells a year it could not read apart from one it has not counted yet", async () => {
    // Opposite answers, and the second one is what puts a delete button on a
    // finished tournament — so a year is only called unreadable once the whole
    // load has settled without it.
    open();
    await screen.findByText("2026");
    expect(screen.queryByTitle("Couldn't read")).toBeNull();

    // 2026 is left out of the answer: its counts failed.
    const { wbc_2026: _gone, ...rest } = SUMMARIES;
    await act(async () => { releaseSummaries(rest); });
    expect(screen.getByTitle("Couldn't read")).toBeTruthy();
    expect(screen.queryByTitle("Counting…")).toBeNull();
  });

  it("builds the form only once it is expanded, pointed at the next year from the last one played", async () => {
    open();
    await screen.findByText("2026");
    releaseSummaries();
    await waitFor(() => expect(screen.getByText("Boyne Falls, MI")).toBeTruthy());

    fireEvent.click(screen.getByText("+ New"));
    expect(screen.getByText("Copy from")).toBeTruthy();
    // 2026 exists but is empty, so it is the year being built rather than one
    // to skip past; 2025 is the newest year that actually holds a tournament.
    expect(screen.getByPlaceholderText("Year").value).toBe("2026");
    expect(screen.getByText("Build 2026 from 2025")).toBeTruthy();

    // The list is gone while the composer is up — one screen, not two things
    // sharing one — and ‹ brings it back.
    expect(screen.queryByText("2015")).toBeNull();
    fireEvent.click(screen.getByLabelText("Back"));
    expect(screen.queryByText("Copy from")).toBeNull();
    expect(screen.getByText("2015")).toBeTruthy();
  });

  it("keeps what the director typed when the counts land behind them", async () => {
    open();
    await screen.findByText("2026");
    fireEvent.click(screen.getByText("+ New"));
    fireEvent.change(screen.getByPlaceholderText("Year"), { target: { value: "2030" } });

    releaseSummaries();
    // The composer has replaced the list, so the only thing left that can say
    // it is the source option — which is itself the proof the counts reached
    // the form.
    await waitFor(() => expect(screen.getAllByText(/1,152 scores/).length).toBe(1));
    // The seeding runs until the real counts arrive; a year already typed is
    // not one of the things it may correct.
    expect(screen.getByPlaceholderText("Year").value).toBe("2030");
  });

  // ── The row opens a sheet ────────────────────────────────────────
  // The controls used to hang off the right-hand end of every row. At a 320pt
  // viewport that left nothing for the summary line — the counts a director is
  // actually deciding on — so they moved behind a tap. What is pinned here is
  // that the tap still reaches all of them, and that the row keeps saying which
  // year, what state and how much is in it.
  const openSheet = (label) => fireEvent.click(screen.getByLabelText(new RegExp(`^${label}`)));

  describe("the row sheet", () => {
    it("opens on a tap and names the year it was opened from", async () => {
      open();
      await screen.findByText("2015");
      openSheet("2015");
      expect(screen.getByText("Open this tournament")).toBeTruthy();
      // The name, and where it was played, on one line under the year.
      expect(screen.getByText("WBC 2015 · Gull Lake View, MI")).toBeTruthy();
    });

    // What the row stopped carrying has to turn up here, or it is gone: the
    // size of the field, and what they played.
    it("says how many played and what they played, a tap deeper", async () => {
      open();
      await screen.findByText("2025");
      releaseSummaries();
      await waitFor(() => expect(screen.getByText("Boyne Falls, MI")).toBeTruthy());
      openSheet("2025");
      await waitFor(() => expect(screen.getByText("16 players")).toBeTruthy());
      expect(screen.getByText("Black Forest")).toBeTruthy();
      expect(screen.getByText("The Loop")).toBeTruthy();
      expect(screen.getByText("R1")).toBeTruthy();
    });

    it("says a year with no round setup has none, rather than nothing", async () => {
      open();
      await screen.findByText("2015");
      openSheet("2015");
      await waitFor(() => expect(screen.getByText("No courses set")).toBeTruthy());
    });

    // The ACTIVE row opens it too, which the old inert row could not. There is
    // nowhere to go, but there is still a lock to set and a reason the bin is
    // missing — and an inert row could say neither.
    it("opens on the active year, without offering to open it", async () => {
      open();
      await screen.findByText("2026");
      openSheet("2026");
      expect(screen.queryByText("Open this tournament")).toBeNull();
      expect(screen.getByText(/Open another year first/)).toBeTruthy();
    });

    // The whole reason the actions moved. deleteVerdict has always produced
    // this sentence; the row's only way to say it was to draw no bin at all
    // and leave a director to infer the rule from an absence.
    it("draws no bin on a finished tournament, and no paragraph about it", async () => {
      open();
      await screen.findByText("2025");
      await act(async () => { releaseSummaries(); });
      openSheet("2025");
      expect(screen.queryByText("Delete this tournament")).toBeNull();
      expect(screen.queryByText(/record of the event/)).toBeNull();
    });

    it("offers the bin on a year that may go", async () => {
      // 2026 is empty — nothing is lost — but it is also ACTIVE here, so the
      // sandbox is the one to check: disposable however full it is.
      open();
      await screen.findByText("2025");
      await act(async () => { releaseSummaries(); });
      openSheet("DEMO");
      expect(screen.getByText("Delete this tournament")).toBeTruthy();
    });

    it("shows a member the state and none of the controls", async () => {
      open({ canManage: false });
      await screen.findByText("2015");
      openSheet("2015");
      expect(screen.getByText("Open this tournament")).toBeTruthy();
      expect(screen.queryByText("Lock")).toBeNull();
      expect(screen.queryByText("Unlock")).toBeNull();
      expect(screen.queryByText("Delete this tournament")).toBeNull();
    });
  });

  // ── The padlock ──────────────────────────────────────────────────
  // firestore.rules is what a lock actually IS — firestore.rules.test.mjs
  // proves a member's write into a frozen year is refused. What is pinned
  // here is only the picker's half: that a director is offered the control,
  // that a member is shown the state without it, and that the one tap which
  // can stop a live tournament asks first.
  describe("locking a year", () => {
    it("offers a director the control on every year, pointed the right way", async () => {
      open();
      await screen.findByText("2026");
      openSheet("2015");
      expect(screen.getByText("Unlock")).toBeTruthy();   // 2015 is the locked one
      fireEvent.click(screen.getByText("Close"));
      openSheet("2026");
      expect(screen.getByText("Lock")).toBeTruthy();
    });

    // A member cannot write wbc_editions, so a padlock they could tap would be
    // a control whose every use comes back refused. They still need to see
    // WHY their scores will not save, and the row still says it.
    it("leaves the state on the row for a member who has no control", async () => {
      open({ canManage: false });
      await screen.findByText("2015");
      // The row's own label carries it, so a member reading the list — rather
      // than opening each year — still sees which ones are frozen.
      expect(screen.getByLabelText(/^2015.*locked/)).toBeTruthy();
      expect(screen.queryByLabelText(/^2026.*locked/)).toBeNull();
    });

    // Both directions ask now. What unlocking widens is a finished
    // tournament, so it is as deliberate an act as freezing one.
    it("asks before unlocking, and writes nothing if cancelled", async () => {
      open();
      await screen.findByText("2015");
      openSheet("2015");
      fireEvent.click(screen.getByText("Unlock"));
      expect(screen.getByText("Unlock 2015?")).toBeTruthy();
      fireEvent.click(screen.getByText("Cancel"));
      expect(locks).toEqual([]);
    });

    it("unlocks once the director confirms", async () => {
      open();
      await screen.findByText("2015");
      openSheet("2015");
      fireEvent.click(screen.getByText("Unlock"));
      fireEvent.click(screen.getByText("Unlock it"));
      await waitFor(() => expect(locks).toEqual([["wbc_2015", false]]));
    });

    // Locking is the direction that takes something away, so it asks — and
    // nothing is written until it is answered.
    it("asks before freezing a year, and writes nothing if cancelled", async () => {
      open();
      await screen.findByText("2025");
      openSheet("2025");
      fireEvent.click(screen.getByText("Lock"));
      expect(screen.getByText("Lock 2025?")).toBeTruthy();
      fireEvent.click(screen.getByText("Cancel"));
      expect(locks).toEqual([]);
    });

    it("writes the lock once the director confirms", async () => {
      open();
      await screen.findByText("2025");
      openSheet("2025");
      fireEvent.click(screen.getByText("Lock"));
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
      openSheet("2026");
      fireEvent.click(screen.getByText("Lock"));
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
    const bulk = () => screen.getByText(/Lock all but|Lock every tournament/);
    // Absent, rather than present-and-doing-nothing: the control goes away
    // once there is nothing left for it to lock.
    const noBulk = () => screen.queryByText(/Lock all but|Lock every tournament|Unlock all/);

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

    // The slot used to turn into "Unlock all" here. It is gone: thawing the
    // record of sixteen tournaments in one tap is not an undo — nothing
    // remembers which years were locked — and unlocking one year is a tap on
    // its own row with its own confirm.
    it("disappears once nothing else is open, rather than reversing", async () => {
      open();
      await screen.findByText("2026");
      fireEvent.click(bulk());
      fireEvent.click(screen.getByText("Lock 1 year"));
      await waitFor(() => expect(noBulk()).toBeNull());
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

    it("still shows what the sandbox holds, a tap deeper", async () => {
      await settled();
      fireEvent.click(screen.getByText("DEMO"));
      await waitFor(() => expect(screen.getByText("16 players")).toBeTruthy());
    });

    // The one path that could corrupt a real tournament: building next year's
    // roster and buy-ins out of a fortnight of testers' scribbles. The
    // sandbox's year reads 0, which would sail through the "earlier than the
    // target" filter if it were not excluded by id.
    it("is never in the Copy-from list", async () => {
      await settled();
      fireEvent.click(screen.getByText("+ New"));
      const options = Array.from(document.querySelectorAll("option")).map(o => o.textContent);
      expect(options.some(t => /demo|sandbox/i.test(t))).toBe(false);
      expect(options.some(t => t.includes("2025"))).toBe(true);
    });
  });

  // ── Renaming ──────────────────────────────────────────────────────
  // Reached from the sheet, answered in its own view, and it must not offer
  // the id or the year: those are what a tournament's every document is filed
  // under. See renameEdition.
  describe("rename", () => {
    const openSheet = async (year = "2015") => {
      open();
      await screen.findByText("2026");
      fireEvent.click(screen.getByText(year));
    };

    it("takes a director from the row to a name field, and saves it", async () => {
      await openSheet();
      fireEvent.click(screen.getByText("Rename"));
      const field = screen.getByDisplayValue("WBC 2015");
      fireEvent.change(field, { target: { value: "The Snow Bowl" } });
      fireEvent.click(screen.getByText("Save name"));
      await waitFor(() => expect(renames).toEqual([["wbc_2015", "The Snow Bowl"]]));
      // Back on the list, and the year it was typed for is carrying it — the
      // row leads with where it was played, so the name is a tap deeper.
      await waitFor(() => expect(screen.getByText("2015")).toBeTruthy());
      fireEvent.click(screen.getByText("2015"));
      expect(screen.getByText(/The Snow Bowl/)).toBeTruthy();
    });

    it("refuses to save an empty name rather than clearing one", async () => {
      await openSheet();
      fireEvent.click(screen.getByText("Rename"));
      fireEvent.change(screen.getByDisplayValue("WBC 2015"), { target: { value: "   " } });
      fireEvent.click(screen.getByText("Save name"));
      expect(renames).toEqual([]);
    });

    it("is not offered to a member", async () => {
      open({ canManage: false });
      await screen.findByText("2026");
      fireEvent.click(screen.getByText("2015"));
      expect(screen.queryByText("Rename")).toBeNull();
    });
  });
});
