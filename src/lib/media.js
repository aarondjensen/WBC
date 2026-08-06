// ══════════════════════════════════════════════════════════════════
//  media — the photo library's paths, sizes and grouping.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React, no canvas. Same reason editionId.js is pure —
// firebase.js initializes an app at import time, so anything importing it is
// untestable in a plain unit test. The browser half (canvas resizing, the
// upload itself) lives in mediaUpload.js and imports THIS.
//
// ── Why the app does not host the photos ──────────────────────────
// Seventeen years of tournament photos is tens of gigabytes, and no object
// store gives that away. Firebase Storage's no-cost tier is single-digit GB
// and Cloudflare R2's is 10GB, and — the part that matters — both BILL past
// the line rather than stopping. A photo library that can mail you an invoice
// is not one this tournament wants.
//
// So the bytes live on hosts that hard-cap instead of charging, and Firestore
// holds only an INDEX. Three hosts, recorded per item in `host`:
//
//   storage  Firebase Storage. The only one a phone can write to, so it is
//            where the live tournament uploads. Bounded by graduation below.
//   pages    A Cloudflare Pages project per edition. Free plan is unlimited
//            bandwidth and unlimited requests, capped at 20,000 files and
//            25MiB per file, and takes no payment method at all — it cannot
//            produce a bill, only refuse a deploy. This is the archive.
//   youtube  Reserved. Video is not built yet (see the note on `kind` below).
//
// ── Graduation, and why the free tier holds ───────────────────────
// The live bucket would grow without bound if nothing emptied it, and then
// this is "free until 2031". So at the end of an edition its photos are
// deployed to that edition's Pages project and the bucket is cleared — see
// scripts/import-media-index.mjs. The bucket therefore never holds more than
// one tournament (~500 photos, ~140MB) and stays inside the no-cost tier
// permanently, rather than eventually.
//
// Graduation is a metadata rewrite: `host` flips and `url`/`thumbUrl` are
// repointed. Nothing else in the app knows an item moved, which is the whole
// reason the documents carry resolved URLs rather than a host plus a path.
//
// ── Why the documents carry URLs ──────────────────────────────────
// A Storage path is not a URL — resolving one needs an async getDownloadURL
// per item, and a 500-photo grid cannot make 500 round trips to draw itself.
// So the URL is resolved ONCE at upload and stored. `host` is then bookkeeping
// for graduation and deletion, not something a render path consults.

// ── Hosts ──────────────────────────────────────────────────────────
export const HOSTS = {
  storage: "storage",
  pages: "pages",
  youtube: "youtube",
};

// `kind` is on every document from the first one written, and the gallery
// switches on it, because the alternative is a migration over the whole index
// the day video is added. Only "photo" is produced today.
export const KINDS = {
  photo: "photo",
  video: "video",
};

// ── The two sizes ──────────────────────────────────────────────────
// A display image and a square thumbnail, both WebP. The grid loads only
// thumbnails; the full size is fetched when one is opened.
//
// 1600px is the point where a photo still looks right full-screen on a phone
// at 3x and the file lands around 250KB. The thumb at 400px covers a 2-across
// grid on the largest handset without the grid pulling megabytes to draw a
// screen of pictures nobody has tapped.
export const DISPLAY_EDGE = 1600;
export const THUMB_EDGE = 400;
export const WEBP_QUALITY = 0.8;
export const THUMB_QUALITY = 0.72;

// What a phone is allowed to hand us. This is the SOURCE cap, before resizing
// — a 45-megapixel raw off a mirrorless is not a tournament snapshot, and
// decoding one on a phone browser is how the tab dies. The resized upload is
// capped separately and far lower in storage.rules.
export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

// ── Cloudflare Pages capacity ──────────────────────────────────────
// The free plan's binding constraint is FILE COUNT, not bytes: 20,000 files
// per project, and every photo is two files (display + thumb). So a project
// holds 10,000 photos — around 2.75GB, nowhere near any size limit anybody
// would hit first.
//
// One project per edition keeps each one an order of magnitude under the cap
// and makes a re-deploy of 2014 not touch 2015. Cloudflare's soft limit is
// 100 projects per account, so seventeen editions leaves room for another
// eighty years of this tournament.
export const FILES_PER_PROJECT = 20000;
export const FILES_PER_PHOTO = 2;
export const PHOTOS_PER_PROJECT = FILES_PER_PROJECT / FILES_PER_PHOTO;

