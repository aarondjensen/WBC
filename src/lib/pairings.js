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
