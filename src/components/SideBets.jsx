// ══════════════════════════════════════════════════════════════════
//  SideBets — the wagers the app does not run
// ══════════════════════════════════════════════════════════════════
//
//  Ported from The Bourbon Cup, where it is the fourth tab of the same screen.
//
//  The other four Betting tabs are games the app SCORES — skins off the cards,
//  pins off the tags, low net off the same line the leaderboard ranks on, the
//  market off the books. This one is a ledger: two players agree something on
//  the first tee, one of them writes it down here, and the app settles nothing.
//  See src/lib/sideBets.js for why the terms are free text and why nothing
//  accepts or declines.
//
//  It is also the only tab here with no pot and no buy-in sheet. Nobody
//  collects a side bet, so there is nothing for the director to tick off — the
//  header counts what is on the table and what is yours, and the money moves
//  between two men without passing through this app at all.

import { useMemo, useState } from "react";
import { K, FONT, FS, R, ALPHA } from "../theme";
import { Popup } from "./Popup";
import { SegmentedToggle, Card, Btn } from "./ui";
import {
  sideBetError, sortSideBets, sideBetTotals, canDeleteSideBet, canEditSideBet,
  canRepeatSideBet, repeatSideBetSeed, inSideBet, settleState, hasSettled,
  settledBy, MAX_DETAIL,
} from "../lib/sideBets";

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;
// A total is whole money on a card whose header runs three numbers across a
// phone — the same call the skins pot makes, for the same reason.
const potMoney = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;

