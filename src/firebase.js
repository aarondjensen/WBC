// ═══════════════════════════════════════════════════════════════════════════
// firebase.js — Firebase core + authentication layer for WBC
//
// Extracted from App.jsx (which previously held FIREBASE_CONFIG/_app/_db
// inline) so the app-store auth work (Google + Apple sign-in, account
// linking, account deletion) lives in one module. Patterns here are ported
// from the MNQ golf league app (github.com/aarondjensen/mnq-golf-league,
// src/firebase.js), which shipped through App Store / Play review with this
// exact architecture. Where a comment says "MNQ lesson", it documents a
// failure mode that was debugged the hard way there — do not simplify these
// away without re-reading the rationale.
//
// App.jsx imports { _app, _db } from here; the Firestore `db` data layer and
// FCM/VAPID push registration remain in App.jsx (they are messaging/data
// concerns, not auth).
// ═══════════════════════════════════════════════════════════════════════════

import { initializeApp } from "firebase/app";
import { resolveFirebaseConfig } from "./lib/firebaseConfig";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, deleteDoc, collection, query, where, getDocs, writeBatch,
} from "firebase/firestore";
// firebase/functions is NOT imported here. Its one caller in this file is the
// Apple token revoke inside deleteAccount, which pulls it in with a dynamic
// import — see the note there. Statically imported it rode in the chunk every
// phone fetches at launch, and it was initialized at module load too, for a
// callable that fires when somebody deletes their account.
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  signInWithCustomToken,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut,
  deleteUser,
} from "firebase/auth";
import { editionSlug, editionYear } from "./lib/editionId";
import { bootEdition, bootEditionMoved, defaultEdition } from "./lib/editionHome";
import {
  REDIRECT_MARK_KEY, encodeRedirectMark, decodeRedirectMark, emptyRedirectMessage,
} from "./lib/authRedirect";
import { PAIR_ID_BYTES, encodePairId, isPairId, pairingErrorMessage } from "./lib/authPairing";

// ─── Feature flag ──────────────────────────────────────────────────────────
// Master switch for the whole Google/Apple sign-in feature. Keep FALSE until
// the Phase 1 console work below is done. It gates THREE things that would
// otherwise run for every user on every cold start even though sign-in is off:
//   • authDomain (custom vs default) — see FIREBASE_CONFIG below
//   • the popup/redirect resolver on initializeAuth
//   • consumeRedirectResult() + the onAuthStateChanged subscription (App.jsx)
// Running the redirect/iframe machinery pointed at a custom authDomain is
// fragile in installed iOS PWAs and is pure overhead while the feature is dark,
// so nothing auth-related activates until this is TRUE. App.jsx imports this so
// the login screen and this module agree.
export const AUTH_PROVIDERS_ENABLED = true;

// Separate gate for Apple sign-in specifically. Google can go live before Apple
// is configured in the Firebase console (Apple provider + Service ID + key). We
// keep the Apple button hidden on web until this is TRUE so a not-yet-working
// provider can't be tapped. Sign in with Apple is required for the iOS App Store
// (Guideline 4.8) since we offer Google, so this flips TRUE before that
// submission — not before it's configured.
export const APPLE_PROVIDER_ENABLED = true;

// ─── Config ──────────────────────────────────────────────────────────────
// authDomain: while providers are OFF we use the DEFAULT firebaseapp.com
// domain — identical to the app's long-standing behavior, and it keeps the
// auth layer off the Vercel-proxied /__/auth/* path entirely. Only when
// AUTH_PROVIDERS_ENABLED flips TRUE do we switch to our own domain, which is
// what makes signInWithRedirect first-party and survive iOS storage
// partitioning in the installed PWA (MNQ lesson).
//
// CONSOLE PREREQUISITES to satisfy BEFORE flipping AUTH_PROVIDERS_ENABLED:
//   1. Firebase Console → Auth → Sign-in method → enable Google (+ Apple)
//   2. Auth → Settings → Authorized domains → add wannabecup.com
//   3. Google Cloud → Credentials → OAuth Web client → Authorized redirect
//      URIs → add https://wannabecup.com/__/auth/handler
//   4. Ensure vercel.json's /__/auth/* + /__/firebase/* rewrites are deployed
// Firestore and FCM never use authDomain, so this switch is invisible to them.
const PROD_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBcS6KphgfN15xwfCcmLXx3YMIMUeYuhfc",
  authDomain: AUTH_PROVIDERS_ENABLED ? "wannabecup.com" : "wannabecup-c5aab.firebaseapp.com",
  projectId: "wannabecup-c5aab",
  storageBucket: "wannabecup-c5aab.firebasestorage.app",
  messagingSenderId: "281900029443",
  appId: "1:281900029443:web:68da433d8ec5a16b74a036",
};

// ── Pointing a dev server at a different project ────────────────────
// There is one Firebase project behind this app and it holds the real
// tournament. The admin console writes on edit, so a dev server aimed at
// production can corrupt a live round with one stray click. Copy .env.example
// to .env.local and fill in every VITE_FIREBASE_* var to aim that machine at a
// scratch Firebase project instead.
//
// The override is deliberately ALL-OR-NOTHING: a partial set throws at startup
// rather than silently pairing a dev project id with the prod API key, which
// would look like it worked and write to production anyway. That failure is the
// entire reason the mechanism is shaped this way — a half-applied override is
// worse than no override, because it reports success.
//
// Ported from Bourbon Cup, which has had this for a while. WBC and MnQ were
// both hardcoded to their live projects, so neither had any way to work against
// scratch data at all.
//
// Note this replaces authDomain along with everything else, so a scratch
// project does NOT inherit the wannabecup.com switch above — which is correct:
// that domain only resolves because of this project's Vercel rewrites, and
// pointing a scratch project at it would send sign-in to the wrong place.
const _resolveFirebaseConfig = () => {
  let verdict;
  try {
    verdict = resolveFirebaseConfig(import.meta.env, PROD_FIREBASE_CONFIG, "real tournament data");
  } catch (e) {
    // Logged as well as re-thrown: this throws during module evaluation, before
    // React (and main.jsx's root error boundary) exists, so the only symptom on
    // screen is a blank page.
    console.error(e.message);
    throw e;
  }
  if (verdict.warn) console.warn(verdict.warn);
  if (verdict.source === "env") console.info(`[firebase] Using project "${verdict.config.projectId}" from env.`);
  return verdict.config;
};

const FIREBASE_CONFIG = _resolveFirebaseConfig();

export const _app = initializeApp(FIREBASE_CONFIG);

