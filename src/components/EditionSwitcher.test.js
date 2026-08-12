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
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { createElement as h } from "react";

const EDITIONS = [
  { id: "wbc_2026", year: 2026, name: "WBC 2026" },
  { id: "wbc_2025", year: 2025, name: "WBC 2025" },
  { id: "wbc_2015", year: 2015, name: "WBC 2015" },
];
const SUMMARIES = {
  wbc_2026: { players: 0, rounds: 0, scores: 0 },
  wbc_2025: { players: 16, rounds: 4, scores: 1152, roundCount: 4, finalizedRounds: { 1: true, 2: true, 3: true, 4: true }, pairings: {} },
  wbc_2015: { players: 12, rounds: 4, scores: 864, roundCount: 4, finalizedRounds: { 1: true, 2: true, 3: true, 4: true }, pairings: {} },
};

// firebase.js initializes an app at import time, and lib/editions is the
// module that talks to Firestore — both are mocked, so this is a render test
// rather than a network one.
vi.mock("../firebase", () => ({ getActiveTournamentId: () => "wbc_2026" }));

// Resolved by hand so the test can hold the counts in flight and look at what
// is on screen while they are still coming.
let releaseSummaries;
const summariesLanded = () => new Promise((res) => { releaseSummaries = () => res(SUMMARIES); });

vi.mock("../lib/editions", () => ({
  ensureActiveEditionDoc: async () => EDITIONS,
  loadEditions: async () => EDITIONS,
  loadEditionSummaries: () => summariesLanded(),
  cachedEditionSummaries: () => null,
  cachedEditions: () => null,
  createEdition: async () => ({ id: "wbc_2027" }),
  cloneEdition: async () => ({ id: "wbc_2027" }),
  deleteEdition: async () => true,
  switchEdition: () => {},
}));

const { EditionSwitcher } = await import("./EditionSwitcher");

afterEach(cleanup);

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
});
