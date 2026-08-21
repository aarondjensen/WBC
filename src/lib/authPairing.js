// ══════════════════════════════════════════════════════════════════
//  authPairing — signing the home-screen app in, when the app cannot.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React, no storage, no randomness of its own. The
// Firestore and Auth halves live in src/firebase.js and functions/index.js;
// what is here is the bookkeeping, so the part that decides whether somebody
// gets into the tournament can be pinned by a test.
//
// ── The problem this exists for ───────────────────────────────────
// Sign in with Apple cannot complete inside an iPhone home-screen app, and it
// is not a bug anybody here can fix. Asked what URL to send a phone to,
// Firebase's own backend answers, for Apple:
//
//   appleid.apple.com/auth/authorize
//     scope         = email name
//     response_mode = form_post
//
// It adds those scopes itself — the client asks for none — and Apple's rule is
// that any scope forces `form_post`, so the trip home from Apple is a
// cross-site form POST. iOS hands a cross-site POST to Safari and does not
// hand it back, so the sign-in completes in Safari, in Safari's storage, while
// the installed app — which iOS gives a storage partition of its own — is
// still sitting on the sign-in screen. Google is unaffected because Firebase
// asks it for `response_type=id_token`, which comes home as a GET.
//
// A previous attempt removed the scopes on the client. It could not work: the
// scopes were never the client's to remove.
//
// ── The way round it ──────────────────────────────────────────────
// Stop trying to make the round trip come home. Sign in where sign-in already
// works — Safari — and carry the RESULT across the partition instead:
//
//   1. The home-screen app mints a pairing id: 32 random bytes, and the app
//      keeps it in its own localStorage.
//   2. It opens wannabecup.com/?pair=<id> in Safari.
//   3. Safari signs in the ordinary way. A Cloud Function mints a custom token
//      for that account and files it under the id.
//   4. The player taps the home-screen icon. The app presents the id it kept,
//      gets the token, and signs in with it.
//
// Nothing here depends on how iOS routes a browser, which is the whole point:
// every leg is a flow that already works today.
//
// ── Why the id is 32 bytes and single-use ─────────────────────────
// Whoever presents it gets signed in as that account, so it is a bearer
// token and is treated as one. 256 bits is not guessable; the Cloud Function
// deletes the record on the first successful claim, so it cannot be replayed;
// and it expires on its own ten minutes after it is offered, which is longer
// than a two-factor prompt and shorter than leaving a phone on a bar.
//
// The id also spends a moment in Safari's address bar. The app strips it out
// of the URL on arrival (see stripPairParam) so it does not sit in history or
// travel in a shared link.

// The query parameter Safari is opened with, and the localStorage key the
// home-screen app keeps its half under.
export const PAIR_PARAM = "pair";
export const PAIR_KEY = "wbc_auth_pair";

// Ten minutes, and the same number is enforced server-side — this copy only
// decides whether the app still bothers asking.
export const PAIR_TTL_MS = 10 * 60 * 1000;

// 32 bytes, base64url, which is 43 characters with no padding.
export const PAIR_ID_BYTES = 32;
const PAIR_ID_RE = /^[A-Za-z0-9_-]{43}$/;

/** Is this the shape a pairing id has? Used on both sides, and server-side. */
export const isPairId = (v) => typeof v === "string" && PAIR_ID_RE.test(v);

/**
 * Encode 32 random bytes as a pairing id.
 *
 * The randomness is passed IN rather than taken from crypto here, so a test
 * can pin the encoding without pinning the random source. Callers hand it
 * `crypto.getRandomValues(new Uint8Array(PAIR_ID_BYTES))`.
 *
 * @param {Uint8Array} bytes  exactly PAIR_ID_BYTES of them
 * @returns {string} 43 base64url characters
 */
