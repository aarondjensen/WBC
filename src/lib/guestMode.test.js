import { describe, it, expect, afterEach } from "vitest";
import {
  GUEST_ID, guestUser, isGuest, setGuestWrites, guestWritesLatched, writesBlocked,
} from "./guestMode";

// The latch is module state, so every test that touches it puts it back.
afterEach(() => setGuestWrites(false));

describe("guestUser", () => {
  it("is a guest, and never a director", () => {
    const u = guestUser();
    expect(u.isGuest).toBe(true);
    expect(u.isDirector).toBe(false);
    expect(isGuest(u)).toBe(true);
  });

  it("carries an id no player can have", () => {
    // Player ids are name-derived slugs (aaron_j, …). If a guest's id ever
    // collided with one, every "is this me" test in the app would answer yes
    // for a stranger — the market nudge, the record book's own-row highlight,
    // the scoring screen's group.
    expect(guestUser().id).toBe(GUEST_ID);
    expect(GUEST_ID).not.toMatch(/_/);
  });

  it("is a fresh object each time, so one guest's state cannot leak into the next", () => {
    expect(guestUser()).not.toBe(guestUser());
    expect(guestUser()).toEqual(guestUser());
  });
});

describe("isGuest", () => {
  it("is false for a player, a director, and nobody at all", () => {
    expect(isGuest({ id: "aaron_j", name: "Aaron", isDirector: true })).toBe(false);
    expect(isGuest({ id: "aaron_j", name: "Aaron" })).toBe(false);
    expect(isGuest(null)).toBe(false);
    expect(isGuest(undefined)).toBe(false);
  });
});

describe("writesBlocked", () => {
  it("blocks a guest — latched, and nobody signed in", () => {
    setGuestWrites(true);
    expect(writesBlocked(false)).toBe(true);
  });

  it("lets a signed-in account write even if the latch is stuck on", () => {
    // The failure this AND exists for. A latch that swallowed a player's
    // scores would do it silently, on a tee box, with nothing to catch — so
    // being signed in overrules it, and a player always is.
    setGuestWrites(true);
    expect(writesBlocked(true)).toBe(false);
  });

  it("blocks nothing when no guest is looking around", () => {
    expect(writesBlocked(false)).toBe(false);
    expect(writesBlocked(true)).toBe(false);
  });

  it("clears when the guest leaves", () => {
    setGuestWrites(true);
    expect(guestWritesLatched()).toBe(true);
    setGuestWrites(false);
    expect(guestWritesLatched()).toBe(false);
    expect(writesBlocked(false)).toBe(false);
  });
});
