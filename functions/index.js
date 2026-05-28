// ─────────────────────────────────────────────────────────────────────────
//  functions/index.js — WBC 2026 push notification Cloud Functions
// ─────────────────────────────────────────────────────────────────────────
// Mirrors the MnQ Golf League pattern. Two real Firestore document triggers
// plus a manual test endpoint:
//   - onScorecardSigned → "Time to attest your scorecard"  (per group)
//   - onRoundFinalized  → "Round N is final"               (whole field)
//   - sendTestPush      → manual test from settings (callable)
//
// All triggers use onDocumentWritten so we can inspect before+after state
// for transition detection (fire only on the real event, not on every save).
//
// Credentials: admin.initializeApp() picks up the service account
// automatically in the Cloud Functions runtime — no env keys to manage.
//
// Deploy: `firebase deploy --only functions` from repo root.

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

const TOURNAMENT_ID = "wbc_2026";

// ─── Core send helper (data-only messages) ───────────────────────────────
// Data-only (no FCM `notification` block) so the service worker fully
// controls how the notification renders — matches the league contract and
// the firebase-messaging-sw.js on the client.
async function sendToPlayer(playerId, payload) {
  if (!playerId) {
    return { sent: 0, failed: 0, cleanedTokens: 0, errors: ["missing_playerId"] };
  }

  let snap;
  try {
    snap = await db.collection("wbc_notifications_tokens")
      .where("tournament_id", "==", TOURNAMENT_ID)
      .where("playerId", "==", playerId)
      .get();
  } catch (err) {
    logger.error("Firestore query failed", { playerId, err: err?.message });
    throw new HttpsError("internal", `Firestore query failed: ${err?.message || err}`);
  }

  if (snap.empty) {
    return { sent: 0, failed: 0, cleanedTokens: 0, errors: ["no_tokens_registered"] };
  }

  let sent = 0, failed = 0, cleaned = 0;
  const errors = [];

  const dataPayload = {
    ...stringifyDataValues(payload.data || {}),
    title: payload.notification?.title || "WBC 2026",
    body: payload.notification?.body || "",
  };

  for (const tokenDoc of snap.docs) {
    const data = tokenDoc.data();
    const token = data.token;
    if (!token) continue;
    try {
      await messaging.send({
        token,
        data: dataPayload,
        webpush: {
          headers: { TTL: "3600", Urgency: "high" },
        },
      });
      sent++;
      try { await tokenDoc.ref.update({ lastSeenAt: Date.now() }); }
      catch { /* swallow */ }
    } catch (err) {
      failed++;
      const code = err?.errorInfo?.code || err?.code || "unknown";
      const msg = err?.errorInfo?.message || err?.message || String(err);
      logger.error("messaging.send failed", { playerId, docId: tokenDoc.id, code, msg });
      errors.push(`${code}: ${msg}`);

      const isStale =
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument";
      if (isStale) {
        try {
          await tokenDoc.ref.delete();
          cleaned++;
        } catch { /* swallow */ }
      }
    }
  }

  return { sent, failed, cleanedTokens: cleaned, errors };
}

