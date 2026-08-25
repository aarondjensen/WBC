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
//   • A tie went to whoever wrote first, which here is the group that played
//     LAST. The prompt said "the earlier tag holds" and meant earlier by the
//     clock on the phone, which is not the order the shots were hit in.
//
// So the tag carries the group that made it, and this is where that gets
// compared to the group being asked. Tee order — a group's index in the
// round's draw — is the only ordering the app has that matches the order the
// holes were actually played in, and it is the one the whole app already
// counts groups by (`Group ${index + 1}`).
//
// Both are answered here, and by the same fact. tagAheadOfPlay is the WARNING
// — it says the number in front of you came from behind you. canTakePin and
// winningClaim are the RULE: a tie now goes to the group with the lower tee
// order, so the man who played it first keeps it whoever typed first. The
// warning stopped being the whole remedy the moment the rule could be made
// right, and a warning standing in for a rule is what this file used to be.

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

// ══════════════════════════════════════════════════════════════════
//  The pin document: one CLAIM per group, not one winner per pin.
// ══════════════════════════════════════════════════════════════════
//
// A pin used to be stored as the answer — player, feet, who typed it — and
// every group that answered the prompt overwrote the whole thing. That is
// last-write-wins on a field four phones write to, and it loses in three
// separate ways:
//
//   • TWO GROUPS TAGGING AT ONCE. Both compare against the tag their own
//     phone currently holds, both pass their own check, and the second write
//     lands on top. A nine-footer overwrites a five-footer and the closest
//     ball loses the pin, which is the one thing this game is.
//   • TWO GROUPS CONFIRMING AT ONCE. The confirmation list was read out of
//     local state, appended to and written back whole, so a confirmation that
//     had not yet arrived on this phone was erased by the one that had.
//   • A TIE. Resolved by write order, which on a course is the order the
//     groups got signal in — not the order they played the hole.
//
// So nobody writes the answer. Each group writes ITS OWN claim, under its own
// group key, and the answer is derived by reading them all. Firestore merges
// a map field key by key, so two groups writing at the same moment write to
// two different keys and neither can erase the other. There is no transaction
// and no read-before-write, which matters more here than the elegance does:
// this is a phone in a hollow with one bar, and a transaction would FAIL
// offline where a merge quietly queues.
//
// A claim is what one group said when it was asked:
//
//   { kind: "tag",     playerId, distanceFt, order, by, byName, at }
//   { kind: "confirm", order, by, byName, at }   the standing tag is right
//   { kind: "pass",    order, by, byName, at }   none of us was close
//
// `order` is the claiming group's tee order, carried on the claim rather than
// looked up later, because the draw can be edited after the round is played
// and the pin belongs to the order it was actually played in.
//
// ── What this buys beyond the races ──
// A PASS IS NOW WRITTEN DOWN. It used to be the one answer that recorded
// nothing, so a hole every group played and nobody got close to was
// indistinguishable from a hole the prompt never reached. Both showed "no
// winner yet".

// The kinds of answer a group can give. Anything else in a stored claim is
// ignored rather than guessed at.
const KINDS = new Set(["tag", "confirm", "pass", "override"]);

// A stored claims map, normalised. Rubbish keys and rubbish values are
// dropped: this is read straight off Firestore, and a half-written document
// must not take a screen down.
export function readClaims(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  Object.keys(src).forEach(key => {
    const c = src[key];
    if (!c || typeof c !== "object") return;
    if (!KINDS.has(c.kind)) return;
    out[key] = {
      kind: c.kind,
      playerId: c.player_id || c.playerId || null,
      distanceFt: Number.isFinite(c.distance_ft) ? c.distance_ft
        : Number.isFinite(c.distanceFt) ? c.distanceFt : null,
      order: Number.isInteger(c.order) ? c.order : null,
      by: c.by || null,
      byName: c.by_name || c.byName || "",
      at: c.at || "",
    };
  });
  return out;
}

// The key a director's override is filed under. It is not a group — it is the
// one answer that is not a group's — and it beats every claim under it, which
// is the whole point of a correction.
export const OVERRIDE_KEY = "director";