// ─── Firestore, with the cache on disk ─────────────────────────────────────
// This was `getFirestore(_app)`, which gives an in-MEMORY cache: it lives as
// long as the page does and is thrown away on every reload.
//
// That is the wrong default for this app specifically. App.jsx subscribes to
// eight collections scoped to the whole tournament, and hole_scores alone is
// twelve players × four rounds × eighteen holes — 864 documents. With a memory
// cache, every cold start re-reads all ~1,000 of them from the server, and a
// phone on a golf course cold-starts constantly: the screen locks, iOS evicts
// the tab, somebody switches to the camera and back. Twelve phones doing that
// thirty or forty times over a day of golf is a few hundred thousand billed
// reads against a 50,000/day no-cost quota.
//
// A persistent cache changes what a relaunch costs. The listener resumes from
// the token it stored, so the server sends only what CHANGED since the phone
// last had it — a handful of holes somebody posted — instead of the whole
// tournament again. The documents already on disk are neither re-sent nor
// re-billed. Same screens, same code, one to two orders of magnitude fewer
// reads.
//
// It is also strictly better on a course with no signal: a relaunch out of
// range now paints the leaderboard from disk instead of showing nothing.
//
// ── Why the multi-tab manager ──
// Without it, persistence is claimed by ONE tab and every other tab fails to
// initialize its cache. Somebody with the leaderboard open on a laptop and the
// scoring screen open in a second tab is a completely ordinary thing here, and
// the failure would look like the app being broken in whichever tab lost.
//
// ── Why the fallback ──
// IndexedDB is not always available — Safari private browsing, a locked-down
// WebView, a browser with storage disabled. initializeFirestore throws in
// those cases, and an app that fails to load a leaderboard because it could
// not open a CACHE would be a bad trade for the saving. Falling back to the
// old memory-cached behaviour costs reads and loses nothing else.
export const _db = (() => {
  try {
    return initializeFirestore(_app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn("Firestore persistent cache unavailable; falling back to memory.", e?.message || e);
    return getFirestore(_app);
  }
})();

// Firestore collections owned by this module. wbc_users maps a Firebase
// Auth uid → player_id (the permanent career identity shared with 16 years
// of historical CSV data). Docs are keyed by uid.
export const USERS_COLLECTION = "wbc_users";
const TOKENS_COLLECTION = "wbc_notifications_tokens";

// ── Active edition pointer ──────────────────────────────────────────
// Every tournament-scoped query and write is filtered by `tournament_id`, so
// multiple editions (wbc_2026, wbc_2027, …) coexist in one Firestore. That id
// used to be a `const` in App.jsx; it is now a single mutable source, so a
// director can start next year's tournament without a redeploy.
//
// `TOURNAMENT_ID` is exported as a LIVE BINDING: it is an exported `let`
// reassigned inside this module, so every importer reads the current edition
// at access time and no existing call site had to change. New code should
// prefer getActiveTournamentId() / tournamentFilter(); all three read the same
// source. The pointer persists per-device in localStorage and defaults to
// wbc_2026, so behavior is unchanged until an edition is chosen.
//
// ── Where the app OPENS is a separate question ──
// The pointer says which edition the app is in; it does not follow that a
// pointer left on a past year should still be there next launch. A player who
// had a look at 2014 off More → Tournaments would otherwise open the app on
// the first tee into a twelve-year-old tournament. lib/editionHome owns that
// rule and its reasoning; here is only the storage it reads.
// Named in lib/editionHome, overridable per deploy with VITE_DEFAULT_EDITION
// so next year's tournament is a build setting rather than a code change.
const DEFAULT_TOURNAMENT_ID = defaultEdition({
  override: typeof import.meta !== "undefined" ? import.meta.env?.VITE_DEFAULT_EDITION : "",
});
export const ACTIVE_EDITION_KEY = "wbc_active_edition";

// The edition switched to during THIS run of the app, in sessionStorage so a
// cold start forgets it. It has to survive one reload, because switching
// editions IS a reload (see lib/editions).
const EDITION_VISIT_KEY = "wbc_edition_visit";

// Has this device ever been signed in as a director? A cached hint written by
// App.jsx when the membership resolves, read here at import time — long before
// any account has loaded — for the one decision it is allowed to make: whether
// a pointer parked on another edition is kept. It authorizes nothing. Every
// write is still firestore.rules' to refuse, and a stale hint on a phone that
// is no longer a director's costs that phone nothing but a pointer it kept.
const DIRECTOR_HINT_KEY = "wbc_edition_keeper";

const _readInitialEdition = () => {
  let stored = null;
  try {
    if (typeof localStorage !== "undefined") stored = localStorage.getItem(ACTIVE_EDITION_KEY);
  } catch { /* blocked storage / SSR */ }

  // `sessionKnown` distinguishes "no visit" from "cannot read a visit". Where
  // sessionStorage is unavailable no visit could ever be recorded, and every
  // switch would be undone by its own reload.
  let visit = null;
  let sessionKnown = true;
  try {
    if (typeof sessionStorage === "undefined") sessionKnown = false;
    else visit = sessionStorage.getItem(EDITION_VISIT_KEY);
  } catch { sessionKnown = false; }

  let isDirector = false;
  try {
    if (typeof localStorage !== "undefined") isDirector = localStorage.getItem(DIRECTOR_HINT_KEY) === "1";
  } catch { /* blocked storage */ }

  const booted = bootEdition({ stored, visit, home: DEFAULT_TOURNAMENT_ID, isDirector, sessionKnown });

  // Write the decision back, so a player returned to the live tournament is
  // returned to it once rather than every launch, and so anything else reading
  // the key sees the edition actually on screen.
  if (bootEditionMoved(stored, booted)) {
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_EDITION_KEY, booted);
    } catch { /* blocked storage */ }
  }
  return booted || DEFAULT_TOURNAMENT_ID;
};

export let TOURNAMENT_ID = _readInitialEdition();

// ── Per-edition document-ID slug ────────────────────────────────────
// WBC's document ids embed the year directly — `hs_2026_r1_aaron_j_h4`,
// `tp_2026_aaron_j`, `tr_2026_r1`. That literal `2026` was hardcoded, so a
// second edition would have written the SAME ids and overwritten the first,
// even though its rows carry a different tournament_id and read back
// correctly. Filtering separates the reads; only distinct ids separate the
// writes.
//
// So the year in those ids now comes from the active edition. The slug is the
// edition id with its `wbc_` prefix removed:
//
//   wbc_2026 → "2026"   — byte-identical to every id already in the database
//   wbc_2027 → "2027"
//
// That back-compatibility is the reason for a slug rather than Bourbon Cup's
// `${tid}__${bareId}` prefix scheme: BC had to leave its original edition
// un-namespaced as a special case, whereas here the existing edition's ids
// simply keep falling out of the general rule.
//
// A non-year id still works — wbc_masters → "masters" — it just has to be
// unique, which is exactly the constraint the edition id itself already has.
export const getEditionSlug = (tid = TOURNAMENT_ID) => editionSlug(tid);

