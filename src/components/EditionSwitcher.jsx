// ══════════════════════════════════════════════════════════════════
//  EditionSwitcher — director modal to change the active year or
//  start a new one. Gated to the director at the call site.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup onto WBC's palette and its Popup/ConfirmModal.
// Switching an edition reloads the app (see lib/editions.js), so both the
// switch and the delete go through a confirmation first.
import { useState, useEffect } from "react";
import { K, ON_ACC, FS, R } from "../theme";
import { Btn } from "./ui";
import { Popup, ConfirmModal } from "./Popup";
import { getActiveTournamentId } from "../firebase";
import {
  loadEditions, createEdition, cloneEdition, deleteEdition,
  switchEdition, ensureActiveEditionDoc,
} from "../lib/editions";

const fieldStyle = (w) => ({
  width: w || "100%", flex: w ? "none" : 1, boxSizing: "border-box",
  padding: "9px 11px", borderRadius: R.sm,
  background: K.inp, border: `1px solid ${K.bdr}`, color: K.t1,
  // 16px: below that, iOS zooms the page on focus and never zooms back out.
  fontSize: FS.lead, fontWeight: 600, outline: "none",
});

// What a clone can copy. Scores, pairings, tee assignments, skins and
// signatures are NEVER cloned — see the note in lib/editions.js.
const CLONE_ITEMS = [
  { key: "players", label: "Roster & handicap indexes" },
  { key: "rounds", label: "Round setup (course per round)" },
  { key: "tournamentName", label: "Tournament name & location" },
];
const DEFAULT_CLONE_OPTS = { players: true, rounds: false, tournamentName: true };

