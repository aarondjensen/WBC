import { describe, it, expect } from "vitest";
import {
  sideBetId, sideBetError, buildSideBet, sortSideBets,
  inSideBet, sideBetTotals, canDeleteSideBet, canEditSideBet, buildSideBetEdit,
  canRepeatSideBet, repeatSideBetSeed, MAX_DETAIL,
  settledBy, hasSettled, isSettled, toggleSettled, settleState,
} from "./sideBets";

const bet = (over = {}) => ({
  id: "b1", tournament_id: "wbc_2026", created_by: "uid_a",
  player_a: "aaron_j", player_b: "dave_s", amount: 20, detail: "", created_at: 1000,
  ...over,
});

describe("sideBetId", () => {
  // Two phones on the same tee, same millisecond. Without the random tail one
  // bet silently overwrites the other.
  it("does not collide for the same timestamp", () => {
    expect(sideBetId(1700, 0.1)).not.toBe(sideBetId(1700, 0.9));
  });
  it("is a plain document id", () => {
    expect(sideBetId(1700, 0.5)).toMatch(/^wbc_sidebet_1700_[0-9a-z]+$/);
  });
});

describe("sideBetError", () => {
  it("accepts a complete bet", () => {
    expect(sideBetError({ playerA: "aaron_j", playerB: "dave_s", amount: "20" })).toBeNull();
  });
  it("wants both players", () => {
    expect(sideBetError({ playerA: "aaron_j", playerB: "", amount: "20" })).toMatch(/both/i);
  });
  // A bet against yourself is not a bet, and it would render as one name twice.
  it("refuses a player betting themselves", () => {
    expect(sideBetError({ playerA: "aaron_j", playerB: "aaron_j", amount: "20" })).toMatch(/different/i);
  });
  it("wants a positive amount", () => {
    expect(sideBetError({ playerA: "aaron_j", playerB: "dave_s", amount: "0" })).toMatch(/amount/i);
    expect(sideBetError({ playerA: "aaron_j", playerB: "dave_s", amount: "-5" })).toMatch(/amount/i);
    expect(sideBetError({ playerA: "aaron_j", playerB: "dave_s", amount: "" })).toMatch(/amount/i);
    expect(sideBetError({ playerA: "aaron_j", playerB: "dave_s", amount: "abc" })).toMatch(/amount/i);
  });
});

describe("buildSideBet", () => {
  const built = (over = {}) => buildSideBet({
    id: "b9", tournamentId: "wbc_2026", createdBy: "uid_a",
    playerA: "aaron_j", playerB: "dave_s", amount: "20", detail: "  low score, back 9  ",
    now: 1234, ...over,
  });

  it("stores the amount as a number", () => {
    expect(built().amount).toBe(20);
  });
  it("trims the terms", () => {
    expect(built().detail).toBe("low score, back 9");
  });
  it("caps the terms rather than storing a wall of text", () => {
    expect(built({ detail: "x".repeat(500) }).detail).toHaveLength(MAX_DETAIL);
  });
  // The field the delete rule trusts. It is the caller's uid, never a roster
  // id — see the note in sideBets.js.
  it("records the author as an auth uid", () => {
    expect(built().created_by).toBe("uid_a");
  });
  it("carries the edition, so a year's bets go with the year", () => {
    expect(built().tournament_id).toBe("wbc_2026");
  });
  // db.upsert needs one, and a document written without it lands under a random
  // Firestore id that nothing can settle or delete afterwards.
  it("carries its own document id", () => {
    expect(built().id).toBe("b9");
  });
});

describe("sortSideBets", () => {
  it("puts the newest first", () => {
    const rows = [bet({ id: "old", created_at: 1 }), bet({ id: "new", created_at: 9 })];
    expect(sortSideBets(rows).map(b => b.id)).toEqual(["new", "old"]);
  });
  it("does not mutate its input", () => {
    const rows = [bet({ id: "a", created_at: 1 }), bet({ id: "b", created_at: 9 })];
    sortSideBets(rows);
    expect(rows.map(b => b.id)).toEqual(["a", "b"]);
  });
  // A ledger is read for what is still owed. A squared-up bet is history.
  it("sinks settled bets below open ones, newest first within each", () => {
    const rows = [
      bet({ id: "settled_new", created_at: 9, settled_by: ["aaron_j", "dave_s"] }),
      bet({ id: "open_old", created_at: 1 }),
      bet({ id: "settled_old", created_at: 0, settled_by: ["aaron_j", "dave_s"] }),
      bet({ id: "open_new", created_at: 5 }),
    ];
    expect(sortSideBets(rows).map(b => b.id))
      .toEqual(["open_new", "open_old", "settled_new", "settled_old"]);
  });
});

