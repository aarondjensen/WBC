import { describe, it, expect } from "vitest";
import {
  encodeRedirectMark, decodeRedirectMark, emptyRedirectMessage,
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
});
