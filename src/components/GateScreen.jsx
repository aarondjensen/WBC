// ══════════════════════════════════════════════════════════════════
//  GateScreen — the tournament password.
// ══════════════════════════════════════════════════════════════════
//
// The door. Signed in is not the same as allowed: this is where an account
// presents the password and is issued the wbc_accounts membership that every
// write in the project is gated on.
//
// It re-checks membership on submit rather than trusting what it was mounted
// with, which is what waves through somebody who is already a member but whose
// membership read failed on bad signal — see the note on loadMembership in
// App.jsx.

// ── GATE SCREEN — the tournament password ──
// Three steps to get in, each seen once: sign in with Google or Apple, enter
// the tournament password, then claim your name off the roster. This is the
// middle one, and it is the one that actually decides who can change
// anything.
//
// Signing in proves who you are. It does not prove you were invited — anybody
// can make a Google account, and this app's Firebase config ships in the
// bundle by design. So an account has to present the tournament password and
// be issued a membership document (wbc_accounts/{uid}), which every write in
// the project is gated on.
//
// The check happens in the SECURITY RULES, not here. Submitting writes a
// membership document carrying the typed code, and the database rejects it if
// the code is wrong (src/lib/accounts.js, firestore.rules). Nothing on this
// screen knows the password, so nothing on this screen can leak it — which is
// the difference between this and a client-side password check that anybody
// can walk past with devtools open.
//
// A blank or missing code in wbc_secrets/access means the door is open and
// any password (including none) is accepted. That is the bootstrap, not a
// bug: before anybody has set one there is no way to present the right one.
import { useState } from "react";
import { K, FS, R } from "../theme";
import { WBC_LOGO } from "../constants";
import { Btn } from "./ui";
import { joinWithCode } from "../lib/accounts";

export function GateScreen({ fbUser, onPassed, onCancel }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setBusy(true); setErr("");
    const res = await joinWithCode(fbUser, code);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onPassed();
  };

  return (
    <div style={{ minHeight: "var(--app-height, 100dvh)", background: `radial-gradient(ellipse at 20% 50%, #0d1f3c 0%, ${K.bg} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 64, margin: "0 auto 16px", display: "block", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        <h1 style={{ fontSize: FS.hero, color: K.t1, margin: "0 0 6px", fontWeight: 800, letterSpacing: "-0.02em" }}>Event password</h1>
        <p style={{ color: K.t2, fontSize: FS.small, margin: "0 0 20px", lineHeight: 1.5 }}>
          Signed in as {fbUser?.email || "your account"}.<br />Ask a director for the password — you&rsquo;ll only need it once.
        </p>
        <form onSubmit={submit}>
          <input
            value={code}
            onChange={e => { setCode(e.target.value); if (err) setErr(""); }}
            // Not type="password": there is no privacy to protect from
            // somebody standing on the same tee box, and a masked field on a
            // phone keyboard is how you get three failed attempts.
            type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            autoComplete="one-time-code" autoFocus
            placeholder="Password"
            style={{
              width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: R.lg,
              textAlign: "center", background: K.inp,
              border: `2px solid ${err ? K.danger : K.bdr}`, color: K.t1,
              // 16px or larger, or iOS Safari zooms the page on focus.
              fontSize: FS.lead, fontWeight: 700, outline: "none", fontFamily: "'Montserrat', sans-serif",
            }} />
          <Btn type="submit" size="lg" block disabled={busy} style={{ marginTop: 14 }}>{busy ? "Checking…" : "Continue"}</Btn>
        </form>
        <div style={{ minHeight: 34, marginTop: 10, fontSize: FS.small, lineHeight: 1.4, fontWeight: 600, color: K.danger }}>{err}</div>
        <Btn variant="ghost" size="sm" onClick={onCancel} disabled={busy} style={{ color: K.t3 }}>
          ← Not now, sign out
        </Btn>
      </div>
    </div>
  );
}

// ClaimScreen moved to components/ClaimScreen.jsx — see the header there.

export default GateScreen;
