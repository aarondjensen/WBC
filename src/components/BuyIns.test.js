/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the collection sheet say what the director just did?
// ══════════════════════════════════════════════════════════════════
//
// lib/sideGames already proves the arithmetic — what a man is billed, what is
// still to come in, what a column heading should read. This asks the one
// question that suite cannot: does the SHEET show the number the director is
// working from.
//
// It exists because it did not. Marking a man paid filled his cell in green
// with two ticks and left his OWES line at the full $80, so the two halves of
// the same row disagreed for the whole weekend and the director had to keep
// the real total in their head — which is the job this panel was built to
// take off them.
//
// The second half asks the other question only a mounted sheet can answer:
// which taps stop and ask, and — just as important — which ones do not.
//
// What the sheet READS is checked by re-mounting with a new games array rather
// than by clicking, because that is how the change actually arrives: a tap
// writes to Firestore, the subscription lands, and the sheet is drawn again
// from the new lists. What a tap DOES is checked on the patch it hands to
// onChange, which is the whole of what it changes.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { createElement as h } from "react";
import { BuyInTracker, BuyInPrices } from "./BuyIns";
import { SIDE_GAME_KEYS, SIDE_GAME_LABELS } from "../constants";

afterEach(cleanup);

const PLAYERS = [{ id: "a", name: "Aaron" }, { id: "b", name: "Brad" }];

// Two tagged games at $20 and $25, so a half-paid row is a number nobody could
// mistake for either the full bill or nothing.
const games = ({ skinsPaid = [], netPaid = [] } = {}) => [
  { key: "skins", label: "Skins", short: "SKIN", amount: 20, ids: null, paid: skinsPaid },
  { key: "lownet", label: "Low Net", short: "NET", amount: 25, ids: null, paid: netPaid },
];

// The OWES cell is the last thing in the player's row.
const owesFor = (name) => {
  const row = screen.getByText(name).closest("div");
  return row.lastChild.textContent;
};

const mount = (gs, extra = {}) =>
  render(h(BuyInTracker, { players: PLAYERS, games: gs, onChange: vi.fn(), ...extra }));

describe("BuyInTracker's owed column", () => {
  it("bills the whole seat before anybody has paid", () => {
    mount(games());
    expect(owesFor("Aaron")).toBe("$45");
    expect(owesFor("Brad")).toBe("$45");
  });

  // The bug, in one assertion: the cell went green and the money did not move.
  it("comes down by the buy-in that was just settled", () => {
    mount(games({ skinsPaid: ["a"] }));
    expect(owesFor("Aaron")).toBe("$25");
    expect(owesFor("Brad")).toBe("$45");
  });

  it("clears to a tick once a man has settled everything", () => {
    mount(games({ skinsPaid: ["a"], netPaid: ["a"] }));
    expect(owesFor("Aaron")).toBe("✓");
    expect(owesFor("Brad")).toBe("$45");
  });

  // Settled and never-in are different answers and must not read the same.
  it("shows a dash, not a tick, for a man who is in nothing", () => {
    mount([
      { key: "skins", label: "Skins", short: "SKIN", amount: 20, ids: ["b"], paid: ["b"] },
      { key: "lownet", label: "Low Net", short: "NET", amount: 25, ids: ["b"], paid: [] },
    ]);
    expect(owesFor("Aaron")).toBe("—");
    expect(owesFor("Brad")).toBe("$25");
  });

  it("counts the room down to nothing as the money comes in", () => {
    const { unmount } = mount(games());
    expect(screen.getByText("$90.00")).toBeTruthy();     // still to collect
    unmount();
    mount(games({ skinsPaid: ["a", "b"], netPaid: ["a", "b"] }));
    expect(screen.getByText("$0.00")).toBeTruthy();
    expect(screen.getByText("$90.00 of $90.00")).toBeTruthy();
  });
});

