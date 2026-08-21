// ─────────────────────────────────────────────────────────────────────────
//  functions/index.js — WBC push notification Cloud Functions
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
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const jwt = require("jsonwebtoken");

// Apple Sign in with Apple credentials for server-side token revocation.
// The .p8 private key is stored as a Firebase secret (never in source):
//   firebase functions:secrets:set APPLE_PRIVATE_KEY   (paste the .p8 contents)
const APPLE_PRIVATE_KEY = defineSecret("APPLE_PRIVATE_KEY");
const APPLE_TEAM_ID = "7RRL56R755";
const APPLE_KEY_ID = "RHPWSCB2HT";
// The NATIVE iOS app's Sign in with Apple authorization codes are issued for the
// app's bundle ID (the App ID), not the web Services ID. The revocation key's
// primary App ID is this same identifier, so it signs a valid client secret.
const APPLE_CLIENT_ID = "com.wannabecup.app";

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

// ─── Which tournament ───────────────────────────────────────────────────
// This used to be `const TOURNAMENT_ID = "wbc_2026"`, and it was wrong the
// moment the app grew editions. The client writes every row under the ACTIVE
// edition (see src/firebase.js) — wbc_2027, wbc_2028 — so a hardcoded id here
// meant the first round of the next WBC would fire no attest nudges, send no
// "round is final", and read the wrong year's roster to decide who to send it
// to. Silently: a trigger that returns early logs nothing anybody would look at.
//
// The triggering document already says which edition it belongs to. That is
// the authority now; the constant below is only the fallback for a document
// written before the field existed.
const DEFAULT_TOURNAMENT_ID = "wbc_2026";
const editionOf = (doc) => doc?.tournament_id || DEFAULT_TOURNAMENT_ID;

// The event's name, for the one line of a notification that is not about a
// specific round. Deliberately not "WBC 2026" any more — see above.
const APP_NAME = "Wanna Be Cup";

// ─── Core send helper (data-only messages) ───────────────────────────────
// Data-only (no FCM `notification` block) so the service worker fully
// controls how the notification renders — matches the league contract and
// the firebase-messaging-sw.js on the client.
//
// ── Why tokens are NOT filtered by edition ──
// A token is a device address for a PERSON, not a fact about a tournament.
// It is registered once, whenever that phone last turned notifications on,
// and stamped with whichever edition happened to be active at that moment.
// Filtering on that stamp meant a player who enabled push during 2026 stopped
// receiving anything the day the app moved to 2027 — with the app still
// showing notifications as ON, because the client checks by player.
//
// Two queries rather than one because the field name is not consistent in the
// wild: an older bundle wrote `playerId` and the shared shape uses
// `player_id`, and both are still out there. Deduped by document id.
async function tokenDocsFor(playerId) {
  const [byCamel, bySnake] = await Promise.all([
    db.collection("wbc_notifications_tokens").where("playerId", "==", playerId).get(),
    db.collection("wbc_notifications_tokens").where("player_id", "==", playerId).get(),
  ]);
  const seen = new Map();
  [...byCamel.docs, ...bySnake.docs].forEach(d => seen.set(d.id, d));
  return [...seen.values()];
}

