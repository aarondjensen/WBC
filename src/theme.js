// ══════════════════════════════════════════════════════════════════
//  theme — the WBC palette and design tokens, in one place.
// ══════════════════════════════════════════════════════════════════
//
// `K` was defined inline in App.jsx and read ~650 times from there. It moved
// out the moment a second FILE needed it: the extracted Popup/ConfirmModal are
// part of the same visual system, and the alternative — passing the palette
// down as props, or each component keeping its own copy of the hexes — is how
// two greens drift apart.
//
// The scales below (FS, ALPHA, the segmented-control helpers) are ported from
// Bourbon Cup's src/theme.js, which is the app WBC is being aligned with. The
// COLORS stay WBC's: BC is amber-on-brown, WBC is teal, and matching the two
// apps' structure was never meant to mean repainting one of them.

// ══════════════════════════════════════════════════════════════════
//  Two palettes, one live object.
// ══════════════════════════════════════════════════════════════════
//
// `K` is read ~1,400 times as `style={{ color: K.t1 }}`, and 76 of those append
// two hex digits for opacity — `K.acc + ALPHA.wash`. That second habit rules out
// the obvious approach of making each token a CSS variable, because
// `var(--k-acc)14` is not a colour.
//
// So K stays a plain object of hex and is MUTATED in place by setTheme — the
// same live-binding trick App.jsx uses for NUM_ROUNDS. Every call site reads it
// during render, so pointing it at another palette and re-rendering repaints the
// app with no call site touched and every alpha-append still valid.
//
// ── Deriving the light palette ────────────────────────────────────
// Not picked by eye. Each light token was tuned until its contrast against the
// light background matched what its dark counterpart achieves against the dark
// one, so the hierarchy reads the same in both:
//
//   token   dark on bg   light on bg
//   t1        16.3          16.1     body text
//   t2         9.2           7.2     secondary
//   t3         5.8           5.6     the SMALL text — the note below
//   bdr        1.35          1.31    a hairline, not a boundary
//   card       1.08          1.09    a surface lifted off the page
//
// The accent is the one that cannot match. A teal bright enough to sit at 10:1
// on near-black is 1.9:1 on near-white — invisible. The light accent is a DARKER
// teal of the same hue at 4.9:1, which is AA for small text, and it has to be:
// `acc` is the leader's number and the finalized tick as often as it is a fill.
//
// That flip is why ON_ACC moves with the theme — dark ink on the bright teal,
// white on the dark one — and theme.test.js holds every one of these ratios.
const DARK = {
  bg: "#080f1a", card: "#0e1829", inp: "#0a1425", hover: "#142036",
  acc: "#22d3a7", accDim: "#0d9b73", accGlow: "rgba(34,211,167,0.12)",
  tourn: "#38bdf8", tournGlow: "rgba(56,189,248,0.12)",
  warn: "#f59e0b", danger: "#ef4444",
  // ── The two greys, brightened ──
  // These are read on a phone, outdoors, in sun, by people who are not
  // twenty-five. t3 was #526484, which is 3.2:1 on the background — under the
  // 4.5:1 that small text needs, and t3 is exactly where the SMALL text is:
  // the 9px grid cells, the labels under the score buttons, the hint lines.
  // Dim ink at 9px is the one combination the palette should never have made.
  //
  // The new pair keeps the same three-step hierarchy, measured on `bg`:
  //   t1 #e8edf5 — 16.3:1, unchanged; it was never the problem
  //   t2 #a3b4d4 —  9.2:1, was 7.1
  //   t3 #7b8eae —  5.8:1, was 3.2
  // Still plainly three weights of grey, but the bottom one now clears AA at
  // the sizes it is actually used at.
  t1: "#e8edf5", t2: "#a3b4d4", t3: "#7b8eae",
  bdr: "#1a2b47",
  // `par` has always been the same hex as t2 — a par is the score with no
  // colour of its own, printed in the muted ink — so it moves with it.
  eagle: "#3b82f6", birdie: "#22c55e", par: "#a3b4d4", bogey: "#eab308", dbl: "#ef4444",
  // Two aliases, because the same two hexes were being typed raw at ~30 call
  // sites to mean something that is NOT a score. Named separately so the
  // meaning is legible at the call site and so the scoring colors could ever
  // move without dragging every checkmark and minus sign along with them.
  ok: "#22c55e",    // done, saved, signed, moved up — a state that is complete
  under: "#ef4444", // ink for a number under par, the way a scorecard prints it
  // Won something. Skins, the round-complete header, your own name in a list.
  // This hex was borrowed from the tee-colour map — it is the gold TEE marker —
  // and typed raw at 11 call sites, which put a third warm tone on screen
  // beside `warn` (amber, 38°) and a stray lemon (50°) with nothing naming
  // which was which. The map keeps its own copy: a physical gold tee marker
  // and an achievement colour are the same hex today by coincidence, and
  // repainting one should never drag the other along.
  gold: "#d4a843",
  // The bottom nav bar's surface, and the dome the trophy sits in. Very
  // slightly lighter and more opaque than `card`: it sits over scrolling
  // content and has to stop it, which a flat `card` does not do.
  nav: "rgba(14,24,41,0.97)",
  // The raised surface a selected segment is drawn on. Lighter than `card` so
  // a thumb reads as lifted out of the track rather than merely tinted.
  thumb: "#1c2c47",
};

