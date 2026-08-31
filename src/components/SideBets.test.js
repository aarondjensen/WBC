/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the ledger appear, and does it ask the right thing of you?
// ══════════════════════════════════════════════════════════════════
//
// The mount half is the same low-ceiling job BettingView.test.js does: if
// somebody taps this sub-tab, does a screen appear. The arithmetic — who is
// settled, what is at stake, who may delete — is lib/sideBets' and has its own
// suite there.
//
// What this adds on top is the one thing that is genuinely the SCREEN's: the
// four settle states each put a different button in front of a different
// person, and getting that wrong means either a bet nobody can close or a
// button whose write the rules refuse. Those two failures look identical from
// the library's side, because the library is right in both.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { SideBets } from "./SideBets";

afterEach(cleanup);

const PLAYERS = [
  { id: "aaron_j", name: "Aaron J" },
  { id: "dave_s", name: "Dave S" },
  { id: "gus_p", name: "Gus P" },
];

const bet = (over = {}) => ({
  id: "b1", tournament_id: "wbc_2026", created_by: "uid_aaron",
  player_a: "aaron_j", player_b: "dave_s", amount: 20,
  detail: "Low score on the back, straight up.", settled_by: [], created_at: 1000,
  ...over,
});

const baseProps = {
  players: PLAYERS,
  bets: [bet()],
  user: { id: "aaron_j", name: "Aaron J", isDirector: false },
  authUid: "uid_aaron",
  onAddBet: vi.fn(),
  onEditBet: vi.fn(),
  onDeleteBet: vi.fn(),
  onSettleBet: vi.fn(),
  confirm: vi.fn(async () => true),
};

const mount = (extra = {}) => render(h(SideBets, { ...baseProps, ...extra }));

describe("SideBets renders", () => {
  it("shows the bet, its terms and what it is worth", () => {
    mount();
    expect(screen.getByText("Aaron J")).toBeTruthy();
    expect(screen.getByText("Dave S")).toBeTruthy();
    expect(screen.getByText("$20.00")).toBeTruthy();
    expect(screen.getByText(/Low score on the back/)).toBeTruthy();
  });

  // An empty ledger is the state every tournament starts in, and the state
  // nobody develops against.
  it("says so when nothing has been bet yet", () => {
    mount({ bets: [] });
    expect(screen.getByText("No side bets yet")).toBeTruthy();
  });

  // Filtered-to-empty is a different answer from nothing-exists.
  it("says something different when the filter emptied it", () => {
    mount({ user: { id: "gus_p", name: "Gus P", isDirector: false }, authUid: "uid_gus" });
    fireEvent.click(screen.getByText("Me"));
    expect(screen.getByText("None of these are yours")).toBeTruthy();
  });

  // A guest, or a phone reading a past year: the ledger is a record to read,
  // and every affordance whose write the rules would refuse is absent.
  it("gives a signed-out reader no way to write", () => {
    mount({ authUid: null, user: null });
    expect(screen.queryByText("+ ADD BET")).toBeNull();
    expect(screen.queryByText("MARK PAID")).toBeNull();
    expect(screen.queryByLabelText("Edit this bet")).toBeNull();
    expect(screen.queryByLabelText("Delete this bet")).toBeNull();
  });

  it("renders a tournament with a whole ledger on it", () => {
    mount({
      bets: [
        bet({ id: "b1" }),
        bet({ id: "b2", player_a: "dave_s", player_b: "gus_p", amount: 5, detail: "" }),
        bet({ id: "b3", settled_by: ["aaron_j", "dave_s"] }),
        bet({ id: "b4", settled_by: ["dave_s"] }),
      ],
    });
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });
});

