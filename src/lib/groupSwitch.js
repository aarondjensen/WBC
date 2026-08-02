// ══════════════════════════════════════════════════════════════════
//  groupSwitch — what a director's crown can point the Scoring tab at.
// ══════════════════════════════════════════════════════════════════
//
// Scoring is normally locked to the group the person holding the phone is
// playing in, in the round the app is on. That is what makes it safe to hand a
// phone to a tee box. The crown in the app header (components/GroupSwitcher)
// is the one deliberate hole in it, and it is a DIRECTOR'S hole — the flag
// lives on their wbc_accounts document and the security rules read the same
// one, so a phone that can see the control is a phone whose writes land.
//
// It exists because a round has to be testable before it is played, because on
// the day somebody's phone is dead and the scores still have to go in, and
// because a card entered against the wrong hole is nobody's fault and still
// has to be fixed the next morning — by which time the round has moved on.
//
// Everything here is pure so it can be tested without Firebase: the shape of
// the list, which round counts as live, and how far along a group is.

// The id a group's scores and its signature are filed under. This shape is
// load-bearing — `${round}_${sorted ids}` is what finalizedRounds and
// wbc_scorecard_sigs are keyed by — so it is spelled once, here.
export const groupKey = (round, ids) => `${round}_${[...(ids || [])].sort().join(",")}`;

// Two group rosters naming the same four people, whatever order they arrived
// in. Pairings come back from Firestore as arrays, and an array is not a set.
export const sameGroup = (a, b) =>
  !!a && !!b && [...a].sort().join(",") === [...b].sort().join(",");

// The round the tournament is ON: the first that has not been finalized.
// Null when every round has, which is the event being over — and that is the
// state where a stray edit is LEAST likely to be noticed, so callers treat it
// as "no live round" rather than as "any round will do".
export function liveRound(finalizedRounds, numRounds) {
  const fr = finalizedRounds || {};
  for (let r = 1; r <= numRounds; r++) if (!fr[r]) return r;
  return null;
}

// Every group in every round, rounds ascending, each round keeping the order
// the pairings came in. Rounds are the outer axis because that is the axis a
// director crosses deliberately — a group is picked out of a round, never the
// other way round. Empty slots in a round's draw are skipped: the pairings
// editor leaves them behind while a director is still filling groups in, and
// a group with nobody in it is not somewhere to point a scoring screen.
export function switchableGroups(pairingsData, numRounds) {
  const out = [];
  for (let r = 1; r <= numRounds; r++) {
    ((pairingsData || {})[r] || []).forEach((ids, index) => {
      if (!ids || ids.length === 0) return;
      out.push({ round: r, index, ids, key: groupKey(r, ids) });
    });
  }
  return out;
}

// How far along a group is, in the terms the director's group list already
// uses: finalized, all 18 in, or thru N. `thru` is the FURTHEST player rather
// than the group's agreed position — one player one hole behind is normal
// mid-hole, and reporting the group as a hole back reads as scores going
// missing.
export function groupProgress(round, ids, holeData, finalizedRounds) {
  const fr = finalizedRounds || {};
  // Two keys mean finalized: the group's own, and the whole round's. Admin
  // finalizes rounds; the scoring screen finalizes single cards.
  const finalized = !!(fr[groupKey(round, ids)] || fr[round]);
  let thru = 0;
  let complete = (ids || []).length > 0;
  (ids || []).forEach(pid => {
    const scores = (holeData || {})[`${pid}_${round}`] || {};
    let n = 0;
    for (let h = 0; h < 18; h++) if (scores[h] > 0) n++;
    if (n > thru) thru = n;
    if (n < 18) complete = false;
  });
  return { finalized, complete, thru };
}
