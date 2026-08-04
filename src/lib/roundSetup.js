// ══════════════════════════════════════════════════════════════════
//  roundSetup — is this round's draw fit to score against?
// ══════════════════════════════════════════════════════════════════
//
// The scoring screen takes the group it is handed and puts a score row up for
// every player in it. That is right when the group is a foursome out of the
// round's draw, and it is silently WRONG when the draw is not what it should
// be — a group carrying the whole field, the same player in two groups, a
// player who is no longer on the roster. Nothing downstream notices: the rows
// render, the scores save, and the first sign that anything is off is a
// scorecard with twelve names on it.
//
// So the shape of the draw gets checked before it is scored, and a draw that
// cannot be right stops the screen with something a director can act on
// instead of quietly producing a wrong card. The checks are cheap and pure;
// this file has no idea Firestore exists.
//
// Tee times are in here too, for a different reason. They live on the pairing
// rows, and they are what the scoring gate opens on — a round with no tee
// times keeps every non-director locked out with "Scoring Not Open Yet",
// which reads as the app being broken rather than as a setting nobody filled
// in. Reporting them as a setup problem is what lets the screen say so.

// A group is a foursome. Five is not a group, it is two groups that did not
// get drawn.
export const GROUP_MAX = 4;

// What is wrong with ONE group's roster — the first problem found, or null.
// Ordered worst-first: a group holding the whole field is a different kind of
// broken from one sharing a player with the next group, and the message the
// director gets should name the biggest thing.
//
//   rosterIds    — every player id the app knows about. Empty skips the check
//                  rather than reporting the entire group as strangers, since
//                  an empty roster means the roster has not loaded.
//   otherGroups  — the round's other groups, for the "in two groups" check.
export function groupTrouble(ids, { rosterIds = [], otherGroups = [] } = {}) {
  const list = (ids || []).filter(Boolean);
  if (list.length === 0) return { code: "empty", pids: [] };
  if (list.length > GROUP_MAX) return { code: "oversized", pids: list };
  const dupes = [...new Set(list.filter((pid, i) => list.indexOf(pid) !== i))];
  if (dupes.length) return { code: "duplicate", pids: dupes };
  const roster = new Set(rosterIds || []);
  if (roster.size) {
    const strangers = list.filter(pid => !roster.has(pid));
    if (strangers.length) return { code: "unknown", pids: strangers };
  }
  const shared = list.filter(pid => (otherGroups || []).some(g => (g || []).includes(pid)));
  if (shared.length) return { code: "shared", pids: [...new Set(shared)] };
  return null;
}

// The whole round's draw. `index` on every entry is the index in the draw as
// stored, NOT a position among the non-empty groups — the tee times array is
// aligned to the stored draw, and re-indexing here is how a missing tee time
// gets reported against the wrong group.
export function roundTrouble({ groups = [], teeTimes = [], rosterIds = [] } = {}) {
  const all = (groups || []).map(g => (g || []).filter(Boolean));
  const drawn = all.map((ids, index) => ({ ids, index })).filter(g => g.ids.length > 0);
  const broken = drawn
    .map(({ ids, index }) => ({
      index,
      ids,
      trouble: groupTrouble(ids, { rosterIds, otherGroups: drawn.filter(g => g.index !== index).map(g => g.ids) }),
    }))
    .filter(g => g.trouble);
  const missingTeeTimes = drawn
    .filter(({ index }) => !String((teeTimes || [])[index] || "").trim())
    .map(({ index }) => index);
  return { hasDraw: drawn.length > 0, groupCount: drawn.length, broken, missingTeeTimes };
}

// Which faults are bad enough to STOP a group scoring, and which are only
// worth saying out loud.
//
// A card with five players on it, or with the same player on it twice, is not
// a card — every row on it is being posted against a group that does not
// exist, so scoring stops.
//
// The other two are stale draws rather than broken ones. A player who has left
// the roster simply does not render a row (the screen filters them), and a
// player drawn in two groups still has ONE set of scores — hole data is keyed
// by player and round, not by group, so the second card is a duplicate view,
// not a second scorecard. Neither is worth stranding a foursome standing on a
// tee box over; both are worth telling the director about.
export const BLOCKING_CODES = ["empty", "oversized", "duplicate"];
export const blocksScoring = (trouble) => !!trouble && BLOCKING_CODES.includes(trouble.code);

// One sentence a director can act on. `nameOf` turns a player id into a name;
// the default leaves the id, which is still better than nothing on a screen
// whose whole job is to say what is wrong.
export function describeTrouble(trouble, nameOf = (pid) => pid) {
  if (!trouble) return "";
  const names = (trouble.pids || []).map(nameOf);
  const list = names.length > 2
    ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
    : names.join(" and ");
  switch (trouble.code) {
    case "oversized":
      return `This group has ${trouble.pids.length} players in it. A group is a foursome — at most ${GROUP_MAX}.`;
    case "duplicate":
      return `${list} ${names.length === 1 ? "is" : "are"} listed twice in this group.`;
    case "unknown":
      return `${names.length} player${names.length === 1 ? "" : "s"} in this group ${names.length === 1 ? "is" : "are"} not on the tournament roster.`;
    case "shared":
      return `${list} ${names.length === 1 ? "is" : "are"} also drawn in another group this round.`;
    case "empty":
      return "This group has nobody in it.";
    default:
      return "This group's draw is not right.";
  }
}
