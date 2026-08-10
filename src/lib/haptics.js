// ══════════════════════════════════════════════════════════════════
//  haptics — the three taps this app makes.
// ══════════════════════════════════════════════════════════════════
//
// A phone in a golf glove, at arm's length, in sun, being tapped by somebody
// who is also holding a putter. The confirmation that a tap LANDED cannot rely
// on somebody looking at the screen, and a buzz is the one channel that works
// with the phone at hip height.
//
// Three weights, and they are different on purpose:
//
//   tapScore      10ms  — a score went down. The common one, dozens per round,
//                         so it has to be felt and immediately forgotten.
//   tapNudge       8ms  — the ± keys. Lighter than a score because it is an
//                         adjustment rather than an entry, and because holding
//                         one down should not feel like a drill.
//   tapBigAction  buzz  — signing a card, attesting one, finalizing a round.
//                         A three-pulse pattern, because these are the taps
//                         somebody should notice they made.
//
// Everything is guarded twice: `navigator.vibrate` is absent on desktop and on
// iOS Safari entirely, and it THROWS rather than no-ops in some embedded
// webviews. A missing buzz is nothing; an exception on the score button is a
// dead scoring screen.

const buzz = (pattern) => {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
  } catch { /* webview with a hostile vibrate — a missing buzz is not a failure */ }
};

export const tapScore = () => buzz(10);
export const tapNudge = () => buzz(8);
export const tapBigAction = () => buzz([20, 40, 20]);
