// ══════════════════════════════════════════════════════════════════
//  authHold — wait, or draw the sign-in screen?
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React. One boolean, and it exists as a file because it
// is a RENDER GATE — the class of decision that is invisible when it is right,
// obvious to a person and not to a test when it is wrong, and reached only
// through a full app mount otherwise.
//
// ── The gap this is about ─────────────────────────────────────────
// Firebase Auth restores its session from IndexedDB asynchronously, so every
// cold start has a window where the app cannot tell a signed-in player from a
// stranger. Normally nothing shows for it: the player's own session is in
// localStorage, read synchronously, so the app renders the tournament and the
// auth answer lands behind it.
//
// Switching editions is the exception, and it is the one people meet. The
// switch CLEARS the stored session on purpose (see switchEdition — the golfer
// may have no roster row in the year being opened) and then reloads. So the
// app comes back up with no player and no Firebase user yet, and the render
// fell through to the sign-in screen: Google and Apple buttons flashing in
// front of a director who was only changing years.
//
// ── Why it is not simply "wait until auth answers" ────────────────
// Because a stranger opening the app for the first time would then get a
// pulsing logo before the sign-in screen they were always going to get, on
// every launch, for the sake of a case that is not theirs. The device says
// which it is: one that has signed in before has an answer coming and is worth
// waiting for. See hadAuthSession in firebase.js.
//
// The two states of `authKnown` are the other half. Firebase's listener fires
// with null for "nobody is signed in", which is an ANSWER and must not be
// confused with not having answered yet — the app holds for the second and
// draws the sign-in screen for the first.

// ── The other end of the same gap ─────────────────────────────────
// Waiting for Firebase was only half of it. Once it answers with an account
// there is a SECOND wait — the membership read, then the uid→player claim,
// then the roster that names the player — and the app fell through to the
// sign-in screen in the middle of that too. It showed for a single frame,
// which is what a screen recording of an edition switch caught: splash, one
// frame of Google and Apple buttons, then the tournament.
//
// It is one frame because React runs effects after paint: the render where
// the membership answer lands can paint before the effect that resolves the
// player has run. Nothing about that is a race worth timing out — the answer
// is coming — so the rule is simply that a signed-in account with no player
// yet holds, unless there is a question to put to them.
//
// `needsClaim` is that question: the claim screen asks which name on the
// roster they are, and it must not be swallowed by the splash in front of it.

/**
 * @param {object|null}  user       the resolved WBC player, if any
 * @param {boolean}      authKnown  has Firebase Auth answered at all yet?
 * @param {boolean}      hadSession has anybody signed in on this device before?
 * @param {boolean}      signedIn   did it answer with an account?
 * @param {boolean}      needsClaim is the claim screen about to be shown?
 * @returns {boolean} hold the splash rather than drawing the sign-in screen
 */
export const holdForAuth = ({
  user = null, authKnown = false, hadSession = false, signedIn = false, needsClaim = false,
} = {}) => {
  if (user || needsClaim) return false;
  // Signed in, no player yet: the resolution is in flight.
  if (signedIn) return true;
  // Not answered yet, on a device that has an answer coming.
  return !authKnown && !!hadSession;
};
