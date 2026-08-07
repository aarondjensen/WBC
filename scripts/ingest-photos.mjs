// ══════════════════════════════════════════════════════════════════
//  ingest-photos — a folder of originals → an edition's deployable archive.
// ══════════════════════════════════════════════════════════════════
//
// Seventeen years of WBC photos are not going into Firebase Storage: no free
// object-store tier is that big, and the ones that come close bill for the
// overage rather than stopping. They go to a Cloudflare Pages project per
// edition — unlimited bandwidth, 20,000 files, no payment method on the
// account at all — and this script is what turns a pile of originals into
// something deployable to one. See src/lib/media.js for the whole scheme.
//
// It reads originals and writes derivatives. It never writes to Firestore and
// never touches the source folder — importing the index is a separate step,
// scripts/import-media-index.mjs, run after the deploy actually succeeds.
//
// ── Running it ────────────────────────────────────────────────────
//   node scripts/ingest-photos.mjs --edition 2019 --from ~/photos/wbc-2019
//   node scripts/ingest-photos.mjs --edition 2019 --from ~/p --out build/2019
//   node scripts/ingest-photos.mjs --edition 2019 --from ~/p --limit 20
//
// Then, once it has printed a capacity line you are happy with:
//
//   npx wrangler pages deploy <out> --project-name wbc-photos-2019
//   node scripts/import-media-index.mjs --edition 2019 --manifest <out>/manifest.json --write
//
// ── What it does to each photo ────────────────────────────────────
// Two WebP renditions, exactly what the browser uploader produces so the two
// paths cannot drift: a 1600px display copy and a 400px centre-cropped square
// thumbnail. Nothing is ever upscaled.
//
// EXIF orientation is APPLIED, not carried. sharp's .rotate() with no argument
// bakes in the orientation flag and strips it, which is the difference between
// an archive that renders correctly and one where a third of 2016 is sideways
// — a failure that does not show up in any photo viewer, because they all
// honour the flag this script is removing.
//
// EXIF DateTimeOriginal becomes takenAt. This is the reason ingest happens in
// Node rather than in the browser: file dates on a 2014 photo are the day
// somebody copied it off a laptop, and only EXIF knows it is from 2014. That
// date is what the gallery sorts and groups by.
//
// ── Ids are content hashes, on purpose ────────────────────────────
// A seventeen-year archive assembled from laptops, phones, an old NAS and
// three people's Dropbox folders contains the same photo several times. A
// content-addressed id makes that free: identical bytes produce one id, one
// pair of files and one index row, no matter how many copies of it the source
// folders hold.
//
// It also makes the script idempotent. Re-running after adding a folder emits
// the same ids for everything already processed, so the deploy uploads only
// what is new and the index import overwrites rather than duplicates.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import exifr from "exifr";
import {
  DISPLAY_EDGE, THUMB_EDGE, WEBP_QUALITY, THUMB_QUALITY,
  HOSTS, KINDS, mediaDocId, archivePaths, archiveProject,
  resizePlan, squareCropPlan, projectCapacity, PHOTOS_PER_PROJECT,
} from "../src/lib/media.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const EDITION = argOf("--edition");
const FROM = argOf("--from");
const OUT = argOf("--out") || (EDITION ? join(ROOT, "build", "photos", EDITION) : null);
const LIMIT = Number(argOf("--limit")) || Infinity;
const ROUND = Number(argOf("--round")) || null;

const die = (...lines) => { console.error(["", ...lines].join("\n")); process.exit(1); };

if (!EDITION || !FROM) {
  die("Usage: node scripts/ingest-photos.mjs --edition <slug> --from <folder> [--out <folder>] [--round N] [--limit N]",
      "",
      "  --edition  the edition slug, e.g. 2019 (not wbc_2019)",
      "  --from     folder of originals; searched recursively",
      "  --out      where the derivatives go (default build/photos/<edition>)",
      "  --round    tag every photo in this run with a round number",
      "  --limit    stop after N photos, for a trial run");
}
if (!existsSync(FROM)) die(`No such folder: ${FROM}`);

