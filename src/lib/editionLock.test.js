// ══════════════════════════════════════════════════════════════════
//  Does a lock default the safe way, and does it warn about the one
//  year that matters?
// ══════════════════════════════════════════════════════════════════
//
// Two things in editionLock are worth a test and the rest is a string.
//
// THE DEFAULT. Seventeen years of edition documents were written before
// `locked` existed and none of them carry it. If a missing field read as
// LOCKED, deploying this would freeze every tournament in the app at once,
// and the only way back would be a director tapping seventeen padlocks. Every
// shape that is not literally `true` has to come out unlocked — including the
// shapes that are not editions at all, because `cachedEditions()` can hand
// this undefined on a cold open.
//
// THE ACTIVE-YEAR WARNING. Locking the edition the app is currently showing
// stops scoring for everybody on it, and the person who did it is the one
// member who cannot tell: a director is exempt from the lock they just set, so
// their own writes keep working and the screen looks normal. That sentence has
// to be in front of them before they tap, and it is the assertion most likely
// to be lost in a refactor of the copy.
import { describe, it, expect } from "vitest";
import { isEditionLocked, lockVerdict, bulkLockVerdict, lockBadge, lockNotice, canAdminEdition, demoOnlyAdmin,
} from "./editionLock";

describe("isEditionLocked", () => {
  it("is true only for an explicit true", () => {
    expect(isEditionLocked({ locked: true })).toBe(true);
  });

  // Each of these is a real shape this gets called with: a pre-lock edition
  // row out of Firestore, a slimmed row out of the list cache, and the
  // undefined a `.find()` returns on a cold open.
  it.each([
    ["a row written before the field existed", { id: "wbc_2019", year: 2019 }],
    ["an explicit false", { locked: false }],
    ["a null", { locked: null }],
    ["a truthy non-boolean", { locked: "yes" }],
    ["undefined", undefined],
    ["null", null],
  ])("is false for %s", (_label, edition) => {
    expect(isEditionLocked(edition)).toBe(false);
  });
});

describe("lockVerdict", () => {
  const unlocked = { id: "wbc_2026", year: 2026 };
  const locked = { id: "wbc_2026", year: 2026, locked: true };

  it("offers to lock a year that is open, and asks first", () => {
    const v = lockVerdict(unlocked);
    expect(v.next).toBe(true);
    expect(v.label).toBe("Lock");
    expect(v.confirm).toBeTruthy();
  });

  // Symmetrical now. What unlocking widens is a FINISHED tournament — the
  // record of an event that is over — so thawing one is as deliberate an act
  // as freezing it, and takes the same two taps.
  // Unlocking a finished tournament gives the field nothing back — the rules
  // refuse a member's write into a year that is over whether or not it carries
  // a padlock — and a dialog promising otherwise would be false about fifteen
  // of the sixteen years in the picker.
  it("does not promise a finished year back to the field", () => {
    const v = lockVerdict(locked, { finished: true });
    expect(v.confirm.body).toMatch(/stays? closed to members/i);
    expect(v.confirm.body).toMatch(/padlock/);
  });

  it("does promise a part-played year back", () => {
    const v = lockVerdict(locked, { finished: false });
    expect(v.confirm.body).toMatch(/Every member gets to post scores/);
  });

  it("asks before unlocking as well", () => {
    const v = lockVerdict(locked);
    expect(v.next).toBe(false);
    expect(v.label).toBe("Unlock");
    expect(v.confirm.confirmLabel).toBe("Unlock it");
    expect(v.confirm.title).toMatch(/^Unlock/);
  });

  // ── The one this file exists for ──
  it("warns that locking the ACTIVE year stops scoring for the field", () => {
    const v = lockVerdict(unlocked, { isActive: true });
    expect(v.confirm.body).toMatch(/right now/i);
    expect(v.confirm.body).toMatch(/scoring/i);
    // And that the director will not witness what they just did.
    expect(v.confirm.body).toMatch(/directors are exempt/i);
  });

  it("does not cry wolf about a year nobody is looking at", () => {
    const v = lockVerdict(unlocked, { isActive: false });
    expect(v.confirm.body).not.toMatch(/right now/i);
    // It still has to say reading is unaffected — the fear this control
    // provokes is "have I just hidden 2019 from everybody".
    expect(v.confirm.body).toMatch(/reading is unaffected/i);
  });

  it("names the year in what it says, not 'this edition'", () => {
    expect(lockVerdict(unlocked).confirm.title).toContain("2026");
  });

  it("survives an edition with no year at all", () => {
    expect(() => lockVerdict({ id: "wbc_masters" })).not.toThrow();
    expect(lockVerdict({}).confirm.title).toContain("this year");
  });
});