export const getActiveTournamentId = () => TOURNAMENT_ID;

// Is the active edition the original one the app shipped with?
//
// This exists for exactly one caller: App.jsx's roster bootstrap, which seeds
// `tournament_players` from the global `players` registry when an edition has
// no roster yet. That was a one-time migration for the original edition, and
// it becomes actively wrong once editions exist — a director who creates a
// BLANK 2027 would find it pre-filled with every golfer who has ever played,
// all at index 0, with no indication of where they came from. A newly created
// edition's roster is whatever the director cloned or added, including empty.
export const isDefaultEdition = () => TOURNAMENT_ID === DEFAULT_TOURNAMENT_ID;

// The tournament being played, whatever this device happens to have open.
// EditionBanner asks, so it can offer the way back; see liveEdition.
export const getHomeEditionId = () => DEFAULT_TOURNAMENT_ID;

// The active edition's year, derived from its id (wbc_2026 → 2026). Single
// source for every "which year is this" label, so the displayed year always
// matches the edition whose data is on screen.
export const getTournamentYear = () => editionYear(TOURNAMENT_ID);

export const setActiveTournamentId = (id) => {
  if (!id) return TOURNAMENT_ID;
  TOURNAMENT_ID = id;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(ACTIVE_EDITION_KEY, id);
  } catch { /* ignore */ }
  // Deliberate: somebody chose this edition just now, so it holds until the
  // app is closed even if it is not the live one.
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(EDITION_VISIT_KEY, id);
  } catch { /* ignore */ }
  return TOURNAMENT_ID;
};

// ── Has anybody ever signed in on this device? ─────────────────────
// Firebase Auth restores its session from IndexedDB, asynchronously, so on
// every cold start there is a window — usually a few hundred milliseconds —
// in which the app cannot tell a signed-in player from a stranger.
//
// Normally nothing shows for it: the player's session is also in localStorage
// and is read synchronously, so the app renders the tournament and the auth
// answer lands behind it. Switching editions is the case where that does not
// hold, because the switch deliberately clears the stored session (see
// switchEdition) — so the reload comes up with no player, no Firebase user
// YET, and falls through to the sign-in screen. Google and Apple buttons flash
// in front of somebody who is already signed in and merely changing years.
//
// This is the flag that closes that window: a device that has signed in before
// holds the splash until Firebase answers, rather than assuming nobody is
// there. It is a HINT about what to draw, never about what is allowed —
// firestore.rules decides that, and a stale flag costs a device half a second
// of logo before the sign-in screen it was going to show anyway.
const AUTH_SEEN_KEY = "wbc_signed_in";

export const rememberSignedIn = (on) => {
  try {
    if (typeof localStorage === "undefined") return;
    if (on) localStorage.setItem(AUTH_SEEN_KEY, "1");
    else localStorage.removeItem(AUTH_SEEN_KEY);
  } catch { /* blocked storage */ }
};

export const hadAuthSession = () => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(AUTH_SEEN_KEY) === "1";
  } catch { return false; }
};

// Remember whether this device belongs to a director, for the boot decision
// above. Called from App.jsx wherever the membership flag is read.
export const rememberDirector = (on) => {
  try {
    if (typeof localStorage === "undefined") return;
    if (on) localStorage.setItem(DIRECTOR_HINT_KEY, "1");
    else localStorage.removeItem(DIRECTOR_HINT_KEY);
  } catch { /* blocked storage */ }
};

// Standard tournament-scope filter for db queries — routes through the active
// edition. Prefer this over hand-writing the filter literal.
export const tournamentFilter = () => [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }];

// ─── Native platform detection ───────────────────────────────────────────
// The Capacitor shells (iOS/Android) are not built yet, so @capacitor/core
// is deliberately NOT a dependency. The native runtime injects a global
// `window.Capacitor`, so this probe is safe everywhere: false in every
// browser/PWA today, true inside the future native shells with no code
// change required here.
export const isNativePlatform = () => {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
};

// True only inside the native ANDROID shell. Used to hide Sign in with Apple
// there: Android has no native Apple SDK, so the plugin falls back to a Chrome
// Custom Tab web flow that we cannot verify (and which crashed the emulator).
// Nothing requires Apple sign-in on Android — App Store Guideline 4.8 applies
// to the iOS app only, and Google Play has no equivalent rule. Android users who
// registered via Apple can still sign in on the web app at wannabecup.com.
export const isAndroidNative = () => {
  try {
    return isNativePlatform() && window.Capacitor.getPlatform() === "android";
  } catch {
    return false;
  }
};

// ─── Native auth plugin ──────────────────────────────────────────────────
// The Capacitor Firebase Auth plugin (FirebaseAuthentication) is imported
// statically at the top of this module and used DIRECTLY at each call site.
//
// Do NOT wrap it in `await loadPlugin()` or otherwise `await` the plugin
// OBJECT itself. FirebaseAuthentication is a Capacitor Proxy: awaiting it (or
// returning it from an async function, which assimilates it as a thenable)
// makes the runtime probe it for a `.then` method. The proxy answers every
// property access as a native method call, so `.then` becomes a bogus native
// call that never resolves — the await hangs forever with no error. Only
// `await` the plugin's METHOD calls (e.g. FirebaseAuthentication.signInWithApple()),
// which return real promises. On web the plugin is imported but never invoked
// (every caller is isNativePlatform()-gated), so it's inert there.
//
// ── Deferring this was tried, and does not work. Do not try it again ──
// The plugin plus @capacitor/core are the only Capacitor code this app
// imports, and a browser can never reach any of it, so an `await import()`
// behind the native gates looks like free savings. Measured, it is not:
//
//   • The chunk they land in (`vendor`) also holds Vite's module-preload
//     helper, which every dynamic import in the app needs. That helper is
//     eager, so the chunk is eager, so the plugin ships regardless.
//   • Giving them a chunk of their own in vite.config.js does get them out of
//     `vendor`, but the plugin's web implementation imports a much larger
//     slice of firebase/auth than this app does — 127KB of it — and rolldown
//     moves that slice into the new chunk with them. The new chunk is then
//     eager too, because the app's own auth code depends on the same modules.
//     Net saving over the whole build: about 3KB gzipped.
//   • Pinning firebase/auth to its own group to separate them does nothing at
//     all: rolldown ignores that group and emits a byte-identical build.
//
// So the cost is a shape this file's own warning above says hangs forever if
// it is written even slightly wrong, on the one code path — native sign-in —
// that cannot be exercised from a dev machine. Not worth 3KB.


