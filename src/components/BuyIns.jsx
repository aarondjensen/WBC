// ══════════════════════════════════════════════════════════════════
//  BuyInTracker — one sheet for every buy-in, not one panel per game
// ══════════════════════════════════════════════════════════════════
//
//  Four buy-ins run at this tournament: skins, closest-to-the-pin, the market
//  and the market's halfway rebuy. Everybody takes the first three; about half
//  take the fourth.
//
//  Tracking that one game at a time meant opening a panel, scrolling a roster,
//  closing it, opening the next — sixteen names times four games, with the
//  running total living nowhere but the director's head. This is the same
//  information as a table: a row per player, a column per buy-in, and the two
//  numbers that actually matter — what this man owes, and what should be in
//  the envelope when everybody has paid.
//
//  Three ways in, in descending order of how often they get used:
//    • A COLUMN header toggles that whole buy-in. "Everybody is in for skins"
//      is one tap, and it is the first thing that happens every year.
//    • A PLAYER NAME drops that player out of everything — the guy who only
//      came to drink — and puts them into everything if they are already out
//      of it all. See toggleRow for why it is not symmetrical.
//    • A CELL toggles one buy-in for one player, which after the two above is
//      only the half-dozen rebuys.
//
//  THE THREE STATES OF `ids`, which is the whole design underneath:
//
//    null   — never configured. EVERYBODY is in. This is what every
//             tournament played before buy-ins existed looks like, and it is
//             why the feature is inert until a director opens this panel.
//    [...]  — exactly these players.
//    []     — nobody. A real, sayable answer, and the reason a missing field
//             and an empty array must not be collapsed into each other.
//
//  Every toggle here goes through lib/sideGames' toggleIn, which materialises
//  `null` into the full roster before removing anybody — so turning a single
//  player off can never be read back as "the list is empty, therefore
//  everybody is in", which would silently put them straight back in.
//
//  `onChange` takes a PATCH SET — { skins: { in: [...] }, ctp: { in: [...] } }
//  — rather than one game at a time, because a row toggle changes four games
//  at once and four Firestore writes for one tap is four chances for half of
//  them to land.

import { useState } from "react";
import { K, FONT, ALPHA, FS, R, ON_ACC } from "../theme";
import { buyInSheet, toggleIn } from "../lib/sideGames";

const money = (n) => `$${(n || 0).toFixed(2)}`;

