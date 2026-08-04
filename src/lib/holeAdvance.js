// ══════════════════════════════════════════════════════════════════
//  holeAdvance — where a scoring screen should open.
// ══════════════════════════════════════════════════════════════════
//
// The pure half of Bourbon Cup's useHoleAdvance. Deliberately NOT the whole
// hook: WBC's scoring screen already has advance logic that BC's has no notion
// of — it gates on the closest-to-pin prompt so a par 3 doesn't skip past the
// CTP question, and it drives a slide transition between holes. Swapping the
// hook in wholesale would have traded working, WBC-specific behaviour for a
// generic version of it. BC's hook exists to de-duplicate across two BC
// scoring screens; WBC has one, so there is no duplication to remove.
//
// What IS worth taking is this: the "which hole do we open on" decision, as a
// function that can be tested, and the cold-load problem it exposes.
//
//   WBC resolved the opening hole in an effect keyed on [group]. On a cold
//   load the pairings can arrive BEFORE the hole scores — separate Firestore
//   subscriptions, no ordering guarantee — and when they do, the effect runs
//   against an empty score map, decides hole 1, and never runs again. A player
//   returning to a round mid-way opens on hole 1 and has to walk forward by
//   hand.
//
// `resolved` is what fixes that: it reports whether the answer was derived
// from real data or from an empty map, so the caller knows whether to hold the
// position or wait and ask again.
//
// `score(pid, holeIdx)` must return a falsy value (0 or undefined) for a hole
// nobody has posted.

export const HOLES = 18;

// ── openingHole ────────────────────────────────────────────────────
// Returns { hole, allComplete, hasAnyScores, resolved }.
//
//   hole         — the hole index (0-based) the screen should show
//   allComplete  — every player has every hole; the caller lands on the last
//                  hole in edit mode rather than a "next" one, because there
//                  is no next
//   hasAnyScores — anything posted at all for this group
//   resolved     — false when there is nothing to decide FROM (no players, or
//                  not one score yet). Landing on hole 1 because no data has
//                  arrived is not an answer, and a caller that treats it as
//                  one is the cold-load bug above.
export function openingHole(pids, score, holes = HOLES) {
  const clean = (pids || []).filter(Boolean);
  if (clean.length === 0) {
    return { hole: 0, allComplete: false, hasAnyScores: false, resolved: false };
  }

  const at = (pid, h) => score(pid, h) || 0;
  const hasAnyScores = clean.some(pid => {
    for (let h = 0; h < holes; h++) if (at(pid, h) > 0) return true;
    return false;
  });
  // Nothing posted: start at the start. Flagged unresolved so a caller can
  // tell "the card is genuinely empty" from "the scores have not loaded" —
  // they look identical from here, and only the caller knows which it is.
  if (!hasAnyScores) {
    return { hole: 0, allComplete: false, hasAnyScores: false, resolved: false };
  }

  for (let h = 0; h < holes; h++) {
    if (!clean.every(pid => at(pid, h) > 0)) {
      return { hole: h, allComplete: false, hasAnyScores: true, resolved: true };
    }
  }
  // Every hole done — the caller shows the last one, in edit mode.
  return { hole: holes - 1, allComplete: true, hasAnyScores: true, resolved: true };
}

// ── nineComplete ───────────────────────────────────────────────────
// Has every player in the group posted every hole of this nine?
// `from` is the first hole index of the nine (0 for the front, 9 for the back).
//
// This is what gates the front-9 check the scoring screen puts up at the turn.
// A group with nobody in it has not finished anything, so an empty list is
// false rather than a vacuously true "all done".
export function nineComplete(pids, score, from = 0, len = 9) {
  const clean = (pids || []).filter(Boolean);
  if (clean.length === 0) return false;
  for (let h = from; h < from + len; h++) {
    if (!clean.every(pid => (score(pid, h) || 0) > 0)) return false;
  }
  return true;
}
