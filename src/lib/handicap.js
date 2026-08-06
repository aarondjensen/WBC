// ══════════════════════════════════════════════════════════════════
//  handicap — the WBC Index.
// ══════════════════════════════════════════════════════════════════
//
// What the number is
// ──────────────────
// The average of a player's best 5 SCORE DIFFERENTIALS from their most recent
// 12 rounds. That is the World Handicap System's shape — best 8 of the last 20
// there — cut down to what a once-a-year tournament actually produces: 12
// rounds is three WBCs, and 5 of 12 keeps the same "your good rounds, not your
// average round" character the 8-of-20 ratio has.
//
// A short career takes fewer, on the same ratio — see COUNTING_BY_SIZE.
//
// A differential is one round expressed on a common scale, so a 92 at
// Lochenheath (74.4/144) and an 84 at Yarrow (70.2/124) can be compared:
//
//     differential = (gross − course rating) × 113 / slope
//
// Rating is what a scratch golfer shoots there, so gross − rating is how far
// off scratch the round was; multiplying by 113/slope (113 being the slope of
// a course of average difficulty) rescales that to a standard course. PAR IS
// NOT IN IT — the rating already accounts for it, and adding par again would
// double-count. Par earns its keep one step later, in the COURSE HANDICAP the
// tournament plays off (calcCH in individualBoard.js: hi × slope/113 +
// (rating − par)), which is where the difference between a par-70 and a par-72
// layout belongs.
//
// Why the asterisk exists
// ───────────────────────
// The WBC is played once a year, and not everybody plays every year. A golfer
// who has made 6 of the last 10 trips has a "recent 12" that reaches back a
// decade — honest arithmetic on real rounds, but not the same 12 rounds as the
// man beside him on the list, so the two indexes are not quite comparable.
//
// The test is exact rather than a tolerance: a player's window is compared to
// the TOURNAMENT's last 12 rounds — 2023 R1 through 2025 R4 as this is written
// — and anything that is not that set, round for round, is flagged (`stale`)
// for the view to asterisk. That catches every way a window can differ, with
// one rule and no threshold to argue about:
//
//   • missed a year, so the window reaches back past it
//   • withdrew from a round, so it reaches back one round further
//   • has not played 12 rounds yet, so the window is short
//   • has not played recently, so the window is old
//
// The last two are the ones a span-based rule missed. Four rounds all from 2017
// span a single year and would have passed a "no wider than 4 years" test while
// being nine years stale.
//
// `wbcIndex` takes rounds and the slots to compare against and returns numbers,
// so the math is testable without the dataset; the dataset lives in
// ../data/history.js and is joined onto it by `historyFor`.

import { HISTORY_COURSES, HISTORY_ROUNDS, HISTORY_PLAYERS } from "../data/history.js";

// The two constants the whole thing is: how far back we look, and how many of
// those rounds count once the window is full.
export const WINDOW = 12;

