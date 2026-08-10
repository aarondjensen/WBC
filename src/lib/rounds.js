// ══════════════════════════════════════════════════════════════════
//  rounds — how many rounds this event plays.
// ══════════════════════════════════════════════════════════════════
//
// Four almost every year; three when the schedule loses a day (2010, 2011 and
// 2022 all ran three). It used to be a hard constant, which made a three-round
// year a code change and a redeploy — so it is part of the event setup a
// director edits in Admin → Event, stored on the tournament_state document as
// `meta.rounds`.
//
// ── Why a live binding and not a prop ──
// Every round loop, leaderboard column and finalization check reads this at
// RENDER time. Pointing it at the saved value before React re-renders updates
// all of them at once; the alternative was threading a `numRounds` prop
// through a dozen components that only need it to count to four. Same trick
// firebase.js uses for TOURNAMENT_ID, and theme.js for the palette.
//
// ── The rule that makes that safe, which is not obvious ──
// A module-level mutable is NOT something React re-renders on. This one is
// safe for exactly one reason: WBCApp assigns it DURING ITS OWN RENDER, from
// state, before any child renders — so every child reading it this pass reads
// the value this pass decided on.
//
// That is a narrow guarantee and it is worth naming, because the app has
// already been taken down once by the other kind of module-level mutable: the
// player registry was replaced by an async load AFTER the components deriving
// from it had memoized, and every player vanished from a live tournament. The
// difference is the assignment's timing, not the technique.
//
//   Safe    set during render, from state, before children render.
//   Unsafe  set from a callback, an effect, or a promise — anything that lands
//           after a render has already happened. That needs state.
//
// So: if you ever find yourself calling setRoundCount from anywhere other than
// WBCApp's render, it belongs in state instead.
//
// It lives here rather than in App.jsx because the screens are moving out of
// that file one at a time, and a component in src/components cannot import a
// binding from the app shell without a circular import.

import { DEFAULT_NUM_ROUNDS, clampRounds } from "../constants";

// The live binding. Import it and read it; do not copy it into a local at
// module scope, which would freeze whatever it happened to be at import time.
export let NUM_ROUNDS = DEFAULT_NUM_ROUNDS;

// Point it at a saved count. Clamped to the answers the WBC has ever had — see
// ROUND_CHOICES — so a fat-fingered "44" cannot produce 44 empty leaderboard
// columns. Returns the value actually taken, which is what makes it usable as
// `const n = setRoundCount(meta.rounds)`.
export const setRoundCount = (n) => { NUM_ROUNDS = clampRounds(n); return NUM_ROUNDS; };

// For callers that want the number without importing a mutable binding —
// notably anything that has to read it inside a callback, where a live binding
// is correct but reads oddly.
export const getRoundCount = () => NUM_ROUNDS;

// Every round of this event, as [1, 2, …]. Spelled once here because a dozen
// call sites were building it inline and half of them were building it from a
// different source of the count.
export const roundList = (n = NUM_ROUNDS) => Array.from({ length: clampRounds(n) }, (_, i) => i + 1);
