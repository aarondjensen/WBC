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
//  numbers that actually matter — what this man STILL owes, and what is left
//  to collect from the room.
//
//  OWES IS WHAT IS LEFT TO COLLECT, not what he was billed. Marking a cell
//  paid takes that buy-in off his line and off the room's, so the column
//  counts down to nothing as the money comes in — which is the only reading
//  that matches what the director is doing while they tap. Billing him and
//  collecting from him are the same tap on the sheet only when the sheet
//  never moves; here it moves twice, and OWES answers the second tap.
//
//  The card carries no instructions. Every affordance in it is a tap on the
//  thing it changes — a heading, a name, a cell — and a director who has used
//  it once does not need the sentence again every time they open it. The
//  column marked `auto` says so in the heading itself.
//
//  ONE TICK IS OWING, TWO IS PAID. Tagging a man in and collecting from him
//  are days apart — the field is tagged in a car park on Friday and the money
//  comes in over the weekend — so a cell cycles out → in (✓, amber, he owes)
//  → paid (✓✓, filled) → out. See toggleCell.
//
//  MONEY GOES ON WITH A TAP AND COMES OFF WITH AN ANSWER. Every tap that
//  would erase a payment already recorded — a paid cell, a paid column, a
//  name with settled buy-ins behind it — asks first and says what it is about
//  to forget. Nothing else does: putting a man in, marking him paid and
//  taking a mis-typed name back out stay one tap, because a director going
//  down sixteen names with a thumb should not be stopped for a change they
//  can undo by tapping again. A cleared payment is the one thing on this
//  sheet nobody can see is missing.
//
//  Three ways in, in descending order of how often they get used:
//    • A COLUMN header runs that cycle over the whole buy-in. "Everybody is in
//      for skins" is one tap on the Friday, "they have all settled up" is one
//      more on the Sunday.
//    • A PLAYER NAME drops that player out of everything — the guy who only
//      came to drink — and puts them into everything if they are already out
//      of it all. See toggleRow for why it is not symmetrical.
//    • A CELL cycles one buy-in for one player.
//
//  A game marked `derived` cannot be tagged in or out. Its membership is
//  filled in from what players have already done — the market rebuy is
//  incurred by placing halfway shares, not tagged — so its cell only ever
//  answers the payment half, and the row still bills for it.
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
//  ADDING SOMEBODY WHO IS NOT PLAYING. The market is a bet on who wins, so it
//  is the one buy-in that needs no tee time: a man who is not in this year's
//  field can be in it. Those rows arrive tagged `outside` and are marked NOT
//  PLAYING on the sheet, and the whole of what that flag does is keep the word
//  "everybody" meaning the FIELD — a null list bills the tournament and not
//  him, a column heading tapped to all-in does not sweep him up, and a column
//  reads as full without him. He is in exactly what somebody tagged him into.
//  Tapping his name takes him back off the sheet, because for him "out of
//  everything" and "not here" are the same state.
//
//  `onChange` takes a PATCH SET — { skins: { in: [...] }, ctp: { in: [...] } }
//  — rather than one game at a time, because a row toggle changes every game
//  at once and five Firestore writes for one tap is five chances for half of
//  them to land.

