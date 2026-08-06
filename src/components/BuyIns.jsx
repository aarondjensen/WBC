// ══════════════════════════════════════════════════════════════════
//  BuyInTracker — one sheet for every buy-in, not one panel per game
// ══════════════════════════════════════════════════════════════════
//
//  Five buy-ins run at this tournament: skins, closest-to-the-pin, low net,
//  the market, and the market's halfway rebuy. Everybody takes the first four;
//  about half take the fifth.
//
//  Tracking that one game at a time meant opening a panel, scrolling a roster,
//  closing it, opening the next — sixteen names times five games, with the
//  running total living nowhere but the director's head. This is the same
//  information as a table: a row per player, a column per buy-in, and the two
//  numbers that actually matter — what this man owes, and what should be in
//  the envelope when everybody has paid.
//
//  The card carries no instructions. Every affordance in it is a tap on the
//  thing it changes — a heading, a name, a cell — and a director who has used
//  it once does not need the sentence again every time they open it. The
//  column marked `auto` says so in the heading itself.
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
//  A game marked `derived` has no toggles at all. Its column is filled in
//  from what players have already done rather than from anything the director
//  tags — the market rebuy is incurred by placing halfway shares, not paid up
//  front — so the cells are a readout and the row still bills for them.
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
//  — rather than one game at a time, because a row toggle changes every game
//  at once and five Firestore writes for one tap is five chances for half of
//  them to land.

import { useState } from "react";
import { K, FONT, ALPHA, FS, R, ON_ACC } from "../theme";
import { buyInSheet, toggleIn, togglePaid } from "../lib/sideGames";

const money = (n) => `$${(n || 0).toFixed(2)}`;

// ── BuyInPrices ──
// What a seat in each game costs. It lives in the ADMIN console, not on the
// Betting tab, because a price is event SETUP — decided once in a car park
// before anybody tees off — and the Betting tab's job during the week is the
// opposite: who has paid, and what the pot is worth. Mixing the two put a
// text field a mis-tap away from a roster somebody was scrolling.
//
// Each row carries its own count and subtotal so the arithmetic is visible at
// the point the number is typed.
export function BuyInPrices({ players, games, onChange }) {
  // Local while typing and committed on blur, so a half-typed "2" on the way
  // to "20" never briefly halves the pot on everybody's phone.
  const [prices, setPrices] = useState(() =>
    Object.fromEntries(games.map(g => [g.key, g.amount ? String(g.amount) : ""])));

  const sheet = buyInSheet({ players, games });

  const commitPrice = (g) => {
    const v = parseFloat(prices[g.key]);
    onChange({ [g.key]: { amount: Number.isFinite(v) && v > 0 ? v : 0 } });
  };

  return (
    <div style={{ fontFamily: FONT }}>
      {games.map(g => (
        <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: FS.body, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
          <span style={{ fontSize: FS.body, fontWeight: 800, color: K.gold }}>$</span>
          <input
            type="number" inputMode="decimal" value={prices[g.key] ?? ""} placeholder="0"
            onChange={e => setPrices(p => ({ ...p, [g.key]: e.target.value }))}
            onBlur={() => commitPrice(g)}
            onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
            style={{
              width: 62, fontSize: FS.lead, fontWeight: 800, color: K.gold, textAlign: "right",
              background: "transparent", border: "none", borderBottom: `1px solid ${K.acc}`,
              outline: "none", fontFamily: FONT, padding: 0,
            }}
          />
          <span style={{ width: 104, textAlign: "right", fontSize: FS.small, color: K.t3, flexShrink: 0 }}>
            {sheet.totals[g.key].count} in · {money(sheet.totals[g.key].amount)}
          </span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12 }}>
        <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>TOTAL OWED</span>
        <span style={{ fontSize: FS.lead, fontWeight: 800, color: K.gold }}>{money(sheet.grand)}</span>
      </div>
      {/* Owed and collected are the same number until somebody enters the
          halfway market, which is the one buy-in a man takes on hours before
          he can hand anybody cash. */}
      {sheet.outstanding > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.warn, letterSpacing: 0.8 }}>STILL TO COLLECT</span>
          <span style={{ fontSize: FS.body, fontWeight: 800, color: K.warn }}>{money(sheet.outstanding)}</span>
        </div>
      )}
      <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5, marginTop: 10 }}>
        Who is in each game is tagged on the Betting tab, under any pot.
      </div>
    </div>
  );
}

