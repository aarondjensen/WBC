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
import { useState } from "react";
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
 *
 * ── "bounced", and why this screen has two ways out ────────────────
 * A home-screen app cannot reliably hand a URL to Safari. Whether a
 * target="_blank" link leaves the app depends on whether iOS considers that
 * URL part of the app, which depends on the manifest, which iOS reads once
 * when the icon is created and never again. Get it wrong and the link reloads
 * the app onto its own pairing URL: the player taps "Open Safari" and watches
 * the page refresh, over and over, with nothing to do about it. Not a
 * hypothetical — it is what the first person to use this screen hit.
 *
 * So the link is the happy path and never the only path. "bounced" is the app
 * having caught itself being reopened instead of Safari, and its answer is a
 * copy button plus the URL in a box somebody can select by hand. That works
 * whatever iOS decides, because at that point the only thing crossing between
 * the two browsers is a person with a clipboard.
 *
 * It is a prop of its own rather than a `status` value because the two are
 * different axes and outlive each other: the app claims on every foreground,
 * so a bounced screen still cycles through "checking" and "not-yet" while its
 * instructions have to stay put.
 */
export function PairWaitScreen({ url, status = "idle", bounced = false, error = "", onOpen, onCheck, onCancel }) {
  const busy = status === "checking";
  // null = not tried, true = copied, false = the browser refused. The third
  // state matters: a button that says "copied" and did not would strand
  // somebody with no way to get the URL out of the app at all.
  const [copied, setCopied] = useState(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(null), 4000);
    } catch { setCopied(false); }
  };
  return (
    <div style={shell}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 56, margin: "0 auto 14px", display: "block", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        <h1 style={{ fontSize: FS.hero, color: K.t1, margin: "0 0 6px", fontWeight: 800, letterSpacing: "-0.02em" }}>
          Finish in Safari
        </h1>
        <p style={{ color: K.t2, fontSize: FS.small, margin: "0 0 20px", lineHeight: 1.5 }}>
          {bounced
            ? "Your iPhone kept that link inside the app instead of opening Safari. Copy it and paste it into Safari yourself — everything after that is the same."
            : "Apple won't complete a sign-in inside a home-screen app — that's an iPhone rule, not a WBC one. Sign in once in Safari and this app picks it up. You only do this the first time."}
        </p>

        <div style={{ background: K.card, border: `1px solid ${K.bdr}`, borderRadius: R.lg, padding: "16px 14px 6px", marginBottom: 16 }}>
          {bounced ? (
            <>
              <Step n={1}>Tap <strong style={{ color: K.t1 }}>Copy link</strong> below.</Step>
              <Step n={2}>Open <strong style={{ color: K.t1 }}>Safari</strong>, paste it into the address bar, and go.</Step>
              <Step n={3}>Sign in there, then come back here and tap <strong style={{ color: K.t1 }}>I&rsquo;m signed in</strong>.</Step>
            </>
          ) : (
            <>
              <Step n={1}>Tap <strong style={{ color: K.t1 }}>Open Safari</strong> below.</Step>
              <Step n={2}>Sign in there with the same button you always use.</Step>
              <Step n={3}>Come back here and tap <strong style={{ color: K.t1 }}>I&rsquo;m signed in</strong>.</Step>
            </>
          )}
        </div>

        {/* An anchor rather than window.open, because a target=_blank link is
            what a home-screen app can offer Safari without needing popup
            permission. Whether iOS actually hands it over is not ours to
            decide — hence the copy path below, and the note on "bounced". */}
        {!bounced && (
          <a
            href={url} target="_blank" rel="noopener noreferrer" onClick={onOpen}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "100%", padding: "13px 0", borderRadius: R.lg,
              background: K.acc, color: K.bg, textDecoration: "none",
              fontSize: FS.body, fontWeight: 800, letterSpacing: "0.02em",
            }}
          >Open Safari</a>
        )}

        <Btn onClick={copy} size="lg" block variant={bounced ? "primary" : "ghost"}
          style={bounced ? undefined : { marginTop: 6, color: K.t3 }}>
          {copied === true ? "Link copied ✓" : bounced ? "Copy link" : "Didn't open Safari? Copy the link"}
        </Btn>

        {(bounced || copied === false) && (
          <div style={{
            marginTop: 8, padding: "9px 11px", borderRadius: R.md,
            background: K.inp, border: `1px solid ${K.bdr}`,
            color: K.t2, fontSize: FS.label, fontWeight: 500,
            textTransform: "none", wordBreak: "break-all", userSelect: "all", textAlign: "left",
          }}>{url}</div>
        )}

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
