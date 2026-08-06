// ═══════════════════════════════════════════════════════════════════════════
// pairingsFit.js — how big the Pairings tab gets to be
//
// The draw is four names to a card and a handful of cards, and on a phone that
// left the tab reading at FS.small with a third of the screen empty under it.
// The fix is the one the leaderboard already uses (see the FS comment in
// theme.js): don't pick a size, pick the BIGGEST size the space will take.
//
// So this is a ladder of complete rungs, not a font size. A rung carries the
// name, the three trailing columns, the group header, the paddings and the tee
// swatch together — bump the name on its own and the row's own proportions go
// wrong long before the screen runs out of room.
//
// Every height here is arithmetic the DOM can be held to, which is the whole
// point: the row is rendered with `lineHeight` set to `rowLine` in pixels and
// its padding to `rowPad`, so `pairingsHeight` is not an estimate of what the
// browser will do — it is what the browser is being told to do. Keep the two
// in step. If a rung ever grows something the arithmetic doesn't know about,
// the tab starts scrolling again and the whole exercise is undone.
// ═══════════════════════════════════════════════════════════════════════════

import { FS } from "../theme";

// Line box as a multiple of the font size. Applied as a px value so the row
// height is exact rather than left to the font's own metrics — which is also
// why it is 1.25 and not something rounder: that is what Montserrat's own
// `normal` came out at, so rung 0 is the height the tab has always been rather
// than a pixel a row taller for having been written down.
const LINE = 1.25;

const line = (size) => Math.round(size * LINE);

// Gap between group cards — matches the flex `gap` the stack is drawn with.
export const CARD_GAP = 6;

// The ladder, smallest first. Rung 0 is what the tab shipped as, so a draw too
// deep to grow lands exactly where it used to be rather than somewhere new.
//
// `rowPad` is the TIGHTEST each rung is drawn at, not the padding it wants.
// That ordering is the whole point: a rung is chosen against its minimum, so
// spare height buys a bigger name first and whitespace only with what is left.
// Reverse it and a tab with 700px puts 96px into padding around 13px type when
// 15px type fit the whole time — which is the complaint, not the fix.
export const PAIRING_RUNGS = [
  { name: FS.small, cell: FS.label, head: FS.label, headSub: FS.micro, rowPad: 5, headPad: 6, swatch: 7 },
  { name: FS.body, cell: FS.small, head: FS.small, headSub: FS.label, rowPad: 5, headPad: 6, swatch: 8 },
  { name: FS.lead, cell: FS.body, head: FS.body, headSub: FS.small, rowPad: 6, headPad: 7, swatch: 9 },
  { name: FS.title, cell: FS.lead, head: FS.lead, headSub: FS.body, rowPad: 7, headPad: 8, swatch: 11 },
];

// The two line boxes a rung is drawn with, in pixels. The row takes the name's
// line box because the name is the tallest thing in it; the three trailing
// columns sit inside that box rather than setting their own.
export const rungLines = (rung) => ({ rowLine: line(rung.name), headLine: line(rung.head) });

// Height of one group card: header (with its bottom border), one row per
// player, a hairline between rows, and the card's own border top and bottom.
export const cardHeight = (rung, size) => {
  const { rowLine, headLine } = rungLines(rung);
  const headH = rung.headPad * 2 + headLine + 1;
  const rowH = rung.rowPad * 2 + rowLine;
  return 2 + headH + rowH * size + Math.max(0, size - 1);
};

// Height of the whole stack for a draw, where `sizes` is the number of players
// in each group. Empty groups still draw their header, so they still count.
export const pairingsHeight = (rung, sizes) =>
  sizes.reduce((h, size) => h + cardHeight(rung, size), 0) +
  Math.max(0, sizes.length - 1) * CARD_GAP;

// What is left after the biggest rung is chosen is by definition less than the
// next rung costs, and the type scale has nothing between two rungs to spend it
// on. It goes into the rows instead, so the stack reaches the bottom of the tab
// rather than stopping short of it. Capped, because past a point a row is not
// breathing, it is adrift — and a two-group draw on a desktop window has far
// more spare height than it has any business turning into whitespace.
export const MAX_EXTRA_PAD = 8;

// ── The other thing a name can run out of ──────────────────────────────────
// Height is not the only ceiling. The row is a fixed 5fr of four columns, so a
// rung the height allows can still be one the name column cannot seat, and
// "MIKE HALVORS…" at 21px is worse off than the whole name at 15px. Names are
// painted in capitals app-wide (index.css), which is wide — a rung that looked
// safe against a lowercase name is not.
//
// So the width ceiling is measured, not guessed: the caller measures the names
// it is about to draw and passes one width per pixel of font size — which is
// what text width is, linear in the size for a given string in a given face.
// `nameWidthPerPx * rung.name` is then that name's width AT that rung, exactly,
// in whatever font actually loaded. Which name that is, is nameWidthCeiling's
// question, below.

// The name column, from the width of the stack: the card takes a 1px border
// and 12px of padding on each side, and the row splits what is left four ways
// as 5fr 1.6fr 2.4fr 2fr — the grid the row is drawn with.
const ROW_FR = 5 + 1.6 + 2.4 + 2;
export const nameColWidth = (stackW) => Math.max(0, (stackW - 26) * (5 / ROW_FR));

// A name is not allowed to finish flush against the handicap beside it. Only a
// few pixels, because most of that breathing room is already there: the
// handicap is centred in a column of its own and a "12.1" leaves the best part
// of ten pixels either side of itself. Ask for more here and it is charged
// twice, which is a whole rung on a phone.
export const NAME_GUTTER = 4;

// The width the fit actually sizes against, from the width of every name it is
// about to draw: the second widest, not the widest.
//
// One outlier should not hold the whole tab down. A single "RICK VANDENBERG"
// in the field is otherwise enough to pin sixteen players at 13px on a phone
// that would seat all the others at 15px, to save one name from ending in an
// ellipsis it reads perfectly well through. One name may ellipse; two is a
// pattern, and the fit steps down rather than let it happen.
export const nameWidthCeiling = (widths) => {
  if (!widths || widths.length === 0) return 0;
  const sorted = [...widths].sort((a, b) => b - a);
  return sorted.length > 1 ? sorted[1] : sorted[0];
};

// The rung to draw at: the largest one whose stack fits the height on offer and
// whose names fit the width, plus whatever padding the rows can absorb of what
// is still left over. `available` of 0 means nothing has been measured
// yet — hold at rung 0, the size the tab has always been, so no first paint is
// ever drawn too big and then snatched back a frame later.
export const fitPairings = (available, sizes, stackW = 0, nameWidthPerPx = 0) => {
  if (!available || !sizes || sizes.length === 0) return PAIRING_RUNGS[0];
  const col = nameColWidth(stackW);
  let chosen = PAIRING_RUNGS[0];
  for (const rung of PAIRING_RUNGS) {
    // No measurement means no names to measure — an all-empty draw. Nothing to
    // clip, so width has no opinion and height decides on its own.
    if (nameWidthPerPx && nameWidthPerPx * rung.name + NAME_GUTTER > col) break;
    if (pairingsHeight(rung, sizes) <= available) chosen = rung;
    else break;
  }
  const rows = sizes.reduce((n, size) => n + size, 0);
  const leftover = available - pairingsHeight(chosen, sizes);
  if (rows === 0 || leftover <= 0) return chosen;
  const extra = Math.min(MAX_EXTRA_PAD, Math.floor(leftover / (rows * 2)));
  return extra > 0 ? { ...chosen, rowPad: chosen.rowPad + extra } : chosen;
};
