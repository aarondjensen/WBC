// ══════════════════════════════════════════════════════════════════
//  ScoreButtonRow — the par-relative score control.
// ══════════════════════════════════════════════════════════════════
//
// Five buttons that recenter around par, flanked by −/+ nudges, with
// Birdie/Par/Bogey/Double/Triple under them. Tapping the posted score again
// clears it (onPick(0)). 44px targets, per Apple HIG — this is tapped with a
// glove on, in sun, one-handed.
//
// It lived inside OnCourseScoring, which was true right up until the scramble
// arrived: that screen enters ONE score for a team rather than four for a
// group, but it is the same control doing the same job, and two copies of a
// score input is how the tournament ends up with two ways to type a 5. The
// window and the ± targets are lib/scoreEntry's; what is here is the row.
import { K, FS, R, MOTION } from "../theme";
import { tapScore, tapNudge } from "../lib/haptics";
import { scoreWindow, nudgeUpTarget, nudgeDownTarget, scoreTerm } from "../lib/scoreEntry";

// Labels sit beneath the 5 par-relative buttons [par-1, par, par+1, par+2, par+3].
const SCORE_LABELS = ["Birdie", "Par", "Bogey", "Double", "Triple"];

// `scoreTerm` — what a score is CALLED — lives in lib/scoreEntry with the rest
// of the score-entry rules, and is imported at the top of this file.

// `forName` is the player — or, in the scramble, the team — this row belongs
// to, used only to name the buttons
// for a screen reader. On screen the name is already the card's heading and
// repeating it would be noise; announced, "5, bogey" with no idea whose card
// it is is the difference between usable and not.
export function ScoreButtonRow({ score, par, onPick, forName = "" }) {
  // Window and ± targets live in lib/scoreEntry — see the header there for
  // why a cold + opens past the top of the row rather than on a bogey.
  const { btns, shifted } = scoreWindow(par, score);
  // A shifted window would mislabel its buttons (an ace on a par 3 is not a
  // "Birdie"), so the labels drop out but keep their 12px slot — the row
  // height has to stay put.
  const showLabels = !shifted;
  const boxSize = 32;
  const handleNudge = (val) => { tapNudge(); onPick(Math.max(1, val)); };
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
      <button onClick={() => handleNudge(nudgeDownTarget(score, par))} aria-label={`One lower${forName ? " for " + forName : ""}`} style={{ width: 36, height: 44, borderRadius: R.sm, background: K.inp, border: "none", color: K.t3, fontSize: FS.body, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>−</button>
      {btns.map((btn, idx) => {
        const isCur = btn === score; const sd = btn - par;
        const isPar = btn === par;
        const showParAnchor = isPar && !isCur;
        const ringClr = sd < 0 ? K.danger : K.bg;
        return (
          <div key={btn} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
            {/* A rung above FS.body, unlike the ± either side of it. This is
                the number the whole screen exists to read and to hit, it sits
                in a 44px box with room to spare, and it is read at arm's
                length in sun. Nothing reflows: the box height is fixed. */}
            <button
              onClick={() => { tapScore(); onPick(isCur ? 0 : btn); }}
              // The visible label under the button is dropped on a shifted
              // window (an ace on a par 3 is not a "Birdie"), and the ± keys
              // have no text at all — so the name is built from par here
              // rather than read off the DOM.
              aria-label={`${forName ? forName + ", " : ""}${btn}${scoreTerm(btn, par) ? ", " + scoreTerm(btn, par) : ""}${isCur ? " — posted, tap to clear" : ""}`}
              aria-pressed={isCur}
              style={{ width: "100%", height: 44, borderRadius: R.sm, cursor: "pointer", fontSize: FS.lead, fontWeight: 800, border: "none", background: isCur ? K.acc : K.inp, color: isCur ? K.bg : K.t2, position: "relative", transition: `all ${MOTION}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Selected-state rings: circles under par, squares over par */}
              {isCur && sd !== 0 && <div style={{ position: "absolute", width: boxSize, height: boxSize, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}><div style={{ position: "absolute", inset: 0, borderRadius: sd < 0 ? "50%" : R.xs, border: `1.5px solid ${ringClr}` }} />{Math.abs(sd) >= 2 && <div style={{ position: "absolute", inset: 3, borderRadius: sd < 0 ? "50%" : R.xs, border: `1px solid ${ringClr}` }} />}</div>}
              {/* Resting-state faint outlines on non-par, non-selected buttons */}
              {!isCur && sd !== 0 && <div style={{ position: "absolute", width: boxSize, height: boxSize, left: "50%", top: "50%", transform: "translate(-50%, -50%)", opacity: 0.15 }}><div style={{ position: "absolute", inset: 0, borderRadius: sd < 0 ? "50%" : R.xs, border: `1.25px solid ${sd < 0 ? K.danger : K.t2}` }} />{Math.abs(sd) >= 2 && <div style={{ position: "absolute", inset: 3, borderRadius: sd < 0 ? "50%" : R.xs, border: `1px solid ${sd < 0 ? K.danger : K.t2}` }} />}</div>}
              <span style={{ position: "relative", zIndex: 1 }}>{btn}</span>
            </button>
            <div style={{ fontSize: FS.micro, color: showParAnchor ? K.t2 : K.t3, fontWeight: showParAnchor ? 700 : 600, letterSpacing: 0.4, lineHeight: 1, height: 12 }}>
              {showLabels ? SCORE_LABELS[idx] : ""}
            </div>
          </div>
        );
      })}
      <button onClick={() => handleNudge(nudgeUpTarget(score, par))} aria-label={`One higher${forName ? " for " + forName : ""}`} style={{ width: 36, height: 44, borderRadius: R.sm, background: K.inp, border: "none", color: K.t3, fontSize: FS.body, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>+</button>
    </div>
  );
}

export default ScoreButtonRow;
