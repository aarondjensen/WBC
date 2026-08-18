import { describe, it, expect } from "vitest";
import { allRoundsFinalized, editionState, deleteVerdict, STATE_LABEL,
  editionDisplayName, editionActions } from "./editionLifecycle";
import { groupKey } from "./groupSwitch";

// A four-round tournament whose draw is two groups a round.
const DRAW = { 1: [["a", "b"], ["c", "d"]], 2: [["a", "c"], ["b", "d"]], 3: [["a", "d"], ["b", "c"]], 4: [["a", "b"], ["c", "d"]] };
const bySignature = (rounds) => {
  const fr = {};
  rounds.forEach(r => DRAW[r].forEach(ids => { fr[groupKey(r, ids)] = true; }));
  return fr;
};

describe("allRoundsFinalized", () => {
  it("is true when the director finalized every round from Admin", () => {
    expect(allRoundsFinalized({
      roundCount: 4, finalizedRounds: { 1: true, 2: true, 3: true, 4: true }, pairings: DRAW,
    })).toBe(true);
  });

  // The half this guard would have missed: a backtest played through the
  // scoring screen finalizes by GROUP KEY and never touches Admin.
  it("is true when every group signed its own card instead", () => {
    expect(allRoundsFinalized({
      roundCount: 4, finalizedRounds: bySignature([1, 2, 3, 4]), pairings: DRAW,
    })).toBe(true);
  });

  it("is false while one round is still out", () => {
    expect(allRoundsFinalized({
      roundCount: 4, finalizedRounds: bySignature([1, 2, 3]), pairings: DRAW,
    })).toBe(false);
  });

  it("is false while one GROUP of the last round is still out", () => {
    const fr = bySignature([1, 2, 3]);
    fr[groupKey(4, DRAW[4][0])] = true; // only the first group of round 4
    expect(allRoundsFinalized({ roundCount: 4, finalizedRounds: fr, pairings: DRAW })).toBe(false);
  });

  it("counts against the tournament's OWN round count, not a fixed four", () => {
    const three = { roundCount: 3, finalizedRounds: { 1: true, 2: true, 3: true }, pairings: DRAW };
    expect(allRoundsFinalized(three)).toBe(true);
  });

  it("is never true without a round count", () => {
    expect(allRoundsFinalized({ roundCount: 0, finalizedRounds: { 1: true }, pairings: DRAW })).toBe(false);
    expect(allRoundsFinalized()).toBe(false);
  });
});

describe("editionState", () => {
  it("calls a year with nothing in it empty", () => {
    expect(editionState({ players: 0, rounds: 0, scores: 0 })).toBe("empty");
  });

  it("calls a roster with no scores not-started", () => {
    expect(editionState({ players: 16, rounds: 4, scores: 0 })).toBe("setup");
  });

  it("calls a year with scores and an open round live", () => {
    expect(editionState({
      players: 16, rounds: 4, scores: 900,
      roundCount: 4, finalizedRounds: bySignature([1, 2]), pairings: DRAW,
    })).toBe("live");
  });

  it("calls a year with every round signed off complete", () => {
    expect(editionState({
      players: 16, rounds: 4, scores: 1368,
      roundCount: 4, finalizedRounds: bySignature([1, 2, 3, 4]), pairings: DRAW,
    })).toBe("complete");
  });

  it("is unknown when the counts could not be read", () => {
    expect(editionState(null)).toBe("unknown");
    expect(editionState(undefined)).toBe("unknown");
  });

  it("has a label for every state it can return", () => {
    ["empty", "setup", "live", "complete", "unknown"].forEach(s => {
      expect(typeof STATE_LABEL[s]).toBe("string");
    });
  });
});

describe("deleteVerdict", () => {
  it("refuses a finished tournament outright, with no confirm to get past", () => {
    const v = deleteVerdict("complete");
    expect(v.allowed).toBe(false);
    expect(v.why).toMatch(/record of the event/);
  });

  it("refuses the year the app is currently showing", () => {
    expect(deleteVerdict("empty", { isActive: true }).allowed).toBe(false);
    expect(deleteVerdict("complete", { isActive: true }).allowed).toBe(false);
  });

  it("refuses a year it could not read rather than guessing", () => {
    expect(deleteVerdict("unknown").allowed).toBe(false);
  });

  it("allows a tournament in progress, but marks it grave", () => {
    const v = deleteVerdict("live");
    expect(v.allowed).toBe(true);
    expect(v.grave).toBe(true);
  });

  it("allows an empty or set-up year without the extra weight", () => {
    expect(deleteVerdict("empty")).toMatchObject({ allowed: true, grave: false });
    expect(deleteVerdict("setup")).toMatchObject({ allowed: true, grave: false });
  });
});