// ─── The resolver, with its redirect state on disk ───────────────────────
// `browserPopupRedirectResolver` is what makes popup and redirect sign-in work
// at all (see the CAVEAT below). It also decides WHERE the redirect round trip
// keeps its state, and the stock answer — sessionStorage — is what breaks Sign
// in with Apple inside an iPhone home-screen app.
//
// ── The failure, exactly ──────────────────────────────────────────
// signInWithRedirect writes a `pendingRedirect` flag before navigating away,
// and getRedirectResult reads it on the way back. Read the SDK
// (@firebase/auth, RedirectAction.execute) and the consequence is stark: with
// no flag it does not wait for the auth event, does not raise anything, and
// resolves NULL. No user, no error, no clue.
//
// The flag lives in sessionStorage, and a home-screen web app is suspended for
// the whole of the trip to Apple and back — which is precisely when iOS is
// free to evict it. It relaunches on the return leg with sessionStorage empty,
// so the credential Apple just handed back is dropped on the floor and the
// player is looking at the sign-in screen again. In Safari the same button
// takes the popup path and never touches any of this, which is why it works
// there and not in the installed app.
//
// Persistence is the one thing about the resolver worth changing, and the SDK
// reads it off a single field. Subclassing to swap that field keeps every
// other behaviour — the iframe, the origin validation, the popup path —
// exactly as shipped.
//
// ── The cost, stated ──────────────────────────────────────────────
// localStorage is shared between tabs where sessionStorage was not, so two
// browser tabs starting redirects at once can consume each other's flag. That
// is a desktop shape nobody here has; the phone shape is the whole feature.
// The empty-return message now asks for another tap, and a second tap works.
//
// ── If a Firebase upgrade moves this ──────────────────────────────
// The guard below refuses the swap unless the stock resolver really does carry
// `_redirectPersistence`, so a rename degrades to today's behaviour rather
// than to a resolver the SDK cannot use. authResolver.test.js asserts the
// field is still there, so the rename fails the suite instead of the
// tournament.
const _redirectResolver = (() => {
  // Providers off: nothing below ever runs, so build nothing (see the gate note
  // under initializeAuth — while sign-in is dark this file touches no Auth
  // machinery at all on a cold start).
  if (!AUTH_PROVIDERS_ENABLED) return browserPopupRedirectResolver;
  try {
    if (typeof browserPopupRedirectResolver !== "function") return browserPopupRedirectResolver;
    if (!("_redirectPersistence" in new browserPopupRedirectResolver())) return browserPopupRedirectResolver;
    return class DurableRedirectResolver extends browserPopupRedirectResolver {
      constructor() {
        super();
        this._redirectPersistence = browserLocalPersistence;
      }
    };
  } catch (e) {
    console.warn("redirect persistence left on sessionStorage:", e?.message || e);
    return browserPopupRedirectResolver;
  }
})();

// ─── Auth persistence — explicit and durable (MNQ lesson) ────────────────
// Bare getAuth() resolves persistence through a SILENT fallback chain
// [indexedDB → localStorage → sessionStorage → in-memory]. If IndexedDB is
// unavailable or unwritable (corrupted IDB, iOS lockdown/content settings,
// storage-pressure eviction), it quietly degrades to an ephemeral tier and
// the symptom is "I signed in, came back, and it made me log in again" with
// NO error logged. initializeAuth pins persistence to the durable tiers
// only, applied synchronously at construction so there is no race against
// onAuthStateChanged/getRedirectResult on cold start.
//
// CAVEAT: initializeAuth does NOT auto-register the popup/redirect resolver
// that getAuth wires up. Without browserPopupRedirectResolver, both the
// popup (browser-tab) and redirect (installed-PWA) Google flows break — so
// we pass it explicitly on WEB — as `_redirectResolver`, the one built above.
//
// MNQ lesson (native): the resolver must be OMITTED on native. initializeAuth
// eagerly processes pending-redirect state THROUGH the resolver during
// construction, which loads a cross-origin auth iframe from authDomain. In
// WKWebView (origin capacitor://localhost) the postMessage handshake never
// completes, Auth's init promise hangs, onAuthStateChanged never fires, and
// the app sits on its loading state forever with no error. Native sign-in
// arrives via the Capacitor plugin instead, so the web resolver is never
// needed there.
// GATE THE WHOLE THING behind AUTH_PROVIDERS_ENABLED.
//
// This is the important part: initializeAuth() — even with NO resolver — opens
// an IndexedDB connection (firebaseLocalStorageDb) synchronously at module
// eval to hydrate persisted auth state. IndexedDB in an iOS *standalone PWA*
// is fragile on a cold reopen (the DB can be briefly locked/unavailable during
// the launch transition), and firing that open on every single cold start —
// for a sign-in feature that is currently OFF — buys us nothing but risk. The
// long-working single-file build never touched Auth at all; this restores that
// property while providers are disabled. When we flip AUTH_PROVIDERS_ENABLED
// on (Phase 1 console work done), initializeAuth runs exactly as before, with
// the web resolver attached. Nothing references _auth while disabled: the
// onAuthStateChanged listener is gated in App.jsx and every sign-in helper
// below now short-circuits on a null _auth.
let _authInstance = null;
if (AUTH_PROVIDERS_ENABLED) {
  try {
    _authInstance = initializeAuth(_app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      // Resolver on web only; omitted on native (see the WKWebView note above).
      ...(!isNativePlatform()
        ? { popupRedirectResolver: _redirectResolver }
        : {}),
    });
  } catch (e) {
    // No IndexedDB AND no localStorage — effectively never outside hard-locked
    // private modes. Fall back to plain getAuth so the app still loads.
    console.error("initializeAuth failed; falling back to getAuth:", e?.message || e);
    _authInstance = getAuth(_app);
  }
}
export const _auth = _authInstance;

// ─── Providers ───────────────────────────────────────────────────────────
export const _googleProvider = new GoogleAuthProvider();