// ── The four states, and who each of them asks ────────────────────
describe("the settle strip", () => {
  const asAaron = (b) => mount({ bets: [b] });

  it("offers a mark on a bet nobody has claimed", () => {
    asAaron(bet());
    expect(screen.getByText("MARK PAID")).toBeTruthy();
  });

  it("asks the other side to CONFIRM once one of them has claimed it", () => {
    asAaron(bet({ settled_by: ["dave_s"] }));
    expect(screen.getByText("CONFIRM")).toBeTruthy();
    expect(screen.getByText("Dave S SAYS PAID")).toBeTruthy();
  });

  it("waits, once you are the one who claimed it", () => {
    asAaron(bet({ settled_by: ["aaron_j"] }));
    expect(screen.getByText("WAITING ON Dave S")).toBeTruthy();
    expect(screen.getByText("UNDO")).toBeTruthy();
  });

  it("is settled once both have, and can be reopened", () => {
    asAaron(bet({ settled_by: ["aaron_j", "dave_s"] }));
    expect(screen.getByText("SETTLED ✓")).toBeTruthy();
    expect(screen.getByText("REOPEN")).toBeTruthy();
  });

  // A bystander is told where a bet got to and is asked for nothing — the
  // buttons are what the rules would refuse them.
  it("asks nothing of somebody not in the bet", () => {
    mount({ user: { id: "gus_p", name: "Gus P", isDirector: false }, authUid: "uid_gus",
            bets: [bet({ settled_by: ["dave_s"] })] });
    expect(screen.getByText("Dave S SAYS PAID")).toBeTruthy();
    expect(screen.queryByText("CONFIRM")).toBeNull();
    expect(screen.queryByText("MARK PAID")).toBeNull();
  });

  it("hands the mark to the app as this player's own", async () => {
    const onSettleBet = vi.fn();
    mount({ onSettleBet });
    fireEvent.click(screen.getByText("MARK PAID"));
    expect(onSettleBet).toHaveBeenCalledWith(expect.objectContaining({ id: "b1" }), "aaron_j");
  });

  // A claim about money that did not land must not sit on screen as though it
  // did — the whole point of the mark is that it was recorded.
  it("says so when the write is refused", async () => {
    const onSettleBet = vi.fn(async () => { throw new Error("nope"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount({ onSettleBet });
    fireEvent.click(screen.getByText("MARK PAID"));
    expect(await screen.findByText(/Couldn't record that/)).toBeTruthy();
    console.error.mockRestore();
  });
});

// ── Deleting ──────────────────────────────────────────────────────
// The screen must offer the ✕ to exactly the people firestore.rules would let
// through: the author and a director. A button that only fails is worse than
// no button.
describe("removing a bet", () => {
  it("offers it to the person who logged it", () => {
    mount();
    expect(screen.getByLabelText("Delete this bet")).toBeTruthy();
  });

  it("does not offer it to the other side of the bet", () => {
    mount({ user: { id: "dave_s", name: "Dave S", isDirector: false }, authUid: "uid_dave" });
    expect(screen.queryByLabelText("Delete this bet")).toBeNull();
  });

  it("offers it to a director cleaning up", () => {
    mount({ user: { id: "gus_p", name: "Gus P", isDirector: true }, authUid: "uid_gus" });
    expect(screen.getByLabelText("Delete this bet")).toBeTruthy();
  });

  it("asks before it removes the record for everybody", async () => {
    const confirm = vi.fn(async () => false);
    const onDeleteBet = vi.fn();
    mount({ confirm, onDeleteBet });
    fireEvent.click(screen.getByLabelText("Delete this bet"));
    await Promise.resolve();
    expect(confirm).toHaveBeenCalled();
    expect(onDeleteBet).not.toHaveBeenCalled();
  });
});

// ── The form ──────────────────────────────────────────────────────
describe("logging a bet", () => {
  const openSheet = (extra = {}) => {
    mount(extra);
    fireEvent.click(screen.getByText("+ ADD BET"));
  };

  it("opens on a tap and defaults side A to whoever is holding the phone", () => {
    openSheet();
    expect(screen.getByText("New side bet")).toBeTruthy();
    expect(document.querySelectorAll("select")[0].value).toBe("aaron_j");
  });

  // The first thing wrong, not a list of three — see lib/sideBets sideBetError.
  it("refuses a bet with nobody on the other side", async () => {
    openSheet();
    fireEvent.click(screen.getByText("Add bet"));
    expect(await screen.findByText("Pick both players.")).toBeTruthy();
  });

  it("hands a complete bet to the app", async () => {
    const onAddBet = vi.fn();
    openSheet({ onAddBet });
    const [, sideB] = document.querySelectorAll("select");
    fireEvent.change(sideB, { target: { value: "dave_s" } });
    fireEvent.change(document.querySelector("input[type=number]"), { target: { value: "25" } });
    fireEvent.change(document.querySelector("textarea"), { target: { value: "Press on 17" } });
    fireEvent.click(screen.getByText("Add bet"));
    expect(onAddBet).toHaveBeenCalledWith({
      playerA: "aaron_j", playerB: "dave_s", amount: "25", detail: "Press on 17",
    });
  });

  // A ledger that appears to accept a bet it never recorded is the one failure
  // this screen must not have. The sheet stays open so the typing survives.
  it("keeps the sheet open and says so when the save is refused", async () => {
    const onAddBet = vi.fn(async () => { throw new Error("nope"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    openSheet({ onAddBet });
    fireEvent.change(document.querySelectorAll("select")[1], { target: { value: "dave_s" } });
    fireEvent.change(document.querySelector("input[type=number]"), { target: { value: "25" } });
    fireEvent.click(screen.getByText("Add bet"));
    expect(await screen.findByText(/Couldn't save/)).toBeTruthy();
    expect(screen.getByText("New side bet")).toBeTruthy();
    console.error.mockRestore();
  });
});

// ── Editing ───────────────────────────────────────────────────────
// The pencil goes to a wider set of people than the ✕ — see lib/sideBets
// canEditSideBet, and the `update` clause in firestore.rules it mirrors. The
// failure this guards is the same one the delete tests guard from the other
// side: a button offered to somebody whose write the rules would refuse.
describe("editing a bet", () => {
  it("offers it to the person who logged it", () => {
    mount();
    expect(screen.getByLabelText("Edit this bet")).toBeTruthy();
  });

  // The one place editing is deliberately wider than deleting.
  it("offers it to the other side of the bet, who may not delete it", () => {
    mount({ user: { id: "dave_s", name: "Dave S", isDirector: false }, authUid: "uid_dave" });
    expect(screen.getByLabelText("Edit this bet")).toBeTruthy();
    expect(screen.queryByLabelText("Delete this bet")).toBeNull();
  });

  it("offers it to a director", () => {
    mount({ user: { id: "gus_p", name: "Gus P", isDirector: true }, authUid: "uid_gus" });
    expect(screen.getByLabelText("Edit this bet")).toBeTruthy();
  });

  it("does not offer it to somebody with no stake in it", () => {
    mount({ user: { id: "gus_p", name: "Gus P", isDirector: false }, authUid: "uid_gus" });
    expect(screen.queryByLabelText("Edit this bet")).toBeNull();
  });

  const openEdit = (extra = {}) => {
    mount(extra);
    fireEvent.click(screen.getByLabelText("Edit this bet"));
  };

  // A form that opened empty would be a rewrite rather than a correction, and
  // the typo somebody came here to fix is in the part they would have to retype.
  it("opens on the bet as it stands", () => {
    openEdit();
    expect(screen.getByText("Edit side bet")).toBeTruthy();
    const [a, b] = document.querySelectorAll("select");
    expect(a.value).toBe("aaron_j");
    expect(b.value).toBe("dave_s");
    expect(document.querySelector("input[type=number]").value).toBe("20");
    expect(document.querySelector("textarea").value).toBe("Low score on the back, straight up.");
  });

  it("hands the correction back with the bet it belongs to", () => {
    const onEditBet = vi.fn();
    openEdit({ onEditBet });
    fireEvent.change(document.querySelector("input[type=number]"), { target: { value: "50" } });
    fireEvent.click(screen.getByText("Save bet"));
    expect(onEditBet).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b1" }),
      { playerA: "aaron_j", playerB: "dave_s", amount: "50", detail: "Low score on the back, straight up." },
    );
  });

  // The same refusals the add form makes, because it is the same form.
  it("refuses a correction that empties a side", () => {
    openEdit();
    fireEvent.change(document.querySelectorAll("select")[1], { target: { value: "" } });
    fireEvent.click(screen.getByText("Save bet"));
    expect(screen.getByText("Pick both players.")).toBeTruthy();
  });

  // buildSideBetEdit drops the marks when the money moves, and a settled bet
  // reopening under somebody unannounced is how an app gets blamed for the
  // argument it exists to prevent.
  it("says up front when the change will take the paid marks off", () => {
    openEdit({ bets: [bet({ settled_by: ["aaron_j", "dave_s"] })] });
    expect(screen.queryByText(/the paid marks come off/)).toBeNull();
    fireEvent.change(document.querySelector("input[type=number]"), { target: { value: "50" } });
    expect(screen.getByText(/the paid marks come off/)).toBeTruthy();
  });

  it("says nothing of the sort for a wording fix", () => {
    openEdit({ bets: [bet({ settled_by: ["aaron_j", "dave_s"] })] });
    fireEvent.change(document.querySelector("textarea"), { target: { value: "Front nine" } });
    expect(screen.queryByText(/the paid marks come off/)).toBeNull();
  });

  it("keeps the sheet open and says so when the save is refused", async () => {
    const onEditBet = vi.fn(async () => { throw new Error("nope"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    openEdit({ onEditBet });
    fireEvent.click(screen.getByText("Save bet"));
    expect(await screen.findByText(/Couldn't save/)).toBeTruthy();
    expect(screen.getByText("Edit side bet")).toBeTruthy();
    console.error.mockRestore();
  });
});

// ── Running it back ───────────────────────────────────────────────
// A settled bet is very often the start of the next one. The failure to avoid
// is a rematch that eats the record of the first: the settled row must stay
// settled and stay on the board, and the repeat must arrive as a NEW bet.
describe("repeating a settled bet", () => {
  const settled = (over = {}) => bet({ settled_by: ["aaron_j", "dave_s"], ...over });

  it("offers it to a player on a bet both sides have paid", () => {
    mount({ bets: [settled()] });
    expect(screen.getByText("RUN IT BACK")).toBeTruthy();
    // Beside REOPEN, not instead of it.
    expect(screen.getByText("REOPEN")).toBeTruthy();
  });

  it("does not offer it while the bet is still live", () => {
    mount({ bets: [bet()] });
    expect(screen.queryByText("RUN IT BACK")).toBeNull();
  });

  it("does not offer it on a bet only one side has marked", () => {
    mount({ bets: [bet({ settled_by: ["dave_s"] })] });
    expect(screen.queryByText("RUN IT BACK")).toBeNull();
  });

  // Somebody else's rematch is not yours to arrange.
  it("does not offer it to a bystander reading the row", () => {
    mount({ bets: [settled()], user: { id: "gus_p", name: "Gus P", isDirector: false }, authUid: "uid_gus" });
    expect(screen.getByText("SETTLED ✓")).toBeTruthy();
    expect(screen.queryByText("RUN IT BACK")).toBeNull();
  });

  it("does not offer it to a signed-out reader", () => {
    mount({ bets: [settled()], authUid: null, user: null });
    expect(screen.queryByText("RUN IT BACK")).toBeNull();
  });

  const openRepeat = (extra = {}) => {
    mount({ bets: [settled()], ...extra });
    fireEvent.click(screen.getByText("RUN IT BACK"));
  };

  it("opens the sheet on the same terms, as a new bet", () => {
    openRepeat();
    expect(screen.getByText("Run it back")).toBeTruthy();
    const [a, b] = document.querySelectorAll("select");
    expect(a.value).toBe("aaron_j");
    expect(b.value).toBe("dave_s");
    expect(document.querySelector("input[type=number]").value).toBe("20");
    expect(document.querySelector("textarea").value).toBe("Low score on the back, straight up.");
    // The button that saves a NEW bet, not the one that patches the old.
    expect(screen.getByText("Add bet")).toBeTruthy();
  });

  // The whole point of a sheet rather than a one-tap repeat: the rematch is
  // usually the same bet with the stakes moved.
  it("lets the stakes move before the rematch is agreed", () => {
    const onAddBet = vi.fn();
    openRepeat({ onAddBet });
    fireEvent.change(document.querySelector("input[type=number]"), { target: { value: "40" } });
    fireEvent.click(screen.getByText("Add bet"));
    expect(onAddBet).toHaveBeenCalledWith({
      playerA: "aaron_j", playerB: "dave_s", amount: "40",
      detail: "Low score on the back, straight up.",
    });
  });

  // The settled row is the record that the first wager was paid. A repeat that
  // patched it would erase the one thing the ledger is for.
  it("writes a new bet and leaves the settled one alone", () => {
    const onAddBet = vi.fn();
    const onEditBet = vi.fn();
    const onSettleBet = vi.fn();
    openRepeat({ onAddBet, onEditBet, onSettleBet });
    fireEvent.click(screen.getByText("Add bet"));
    expect(onAddBet).toHaveBeenCalled();
    expect(onEditBet).not.toHaveBeenCalled();
    expect(onSettleBet).not.toHaveBeenCalled();
  });
});
