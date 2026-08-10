// ══════════════════════════════════════════════════════════════════
//  AccessPanel — the tournament password, from the inside.
// ══════════════════════════════════════════════════════════════════
//
// Admin's view of the door. Reading and setting the password are both
// director-only in firestore.rules — this panel is only the surface; the rule
// is what actually stops a member from doing either.
//
// The password is what turns a signed-in stranger into a MEMBER, which is what
// every write in the project is gated on. See lib/accounts.

import { useState, useEffect } from "react";
import { K, FS, R, ALPHA } from "../theme";
import { Btn } from "./ui";
import { readAccessCode, setAccessCode } from "../lib/accounts";

export function AccessPanel({ notify, confirm }) {
  const [code, setCode] = useState("");
  const [revealed, setRevealed] = useState(false);
  // Distinct from `busy`: `loading` is the ONE read that happens on open, and
  // it is what stops the retry button flashing "Try again" before anything has
  // been tried.
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reveal = async () => {
    setBusy(true); setErr("");
    const res = await readAccessCode();
    setBusy(false);
    // Three answers, and the third is why readAccessCode does not just return
    // a string: "no password set" and "I was not allowed to look" are the same
    // absence, and opposite instructions to the person reading this screen.
    if (!res.ok) { setErr(res.error); return; }
    setCode(res.code || "");
    setRevealed(true);
  };

  // Read it on open rather than behind a tap. The reveal button was guarding
  // against a shoulder over the screen, but this is a director-only tab and
  // the password's whole life is being said out loud across a table — while
  // the cost of hiding it was that the one field standing between a stranger
  // and somebody else's scorecard looked, to a director setting the event up,
  // like it wasn't there. The button stays as the retry when the read fails.
  //
  // Not a call to reveal(): that flips `busy` before it awaits anything, and a
  // setState in the same tick as the effect is a cascading render. Everything
  // here happens after the await, so the first paint is the `loading` one.
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await readAccessCode();
      if (!alive) return;
      setLoading(false);
      if (!res.ok) { setErr(res.error); return; }
      setCode(res.code || "");
      setRevealed(true);
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    const next = (code || "").trim();
    // Ported from Bourbon Cup: taking the password OFF is a one-tap action
    // with no undo that opens the tournament to anyone with a Google account,
    // and it is one keystroke away from a normal edit. Ask first, and say
    // which of the two things is about to happen.
    if (confirm) {
      const ok = await confirm({
        title: next ? "Change the password?" : "Remove the password?",
        message: next
          ? `Anyone signing in from now on needs "${next}" before they can claim a name or post a score.\n\nNobody already through the door is affected — this does not sign anybody out.`
          : "Anybody who signs in with Google or Apple will be able to claim a name and post scores.",
        confirmLabel: next ? "Change it" : "Remove it",
        destructive: !next,
      });
      if (!ok) return;
    }
    setBusy(true); setErr("");
    const res = await setAccessCode(code);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    notify?.(next ? "Password saved" : "Password cleared — anyone can sign in");
  };

  const label = { fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* The password */}
      <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, padding: "12px 14px" }}>
        <div style={{ ...label, marginBottom: 8 }}>Event password</div>
        {revealed ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={code} onChange={e => { setCode(e.target.value); if (err) setErr(""); }}
              type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="No password set"
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`, color: K.t1, fontSize: FS.lead, fontWeight: 700, outline: "none", fontFamily: "'Montserrat', sans-serif", boxSizing: "border-box" }} />
            <Btn onClick={save} disabled={busy} style={{ flexShrink: 0 }}>
              {busy ? "…" : "Save"}
            </Btn>
          </div>
        ) : (
          <button onClick={reveal} disabled={loading || busy} style={{ padding: "9px 16px", borderRadius: R.md, background: "transparent", border: `1px solid ${K.acc}${ALPHA.line}`, color: K.acc, fontSize: FS.small, fontWeight: 700, cursor: loading || busy ? "default" : "pointer" }}>
            {loading || busy ? "Reading…" : "Try again"}
          </button>
        )}
        {revealed && !(code || "").trim() && (
          <div style={{ fontSize: FS.label, fontWeight: 600, color: K.warn, marginTop: 8 }}>
            No password set — anyone with a Google or Apple account can sign in and claim a name.
          </div>
        )}
      </div>

      {err && <div style={{ fontSize: FS.label, fontWeight: 600, color: K.danger, lineHeight: 1.5 }}>{err}</div>}
    </div>
  );
}

export default AccessPanel;
