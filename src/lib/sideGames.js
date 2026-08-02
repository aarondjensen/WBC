// ══════════════════════════════════════════════════════════════════
//  sideGames — who is in, what the pot is worth, and who won the hole.
// ══════════════════════════════════════════════════════════════════
//
// The arithmetic behind the Betting tab's three games, pulled out of the view
// so it can be tested without a browser. Ported from Bourbon Cup, which runs
// the same three ideas:
//
//   SKINS ARE DERIVED, never stored. Low score on a hole takes it, a tie
//   pushes it, and the pot divides by however many were won. There is no
//   skins editor anywhere in the app on purpose — a stored winner is a second
//   answer that can disagree with the card, and the card is the one the group
//   signed.
//
//   CTP IS CAPTURED, because it is the one thing the card does not record.
//   That half lives in App.jsx (onSetCtp) and in `skins` documents.
//
//   THE MARKET IS BET. See lib/market.js.
//
// What is shared across all three is the money: who bought in, and what one
// seat costs.

// ── Who is playing for what ────────────────────────────────────────
// A null list means the director has never tagged anybody, and that means
// EVERYBODY — so a tournament that never opens the buy-in panel behaves
// exactly as it did before buy-ins existed. An empty array is a different
// answer (nobody), which is why the two must never be collapsed.
export const fieldFor = (ids, players) =>
  ids == null ? (players || []) : (players || []).filter(p => ids.includes(p.id));

// The pot is COUNTED from the buy-ins once a buy-in price exists. Until one
// does, whatever was typed into the pot stands — which is the only thing a
// tournament already under way has.
export const potFor = ({ amount, count, typed = 0 }) =>
  (amount || 0) > 0 ? (amount || 0) * (count || 0) : (typed || 0);

// ── Skins ──────────────────────────────────────────────────────────
// One pass over 18 holes. `strokeMaps` is { pid: { holeIdx: strokes } } for
// net play and null/undefined for gross.
//
// `chFor` carries the SIGN of the course handicap, because a plus player
// gives strokes back: their net on a stroke hole is worse than their gross.
// buildStrokesMap allocates by magnitude and leaves the sign to its caller,
// the same split computeRoundLine makes.
//
// The WD sentinel is skipped outright. A 99 would never win a hole, but it
// would make a hole with one real score look like a two-player hole and turn
// a solo score into a skin nobody actually competed for.
import { WD_SCORE } from "./individualBoard";

export function computeSkins({ players, holeData, round, pars = [], strokeMaps = null, chFor = null }) {
  const out = [];
  for (let h = 0; h < 18; h++) {
    const scores = (players || []).map(p => {
      const raw = ((holeData || {})[`${p.id}_${round}`] || {})[h];
      if (!(raw > 0) || raw === WD_SCORE) return null;
      if (!strokeMaps) return { pid: p.id, name: p.name, score: raw };
      const strokes = (strokeMaps[p.id] || {})[h] || 0;
      const sign = (chFor ? chFor(p.id) : 0) < 0 ? -1 : 1;
      return { pid: p.id, name: p.name, score: raw - sign * strokes, gross: raw };
    }).filter(Boolean);

    if (scores.length < 2) { out.push({ hole: h, winner: null, tied: false, par: pars[h] }); continue; }
    const min = Math.min(...scores.map(s => s.score));
    const winners = scores.filter(s => s.score === min);
    out.push(winners.length === 1
      ? { hole: h, winner: winners[0], score: min, par: pars[h] }
      : { hole: h, winner: null, tied: true, score: min, par: pars[h] });
  }
  return out;
}

// Every skin won across the whole event, each tagged with the round it came
// from. `roundSetup(round)` returns { pars, strokeMaps, chFor } — the view
// resolves courses and tees, this only does the counting.
export function allSkins({ players, holeData, rounds, roundSetup }) {
  return (rounds || []).flatMap(r => {
    const setup = roundSetup(r) || {};
    return computeSkins({ players, holeData, round: r, ...setup })
      .filter(s => s.winner)
      .map(s => ({ ...s, round: r }));
  });
}

// pid → skins won, for the leaderboard.
export function skinCounts(skins) {
  const counts = {};
  (skins || []).forEach(s => { counts[s.winner.pid] = (counts[s.winner.pid] || 0) + 1; });
  return counts;
}