// ── The sandbox is disposable by definition ────────────────────────
// Every refusal in deleteVerdict is about protecting a RECORD. The sandbox is
// not one — it exists to be played with and thrown away — and a good beta test
// leaves it looking exactly like the thing the guard refuses to delete: four
// finished rounds, sixteen players, a full leaderboard. Without the exemption
// the sandbox becomes permanent the first time somebody tests properly, and
// the only way out is the Firestore console.
describe("deleteVerdict and the sandbox", () => {
  it("lets a finished sandbox go, where a finished YEAR is protected", () => {
    expect(deleteVerdict("complete", { isSandbox: true }).allowed).toBe(true);
    expect(deleteVerdict("complete").allowed).toBe(false);
  });

  it("lets an unreadable sandbox go too", () => {
    // "Couldn't check" refuses a real year on purpose. There is nothing in the
    // sandbox worth being careful about.
    expect(deleteVerdict("unknown", { isSandbox: true }).allowed).toBe(true);
    expect(deleteVerdict("unknown").allowed).toBe(false);
  });

  it("never calls deleting the sandbox grave", () => {
    // A live YEAR is grave — the caller is expected to name the score count in
    // the confirm. Scores in the sandbox are nobody's round.
    expect(deleteVerdict("live", { isSandbox: true }).grave).toBe(false);
    expect(deleteVerdict("live").grave).toBe(true);
  });

  // The one refusal it does NOT escape. Deleting the edition the app is
  // currently showing is a different bug and the sandbox is not exempt.
  it("still refuses while it is the active edition", () => {
    const v = deleteVerdict("empty", { isSandbox: true, isActive: true });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("active");
  });
});

// ── What the picker draws ───────────────────────────────────────────
// Two helpers that decide whether something is RENDERED AT ALL. Both were
// ported from Bourbon Cup along with the row rework; the second is the one
// that matters, because it finally carries `deleteVerdict`'s refusal sentence
// somewhere a director can read it.
describe("editionDisplayName", () => {
  it("says nothing when the name is just WBC and the year", () => {
    // Sixteen rows all reading "WBC ####" beside a bold year is the same word
    // sixteen times.
    expect(editionDisplayName({ name: "WBC 2015", year: 2015 })).toBeNull();
    expect(editionDisplayName({ name: "WBC 2015", year: "2015" })).toBeNull();
    expect(editionDisplayName({ name: "2015", year: 2015 })).toBeNull();
  });

  it("forgives the casing and spacing of a name typed by hand", () => {
    expect(editionDisplayName({ name: "  wbc   2015 ", year: 2015 })).toBeNull();
  });

  it("shows a name somebody actually chose", () => {
    expect(editionDisplayName({ name: "The Redemption Year", year: 2019 })).toBe("The Redemption Year");
    // Merely ENDING in the year is not the same as being the default: the
    // looser rule reduces a round at Bandon to a bare numeral.
    expect(editionDisplayName({ name: "Bandon Dunes 2024", year: 2024 })).toBe("Bandon Dunes 2024");
  });

  it("shows whatever there is when there is no year — the sandbox", () => {
    // wbc_demo has `year: null` on purpose, so two rows can never both read
    // 2026. Its name is the only thing it has.
    expect(editionDisplayName({ name: "DEMO Sandbox", year: null })).toBe("DEMO Sandbox");
    expect(editionDisplayName({ name: "", year: 2015 })).toBeNull();
    expect(editionDisplayName(null)).toBeNull();
  });

  it("is not tied to one app's tournament title", () => {
    expect(editionDisplayName({ name: "The Bourbon Cup 2024", year: 2024 }, "The Bourbon Cup")).toBeNull();
    expect(editionDisplayName({ name: "The Bourbon Cup 2024", year: 2024 })).toBe("The Bourbon Cup 2024");
  });
});

describe("editionActions", () => {
  const live = { id: "wbc_2026", year: 2026 };
  const frozen = { id: "wbc_2015", year: 2015, locked: true };

  it("offers a player nothing but the door", () => {
    const a = editionActions({ edition: frozen, state: "complete" });
    expect(a).toMatchObject({ open: true, lock: false, delete: false, deleteWhy: null });
    expect(a.locked).toBe(true);
  });

  it("carries the refusal sentence the row could only express by drawing nothing", () => {
    // This is the whole reason the actions moved into a sheet. deleteVerdict
    // has always produced this string; until now the picker's only way to say
    // it was to omit the bin and hope the director inferred the rule.
    const a = editionActions({ edition: live, state: "complete", canManage: true });
    expect(a.delete).toBe(false);
    expect(a.deleteWhy).toMatch(/record of the event/);

    const unread = editionActions({ edition: live, state: "unknown", canManage: true });
    expect(unread.deleteWhy).toMatch(/Couldn't read/);
  });

  it("will not open or delete the year you are standing in, and says why", () => {
    const a = editionActions({ edition: live, state: "setup", isActive: true, canManage: true });
    expect(a.open).toBe(false);
    expect(a.delete).toBe(false);
    expect(a.deleteWhy).toMatch(/Open another year first/);
    // Locking the running year stays offered — freezing it the moment the cup
    // ends is a real thing a director wants.
    expect(a.lock).toBe(true);
  });

  it("marks the dangerous delete as grave", () => {
    // Scores made on the course this week. The confirm names the count.
    const a = editionActions({ edition: live, state: "live", canManage: true });
    expect(a.delete).toBe(true);
    expect(a.graveDelete).toBe(true);
    expect(editionActions({ edition: live, state: "setup", canManage: true }).graveDelete).toBe(false);
  });

  it("lets the sandbox go however full it is", () => {
    // A scratch copy that testers filled with four finished rounds is exactly
    // what a good beta test looks like, and it must not become permanent.
    const a = editionActions({ edition: { id: "wbc_demo" }, state: "complete", isSandbox: true, canManage: true });
    expect(a.delete).toBe(true);
    expect(a.deleteWhy).toBeNull();
  });

  it("tells a player nothing about deletion either way", () => {
    // deleteWhy explains a control they were never offered. Silence.
    expect(editionActions({ edition: live, state: "complete" }).deleteWhy).toBeNull();
  });
});
