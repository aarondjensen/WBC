import { describe, it, expect, vi, afterEach } from "vitest";
import { whenIdle, warmChunks, WARM_DELAY_MS } from "./whenIdle";

// requestIdleCallback does not exist in this environment, which is the point:
// the fallback is the path that actually runs on the Safari versions still in
// the field, so it is the one tested without any stubbing.
const withIdleCallback = (impl) => {
  globalThis.requestIdleCallback = impl;
  globalThis.cancelIdleCallback = vi.fn();
};

afterEach(() => {
  delete globalThis.requestIdleCallback;
  delete globalThis.cancelIdleCallback;
  vi.useRealTimers();
});

describe("whenIdle", () => {
  it("runs the callback on the idle callback when the browser has one", () => {
    const calls = [];
    withIdleCallback((fn, opts) => { calls.push(opts); fn(); return 7; });
    const ran = vi.fn();
    whenIdle(ran);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(calls[0]).toEqual({ timeout: WARM_DELAY_MS });
  });

  // The case this module exists for. No requestIdleCallback must still mean
  // warmed — a phone that never warms is the one that finds it needs a network
  // on the 4th tee.
  it("falls back to a timer where requestIdleCallback is missing", () => {
    vi.useFakeTimers();
    const ran = vi.fn();
    whenIdle(ran);
    expect(ran).not.toHaveBeenCalled();
    vi.advanceTimersByTime(WARM_DELAY_MS);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("honours an explicit timeout on the fallback path", () => {
    vi.useFakeTimers();
    const ran = vi.fn();
    whenIdle(ran, { timeout: 50 });
    vi.advanceTimersByTime(49);
    expect(ran).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending fallback", () => {
    vi.useFakeTimers();
    const ran = vi.fn();
    whenIdle(ran)();
    vi.advanceTimersByTime(WARM_DELAY_MS * 2);
    expect(ran).not.toHaveBeenCalled();
  });

  it("cancels a pending idle callback", () => {
    withIdleCallback(() => 42);
    whenIdle(vi.fn())();
    expect(globalThis.cancelIdleCallback).toHaveBeenCalledWith(42);
  });

  // Wired straight into an effect cleanup, so cancelling after the fact has to
  // be a no-op rather than something the caller has to guard.
  it("is safe to cancel after the callback has already run", () => {
    vi.useFakeTimers();
    const cancel = whenIdle(vi.fn());
    vi.advanceTimersByTime(WARM_DELAY_MS);
    expect(() => cancel()).not.toThrow();
  });

  it("returns a usable cancel for a non-function", () => {
    expect(() => whenIdle(undefined)()).not.toThrow();
  });
});

describe("warmChunks", () => {
  it("fires every loader on one idle tick", () => {
    vi.useFakeTimers();
    const a = vi.fn(() => Promise.resolve());
    const b = vi.fn(() => Promise.resolve());
    warmChunks([a, b]);
    vi.advanceTimersByTime(WARM_DELAY_MS);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  // A warm that does not land costs only the fetch it would have saved. It
  // must never take down the effect that scheduled it, or a chunk that fails
  // to prefetch becomes a broken app rather than a slower tab.
  it("swallows a loader that throws, and still runs the rest", () => {
    vi.useFakeTimers();
    const after = vi.fn();
    expect(() => {
      warmChunks([() => { throw new Error("offline"); }, after]);
      vi.advanceTimersByTime(WARM_DELAY_MS);
    }).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it("swallows a loader whose promise rejects", async () => {
    vi.useFakeTimers();
    warmChunks([() => Promise.reject(new Error("chunk 404"))]);
    vi.advanceTimersByTime(WARM_DELAY_MS);
    vi.useRealTimers();
    // An unhandled rejection would fail the run; getting here is the assertion.
    await new Promise(r => setTimeout(r, 0));
    expect(true).toBe(true);
  });

  it("does nothing at all for an empty list", () => {
    vi.useFakeTimers();
    expect(() => {
      warmChunks(undefined);
      vi.advanceTimersByTime(WARM_DELAY_MS);
    }).not.toThrow();
  });
});