// The same tokens in daylight. Same hues, inverted lightness, every one checked
// against the light background rather than mechanically converted — the bright
// score colours in particular: #22c55e is 1.8:1 on white, so a birdie printed in
// it would be a rumour.
const LIGHT = {
  // The brand navy is the INK here — the same #080f1a the dark theme uses as its
  // page — and the greys above it are that navy lightened and desaturated rather
  // than a neutral slate borrowed from nowhere. It is why the two themes read as
  // one app rather than two: the light one is the dark one turned inside out.
  bg: "#f2f5f9", card: "#ffffff", inp: "#e8edf4", hover: "#dde4ef",
  acc: "#0b7a5c", accDim: "#065f47", accGlow: "rgba(11,122,92,0.12)",
  tourn: "#0369a1", tournGlow: "rgba(3,105,161,0.12)",
  warn: "#a35a00", danger: "#c02626",
  t1: "#080f1a", t2: "#364763", t3: "#546683",
  bdr: "#ccd6e4",
  // `par` tracks t2 in daylight too — a par is the score with no colour of its
  // own, printed in the muted ink.
  eagle: "#1d4ed8", birdie: "#15803d", par: "#364763", bogey: "#a16207", dbl: "#c02626",
  ok: "#15803d",
  under: "#c02626",
  gold: "#8a6a10",
  // White rather than `card`, and near-opaque for the same reason the dark one
  // is: this bar sits over scrolling content and has to stop it.
  nav: "rgba(255,255,255,0.97)",
  // Inverted relative to dark: there, a selected thumb is LIGHTER than the track
  // it sits in; here it has to be lighter still than a light track, so it is the
  // one pure white surface in the palette.
  thumb: "#ffffff",
};

export const THEMES = ["dark", "light"];
const PALETTES = { dark: DARK, light: LIGHT };
export const THEME_KEY = "wbc_theme";

// The live palette. Seeded from storage so the first paint is already right —
// see the pre-paint script in index.html, which reads the same key to set the
// page background before React exists.
const readStoredTheme = () => {
  try {
    const v = typeof localStorage !== "undefined" && localStorage.getItem(THEME_KEY);
    return THEMES.includes(v) ? v : "dark";
  } catch { return "dark"; }
};

let activeTheme = readStoredTheme();
export const getTheme = () => activeTheme;

export const K = { ...PALETTES[activeTheme] };

// Ink for a filled accent button. Which ink an accent button takes is decided
// by the FILL, not by the theme — K.bg happens to be near-black here, but
// spelling it out separately keeps that a deliberate contrast choice rather
// than a coincidence that breaks if the background ever lightens.
//
// It has to MOVE with the theme, which is why this is a `let`: ESM live bindings
// mean every `import { ON_ACC }` sees the reassignment, so setTheme can flip it
// without a single call site changing. Dark's teal is bright and takes near-black
// ink; light's teal is dark and takes white.
export let ON_ACC = activeTheme === "light" ? "#ffffff" : "#04121b";

// The same decision for the red fill, which lands on the other side of it: the
// danger red is dark enough to carry white, the teal is not. Written out for
// the same reason ON_ACC is — so a filled button never has to guess its ink.
export let ON_DANGER = "#ffffff";

export const FONT = "'Montserrat', sans-serif";