export function EditionSwitcher({ open, onClose, notify }) {
  const [editions, setEditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState("");
  const [name, setName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const [cloneOpts, setCloneOpts] = useState(DEFAULT_CLONE_OPTS);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const activeId = getActiveTournamentId();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        await ensureActiveEditionDoc();
        const rows = await loadEditions();
        if (alive) setEditions(rows);
      } catch {
        // Almost always the same cause: wbc_editions has no rule deployed yet,
        // and the catch-all denies it. Say so, rather than showing an empty
        // list that reads as "there are no editions".
        if (alive) setErr("Couldn't read editions. If this is the first time, re-publish firestore.rules — wbc_editions needs a rule.");
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const taken = editions.some(e => String(e.year) === String(year));
  const canCreate = /^\d{4}$/.test(year) && !taken && !busy;

  const doCreate = async () => {
    if (!canCreate) return;
    setBusy(true); setErr("");
    try {
      if (cloneFrom) await cloneEdition(cloneFrom, { year, name }, cloneOpts);
      else await createEdition({ year, name });
      setYear(""); setName(""); setCloneFrom(""); setCloneOpts(DEFAULT_CLONE_OPTS);
      setEditions(await loadEditions());
      notify?.(cloneFrom ? `Cloned into WBC ${year}` : `WBC ${year} created`);
    } catch (e) {
      setErr(e?.message || "Couldn't create that edition");
    } finally { setBusy(false); }
  };

  const statusColor = (s) => s === "published" ? K.acc : s === "archived" ? K.t3 : K.warn;

  return (
    <>
      <Popup onClose={onClose} maxWidth={400} padding={18} zIndex={3000} portal>
        <div style={{ fontSize: FS.lead, fontWeight: 800, color: K.t1, letterSpacing: 0.5, marginBottom: 3 }}>Editions</div>
        <div style={{ fontSize: FS.label, color: K.t3, marginBottom: 14 }}>Switch the active year or start a new one.</div>

        {loading ? (
          <div style={{ fontSize: FS.small, color: K.t3, padding: "10px 0 16px" }}>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {editions.map((e) => {
              const isActive = e.id === activeId;
              return (
                <div key={e.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: R.md,
                  background: K.inp, border: `1px solid ${isActive ? K.acc : K.bdr}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.small, fontWeight: 800, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</div>
                    <div style={{ fontSize: FS.label, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: statusColor(e.status), marginTop: 2 }}>
                      {e.status}
                    </div>
                  </div>
                  {isActive ? (
                    <span style={{ fontSize: FS.label, fontWeight: 800, letterSpacing: 0.5, color: ON_ACC, background: K.acc, padding: "5px 10px", borderRadius: R.sm }}>ACTIVE</span>
                  ) : (
                    <>
                      <Btn variant="secondary" size="sm" onClick={() => setPending(e)}
                        style={{ letterSpacing: 0.5, color: K.t2, background: K.card }}>Switch</Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setPendingDelete(e)} title="Delete edition"
                        style={{ color: K.t3, padding: "5px 6px", flexShrink: 0, lineHeight: 1 }}>🗑</Btn>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: `1px solid ${K.bdr}`, paddingTop: 14 }}>
          <div style={{ fontSize: FS.label, fontWeight: 800, letterSpacing: 1.5, color: K.t3, marginBottom: 9, textTransform: "uppercase" }}>New edition</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Year" inputMode="numeric" style={fieldStyle(84)} />
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)" style={fieldStyle()} />
          </div>

          <select value={cloneFrom} onChange={(e) => setCloneFrom(e.target.value)} style={{ ...fieldStyle(), marginBottom: 8, cursor: "pointer" }}>
            <option value="">Start blank (no clone)</option>
            {editions.map((e) => (
              <option key={e.id} value={e.id}>Clone from {e.year} · {e.name}</option>
            ))}
          </select>

          {cloneFrom && (
            <div style={{ marginBottom: 10, background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm, padding: "10px 12px" }}>
              <div style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>Copy into the new edition</div>
              {CLONE_ITEMS.map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7, cursor: "pointer" }}>
                  <input type="checkbox" checked={cloneOpts[key]}
                    onChange={(e) => setCloneOpts((o) => ({ ...o, [key]: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: K.acc, flexShrink: 0 }} />
                  <span style={{ fontSize: FS.small, fontWeight: 600, color: K.t1 }}>{label}</span>
                </label>
              ))}
              <div style={{ fontSize: FS.label, color: K.t3, marginTop: 4, lineHeight: 1.4 }}>
                Scores, pairings, tee assignments and skins always start fresh.
              </div>
            </div>
          )}

          {taken && (
            <div style={{ fontSize: FS.label, fontWeight: 600, color: K.warn, marginBottom: 8 }}>
              There&rsquo;s already an edition for {year}.
            </div>
          )}
          {err && (
            <div style={{ fontSize: FS.label, fontWeight: 600, color: K.danger, marginBottom: 8, lineHeight: 1.45 }}>{err}</div>
          )}

          <Btn block disabled={!canCreate} onClick={doCreate} style={{ letterSpacing: 0.5 }}>
            {busy ? "Working…" : (cloneFrom ? "Clone into new edition" : "Create draft edition")}
          </Btn>
        </div>
      </Popup>

      {pending && (
        <ConfirmModal
          eyebrow="Switch edition"
          title={`Switch to ${pending.name}?`}
          message="The app will reload to load this edition's data. You'll stay signed in, but you may need to pick your name again."
          confirmLabel="Switch"
          onConfirm={() => switchEdition(pending.id)}
          onCancel={() => setPending(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          eyebrow="Delete edition"
          title={`Delete ${pendingDelete.name}?`}
          message={`This permanently deletes ${pendingDelete.name} and ALL of its roster, round setup, pairings, tee assignments, scores and skins. This can't be undone.\n\nCourses and player records are shared across editions and are left alone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            const target = pendingDelete;
            setPendingDelete(null);
            setBusy(true);
            try {
              await deleteEdition(target.id);
              setEditions(await loadEditions());
              notify?.(`${target.name} deleted`);
            } catch (e) {
              setErr(e?.message || "Couldn't delete that edition");
            } finally { setBusy(false); }
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
