// ══════════════════════════════════════════════════════════════════
//  PairScreen — the two halves of signing the home-screen app in.
// ══════════════════════════════════════════════════════════════════
//
// Sign in with Apple cannot finish inside an iPhone home-screen app. The full
// reasoning is in src/lib/authPairing.js; the short version is that Firebase
// asks Apple for scopes we never requested, any scope forces a form POST on
// the way home, and iOS hands a cross-site POST to Safari and does not hand it
// back. So the app signs in where sign-in works and carries the result across.
//
// Two screens, one on each side of that:
//
//   PairWaitScreen  — in the home-screen app. Send them to Safari, then take
//                     the answer back.
//   PairDoneScreen  — in Safari. Say it worked and where to go next.
//
// ── Why both are so wordy ─────────────────────────────────────────
// Because this asks somebody to leave the app, do something in another
// browser, and come back — and a player who does not understand WHY will
// assume it is broken and stop. Every line here is doing that job. It is the
// one screen in this app where explaining costs less than not explaining.
import { K, FS, R, ALPHA, entranceBg } from "../theme";
import { WBC_LOGO } from "../constants";
import { Btn } from "./ui";

const shell = {
  minHeight: "var(--app-height, 100dvh)", background: entranceBg(),
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums",
  padding: 20,
};

const Step = ({ n, children, done = false }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left", marginBottom: 12 }}>
    <span style={{
      width: 22, height: 22, flexShrink: 0, borderRadius: "50%", marginTop: 1,
      background: done ? K.acc : `${K.acc}${ALPHA.wash}`,
      border: `1px solid ${K.acc}${ALPHA.line}`,
      color: done ? K.bg : K.acc,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: FS.label, fontWeight: 800,
    }}>{done ? "✓" : n}</span>
    <span style={{ color: K.t2, fontSize: FS.small, lineHeight: 1.5, fontWeight: 500 }}>{children}</span>
  </div>
);

/**
 * The home-screen app, waiting.
 *
 * `status` drives the one button that matters: "idle" before they have gone,
 * "checking" while the claim is in flight, "not-yet" when Safari has not
 * offered anything yet — which is the ordinary answer while somebody is still
 * typing an Apple password, and so is worded as a nudge rather than a failure.
 */
export function PairWaitScreen({ url, status = "idle", error = "", onOpen, onCheck, onCancel }) {
  const busy = status === "checking";
  return (
    <div style={shell}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 56, margin: "0 auto 14px", display: "block", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        <h1 style={{ fontSize: FS.hero, color: K.t1, margin: "0 0 6px", fontWeight: 800, letterSpacing: "-0.02em" }}>
          Finish in Safari
        </h1>
        <p style={{ color: K.t2, fontSize: FS.small, margin: "0 0 20px", lineHeight: 1.5 }}>
          Apple won&rsquo;t complete a sign-in inside a home-screen app &mdash; that&rsquo;s an iPhone rule, not a WBC one.
          Sign in once in Safari and this app picks it up. You only do this the first time.
        </p>

        <div style={{ background: K.card, border: `1px solid ${K.bdr}`, borderRadius: R.lg, padding: "16px 14px 6px", marginBottom: 16 }}>
          <Step n={1}>Tap <strong style={{ color: K.t1 }}>Open Safari</strong> below.</Step>
          <Step n={2}>Sign in there with the same button you always use.</Step>
          <Step n={3}>Come back here and tap <strong style={{ color: K.t1 }}>I&rsquo;m signed in</strong>.</Step>
        </div>

        {/* An anchor, not window.open: in a home-screen app a target=_blank
            link is what reliably hands the URL to Safari, and it needs no
            popup permission to do it. */}
        <a
          href={url} target="_blank" rel="noopener noreferrer" onClick={onOpen}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", padding: "13px 0", borderRadius: R.lg,
            background: K.acc, color: K.bg, textDecoration: "none",
            fontSize: FS.body, fontWeight: 800, letterSpacing: "0.02em",
          }}
        >Open Safari</a>

        <Btn onClick={onCheck} size="lg" block disabled={busy} variant="secondary" style={{ marginTop: 10 }}>
          {busy ? "Checking…" : "I'm signed in — continue"}
        </Btn>

        <div style={{ minHeight: 38, marginTop: 10, fontSize: FS.small, lineHeight: 1.45, fontWeight: 600, color: status === "not-yet" ? K.warn : K.danger }}>
          {status === "not-yet"
            ? "Nothing to pick up yet. Finish signing in over in Safari, then tap it again."
            : error}
        </div>

        <Btn variant="ghost" size="sm" onClick={onCancel} disabled={busy} style={{ color: K.t3 }}>
          ← Back
        </Btn>
      </div>
    </div>
  );
}

/**
 * Safari, having signed in, telling them where to go.
 *
 * `status` is "offering" while the token is being filed, "done" once it is,
 * "error" if it could not be.
 */
export function PairDoneScreen({ status = "offering", error = "", onRetry, onDismiss }) {
  const done = status === "done";
  return (
    <div style={shell}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 56, margin: "0 auto 14px", display: "block", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        {status === "error" ? (
          <>
            <h1 style={{ fontSize: FS.hero, color: K.t1, margin: "0 0 6px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              Couldn&rsquo;t pair
            </h1>
            <p style={{ color: K.danger, fontSize: FS.small, margin: "0 0 18px", lineHeight: 1.5, fontWeight: 600 }}>{error}</p>
            <Btn onClick={onRetry} size="lg" block>Try again</Btn>
          </>
        ) : (
          <>
            <div style={{
              width: 54, height: 54, margin: "0 auto 14px", borderRadius: "50%",
              background: done ? K.acc : `${K.acc}${ALPHA.wash}`,
              border: `1px solid ${K.acc}${ALPHA.line}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: FS.display, fontWeight: 800, color: done ? K.bg : K.acc,
            }}>{done ? "✓" : "…"}</div>
            <h1 style={{ fontSize: FS.hero, color: K.t1, margin: "0 0 6px", fontWeight: 800, letterSpacing: "-0.02em" }}>
              {done ? "You're signed in" : "Pairing…"}
            </h1>
            <p style={{ color: K.t2, fontSize: FS.small, margin: "0 0 18px", lineHeight: 1.5 }}>
              {done
                ? "Now go back to the WBC icon on your home screen and tap I'm signed in. You won't have to do this again."
                : "Connecting this sign-in to your home-screen app."}
            </p>
          </>
        )}
        {done && (
          <Btn variant="ghost" size="sm" onClick={onDismiss} style={{ color: K.t3 }}>
            Or carry on here in Safari
          </Btn>
        )}
      </div>
    </div>
  );
}

export default PairWaitScreen;