// What is worth trying to decode. Anything else in the folder — a .txt, a
// Takeout .json sidecar, a .mov — is skipped silently rather than reported as
// a failure, because a real archive folder is full of them.
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff", ".gif", ".bmp", ".avif"]);
// Video is not built yet — the schema carries `kind` from the first document
// so it can be added without a migration. Naming the extensions here means the
// run can COUNT what it is skipping, which is the number that decides whether
// video is worth building.
const VIDEO_EXT = new Set([".mov", ".mp4", ".m4v", ".avi", ".mkv", ".3gp", ".mts"]);

const walk = (dir, found = []) => {
  for (const name of readdirSync(dir)) {
    // Skip the junk that macOS and Windows leave in photo folders; ._foo files
    // in particular are resource forks that look like real photos by extension
    // and fail to decode one at a time.
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
};

// ── When was it taken ──────────────────────────────────────────────
// DateTimeOriginal first — the camera's own answer. CreateDate second. The
// file's mtime is the last resort and is usually the day the photo was copied
// somewhere, which is why it is last rather than first.
const takenAtOf = async (file, stat) => {
  try {
    const tags = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"] });
    const d = tags?.DateTimeOriginal || tags?.CreateDate || tags?.ModifyDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  } catch {
    // A photo with no readable EXIF is normal — a screenshot, a scan, anything
    // that has been through a resizer. Fall through to the file date.
  }
  return new Date(stat.mtimeMs).toISOString();
};

// ── Decoding ───────────────────────────────────────────────────────
// sharp's prebuilt libvips carries HEIF input on most platforms, but not all,
// and an iPhone archive is mostly HEIC. When it is missing, fall back to
// heic-convert — imported lazily so it costs nothing on the normal path.
const toSharp = async (buf, file) => {
  try {
    const img = sharp(buf, { failOn: "none" });
    await img.metadata();
    return img;
  } catch (e) {
    if (!/heif|heic/i.test(String(e?.message)) && !/heic|heif/i.test(extname(file))) throw e;
    const { default: heicConvert } = await import("heic-convert");
    const jpeg = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.92 });
    return sharp(jpeg, { failOn: "none" });
  }
};

const process1 = async (file, stat) => {
  const buf = readFileSync(file);
  // Content-addressed: identical bytes anywhere in the source tree collapse to
  // one photo. 12 hex characters is 48 bits — for an archive of tens of
  // thousands, a collision is not something that happens.
  const id = createHash("sha1").update(buf).digest("hex").slice(0, 12);

  // .rotate() with no argument applies the EXIF orientation and clears the
  // flag. It must come before any resize, or the resize computes against the
  // unrotated dimensions and the crop lands in the wrong place.
  const src = (await toSharp(buf, file)).rotate();
  const meta = await src.metadata();
  // After .rotate() the reported width/height are still the stored ones, so a
  // portrait photo tagged sideways reports landscape. Swap them for the
  // orientations that mean "rotated 90°", or every portrait photo gets a crop
  // computed against dimensions it does not have.
  const swapped = meta.orientation >= 5 && meta.orientation <= 8;
  const w = swapped ? meta.height : meta.width;
  const h = swapped ? meta.width : meta.height;
  if (!w || !h) throw new Error("no dimensions");

  const plan = resizePlan(w, h, DISPLAY_EDGE);
  const crop = squareCropPlan(w, h, THUMB_EDGE);

  await src
    .clone()
    .resize(plan.w, plan.h, { fit: "fill" })
    .webp({ quality: Math.round(WEBP_QUALITY * 100) })
    .toFile(join(OUT, `${id}.webp`));

  await src
    .clone()
    .extract({ left: crop.sx, top: crop.sy, width: crop.size, height: crop.size })
    .resize(crop.edge, crop.edge, { fit: "fill" })
    .webp({ quality: Math.round(THUMB_QUALITY * 100) })
    .toFile(join(OUT, `${id}_thumb.webp`));

  const urls = archivePaths(EDITION, id);
  return {
    id: mediaDocId(EDITION, id),
    mediaId: id,
    tournament_id: `wbc_${EDITION}`,
    edition: EDITION,
    kind: KINDS.photo,
    host: HOSTS.pages,
    url: urls.full,
    thumbUrl: urls.thumb,
    w: plan.w,
    h: plan.h,
    round: ROUND,
    caption: "",
    // An imported photo has no uploader. Leaving this empty rather than
    // inventing one is what keeps the archive director-only to delete: the
    // member branch of the rule matches on uploadedBy == your uid, and no
    // uid is the empty string.
    uploadedBy: "",
    uploadedByName: "",
    takenAt: await takenAtOf(file, stat),
    createdAt: new Date().toISOString(),
    source: relative(FROM, file),
  };
};

