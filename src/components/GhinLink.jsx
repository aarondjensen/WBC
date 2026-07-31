// ══════════════════════════════════════════════════════════════════
//  GhinLink — bind a player to their GHIN identity and sync the index.
// ══════════════════════════════════════════════════════════════════
//
//  Exports:
//    • GhinBadge      — a small "GHIN" wordmark for labelling a handicap
//                       column or marking a GHIN-sourced value.
//    • GhinLinkButton — a compact chip in each player row ("+ GHIN" /
//                       "GHIN ✓") that opens a popup owning the whole
//                       workflow: search → pick → confirm → link, plus
//                       re-sync / unlink when already linked.
//    • GhinSyncButton — director batch: refresh every linked player at once.
//
//  Ported from Bourbon Cup, restyled onto WBC's K palette and its Popup.
//
//  Why the popup portals
//  ─────────────────────
//  The admin player row uses `transform`. A transformed ancestor becomes the
//  containing block for `position: fixed`, which traps and clips any modal
//  rendered inline — so this passes `portal` and the popup lands on <body>.
//  Focus is also DEFERRED ~150ms rather than using autoFocus, so the portal
//  has laid out before the keyboard animates in; otherwise iOS scrolls the
//  field out of view. The field is 16px for the same reason it is in Bourbon
//  Cup: below that, iOS zooms on focus and does not zoom back out.
//
//  Permission: canEdit = director OR the signed-in player editing their own
//  row. Firestore rules enforce the real boundary.
//
//  Player-doc fields written: ghin_number, ghin_name, handicap_index,
//  ghin_rev_date, ghin_synced_at. db.upsert merges → unlink writes nulls.
//
//  NOTE: the linked index lands in `handicap_index`, which the WBC locks for
//  the tournament. Syncing after play has started retroactively changes net
//  scores for rounds already in the book — the same hazard AdminView's
//  handicap-edit guard exists for. Pass `confirm` to GhinSyncButton so the
//  director is told before a batch sync, and prefer linking during setup.

import { useState, useEffect, useRef } from "react";
import { K, ALPHA, ON_ACC } from "../theme";
import { Popup } from "./Popup";
import { searchGhinGolfers, syncGhinNumbers, parseGhinHI, fmtHI } from "../lib/ghin";

const BLUE = K.hcpBlue;
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const primaryBtn = (color, fg = ON_ACC) => ({
  width: "100%", boxSizing: "border-box", padding: "14px 14px", borderRadius: 12,
  border: "none", background: color, color: fg, fontSize: 16, fontWeight: 800,
  cursor: "pointer",
});
const ghostBtn = {
  width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12,
  border: `1px solid ${K.bdr}`, background: "transparent", color: K.t2,
  fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const muted = { fontSize: 13, color: K.t3, padding: "16px 4px", lineHeight: 1.5, textAlign: "center" };

// ── GHIN wordmark badge ─────────────────────────────────────────────
// Deliberately NOT the USGA app's raster logo: at column-header sizes a real
// logo renders as an illegible smudge, whereas this stays crisp at any size
// and matches the "+ GHIN" / "GHIN ✓" chips. `size`: "xs" | "sm".
export function GhinBadge({ size = "sm", title = "Handicap Index sourced from GHIN" }) {
  const s = size === "xs"
    ? { fontSize: 8, padding: "1px 3px", radius: 3, letter: 0.3 }
    : { fontSize: 10, padding: "2px 6px", radius: 4, letter: 0.5 };
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", boxSizing: "border-box",
      fontSize: s.fontSize, fontWeight: 800, letterSpacing: s.letter, lineHeight: 1,
      padding: s.padding, borderRadius: s.radius, whiteSpace: "nowrap",
      border: `1px solid ${BLUE}${ALPHA.line}`, background: BLUE + "1f", color: BLUE,
    }}>GHIN</span>
  );
}

