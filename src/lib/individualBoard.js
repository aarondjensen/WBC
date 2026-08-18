// ══════════════════════════════════════════════════════════════════
//  individualBoard — the canonical net stroke-play board for the WBC.
// ══════════════════════════════════════════════════════════════════
//
// Why this file exists
// ────────────────────
// The WBC is a four-round individual net stroke-play tournament — structurally
// the same event as the MNQ league's postseason Individual Tournament, and this
// module is the WBC port of MNQ's lib/indivGroups.js board half. The reason
// MNQ extracted that math out of its view is the reason it is extracted here:
//
//   the leaderboard the players read and the order the PAIRINGS are drawn from
//   are the same number, and they must be computed by the same code.
//
// WBC's `leaderboard` pairing mode (see PAIRING_MODES in App.jsx) groups the
// field by current standing. Before this module, that order came from a
// leaderboard built inline in a component `useMemo`, so any future second
// caller — a stats view, a printed tee sheet, a notification — would have had
// to re-derive "net to par over holes actually played", and the two copies
// would drift. That drift is exactly the bug class MNQ's header warns about.
//
// Everything here is pure: no React, no Firestore, no imports from the app.
// That is what makes it unit-testable (individualBoard.test.js) and what lets
// the leaderboard, the pairing resolver and the finalize preview all share it.
//
// How WBC differs from MNQ's port
// ───────────────────────────────
// The shape of the API is deliberately identical — computeRoundLine →
// computeIndividualBoard → rankIndividualBoard — but three things differ
// because the two events are scored differently, and the differences are
// contained entirely in this file:
//
//   • 18 holes per round, not 9. MNQ plays a front/back nine per week; WBC
//     plays a full course per round, so there is no `side` on a round.
//   • A LOCKED handicap index, not a retroactive one. MNQ recomputes each
//     player's index from the rounds strictly before that week. The WBC index
//     is fixed for the tournament by design (see the handicap-edit guard in
//     AdminView), so the course handicap is a pure function of the player's
//     index and the tee they played — no history lookup, no `allRounds`.
//   • Withdrawal is a per-hole SENTINEL (99), not a flag. WBC fills a
//     withdrawing player's remaining holes with 99 so the scorecard stays
//     structurally complete; those holes are excluded from every total.

// Course handicap from a handicap index and a set of tee ratings.
// Kept here rather than imported so this module has no app dependencies —
// App.jsx re-exports its own `calcCH` from this one, so there is still a
// single implementation.
export const calcCH = (hi, slope, rating, par) =>
  (!hi && hi !== 0) ? 0 : Math.round((hi * (slope / 113)) + (rating - par));

// The WD sentinel written into unplayed holes when a player withdraws.
export const WD_SCORE = 99;

// ── courseHandicapFor ──────────────────────────────────────────────
// The one answer to "how many strokes does this player get in this round",
// including the precedence between the two ways of knowing it.
//
// A RECORDED handicap wins over a derived one. Only an imported year carries
// one — the early WBCs set a handicap once and played it on every course, so
// there is no index that reproduces the record (see lib/historyImport) — and
// the running tournament falls straight through to calcCH.
//
// Guarded on Number.isFinite rather than truthiness: a scratch player's
// recorded 0 is a real answer, and `recorded || calcCH(…)` would throw it away
// and quietly re-derive, which is the one case where the two disagree most.
//
// `tee` may be null. A round whose tee sheet is not filled in yet falls back
// to the course's own ratings, which is what makes a board renderable before
// the director has finished assigning tees.
//
// This exists because the rule above was written out longhand in four places —
// the leaderboard, net skins, the low net ledger and the on-course scorecard —
// and two of them had quietly dropped the recorded half, so an imported year
// paid its low net off a handicap the leaderboard beside it disagreed with.
export function courseHandicapFor({ handicapIndex, course, tee = null, recorded = null }) {
  if (Number.isFinite(recorded)) return recorded;
  if (!course) return 0;
  return calcCH(
    handicapIndex,
    tee?.slope || course.slope,
    tee?.rating || course.rating,
    tee?.par || course.par,
  );
}

// ── buildStrokesMap ────────────────────────────────────────────────
// Distribute `ch` handicap strokes across 18 holes in hole-handicap order
// (stroke index 1 = hardest hole gets the first stroke). Returns a map of
// hole index → stroke count.
//
// Plus handicaps (ch < 0) give strokes BACK: the magnitude is allocated the
// same way and the caller subtracts rather than adds, which is why this takes
// the absolute value and leaves the sign to computeRoundLine. Allocating by
// magnitude means a +3 gives strokes back on the three hardest holes, which is
// the convention — a plus player strokes back where the course is hardest.
//
// Three passes, so a course handicap above 36 still lands (nobody in this
// field is there, but a 54-cap is a legal index and silently dropping their
// strokes would be worse than the loop costing nothing).
export function buildStrokesMap(ch, holeHcps = []) {
  const order = holeHcps.length
    ? holeHcps.map((h, i) => ({ idx: i, hcp: h })).sort((a, b) => a.hcp - b.hcp)
    : Array.from({ length: 18 }, (_, i) => ({ idx: i, hcp: i + 1 }));

  const map = {};
  let rem = Math.abs(ch);
  for (let pass = 0; pass < 3 && rem > 0; pass++) {
    for (const h of order) {
      if (rem <= 0) break;
      map[h.idx] = (map[h.idx] || 0) + 1;
      rem--;
    }
  }
  return map;
}

