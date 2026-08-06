// ══════════════════════════════════════════════════════════════════
//  historyImport — data/*.csv → the documents a past edition is made of.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React, for the same reason editionId.js and
// editionClone.js are — firebase.js initializes an app at import time, so
// anything importing it is untestable in a plain unit test. The IMPORT SCRIPT
// (scripts/import-history.mjs) is the half that talks to Firestore; everything
// that decides what a document should contain lives here, next to its test.
//
// ── What this is for ──────────────────────────────────────────────
// Firestore holds the running edition. 2012–2025 lives only in data/*.csv (see
// data/DATA-GUIDE.md) and in src/data/history.js, which carries ROUND totals
// for the WBC Index and nothing hole-by-hole. So a director can switch to 2015
// in Tournaments and find an empty tournament, even though every score of it is
// sitting in the repo.
//
// This builds the documents that make those years real editions: switch to them
// and the leaderboard, the scorecards and the round detail all work, because
// they are ordinary editions the app has no special case for.
//
// 2010 and 2011 get an edition and a roster but no scores — those tournaments
// recorded a champion and who showed up, never a card. An edition with a roster
// and no holes is a state the app already handles (it is what next year looks
// like before anybody tees off).
//
// ── The handicap problem, and why CH is stored rather than derived ─
// The app derives each round's course handicap from ONE locked index per
// player: calcCH(index, slope, rating, par), recomputed per round off the tee
// played. That is the modern model and it is right for the running tournament.
//
// The early WBCs did not use it. Handicaps were set once and carried unchanged
// across all four rounds, whatever the course — the concept of a course
// handicap came later. Measured against data/rounds.csv, 2012–2017, 2019 and
// 2024 are flat; 2018, 2020–2023 and 2025 vary by round.
//
// So for roughly half the years there is NO index that reproduces the record.
// Searching every index at 0.1 resolution, 24 of 109 player-years come out 2 or
// more strokes off on some round — enough to move a net total past the man
// beside him and show the wrong champion for a tournament that was played and
// settled a decade ago.
//
// The recorded course handicap is therefore stored per player, per round, and
// computeIndividualBoard prefers it when present (see getPlayerCH there). The
// index still goes on the roster row because the roster shows one, but nothing
// is scored from it — see bestFitIndex, which says so again at the call site.
//
// This also sidesteps a second problem: `courses` is a GLOBAL registry holding
// each course as it is rated TODAY, and 4 of 45 courses were re-rated between
// WBCs (Forest Dunes went 71.3/135 → 72.4/139). A 2013 round recomputed from a
// 2026 rating is not the round that was played. Storing the handicap makes the
// rating irrelevant to the result.
//
// ── What stays exact ──────────────────────────────────────────────
// net_total == gross_total − course_handicap holds for all 424 recorded rounds,
// and the board's round total is gross − ch − par by construction, so every
// net total and every finishing position comes out exactly as recorded.
//
// Hole-level net is approximate for 2012, 2013 and 2016–2022, where the source
// spreadsheets carried no stroke index and data/ defaults it to 1–18 in hole
// order (DATA-GUIDE.md). The right NUMBER of strokes is given out, so round
// totals are unaffected; only which holes show a stroke can be wrong. Gross is
// exact everywhere.
import { docIds, editionIdForYear, editionSlug } from "./editionId";

// The WD sentinel, re-stated rather than imported from individualBoard: this
// module is about what a document holds, and importing the board to name a
// number would tie the import to the scoring code.
export const WD_SCORE = 99;

// Career identity. The app derives a player id the same way when a director
// adds somebody (`name.toLowerCase().replace(/\s+/g, "_")`), so "Aaron J" is
// `aaron_j` here and in every edition since — which is the whole point, as
// player_id is what ties a golfer to sixteen years of history.
export const playerIdFor = (name) =>
  String(name ?? "").trim().toLowerCase().replace(/\s+/g, "_");

