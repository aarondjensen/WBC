// ══════════════════════════════════════════════════════════════════
//  editionHome — which tournament the app opens into.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no storage, no React. firebase.js gathers the three facts
// and this decides. Same reason as lib/editionId — anything that imports
// firebase.js initializes a Firebase app at import time and stops being
// unit-testable, and this rule is the part that most needs a test.
//
// Why this exists
// ───────────────
// The active-edition pointer persists in localStorage, so the edition a phone
// was last left in is the edition it opens in FOREVER. That is right for the
// switch it was written for — a director moving to next year should not have
// to move there again on every launch — and wrong for the way the field
// actually uses Tournaments, which is to have a look at 2014 and then put the
// phone away.
//
// The player who did that arrives on the first tee, opens the app, and is in
// 2014: a twelve-year-old leaderboard, a roster of who played then, and a
// scoring tab filing against a tournament that finished when they were in
// school. Nothing on screen says which year it is loudly enough to be noticed
// by somebody looking for their own name, and the fix — More → Tournaments →
// 2026 — is not one they know about. The link goes to the whole field a week
// out, so every device that pokes at a past year between now and then is a
// player who has to be talked back into the tournament.
//
// So a past year is a VISIT, not a new home. It lasts as long as the app stays
// open — the switch itself hard-reloads (see lib/editions), which is why the
// visit has to survive a reload — and a cold start comes back to the live
// tournament.
//
// Two carve-outs, both there to avoid trading one wrong edition for another:
//
//   A DIRECTOR STAYS PUT. Building next year's tournament before this one is
//   over is exactly what the editions feature is for, and it is days of work
//   across many launches. Snapping a director back to the live year every
//   morning would make that unusable, so a device that has been signed in as a
//   director keeps its pointer.
//
//   AN UNREADABLE SESSION HONOURS THE POINTER. If sessionStorage cannot be
//   read (locked-down browser, private mode) no visit can ever be recorded, so
//   every switch would be undone by its own reload and Tournaments would look
//   broken. Where a visit cannot be told from a home, believe the pointer.

// stored   — the persisted active edition (localStorage), or null on a device
//            that has never switched.
// visit    — the edition switched to during THIS app session (sessionStorage),
//            or null if none. Cleared by a cold start, which is the signal
//            that the visit is over.
// home     — the live tournament: where a player belongs unless they are
//            deliberately somewhere else.
// isDirector — has this device ever resolved to a director account? A cached
//            hint, not an authorization: it only ever decides whether a
//            pointer is kept, and every write is still the rules' to refuse.
// sessionKnown — false when sessionStorage could not be read at all.
export const bootEdition = ({ stored, visit, home, isDirector, sessionKnown = true } = {}) => {
  if (!home) return stored || null;          // no live edition to fall back to
  if (!stored || stored === home) return home;
  if (!sessionKnown) return stored;          // cannot tell a visit from a home
  if (visit && visit === stored) return stored;
  if (isDirector) return stored;
  return home;
};

// Did the boot decision move the device off what was stored? firebase.js uses
// this to write the pointer back, so a player who has been returned to the
// live tournament is returned to it once rather than on every launch.
export const bootEditionMoved = (stored, booted) => !!booted && stored !== booted;