// ── computeRoundLine ───────────────────────────────────────────────
// Net / gross to par for ONE player's ONE round.
//
// Partial rounds are scored against the par of the holes ACTUALLY PLAYED, and
// only the strokes that fall on those holes, so a card thru 5 reads as a real
// +2 rather than a fictional -13. This is the single rule the leaderboard, the
// live group card and the finalize preview all need, and the reason it lives
// in its own function rather than inline in the board loop.
//
//   scores    — { holeIdx: strokes } for this player+round. Holes carrying the
//               WD sentinel are ignored entirely.
//   holePars  — 18 pars for the course played
//   holeHcps  — 18 hole handicap (stroke index) values for that course
//   ch        — the player's course handicap for THIS round
//
// Returns { gross, netToPar, grossToPar, thru, wd, played }.
export function computeRoundLine({ scores = {}, holePars = [], holeHcps = [], ch = 0 }) {
  const entries = Object.entries(scores || {});
  // A WD is recorded by filling the remaining holes with the sentinel, so its
  // presence — not its absence — is what marks the round.
  const wd = entries.some(([, s]) => s === WD_SCORE);
  const real = entries.filter(([, s]) => s !== WD_SCORE && s > 0);
  const thru = real.length;

  if (thru === 0) {
    return { gross: 0, netToPar: 0, grossToPar: 0, thru: 0, wd, played: wd };
  }

  const gross = real.reduce((a, [, s]) => a + s, 0);
  const parPlayed = real.reduce((a, [h]) => a + (holePars[parseInt(h, 10)] ?? 4), 0);

  const strokeMap = buildStrokesMap(ch, holeHcps);
  const strokesOnPlayed = real.reduce((a, [h]) => a + (strokeMap[parseInt(h, 10)] || 0), 0);
  // A plus handicap ADDS strokes to the net score; a normal handicap removes
  // them. buildStrokesMap allocated by magnitude, so the sign is applied here.
  const signedStrokes = ch < 0 ? -strokesOnPlayed : strokesOnPlayed;

  return {
    gross,
    netToPar: gross - parPlayed - signedStrokes,
    grossToPar: gross - parPlayed,
    thru,
    wd,
    played: true,
  };
}

// ── computeIndividualBoard ─────────────────────────────────────────
// The canonical board. ONE row per player with the cumulative ranking metrics
// plus the per-round detail the leaderboard renders; the caller decides how to
// sort and slice (see rankIndividualBoard).
//
// Params (all read-only):
//   players   — [{ id, handicap_index, ... }]. Every other field is carried
//               through onto the row untouched, so callers that hand in
//               enriched player objects keep their extras.
//   numRounds — how many rounds the tournament plays
//   holeData  — { "{pid}_{round}": { holeIdx: strokes } }
//   tRounds   — [{ round_number, course_id }]
//   courses   — [{ id, slope, rating, par, hole_pars, hole_handicaps }]
//   getPlayerTee — (round, playerId, course) → { slope, rating, par } | null.
//               Falls back to the course's own ratings when a tee isn't
//               assigned, which is what makes a board renderable before the
//               director has finished tee assignments.
//   getPlayerCH — (round, playerId) → number | null. The course handicap this
//               player was RECORDED as playing off, when one is on file.
//               Returns null for the running tournament, where the index is the
//               source of truth and calcCH below is the answer.
//
//               It exists for the imported years. The early WBCs set a handicap
//               once and carried it unchanged across all four rounds — the
//               course handicap came later — so for 2012–2017, 2019 and 2024
//               there is no index that reproduces the record: 24 of 109
//               player-years land 2+ strokes out on some round, which is enough
//               to reorder a finished leaderboard. See lib/historyImport.js.
//
// Returns one row per player, in INPUT ORDER:
//   { ...player, totalNetToPar, totalGrossToPar, totalGross,
//     roundsPlayed, totalThru, withdrew, wdRound, rds }
// where `rds` has one entry per round: { netToPar, thru, wd } — netToPar null
// for a round not yet played, matching what LeaderboardView renders as "—".
export function computeIndividualBoard({
  players = [],
  numRounds = 4,
  holeData = {},
  tRounds = [],
  courses = [],
  getPlayerTee = () => null,
  getPlayerCH = () => null,
}) {
  return players.map(p => {
    let totalNetToPar = 0;
    let totalGrossToPar = 0;
    let totalGross = 0;
    let roundsPlayed = 0;
    let totalThru = 0;
    let withdrew = false;
    let wdRound = null;
    const rds = [];

    for (let r = 1; r <= numRounds; r++) {
      const tr = tRounds.find(t => t.round_number === r);
      const course = tr ? courses.find(c => c.id === tr.course_id) : null;
      // No course assigned yet → the round cannot be scored. It still occupies
      // a slot in `rds` so the leaderboard's round columns stay aligned.
      if (!course) { rds.push({ netToPar: null, thru: 0, wd: false }); continue; }

      // Recorded wins over derived — see courseHandicapFor, which is where
      // that precedence is spelled out and which every other screen that
      // needs this number now calls too.
      const ch = courseHandicapFor({
        handicapIndex: p.handicap_index,
        course,
        tee: getPlayerTee(r, p.id, course),
        recorded: getPlayerCH(r, p.id),
      });

      const line = computeRoundLine({
        scores: holeData[`${p.id}_${r}`] || {},
        holePars: course.hole_pars || [],
        holeHcps: course.hole_handicaps || [],
        ch,
      });

      if (line.wd && !withdrew) { withdrew = true; wdRound = r; }

      if (!line.played) { rds.push({ netToPar: null, thru: 0, wd: false }); continue; }

      totalNetToPar += line.netToPar;
      totalGrossToPar += line.grossToPar;
      totalGross += line.gross;
      totalThru += line.thru;
      roundsPlayed++;
      rds.push({ netToPar: line.netToPar, thru: line.thru, wd: line.wd });
    }

    return {
      ...p,
      totalNetToPar, totalGrossToPar, totalGross,
      roundsPlayed, totalThru,
      withdrew, wdRound,
      rds,
    };
  });
}