describe("settling", () => {
  // Bets written before settling existed carry no field at all.
  it("reads a missing mark list as nobody", () => {
    expect(settledBy(bet({ settled_by: undefined }))).toEqual([]);
    expect(isSettled(bet({ settled_by: undefined }))).toBe(false);
  });

  it("knows who has marked", () => {
    const b = bet({ settled_by: ["aaron_j"] });
    expect(hasSettled(b, "aaron_j")).toBe(true);
    expect(hasSettled(b, "dave_s")).toBe(false);
    expect(hasSettled(b, null)).toBe(false);
  });

  // The whole point: one player cannot close a bet on the other's behalf.
  it("is not settled until BOTH sides have marked", () => {
    expect(isSettled(bet({ settled_by: ["aaron_j"] }))).toBe(false);
    expect(isSettled(bet({ settled_by: ["dave_s"] }))).toBe(false);
    expect(isSettled(bet({ settled_by: ["aaron_j", "dave_s"] }))).toBe(true);
  });

  // A stray id left by an edit must not settle a bet by itself.
  it("ignores marks from players who are not in the bet", () => {
    expect(isSettled(bet({ settled_by: ["aaron_j", "ghost_p"] }))).toBe(false);
    expect(toggleSettled(bet({ settled_by: ["aaron_j", "ghost_p"] }), "dave_s"))
      .toEqual(["aaron_j", "dave_s"]);
  });

  describe("toggleSettled", () => {
    it("adds a player's own mark", () => {
      expect(toggleSettled(bet(), "aaron_j")).toEqual(["aaron_j"]);
    });
    it("withdraws it again, leaving nothing behind", () => {
      expect(toggleSettled(bet({ settled_by: ["aaron_j", "dave_s"] }), "aaron_j")).toEqual(["dave_s"]);
    });
    it("cannot stack a mark twice", () => {
      const once = toggleSettled(bet(), "aaron_j");
      expect(toggleSettled(bet({ settled_by: once }), "dave_s")).toEqual(["aaron_j", "dave_s"]);
    });
    it("refuses a player who is not in the bet", () => {
      expect(toggleSettled(bet({ settled_by: ["aaron_j"] }), "ghost_p")).toEqual(["aaron_j"]);
    });
  });

  describe("settleState", () => {
    it("is open when neither side has marked", () => {
      expect(settleState(bet(), "aaron_j")).toBe("open");
    });
    it("waits on the other side once you have marked", () => {
      expect(settleState(bet({ settled_by: ["aaron_j"] }), "aaron_j")).toBe("waiting");
    });
    // The only state that asks the reader for anything.
    it("asks you to confirm when they marked first", () => {
      expect(settleState(bet({ settled_by: ["dave_s"] }), "aaron_j")).toBe("confirm");
    });
    it("is settled once both have", () => {
      expect(settleState(bet({ settled_by: ["aaron_j", "dave_s"] }), "aaron_j")).toBe("settled");
    });
    // A bystander sees where it got to and is asked for nothing.
    it("says watching for somebody not in the bet", () => {
      expect(settleState(bet({ settled_by: ["aaron_j"] }), "gus_p")).toBe("watching");
      expect(settleState(bet(), null)).toBe("watching");
    });
    it("says settled to a bystander too", () => {
      expect(settleState(bet({ settled_by: ["aaron_j", "dave_s"] }), "gus_p")).toBe("settled");
    });
  });
});

describe("inSideBet", () => {
  it("matches either side", () => {
    expect(inSideBet(bet(), "aaron_j")).toBe(true);
    expect(inSideBet(bet(), "dave_s")).toBe(true);
  });
  it("does not match a bystander", () => {
    expect(inSideBet(bet(), "gus_p")).toBe(false);
  });
  // A guest on the tour, or a director with no claimed profile, has no player
  // id at all.
  it("is false for nobody", () => {
    expect(inSideBet(bet(), null)).toBe(false);
  });
});

