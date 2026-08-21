/**
 * A guard on the Sign in with Apple provider, read as SOURCE.
 *
 * src/firebase.js cannot be imported by a unit test — it initializes a real
 * Firebase app and a Firestore instance at module scope — so this reads the
 * file and asserts the one line in it that an outage turned off.
 *
 * ── The line, and why it stays this way ───────────────────────────
 * Asking Apple for a scope forces `response_mode=form_post`, and a cross-site
 * form POST landing back on wannabecup.com is what iOS hands to Safari instead
 * of to an installed home-screen app.
 *
 * Read that and the obvious conclusion is that removing the scopes here fixes
 * Sign in with Apple in the home-screen app. It does not, and a previous
 * change shipped believing it did. Firebase's backend adds `scope=email name`
 * itself — confirmed by asking its createAuthUri endpoint what URL it builds
 * for this project with a scope-free provider — so the POST happens either
 * way. src/lib/authPairing.js is the actual way round it.
 *
 * What this guard is really protecting is smaller and still worth having:
 * scopes this app does not use. It never matches a player by email (a player
 * picks his own name off the roster, which is why Apple's Hide My Email relay
 * was always irrelevant) and a missing displayName falls back to the claimed
 * player's name. Adding one back would put a consent screen in front of every
 * player in exchange for a field nothing reads.
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