// ── rankIndividualBoard ────────────────────────────────────────────
// Order a board BEST → WORST — i.e. leaderboard order, rank #1 first. This is
// exactly the order LeaderboardView renders, so "reverse of the leaderboard"
// downstream (leaders off last) is just this reversed.
//
// Ordering, best → worst:
//   1. Players who have posted at least one round, by totalNetToPar ascending.
//      Tie-break: more holes played, then name, then id — every comparison
//      resolves, so the sort is deterministic and two devices showing the same
//      data can never disagree about who is 4th.
//   2. Players yet to post a round.
//   3. Withdrawn players last — they're out of contention.
//
// Returns the ROWS in order. rankIndividualBoardIds returns just the ids, for
// callers (like the pairing resolver) that only need the order.
// `isWD` is the roster-level withdrawal flag App.jsx puts on the player;
// `withdrew` is derived from the sentinel holes. Either marks a player out.
const isOut = (r) => !!(r?.withdrew || r?.isWD);
const bucketOf = (r) => isOut(r) ? 2 : r.roundsPlayed > 0 ? 0 : 1;

export function rankIndividualBoard(board = []) {

  return [...board].sort((a, b) => {
    const ba = bucketOf(a), bb = bucketOf(b);
    if (ba !== bb) return ba - bb;
    if (ba === 0) {
      if (a.totalNetToPar !== b.totalNetToPar) return a.totalNetToPar - b.totalNetToPar;
      if (a.totalThru !== b.totalThru) return b.totalThru - a.totalThru;
    }
    const an = a.name || "", bn = b.name || "";
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ── positionLabels ─────────────────────────────────────────────────
// The number in front of each name on a ranked board: 1, 2, T3, T3, 5.
//
// Takes a board already in rankIndividualBoard order and returns { id: label }.
// A tie shows the position both players share and skips the one behind it,
// which is how every scoreboard prints a tie and how the trophy on the
// leaderboard knows two men can win the same tournament.
//
// ── Players with no card yet ARE tied ──────────────────────────────
// This is the part that was wrong. Before a ball is struck nobody has a score,
// so the board has nothing to rank on — and it was handing out 1, 2, 3 … 14
// down a list sorted by NAME, which reads as a standing and is not one. A
// player looking at it on the Wednesday finds himself lying 9th in a
// tournament that has not started.
//
// So the unplayed block ties, wherever it falls: everybody on the morning of
// round one, and mid-tournament the men who have not teed off yet, who are all
// equally without a score and all equally behind the field that has one.
//
// Withdrawals are numbered individually and deliberately. rankIndividualBoard
// sorts them by name because there is nothing else to sort them by, so their
// number means no more than an unplayed man's did — but the row says WD where
// its score would be, which is the part that stops it reading as a standing.
export function positionLabels(board = []) {
  const labels = {};
  let i = 0;
  while (i < board.length) {
    const row = board[i];
    let j = i + 1;
    // How far the tie runs. A withdrawal ties with nobody, so its group is
    // itself and j stays where it is.
    if (!isOut(row)) {
      if (row.roundsPlayed > 0) {
        while (j < board.length && !isOut(board[j]) && board[j].roundsPlayed > 0
               && board[j].totalNetToPar === row.totalNetToPar) j++;
      } else {
        while (j < board.length && !isOut(board[j]) && !(board[j].roundsPlayed > 0)) j++;
      }
    }
    const tied = j - i > 1;
    for (let k = i; k < j; k++) labels[board[k].id] = tied ? `T${i + 1}` : i + 1;
    i = j;
  }
  return labels;
}

export function rankIndividualBoardIds(board = []) {
  return rankIndividualBoard(board).map(r => r.id);
}
