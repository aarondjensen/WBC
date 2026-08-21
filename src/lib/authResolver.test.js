/** @vitest-environment jsdom */
/**
 * A guard on ONE field inside Firebase Auth.
 *
 * firebase.js subclasses `browserPopupRedirectResolver` to move the redirect
 * round trip's state off sessionStorage and onto localStorage, because a
 * suspended iPhone home-screen app loses sessionStorage mid-sign-in and comes
 * home with no idea it ever left — no user, no error, straight back to the
 * sign-in screen. See the resolver note in src/firebase.js.
 *
 * The swap works by overriding `_redirectPersistence`, which is internal to
 * the SDK. If a Firebase upgrade renames or moves it, the override silently
 * stops applying and Sign in with Apple quietly breaks again inside the
 * installed app — the one place nothing else in this repo can exercise.
 *
 * So the field is asserted here. A version bump that moves it fails this test
 * instead of failing a player standing on the first tee.
 *
 * jsdom, and not for the DOM: `firebase/auth` ships a separate NODE build whose
 * browserPopupRedirectResolver is a stub that throws
 * auth/operation-not-supported-in-this-environment. Only the browser build —
 * the one the app actually bundles — has the class this is about.
 */
import { describe, it, expect } from "vitest";
import { browserPopupRedirectResolver, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";

describe("Firebase's redirect resolver still lets us pick the persistence", () => {
  it("is a class we can extend", () => {
    expect(typeof browserPopupRedirectResolver).toBe("function");
  });

  it("carries _redirectPersistence, and it is still the session tier", () => {
    const stock = new browserPopupRedirectResolver();
    expect("_redirectPersistence" in stock).toBe(true);
    expect(stock._redirectPersistence).toBe(browserSessionPersistence);
  });

  // The subclass firebase.js builds, reproduced here so the mechanism itself
  // is covered without importing firebase.js (which initializes a real app).
  it("keeps the override when subclassed", () => {
    class Durable extends browserPopupRedirectResolver {
      constructor() {
        super();
        this._redirectPersistence = browserLocalPersistence;
      }
    }
    const durable = new Durable();
    expect(durable._redirectPersistence).toBe(browserLocalPersistence);
    // Everything else is still the stock resolver's.
    expect(typeof durable._openRedirect).toBe("function");
    expect(typeof durable._openPopup).toBe("function");
    expect(typeof durable._initialize).toBe("function");
    expect(typeof durable._completeRedirectFn).toBe("function");
  });
});
