// ══════════════════════════════════════════════════════════════════
//  screenshots — the store listing's images, at both stores' sizes
// ══════════════════════════════════════════════════════════════════
//
//   npm run shots                    # both stores, from the live site
//   npm run shots -- --local         # against `npm run dev` instead
//   npm run shots -- --edition wbc_2024
//   npm run shots -- --only apple
//   npm run shots -- --headless     # once the profile is already signed in
//
// First run opens a real browser window and waits for you to sign in. The
// profile is kept in .screenshot-profile/, so every run after that goes
// straight to capturing.
//
// ── Why this is a script and not six taps on a phone ──────────────
// Three details are easy to get wrong by hand, and two of them fail at the
// upload screen rather than on the page:
//
//   THE TWO STORES WANT DIFFERENT SIZES, and one set cannot serve both. Apple
//   requires 1290x2796 for the 6.9" iPhone. Play rejects any image whose
//   longer side is more than twice the shorter, and 1290x2796 is 2.17:1 — so
//   the size Apple demands is a size Play refuses. Both sets, every time.
//
//   PLAY REJECTS AN ALPHA CHANNEL, which is exactly what a browser or a
//   simulator hands you, and the error it gives does not mention
//   transparency. Every Play image is flattened onto the app's own background
//   before it is written.
//
//   AND GUEST MODE PUTS A BANNER ON EVERY SCREEN. "GUEST PREVIEW — NOTHING YOU
//   TAP IS SAVED" is the right answer for an App Review reviewer and the wrong
//   one for a store page. Hence the signed-in profile: it is the only reason
//   this needs a browser it can keep.
//
// ── Which edition ─────────────────────────────────────────────────
// A FINISHED one, by default the newest that has actually been played. The
// upcoming year has empty boards, no settled side games and no champion, and
// an empty leaderboard is a poor advertisement for a leaderboard. The active
// edition is a per-device pointer in localStorage, so this sets it before the
// app boots rather than driving the picker.
//
// It also refuses the sandbox outright. Its header says DEMO Sandbox, which is
// exactly what it is for and exactly wrong on a store page.
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};

const BASE = args.includes("--local") ? "http://localhost:5173/" : "https://wannabecup.com/";
const EDITION = flag("edition");
const ONLY = flag("only");
const PROFILE = path.resolve(".screenshot-profile");
const OUT = path.resolve("store/screenshots");

// The app's own background, for flattening Play's images onto something rather
// than onto white. Matches K.bg / the theme-color meta.
const BG = "#080f1a";

// ── The two targets ────────────────────────────────────────────────
// Expressed as CSS pixels x a device scale factor, because that is what the
// browser takes and what makes the output land on the exact number the store
// wants rather than near it.
//
//   apple  430x932 @3  = 1290x2796  — App Store Connect's 6.9" iPhone slot,
//                                     the only iPhone size still required.
//                                     TARGETED_DEVICE_FAMILY = 1, so there is
//                                     no iPad set to take.
//   play   360x640 @3  = 1080x1920  — Google's recommended phone size, and a
//                                     16:9 that is comfortably inside the
//                                     2:1 limit. A taller 360x700 (1080x2100,
//                                     1.94:1) also passes and shows more of a
//                                     leaderboard, if you would rather.
const TARGETS = [
  { name: "apple", width: 430, height: 932, scale: 3, flatten: false },
  { name: "play", width: 360, height: 640, scale: 3, flatten: true },
];

// ── The shot list ──────────────────────────────────────────────────
// In the order they appear on the store page, which is the order they matter:
// most people see the first two and decide.
//
// `go` gets the page to the screen. Navigation is by the text on the tab
// because that is what survives a restyle — a class name or a nth-child would
// not, and a screenshot script that silently captures the wrong screen is
// worse than one that fails.
const SHOTS = [
  {
    file: "01-leaderboard",
    why: "Who is winning. The app's whole answer, on a full field.",
    go: async () => {},
  },
  {
    file: "02-scoring",
    why: "The screen the app is actually used on, mid-round.",
    go: async (p) => tap(p, "Scoring"),
  },
  {
    file: "03-pairings",
    why: "The draw and the tee sheet.",
    go: async (p) => tap(p, "Pairings"),
  },
  {
    file: "04-skins",
    why: "Side games scored off the cards. Check this one for stray zeros.",
    go: async (p) => { await tap(p, "Betting"); await tap(p, "Skins"); },
  },
  {
    file: "05-tournaments",
    why: "Seventeen editions deep — this is the one that shows it is not a weekend project.",
    go: async (p) => { await tap(p, "More"); await tap(p, "Tournaments"); },
  },
];

