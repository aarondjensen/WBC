// ══════════════════════════════════════════════════════════════════
//  build-history — data/*.csv → src/data/history.js
// ══════════════════════════════════════════════════════════════════
//
// The WBC Index is built from rounds the app never had: 2012–2025 lives in
// data/rounds.csv and data/courses.csv (see data/DATA-GUIDE.md), not in
// Firestore. Firestore holds the RUNNING edition and nothing before it.
//
// Rather than teach the app to parse CSVs at boot — 8,000 rows fetched on a
// phone, on a tee box, to show one number — this bakes the two files it needs
// into a module the bundle already carries. It is ~30KB of the smallest shape
// the index math can work from: a course table keyed by year+round, and one
// row per player-round.
//
// Run it after data/ changes — most obviously when a finished edition is
// exported into rounds.csv:
//
//   npm run build:history
//
// Only rounds with a gross total are emitted. 2010 and 2011 are appearance-only
// skeleton rows in rounds.csv (no scores were ever recorded), so they fall out
// here and cannot reach the index.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// A minimal RFC-4180 reader. hole_pars and hole_handicaps are quoted fields
// carrying commas, so splitting on "," is not an option, and a CSV dependency
// for two files read once at build time is not worth the install.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows
    .filter(r => r.length > 1)
    .map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

// pandas wrote whole numbers out of float columns, so year/round/gross arrive
// as "2012.0" and "1.0". Everything numeric goes through here.
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v) => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};

const read = (name) => parseCsv(readFileSync(join(ROOT, "data", name), "utf8"));

const courseRows = read("courses.csv");
const roundRows = read("rounds.csv");

const key = (year, round) => `${year}-${round}`;

// ── Courses ──
// One entry per year+round, which is how rounds.csv points at them. The same
// course played in two different years gets two entries on purpose: ratings get
// revised, and a round is scored against the rating in force the year it was
// played.
const courses = {};
for (const c of courseRows) {
  const year = int(c.year), round = int(c.round);
  if (year === null || round === null) continue;
  courses[key(year, round)] = {
    name: c.course,
    rating: num(c.rating),
    slope: num(c.slope),
    par: int(c.par),
  };
}

const missingRatings = Object.entries(courses)
  .filter(([, c]) => c.rating === null || c.slope === null)
  .map(([k, c]) => `${k} ${c.name}`);

// ── Rounds ──
const rounds = [];
const skipped = [];
for (const r of roundRows) {
  const gross = int(r.gross_total);
  if (gross === null) continue;              // 2010/2011 appearance rows
  const year = int(r.year), round = int(r.round);
  const course = courses[key(year, round)];
  if (!course) { skipped.push(`${year} R${round} ${r.player}`); continue; }
  rounds.push({
    year, round,
    player: r.player,
    gross,
    ch: int(r.course_handicap),
    net: int(r.net_total),
  });
}

rounds.sort((a, b) => a.year - b.year || a.round - b.round || a.player.localeCompare(b.player));

const players = [...new Set(rounds.map(r => r.player))].sort();
const years = [...new Set(rounds.map(r => r.year))].sort((a, b) => a - b);

// ── Emit ──
// Objects rather than tuples: the file is read by people as well as by the
// bundler, and a row that says `gross: 81` needs no decoder ring.
const lit = (v) => (v === null ? "null" : JSON.stringify(v));

const courseLines = Object.entries(courses)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([k, c]) => `  ${JSON.stringify(k)}: { name: ${lit(c.name)}, rating: ${lit(c.rating)}, slope: ${lit(c.slope)}, par: ${lit(c.par)} },`);

const roundLines = rounds.map(r =>
  `  { year: ${r.year}, round: ${r.round}, player: ${lit(r.player)}, gross: ${r.gross}, ch: ${lit(r.ch)}, net: ${lit(r.net)} },`);

const out = `// ══════════════════════════════════════════════════════════════════
//  history — every recorded WBC round, for the index math.
// ══════════════════════════════════════════════════════════════════
//
// GENERATED FILE — do not edit by hand. Run \`npm run build:history\` after
// data/rounds.csv or data/courses.csv changes; the generator is
// scripts/build-history.mjs and the source data is described in
// data/DATA-GUIDE.md.
//
// ${rounds.length} rounds by ${players.length} players across ${years[0]}–${years[years.length - 1]}.
// 2010 and 2011 are absent: those tournaments recorded a champion and a roster,
// never a score.

// Keyed \`year-round\`, which is what a round points at. The same course in two
// years is two entries — ratings get revised, and a round is scored against the
// rating in force the year it was played.
export const HISTORY_COURSES = {
${courseLines.join("\n")}
};

// One row per player-round. \`ch\` is the course handicap that year's setup gave
// them and \`net\` the net total off it — carried for display only; the index
// math uses \`gross\` against the course rating and slope.
export const HISTORY_ROUNDS = [
${roundLines.join("\n")}
];

// Everyone with at least one scored round, alphabetical.
export const HISTORY_PLAYERS = ${JSON.stringify(players, null, 2).replace(/\n/g, "\n")};

// The years the data covers, oldest first.
export const HISTORY_YEARS = ${JSON.stringify(years)};
`;

mkdirSync(join(ROOT, "src", "data"), { recursive: true });
writeFileSync(join(ROOT, "src", "data", "history.js"), out);

console.log(`src/data/history.js — ${rounds.length} rounds, ${Object.keys(courses).length} courses, ${players.length} players, ${years[0]}–${years[years.length - 1]}`);
if (missingRatings.length) console.warn(`  courses with no rating/slope (their rounds get no differential): ${missingRatings.join(", ")}`);
if (skipped.length) console.warn(`  rounds with no course row, dropped: ${skipped.join(", ")}`);