// ── Per-player: compact chip → portaled popup ───────────────────────
export function GhinLinkButton({ player, user, onUpdatePlayer, notify }) {
  const canEdit = !!(user?.isDirector || user?.player_id === player?.id || user?.id === player?.id);
  const linked = !!player?.ghin_number;

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("view");     // "view" | "search"
  const [q, setQ] = useState("");
  const [state, setState] = useState("MI");      // optional 2-letter state filter
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  const inputRef = useRef(null);

  // Lock the background while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Deferred focus once the portal has laid out — see the header note.
  useEffect(() => {
    if (open && (mode === "search" || !linked)) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [open, mode, linked]);

  if (!canEdit && !linked) return null;

  const openPopup = () => {
    setOpen(true);
    setMode(linked ? "view" : "search");
    setQ(player?.name || "");
    setResults([]); setSearched(false); setPending(null);
  };
  const close = () => setOpen(false);

  const doSearch = async () => {
    if (!q.trim()) return;
    setBusy(true); setSearched(true); setPending(null);
    try { setResults(await searchGhinGolfers(q.trim(), state)); }
    catch (e) { notify?.(e.message || "GHIN search failed"); }
    finally { setBusy(false); }
  };

  const confirmLink = async () => {
    const g = pending; if (!g) return;
    const hi = parseGhinHI(g.handicap_index);
    await onUpdatePlayer({
      ...player,
      ghin_number: g.ghin_number,
      ghin_name: g.name || null,
      handicap_index: hi != null ? hi : player.handicap_index,
      ghin_rev_date: g.last_revision_date || null,
      ghin_synced_at: new Date().toISOString(),
    });
    notify?.(`Linked ${player.name} → GHIN ${g.ghin_number}`);
    close();
  };

  const resync = async () => {
    setBusy(true);
    try {
      const map = await syncGhinNumbers([player.ghin_number]);
      const res = map[String(player.ghin_number)];
      if (!res || res.error || res.handicap_index == null) {
        notify?.(`Sync failed: ${res?.error || "no data"}`); return;
      }
      const hi = parseGhinHI(res.handicap_index);
      const patch = {
        ...player,
        ghin_rev_date: res.last_revision_date || player.ghin_rev_date || null,
        ghin_synced_at: new Date().toISOString(),
      };
      if (parseFloat(player.handicap_index) === hi) {
        await onUpdatePlayer(patch);
        notify?.(`${player.name}: HI unchanged (${fmtHI(hi)})`);
      } else {
        await onUpdatePlayer({ ...patch, handicap_index: hi });
        notify?.(`${player.name}: HI ${fmtHI(player.handicap_index)} → ${fmtHI(hi)}`);
      }
      close();
    } catch (e) {
      notify?.(e.message || "Sync failed");
    } finally { setBusy(false); }
  };

  const unlink = async () => {
    await onUpdatePlayer({ ...player, ghin_number: null, ghin_name: null, ghin_rev_date: null, ghin_synced_at: null });
    notify?.(`Unlinked ${player.name} (kept HI ${fmtHI(player.handicap_index)})`);
    close();
  };

  const title = mode === "search" ? `Search GHIN — ${player.name}` : `${player.name} · GHIN`;

  const popup = (
    <Popup onClose={close} maxWidth={460} zIndex={4000} padding={0} portal background={K.card}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderBottom: `1px solid ${K.bdr}` }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, color: K.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        <button onClick={close} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, cursor: "pointer", border: `1px solid ${K.bdr}`, background: "transparent", color: K.t2, fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* ── Linked summary ── */}
      {mode === "view" && linked && (
        <div style={{ padding: 16 }}>
          <div style={{ background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: BLUE, letterSpacing: 0.5 }}>GHIN #{player.ghin_number}</div>
            {player.ghin_name && <div style={{ fontSize: 16, fontWeight: 700, color: K.t1, marginTop: 4 }}>{player.ghin_name}</div>}
            <div style={{ fontSize: 13, color: K.t2, marginTop: 8 }}>
              Handicap Index <b style={{ color: K.t1 }}>{fmtHI(player.handicap_index)}</b>
              {player.ghin_rev_date ? `  ·  revised ${player.ghin_rev_date}` : ""}
            </div>
            {player.ghin_synced_at && (
              <div style={{ fontSize: 11, color: K.t3, marginTop: 4 }}>
                Last synced {new Date(player.ghin_synced_at).toLocaleDateString()}
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button disabled={busy} onClick={resync} style={primaryBtn(K.acc)}>
              {busy ? "Syncing…" : "↻ Re-sync handicap now"}
            </button>
            <button onClick={() => { setMode("search"); setQ(player.name || ""); setResults([]); setSearched(false); setPending(null); }} style={ghostBtn}>
              Change / re-link golfer
            </button>
            <button onClick={unlink} style={{ ...ghostBtn, color: K.danger, borderColor: K.danger + ALPHA.line }}>
              Unlink (keep current HI)
            </button>
          </div>
        </div>
      )}

      {/* ── Search / link ── */}
      {(mode === "search" || !linked) && (
        <>
          <div style={{ padding: 14, borderBottom: `1px solid ${K.bdr}` }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: K.t3, letterSpacing: 1, marginBottom: 6 }}>
              GOLFER NAME OR GHIN #
            </label>
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doSearch(); }}
              placeholder="e.g. Aaron Jensen  or  1234567"
              autoCapitalize="words"
              autoCorrect="off"
              enterKeyHint="search"
              style={{ width: "100%", boxSizing: "border-box", padding: "14px 14px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: 12, color: K.t1, fontSize: 16, fontWeight: 600, outline: "none" }}
            />
            {/* Optional state filter — narrows a name search (a bare name can
                return golfers nationwide). Ignored for a GHIN #. */}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <select value={state} onChange={e => setState(e.target.value)} aria-label="State filter"
                style={{ flexShrink: 0, width: 108, boxSizing: "border-box", padding: "0 10px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: 12, color: K.t1, fontSize: 16, fontWeight: 600, outline: "none", cursor: "pointer" }}>
                <option value="">All states</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button disabled={busy} onClick={doSearch} style={{ ...primaryBtn(BLUE, "#04121b"), flex: 1 }}>
                {busy ? "Searching…" : "Search GHIN"}
              </button>
            </div>
          </div>

          <div style={{ padding: "10px 14px 16px" }}>
            {busy && <div style={muted}>Searching GHIN…</div>}
            {!busy && searched && results.length === 0 && (
              <div style={muted}>No golfers found.<br />Try a different spelling, add a last name, or enter the 7-digit GHIN number.</div>
            )}
            {!busy && !searched && (
              <div style={muted}>Type a name or GHIN number above, then tap Search.<br />The GHIN number is the surest match when golfers share a name.</div>
            )}

            {results.map(g => {
              const isSel = pending?.ghin_number === g.ghin_number;
              return (
                <button
                  key={g.ghin_number}
                  onClick={() => setPending(g)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    boxSizing: "border-box", textAlign: "left", cursor: "pointer",
                    padding: "13px 14px", marginBottom: 8, borderRadius: 12,
                    background: isSel ? BLUE + "22" : K.inp,
                    border: `1px solid ${isSel ? BLUE : K.bdr}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: K.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {g.name || "Unknown golfer"}
                    </div>
                    <div style={{ fontSize: 11, color: K.t3, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      #{g.ghin_number}{g.club_name ? ` · ${g.club_name}` : ""}{g.state ? ` · ${g.state}` : ""}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: BLUE }}>{fmtHI(parseGhinHI(g.handicap_index))}</div>
                    <div style={{ fontSize: 8, fontWeight: 700, color: K.t3, letterSpacing: 1 }}>INDEX</div>
                  </div>
                </button>
              );
            })}
          </div>

          {pending && (
            <div style={{ padding: 14, borderTop: `1px solid ${K.acc}${ALPHA.line}`, background: K.inp }}>
              <div style={{ fontSize: 13, color: K.t2, lineHeight: 1.45 }}>
                Link <b style={{ color: K.t1 }}>{player.name}</b> to <b style={{ color: K.t1 }}>{pending.name || `GHIN ${pending.ghin_number}`}</b>
                {pending.club_name ? ` (${pending.club_name})` : ""}.
                <br />Handicap Index {fmtHI(player.handicap_index)} → <b style={{ color: K.t1 }}>{fmtHI(parseGhinHI(pending.handicap_index))}</b>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button onClick={confirmLink} style={primaryBtn(K.acc)}>Confirm link</button>
                <button onClick={() => setPending(null)} style={{ ...ghostBtn, width: "auto", padding: "13px 18px" }}>Back</button>
              </div>
            </div>
          )}
        </>
      )}
    </Popup>
  );

  return (
    <>
      <button
        onClick={openPopup}
        title={linked ? `GHIN ${player.ghin_number}` : "Link a GHIN profile"}
        style={{
          flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3,
          boxSizing: "border-box", padding: "3px 7px", borderRadius: 5, cursor: "pointer",
          fontSize: 10, fontWeight: 800, letterSpacing: 0.2,
          border: `1px solid ${(linked ? K.acc : BLUE)}${ALPHA.line}`,
          background: (linked ? K.acc : BLUE) + "1f",
          color: linked ? K.acc : BLUE, whiteSpace: "nowrap",
        }}
      >
        {linked ? "GHIN ✓" : "+ GHIN"}
      </button>

      {open && popup}
    </>
  );
}

// ── Director batch sync ─────────────────────────────────────────────
// `confirm` (optional): a promise-based confirmation (useConfirm's) shown
// before syncing, so the director sees exactly what will happen. `compact`
// renders just an emoji button, for placing beside a column header.
//
// `started` (optional): when true, the confirmation warns that the tournament
// is already underway. WBC recalculates every round's net score from the
// CURRENT index, so a mid-tournament sync silently rewrites finished rounds —
// the same hazard the manual handicap edit is guarded against, and the reason
// this button asks rather than just doing it.
export function GhinSyncButton({ players, onUpdatePlayer, notify, confirm, compact, started }) {
  const [busy, setBusy] = useState(false);
  const linked = (players || []).filter(p => p?.ghin_number);

  const syncAll = async () => {
    if (!linked.length) { notify?.("No players linked to GHIN yet"); return; }
    if (confirm) {
      const n = linked.length;
      const ok = await confirm({
        title: "Re-sync handicaps from GHIN",
        message:
          `This pulls the current Handicap Index for all ${n} GHIN-linked player${n !== 1 ? "s" : ""} from the USGA GHIN database and overwrites their stored index.\n\n` +
          `• Manual (non-linked) players are untouched.` +
          (started
            ? `\n\n⚠ The tournament has already started. Net scores for rounds already played are recalculated from the current index, so this can reshuffle the leaderboard — including finalized rounds.`
            : ""),
        confirmLabel: `Re-sync ${n}`,
        destructive: !!started,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const map = await syncGhinNumbers(linked.map(p => p.ghin_number));
      let changed = 0, same = 0, failed = 0;
      for (const p of linked) {
        const res = map[String(p.ghin_number)];
        if (!res || res.error || res.handicap_index == null) { failed++; continue; }
        const hi = parseGhinHI(res.handicap_index);
        const patch = {
          ...p,
          ghin_rev_date: res.last_revision_date || p.ghin_rev_date || null,
          ghin_synced_at: new Date().toISOString(),
        };
        if (parseFloat(p.handicap_index) === hi) { await onUpdatePlayer(patch); same++; }
        else { await onUpdatePlayer({ ...patch, handicap_index: hi }); changed++; }
      }
      notify?.(`GHIN sync: ${changed} updated, ${same} unchanged${failed ? `, ${failed} failed` : ""}`);
    } catch (e) {
      notify?.(e.message || "GHIN sync failed");
    } finally { setBusy(false); }
  };

  if (compact) {
    return (
      <button
        disabled={busy || !linked.length}
        onClick={syncAll}
        title={linked.length ? `Re-sync all ${linked.length} GHIN-linked player${linked.length !== 1 ? "s" : ""}` : "No GHIN-linked players yet"}
        aria-label="Re-sync handicaps from GHIN for every linked player"
        style={{
          boxSizing: "border-box", display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 24, height: 24, padding: 0, borderRadius: 6, lineHeight: 1,
          cursor: linked.length ? "pointer" : "default",
          border: `1px solid ${K.acc}${ALPHA.line}`, background: K.acc + ALPHA.wash,
          fontSize: 11, flexShrink: 0, opacity: linked.length ? 1 : 0.4,
        }}
      >
        {busy ? "⏳" : "🔄"}
      </button>
    );
  }

  return (
    <button
      disabled={busy || !linked.length}
      onClick={syncAll}
      title="Sync every linked player's handicap from GHIN"
      style={{
        boxSizing: "border-box", maxWidth: "100%", padding: "8px 12px", borderRadius: 10,
        cursor: linked.length ? "pointer" : "default", whiteSpace: "nowrap",
        border: `1px solid ${K.acc}${ALPHA.line}`, background: K.acc + ALPHA.wash, color: K.acc,
        fontSize: 11, fontWeight: 700, flexShrink: 0, opacity: linked.length ? 1 : 0.5,
      }}
    >
      {busy ? "Syncing…" : `↻ Sync GHIN (${linked.length})`}
    </button>
  );
}
