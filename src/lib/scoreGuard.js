// ══════════════════════════════════════════════════════════════════
//  scoreGuard — what a destructive pairing change would take with it.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup, where the same hazard comes from re-drawing a
// match. WBC has it for the same underlying reason:
//
//   Scores are keyed by PLAYER + ROUND + HOLE (`hs_2026_r1_aaron_j_h7`),
//   never by group. Pairings live in their own documents.
//
// That is the right way round — a card belongs to the golfer who shot it, and
// it should survive being re-paired — but it has a consequence the admin
// console has to say out loud:
//
//   A PAIRING IS ONLY A VIEW ONTO SCORES ITS PLAYERS ALREADY POSTED.
//
// Clear a round's pairings and the scores do not go anywhere. They stop being
// displayed on the scoring screen while every one of them is still sitting in
// Firestore, still counting on the leaderboard. Regenerate the SAME groups and
// they come back, which is usually the mercy you wanted. Regenerate DIFFERENT
// groups and they come back too, attached to whoever now shares a card with
// them, with nothing on screen to say they are this morning's holes.
//
// So the controls that change who is in a round's draw ask this module what is
// behind the change first, and the answer goes in front of the director BEFORE
// the tap rather than in a toast afterwards.
//
// Everything here is pure and reads the in-memory `holeData` map the app
// already subscribes to: holeData[`${pid}_${round}`][holeIdx] = gross.
//
// The WD sentinel is excluded everywhere. A withdrawn player's remaining holes
// are filled with 99 so their card stays structurally complete (see
// lib/individualBoard), and counting those as "holes posted" would report a
// player who walked in after nine as having a full round at risk.

export const WD_SENTINEL = 99;

// How many holes this player has actually posted in this round.
export const holesEntered = (holeData, pid, round) =>
  Object.values(holeData?.[`${pid}_${round}`] || {})
    .filter(s => s > 0 && s !== WD_SENTINEL).length;

// ── Whole-round progress ────────────────────────────────────────────
// Counts EVERY player in EVERY group of the round, not one reader's own
// group: this is what tells the director the round is finished, and it is the
// same "> 0 means posted" reading of holeData as everything else here, so it
// can never disagree with the finalize sheet's own count.
export function roundScoreProgress(groups, holeData, round) {
  const pids = [...new Set((groups || []).flat().filter(Boolean))];
  const missingBy = [];
  let entered = 0;
  pids.forEach(pid => {
    // Clamped at the 18 a round has: `entered` is compared against
    // pids × 18, so a stray key outside 0–17 must not be able to push a
    // partial round past "complete".
    const posted = Math.min(18, holesEntered(holeData, pid, round));
    entered += posted;
    if (posted < 18) missingBy.push({ pid, missing: 18 - posted });
  });
  const total = pids.length * 18;
  return {
    total, entered, missing: total - entered,
    missingBy: missingBy.sort((a, b) => b.missing - a.missing),
    // An empty round is not a finished one — a round with no groups drawn has
    // nothing to be complete about.
    complete: total > 0 && entered === total,
  };
}

// [{ pid, holes }] for the given players, heaviest card first, silent players
// dropped. The order matters: read out in a confirmation, it should open with
// the player who has the most to lose.
export const scoredAmong = (holeData, round, pids) =>
  [...new Set(pids || [])]
    .map(pid => ({ pid, holes: holesEntered(holeData, pid, round) }))
    .filter(p => p.holes > 0)
    .sort((a, b) => b.holes - a.holes || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : 0));

export const totalHoles = (scored) => (scored || []).reduce((n, p) => n + p.holes, 0);

// What re-drawing this round would disturb: everyone currently in its groups
// who has already posted. `holes` is the round-wide total, which is the number
// worth leading a warning with — four players eight holes deep is "32 holes",
// and that reads as the morning it was.
export function pairingScoreImpact({ groups, holeData, round }) {
  const scored = scoredAmong(holeData, round, (groups || []).flat().filter(Boolean));
  return {
    scored,
    holes: totalHoles(scored),
    hasScores: scored.length > 0,
  };
}

// Players carrying scores in a round that no CURRENT group accounts for. This
// is the wreckage of a re-draw that has already happened: the scores are live
// in the database, still counting on the leaderboard, and invisible on the
// scoring screen. Surfacing them is the difference between "the draw is empty"
// and "the draw is empty and there are 54 holes underneath it".
export function orphanedScores({ holeData, groups, round, players }) {
  const inGroups = new Set((groups || []).flat().filter(Boolean));
  return scoredAmong(
    holeData, round,
    (players || []).map(p => p.id).filter(pid => !inGroups.has(pid))
  );
}

// The mirror hazard: these players are about to be put INTO a group in a round
// where they already have holes posted. Whatever the new pairing is, it
// inherits those holes the moment it saves.
export const incomingScores = ({ holeData, round, pids }) =>
  scoredAmong(holeData, round, pids);

// Render helper — "Aaron J (12), Dave S (7)" or "Aaron J (12), +3 more".
export function describeScored(scored, nameOf, max = 4) {
  const head = (scored || []).slice(0, max).map(({ pid, holes }) => `${nameOf(pid)} (${holes})`);
  const rest = (scored || []).length - head.length;
  return head.join(", ") + (rest > 0 ? `, +${rest} more` : "");
}