// Apple uses the generic OAuthProvider with the 'apple.com' provider id —
// the Firebase JS SDK has no dedicated AppleAuthProvider class.
//
// ── NO SCOPES — and it does NOT buy what it was thought to buy ─────
// This asked for `email` and `name`, and was changed to ask for nothing on the
// theory that Apple's scope rule (any scope forces `response_mode=form_post`)
// was what broke Sign in with Apple inside an iPhone home-screen app.
//
// The theory was right about the cause and wrong about the cure. Asked what
// URL to send a phone to — with a provider carrying NO scopes, exactly as
// below — Firebase's own backend answers:
//
//   appleid.apple.com/auth/authorize
//     response_type = code
//     scope         = email name        ← added server-side, not by us
//     response_mode = form_post
//
// The scopes are Firebase's, not the client's, and there is no console setting
// or client call that removes them. So Apple's trip home is a cross-site form
// POST no matter what this line says, iOS hands that POST to Safari and does
// not hand it back, and the web redirect flow cannot complete inside an
// installed app. lib/authPairing is the way round it, and the reason the Apple
// button does something else entirely there.
//
// Asking for nothing here is still right — it just is not a fix. The app never
// matches on email (players claim a profile by picking their own name off the
// roster, which is why Apple's "Hide My Email" relay was always irrelevant)
// and a missing displayName falls back to the claimed player's name. Scopes we
// do not use are consent screen somebody has to read.
//
// The NATIVE build is untouched: it signs in through the Capacitor plugin's
// own Apple sheet, which never makes this trip at all.
export const _appleProvider = new OAuthProvider("apple.com");

// Apple OAuth token/code, captured at sign-in / reauth. Firebase does NOT
// persist the Apple token, but App Store Guideline 5.1.1(v) requires the app to
// REVOKE it when an Apple user deletes their account (deleting the Firebase user
// alone is not enough). Two shapes depending on platform:
//   • WEB   → OAuthProvider.credentialFromResult(result).accessToken
//   • NATIVE→ result.credential.authorizationCode (the Capacitor plugin surfaces
//             an authorization CODE, not an access token; Firebase's
//             revokeAccessToken accepts it and exchanges it server-side).
// The authorization code is single-use and expires in ~5 minutes, so it MUST be
// obtained fresh via re-authentication at deletion time — deleteAccount does that.
let _appleAccessToken = null;
let _appleAuthorizationCode = null;
const captureAppleToken = (result) => {
  try {
    const token = OAuthProvider.credentialFromResult(result)?.accessToken;
    if (token) _appleAccessToken = token;
  } catch { /* not an Apple result, or no token — ignore */ }
};

// Gate for rendering Apple sign-in/link buttons on NATIVE builds. Native
// Apple auth THROWS unless the app is fully Apple-enabled:
//   1. "apple.com" in plugins.FirebaseAuthentication.providers
//      (capacitor.config.json)
//   2. "Sign in with Apple" capability on the iOS App target (Xcode →
//      Signing & Capabilities) + Service ID/key configured in the Apple
//      Developer portal and Firebase Console (Auth → Apple)
//   3. npx cap sync ios + rebuild + upload a new binary
// Keeping this FALSE means a build in App Store review can never surface an
// Apple button that errors on tap. Flip to TRUE in the same change that
// ships the Apple-enabled native build. Web Apple sign-in (popup) is
// unaffected by this flag.
export const NATIVE_APPLE_ENABLED = true;

// ─── Error mapping ───────────────────────────────────────────────────────
// Translate Firebase auth/link error codes into user-facing messages.
// Anything unrecognized falls through to the raw Firebase message so nothing
// is silently swallowed during debugging.
const mapAuthError = (e) => {
  const code = e?.code || "";
  const friendly = {
    // The two console-setting failures, named rather than described. Firebase's
    // own text for these ("This operation is not allowed", "This domain is not
    // authorized") sends whoever is holding the phone hunting through the app
    // for a bug that is a toggle in a web console — and the person reading it
    // is usually also the person who can fix it. Ported from The Bourbon Cup,
    // where guessing at these cost an afternoon.
    "auth/operation-not-allowed":
      "That sign-in method isn't switched on for this app yet — Firebase console → Authentication → Sign-in method.",
    "auth/unauthorized-domain":
      `Sign-in isn't allowed from ${typeof location !== "undefined" ? location.hostname : "this domain"} — add it under Firebase console → Authentication → Settings → Authorized domains.`,
    "auth/operation-not-supported-in-this-environment":
      "This browser can't complete sign-in. Try opening the site in Safari or Chrome.",
    "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
    "auth/internal-error": "Sign-in failed on the way back. Try again.",
    "auth/account-exists-with-different-credential":
      "You already signed in here with the other button. Use the one you used the first time.",
    "auth/provider-already-linked": "That sign-in method is already linked to your account.",
    "auth/credential-already-in-use":
      "That account is already registered as a separate login. A tournament director needs to remove the duplicate user in Firebase before it can be linked.",
    "auth/email-already-in-use": "That email is already tied to a different account.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/user-cancelled": "Sign-in was cancelled.",
    "auth/popup-blocked": "The sign-in popup was blocked by the browser. Allow popups and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/requires-recent-login": "For your security, please sign out and back in, then try again.",
  }[code];
  const err = new Error(friendly || e?.message || "Sign-in failed.");
  err.code = code;
  return err;
};

const requireCurrentUser = () => {
  const user = _auth?.currentUser;
  if (!user) {
    const err = new Error("You need to be signed in first.");
    err.code = "auth/no-current-user";
    throw err;
  }
  return user;
};

