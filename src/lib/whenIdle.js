// ══════════════════════════════════════════════════════════════════
//  whenIdle — run something once the browser has a moment spare.
// ══════════════════════════════════════════════════════════════════
//
// This exists for chunk WARMING, and the two halves of that word are the
// whole design. A screen that is `lazy` is off the critical path, which is
// what a phone opening a leaderboard on one bar needs. But it is also not on
// the phone yet — and the Scoring tab gets tapped on a tee box, which is
// exactly where the signal to fetch it may have gone. Warming closes that
// gap: the chunk is fetched during the idle stretch after first paint, when
// the app is doing nothing anyway, and the tap finds it already there.
//
// So the fallback matters more than the fast path. requestIdleCallback is
// missing on Safari before 16.4 — which includes iPhones still in this
// tournament's field — and "no idle callback" must never mean "never warmed",
// because that is the phone that would then discover it needs a network on
// the 4th tee. A timer is a worse guess at when the browser is free, and a
// far better answer than nothing.
//
// The `timeout` is the same argument in both directions: the longest the warm
// may be deferred. requestIdleCallback takes it as a deadline after which it
// fires regardless of how busy things are; the fallback simply waits it out.

// How long a warm may be put off. Long enough that first paint, the auth
// restore and the opening Firestore snapshots are all comfortably done —
// warming into the middle of those is the one thing this must not do, since
// it would be competing with the very screens it is trying to stay out of the
// way of.
export const WARM_DELAY_MS = 2000;

// Returns a cancel function. Calling it after the callback has already run is
// harmless — cancelIdleCallback and clearTimeout are both no-ops on a spent
// handle — which is what lets a caller wire this straight into an effect's
// cleanup without tracking whether it fired.
export function whenIdle(fn, { timeout = WARM_DELAY_MS } = {}) {
  if (typeof fn !== "function") return () => {};

  const ric = typeof globalThis !== "undefined" ? globalThis.requestIdleCallback : undefined;
  if (typeof ric === "function") {
    const handle = ric(() => fn(), { timeout });
    return () => {
      const cancel = globalThis.cancelIdleCallback;
      if (typeof cancel === "function") cancel(handle);
    };
  }

  const handle = setTimeout(() => fn(), timeout);
  return () => clearTimeout(handle);
}

// ── Warming a set of chunks ────────────────────────────────────────
// Every loader is fired on the same idle tick, and a failure in one is
// swallowed: a warm that does not land costs nothing but the fetch it would
// have saved, and the screen still loads normally when it is tapped. Throwing
// here would take down whatever effect scheduled it, which is a real bug
// traded for a speculative fetch.
export function warmChunks(loaders, opts) {
  return whenIdle(() => {
    (loaders || []).forEach(load => {
      try {
        const p = load();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch { /* a warm is never worth an exception */ }
    });
  }, opts);
}
