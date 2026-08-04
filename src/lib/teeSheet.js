// ══════════════════════════════════════════════════════════════════
//  teeSheet — turning pairing rows into a round's tee times, and
//  keeping the ones already on screen.
// ══════════════════════════════════════════════════════════════════
//
// A tee time is stored on the pairing rows themselves: every player in group 2
// carries the same `tee_time`. That makes a group with no rows — one being
// rebuilt by a re-group, or one momentarily emptied of players — a group the
// server cannot report a time for.
//
// The bug this exists to prevent: the pairings listener rebuilt teeTimesData
// from the server on every snapshot, so any write that left the collection
// part-way through the change published a tee sheet with holes in it. Moving
// one golfer between groups blanked the whole round's times and then refilled
// them a group at a time as the writes landed.
//
// Two rules fix it. Writes commit as ONE batch (see db.replaceMany), so there
// is no part-way state to publish. And a group the server is silent about
// keeps the time already known for it — silence is not the same as blank.

// Rows → { [round]: [timeForGroup1, timeForGroup2, ...] }.
// Slots with no rows are `undefined` — UNKNOWN, distinct from "", which is a
// director having cleared the time. Every consumer treats both as empty.
export const rowsToTeeTimes = (rows) => {
  const tt = {};
  (rows || []).forEach(r => {
    if (!r || r.round_number == null || r.group_number == null) return;
    // Groups are 1-based. Check before creating the round's slot, or a
    // malformed row conjures a round with no groups in it.
    const gi = r.group_number - 1;
    if (gi < 0) return;
    if (!tt[r.round_number]) tt[r.round_number] = [];
    while (tt[r.round_number].length <= gi) tt[r.round_number].push(undefined);
    tt[r.round_number][gi] = r.tee_time || "";
  });
  return tt;
};

// Server truth wins for every group it has a row for; anything it is silent
// about keeps the time already on screen. A tee time, once set, moves when the
// director moves it and at no other moment.
export const mergeTeeTimes = (prev, next) => {
  const out = { ...(next || {}) };
  Object.entries(prev || {}).forEach(([rnd, times]) => {
    const incoming = out[rnd];
    // A round the server said nothing about at all — keep it whole.
    if (!incoming) { out[rnd] = times; return; }
    const merged = incoming.map((t, gi) => (t === undefined ? times[gi] : t));
    // Groups the previous sheet knew about that this snapshot does not reach.
    for (let gi = merged.length; gi < times.length; gi++) merged[gi] = times[gi];
    out[rnd] = merged;
  });
  return out;
};
