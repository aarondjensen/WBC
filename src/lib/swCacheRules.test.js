// ══════════════════════════════════════════════════════════════════
//  What the service worker will and will not answer from disk.
// ══════════════════════════════════════════════════════════════════
//
// The rules live in public/sw-cache-rules.js, which a test cannot import: it
// is not bundled, it is not a module, and it runs in a scope that does not
// exist here. So it is LOADED — read off disk and evaluated against a fake
// worker global — rather than copied. A second copy of these rules in a test
// would be a second copy to get wrong, and getting them wrong is not a
// cosmetic failure: two of the cases below are how an installed app becomes
// permanently unupdatable.
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

let routeFor, entriesToEvict, MAX_ASSETS;

beforeAll(() => {
  const src = readFileSync(new URL("../../public/sw-cache-rules.js", import.meta.url), "utf8");
  // No addEventListener and no caches on this fake scope, which is the guard
  // the file checks before wiring itself up — so this evaluates the rules and
  // stops short of registering handlers.
  const scope = { location: { origin: "https://wannabecup.com" } };
  new Function("self", src)(scope);
  ({ routeFor, entriesToEvict, MAX_ASSETS } = scope.WBC_CACHE_RULES);
});

const route = (over = {}) => routeFor({
  method: "GET", sameOrigin: true, mode: "no-cors", pathname: "/x", cacheMode: "default", ...over,
});

describe("routeFor", () => {
  it("holds the hashed chunks on disk", () => {
    expect(route({ pathname: "/assets/index-8jM5_OtK.js" })).toBe("cache-first");
    expect(route({ pathname: "/assets/react-BnGpVFCy.js" })).toBe("cache-first");
    expect(route({ pathname: "/assets/index-DsXp83XW.css" })).toBe("cache-first");
  });

  it("holds the font and the icons", () => {
    expect(route({ pathname: "/fonts/montserrat-latin.woff2" })).toBe("cache-first");
    expect(route({ pathname: "/icons/icon-192.webp" })).toBe("cache-first");
    expect(route({ pathname: "/wbc-logo.webp" })).toBe("cache-first");
    expect(route({ pathname: "/wbc-icon-192.png" })).toBe("cache-first");
  });

  it("asks the network for the document first, so a deploy lands", () => {
    expect(route({ mode: "navigate", pathname: "/" })).toBe("network-first");
    expect(route({ pathname: "/index.html" })).toBe("network-first");
  });

  // ── The two that must never regress ──

  // hasNewBundle() asks for index.html with cache:"no-store" and diffs the
  // hashed script names to decide whether a new build has shipped. It is the
  // ONLY way an installed PWA — which has no address bar — ever picks up a
  // deploy. Answered from a cache, it compares a build against itself, always
  // says no, and the phone is stuck on that build for good.
  it("never answers a no-store request, whatever it is for", () => {
    expect(route({ pathname: "/index.html", cacheMode: "no-store" })).toBe("bypass");
    expect(route({ mode: "navigate", pathname: "/", cacheMode: "no-store" })).toBe("bypass");
    expect(route({ pathname: "/assets/index-abc.js", cacheMode: "no-store" })).toBe("bypass");
    expect(route({ pathname: "/index.html", cacheMode: "reload" })).toBe("bypass");
  });

  // A cached service worker keeps serving the version it was, and there is no
  // way to reach past it on a phone with no address bar.
  it("never holds a service worker or the manifest", () => {
    expect(route({ pathname: "/firebase-messaging-sw.js" })).toBe("bypass");
    expect(route({ pathname: "/sw-cache-rules.js" })).toBe("bypass");
    expect(route({ pathname: "/manifest.json" })).toBe("bypass");
  });

  it("leaves everything on another origin alone", () => {
    expect(route({ sameOrigin: false, pathname: "/google.firestore.v1.Firestore/Listen" })).toBe("bypass");
    expect(route({ sameOrigin: false, pathname: "/assets/index-abc.js" })).toBe("bypass");
  });

  it("leaves writes alone", () => {
    expect(route({ method: "POST", pathname: "/assets/index-abc.js" })).toBe("bypass");
    expect(route({ method: "HEAD", pathname: "/" })).toBe("bypass");
  });

  // Conservative by default: a rule that guesses is how a cache ends up
  // serving something nobody meant it to.
  it("leaves anything it has no rule for alone", () => {
    expect(route({ pathname: "/privacy/" })).toBe("bypass");
    expect(route({ pathname: "/account-deletion/" })).toBe("bypass");
    expect(route({ pathname: "/__/auth/handler" })).toBe("bypass");
  });

  it("survives being called with nothing", () => {
    expect(() => routeFor()).not.toThrow();
    expect(routeFor()).toBe("bypass");
  });
});

describe("entriesToEvict", () => {
  const keys = (n) => Array.from({ length: n }, (_, i) => `req${i}`);

  it("keeps everything while under the cap", () => {
    expect(entriesToEvict(keys(MAX_ASSETS))).toEqual([]);
    expect(entriesToEvict(keys(3))).toEqual([]);
  });

  // Cache.keys() is insertion-ordered, so the front of the list is the oldest
  // thing held — which after a deploy is the previous build's chunks.
  it("drops the oldest entries first, and only the overflow", () => {
    const over = entriesToEvict(keys(MAX_ASSETS + 3));
    expect(over).toEqual(["req0", "req1", "req2"]);
  });

  it("takes an explicit cap", () => {
    expect(entriesToEvict(keys(5), 2)).toEqual(["req0", "req1", "req2"]);
  });

  it("survives an empty or missing list", () => {
    expect(entriesToEvict([])).toEqual([]);
    expect(entriesToEvict(undefined)).toEqual([]);
  });
});
