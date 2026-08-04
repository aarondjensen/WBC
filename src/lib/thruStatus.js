// ══════════════════════════════════════════════════════════════════
//  thruStatus — what the leaderboard's Thru column says about a player
// ══════════════════════════════════════════════════════════════════
//
// The column answers "how far in is this player", and the honest answer
// changes with the round. While a round is being played, the tournament total
// is the wrong number: a player on the 5th hole of round 3 is on the 5th hole,
// not "thru 41", and the board is being read to see who is where TODAY. Once
// the director finalizes the round, today is over and the total is the number
// that matters again.
//
// So the column has three states, and the round decides which:
//
//   in play, started      → holes into THIS round (1–18)
//   in play, not started  → the group's tee time, because "—" reads as a
//                           player with nothing posted rather than one who
//                           has not gone out yet
//   not in play           → holes played across the whole tournament
//
// "In play" runs from the first score anyone posts until the director
// finalizes — deliberately including the stretch where every group is in at 18
// and the cards are being checked. A group that just walked off 18 should read
// "18", not jump to "54" while the round is still open.

// A tee time is free text the director typed into the pairings editor, and the
// column it has to fit in is ~40px. "8:40 AM" does not fit at any size the
// rest of the row uses, so the meridiem collapses to a single letter the way a
// paper tee sheet writes it. Anything that isn't recognisably a time is passed
// through untouched — a director who typed "Shotgun" meant it, and truncating
// it to fit would be worse than letting it be too long.
export function teeTimeLabel(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([ap])\.?m?\.?$/i);
  if (!m) return s;
  return `${m[1]}:${m[2]}${m[3].toLowerCase()}`;
}

// Flatten pairings + tee times into { playerId: teeTime } for one round.
// `groups` is the round's array of player-id arrays, `times` the array of tee
// times indexed the same way, both straight off pairingsData/teeTimesData.
export function teeTimesByPlayer(groups = [], times = []) {
  const map = {};
  (groups || []).forEach((grp, gi) => {
    (grp || []).forEach(pid => { map[pid] = times?.[gi] || ""; });
  });
  return map;
}

// Is this round being played right now? Someone has posted a score in it and
// the director has not finalized it. `rows` is the leaderboard array.
export function roundInPlay(rows = [], round, finalized = false) {
  if (finalized) return false;
  return (rows || []).some(p => (p?.rds?.[round - 1]?.thru || 0) > 0);
}

// The cell itself. `kind` is what the caller styles on: a tee time is a
// smaller, quieter thing than a hole count, and "none" is the em dash.
//   { kind: "thru" | "tee" | "total" | "none", text }
export function thruStatus({ inPlay = false, roundThru = 0, totalThru = 0, teeTime = "", isWD = false } = {}) {
  const none = { kind: "none", text: "—" };
  if (isWD) return none;
  if (inPlay) {
    if (roundThru > 0) return { kind: "thru", text: String(roundThru) };
    const tee = teeTimeLabel(teeTime);
    return tee ? { kind: "tee", text: tee } : none;
  }
  return totalThru > 0 ? { kind: "total", text: String(totalThru) } : none;
}
