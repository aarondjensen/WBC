// ══════════════════════════════════════════════════════════════════
//  EditionSwitcher — every year the tournament has been run in this
//  app, and the door to next year's.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup onto WBC's palette and its Popup/ConfirmModal.
// Switching an edition reloads the app (see lib/editions.js), so both the
// switch and the delete go through a confirmation first.
//
// Two doors open this, and they want different things:
//
//   More → Tournaments   ANYBODY. Reading a past year — its leaderboard, its
//                        cards, who won — is what the menu entry is for, and
//                        reading is open to every member in firestore.rules.
//   Admin → Tournament   the DIRECTOR, who also builds next year here.
//
// `canManage` is the difference. Without it this is a list of years and a
// Switch button; with it, the New-edition form, the status pill and the
// delete appear. It is not a security boundary — firestore.rules is, and it
// allows writes to wbc_editions to a director only — it is there so a player
// is not shown controls whose every tap comes back refused.
import { useState, useEffect } from "react";
import { K, ON_ACC, FS, R, ALPHA } from "../theme";
import { Btn } from "./ui";
import { Popup, ConfirmModal } from "./Popup";
import { getActiveTournamentId } from "../firebase";
import {
  loadEditions, createEdition, cloneEdition, deleteEdition, setEditionStatus,
  switchEdition, ensureActiveEditionDoc, editionId, EDITION_STATUSES,
} from "../lib/editions";
import { nextEditionYear, defaultCloneSource, overwriteWarning } from "../lib/editionClone";

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
  // The price of a seat in skins, CTP, low net and the market. Who bought in
  // never carries — see cloneSideGames.
  { key: "buyIns", label: "Betting buy-in amounts" },
];
// On by default: the things that are genuinely the same tournament a year
// later — the men playing, what it is called and where, and what a seat in
// each betting game costs.
//
// Round setup is OFF, and that is not an oversight. WBC plays somewhere new
// nearly every year — sixteen years of history and barely a repeated course —
// so carrying last year's courses forward would seed four rounds that all have
// to be re-picked, and a wrong course is worse than a blank one: it comes with
// a rating and a slope, and nothing on the scoring screen says it is stale.
const DEFAULT_CLONE_OPTS = { players: true, rounds: false, tournamentName: true, buyIns: true };

