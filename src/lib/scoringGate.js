// ══════════════════════════════════════════════════════════════════
//  scoringGate — when a phone is allowed to post a score.
// ══════════════════════════════════════════════════════════════════
//
// Scoring is not open all the time, and the reason is a specific failure: a
// phone that can post to any round at any moment will eventually post Round 3
// scores into Round 1, usually on the morning of Round 3 when somebody opens
// the app before the pairings have moved. Those scores are real documents on
// a real leaderboard and somebody has to find them.
//
// So the screen opens on a clock, and only for the round actually being played:
//
//   director      always. They are the fix-it path — a phone died, a card was
//                 entered against the wrong name, a round has to be re-scored
//                 the next morning — and a gate that locks the director out
//                 locks out the only person who can repair it.
//   force-open    a director has flipped this round open in Admin. The escape
//                 hatch for a day that does not match the schedule: a rain
//                 delay, a shotgun start, a round moved forward.
//   otherwise     the round's scheduled DATE has to be today, and the group's
//                 tee time has to be within SCORING_LEAD_MIN.
//
// Every "no" here is a closed door on a tee box, so the defaults are chosen to
// fail toward the director rather than toward the field: no date set, no tee
// time, an unreadable tee time — all closed, all openable in one tap from
// Admin. The alternative default (open when we cannot tell) is the one that
// files scores against the wrong round.
//
// Pure, and now testable: it used to sit in App.jsx reading `new Date()`
// directly, so the one rule the whole scoring screen is gated on had no test.

import { teeTimeToMinutes, localDateISO } from "./format";

// Minutes before tee time that scoring unlocks for non-directors. Half an hour
// is the range: a group is on the putting green by then and the first card is
// sometimes started before anybody reaches the tee.
export const SCORING_LEAD_MIN = 30;

// `now` is injected so this can be tested at a specific moment; every caller
// in the app omits it and gets the real clock.
export function isScoringOpen({ round, teeTime, roundDates, scoringOpen, isDirector, now = new Date() }) {
  if (isDirector) return true;
  if (scoringOpen && scoringOpen[round] === true) return true;

  const dateStr = roundDates && roundDates[round];
  if (!dateStr) return false;                       // no date set → closed until a director opens it
  if (dateStr !== localDateISO(now)) return false;  // round isn't today → closed

  const teeMin = teeTimeToMinutes(teeTime);
  if (teeMin == null) return false;                 // no/unreadable tee time → closed

  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= teeMin - SCORING_LEAD_MIN;
}
