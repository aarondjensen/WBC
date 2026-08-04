// ══════════════════════════════════════════════════════════════════
//  scoreEntry — the five buttons a hole offers, and where ± goes.
// ══════════════════════════════════════════════════════════════════
//
// The scoring row shows five par-relative buttons — par−1 through par+3,
// labelled Birdie / Par / Bogey / Double / Triple — flanked by a − and a +.
// A score outside that range slides the window to keep the entered number on
// screen (an ace on a par 3, a 9 on a par 4).
//
// The ± buttons exist for scores the row does NOT show. That is the whole
// point of them, and it decides where a cold tap lands:
//
//   +  with nothing entered opens at ONE PAST the highest button showing.
//      Stepping from par landed on par+1 — a bogey, a button already under
//      the player's thumb — so the + did nothing the row couldn't. Nobody
//      reaches for + to enter a bogey; they reach for it because the number
//      they need is off the end of the row.
//
//   −  with nothing entered still steps from par, to a birdie. Below the row
//      is eagle-and-better: a 2 on a par 4. That is rare enough that opening
//      the − at par−2 would be the wrong guess far more often than it was
//      right, which is not true of a big number going the other way.
//
// With a score already entered, both step from that score.

export const WINDOW = 5;

// The five buttons for this par, and whether the window had to slide to keep
// `score` on screen. `shifted` matters to the caller because the
// Birdie/Par/Bogey labels only describe an unshifted window.
export function scoreWindow(par, score) {
  const base = [par - 1, par, par + 1, par + 2, par + 3];
  const max = base[base.length - 1];
  const min = base[0];
  if (score > max) {
    const shift = score - max;
    return { btns: base.map(b => b + shift), shifted: true };
  }
  if (score > 0 && score < min) {
    const shift = min - score;
    return { btns: base.map(b => b - shift), shifted: true };
  }
  return { btns: base, shifted: false };
}

// Where + goes: one past the entered score, or one past the top of the row
// when nothing is entered yet.
export function nudgeUpTarget(score, par) {
  if (score > 0) return score + 1;
  const { btns } = scoreWindow(par, score);
  return btns[btns.length - 1] + 1;
}

// Where − goes: one under the entered score, or a birdie from cold. Never
// below 1 — there is no such thing as a 0.
export function nudgeDownTarget(score, par) {
  return Math.max(1, (score > 0 ? score : par) - 1);
}