// A course document id for one ROUND of one year. NOT the global registry id.
//
// The registry holds one document per course, rated as it is today, and Admin
// lists it for a director assigning a round. Historical courses want neither:
// they are frozen at the rating in force the day they were played, and 50 extra
// names in the picker would bury the handful a director actually plays. So they
// take a `hist_` prefix, which is also the marker the picker filters on.
//
// Keyed by ROUND as well as year, which src/data/history.js already does for
// the same reason one step out ("the same course in two years is two entries").
// One step IN turns out to matter too: 2016 played CALDERONE in rounds 3 and 4
// off different tees — 69.3/127 and 69.1/124 — and an id keyed on the name
// alone made them one document, so round 3 silently inherited round 4's rating.
// Six other same-year repeats are identical and become two identical documents,
// which is the cheap half of the trade.
export const historyCourseId = (year, round, courseName) =>
  `hist_${year}_r${round}_${String(courseName ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;

export const isHistoryCourseId = (id) => String(id ?? "").startsWith("hist_");

// ── bestFitIndex ───────────────────────────────────────────────────
// The handicap index that best explains a player's recorded course handicaps
// under the modern model, to 0.1.
//
// DISPLAY ONLY. Nothing is scored from it — the recorded course handicap is,
// via the tee_assignments row. It exists because a roster row carries an index
// and a blank one would read as "no handicap" on a player who plainly had one.
//
// For a year whose handicaps varied by course this usually lands exactly. For a
// flat year it cannot, because no index reproduces one number across four
// different slopes; it returns the closest, which is the honest answer to "what
// would this player's index have been".
//
// `rounds` is [{ slope, rating, par, courseHandicap }].
export const bestFitIndex = (rounds = [], { min = -10, max = 50, step = 0.1 } = {}) => {
  const usable = rounds.filter(r =>
    Number.isFinite(r?.slope) && Number.isFinite(r?.rating) &&
    Number.isFinite(r?.par) && Number.isFinite(r?.courseHandicap));
  if (!usable.length) return null;

  const calcCH = (hi, slope, rating, par) => Math.round((hi * (slope / 113)) + (rating - par));
  const steps = Math.round((max - min) / step);
  let best = null;
  for (let i = 0; i <= steps; i++) {
    // Rebuilt from the step index rather than accumulated, so 0.1 added three
    // hundred times cannot drift the candidate off the tenth it is meant to be.
    const hi = Math.round((min + i * step) * 10) / 10;
    let worst = 0;
    for (const r of usable) {
      const d = Math.abs(calcCH(hi, r.slope, r.rating, r.par) - r.courseHandicap);
      if (d > worst) worst = d;
      if (best && worst > best.worst) break;
    }
    // Strictly-better only, so the LOWEST index wins a tie — the search walks
    // upward and an equally good higher index is not a better answer.
    if (!best || worst < best.worst) best = { hi, worst };
    if (best.worst === 0) break;
  }
  return best ? { index: best.hi, worstError: best.worst, exact: best.worst === 0 } : null;
};

// ── The documents ──────────────────────────────────────────────────
// Each builder returns plain objects in the shape the app already reads, so a
// historical edition is not a new kind of thing the app has to understand. The
// shapes are taken from the write sites in App.jsx (holeDataToRow, the
// tournament_rounds row in setCourseForRound, addPlayerToTournament) rather
// than invented here.

// wbc_editions — the row that makes a year appear in Tournaments.
//
// No `status`: lib/editionLifecycle derives the state from what the edition
// HOLDS, precisely because a hand-set label is a fact about the code path that
// wrote it rather than about the tournament. A finished year with a full set of
// scores reads `complete` on its own.
export const editionDocFor = ({ year, name, champion = null }) => ({
  id: editionIdForYear(year),
  year: Number(year),
  name: String(name ?? "").trim() || `WBC ${year}`,
  created_from: null,
  // Provenance, so a director looking at 2015 in the console can tell an
  // imported year from one that was played in the app.
  imported_from: "data/",
  ...(champion ? { champion: String(champion) } : {}),
});

// tournament_state — the singleton carrying the event setup. `rounds` is what
// the app counts to; a three-round year that said four would render an empty
// fourth column on its leaderboard forever.
export const stateDocFor = ({ year, rounds, location = "" }) => ({
  id: `ts_${editionIdForYear(year)}`,
  tournament_id: editionIdForYear(year),
  meta: {
    name: `WBC ${year}`,
    ...(location ? { location } : {}),
    rounds: Number(rounds) || 4,
  },
  // Every round of a finished tournament is closed. Without this the app offers
  // a director the finalize prompt on a tournament that ended years ago, and
  // leaves its scores editable.
  finalized_rounds: Object.fromEntries(
    Array.from({ length: Number(rounds) || 4 }, (_, i) => [i + 1, true])),
});

// tournament_players — the roster binding, one per golfer per year.
export const rosterDocFor = ({ year, playerId, handicapIndex = 0 }) => ({
  id: docIds.tournamentPlayer(editionSlug(editionIdForYear(year)), playerId),
  tournament_id: editionIdForYear(year),
  player_id: playerId,
  handicap_index: Number.isFinite(handicapIndex) ? handicapIndex : 0,
  status: "active",
});

// courses — frozen at the rating in force that year. See historyCourseId for
// why these are not the global registry entries.
export const courseDocFor = ({ year, round, name, rating, slope, par, holePars = [], holeHandicaps = [] }) => ({
  id: historyCourseId(year, round, name),
  name: String(name ?? "").trim(),
  rating: Number(rating) || 0,
  slope: Number(slope) || 0,
  par: Number(par) || 0,
  hole_pars: holePars.map(Number),
  hole_handicaps: holeHandicaps.map(Number),
  // One tee box, because the source records one set of ratings per round and
  // inventing a colour would be inventing a fact. getPlayerTee falls back to
  // it, and nothing is scored from it anyway — the handicap is stored.
  tee_boxes: [{
    name: "Historical", color: "#8b9ec2",
    rating: Number(rating) || 0, slope: Number(slope) || 0, par: Number(par) || 0,
  }],
  imported_from: "data/",
});

// tournament_rounds — which course each round was played on.
export const roundDocFor = ({ year, round, courseName }) => ({
  id: docIds.tournamentRound(editionSlug(editionIdForYear(year)), round),
  tournament_id: editionIdForYear(year),
  round_number: Number(round),
  course_id: historyCourseId(year, round, courseName),
});

// tee_assignments — and the one field this whole module exists for.
//
// `course_handicap` is the number the tournament was actually scored on. The
// board prefers it over calcCH, which is what lets a flat-handicap year come
// out exactly as it was played. It rides here rather than in a collection of
// its own for a practical reason worth stating: firestore.rules default-DENIES
// unlisted collections, so a new one means a rules change, and rules are
// deployed by hand and separately from the app. This row already exists per
// player per round and already means "how this player played this round".
export const teeDocFor = ({ year, round, playerId, courseHandicap }) => ({
  id: docIds.teeAssignment(editionSlug(editionIdForYear(year)), round, playerId),
  tournament_id: editionIdForYear(year),
  round_number: Number(round),
  player_id: playerId,
  tee_name: "Historical",
  ...(Number.isFinite(courseHandicap) ? { course_handicap: Number(courseHandicap) } : {}),
});

// hole_scores — one document per player, per round, per hole. `hole` is
// one-based in the source and in the stored field; docIds.holeScore takes the
// zero-based index, matching App.jsx's holeDataToRow.
export const holeDocFor = ({ year, round, playerId, hole, gross, courseName }) => {
  const slug = editionSlug(editionIdForYear(year));
  const holeIdx = Number(hole) - 1;
  return {
    id: docIds.holeScore(slug, round, playerId, holeIdx),
    round_score_id: docIds.roundScore(slug, round, playerId),
    tournament_id: editionIdForYear(year),
    player_id: playerId,
    course_id: historyCourseId(year, round, courseName),
    round_number: Number(round),
    hole_number: Number(hole),
    score: Number(gross),
  };
};

// ── buildEdition ───────────────────────────────────────────────────
// Everything one year needs, from that year's rows. Returns the documents
// grouped by collection so the caller can write, count or print them without
// this module knowing which of those it is doing.
//
//   tournament — { year, num_rounds, champion }        (tournaments.csv)
//   rounds     — [{ round, player, course, course_handicap }]   (rounds.csv)
//   courses    — [{ round, course, rating, slope, par, hole_pars, hole_handicaps }]
//   holes      — [{ round, player, hole, gross, course }]       (holes.csv)
//
// A year with no holes (2010, 2011) yields an edition, a state document and a
// roster, and no scores — which is a state the app already renders.
export const buildEdition = ({ tournament, rounds = [], courses = [], holes = [] }) => {
  const year = Number(tournament?.year);

  // ── Round numbers are normalised to a contiguous 1..N ────────────
  // 2014 is numbered 1, 2, 3, **5** in the source — four rounds were played and
  // the last one is labelled 5. Every other year is contiguous.
  //
  // The app counts `for (r = 1; r <= numRounds; r++)`, so imported as-is that
  // tournament loses its final round entirely (unreachable at r=5) and shows an
  // empty column at r=4. Eric O's gross came out 100 strokes light — one whole
  // round — which is how this was found.
  //
  // Renumbering changes a label, not a result: the rounds keep their order and
  // their courses, and nothing downstream records the source's numbering.
  const sourceRounds = [...new Set([
    ...courses.map(c => Number(c.round)),
    ...rounds.map(r => Number(r.round)),
    ...holes.map(h => Number(h.round)),
  ].filter(n => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  const roundNo = new Map(sourceRounds.map((src, i) => [src, i + 1]));
  const rn = (v) => roundNo.get(Number(v)) ?? null;

  // The count comes from the rounds actually present, not from tournaments.csv:
  // if the two ever disagree, the scores are the tournament and the summary row
  // is a summary.
  const numRounds = sourceRounds.length || Number(tournament?.num_rounds) || 4;

  const courseByRound = new Map();
  for (const c of courses) courseByRound.set(rn(c.round), c);

  const courseDocs = courses
    .filter(c => rn(c.round))
    .map(c => courseDocFor({
      year, round: rn(c.round), name: c.course,
      rating: c.rating, slope: c.slope, par: c.par,
      holePars: c.hole_pars || [], holeHandicaps: c.hole_handicaps || [],
    }));

  const roundDocs = courses
    .filter(c => rn(c.round))
    .map(c => roundDocFor({ year, round: rn(c.round), courseName: c.course }));

  // Roster, and the index that goes on it. Grouped per player so bestFitIndex
  // sees every round the man played that year, not one of them.
  const byPlayer = new Map();
  for (const r of rounds) {
    const pid = playerIdFor(r.player);
    if (!pid) continue;
    if (!byPlayer.has(pid)) byPlayer.set(pid, []);
    byPlayer.get(pid).push(r);
  }

  const rosterDocs = [];
  const teeDocs = [];
  for (const [pid, rs] of byPlayer) {
    const fit = bestFitIndex(rs.map(r => {
      const c = courseByRound.get(rn(r.round)) || {};
      return {
        slope: Number(c.slope), rating: Number(c.rating), par: Number(c.par),
        courseHandicap: Number(r.course_handicap),
      };
    }));
    rosterDocs.push(rosterDocFor({ year, playerId: pid, handicapIndex: fit?.index ?? 0 }));

    for (const r of rs) {
      // A POSITIVE INTEGER, not merely a finite one: 2010 and 2011 are
      // appearance-only rows whose round is blank, and `Number(null)` is 0,
      // which is finite. That wrote a `ta_2010_r0_scott_r` for a round nobody
      // played, in a year with no scores at all.
      const rnd = rn(r.round);
      if (!Number.isInteger(rnd) || rnd < 1) continue;
      teeDocs.push(teeDocFor({
        year, round: rnd, playerId: pid,
        courseHandicap: Number(r.course_handicap),
      }));
    }
  }

  const holeDocs = holes
    .filter(h => Number.isFinite(Number(h.gross)) && Number(h.gross) > 0)
    .filter(h => rn(h.round))
    .map(h => holeDocFor({
      year, round: rn(h.round), playerId: playerIdFor(h.player),
      hole: Number(h.hole), gross: Number(h.gross),
      courseName: (courseByRound.get(rn(h.round)) || {}).course || h.course,
    }));

  return {
    year,
    editionId: editionIdForYear(year),
    wbc_editions: [editionDocFor({ year, name: `WBC ${year}`, champion: tournament?.champion })],
    tournament_state: [stateDocFor({ year, rounds: numRounds })],
    tournament_players: rosterDocs,
    courses: courseDocs,
    tournament_rounds: roundDocs,
    tee_assignments: teeDocs,
    hole_scores: holeDocs,
  };
};

// Total documents an edition would write — for the dry run's count, and for a
// caller deciding whether it wants to.
export const countDocs = (edition) =>
  ["wbc_editions", "tournament_state", "tournament_players", "courses",
   "tournament_rounds", "tee_assignments", "hole_scores"]
    .reduce((n, k) => n + (edition?.[k]?.length || 0), 0);