async function sendToPlayer(playerId, payload) {
  if (!playerId) {
    return { sent: 0, failed: 0, cleanedTokens: 0, errors: ["missing_playerId"] };
  }

  let docs;
  try {
    docs = await tokenDocsFor(playerId);
  } catch (err) {
    logger.error("Firestore query failed", { playerId, err: err?.message });
    throw new HttpsError("internal", `Firestore query failed: ${err?.message || err}`);
  }

  if (!docs.length) {
    return { sent: 0, failed: 0, cleanedTokens: 0, errors: ["no_tokens_registered"] };
  }

  let sent = 0, failed = 0, cleaned = 0;
  const errors = [];

  const dataPayload = {
    ...stringifyDataValues(payload.data || {}),
    title: payload.notification?.title || APP_NAME,
    body: payload.notification?.body || "",
  };

  for (const tokenDoc of docs) {
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
//
// This one IS edition-scoped, and correctly so: a roster is a fact about a
// tournament, unlike the device tokens above.
async function fetchActivePlayers(tournamentId) {
  const snap = await db.collection("tournament_players")
    .where("tournament_id", "==", tournamentId)
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

      const round = after.round;
      const tournamentId = editionOf(after);
      logger.info("onRoundFinalized firing", { round, tournamentId, docId: event.params.docId });

      const recipients = await fetchActivePlayers(tournamentId);

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
    const { playerId, message = `This is a test push from the ${APP_NAME} app.` } = request.data || {};
    if (!playerId) {
      throw new HttpsError("invalid-argument", "playerId required");
    }
    logger.info("Test push starting", { playerId });

    const result = await sendToPlayer(playerId, {
      notification: { title: `${APP_NAME} — test`, body: message },
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

// ═════════════════════════════════════════════════════════════════════════
//  revokeAppleToken — App Store Guideline 5.1.1(v) token revocation
// ═════════════════════════════════════════════════════════════════════════
// When a Sign in with Apple user deletes their account, Apple requires the app
// to revoke their token. The native client can't do this reliably (the iOS SDK
// hangs under skipNativeAuth), so it hands the Apple AUTHORIZATION CODE to this
// function, which:
//   1. signs a client-secret JWT (ES256) with the .p8 key,
//   2. exchanges the authorization code for a refresh token at Apple,
//   3. revokes that refresh token (invalidates the whole grant).
// Called from the client during account deletion, before the Firebase user is
// deleted (so request.auth is still present).
exports.revokeAppleToken = onCall({ secrets: [APPLE_PRIVATE_KEY] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in to revoke.");
  }
  const authorizationCode = request.data?.authorizationCode;
  if (!authorizationCode) {
    throw new HttpsError("invalid-argument", "authorizationCode required");
  }

  // 1. Client secret JWT — signed with the Apple .p8 key.
  let clientSecret;
  try {
    clientSecret = jwt.sign({}, APPLE_PRIVATE_KEY.value(), {
      algorithm: "ES256",
      keyid: APPLE_KEY_ID,
      issuer: APPLE_TEAM_ID,
      audience: "https://appleid.apple.com",
      subject: APPLE_CLIENT_ID,
      expiresIn: "5m",
    });
  } catch (err) {
    logger.error("Apple client secret sign failed", { message: err?.message });
    throw new HttpsError("internal", "Could not build Apple client secret.");
  }

  // 2. Exchange the authorization code for tokens.
  const tokenResp = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: APPLE_CLIENT_ID,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    }).toString(),
  });
  const tokenJson = await tokenResp.json().catch(() => ({}));
  if (!tokenResp.ok || (!tokenJson.refresh_token && !tokenJson.access_token)) {
    logger.error("Apple token exchange failed", { status: tokenResp.status, error: tokenJson.error });
    throw new HttpsError("internal", `Apple token exchange failed: ${tokenJson.error || tokenResp.status}`);
  }

  // 3. Revoke — prefer the refresh token (invalidates all tokens for the grant).
  const token = tokenJson.refresh_token || tokenJson.access_token;
  const tokenTypeHint = tokenJson.refresh_token ? "refresh_token" : "access_token";
  const revokeResp = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: APPLE_CLIENT_ID,
      client_secret: clientSecret,
      token,
      token_type_hint: tokenTypeHint,
    }).toString(),
  });
  if (!revokeResp.ok) {
    const body = await revokeResp.text().catch(() => "");
    logger.error("Apple revoke failed", { status: revokeResp.status, body: body.slice(0, 300) });
    throw new HttpsError("internal", `Apple revoke failed: ${revokeResp.status}`);
  }

  logger.info("Apple token revoked", { uid: request.auth.uid });
  return { revoked: true };
});

// ─────────────────────────────────────────────────────────────────────────
//  deleteMembership — releasing the tournament-password membership
// ─────────────────────────────────────────────────────────────────────────
// The membership document (wbc_accounts/{uid}) is what every write in the
// project is gated on, and firestore.rules denies `delete` on it to every
// client — deliberately. A client that could delete its own membership is one
// loosened rule away from deleting somebody else's, so revoking one is a
// console edit and this callable is the single narrow exception, for the one
// case the App Store requires: a person deleting their own account.
//
// It takes NO uid argument. It acts on the verified auth context, so there is
// no way to phrase a call that releases somebody else's membership. The admin
// SDK bypasses the rules by design, which is what makes this possible at all.
//
// Called from src/lib/accounts.js → releaseMembership(), during deletion and
// BEFORE the Firebase Auth user goes, while request.auth is still present.
// Best-effort on the client side: a membership left behind when the Auth user
// is gone grants nothing, since nothing can sign in as that uid again.
exports.deleteMembership = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in.");
  }
  const uid = request.auth.uid;
  try {
    await db.collection("wbc_accounts").doc(uid).delete();
  } catch (err) {
    logger.error("deleteMembership failed", { uid, message: err?.message });
    throw new HttpsError("internal", `Could not delete membership: ${err?.message || err}`);
  }
  logger.info("Membership deleted", { uid });
  return { deleted: true };
});

