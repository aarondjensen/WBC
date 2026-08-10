// ══════════════════════════════════════════════════════════════════
//  marketSeal — which books this phone is allowed to be holding.
// ══════════════════════════════════════════════════════════════════
//
// The market is blind, and as of firestore.rules it is blind on the SERVER
// rather than only on screen: a market document is readable by the player it
// belongs to and by a director, and by nobody else. That is the game working
// — the halfway window is meant to be a correction bought with two rounds of
// evidence, not a copy of the consensus.
//
// It leaves one problem, and this module is the answer to it. The final board
// is the point of playing: everybody has to see who backed the winner and what
// a share paid. But nobody except a director can read the books it is built
// from.
//
// So a director's device PUBLISHES the books once the tournament is over, into
// one world-readable document (wbc_market_result). Not a Cloud Function: a
// function would have to re-implement the market's arithmetic in a second
// language, and everything else here has gone the other way — one
// implementation, shared.
//
// What each phone ends up holding:
//
//   director            every book, live, throughout — the correction path
//                       and the settling-up both need it
//   player, sealed      their own book only
//   player, revealed    every book, from the published document
//
// The screen's own `sealed` flag is unchanged and still hides the board until
// the event is complete. This is the layer underneath it: what the phone is
// even able to know.

// ── betsToHold ─────────────────────────────────────────────────────
// The bets the Betting tab should compute from, given what this phone has.
//
//   own        this player's book, from the narrow subscription
//   all        every book, from the director's wide subscription (null if not
//              a director)
//   published  the revealed books, once a director has posted them (null
//              until then)
//
// A director's live read wins over the published copy, always: the published
// copy is a snapshot and the director is the one who may still be correcting a
// book after it was taken.
export function betsToHold({ own = [], all = null, published = null, isDirector = false }) {
  if (isDirector && all) return all;
  if (published) return published;
  return own || [];
}

// ── shouldPublish ──────────────────────────────────────────────────
// Whether a director's device should write the reveal document now.
//
// Three conditions, and the third is the one that keeps this from writing on
// every render: the books have to have CHANGED since whatever is already
// published. `signature` is compared rather than the arrays themselves,
// because the bets arrive as fresh objects from every snapshot and comparing
// by identity would republish forever.
//
// A correction after the reveal republishes, which is correct — a director
// fixing a fat-fingered allocation should not leave the field looking at the
// old board.
export function shouldPublish({ isDirector, eventComplete, bets, publishedSignature }) {
  if (!isDirector || !eventComplete) return false;
  if (!bets || bets.length === 0) return false;
  return betsSignature(bets) !== publishedSignature;
}

// One book's lots, flattened. Sorted so the same holdings in a different
// order produce the same string.
const lotsSig = (lots) =>
  (lots || [])
    .map(l => `${l.pid}=${l.shares}`)
    .sort()
    .join(",");

// A stable string for a set of books. Sorted by player so two devices holding
// the same bets in a different order agree, and built only from the fields
// that decide the board — a change to `updated_at` is not a change to anybody's
// position.
export function betsSignature(bets) {
  return (bets || [])
    .map(b => `${b.pid}:${lotsSig(b.opening)}|${lotsSig(b.mid)}`)
    .sort()
    .join(";");
}
