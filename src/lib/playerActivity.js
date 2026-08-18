// ══════════════════════════════════════════════════════════════════
//  playerActivity — who has actually opened the app, and when.
// ══════════════════════════════════════════════════════════════════
//
// A director's answer to the two questions that come up the week before a
// tournament, and that nothing in the app could answer before this:
//
//   "has he even opened it yet?"     → last sign-in, as a time ago
//   "will he get the tee time?"      → whether push is on for him
//
// Both are joins, and neither collection is about players:
//
//   wbc_users                   uid → player_id, written at the claim screen
//                               and re-stamped with `lastLoginAt` on every
//                               launch (see App.jsx). One row per ACCOUNT.
//   wbc_notifications_tokens    one row per (player, device). Its presence is
//                               the only honest answer to "is push on" —
//                               browser permission stays "granted" forever
//                               once given, including for somebody who has
//                               since switched notifications off. See
//                               lib/notifications for why that distinction
//                               is the whole feature.
//
// So neither one can be read off a player, and the roster itself is a third
// source that arrives on its own clock. Hence a hook, with the join in it and
// every source in the dependency list — the roster.js lesson, applied before
// it had to be learned twice.
//
// READS ONLY. Nothing here writes; the login stamp is written by whoever is
// logging in, against their own uid, which is the only write firestore.rules
// allows on wbc_users.
import { useEffect, useMemo, useState } from "react";
import { db } from "./db";

// Spelled out rather than imported from firebase.js/notifications.js: this
// module is read by AdminView's test with ../firebase mocked, and a collection
// name that resolves to undefined is a read that quietly returns nothing.
export const USERS_COL = "wbc_users";
export const TOKENS_COL = "wbc_notifications_tokens";

// ── toMillis ────────────────────────────────────────────────────────
// The timestamps in these collections were written by three different
// generations of this app: `lastLoginAt`/`claimedAt` are Date.now() numbers,
// `joined_at` on a membership is an ISO string, and anything written from the
// Cloud Functions is a Firestore Timestamp. All three mean the same thing and
// only one of them sorts.
export const toMillis = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === "object") return typeof v.seconds === "number" ? v.seconds * 1000 : null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

