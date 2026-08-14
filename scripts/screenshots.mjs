// ══════════════════════════════════════════════════════════════════
//  screenshots — the store listing's images, at both stores' sizes
// ══════════════════════════════════════════════════════════════════
//
//   npm run shots                    # both stores, from the live site
//   npm run shots -- --local         # against `npm run dev` instead
//   npm run shots -- --edition wbc_2024
//   npm run shots -- --only apple
//   npm run shots -- --headless      # no window; fine, nothing to sign in to
//   npm run shots -- --signed-in     # if you would rather sign in by hand
//
// It signs itself in as a GUEST and hides the guest banner. That is not a
// dodge — see below.
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
//   one for a store page.
//
// ── Why it shoots as a guest, and why that is honest ──────────────
// This began by signing in with a kept browser profile. That does not work and
// cannot be made to: GOOGLE REFUSES OAUTH INSIDE AN AUTOMATION-CONTROLLED
// BROWSER. It detects the DevTools protocol connection Playwright rides on and
// answers "Couldn't sign you in — this browser or app may not be secure",
// whatever the account. There is no flag for it, and working around it would
// mean defeating a security check on purpose.
//
// So it goes in through the front door the app already has: the guest button,
// which reads the same live tournament every player reads. Guest mode changes
// exactly two things on screen — the banner, and the Photos row in More — and
// the banner is hidden for the capture via `data-guest-strip` in App.jsx.
//
// Hiding it makes the screenshot MORE accurate, not less: the strip is an
// artifact of how the picture was taken, and no player signing in ever sees
// it. Every number, name and board behind it is the real tournament.
//
// The one thing it costs is the photo gallery, which guest mode hides
// deliberately. If you want that shot, take it by hand — the script says so
// rather than quietly shipping five where you asked for six.
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
const SIGNED_IN = args.includes("--signed-in");
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

// Past the door? The guest button lives on the sign-in screen and nowhere
// else, so its absence is the signal — a more honest check than looking for a
// tab, which a half-loaded app also lacks.
const inside = async (page) =>
  (await page.getByText("No account needed", { exact: false }).count()) === 0;

// In as a guest, with the banner taken off the picture. See the note at the
// top for why this is the front door rather than a shortcut past one.
const enterAsGuest = async (page) => {
  if (await inside(page)) return;
  await page.getByText("Live Leaderboard", { exact: false }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);
};

// Re-applied after every navigation: the app re-renders the strip on each
// screen, so hiding it once would only clean up the first shot.
const hideGuestStrip = (page) => page.addStyleTag({
  content: "[data-guest-strip]{display:none !important}",
}).catch(() => {});

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

  if (SIGNED_IN) {
    if (!await inside(page) && !process.stdin.isTTY) {
      await ctx.close();
      throw new Error("--signed-in needs a terminal to ask in, and there is none.");
    }
    if (!await inside(page)) {
      console.log(`\n  Sign in in the window that opened, then come back here.`);
      console.log(`  If Google refuses ("this browser may not be secure"), that is`);
      console.log(`  automation detection and it cannot be argued with — drop the`);
      console.log(`  --signed-in flag and let it shoot as a guest instead.`);
      await ask("  Press Enter once you are looking at the leaderboard… ");
    }
  } else {
    await enterAsGuest(page);
  }
  if (!await inside(page)) {
    await ctx.close();
    throw new Error("Never got past the sign-in screen — nothing captured.");
  }

  for (const shot of SHOTS) {
    try {
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      if (!SIGNED_IN) await enterAsGuest(page);
      await shot.go(page);
      await hideGuestStrip(page);
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
console.log(`  Never the sandbox: its header says DEMO Sandbox.`);
if (!SIGNED_IN) {
  console.log(`\n  Capturing as a guest, banner hidden. Same live tournament, same`);
  console.log(`  boards. The photo gallery is the one screen guest mode withholds —`);
  console.log(`  take that one by hand if you want it.`);
}
console.log("");

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
