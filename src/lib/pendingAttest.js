// ══════════════════════════════════════════════════════════════════
//  pendingAttest — the scorecards this player still owes an attest on.
// ══════════════════════════════════════════════════════════════════
//
// This exists because the app icon and the app disagreed. A red bubble sat on
// the home screen saying "one thing needs you", and opening the app showed a
// tournament with nothing to do in it anywhere — no banner, no dot, no button.
// The only place an attestation can be given is the Scoring tab, and only for
// the group and round that tab happens to be pointing at, so the thing the
// badge was counting was frequently somewhere the player could not get to.
//
// Three ways that happened, all of them real:
//
//   • THE ROUND MOVED ON. The badge counted every signed card in the edition;
//     tapping Scoring jumps to the first unfinalized round. An unattested
//     Round 1 card with the tournament on Round 2 is a badge pointing at a
//     screen that no longer exists.
//   • THE DIRECTOR FINALIZED IT. Admin's whole-round finalize closes a round
//     whether or not everyone attested. The card is then locked — Scoring
//     shows "Scorecard Final" and no attest buttons at all — but the player's
//     id was still missing from `attestedBy`, so the badge counted it FOREVER.
//     That is the one that never goes away no matter how many times you open
//     the app, which is the complaint that got this written.
//   • THE PLAYER WITHDREW. Scoring builds its attest row from the group minus
//     WD players, so a player WD'd after the card was signed loses their
//     button and keeps their badge.
//
// So the badge and the screen are computed from ONE list now, and this module
// owns it. The rule is not "does this player appear unattested somewhere" —
// it is "is there something this player can actually go and DO". Anything the
// Scoring screen would not offer a button for does not count, because a count
// of things you cannot act on is what a phantom badge is.
//
// The list is also what the in-app banner renders, so the two can no longer
// drift: if the bubble says one, exactly one row is on screen saying which
// round it is and taking you there.
import { roundOfGroupKey } from "./groupSwitch";

// A card is final when its own group key says so, and ALSO when the bare round
// number does — `finalizedRounds` is keyed by both (see lib/groupSwitch), and
// Admin's finalize writes the round. OnCourseScoring asks the same pair of
// questions to decide whether to show its locked screen; asking a different
// one here is exactly how the two got out of step.
const isFinal = (finalizedRounds, groupKey, round) => {
  const fr = finalizedRounds || {};
  return !!(fr[groupKey] || (round != null && fr[round]));
};

const isWD = (tPlayers, playerId) =>
  (tPlayers || []).some(t => t.player_id === playerId && t.status === "WD");

/**
 * Every scorecard this player can still attest, soonest round first.
 *
 * @param {object}   scorecardSigs   App.jsx's map, keyed by group key
 * @param {object}   finalizedRounds keyed by group key AND bare round number
 * @param {string}   playerId        the person holding the phone
 * @param {Array}    tPlayers        tournament_players, for WD status
 * @returns {Array<{groupKey: string, round: number|null, signedBy: string, signedByName: string}>}
 */
export function pendingAttestations({ scorecardSigs, finalizedRounds, playerId, tPlayers } = {}) {
  if (!playerId) return [];
  // A withdrawn player has no attest button on any card — Scoring filters them
  // out of the row before it renders — so they owe nothing, everywhere.
  if (isWD(tPlayers, playerId)) return [];

  return Object.entries(scorecardSigs || {})
    .map(([groupKey, sig]) => ({ groupKey, sig, round: roundOfGroupKey(groupKey) }))
    .filter(({ groupKey, sig, round }) => {
      if (!sig) return false;
      // `present` is the group minus WDs, frozen at signing time. Not being in
      // it means this card was never this player's to attest.
      if (!(sig.present || []).includes(playerId)) return false;
      // The scorer's signature IS their attestation.
      if (sig.signedBy === playerId) return false;
      if ((sig.attestedBy || []).includes(playerId)) return false;
      if (isFinal(finalizedRounds, groupKey, round)) return false;
      return true;
    })
    .map(({ groupKey, sig, round }) => ({
      groupKey,
      round,
      signedBy: sig.signedBy || null,
      signedByName: sig.signedByName || null,
    }))
    // Oldest round first: the one furthest behind is the one holding the
    // round up, and it is the one the banner offers.
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || a.groupKey.localeCompare(b.groupKey));
}

// What the badge shows. Same list, so the number on the icon is the number of
// rows the app can put on screen — never one more.
export const pendingAttestCount = (args) => pendingAttestations(args).length;