// ── The brakes on money coming back off ───────────────────────────
//
// A mis-tap that clears a payment leaves no trace: the row reads exactly like
// a man who never paid, and the director finds out on Sunday by asking him
// for money he already handed over. So those taps ask first — and only those,
// because a confirm in front of the ordinary tick would be dismissed sixteen
// times a morning and stop being read.
describe("un-marking a payment asks first", () => {
  // Aaron has paid skins; Brad has not. The cell is found by its ticks.
  const cellsIn = (name) => Array.from(screen.getByText(name).closest("div").querySelectorAll("div"));
  const tick = (name, ticks) => cellsIn(name).find(d => d.textContent === ticks);

  it("holds the tap that would clear a paid cell", async () => {
    const onChange = vi.fn();
    render(h(BuyInTracker, { players: PLAYERS, games: games({ skinsPaid: ["a"] }), onChange }));
    fireEvent.click(tick("Aaron", "✓✓"));
    expect(await screen.findByText("Take them out?")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does it once the director says so, and says what it costs", async () => {
    const onChange = vi.fn();
    render(h(BuyInTracker, { players: PLAYERS, games: games({ skinsPaid: ["a"] }), onChange }));
    fireEvent.click(tick("Aaron", "✓✓"));
    expect(await screen.findByText(/Aaron has paid \$20\.00 for Skins/)).toBeTruthy();
    fireEvent.click(screen.getByText("Take out"));
    // Out of the game AND the payment cleared — never one without the other.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ skins: { in: ["b"], paid: [] } }));
  });

  it("leaves the sheet alone when the director backs out", async () => {
    const onChange = vi.fn();
    render(h(BuyInTracker, { players: PLAYERS, games: games({ skinsPaid: ["a"] }), onChange }));
    fireEvent.click(tick("Aaron", "✓✓"));
    fireEvent.click(await screen.findByText("Leave it"));
    await waitFor(() => expect(screen.queryByText("Leave it")).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  // The other direction is the common one and must stay a single tap.
  it("marks a man paid without asking anything", () => {
    const onChange = vi.fn();
    render(h(BuyInTracker, { players: PLAYERS, games: games({ skinsPaid: ["a"] }), onChange }));
    fireEvent.click(tick("Brad", "✓"));
    expect(onChange).toHaveBeenCalledWith({ skins: { paid: ["a", "b"] } });
    expect(screen.queryByText("Leave it")).toBeNull();
  });

  it("holds a name tap that would drop a man who has settled up", async () => {
    const onChange = vi.fn();
    render(h(BuyInTracker, { players: PLAYERS, games: games({ skinsPaid: ["a"], netPaid: ["a"] }), onChange }));
    fireEvent.click(screen.getByText("Aaron"));
    expect(await screen.findByText(/paid \$45\.00 across 2 buy-ins/)).toBeTruthy();
    fireEvent.click(screen.getByText("Take out"));
    // His paid flags leave with him, or putting him back would read as settled.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({
      skins: { in: ["b"], paid: [] },
      lownet: { in: ["b"], paid: [] },
    }));
  });

  it("drops a man who has paid nothing on one tap", () => {
    const onChange = vi.fn();
    render(h(BuyInTracker, { players: PLAYERS, games: games(), onChange }));
    fireEvent.click(screen.getByText("Brad"));
    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByText("Leave it")).toBeNull();
  });

  // The most expensive tap on the sheet: a weekend of collecting, one heading.
  it("holds the heading tap that would clear a settled column", async () => {
    const onChange = vi.fn();
    render(h(BuyInTracker, { players: PLAYERS, games: games({ skinsPaid: ["a", "b"] }), onChange }));
    fireEvent.click(screen.getByText("SKIN"));
    expect(await screen.findByText(/down as paid \(\$40\.00\)/)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Clear column"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ skins: { in: [], paid: [] } }));
  });

  it("marks a whole column paid without asking", () => {
    const onChange = vi.fn();
    render(h(BuyInTracker, { players: PLAYERS, games: games(), onChange }));
    fireEvent.click(screen.getByText("SKIN"));
    expect(onChange).toHaveBeenCalledWith({ skins: { paid: ["a", "b"] } });
  });

  // The rebuy column cannot be tagged in or out, so its paid cell is the only
  // thing a tap can change — and un-ticking it is the plainest form of this.
  it("holds the derived column's paid cell too", async () => {
    const onChange = vi.fn();
    const rebuy = [{ key: "rebuy", ...SIDE_GAME_LABELS.rebuy, amount: 25, ids: ["a"], derived: true, paid: ["a"] }];
    render(h(BuyInTracker, { players: PLAYERS, games: rebuy, onChange }));
    fireEvent.click(tick("Aaron", "✓✓"));
    expect(await screen.findByText("Mark unpaid?")).toBeTruthy();
    fireEvent.click(screen.getByText("Mark unpaid"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ rebuy: { paid: [] } }));
  });
});

// The mount test the layout rule asks for: every state this panel is opened
// in, drawn once, including the two nobody develops against.
describe("the buy-in panels render", () => {
  const full = (over = {}) => SIDE_GAME_KEYS.map(k => ({
    key: k, ...SIDE_GAME_LABELS[k], amount: 20, ids: null, paid: [], ...over,
  }));

  it("draws all five buy-ins for a tagged field", () => {
    mount(full());
    expect(screen.getByText("WHO IS IN")).toBeTruthy();
    expect(screen.getByText("OWES")).toBeTruthy();
  });

  // A derived column cannot be tagged in or out — tapping it must be inert
  // rather than throwing on a `paid` list that is not there.
  it("survives a derived column with nothing recorded in it", () => {
    const onChange = vi.fn();
    mount([{ key: "rebuy", ...SIDE_GAME_LABELS.rebuy, amount: 25, ids: [], derived: true, paid: null }], { onChange });
    fireEvent.click(screen.getByText("RE"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders an edition with no roster and no prices", () => {
    render(h(BuyInTracker, { players: [], games: full({ amount: 0 }), onChange: vi.fn() }));
    expect(screen.getByText("WHO IS IN")).toBeTruthy();
  });

  it("renders the price sheet, priced and unpriced", () => {
    const { unmount } = render(h(BuyInPrices, { players: PLAYERS, games: full(), onChange: vi.fn() }));
    expect(screen.getByText("TOTAL BUY-INS")).toBeTruthy();
    unmount();
    render(h(BuyInPrices, { players: [], games: full({ amount: 0 }), onChange: vi.fn() }));
    expect(screen.getByText("TOTAL BUY-INS")).toBeTruthy();
  });
});
