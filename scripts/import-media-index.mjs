// ══════════════════════════════════════════════════════════════════
//  import-media-index — a deployed archive's manifest → wbc_media.
// ══════════════════════════════════════════════════════════════════
//
// The third step of getting an edition's photos into the app, and the only one
// that touches Firestore:
//
//   1. node scripts/ingest-photos.mjs --edition 2019 --from <folder>
//   2. npx wrangler pages deploy <out> --project-name wbc-photos-2019
//   3. node scripts/import-media-index.mjs --edition 2019 --manifest <out>/manifest.json --write
//
// Step 2 before step 3, always. These documents are what makes a photo exist in
// the app, so importing them before the deploy lands puts a year of broken
// tiles in front of everybody for however long the upload takes. The script
// checks the deploy is live before writing (see --skip-check for the case where
// it genuinely is not, such as a rehearsal against the emulator).
//
// ── Dry run is the default ────────────────────────────────────────
//   node scripts/import-media-index.mjs --edition 2019 --manifest <path>
//   node scripts/import-media-index.mjs --edition 2019 --manifest <path> --write
//   node scripts/import-media-index.mjs --edition 2019 --manifest <path> --undo --write
//
// Credentials, and the wrong-project guard, work exactly as in
// scripts/import-history.mjs — same failure, same reason, same flag to
// override. See the long note in that file; it was written after 472 documents
// went into somebody else's database.
//
// ── Graduation ────────────────────────────────────────────────────
// This script is also how a finished edition LEAVES Firebase Storage. Running
// it for an edition whose photos are currently host "storage" rewrites those
// documents to host "pages" with archive URLs — the ids are content-addressed
// on one side and time-addressed on the other, so a graduating edition is
// re-ingested from the originals rather than translated, and the old rows are
// removed by --undo against the pre-graduation manifest.
//
// The bucket itself is emptied by hand afterwards, in the console, which is
// deliberate: an automated "delete a year of photos" that runs off a manifest
// is not something this repo should own.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOSTS, archiveProject } from "../src/lib/media.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const WRITE = args.includes("--write");
const UNDO = args.includes("--undo");
const SKIP_CHECK = args.includes("--skip-check");
const EDITION = argOf("--edition");
const MANIFEST = argOf("--manifest");
const allowProject = argOf("--allow-project");

const die = (...lines) => { console.error(["", ...lines].join("\n")); process.exit(1); };

if (!EDITION || !MANIFEST) {
  die("Usage: node scripts/import-media-index.mjs --edition <slug> --manifest <path> [--write] [--undo]",
      "",
      "  --edition     the edition slug, e.g. 2019",
      "  --manifest    manifest.json written by scripts/ingest-photos.mjs",
      "  --write       actually write; without it this is a dry run",
      "  --undo        delete exactly the documents this manifest would create",
      "  --skip-check  do not verify the Pages deploy is live first");
}
if (!existsSync(MANIFEST)) die(`No manifest at ${MANIFEST}`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch (e) {
  die("That manifest is not valid JSON.", `  ${MANIFEST}`, `  ${e.message}`);
}

const items = Array.isArray(manifest?.items) ? manifest.items : [];
if (!items.length) die("That manifest has no items.");
if (manifest.edition && manifest.edition !== EDITION) {
  die(`That manifest is for edition ${manifest.edition}, not ${EDITION}. Nothing was written.`,
      "",
      "Pass the edition the manifest was built for, or re-run ingest-photos for this one.");
}

// Every row the ingest script emits carries these. A manifest missing one has
// been hand-edited or produced by an older version, and a document without a
// url is a permanently broken tile.
const REQUIRED = ["id", "mediaId", "tournament_id", "edition", "kind", "host", "url", "thumbUrl"];
const malformed = items.filter(it => REQUIRED.some(f => !it?.[f]));
if (malformed.length) {
  die(`${malformed.length} of ${items.length} rows are missing required fields. Nothing was written.`,
      "",
      ...malformed.slice(0, 5).map(it => `  ${it?.mediaId || "(no id)"} — missing ${REQUIRED.filter(f => !it?.[f]).join(", ")}`));
}

// ── The wrong-project guard ───────────────────────────────────────
// Same guard, same reason as import-history.mjs.
const expectedProject = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, ".firebaserc"), "utf8"))?.projects?.default || null; }
  catch { return null; }
})();

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
let serviceAccount = null;

if (WRITE && !emulator) {
  if (!keyPath) {
    die("GOOGLE_APPLICATION_CREDENTIALS is not set. Nothing was written.",
        "",
        "  bash:        export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json",
        "  PowerShell:  $env:GOOGLE_APPLICATION_CREDENTIALS = \"C:\\path\\to\\key.json\"",
        "",
        "The key comes from Firebase Console -> Project Settings -> Service accounts",
        "-> Generate new private key. To rehearse with no key at all, set",
        "FIRESTORE_EMULATOR_HOST and point it at the emulator.");
  }
  let raw;
  try { raw = readFileSync(keyPath, "utf8"); }
  catch (e) { die("Can't read the service-account key. Nothing was written.", `  ${keyPath}`, `  ${e.message}`); }
  try { serviceAccount = JSON.parse(raw); }
  catch { die("The service-account key is not valid JSON. Nothing was written.", `  ${keyPath}`); }
  for (const field of ["project_id", "client_email", "private_key"]) {
    if (!serviceAccount[field]) {
      die(`That file is not a service-account key — no \`${field}\`. Nothing was written.`, `  ${keyPath}`);
    }
  }
  const target = serviceAccount.project_id;
  if (expectedProject && target !== expectedProject && target !== allowProject) {
    die("That key is for a DIFFERENT Firebase project. Nothing was written.",
        "",
        `  key points at:  ${target}`,
        `  .firebaserc:    ${expectedProject}`,
        "",
        "If that is genuinely where you meant to write, name it explicitly:",
        "",
        `  node scripts/import-media-index.mjs --allow-project ${target} ...`);
  }
}

