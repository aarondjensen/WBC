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

/**
 * @param {object|null}  user       the resolved WBC player, if any
 * @param {boolean}      authKnown  has Firebase Auth answered at all yet?
 * @param {boolean}      hadSession has anybody signed in on this device before?
 * @returns {boolean} hold the splash rather than drawing the sign-in screen
 */
export const holdForAuth = ({ user = null, authKnown = false, hadSession = false } = {}) =>
  !user && !authKnown && !!hadSession;
