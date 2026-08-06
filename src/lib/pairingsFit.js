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
// `minCol` is the other half of the bargain: height is not the only thing a
// name can run out of. The row is a fixed 5fr of four columns, so a rung that
// height alone would allow can still be one the name column cannot seat, and a
// player reading "Christopher Vand…" at 21px is worse off than reading the
// whole name at 17px. Each rung above the first therefore states the narrowest
// name column it is willing to be drawn in — see nameColWidth below.
export const PAIRING_RUNGS = [
  { name: FS.small, cell: FS.label, head: FS.label, headSub: FS.micro, rowPad: 5, headPad: 6, swatch: 7, minCol: 0 },
  { name: FS.body, cell: FS.small, head: FS.small, headSub: FS.label, rowPad: 5, headPad: 6, swatch: 8, minCol: 0 },
  { name: FS.lead, cell: FS.body, head: FS.body, headSub: FS.small, rowPad: 6, headPad: 7, swatch: 9, minCol: 130 },
  { name: FS.title, cell: FS.lead, head: FS.lead, headSub: FS.body, rowPad: 7, headPad: 8, swatch: 11, minCol: 175 },
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

// The name column, from the width of the stack: the card takes a 1px border
// and 12px of padding on each side, and the row splits what is left four ways
// as 5fr 1.6fr 2.4fr 2fr — the grid the row is drawn with.
const ROW_FR = 5 + 1.6 + 2.4 + 2;
export const nameColWidth = (stackW) => Math.max(0, (stackW - 26) * (5 / ROW_FR));

// The rung to draw at: the largest one whose stack fits the height on offer and
// whose names fit the width, plus whatever padding the rows can absorb of what
// is still left over. `available` of 0 means nothing has been measured yet —
// hold at rung 0, the size the tab has always been, so no first paint is ever
// drawn too big and then snatched back a frame later.
export const fitPairings = (available, sizes, stackW = 0) => {
  if (!available || !sizes || sizes.length === 0) return PAIRING_RUNGS[0];
  const col = nameColWidth(stackW);
  let chosen = PAIRING_RUNGS[0];
  for (const rung of PAIRING_RUNGS) {
    if (rung.minCol > col) break;
    if (pairingsHeight(rung, sizes) <= available) chosen = rung;
    else break;
  }
  const rows = sizes.reduce((n, size) => n + size, 0);
  const leftover = available - pairingsHeight(chosen, sizes);
  if (rows === 0 || leftover <= 0) return chosen;
  const extra = Math.min(MAX_EXTRA_PAD, Math.floor(leftover / (rows * 2)));
  return extra > 0 ? { ...chosen, rowPad: chosen.rowPad + extra } : chosen;
};
