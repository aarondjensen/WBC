// ─────────────────────────────────────────────────────────────────────────
//  pairings.js — pure group transforms for the director's pairings editor
// ─────────────────────────────────────────────────────────────────────────
// The editor holds the round's groups as local state and persists every
// change. Keeping the transforms pure and out here means the editor's handlers
// are one line each, and the part that is easy to get wrong — who ends up in
// which group after a swap — is testable without a DOM.
//
// Every function returns a new outer array of new inner arrays. Nothing here
// mutates its input, so a returned value can go straight into setState and the
// props these are derived from are never written through.

// `pairings` documents — one per player, per round — folded into the shape the
// whole app reads them in: { [round]: [ [playerId, …], … ] }, groups in
// group_number order.
//
// Lifted out of App.jsx because a SECOND caller needed it: the Tournaments
// picker has to know whether a past year's rounds were all signed off before
// it will let a director delete it, and that answer is "every group in every
// round", which needs the draw. Rows are sorted here rather than at the call
// site so a caller cannot get the group order wrong by forgetting to.
// ── NOBODY IS IN TWO GROUPS ────────────────────────────────────────
// A player belongs to exactly one group in a round. That is not a preference,
// it is what every screen downstream assumes: the scoring card renders a row
// per player in the group, the setup check counts seats against the roster,
// and the tee sheet hands one time to one foursome. A player in two groups
// makes the seat count exceed the roster, which is what silently holds the
// round's setup badge red with nothing on screen saying why.
//
// It is enforced in BOTH directions because it was broken in both:
//
//   ON THE WAY IN, because rows already in Firestore may be wrong. A pairing's
//   document id carries its group number (pr_demo_r1_g2_aaron_j), so MOVING a
//   player writes a new document and leaves the old one to be deleted
//   separately — and if that delete does not happen, the fold used to place
//   them in both groups. Which is exactly what happens when the read that
//   works out what to delete fails: see setPairings in App.jsx, where a failed
//   read used to read as "nothing stored".
//
//   ON THE WAY OUT, so the editor cannot create the state in the first place
//   whatever it hands over.
//
// FIRST SEATING WINS, and the caller sorts before folding, so "first" is the
// lowest group number and then the lowest player id — deterministic, and the
// same answer on every phone rather than whichever row Firestore returned
// first. A dropped duplicate is a row that should not exist; keeping the
// earlier group is the arbitrary half of an answer that is only ever cleaning
// up after a fault.
export const dedupeGroups = (groups) => {
  const seen = new Set();
  return (groups || []).map(g => (g || []).filter(pid => {
    if (!pid || seen.has(pid)) return false;
    seen.add(pid);
    return true;
  }));
};

// Which players are seated more than once, for a caller that wants to SAY so
// rather than quietly clean up. Empty when the draw is sound.
export const duplicateSeats = (groups) => {
  const seen = new Set();
  const twice = new Set();
  for (const g of groups || []) {
    for (const pid of g || []) {
      if (!pid) continue;
      if (seen.has(pid)) twice.add(pid);
      seen.add(pid);
    }
  }
  return [...twice];
};

export const rowsToPairings = (rows) => {
  const pd = {};
  [...(rows || [])]
    .sort((a, b) => (a.round_number - b.round_number)
      || (a.group_number - b.group_number)
      || String(a.player_id || "").localeCompare(String(b.player_id || "")))
    .forEach(r => {
      const rnd = r?.round_number;
      const gi = (r?.group_number || 0) - 1;
      if (rnd == null || gi < 0 || !r.player_id) return;
      if (!pd[rnd]) pd[rnd] = [];
      while (pd[rnd].length <= gi) pd[rnd].push([]);
      pd[rnd][gi].push(r.player_id);
    });
  // Per ROUND, not across the whole map: a player is in one group in round 1
  // and a different one in round 2, which is the entire point of a draw.
  for (const rnd of Object.keys(pd)) pd[rnd] = dedupeGroups(pd[rnd]);
  return pd;
};

// The saved pairings for a round, padded out to however many groups the
// current roster needs. A round with nothing saved yields all-empty groups.
export const groupsForRound = (pairingsData, rnd, numGroups) => {
  const existing = (pairingsData || {})[rnd];
  const padded = existing && existing.length > 0 ? existing.map(g => [...g]) : [];
  while (padded.length < numGroups) padded.push([]);
  return padded;
};

// Move a player into group `gi`, pulling them out of whatever group they were
// in. The caller is responsible for the "group is full" check — a full group is
// a no-op at the tap, not a silently dropped player here.
export const assignToGroup = (groups, gi, pid) => {
  const next = groups.map(g => g.filter(id => id !== pid));
  next[gi] = [...next[gi], pid];
  return next;
};

// Drop a single player out of one group.
export const removeFromGroup = (groups, gi, pid) =>
  groups.map((g, i) => i === gi ? g.filter(id => id !== pid) : g);

// Empty one group entirely.
export const clearGroup = (groups, gi) =>
  groups.map((g, i) => i === gi ? [] : g);

// Swap: the tapped player leaves group `gi`, the selected player takes their
// place. `selectedPid` is pulled out of whatever group it was in first, and is
// only seated if the group has room once the tapped player has left — so a
// swap into a full group still works, but a fifth player never appears.
export const swapIntoGroup = (groups, gi, tappedPid, selectedPid) => {
  const next = groups
    .map((g, i) => i === gi ? g.filter(id => id !== tappedPid) : g)
    .map(g => g.filter(id => id !== selectedPid));
  if (next[gi].length < 4) next[gi] = [...next[gi], selectedPid];
  return next;
};
