// ══════════════════════════════════════════════════════════════════
//  ClaimScreen — "which one of these is you?"
// ══════════════════════════════════════════════════════════════════
//
// Shown once, after a first sign-in, to bind a Google or Apple account to a
// PLAYER — the permanent career id that sixteen years of history hangs off.
//
// Names rather than emails, deliberately: WBC never collects an address ahead
// of time, and Apple's private relay means the one it does get is frequently
// not a person's real one. Picking your own name off the roster is the whole
// flow. See claimProfile in App.jsx for the write, and wbc_users for where it
// lands.

// ── CLAIM SCREEN ──
// Shown after a Google/Apple sign-in when the authenticated Firebase user is
// not yet mapped to a WBC player (no wbc_users doc). The signed-in person picks
// their own name from the unclaimed profiles; picking writes the uid→player_id
// claim and logs them in. No emails are collected ahead of time or matched —
// claiming is always by choosing your name. The player_id is the permanent
// career identity linking to 16 years of history, so this is the moment a real
// person is bound to that identity.
import { K, FS, R, ALPHA, MOTION } from "../theme";
import { WBC_LOGO } from "../constants";

export function ClaimScreen({ fbUser, candidates, onClaim, onCancel, busyId }) {
  const email = fbUser?.email || "";
  const displayName = fbUser?.displayName || "";
  return (
    <div style={{ minHeight: "var(--app-height, 100dvh)", background: `radial-gradient(ellipse at 20% 50%, #0d1f3c 0%, ${K.bg} 70%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 64, margin: "0 auto 16px", display: "block", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        <h1 style={{ fontSize: FS.hero, color: K.t1, margin: "0 0 6px", fontWeight: 800, letterSpacing: "-0.02em" }}>Claim your profile</h1>
        <p style={{ color: K.t2, fontSize: FS.small, margin: "0 0 22px", lineHeight: 1.5 }}>
          Signed in{displayName ? ` as ${displayName}` : ""}{email ? ` · ${email}` : ""}.
        </p>

        {candidates.length === 0 ? (
          <div style={{ background: K.card, border: `1px dashed ${K.warn}${ALPHA.line}`, borderRadius: R.lg, padding: 24 }}>
            <p style={{ color: K.t2, fontSize: FS.small, margin: 0, lineHeight: 1.6 }}>
              Every player profile has already been claimed. If one of them is you, ask a tournament director to free it up in Firebase, then sign in again.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {candidates.map((p) => {
              const busy = busyId === p.id;
              const initials = p.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
              return (
                <button key={p.id} onClick={() => !busyId && onClaim(p)} disabled={!!busyId}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: K.card, border: `1px solid ${busy ? K.acc : K.bdr}`, borderRadius: R.lg, padding: "12px 12px", cursor: busyId ? "default" : "pointer", color: K.t1, textAlign: "left", opacity: busyId && !busy ? 0.5 : 1, transition: `all ${MOTION}` }}
                  onMouseEnter={(e) => { if (!busyId) { e.currentTarget.style.borderColor = K.acc; e.currentTarget.style.background = K.hover; } }}
                  onMouseLeave={(e) => { if (!busyId) { e.currentTarget.style.borderColor = K.bdr; e.currentTarget.style.background = K.card; } }}>
                  <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: K.acc + ALPHA.wash, border: `1px solid ${K.acc}${ALPHA.line}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.small, fontWeight: 800, color: K.acc }}>{initials}</span>
                  <span style={{ fontSize: FS.small, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{busy ? "Linking…" : p.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <button onClick={onCancel} disabled={!!busyId} style={{ marginTop: 22, background: "transparent", border: "none", color: K.t3, fontSize: FS.small, fontWeight: 600, cursor: busyId ? "default" : "pointer", opacity: busyId ? 0.5 : 1 }}>
          ← Not now, sign out
        </button>
      </div>
    </div>
  );
}

// Courses in round order, unassigned ones last, alpha within a tie. Pure —
// lives out here so it is not rebuilt on every render, and so the data-load
// effect can call it without depending on where it sits in the component.

export default ClaimScreen;
