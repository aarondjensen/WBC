// ══════════════════════════════════════════════════════════════════
//  GroupSetup — picking your own playing partners.
// ══════════════════════════════════════════════════════════════════
//
// The fallback for a round with no draw. Normally a director sets the pairings
// in Admin and the scoring screen finds your group for you; this is what
// happens when nobody has, and somebody standing on the first tee needs a card
// to score into anyway.

// ── LEADERBOARD ──

// LeaderboardView, and the column widths it and the shell both measure
// against, moved to components/LeaderboardView.jsx. See the header there.

import { useState } from "react";
import { K, FS, R } from "../theme";

export function GroupSetup({ user, players, onStart, presetGroup }) {
  const [selected, setSelected] = useState(presetGroup || [user.id]);

  const toggle = (id) => {
    if (id === user.id) return;
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev);
  };

  return (
    <div>
      {presetGroup && (
        <button onClick={() => onStart(presetGroup)} style={{
          width: "100%", padding: "14px 0", borderRadius: R.xl, marginBottom: 12,
          background: `linear-gradient(135deg, ${K.acc}, ${K.accDim})`,
          color: K.bg, border: "none", fontSize: FS.lead, fontWeight: 800, cursor: "pointer",
          boxShadow: `0 4px 20px ${K.accGlow}`,
        }}>
          Start Round — {presetGroup.length} Players ⛳
        </button>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.lead, fontWeight: 800 }}>Group Setup</span>
          <span style={{ fontSize: FS.small, color: K.t3, marginLeft: 8 }}>{selected.length} player{selected.length !== 1 ? "s" : ""}</span>
        </div>
        {selected.length >= 2 && (
          <button onClick={() => onStart(selected)} style={{
            padding: "8px 20px", borderRadius: R.md,
            background: `linear-gradient(135deg, ${K.acc}, ${K.accDim})`,
            color: K.bg, border: "none", fontSize: FS.small, fontWeight: 800, cursor: "pointer",
            boxShadow: `0 2px 12px ${K.accGlow}`,
          }}>Done ⛳</button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {players.map(p => {
          const isSelf = p.id === user.id;
          const isSelected = selected.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} style={{
              background: isSelected ? K.accGlow : K.card,
              border: `1.5px solid ${isSelected ? K.acc : K.bdr}`,
              borderRadius: R.md, padding: "10px 14px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              cursor: isSelf ? "default" : "pointer", color: K.t1,
              opacity: !isSelected && selected.length >= 4 ? 0.4 : 1,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: R.sm,
                  background: isSelected ? K.acc : K.inp,
                  border: `1.5px solid ${isSelected ? K.acc : K.bdr}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: isSelected ? K.bg : K.t3, fontSize: FS.small, fontWeight: 800,
                }}>{isSelected ? "✓" : ""}</div>
                <span style={{ fontWeight: 600, fontSize: FS.small }}>{p.name}{isSelf ? " (you)" : ""}</span>
              </div>
              <span style={{ fontSize: FS.label, color: K.t3 }}>HI: {p.handicap_index}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
// ── The Betting tab, fetched only if somebody opens it ──
// It moved to components/BettingView.jsx — see the header there. Loaded on
// demand for the same reason the gallery is: it is the largest view in the
// app and nobody opens it walking down a fairway, so a phone on a course has
// no business carrying it until it is asked for.

export default GroupSetup;
