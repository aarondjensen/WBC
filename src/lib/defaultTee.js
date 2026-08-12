// ══════════════════════════════════════════════════════════════════
//  defaultTee — which tee a player is put on before anyone says.
// ══════════════════════════════════════════════════════════════════
//
// A course arrives with anything from two tee sets to seven, and until a
// director assigns them every player needs one anyway: course handicap is
// computed off the tee's slope and rating, so a player with no tee has no
// number and no net score. The answer cannot be "the first one in the list"
// — that ordering comes from whoever imported the course, and it is as
// likely to be the tips as the members' tees.
//
// So it is the set closest to what this field actually plays: slope 127 and
// 6,300 yards, weighted so a big yardage difference counts for less than a
// big slope difference (fifty yards is worth one slope point here). That
// lands on the white/blue middle tee at nearly every course in the history.
//
// Lives here rather than in App.jsx because both the app shell and the admin
// console need it, and they are separate chunks now — see components/AdminView.
export const getDefaultTee = (tees) => {
  if (!tees || tees.length === 0) return null;
  let best = tees[0], bestScore = Infinity;
  tees.forEach(t => {
    const slopeDiff = Math.abs((t.slope || 113) - 127);
    const yardDiff = Math.abs((t.yardage || 6300) - 6300) / 50;
    const score = slopeDiff + yardDiff;
    if (score < bestScore) { bestScore = score; best = t; }
  });
  return best;
};
