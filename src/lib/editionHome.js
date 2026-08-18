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

// ══════════════════════════════════════════════════════════════════
//  Where a device with no pointer starts, and what "the cup" means
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup's lib/defaultEdition, and it lands differently here
// because WBC threw its `status` field away. BC reads "which year is the
// tournament" off `status: published`; WBC derives a year's state from what it
// HOLDS (see editionLifecycle, and the note there about a label that read
// DRAFT on a finished 2025), and a derived state cannot answer this question —
// an empty next year and an empty sandbox look identical to it, and the answer
// is needed synchronously, before the first query is built, so a Firestore
// round trip cannot be waited on either.
//
// So the live tournament is NAMED, in one place, with an env override so next
// year is a deploy setting rather than a code change:
//
//   VITE_DEFAULT_EDITION=wbc_2027   →   2027 is the cup
//
// The override is also how a store build could be pointed at the sandbox the
// way BC's native builds are. Deliberately not automatic here: BC seeds its
// demo from a script that guarantees it exists, WBC's sandbox is cut by a
// director from the picker, and a build that opened on an edition nobody has
// created yet would show a tester an empty tournament with no roster to claim
// from — which is worse than the year they get today.
export const WEB_DEFAULT_EDITION_ID = "wbc_2026";

// @param {string} [override]  import.meta.env.VITE_DEFAULT_EDITION
export const defaultEdition = ({ override } = {}) => {
  const cleaned = typeof override === "string" ? override.trim() : "";
  return cleaned || WEB_DEFAULT_EDITION_ID;
};

// ── The tournament that is ON, as opposed to the one you are looking at ──
// Two questions wear the word "active" and they must not be confused:
// getActiveTournamentId() is WHICH EDITION THIS DEVICE HAS OPEN — a per-device
// pointer, and the thing the picker paints ACTIVE — while this is WHICH
// EDITION IS THE TOURNAMENT. They are the same id until somebody opens 2014,
// and the whole reason this exists is the moment they part: the way back has
// to be one tap, and one tap needs a destination.
//
// The list is what the picker has already cached, which on most devices is
// nothing at all — so an EMPTY list means "not loaded", not "no such year",
// and the constant is trusted. A list that HAS loaded and does not contain the
// home edition returns "", so the caller draws nothing rather than a way back
// that goes nowhere.
export const liveEdition = (editions = [], home = WEB_DEFAULT_EDITION_ID) => {
  const rows = (editions || []).filter((e) => e?.id);
  if (!rows.length) return home || "";
  return rows.some((e) => e.id === home) ? home : "";
};

// Is the way-back row on screen? Asked by EditionBanner, which draws it, and
// by the app shell, which has to know: the nav's centre trophy sits in a dome
// CARVED OUT of the page above the bar, and with this row present there is no
// page above the bar to carve — the dome paints a bar-coloured disc across the
// banner instead. Both callers have to agree about when that is, so the
// decision is here rather than in either of them.
export const editionBannerShowing = (viewingId, liveId) =>
  !!liveId && !!viewingId && liveId !== viewingId;