export function BuyInTracker({ players, games, onChange }) {
  const sheet = buyInSheet({ players, games });
  const rowFor = (pid) => sheet.rows.find(r => r.pid === pid);

  // A cell means one of two things depending on the column.
  //
  // On a tagged game it means "is he in", and tapping puts him in or takes
  // him out. On a DERIVED game the director cannot change that — the market
  // rebuy is entered by placing halfway shares from a tee box — so the tap
  // answers the only question left: has he handed the money over. A man who
  // has not entered has nothing to pay, so his cell does nothing.
  const toggleCell = (g, pid) => {
    if (!g.derived) return onChange({ [g.key]: { in: toggleIn(g.ids, players, pid) } });
    if (!g.paid || !rowFor(pid)?.games[g.key]) return;
    onChange({ [g.key]: { paid: togglePaid(g.paid, pid) } });
  };

  const toggleColumn = (g) => {
    if (!g.derived) return onChange({ [g.key]: { in: sheet.totals[g.key].all ? [] : players.map(p => p.id) } });
    // "Everybody has settled up" in one tap, over the men who are actually in.
    if (!g.paid) return;
    const inPids = sheet.rows.filter(r => r.games[g.key]).map(r => r.pid);
    onChange({ [g.key]: { paid: sheet.totals[g.key].allPaid ? [] : inPids } });
  };

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
    // Derived columns are excluded from BOTH halves. Dropping a player must
    // not silently delete the shares they placed, and adding one must not
    // invent a rebuy they never took — a derived column only ever changes
    // because of what its own game recorded.
    const tagged = games.filter(g => !g.derived);
    const anyIn = tagged.some(g => row.games[g.key]);
    const patch = {};
    tagged.forEach(g => {
      const list = g.ids ?? players.map(p => p.id);
      patch[g.key] = { in: anyIn ? list.filter(x => x !== pid) : [...new Set([...list, pid])] };
    });
    onChange(patch);
  };

  // Five buy-ins now — skins, CTP, low net, the market and its rebuy — so the
  // cells give up what the names need. A tick in a 32px box is still a
  // comfortable tap target; a truncated roster is not readable at all.
  const CELL = games.length > 4 ? 32 : 38;
  const OWES = games.length > 4 ? 46 : 52;
  const cols = `minmax(0, 1fr) repeat(${games.length}, ${CELL}px) ${OWES}px`;

  return (
    <div style={{ background: K.card, border: `1px solid ${K.acc}${ALPHA.line}`, borderRadius: R.sm, marginBottom: 8, overflow: "hidden", fontFamily: FONT }}>

      {/* ── The sheet ── */}
      <div style={{ padding: "8px 12px 0", fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>
        WHO IS IN
      </div>

      {/* Column headings double as the all-in / all-out toggle. */}
      <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "end", gap: 2, padding: "0 10px 6px", borderBottom: `1px solid ${K.bdr}` }}>
        <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.5 }}>PLAYER</span>
        {games.map(g => {
          const t = sheet.totals[g.key];
          return (
            <div key={g.key} onClick={() => toggleColumn(g)}
              style={{ textAlign: "center", cursor: g.derived ? "default" : "pointer", padding: "4px 0", borderRadius: R.xs, background: !g.derived && t.all ? `${K.acc}${ALPHA.wash}` : "transparent" }}>
              <div style={{ fontSize: FS.micro, fontWeight: 800, color: g.derived ? K.t2 : t.all ? K.acc : K.t2, letterSpacing: 0.3 }}>{g.short}</div>
              {/* A payment column counts what is PAID of what is in — the
                  number the director is chasing — rather than repeating the
                  count the cells already show. */}
              <div style={{ fontSize: FS.micro, color: g.paid ? (t.allPaid ? K.acc : K.warn) : g.derived ? K.acc : K.t3 }}>
                {g.paid ? `${t.paidCount}/${t.count}` : g.derived ? "auto" : t.count}
              </div>
            </div>
          );
        })}
        <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textAlign: "right", letterSpacing: 0.5 }}>OWES</span>
      </div>

      {sheet.rows.map(row => (
        <div key={row.pid} style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 2, padding: "3px 10px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
          <span onClick={() => toggleRow(row.pid)}
            style={{ minWidth: 0, fontSize: FS.small, fontWeight: 600, cursor: "pointer", color: row.owes > 0 ? K.t1 : K.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.name}
            {/* Withdrawals stay ON the sheet — they paid — and are marked so
                the director is not left wondering why a man who went home on
                Saturday is still being billed. */}
            {row.wd && <span style={{ color: K.t3, fontWeight: 700 }}> · WD</span>}
          </span>
          {games.map(g => {
            const on = row.games[g.key];
            const paid = row.paid[g.key];
            // Three states, and the middle one is the point: a man who has
            // entered the halfway market owes $25 from the moment he places
            // a share, but nobody has taken his money yet. He reads as an
            // UNFILLED tick in amber — in the game, still on the tab — and
            // the director fills it in when the cash arrives.
            const tappable = g.derived ? (!!g.paid && on) : true;
            const style = !on
              ? { background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3 }
              : paid
                ? { background: K.acc, border: "1px solid transparent", color: ON_ACC }
                : { background: "transparent", border: `1px solid ${K.warn}`, color: K.warn };
            return (
              <div key={g.key} onClick={() => toggleCell(g, row.pid)}
                title={on && !paid ? "In — not paid yet. Tap when they settle up." : undefined}
                style={{
                  height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: tappable ? "pointer" : "default", borderRadius: R.xs,
                  fontSize: FS.small, fontWeight: 800, ...style,
                }}>
                {on ? "✓" : "–"}
              </div>
            );
          })}
          <span style={{ textAlign: "right", fontSize: FS.small, fontWeight: 700, color: row.unpaid > 0 ? K.warn : row.owes > 0 ? K.gold : K.t3 }}>
            {row.owes > 0 ? `$${row.owes}` : "—"}
          </span>
        </div>
      ))}

      {/* ── The envelope ── */}
      {/* The one number the director is actually counting cash against. */}
      <div style={{ padding: "10px 12px", background: `${K.acc}${ALPHA.wash}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>TOTAL OWED</span>
          <span style={{ fontSize: FS.lead, fontWeight: 800, color: K.gold }}>{money(sheet.grand)}</span>
        </div>
        {/* Only once something is actually outstanding — which is only ever
            the halfway rebuy, and only until the director has been round. */}
        {sheet.outstanding > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.warn, letterSpacing: 0.8 }}>STILL TO COLLECT</span>
            <span style={{ fontSize: FS.body, fontWeight: 800, color: K.warn }}>{money(sheet.outstanding)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
