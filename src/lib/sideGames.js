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

// What one unit of a pot is worth. Zero units is the empty pot, not a
// division by zero.
//
// The subtlety is entirely in what the caller passes as `units`, and the two
// side games answer it differently on purpose:
//
//   SKINS divide by the skins actually WON, because that number cannot be
//   known in advance — every tie pushes a hole out of the count, so the value
//   of a skin moves all week and is only final when the last card is in.
//
//   CTP divides by the par 3s that EXIST. The holes are on the scorecard
//   before anybody tees off, so the value of a pin is fixed from the start
//   and a hole nobody claims is simply a pin nobody won. Dividing by the pins
//   TAKEN would have made every unclaimed hole quietly inflate the others,
//   so a player who won a pin on Friday would find it worth less each time
//   somebody else took one.
export const perUnit = (pot, units) => ((units || 0) > 0 ? (pot || 0) / units : 0);

// ── The collection sheet ───────────────────────────────────────────
// One table instead of one panel per game. The director's actual job on a
// Friday morning is not "configure the skins game" — it is standing in a car
// park working out what each man owes and whether everybody has paid, and
// that question spans all four buy-ins at once.
//
// `games` is [{ key, amount, ids }] in the order they should appear.
// Returns the whole sheet in one pass: a row per player carrying which games
// they are in and what they owe, a per-game total, and the grand total the
// director is counting cash against.
//
// `all` on a game total is what the column's toggle reads to decide whether
// tapping it means everybody-in or nobody-in — computed from the ROWS rather
// than from `ids`, so a null list (everybody) reports `all` correctly instead
// of looking like an empty one.
//
// ── Players who are not in the field ───────────────────────────────
// A player marked `outside` is on the sheet without being in this year's
// tournament — the man who is not playing but is in the market, betting on
// who wins. He is billed for exactly the games he was tagged into and nothing
// else, which needs two rules, because "everybody" cannot mean him:
//
//   • `ids == null` is EVERYBODY IN THE FIELD, not every row on the sheet. A
//     game nobody has ever configured bills the tournament, and he is not in
//     the tournament.
//   • `all` counts him only once he is in. Otherwise a column he can never
//     join would never read as full, and its heading — which cycles all-in →
//     all-paid → clear off that flag — would stick on its first step forever.
export function buyInSheet({ players, games }) {
  const list = players || [];
  const gs = games || [];
  // A game with no `paid` array is not TRACKING payment, and everybody in it
  // counts as settled — that is every buy-in the director tags by hand, where
  // ticking the box IS the cash changing hands. Only the market rebuy needs
  // the two apart: a man enters it by placing halfway shares from a tee box,
  // hours before he can hand anybody $25.
  const isPaid = (g, pid) => !g.paid || g.paid.includes(pid);

  const rows = list.map(p => {
    const inGames = {};
    const paidGames = {};
    let owes = 0;
    let unpaid = 0;
    gs.forEach(g => {
      const isIn = g.ids == null ? !p.outside : g.ids.includes(p.id);
      inGames[g.key] = isIn;
      paidGames[g.key] = isIn && isPaid(g, p.id);
      if (isIn) {
        owes += g.amount || 0;
        if (!paidGames[g.key]) unpaid += g.amount || 0;
      }
    });
    // `wd` rides along so the sheet can say why somebody who is not playing
    // is still being billed. It changes no arithmetic: a withdrawal does not
    // refund a buy-in.
    return { pid: p.id, name: p.name, wd: !!p.isWD, outside: !!p.outside, games: inGames, paid: paidGames, owes, unpaid };
  });

  const totals = {};
  gs.forEach(g => {
    const inRows = rows.filter(r => r.games[g.key]);
    const paidCount = inRows.filter(r => r.paid[g.key]).length;
    // Who this column could hold: the field, plus anybody from outside it who
    // is already in. See the header — "everybody" is a statement about the
    // tournament, not about the rows on screen.
    const canBeIn = rows.filter(r => !r.outside || r.games[g.key]);
    totals[g.key] = {
      count: inRows.length,
      amount: inRows.length * (g.amount || 0),
      all: canBeIn.length > 0 && inRows.length === canBeIn.length,
      none: inRows.length === 0,
      // Payment, where it is tracked. `allPaid` is what a column heading
      // reads to decide whether tapping it means everybody-paid or nobody.
      paidCount,
      paidAmount: paidCount * (g.amount || 0),
      allPaid: inRows.length > 0 && paidCount === inRows.length,
    };
  });

  return {
    rows,
    totals,
    grand: rows.reduce((sum, r) => sum + r.owes, 0),
    // What is still to come in. Zero on a tournament that tracks no payment,
    // which is every one of them until somebody enters the halfway market.
    outstanding: rows.reduce((sum, r) => sum + r.unpaid, 0),
  };
}