describe("bulkLockVerdict", () => {
  const YEARS = [
    { id: "wbc_2027", year: 2027 },
    { id: "wbc_2026", year: 2026 },
    { id: "wbc_2025", year: 2025 },
  ];

  it("offers to lock every year but the active one", () => {
    const v = bulkLockVerdict(YEARS, "wbc_2027");
    expect(v.next).toBe(true);
    expect(v.ids.sort()).toEqual(["wbc_2025", "wbc_2026"]);
    expect(v.label).toBe("Lock all but 2027");
  });

  // The one guarantee this control makes. The active year is the tournament
  // being played, and freezing it is a decision with its own warning on its
  // own row — never a side effect of tidying the other sixteen.
  it("never touches the active year", () => {
    expect(bulkLockVerdict(YEARS, "wbc_2027").ids).not.toContain("wbc_2027");
  });

  it("only names the years that are actually open", () => {
    const half = [
      { id: "wbc_2027", year: 2027 },
      { id: "wbc_2026", year: 2026, locked: true },
      { id: "wbc_2025", year: 2025 },
    ];
    const v = bulkLockVerdict(half, "wbc_2027");
    expect(v.ids).toEqual(["wbc_2025"]);
    expect(v.confirm.title).toBe("Lock 1 year?");
  });

  // ── And it goes away rather than reversing ──
  // The slot used to turn into "Unlock all" once everything was frozen, which
  // is not an undo (nothing remembers which years were locked) and thaws the
  // record of sixteen tournaments in one tap. Unlocking is a year at a time,
  // on its own row, with its own confirm.
  it("offers nothing once every other year is already locked", () => {
    const allShut = YEARS.map(e => (e.id === "wbc_2027" ? e : { ...e, locked: true }));
    expect(bulkLockVerdict(allShut, "wbc_2027")).toBeNull();
  });

  it("still asks before locking sixteen tournaments", () => {
    expect(bulkLockVerdict(YEARS, "wbc_2027").confirm).toBeTruthy();
  });

  it("says nothing when there is no other year to act on", () => {
    expect(bulkLockVerdict([{ id: "wbc_2027", year: 2027 }], "wbc_2027")).toBeNull();
    expect(bulkLockVerdict([], "wbc_2027")).toBeNull();
    expect(bulkLockVerdict()).toBeNull();
  });

  // No active edition resolved yet — the picker can render before
  // getActiveTournamentId has anything to say. Every year is fair game then,
  // and the label cannot promise to spare one.
  // Also the label the SANDBOX gets whenever it is the active edition, since
  // it has no year to name — so this is the common case, not an edge one.
  // "Lock every other year" read as alternating years on a phone.
  it("copes with no active year at all", () => {
    const v = bulkLockVerdict(YEARS, null);
    expect(v.ids.length).toBe(3);
    expect(v.label).toBe("Lock every tournament year");
  });

  // ── The sandbox is never swept up ──
  // This is the exclusion the whole workflow turns on. The sequence a director
  // runs is "cut a sandbox, lock the history, hand out the link" — and they
  // will usually still be standing on the real tournament when they tap it.
  // A sandbox caught by "lock all but 2026" hands twelve testers an app that
  // refuses every tap, which is the exact failure the lock was built to
  // prevent, pointed at the wrong people.
  it("never locks the sandbox, even when it is not the active edition", () => {
    const withSandbox = [...YEARS, { id: "wbc_demo", year: null, name: "Demo Sandbox" }];
    const v = bulkLockVerdict(withSandbox, "wbc_2026");
    expect(v.ids).not.toContain("wbc_demo");
    expect(v.ids.sort()).toEqual(["wbc_2025", "wbc_2027"]);
  });

  // And it does not reappear as an unlock once the history is frozen, which
  // is the state a director leaves this screen in.
  it("offers nothing when the only unfrozen thing left is the sandbox", () => {
    const allShut = [
      { id: "wbc_2027", year: 2027, locked: true },
      { id: "wbc_2026", year: 2026 },
      { id: "wbc_demo", year: null },
    ];
    expect(bulkLockVerdict(allShut, "wbc_2026")).toBeNull();
  });

  // Nothing to offer when the sandbox is the only other edition — the button
  // should not appear at all rather than appear and do nothing.
  it("says nothing when the sandbox is the only other edition", () => {
    expect(bulkLockVerdict(
      [{ id: "wbc_2026", year: 2026 }, { id: "wbc_demo", year: null }],
      "wbc_2026",
    )).toBeNull();
  });

  it("counts in plain language", () => {
    expect(bulkLockVerdict(YEARS, "wbc_2027").confirm.confirmLabel).toBe("Lock 2 years");
    expect(bulkLockVerdict(YEARS.slice(0, 2), "wbc_2027").confirm.confirmLabel).toBe("Lock 1 year");
  });
});

