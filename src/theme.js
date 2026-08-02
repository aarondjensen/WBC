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

export const K = {
  bg: "#080f1a", card: "#0e1829", inp: "#0a1425", hover: "#142036",
  acc: "#22d3a7", accDim: "#0d9b73", accGlow: "rgba(34,211,167,0.12)",
  tourn: "#38bdf8", tournGlow: "rgba(56,189,248,0.12)",
  warn: "#f59e0b", danger: "#ef4444",
  t1: "#e8edf5", t2: "#8b9ec2", t3: "#526484",
  bdr: "#1a2b47",
  eagle: "#3b82f6", birdie: "#22c55e", par: "#8b9ec2", bogey: "#eab308", dbl: "#ef4444",
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

// Ink for a filled accent button. Which ink an accent button takes is decided
// by the FILL, not by the theme — K.bg happens to be near-black here, but
// spelling it out separately keeps that a deliberate contrast choice rather
// than a coincidence that breaks if the background ever lightens.
export const ON_ACC = "#04121b";

// The same decision for the red fill, which lands on the other side of it: the
// danger red is dark enough to carry white, the teal is not. Written out for
// the same reason ON_ACC is — so a filled button never has to guess its ink.
export const ON_DANGER = "#ffffff";

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
export const FS = {
  micro:    8, // dense grid cells, scorecard column heads, tiny badges
  label:   10, // all-caps eyebrows/section labels, hint + helper prose
  small:   12, // list rows, secondary body copy, pill and segmented buttons
  body:    14, // form inputs, standard buttons, player names, dialog titles
  lead:    16, // key values, primary CTAs, panel and screen titles
  title:   20, // hero numerics, oversized nav glyphs
  hero:    26, // the active hole number
  display: 32, // large empty-state icons, headline totals
  jumbo:   40, // full-screen empty-state icons
};
// The rungs in order, for the one case the scale cannot express as a constant:
// a size that is COMPUTED. The leaderboard fits its rows to whatever height it
// has, and inside a row the total column sits a step above the player's name.
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
export const SHADOW = `#000000${ALPHA.line}`;  // 33%
export const SCRIM  = `#000000${ALPHA.held}`;  // 60%

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
