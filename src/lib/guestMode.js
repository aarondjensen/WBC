// ══════════════════════════════════════════════════════════════════
//  guestMode — the way in for somebody who isn't playing.
// ══════════════════════════════════════════════════════════════════
//
// The app's front door asks for three things in a row: a Google or Apple
// account, the event password, and a name off the roster. That is right for a
// player and wrong for everybody else — a spouse following the board from the
// couch, and the store reviewers and beta testers who have to open the Android
// build and move around in it before it can ship. None of them have a password,
// and there is no name on the roster to give them.
//
// So there is a fourth way in that asks for nothing, and it is READ-ONLY: a
// guest sees every screen a player sees, taps anything they like, and writes
// nothing. Their taps land in local React state — a score they type appears on
// the card and moves the board — and stop there. Reload and the tournament is
// exactly as it was.
//
// ── Why the block is in the data layer and not on the buttons ──────
// The alternative is a guard at each of the twenty-odd handlers in App.jsx that
// touch Firestore, which is twenty-odd chances to miss one now and a standing
// invitation to miss the next one. `db` is the single door every write in the
// project already goes through (see lib/db), so that is where this lives: one
// check, and code written later inherits it without knowing it exists.
//
// ── Why it ANDs with "is anybody signed in" ───────────────────────
// A latch that silently swallows writes is the most dangerous thing in this
// codebase if it is ever stuck on for a real player — scores typed on the tee
// that never arrive, no error anywhere. So being blocked requires BOTH the
// latch AND no Firebase user, and a player is signed in by definition. A guest
// has no account at all, so the pair is exactly the guest and the failure mode
// runs the safe way: a stuck latch cannot stop a signed-in player writing.
//
// It is not the security boundary either — that is firestore.rules, which
// refuses every write from an account with no membership regardless. This is
// what stops a guest's doomed writes queueing up behind a phone that thinks it
// is offline (see lib/connection): the sync banner counts writes handed over
// and not acknowledged, and a tester tapping scores would otherwise be told the
// app had lost the network.

// The one identity every guest shares. `id` is deliberately not a player id —
// nothing on the roster matches it, so every "is this me" comparison in the app
// (meId, the market nudge, the Players record book) answers no on its own
// rather than needing to be taught about guests.
export const GUEST_ID = "guest";

export const guestUser = () => ({ id: GUEST_ID, name: "Guest", isDirector: false, isGuest: true });

export const isGuest = (user) => !!user?.isGuest;

// What the guest strip says, and what it has to convey in one line: this is a
// real look at a real tournament, and nothing they do to it sticks.
export const GUEST_NOTICE = "Guest preview — nothing you tap is saved.";

// ── The latch ─────────────────────────────────────────────────────
// Set from App.jsx whenever the signed-in user changes, cleared for everybody
// who is not a guest. Module-level rather than React state because the thing
// asking is `db`, which is imported by everything and rendered by nothing.
let _latched = false;

export const setGuestWrites = (on) => { _latched = !!on; };

export const guestWritesLatched = () => _latched;

// The AND described above. `signedIn` is whether Firebase has a current user;
// db passes it in rather than importing auth, so this stays a pure function of
// its two inputs and can be tested without Firebase.
export const writesBlocked = (signedIn) => _latched && !signedIn;
