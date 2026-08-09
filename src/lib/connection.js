// ══════════════════════════════════════════════════════════════════
//  connection — whether this phone is actually talking to the server.
// ══════════════════════════════════════════════════════════════════
//
// Why this exists, and it is the most golf-specific problem in the app:
//
//   Firestore's setDoc() does not FAIL when there is no signal. It does not
//   resolve either. The write goes into a local queue, the promise stays
//   pending for as long as it takes — minutes, a whole back nine — and lands
//   the moment a bar of signal comes back.
//
// That is exactly the behaviour you want on a golf course, and it is why the
// app can be scored through a dead patch at all. But it means every
// `try { await db.upsert(…) } catch` in this codebase is catching a case that
// nearly never happens (a rules denial) while the case that happens all the
// time — no signal — sails straight past as though it had succeeded. The score
// goes green on the screen, the group walks to the next tee, and nothing
// anywhere says the card is still sitting on that one phone.
//
// Two consequences this module addresses:
//
//   • Nobody could tell. A scorer had no way to distinguish "everybody has
//     this" from "only I have this", which is the difference between walking
//     in and walking back.
//   • Anything that AWAITED a write hung. markPlayerWD awaited eighteen of
//     them in a row and only then raised its confirmation, so withdrawing
//     somebody out of signal appeared to do nothing at all.
//
// The tracker below counts writes that have been handed over and not yet
// acknowledged. It is deliberately not Firestore-aware: it counts promises,
// which is what makes it testable without a backend and true regardless of
// which SDK is underneath.

// ── The tracker ────────────────────────────────────────────────────
// One per app. `track` takes the promise a write returns and hands the SAME
// promise back, so it drops into a call site without changing what that call
// site does:
//
//   return writes.track(setDoc(…), "hole_scores");
//
// `kind` is the collection, so the banner can say "3 scores waiting" rather
// than the useless "3 changes waiting" — on a tee box the only pending write
// anybody cares about is a hole.
//
// A rejected write decrements too. A write that FAILED is no longer waiting to
// send; it is a different problem, and reporting it as still-in-flight forever
// would be its own lie.
// `since` is the moment the queue last went from empty to non-empty, and null
// while it is empty. It is here rather than in the hook that reads it because
// "how long has this been outstanding" is a fact about the queue, and because
// a hook deriving it would have to set state inside an effect to keep it —
// which is the render loop this app has been bitten by before.
//
// It does NOT restart as further writes join a queue that is already backed
// up. The question the banner asks is "how long has this phone had something
// it could not send", and posting another hole into a queue that is already
// stuck does not make it less stuck.
export function createWriteTracker(now = () => Date.now()) {
  const byKind = new Map();
  const listeners = new Set();
  let since = null;

  const snapshot = () => {
    let total = 0;
    const kinds = {};
    byKind.forEach((n, k) => { total += n; if (n > 0) kinds[k] = n; });
    return { pending: total, kinds, since };
  };

  const emit = () => {
    const s = snapshot();
    listeners.forEach(fn => fn(s));
  };

  const bump = (kind, delta) => {
    const wasEmpty = byKind.size === 0;
    const next = (byKind.get(kind) || 0) + delta;
    if (next <= 0) byKind.delete(kind);
    else byKind.set(kind, next);
    if (byKind.size === 0) since = null;
    else if (wasEmpty) since = now();
    emit();
  };

  return {
    track(promise, kind = "other") {
      bump(kind, 1);
      let settled = false;
      const done = () => { if (settled) return; settled = true; bump(kind, -1); };
      Promise.resolve(promise).then(done, done);
      return promise;
    },
    state: snapshot,
    subscribe(fn) {
      listeners.add(fn);
      fn(snapshot());
      return () => listeners.delete(fn);
    },
  };
}

// ── What to say about it ───────────────────────────────────────────
// Pure, so the wording is testable and lives in one place.
//
// The rule this follows is that a status bar earns its space by being ABSENT
// most of the time. A strip that says "synced" all weekend is furniture
// nobody reads, and the one time it says something else it will not be read
// either. So there is no healthy state: this returns null when there is
// nothing wrong, and the app renders nothing.
//
// `stalled` is the caller's answer to "have these writes been outstanding
// long enough to be worth mentioning" — see useSyncStatus. Without it, every
// normal score would flash a bar for the 200ms it takes to land.
// `hint` is the trailing reassurance, and it is only ever present when this
// phone is HOLDING something. That is the case where somebody might otherwise
// stop and wait, and stopping is the wrong move — the queue drains itself. A
// phone that is merely out of range with nothing to send has nothing to be
// reassured about, and a spectator reading a stale board is not scoring
// anything, so both get the fact and no advice.
export function syncStatus({ online, pending = 0, kinds = {}, stalled = false }) {
  const scores = kinds.hole_scores || 0;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const holding = (key, label) => ({ key, tone: "warn", label, hint: "Keep scoring" });

  if (!online) {
    if (scores > 0) return holding("offline-scores", `No signal — ${plural(scores, "score", "scores")} still on this phone`);
    if (pending > 0) return holding("offline-pending", `No signal — ${plural(pending, "change", "changes")} still on this phone`);
    return { key: "offline", tone: "warn", label: "No signal — the board may be behind", hint: "" };
  }

  if (pending > 0 && stalled) {
    return scores > 0
      ? holding("stalled-scores", `Still sending ${plural(scores, "score", "scores")}…`)
      : holding("stalled", `Still sending ${plural(pending, "change", "changes")}…`);
  }

  return null;
}
