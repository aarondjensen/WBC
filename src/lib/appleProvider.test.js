/**
 * A guard on the Sign in with Apple provider, read as SOURCE.
 *
 * src/firebase.js cannot be imported by a unit test — it initializes a real
 * Firebase app and a Firestore instance at module scope — so this reads the
 * file and asserts the one line in it that an outage turned off.
 *
 * ── The line, and why it stays this way ───────────────────────────
 * Asking Apple for ANY scope (`email`, `name`) forces
 * `response_mode=form_post`: the trip home from Apple becomes a cross-site
 * form POST instead of a GET. A POST landing back inside an iPhone
 * home-screen app is routinely handed to Safari rather than to the app, and
 * the installed app is left where it started with no user and no error. That
 * is a player standing on a tee box unable to sign in, and it is invisible
 * from every machine anybody develops on.
 *
 * Adding a scope is a one-word change that looks harmless (it populates
 * displayName) and re-breaks exactly that. It costs nothing to leave off:
 * this app never matches a player by email — a player picks his own name off
 * the roster — and a missing displayName falls back to the claimed player's
 * name. See the note above `_appleProvider` in src/firebase.js.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../firebase.js", import.meta.url), "utf8");

describe("the Apple provider", () => {
  it("is still built with no scopes at all", () => {
    expect(source).toContain('export const _appleProvider = new OAuthProvider("apple.com");');
  });

  it("never has a scope added to it anywhere in the file", () => {
    expect(source).not.toMatch(/_appleProvider\s*\.\s*addScope/);
    // The per-call providers built for the native and link paths too — those
    // exchange an ID token the Apple sheet already minted, so a scope there is
    // equally pointless and equally easy to add by habit.
    expect(source).not.toMatch(/addScope\(\s*["'](email|name)["']\s*\)/);
  });
});