export function BuyInTracker({ players, games, onChange }) {
  // Prices are local while typing and committed on blur, so a half-typed "2"
  // on the way to "20" never briefly halves the pot on everybody's phone.
  const [prices, setPrices] = useState(() =>
    Object.fromEntries(games.map(g => [g.key, g.amount ? String(g.amount) : ""])));

  const sheet = buyInSheet({ players, games });
  const rowFor = (pid) => sheet.rows.find(r => r.pid === pid);

  const commitPrice = (g) => {
    const v = parseFloat(prices[g.key]);
    onChange({ [g.key]: { amount: Number.isFinite(v) && v > 0 ? v : 0 } });
  };

  const toggleCell = (g, pid) => onChange({ [g.key]: { in: toggleIn(g.ids, players, pid) } });

  const toggleColumn = (g) =>
    onChange({ [g.key]: { in: sheet.totals[g.key].all ? [] : players.map(p => p.id) } });

  // A row toggle DROPS a player who is in anything, and only adds when they
  // are in nothing at all.
  //
  // The obvious alternative — all-on unless already all-on — is wrong here,
  // and wrong in the expensive direction. Everybody takes the first three
  // buy-ins and about half take the rebuy, so the ordinary row is in three of
  // four; under that rule tapping a name would quietly sign that man up for a
  // rebuy he never paid, which is a charge appearing on the sheet from a tap
  // that meant something else. This way the tap that costs money can only
  // happen from zero, where there is nothing to misread.
  const toggleRow = (pid) => {
    const row = rowFor(pid);
    const anyIn = games.some(g => row.games[g.key]);
    const patch = {};
    games.forEach(g => {
      const list = g.ids ?? players.map(p => p.id);
      patch[g.key] = { in: anyIn ? list.filter(x => x !== pid) : [...new Set([...list, pid])] };
    });
    onChange(patch);
  };

  const CELL = 38;
  const cols = `minmax(0, 1fr) repeat(${games.length}, ${CELL}px) 52px`;

  return (
    <div style={{ background: K.card, border: `1px solid ${K.acc}${ALPHA.line}`, borderRadius: R.sm, marginBottom: 8, overflow: "hidden", fontFamily: FONT }}>

      {/* ── What each seat costs ── */}
      {/* Set once a year, and set here rather than on the sheet itself: a
          price is a property of the GAME, and putting a text field in a column
          header on a phone is how you end up editing a number you meant to
          tap. Each row carries its own subtotal so the arithmetic is visible
          at the point the number is typed. */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${K.bdr}` }}>
        <div style={{ fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8, marginBottom: 8 }}>WHAT A SEAT COSTS</div>
        {games.map(g => (
          <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
            <span style={{ fontSize: FS.small, fontWeight: 800, color: K.gold }}>$</span>
            <input
              type="number" inputMode="decimal" value={prices[g.key] ?? ""} placeholder="0"
              onChange={e => setPrices(p => ({ ...p, [g.key]: e.target.value }))}
              onBlur={() => commitPrice(g)}
              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
              style={{
                width: 56, fontSize: FS.body, fontWeight: 800, color: K.gold, textAlign: "right",
                background: "transparent", border: "none", borderBottom: `1px solid ${K.acc}`,
                outline: "none", fontFamily: FONT, padding: 0,
              }}
            />
            <span style={{ width: 96, textAlign: "right", fontSize: FS.small, color: K.t3, flexShrink: 0 }}>
              {sheet.totals[g.key].count} in · {money(sheet.totals[g.key].amount)}
            </span>
          </div>
        ))}
      </div>

      {/* ── The sheet ── */}
      <div style={{ padding: "8px 12px 0", fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>
        WHO IS IN
      </div>
      <div style={{ fontSize: FS.label, color: K.t3, padding: "2px 12px 8px", lineHeight: 1.4 }}>
        Tap a heading for the whole column, a name to drop a player entirely.
      </div>

      {/* Column headings double as the all-in / all-out toggle. */}
      <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "end", gap: 2, padding: "0 12px 6px", borderBottom: `1px solid ${K.bdr}` }}>
        <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.5 }}>PLAYER</span>
        {games.map(g => {
          const t = sheet.totals[g.key];
          return (
            <div key={g.key} onClick={() => toggleColumn(g)}
              style={{ textAlign: "center", cursor: "pointer", padding: "4px 0", borderRadius: R.xs, background: t.all ? `${K.acc}${ALPHA.wash}` : "transparent" }}>
              <div style={{ fontSize: FS.micro, fontWeight: 800, color: t.all ? K.acc : K.t2, letterSpacing: 0.3 }}>{g.short}</div>
              <div style={{ fontSize: FS.micro, color: K.t3 }}>{t.count}</div>
            </div>
          );
        })}
        <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textAlign: "right", letterSpacing: 0.5 }}>OWES</span>
      </div>

      {sheet.rows.map(row => (
        <div key={row.pid} style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 2, padding: "3px 12px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
          <span onClick={() => toggleRow(row.pid)}
            style={{ minWidth: 0, fontSize: FS.small, fontWeight: 600, cursor: "pointer", color: row.owes > 0 ? K.t1 : K.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.name}
          </span>
          {games.map(g => {
            const on = row.games[g.key];
            return (
              <div key={g.key} onClick={() => toggleCell(g, row.pid)}
                style={{
                  height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", borderRadius: R.xs,
                  background: on ? K.acc : "transparent",
                  border: `1px solid ${on ? "transparent" : K.bdr}`,
                  color: on ? ON_ACC : K.t3, fontSize: FS.small, fontWeight: 800,
                }}>
                {on ? "✓" : "–"}
              </div>
            );
          })}
          <span style={{ textAlign: "right", fontSize: FS.small, fontWeight: 700, color: row.owes > 0 ? K.gold : K.t3 }}>
            {row.owes > 0 ? `$${row.owes}` : "—"}
          </span>
        </div>
      ))}

      {/* ── The envelope ── */}
      {/* The one number the director is actually counting cash against. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: `${K.acc}${ALPHA.wash}` }}>
        <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>TOTAL COLLECTED</span>
        <span style={{ fontSize: FS.lead, fontWeight: 800, color: K.gold }}>{money(sheet.grand)}</span>
      </div>
    </div>
  );
}