// ─────────────────────────────────────────────────────────────────────────
//  Auth pairing — signing in the home-screen app, when the app cannot
// ─────────────────────────────────────────────────────────────────────────
// Sign in with Apple cannot complete inside an iPhone home-screen app. Asked
// what URL to send a phone to, Firebase's own backend answers, for Apple,
// `scope=email name` and `response_mode=form_post` — it adds those scopes
// itself, the client asks for none — and Apple's rule is that any scope forces
// form_post. So the trip home from Apple is a cross-site form POST, iOS hands a
// cross-site POST to Safari and does not hand it back, and the sign-in
// finishes in Safari while the installed app sits on the sign-in screen. iOS
// gives a home-screen app its own storage partition, so nothing in the browser
// crosses between them.
//
// These two functions are what crosses it. Safari signs in the ordinary way
// and OFFERS a custom token under a pairing id; the home-screen app CLAIMS it
// with the id it kept. See src/lib/authPairing.js for the whole shape.
//
// ── Why this collection is server-only ────────────────────────────
// The document holds a custom token: whoever reads it can sign in as that
// account. firestore.rules never names wbc_auth_pairings, so it falls to the
// catch-all deny at the bottom of that file and NO client can touch it — the
// Admin SDK here bypasses rules, which is the whole reason the token can live
// somewhere a phone cannot read. Do not add a rule for this collection.
//
// The id is the only credential, so it is treated as one: 32 random bytes
// minted client-side, checked for shape at both ends, deleted on the first
// successful claim, and expired ten minutes after it was offered.
const PAIRINGS_COL = "wbc_auth_pairings";
const PAIRING_TTL_MS = 10 * 60 * 1000;

// Must agree with isPairId in src/lib/authPairing.js: 32 bytes, base64url.
const isPairId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);

// ─── offerAuthPairing — Safari's half ────────────────────────────────────
// Called from the browser where sign-in actually worked, once there is a user.
// Mints a custom token for the CALLER'S OWN uid and nobody else's: the uid
// comes from the verified auth context, never from the request body, so this
// cannot be asked to hand out a token for another account.
exports.offerAuthPairing = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first, then pair.");
  }
  const pairId = request.data?.pairId;
  if (!isPairId(pairId)) {
    throw new HttpsError("invalid-argument", "That is not a pairing code.");
  }
  const uid = request.auth.uid;
  let token;
  try {
    token = await admin.auth().createCustomToken(uid);
  } catch (err) {
    // ── The one that will bite, and what it looks like ──────────────
    // createCustomToken signs a JWT, and on Cloud Functions v2 that is done by
    // asking IAM to sign it — which needs the runtime service account to hold
    // "Service Account Token Creator" ON ITSELF. It is not granted by default,
    // and nothing else in this file needs it, so this function can be the
    // first thing in the project ever to ask.
    //
    // The failure reaches the phone as a bare `internal`, which is the same
    // code a browser reports when it cannot reach the function at all — so the
    // message has to carry the difference, because the code cannot. It is
    // shown to whoever is holding the phone (see pairingErrorMessage in
    // src/lib/authPairing.js), which is why it names the fix rather than
    // describing the error.
    logger.error("offerAuthPairing: createCustomToken failed", { uid, message: err?.message });
    throw new HttpsError(
      "internal",
      "The server couldn't create a pairing token. Tell Aaron: the functions service account needs the Service Account Token Creator role.",
    );
  }
  try {
    await db.collection(PAIRINGS_COL).doc(pairId).set({
      token,
      uid,
      createdAt: Date.now(),
      expiresAt: Date.now() + PAIRING_TTL_MS,
    });
  } catch (err) {
    logger.error("offerAuthPairing: write failed", { uid, message: err?.message });
    throw new HttpsError("internal", "The server couldn't file the pairing token. Tell Aaron.");
  }
  logger.info("Auth pairing offered", { uid });
  return { offered: true };
});

// ─── claimAuthPairing — the home-screen app's half ───────────────────────
// Deliberately UNAUTHENTICATED: the app calling this has no session yet, which
// is the entire problem being solved. The pairing id is the credential, and
// the three things that make that safe are all here — the shape check above
// (so this is not a probe endpoint), the expiry, and the delete, which makes
// a token single-use even if the id is later read out of Safari's history.
//
// A missing or expired id answers `{ ready: false }` rather than throwing.
// The app polls this every time it comes to the foreground, and "not yet" is
// the ordinary answer while somebody is still typing their Apple password.
exports.claimAuthPairing = onCall(async (request) => {
  const pairId = request.data?.pairId;
  if (!isPairId(pairId)) {
    throw new HttpsError("invalid-argument", "That is not a pairing code.");
  }
  const ref = db.collection(PAIRINGS_COL).doc(pairId);
  let snap;
  try {
    snap = await ref.get();
  } catch (err) {
    logger.error("claimAuthPairing: read failed", { message: err?.message });
    throw new HttpsError("internal", "The server couldn't read the pairing. Tell Aaron.");
  }
  if (!snap.exists) return { ready: false };

  const data = snap.data() || {};
  // Deleted whether it is used or stale, so an expired record cannot sit there
  // waiting for a clock to be wrong.
  await ref.delete().catch(() => { /* best effort — the token is still expired */ });
  if (!data.token || !(Number(data.expiresAt) > Date.now())) {
    logger.info("Auth pairing expired before it was claimed", { uid: data.uid });
    return { ready: false, expired: true };
  }
  logger.info("Auth pairing claimed", { uid: data.uid });
  return { ready: true, token: data.token };
});