// ── timeAgo ─────────────────────────────────────────────────────────
// "24m ago" — the shape a director reads at a glance, rather than a date they
// have to subtract from today. Rounds DOWN at every step, so "1h ago" never
// means fifty minutes; the coarser the unit the less that matters, and a sign
// that says 59m is more use than one that says "about an hour".
//
// A timestamp in the future is a clock that disagrees, not a prediction: two
// phones a minute apart is ordinary, and "in 1m ago" is not a thing to print.
export const timeAgo = (ts, now = Date.now()) => {
  const ms = toMillis(ts);
  if (ms == null) return null;
  const secs = Math.floor((now - ms) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 365)}y ago`;
};

// ── accountsByPlayer ────────────────────────────────────────────────
// player_id → the most recent account activity for that player. A player can
// have more than one row here — somebody who deleted their account and signed
// in again with Apple instead of Google keeps the same player_id — and the
// answer wanted is the LATEST, not the first one the scan happened to meet.
//
// `lastLoginAt` is the field App.jsx stamps on launch; `claimedAt` is the
// fallback for every row written before that stamp existed, which is every
// row currently in the database. Without it the whole column would read
// "Never" for people who are demonstrably signed in.
export const accountsByPlayer = (users = []) => {
  const out = new Map();
  (users || []).forEach(u => {
    const pid = u?.player_id;
    if (!pid) return;
    const seen = toMillis(u.lastLoginAt) ?? toMillis(u.claimedAt);
    const prev = out.get(pid);
    if (!prev) { out.set(pid, { lastSeen: seen, email: u.email || null }); return; }
    if (seen != null && (prev.lastSeen == null || seen > prev.lastSeen)) {
      out.set(pid, { lastSeen: seen, email: u.email || prev.email });
    } else if (!prev.email && u.email) {
      out.set(pid, { ...prev, email: u.email });
    }
  });
  return out;
};

// ── devicesByPlayer ─────────────────────────────────────────────────
// player_id → how many devices are registered for push.
//
// Both field names are counted because WBC's original inline register wrote
// `playerId` while the shared shape uses `player_id` — the same reason
// lib/notifications queries both. This reads the whole collection once rather
// than querying twice, so a row carrying both fields is still ONE device.
export const devicesByPlayer = (tokens = []) => {
  const out = new Map();
  (tokens || []).forEach(t => {
    const pid = t?.playerId || t?.player_id;
    if (!pid) return;
    out.set(pid, (out.get(pid) || 0) + 1);
  });
  return out;
};

// ── buildActivity ───────────────────────────────────────────────────
// One row per player on the roster, in the order a director wants to read
// them: whoever was here most recently at the top, and everybody who has
// never signed in at the bottom, alphabetically, because that bottom group is
// a to-do list rather than a ranking.
//
// `notifications` is null — not "off" — for somebody with no account. Push is
// registered against a player id by a signed-in device, so "off" would be
// stating a preference nobody has had the chance to express.
export const buildActivity = ({ players = [], users = [], tokens = [], now = Date.now() } = {}) => {
  const accounts = accountsByPlayer(users);
  const devices = devicesByPlayer(tokens);
  const rows = (players || []).filter(Boolean).map(p => {
    const acct = accounts.get(p.id) || null;
    const count = devices.get(p.id) || 0;
    return {
      id: p.id,
      name: p.name,
      email: acct?.email || null,
      signedIn: !!acct,
      lastSeen: acct?.lastSeen ?? null,
      lastSeenLabel: timeAgo(acct?.lastSeen, now) || (acct ? "Unknown" : "Never signed in"),
      devices: count,
      notifications: acct ? (count > 0 ? "on" : "off") : null,
    };
  });
  return rows.sort((a, b) => {
    if (a.signedIn !== b.signedIn) return a.signedIn ? -1 : 1;
    if ((a.lastSeen ?? 0) !== (b.lastSeen ?? 0)) return (b.lastSeen ?? 0) - (a.lastSeen ?? 0);
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
};

// The one-line version, for the summary above the list.
export const activitySummary = (rows = []) => ({
  total: rows.length,
  signedIn: rows.filter(r => r.signedIn).length,
  notifying: rows.filter(r => r.notifications === "on").length,
});

// ── usePlayerActivity ───────────────────────────────────────────────
// Three sources, three clocks. The two reads are fired independently rather
// than through a Promise.all so a slow token read cannot hold back the
// sign-in times — and the roster arrives from somewhere else again, over the
// registry join, routinely AFTER both of them.
//
// Which is why every one of the three is in the memo's dependency list. This
// is the shape that took the field off the leaderboard for a session once
// already (see lib/roster): a join whose memo names only the source that
// happened to be slow that day computes an empty answer, caches it, and
// nothing invalidates it.
//
// `loading` is true only until both reads have answered. A failed read comes
// back as null from db.get and is treated as an empty collection — the panel
// then says nobody has signed in, which is wrong but recoverable, and is what
// the rest of the app does with a read it could not make.
export function usePlayerActivity(players, { enabled = true } = {}) {
  const [users, setUsers] = useState(null);
  const [tokens, setTokens] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    db.get(USERS_COL).then(rows => { if (alive) setUsers(rows || []); });
    db.get(TOKENS_COL).then(rows => { if (alive) setTokens(rows || []); });
    return () => { alive = false; };
  }, [enabled]);

  const rows = useMemo(
    () => buildActivity({ players, users: users || [], tokens: tokens || [] }),
    [players, users, tokens],
  );

  return { rows, summary: activitySummary(rows), loading: users === null || tokens === null };
}
