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
import { EditionSheet } from "./EditionSheet";
import { IconLock, IconUnlock, IconChevron } from "./Icons";
import { getActiveTournamentId } from "../firebase";
import {
  loadEditions, loadEditionSummaries, cachedEditionSummaries, cachedEditions,
  createEdition, cloneEdition, deleteEdition, switchEdition, ensureActiveEditionDoc, renameEdition,
  setEditionLocked, resetSandbox,
} from "../lib/editions";
import {
  plannedYear, plannedSource, summaryLine, editionHasContent, overwriteWarning,
  newestBuiltEdition,
} from "../lib/editionClone";
import { editionState, deleteVerdict, STATE_LABEL, editionDisplayName } from "../lib/editionLifecycle";
import { isEditionLocked, lockVerdict, bulkLockVerdict } from "../lib/editionLock";
import { isSandboxEdition } from "../lib/editionId";

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

// The three square buttons in the header — back, and close. Same box, so a
// header that gains one does not shift the other.
const headerBtn = {
  flexShrink: 0, width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${K.bdr}`,
  background: "transparent", color: K.t2, fontSize: FS.lead, fontWeight: 600,
  cursor: "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
};

// What a clone can copy. Scores, pairings, tee assignments, skins and
// signatures are NEVER cloned — see the note in lib/editions.js.
const CLONE_ITEMS = [
  // "updated" rather than "copied": a player who posted cards in the year being
  // cloned from starts the new one on a WBC Index that includes them, not on
  // the number he began last year with. See rosterHandicap in editionClone.
  { key: "players", label: "Roster, handicaps updated for last year" },
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
  // Are those counts the REAL ones, or the cached ones painted on open? The
  // form's defaults may only be built on the real ones — see the seeding
  // effect below.
  const [summariesFresh, setSummariesFresh] = useState(false);
  const [loading, setLoading] = useState(true);
  // ── "list" | "new" | "edit" ───────────────────────────────────────
  // The composer used to sit under the list of every year, folded away behind
  // a button. Even folded it was in the way: the popup is centred, so opening
  // it grew the card in both directions and walked the year rows upwards under
  // a reaching thumb — and switching a year reloads the app, so a mis-tap
  // there is expensive.
  //
  // Ported from Bourbon Cup, which took the next step: the composer is its own
  // VIEW. The list is the list, and building or renaming a tournament replaces
  // it entirely — one screen, short, with its button where a thumb already is
  // rather than at the bottom of seventeen rows. `mode` is reset to "list" on
  // every open.
  const [mode, setMode] = useState("list");
  // The row being renamed: { id, name }. Null outside "edit".
  const [editing, setEditing] = useState(null);
  // Have the form's defaults been settled off the real counts, and has the
  // director since typed over them? Either one ends the seeding.
  const [seeded, setSeeded] = useState(false);
  const [touched, setTouched] = useState(false);
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
  // Two errors, because they belong to two different parts of the popup: `err`
  // is the list failing to read or a delete refusing (and is shown whether or
  // not the form is open), `createErr` is the form's own.
  const [err, setErr] = useState("");
  const [createErr, setCreateErr] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  // The year a director is about to FREEZE. Unlocking never lands here — it
  // widens what is possible and asks nothing, see lockVerdict.
  const [pendingLock, setPendingLock] = useState(null);
  // Which row's sheet is open. Null is the list.
  //
  // A popup rather than an expanding row: the actions include a delete, and a
  // row that grows buttons under your thumb moves every row below it — which
  // is how you tap Delete on 2015 aiming to open 2019.
  const [sheetFor, setSheetFor] = useState(null);
  // The whole-list version, which asks in BOTH directions because neither one
  // is a tap-again undo. See bulkLockVerdict.
  const [pendingBulkLock, setPendingBulkLock] = useState(null);
  // { src, existing } — the year the sandbox is about to be cut from, and the
  // sandbox it would replace. Always confirmed: a rebuild wipes.
  const [pendingSandbox, setPendingSandbox] = useState(null);
  const [pendingClone, setPendingClone] = useState(null);
  const [createdEdition, setCreatedEdition] = useState(null);
  const activeId = getActiveTournamentId();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    // Every open starts with the form put away and nothing typed into it.
    setMode("list"); setEditing(null); setSeeded(false); setTouched(false);
    setErr(""); setCreateErr(""); setSummariesFresh(false);
    (async () => {
      // Whatever the last open learned, on this frame: the years themselves
      // and their summary lines. The popup then opens at the size it is going
      // to stay, rather than growing from a one-line "Loading…" into
      // seventeen rows under the reaching thumb. Both are replaced below.
      const known = cachedEditions();
      if (known) {
        setEditions(known);
        setLoading(false);
        const cached = cachedEditionSummaries(known.map(e => e.id));
        if (cached) setSummaries(cached);
      } else {
        setLoading(true);
      }
      try {
        // ONE read of wbc_editions, not two. This used to call
        // ensureActiveEditionDoc and then loadEditions, which fetched the same
        // collection a second time and made the list wait two round trips to
        // show what the first one had already returned.
        const rows = await ensureActiveEditionDoc();
        if (!alive) return;
        setEditions(rows);
        setLoading(false);
        // Same again for any year the cached list did not have — so a row
        // reads "Counting…" only when nothing is known about it at all.
        const cached = cachedEditionSummaries(rows.map(e => e.id));
        if (cached) setSummaries(cached);
        // The counts are what every default in the form is built on, so it
        // waits for them rather than guessing off `status` and being wrong —
        // and off the FRESH ones, never the cache, so a year that has been
        // built since cannot be offered as the year to build.
        //
        // Each year is painted as its own counts land rather than seventeen
        // at once behind the slowest of fifty-one requests, so the list fills
        // in from "Counting…" a row at a time. The map that arrives at the end
        // still REPLACES what was painted — a year that could not be read has
        // to lose its cached line and read "Couldn't read", and a stream of
        // successes can never say that.
        const sums = await loadEditionSummaries(rows.map(e => e.id), {
          onEdition: (id, summary) => {
            if (!alive) return;
            setSummaries(prev => ({ ...(prev || {}), [id]: summary }));
          },
        });
        if (!alive) return;
        setSummaries(sums);
        setSummariesFresh(true);
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

  // ── What the form opens pointed at ────────────────────────────────
  // The year being built, copied from the last year that actually happened.
  // Both stay editable — this is the answer that is right nearly every time,
  // not a decision taken away.
  //
  // It is settled when the form is OPENED rather than when the picker is, and
  // that is the whole point of the collapse: nothing below the year list moves
  // until somebody asks for it. Until the real counts land the defaults are
  // provisional and re-derived as better numbers arrive; once they land, or
  // once the director types anything, they stop moving.
  useEffect(() => {
    if (!open || mode !== "new" || seeded || touched) return;
    const planned = plannedYear(editions, summaries);
    setYear(String(planned));
    setCloneFrom(plannedSource(editions, summaries, planned));
    setSourcePicked(false);
    if (summariesFresh) setSeeded(true);
  }, [open, mode, seeded, touched, editions, summaries, summariesFresh]);

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
  // The sandbox is excluded by ID and not by its year, which reads 0 here and
  // would otherwise sail through the `< targetYear` test below and offer to
  // build next year's tournament out of a fortnight of testers' scribbles.
  // That is the one way this row could corrupt a real edition.
  const sourceOptions = editions
    .filter(e => !isSandboxEdition(e.id))
    .filter(e => !targetYear || Number(e.year) < Number(targetYear))
    .sort((a, b) => Number(b.year) - Number(a.year));

  const setTargetYear = (v) => {
    setYear(v); setTouched(true);
    // The source follows the year until the director takes it over, and is
    // corrected even after that if the year moves past it.
    const next = /^\d{4}$/.test(v) ? v : null;
    if (!next) return;
    const stale = cloneFrom && Number(editions.find(e => e.id === cloneFrom)?.year) >= Number(next);
    if (!sourcePicked || stale) setCloneFrom(plannedSource(editions, summaries, next));
  };

  const runCreate = async () => {
    setBusy(true); setCreateErr("");
    try {
      const made = cloneFrom
        ? await cloneEdition(cloneFrom, { year, name }, cloneOpts)
        : await createEdition({ year, name });
      const rows = await loadEditions();
      const sums = await loadEditionSummaries(rows.map(e => e.id));
      setEditions(rows);
      setSummaries(sums);
      setSummariesFresh(true);
      setName("");
      const planned = plannedYear(rows, sums);
      setYear(String(planned));
      setCloneFrom(plannedSource(rows, sums, planned));
      setSourcePicked(false);
      // The year that was just built is the newest fact there is, so the form
      // is back on settled defaults rather than waiting to be re-seeded.
      setTouched(false); setSeeded(true);
      notify?.(cloneFrom ? `Cloned into WBC ${year}` : `WBC ${year} created`);
      // Cloning last year into next year is almost always the first step of
      // working IN next year, so offer the switch here rather than making them
      // find the row and tap it.
      setCreatedEdition(rows.find(e => e.id === made?.id) || { id: made?.id, name: made?.name || `WBC ${year}` });
    } catch (e) {
      setCreateErr(e?.message || "Couldn't create that edition");
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

  // The year's state, derived from what it holds — never from the stored
  // `status`, which says whichever thing the code path that created the row
  // happened to stamp. Until the counts land, every year is "unknown", which
  // is also what refuses the delete: not being able to check is not
  // permission.
  const stateOf = (e) => editionState(summaries?.[e.id]);

  // Looked up by id on every render rather than stashed as an object, so the
  // sheet repaints from the reloaded list after a lock instead of showing the
  // row as it was when it was tapped.
  const sheetEdition = sheetFor ? editions.find((e) => e.id === sheetFor) || null : null;
  const closeSheet = () => setSheetFor(null);

  // ── Rename ────────────────────────────────────────────────────────
  // Opened from the sheet, answered in its own view. The id and the year are
  // shown but not editable — see renameEdition for why changing an id would
  // orphan a tournament.
  const openRename = (e) => {
    setEditing({ id: e.id, name: e.name || "" });
    setCreateErr("");
    setMode("edit");
  };

  const leaveForm = () => { setMode("list"); setEditing(null); setCreateErr(""); };

  const doRename = async () => {
    if (!editing?.name?.trim() || busy) return;
    setBusy(true); setCreateErr("");
    try {
      const res = await renameEdition(editing.id, editing.name);
      if (!res?.ok) { setCreateErr(res.error || "That didn't save."); return; }
      setEditions(rows => rows.map(r => (r.id === editing.id ? { ...r, name: res.name } : r)));
      notify?.(`Renamed to ${res.name}`);
      leaveForm();
    } catch (e) {
      setCreateErr(e?.message || "That didn't save.");
    } finally { setBusy(false); }
  };
  const stateColor = (s) => s === "complete" ? K.acc : s === "live" ? K.warn : K.t3;

  // ── Freeze or thaw a year ────────────────────────────────────────
  // The row is repainted from the RETURNED value rather than re-read from
  // Firestore: this is a single boolean the caller just set, and a full
  // loadEditions() here would drop the summary counts on the floor and put
  // "Counting…" back on seventeen rows for the sake of one padlock.
  const applyLock = async (edition, next) => {
    if (!edition?.id || busy) return;
    setBusy(true);
    setErr("");
    try {
      await setEditionLocked(edition.id, next);
      setEditions(rows => rows.map(r => (r.id === edition.id ? { ...r, locked: next } : r)));
      notify?.(`${edition.name || edition.year} ${next ? "locked" : "unlocked"}`);
    } catch (e) {
      // Says which way it failed. "Couldn't lock" on a row still showing an
      // open padlock is the one message that leaves somebody unsure whether
      // the tournament is protected.
      setErr(e?.message || `Couldn't ${next ? "lock" : "unlock"} that year`);
    } finally { setBusy(false); }
  };

  // ── Cut a fresh sandbox ──────────────────────────────────────────
  // The counts ARE re-read here, unlike the padlock: resetSandbox deletes an
  // edition and writes a roster, four rounds of setup and a buy-in sheet, so
  // the summary on that row is wrong the instant it returns and every guard
  // reading it — the delete verdict, the state dot — would be answering about
  // the sandbox that just stopped existing.
  const runSandbox = async (sourceId) => {
    if (!sourceId || busy) return;
    setBusy(true);
    setErr("");
    try {
      await resetSandbox(sourceId, DEFAULT_CLONE_OPTS);
      const rows = await loadEditions();
      setEditions(rows);
      setSummaries(await loadEditionSummaries(rows.map(r => r.id)));
      setSummariesFresh(true);
      notify?.("Sandbox rebuilt");
    } catch (e) {
      setErr(e?.message || "Couldn't build the sandbox");
    } finally { setBusy(false); }
  };

  // ── The same thing to every year at once ─────────────────────────
  // allSettled, not all: seventeen independent writes, and one of them failing
  // is not a reason to leave the other sixteen unreported. What actually
  // landed is what the rows are repainted from, so a partial run shows exactly
  // which years took it — a padlock is a claim about whether a tournament is
  // safe, and painting sixteen of them shut when fifteen are would be the one
  // way this feature could do harm.
  const applyBulkLock = async (ids, next) => {
    if (!ids?.length || busy) return;
    setBusy(true);
    setErr("");
    const done = await Promise.allSettled(ids.map(id => setEditionLocked(id, next)));
    const ok = ids.filter((_, i) => done[i].status === "fulfilled");
    if (ok.length) {
      const shut = new Set(ok);
      setEditions(rows => rows.map(r => (shut.has(r.id) ? { ...r, locked: next } : r)));
    }
    const failed = ids.length - ok.length;
    if (failed) setErr(`${failed} of ${ids.length} couldn't be ${next ? "locked" : "unlocked"}. The rest went through.`);
    else notify?.(`${ok.length} ${ok.length === 1 ? "year" : "years"} ${next ? "locked" : "unlocked"}`);
    setBusy(false);
  };
  const cloneSource = editions.find(e => e.id === cloneFrom) || null;
  // The label on a source option: the year, and what is in it. "2025 · 16
  // players · 1,368 scores" is what makes it obvious which year is worth
  // copying — which is the whole question this dropdown asks.
  const sourceLabel = (e) => {
    const line = summaries ? summaryLine(summaries[e.id]) : "";
    return `${e.year} · ${e.name}${line ? ` — ${line}` : ""}`;
  };

  return (
    <>
      {/* viewportFit + align start: this popup holds text fields, and a centred
          full-viewport overlay puts them — and the button under them — behind
          the on-screen keyboard, because iOS does not shrink the CSS viewport
          for it. padding 0 and a flex column so the header stays put while
          only the middle scrolls. */}
      <Popup
        onClose={onClose} portal viewportFit align="start"
        maxWidth={400} padding={0} outerPadding={12} zIndex={3000}
        innerStyle={{ display: "flex", flexDirection: "column" }}
      >
        {/* One header for all three views: back out of a form, what this is,
            the door into the composer, and the way out. */}
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 9,
          padding: "12px 14px", borderBottom: `1px solid ${K.bdr}`,
        }}>
          {mode !== "list" && (
            <button onClick={leaveForm} aria-label="Back" style={{ ...headerBtn, fontSize: FS.title }}>‹</button>
          )}
          <div style={{ flex: 1, minWidth: 0, fontSize: FS.lead, fontWeight: 800, color: K.t1, letterSpacing: 0.5 }}>
            {mode === "new" ? "New tournament" : mode === "edit" ? "Rename tournament" : "Tournaments"}
          </div>
          {mode === "list" && canManage && !loading && (
            <button onClick={() => { setMode("new"); setCreateErr(""); }} style={{
              flexShrink: 0, padding: "7px 12px", borderRadius: R.sm, font: "inherit",
              border: `1px solid ${K.acc}`, background: "transparent", color: K.acc,
              fontSize: FS.small, fontWeight: 800, letterSpacing: 0.5, cursor: "pointer",
            }}>+ New</button>
          )}
          <button onClick={onClose} aria-label="Close" style={headerBtn}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: 16 }}>
        {mode === "list" ? (<>

        {loading ? (
          <div style={{ fontSize: FS.small, color: K.t3, padding: "10px 0 16px" }}>Loading…</div>
        ) : (
          /* ── One line per year, and the list scrolls inside itself ────
             Sixteen tournaments landed here the day history was imported, and
             the three-line card each one used to get — name, then what is in
             it, then a status pill — turned this into about 1,400px of
             scrolling to reach a form sitting underneath it.

             A row is now ~40px and says the same three things: the year, what
             is in it, and its state as the DOT rather than a pill (the label
             rides the title attribute, and the legend below spells the colours
             out once instead of seventeen times).

             The height cap is the other half. Without it the popup grows with
             the number of years and pushes the create button off the bottom
             forever; with it the list scrolls in place and everything else
             stays where it was. 44vh so a phone still shows ~6 rows. */
          <div style={{
            display: "flex", flexDirection: "column", gap: 4, marginBottom: 10,
            maxHeight: "min(44vh, 300px)", overflowY: "auto",
            // Room for the scrollbar so it never sits on top of the bin.
            paddingRight: 2,
          }}>
            {editions.map((e) => {
              const isActive = e.id === activeId;
              const state = stateOf(e);
              const sandbox = isSandboxEdition(e.id);
              // Three answers, not two. The counts arrive a year at a time, so
              // a year MISSING from the map is either one still being counted
              // or one that could not be read — and those are opposite
              // sentences. Only once the whole load has settled does absence
              // mean failure; until then it means we are still looking.
              const known = summaries?.[e.id] || null;
              const summary = known ? summaryLine(known)
                : summariesFresh ? "Couldn't read" : "Counting…";
              // "WBC 2015" beside a bold 2015 is the same word seventeen
              // times. A name that ISN'T the default is worth the space; the
              // default is not. Suppressed for the sandbox, whose badge
              // already says DEMO — "DEMO · DEMO Sandbox · 16 players" is the
              // word twice in a row that has to fit a phone.
              const customName = sandbox ? null : editionDisplayName(e);
              const locked = isEditionLocked(e);
              return (
                // ── The whole row is one button, and it opens the SHEET ──
                // It used to be a tap target with two controls bolted to its
                // right-hand end, and at a 320pt viewport the summary line —
                // the counts a director is actually deciding on — had nothing
                // left. The padlock and the bin moved behind this tap; what
                // stays is what the row is FOR: which year, what state, how
                // much is in it.
                //
                // The ACTIVE row opens it too, unlike before. There is nowhere
                // to go, but there is still a lock to set and a reason the bin
                // is missing, and an inert row could say neither.
                <button
                  key={e.id}
                  onClick={() => setSheetFor(e.id)}
                  title={known || summariesFresh ? STATE_LABEL[state] : "Counting…"}
                  aria-label={`${sandbox ? "DEMO" : e.year}${customName ? ` — ${customName}` : ""}${locked ? ", locked" : ""}`}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "9px 10px", borderRadius: R.sm, textAlign: "left",
                    font: "inherit", color: K.t1, cursor: "pointer",
                    background: isActive ? K.acc + ALPHA.wash : K.inp,
                    border: `1px solid ${isActive ? K.acc : K.bdr}`,
                  }}>
                  <span aria-hidden style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: stateColor(state),
                  }} />
                  {/* A BADGE where a year would be, because the sandbox has no
                      year and must not look like it does. This is the whole
                      reason it is `wbc_demo` and not `wbc_2026_demo`: opening a
                      row reloads the app into that edition, and two rows both
                      reading "2026" is a director in a hurry opening the wrong
                      one mid-tournament. */}
                  {sandbox ? (
                    <span style={{
                      fontSize: FS.micro, fontWeight: 800, flexShrink: 0, letterSpacing: 0.5,
                      color: K.tourn, border: `1px solid ${K.tourn}${ALPHA.line}`,
                      background: `${K.tourn}${ALPHA.wash}`, padding: "2px 6px", borderRadius: R.xs,
                    }}>DEMO</span>
                  ) : (
                    <span style={{ fontSize: FS.body, fontWeight: 800, flexShrink: 0 }}>{e.year}</span>
                  )}
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: FS.label, fontWeight: 600, color: K.t3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{customName ? `${customName} · ${summary}` : summary}</span>
                  {/* STATE, not a switch — the toggle is in the sheet now. SVG
                      rather than 🔒, because a colour font paints its own
                      palette: this one can be the accent, so "frozen" no
                      longer has to be spelled as "washed out". */}
                  {locked && (
                    <span aria-hidden style={{ flexShrink: 0, display: "flex", color: K.acc }}>
                      <IconLock size={15} />
                    </span>
                  )}
                  {isActive && (
                    <span style={{
                      flexShrink: 0, fontSize: FS.micro, fontWeight: 800,
                      letterSpacing: 0.5, color: ON_ACC, background: K.acc,
                      padding: "3px 7px", borderRadius: R.xs,
                    }}>ACTIVE</span>
                  )}
                  <span aria-hidden style={{ flexShrink: 0, display: "flex", color: K.t3 }}>
                    <IconChevron size={15} />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* The dot, once, instead of a pill on every row. */}
        {!loading && editions.length > 0 && (
          <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            {[["complete", "Complete"], ["live", "In progress"], ["setup", "Not started"]].map(([st, label]) => (
              <span key={st} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: FS.micro, color: K.t3, fontWeight: 700 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: stateColor(st) }} />
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Reading the list failed, or a delete refused. It belongs to the
            list, so it is shown to everybody and whether or not the create
            form is open. */}
        {err && (
          <div style={{ fontSize: FS.label, fontWeight: 600, color: K.danger, marginBottom: 10, lineHeight: 1.45 }}>{err}</div>
        )}

        {/* ── Every year at once ────────────────────────────────────
            Seventeen editions is seventeen taps, and freezing the history
            before handing the app to testers is the job this whole feature
            exists for — a chore that long is one that gets abandoned halfway,
            which leaves exactly the hole the lock was meant to close.

            It sits under the LIST rather than in the create-tournament block
            below, because that is what it acts on. One button: it locks while
            anything is open and unlocks once nothing is, so the slot is never
            a control that does nothing. See bulkLockVerdict. */}
        {canManage && !loading && (() => {
          const v = bulkLockVerdict(editions, activeId);
          if (!v) return null;
          return (
            <button
              onClick={() => setPendingBulkLock(v)}
              disabled={busy}
              style={{
                width: "100%", marginBottom: 10, padding: "9px 0", borderRadius: R.sm,
                background: "transparent", border: `1px solid ${K.bdr}`, color: K.t2,
                fontSize: FS.label, fontWeight: 700, cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.5 : 1, display: "flex", alignItems: "center",
                justifyContent: "center", gap: 7,
              }}>
              <span aria-hidden style={{ display: "flex", color: K.acc }}>
                {v.next ? <IconLock size={14} /> : <IconUnlock size={14} />}
              </span>{v.label}
            </button>
          );
        })()}

        {/* ── The sandbox ───────────────────────────────────────────
            Cut from the newest year that actually holds a tournament, so a
            tester opens something that looks like the real event — a full
            roster on real courses — with nobody having played a hole.

            Deliberately NOT part of the create-a-year form below. That form
            is for building next year's tournament and its whole shape is a
            year; the sandbox has no year, is rebuilt rather than created, and
            wipes what was there. Sharing the form would mean explaining both. */}
        {canManage && !loading && (() => {
          const src = newestBuiltEdition(editions, summaries);
          const existing = editions.find(e => isSandboxEdition(e.id)) || null;
          // No year worth copying yet: a sandbox cloned from an empty edition
          // is an empty sandbox, and that failure is silent — it looks exactly
          // like a sandbox that worked until a tester finds no roster.
          if (!src) return null;
          return (
            <button
              onClick={() => setPendingSandbox({ src, existing })}
              disabled={busy}
              style={{
                width: "100%", marginBottom: 10, padding: "9px 0", borderRadius: R.sm,
                background: "transparent", border: `1px solid ${K.bdr}`, color: K.t2,
                fontSize: FS.label, fontWeight: 700, cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.5 : 1, display: "flex", alignItems: "center",
                justifyContent: "center", gap: 7,
              }}>
              <span aria-hidden>🧪</span>
              {existing ? `Rebuild sandbox from ${src.year}` : `Create sandbox from ${src.year}`}
            </button>
          );
        })()}

        </>) : mode === "edit" ? (<>
          {/* ── Rename ────────────────────────────────────────────────
              The name only. The id and the year are what every score, pairing
              and card in this tournament is filed under — see renameEdition —
              so they are shown as the fixed things they are rather than
              offered as fields. */}
          <div style={{ fontSize: FS.label, color: K.t3, marginBottom: 12, lineHeight: 1.45 }}>
            <b style={{ color: K.t2 }}>{editing?.id}</b>
            {" — the id and the year are fixed. Every score, pairing and card in this tournament is filed under them."}
          </div>
          <span style={{ ...rowLabel, display: "block", marginBottom: 5 }}>Name</span>
          <input
            value={editing?.name || ""} autoFocus
            placeholder={`WBC ${editing?.id?.replace(/\D/g, "") || ""}`.trim()}
            onChange={(e) => { setCreateErr(""); setEditing(v => ({ ...v, name: e.target.value })); }}
            style={{ ...fieldStyle(), marginBottom: 12 }}
          />
          {createErr && (
            <div style={{ fontSize: FS.label, fontWeight: 600, color: K.danger, marginBottom: 8, lineHeight: 1.45 }}>{createErr}</div>
          )}
          <Btn block disabled={busy || !editing?.name?.trim()} onClick={doRename} style={{ letterSpacing: 0.5 }}>
            {busy ? "Saving…" : "Save name"}
          </Btn>
        </>) : (<>
          {/* ── The composer, in its own view ─────────────────────────
              Everything below used to live under the list behind a fold. Here
              it is the whole screen, so the button that ends it lands where a
              thumb already is instead of below seventeen rows of years. */}
          <div>
                {/* Source first, then target: the form reads top-to-bottom in the
                    direction the work goes — copy FROM last year, INTO next. The
                    other order made you type the answer before the question. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ ...rowLabel, width: 62 }}>Copy from</span>
                  <select value={cloneFrom} onChange={(e) => { setCloneFrom(e.target.value); setSourcePicked(true); setTouched(true); }}
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
                  <input value={name} onChange={(e) => { setName(e.target.value); setTouched(true); }}
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
                      Dates, scores, pairings, tee times and skins always start fresh.
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
              {createErr && (
                <div style={{ fontSize: FS.label, fontWeight: 600, color: K.danger, marginBottom: 8, lineHeight: 1.45 }}>{createErr}</div>
              )}

              <Btn block disabled={!canCreate} onClick={doCreate} style={{ letterSpacing: 0.5 }}>
                {busy
                  ? "Working…"
                  : cloneFrom
                    ? `Build ${targetYear || "the new year"} from ${cloneSource?.year || "last year"}`
                    : `Create ${targetYear || "a year"}, blank`}
              </Btn>
          </div>
        </>)}
        </div>
      </Popup>

      {/* ── Behind the tap ────────────────────────────────────────────
          Every control the row used to carry, with a word on it — and the one
          sentence it could never carry at all: why a year that refuses to be
          deleted refuses. Each handler closes the sheet first, because all
          three either raise a confirm or reload the app, and a sheet left
          standing behind either is a layer nobody asked for.

          (The "Open WBC 2015?" confirm that used to stand here has gone with
          it. It was an eyebrow and a title restating the button that had just
          been tapped; the sheet puts the year at display size directly above
          "Open this tournament", which is the same question asked once. The
          DELETE and LOCK confirms below stay — those are the two a person
          should have to answer twice.) */}
      {sheetEdition && (
        <EditionSheet
          edition={sheetEdition}
          state={stateOf(sheetEdition)}
          summary={summaries?.[sheetEdition.id] ? summaryLine(summaries[sheetEdition.id])
            : summariesFresh ? "Couldn't read" : "Counting…"}
          isActive={sheetEdition.id === activeId}
          isSandbox={isSandboxEdition(sheetEdition.id)}
          canManage={canManage}
          busy={busy}
          onClose={closeSheet}
          onOpen={() => switchEdition(sheetEdition.id)}
          onLock={() => {
            const target = sheetEdition;
            const v = lockVerdict(target, { isActive: target.id === activeId });
            closeSheet();
            if (v.confirm) setPendingLock(target);
            else applyLock(target, v.next);
          }}
          onRename={() => { const t = sheetEdition; closeSheet(); openRename(t); }}
          onDelete={() => { const t = sheetEdition; closeSheet(); setPendingDelete(t); }}
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

      {/* Graded by what is actually at stake. A tournament IN PROGRESS is the
          dangerous one — those scores were made on a course this week and
          exist nowhere else — so it gets its own eyebrow, its own sentence,
          and a button that says how many scores it is about to destroy. "Are
          you sure? / Delete" is the dialog everybody has learned to tap
          through; a count is not. */}
      {pendingDelete && (() => {
        const s = summaries?.[pendingDelete.id];
        const grave = deleteVerdict(stateOf(pendingDelete), { isActive: pendingDelete.id === activeId }).grave;
        const scores = Number(s?.scores || 0);
        return (
          <ConfirmModal
            eyebrow={grave ? "This tournament is in progress" : "Delete a year"}
            title={grave ? `Destroy ${scores.toLocaleString()} scores?` : `Delete ${pendingDelete.name}?`}
            message={`${pendingDelete.name} holds ${summaryLine(s) || "an unknown amount of data"}.${
              grave ? `\n\nThis round isn't finished. Every score already posted in ${pendingDelete.name} — including any made today — is deleted, and there is no copy of them anywhere else.` : ""
            }\n\nThis permanently deletes the year and ALL of its roster, round setup, pairings, tee assignments, scores and skins. It can't be undone.\n\nCourses and player records are shared across years and are left alone.`}
            confirmLabel={grave ? `Delete ${scores.toLocaleString()} scores` : "Delete"}
            destructive
            onConfirm={async () => {
              const target = pendingDelete;
              setPendingDelete(null);
              setBusy(true);
              try {
                await deleteEdition(target.id);
                const rows = await loadEditions();
                setEditions(rows);
                setSummaries(await loadEditionSummaries(rows.map(r => r.id)));
                notify?.(`${target.name} deleted`);
              } catch (e) {
                setErr(e?.message || "Couldn't delete that year");
              } finally { setBusy(false); }
            }}
            onCancel={() => setPendingDelete(null)}
          />
        );
      })()}

      {/* Locking asks; unlocking does not. See lockVerdict — the confirm text
          is built there rather than here so the dangerous case (freezing the
          year every phone in the field is currently pointed at) can be tested
          without rendering this popup. */}
      {pendingLock && (() => {
        const v = lockVerdict(pendingLock, { isActive: pendingLock.id === activeId });
        return (
          <ConfirmModal
            eyebrow="Freeze a year"
            title={v.confirm.title}
            message={v.confirm.body}
            confirmLabel={v.confirm.confirmLabel}
            onConfirm={() => { const t = pendingLock; setPendingLock(null); applyLock(t, v.next); }}
            onCancel={() => setPendingLock(null)}
          />
        );
      })()}

      {/* Both directions ask, unlike the single padlock. A bulk run flattens
          whatever pattern of locks was there and nothing remembers it, so
          "unlock all" is not undone by locking them back — it is a different
          arrangement that happens to look similar. */}
      {pendingBulkLock && (
        <ConfirmModal
          eyebrow={pendingBulkLock.next ? "Freeze the history" : "Open every year"}
          title={pendingBulkLock.confirm.title}
          message={pendingBulkLock.confirm.body}
          confirmLabel={pendingBulkLock.confirm.confirmLabel}
          onConfirm={() => {
            const v = pendingBulkLock;
            setPendingBulkLock(null);
            applyBulkLock(v.ids, v.next);
          }}
          onCancel={() => setPendingBulkLock(null)}
        />
      )}

      {/* A rebuild WIPES, and says so in the count. Everything else in this
          app that destroys scores names how many, because "are you sure?" is
          the dialog everybody has learned to tap through. */}
      {pendingSandbox && (() => {
        const { src, existing } = pendingSandbox;
        const held = existing ? summaryLine(summaries?.[existing.id]) : "";
        return (
          <ConfirmModal
            eyebrow={existing ? "Rebuild the sandbox" : "Create the sandbox"}
            title={existing ? "Throw away the sandbox and re-cut it?" : `Create a sandbox from ${src.year}?`}
            message={
              (existing
                ? `Everything in the current sandbox${held && held !== "Empty" ? ` — ${held} —` : ""} is deleted first. `
                  + `That data is nobody's round: it is whatever testers typed into it.\n\n`
                : "")
              + `The new one copies ${src.year}'s roster, handicaps, courses and buy-in amounts. `
              + `No scores, no pairings, no bets — it opens as a tournament nobody has played, `
              + `with scoring unlocked on every round so testers can post a card straight away `
              + `without waiting for a tee time.\n\n`
              + `It has no year of its own, so it can never be confused with a real tournament `
              + `and never needs replacing when the calendar moves on.`
            }
            confirmLabel={existing ? "Rebuild it" : "Create it"}
            destructive={!!existing}
            onConfirm={() => { const s = src.id; setPendingSandbox(null); runSandbox(s); }}
            onCancel={() => setPendingSandbox(null)}
          />
        );
      })()}
    </>
  );
}
