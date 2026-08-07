// ══════════════════════════════════════════════════════════════════
//  NotificationSettings — the one screen that owns the permission dance.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup. Turning push on is four different conversations
// depending on the device, and every one of them has to end with the user
// knowing what to do next:
//
//   0.  iOS below 16.4 → no Push API at all. Say so; installing won't help.
//   0b. iOS in a Safari tab → push only works from a home-screen install.
//       Walk through Add to Home Screen rather than showing a toggle that
//       cannot work.
//   1.  Supported → the toggle, what will be sent, and a test.
//   2.  Denied → no toggle. The browser will not re-prompt after a denial;
//       the only way back is device settings, so explain that instead of
//       offering a button that silently does nothing.
//   3.  Unsupported browser → say which ones work.
//
// What WBC had before this was a single bell button in the header that called
// requestPermission and wrote a token. It could turn push ON and had no way to
// turn it off, no way to tell whether it had worked, and no account of what
// would be sent.
//
// The status card reads SUBSCRIBED, not PERMISSION. The two diverge: a user
// who turns notifications off here has their token deleted but keeps the
// browser grant, so permission stays "granted" forever while the honest
// answer is "off". Only the presence of a token says whether anything will
// actually arrive.
import { useState, useEffect } from "react";
import { K, FONT, FS, R, ALPHA, MOTION } from "../theme";
import { Card, SectionLabel, Toggle} from "./ui";
import {
  registerForPush, unsubscribeFromPush, getNotificationPermissionState,
  isStandalonePWA, isIOSPushCapable, checkSubscriptionStatus,
  getCachedSubscriptionStatus, sendTestPush,
} from "../lib/notifications";

// What actually gets sent, kept in step with functions/index.js
// (onScorecardSigned, onRoundFinalized). A user deciding whether to allow
// notifications is entitled to know what they are agreeing to receive, and
// "WBC would like to send you notifications" does not tell them.
const TYPES = [
  { icon: "✍️", title: "Time to attest your card", sub: "Someone in your group signed it" },
  { icon: "🏁", title: "A round is final", sub: "Results are in — check the leaderboard" },
];