export const encodePairId = (bytes) => {
  if (!bytes || bytes.length !== PAIR_ID_BYTES) {
    throw new Error(`A pairing id needs exactly ${PAIR_ID_BYTES} bytes.`);
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** What the home-screen app writes to localStorage when it opens Safari. */
export const encodePairing = (id, now) => JSON.stringify({ id, at: Number(now) || 0 });

/**
 * Read it back, refusing one that has expired.
 *
 * @returns {string|null} the pairing id still worth claiming, or null
 */
export const decodePairing = (raw, now, ttlMs = PAIR_TTL_MS) => {
  if (!raw) return null;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const at = Number(parsed.at) || 0;
  if (!at || Number(now) - at > ttlMs) return null;
  return isPairId(parsed.id) ? parsed.id : null;
};

/**
 * The pairing id Safari was opened with, if this is a pairing visit.
 *
 * Anything that is not the exact shape is ignored rather than reported — the
 * parameter is on a public URL, so a malformed one is somebody poking at it,
 * not a player with a problem.
 *
 * @param {string} search  location.search
 */
export const readPairParam = (search) => {
  let value = null;
  try { value = new URLSearchParams(search || "").get(PAIR_PARAM); } catch { return null; }
  return isPairId(value) ? value : null;
};

/**
 * The same URL with the pairing id taken out, for history.replaceState.
 *
 * Returns null when there was nothing to strip, so the caller can skip the
 * history write entirely rather than replacing a URL with itself.
 *
 * @param {string} href  location.href
 * @returns {string|null}
 */
export const stripPairParam = (href) => {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (!url.searchParams.has(PAIR_PARAM)) return null;
  url.searchParams.delete(PAIR_PARAM);
  // A trailing "?" left behind by deleting the only parameter is ugly in the
  // address bar and is what somebody screenshots.
  const query = url.searchParams.toString();
  return `${url.origin}${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
};

/**
 * The URL the home-screen app sends somebody to Safari with.
 *
 * @param {string} origin  location.origin
 * @param {string} id      the pairing id
 */
export const pairingUrl = (origin, id) => `${origin}/?${PAIR_PARAM}=${id}`;

// ── Turning a callable's failure into a sentence ──────────────────
// Callables answer with a code and a `message`. Which of the two is worth
// anything depends on where the failure happened, and telling them apart is
// the whole job of this function:
//
//   • The function RAN and threw. Its HttpsError carries a real explanation
//     written on the server — "couldn't mint the pairing token" — and that is
//     the most useful sentence anybody will get.
//   • The call never arrived. The SDK reports `internal` and sets the message
//     to the code word again, because a browser cannot read the status of a
//     response with no CORS headers — which is what an undeployed function, or
//     one without public invoker permission, answers with.
//
// Both used to land on this table's `internal` entry, which threw the server's
// explanation away and told the player to check their connection. That sent
// two people looking at their wifi while the actual fault was on the server —
// so a message with prose in it now wins over anything written here.
export const PAIRING_ERRORS = {
  // Kept for completeness, though a browser rarely sees it: a missing function
  // fails CORS first and arrives as `internal` below.
  "not-found": "Pairing isn't switched on for this app yet — a director needs to deploy the Cloud Functions.",
  // Deliberately does NOT just blame the phone. This is equally the shape of
  // "the Cloud Functions were never deployed" and "they are deployed but not
  // publicly invokable", and a player who can see the rest of the app working
  // has already ruled out their own connection.
  "internal": "Couldn't reach the pairing service. If the rest of the app is working, this is our end — tell Aaron.",
  "unavailable": "Couldn't reach the pairing service. If the rest of the app is working, this is our end — tell Aaron.",
  "deadline-exceeded": "The server took too long. Try again.",
  "unauthenticated": "That sign-in didn't stick. Sign in again in Safari, then come back.",
  "invalid-argument": "That pairing code isn't valid any more. Start again from the app.",
  "resource-exhausted": "Too many attempts. Wait a minute and try again.",
};

export const PAIRING_FALLBACK = "Pairing failed. Try again, or sign in at wannabecup.com in Safari.";

/**
 * @param {string} code           a callable error code, with or without "functions/"
 * @param {string} [serverMessage] the error's message, if there is one
 */
export const pairingErrorMessage = (code, serverMessage) => {
  const key = String(code || "").replace(/^functions\//, "");
  const msg = String(serverMessage || "").trim();
  // Prose means the function ran and explained itself. A single token means
  // the SDK echoed the code back and there is nothing behind it.
  if (msg && /\s/.test(msg) && msg !== key) return msg;
  return PAIRING_ERRORS[key] || PAIRING_FALLBACK;
};