describe("lockBadge", () => {
  it("says nothing about an open year", () => {
    expect(lockBadge({ year: 2026 })).toBeNull();
  });
  it("labels a frozen one", () => {
    expect(lockBadge({ year: 2026, locked: true })).toBe("LOCKED");
  });
});

describe("lockNotice", () => {
  it("tells a member why their writes will not land", () => {
    const n = lockNotice({ year: 2019, locked: true });
    expect(n).toMatch(/2019 is locked/);
    expect(n).toMatch(/director/i);
  });

  // A director is exempt in firestore.rules, so warning them about a wall
  // that is not there for them would be a lie the app tells itself.
  it("says nothing to a director", () => {
    expect(lockNotice({ year: 2019, locked: true }, { isDirector: true })).toBeNull();
  });

  it("says nothing about an open year", () => {
    expect(lockNotice({ year: 2026 })).toBeNull();
  });
});

// ── The sandbox administrator ──────────────────────────────────────
// A mirror of canAdminEdition() in firestore.rules — the rules decide, this
// only decides what somebody is offered. What matters is the LIMIT: a grant
// that leaked into a real year would put a beta tester on the tee sheet of a
// live tournament.
describe("canAdminEdition", () => {
  it("lets a director administer any year", () => {
    expect(canAdminEdition({ isDirector: true, tid: "wbc_2026" })).toBe(true);
    expect(canAdminEdition({ isDirector: true, tid: "wbc_demo" })).toBe(true);
  });

  it("lets a member administer the sandbox", () => {
    expect(canAdminEdition({ isMember: true, tid: "wbc_demo" })).toBe(true);
  });

  it("does not let a member administer the tournament being played", () => {
    expect(canAdminEdition({ isMember: true, tid: "wbc_2026" })).toBe(false);
    expect(canAdminEdition({ isMember: true, tid: "wbc_2014" })).toBe(false);
  });

  // A guest is not a member: no account, no membership document, and every
  // write refused in the rules whatever this said.
  it("gives a guest nothing, sandbox or not", () => {
    expect(canAdminEdition({ tid: "wbc_demo" })).toBe(false);
    expect(canAdminEdition()).toBe(false);
  });
});

describe("demoOnlyAdmin", () => {
  // The screens hide their non-edition-scoped halves on this, so a director
  // reading TRUE here would lose the registry and the courses.
  it("is the member in the sandbox, and nobody else", () => {
    expect(demoOnlyAdmin({ isMember: true, tid: "wbc_demo" })).toBe(true);
    expect(demoOnlyAdmin({ isDirector: true, isMember: true, tid: "wbc_demo" })).toBe(false);
    expect(demoOnlyAdmin({ isMember: true, tid: "wbc_2026" })).toBe(false);
  });
});

// A finished year refuses member writes in firestore.rules whether or not
// anybody locked it, and a refused write is otherwise silent.
describe("lockNotice on a finished year", () => {
  it("says a year that is over is over", () => {
    const n = lockNotice({ year: 2019 }, { finished: true });
    expect(n).toMatch(/2019 is finished/);
    expect(n).toMatch(/director/i);
  });

  it("still says nothing to a director", () => {
    expect(lockNotice({ year: 2019 }, { finished: true, isDirector: true })).toBeNull();
  });

  // The padlock is the deliberate one, so it keeps its own words.
  it("prefers the padlock's words when a year is both", () => {
    expect(lockNotice({ year: 2019, locked: true }, { finished: true })).toMatch(/is locked/);
  });

  it("says nothing about a year still being played", () => {
    expect(lockNotice({ year: 2026 }, { finished: false })).toBeNull();
  });
});