// ── COUNTING_BY_SIZE ───────────────────────────────────────────────
// How many rounds count, for a window of any size. Indexed by the number of
// rounds in the window, so COUNTING_BY_SIZE[7] === 3.
//
// 5 of 12 is 42%, and the whole table holds roughly to that ratio — but as a
// TABLE rather than as `round(0.4 × n)`, for two reasons. The arithmetic does
// not actually land on these numbers (0.4 × 4 is 1.6, which rounds to 2 where
// the answer is 1), and a golfer checking why their index moved should be able
// to read the rule off a row rather than reproduce a rounding convention.
//
//   rounds    1  2  3  4     5  6     7  8     9 10 11    12
//   count     1  1  1  1     2  2     3  3     4  4  4     5
//   share     — 50 33 25    40 33    43 38    44 40 36    42 %
//
// The taper matters at the bottom of the table more than the top. Averaging the
// best 4 of a 4-round career is not a handicap, it is a scoring average with
// extra steps: it takes a bad day and bakes it into the number permanently.
// Taking the best 1 of 4 is what a handicap is for — what this player is
// capable of when it goes right — and it lets a first-timer's index come down
// as they play rather than sit high until they have twelve cards.
export const COUNTING_BY_SIZE = [0, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

// How many of `n` rounds count. Clamped at both ends: the window never exceeds
// WINDOW, but a caller handing in more should get the full-window answer rather
// than undefined.
export const countingFor = (n) =>
  n <= 0 ? 0 : COUNTING_BY_SIZE[Math.min(n, WINDOW)];

// What a full window takes — the headline "best 5 of 12". Read off the table
// rather than typed again, so the sentence on screen cannot come to disagree
// with the arithmetic behind it.
export const COUNTING = COUNTING_BY_SIZE[WINDOW];

// The score a withdrawn player's unplayed holes are filled with. Duplicated
// from individualBoard rather than imported so this module keeps its promise of
// no app dependencies; the two are asserted equal in the tests.
const WD_SENTINEL = 99;

// The slope of a course of average difficulty — the constant every differential
// is rescaled onto.
const STANDARD_SLOPE = 113;

// One decimal place, which is the precision a handicap is quoted at. Rounding
// each differential before averaging (rather than only rounding the average)
// is the WHS order of operations, and it is what makes a hand-check of the five
// numbers on screen add up to the index printed above them.
const tenth = (n) => Math.round(n * 10) / 10;

// ── differential ───────────────────────────────────────────────────
// Null when the course has no rating or slope on file: a round we cannot place
// on the common scale is not a zero, and averaging it in as one would drag an
// index down by a stroke and a half.
export function differential({ gross, rating, slope }) {
  if (!gross || !rating || !slope) return null;
  return tenth((gross - rating) * STANDARD_SLOPE / slope);
}

// Newest first — the order the window is taken from and the order the history
// list reads in. Within a year, a later round is a later round; 2014 numbers
// its four rounds 1, 2, 3, 5 in the source data, which sorts correctly anyway.
const newestFirst = (a, b) => b.year - a.year || b.round - a.round;

// ── recentRoundSlots ───────────────────────────────────────────────
// The tournament's last `n` rounds — the yardstick every player's window is
// measured against. Not a player's rounds: the ROUNDS THAT WERE PLAYED, whoever
// turned up for them. Newest first, as `year-round` keys.
//
// Derived from the rounds actually scored rather than from the course table, so
// a round nobody has a card for cannot become a slot everybody is missing.
export function recentRoundSlots(n = WINDOW) {
  return [...new Set(HISTORY_ROUNDS.map(r => `${r.year}-${r.round}`))]
    .map(key => { const [year, round] = key.split("-").map(Number); return { key, year, round }; })
    .sort(newestFirst)
    .slice(0, n)
    .map(s => s.key);
}

// ── historyFor ─────────────────────────────────────────────────────
// Every recorded round for one player, newest first, each one joined to the
// course it was played on and carrying its differential.
//
// Names are the join key: the historical data and the app's player registry
// both use FirstName LastInitial ("Aaron J"), and player_id — the identity the
// Firestore side is keyed on — did not exist when these rounds were played.
// See `matchHistoryName` for the matching rules.
export function historyFor(name) {
  if (!name) return [];
  return HISTORY_ROUNDS
    .filter(r => r.player === name)
    .map(r => {
      const course = HISTORY_COURSES[`${r.year}-${r.round}`] || null;
      return {
        ...r,
        key: `${r.year}-${r.round}`,
        course,
        differential: course ? differential({ gross: r.gross, rating: course.rating, slope: course.slope }) : null,
      };
    })
    .sort(newestFirst);
}

// ── wbcIndex ───────────────────────────────────────────────────────
// The index, plus everything the view needs to show its working.
//
// `rounds` is any list of rounds carrying `year`, `round` and `differential`;
// it does not have to come from historyFor. Rounds with no differential are
// dropped BEFORE the window is taken rather than inside it — a round we cannot
// score should not use up one of the 12 slots, or a single unrated course would
// quietly shrink the sample.
//
// `recentSlots` is the tournament's own last 12 rounds — see recentRoundSlots.
// It defaults to the real dataset's, which is what every caller in the app
// wants; tests hand in their own so the comparison can be exercised without it.
//
// Returns:
//   index        the number, or null with fewer than one usable round
//   window       the rounds it was taken from, newest first (≤ 12)
//   counting     the ones that made the average, newest first
//   countingKeys a Set of their keys, for the view to mark them
//   spanFrom/To  the years the window reaches across
//   spanYears    inclusive count of those years
//   stale        the window is not the tournament's last 12 exactly — asterisk
//   missed       the tournament rounds inside those 12 this player did not post
//   provisional  fewer than WINDOW rounds exist, so the sample is short
//   unrated      rounds excluded for having no course rating
export function wbcIndex(rounds = [], { recentSlots = recentRoundSlots() } = {}) {
  const all = [...rounds].sort(newestFirst);
  const usable = all.filter(r => r.differential != null);
  const unrated = all.filter(r => r.differential == null);
  const window = usable.slice(0, WINDOW);

  // Which of the tournament's recent rounds are absent from this window. A
  // player who played every one of them has nothing missed and nothing extra —
  // and since the window is capped at the same size, "missed nothing" and "is
  // exactly the recent 12" are the same statement.
  const held = new Set(window.map(r => r.key));
  const missed = (recentSlots || []).filter(k => !held.has(k));

  const empty = {
    index: null, window: [], counting: [], countingKeys: new Set(),
    spanFrom: null, spanTo: null, spanYears: 0,
    stale: (recentSlots || []).length > 0, missed, provisional: true, unrated,
  };
  if (!window.length) return empty;

  // Lowest differentials win. The tie-break is the more recent round, so two
  // identical numbers resolve the same way on every device — and resolve
  // towards the golfer the player is now.
  const counting = [...window]
    .sort((a, b) => a.differential - b.differential || newestFirst(a, b))
    .slice(0, countingFor(window.length))
    .sort(newestFirst);

  const avg = counting.reduce((a, r) => a + r.differential, 0) / counting.length;
  const years = window.map(r => r.year);
  const spanFrom = Math.min(...years), spanTo = Math.max(...years);
  const spanYears = spanTo - spanFrom + 1;

  return {
    index: tenth(avg),
    window,
    counting,
    countingKeys: new Set(counting.map(r => r.key)),
    spanFrom, spanTo, spanYears,
    stale: missed.length > 0,
    missed,
    provisional: window.length < WINDOW,
    unrated,
  };
}

// ── editionRounds ──────────────────────────────────────────────────
// A finished edition's rounds, in the shape the index math wants.
//
// The bundled history stops at the last export of data/rounds.csv, so the
// tournament that JUST finished is not in it — it is in Firestore, as hole
// scores. This turns those into differentials so a new year can be seeded off
// a record that includes the year before it, rather than off numbers a year
// out of date. Everything is passed in; this function has never heard of
// Firestore.
//
//   holeScores     [{ player_id, round_number, hole_number, score }]
//   tRounds        [{ round_number, course_id }]
//   courses        [{ id, rating, slope, tee_boxes:[{ name, rating, slope }] }]
//   teeAssignments [{ round_number, player_id, tee_name }]
//
// Only COMPLETE rounds count. A card thru 11, or one filled with the WD
// sentinel, is not a round anybody can be handicapped on — and a partial gross
// compared against a full course rating would read as a spectacular round.
//
// The rating used is the TEE the player was assigned, falling back to the
// course's own — which is the same resolution calcCH uses to score the round.
// Handicapping a round against a different rating than it was played off would
// be a second, quieter kind of wrong.
//
// Returns { [playerId]: [round, …] }, newest first.
export function editionRounds({ year, holeScores = [], tRounds = [], courses = [], teeAssignments = [] } = {}) {
  const yr = Number(year);
  if (!Number.isFinite(yr)) return {};

  const courseFor = (round) => {
    const tr = (tRounds || []).find(t => Number(t.round_number) === round);
    return tr ? (courses || []).find(c => c.id === tr.course_id) || null : null;
  };
  const teeFor = (round, pid, course) => {
    const name = (teeAssignments || []).find(t => Number(t.round_number) === round && t.player_id === pid)?.tee_name;
    const box = name ? (course?.tee_boxes || []).find(t => t.name === name) : null;
    return box || course || null;
  };

  // Gather strokes per player+round first: the rows arrive one hole at a time
  // and in no particular order.
  const cards = {};
  for (const r of holeScores || []) {
    const round = Number(r.round_number);
    const pid = r.player_id;
    if (!pid || !Number.isFinite(round) || round <= 0) continue;
    const hole = Number(r.hole_number);
    if (!Number.isFinite(hole) || hole < 1 || hole > 18) continue;
    const key = `${pid}|${round}`;
    (cards[key] ||= { pid, round, holes: {} }).holes[hole] = Number(r.score);
  }

  const out = {};
  for (const card of Object.values(cards)) {
    const scores = Object.values(card.holes);
    if (scores.length !== 18) continue;                     // incomplete card
    if (scores.some(s => !(s > 0) || s === WD_SENTINEL)) continue;  // withdrew
    const course = courseFor(card.round);
    if (!course) continue;
    const tee = teeFor(card.round, card.pid, course);
    const gross = scores.reduce((a, s) => a + s, 0);
    const rating = Number(tee?.rating), slope = Number(tee?.slope);
    (out[card.pid] ||= []).push({
      year: yr,
      round: card.round,
      key: `${yr}-${card.round}`,
      player: card.pid,
      gross,
      ch: null,
      net: null,
      course: { name: course.name || "", rating, slope, par: Number(course.par) || null },
      differential: differential({ gross, rating, slope }),
    });
  }
  for (const list of Object.values(out)) list.sort(newestFirst);
  return out;
}

// ── indexFor ───────────────────────────────────────────────────────
// The one call the view makes for a player: their history and their index.
//
// `override` is a number a director has set by hand, and it REPLACES the
// computed index without erasing it — `computed` keeps the arithmetic, the
// window and the counting rounds stay exactly as they were, and the detail page
// shows both. That is the whole design of the override: a hand-set index that
// hides its own working is a number nobody can argue with or check, and the
// reason to set one is usually that the history is thin or wrong, which is
// worth being able to see side by side.
//
// The cases it exists for: a first-timer with no rounds at all, somebody whose
// real index is known from a home club, and the year a career's data is plainly
// not describing the golfer any more.
export function indexFor(name, { override = null, extraRounds = [] } = {}) {
  const rounds = mergeRounds(historyFor(name), extraRounds);
  const board = wbcIndex(rounds);
  // An empty string is a cleared field, not a scratch player. `Number("")` is
  // 0 and 0 is a legal index, so the blank has to be rejected before the number
  // check rather than by it — and 0 has to survive, which a falsy test would
  // not have let it do.
  const overridden = override != null
    && String(override).trim() !== ""
    && Number.isFinite(Number(override));
  return {
    name,
    rounds,
    ...board,
    computed: board.index,
    index: overridden ? tenth(Number(override)) : board.index,
    overridden,
  };
}

// ── mergeRounds ────────────────────────────────────────────────────
// The bundled history plus whatever a caller has that is newer, newest first
// and one entry per round.
//
// De-duped by `year-round` with the EXTRA winning, because the two only ever
// collide after data/rounds.csv has been re-exported to include a year that is
// also still being read live — and in that overlap the live record is the one
// that cannot be stale. Both should say the same thing; if they ever disagree,
// silently counting the round twice would be the worse failure.
export function mergeRounds(base = [], extra = []) {
  const seen = new Set();
  const out = [];
  for (const r of [...(extra || []), ...(base || [])]) {
    if (!r || seen.has(r.key)) continue;
    seen.add(r.key);
    out.push(r);
  }
  return out.sort(newestFirst);
}

// ── matchHistoryName ───────────────────────────────────────────────
// Find the historical name for an app roster player.
//
// The registry stores `name` and, when it has them, `first_name`/`last_name`.
// Three shapes have to land on "Aaron J":
//   "Aaron J"       the canonical form, and what the registry uses today
//   "Aaron J."      the same with the initial punctuated
//   "Aaron Jensen"  a full surname, which reduces to its first letter
// Anything else returns null and the player simply has no history — which is
// the correct answer for a first-timer, and a safer one than a fuzzy match that
// hands one man another man's rounds.
const canonical = (first, last) =>
  `${(first || "").trim()} ${(last || "").trim().replace(/\./g, "").charAt(0)}`.trim().toLowerCase();

export function matchHistoryName(player, names = HISTORY_PLAYERS) {
  if (!player) return null;
  const candidates = new Set();
  const full = (player.name || "").trim();
  if (full) {
    candidates.add(full.toLowerCase());
    const parts = full.split(/\s+/);
    if (parts.length > 1) candidates.add(canonical(parts[0], parts[parts.length - 1]));
  }
  if (player.first_name) candidates.add(canonical(player.first_name, player.last_name));
  return names.find(n => candidates.has(n.toLowerCase())) || null;
}

// ── indexTable ─────────────────────────────────────────────────────
// Every player with recorded rounds, best index first. Players yet to post a
// round sort last rather than at the top, which is where a null index would
// otherwise land them.
export function indexTable(names = HISTORY_PLAYERS) {
  return names
    .map(indexFor)
    .sort((a, b) => {
      if ((a.index == null) !== (b.index == null)) return a.index == null ? 1 : -1;
      if (a.index !== b.index) return a.index - b.index;
      return a.name.localeCompare(b.name);
    });
}
