// ══════════════════════════════════════════════════════════════════
//  notifications — the client half of push.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup's lib/notifications.js, which is itself the MNQ
// league app's. WBC already had the register half of this inline in App.jsx —
// ask permission, get a token, write a row — and nothing else. What was
// missing is everything around it:
//
//   • no way to turn push OFF (the token row was written and never deleted)
//   • no way to tell PERMISSION from SUBSCRIPTION, which is the distinction
//     the settings screen lives or dies on — see below
//   • no test send, even though the sendTestPush Cloud Function has existed
//     in functions/index.js the whole time with nothing calling it
//
// The lifecycle, in order:
//   1. register the service worker (public/firebase-messaging-sw.js)
//   2. ask permission — from a user gesture, or iOS Safari ignores it
//   3. get an FCM token for this browser
//   4. store it in wbc_notifications_tokens so the Cloud Functions can aim
//   5. unsubscribe — revoke at FCM, delete the rows
//
// Foreground message rendering stays in App.jsx, where it already worked.
//
// ONE ROW PER (PLAYER, DEVICE). A player with a phone and a laptop has two,
// added and revoked independently, and the functions fan out to all of them.
//
// WHAT A TOKEN IS. A send-to address for one browser, not a credential —
// holding it lets you push a notification to that device and nothing else.
//
// EDITIONS. Tokens are deliberately NOT edition-scoped: a push subscription
// belongs to a person's phone, not to a tournament year, and switching
// editions must not silently unsubscribe the field. `wbc_notifications_tokens`
// is correspondingly absent from EDITION_DATA_COLS in lib/editions.js.
//
// MODULE LOAD POLICY. firebase/messaging is imported DYNAMICALLY inside the
// functions that need it, never at the top of this file. A synchronous import
// can fail outright on iOS Safari below 16.4 and in any non-secure context,
// and that failure would take the whole importing chunk with it.

import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from "firebase/firestore";
import { _app, _db, TOURNAMENT_ID } from "../firebase";

// Web Push VAPID PUBLIC key. Not a secret — it ships in the client bundle
// either way; the private half stays with FCM. Firebase Console → Project
// Settings → Cloud Messaging → Web Push certificates.
const VAPID_PUBLIC_KEY = "BF3PLSs3kpCVHbhnbuBo1gSYeLKhYYwEgICUo07xRpuQP8LyxqkLkSV969ZcIptb1ZSY81h8738lblo9N2goNGo";

const TOKENS_COL = "wbc_notifications_tokens";

// Firestore direct, not App.jsx's `db` helper: that helper is defined inside
// App.jsx, and importing it here would make App.jsx ↔ notifications circular.
const _get = async (col, filters = []) => {
  const ref = collection(_db, col);
  const q = filters.length ? query(ref, ...filters.map(f => where(f.field, f.op, f.value))) : ref;
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
};

// ── Permission state ────────────────────────────────────────────────
//   "unsupported" — no Notification API or no service worker
//   "default"     — never asked
//   "granted"     — yes
//   "denied"      — no, and the browser will NOT re-prompt; the user has to
//                   undo it in their own settings
export const getNotificationPermissionState = () => {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
};

// Is this running as an installed app rather than a browser tab? On iOS this
// is the difference between push working and push not existing.
export const isStandalonePWA = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches
    || window.navigator?.standalone === true;
};

// iOS gained the Push API in 16.4, and only for home-screen installs. Older
// iOS cannot do this at all, and no amount of tapping the toggle will help —
// so the settings screen says that instead of offering one.
export const isIOSPushCapable = () => {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  if (!/iPhone|iPad|iPod/.test(ua)) return true;
  const m = ua.match(/OS (\d+)_(\d+)/);
  if (!m) return true; // unknown iOS build — assume capable rather than block
  const major = parseInt(m[1], 10), minor = parseInt(m[2], 10);
  return major > 16 || (major === 16 && minor >= 4);
};

const getMessagingInstance = async () => {
  try {
    const { getMessaging, isSupported } = await import("firebase/messaging");
    if (!(await isSupported().catch(() => false))) return null;
    return getMessaging(_app);
  } catch (e) {
    console.warn("[push] messaging unavailable:", e?.message || e);
    return null;
  }
};

// ── Service worker ──────────────────────────────────────────────────
// Idempotent, and the registration is cached because getToken needs the same
// one. Returns `{ error }` rather than throwing so the settings screen can say
// WHY — the usual failure is a 404 (the file didn't deploy), and "couldn't
// enable notifications" is a much worse message than that.
let _swRegistration = null;
const registerServiceWorker = async () => {
  if (_swRegistration) return _swRegistration;
  if (!("serviceWorker" in navigator)) return { error: "This browser has no service worker support" };
  try {
    _swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    return _swRegistration;
  } catch (e) {
    const detail = e?.message || String(e);
    console.error("Service worker registration failed:", detail, e);
    return { error: detail };
  }
};

// ── Subscription cache ──────────────────────────────────────────────
// A Firestore round-trip takes a few hundred ms on a cold start, and anything
// that renders "you're not subscribed" in the meantime flashes at a user who
// is. The last known answer is mirrored per-device so the UI starts from the
// truth and only corrects itself if the server disagrees.
//
// Tri-state on purpose. `false` means this person said no ON THIS DEVICE, and
// App.jsx's silent re-register effect reads that to avoid resubscribing
// somebody who turned notifications off — browser permission stays "granted"
// forever once given, so it cannot answer that question. `null` means we have
// never asked here.
const SUB_CACHE_PREFIX = "wbc_notif_sub_";

const setCachedSubscriptionStatus = (playerId, subscribed) => {
  if (!playerId || typeof localStorage === "undefined") return;
  try { localStorage.setItem(SUB_CACHE_PREFIX + playerId, subscribed ? "1" : "0"); } catch { /* private mode */ }
};

