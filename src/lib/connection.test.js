import { describe, it, expect } from "vitest";
import { createWriteTracker, syncStatus } from "./connection";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("createWriteTracker", () => {
  it("starts empty", () => {
    expect(createWriteTracker().state()).toEqual({ pending: 0, kinds: {}, since: null, refused: 0, refusedKinds: {} });
  });

  it("counts a write that has not landed", () => {
    const t = createWriteTracker();
    t.track(deferred().promise, "hole_scores");
    expect(t.state()).toMatchObject({ pending: 1, kinds: { hole_scores: 1 } });
  });

  it("hands the same promise back, so it drops into a call site unchanged", () => {
    const t = createWriteTracker();
    const d = deferred();
    expect(t.track(d.promise, "hole_scores")).toBe(d.promise);
  });

  it("clears once the write lands", async () => {
    const t = createWriteTracker();
    const d = deferred();
    t.track(d.promise, "hole_scores");
    d.resolve();
    await d.promise;
    await Promise.resolve();
    expect(t.state()).toEqual({ pending: 0, kinds: {}, since: null, refused: 0, refusedKinds: {} });
  });

  // A failed write is not a waiting write. Leaving it counted would keep the
  // banner up forever over a problem it is not describing.
  it("clears on a rejected write too", async () => {
    const t = createWriteTracker();
    const d = deferred();
    t.track(d.promise, "hole_scores");
    d.reject(new Error("denied"));
    await d.promise.catch(() => {});
    await Promise.resolve();
    expect(t.state().pending).toBe(0);
  });

  it("keeps a count per collection", () => {
    const t = createWriteTracker();
    t.track(deferred().promise, "hole_scores");
    t.track(deferred().promise, "hole_scores");
    t.track(deferred().promise, "skins");
    expect(t.state()).toMatchObject({ pending: 3, kinds: { hole_scores: 2, skins: 1 } });
  });

  // This is the offline shape: eighteen writes handed over, none acknowledged.
  it("holds a whole withdrawal's worth of writes", () => {
    const t = createWriteTracker();
    for (let i = 0; i < 18; i++) t.track(deferred().promise, "hole_scores");
    expect(t.state().kinds.hole_scores).toBe(18);
  });

  it("notifies subscribers immediately and on every change", async () => {
    const t = createWriteTracker();
    const seen = [];
    const stop = t.subscribe(s => seen.push(s.pending));
    const d = deferred();
    t.track(d.promise, "hole_scores");
    d.resolve();
    await d.promise;
    await Promise.resolve();
    expect(seen).toEqual([0, 1, 0]);
    stop();
  });

  it("stops notifying after unsubscribe", () => {
    const t = createWriteTracker();
    const seen = [];
    t.subscribe(s => seen.push(s.pending))();
    t.track(deferred().promise, "hole_scores");
    expect(seen).toEqual([0]);
  });

  it("defaults an untagged write to 'other'", () => {
    const t = createWriteTracker();
    t.track(deferred().promise);
    expect(t.state().kinds).toEqual({ other: 1 });
  });
});

// `since` is how the banner knows a queue is STUCK rather than merely busy.
describe("createWriteTracker — how long it has been waiting", () => {
  const clockFrom = (start) => { let t = start; return { now: () => t, advance: (ms) => { t += ms; } }; };

  it("is null while nothing is outstanding", () => {
    expect(createWriteTracker(() => 1000).state().since).toBe(null);
  });

  it("stamps the moment the queue stopped being empty", () => {
    const c = clockFrom(1000);
    const t = createWriteTracker(c.now);
    t.track(deferred().promise, "hole_scores");
    expect(t.state().since).toBe(1000);
  });

  // A phone that is already stuck does not become less stuck because somebody
  // posted another hole into the same jammed queue.
  it("does not restart when more writes join a queue that is already waiting", () => {
    const c = clockFrom(1000);
    const t = createWriteTracker(c.now);
    t.track(deferred().promise, "hole_scores");
    c.advance(5000);
    t.track(deferred().promise, "hole_scores");
    expect(t.state().since).toBe(1000);
  });

  it("clears once the queue drains, and re-stamps for the next batch", async () => {
    const c = clockFrom(1000);
    const t = createWriteTracker(c.now);
    const d = deferred();
    t.track(d.promise, "hole_scores");
    d.resolve();
    await d.promise;
    await Promise.resolve();
    expect(t.state().since).toBe(null);

    c.advance(9000);
    t.track(deferred().promise, "hole_scores");
    expect(t.state().since).toBe(10000);
  });
});