// ── Is the deploy actually live? ──────────────────────────────────
// One HEAD request against the first photo's URL. This is the check that stops
// the ordering mistake the header warns about, and it is cheap enough to run
// on a dry run too — knowing the deploy is missing BEFORE writing is the whole
// value.
const archived = items.filter(it => it.host === HOSTS.pages);
if (archived.length && !SKIP_CHECK) {
  const probe = archived[0].thumbUrl;
  process.stdout.write(`Checking ${archiveProject(EDITION)} is live… `);
  try {
    const res = await fetch(probe, { method: "HEAD" });
    if (res.ok) {
      console.log("yes.");
    } else {
      console.log(`no (HTTP ${res.status}).`);
      die(`That photo is not being served yet:`,
          `  ${probe}`,
          "",
          "Deploy the archive first, then import the index:",
          `  npx wrangler pages deploy <out> --project-name ${archiveProject(EDITION)}`,
          "",
          "Or pass --skip-check if you know the deploy is on its way.");
    }
  } catch (e) {
    console.log("could not tell.");
    // A network failure is not proof the deploy is missing, and refusing to
    // import because a laptop is offline would be its own kind of wrong. Say
    // so and carry on — the --write flag is still the thing that decides.
    console.log(`  (${String(e?.message).slice(0, 80)})\n`);
  }
}

// ── Preview ───────────────────────────────────────────────────────
const byRound = items.reduce((acc, it) => {
  const k = it.round == null ? "unrounded" : `round ${it.round}`;
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});
const dates = items.map(it => it.takenAt).filter(Boolean).sort();

console.log(`\nEdition    ${EDITION}`);
console.log(`Manifest   ${MANIFEST}`);
console.log(`Photos     ${items.length}`);
console.log(`Dated      ${dates.length ? `${dates[0].slice(0, 10)} … ${dates.at(-1).slice(0, 10)}` : "—"}`);
console.log(`Grouped    ${Object.entries(byRound).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
console.log(`Collection wbc_media`);

if (!WRITE) {
  console.log(`\nDRY RUN — nothing written. ${UNDO ? "Would DELETE" : "Would write"} ${items.length} documents.`);
  console.log(`Add --write to ${UNDO ? "delete" : "import"} them.\n`);
  process.exit(0);
}

// ── The write half ────────────────────────────────────────────────
// Imported lazily so a dry run needs no credentials, same as import-history.
const { initializeApp, cert } = await import("firebase-admin/app");
const { getFirestore } = await import("firebase-admin/firestore");

initializeApp({
  projectId: serviceAccount?.project_id
    || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || "wbc-import",
  ...(serviceAccount ? { credential: cert(serviceAccount) } : {}),
});
const db = getFirestore();

// 500 is Firestore's hard limit on a batch; 400 leaves room and keeps a failed
// batch small enough to reason about.
const BATCH = 400;

// ── Undo ──────────────────────────────────────────────────────────
// Deletes exactly the documents this manifest describes, by id. Nothing else
// can be caught by it, and deleting an id that is not there is a no-op — so an
// undo of a partial import is safe.
//
// It does NOT remove the deployed files. Those are a Cloudflare Pages deploy;
// clearing them means re-deploying the project without them.
if (UNDO) {
  let removed = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = db.batch();
    for (const it of items.slice(i, i + BATCH)) batch.delete(db.collection("wbc_media").doc(String(it.id)));
    await batch.commit();
    removed += Math.min(BATCH, items.length - i);
    process.stdout.write(`\r  deleted ${removed}/${items.length}`);
  }
  console.log(`\n\nRemoved ${removed} index documents. The deployed files are untouched —`);
  console.log(`re-deploy ${archiveProject(EDITION)} without them to clear the bytes.\n`);
  process.exit(0);
}

let written = 0;
for (let i = 0; i < items.length; i += BATCH) {
  const batch = db.batch();
  for (const it of items.slice(i, i + BATCH)) {
    // merge:true so a re-import after fixing a caption or a round tag updates
    // rather than duplicating — the ids are content-addressed, so the same
    // photo always lands on the same document.
    batch.set(db.collection("wbc_media").doc(String(it.id)), it, { merge: true });
  }
  await batch.commit();
  written += Math.min(BATCH, items.length - i);
  process.stdout.write(`\r  wrote ${written}/${items.length}`);
}

console.log(`\n\nImported ${written} photos into wbc_media for ${EDITION}.`);
console.log(`Open the app, switch to ${EDITION} in Tournaments, and the gallery is under More → Photos.\n`);
