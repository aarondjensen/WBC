// ══════════════════════════════════════════════════════════════════
//  scoreMarks — what a scorecard prints on one hole.
// ══════════════════════════════════════════════════════════════════
//
// The number, the ring around it, and the strokes the player got there. This
// is the paper convention the Full Scorecard on the scoring screen has always
// drawn — a circle under par, a square over it, a second ring at two or more
// either way, and a dot per stroke received — lifted out of that screen so
// every card in the app draws from one answer.
//
// It is here because it was being re-decided at each call site and the cards
// drifted apart. The leaderboard's card hung the stroke dots off the top-right
// corner of the digit and drew as many as the handicap gave, and ringed a hole
// by whether it won a SKIN rather than by what was shot — so the same 3 on the
// same hole was a plain grey number on one screen and a red circle on another,
// and a player checking one card against the other had no way to tell which
// was telling the truth.
//
// No colours or pixels in here: this says WHAT is on the hole, ScoreCell says
// what it looks like. That split is what lets one card be drawn larger than
// another without either of them re-deciding the convention.

// A withdrawal fills a card's remaining holes with a sentinel so the card
// stays structurally complete. Anything up there is a marker, not a score,
// and prints as a dash — the same floor the scoring screen has always tested
// against, kept as a floor rather than an equality so a card carrying any
// future sentinel cannot come out as a three-figure score.
export const WD_FLOOR = 90;

// Strokes drawn as dots, capped. Two is the most a hole gives out in practice
// and the most that fits over a digit; a plus handicap gives strokes back
// rather than receiving them, which is a negative here and draws nothing.
export const MAX_DOTS = 2;

const dotsFor = (strokes) => Math.max(0, Math.min(Math.floor(strokes) || 0, MAX_DOTS));

export function scoreMarks(score, par, strokes = 0) {
  const played = score > 0 && score < WD_FLOOR;
  // The dots do not wait for a score. On the scoring screen this card is read
  // mid-round, and a stroke standing over an empty hole is the player being
  // told where their shots are BEFORE they play them — which is most of what
  // they open the card for on the way round.
  if (!played) return { text: score >= WD_FLOOR ? "—" : "", ring: null, double: false, tone: null, dots: dotsFor(strokes) };
  // A hole with no par recorded cannot be ringed against it — the card still
  // prints the score, it just has nothing to say about it.
  if (!(par > 0)) return { text: String(score), ring: null, double: false, tone: null, dots: dotsFor(strokes) };
  const d = score - par;
  return {
    text: String(score),
    ring: d === 0 ? null : d < 0 ? "circle" : "square",
    double: d <= -2 || d >= 2,
    tone: d < 0 ? "under" : d > 0 ? "over" : "par",
    dots: dotsFor(strokes),
  };
}

// ── How big any of it is drawn ─────────────────────────────────────
// Everything on the cell comes off the type size, so a card can be drawn
// bigger or smaller than the one it copies without re-deciding the convention
// above. At an 11px number that is a 20px ring, 3px dots and a 32px cell.
//
// `ring` is the CEILING. It is the biggest mark a hole can carry and every
// hole with a mark carries it — a bogey and a triple are the same size on the
// card, and what tells them apart is the second ring INSIDE the first. The
// second ring used to be drawn outside, which made a double the largest thing
// on the row: on a card nine columns wide it grew until it was touching the
// holes either side of it, and it meant the worse the score the more of the
// card it took.
//
// `inner` is close in, and it is an INSET off the ring rather than a fraction
// of it: the air between two lines is a constant of drawing, not something
// that should double because the card is drawn a rung larger. Two and a half
// pixels a side at the sizes these cards use, opening a shade at the top of
// the scale where the lines themselves have more room.
//
// Rounded rather than fractional so a ring stays a circle on a 1x screen.
export const scoreCellMetrics = (fontSize) => {
  const ring = Math.round(fontSize * 1.8);
  return {
    cell: Math.round(fontSize * 2.9),
    ring,
    inner: ring - Math.max(5, Math.round(fontSize * 0.4)),
    dot: Math.max(3, Math.round(fontSize * 0.27)),
  };
};
