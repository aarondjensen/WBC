import { describe, it, expect } from "vitest";
import {
  encodeRedirectMark, decodeRedirectMark, emptyRedirectMessage,
  decodeRedirectFailures, withRedirectFailure, hasRedirectFailed,
  REDIRECT_MARK_TTL_MS,
} from "./authRedirect";

const NOW = 1_700_000_000_000;

describe("the redirect mark", () => {
  it("round-trips the provider that was tried", () => {
    expect(decodeRedirectMark(encodeRedirectMark("apple", NOW), NOW)).toBe("apple");
  });

  // The whole reason this moved out of sessionStorage: the mark has to still
  // be there after iOS has evicted and relaunched the home-screen app.
  it("is still readable a couple of minutes later", () => {
    const mark = encodeRedirectMark("apple", NOW);
    expect(decodeRedirectMark(mark, NOW + 2 * 60 * 1000)).toBe("apple");
  });

  it("is ignored once it is older than the trip it describes", () => {
    const mark = encodeRedirectMark("apple", NOW);
    expect(decodeRedirectMark(mark, NOW + REDIRECT_MARK_TTL_MS + 1)).toBe(null);
  });

  it("reads nothing as nothing", () => {
    expect(decodeRedirectMark(null, NOW)).toBe(null);
    expect(decodeRedirectMark("", NOW)).toBe(null);
  });

  it("survives a value that is not ours at all", () => {
    expect(decodeRedirectMark("{not json", NOW)).toBe("{not json");
    expect(decodeRedirectMark("[]", NOW)).toBe(null);
  });

  // A phone that left on the old build and came back on the new one.
  it("honours the bare provider string the old build wrote", () => {
    expect(decodeRedirectMark("apple", NOW)).toBe("apple");
  });

  it("refuses a mark with no time on it", () => {
    expect(decodeRedirectMark(JSON.stringify({ p: "apple" }), NOW)).toBe(null);
  });
});

// ══════════════════════════════════════════════════════════════════
//  The ledger of providers that do not come home on this device
// ══════════════════════════════════════════════════════════════════
//
// What decides whether the Google button attempts a redirect at all. Getting
// it wrong in the "yes it failed" direction sends somebody through Safari who
// did not need to; getting it wrong the other way puts the player in the
// screenshot back where he was, tapping a button that cannot finish.
describe("the redirect-failure ledger", () => {
  it("remembers the provider that came home empty", () => {
    const raw = withRedirectFailure(null, "google");
    expect(hasRedirectFailed(raw, "google")).toBe(true);
  });

  // The whole point of it being per-provider: Apple failing says nothing about
  // Google, and the Google button should still take the fast route.
  it("says nothing about the other provider", () => {
    const raw = withRedirectFailure(null, "apple");
    expect(hasRedirectFailed(raw, "google")).toBe(false);
  });

  it("holds both once both have failed", () => {
    const raw = withRedirectFailure(withRedirectFailure(null, "apple"), "google");
    expect(hasRedirectFailed(raw, "apple")).toBe(true);
    expect(hasRedirectFailed(raw, "google")).toBe(true);
  });

  it("does not grow every time the same provider fails again", () => {
    let raw = null;
    for (let i = 0; i < 5; i++) raw = withRedirectFailure(raw, "google");
    expect(decodeRedirectFailures(raw)).toEqual(["google"]);
  });

  // An empty ledger is the answer that tries the direct route, so every
  // unreadable value has to land there rather than stranding a whole device on
  // the Safari path forever.
  it("reads anything that is not ours as an empty ledger", () => {
    for (const raw of [null, "", "{not json", "{}", '"google"', "7"]) {
      expect(decodeRedirectFailures(raw)).toEqual([]);
      expect(hasRedirectFailed(raw, "google")).toBe(false);
    }
  });

  it("is never true for a provider nobody named", () => {
    const raw = withRedirectFailure(null, "google");
    expect(hasRedirectFailed(raw, "")).toBe(false);
    expect(hasRedirectFailed(raw, null)).toBe(false);
  });

  it("survives a write with no provider in it", () => {
    const raw = withRedirectFailure(withRedirectFailure(null, "google"), "");
    expect(hasRedirectFailed(raw, "google")).toBe(true);
  });
});

describe("what an empty return says", () => {
  it("names the button that was pressed", () => {
    expect(emptyRedirectMessage("apple", true)).toContain("Sign in with Apple");
    expect(emptyRedirectMessage("google", true)).toContain("Sign in with Google");
  });

  // The bug this message used to BE: it sent an Apple player to the Google
  // button, which is a second Firebase account and a roster with his own name
  // missing from it.
  it("never sends somebody to the other provider", () => {
    for (const provider of ["apple", "google", null]) {
      for (const standalone of [true, false]) {
        const msg = emptyRedirectMessage(provider, standalone);
        const other = provider === "apple" ? "Google" : "Apple";
        if (provider) expect(msg).not.toContain(`with ${other}`);
      }
    }
  });

  it("asks for the same button again", () => {
    expect(emptyRedirectMessage("apple", true).toLowerCase()).toContain("again");
    expect(emptyRedirectMessage("apple", false).toLowerCase()).toContain("again");
  });

  it("warns a home-screen app about ending up with two accounts", () => {
    expect(emptyRedirectMessage("apple", true)).toContain("second account");
  });

  // The message is a promise about what the next tap does, and the app keeps
  // it: the empty return goes in the ledger above, so in an installed app that
  // button takes the Safari route from then on. If one of the two ever changes
  // without the other, this is what says so.
  it("tells a home-screen app the next tap finishes in Safari", () => {
    for (const provider of ["apple", "google"]) {
      expect(emptyRedirectMessage(provider, true)).toContain("Safari");
    }
  });

  // In a browser tab nothing reroutes, so it must not promise a detour that
  // is not coming.
  it("promises no such thing in an ordinary browser tab", () => {
    expect(emptyRedirectMessage("google", false)).not.toContain("Safari");
  });
});