// ── Which claim holds the pin ──────────────────────────────────────
// Closest ball wins. A tie goes to the group that PLAYED IT FIRST, which is
// the lower tee order — not the lower clock, which is what write order was
// standing in for and is exactly backwards for a group that walked off to
// make its tee time. A claim with no tee order cannot win a tie, for the same
// reason tagAheadOfPlay stays quiet on an unknown order: guessing which of
// two groups played first is how the wrong man gets paid.
//
// The last tiebreak is the group key, alphabetically. It settles nothing real
// — two groups, same distance, neither in the draw — but it has to be STABLE,
// because four phones deriving the winner independently have to derive the
// same one.
export function winningClaim(claims) {
  const cs = claims || {};
  if (cs[OVERRIDE_KEY]?.playerId) return { key: OVERRIDE_KEY, ...cs[OVERRIDE_KEY] };
  const tags = Object.keys(cs)
    .filter(k => k !== OVERRIDE_KEY && cs[k].kind === "tag" && cs[k].playerId)
    .map(k => ({ key: k, ...cs[k] }));
  if (tags.length === 0) return null;
  tags.sort((a, b) => {
    // A tag with no distance is a claim nobody measured; it loses to any
    // measured one rather than sorting as zero feet.
    const af = a.distanceFt == null ? Infinity : a.distanceFt;
    const bf = b.distanceFt == null ? Infinity : b.distanceFt;
    if (af !== bf) return af - bf;
    const ao = a.order == null ? Infinity : a.order;
    const bo = b.order == null ? Infinity : b.order;
    if (ao !== bo) return ao - bo;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return tags[0];
}

// Every group that has answered the prompt for this pin, whatever it said.
// The director's override is not a group and is not counted: it says a pin was
// corrected, not that a group was asked.
export const answeredGroups = (claims) =>
  Object.keys(claims || {}).filter(k => k !== OVERRIDE_KEY);

// ── The pin, as the app reads it ───────────────────────────────────
// Claims are the truth where they exist. `legacy` is the flat winner the
// document used to carry — a pin tagged before this existed, and any pin a
// year's import brought in — and it stands in unchanged when there are no
// claims, so an old edition still shows its pins.
export function resolvePin({ claims, legacy } = {}) {
  const cs = readClaims(claims);
  const answered = answeredGroups(cs);
  const win = winningClaim(cs);
  // Who has walked off this green, seen the standing tag and let it stand.
  // Legacy ids first so a document part-written under the old shape and part
  // under the new reads as one list.
  const confirmedBy = [...new Set([
    ...(Array.isArray(legacy?.confirmedBy) ? legacy.confirmedBy : []),
    ...Object.keys(cs).filter(k => cs[k].kind === "confirm").map(k => cs[k].by).filter(Boolean),
  ])];

  if (!win) {
    // No tag — but the groups that passed still answered, and that is the
    // difference between "nobody has been asked" and "the field played it and
    // nobody was close".
    if (answered.length > 0 || !legacy?.playerId) {
      return { playerId: null, distanceFt: null, distance: "", taggedByName: "",
               taggedGroupKey: null, taggedGroupOrder: null, confirmedBy, answeredGroups: answered, claims: cs };
    }
    return { ...legacy, confirmedBy, answeredGroups: answered, claims: cs };
  }

  return {
    playerId: win.playerId,
    distanceFt: win.distanceFt,
    distance: win.distanceFt ? `${win.distanceFt} ft` : "",
    taggedByName: win.byName || "",
    // An override is not a group, so it carries no order — and lib's rule is
    // that an unknown order says nothing rather than guessing.
    taggedGroupKey: win.key === OVERRIDE_KEY ? null : win.key,
    taggedGroupOrder: win.key === OVERRIDE_KEY ? null : win.order,
    confirmedBy,
    answeredGroups: answered,
    claims: cs,
  };
}

// ── Can this group take the pin? ───────────────────────────────────
// Strictly closer always wins. A TIE is claimable only by a group that played
// the hole FIRST, which is the same rule winningClaim settles it by — the two
// have to agree, or the prompt offers a tag the board then refuses to honour.
//
// Undecided is not "beats it": until a distance is chosen there is nothing to
// compare, so the question simply has not been answered.
export function canTakePin({ leaderFt, leaderOrder, myFt, myOrder }) {
  if (myFt == null) return false;
  if (leaderFt == null) return true;
  if (myFt < leaderFt) return true;
  if (myFt > leaderFt) return false;
  // Tied. Only an order we are sure of can break it.
  if (myOrder == null || leaderOrder == null) return false;
  return myOrder < leaderOrder;
}

// ══════════════════════════════════════════════════════════════════
//  The carry: a pin nobody hit rolls onto the next one.
// ══════════════════════════════════════════════════════════════════
//
// A par 3 where nobody in the field found the green pays nobody, and its share
// of the pot used to simply sit there — the Betting tab counted it as money
// going to no one, and a director worked out on Sunday what to do with it.
//
// It carries now, the way a pushed skin does. The unclaimed share moves to the
// NEXT par 3 in the event, which is then worth double; two dry pins in a row
// make the third worth triple, and so on. The sequence runs hole order within
// a round and round order across the week — one chain for the whole event,
// because the pot is already counted that way (see lib/sideGames on why CTP
// divides by the par 3s that EXIST rather than the ones taken).
//
// ── The accounting, which is the point ──
// Every par 3 puts exactly one share into the chain. A pin that is won takes
// its own share plus everything carried into it; a pin that is not passes its
// share along untouched. So the shares paid out plus the shares still carrying
// always equal the number of par 3s, and once the last pin is decided the
// whole pot has an owner. That is what closes the gap the tab used to report
// as "$35.00 unclaimed".
//
// ── Three things count as nobody winning it ──
//   • every group answered the prompt and none of them claimed it
//   • the round finished with the pin untagged, whether or not everybody was
//     asked — a round that is over has no more shots to hit
//   • it was tagged to somebody who never bought into the CTP game. He hit it
//     closest and the pin is his, but it pays nobody, and the share has to go
//     somewhere rather than evaporate.
//
// ── A pin that is still out blocks the chain, and says so ──
// Until a hole is decided nobody can know whether it takes the carry or passes
// it on, so the pins after it cannot be priced. Rather than guess, the chain
// stops at the first undecided pin: that one is shown as what it is worth if
// somebody takes it, and everything after it reports the share it is certainly
// worth and nothing more. Groups play in order, so in practice the undecided
// pins are the ones at the end of the week.

// `pins` is every par 3 in the event, IN PLAY ORDER, each as:
//   { round, hole, playerId, inGame, answered, groupCount, roundFinal }
//
// Returns the same list, in the same order, each pin carrying:
//   won        somebody in the game holds it
//   decided    the hole has had its answer, one way or the other
//   shares     what it pays, in shares of the base per-pin value
//   carriedIn  how many of those shares arrived from earlier dry pins
//   carriesTo  { round, hole } this pin's share went to, when it was dry
//   pending    the chain stops here; `shares` is what it would pay if taken
//   atLeast    priced behind an undecided pin, so `shares` is a floor
//
// and alongside them: `leftover` shares nobody won, `settled` when the chain
// ran to the end, and `bonusPerPin` — the final carry split evenly over the
// pins that were won, which is where a dry LAST par 3 sends its money.
export function ctpLedger(rawPins) {
  let carry = 0;
  let blocked = false;

  const pins = (rawPins || []).map(p => {
    const won = !!p.playerId && p.inGame !== false;
    const answeredAll = (p.groupCount || 0) > 0 && (p.answered || 0) >= p.groupCount;
    const decided = !!p.playerId || !!p.roundFinal || answeredAll;
    const base = { ...p, won, decided, carriedIn: 0, shares: 0 };

    if (blocked) return { ...base, shares: won ? 1 : 0, atLeast: true };
    if (!decided) { blocked = true; return { ...base, shares: 1 + carry, carriedIn: carry, pending: true }; }
    if (won) { const c = carry; carry = 0; return { ...base, shares: 1 + c, carriedIn: c }; }
    carry += 1;
    return { ...base, carriedOut: true };
  });

  // Where a dry pin's share actually went: the next pin that took one. Walked
  // backwards because that is the only direction the answer is known in.
  let next = null;
  for (let i = pins.length - 1; i >= 0; i--) {
    if (pins[i].carriedOut) pins[i].carriesTo = next;
    if (pins[i].shares > 0 && !pins[i].atLeast) next = { round: pins[i].round, hole: pins[i].hole };
  }

  // The last par 3 of the event going dry has nowhere to carry to, so the
  // shares still in hand are split evenly over the pins that were won — the
  // whole pot pays out rather than ending the week owned by nobody. Only once
  // the chain has actually run to the end: a carry mid-tournament is still
  // travelling, not left over.
  const settled = !blocked;
  const wonPins = pins.filter(p => p.won && p.shares > 0);
  const leftover = settled ? carry : 0;
  const bonusPerPin = settled && leftover > 0 && wonPins.length > 0 ? leftover / wonPins.length : 0;
  pins.forEach(p => { p.totalShares = p.shares + (p.won && p.shares > 0 ? bonusPerPin : 0); });

  return { pins, leftover, bonusPerPin, settled };
}

// What one pin is worth, said the way the board says it: "2×", "3×", or
// nothing at all for a single share. A pin carrying a split of the final
// leftover is not a round multiple and is not labelled one — its money shows
// as money.
export const carryLabel = (shares) => (shares > 1 ? `${shares}×` : null);
