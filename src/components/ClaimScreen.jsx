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
import { useState } from "react";
import { K, FS, R, ALPHA, MOTION, entranceBg } from "../theme";
import { WBC_LOGO } from "../constants";
import { EditionSwitcher } from "./EditionSwitcher";

// ── The wrong tournament is a real way to arrive here ───────────────
// Ported from Bourbon Cup. The roster on this screen is the ACTIVE edition's,
// so somebody whose device is pointed at 2014 is offered 2014's field — and if
// their name is not in it, the screen is a grid of other men with no way past
// it but signing out. Same for a beta tester left in the sandbox.
//
// Two halves, and the second is not only for the locked case:
//
//   `locked`  a frozen year takes no scores from a member (firestore.rules,
//             canWriteEdition), so claiming a name in one binds an account to
//             a tournament they cannot play. Said BEFORE the tap.
//   the link  "I am in the wrong year" is the same problem arriving quietly,
//             so the way out is always on the screen.
//
// canManage={false} on the switcher: this screen belongs to somebody who has
// not claimed a name yet, and creating or cloning a tournament is not
// something they should be able to reach from it.
export function ClaimScreen({ fbUser, candidates, onClaim, onCancel, busyId, locked = false, tournamentName = "" }) {
  const email = fbUser?.email || "";
  const displayName = fbUser?.displayName || "";
  const [switcherOpen, setSwitcherOpen] = useState(false);
  return (
    <div style={{ minHeight: "var(--app-height, 100dvh)", background: entranceBg(), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 64, margin: "0 auto 16px", display: "block", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        <h1 style={{ fontSize: FS.hero, color: K.t1, margin: "0 0 6px", fontWeight: 800, letterSpacing: "-0.02em" }}>Claim your profile</h1>
        <p style={{ color: K.t2, fontSize: FS.small, margin: "0 0 22px", lineHeight: 1.5 }}>
          Signed in{displayName ? ` as ${displayName}` : ""}{email ? ` · ${email}` : ""}.
        </p>

        {/* Said before the tap, not after it: the claim would go through and
            then nothing else would, which is a worse way to learn this. */}
        {locked && (
          <div style={{
            background: K.card, border: `1px solid ${K.warn}${ALPHA.line}`, borderRadius: R.lg,
            padding: "12px 14px", marginBottom: 14, textAlign: "center",
          }}>
            <div style={{ fontSize: FS.body, fontWeight: 700, color: K.t1, marginBottom: 4 }}>
              This tournament is frozen
            </div>
            <div style={{ fontSize: FS.small, color: K.t3, lineHeight: 1.5 }}>
              {tournamentName || "It"} is finished, so no scores can be posted in it. Claim your
              name in the tournament being played instead.
            </div>
            <button onClick={() => setSwitcherOpen(true)} style={{
              marginTop: 10, padding: "8px 14px", borderRadius: R.sm, border: "none",
              background: K.acc, color: K.bg, font: "inherit",
              fontSize: FS.small, fontWeight: 800, cursor: "pointer",
            }}>Choose a tournament</button>
          </div>
        )}

        {candidates.length === 0 ? (
          <div style={{ background: K.card, border: `1px dashed ${K.warn}${ALPHA.line}`, borderRadius: R.lg, padding: 24 }}>
            {/* ── The common cause is named first, because it is fixable ──
                Google and Apple are two different Firebase accounts for the
                same human. Somebody who claimed his name with one and then
                signed in with the other arrives here as a stranger, and his
                own name is missing from the roster precisely BECAUSE he
                already has it. Sending him to a director to have something
                freed up in Firebase would undo a claim that is correct. */}
            <p style={{ color: K.t2, fontSize: FS.small, margin: 0, lineHeight: 1.6 }}>
              Every name has already been claimed &mdash; and if one of them is yours, you claimed it with the <strong style={{ color: K.t1 }}>other</strong> sign-in button. Sign out and use the one you used the first time. If that isn&rsquo;t it, ask a tournament director.
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

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 22 }}>
          {/* Not only for the frozen case — see the header. */}
          {!locked && (
            <button onClick={() => setSwitcherOpen(true)} disabled={!!busyId} style={{
              background: "transparent", border: "none", color: K.t3, fontSize: FS.small,
              fontWeight: 600, textDecoration: "underline", padding: "7px 4px",
              cursor: busyId ? "default" : "pointer", opacity: busyId ? 0.5 : 1,
            }}>Not your tournament? Switch</button>
          )}
          <button onClick={onCancel} disabled={!!busyId} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.small, fontWeight: 600, cursor: busyId ? "default" : "pointer", opacity: busyId ? 0.5 : 1, padding: "7px 4px" }}>
            ← Not now, sign out
          </button>
        </div>
      </div>

      <EditionSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} canManage={false} />
    </div>
  );
}

// Courses in round order, unassigned ones last, alpha within a tie. Pure —
// lives out here so it is not rebuilt on every render, and so the data-load
// effect can call it without depending on where it sits in the component.

export default ClaimScreen;