export function NotificationSettings({ user, notify, onPermissionChange }) {
  const [permission, setPermission] = useState("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(true);
  const [iosOk, setIosOk] = useState(true);
  const [testing, setTesting] = useState(false);

  const pid = user?.id;

  useEffect(() => {
    setPermission(getNotificationPermissionState());
    setStandalone(isStandalonePWA());
    setIosOk(isIOSPushCapable());
    if (!pid) return;
    // Paint the device's last known answer first so the card doesn't read
    // "Off" for the length of a Firestore round-trip at someone who is on,
    // then correct from the server. A null result means the READ failed —
    // leave the state alone rather than nagging a subscribed user.
    const cached = getCachedSubscriptionStatus(pid);
    if (cached !== null) setSubscribed(cached);
    checkSubscriptionStatus(pid).then(sub => { if (sub !== null) setSubscribed(sub); });
  }, [pid]);

  const handleToggle = async () => {
    if (busy || !pid) return;
    setBusy(true);
    if (subscribed) {
      await unsubscribeFromPush(pid);
      setSubscribed(false);
      notify?.("Notifications off");
    } else {
      const res = await registerForPush(pid);
      if (res.success) {
        setSubscribed(true);
        notify?.("Notifications on");
      } else if (res.state !== "denied" && res.state !== "unsupported") {
        // Those two are explained by the card below; a toast on top of the
        // explanation is just noise. Anything else is unexpected and needs
        // to be visible.
        notify?.(`Couldn't enable: ${res.error || res.state}`);
      }
    }
    const next = getNotificationPermissionState();
    setPermission(next);
    onPermissionChange?.(next);
    setBusy(false);
  };

  const runTest = async () => {
    if (!pid || testing) return;
    setTesting(true);
    try {
      const sent = await sendTestPush(pid);
      notify?.(sent > 0 ? `Test sent to ${sent} device${sent === 1 ? "" : "s"}` : "No devices registered");
    } catch (e) {
      notify?.(`Test failed: ${e?.message || e}`);
    } finally { setTesting(false); }
  };

  const wrap = (children) => (
    <div style={{ fontFamily: FONT, marginTop: 18 }}>
      <SectionLabel>Notifications</SectionLabel>
      {children}
    </div>
  );

  // ── iOS, too old ──
  if (!iosOk) return wrap(
    <Card>
      <div style={{ fontSize: FS.body, fontWeight: 800, color: K.t1, marginBottom: 6 }}>iOS update needed</div>
      <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
        Push notifications need iOS 16.4 or later. Settings → General → Software Update.
      </div>
    </Card>
  );

  // ── iOS, in a Safari tab ──
  // Detected rather than assumed: iOS Safari exposes no Notification API in a
  // normal tab, which is why the permission state reads "unsupported" there
  // and "default" once installed.
  const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent || "");
  if (isIOS && !standalone && permission === "unsupported") return wrap(
    <Card>
      <div style={{ fontSize: FS.body, fontWeight: 800, color: K.t1, marginBottom: 6 }}>Add to your home screen first</div>
      <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5, marginBottom: 10 }}>
        On iPhone, notifications only work when the app is installed. It takes about ten seconds:
      </div>
      <ol style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.7, paddingLeft: 20, margin: 0 }}>
        <li>Tap <strong style={{ color: K.t1 }}>Share</strong> at the bottom of Safari.</li>
        <li>Scroll down, tap <strong style={{ color: K.t1 }}>Add to Home Screen</strong>.</li>
        <li>Open the app from your home screen, not from Safari.</li>
        <li>Come back here and turn the switch on.</li>
      </ol>
    </Card>
  );

  return wrap(
    <>
      <Card style={{ marginBottom: 8 }}>
        {permission === "denied" ? (
          <>
            <div style={{ fontSize: FS.body, fontWeight: 800, color: K.warn, marginBottom: 4 }}>Blocked</div>
            <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
              Notifications were blocked for this app. Your browser won&apos;t ask again — allow them
              in your device or browser settings, then come back here.
            </div>
          </>
        ) : permission === "unsupported" ? (
          <>
            <div style={{ fontSize: FS.body, fontWeight: 800, color: K.t1, marginBottom: 4 }}>Not supported here</div>
            <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
              This browser can&apos;t do push notifications. Chrome, Edge, or Safari on iOS 16.4+
              installed to the home screen all can.
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: FS.body, fontWeight: 800, color: subscribed ? K.acc : K.t1 }}>
                {subscribed ? "Notifications on" : "Notifications off"}
              </div>
              <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5, marginTop: 2 }}>
                {subscribed ? "You'll get the alerts below." : "Turn on to get the alerts below."}
              </div>
            </div>
            <Toggle on={subscribed} busy={busy} onChange={handleToggle} />
          </div>
        )}
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {TYPES.map((t, i) => (
          <Card key={i} pad="10px 14px">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: FS.lead, lineHeight: 1, flexShrink: 0 }}>{t.icon}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t1 }}>{t.title}</div>
                <div style={{ fontSize: FS.label, color: K.t3, marginTop: 1 }}>{t.sub}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {subscribed && (
        <button onClick={runTest} disabled={testing} style={{
          width: "100%", padding: "10px 0", marginTop: 10, borderRadius: R.sm,
          background: `${K.tourn}${ALPHA.wash}`, border: `1px solid ${K.tourn}${ALPHA.line}`,
          color: K.tourn, fontSize: FS.small, fontWeight: 800,
          cursor: testing ? "default" : "pointer", opacity: testing ? 0.6 : 1, fontFamily: FONT,
        }}>
          {testing ? "Sending…" : "Send a test notification"}
        </button>
      )}

      {/* The one thing people get wrong. A phone and a laptop are separate
          subscriptions; turning it on here does not turn it on there. */}
      <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.6, marginTop: 12 }}>
        Notifications are per device. Turning them on here covers this phone or browser only —
        turn them on separately anywhere else you use the app. Turning them OFF switches off
        every device at once.
      </div>
    </>
  );
}
