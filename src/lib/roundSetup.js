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
//
// And tee ASSIGNMENTS, for the reason that costs the most. Course handicap is
// computed as `calcCH(hi, tee?.slope || course.slope, …)` — so a player with no
// tee row for a round does not fail, they silently fall through to the COURSE's
// own rating and slope. That number is not a tee anybody plays: it is whatever
// the import wrote, and for a course brought in by the old golfcourseapi
// importer that is `allTees[0]`, the LONGEST tee on the property — those rows
// are still in the library even though the API is gone. On The Loon that is 72.8/139
// where the field played BLUE at 70.5/134 — about two strokes of course
// handicap, applied to one man, invisibly, on a card everybody else's is
// correct on. There should never be a missing assignment, which is exactly why
// the console has to say so rather than quietly picking something.

// A group is a foursome. Five is not a group, it is two groups that did not
// get drawn.
export const GROUP_MAX = 4;

// ── Why the round's P is red ───────────────────────────────────────
// The badge had three ways to be red and said the same thing for all of them,
// which cost a director an evening: a draw that looked complete on screen —
// every player in a group, every group with a time — stayed red because a
// player was seated TWICE, so the seat count exceeded the roster. Nothing on
// the screen could have told them that, and counting thirteen names across
// four groups by eye is exactly the check a person does not do.
//
// Returns null when the round is ready, else a sentence naming the one thing
// to fix. Ordered by what blocks what: no course means the round has no holes
// to draw against, so it is named before anything about groups.
export function pairingsTrouble({ hasCourse, groups = [], teeTimes = [], rosterCount = 0 } = {}) {
  if (!hasCourse) return "No course set for this round";

  const seated = groups.flat().filter(Boolean);
  const dupes = [...new Set(seated.filter((pid, i) => seated.indexOf(pid) !== i))];
  // Named first among the group problems: it is the only one that looks
  // finished. Every other shortfall shows as an obviously empty seat.
  if (dupes.length) {
    return dupes.length === 1
      ? "One player is in two groups"
      : `${dupes.length} players are in two groups`;
  }

  if (!groups.length || seated.length === 0) return "No pairings set yet";
  if (seated.length < rosterCount) return `${seated.length} of ${rosterCount} players drawn`;
  // Seats outnumber the roster with nobody doubled up: somebody in a group is
  // no longer on it.
  if (seated.length > rosterCount) return "A player in a group is not on the roster";

  const noTime = groups
    .map((g, gi) => ((g || []).length && !(teeTimes[gi] || "").trim() ? gi + 1 : null))
    .filter(Boolean);
  if (noTime.length) {
    return noTime.length === 1
      ? `Group ${noTime[0]} has no tee time`
      : `${noTime.length} groups have no tee time`;
  }
  return null;
}

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

// ── missingTees ────────────────────────────────────────────────────
// Which players have no tee assigned for a round.
//
//   players     — the round's field, [{ id, name }]. Withdrawn players are the
//                 caller's business to exclude; a WD posts no card and needs no
//                 tee.
//   assignments — { playerId: teeName } as stored for that round.
//   teeNames    — the course's tee box names. When it is non-empty, an
//                 assignment naming a tee the course does not have counts as
//                 missing: the lookup that resolves it returns undefined and
//                 falls through to the course exactly as a blank would, so the
//                 two failures are the same failure and get one answer.
//
// Returns the ids, in the order `players` was given, so the console lists names
// the way the roster reads rather than the way an object happened to enumerate.
export function missingTees({ players = [], assignments = {}, teeNames = [] } = {}) {
  const known = new Set(teeNames || []);
  return (players || [])
    .filter(p => {
      const tee = (assignments || {})[p.id];
      if (!tee || !String(tee).trim()) return true;
      return known.size > 0 && !known.has(tee);
    })
    .map(p => p.id);
}

// The whole round's draw. `index` on every entry is the index in the draw as
// stored, NOT a position among the non-empty groups — the tee times array is
// aligned to the stored draw, and re-indexing here is how a missing tee time
// gets reported against the wrong group.
export function roundTrouble({ groups = [], teeTimes = [], rosterIds = [], players = [], teeAssignments = {}, teeNames = [] } = {}) {
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
  return {
    hasDraw: drawn.length > 0,
    groupCount: drawn.length,
    broken,
    missingTeeTimes,
    missingTees: missingTees({ players, assignments: teeAssignments, teeNames }),
  };
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

// ── missingTeeNames ────────────────────────────────────────────────
// Who they are — a plain list, because the banner above it already says how
// many and what is wrong with them. This used to be a sentence that repeated
// the count, restated the fault and then told the director to fix it before
// the round started; all three were already on screen, and the one thing only
// this line can say — the names — was buried in the middle of them.
//
// It still says nothing about what the app would do INSTEAD of an assigned
// tee, which is the point the old sentence was careful about and this keeps by
// having no room for it. There is no default tee and no acceptable answer
// other than assigning one, so describing the fallback would be offering it.
export function missingTeeNames(pids = [], nameOf = (pid) => pid) {
  return (pids || []).map(nameOf).join(", ");
}

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
