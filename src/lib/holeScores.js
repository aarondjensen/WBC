// ══════════════════════════════════════════════════════════════════
//  holeScores — turning score DOCUMENTS into the map every screen reads.
// ══════════════════════════════════════════════════════════════════
//
// `holeData` is the shape the whole app scores against:
//
//   { "aaron_j_1": { 0: 5, 1: 4, … }, … }   →   pid_round → holeIdx → strokes
//
// and it is built from one Firestore listener on `hole_scores`. That listener
// is INCREMENTAL by design: a tournament is twelve players × four rounds ×
// eighteen holes, and rebuilding the whole map every time somebody taps a 4 on
// a tee box would be a thousand-key rebuild per stroke. It applies the
// snapshot's changes to the map it already has instead.
//
// Which is exactly why this lives here rather than inline in the listener.
// Incremental means "the map is only ever as correct as the last change you
// applied", and the change type that was NOT being applied was `removed`:
//
//   A director discarding a round's scores deleted the documents, and the
//   holes vanished on the director's own phone because that screen also
//   dropped them from local state by hand. Every OTHER phone kept showing
//   them, and kept counting them on the leaderboard, until it was relaunched.
//
// A deletion is as much a fact about a card as a score is, and both arrive
// through the same door. Applying them both here — in one pure function with
// a test beside it — is what keeps that door from being half-open.

// Which round a score document belongs to.
//
// `round_number` is the field every row this app writes carries. The id is
// parsed only as a fallback, for the oldest imported rows that predate it —
// `hs_2026_r1_aaron_j_h4` and the `rs_`-prefixed round-score ids both carry
// the round as `_r<N>_`.
export function roundOf(row) {
  if (row?.round_number) return row.round_number;
  const m = String(row?.round_score_id || row?.id || "").match(/_r(\d+)_/);
  return m ? parseInt(m[1], 10) : 1;
}

// The key a round's card is filed under. Spelled once here because the
// listener, the scoring screen and the leaderboard all have to agree on it.
export const cardKey = (pid, round) => `${pid}_${round}`;

// ── applyScoreChanges ──────────────────────────────────────────────
// Fold a snapshot's changes into the map. Pure: returns a NEW map and never
// touches the one it was given.
//
// `changes` is [{ type, row }] where type is Firestore's "added" | "modified"
// | "removed" and row is the document data. The listener normalises
// DocumentChange into that shape so this module never has to know about
// Firestore types — which is what makes it testable without one.
//
// An emptied card is REMOVED rather than left as a `{}` behind its key. Most
// readers ask `Object.values(card).some(v => v > 0)` and would survive the
// husk, but not all of them do — and "this player has no card for this round"
// and "this player has a card with nothing in it" should not be two different
// states for the same fact.
export function applyScoreChanges(holeData, changes) {
  if (!changes?.length) return holeData;
  const next = { ...(holeData || {}) };
  let touched = false;

  changes.forEach(({ type, row }) => {
    if (!row?.player_id || !(row.hole_number > 0)) return;
    const key = cardKey(row.player_id, roundOf(row));
    const holeIdx = row.hole_number - 1;

    if (type === "removed") {
      const card = next[key];
      if (!card || !(holeIdx in card)) return;
      const trimmed = { ...card };
      delete trimmed[holeIdx];
      if (Object.keys(trimmed).length === 0) delete next[key];
      else next[key] = trimmed;
      touched = true;
      return;
    }

    next[key] = { ...(next[key] || {}), [holeIdx]: row.score };
    touched = true;
  });

  // Nothing landed — hand back the SAME object so React can skip the render.
  // A snapshot carrying only changes this map already reflects is ordinary:
  // it is the echo of a score this phone posted itself.
  return touched ? next : holeData;
}
