// ══════════════════════════════════════════════════════════════════
//  import-history — data/*.csv → Firestore, as real editions.
// ══════════════════════════════════════════════════════════════════
//
// Turns 2010–2025 into editions the app treats like any other: switch to 2015
// in Tournaments and the leaderboard, the scorecards and the round detail all
// work, because nothing about them is special-cased.
//
// WHAT DECIDES THE CONTENT IS NOT HERE. src/lib/historyImport.js builds every
// document and is tested against the real data — historyImport.fidelity.test.js
// runs all fourteen scored years through the actual board and checks each one
// crowns the champion it crowned and matches every recorded net and gross
// total. This file reads CSVs, prints, and writes.
//
// ── Running it ────────────────────────────────────────────────────
// Dry run is the DEFAULT. Nothing is written unless --write is passed:
//
//   node scripts/import-history.mjs                  # count and preview
//   node scripts/import-history.mjs --year 2015      # one year
//   node scripts/import-history.mjs --write          # actually write
//   node scripts/import-history.mjs --year 2015 --write
//
// Credentials: this uses the Firebase ADMIN SDK, which bypasses firestore.rules
// entirely — the rules allow `players`, `courses` and `tournament_rounds` to a
// director only, and a bulk import is not a signed-in phone. Point it at a
// service-account key:
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
//   node scripts/import-history.mjs --write
//
// Get one from Firebase Console → Project Settings → Service accounts →
// Generate new private key. It is a credential with full database access:
// do not commit it.
//
// ── Idempotent ────────────────────────────────────────────────────
// Every document id is derived from (year, round, player, hole), so a second
// run overwrites the first rather than duplicating it. Re-running after fixing
// a row in data/ is the intended way to correct an import.
//
// It does NOT delete: a year that lost rows in data/ keeps whatever was written
// before. Deleting an edition is a director action in the app, which is where
// the confirmation and the guard live.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEdition, countDocs } from "../src/lib/historyImport.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The same minimal RFC-4180 reader scripts/build-history.mjs uses — hole_pars
// and hole_handicaps are quoted fields carrying commas, so splitting on "," is
// not an option, and a CSV dependency for four files read once is not worth it.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

// pandas wrote whole numbers out of float columns, so year/round arrive as
// "2012.0". Everything numeric goes through here.
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const csv = (f) => parseCsv(readFileSync(join(ROOT, "data", f), "utf8"));
const list = (v) => String(v ?? "").split(",").map(Number).filter(Number.isFinite);

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const yearArg = args.indexOf("--year") >= 0 ? num(args[args.indexOf("--year") + 1]) : null;

const tournaments = csv("tournaments.csv");
const allRounds = csv("rounds.csv");
const allCourses = csv("courses.csv");
const allHoles = csv("holes.csv");

const years = tournaments
  .map(t => num(t.year))
  .filter(y => y && (!yearArg || y === yearArg))
  .sort((a, b) => a - b);

if (!years.length) {
  console.error(yearArg ? `No tournament for ${yearArg}.` : "No tournaments found in data/tournaments.csv.");
  process.exit(1);
}

const forYear = (rows, y) => rows.filter(r => num(r.year) === y);

const editions = years.map(y => {
  const t = tournaments.find(r => num(r.year) === y);
  return buildEdition({
    tournament: { year: y, num_rounds: num(t.num_rounds), champion: t.champion },
    rounds: forYear(allRounds, y).map(r => ({
      round: num(r.round), player: r.player, course_handicap: num(r.course_handicap),
    })),
    courses: forYear(allCourses, y).map(c => ({
      round: num(c.round), course: c.course,
      rating: num(c.rating), slope: num(c.slope), par: num(c.par),
      hole_pars: list(c.hole_pars), hole_handicaps: list(c.hole_handicaps),
    })),
    holes: forYear(allHoles, y).map(h => ({
      round: num(h.round), player: h.player, hole: num(h.hole), gross: num(h.gross),
    })),
  });
});

const COLLECTIONS = ["wbc_editions", "tournament_state", "tournament_players",
                     "courses", "tournament_rounds", "tee_assignments", "hole_scores"];

console.log(WRITE ? "WRITING to Firestore\n" : "DRY RUN — nothing will be written. Pass --write to commit.\n");
console.log("year   players  rounds  holes   docs");
let total = 0;
for (const e of editions) {
  const n = countDocs(e);
  total += n;
  console.log(
    String(e.year).padEnd(7) +
    String(e.tournament_players.length).padEnd(9) +
    String(e.tournament_rounds.length).padEnd(8) +
    String(e.hole_scores.length).padEnd(8) +
    String(n));
}
console.log(`\n${editions.length} editions, ${total} documents.`);

// Years with a roster and no card. Named rather than left to look like a bug:
// 2010 and 2011 recorded a champion and who showed up, never a score.
const scoreless = editions.filter(e => e.hole_scores.length === 0).map(e => e.year);
if (scoreless.length) {
  console.log(`\n${scoreless.join(", ")}: roster only — those tournaments recorded no scores.`);
}

if (!WRITE) {
  const sample = editions.find(e => e.hole_scores.length);
  if (sample) {
    console.log(`\nSample documents from ${sample.year}:`);
    for (const c of COLLECTIONS) {
      if (sample[c]?.length) console.log(`  ${c}: ${JSON.stringify(sample[c][0])}`);
    }
  }
  process.exit(0);
}

// ── The write half ────────────────────────────────────────────────
// Imported lazily so a dry run needs no credentials and no firebase-admin
// install — which is what makes the preview above runnable by anybody.
const { initializeApp, cert, applicationDefault } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");

// The emulator needs no credential, and rehearsing the write there is the way
// to see what 8,000 documents look like before any of them are real:
//
//   firebase emulators:exec --only firestore \
//     "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run import:history -- --write"
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!emulator && !keyPath) {
  console.error("\nGOOGLE_APPLICATION_CREDENTIALS is not set — see the header of this file.");
  console.error("To rehearse against the emulator instead, set FIRESTORE_EMULATOR_HOST.");
  process.exit(1);
}
if (emulator) console.log(`Emulator at ${emulator} — this is a rehearsal, not the live database.\n`);
initializeApp({
  projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || "wbc-import",
  ...(keyPath ? { credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))) }
              : emulator ? {} : { credential: applicationDefault() }),
});
const db = getFirestore();

// 500 is Firestore's hard limit on a batch; 400 leaves room and keeps a failed
// batch small enough to reason about.
const BATCH = 400;
let written = 0;
for (const e of editions) {
  for (const c of COLLECTIONS) {
    const docs = e[c] || [];
    for (let i = 0; i < docs.length; i += BATCH) {
      const batch = db.batch();
      for (const d of docs.slice(i, i + BATCH)) {
        // merge:true so a re-run corrects rather than replaces, and so an
        // edition a director has since edited in the app keeps those edits on
        // fields this import does not set.
        batch.set(db.collection(c).doc(String(d.id)), d, { merge: true });
      }
      await batch.commit();
      written += Math.min(BATCH, docs.length - i);
      process.stdout.write(`\r${written}/${total} documents…`);
    }
  }
}
console.log(`\rWrote ${written} documents across ${editions.length} editions.        `);
console.log("\nSwitch to any year in More → Tournaments to see it.");
