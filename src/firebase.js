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
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { getFirestore, doc, deleteDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
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
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signOut,
  deleteUser,
  revokeAccessToken,
} from "firebase/auth";

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
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBcS6KphgfN15xwfCcmLXx3YMIMUeYuhfc",
  authDomain: AUTH_PROVIDERS_ENABLED ? "wannabecup.com" : "wannabecup-c5aab.firebaseapp.com",
  projectId: "wannabecup-c5aab",
  storageBucket: "wannabecup-c5aab.firebasestorage.app",
  messagingSenderId: "281900029443",
  appId: "1:281900029443:web:68da433d8ec5a16b74a036",
};

export const _app = initializeApp(FIREBASE_CONFIG);
export const _db = getFirestore(_app);

// Firestore collections owned by this module. wbc_users maps a Firebase
// Auth uid → player_id (the permanent career identity shared with 16 years
// of historical CSV data). Docs are keyed by uid.
export const USERS_COLLECTION = "wbc_users";
const TOKENS_COLLECTION = "wbc_notifications_tokens";

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
// we pass it explicitly on WEB.
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
        ? { popupRedirectResolver: browserPopupRedirectResolver }
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
// the Firebase JS SDK has no dedicated AppleAuthProvider class. Request
// name + email scopes so Apple can populate displayName when the user allows
// it. WBC never matches on email (players claim their profile by picking their
// name), so Apple's "Hide My Email" private relay has no effect on the flow.
export const _appleProvider = new OAuthProvider("apple.com");
_appleProvider.addScope("email");
_appleProvider.addScope("name");

// Apple OAuth token, captured at sign-in / reauth. Firebase does NOT persist
// the Apple token, but App Store Guideline 5.1.1(v) requires the app to REVOKE
// it when an Apple user deletes their account (deleting the Firebase user alone
// is not enough). We stash the most recent token here so deleteAccount() can
// revoke it. If it's null at deletion time (e.g. the app was reloaded since
// sign-in), deleteAccount reauthenticates to obtain a fresh one.
let _appleAccessToken = null;
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
  // Diagnostic: surface the raw error (code + message) to the console — on
  // native this shows in the Xcode log, which is otherwise the only place the
  // underlying cause of a generic error like auth/argument-error appears.
  console.error("[auth error]", code, "| msg:", e?.message || e, "| stack:", (e?.stack || "").slice(0, 300));
  const friendly = {
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

export const doGoogleSignIn = async () => {
  if (!_auth) throw new Error("Sign-in is not enabled yet.");
  try {
    if (isNativePlatform()) {
      console.log("[native-google] 1: entered native branch, loading plugin…");
      console.log("[native-google] 2: plugin loaded, calling signInWithGoogle()…");
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result?.credential?.idToken;
      console.log("[native-google] 3: returned. idToken present:", !!idToken, "len:", idToken ? String(idToken).length : 0);
      if (!idToken) throw new Error("Google sign-in did not return an ID token.");
      const credential = GoogleAuthProvider.credential(idToken);
      console.log("[native-google] credential:", credential ? "built" : "NULL",
        "| _getIdTokenResponse:", typeof credential?._getIdTokenResponse,
        "| providerId:", credential?.providerId,
        "| authDomain:", _auth?.config?.authDomain);
      return await signInWithCredential(_auth, credential);
    }
    if (isStandalonePWA()) {
      // Resolves on the return trip — the caller must also invoke
      // consumeRedirectResult() on app mount to complete the flow.
      return await signInWithRedirect(_auth, _googleProvider);
    }
    return await signInWithPopup(_auth, _googleProvider);
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
  try {
    const result = await getRedirectResult(_auth);
    if (result) captureAppleToken(result); // no-op for non-Apple results
    return result;
  } catch (e) {
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
      console.log("[native-apple] 1: entered native branch, loading plugin…");
      console.log("[native-apple] 2: plugin loaded, calling signInWithApple()…");
      const result = await FirebaseAuthentication.signInWithApple();
      const idToken = result?.credential?.idToken;
      console.log("[native-apple] 3: returned. idToken present:", !!idToken, "| nonce present:", !!result?.credential?.nonce);
      if (!idToken) throw new Error("Apple sign-in did not return an ID token.");
      // Native plugin hands back the Apple access token directly.
      if (result.credential?.accessToken) _appleAccessToken = result.credential.accessToken;
      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({ idToken, rawNonce: result.credential?.nonce });
      console.log("[native-apple] credential:", credential ? "built" : "NULL",
        "| _getIdTokenResponse:", typeof credential?._getIdTokenResponse,
        "| authDomain:", _auth?.config?.authDomain);
      return await signInWithCredential(_auth, credential);
    }
    if (isStandalonePWA()) {
      return await signInWithRedirect(_auth, _appleProvider);
    }
    const result = await signInWithPopup(_auth, _appleProvider);
    captureAppleToken(result);
    return result;
  } catch (e) {
    throw mapAuthError(e);
  }
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

  // 2c. App Store Guideline 5.1.1(v): for a Sign in with Apple user, the Apple
  //     token must be REVOKED on deletion — deleting the Firebase user alone is
  //     not enough and gets the app rejected. Firebase doesn't store the Apple
  //     token, so we use the one captured at sign-in/reauth. If it's gone (the
  //     app was reloaded since sign-in), reauthenticate to get a fresh one,
  //     which also satisfies the recent-login requirement for deleteUser below.
  const isAppleUser = (user.providerData || []).some((p) => p.providerId === "apple.com");
  if (isAppleUser) {
    if (!_appleAccessToken) {
      try { await reauthenticateCurrentUser(); } catch (e) { throw mapAuthError(e); }
    }
    if (_appleAccessToken) {
      try {
        await revokeAccessToken(_auth, _appleAccessToken);
      } catch (e) {
        console.warn("deleteAccount: Apple token revoke failed:", e?.message || e);
      }
      _appleAccessToken = null;
    }
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