// ── Type scale ──
// Ported from Bourbon Cup, and it solves a problem WBC has in the same way:
// font sizes were picked per call site, so the same ROLE — a section eyebrow,
// a list row, a form label — came out at 9, 10, 11, 12 or 13 depending on
// which panel you were looking at. A 1px step is invisible on its own and
// indistinguishable from a mistake, which is exactly what lets it drift:
// there was no rung to snap to.
//
// Nine steps, named for the ROLE rather than the number, because the rule is
// "same role, same size" — not "sizes come from a list". Pick the entry whose
// description matches what you're rendering; if none fits, the answer is
// almost never a new number, it's that the thing is one of these in disguise.
//
// Every rung is one up from where it started (8/10/12/14/16/20/26/32/40). The
// bump is uniform on purpose: the scale's whole job is that a role has ONE
// size, and moving rungs by different amounts closes the gaps between them —
// at the bottom, where 9 and 11 already sit two apart, a rung that moved 2
// while its neighbour moved 1 would collide and the two roles would stop being
// distinguishable. One step everywhere keeps the shape and reads bigger
// exactly where it matters most: +12% on the 8px grid cells, +10% on the 10px
// labels, both of which were being read at arm's length on a tee box.
//
// The screens that must not scroll — Scoring, Leaderboard — were measured
// before and after. Scoring's controls are fixed-height boxes (44px score
// buttons, 32px hole tiles) with text inside them, so a rung costs a few
// pixels of line box rather than a row: the whole screen grew 7px against 100
// of headroom. The leaderboard fits its own rows to the space it has and picks
// its rung from that, so height absorbs itself there — but its columns are
// FIXED PIXEL WIDTHS (LB_COL in App.jsx: 24px for a prior round, 34px for
// thru), and that is what caps this bump at one rung. Two rungs put "+18" at
// 14px into a 24px column with nothing either side of it, and a tee time of
// "10:24a" into 34px. A rung is worth having; a clipped total is not.
export const FS = {
  micro:    9, // dense grid cells, scorecard column heads, tiny badges
  label:   11, // all-caps eyebrows/section labels, hint + helper prose
  small:   13, // list rows, secondary body copy, pill and segmented buttons
  body:    15, // form inputs, standard buttons, player names, dialog titles
  lead:    17, // key values, primary CTAs, panel and screen titles
  title:   21, // hero numerics, oversized nav glyphs
  hero:    27, // the active hole number
  display: 33, // large empty-state icons, headline totals
  jumbo:   41, // full-screen empty-state icons
};
// The rungs in order, for the one case the scale cannot express as a constant:
// a size that is COMPUTED. The leaderboard fits its rows to whatever height it
// has, and inside a row the name and total sit a step above that fitted size
// while thru and the prior rounds sit a step below it.
// Written as `rowStyle.fontSize + 1` that arithmetic lands between rungs — a
// 12 becomes a 13 — which is the exact drift the scale exists to stop. Stepping
// the ladder cannot: it returns a rung or it returns what you gave it.
export const FS_RUNGS = [FS.micro, FS.label, FS.small, FS.body, FS.lead, FS.title, FS.hero, FS.display, FS.jumbo];
export const fsStep = (size, n) => {
  const i = FS_RUNGS.indexOf(size);
  if (i === -1) return size;
  return FS_RUNGS[Math.min(FS_RUNGS.length - 1, Math.max(0, i + n))];
};

// One functional constraint rides on this scale: a text input below 16px makes
// iOS Safari zoom the page on focus and never zoom back out. Every field the
// director types free text into is therefore at FS.lead and stays there —
// condense those with padding, never by dropping a rung. The narrow numeric
// cells in the dense tee/pairing grids are the deliberate exception: they are
// steppers you tap, not fields you type into, and 16px will not fit nine of
// them across a phone.

// ── Corner radius ──
// Same story as the type scale: 15 different radii were in use, and 8/10/12
// already accounted for two thirds of them. A radius carries no layout — it
// cannot reflow anything — so the only thing distinguishing 6 from 8 was which
// call site you happened to be reading.
//
// Six rungs, named for the SIZE of the thing being rounded, since that is what
// actually decides it: a 12px swatch and a full-screen sheet cannot share a
// corner and look right.
export const R = {
  xs:   4,  // swatches, inline marks, the tightest grid inputs
  sm:   8,  // chips, badges, small controls
  md:  10,  // the default — controls inside a card
  lg:  12,  // cards and panels
  xl:  16,  // modals and bottom sheets
  pill: 20, // fully-rounded tracks and tags
};

// ── Motion ──
// One duration. The app carried seven spellings of four values — "0.2s" and
// ".2s" both appear — and nothing in the UI is doing anything different enough
// to need its own timing. Keyframe animations (the toast, the live pulse) keep
// their own, because those are motion with a shape rather than a state change.
export const MOTION = "0.2s";