import { useState } from "react";
import { K, FONT, ALPHA, FS, R, ON_ACC } from "../theme";
import { buyInSheet, toggleIn, togglePaid } from "../lib/sideGames";
import { Popup, ConfirmModal } from "./Popup";
import { useConfirm } from "../lib/useConfirm";

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
      {/* What every seat sold adds up to — the pot side of the sheet, which is
          the question a price screen is answering. What is still to come in
          belongs to the Betting tab's tracker and is repeated here only
          because a director setting prices asks it in the same breath. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 12 }}>
        <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>TOTAL BUY-INS</span>
        <span style={{ fontSize: FS.lead, fontWeight: 800, color: K.gold }}>{money(sheet.grand)}</span>
      </div>
      {sheet.outstanding > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.warn, letterSpacing: 0.8 }}>STILL TO COLLECT</span>
          <span style={{ fontSize: FS.body, fontWeight: 800, color: K.warn }}>{money(sheet.outstanding)}</span>
        </div>
      )}
    </div>
  );
}

// `outsideCandidates` / `onAddOutside` are the pair that lets somebody who is
// not playing onto the sheet — see the ADDING SOMEBODY WHO IS NOT PLAYING note
// in the header. Both absent, and the sheet is exactly the field's.
export function BuyInTracker({ players, games, onChange, outsideCandidates = [], onAddOutside }) {
  const sheet = buyInSheet({ players, games });
  const rowFor = (pid) => sheet.rows.find(r => r.pid === pid);
  const { confirm, confirmModal } = useConfirm();
  const [adding, setAdding] = useState(false);
  const [find, setFind] = useState("");

  // Who "everybody" is for a given column. THE FIELD, plus anybody from
  // outside it who is already in that game — a man who is not playing is
  // never swept into a buy-in by a tap that means "the field is in for
  // skins", and is never dropped from the one he was deliberately added to.
  const everybodyIn = (g) =>
    players.filter(p => !p.outside || rowFor(p.id)?.games[g.key]).map(p => p.id);
  // The field alone, for materialising a never-configured `null` list. A game
  // nobody has tagged means everybody PLAYING is in it, so turning one man off
  // must leave the field minus one behind — not the field plus whoever is on
  // the sheet to bet without playing.
  const field = players.filter(p => !p.outside);
  // Candidates, minus anybody already on the sheet, narrowed by what has been
  // typed. Matching on the raw string rather than on parts: a director looking
  // for "Ferg" is looking at a list of names, not querying a database.
  const onSheet = new Set(players.map(p => p.id));
  const matches = outsideCandidates
    .filter(c => c?.id && !onSheet.has(c.id))
    .filter(c => String(c.name || "").toLowerCase().includes(find.trim().toLowerCase()));

  // ── Cash already handed over does not come off on one tap ──
  //
  // Everything else on this sheet is a cheap tap: putting a man in, marking
  // him paid, taking a name back out that went in by mistake. All of them are
  // undone by tapping again, and a director scrolling sixteen names with a
  // thumb should not be interrupted for any of that.
  //
  // Un-marking a PAYMENT is not in that class. It is a record of money that
  // physically changed hands, the director is the only person who knows it
  // did, and a mis-tap that erases it reads exactly like a man who never paid
  // — so it gets found on Sunday, by asking him for money he already gave.
  // That asymmetry is the whole rule: this asks before money comes OFF the
  // sheet, never before it goes on.
  const askUnpaid = (title, message, confirmLabel) =>
    confirm({ title, message, confirmLabel, cancelLabel: "Leave it", destructive: true });

  // ── One cell, three states, in the order the money moves ──
  //
  //   –    out. He is not in this game and owes nothing.
  //   ✓    IN, and owing. One tick: he has opted in, the pot counts him, the
  //        cash has not arrived.
  //   ✓✓   PAID. Two ticks: he settled up.
  //
  // Tapping cycles through them and round again, so the third tap is the undo
  // for a name entered by mistake. Splitting in from paid is the whole point:
  // a director tags the field on Friday morning and collects over the next
  // three days, and until now those two facts had one box between them.
  //
  // A DERIVED game — the market rebuy — is entered by placing halfway shares
  // from a tee box, so the director cannot put a man in or take him out. Its
  // cell only ever answers the second question, and a man who never entered
  // has nothing to pay.
  //
  // The tap that leaves the PAID state asks first — see askUnpaid.
  const toggleCell = async (g, pid) => {
    const row = rowFor(pid);
    const isIn = row?.games[g.key];
    if (g.derived) {
      if (!g.paid || !isIn) return;
      if (row.paid[g.key] && !await askUnpaid(
        "Mark unpaid?",
        `${row.name} is down as having paid ${money(g.amount)} for ${g.label}. This puts it back on what they owe.`,
        "Mark unpaid")) return;
      return onChange({ [g.key]: { paid: togglePaid(g.paid, pid) } });
    }
    if (!isIn) return onChange({ [g.key]: { in: toggleIn(g.ids, field, pid) } });
    if (!row.paid[g.key]) return onChange({ [g.key]: { paid: togglePaid(g.paid, pid) } });
    // Paid → out, which is two undos in one tap: it clears the payment AND
    // takes him out of the game. Both are said out loud before it happens.
    if (!await askUnpaid(
      "Take them out?",
      `${row.name} has paid ${money(g.amount)} for ${g.label}. This takes them out of it and clears that payment.`,
      "Take out")) return;
    // Both lists, or he leaves a paid flag behind that would mark him settled
    // the moment anybody put him back in.
    onChange({ [g.key]: { in: toggleIn(g.ids, field, pid), paid: (g.paid || []).filter(x => x !== pid) } });
  };

  // The heading runs the same cycle over the whole column: everybody in,
  // then everybody paid, then nobody. "The field is in for skins" is one tap
  // on a Friday and "they have all settled up" is one more on the Sunday.
  //
  // Which makes the tap AFTER that one the most expensive tap on the sheet —
  // it clears a column the director has just spent a weekend filling in — so
  // it asks, and says how much it is about to forget.
  const toggleColumn = async (g) => {
    const t = sheet.totals[g.key];
    const inPids = sheet.rows.filter(r => r.games[g.key]).map(r => r.pid);
    if (g.derived) {
      if (!g.paid) return;
      if (t.allPaid && !await askUnpaid(
        "Mark the whole column unpaid?",
        `All ${t.count} in ${g.label} are down as paid (${money(t.paidAmount)}). This puts every one of them back on the sheet.`,
        "Mark unpaid")) return;
      return onChange({ [g.key]: { paid: t.allPaid ? [] : inPids } });
    }
    if (!t.all) return onChange({ [g.key]: { in: everybodyIn(g) } });
    if (!t.allPaid) return onChange({ [g.key]: { paid: inPids } });
    if (!await askUnpaid(
      "Clear the whole column?",
      `Everybody in ${g.label} is down as paid (${money(t.paidAmount)}). This takes the field out of it and clears every one of those payments.`,
      "Clear column")) return;
    onChange({ [g.key]: { in: [], paid: [] } });
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
  const toggleRow = async (pid) => {
    const row = rowFor(pid);
    // Derived columns are excluded from BOTH halves. Dropping a player must
    // not silently delete the shares they placed, and adding one must not
    // invent a rebuy they never took — a derived column only ever changes
    // because of what its own game recorded.
    const tagged = games.filter(g => !g.derived);
    const anyIn = tagged.some(g => row.games[g.key]);
    // Dropping a man who has settled up is the same erasure as un-ticking his
    // cells one at a time, done by one tap on a name — which is the easiest
    // mis-tap on the sheet, since the name is the widest thing in the row.
    const settled = tagged.filter(g => row.paid[g.key]);
    const paidSum = settled.reduce((sum, g) => sum + (g.amount || 0), 0);
    if (anyIn && settled.length > 0 && !await askUnpaid(
      "Take them out of everything?",
      `${row.name} has paid ${money(paidSum)} across ${settled.length} ${settled.length === 1 ? "buy-in" : "buy-ins"}. Taking them out clears those payments too.`,
      "Take out")) return;
    const patch = {};
    tagged.forEach(g => {
      const list = g.ids ?? field.map(p => p.id);
      // Dropping clears his paid flags with him, for the same reason the cell
      // does: a flag left behind would mark him settled the moment anybody put
      // him back in. Adding never touches them — being in is not being paid.
      patch[g.key] = anyIn
        ? { in: list.filter(x => x !== pid), paid: (g.paid || []).filter(x => x !== pid) }
        : { in: [...new Set([...list, pid])] };
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
              {/* Paid of in — the number the director is chasing — rather
                  than repeating the count the cells already show. */}
              <div style={{ fontSize: FS.micro, color: g.paid ? (t.allPaid && t.count > 0 ? K.acc : K.warn) : K.t3 }}>
                {g.paid ? `${t.paidCount}/${t.count}` : t.count}
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
            {/* And a man who is not playing at all is marked for the opposite
                reason: so a row of dashes across four buy-ins reads as "he is
                only in the market", which is the whole of what he signed up
                for, rather than as a roster the director forgot to tag. */}
            {row.outside && <span style={{ color: K.t3, fontWeight: 700 }}> · NOT PLAYING</span>}
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
                title={on && !paid ? "In — owes. Tap again when they settle up." : undefined}
                style={{
                  height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: tappable ? "pointer" : "default", borderRadius: R.xs,
                  // The second tick has to fit the same cell as the first, and
                  // a 32px column is not wide enough for two at full size.
                  fontSize: paid ? FS.micro : FS.small, fontWeight: 800,
                  letterSpacing: paid ? -1 : 0, ...style,
                }}>
                {!on ? "–" : paid ? "✓✓" : "✓"}
              </div>
            );
          })}
          {/* What is LEFT to collect from this man. A tick that fills in is
              money in the director's hand, so it comes off here on the same
              tap — a row that still read $80 after he had settled up was the
              sheet disagreeing with the cells beside it.

              Settled reads ✓, not a dash: he was in and he has paid, which is
              a different answer from the man who was never in anything. */}
          <span style={{ textAlign: "right", fontSize: FS.small, fontWeight: 700, color: row.unpaid > 0 ? K.warn : row.owes > 0 ? K.acc : K.t3 }}>
            {row.unpaid > 0 ? `$${row.unpaid}` : row.owes > 0 ? "✓" : "—"}
          </span>
        </div>
      ))}

      {/* ── Somebody who is not playing ──
          One line under the roster, in the sheet's own quiet grey, because it
          is used twice a year and a button styled like an action would sit
          above sixteen names competing with them for the thumb. */}
      {onAddOutside && (
        <div onClick={() => { setAdding(true); setFind(""); }}
          style={{ padding: "7px 12px", fontSize: FS.label, fontWeight: 700, color: K.t3, cursor: "pointer", letterSpacing: 0.3, borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
          + Add someone who is not playing
        </div>
      )}

      {adding && (
        <Popup onClose={() => setAdding(false)} maxWidth={340} padding={0} portal innerStyle={{ background: K.card }} zIndex={3200}>
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${K.bdr}` }}>
            <div style={{ fontSize: FS.body, fontWeight: 800, color: K.t1 }}>Not playing this year</div>
            {/* What they are being added TO, said before the tap rather than
                discovered afterwards from a row of dashes. */}
            <div style={{ fontSize: FS.label, color: K.t3, marginTop: 3, lineHeight: 1.5 }}>
              They go into the market and nothing else — betting on who wins
              needs no tee time.
            </div>
          </div>
          {/* The list is every year the tournament has ever had, so it is
              typed at rather than scrolled once it is longer than a screen. */}
          <div style={{ padding: "10px 12px 0" }}>
            <input
              value={find} onChange={e => setFind(e.target.value)} placeholder="Find a name" autoFocus
              style={{ width: "100%", padding: "8px 10px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, fontFamily: FONT, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "8px 0 12px" }}>
            {matches.length === 0 ? (
              <div style={{ padding: "10px 16px", fontSize: FS.small, color: K.t3, lineHeight: 1.5 }}>
                {outsideCandidates.length === 0
                  ? "Everybody on record is already on this year's roster."
                  : "Nobody by that name."}
              </div>
            ) : matches.map(c => (
              <div key={c.id} onClick={() => { onAddOutside(c); setAdding(false); }}
                style={{ padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  {c.note && <span style={{ display: "block", fontSize: FS.micro, color: K.t3, marginTop: 1 }}>{c.note}</span>}
                </span>
              </div>
            ))}
          </div>
        </Popup>
      )}

      {/* ── The envelope ── */}
      {/* The headline is the sum of the OWES column, for the same reason the
          column changed: the director is counting cash they have not been
          handed yet. What is already in the envelope goes underneath, against
          the full sheet, so the pot is still readable at a glance. */}
      <div style={{ padding: "10px 12px", background: `${K.acc}${ALPHA.wash}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>STILL TO COLLECT</span>
          <span style={{ fontSize: FS.lead, fontWeight: 800, color: sheet.outstanding > 0 ? K.warn : K.acc }}>{money(sheet.outstanding)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <span style={{ flex: 1, fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 0.8 }}>COLLECTED</span>
          <span style={{ fontSize: FS.body, fontWeight: 800, color: K.t3 }}>
            {money(sheet.grand - sheet.outstanding)} of {money(sheet.grand)}
          </span>
        </div>
      </div>

      {/* The sheet's own confirm host. It lives in this card rather than on
          the Betting tab because every tap it guards is in here, and a panel
          that can lose a weekend's collecting should carry its own brakes
          wherever somebody drops it. */}
      <ConfirmModal modal={confirmModal} />
    </div>
  );
}
