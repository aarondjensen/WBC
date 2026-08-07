// ══════════════════════════════════════════════════════════════════
//  ctp — reading a pin's standing tag against the order of play.
// ══════════════════════════════════════════════════════════════════
//
// Closest to Pin is tournament-wide: one winner per par 3 per round, held by
// whichever group has tagged the closest ball SO FAR. The comparison is on
// feet, not on who typed first, so the winner survives groups entering their
// scores out of order — a group that walks in half an hour late with a
// shorter ball still takes the pin.
//
// What does NOT survive is the group's understanding of what they are looking
// at. A group rushing to the next tee puts a par 3 in fifteen minutes later,
// by which time the group BEHIND them has finished the same hole and tagged
// it. The prompt then shows them a "current CTP" that did not exist when they
// were on the green, from players who were still walking up as they left.
//
// Two things go wrong when nobody says so:
//
//   • They read the number as the group AHEAD of them, and take it as the
//     mark to beat rather than as a hole that is still being played out.
//   • A tie goes to whoever wrote first, which here is the group that played
//     LAST. The prompt says "the earlier tag holds" and means earlier by the
//     clock on the phone, which is not the order the shots were hit in.
//
// So the tag carries the group that made it, and this is where that gets
// compared to the group being asked. Tee order — a group's index in the
// round's draw — is the only ordering the app has that matches the order the
// holes were actually played in, and it is the one the whole app already
// counts groups by (`Group ${index + 1}`).

import { sameGroup } from "./groupSwitch";

// Where a group sits in a round's draw. Null when the group is not in it —
// a director scoring a foursome that has since been redrawn, or a round with
// no pairings at all — and null is deliberately not zero: "not in the draw"
// must never read as "off first".
export function groupTeeOrder(pairingsData, round, ids) {
  if (!ids || ids.length === 0) return null;
  const groups = (pairingsData || {})[round] || [];
  const i = groups.findIndex(g => sameGroup(g, ids));
  return i === -1 ? null : i;
}

// What the whole app calls a group. Spelled once here so the CTP prompt says
// the same "Group 3" the tee sheet, the crown and the pairings editor do.
export const groupLabel = (order) => (order == null ? "another group" : `Group ${order + 1}`);

// Was the standing tag made by a group that plays BEHIND the one being asked?
//
// Returns null when there is nothing to say, and that covers more cases than
// the plain "no, they were ahead":
//
//   • no tag yet, or a tag with no group on it (a director's override from the
//     Betting tab, or a document written before tags carried their group)
//   • either group missing from the draw, so there is no order to compare
//   • the same group — one device scoring its own hole twice
//
// An UNKNOWN order says nothing rather than guessing, because the warning is
// only worth showing when it is certainly true. A group wrongly told the
// field is out of order will stop trusting the prompt.
export function tagAheadOfPlay({ leaderOrder, leaderKey, myOrder, myKey }) {
  if (leaderOrder == null || myOrder == null) return null;
  if (leaderKey && myKey && leaderKey === myKey) return null;
  if (leaderOrder <= myOrder) return null;
  return { leaderOrder, label: groupLabel(leaderOrder) };
}
