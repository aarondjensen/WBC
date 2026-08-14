// ══════════════════════════════════════════════════════════════════
//  apiBase — where /api lives, which is not the same in both shells.
// ══════════════════════════════════════════════════════════════════
//
// `fetch("/api/courses2?…")` is a same-origin call in a browser: in production
// Vercel serves the function next to the app, and under `npm run dev` the
// proxy in vite.config.js forwards it. Neither changes.
//
// A Capacitor build has no such origin. It runs from `capacitor://localhost`
// on iOS and `https://localhost` on Android, so a relative `/api/courses2`
// resolves against the APP BUNDLE, finds nothing, and comes back 404 — not as
// a network error, which is what makes it hard to recognise. The course search
// simply reports no results for every query.
//
// It is the director's screens that break, so a store reviewer never sees it.
// That is precisely why it needs a test rather than a bug report: the person
// who finds it is whoever is adding next year's courses, months from now,
// with no reason to suspect the shell.
//
// ── Why this reads the global rather than importing firebase.js ─────
// `isNativePlatform` already exists in src/firebase.js and does exactly this,
// but firebase.js initializes an app at import time — so anything importing it
// cannot be unit-tested, and `courseSearch.js` is. Reading the global that
// Capacitor injects is what firebase.js does too; this is the same two lines,
// kept somewhere a pure module can reach.

const isNative = () => {
  try {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch {
    return false;
  }
};

// Empty on the web, so every existing call site keeps making the same
// same-origin request it always made. Absolute on native, pointing at the
// deployed site where the function and its RapidAPI key already live.
//
// Overridable so a device build can be aimed at `vercel dev` on a laptop,
// which is the only way to exercise a change to `api/courses2.js` itself.
export const API_BASE = isNative()
  ? (import.meta.env?.VITE_API_BASE || "https://wannabecup.com")
  : "";

// Takes the path exactly as the call site already wrote it, leading slash and
// all, so a call changes from `fetch(\`/api/…\`)` to `fetch(apiUrl(\`/api/…\`))`
// and nothing else about it moves.
export const apiUrl = (path) => `${API_BASE}${path}`;
