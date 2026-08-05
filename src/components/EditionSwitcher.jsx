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
  loadEditions, loadEditionSummaries, createEdition, cloneEdition, deleteEdition,
  setEditionStatus, switchEdition, ensureActiveEditionDoc, EDITION_STATUSES,
} from "../lib/editions";
import {
  plannedYear, plannedSource, summaryLine, editionHasContent, overwriteWarning,
} from "../lib/editionClone";

// The gutter label on each form row — a fixed width so the two controls
// below share a left edge.
const rowLabel = {
  fontSize: FS.label, fontWeight: 700, color: K.t3,
  textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0,
};

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
  // { [id]: { players, rounds, scores } } — what each year actually holds.
  // Null until the counts land, which is what every default here waits on.
  const [summaries, setSummaries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState("");
  const [name, setName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  // Has the director chosen a source by hand? Until they do, the source
  // follows the year they type — otherwise editing 2027 down to 2026 leaves
  // the source pointing at 2026 and the form offers to clone a year into
  // itself, which is exactly how this screen went wrong the first time.
  const [sourcePicked, setSourcePicked] = useState(false);
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
        setLoading(false);
        // The counts are what every default below is built on, so the form
        // waits for them rather than guessing off `status` and being wrong.
        // They come second because the LIST can be drawn without them.
        const sums = await loadEditionSummaries(rows.map(e => e.id));
        if (!alive) return;
        setSummaries(sums);
        // Opened already pointed at the job: the year being built, copied
        // from the last year that actually happened. Both stay editable —
        // this is the answer that is right nearly every time, not a decision
        // taken away.
        const planned = plannedYear(rows, sums);
        setYear(String(planned));
        setCloneFrom(plannedSource(rows, sums, planned));
        setSourcePicked(false);
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
  const taken = editions.find(e => String(e.year) === String(year)) || null;
  // A year that already exists can still be CLONED into — that is how an empty
  // wbc_2026, seeded the moment a phone pointed at it, becomes next year's
  // tournament. Only its EMPTINESS is worth mentioning in the confirm.
  const takenHasContent = taken ? editionHasContent(summaries?.[taken.id]) : false;
  const canCreate = !!targetYear && !busy && (!taken || !!cloneFrom);

  // Only years BEFORE the target can be copied from. Offering the target
  // itself is what produced "Clone 2026 into 2026" — a self-clone the form
  // then had to talk the director back out of. A source that cannot be
  // chosen needs no warning about having chosen it.
  const sourceOptions = editions
    .filter(e => !targetYear || Number(e.year) < Number(targetYear))
    .sort((a, b) => Number(b.year) - Number(a.year));

  const setTargetYear = (v) => {
    setYear(v);
    // The source follows the year until the director takes it over, and is
    // corrected even after that if the year moves past it.
    const next = /^\d{4}$/.test(v) ? v : null;
    if (!next) return;
    const stale = cloneFrom && Number(editions.find(e => e.id === cloneFrom)?.year) >= Number(next);
    if (!sourcePicked || stale) setCloneFrom(plannedSource(editions, summaries, next));
  };

  const runCreate = async () => {
    setBusy(true); setErr("");
    try {
      const made = cloneFrom
        ? await cloneEdition(cloneFrom, { year, name }, cloneOpts)
        : await createEdition({ year, name });
      const rows = await loadEditions();
      const sums = await loadEditionSummaries(rows.map(e => e.id));
      setEditions(rows);
      setSummaries(sums);
      setName("");
      const planned = plannedYear(rows, sums);
      setYear(String(planned));
      setCloneFrom(plannedSource(rows, sums, planned));
      setSourcePicked(false);
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
    // Landing a clone on a year that already HOLDS something overwrites the
    // parts being copied, and nothing else in this component destroys anything
    // without asking. Landing it on an empty shell is just filling in a blank
    // year, and a confirm for that is a speed bump on the ordinary path.
    if (taken && takenHasContent && cloneFrom) { setPendingClone(taken); return; }
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
  const hasContent = (e) => editionHasContent(summaries?.[e.id]);
  // The label on a source option: the year, and what is in it. "2025 · 16
  // players · 1,368 scores" is what makes it obvious which year is worth
  // copying — which is the whole question this dropdown asks.
  const sourceLabel = (e) => {
    const line = summaries ? summaryLine(summaries[e.id]) : "";
    return `${e.year} · ${e.name}${line ? ` — ${line}` : ""}`;
  };

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
                    {/* WHAT IS IN THE YEAR, first and in plain words. This is
                        the line that answers "which of these is my
                        tournament" — the status label underneath answers it
                        wrongly often enough that it can't be the only thing
                        on the row: an empty year seeded by a phone reads
                        PUBLISHED, and a finished tournament reads DRAFT. */}
                    <div style={{ fontSize: FS.label, fontWeight: 600, color: hasContent(e) ? K.t2 : K.t3, marginTop: 3 }}>
                      {summaries ? (summaryLine(summaries[e.id]) || "Couldn't read") : "Counting…"}
                    </div>
                    {/* The status is a tap target for a director — the only
                        way a finished year is marked as history — and plain
                        text for everybody else. */}
                    {canManage ? (
                      <button onClick={() => cycleStatus(e)} title="Change status" style={{
                        marginTop: 5, padding: "2px 7px", borderRadius: R.xs, cursor: "pointer",
                        background: "transparent", border: `1px solid ${statusColor(e.status)}${ALPHA.line}`,
                        fontSize: FS.micro, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                        color: statusColor(e.status),
                      }}>{e.status}</button>
                    ) : (
                      <div style={{ fontSize: FS.micro, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: statusColor(e.status), marginTop: 4 }}>
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
            <div style={{ fontSize: FS.label, fontWeight: 800, letterSpacing: 1.5, color: K.t3, marginBottom: 9, textTransform: "uppercase" }}>Build a year</div>

            {/* Source first, then target: the form reads top-to-bottom in the
                direction the work goes — copy FROM last year, INTO next. The
                other order made you type the answer before the question. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ ...rowLabel, width: 62 }}>Copy from</span>
              <select value={cloneFrom} onChange={(e) => { setCloneFrom(e.target.value); setSourcePicked(true); }}
                style={{ ...fieldStyle(), fontSize: FS.small, cursor: "pointer" }}>
                <option value="">Nothing — start blank</option>
                {sourceOptions.map((e) => (
                  <option key={e.id} value={e.id}>{sourceLabel(e)}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ ...rowLabel, width: 62 }}>Into year</span>
              <input value={year} onChange={(e) => setTargetYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Year" inputMode="numeric" style={fieldStyle(78)} />
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)" style={{ ...fieldStyle(), fontSize: FS.small }} />
            </div>

            {cloneFrom && (
              <div style={{ marginBottom: 10, background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm, padding: "10px 12px" }}>
                <div style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" }}>What comes across</div>
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

            {taken && (
              <div style={{
                fontSize: FS.label, fontWeight: 600, marginBottom: 8, lineHeight: 1.45,
                color: takenHasContent || !cloneFrom ? K.warn : K.t3,
              }}>
                {!cloneFrom
                  ? `${taken.name} already exists. Pick a year to copy from to build on it.`
                  : takenHasContent
                    ? `${taken.name} already has a tournament in it — copying will overwrite the setup it has now.`
                    : `${taken.name} already exists but is empty. This fills it in from ${cloneSource?.year || "the source year"}.`}
              </div>
            )}
            {err && (
              <div style={{ fontSize: FS.label, fontWeight: 600, color: K.danger, marginBottom: 8, lineHeight: 1.45 }}>{err}</div>
            )}

            <Btn block disabled={!canCreate} onClick={doCreate} style={{ letterSpacing: 0.5 }}>
              {busy
                ? "Working…"
                : cloneFrom
                  ? `Build ${targetYear || "the new year"} from ${cloneSource?.year || "last year"}`
                  : `Create ${targetYear || "a year"}, blank`}
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

      {/* Only raised when the target year already HOLDS a tournament — see
          doCreate. Filling in an empty year needs no confirmation, and asking
          for one on the ordinary path is how a warning stops being read. */}
      {pendingClone && (
        <ConfirmModal
          eyebrow="Year already has a tournament"
          title={`Overwrite ${pendingClone.name}?`}
          message={`${pendingClone.name} holds ${summaryLine(summaries?.[pendingClone.id]) || "a tournament"}. Copying REPLACES its ${overwriteWarning(cloneOpts).join(", ") || "setup"} with ${cloneSource?.name || "the source year"}'s.\n\nScores, pairings and skins already in ${pendingClone.name} are left exactly as they are — this never touches results.`}
          confirmLabel="Overwrite it"
          destructive
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
          message={`${pendingDelete.name} holds ${summaryLine(summaries?.[pendingDelete.id]) || "an unknown amount of data"}.\n\nThis permanently deletes it and ALL of its roster, round setup, pairings, tee assignments, scores and skins. This can't be undone.\n\nCourses and player records are shared across editions and are left alone.`}
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