// ─── Google sign-in ──────────────────────────────────────────────────────
// One entry point for every platform. The rest of the app never needs to
// know where the credential came from — onAuthStateChanged fires the same
// way for popup, redirect, and native, keeping the JS SDK as the single
// source of truth for auth state.
//
//   browser tab      → signInWithPopup
//   installed PWA    → signInWithRedirect (popups are unreliable in iOS
//                      standalone mode; the first-party authDomain +
//                      vercel.json proxy make the redirect round-trip
//                      survive iOS storage partitioning — MNQ lesson)
//   native (future)  → Capacitor plugin mints a Google ID token; we
//                      exchange it via signInWithCredential. With
//                      skipNativeAuth:true (capacitor.config.json) the
//                      plugin holds no native Firebase session — the JS SDK
//                      remains the only auth authority, matching web.
const isStandalonePWA = () =>
  (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
  window.navigator.standalone === true;

// ─── Saying so when a redirect comes back empty (Bourbon Cup lesson) ─────
// A redirect that returns with neither a user nor an error is the single most
// confusing failure this file can produce: the app looks like it just ignored
// you. It happened in The Bourbon Cup from an iOS home-screen install — back
// from the auth handler with NO user and NO error, straight to the sign-in
// screen again, twice in a row, with nothing to go on. The cause was Safari
// partitioning storage per top-level origin, so a handler on
// <project>.firebaseapp.com could not hand the result back.
//
// WBC should not hit that: authDomain is wannabecup.com and vercel.json
// proxies /__/auth/*, which makes the handler first-party. But "should not"
// is not "cannot" — a missed OAuth redirect URI in Google Cloud, a Vercel
// rewrite that stops matching, or the evicted home-screen app the resolver
// note above is about, all reproduce it exactly. So the fact that a redirect
// was attempted at all gets recorded, and coming back empty becomes a sentence
// on screen instead of a silent loop.
//
// It is kept in localStorage, with a time on it — NOT sessionStorage. See
// lib/authRedirect for why: an iPhone home-screen app is suspended for the
// whole of the trip to the provider and back, and a suspended web app is one
// iOS may evict, which empties sessionStorage. The mark has to survive that
// or the app comes home with no memory of having left.
const markRedirect = (providerId) => {
  try { localStorage.setItem(REDIRECT_MARK_KEY, encodeRedirectMark(providerId, Date.now())); }
  catch { /* blocked storage */ }
};

const takeRedirectMark = () => {
  try {
    const raw = localStorage.getItem(REDIRECT_MARK_KEY);
    if (raw) localStorage.removeItem(REDIRECT_MARK_KEY);
    return decodeRedirectMark(raw, Date.now());
  } catch { return null; }
};

// Popup failures worth retrying as a redirect rather than showing to the user.
// `popup-blocked` is a blocker extension or a browser that wanted a more
// direct gesture; `operation-not-supported-in-this-environment` is a webview
// with no popup support at all. Before this, either one ended the attempt with
// an error message and no way forward on that device.
const REDIRECT_FALLBACK = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

// ─── The web half of both providers ──────────────────────────────────────
// One routing decision, shared by Google and Apple so the two can never
// drift: installed PWA takes the redirect (popups are unreliable in iOS
// standalone mode, and the first-party authDomain makes the round trip
// survive storage partitioning); everywhere else takes the popup, which
// never unloads the app, with the redirect as its fallback.
const webSignIn = async (providerId, provider) => {
  const viaRedirect = async () => {
    markRedirect(providerId);
    try {
      // Resolves on the return trip — consumeRedirectResult() on app mount
      // completes the flow.
      return await signInWithRedirect(_auth, provider);
    } catch (e) { takeRedirectMark(); throw e; }
  };

  if (isStandalonePWA()) return viaRedirect();
  try {
    return await signInWithPopup(_auth, provider);
  } catch (e) {
    // A popup this environment could never have opened is not a reason to
    // give up; it is a reason to take the long way round.
    if (REDIRECT_FALLBACK.has(e?.code)) return viaRedirect();
    throw e;
  }
};

export const doGoogleSignIn = async () => {
  if (!_auth) throw new Error("Sign-in is not enabled yet.");
  try {
    if (isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result?.credential?.idToken;
      if (!idToken) throw new Error("Google sign-in did not return an ID token.");
      const credential = GoogleAuthProvider.credential(idToken);
      return await signInWithCredential(_auth, credential);
    }
    return await webSignIn("google", _googleProvider);
  } catch (e) {
    throw mapAuthError(e);
  }
};

// Call once on app mount (before rendering the login screen) to finish a
// pending signInWithRedirect round-trip. Returns the UserCredential or null
// if there was no pending redirect.
export const consumeRedirectResult = async () => {
  if (!_auth) return null; // auth disabled → no pending redirect to consume
  // Native has no web-redirect flow (it uses the plugin's native sheets), and
  // the native auth instance intentionally has NO popupRedirectResolver.
  // getRedirectResult() REQUIRES a resolver and throws auth/argument-error
  // without one — so calling it on native fails on every launch. Skip it.
  if (isNativePlatform()) return null;
  const attempted = takeRedirectMark();
  try {
    const result = await getRedirectResult(_auth);
    if (result) {
      captureAppleToken(result); // no-op for non-Apple results
      return result;
    }
    // We sent them to the provider and got back nothing at all — no user and
    // no error. Naming it beats another silent trip to the sign-in screen; see
    // the note on markRedirect above for what causes it and what to check.
    if (attempted) {
      // ── What it says, and what it deliberately no longer says ───
      // This used to read "Sign in with Apple can't finish inside an iPhone
      // home-screen app — use Sign in with Google here." It was written when
      // that looked like the truth, and it made things worse: Google and Apple
      // mint SEPARATE Firebase accounts for the same human, so a player who
      // took the advice arrived as a stranger, and the name he had already
      // claimed with Apple was gone from the roster he was offered. He was
      // walked out of a sign-in that works on the second tap and into one that
      // cannot work at all.
      //
      // The mark records which provider was tried, so the message names that
      // button and asks for it again. The wording lives in lib/authRedirect
      // with a test that it never points at the other provider.
      const err = new Error(emptyRedirectMessage(attempted, isStandalonePWA()));
      err.code = "app/redirect-empty";
      throw err;
    }
    return null;
  } catch (e) {
    if (e?.code === "app/redirect-empty") throw e;
    throw mapAuthError(e);
  }
};

// ─── Sign in with Apple ──────────────────────────────────────────────────
// App Store Guideline 4.8: offering Google sign-in REQUIRES offering Sign
// in with Apple. Mirrors doGoogleSignIn, plus Apple's nonce contract.
//
// MNQ lesson (native): rawNonce MUST be result.credential.nonce. Apple
// embeds the SHA-256 of the raw nonce in the ID token and Firebase re-hashes
// rawNonce to verify it; omitting it yields auth/invalid-credential.
export const doAppleSignIn = async () => {
  if (!_auth) throw new Error("Sign-in is not enabled yet.");
  try {
    if (isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithApple();
      const idToken = result?.credential?.idToken;
      if (!idToken) throw new Error("Apple sign-in did not return an ID token.");
      // Native plugin surfaces an authorization CODE (no access token). Stash it
      // for revocation; note it expires quickly, so deleteAccount refreshes it.
      if (result.credential?.accessToken) _appleAccessToken = result.credential.accessToken;
      if (result.credential?.authorizationCode) _appleAuthorizationCode = result.credential.authorizationCode;
      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({ idToken, rawNonce: result.credential?.nonce });
      return await signInWithCredential(_auth, credential);
    }
    const result = await webSignIn("apple", _appleProvider);
    // Null on the redirect path (the browser is navigating away); the token is
    // captured on the return trip by consumeRedirectResult instead.
    if (result) captureAppleToken(result);
    return result;
  } catch (e) {
    throw mapAuthError(e);
  }
};

// ─── Auth pairing — the way into the home-screen app ─────────────────────
// Sign in with Apple cannot finish inside an iPhone home-screen app, and it is
// not ours to fix: Firebase's backend asks Apple for `scope=email name` — the
// client asks for none — and any scope forces `response_mode=form_post`, so
// the trip home is a cross-site POST that iOS hands to Safari and never hands
// back. lib/authPairing carries the whole reasoning; functions/index.js holds
// the server half. This is the three calls the app makes.
//
// The pairing id is a bearer credential, so it is minted from the platform CSPRNG
// and nowhere else. No Math.random fallback: a predictable id would be a way to
// sign in as somebody else, and an app that cannot make a safe one must say so
// rather than make an unsafe one.
export const newPairId = () => {
  const rng = globalThis.crypto;
  if (!rng?.getRandomValues) {
    const e = new Error("This browser can't generate a secure pairing code. Sign in at wannabecup.com in Safari instead.");
    e.code = "app/no-crypto";
    throw e;
  }
  return encodePairId(rng.getRandomValues(new Uint8Array(PAIR_ID_BYTES)));
};

// Loaded on demand, like the other two callables in this file — the callables
// SDK is a chunk of its own (see vite.config.js) and a launch should not fetch
// it for a screen most people never see.
const pairingCallable = async (name) => {
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  return httpsCallable(getFunctions(_app), name);
};

// ── Both calls are timeboxed, and that is not belt-and-braces ──────
// A callable's own timeout is seventy seconds. Both of these are behind a
// button somebody presses standing outside, on a course, having just been sent
// to another browser and back — and seventy seconds of a button reading
// "Checking…" is indistinguishable from the app having died.
//
// ── Why the number is generous, not tight ─────────────────────────
// This governs a SLOW server and nothing else. A dead network does not wait
// for it: a callable with nowhere to go rejects in about a second with
// `internal`, which lib/authPairing turns into "couldn't reach the server".
// So the only thing a short timeout buys is failing a request that was going
// to succeed — and the request most likely to be slow is the very first one
// after `firebase deploy`, which is a cold container start, and is also the
// one this whole feature is judged on. Hence twenty-five rather than twelve.
const PAIRING_TIMEOUT_MS = 25000;

const withPairingTimeout = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => {
    const e = new Error("Couldn't reach the server. Check your connection and try again.");
    e.code = "app/pairing-timeout";
    reject(e);
  }, PAIRING_TIMEOUT_MS)),
]);

