// ══════════════════════════════════════════════════════════════════
//  authRedirect — the sign-in round trip, and surviving it.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React, no storage. Just the two decisions the
// redirect flow has to make correctly, and they are both decisions that are
// invisible from a dev machine — the flow they belong to only exists on a
// phone, in a home-screen app, with the app suspended for the middle of it.
//
// ── What the round trip is ────────────────────────────────────────
// Tapping Sign in with Apple (or Google) inside an installed home-screen app
// does not open a popup — there is nowhere to put one. The app NAVIGATES to
// Firebase's handler, which sends the phone on to Apple, and Apple sends it
// back. Three top-level navigations, and the app is unloaded for all of them.
//
// ── Why the mark is not in sessionStorage ─────────────────────────
// It was, and that is exactly what could not survive. iOS suspends a
// home-screen web app the moment the OAuth trip takes the screen, and a
// suspended web app is a web app iOS is free to evict. When it does, the
// relaunch on the way back has EMPTY sessionStorage — so the app came home
// with no memory of having gone anywhere, and the trip ended silently on the
// sign-in screen with nothing to say about it.
//
// localStorage survives that, which is why the mark lives there now. The
// price is that a mark can outlive its trip (an abandoned sign-in, a phone
// put in a pocket), so it carries the time it was written and is ignored once
// it is stale. Fifteen minutes is longer than any real Apple sheet and
// shorter than anybody's next launch.

export const REDIRECT_MARK_KEY = "wbc_auth_redirect";

// Long enough for a two-factor prompt and a fumbled password; short enough
// that yesterday's abandoned attempt is not reported as today's failure.
export const REDIRECT_MARK_TTL_MS = 15 * 60 * 1000;

/**
 * Serialize the "we sent this phone to a provider" mark.
 *
 * @param {string} providerId  "apple" | "google"
 * @param {number} now         Date.now() at the moment of departure
 * @returns {string} the value to store
 */
export const encodeRedirectMark = (providerId, now) =>
  JSON.stringify({ p: providerId || "1", at: Number(now) || 0 });

/**
 * Read a stored mark back, rejecting one that is too old to be about the trip
 * that just landed.
 *
 * Tolerates the shapes that are not ours: the bare provider string this used
 * to write (upgrade path — a phone mid-trip across a deploy), and anything
 * unparseable at all.
 *
 * @param {string|null} raw    what came out of storage
 * @param {number}      now    Date.now()
 * @param {number}      ttlMs  how long a mark stays meaningful
 * @returns {string|null} the provider that was tried, or null
 */
export const decodeRedirectMark = (raw, now, ttlMs = REDIRECT_MARK_TTL_MS) => {
  if (!raw) return null;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  // The old format was the provider id on its own. No timestamp to judge it
  // by, so it is honoured once — the next trip writes the new shape.
  if (parsed === null || typeof parsed !== "object") {
    return typeof raw === "string" && raw ? raw : null;
  }
  const at = Number(parsed.at) || 0;
  if (!at || Number(now) - at > ttlMs) return null;
  return parsed.p || null;
};

// ══════════════════════════════════════════════════════════════════
//  The ledger: providers whose round trip does not come home HERE
// ══════════════════════════════════════════════════════════════════
//
// Apple's trip home is a cross-site form POST, which iOS hands to Safari and
// never hands back — so the Apple button in an installed app does not attempt
// it at all, it pairs through Safari instead (lib/authPairing). Google's is a
// GET, which normally does come home, so Google takes the direct route.
//
// "Normally" is the word that failed. A player photographed the empty-return
// message after tapping Google in the home-screen app, having tapped it more
// than once. Whatever the cause on his phone — an evicted app, a lost storage
// partition, an iOS that routed the return leg to Safari the way it routes
// Apple's — the answer for HIM cannot be "tap it again", because he had.
//
// So the direct route stays the first thing tried, and stops being tried on a
// device where it has already failed: the empty return is written down, and
// the next tap of that same button takes the Safari route Apple takes. It is
// per-device and per-provider because that is what the fact is — nothing about
// Google is broken for the field, only on that phone.
//
// It is deliberately sticky. Whatever makes a return leg go missing is a
// property of the phone and its iOS, not of the minute, and a player who has
// already been walked into a dead end once should not be walked into it again
// to re-prove it. The pairing route ends in the same Firebase account either
// way, so the cost of taking it unnecessarily is one extra trip to Safari, and
// the cost of not taking it is a player who cannot sign in at all.

export const REDIRECT_FAIL_KEY = "wbc_auth_redirect_failed";

/**
 * Read the ledger back as a list of provider ids.
 *
 * Anything that is not ours — a half-written value, something another build
 * left — reads as an empty ledger, which is the harmless answer: the direct
 * route gets tried.
 *
 * @param {string|null} raw  what came out of storage
 * @returns {string[]} provider ids, deduped
 */
export const decodeRedirectFailures = (raw) => {
  if (!raw) return [];
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter(v => typeof v === "string" && v))];
};

/**
 * Add a provider to the ledger, returning the value to store.
 *
 * @param {string|null} raw         the current stored value
 * @param {string}      providerId  "apple" | "google"
 * @returns {string} the new value to store
 */
export const withRedirectFailure = (raw, providerId) => {
  const have = decodeRedirectFailures(raw);
  if (!providerId) return JSON.stringify(have);
  return JSON.stringify([...new Set([...have, providerId])]);
};

/**
 * Has this provider's redirect already come home empty on this device?
 *
 * @param {string|null} raw         the current stored value
 * @param {string}      providerId  "apple" | "google"
 * @returns {boolean}
 */
export const hasRedirectFailed = (raw, providerId) =>
  !!providerId && decodeRedirectFailures(raw).includes(providerId);

/**
 * What to say when the phone comes back from a provider with neither a user
 * nor an error.
 *
 * ── Why this stopped naming the other button ──────────────────────
 * It used to read "Sign in with Apple can't finish inside an iPhone
 * home-screen app — use Sign in with Google here." Taken literally, which is
 * the only way to take it, that advice is a trap: Google and Apple mint
 * SEPARATE Firebase accounts for the same human (see linkGoogleAccount in
 * firebase.js), so the player who follows it arrives as a stranger, and the
 * name he already claimed with Apple is no longer on the roster he is offered.
 * The message walked him out of a sign-in that usually works on the second tap
 * and into one that cannot work at all.
 *
 * So it names the button he pressed and asks him to press it again.
 *
 * ── And in a home-screen app, says where the second tap goes ──────
 * "Tap it again" was true for the player whose second tap worked, and a dead
 * end for the one whose didn't — he tapped it twice and got this message
 * twice. The empty return is now written to the ledger above, so in an
 * installed app the next tap of that same button takes the Safari route
 * instead of the one that just failed. The message says so, because a button
 * that quietly does something else the second time is its own confusion.
 *
 * @param {string|null} provider    which button was tried
 * @param {boolean}     standalone  is this an installed home-screen app?
 * @returns {string}
 */
export const emptyRedirectMessage = (provider, standalone = false) => {
  const button = provider === "apple" ? "Sign in with Apple"
    : provider === "google" ? "Sign in with Google"
    : "the sign-in button";
  if (standalone) {
    return `${button} didn't finish on the way back. Tap it again and we'll finish it in Safari — sign in there with the same button, or you'll end up with a second account.`;
  }
  return `${button} came back empty. Tap it again, and tell Aaron if it keeps happening.`;
};