// The Pages project for an edition, by convention rather than configuration:
// the ingest script creates it and the deploy targets it, so a name that can
// be derived from the slug is one less thing to keep in sync.
export const archiveProject = (slug) => `wbc-photos-${slug}`;
export const archiveBase = (slug) => `https://${archiveProject(slug)}.pages.dev`;

// How full an edition's project is, for the ingest script to print. Returns
// the count, the cap and whether the deploy would be refused — Cloudflare
// rejects the whole deploy over the cap, so this has to be checked BEFORE
// uploading twenty thousand files, not after.
export const projectCapacity = (photoCount) => ({
  photos: photoCount,
  files: photoCount * FILES_PER_PHOTO,
  cap: FILES_PER_PROJECT,
  remaining: Math.max(0, PHOTOS_PER_PROJECT - photoCount),
  over: photoCount > PHOTOS_PER_PROJECT,
});

// ── Identity and paths ─────────────────────────────────────────────
// Document ids follow the same shape as every other edition-scoped id in the
// app (see lib/editionId.js): the slug is in the id, so two editions cannot
// collide even though their photos are otherwise unrelated.
export const mediaDocId = (slug, id) => `med_${slug}_${id}`;

// Where the bytes sit in the Storage bucket while an edition is live. Keyed by
// edition so graduating a year is a prefix listing rather than a query.
export const storagePaths = (slug, id) => ({
  full: `editions/${slug}/${id}.webp`,
  thumb: `editions/${slug}/${id}_thumb.webp`,
});

// The same two files once they are static assets in the edition's Pages
// project. The layout mirrors the bucket's so a graduated document's URLs can
// be rebuilt from its id alone if the index ever has to be regenerated.
export const archivePaths = (slug, id) => ({
  full: `${archiveBase(slug)}/${id}.webp`,
  thumb: `${archiveBase(slug)}/${id}_thumb.webp`,
});

// An id for a newly picked photo. Time-ordered prefix so a bucket listing and
// a directory listing both come out in upload order, which is what makes the
// ingest script's output diffable between runs.
export const photoId = (now, rand) => {
  const t = Number(now).toString(36).padStart(8, "0");
  const r = Math.floor(rand * 0x10000).toString(36).padStart(4, "0");
  return `${t}${r}`;
};

// ── Resizing, as arithmetic ────────────────────────────────────────
// The canvas work is in mediaUpload.js; the decisions are here so they can be
// tested without a DOM.

// Longest edge to `maxEdge`, aspect preserved, and NEVER upscaled — a 900px
// photo from 2009 stays 900px rather than being blown up to 1600 and made to
// look worse while costing more.
export const resizePlan = (w, h, maxEdge) => {
  const sw = Math.max(1, Math.round(w || 0));
  const sh = Math.max(1, Math.round(h || 0));
  const longest = Math.max(sw, sh);
  if (!maxEdge || longest <= maxEdge) return { w: sw, h: sh, scaled: false };
  const k = maxEdge / longest;
  return {
    w: Math.max(1, Math.round(sw * k)),
    h: Math.max(1, Math.round(sh * k)),
    scaled: true,
  };
};

// Thumbnails are square-cropped from the centre rather than letterboxed. A
// grid of mixed aspect ratios has ragged rows and no two photos the same size,
// which reads as a list of files instead of a contact sheet. The crop is the
// largest centred square the source contains.
export const squareCropPlan = (w, h, edge) => {
  const sw = Math.max(1, Math.round(w || 0));
  const sh = Math.max(1, Math.round(h || 0));
  const size = Math.min(sw, sh);
  return {
    sx: Math.round((sw - size) / 2),
    sy: Math.round((sh - size) / 2),
    size,
    // Same no-upscale rule as resizePlan: a source smaller than the thumb
    // target is written at its own size.
    edge: Math.min(edge, size),
  };
};

