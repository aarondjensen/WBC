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
import { isEditionLocked, lockVerdict, lockBadge, lockNotice } from "./editionLock";

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

  // Not symmetrical, on purpose. A dialog in front of the undo is what makes
  // people stop using the control at all.
  it("unlocks without a question", () => {
    const v = lockVerdict(locked);
    expect(v.next).toBe(false);
    expect(v.label).toBe("Unlock");
    expect(v.confirm).toBeNull();
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