// ─────────────────────────────────────────────────────────────────────────
//  onBudgetAlert — the photo library's circuit breaker
// ─────────────────────────────────────────────────────────────────────────
// Google Cloud budgets alert; they do not cap. The documented way to get a
// real stop is a function like this one that detaches the project from its
// billing account — which for WBC would take Firestore, these functions and
// push down together, potentially with sixteen people mid-round trying to
// post scores. That trade is wrong at this size: the thing being protected
// costs less than a green fee, and the thing being broken is the tournament.
//
// So this breaker is scoped to the only surface that can actually run away —
// photo uploads. It writes a flag; the app reads it and hides the upload
// button (src/lib/media.js photoUploadsAllowed). Scoring, leaderboards,
// pairings and notifications are deliberately untouched, and READING the
// gallery stays open: serving photos that already exist is bounded and
// cached, it is adding new ones that grows the bill forever.
//
// ── Wiring it up (once, in the console) ──────────────────────────────────
//   1. Create a Pub/Sub topic:            wbc-budget-alerts
//   2. Billing → Budgets & alerts → edit the Cloud Storage budget →
//      Manage notifications → "Connect a Pub/Sub topic to this budget" →
//      pick wbc-budget-alerts.
//   3. firebase deploy --only functions:onBudgetAlert
//
// The budget must stay SCOPED to Cloud Storage on this project. A billing-
// account-wide budget would trip this breaker on Firestore or Functions
// spend, disabling photos over a cost photos did not cause.
//
// ── Hysteresis, and why it re-arms itself ────────────────────────────────
// Budget alerts republish every ~20-30 minutes with the month's running
// total, and that total resets when the month rolls over. So the breaker
// closes again on its own in the new month, with no console visit — which is
// the behaviour you want for a monthly budget.
//
// Re-enabling at 50% rather than at the same 100% it tripped on is what stops
// it flapping open and shut while spend hovers on the line. A director can
// also clear it by hand: wbc_config/photos is director-writable.
const { onMessagePublished } = require("firebase-functions/v2/pubsub");

const BUDGET_TOPIC = "wbc-budget-alerts";
const TRIP_AT = 1.0;   // spent >= 100% of budget → stop uploads
const REARM_AT = 0.5;  // spent back under 50%    → allow them again

exports.onBudgetAlert = onMessagePublished(BUDGET_TOPIC, async (event) => {
  const msg = event?.data?.message?.json;
  if (!msg) {
    logger.warn("Budget alert with no JSON payload; ignoring.");
    return;
  }

  const cost = Number(msg.costAmount);
  const budget = Number(msg.budgetAmount);
  // A budget of zero would make every ratio infinite and trip the breaker on
  // the first cent. Refuse rather than guess.
  if (!Number.isFinite(cost) || !Number.isFinite(budget) || budget <= 0) {
    logger.warn("Budget alert with unusable amounts; ignoring.", { cost, budget });
    return;
  }

  const ratio = cost / budget;
  const ref = db.collection("wbc_config").doc("photos");
  const current = (await ref.get()).data() || {};
  const disabled = !!current.uploadsDisabled;

  // Only WRITE on a transition. These messages arrive every twenty minutes
  // for the life of the budget; rewriting an unchanged flag each time would
  // fire the app's onSnapshot on every phone, all month, for nothing.
  if (!disabled && ratio >= TRIP_AT) {
    const currency = msg.currencyCode || "USD";
    await ref.set({
      uploadsDisabled: true,
      reason: `Photo uploads are paused — storage spend reached ${currency} ${cost.toFixed(2)} of a ${currency} ${budget.toFixed(2)} budget.`,
      costAmount: cost,
      budgetAmount: budget,
      budgetName: msg.budgetDisplayName || "",
      changedAt: new Date().toISOString(),
    }, { merge: true });
    logger.warn("Photo uploads DISABLED by budget breaker", { cost, budget, ratio });
    return;
  }

  if (disabled && ratio < REARM_AT) {
    await ref.set({
      uploadsDisabled: false,
      reason: "",
      costAmount: cost,
      budgetAmount: budget,
      changedAt: new Date().toISOString(),
    }, { merge: true });
    logger.info("Photo uploads RE-ENABLED by budget breaker", { cost, budget, ratio });
  }
});

exports.__sendToPlayer = sendToPlayer;