// ══════════════════════════════════════════════════════════════════
//  Refusals — the write the server ANSWERED, and answered no.
// ══════════════════════════════════════════════════════════════════
//
// The queue above is the app working; this is the app being told no, and the
// difference matters to the person holding the phone. A queued score is on the
// handset and lands with the next bar of signal. A refused one has been rolled
// back out of the local cache, so it is on no device anywhere — and the card
// on screen is the only place it ever existed.
//
// It is the shape of a real weekend: a phone that came up with a stored player
// and no Firebase session behind it kept a scoring tab that worked perfectly,
// and posted a round the rest of the field never saw. Nothing threw, nothing
// queued, and the banner had no state for it.
describe("createWriteTracker — a write that came back refused", () => {
  const refuse = async (t, kind) => {
    const d = deferred();
    t.track(d.promise, kind);
    d.reject(Object.assign(new Error("permission-denied"), { code: "permission-denied" }));
    await d.promise.catch(() => {});
    await Promise.resolve();
  };

  const land = async (t, kind) => {
    const d = deferred();
    t.track(d.promise, kind);
    d.resolve();
    await d.promise;
    await Promise.resolve();
  };

  it("counts it, and says which collection it was", async () => {
    const t = createWriteTracker();
    await refuse(t, "hole_scores");
    expect(t.state()).toMatchObject({ pending: 0, refused: 1, refusedKinds: { hole_scores: 1 } });
  });

  it("keeps counting as a signed-out phone posts a whole card", async () => {
    const t = createWriteTracker();
    for (let i = 0; i < 4; i++) await refuse(t, "hole_scores");
    expect(t.state().refusedKinds.hole_scores).toBe(4);
  });

  // Sticky, because nothing retries a refusal. It clears when the same door
  // works again — which is what happens once the account is sorted out and the
  // score is typed in a second time.
  it("stays up until a write of that kind lands", async () => {
    const t = createWriteTracker();
    await refuse(t, "hole_scores");
    await land(t, "skins");
    expect(t.state().refusedKinds.hole_scores).toBe(1);
    await land(t, "hole_scores");
    expect(t.state()).toMatchObject({ refused: 0, refusedKinds: {} });
  });

  it("tells a subscriber without ever publishing a healthy state in between", async () => {
    const t = createWriteTracker();
    const seen = [];
    t.subscribe(s => seen.push({ pending: s.pending, refused: s.refused }));
    await refuse(t, "hole_scores");
    // start, handed over, settled — and the settle carries both facts at once.
    expect(seen[seen.length - 1]).toEqual({ pending: 0, refused: 1 });
    expect(seen.some(s => s.pending === 0 && s.refused === 0 && seen.indexOf(s) > 1)).toBe(false);
  });
});