// Every failure this flow can produce becomes a sentence — see
// pairingErrorMessage in lib/authPairing, and the note there about the word
// "INTERNAL" that used to appear under the button.
const mapPairingError = (e) => {
  if (e?.code === "app/pairing-timeout") return e;  // already carries a sentence
  // The message goes in as well as the code: when the function RAN and threw,
  // what it said is the most useful thing anybody gets. See pairingErrorMessage.
  const err = new Error(pairingErrorMessage(e?.code, e?.message));
  err.code = e?.code || "";
  return err;
};

// Safari's half: file a custom token for THIS account under the pairing id.
// The uid is never sent — the Cloud Function takes it from the verified auth
// context, so this cannot ask for a token belonging to anybody else.
export const offerPairing = async (pairId) => {
  requireCurrentUser();
  if (!isPairId(pairId)) throw new Error("That is not a pairing code.");
  try {
    const offer = await pairingCallable("offerAuthPairing");
    await withPairingTimeout(offer({ pairId }));
    return true;
  } catch (e) {
    throw mapPairingError(e);
  }
};

// The home-screen app's half: present the id and sign in with what comes back.
// Returns false for "not yet" — the ordinary answer while somebody is still
// typing their Apple password in the other browser — and true once in.
export const claimPairing = async (pairId) => {
  if (!_auth) throw new Error("Sign-in is not enabled yet.");
  if (!isPairId(pairId)) return false;
  let result;
  try {
    const claim = await pairingCallable("claimAuthPairing");
    result = (await withPairingTimeout(claim({ pairId })))?.data;
  } catch (e) {
    throw mapPairingError(e);
  }
  if (!result?.ready || !result.token) return false;
  await signInWithCustomToken(_auth, result.token);
  return true;
};

// ─── Account linking (Google ⇆ Apple → one Firebase uid) ─────────────────
// MNQ lesson: Google and Apple sign-ins mint SEPARATE Firebase users for
// the same human, because Apple's "Hide My Email" relay means the two
// identities never share an email Firebase could auto-match on. In WBC a
// uid maps to a wbc_users doc carrying the player_id, so the second
// provider would land on the claim gate as a stranger. The durable fix is
// explicit linking: while signed in as the keeper account, attach the
// second provider so both credentials resolve to the SAME uid (and
// therefore the same wbc_users doc / player_id).
export const linkGoogleAccount = async () => {
  const user = requireCurrentUser();
  try {
    if (isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result?.credential?.idToken;
      if (!idToken) throw new Error("Google did not return an ID token.");
      return await linkWithCredential(user, GoogleAuthProvider.credential(idToken));
    }
    return await linkWithPopup(user, _googleProvider);
  } catch (e) {
    throw mapAuthError(e);
  }
};

export const linkAppleAccount = async () => {
  const user = requireCurrentUser();
  try {
    if (isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithApple();
      const idToken = result?.credential?.idToken;
      if (!idToken) throw new Error("Apple did not return an ID token.");
      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({ idToken, rawNonce: result.credential?.nonce });
      return await linkWithCredential(user, credential);
    }
    return await linkWithPopup(user, _appleProvider);
  } catch (e) {
    throw mapAuthError(e);
  }
};

// ─── Sign out ────────────────────────────────────────────────────────────
// Also clears the native plugin layer. With skipNativeAuth:true the plugin
// holds no Firebase session, but the native Google SDK caches the last-used
// account; clearing it ensures the next sign-in shows the account picker
// (so a shared device can switch users). No-op-safe on web and safe if the
// plugin isn't installed — failures are swallowed so they can never block
// the JS SDK signOut.
export const doSignOut = async () => {
  if (!_auth) return; // auth disabled → nothing to sign out of
  _appleAccessToken = null;
  _appleAuthorizationCode = null;
  if (isNativePlatform()) {
    try {
      await FirebaseAuthentication.signOut();
    } catch (e) {
      console.warn("native auth signOut skipped:", e?.message || e);
    }
  }
  return signOut(_auth);
};