export function SideBets({ players, bets, user, authUid, onAddBet, onEditBet, onDeleteBet, onSettleBet, confirm }) {
  const [adding, setAdding] = useState(false);
  // The bet the sheet is open on, or null. The same sheet does both jobs —
  // an edit form that drifts from the add form is two places for the terms
  // of a bet to be described differently.
  const [editing, setEditing] = useState(null);
  // The terms a rematch starts from, or null. A repeat writes nothing on its
  // own — it opens the same sheet on the same terms as a NEW bet, because the
  // one everybody wants to run back is usually the one whose stakes are about
  // to move. See lib/sideBets repeatSideBetSeed.
  const [repeating, setRepeating] = useState(null);
  // ALL is the default and the left-hand option. The ledger is the field's,
  // not yours — and a player who has not made a bet yet would otherwise open
  // this tab to an empty list that looks like the feature is broken rather
  // than like they have nothing on.
  const [mineOnly, setMineOnly] = useState(false);
  // Which row is mid-write, and the last failure. A settlement mark is a
  // claim about money; if the write did not land, the row must not go on
  // showing it as though it did.
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);

  const myPid = user?.id || null;
  const all = sortSideBets(bets || []);
  const rows = mineOnly ? all.filter(b => inSideBet(b, myPid)) : all;
  // The header counts the WHOLE tournament regardless of the filter. Me/All
  // changes which rows you are reading, not what is true — unlike Gross/Net
  // on the skins tab, which changes who actually won what and so moves the
  // numbers above it. `YOURS` is already the answer to "how much of this is
  // mine", so a headline that shrank when you filtered would be saying the
  // same thing twice and contradicting itself the first time.
  const totals = sideBetTotals(all, myPid);
  // No toggle for somebody with no roster row — a guest's "Me" is empty by
  // construction, and an option that can only ever show nothing is worse than
  // no option.
  const canFilter = !!myPid;
  // The one side that has claimed it, when exactly one has. Null when both
  // have (it is settled and says so) or neither (there is nothing to name).
  const soleMarker = (b) => {
    const a = hasSettled(b, b.player_a), z = hasSettled(b, b.player_b);
    return a === z ? null : (a ? b.player_a : b.player_b);
  };
  const nameOf = (pid) => players.find(p => p.id === pid)?.name || "—";

  // Whether this reader can log a bet at all. A member can; somebody on the
  // guest tour, or a phone reading 2019 out of the Tournaments picker, cannot,
  // and gets told that rather than a button whose write the rules would refuse.
  const canAdd = !!authUid;

  // A "paid" mark is one tap and it is reversible, so it gets no confirm
  // dialog — a dialog on a tee box is friction on a claim you can withdraw by
  // tapping again. What it does need is a way to say the write failed, since
  // the whole point of the mark is that it was recorded.
  const settle = async (b) => {
    setBusyId(b.id);
    setErr(null);
    try {
      await onSettleBet(b, myPid);
    } catch (e) {
      console.error("side bet settle", e);
      setErr("Couldn't record that. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (b) => {
    const ok = await confirm({
      title: "Delete this bet?",
      message: `${nameOf(b.player_a)} vs ${nameOf(b.player_b)} · ${money(b.amount)}. This removes the record for everybody.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) await onDeleteBet(b);
  };

  return (
    <div>
      {/* The same three-column header the skins pot carries, because a side
          bet ledger has the same shape of question: what is out there, how
          many of them, and how much of it is mine. `YOURS` is EXPOSURE — what
          this player has riding either way — not a net, because nothing here
          knows who won. */}
      <div style={{ background: K.card, borderRadius: R.lg, marginBottom: 10, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS.label, color: K.t3, fontWeight: 700, letterSpacing: 1 }}>AT STAKE</div>
            <div style={{ fontSize: FS.title, fontWeight: 800, color: K.gold }}>{potMoney(totals.atStake)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div style={{ fontSize: FS.label, color: K.t3, fontWeight: 700, letterSpacing: 1 }}>BETS</div>
            <div style={{ fontSize: FS.title, fontWeight: 800, color: K.acc, overflow: "hidden", textOverflow: "ellipsis" }}>{totals.count}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
            <div style={{ fontSize: FS.label, color: K.t3, fontWeight: 700, letterSpacing: 1 }}>YOURS</div>
            <div style={{ fontSize: FS.title, fontWeight: 800, color: K.acc, overflow: "hidden", textOverflow: "ellipsis" }}>{potMoney(totals.mine)}</div>
          </div>
        </div>
      </div>

      {/* THE PRIMARY ACTION OF THE WHOLE TAB, so it gets the filled accent the
          app reserves for exactly that. As a strip under the totals it read as
          a footnote on them — which is the weight the other tabs give BUY-INS,
          and that is a disclosure rather than the thing you came here to do. */}
      {canAdd && (
        <Btn block size="lg" onClick={() => setAdding(true)} style={{ marginBottom: 10, letterSpacing: 0.8 }}>
          + ADD BET
        </Btn>
      )}

      {/* Whose bets you are reading. The same control the skins tab uses for
          Gross/Net, in the same place and at the same width, because it is
          the same kind of question — one list, two ways of looking at it. */}
      {canFilter && all.length > 0 && (
        <SegmentedToggle
          options={[[false, "All"], [true, "Me"]]}
          value={mineOnly}
          onChange={setMineOnly}
          style={{ marginBottom: 10, width: 160, marginLeft: "auto", marginRight: "auto" }}
        />
      )}

      {err && (
        <div style={{
          background: K.card, borderRadius: R.lg, border: `1px solid ${K.danger}${ALPHA.line}`,
          padding: "10px 14px", marginBottom: 10, fontSize: FS.small, color: K.danger,
          fontWeight: 600, lineHeight: 1.4,
        }}>
          {err}
        </div>
      )}

      {rows.length === 0 ? (
        <Card style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: FS.jumbo, marginBottom: 12, opacity: 0.4 }}>🤝</div>
          {/* Filtered-to-empty is a different answer from nothing-exists, and
              saying "No side bets yet" over a tournament with nine of them
              reads as the tab having lost them. */}
          <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>
            {mineOnly ? "None of these are yours" : "No side bets yet"}
          </div>
          <div style={{ fontSize: FS.small, color: K.t3, maxWidth: 280, margin: "0 auto", lineHeight: 1.5 }}>
            {mineOnly
              ? "You are not in any of the bets on the board. Switch to All to see everybody else's."
              : canAdd
                ? "Anything you have going with somebody else — a press, closest on 17, first to break 90."
                : "Bets players have going with each other show up here."}
          </div>
        </Card>
      ) : (
        <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
          {rows.map((b, i) => {
            const mine = inSideBet(b, myPid);
            const deletable = canDeleteSideBet(b, { uid: authUid, isDirector: user?.isDirector === true });
            // Wider than deletable, and it is the point of the pencil: the
            // other side of a bet may correct it even though they may not
            // erase it. See lib/sideBets canEditSideBet.
            const editable = canEditSideBet(b, { uid: authUid, pid: myPid, isDirector: user?.isDirector === true });
            const state = settleState(b, myPid);
            const done = state === "settled";
            return (
              <div key={b.id} style={{
                padding: "10px 14px",
                borderBottom: i < rows.length - 1 ? `1px solid ${K.bdr}${ALPHA.hair}` : "none",
                // A bet you are in gets a rail down its edge. Sixteen people
                // making bets all weekend is a long list to read your own name
                // out of one row at a time. A SETTLED bet keeps the rail but
                // loses the row: it is history, and history should not compete
                // with what is still owed.
                borderLeft: mine ? `3px solid ${done ? K.ok : K.acc}` : "3px solid transparent",
                opacity: done ? 0.6 : 1,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: FS.small, fontWeight: 700, color: K.t1 }}>{nameOf(b.player_a)}</span>
                    <span style={{ fontSize: FS.micro, color: K.t3, fontWeight: 700, letterSpacing: 0.5 }}>VS</span>
                    <span style={{ fontSize: FS.small, fontWeight: 700, color: K.t1 }}>{nameOf(b.player_b)}</span>
                  </div>
                  <span style={{ fontSize: FS.body, fontWeight: 800, color: K.gold, flexShrink: 0 }}>{money(b.amount)}</span>
                  {editable && (
                    <Btn
                      variant="ghost" size="sm"
                      aria-label="Edit this bet"
                      onClick={() => setEditing(b)}
                      style={{ flexShrink: 0, padding: "2px 0 2px 8px", color: K.t3, lineHeight: 1 }}
                    >
                      ✎
                    </Btn>
                  )}
                  {deletable && (
                    <Btn
                      variant="ghost" size="sm"
                      aria-label="Delete this bet"
                      onClick={() => remove(b)}
                      style={{ flexShrink: 0, padding: "2px 0 2px 6px", color: K.t3, lineHeight: 1 }}
                    >
                      ✕
                    </Btn>
                  )}
                </div>
                {/* The terms, which are the whole point of writing it down —
                    an amount and two names is the part everybody already
                    remembers. `pre-wrap` because somebody will type a list. */}
                {b.detail && (
                  <div style={{ fontSize: FS.small, color: K.t2, marginTop: 3, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                    {b.detail}
                  </div>
                )}
                <SettleStrip
                  state={state}
                  otherName={nameOf(b.player_a === myPid ? b.player_b : b.player_a)}
                  /* Only meaningful when exactly ONE side has claimed it —
                     which is the only time a name is what the row needs to
                     say. Both or neither, and the state itself says it. */
                  markerName={soleMarker(b) ? nameOf(soleMarker(b)) : null}
                  /* Acting on a bet needs to be IN it and signed in. A guest
                     reading last year's ledger is neither. */
                  canAct={mine && !!authUid}
                  onToggle={() => settle(b)}
                  /* Only on a finished bet, and only to the two men who
                     finished it. A live bet already exists — the button on
                     it would be a way to have the same wager twice. */
                  onRepeat={canRepeatSideBet(b, { uid: authUid, pid: myPid })
                    ? () => setRepeating(repeatSideBetSeed(b))
                    : null}
                  busy={busyId === b.id}
                />
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <BetSheet
          players={players}
          me={myPid}
          onCancel={() => setAdding(false)}
          onSave={async (form) => { await onAddBet(form); setAdding(false); }}
        />
      )}

      {repeating && (
        <BetSheet
          players={players}
          me={myPid}
          seed={repeating}
          onCancel={() => setRepeating(null)}
          onSave={async (form) => { await onAddBet(form); setRepeating(null); }}
        />
      )}

      {editing && (
        <BetSheet
          players={players}
          me={myPid}
          bet={editing}
          onCancel={() => setEditing(null)}
          onSave={async (form) => { await onEditBet(editing, form); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ── Where a bet has got to, and the one tap that moves it ─────────
// A bet is paid when BOTH players say so. One player marking it is a CLAIM;
// the other agreeing is the record. That is why this is two marks rather than
// a settled flag — a flag would let whoever tapped first close the bet on the
// other's behalf, and "I paid you" / "no you didn't" is the argument the
// whole feature exists to keep off the tee box.
//
// Only `confirm` gets a filled button, because it is the only state that asks
// the reader for something. Everything else is either a claim they already
// made or somebody else's business.
function SettleStrip({ state, otherName, markerName, canAct, onToggle, onRepeat, busy }) {
  // [ status text, button label, button variant ] per state. `settled` is the
  // one state a bystander also sees, so its button is gated on canAct below
  // rather than on the state — a reader with no stake must not be offered a
  // REOPEN whose write the rules would refuse.
  const [status, label, variant] = {
    open:     ["", "MARK PAID", "secondary"],
    confirm:  [`${markerName} SAYS PAID`, "CONFIRM", "primary"],
    waiting:  [`WAITING ON ${otherName}`, "UNDO", "ghost"],
    settled:  ["SETTLED ✓", "REOPEN", "ghost"],
    // Not your bet. You are told where it got to and asked for nothing —
    // including, when one side has claimed it, WHO claimed it, because that
    // is the half of the record an onlooker might be asked to remember.
    watching: [markerName ? `${markerName} SAYS PAID` : "", null, null],
  }[state] || ["", null, null];

  const showButton = canAct && !!label;
  // A settled bet's rematch. Offered beside REOPEN rather than instead of it,
  // and it is the LOUDER of the two on purpose: running it back is the thing
  // people do on the 18th green, and reopening a bet both men have called
  // paid is the rare correction.
  const showRepeat = canAct && typeof onRepeat === "function";
  if (!status && !showButton && !showRepeat) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
      <span style={{
        flex: 1, minWidth: 0, fontSize: FS.micro, fontWeight: 700, letterSpacing: 0.5,
        color: state === "settled" ? K.ok : K.t3,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {status}
      </span>
      {showRepeat && (
        <Btn
          variant="secondary" size="sm" onClick={onRepeat}
          style={{ flexShrink: 0, fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.6, padding: "4px 9px", borderRadius: R.sm }}
        >
          RUN IT BACK
        </Btn>
      )}
      {showButton && (
        <Btn
          variant={variant} size="sm" disabled={busy} onClick={onToggle}
          style={{ flexShrink: 0, fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.6, padding: "4px 9px", borderRadius: R.sm }}
        >
          {busy ? "…" : label}
        </Btn>
      )}
    </div>
  );
}

// ── The form ──────────────────────────────────────────────────────
// Side A defaults to whoever is logged in, because the overwhelming case is a
// player writing down their own bet. It stays a picker rather than a fixed
// label so the case that would otherwise dead-end still works: a director
// with no roster row, or a player writing down two other people's bet at the
// bar. Somebody has to be able to record it or it goes back on the napkin.
//
// ONE SHEET FOR ALL THREE JOBS — a new bet, a correction to one, and a
// rematch — with `bet` and `seed` deciding which. A separate form per door is
// a second place for the terms of a bet to be described, and they drift: the
// add form caps the detail and the edit form does not, and now a bet means
// something different depending on how it was written.
//
// `bet` is a document and patches it in place; `seed` is only starting text
// for a NEW one, which is what makes a repeat a fresh row rather than the old
// bet reopened. See lib/sideBets repeatSideBetSeed.
function BetSheet({ players, me, bet, seed, onCancel, onSave }) {
  // Alphabetical, not roster order. The roster is ordered by whenever the
  // director typed somebody in, which is an order nobody picking a name off a
  // list can predict — so finding a player meant reading all sixteen.
  // `localeCompare` rather than `<` so accented names sort where a person
  // would look for them.
  const byName = useMemo(
    () => [...players].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [players],
  );
  // What the fields open on: the bet being corrected, the bet being run back,
  // or an empty form with side A defaulted to whoever is holding the phone.
  // `amount` is a string throughout because the input is one — the number
  // only exists once buildSideBet or buildSideBetEdit makes it one.
  const start = bet
    ? { playerA: bet.player_a, playerB: bet.player_b, amount: String(bet.amount ?? ""), detail: String(bet.detail || "") }
    : seed || { playerA: me || "", playerB: "", amount: "", detail: "" };
  const [playerA, setPlayerA] = useState(start.playerA);
  const [playerB, setPlayerB] = useState(start.playerB);
  const [amount, setAmount] = useState(start.amount);
  const [detail, setDetail] = useState(start.detail);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  // buildSideBetEdit drops the paid marks when the money or the players move,
  // and a settled bet quietly reopening under somebody is the kind of surprise
  // that gets an app blamed for the argument. So the sheet says it first, and
  // only while it is actually true of what is currently typed in.
  const marksWillClear = !!bet && settledBy(bet).length > 0
    && (playerA !== bet.player_a || playerB !== bet.player_b
        || Number(amount) !== (Number(bet.amount) || 0));

  const submit = async () => {
    const problem = sideBetError({ playerA, playerB, amount });
    if (problem) { setErr(problem); return; }
    setSaving(true);
    setErr(null);
    try {
      await onSave({ playerA, playerB, amount, detail });
    } catch (e) {
      // A REFUSED WRITE HAS TO SAY SO. The save deliberately keeps the sheet
      // open on a failure so the typing is not lost — but without this the
      // only thing that happened on screen was the button flickering back
      // from "Saving…", which reads as a dead button and not as a refusal.
      // A ledger that appears to accept a bet it never recorded is the one
      // failure this screen must not have, and a silent no-op is a quieter
      // version of exactly that.
      console.error("side bet save", e);
      setErr("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const label = (t) => (
    <div style={{ fontSize: FS.label, color: K.t3, fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>{t}</div>
  );
  // FS.lead, and it is not a style choice — see the note under the scale in
  // theme.js. A form control below 16px makes iOS Safari zoom the page on
  // focus and never zoom back out, so tapping the player picker left the
  // whole app enlarged. Condense these with padding if they ever need to be
  // shorter, never by dropping a rung.
  const field = {
    width: "100%", boxSizing: "border-box", fontFamily: FONT, fontSize: FS.lead,
    padding: "9px 10px", borderRadius: R.sm, border: `1px solid ${K.bdr}`,
    background: K.inp, color: K.t1, outline: "none",
  };

  const picker = (value, onChange, exclude) => (
    <select value={value} onChange={e => { setErr(null); onChange(e.target.value); }} style={field}>
      <option value="">Select a player…</option>
      {byName.filter(p => p.id !== exclude).map(p => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );

  return (
    // viewportFit + align start, because this form has a text field on a phone
    // and the classic centred overlay sits under the keyboard.
    <Popup onClose={saving ? undefined : onCancel} maxWidth={400} padding={16} portal viewportFit align="start">
      <div>
        <div style={{ fontSize: FS.lead, fontWeight: 800, color: K.t1, marginBottom: 14 }}>
          {bet ? "Edit side bet" : seed ? "Run it back" : "New side bet"}
        </div>

        {/* A rematch opening on the old bet's terms looks enough like the old
            bet to be mistaken for it, and a player who thinks they are editing
            the settled row would be surprised twice: once by a second bet
            appearing, and once by the first one still saying SETTLED. */}
        {seed && (
          <div style={{ fontSize: FS.small, color: K.t2, marginTop: -8, marginBottom: 14, lineHeight: 1.4 }}>
            The same bet again, as a new one. Move the stakes if the rematch is for more.
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          {label("BETWEEN")}
          {picker(playerA, setPlayerA, playerB)}
        </div>
        <div style={{ marginBottom: 12 }}>
          {label("AND")}
          {picker(playerB, setPlayerB, playerA)}
        </div>

        <div style={{ marginBottom: 12 }}>
          {label("AMOUNT")}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: FS.lead, fontWeight: 800, color: K.gold }}>$</span>
            <input
              type="number" inputMode="decimal" value={amount} placeholder="0.00"
              onChange={e => { setErr(null); setAmount(e.target.value); }}
              style={{ ...field, fontWeight: 800, color: K.gold }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 4 }}>
          {label("DETAIL")}
          <textarea
            value={detail} rows={3} maxLength={MAX_DETAIL}
            placeholder="The terms — what has to happen, and who pays."
            onChange={e => setDetail(e.target.value)}
            style={{ ...field, resize: "vertical", lineHeight: 1.4 }}
          />
        </div>
        <div style={{ fontSize: FS.micro, color: K.t3, textAlign: "right", marginBottom: 12 }}>
          {detail.length}/{MAX_DETAIL}
        </div>

        {marksWillClear && (
          <div style={{ fontSize: FS.small, color: K.t2, marginBottom: 10, lineHeight: 1.4 }}>
            This changes what was agreed, so the paid marks come off — both sides say it again.
          </div>
        )}

        {err && (
          <div style={{ fontSize: FS.small, color: K.danger, marginBottom: 10, fontWeight: 600 }}>{err}</div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" block onClick={onCancel} disabled={saving}>Cancel</Btn>
          <Btn block onClick={submit} disabled={saving}>
            {saving ? "Saving…" : bet ? "Save bet" : "Add bet"}
          </Btn>
        </div>
      </div>
    </Popup>
  );
}

export default SideBets;
