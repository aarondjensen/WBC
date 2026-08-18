import { describe, it, expect } from "vitest";
import { holdForAuth } from "./authHold";

describe("holdForAuth", () => {
  // The bug: switching editions clears the stored session and reloads, so
  // for a few hundred milliseconds there is no player and no answer from
  // Firebase — and the sign-in screen was what filled the gap.
  it("waits on a device that has signed in before", () => {
    expect(holdForAuth({ user: null, authKnown: false, hadSession: true })).toBe(true);
  });

  // A stranger's first launch. The sign-in screen is what they are here for,
  // and a pulsing logo in front of it every time is the cost of fixing
  // somebody else's problem.
  it("does not wait on a device that never has", () => {
    expect(holdForAuth({ user: null, authKnown: false, hadSession: false })).toBe(false);
  });

  // "Nobody is signed in" is an ANSWER. Once it has arrived the screen belongs
  // to whoever is holding the phone, and holding any longer would be a splash
  // with nothing behind it.
  it("stops waiting the moment Firebase says nobody is signed in", () => {
    expect(holdForAuth({ user: null, authKnown: true, hadSession: true })).toBe(false);
  });

  // Somebody is already on screen — a restored session, or a guest. There is
  // nothing to wait for and nothing to replace.
  it("never waits when there is already a player on screen", () => {
    expect(holdForAuth({ user: { id: "aaron_j" }, authKnown: false, hadSession: true })).toBe(false);
    expect(holdForAuth({ user: { id: "guest", isGuest: true }, authKnown: false, hadSession: true })).toBe(false);
  });

  it("defaults to not waiting when it is told nothing", () => {
    expect(holdForAuth()).toBe(false);
  });
});
