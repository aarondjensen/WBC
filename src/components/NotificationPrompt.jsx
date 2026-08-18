// ══════════════════════════════════════════════════════════════════
//  NotificationPrompt — asked once, on the first login.
// ══════════════════════════════════════════════════════════════════
//
// The modal half of lib/notificationPrompt, which owns whether it is shown at
// all. Everything about this file is arranged around one constraint: iOS
// Safari ignores a permission request that no tap asked for, so the browser's
// own prompt has to come out of a BUTTON PRESS inside this card, not out of
// the effect that decided to show the card.
//
// That is also why it is worth having two prompts in a row. The browser's is
// a grey bar with the domain in it and no idea what it is for; this one says
// what will be sent, so the answer to the grey bar is already decided by the
// time it appears.
//
// Both ways out mark the player as asked (see markPrompted at the call site),
// including Not now — an "ask again next time" is how a prompt becomes the
// thing people close without reading.
import { useState } from "react";
import { K, FS, R, ALPHA } from "../theme";
import { Popup } from "./Popup";
import { Btn } from "./ui";

export function NotificationPrompt({ onEnable, onDismiss }) {
  const [busy, setBusy] = useState(false);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    // The await is the browser's own permission sheet plus a token write, and
    // the card stays up behind it — closing first would take the gesture's
    // context with it on iOS and leave a modal-less app waiting on a prompt
    // nobody asked for.
    try { await onEnable?.(); } finally { setBusy(false); }
  };

  return (
    // No backdrop close, which also disables ESC: the two buttons are the
    // whole point, and a stray tap outside counts as neither.
    <Popup onClose={onDismiss} maxWidth={340} zIndex={3500} padding={20} portal noBackdropClose>
      <div style={{ textAlign: "center", fontSize: FS.display, lineHeight: 1, marginBottom: 12 }} aria-hidden>🔔</div>
      <div style={{ fontSize: FS.lead, fontWeight: 800, color: K.t1, textAlign: "center", marginBottom: 8 }}>
        Turn on notifications?
      </div>
      <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.55, textAlign: "center", marginBottom: 14 }}>
        So your phone tells you when it matters — nothing else.
      </div>

      {/* Said plainly, because "allow notifications" with no list behind it is
          what people decline. Every line is something the Cloud Functions
          actually send. */}
      <div style={{
        background: `${K.tourn}${ALPHA.wash}`, border: `1px solid ${K.tourn}${ALPHA.line}`,
        borderRadius: R.sm, padding: "10px 12px", marginBottom: 16,
      }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: FS.small, color: K.t2, lineHeight: 1.7 }}>
          <li>Your tee time and your group</li>
          <li>A scorecard waiting on your attest</li>
          <li>The board moving while you&apos;re out there</li>
        </ul>
      </div>

      <Btn onClick={enable} disabled={busy} block size="lg">
        {busy ? "Turning on…" : "Turn on notifications"}
      </Btn>
      <button onClick={onDismiss} disabled={busy} style={{
        width: "100%", marginTop: 10, padding: "9px 0", background: "transparent", border: "none",
        color: K.t3, fontSize: FS.small, fontWeight: 700, cursor: busy ? "default" : "pointer",
        fontFamily: "'Montserrat', sans-serif",
      }}>
        Not now
      </button>

      {/* The one thing that stops this reading as a trap door. */}
      <div style={{ fontSize: FS.label, color: K.t3, textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
        You can change this any time under your name, in Notifications.
      </div>
    </Popup>
  );
}

export default NotificationPrompt;