// ── Run ────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });

const all = walk(FROM);
const photos = all.filter(f => IMAGE_EXT.has(extname(f).toLowerCase()));
const videos = all.filter(f => VIDEO_EXT.has(extname(f).toLowerCase()));
const other = all.length - photos.length - videos.length;

console.log(`\nEdition   ${EDITION}`);
console.log(`From      ${FROM}`);
console.log(`Out       ${OUT}`);
console.log(`Found     ${photos.length} photos, ${videos.length} videos (skipped), ${other} other files (skipped)\n`);

if (!photos.length) die("Nothing to do.");

const rows = [];
const seen = new Set();
const failures = [];
let duplicates = 0;

// Four at a time. sharp releases the event loop during its own work, so this
// is close to linear in cores; going wider mostly increases peak memory, and
// peak memory is what kills a run over ten thousand photos.
const POOL = 4;
const queue = photos.slice(0, LIMIT === Infinity ? photos.length : LIMIT);
let cursor = 0;
let done = 0;

const worker = async () => {
  for (;;) {
    const i = cursor++;
    if (i >= queue.length) return;
    const file = queue[i];
    try {
      const row = await process1(file, statSync(file));
      if (seen.has(row.mediaId)) duplicates += 1;
      else { seen.add(row.mediaId); rows.push(row); }
    } catch (e) {
      // One unreadable file must not end a run of ten thousand. Collect and
      // report at the end — a list of what could not be read is actionable,
      // a stack trace halfway through is not.
      failures.push([file, String(e?.message || e).slice(0, 100)]);
    }
    done += 1;
    if (done % 50 === 0 || done === queue.length) {
      process.stdout.write(`\r  processed ${done}/${queue.length}`);
    }
  }
};

await Promise.all(Array.from({ length: POOL }, worker));
process.stdout.write("\n");

rows.sort((a, b) => (a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0));
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ edition: EDITION, generatedAt: new Date().toISOString(), items: rows }, null, 2));

const cap = projectCapacity(rows.length);
console.log(`\nWrote     ${rows.length} photos → ${cap.files} files in ${OUT}`);
if (duplicates) console.log(`Duplicates ${duplicates} identical photos collapsed onto an existing id`);
if (failures.length) {
  console.log(`\nCould not read ${failures.length}:`);
  for (const [f, why] of failures.slice(0, 20)) console.log(`  ${relative(FROM, f)} — ${why}`);
  if (failures.length > 20) console.log(`  …and ${failures.length - 20} more`);
}

// ── The capacity line ──────────────────────────────────────────────
// Printed on every run, and it is not decoration. Cloudflare refuses the WHOLE
// deploy over 20,000 files, after uploading, so finding out from wrangler
// means finding out at the end of a long upload rather than here.
console.log(`\nCloudflare Pages project: ${archiveProject(EDITION)}`);
if (cap.over) {
  console.log(`  ${cap.files} files EXCEEDS the free plan's ${cap.cap}. Split this edition across two projects,`);
  console.log(`  or drop the near-duplicates — the deploy will be refused as it stands.`);
} else {
  console.log(`  ${cap.files} of ${cap.cap} files used — room for ${cap.remaining} more photos (cap ${PHOTOS_PER_PROJECT}/project).`);
}

console.log(`\nNext:`);
console.log(`  npx wrangler pages deploy ${OUT} --project-name ${archiveProject(EDITION)}`);
console.log(`  node scripts/import-media-index.mjs --edition ${EDITION} --manifest ${join(OUT, "manifest.json")} --write\n`);

if (videos.length) {
  console.log(`${videos.length} videos were skipped — video is not built yet. The wbc_media schema`);
  console.log(`carries \`kind\` already, so adding it later needs no migration.\n`);
}