// ─── Re-authentication (for deletion) ────────────────────────────────────
// Firebase requires RECENT authentication to delete a user; a stale session
// throws auth/requires-recent-login. We re-mint a fresh credential:
//   native → plugin re-runs the provider sheet → reauthenticateWithCredential
//   web    → reauthenticateWithPopup with the matching provider
// WBC has no Firebase email/password users (the app-level password login is
// not a Firebase credential), so unlike MNQ there is no password branch.
const reauthenticateCurrentUser = async () => {
  const user = requireCurrentUser();
  const providers = (user.providerData || []).map((p) => p.providerId);

  if (isNativePlatform()) {
    if (providers.includes("google.com")) {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result?.credential?.idToken;
      if (!idToken) throw new Error("Google did not return an ID token.");
      return reauthenticateWithCredential(user, GoogleAuthProvider.credential(idToken));
    }
    if (providers.includes("apple.com")) {
      const result = await FirebaseAuthentication.signInWithApple();
      const idToken = result?.credential?.idToken;
      if (!idToken) throw new Error("Apple did not return an ID token.");
      if (result.credential?.accessToken) _appleAccessToken = result.credential.accessToken;
      // Fresh authorization code for revocation (this reauth is what deleteAccount relies on).
      if (result.credential?.authorizationCode) _appleAuthorizationCode = result.credential.authorizationCode;
      const provider = new OAuthProvider("apple.com");
      return reauthenticateWithCredential(user, provider.credential({ idToken, rawNonce: result.credential?.nonce }));
    }
  } else {
    if (providers.includes("google.com")) return reauthenticateWithPopup(user, _googleProvider);
    if (providers.includes("apple.com")) {
      const result = await reauthenticateWithPopup(user, _appleProvider);
      captureAppleToken(result);
      return result;
    }
  }

  const e = new Error("For your security, please sign out and sign back in, then delete your account.");
  e.code = "app/reauth-required";
  throw e;
};

// ─── Account deletion (App Store 5.1.1(v) / Play account-deletion policy) ─
// WBC semantics — deleting an ACCOUNT is not deleting a PLAYER:
//   DELETED : the wbc_users uid→player_id mapping, this player's FCM tokens,
//             and the Firebase Auth user itself.
//   RETAINED: the player profile, scores, and all tournament history under
//             player_id — disclosed in the privacy policy as retained
//             records of a competitive event. The profile simply reverts to
//             unclaimed-prebuild state and can be re-claimed later.
//
// Order matters (MNQ lesson): delete the Firestore docs FIRST, while the
// user is still authenticated and security rules still permit the writes.
// After deleteUser succeeds the uid can no longer satisfy any rule.
//
//   playerId — the claimed player_id, used to sweep FCM token docs. Pass
//              null if unknown; the token sweep is skipped (tokens go stale
//              and are pruned by lastSeenAt housekeeping).
// Returns true on success; throws a readable Error otherwise.
export const deleteAccount = async (playerId) => {
  const user = requireCurrentUser();

  // 1. Remove the uid→player_id claim.
  try {
    await deleteDoc(doc(_db, USERS_COLLECTION, user.uid));
  } catch (e) {
    console.warn("deleteAccount: wbc_users doc delete failed:", e?.message || e);
  }

  // 1b. Release the tournament-password membership (wbc_accounts/{uid}) — the
  //     document every write in the project is gated on. It has to go through a
  //     callable because firestore.rules denies `delete` on it to every client;
  //     see src/lib/accounts.js and functions/index.js. Best-effort, and
  //     deliberately so: a membership left behind once the Auth user is gone
  //     grants nothing, because nothing can sign in as that uid again.
  try {
    const { releaseMembership } = await import("./lib/accounts");
    await releaseMembership();
  } catch (e) {
    console.warn("deleteAccount: membership release skipped:", e?.message || e);
  }

  // 2. Sweep this player's push tokens so no orphaned device keeps
  //    receiving notifications for an unclaimed profile.
  if (playerId) {
    try {
      const snap = await getDocs(query(collection(_db, TOKENS_COLLECTION), where("playerId", "==", playerId)));
      if (!snap.empty) {
        const batch = writeBatch(_db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (e) {
      console.warn("deleteAccount: token sweep failed:", e?.message || e);
    }
  }

  // 2c. App Store Guideline 5.1.1(v): revoke the Sign in with Apple token on
  //     deletion. Client-side revocation is unreliable here (the native iOS SDK
  //     hangs under skipNativeAuth; the JS SDK doesn't accept the native
  //     authorization code), so we hand the authorization code to the
  //     revokeAppleToken Cloud Function, which exchanges + revokes it with the
  //     Apple key server-side. Uses the code captured at SIGN-IN — single-use,
  //     ~5-min lifetime, but deletion happens in the same session so it's fresh.
  //     Best-effort and timeboxed: revocation must never block the deletion
  //     below (account removal is the hard requirement).
  const isAppleUser = (user.providerData || []).some((p) => p.providerId === "apple.com");
  if (isAppleUser) {
    const authorizationCode = _appleAuthorizationCode;
    if (authorizationCode) {
      try {
        // Loaded on demand. The callables SDK exists in this app for two
        // buttons on the account sheet, and a static import made every phone
        // in the field carry it to the first tee. Awaiting the module here
        // costs a deletion one fetch and costs a launch nothing.
        const { getFunctions, httpsCallable } = await import("firebase/functions");
        const revokeAppleToken = httpsCallable(getFunctions(_app), "revokeAppleToken");
        await Promise.race([
          revokeAppleToken({ authorizationCode }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("revoke timed out")), 8000)),
        ]);
      } catch (e) {
        console.warn("deleteAccount: Apple token revoke failed — proceeding:", e?.message || e);
      }
    }
    _appleAuthorizationCode = null;
    _appleAccessToken = null;
  }

  // 3. Delete the Firebase Auth user; reauth + retry once if required.
  try {
    await deleteUser(user);
  } catch (e) {
    if (e?.code === "auth/requires-recent-login") {
      await reauthenticateCurrentUser();
      await deleteUser(_auth.currentUser);
    } else {
      throw mapAuthError(e);
    }
  }

  // 4. Clear any native provider session so the next sign-in is clean.
  if (isNativePlatform()) {
    try {
      await FirebaseAuthentication.signOut();
    } catch {
      /* non-fatal */
    }
  }
  return true;
};

// Re-export the auth-state subscription so App.jsx has one import site for
// everything auth-related.
export { onAuthStateChanged };