describe("sideBetTotals", () => {
  const rows = [
    bet({ id: "b1", amount: 20, player_a: "aaron_j", player_b: "dave_s" }),
    bet({ id: "b2", amount: 50, player_a: "gus_p", player_b: "jim_k" }),
    bet({ id: "b3", amount: 5, player_a: "dave_s", player_b: "aaron_j" }),
  ];
  it("sums everything on the table", () => {
    expect(sideBetTotals(rows, "aaron_j").atStake).toBe(75);
  });
  it("counts the bets", () => {
    expect(sideBetTotals(rows, "aaron_j").count).toBe(3);
  });
  // EXPOSURE, not a net position — nothing here knows who won.
  it("sums only the asking player's own exposure", () => {
    expect(sideBetTotals(rows, "aaron_j").mine).toBe(25);
    expect(sideBetTotals(rows, "jim_k").mine).toBe(50);
  });
  it("gives a spectator no exposure", () => {
    expect(sideBetTotals(rows, null).mine).toBe(0);
  });
  it("is zero across the board with no bets", () => {
    expect(sideBetTotals([], "aaron_j")).toEqual({ atStake: 0, count: 0, mine: 0 });
  });
});

describe("canDeleteSideBet", () => {
  // Mirrors the delete rule in firestore.rules. If these two ever disagree the
  // screen offers a button that only fails.
  it("lets the author remove their own", () => {
    expect(canDeleteSideBet(bet(), { uid: "uid_a", isDirector: false })).toBe(true);
  });
  it("lets a director clean up anybody's", () => {
    expect(canDeleteSideBet(bet(), { uid: "uid_z", isDirector: true })).toBe(true);
  });
  // The other side of a bet you dispute is not yours to erase.
  it("refuses the opponent", () => {
    expect(canDeleteSideBet(bet(), { uid: "uid_b", isDirector: false })).toBe(false);
  });
  it("refuses a signed-out reader", () => {
    expect(canDeleteSideBet(bet(), { uid: null, isDirector: false })).toBe(false);
  });
});

// ── Editing ───────────────────────────────────────────────────────
// Wider than deleting on purpose: correcting a bet you are a side of is an
// argument held in the open, where erasing one is not. Mirrors the `update`
// clause in firestore.rules — if these disagree the screen offers a pencil
// whose write the rules refuse.
describe("canEditSideBet", () => {
  const who = (over) => canEditSideBet(bet(), { uid: "uid_z", pid: "gus_p", isDirector: false, ...over });

  it("lets the author fix their own", () => {
    expect(who({ uid: "uid_a" })).toBe(true);
  });
  it("lets a director fix anybody's", () => {
    expect(who({ isDirector: true })).toBe(true);
  });
  // The half that deleting deliberately withholds.
  it("lets either player in the bet fix it, whoever logged it", () => {
    expect(who({ pid: "aaron_j" })).toBe(true);
    expect(who({ pid: "dave_s" })).toBe(true);
  });
  it("refuses somebody with no stake in it", () => {
    expect(who()).toBe(false);
  });
  // A roster id with no account behind it cannot write anything, and the
  // rules would refuse it even where this said yes.
  it("refuses a signed-out reader who is nonetheless in the bet", () => {
    expect(who({ uid: null, pid: "aaron_j" })).toBe(false);
  });
});