const tap = async (page, text) => {
  await page.getByText(text, { exact: false }).first().click({ timeout: 10000 });
  await page.waitForTimeout(1200);
};

const ask = (q) => new Promise(res => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, a => { rl.close(); res(a); });
});

// Signed in, or still looking at the door? The sign-in screen is the one place
// the guest button lives, so its absence is the signal — and it is a more
// honest check than looking for a tab, which a half-loaded app also lacks.
const signedIn = async (page) =>
  (await page.getByText("No account needed", { exact: false }).count()) === 0;

// Every shot that did not land. Counted rather than shrugged off: a run that
// captures two of five and prints "Done" is the shape of a store upload with
// three screenshots missing, discovered at the upload screen.
const missed = [];

async function capture(target) {
  const dir = path.join(OUT, target.name);
  await mkdir(dir, { recursive: true });
  for (const f of await readdir(dir).catch(() => [])) await unlink(path.join(dir, f));

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    // Headed by default, because the first run has to let you sign in. Once
    // the profile holds a session, --headless is faster and does not steal
    // focus every few seconds.
    headless: args.includes("--headless"),
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: target.scale,
    isMobile: true,
    hasTouch: true,
    args: ["--hide-scrollbars"],
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // The active edition is a localStorage pointer read at boot, so it is set
  // before the app's first load rather than by driving the picker — which
  // would mean a hard reload anyway (see switchEdition in lib/editions).
  if (EDITION) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(e => localStorage.setItem("wbc_active_edition", e), EDITION);
  }
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  if (!await signedIn(page) && !process.stdin.isTTY) {
    await ctx.close();
    throw new Error(
      "Not signed in, and nothing here can ask. Run it once from a terminal, " +
      "headed, and sign in — the profile is reused after that.");
  }
  if (!await signedIn(page)) {
    console.log(`\n  Sign in in the browser window that just opened, then come back here.`);
    console.log(`  Shoot signed in, not as a guest: guest mode banners every screen.`);
    await ask("  Press Enter once you are looking at the leaderboard… ");
    await page.waitForTimeout(1500);
  }
  if (!await signedIn(page)) {
    await ctx.close();
    throw new Error("Still on the sign-in screen — nothing captured.");
  }

  for (const shot of SHOTS) {
    try {
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await shot.go(page);
      const png = await page.screenshot();
      const out = path.join(dir, `${shot.file}.png`);
      // Flattened for Play, and only for Play: it is the store that refuses an
      // alpha channel, and Apple is happy either way.
      if (target.flatten) await sharp(png).flatten({ background: BG }).png().toFile(out);
      else await sharp(png).png().toFile(out);
      const { width, height, channels } = await sharp(out).metadata();
      console.log(`  ${shot.file}.png  ${width}x${height}  ${channels}ch  — ${shot.why}`);
    } catch (e) {
      missed.push(`${target.name}/${shot.file}`);
      console.log(`  ${shot.file}: MISSED — ${String(e.message).split("\n")[0].slice(0, 90)}`);
    }
  }
  await ctx.close();
}

console.log(`\nWannabe Cup — store screenshots`);
console.log(`  from   ${BASE}`);
console.log(`  into   ${OUT}`);
if (EDITION) console.log(`  edition ${EDITION}`);
console.log(`\n  Shoot a FINISHED edition — an upcoming year's boards are empty.`);
console.log(`  Never the sandbox: its header says DEMO Sandbox.\n`);

for (const t of TARGETS) {
  if (ONLY && ONLY !== t.name) continue;
  console.log(`${t.name}: ${t.width * t.scale}x${t.height * t.scale}${t.flatten ? " (alpha flattened)" : ""}`);
  await capture(t);
  console.log("");
}

if (missed.length) {
  console.log(`INCOMPLETE — ${missed.length} shot${missed.length === 1 ? "" : "s"} did not land:`);
  for (const m of missed) console.log(`  ${m}`);
  console.log(`\nUsually the app was not on the screen the shot expected: a round with`);
  console.log(`no draw has no Scoring tab to tap, and a tab renamed here is a tap that`);
  console.log(`finds nothing. Fix the run or edit SHOTS, and go again.\n`);
  process.exitCode = 1;
} else {
  console.log(`Done — every shot landed.\n`);
}
console.log(`Look at all of them before uploading. This drives the app; it does not`);
console.log(`know whether the screen it caught was worth catching.\n`);