function stringifyDataValues(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

// ─── Helper: fetch all active players for the tournament ─────────────────
// Matches App.jsx's activePlayers filter: status !== "WD". Returns player_id
// values (the id used everywhere as the user/player id, e.g. "aaron_j").
async function fetchActivePlayers() {
  const snap = await db.collection("tournament_players")
    .where("tournament_id", "==", TOURNAMENT_ID)
    .get();
  return snap.docs
    .map(d => d.data())
    .filter(p => p.status !== "WD")
    .map(p => p.player_id)
    .filter(Boolean);
}

// ─── Helper: send to many players with logging ──────────────────────────
async function broadcast(recipients, payload, triggerLabel) {
  let totalSent = 0, totalFailed = 0;
  const playerErrors = {};
  for (const pid of recipients) {
    try {
      const r = await sendToPlayer(pid, payload);
      totalSent += r.sent;
      totalFailed += r.failed;
      if (r.errors.length && !r.errors.every(e => e === "no_tokens_registered")) {
        playerErrors[pid] = r.errors;
      }
    } catch (e) {
      playerErrors[pid] = [e?.message || String(e)];
    }
  }
  logger.info(`${triggerLabel} broadcast complete`, {
    recipients: recipients.length,
    totalSent,
    totalFailed,
    errorsForPlayers: Object.keys(playerErrors),
  });
  return { totalSent, totalFailed };
}

// ═════════════════════════════════════════════════════════════════════════
//  TRIGGER 1 — Scorecard Signed (Time to attest)
// ═════════════════════════════════════════════════════════════════════════
// Fires on the CREATE of a wbc_scorecard_sigs document. The scorer just
// signed; the other present players in the group need to attest.
// CREATE-only: attestations arrive as UPDATEs to the same doc and must not
// re-fire (would re-nag players who haven't acted yet).
//
// The doc carries everything we need so the function does zero extra reads:
//   { tournament_id, groupKey, round, signedBy, signedByName,
//     present: [playerId...], attestedBy: [] }
// `present` is the group minus WD players (computed client-side).
exports.onScorecardSigned = onDocumentWritten(
  "wbc_scorecard_sigs/{docId}",
  async (event) => {
    try {
      const before = event.data.before?.exists ? event.data.before.data() : null;
      const after = event.data.after?.exists ? event.data.after.data() : null;
      if (!after) return; // deleted (unsign)

      // CREATE only — not on attestation updates
      if (before) return;

      if (after.tournament_id && after.tournament_id !== TOURNAMENT_ID) return;

      const { round, signedBy, present = [], attestedBy = [] } = after;
      if (!signedBy || !Array.isArray(present)) {
        logger.warn("onScorecardSigned: missing required fields", { signedBy, present });
        return;
      }

      logger.info("onScorecardSigned firing", { round, signedBy, docId: event.params.docId });

      // Recipients = present players EXCEPT the signer and anyone already attested.
      const recipients = present.filter(pid =>
        pid !== signedBy && !attestedBy.includes(pid)
      );

      if (recipients.length === 0) {
        logger.info("onScorecardSigned: no recipients (solo group or pre-attested)", { round });
        return;
      }

      await broadcast(recipients, {
        notification: {
          title: "Time to attest your scorecard",
          body: `Your Round ${round} scorecard was signed — open Scoring to attest.`,
        },
        data: { type: "attest_ready", round: String(round), groupKey: String(after.groupKey || ""), url: "/#scoring" },
      }, "attest_ready");
    } catch (err) {
      logger.error("onScorecardSigned error", { err: err?.message, stack: err?.stack?.slice(0, 500) });
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  TRIGGER 2 — Round Finalized (Whole field, results are in)
// ═════════════════════════════════════════════════════════════════════════
// Fires on the finalized false→true transition of a wbc_rounds_state doc.
// Notifies every active player. Transition detection (not just "finalized
// is now true") prevents a re-fire if the doc is re-saved for any reason.
// Mirrors the league's onWeekLocked.
exports.onRoundFinalized = onDocumentWritten(
  "wbc_rounds_state/{docId}",
  async (event) => {
    try {
      const before = event.data.before?.exists ? event.data.before.data() : null;
      const after = event.data.after?.exists ? event.data.after.data() : null;
      if (!after) return; // deleted

      const wasFinal = before?.finalized === true;
      const nowFinal = after?.finalized === true;
      if (wasFinal || !nowFinal) return;

      if (after.tournament_id && after.tournament_id !== TOURNAMENT_ID) return;

      const round = after.round;
      logger.info("onRoundFinalized firing", { round, docId: event.params.docId });

      const recipients = await fetchActivePlayers();

      await broadcast(recipients, {
        notification: {
          title: `Round ${round} is final`,
          body: "Results are in — check the leaderboard.",
        },
        data: { type: "round_finalized", round: String(round), url: "/#leaderboard" },
      }, "round_finalized");
    } catch (err) {
      logger.error("onRoundFinalized error", { err: err?.message, stack: err?.stack?.slice(0, 500) });
    }
  }
);

// ═════════════════════════════════════════════════════════════════════════
//  sendTestPush — manual trigger (e.g. from a settings page)
// ═════════════════════════════════════════════════════════════════════════
exports.sendTestPush = onCall(async (request) => {
  try {
    const { playerId, message = "This is a test push from WBC 2026." } = request.data || {};
    if (!playerId) {
      throw new HttpsError("invalid-argument", "playerId required");
    }
    logger.info("Test push starting", { playerId });

    const result = await sendToPlayer(playerId, {
      notification: { title: "WBC 2026 — test", body: message },
      data: { type: "test", url: "/" },
    });

    logger.info("Test push complete", { playerId, ...result });

    if (result.sent === 0) {
      if (result.errors.includes("no_tokens_registered")) {
        throw new HttpsError("failed-precondition", "No devices registered for this player. Try Disable then Enable.");
      }
      throw new HttpsError("internal", `All sends failed: ${result.errors.slice(0, 3).join(" | ")}`);
    }
    return result;
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error("sendTestPush unexpected error", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack?.slice(0, 500),
    });
    throw new HttpsError("internal", `Unexpected: ${err?.message || String(err)}`);
  }
});

exports.__sendToPlayer = sendToPlayer;
