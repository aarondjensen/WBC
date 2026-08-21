/**
 * The web app manifest, and the member it must NOT declare.
 *
 * JSON cannot hold a comment, so the reasoning lives here.
 *
 * ── `scope` was added on a theory, and it broke a real screen ──────
 * It went in to make iOS treat /__/auth/handler as part of the installed app,
 * in the hope that the trip home from Apple would then land in the app rather
 * than in Safari. It did not fix that — the trip home from Apple is a
 * cross-site POST, which iOS hands to Safari whatever the scope says (see
 * src/lib/authPairing.js).
 *
 * What it DID do was break the way out. Pairing works by opening
 * wannabecup.com/?pair=<id> in Safari with a target="_blank" link. Declare
 * `scope: "/"` and that URL is inside the app, so iOS keeps the link in the
 * app instead of handing it to Safari: the app reloads onto its own pairing
 * URL, strips the parameter, and draws the same screen again. To the player
 * holding the phone, tapping "Open Safari" just refreshes the page. Forever.
 *
 * So there is no `scope` here, and no `start_url` either — a start_url of "/"
 * implies the same scope by spec, and this app has only ever launched at "/"
 * anyway. `id` stays: it is what keeps an install pointed at the same app
 * across changes to either, and it has no bearing on link routing.
 *
 * If a future change wants `scope` back, it has to answer this first: what
 * happens when the pairing link is tapped? There is a copy-the-link fallback
 * on that screen now precisely because this cannot be reasoned about from a
 * desk — but the fallback is the fallback, not the plan.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../../public/manifest.json", import.meta.url), "utf8"),
);

describe("the PWA manifest", () => {
  // The one this file exists for. See the header before changing it.
  it("declares no scope, so the pairing link can still reach Safari", () => {
    expect("scope" in manifest).toBe(false);
  });

  it("declares no start_url either, which would imply the same scope", () => {
    expect("start_url" in manifest).toBe(false);
  });

  it("keeps a stable identity", () => {
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
