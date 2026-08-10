// ══════════════════════════════════════════════════════════════════
//  TeeColorSwatch — the little square that says which tees.
// ══════════════════════════════════════════════════════════════════
//
// Drawn beside a player's name on five different screens, and the reason it is
// a component rather than a styled div is that three tee sets need three
// different treatments and only one of them is "fill it in":
//
//   combo   "BLACK/BLUE" is two colours, drawn as a split square. Courses name
//           tees this way more often than you would expect.
//   black   filled black on a near-black card is an invisible square, so it
//           gets a lighter outline to have an edge at all.
//   pale    white and silver need the opposite — a darker hairline, or they
//           bleed into a light theme.
//
// The colour decisions are all in lib/teeColors, with tests. This file is only
// the drawing.
import { R } from "../theme";
import { getComboColors, isBlackTee, isLightTee } from "../lib/teeColors";

export const TeeColorSwatch = ({ color, name, size = 12, style = {} }) => {
  const combo = getComboColors(name || "");
  if (combo) {
    const [c1, c2] = combo;
    const s = size;
    return (
      <span style={{ display: "inline-block", width: s, height: s, borderRadius: R.xs, overflow: "hidden", flexShrink: 0, border: "1px solid #ffffff20", ...style }}>
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <polygon points={`0,0 ${s},0 0,${s}`} fill={c1} />
          <polygon points={`${s},0 ${s},${s} 0,${s}`} fill={c2} />
        </svg>
      </span>
    );
  }
  if (isBlackTee(color)) {
    return <span style={{ display: "inline-block", width: size, height: size, borderRadius: R.xs, background: "#1a1a1a", border: "1px solid #666666", flexShrink: 0, ...style }} />;
  }
  const border = isLightTee(color) ? "1px solid #99999960" : "1px solid #ffffff15";
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: R.xs, background: color || "#888", border, flexShrink: 0, ...style }} />;
};

export default TeeColorSwatch;