// ── What a phone is allowed to hand us ─────────────────────────────
// Returns a reason string rather than throwing, because every one of these is
// something to say to the person holding the phone, not an exception.
export const validateSource = (file) => {
  if (!file) return { ok: false, reason: "No file chosen." };
  const type = String(file.type || "");
  // HEIC off an iPhone reports as image/heic and some browsers report nothing
  // at all for it. Both are accepted here and sorted out at decode time — a
  // browser that cannot decode HEIC fails with a message, which is better than
  // rejecting a file the browser could actually have handled.
  if (type && !type.startsWith("image/")) {
    return { ok: false, reason: "That file is not a photo." };
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { ok: false, reason: "That photo is too large to upload." };
  }
  return { ok: true, reason: "" };
};

// ── Ordering and grouping ──────────────────────────────────────────
// When the photo was TAKEN, not when it was uploaded. An archive imported in
// one afternoon has seventeen years of identical createdAt values and only
// takenAt tells 2011 from 2019. Uploads fall back to createdAt when a photo
// carries no EXIF date, and those sort last within their day rather than
// jumping to 1970.
export const takenTime = (item) => {
  const t = Date.parse(item?.takenAt || "");
  if (!Number.isNaN(t)) return t;
  const c = Date.parse(item?.createdAt || "");
  return Number.isNaN(c) ? 0 : c;
};

// Newest first. An edition's gallery opens on the most recent thing that
// happened, which during a live tournament is the hole somebody just played.
export const sortByTaken = (items) =>
  [...(items || [])].sort((a, b) => takenTime(b) - takenTime(a));

// Rounds first, in order, then everything that belongs to the edition but not
// to a round — the dinner, the drive up, the trophy — under one heading at the
// end. Photos with no round are the norm for an imported archive, so the
// unrounded group is not an edge case and does not read as leftovers.
export const UNROUNDED_LABEL = "Around the tournament";

export const groupByRound = (items) => {
  const rounds = new Map();
  const loose = [];
  for (const item of sortByTaken(items)) {
    const r = Number(item?.round);
    if (Number.isFinite(r) && r > 0) {
      if (!rounds.has(r)) rounds.set(r, []);
      rounds.get(r).push(item);
    } else {
      loose.push(item);
    }
  }
  const groups = [...rounds.keys()]
    .sort((a, b) => a - b)
    .map(round => ({ round, label: `Round ${round}`, items: rounds.get(round) }));
  if (loose.length) groups.push({ round: null, label: UNROUNDED_LABEL, items: loose });
  return groups;
};

// ── The budget circuit breaker ─────────────────────────────────────
// Google Cloud budgets alert; they do not cap. The only native hard stop
// detaches the project from its billing account, which would take Firestore,
// the Cloud Functions and push down with it — the whole tournament app dark,
// plausibly mid-round, to save a sum smaller than one green fee.
//
// So the stop is scoped to the thing that can actually run away: photo
// uploads. functions/index.js listens to the budget's Pub/Sub topic and
// writes wbc_config/photos; this reads it. Scoring, leaderboards, pairings and
// notifications are untouched by design — a blown photo budget must never be
// able to stop somebody posting a score.
//
// Reading the gallery stays open when the breaker is tripped. Serving photos
// that already exist is bounded and cached; it is UPLOADING that adds bytes
// which then have to be served forever.
export const CONFIG_DOC = "wbc_config";
export const PHOTOS_CONFIG_ID = "photos";

// Missing config means allowed. The document does not exist until the breaker
// trips for the first time, and a photo library that refuses uploads because
// nobody has ever blown the budget would be a strange way to fail.
export const photoUploadsAllowed = (config) => !config?.uploadsDisabled;

// What to tell somebody holding a phone. Deliberately not "contact an
// administrator": on this tournament the director is standing next to them.
export const uploadsDisabledReason = (config) =>
  config?.reason || "Photo uploads are paused — this month's storage budget was reached.";

// ── Deletion ───────────────────────────────────────────────────────
// Who may remove a photo, decided here so the gallery and firestore.rules
// agree by construction rather than by both being edited carefully.
//
// A director may remove anything; everyone else may remove what they posted.
// Graduated photos are the exception: their bytes are static assets in a Pages
// deploy, and deleting the index document would leave an orphan file that only
// a re-deploy can remove. So the archive is director-only — the person who can
// also re-run the deploy that actually clears it.
export const canDelete = (item, { uid, isDirector }) => {
  if (!item || !uid) return false;
  if (item.host === HOSTS.pages) return !!isDirector;
  return !!isDirector || item.uploadedBy === uid;
};