// ── Alpha ladder ──
// Every K token is 6-digit hex, so a wash is made by appending two more
// characters: `K.acc + ALPHA.wash`. That freedom is why App.jsx carries a
// dozen different alpha levels on K.acc alone — "40", "50", "60", "06", "04",
// "08", "20", "25" — with no way to tell a considered value from a typo.
//
// Six rungs, each roughly 1.5–2× the last, which is about the smallest step
// that survives being painted over a card at 1px. The names describe
// STRENGTH; the roles listed are what each is usually for, not a fence.
export const ALPHA = {
  wash:  "14", //  8% — an accent breathed onto a surface; content reads on top
  tint:  "26", // 15% — that surface switched on: selected row, active chip
  hair:  "33", // 20% — a divider inside one list; a placeholder mark
  line:  "55", // 33% — the edge of a thing: card, chip, input, button, bar
  panel: "88", // 53% — a translucent surface that still reads as a surface
  held:  "99", // 60% — ink pulled back on purpose
  soft:  "bf", // 75% — ink pulled back far enough to still read
};

// Black, for the two things black is for. Neither is a theme color — a shadow
// is the absence of light regardless of palette.
// Both are black in the dark theme, where a shadow is a deeper hole in an
// already dark page. On a white one the same 33% reads as soot, so light gets a
// softer shadow — and a scrim that still has to darken the page enough to push a
// modal forward, which is the one place light does NOT go lighter.
export let SHADOW = activeTheme === "light" ? `#0b1b3a${ALPHA.hair}` : `#000000${ALPHA.line}`;
export let SCRIM  = activeTheme === "light" ? `#0b1b3a${ALPHA.held}`  : `#000000${ALPHA.held}`;

// ── setTheme ───────────────────────────────────────────────────────
// Mutates K in place rather than replacing it, so the ~1,400 call sites holding
// the same object reference all repaint. The caller re-renders; nothing here
// knows about React.
//
// The <html> data-theme attribute is for CSS that cannot read K — index.css
// paints the page background before React mounts, and the browser chrome colour
// rides the theme-color meta.
export const setTheme = (name) => {
  const next = THEMES.includes(name) ? name : "dark";
  activeTheme = next;
  Object.assign(K, PALETTES[next]);
  ON_ACC = next === "light" ? "#ffffff" : "#04121b";
  ON_DANGER = "#ffffff";
  SHADOW = next === "light" ? `#0b1b3a${ALPHA.hair}` : `#000000${ALPHA.line}`;
  SCRIM = next === "light" ? `#0b1b3a${ALPHA.held}` : `#000000${ALPHA.held}`;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(THEME_KEY, next);
  } catch { /* blocked storage */ }
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", K.bg);
  }
  return next;
};

export const toggleTheme = () => setTheme(activeTheme === "dark" ? "light" : "dark");

// ── The segmented control ──
// One definition of what "this one is selected" looks like, because WBC draws
// this control in four places at three sizes and every one of them rolled its
// own: the admin sub-tabs used an absolutely-positioned sliding pill, the
// settings modal used bordered buttons with a tinted background, the skins
// view used a third thing.
//
// Shape carries "selected" — a raised thumb in a recessed field, with a short
// accent rule under the label — so teal is left to mean accent. That matters
// here for the same reason it did in Bourbon Cup: the accent is also the
// finalized tick, the CTP flag and the leader's number, and it cannot be all
// of those AND the tab chrome.
//
// `compact` is the 10px-label size used inline on a form row; the rule scales
// with it so a small pill doesn't wear a smudge.
export const segThumb = (on, { compact = false, sunken = false } = {}) => ({
  background: on ? K.thumb : (sunken ? K.inp : "transparent"),
  color: on ? K.t1 : K.t3,
  border: "none",
  borderRadius: compact ? 14 : 16,
  position: "relative",
  // The lift. A step off the ALPHA ladder rather than a bespoke rgba — it is
  // a shadow, and a shadow is black at an alpha.
  boxShadow: on ? `0 1px 3px #000000${ALPHA.hair}` : "none",
});

// The field the thumb is raised out of. `compact` is the inline size, whose
// 2px of padding is what keeps a 10px-label row from growing a row taller.
export const segTrack = ({ compact = false } = {}) => ({
  display: "flex",
  background: K.inp,
  borderRadius: 20,
  padding: compact ? 2 : 3,
  // Transparent rather than absent: it holds the track at the height a
  // bordered one would be, so two of these never disagree by a pixel.
  border: "1px solid transparent",
});