describe("buildSideBetEdit", () => {
  const edit = (over = {}, from = {}) => buildSideBetEdit(
    bet({ settled_by: ["aaron_j", "dave_s"], ...from }),
    { playerA: "aaron_j", playerB: "dave_s", amount: "20", detail: "  front nine  ", ...over },
  );

  it("addresses the row it is patching", () => {
    expect(edit().id).toBe("b1");
  });
  it("stores the amount as a number and trims the terms", () => {
    expect(edit({ amount: "45" }).amount).toBe(45);
    expect(edit().detail).toBe("front nine");
  });
  it("caps the terms the same way a new bet does", () => {
    expect(edit({ detail: "x".repeat(500) }).detail).toHaveLength(MAX_DETAIL);
  });
  // The fields nobody editing has any business moving are absent from the
  // patch rather than written back — a merge cannot carry a stale copy over
  // the truth if it never carries them at all.
  it("does not touch the author, the tournament or when it was logged", () => {
    expect(Object.keys(edit()).sort())
      .toEqual(["amount", "detail", "id", "player_a", "player_b", "settled_by"]);
  });

  // A "paid" mark was a claim about a specific amount between two specific
  // people. Move either and it is a claim about a bet that no longer exists.
  it("clears the paid marks when the money moves", () => {
    expect(edit({ amount: "50" }).settled_by).toEqual([]);
  });
  it("clears them when a player is swapped out", () => {
    expect(edit({ playerB: "gus_p" }).settled_by).toEqual([]);
  });
  // A typo fix is not a new bet, and un-paying two men over a spelling would
  // be the app picking an argument nobody was having.
  it("keeps them when only the wording changed", () => {
    expect(edit().settled_by).toEqual(["aaron_j", "dave_s"]);
  });
  // Always an array, always written — db.upsert merges, and a mark left out
  // of the patch is a mark that survives the edit that meant to end it.
  it("writes an empty list rather than leaving the field out", () => {
    expect(edit({ amount: "50" }, { settled_by: undefined }).settled_by).toEqual([]);
  });
  // A mark left over from an earlier edit, belonging to nobody in the bet.
  it("drops a mark that is not one of the two sides", () => {
    expect(edit({}, { settled_by: ["aaron_j", "gus_p"] }).settled_by).toEqual(["aaron_j"]);
  });
});

// ── Running it back ───────────────────────────────────────────────
// The money changes hands on the 18th green and somebody says "again
// tomorrow, double". A repeat is a NEW bet on the old terms — the settled row
// is the record that the first one was paid and must survive the rematch.
describe("canRepeatSideBet", () => {
  const done = (over = {}) => bet({ settled_by: ["aaron_j", "dave_s"], ...over });

  it("offers it to either player once the bet is settled", () => {
    expect(canRepeatSideBet(done(), { uid: "uid_a", pid: "aaron_j" })).toBe(true);
    expect(canRepeatSideBet(done(), { uid: "uid_b", pid: "dave_s" })).toBe(true);
  });
  // A live bet already exists. A button on it is a way to have the same wager
  // twice by accident.
  it("refuses a bet that is not finished", () => {
    expect(canRepeatSideBet(bet(), { uid: "uid_a", pid: "aaron_j" })).toBe(false);
    expect(canRepeatSideBet(bet({ settled_by: ["aaron_j"] }), { uid: "uid_a", pid: "aaron_j" })).toBe(false);
  });
  // Somebody else's rematch is not yours to arrange — unlike correcting a bet,
  // which is an argument you are a side of.
  it("refuses somebody who was not in it", () => {
    expect(canRepeatSideBet(done(), { uid: "uid_z", pid: "gus_p" })).toBe(false);
  });
  it("refuses a signed-out reader", () => {
    expect(canRepeatSideBet(done(), { uid: null, pid: "aaron_j" })).toBe(false);
  });
});

describe("repeatSideBetSeed", () => {
  const seeded = repeatSideBetSeed(bet({ amount: 20, detail: "front nine", settled_by: ["aaron_j", "dave_s"] }));

  it("carries the same two players and the same terms", () => {
    expect(seeded).toEqual({ playerA: "aaron_j", playerB: "dave_s", amount: "20", detail: "front nine" });
  });
  // The form holds an amount as a string; the number is buildSideBet's job.
  it("hands the amount over as the form's own kind of value", () => {
    expect(seeded.amount).toBe("20");
  });
  // Nothing of the settled bet's own identity comes along — the rematch is a
  // new row, and a stray id or a stray mark would make it the old one.
  it("carries no id, no author and no paid marks", () => {
    expect(Object.keys(seeded).sort()).toEqual(["amount", "detail", "playerA", "playerB"]);
  });
  it("survives a bet with no terms written on it", () => {
    expect(repeatSideBetSeed(bet({ detail: undefined })).detail).toBe("");
  });
});
