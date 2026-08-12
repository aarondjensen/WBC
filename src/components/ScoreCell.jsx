// ══════════════════════════════════════════════════════════════════
//  ScoreCell — one hole of a scorecard, drawn the way the paper does it.
// ══════════════════════════════════════════════════════════════════
//
// The Full Scorecard on the scoring screen is where this comes from, and it is
// the only place it is decided now: a red circle under par, a blue square over
// it, a second ring INSIDE the first for two or more either way, and the
// strokes received as accent dots centred over the number. lib/scoreMarks says
// WHAT is on the hole; this says what it looks like.
//
// One ring size for every marked hole, and the second one drawn within it. A
// bogey and a triple take the same room on the card; what separates them is a
// line inside, not a bigger footprint.
//
// The metrics all come off the type size so a card can be drawn bigger than
// the one it copies without re-deciding any of the above. At FS.label they are
// the numbers the scoring screen has always used — a 20px ring, 3px dots, a
// 32px cell. The leaderboard's card sets a rung higher and everything on it
// scales together.
import { K, FS, R } from "../theme";
import { scoreMarks, scoreCellMetrics } from "../lib/scoreMarks";

// Blue for over par. It is K.eagle in the palette — a name that predates the
// scorecard using it for the bogey square — and the legend under the scoring
// card is drawn from the same two hexes, so this is the pairing players are
// already reading, whatever the token is called.
const TONE = { under: () => K.under, over: () => K.eagle, par: () => K.t1 };

export function ScoreCell({ score, par, strokes = 0, fontSize = FS.label, skin = false, style }) {
  const m = scoreMarks(score, par, strokes);
  const s = scoreCellMetrics(fontSize);
  const clr = m.tone ? TONE[m.tone]() : K.t3;
  const radius = m.ring === "circle" ? "50%" : R.xs;
  // Capped at the column it is drawn in as well as at its own size: the
  // leaderboard splits the board's width nine ways and its tracks come out
  // narrower than the ring wants on a small phone.
  //
  // The cap is why each ring carries a percentage of the column as well as a
  // size in pixels. On a narrow track the outer ring clamps to the column, and
  // an inner ring clamped against the same 100% would clamp to the same number
  // — two rings landing on top of each other, which is a double bogey drawn as
  // a slightly thick bogey. Clamping it to its own share of the column instead
  // keeps the pair proportional at any width.
  //
  // Not a transform: scaling the outer box would scale its border with it, and
  // a 1px line drawn at three quarters is a line that half disappears.
  const pct = Math.round((s.inner / s.ring) * 100);
  const ringBox = (px, cap, weight) => ({
    position: "absolute", width: `min(${px}px, ${cap}%)`, aspectRatio: "1",
    left: "50%", top: "50%", transform: "translate(-50%, -50%)",
    borderRadius: radius, border: `${weight}px solid ${clr}`,
  });
  return (
    <div style={{
      position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
      height: s.cell, fontSize, fontWeight: 700, color: K.t1, ...style,
    }}>
      {m.ring && <div style={ringBox(s.ring, 100, 1.5)} />}
      {m.double && <div style={ringBox(s.inner, pct, 1)} />}
      {/* Over the number rather than off its corner. A digit is not a fixed
          width — a 1 and a 10 hang their corner in different places — and the
          dots wandered with it. */}
      {m.dots > 0 && (
        <div style={{ position: "absolute", top: 1, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2 }}>
          {Array.from({ length: m.dots }).map((_, i) => (
            <div key={i} style={{ width: s.dot, height: s.dot, borderRadius: "50%", background: K.acc }} />
          ))}
        </div>
      )}
      {/* A hole that won a skin — the one thing this card can say that the
          scoring screen's has no way to know. Everything else about the cell
          is the same on both.
          It was gold INK and nothing else, which works in the dark, where gold
          against a near-white number is a colour you cannot miss. In daylight
          the palette's gold is a dark ochre and the ink beside it is
          near-black: both read as "dark", and a skin was something you had to
          go looking for. So it is a gold TICK under the number as well — the
          same mark, at the same 55%, that the betting card puts under a hole
          it won — and the skin is now a shape rather than a hue. Inset rather
          than edge to edge because three skins in a row should read as three
          marks and not as one underline. */}
      {skin && (
        // Clear of the ring rather than a fixed drop from the bottom of the
        // cell: a skin is usually a birdie, so the mark and the ring are drawn
        // on the same hole more often than not, and measured off the cell the
        // tick landed on the ring's lower edge at both card sizes. The gap
        // between the two is what the ring leaves, less two pixels.
        <span style={{
          position: "absolute", left: "50%", transform: "translateX(-50%)",
          bottom: Math.max(1, Math.round((s.cell - s.ring) / 2) - 4),
          // Square ends, like the tick the betting card draws. At two pixels
          // tall a radius is a rounding error with an opinion.
          width: Math.round(s.ring * 0.55), height: 2, background: K.gold,
        }} />
      )}
      <span style={{ position: "relative", zIndex: 1, color: skin ? K.gold : undefined }}>{m.text}</span>
    </div>
  );
}