export function EditionSwitcher({ open, onClose, notify, canManage = true }) {
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
  const [pendingClone, setPendingClone] = useState(null);
  const [createdEdition, setCreatedEdition] = useState(null);
  const activeId = getActiveTournamentId();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        await ensureActiveEditionDoc();
        const rows = await loadEditions();
        if (!alive) return;
        setEditions(rows);
        // The form opens already pointed at the job: the year being built,
        // cloned from the last year that was played. Both are still editable —
        // this is the answer that is right nearly every time, not a decision
        // taken away.
        const planned = nextEditionYear(rows);
        setYear(String(planned));
        setCloneFrom(defaultCloneSource(rows, planned));
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

  const targetYear = /^\d{4}$/.test(year) ? year : null;
  const targetId = targetYear ? editionId(targetYear) : null;
  const taken = editions.find(e => String(e.year) === String(year)) || null;
  // Cloning a year into itself would rewrite an edition from its own rows —
  // a no-op at best, and one whose confirm would promise an overwrite.
  const selfClone = !!cloneFrom && cloneFrom === targetId;
  // A year that already exists can still be CLONED into — that is how an empty
  // wbc_2026, seeded the moment a phone pointed at it, becomes next year's
  // tournament. Creating a blank duplicate of it would mean nothing, so that
  // stays blocked.
  const canCreate = !!targetYear && !busy && !selfClone && (!taken || !!cloneFrom);

  const runCreate = async () => {
    setBusy(true); setErr("");
    try {
      const made = cloneFrom
        ? await cloneEdition(cloneFrom, { year, name }, cloneOpts)
        : await createEdition({ year, name });
      const rows = await loadEditions();
      setEditions(rows);
      setName("");
      const planned = nextEditionYear(rows);
      setYear(String(planned));
      setCloneFrom(defaultCloneSource(rows, planned));
      notify?.(cloneFrom ? `Cloned into WBC ${year}` : `WBC ${year} created`);
      // Cloning last year into next year is almost always the first step of
      // working IN next year, so offer the switch here rather than making them
      // find the row and tap it.
      setCreatedEdition(rows.find(e => e.id === made?.id) || { id: made?.id, name: made?.name || `WBC ${year}` });
    } catch (e) {
      setErr(e?.message || "Couldn't create that edition");
    } finally { setBusy(false); }
  };

  const doCreate = () => {
    if (!canCreate) return;
    // Landing a clone on a year that already exists overwrites the parts being
    // copied. Nothing else in this component destroys anything without asking,
    // and this shouldn't either.
    if (taken && cloneFrom) { setPendingClone(taken); return; }
    runCreate();
  };

  const cycleStatus = async (e) => {
    const next = EDITION_STATUSES[(EDITION_STATUSES.indexOf(e.status) + 1) % EDITION_STATUSES.length];
    setEditions(rows => rows.map(r => (r.id === e.id ? { ...r, status: next } : r)));
    try {
      await setEditionStatus(e.id, next);
      notify?.(`${e.name} is ${next}`);
    } catch (err_) {
      setEditions(await loadEditions());
      setErr(err_?.message || "Couldn't change that status");
    }
  };

  const statusColor = (s) => s === "published" ? K.acc : s === "archived" ? K.t3 : K.warn;
  const cloneSource = editions.find(e => e.id === cloneFrom) || null;

  return (
    <>
      <Popup onClose={onClose} maxWidth={400} padding={18} zIndex={3000} portal>
        <div style={{ fontSize: FS.lead, fontWeight: 800, color: K.t1, letterSpacing: 0.5, marginBottom: 3 }}>Tournaments</div>
        <div style={{ fontSize: FS.label, color: K.t3, marginBottom: 14 }}>
          {canManage
            ? "Open a past year, or build the next one from it."
            : "Open a past year. The app reloads onto that tournament."}
        </div>

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
                    {/* The status is a tap target for a director — the only
                        way a finished year is marked as history — and plain
                        text for everybody else. */}
                    {canManage ? (
                      <button onClick={() => cycleStatus(e)} title="Change status" style={{
                        marginTop: 3, padding: "2px 7px", borderRadius: R.xs, cursor: "pointer",
                        background: "transparent", border: `1px solid ${statusColor(e.status)}${ALPHA.line}`,
                        fontSize: FS.micro, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                        color: statusColor(e.status),
                      }}>{e.status}</button>
                    ) : (
                      <div style={{ fontSize: FS.label, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: statusColor(e.status), marginTop: 2 }}>
                        {e.status}
                      </div>
                    )}
                  </div>
                  {isActive ? (
                    <span style={{ fontSize: FS.label, fontWeight: 800, letterSpacing: 0.5, color: ON_ACC, background: K.acc, padding: "5px 10px", borderRadius: R.sm }}>ACTIVE</span>
                  ) : (
                    <>
                      <Btn variant="secondary" size="sm" onClick={() => setPending(e)}
                        style={{ letterSpacing: 0.5, color: K.t2, background: K.card }}>Open</Btn>
                      {canManage && (
                        <Btn variant="ghost" size="sm" onClick={() => setPendingDelete(e)} title="Delete edition"
                          style={{ color: K.t3, padding: "5px 6px", flexShrink: 0, lineHeight: 1 }}>🗑</Btn>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canManage && (
          <div style={{ borderTop: `1px solid ${K.bdr}`, paddingTop: 14 }}>
            <div style={{ fontSize: FS.label, fontWeight: 800, letterSpacing: 1.5, color: K.t3, marginBottom: 9, textTransform: "uppercase" }}>New tournament year</div>
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
                  Scores, pairings, tee times, tee assignments and skins always start fresh, and so do the tournament dates.
                </div>
              </div>
            )}

            {selfClone ? (
              <div style={{ fontSize: FS.label, fontWeight: 600, color: K.warn, marginBottom: 8, lineHeight: 1.45 }}>
                That&rsquo;s the same year you&rsquo;re cloning from. Pick a different year, or a different source.
              </div>
            ) : taken && (
              <div style={{ fontSize: FS.label, fontWeight: 600, color: K.warn, marginBottom: 8, lineHeight: 1.45 }}>
                {!cloneFrom
                  ? `There's already an edition for ${year}. Pick a year to clone from to build on it.`
                  : taken.status === "draft"
                    ? `${taken.name} is a draft — cloning fills it in from ${cloneSource?.year || "the source year"}.`
                    : `${taken.name} already exists — cloning will overwrite the setup it has now.`}
              </div>
            )}
            {err && (
              <div style={{ fontSize: FS.label, fontWeight: 600, color: K.danger, marginBottom: 8, lineHeight: 1.45 }}>{err}</div>
            )}

            <Btn block disabled={!canCreate} onClick={doCreate} style={{ letterSpacing: 0.5 }}>
              {busy
                ? "Working…"
                : cloneFrom
                  ? `Clone ${cloneSource?.year || ""} into ${targetYear || "the new year"}`.replace(/\s+/g, " ")
                  : "Create draft edition"}
            </Btn>
          </div>
        )}
      </Popup>

      {pending && (
        <ConfirmModal
          eyebrow="Switch tournament"
          title={`Open ${pending.name}?`}
          message="The app will reload to load this tournament's data. You'll stay signed in, but you may need to pick your name again."
          confirmLabel="Open"
          onConfirm={() => switchEdition(pending.id)}
          onCancel={() => setPending(null)}
        />
      )}

      {pendingClone && (
        <ConfirmModal
          eyebrow={pendingClone.status === "draft" ? "Fill in the draft" : "Year already exists"}
          title={`Clone into ${pendingClone.name}?`}
          message={`${pendingClone.status === "draft"
            ? `${pendingClone.name} is a draft that already exists. Cloning fills in its`
            : `${pendingClone.name} already exists. Cloning REPLACES its`
          } ${overwriteWarning(cloneOpts).join(", ") || "setup"} from ${cloneSource?.name || "the source edition"}.\n\nScores, pairings and skins already in ${pendingClone.name} are left exactly as they are — a clone never touches results.`}
          confirmLabel="Clone into it"
          /* A draft is a year nobody has built yet, so filling it in is the
             ordinary move and asking is only courtesy. Landing on a published
             or archived year is the one worth painting red. */
          destructive={pendingClone.status !== "draft"}
          onConfirm={() => { setPendingClone(null); runCreate(); }}
          onCancel={() => setPendingClone(null)}
        />
      )}

      {createdEdition && (
        <ConfirmModal
          eyebrow="Ready"
          title={`Open ${createdEdition.name} now?`}
          message="The app will reload onto the new tournament so you can set it up. You can also stay where you are and switch later."
          confirmLabel="Open it"
          cancelLabel="Stay here"
          onConfirm={() => switchEdition(createdEdition.id)}
          onCancel={() => setCreatedEdition(null)}
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