// Mark one player paid, or un-mark them. Separate from toggleIn because it
// answers a different question — that one is "is he in", this is "has he
// handed the money over" — and because `paid` has no null-means-everybody
// rule: nobody has paid until somebody says so.
export function togglePaid(paid, pid) {
  const list = paid || [];
  return list.includes(pid) ? list.filter(x => x !== pid) : [...list, pid];
}

// Add or remove one player from one game's list, materialising `null` into
// the full roster first. That materialisation is the whole reason this is a
// function rather than an inline splice: turning a single player OFF a
// never-configured game has to leave the roster MINUS one behind, not an
// empty list that would read back as "everybody".
export function toggleIn(ids, players, pid) {
  const list = ids ?? (players || []).map(p => p.id);
  return list.includes(pid) ? list.filter(x => x !== pid) : [...list, pid];
}

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

// ── Low net ────────────────────────────────────────────────────────
// A payout per ROUND to the lowest net score of the day, split when it is
// tied. Unlike skins it is not a hole-by-hole game and unlike the market it
// is not a bet — it is the one side game that pays the same thing the
// leaderboard ranks on, one round at a time.
//
// `lineFor(pid, round)` hands back that player's round line — the same
// computeRoundLine the leaderboard and the finalize preview use, so the low
// net here and the number on the board can never be two different answers.
// Injected rather than computed, which is what keeps this testable without a
// course, a tee sheet or a handicap.
//
// ONLY COMPLETE ROUNDS COUNT. computeRoundLine scores a partial card against
// the holes actually played, so a man walking in after nine sits on a net −3
// that would win the day from the clubhouse. `thru === 18` is the whole
// qualification; a withdrawal is out for the same reason.
//
// A round nobody has finished yet returns no winners rather than a leader so
// far, because a payout that changes hands as the last group comes in is
// worse than one that simply is not decided yet.
export function lowNetRounds({ players, rounds, lineFor }) {
  return (rounds || []).map(round => {
    const entries = (players || []).map(p => {
      const line = lineFor(p.id, round);
      if (!line || !line.played || line.wd || line.thru < 18) return null;
      // Two numbers, because golf says this two ways. `net` is to-par and is
      // what decides the round — it is the figure the leaderboard ranks on.
      // `netScore` is the same answer as a SCORE, which is how a low net gets
      // read out in a car park: "Finn shot 68". Derived rather than stored,
      // since strokes = grossToPar - netToPar falls straight out of the line.
      const strokes = line.grossToPar - line.netToPar;
      return {
        pid: p.id, name: p.name,
        net: line.netToPar,
        netScore: line.gross - strokes,
        gross: line.gross,
        strokes,
      };
    }).filter(Boolean);

    if (entries.length === 0) return { round, winners: [], net: null, decided: false };
    const best = Math.min(...entries.map(e => e.net));
    return {
      round,
      net: best,
      decided: true,
      winners: entries
        .filter(e => e.net === best)
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    };
  });
}

// The whole field for one round, best net first — what the ledger's chevron
// opens onto. `lowNetRounds` answers "who took the day"; this answers "by how
// much, and who was close", which is the question the winner's name provokes.
//
// The sort is in two blocks rather than one. A card still on the course has no
// net worth ranking — the man on the 14th sitting at −4 is not leading anybody
// — so finished rounds are ordered by net and everybody still out follows,
// deepest into their round first. Mixing them would put a half-finished card
// at the top of a list of finished ones, which is the same lie `lowNetRounds`
// refuses to tell by only counting complete rounds.
//
// A withdrawal keeps its place among the unfinished: the holes it played are
// real, it just has no round to rank.
export function lowNetRoundField({ players, round, lineFor }) {
  return (players || []).map(p => {
    const line = lineFor(p.id, round);
    if (!line || !line.played) return null;
    const complete = !line.wd && line.thru === 18;
    const strokes = line.grossToPar - line.netToPar;
    return {
      pid: p.id, name: p.name,
      complete, wd: !!line.wd, thru: line.thru,
      gross: line.gross, strokes,
      net: line.netToPar,
      netScore: line.gross - strokes,
    };
  }).filter(Boolean).sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    if (a.complete) return a.net - b.net || String(a.name).localeCompare(String(b.name));
    return b.thru - a.thru || String(a.name).localeCompare(String(b.name));
  });
}

// pid → skins won, for the leaderboard.
export function skinCounts(skins) {
  const counts = {};
  (skins || []).forEach(s => { counts[s.winner.pid] = (counts[s.winner.pid] || 0) + 1; });
  return counts;
}
