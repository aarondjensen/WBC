// ─────────────────────────────────────────────────────────────────────────
//  firebase-messaging-sw.js — WBC 2026 push notification service worker
// ─────────────────────────────────────────────────────────────────────────
// Lives in /public/firebase-messaging-sw.js so Vite serves it at the root
// (/firebase-messaging-sw.js), which FCM requires for the default SW scope.
//
// Message-format contract with the Cloud Function side:
//   - DATA-ONLY messages (no FCM `notification` block)
//   - Title/body live in payload.data.title / payload.data.body
//   - data.type is the trigger kind: attest_ready, round_finalized, test
//
// Badge model: "pending actions" semantics, not "unread notifications".
// Only attest_ready pushes increment the badge (those represent something
// the user needs to do). round_finalized is informational. The badge clears
// app-side when pendingAttestCount goes to 0 (App.jsx setAppBadge effect),
// NOT when the user taps the notification.

importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBcS6KphgfN15xwfCcmLXx3YMIMUeYuhfc",
  authDomain: "wannabecup-c5aab.firebaseapp.com",
  projectId: "wannabecup-c5aab",
  storageBucket: "wannabecup-c5aab.firebasestorage.app",
  messagingSenderId: "281900029443",
  appId: "1:281900029443:web:68da433d8ec5a16b74a036",
});

const messaging = firebase.messaging();

// ─── Immediate activation lifecycle ─────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ─── Badge state — IDB-backed for SW restart survival ──
const BADGE_DB_NAME = "wbc-notif-state";
const BADGE_STORE = "kv";
const BADGE_KEY = "badge-count";

const openBadgeDB = () => new Promise((resolve, reject) => {
  if (!self.indexedDB) return reject(new Error("no idb"));
  const req = self.indexedDB.open(BADGE_DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(BADGE_STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const getBadgeCount = async () => {
  try {
    const db = await openBadgeDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(BADGE_STORE, "readonly");
      const req = tx.objectStore(BADGE_STORE).get(BADGE_KEY);
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch { return 0; }
};

const setBadgeCount = async (count) => {
  try {
    const db = await openBadgeDB();
    await new Promise((resolve) => {
      const tx = db.transaction(BADGE_STORE, "readwrite");
      tx.objectStore(BADGE_STORE).put(count, BADGE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* swallow */ }
};

const applyBadge = async (count) => {
  if (count > 0) {
    if (self.navigator.setAppBadge) {
      try { await self.navigator.setAppBadge(count); } catch { /* swallow */ }
    }
  } else {
    if (self.navigator.clearAppBadge) {
      try { await self.navigator.clearAppBadge(); } catch { /* swallow */ }
    }
  }
};

// ─── Background message handler ──────────────────────────────────────────
messaging.onBackgroundMessage(async (payload) => {
  console.log("[SW] onBackgroundMessage fired", payload);
  try {
    const data = payload.data || {};
    const title = data.title || payload.notification?.title || "WBC 2026";
    const body = data.body || payload.notification?.body || "";

    // Only attest_ready represents a pending action; the rest are
    // informational. The app's setAppBadge effect reconciles the count to
    // the true pending-attestation count on next open, so an overcount here
    // self-corrects.
    if (data.type === "attest_ready") {
      try {
        const current = await getBadgeCount();
        const next = current + 1;
        await setBadgeCount(next);
        await applyBadge(next);
      } catch (e) {
        console.warn("[SW] Badge update failed", e);
      }
    }

    return self.registration.showNotification(title, {
      body,
      icon: "/wbc-icon-192.png",
      badge: "/wbc-icon-192.png",
      data,
      tag: data.type || "default",
      renotify: true,
    });
  } catch (err) {
    console.error("[SW] onBackgroundMessage failed", err);
    try {
      return self.registration.showNotification("WBC 2026", {
        body: "A new update — open the app for details.",
        icon: "/wbc-icon-192.png",
        badge: "/wbc-icon-192.png",
      });
    } catch { /* truly hopeless */ }
  }
});

// ─── Click handler ──────────────────────────────────────────────────────
// Navigates via hash routing (App.jsx reads window.location.hash on load to
// pick the initial view). Does NOT clear the badge — that's app-driven when
// the underlying action (attest) is completed.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const urlMap = {
    attest_ready: "/#scoring",
    round_finalized: "/#leaderboard",
  };
  const target = data.url || urlMap[data.type] || "/";

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: "window", includeUncontrolled: true,
    });
    for (const client of clientList) {
      if ("focus" in client) {
        try { await client.navigate(target); } catch { /* same-origin only; ignore */ }
        return client.focus();
      }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(target);
    }
  })());
});

// ─── Page → SW messages ─────────────────────────────────────────────────
self.addEventListener("message", async (event) => {
  if (event.data?.type === "CLEAR_BADGE") {
    await setBadgeCount(0);
    await applyBadge(0);
  }
  if (event.data?.type === "SET_BADGE") {
    const count = Math.max(0, parseInt(event.data.count, 10) || 0);
    await setBadgeCount(count);
    await applyBadge(count);
  }
});
