/**
 * The web app manifest, and the one thing in it that is about SIGNING IN.
 *
 * JSON cannot hold a comment, so the reasoning lives here.
 *
 * ── Why `scope` earns its place ───────────────────────────────────
 * Signing in from an iPhone home-screen app is three top-level navigations:
 * the app leaves for Firebase's handler on wannabecup.com, the handler sends
 * the phone to appleid.apple.com, and Apple sends it back to the handler.
 * Only the middle one is off our domain.
 *
 * iOS decides what to do with each of those by asking whether the URL is
 * inside the installed app's SCOPE. In scope, the app navigates itself. Out of
 * scope, iOS opens a browser over the top — and whether the return leg comes
 * back to the app or is simply left in Safari depends on iOS agreeing that the
 * URL it lands on belongs to the app. This manifest declared no scope at all,
 * so that judgement was left to a default, on the one step of the one flow
 * where getting it wrong means the player is looking at wannabecup.com in
 * Safari while his home-screen app sits on the sign-in screen, still signed
 * out. That is the bug this file is a test for.
 *
 * `"/"` is the whole origin, which is what we want: /__/auth/handler is the
 * app's own sign-in handler (proxied by vercel.json) and has to be treated as
 * part of the app.
 *
 * `start_url` and `id` go with it — a manifest with no start_url takes
 * whatever page happened to be open when somebody tapped Add to Home Screen,
 * and `id` is what keeps an install pointing at the same app across changes to
 * either.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8"),
);

describe("the PWA manifest", () => {
  // The sign-in one. See the header.
  it("puts the whole origin in scope, so the auth handler is inside the app", () => {
    expect(manifest.scope).toBe("/");
  });

  it("always launches at the top of the app", () => {
    expect(manifest.start_url).toBe("/");
  });

  it("has a stable identity", () => {
    expect(manifest.id).toBe("/");
  });

  it("still installs as an app rather than a browser tab", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("names every icon under /icons, which is what the build emits", () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) expect(icon.src.startsWith("/icons/")).toBe(true);
  });
});
