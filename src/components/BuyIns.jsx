// ══════════════════════════════════════════════════════════════════
//  BuyInEditor — who is in a side game, and for how much
// ══════════════════════════════════════════════════════════════════
//
//  Skins, CTP and the market are separate games with separate money, so a
//  player is in one, some, all or none. The director tags that here;
//  everything else follows from it — who can win a hole, who appears on the
//  leaderboard, who gets shares, and what the pot is worth.
//
//  THE THREE STATES OF `ids`, which is the whole design:
//
//    null   — never configured. EVERYBODY is in. This is what every
//             tournament played before buy-ins existed looks like, and it is
//             why the feature is inert until a director opens this panel.
//    [...]  — exactly these players.
//    []     — nobody. A real, sayable answer, and the reason a missing field
//             and an empty array must not be collapsed into each other.
//
//  The first toggle materialises `null` into the full roster minus one, so
//  turning a single player off can never be read back as "the list is empty,
//  therefore everybody is in" — which would silently put the player straight
//  back into the game they were just removed from.
//
//  Ported from Bourbon Cup's components/BuyIns.jsx; the colors are WBC's and
//  the roster rows carry no team dot, because WBC is an individual event.

import { useState } from "react";
import { K, FONT, ALPHA, FS, R, ON_ACC } from "../theme";

export function BuyInEditor({ players, amount, ids, onChange }) {
  // Local while typing; committed on blur, like the pot field. Seeded from
  // the live value each time the panel mounts, which is each time it opens.
  const [amt, setAmt] = useState(amount ? String(amount) : "");

  const list = ids ?? players.map(p => p.id);
  const inSet = new Set(list);

  const toggle = (pid) => {
    const next = inSet.has(pid) ? list.filter(x => x !== pid) : [...list, pid];
    onChange({ ids: next });
  };

  const commitAmount = () => {
    const v = parseFloat(amt);
    onChange({ amount: Number.isFinite(v) && v > 0 ? v : 0 });
  };

  const btn = (on) => ({
    fontSize: FS.label, fontWeight: 800, letterSpacing: 0.5,
    padding: "4px 10px", borderRadius: R.sm, cursor: "pointer",
    border: `1px solid ${on ? "transparent" : K.bdr}`,
    background: on ? K.acc : "transparent",
    color: on ? ON_ACC : K.t3,
    fontFamily: FONT, flexShrink: 0,
  });

  return (
    <div style={{ background: K.card, border: `1px solid ${K.acc}${ALPHA.line}`, borderRadius: R.sm, marginBottom: 8, overflow: "hidden", fontFamily: FONT }}>

      {/* What one seat costs. Zero means the pot is not being counted from
          buy-ins at all, and whatever was typed into the pot stands. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: `1px solid ${K.bdr}` }}>
        <span style={{ fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>BUY-IN</span>
        <span style={{ fontSize: FS.body, fontWeight: 800, color: K.gold }}>$</span>
        <input
          type="number" inputMode="decimal" value={amt} placeholder="0"
          onChange={e => setAmt(e.target.value)}
          onBlur={commitAmount}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
          style={{
            width: 70, fontSize: FS.body, fontWeight: 800, color: K.gold,
            background: "transparent", border: "none", borderBottom: `1px solid ${K.acc}`,
            outline: "none", fontFamily: FONT,
          }}
        />
        <span style={{ flex: 1, fontSize: FS.small, color: K.t3, textAlign: "right" }}>
          {list.length} in · ${(list.length * (parseFloat(amt) || 0)).toFixed(2)}
        </span>
      </div>

      {/* Bulk, because tagging sixteen people one at a time is the actual
          job on a Friday morning. */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
        <div onClick={() => onChange({ ids: players.map(p => p.id) })} style={btn(false)}>ALL IN</div>
        <div onClick={() => onChange({ ids: [] })} style={btn(false)}>NONE</div>
      </div>

      {players.map(p => {
        const on = inSet.has(p.id);
        return (
          <div
            key={p.id}
            onClick={() => toggle(p.id)}
            style={{
              display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
              padding: "7px 12px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}`,
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 600, color: on ? K.t1 : K.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.name}
            </span>
            <div style={btn(on)}>{on ? "IN" : "OUT"}</div>
          </div>
        );
      })}
    </div>
  );
}