// ── Register ────────────────────────────────────────────────────────
// Returns { success, state, error? }. Call it from a TAP: iOS Safari
// suppresses a requestPermission() that no gesture asked for.
export const registerForPush = async (playerId) => {
  if (!playerId) return { success: false, state: "error", error: "missing playerId" };
  if (getNotificationPermissionState() === "unsupported") return { success: false, state: "unsupported" };

  let permission;
  try {
    permission = await Notification.requestPermission();
  } catch (e) {
    return { success: false, state: "error", error: e.message };
  }
  // Already-granted returns "granted" immediately; a prior denial returns
  // "denied" without prompting, which the settings screen explains rather
  // than retrying.
  if (permission !== "granted") return { success: false, state: permission };

  const reg = await registerServiceWorker();
  if (!reg || reg.error) {
    return { success: false, state: "error", error: reg?.error ? `Service worker: ${reg.error}` : "sw_registration_failed" };
  }

  const messaging = await getMessagingInstance();
  if (!messaging) return { success: false, state: "unsupported" };

  let token;
  try {
    const { getToken } = await import("firebase/messaging");
    token = await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: reg });
  } catch (e) {
    console.error("FCM getToken failed:", e);
    return { success: false, state: "error", error: e.message };
  }
  if (!token) return { success: false, state: "no_token" };

  // The document id stays the RAW TOKEN, which is what WBC has always used.
  // Bourbon Cup hashes it into `p{playerId}_{hash}` for readability, but
  // adopting that here would leave every already-registered device with an
  // orphaned row under its old id — a stale token the Cloud Functions keep
  // trying to send to, and a duplicate notification for anyone whose device
  // re-registers. getToken returns the same token for the same
  // (device, service worker), so keying on it is already idempotent.
  const ua = navigator.userAgent || "";
  await setDoc(doc(_db, TOKENS_COL, String(token)), {
    id: token,
    // Stamped for the record, not for filtering: a token is not edition-scoped
    // and the functions never query on this.
    tournament_id: TOURNAMENT_ID,
    playerId,
    player_id: playerId,
    token,
    // A point-in-time device snapshot, kept because the one support question
    // this feature generates is "why didn't I get it", and the answer is
    // usually "iOS, not installed to the home screen".
    user_agent: ua.slice(0, 200),
    is_ios: /iPhone|iPad|iPod/.test(ua),
    is_standalone: isStandalonePWA(),
    lastSeenAt: Date.now(),
  }, { merge: true });
  setCachedSubscriptionStatus(playerId, true);

  return { success: true, state: "granted", token };
};

// ── Subscription status ─────────────────────────────────────────────
// Distinct from permission, which stays "granted" forever once given and
// cannot tell you whether the user later switched notifications off in the
// app. The presence of a token row is the real answer, and it is the reason
// the settings card reads SUBSCRIBED rather than PERMISSION.
//
// Returns null when the READ FAILED, so a caller can leave its state alone
// rather than treating a dropped connection as "not subscribed".
export const checkSubscriptionStatus = async (playerId) => {
  if (!playerId) return false;
  try {
    // Both field names are queried because WBC's original inline register
    // wrote `playerId` while the shared shape uses `player_id`; a device that
    // registered before this module existed still has to count as subscribed.
    const [a, b] = await Promise.all([
      _get(TOKENS_COL, [{ field: "playerId", op: "==", value: playerId }]),
      _get(TOKENS_COL, [{ field: "player_id", op: "==", value: playerId }]),
    ]);
    const subscribed = (a.length + b.length) > 0;
    setCachedSubscriptionStatus(playerId, subscribed);
    return subscribed;
  } catch (e) {
    console.warn("checkSubscriptionStatus failed:", e);
    return null;
  }
};

// true / false / null — null meaning "no cached answer on this device".
export const getCachedSubscriptionStatus = (playerId) => {
  if (!playerId || typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(SUB_CACHE_PREFIX + playerId);
    return v === "1" ? true : v === "0" ? false : null;
  } catch { return null; }
};

// ── Unsubscribe ─────────────────────────────────────────────────────
// Both halves, both best-effort: revoke at FCM so the endpoint stops
// accepting, and delete the rows so the functions stop trying. EVERY device
// for this player goes, not just this one — the toggle reads as a personal
// preference rather than a per-device one, which is also what the settings
// screen tells the user in as many words.
export const unsubscribeFromPush = async (playerId) => {
  const messaging = await getMessagingInstance();
  if (messaging) {
    try {
      const { deleteToken } = await import("firebase/messaging");
      await deleteToken(messaging);
    } catch (e) { console.warn("deleteToken failed:", e); }
  }
  if (playerId) {
    const [a, b] = await Promise.all([
      _get(TOKENS_COL, [{ field: "playerId", op: "==", value: playerId }]),
      _get(TOKENS_COL, [{ field: "player_id", op: "==", value: playerId }]),
    ]);
    const ids = [...new Set([...a, ...b].map(d => d.id).filter(Boolean))];
    await Promise.all(ids.map(id => deleteDoc(doc(_db, TOKENS_COL, String(id))).catch(() => {})));
    setCachedSubscriptionStatus(playerId, false);
  }
  return { success: true };
};

// ── Test send ───────────────────────────────────────────────────────
// Calls the sendTestPush Cloud Function, which has existed in
// functions/index.js since push was built and had no caller until now.
//
// It earns its place: every iOS PWA push failure looks the same from the
// settings screen — a toggle reading On — so without this the first time
// anyone finds out is the round it mattered.
export const sendTestPush = async (playerId) => {
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const res = await httpsCallable(getFunctions(_app), "sendTestPush")({ playerId });
  return res?.data?.sent ?? 0;
};