describe("syncStatus", () => {
  it("says nothing when online and up to date — the bar earns its space by being absent", () => {
    expect(syncStatus({ online: true, pending: 0, kinds: {} })).toBe(null);
  });

  it("says nothing for a write that has only just been handed over", () => {
    expect(syncStatus({ online: true, pending: 1, kinds: { hole_scores: 1 }, stalled: false })).toBe(null);
  });

  it("names the offline state even with nothing outstanding", () => {
    const s = syncStatus({ online: false, pending: 0, kinds: {} });
    expect(s.key).toBe("offline");
    expect(s.label).toMatch(/no signal/i);
  });

  // "Keep scoring" is advice, and advice is only earned when this phone is
  // actually holding something somebody typed.
  it("offers no advice when there is nothing outstanding to hold", () => {
    expect(syncStatus({ online: false, pending: 0, kinds: {} }).hint).toBe("");
  });

  it("reassures whenever writes are waiting on this phone", () => {
    expect(syncStatus({ online: false, pending: 2, kinds: { hole_scores: 2 } }).hint).toBe("Keep scoring");
    expect(syncStatus({ online: false, pending: 2, kinds: { skins: 2 } }).hint).toBe("Keep scoring");
    expect(syncStatus({ online: true, pending: 1, kinds: { hole_scores: 1 }, stalled: true }).hint).toBe("Keep scoring");
  });

  it("keeps the no-signal line short enough for one line on a phone", () => {
    expect(syncStatus({ online: false, pending: 0, kinds: {} }).label.length).toBeLessThanOrEqual(40);
  });

  it("counts unsent scores, because that is the number a scorer needs", () => {
    const s = syncStatus({ online: false, pending: 3, kinds: { hole_scores: 3 } });
    expect(s.key).toBe("offline-scores");
    expect(s.label).toBe("No signal — 3 scores still on this phone");
  });

  it("says one score, not 1 scores", () => {
    const s = syncStatus({ online: false, pending: 1, kinds: { hole_scores: 1 } });
    expect(s.label).toBe("No signal — 1 score still on this phone");
  });

  it("falls back to 'changes' when nothing outstanding is a score", () => {
    const s = syncStatus({ online: false, pending: 2, kinds: { skins: 2 } });
    expect(s.key).toBe("offline-pending");
    expect(s.label).toBe("No signal — 2 changes still on this phone");
  });

  it("leads with scores when a mix is outstanding", () => {
    const s = syncStatus({ online: false, pending: 4, kinds: { hole_scores: 3, skins: 1 } });
    expect(s.label).toBe("No signal — 3 scores still on this phone");
  });

  // The case navigator.onLine misses entirely: one bar of signal, passing
  // nothing. The OS says online; the writes say otherwise.
  it("speaks up when writes stall despite the OS claiming to be online", () => {
    const s = syncStatus({ online: true, pending: 2, kinds: { hole_scores: 2 }, stalled: true });
    expect(s.key).toBe("stalled-scores");
    expect(s.label).toBe("Still sending 2 scores…");
  });

  it("stalls on non-score writes too", () => {
    const s = syncStatus({ online: true, pending: 1, kinds: { pairings: 1 }, stalled: true });
    expect(s.key).toBe("stalled");
    expect(s.label).toBe("Still sending 1 change…");
  });

  it("has nothing to stall on once the queue drains", () => {
    expect(syncStatus({ online: true, pending: 0, kinds: {}, stalled: true })).toBe(null);
  });

  // ── The refused write ──
  // The one state in here that is a failure rather than a fact, and the only
  // one that asks the person for anything.
  it("says a refused score did not save, and that nobody else has it", () => {
    const s = syncStatus({ online: true, refused: 1, refusedKinds: { hole_scores: 1 } });
    expect(s.key).toBe("refused-scores");
    expect(s.tone).toBe("bad");
    expect(s.label).toBe("1 score did not save — nobody else has it");
    expect(s.hint).toBe("Check you're signed in");
  });

  it("counts them, because a signed-out phone refuses every hole it posts", () => {
    expect(syncStatus({ online: true, refused: 5, refusedKinds: { hole_scores: 5 } }).label)
      .toBe("5 scores did not save — nobody else has them");
  });

  it("falls back to 'changes' when the refusal was not a score", () => {
    const s = syncStatus({ online: true, refused: 2, refusedKinds: { skins: 2 } });
    expect(s.key).toBe("refused");
    expect(s.label).toBe("2 changes did not save");
  });

  // A refusal outranks no-signal: "the board may be behind" is reassuring and
  // wrong once the server has said no to something.
  it("leads with the refusal even on a phone that is also offline", () => {
    const s = syncStatus({ online: false, pending: 2, kinds: { hole_scores: 2 }, refused: 1, refusedKinds: { hole_scores: 1 } });
    expect(s.key).toBe("refused-scores");
  });

  it("goes quiet again once nothing is refused", () => {
    expect(syncStatus({ online: true, pending: 0, kinds: {}, refused: 0, refusedKinds: {} })).toBe(null);
  });
});
