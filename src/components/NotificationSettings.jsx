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
//   1.  Supported → the toggle and a test.
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
//
// ── AND A FIFTH CONVERSATION: THE NATIVE SHELLS ──
// Everything above is web push — a service worker, the Push API, an FCM token
// for a BROWSER. Neither Capacitor shell has any of that. iOS runs a WKWebView,
// which exposes no Notification API and no service worker at all; Android's
// WebView has service workers but not the Push API. So `permission` reads
// "unsupported" inside both apps, and the two cards that state was written for
// are addressed to somebody in a browser:
//
//   on iOS the app told you to tap Share → Add to Home Screen, in an app that
//   is already on the home screen and has no Share button to tap;
//   on Android it told you to go and use Chrome.
//
// Instructions that cannot be followed are what App Review's Guideline 2.1
// rejections are made of, and a tester who follows them ends up somewhere the
// tournament isn't. So a native shell gets its own card that says the true
// thing, and no toggle — a switch that cannot come on is worse than no switch.
//
// This is a STOPGAP, and the honest version of one. Native push needs
// @capacitor/push-notifications, an APNs key, the aps-environment entitlement
// and a token path that registers against the player id the way the web one
// does; until that exists the notifications are real and they arrive on the
// web app, which is what the card points at.
import { useState, useEffect } from "react";
import { K, FONT, FS, R, ALPHA, MOTION } from "../theme";
import { Card, SectionLabel, Toggle} from "./ui";
import { isNativePlatform } from "../firebase";
import {
  registerForPush, unsubscribeFromPush, getNotificationPermissionState,
  isStandalonePWA, isIOSPushCapable, checkSubscriptionStatus,
  getCachedSubscriptionStatus, sendTestPush,
} from "../lib/notifications";


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

  // ── Inside the App Store / Play build ──
  // Checked FIRST, ahead of every browser branch, because a native shell also
  // matches "iOS" and "unsupported" and would otherwise fall into the Add to
  // Home Screen card. See the note at the top of this file.
  if (isNativePlatform()) return wrap(
    <Card>
      <div style={{ fontSize: FS.body, fontWeight: 800, color: K.t1, marginBottom: 6 }}>Not in the app yet</div>
      <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5 }}>
        Tee time and scoring alerts currently go to the web app. Open{" "}
        <strong style={{ color: K.t1 }}>wannabecup.com</strong> in your browser, add it to your home
        screen, and turn notifications on there — they&apos;ll reach the same phone.
      </div>
    </Card>
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
            </div>
            <Toggle on={subscribed} busy={busy} onChange={handleToggle} />
          </div>
        )}
      </Card>

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

      {/* The one thing people get wrong, and only the asymmetric half of it:
          a phone and a laptop are separate subscriptions on the way ON, and
          one switch on the way OFF. */}
      <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.6, marginTop: 12 }}>
        On covers this device only. Off switches off everywhere.
      </div>
    </>
  );
}
