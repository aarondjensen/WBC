// ══════════════════════════════════════════════════════════════════
//  AdminView — the director's console, and everything only it draws.
// ══════════════════════════════════════════════════════════════════
//
// Lifted wholesale out of App.jsx. It behaves exactly as it did; what changed
// is WHO PAYS FOR IT.
//
// This is roughly a third of the app's JavaScript — the draw editor, the tee
// assigner, the player editor, the course search, the event calendar, the
// finalize guards — and one person in the field is a director. Everybody else
// was downloading all of it to look at a leaderboard, because it sat in the
// same file as the app shell and therefore in the same chunk. App.jsx now
// lazy-loads this file, so it is fetched by the phone that opens Admin and by
// no other.
//
// Nothing here talks to Firestore on its own behalf except the course search
// and the course write it commits; everything else arrives as props from the
// shell, which is what made this a clean cut rather than a rewrite.
//
// Two things it can no longer reach, both module-level in App.jsx, and both
// now passed or shared rather than imported — importing App.jsx from a file
// App.jsx lazy-loads is a cycle:
//
//   DEMO_PLAYERS   the career registry, arriving as the `registry` prop
//   TOURNAMENT     only its default NAME was wanted; that is in constants now
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { TOURNAMENT_ID, getTournamentYear } from "../firebase";
import { accountsUnreadable, membershipForPlayer, playerIsDirector } from "../lib/accounts";
import { K, ON_ACC, ON_DANGER, FS, R, ALPHA, MOTION, FONT, SCRIM, DIM_PLACED } from "../theme";
import { SegmentedToggle, StickyTop, SectionLabel, Card, Btn } from "./ui";
import { calcCH, courseHandicapFor, computeRoundLine, rankIndividualBoardIds, WD_SCORE } from "../lib/individualBoard";
import { BuyInPrices } from "./BuyIns";
import { TeeColorSwatch } from "./TeeColorSwatch";
import { AccessPanel } from "./AccessPanel";
import { PlayerActivityPanel } from "./PlayerActivityPanel";
import { resolveTeeColor, TEE_COLOR_MAP } from "../lib/teeColors";
import { newTeeBox, orderTeesForEdit, unnamedTees, normalizeTees } from "../lib/teeEditor";
import { useConfirm } from "../lib/useConfirm";
import { useDirtyForm } from "../lib/useDirtyForm";
import { pairingScoreImpact, orphanedScores, describeScored, totalHoles, holesEntered } from "../lib/scoreGuard";
import { groupsForRound, assignToGroup, removeFromGroup as removeFromGroupPure, clearGroup, swapIntoGroup } from "../lib/pairings";
import { PAIRING_MODES, PAIRING_MODE_LABEL, resolvePairingCfg, buildPriorPartners, optimizeAvoidRepeats, groupByLeaderboard } from "../lib/pairingDraw";
import { parseRapidAPI, fetchCourseTees, searchCourses, MIN_COURSE_QUERY, COURSE_SEARCH_DEBOUNCE_MS } from "../lib/courseSearch";
import { apiUrl } from "../lib/apiBase";
import { Popup, ConfirmModal } from "./Popup";
import { isHistoryCourseId } from "../lib/historyImport";
import { localDateISO, fmtRoundDate } from "../lib/format";
import { SCORING_LEAD_MIN } from "../lib/scoringGate";
import { NUM_ROUNDS, roundDateChoices } from "../lib/rounds";
import { toDisplayName, isGeneratedName, shortName, fullName, splitName } from "../lib/playerNames";
import { missingTees, missingTeeNames, pairingsTrouble } from "../lib/roundSetup";
import { indexFor, matchHistoryName, recentRoundSlots, WINDOW } from "../lib/handicap";
import { EMPTY_LIVE_ROUNDS } from "../lib/liveHistory";
import { returningPlayers, returningLine } from "../lib/returningPlayers";
import { deleteVerdict, deletionLines } from "../lib/playerDelete";
import { getDefaultTee } from "../lib/defaultTee";
import { chDeltasFor, CH_DELTA_MS } from "../lib/chDeltas";
import { TROPHY_SVG_URL, ROUND_CHOICES, clampRounds, SIDE_GAME_KEYS, SIDE_GAME_LABELS, defaultTournamentName } from "../constants";

// Gap the tee sheet fills in with when the director types one group's time and
// the rest are still blank. A director who spaces two groups differently keeps
// their own spacing — this is only the starting assumption.
const TEE_INTERVAL_MIN = 10;

// Every day the event runs, start..end inclusive, as YYYY-MM-DD. This is what
// turns two dates typed once in Admin → Event into the only dates a round can
// be played on. Capped at 14: a longer span is a typo (2026 for 2027), and a
// mis-keyed year would otherwise try to render thousands of chips.
const tournamentDays = (start, end) => {
  if (!start) return [];
  const parse = (iso) => { const [y, mo, da] = String(iso).split("-").map(Number); return (y && mo && da) ? new Date(y, mo - 1, da) : null; };
  const a = parse(start);
  const b = parse(end) || a;
  if (!a || !b || b < a) return a ? [start] : [];
  const out = [];
  for (const d = new Date(a); d <= b && out.length < 14; d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
};

// Portal component — renders modal directly into document.body to escape all stacking contexts
const CoursePreviewPortal = ({ children }) => {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
};

// Width of the HI and CH columns in the player-tee list. Wide enough for a
// two-digit index with a decimal ("18.4") at the name's own size, so the
// numbers line up down the list instead of drifting with the name beside them.
const CH_COL_W = 40;

// The per-player tee buttons. Written down because the column heads above the
// list reserve exactly this much room to sit clear of them — a gap changed in
// one place and not the other slides HI and CH off their columns.
const TEE_BTN_W = 34;
const TEE_BTN_GAP = 6;

const TEE_PALETTE = ["#60a5fa","#f59e0b","#a78bfa","#34d399","#fb923c","#f472b6","#38bdf8","#e879f9"];

const TeeDot = ({ color }) => (
  <span style={{
    width: 7, height: 7, borderRadius: "50%", flexShrink: 0, display: "inline-block",
    background: color || "transparent",
    boxShadow: color ? `0 0 0 1px ${K.t1}${ALPHA.hair}` : "none",
  }} />
);

// ── PAIRINGS EDITOR ──
function PairingsEditor({ activePlayers, pairingsData, setPairings, tRounds, courses, teeTimesData, setTeeTimesData, roundDates, onSetRoundDate, scoringOpen, onSetScoringOpen, pairingStrategy, onSetPairingStrategy, leaderboard, finalizedRounds, getPlayerTee, editRound, holeData }) {
  // Themed confirmations. Also closes a latent hazard: the generate guard
  // below called the GLOBAL window.confirm, so the day anyone added
  // useConfirm to this component it would have started returning a Promise
  // — always truthy — and silently stopped asking. That is exactly how the
  // admin Start Fresh button lost its confirmation.
  const { confirm, confirmModal } = useConfirm();
  const numGroups = Math.ceil(activePlayers.length / 4);

  // Seeded once per mount from the saved pairings. The parent keys this editor
  // on the round and the roster size, so a change to either remounts it and
  // re-runs this initializer — which is what a prop-syncing effect used to do,
  // minus the extra render pass and minus the risk of the load racing a save.
  const [groups, setGroups] = useState(() => groupsForRound(pairingsData, editRound, numGroups));
  const [selected, setSelected] = useState(null);
  const [genMsg, setGenMsg] = useState(null); // { tone: "ok"|"warn", text } — result of the last auto-generate

  // Persist a set of groups the director just changed. Saving belongs here, in
  // the handlers that make an edit, rather than in an effect watching `groups`:
  // an effect cannot tell an edit apart from the initial load, which is why the
  // old one needed an isFirstRender ref to avoid saving the freshly-loaded
  // state straight back over the round's real pairings.
  const commitGroups = (next) => {
    setGroups(next);
    setSelected(null);
    const nonEmpty = next.filter(g => g.length > 0);
    // Only write an empty set when there is something saved to clear.
    if (nonEmpty.length > 0 || (pairingsData || {})[editRound]) setPairings(editRound, nonEmpty);
  };

  // ── Auto-pairing strategy (configurable per round) ──
  const cfg = resolvePairingCfg(pairingStrategy, editRound);
  const setMode = (mode) => {
    if (!onSetPairingStrategy) return;
    onSetPairingStrategy(editRound, { ...cfg, mode });
    setGenMsg(null);
  };
  const setLeadersLast = (leadersLast) => {
    if (!onSetPairingStrategy) return;
    onSetPairingStrategy(editRound, { ...cfg, leadersLast });
  };

  // Generate pairings for the current round using the selected method. The result is
  // written into local `groups`, which the existing auto-save effect persists to
  // Firestore — so the director can still hand-tweak afterward exactly as before.
  const generatePairings = async () => {
    const pids = activePlayers.map(p => p.id);
    if (pids.length === 0) return;
    const hasExisting = groups.some(g => g.length > 0);
    if (hasExisting) {
      // What is BEHIND the change, said before the tap. Scores are keyed by
      // player+round+hole, not by group, so re-drawing does not move or delete
      // them — it re-attaches them to whoever ends up sharing a card. A
      // director re-pairing round 2 at lunch is entitled to know that four
      // players are already eight holes deep. See lib/scoreGuard.
      const impact = pairingScoreImpact({ groups, holeData, round: editRound });
      const nameOf = (pid) => activePlayers.find(p => p.id === pid)?.name || pid;
      const ok = await confirm({
        title: `Replace the Round ${editRound} pairings?`,
        message: impact.hasScores
          ? `${impact.holes} hole${impact.holes === 1 ? "" : "s"} are already posted for this round — ${describeScored(impact.scored, nameOf)}.\n\n`
            + "Those scores are NOT deleted and they keep counting on the leaderboard. They stay with the player, so after a re-draw they appear under whichever group that player lands in.\n\n"
            + "You can still adjust the new groups by hand afterward."
          : "You can still adjust them by hand afterward.",
        confirmLabel: "Replace",
        destructive: impact.hasScores,
      });
      if (!ok) return;
    }

    if (cfg.mode === "avoid_repeats") {
      const partners = buildPriorPartners(pairingsData, editRound);
      const anyPrior = Object.keys(partners).length > 0;
      if (!anyPrior) {
        setGenMsg({ tone: "warn", text: `No earlier-round pairings found. Set Round ${editRound - 1} pairings first so there's something to separate.` });
        return;
      }
      const { groups: ng, repeats } = optimizeAvoidRepeats(pids, numGroups, partners);
      const padded = ng.map(g => g.slice());
      while (padded.length < numGroups) padded.push([]);
      commitGroups(padded);
      // With foursomes (groups < 4 in count) some overlap is mathematically forced.
      const zeroPossible = numGroups >= 4;
      if (repeats === 0) {
        setGenMsg({ tone: "ok", text: "Generated — no one repeats a partner from an earlier round." });
      } else {
        setGenMsg({ tone: "warn", text: `Generated with ${repeats} repeat pair${repeats === 1 ? "" : "s"} (the minimum possible).${zeroPossible ? "" : " Foursomes can't be fully separated across only " + numGroups + " groups — each group keeps one returning pair."}` });
      }
      return;
    }

    if (cfg.mode === "leaderboard") {
      // Standings order (best net first), restricted to active players in this field.
      const activeIds = new Set(pids);
      const ordered = (leaderboard || []).filter(p => activeIds.has(p.id));
      const anyScores = ordered.some(p => p.roundsPlayed > 0);
      if (!anyScores) {
        setGenMsg({ tone: "warn", text: "No scores posted yet — leaderboard order isn't set. Play an earlier round first, or pair this round another way." });
        return;
      }
      // Re-rank through the canonical comparator rather than trusting the
      // incoming array's order. Filtering a ranked list does preserve order, so
      // this is a no-op today — but it is the call that makes "pairings are
      // drawn in leaderboard order" true by construction rather than by a
      // convention some future caller could break.
      const orderedIds = rankIndividualBoardIds(ordered);
      // Append any active players missing from the leaderboard array (safety net).
      pids.forEach(id => { if (!orderedIds.includes(id)) orderedIds.push(id); });
      const ng = groupByLeaderboard(orderedIds, numGroups, cfg.leadersLast);
      const padded = ng.map(g => g.slice());
      while (padded.length < numGroups) padded.push([]);
      commitGroups(padded);
      setGenMsg({ tone: "ok", text: `Grouped by current standings — leaders tee off ${cfg.leadersLast ? "last" : "first"}.` });
      return;
    }
  };

  // Parse time string to minutes since midnight
  const parseTime = (str) => {
    if (!str) return null;
    const match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (!match) return null;
    let h = parseInt(match[1]);
    const m = parseInt(match[2]);
    const ampm = (match[3] || "").toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };

  // Format minutes since midnight to time string
  const fmtTime = (mins) => {
    if (mins == null) return "";
    let h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  // Normalize raw input like "800", "8:00", "130" into "8:00 AM", "1:30 PM"
  const normalizeTime = (raw) => {
    if (!raw) return "";
    const stripped = raw.replace(/[^0-9:]/g, "");
    if (!stripped) return raw;
    let h, m;
    if (stripped.includes(":")) {
      const parts = stripped.split(":");
      h = parseInt(parts[0]);
      m = parseInt(parts[1]) || 0;
    } else if (stripped.length <= 2) {
      h = parseInt(stripped);
      m = 0;
    } else {
      // "800" → 8:00, "130" → 1:30, "1030" → 10:30
      const num = parseInt(stripped);
      h = Math.floor(num / 100);
      m = num % 100;
    }
    if (isNaN(h) || h < 0 || h > 23 || m < 0 || m > 59) return raw;
    // Smart AM/PM: 1-6 = PM (afternoon tee times), 7-12 = AM
    const ampm = (h >= 1 && h <= 6) ? "PM" : (h >= 7 && h <= 11) ? "AM" : h === 12 ? "PM" : "AM";
    const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${displayH}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  const updateTeeTime = (gi, value) => {
    const normalized = normalizeTime(value);
    const current = (teeTimesData[editRound] || []).slice();
    while (current.length < numGroups) current.push("");
    current[gi] = normalized;

    // Auto-propagate to subsequent groups
    const newMins = parseTime(normalized);
    if (newMins != null && gi < numGroups - 1) {
      let interval = TEE_INTERVAL_MIN;
      if (gi > 0) {
        const prevMins = parseTime(current[gi - 1]);
        if (prevMins != null) {
          interval = newMins - prevMins;
          if (interval <= 0) interval = TEE_INTERVAL_MIN;
        }
      }
      for (let i = gi + 1; i < numGroups; i++) {
        const baseMins = parseTime(current[i - 1]);
        if (baseMins != null) {
          current[i] = fmtTime(baseMins + interval);
        }
      }
    }

    setTeeTimesData(prev => ({ ...prev, [editRound]: current }));
  };

  const getName = (pid) => activePlayers.find(p => p.id === pid)?.name || pid;
  const getShortName = (pid) => { const n = getName(pid); const parts = n.split(" "); return parts.length > 1 ? parts[0] + " " + parts[1][0] : n; };
  const tapPlayer = (pid) => {
    setSelected(selected === pid ? null : pid);
  };

  const tapSlot = (gi) => {
    if (!selected) return;
    if (groups[gi].length >= 4) return;
    commitGroups(assignToGroup(groups, gi, selected));
  };

  const removeFromGroup = (gi, pid) => {
    commitGroups(removeFromGroupPure(groups, gi, pid));
  };

  const isAssigned = (pid) => groups.some(g => g.includes(pid));

  const tapGroupPlayer = (gi, pid) => {
    if (selected === pid) {
      setSelected(null);
    } else if (selected) {
      // Swap: the tapped player leaves, the selected one takes the seat. One
      // pass — this used to be a remove followed by a setTimeout(0) so the
      // second update could see the first one's result.
      commitGroups(swapIntoGroup(groups, gi, pid, selected));
    } else {
      setSelected(pid);
    }
  };

  return (
    <div>
      {finalizedRounds[editRound] && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: K.bdr + ALPHA.wash, borderRadius: R.sm, marginBottom: 10, border: `1px solid ${K.bdr}${ALPHA.hair}` }}>
          <span style={{ fontSize: FS.small }}>🔒</span>
          <span style={{ fontSize: FS.label, color: K.t3, fontWeight: 600 }}>Round {editRound} is finalized — view only</span>
        </div>
      )}
      <div style={{ opacity: finalizedRounds[editRound] ? 0.6 : 1, pointerEvents: finalizedRounds[editRound] ? "none" : "auto" }}>
      {/* The scoring gate. The play-date field that used to sit beside it is
          gone: the date lives under its round's pill now, on this tab too, and
          two controls for one value three inches apart is how they end up
          disagreeing. The line below still reads the date, because what the
          gate does depends on it. */}
      {onSetRoundDate && (
        <div style={{ background: K.card, borderRadius: R.lg, padding: 10, marginBottom: 12, border: `1px solid ${K.bdr}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Scoring</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
              <div onClick={() => onSetScoringOpen && onSetScoringOpen(editRound, !((scoringOpen || {})[editRound]))} style={{
                display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
                background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1,
              }}>
                {[["Auto", false], ["Open now", true]].map(([label, val]) => {
                  const active = !!((scoringOpen || {})[editRound]) === val;
                  return (
                    <span key={label} style={{
                      fontSize: FS.label, fontWeight: 700, padding: "4px 8px", borderRadius: R.xl, textAlign: "center",
                      background: active ? (val ? K.acc + ALPHA.hair : K.t3 + ALPHA.hair) : "transparent",
                      color: active ? (val ? K.acc : K.t2) : K.t3 + ALPHA.panel,
                      transition: `background ${MOTION}, color ${MOTION}`,
                    }}>{label}</span>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: FS.label, color: K.t3, lineHeight: 1.5 }}>
            {(scoringOpen || {})[editRound]
              ? <>Scoring is <strong style={{ color: K.acc }}>open now</strong> for all groups this round.</>
              : (roundDates || {})[editRound]
                ? <>Scoring opens {SCORING_LEAD_MIN} minutes before tee times on <strong style={{ color: K.t2 }}>{fmtRoundDate((roundDates || {})[editRound])}</strong>.</>
                : <>Set a play date to enable automatic scoring, or flip to <strong style={{ color: K.t2 }}>Open now</strong> to allow scoring immediately.</>}
          </div>
        </div>
      )}
      {/* Pairing method — configurable per round. Manual keeps the hand-set builder
          below; the auto methods fill the groups, which the director can then tweak. */}
      <div style={{ background: K.card, borderRadius: R.lg, padding: 10, marginBottom: 12, border: `1px solid ${K.bdr}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Pairing method</span>
          <div style={{ display: "flex", alignItems: "center", background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1 }}>
            {PAIRING_MODES.map(m => {
              const active = cfg.mode === m;
              return (
                <span key={m} onClick={() => setMode(m)} style={{
                  fontSize: FS.label, fontWeight: 700, padding: "4px 9px", borderRadius: R.xl, textAlign: "center", cursor: "pointer", userSelect: "none",
                  background: active ? K.acc + ALPHA.hair : "transparent",
                  color: active ? K.acc : K.t3 + ALPHA.panel,
                  transition: `background ${MOTION}, color ${MOTION}`,
                }}>{PAIRING_MODE_LABEL[m]}</span>
              );
            })}
          </div>
        </div>

        {cfg.mode === "leaderboard" && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: FS.label, fontWeight: 600, color: K.t3 }}>Leaders tee off</span>
            <div style={{ display: "flex", alignItems: "center", background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1 }}>
              {[["Last", true], ["First", false]].map(([label, val]) => {
                const active = cfg.leadersLast === val;
                return (
                  <span key={label} onClick={() => setLeadersLast(val)} style={{
                    fontSize: FS.label, fontWeight: 700, padding: "4px 9px", borderRadius: R.xl, textAlign: "center", cursor: "pointer", userSelect: "none",
                    background: active ? K.t3 + ALPHA.hair : "transparent",
                    color: active ? K.t2 : K.t3 + ALPHA.panel,
                  }}>{label}</span>
                );
              })}
            </div>
          </div>
        )}

        {cfg.mode !== "manual" && (
          <button onClick={generatePairings} style={{
            marginTop: 10, width: "100%", padding: "9px 0", borderRadius: R.sm, cursor: "pointer",
            background: K.acc + ALPHA.wash, border: `1.5px solid ${K.acc}${ALPHA.line}`, color: K.acc,
            fontSize: FS.small, fontWeight: 700,
          }}>
            {groups.some(g => g.length > 0) ? "Regenerate pairings" : "Generate pairings"}
          </button>
        )}

        {/* Scores with no group. The wreckage of a re-draw that already
            happened: still live in the database and still counting on the
            leaderboard, but invisible on the scoring screen because nobody
            holds a card for them. Surfaced here, where the draw is edited. */}
        {(() => {
          const orphans = orphanedScores({ holeData, groups, round: editRound, players: activePlayers });
          if (!orphans.length) return null;
          const nameOf = (pid) => activePlayers.find(p => p.id === pid)?.name || pid;
          const n = totalHoles(orphans);
          return (
            <div style={{
              marginTop: 8, padding: "8px 10px", borderRadius: R.sm,
              background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.line}`,
              color: K.warn, fontSize: FS.label, fontWeight: 600, lineHeight: 1.5,
            }}>
              {n} hole{n === 1 ? "" : "s"} posted by players not in any Round {editRound} group — {describeScored(orphans, nameOf)}.
              These still count on the leaderboard. Put them back in a group, or discard the card from the Rounds tab.
            </div>
          );
        })()}

        {genMsg && (
          <div style={{
            marginTop: 8, fontSize: FS.label, lineHeight: 1.5, padding: "6px 8px", borderRadius: R.sm,
            background: (genMsg.tone === "ok" ? K.acc : K.warn)  + ALPHA.wash,
            border: `1px solid ${(genMsg.tone === "ok" ? K.acc : K.warn)}30`,
            color: genMsg.tone === "ok" ? K.acc : K.warn,
          }}>{genMsg.text}</div>
        )}
      </div>

      {/* Player pool - 4 per row */}
          <div style={{
            background: K.card, borderRadius: R.lg, padding: 10, marginBottom: 12,
            border: `1px solid ${K.bdr}`,
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
              {activePlayers.map(p => {
                const pid = p.id;
                const isSel = selected === pid;
                const assigned = isAssigned(pid);
                const _tc = (() => { const _tr = tRounds.find(t => t.round_number === editRound); const _c = _tr ? courses.find(c => c.id === _tr.course_id) : null; if (!_c || !getPlayerTee) return null; const _t = getPlayerTee(editRound, pid, _c); if (!_t) return null; const _col = (_t.color||"").toLowerCase(); const _real = _col && _col !== "#ffffff" && _col !== "white" && _col !== "#000000" && _col !== "black" && _col !== "#fff"; return _real ? _t.color : TEE_PALETTE[(_c.tee_boxes||[]).findIndex(tb=>tb.name===_t.name) % TEE_PALETTE.length] || null; })();
                return (
                  <button key={pid} onClick={() => tapPlayer(pid)} style={{
                    padding: "6px 6px", borderRadius: R.sm, cursor: "pointer", textAlign: "left",
                    background: isSel ? K.acc + ALPHA.tint : K.hover,
                    border: `1.5px solid ${isSel ? K.acc : K.bdr}`,
                    color: isSel ? K.acc : K.t1,
                    opacity: assigned && !isSel ? DIM_PLACED : 1,
                    transition: `opacity ${MOTION}`,
                  }}>
                    <div style={{ fontSize: FS.label, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 3 }}>
                      <TeeDot color={_tc} />
                      {getShortName(pid)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

      {/* Groups */}
      {groups.map((grp, gi) => {
        const canDrop = selected && grp.length < 4 && !grp.includes(selected);
        const teeTime = ((teeTimesData[editRound] || [])[gi]) || "";
        return (
          <div key={gi} onClick={() => { if (canDrop) tapSlot(gi); }} style={{
            background: K.card, borderRadius: R.lg, marginBottom: 8, padding: 10,
            border: `1.5px solid ${canDrop ? K.acc : K.bdr}`,
            cursor: canDrop ? "pointer" : "default",
            transition: `border-color ${MOTION}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: grp.length > 0 ? 6 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc }}>Group {gi + 1} <span style={{ fontWeight: 400, color: K.t3, fontSize: FS.micro }}>({grp.length}/4)</span></span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Tee time"
                  value={teeTime}
                  onClick={e => e.stopPropagation()}
                  onChange={e => {
                    const current = (teeTimesData[editRound] || []).slice();
                    while (current.length < numGroups) current.push("");
                    current[gi] = e.target.value;
                    setTeeTimesData(prev => ({ ...prev, [editRound]: current }));
                  }}
                  onBlur={e => { updateTeeTime(gi, e.target.value); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); } }}
                  style={{
                    width: 74, padding: "2px 4px", borderRadius: R.xs,
                    border: `1px solid ${teeTime ? K.acc + ALPHA.hair : K.warn}`,
                    background: teeTime ? K.acc + ALPHA.wash : K.warn + ALPHA.wash,
                    color: teeTime ? K.acc : K.warn,
                    fontSize: FS.micro, fontWeight: 600, textAlign: "center",
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {canDrop && <span style={{ fontSize: FS.micro, color: K.acc, fontWeight: 600 }}>Tap to add {getShortName(selected)}</span>}
                {grp.length > 0 && (
                  <span onClick={e => { e.stopPropagation(); commitGroups(clearGroup(groups, gi)); }} style={{ fontSize: FS.micro, color: K.danger, cursor: "pointer", border: `1px solid ${K.danger}${ALPHA.hair}`, borderRadius: R.xs, padding: "1px 5px", fontWeight: 600 }}>Clear</span>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
              {grp.map(pid => {
                const isSel = selected === pid;
                const _tc2 = (() => { const _tr = tRounds.find(t => t.round_number === editRound); const _c = _tr ? courses.find(c => c.id === _tr.course_id) : null; if (!_c || !getPlayerTee) return null; const _t = getPlayerTee(editRound, pid, _c); if (!_t) return null; const _col = (_t.color||"").toLowerCase(); const _real = _col && _col !== "#ffffff" && _col !== "white" && _col !== "#000000" && _col !== "black" && _col !== "#fff"; return _real ? _t.color : TEE_PALETTE[(_c.tee_boxes||[]).findIndex(tb=>tb.name===_t.name) % TEE_PALETTE.length] || null; })();
                return (
                  <button key={pid} onClick={e => { e.stopPropagation(); tapGroupPlayer(gi, pid); }} style={{
                    // Room on the right for the ✕ that sits over this corner —
                    // a centred name cleared it by luck, a left-aligned one
                    // would run its ellipsis underneath.
                    padding: "6px 12px 6px 6px", borderRadius: R.sm, textAlign: "left", cursor: "pointer", position: "relative",
                    background: isSel ? K.acc + ALPHA.tint : K.hover,
                    border: `1.5px solid ${isSel ? K.acc : K.bdr}`,
                    color: K.t1,
                  }}>
                    <span onClick={e => { e.stopPropagation(); removeFromGroup(gi, pid); }} style={{
                      position: "absolute", top: 1, right: 3, background: "transparent", border: "none",
                      color: K.t3, fontSize: FS.micro, cursor: "pointer", padding: 0, lineHeight: 1,
                    }}>✕</span>
                    <div style={{ fontSize: FS.label, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 3 }}>
                      <TeeDot color={_tc2} />
                      {getShortName(pid)}
                    </div>
                  </button>
                );
              })}
              {Array.from({ length: 4 - grp.length }).map((_, si) => (
                <div key={`e${si}`} onClick={e => { e.stopPropagation(); if (selected) tapSlot(gi); }} style={{
                  borderRadius: R.sm, border: `1.5px dashed ${canDrop ? K.acc + ALPHA.line : K.bdr}`,
                  minHeight: 38, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: canDrop ? "pointer" : "default",
                }}>
                  <span style={{ fontSize: FS.body, color: canDrop ? K.acc + ALPHA.line : K.t3 + ALPHA.hair, fontWeight: 300 }}>+</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      </div>
      <ConfirmModal modal={confirmModal} />
    </div>
  );
}

// Reading a golf course out of the two public APIs — the parsing, the state
// matching and the 113-means-we-do-not-know rule — is in lib/courseSearch,
// with a test. Imported at the top of this file.

function TeeAssigner({ activePlayers, tRounds, courses, teeData, setTeeBulk, finalizedRounds, editRound, teesSaved, onTeesModify }) {

  const tr = tRounds.find(t => t.round_number === editRound);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;
  const tees = course?.tee_boxes || [];
  const assignments = (teeData || {})[editRound] || {};
  const [chDeltas, setChDeltas] = useState({});

  // One timer per player, so a second move for the same player restarts THAT
  // badge rather than being cut short by the first move's timer still running.
  const deltaTimers = useRef({});
  useEffect(() => () => { Object.values(deltaTimers.current).forEach(clearTimeout); }, []);

  // Flash what a move does to every course handicap it changes. Both ways of
  // moving a tee go through here — one player, or the whole field off a tile —
  // because they are the same event and the field-wide one is the bigger news.
  const flashDeltas = (next) => {
    const deltas = chDeltasFor(activePlayers, tees, assignments, next);
    const ids = Object.keys(deltas);
    if (ids.length === 0) return;
    setChDeltas(prev => ({ ...prev, ...deltas }));
    ids.forEach(id => {
      clearTimeout(deltaTimers.current[id]);
      deltaTimers.current[id] = setTimeout(() => {
        delete deltaTimers.current[id];
        setChDeltas(prev => { const n = { ...prev }; delete n[id]; return n; });
      }, CH_DELTA_MS);
    });
  };

  const commit = (next) => {
    flashDeltas(next);
    setTeeBulk(editRound, next);
    if (teesSaved && teesSaved[editRound]) onTeesModify && onTeesModify(editRound);
  };

  const assign = (pid, teeName) => commit({ ...assignments, [pid]: teeName });

  const setAll = (teeName) => {
    const bulk = {};
    activePlayers.forEach(p => { bulk[p.id] = teeName; });
    commit(bulk);
  };

  // Per-player tees are folded away. Almost every field plays the tee the
  // director set for everyone, so the list of names below the Set-all row was
  // a page of confirmation that nothing was different — and the space it took
  // is where this round's foursomes go now. It opens when one player needs a
  // different box.
  const [openTees, setOpenTees] = useState(false);

  // No course, nothing to assign tees from. This used to read
  // `!finalized && !course`, which let a FINALIZED round with no course
  // through to `course.name` below and crashed the console.
  if (!course) return null;

  return (
    <div style={{ opacity: finalizedRounds[editRound] ? 0.6 : 1, pointerEvents: finalizedRounds[editRound] ? "none" : "auto" }}>
      <div>
        <div>
          {/* The course's tee list, and the set-all control — one thing, not the
              two it used to be (read-only chips on the course card, plus a stack
              of tall buttons here). Slope/rating sits UNDER the colour and name
              rather than beside it, which is what lets three tees share the width
              of a phone; each tile takes an equal share and wraps past four.
              No "Set all" label: the tiles are the only tap targets in the row,
              they carry the same swatches as the player rows below, and the
              title says what tapping does for anyone who hovers. */}
          {tees.length > 0 && !finalizedRounds[editRound] && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(68px, 1fr))", gap: 4, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
              {[...tees].sort((a, b) => (parseFloat(b.slope) || 0) - (parseFloat(a.slope) || 0)).map(tee => {
                // In use = at least one player is on it this round, counting the
                // default nobody has moved off. The accent edge is what tells you
                // at a glance which boxes this round is actually played from —
                // one on a normal round, two when somebody is moved up or back.
                const inUse = activePlayers.some(p =>
                  (assignments[p.id] || getDefaultTee(tees)?.name || tees[0]?.name) === tee.name);
                return (
                <button key={tee.name} onClick={() => setAll(tee.name)} title={`Put every player on ${tee.name}`} style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 0,
                  padding: "5px 4px", borderRadius: R.sm,
                  background: K.inp, border: `1px solid ${inUse ? K.acc : K.bdr}`, color: K.t1, cursor: "pointer",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: "100%", minWidth: 0 }}>
                    <TeeColorSwatch color={resolveTeeColor(tee, 0)} name={tee.name} size={11} style={{ borderRadius: R.xs, flexShrink: 0 }} />
                    <span style={{ fontSize: FS.label, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tee.name}</span>
                  </span>
                  <span style={{ fontSize: FS.micro, color: K.t3, lineHeight: 1 }}>{tee.slope}/{tee.rating}</span>
                </button>
                );
              })}
            </div>
          )}

          {/* The confirm control is a tick beside Edit in the card header — a
              full-width bar to say "yes, those tees" cost more room than the
              tee list it confirmed. See TeeConfirmTick. */}

          {/* Per-player tee assignment */}
          <button onClick={() => setOpenTees(o => !o)} style={{
            width: "100%", marginTop: 8, padding: "8px 14px", background: "transparent", border: "none",
            borderTop: `1px solid ${K.bdr}${ALPHA.hair}`, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          }}>
            <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Player tees
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {/* What the list would say if it were open: one tee, or the split.
                  A player with NO assignment used to be counted onto the
                  default tee here, so a round where two men had nothing read
                  "All BLUE" — the summary agreeing that everything was fine
                  while the warning above it said otherwise. They are counted
                  as what they are now, and said last and in red. */}
              {(() => {
                const counts = {};
                let none = 0;
                activePlayers.forEach(p => {
                  const t = assignments[p.id];
                  if (!t || !tees.some(tb => tb.name === t)) { none++; return; }
                  counts[t] = (counts[t] || 0) + 1;
                });
                const names = Object.keys(counts);
                const summary = names.length === 0 ? "" : names.length === 1 && !none ? `All ${names[0]}` : names.map(n => `${counts[n]} ${n}`).join(" · ");
                return (
                  <span style={{ fontSize: FS.label, fontWeight: 700, color: names.length === 1 && !none ? K.t2 : K.acc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {summary}
                    {none > 0 && <span style={{ color: K.danger }}>{summary ? " · " : ""}{none} none</span>}
                  </span>
                );
              })()}
              <span style={{ fontSize: FS.label, color: K.t3 }}>{openTees ? "▲" : "▼"}</span>
            </span>
          </button>
          <div style={{ overflow: "hidden", display: openTees ? "block" : "none" }}>
            <div>
            {/* HI and CH are columns, headed once, not a run of prose on every
                row. The director reads them DOWN — who is off what, who moved
                — and a label repeated forty times is forty things in the way of
                that. They read at the name's own size — they were a footnote
                under it, and they are half of what the row says. */}
            <div style={{
              padding: "3px 12px", display: "flex", alignItems: "center", gap: 6,
              borderBottom: `1px solid ${K.bdr}${ALPHA.hair}`,
            }}>
              <span style={{ flex: 1, minWidth: 0 }} />
              {["HI", "CH"].map(h => (
                <span key={h} style={{
                  width: CH_COL_W, textAlign: "right", fontSize: FS.micro, fontWeight: 700,
                  color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em",
                }}>{h}</span>
              ))}
              <span style={{ width: tees.length * TEE_BTN_W + Math.max(0, tees.length - 1) * TEE_BTN_GAP, flexShrink: 0 }} />
            </div>
            {activePlayers.map((p, i) => {
              // No fallback to the default tee. This row used to read
              // `assignments[p.id] || defaultTee?.name`, which drew the default
              // box as SELECTED and printed a course handicap off it — so a
              // player who had never been assigned anything looked, on the one
              // screen whose job is to show tee assignments, exactly like a
              // player who had. An empty assignment is now empty: no tee lit,
              // no CH, and the name in red.
              const currentTee = assignments[p.id] || "";
              const teeObj = tees.find(t => t.name === currentTee);
              const ch = teeObj ? calcCH(p.handicap_index, teeObj.slope, teeObj.rating, teeObj.par) : null;
              return (
                <div key={p.id} style={{
                  padding: "5px 12px", display: "flex", alignItems: "center", gap: 6,
                  borderBottom: i < activePlayers.length - 1 ? `1px solid ${K.bdr}${ALPHA.wash}` : "none",
                }}>
                  <span style={{
                    flex: 1, minWidth: 0, fontWeight: 600, fontSize: FS.small, color: teeObj ? K.t1 : K.danger,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{p.name}</span>
                  <span style={{
                    width: CH_COL_W, flexShrink: 0, textAlign: "right",
                    fontSize: FS.small, fontWeight: 600, color: K.t2, fontVariantNumeric: "tabular-nums",
                  }}>{p.handicap_index}</span>
                  <span style={{
                    width: CH_COL_W, flexShrink: 0, display: "flex", alignItems: "center",
                    justifyContent: "flex-end", gap: 2,
                  }}>
                    {/* The delta rides inside the CH column so a tee change
                        moves the number the director is watching, not a note
                        beside it. */}
                    {chDeltas[p.id] !== undefined && (
                      <span style={{ fontSize: FS.micro, fontWeight: 700, color: chDeltas[p.id] > 0 ? K.ok : K.danger, lineHeight: 1 }}>
                        {chDeltas[p.id] > 0 ? "▲" : "▼"}{Math.abs(chDeltas[p.id])}
                      </span>
                    )}
                    <span style={{
                      fontSize: FS.small, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      color: teeObj ? K.t1 : K.danger,
                    }}>{teeObj ? ch : "—"}</span>
                  </span>
                  <div style={{ display: "flex", gap: TEE_BTN_GAP, flexShrink: 0 }}>
                    {[...tees].sort((a, b) => (parseFloat(b.slope) || 0) - (parseFloat(a.slope) || 0)).map(tee => {
                      const isActive = currentTee === tee.name;
                      return (
                        <button key={tee.name} onClick={() => assign(p.id, tee.name)} style={{
                          width: TEE_BTN_W, padding: "4px 3px 3px", borderRadius: R.sm, cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                          background: isActive ? K.acc + ALPHA.tint : K.inp,
                          border: isActive ? `1.5px solid ${K.acc}` : `1px solid ${K.bdr}`,
                          transform: isActive ? "scale(1.08)" : "scale(1)",
                          transition: `background ${MOTION} ease, border-color ${MOTION} ease, transform ${MOTION} ease`,
                          willChange: "transform",
                        }}>
                          <TeeColorSwatch color={resolveTeeColor(tee, 0)} name={tee.name} size={14} style={{ borderRadius: R.xs }} />
                          <span style={{ fontSize: FS.micro, fontWeight: 700, color: isActive ? K.acc : K.t3, lineHeight: 1, transition: `color ${MOTION} ease` }}>{tee.name.split("/")[0].substring(0,5)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// The three ways this app says who somebody is — toDisplayName, fullName and
// splitName — are in lib/playerNames with a test.
//
// `holesEntered` was ALSO here, byte-identical to the one in lib/scoreGuard,
// which is the module that owns the question. This file imports that one now.

// ── PlayerRow ──
// A read-only summary line. All editing moved into PlayerEditor, following
// Bourbon Cup: the previous design swapped this row for a cramped set of
// inline inputs, which is why it could only ever expose a name and an index —
// there is no room on a phone row for anything more.
function PlayerRow({ player, isLast, onOpen, isDirector, account }) {
  return (
    <button onClick={onOpen} style={{
      width: "100%", textAlign: "left", cursor: "pointer", background: "transparent",
      border: "none", borderBottom: !isLast ? `1px solid ${K.bdr}${ALPHA.hair}` : "none",
      padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: FS.body, fontWeight: 600, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {/* 🔗 = this name is claimed by a signed-in account. It replaces the
              "Signed in" list that used to sit in the Event tab restating the
              roster: the question it answered — who can actually post a score —
              is about a player, so it belongs on the player. */}
          {player.name}{account && " 🔗"}{isDirector && " 👑"}
        </div>
        <div style={{ fontSize: FS.label, color: K.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {account?.email || (fullName(player) !== player.name ? fullName(player) : " ")}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        <div style={{ fontSize: FS.body, fontWeight: 800, color: K.t1 }}>{player.handicap_index}</div>
        <div style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, letterSpacing: 1 }}>INDEX</div>
      </div>
      <span style={{ flexShrink: 0, color: K.t3, fontSize: FS.body }}>›</span>
    </button>
  );
}

// ── PlayerEditor ──
// One modal that owns the whole player record, ported from Bourbon Cup's
// Admin. Everything commits on Save, so add and edit behave identically and
// Cancel genuinely discards.
//
// The director toggle IS the grant: it writes `is_director` on that person's
// membership document, the only flag firestore.rules honours. Two things it
// deliberately cannot do, both enforced by the rules rather than here —
// appoint somebody who has never been through the password screen (there is
// no membership document to flag), and change your own (so the last director
// can never lock everyone out).
//
// `returning` is the other half of setting up a new year: the men who have
// played before and are not in this field. Typing a returning player's name
// from memory is the one way to silently break him — his id comes from his
// display name, so a nickname or a full surname mints a second record while
// his account claim still points at the first — so the picker hands back the
// id off his record rather than deriving one. See lib/returningPlayers.
function PlayerEditor({ editing, set, onClose, tPlayers, players, memberships, claims, authUid,
                        holeData, numRounds, onSave, onRemove, askDelete, notify, confirm, tournamentStarted,
                        returning = [], indexOf = indexFor }) {
  if (!editing) return null;
  const isNew = !!editing.isNew;
  const p = isNew ? null : players.find(x => x.id === editing.pid);
  if (!isNew && !p) return null;

  const defaultNick = toDisplayName(editing.first, editing.last);
  // ── The number this field is overriding ──
  // The WBC Index is the source of truth for what a golfer plays off; the field
  // below is this edition's copy of it, which a director may depart from. So
  // the index is shown beside the field rather than left in another tab: an
  // override you cannot see the original of is just a number somebody typed.
  //
  // For a NEW player it resolves off the name being typed, which is what lets a
  // returning golfer arrive with their own index already offered.
  const wbcRef = (() => {
    const subject = p || { name: editing.nick || defaultNick, first_name: editing.first, last_name: editing.last };
    const histName = matchHistoryName(subject);
    // A name the record books have never heard of can still have rounds: last
    // year's first-timer, whose whole career is in the years the bundled
    // history has not caught up with. `indexOf` knows about those, so it is
    // asked even when the name matches nothing — see lib/liveHistory.
    const idx = indexOf(histName, p?.id, p?.index_override ?? null);
    return idx?.index == null ? null : idx;
  })();
  const wbcDiffers = !!wbcRef && String(parseFloat(editing.hi) || 0) !== String(wbcRef.index);
  const showPicker = isNew && !editing.linked && returning.length > 0;
  const theirMembership = isNew ? null : membershipForPlayer(memberships, claims, editing.pid);
  const isSelf = !!theirMembership && (theirMembership.id === authUid || theirMembership.uid === authUid);
  const canGrantDirector = !isNew && !!theirMembership && !isSelf;

  // Four reasons the toggle can be unavailable, and they want four different
  // actions from the director. Telling them apart matters most for the last:
  // an unreadable accounts list looks exactly like "nobody has signed in",
  // and the fix has nothing to do with the player on screen.
  const directorHint = isNew
    ? "Add them first, then they sign in and claim this name."
    : accountsUnreadable(memberships)
      ? "Can't read the accounts list, so no crown can be changed. The rules deployed to Firebase are probably older than this app — re-publish firestore.rules, then reopen this."
      : !theirMembership
        ? "They need to sign in and claim this name first."
        : isSelf
          ? "You can't change your own — that's what stops the last director locking everyone out. Ask the other director, or edit it in the Firebase console."
          : "Grants the Admin tab, and every write behind it.";

  const lbl = { fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5, color: K.t3, textTransform: "uppercase", marginBottom: 3, display: "block" };
  // FS.lead (16px) on purpose — anything smaller makes iOS Safari zoom the
  // page on focus and never zoom back out. Height is condensed via padding.
  const inp = { fontSize: FS.lead, fontWeight: 600, color: K.t1, width: "100%", boxSizing: "border-box", background: K.inp, border: `1px solid ${K.acc}${ALPHA.line}`, borderRadius: R.sm, padding: "7px 10px", outline: "none", fontFamily: FONT };

  // Picking a returning player fills the form from his record — including the
  // WBC Index, which is the app's own number for him and the best first guess
  // at what he plays off. Every box stays editable; the id is the part that is
  // now settled, and it is the part that was never safe to type.
  const pickReturning = (r) => set({
    linked: { id: r.id, name: r.name },
    first: r.first,
    last: r.last,
    nick: isGeneratedName(r.name, r.first, r.last) ? "" : r.name,
    hi: r.index == null ? "" : r.index.toFixed(1),
  });

  const doSave = async () => {
    const first = (editing.first || "").trim();
    const last = (editing.last || "").trim();
    if (!first) { notify?.("Enter a first name"); return; }
    const newName = (editing.nick || "").trim() || toDisplayName(first, last);
    const newHI = parseFloat(editing.hi) || 0;
    const newDir = !!editing.dir;

    if (isNew) {
      // pid is the whole point of the picker: with one, the roster row binds
      // to the record that already exists. Without it the caller derives an id
      // from the name, which is right for a genuine first-timer.
      await onSave({ isNew: true, name: newName, first, last, hi: newHI, pid: editing.linked?.id || null });
      notify?.(`Added ${newName}`);
      onClose();
      return;
    }

    const tp = tPlayers.find(x => x.player_id === editing.pid);
    const oldHI = parseFloat(tp?.handicap_index) || 0;
    const wasDir = theirMembership?.is_director === true;
    const dirChanged = canGrantDirector && newDir !== wasDir;

    const changes = [];
    if (first !== (p.first_name || "") || last !== (p.last_name || "") || newName !== p.name)
      changes.push(`Name → ${[first, last].filter(Boolean).join(" ")} (shows as "${newName}")`);
    if (newHI !== oldHI) changes.push(`Index: ${oldHI} → ${newHI}`);
    if (dirChanged) changes.push(`Director: ${wasDir ? "Yes" : "No"} → ${newDir ? "Yes" : "No"}`);
    if (changes.length === 0) { onClose(); return; }

    // The handicap-lock warning, stated as part of the same confirmation
    // rather than as a second dialog behind it. WBC recalculates every
    // round's net score from the CURRENT index, so this is the one edit here
    // that can silently rewrite finished rounds.
    let impact = "";
    if (newHI !== oldHI && tournamentStarted)
      impact += "\n\nHandicaps are locked in for the tournament. Changing this index retroactively recalculates their net scores for ALL rounds — including finalized ones — and can reshuffle the leaderboard.";
    if (dirChanged) impact += newDir
      ? "\n\nA director can do everything in Admin: the roster, rounds, pairings, courses, tee times, settings, editions and the access password."
      : "\n\nThey keep their name and everything a player does — scores, skins, signatures. They lose the Admin tab.";

    if (!(await confirm({ title: "Confirm changes", message: changes.join("\n") + impact }))) return;

    await onSave({
      pid: editing.pid, name: newName, first, last, hi: newHI,
      hiChanged: newHI !== oldHI,
      dir: dirChanged ? { uid: theirMembership.id || theirMembership.uid, on: newDir } : null,
    });
    onClose();
  };

  // ── Move to inactive ──
  // The same write this has always done — the edition's roster row goes, the
  // player record stays — said as what it is. It was a 🗑 in danger red, which
  // is a promise of destruction the action never kept: a man taken off this
  // year's field keeps his career, his index and his sign-in, and the Players
  // tab already files him under "Inactive" rather than forgetting him. The red
  // trash can made a routine bit of new-year setup — two men not coming this
  // time — look like the button that erases fourteen years of golf.
  //
  // Destructive styling is kept for exactly one case: a player with holes
  // already posted. Taking him off the roster mid-tournament really does stop
  // those counting, and that is worth a red confirm and a nudge toward WD,
  // which is the action that keeps his card.
  const doDeactivate = async () => {
    const scored = Array.from({ length: numRounds }, (_, i) => i + 1)
      .map(r => ({ r, holes: holesEntered(holeData, editing.pid, r) }))
      .filter(x => x.holes > 0);
    const total = scored.reduce((n, s) => n + s.holes, 0);
    const msg = ["They come off this year's roster and move to Inactive on the Players tab."];
    if (total) msg.push("", `${total} scored hole${total === 1 ? "" : "s"} stay in the database (${scored.map(s => `Rd ${s.r}: ${s.holes}`).join(", ")}) but stop counting. If they started and quit, WD on the scoring screen is the better move — it keeps their card.`);
    msg.push("", "Their record, their index and their sign-in are untouched. Add them back any year from + Add player.");
    if (await confirm({
      title: `Move ${fullName(p) || p.name} to inactive?`,
      message: msg.join("\n"),
      confirmLabel: "Move to inactive",
      destructive: total > 0,
    })) {
      onRemove(editing.pid);
      onClose();
    }
  };

  // ── Delete outright ──
  // The action "Move to inactive" is not, offered only where it is the right
  // one. A player the record books know has a career behind his id, and there
  // is no dialog that makes deleting one a thing this app does — so the button
  // is not there at all for him, rather than there and refusing.
  //
  // That leaves it where it is actually wanted: a name typed into the demo
  // edition, and "Aron" added at 11pm and re-added correctly a minute later.
  // Neither is a golfer standing down for a year, and until this the only way
  // to be rid of one was the Firebase console.
  //
  // The asking and the writing live in AdminView (askDelete), because the same
  // decision is raised from two places — here, and the off-roster list on the
  // Players tab, where a demo player already moved to inactive has to be
  // reachable at all.
  //
  // "The record books know him" is now two records: the bundled history, and
  // the WBCs played since it was last generated. A man whose only tournament
  // is in the second half has a career too — `wbcRef` is what says so — and
  // deleting him would take it with him.
  const canDelete = !isNew && !!askDelete && !matchHistoryName(p) && !wbcRef;

  const doDelete = async () => {
    const done = await askDelete({
      pid: editing.pid,
      name: fullName(p) || p.name,
      historyName: matchHistoryName(p),
    });
    if (done) onClose();
  };

  return (
    <Popup onClose={onClose} maxWidth={420} padding={0} portal innerStyle={{ background: K.card }} zIndex={3000} noBackdropClose>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: `1px solid ${K.bdr}` }}>
        <div style={{ flex: 1, fontSize: FS.body, fontWeight: 800, color: K.t1 }}>{isNew ? "Add Player" : "Edit Player"}</div>
        <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${K.bdr}`, background: "transparent", color: K.t2, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
        {/* ── Played before? ──
            First thing in the form, because it is the first decision: is this
            a man coming back, or a man who has never been here? Picking him
            answers the rest of the form as a side effect. */}
        {isNew && editing.linked && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
            borderRadius: R.sm, background: `${K.acc}${ALPHA.wash}`, border: `1px solid ${K.acc}${ALPHA.line}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: FS.small, fontWeight: 700, color: K.acc, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Returning · {editing.linked.name}
              </div>
              <div style={{ fontSize: FS.micro, color: K.t3, marginTop: 1 }}>
                Keeps their career, their index and their sign-in.
              </div>
            </div>
            <Btn variant="secondary" size="sm" style={{ color: K.t2, flexShrink: 0 }}
              onClick={() => set({ linked: null, first: "", last: "", nick: "", hi: "" })}>Change</Btn>
          </div>
        )}
        {showPicker && (
          <div>
            <span style={lbl}>Played before?</span>
            <div style={{ maxHeight: 168, overflowY: "auto", border: `1px solid ${K.bdr}`, borderRadius: R.sm }}>
              {returning.map((r, i) => (
                <button key={r.id} type="button" onClick={() => pickReturning(r)} style={{
                  width: "100%", textAlign: "left", cursor: "pointer", background: "transparent",
                  border: "none", borderBottom: i === returning.length - 1 ? "none" : `1px solid ${K.bdr}${ALPHA.hair}`,
                  padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, fontFamily: FONT,
                }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.name}
                    </span>
                    <span style={{ display: "block", fontSize: FS.micro, color: K.t3, marginTop: 1 }}>
                      {returningLine(r)}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, fontSize: FS.small, fontWeight: 800, color: r.index == null ? K.t3 : K.acc }}>
                    {r.index == null ? "—" : r.index.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: FS.label, color: K.t3, marginTop: 5, lineHeight: 1.4 }}>
              Tap a name to bring them back with their record attached — typing it again can
              file them as a second player.
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {/* Not autofocused while the picker is up: on a phone the keyboard
              would slide over the list the director came here to read. */}
          <label style={{ flex: 1, minWidth: 0 }}><span style={lbl}>First name</span>
            <input autoFocus={!showPicker} value={editing.first} onChange={e => set({ first: e.target.value })} style={inp} /></label>
          <label style={{ flex: 1, minWidth: 0 }}><span style={lbl}>Last name</span>
            <input value={editing.last} onChange={e => set({ last: e.target.value })} style={inp} /></label>
        </div>

        {/* Nickname and Director paired on one row, like First/Last. */}
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ flex: 1, minWidth: 0 }}><span style={lbl}>Nickname</span>
            <input value={editing.nick} placeholder={defaultNick} onChange={e => set({ nick: e.target.value })} style={inp} /></label>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={lbl}>Director</span>
            <button type="button" disabled={!canGrantDirector} title={directorHint}
              onClick={() => set({ dir: !editing.dir })}
              style={{ fontSize: FS.body, fontWeight: 700, padding: "7px 10px", borderRadius: R.sm, cursor: canGrantDirector ? "pointer" : "default", width: "100%", boxSizing: "border-box", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: canGrantDirector ? 1 : 0.5,
                border: `1px solid ${editing.dir ? K.acc : K.bdr}`, background: editing.dir ? K.acc + ALPHA.wash : "transparent", color: editing.dir ? K.acc : K.t2 }}>
              {editing.dir ? "👑 Director" : "Player"}
            </button>
          </div>
        </div>
        {!canGrantDirector && (
          <div style={{ fontSize: FS.label, color: K.t3, marginTop: -6, lineHeight: 1.4 }}>{directorHint}</div>
        )}

        {/* No password field. There is ONE password and it belongs to the
            event, not to a player — Admin → Event → Event password. A
            per-player one was left over from the PIN login this app replaced
            with Google/Apple sign-in, and it read as though a director had to
            hand out twelve of them. */}
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={lbl}>Index</span>
            <input type="number" inputMode="decimal" step="0.1" value={editing.hi} placeholder={wbcRef ? String(wbcRef.index) : "0"} onChange={e => set({ hi: e.target.value })} style={inp} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={lbl}>WBC Index</span>
            {wbcRef ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: FS.lead, fontWeight: 800, color: K.acc }}>
                  {wbcRef.index.toFixed(1)}
                  {(wbcRef.stale || wbcRef.overridden) && <span style={{ color: K.warn }}>*</span>}
                </span>
                {wbcDiffers && (
                  <Btn size="sm" variant="secondary" onClick={() => set({ hi: String(wbcRef.index) })}>Use</Btn>
                )}
              </div>
            ) : (
              <div style={{ fontSize: FS.small, color: K.t3, paddingTop: 6 }}>no rounds yet</div>
            )}
          </div>
        </div>
        {wbcRef && wbcDiffers && (
          <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.45, marginTop: -4 }}>
            This edition plays off <strong style={{ color: K.t1 }}>{(parseFloat(editing.hi) || 0).toFixed(1)}</strong>,
            not the {wbcRef.index.toFixed(1)} their record computes to. That override is what the Players tab shows
            in its year column.
          </div>
        )}
        {!isNew && tournamentStarted && (
          <div style={{ fontSize: FS.label, color: K.warn, lineHeight: 1.45 }}>
            The tournament has started — changing an index re-scores every round, including finalized ones.
          </div>
        )}

        {/* ── Status ──
            In the form rather than in the footer beside Cancel and Save,
            because it is not a form action: it does not wait for Save and it
            does not edit a field. It states where this man stands this year
            and offers the one move away from it. */}
        {!isNew && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            paddingTop: 11, borderTop: `1px solid ${K.bdr}${ALPHA.hair}`,
          }}>
            {/* "Active" alone, with no explaining clause after it: on a 360px
                phone the row is the button plus about 150px, and a sentence
                that ellipsises mid-word reads worse than the one word that
                fits. What it means is in the confirmation. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={lbl}>Status</span>
              <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Active
              </div>
            </div>
            <Btn variant="secondary" size="sm" onClick={doDeactivate}
              title="Take them off this year's roster"
              style={{ flexShrink: 0, color: K.t2, whiteSpace: "nowrap" }}>
              Move to inactive
            </Btn>
          </div>
        )}

        {/* ── Delete ──
            On its own line under the status row rather than beside "Move to
            inactive". The row is the button plus about 150px on a 360px phone,
            so a second one there would ellipsise both — and putting the
            destructive action next to the routine one, at the same size, is
            how a director taps the wrong one during setup.
            Right-aligned and quiet: it is the rarer action of the two, and the
            confirmation is where it gets loud. */}
        {canDelete && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4 }}>
            <Btn variant="dangerOutline" size="sm" onClick={doDelete}
              title="Delete this player and their record"
              style={{ whiteSpace: "nowrap" }}>
              Delete player
            </Btn>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderTop: `1px solid ${K.bdr}` }}>
        <span style={{ flex: 1 }} />
        <Btn variant="secondary" onClick={onClose} style={{ color: K.t2 }}>Cancel</Btn>
        <Btn onClick={doSave} style={{ paddingLeft: 20, paddingRight: 20 }}>{isNew ? "Add" : "Save"}</Btn>
      </div>
    </Popup>
  );
}

// ── ADMIN → SETTINGS → ACCESS ──
// The director's half of the door. Two things live here, and both of them are
// enforced by firestore.rules rather than by this screen:
//
//   • The tournament password (wbc_secrets/access). Only a director may read
//     or change it. SAVING IT BLANK TURNS THE REQUIREMENT OFF — the rules
//     treat a missing or empty code as an open door, which is the bootstrap
//     that makes the very first setup possible.
//
//   • Who is a director (`is_director` on each wbc_accounts document). This is
//     the ONLY flag the rules honour and the only thing the app reads to
//     decide whether the Admin tab exists, so the crown here and the access
//     behind it can never disagree.
//
// Two things the crown deliberately cannot do, both enforced by the rules:
// appoint somebody who has never been through the password screen (there is no
// membership document to flag), and change your own (nobody appoints
// themselves, and nobody steps down from inside the app — which means the last
// director can never leave the tournament unadministered). Stepping down is a
// console edit, and so is the FIRST director, since the rule requires one to
// already exist.
// ── ADMIN → SETTINGS → EVENT ──
// Tournament identity: the name and location shown in the app header and on
// the login screen. Ported from Bourbon Cup's Admin "Tournament" tab.
//
// Before this, both were baked into the TOURNAMENT constant at the top of
// file, so renaming the event — or moving it to a different course town — was
// a code change and a redeploy. They are now a document, and the constant is
// the fallback used until one is saved.
//
// One card and one Save for both, because they are the same sentence on every
// screen that shows them ("WBC 2026 · Gaylord, MI"), and a director renaming
// the event for a new venue would otherwise have to remember two saves. An
// empty field falls back to its constant rather than saving blank, so the
// header can't end up with a hole in it.
// ── DateRangeCalendar ──────────────────────────────────────────────────────
// The event's dates, picked the way a hotel or airline picks them: tap the
// first day, tap the last, and the days between shade in as the stay.
//
// This replaces two <input type="date"> fields, which could not do the two
// things that matter here. They cannot shade anything — a four-day tournament
// looked like two unrelated dates — and the second one opens on TODAY'S month
// with no idea the first was just set, so picking Aug 26 then opening the end
// field put a director in February. One calendar has no second field to
// mis-open: after the first tap it is already on the right month, waiting for
// the second.
//
// Local ISO strings ("YYYY-MM-DD") throughout, never Date objects across a
// boundary: `new Date("2026-08-26")` parses as UTC midnight and renders as the
// 25th anywhere west of Greenwich, which is the classic way a tournament ends
// up a day early.
const MAX_EVENT_DAYS = 14;
// "Wed, Aug 26" -> "Wed 26". The month is the same for every day of a normal
// event, and dropping it is what fits a date under a round pill.
const chipDate = (iso, withMonth = false) =>
  withMonth ? fmtRoundDate(iso) : fmtRoundDate(iso).replace(/,?\s\w+\s(\d+)$/, " $1");
const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const isoAddDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
// `mode="day"` picks a single date instead of a range — same grid, same month
// paging, one tap. It exists because the round's play date used to fall back to
// an <input type="date"> when the event had no dates set, and a native date
// field inside a modal is the worst place for one: iOS lays the control out to
// its own idea of a width, and tapping it raises the OS picker over a modal
// that dismisses on the touch behind it. The picker flashed and vanished, and
// the field ran off the side of the screen. Our own grid does neither.
function DateRangeCalendar({ start, end, onChange, mode = "range" }) {
  const day = mode === "day";
  // Which end of the range the next tap sets. Starting a NEW range whenever
  // both are set is what makes a mis-tap cheap: tap any day and you are picking
  // a fresh range, rather than having to clear something first.
  const [picking, setPicking] = useState(start && !end ? "end" : "start");
  // The month shown is DERIVED from the start date plus however far the
  // director has paged, not stored. That is what makes it follow the start date
  // the instant it is set — the whole point of one calendar is that the second
  // tap never has to go looking for the month — without an effect that writes
  // state during render.
  const [monthOffset, setMonthOffset] = useState(0);
  const anchor = start || localDateISO();
  const view = (() => {
    const [ay, am] = anchor.split("-").map(Number);
    const d = new Date(ay, am - 1 + monthOffset, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  })();

  const maxEnd = day ? null : (start ? isoAddDays(start, MAX_EVENT_DAYS - 1) : null);
  const tap = (iso) => {
    // One tap, one date, done — tapping the day already chosen clears it.
    if (day) { setMonthOffset(0); onChange(iso === start ? "" : iso, ""); return; }
    // Paging is relative to the start date, so once a tap moves the start the
    // offset has to go back to zero or the view jumps by however far they had
    // paged to reach the day they just tapped.
    setMonthOffset(0);
    // A tap before the start is a new start, not an invalid end — the reading
    // "actually, we begin earlier" is the common one.
    if (picking === "start" || !start || iso < start) {
      onChange(iso, "");
      setPicking("end");
      return;
    }
    if (maxEnd && iso > maxEnd) return;
    onChange(start, iso);
    setPicking("start");
  };

  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const lead = first.getDay();
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const shift = (n) => setMonthOffset(o => o + n);
  const monthLabel = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = localDateISO();

  const navBtn = { background: "transparent", border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t2, fontSize: FS.body, fontWeight: 700, width: 30, height: 28, cursor: "pointer", lineHeight: 1 };

  return (
    <div style={{ background: K.inp, borderRadius: R.md, border: `1px solid ${K.bdr}`, padding: "8px 10px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <button type="button" onClick={() => shift(-1)} style={navBtn}>‹</button>
        <span style={{ fontSize: FS.small, fontWeight: 800, color: K.t1 }}>{monthLabel}</span>
        <button type="button" onClick={() => shift(1)} style={navBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 2 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: FS.micro, fontWeight: 700, color: K.t3 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = isoOf(view.y, view.m, d);
          const isStart = iso === start;
          const isEnd = !day && iso === end;
          const between = !day && start && end && iso > start && iso < end;
          const beyond = picking === "end" && start && maxEnd && iso > maxEnd;
          const edge = isStart || isEnd;
          return (
            <button key={i} type="button" onClick={() => tap(iso)} disabled={beyond} style={{
              // Square in the middle, rounded at the ends: the band reads as one
              // stay rather than a row of separate days.
              height: 32, padding: 0, cursor: beyond ? "default" : "pointer", position: "relative",
              background: edge ? K.acc : between ? K.acc + ALPHA.tint : "transparent",
              color: edge ? ON_ACC : beyond ? K.t3 + ALPHA.line : between ? K.acc : K.t1,
              border: (!edge && !between && iso === today) ? `1px solid ${K.t3}` : "1px solid transparent",
              borderRadius: isStart && isEnd ? R.sm : isStart ? `${R.sm}px 0 0 ${R.sm}px` : isEnd ? `0 ${R.sm}px ${R.sm}px 0` : between ? 0 : R.sm,
              fontSize: FS.small, fontWeight: edge ? 800 : 600,
            }}>{d}</button>
          );
        })}
      </div>
      <div style={{ marginTop: 6, fontSize: FS.label, color: K.t3, textAlign: "center" }}>
        {day
          ? (start ? fmtRoundDate(start) : "Tap the day this round is played")
          : !start
          ? "Tap the first day of the tournament"
          : picking === "end"
            ? "Now tap the last day"
            : `${fmtRoundDate(start)}${end && end !== start ? ` → ${fmtRoundDate(end)}` : ""} · ${tournamentDays(start, end).length} day${tournamentDays(start, end).length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}

function TournamentPanel({ meta, onSave, notify, confirm, scoredRounds = [] }) {
  const [busy, setBusy] = useState(false);
  // The calendar opens on a tap and closes on Save. Closing on Save rather than
  // on the second date is deliberate: picking a range leaves the card dirty,
  // and folding the calendar away the moment the end date lands would hide the
  // change behind an un-tapped Save button.
  const [datesOpen, setDatesOpen] = useState(false);

  // One working copy rather than three useStates plus a hand-rolled string key
  // to decide when to re-seed them. useDirtyForm (ported from Bourbon Cup)
  // owns that: it syncs an incoming value into local state ONLY while the form
  // is clean, so a Firestore snapshot for an unrelated field of the same
  // tournament_state document can no longer wipe what the director is midway
  // through typing.
  const initialValue = useMemo(() => ({
    name: meta?.name || "",
    location: meta?.location || "",
    rounds: clampRounds(meta?.rounds),
    // The days the event runs. Typed once here and nowhere else: Rounds offers
    // exactly these days when a round is scheduled, so a round can only ever
    // land on a day the tournament is actually being played.
    startDate: meta?.startDate || "",
    endDate: meta?.endDate || "",
  }), [meta?.name, meta?.location, meta?.rounds, meta?.startDate, meta?.endDate]);

  // The hook's own save is what reconciles its clean snapshot. Routing the
  // panel's Save through it — rather than calling onSave directly and leaving
  // the hook holding a pre-save snapshot forever — is what keeps the
  // sync-when-clean behaviour alive for the NEXT external change.
  const { value: form, setValue: setForm, save: commit } = useDirtyForm({
    initialValue,
    onSave: async (v) => onSave({
      name: (v.name || "").trim() || defaultTournamentName(getTournamentYear()),
      location: (v.location || "").trim(),
      rounds: v.rounds,
      startDate: v.startDate || "",
      // An end before the start is a half-typed range, not a range — keep the
      // start and let them finish, rather than saving something that yields no
      // days at all.
      endDate: (v.endDate && v.startDate && v.endDate < v.startDate) ? v.startDate : (v.endDate || ""),
    }),
  });
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));
  const { name, location, rounds, startDate, endDate } = form;

  const pendingName = (name || "").trim() || defaultTournamentName(getTournamentYear());
  const pendingLocation = (location || "").trim();
  // The Save light compares the NORMALISED pending values against the saved
  // document, not the hook's raw isDirty. Both answer "has this changed", but
  // only this one knows that trailing whitespace isn't a change — typing a
  // space and deleting it should not leave Save lit on a form that would write
  // the identical document.
  const dirty = pendingName !== (meta?.name || defaultTournamentName(getTournamentYear()))
    || pendingLocation !== (meta?.location || "")
    || rounds !== clampRounds(meta?.rounds)
    || (startDate || "") !== (meta?.startDate || "")
    || (endDate || "") !== (meta?.endDate || "");

  // Rounds that already carry a score and would fall off the end of a shorter
  // tournament. Dropping to three does not DELETE round four — the holes stay
  // in the database and come back if the count goes back up — but nothing
  // counts them meanwhile, and a director who came here to fix a typo in the
  // location should hear that before they save it.
  const orphaned = scoredRounds.filter(r => r > rounds);

  const save = async () => {
    if (orphaned.length && confirm) {
      const ok = await confirm({
        title: `Play ${rounds} rounds?`,
        message: `Round ${orphaned.join(", ")} already ${orphaned.length === 1 ? "has" : "have"} scores, and a ${rounds}-round event stops counting ${orphaned.length === 1 ? "it" : "them"}.\n\nNothing is deleted — set the count back to ${Math.max(...orphaned)} and those rounds return.`,
        confirmLabel: `Play ${rounds}`,
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    await commit();
    setBusy(false);
    setDatesOpen(false);
    notify?.("Tournament details saved");
  };

  const label = { fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em" };
  const input = {
    flex: 1, minWidth: 0, boxSizing: "border-box", padding: "10px 12px",
    background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm,
    // 16px, not 13: iOS Safari zooms the page when a focused input is under
    // 16px and does not zoom back out on blur, stranding the director at 2x
    // on a form they still have to finish.
    color: K.t1, fontSize: FS.lead, fontWeight: 700, outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Active edition — a LABEL now, not a door. It stays first on the tab
          because it says which tournament everything BELOW it is editing:
          the name, the dates, the event password, the roster. Renaming the
          wrong year is the mistake this ordering prevents.

          It used to open the edition switcher. That is the SAME sheet More →
          Tournaments opens, with the same director controls — two front doors
          onto one room, both hanging off the same menu, one of them three taps
          further in. Switching years and cloning next one live there alone
          now, so editions are created, opened and deleted in exactly one
          place, and what is left here is the scope this tab writes into.

          It does not say where to go and change it either. The only person who
          reads this line is a director, who opened this tab from the same menu
          that carries Tournaments two rows up — a pointer back at the menu
          they just came through is a sentence they have to read every visit to
          learn something they already know. */}
      <div>
        <div style={{ ...label, marginBottom: 8 }}>Active edition</div>
        <div style={{
          width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: R.md,
          background: K.card, border: `1px solid ${K.bdr}`, color: K.t1,
          fontSize: FS.small, fontWeight: 700, letterSpacing: 0.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          Edition · <span style={{ color: K.acc }}>{TOURNAMENT_ID}</span>
        </div>
      </div>

      <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div style={label}>Tournament</div>
          <button onClick={save} disabled={!dirty || busy} style={{
            flexShrink: 0, fontSize: FS.label, fontWeight: 700, borderRadius: R.sm, padding: "8px 14px",
            color: dirty ? ON_ACC : K.t3,
            background: dirty ? K.acc : K.inp,
            border: dirty ? "none" : `1px solid ${K.bdr}`,
            cursor: dirty && !busy ? "pointer" : "default",
          }}>{busy ? "…" : "Save"}</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { key: "name", val: name, set: (v) => set({ name: v }), ph: defaultTournamentName(getTournamentYear()), lbl: "Name" },
            { key: "location", val: location, set: (v) => set({ location: v }), ph: "e.g. Gaylord, MI", lbl: "Location" },
          ].map(f => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Fixed 58px gutter — the width of the longest label at this
                  size — so both inputs share a left edge. */}
              <span style={{ ...label, width: 58, flexShrink: 0 }}>{f.lbl}</span>
              <input value={f.val} onChange={e => f.set(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                placeholder={f.ph} style={input} />
            </div>
          ))}

          {/* How many rounds this year plays. Same card and the same Save as
              the name and location because it is the same question — "what is
              this event" — and it is answered once, at setup, before anybody
              tees off. Two choices rather than a number field: see
              ROUND_CHOICES up top. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...label, width: 58, flexShrink: 0 }}>Rounds</span>
            <div style={{ flex: 1, display: "flex", gap: 6 }}>
              {ROUND_CHOICES.map(n => {
                const on = rounds === n;
                return (
                  <Btn key={n} variant={on ? "primary" : "secondary"} onClick={() => set({ rounds: n })}
                    style={{ flex: 1, ...(on ? {} : { color: K.t2 }) }}>{n}</Btn>
                );
              })}
            </div>
          </div>

          {/* When it is played. Rounds turns these days into the list a round
              can be scheduled on, so nobody hand-types a date in the wrong
              month, or a Tuesday nobody is at the course.

              Closed, it is a field like the two above it, sharing their 58px
              gutter and reading back the range. Open, the label moves above and
              the month takes the full width — squeezed into that gutter, seven
              columns leave 35px targets. */}
          {!datesOpen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...label, width: 58, flexShrink: 0 }}>Dates</span>
              <button type="button" onClick={() => setDatesOpen(true)} style={{
                ...input, textAlign: "left", cursor: "pointer", fontSize: FS.small,
                color: startDate ? K.t1 : K.t3,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {startDate
                    ? `${fmtRoundDate(startDate)}${endDate && endDate !== startDate ? ` → ${fmtRoundDate(endDate)}` : ""}`
                    : "Set the tournament dates"}
                </span>
                <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, flexShrink: 0 }}>
                  {startDate ? `${tournamentDays(startDate, endDate).length}d ›` : "›"}
                </span>
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={label}>Dates</span>
                <button type="button" onClick={() => setDatesOpen(false)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.label, fontWeight: 700, cursor: "pointer", padding: 0 }}>Close</button>
              </div>
              <DateRangeCalendar start={startDate} end={endDate}
                onChange={(s, e) => set({ startDate: s, endDate: e })} />
            </div>
          )}
        </div>
        {orphaned.length > 0 && (
          <div style={{ fontSize: FS.label, fontWeight: 600, color: K.warn, marginTop: 8, lineHeight: 1.4 }}>
            Round {orphaned.join(", ")} already {orphaned.length === 1 ? "has" : "have"} scores — a {rounds}-round
            event stops counting {orphaned.length === 1 ? "it" : "them"}.
          </div>
        )}
      </div>
    </div>
  );
}

// AccessPanel moved to components/AccessPanel.jsx — see the header there.

export function AdminView({ liveRounds = EMPTY_LIVE_ROUNDS, registry, activePlayers, marketPool, sideGames, onUpdateSideGames, rebuyIds, tournament, tPlayers, tRounds, courses, setCourseForRound, addCourse, addPlayerToTournament, updateHI, updateName, removePlayer, deletePlayer, editionsHolding, pairingsData, setPairings, teeData, setTeeBulk, teeTimesData, setTeeTimesData, roundDates, onSetRoundDate, scoringOpen, onSetScoringOpen, pairingStrategy, onSetPairingStrategy, leaderboard, holeData, finalizedRounds, onFinalizeRound, onUnfinalizeRound, onDiscardRoundScores, notify, getPlayerTee, startFresh, externalSettingsOpen, externalSettingsTab, externalSettingsRound, onExternalSettingsHandled, teesSaved, onTeesSave, teesModified, onTeesModify, memberships, onSetDirector, claims, authUid, tournamentMeta, onSaveTournamentMeta, demoOnly = false }) {
  // ── The sandbox administrator ─────────────────────────────────────
  // `demoOnly` is a MEMBER who is an administrator only because of where they
  // are standing — a beta tester or a store reviewer inside the sandbox, see
  // canAdminEdition in lib/editionLock and the rule of the same name.
  //
  // Two of these tabs are not theirs, and the reason is the same for both:
  // what they write is not edition-scoped, so no sandbox grant can reach it
  // and the rules would refuse every save. Players edits the career registry —
  // one row per golfer, shared with sixteen years of history. Event holds the
  // tournament password and the crown. Hidden rather than shown-and-refused:
  // these screens auto-save on edit and `db.upsert` swallows a rejection, so a
  // refused save looks exactly like a save.
  const [rawTab, setTab] = useState("rounds");
  const tab = demoOnly && (rawTab === "players" || rawTab === "event") ? "rounds" : rawTab;
  // Themed confirmations (see lib/useConfirm). The host <ConfirmModal/> is
  // rendered once at the bottom of this view; `confirm(...)` returns a
  // Promise<boolean>.
  const { confirm, confirmModal } = useConfirm();
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  // ── Handicap-edit guard ──
  // Handicap indexes are LOCKED-IN for the tournament by design (unlike a rolling
  // league handicap). Because getLeaderboard reads the CURRENT handicap_index for
  // every round, editing an HI after play has started retroactively recalculates
  // that player's net scores for ALL rounds — including finalized ones — and can
  // reshuffle the leaderboard. Finalization locks score entry, not this input.
  // So: once the tournament has started (any real hole score exists, or any round
  // is finalized), an HI edit must pass through an explicit warning confirmation.
  const tournamentStarted = useMemo(() =>
    Object.values(finalizedRounds || {}).some(Boolean) ||
    Object.values(holeData || {}).some(scores =>
      Object.values(scores || {}).some(s => s > 0 && s !== 99)
    ),
  [holeData, finalizedRounds]);
  // Which rounds already have a real score on them, ascending. Read only by
  // the Rounds control on the Event tab, which warns before a director shortens
  // the tournament past a round somebody has already played.
  const scoredRounds = useMemo(() => {
    const seen = new Set();
    Object.entries(holeData || {}).forEach(([key, scores]) => {
      if (!Object.values(scores || {}).some(s => s > 0 && s !== WD_SCORE)) return;
      const rnd = parseInt(key.split("_").pop(), 10);
      if (rnd > 0) seen.add(rnd);
    });
    return [...seen].sort((a, b) => a - b);
  }, [holeData]);

  // The handicap-lock warning used to be a bespoke popup raised from an
  // inline index edit on the roster row. Editing moved into PlayerEditor,
  // which folds the same warning into its own change confirmation — one
  // dialog listing every pending change, rather than a second one behind it.
  // `tournamentStarted` is still read: the editor takes it as a prop.
  // Deep links from elsewhere in the app (the scoring screen's "no course
  // assigned" prompt). These used to open the gear modal on a given pane;
  // with the modal gone they select a top-level tab instead. The old pane
  // names are mapped rather than changed at the call sites, so a caller
  // asking for "course" still lands somewhere sensible.
  const EXTERNAL_TAB = { course: "rounds", players: "players", access: "event", tournament: "event" };
  const [editingPlayer, setEditingPlayer] = useState(null); // { pid, first, last, nick, hi, dir } | { isNew: true, linked, ... }

  // Who could be added back — the player registry plus the record books, minus
  // this edition's roster. Keyed off tPlayers, which is also what a registry
  // refresh nudges, so a name added on another phone reaches this list.
  // ── A career index, both halves of it ──
  // The bundled record books stop at the last export of data/history.js; the
  // WBCs played in this app since are in `liveRounds`. Every index this console
  // quotes — the reference beside the handicap field, the one offered for a
  // returning golfer — is computed through here so the two can never disagree,
  // and so neither disagrees with the Players tab. See lib/liveHistory.
  const recentSlots = useMemo(() => recentRoundSlots(WINDOW, liveRounds?.slots), [liveRounds]);
  const careerIndex = useCallback((historyName, pid, override = null) => indexFor(historyName, {
    override,
    extraRounds: (pid && liveRounds?.byPlayer?.[pid]) || [],
    recentSlots,
  }), [liveRounds, recentSlots]);

  const returningPool = useMemo(
    () => returningPlayers({ registry, rosterIds: tPlayers.map(t => t.player_id), indexOf: careerIndex }),
    [registry, tPlayers, careerIndex],
  );

  // ── Records that exist for no reason ──
  // The returning pool minus everybody with a career, which leaves exactly the
  // rows worth cleaning up: a player record with no rounds behind it and no
  // place in this year's field. Demo names, and the misspelling added at 11pm
  // and re-added correctly a minute later.
  //
  // It is its own list because the player editor cannot reach these — that
  // editor opens off a ROSTER row, and one of the two ways to end up with junk
  // in the registry is to have moved it to inactive already.
  const deletablePool = useMemo(
    () => (deletePlayer && editionsHolding ? returningPool.filter(r => !r.historyName && !r.rounds) : []),
    [returningPool, deletePlayer, editionsHolding],
  );

  const [confirmCourse, setConfirmCourse] = useState(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [courseStateFilter, setCourseStateFilter] = useState("MI");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const roundStripRef = useRef(null);
  // Course-editor refetch: { busy, msg }.
  const [refetch, setRefetch] = useState({ busy: false, msg: "" });
  // Which round has its day list open, if any — the pill's date field sets it.
  const [datePickRound, setDatePickRound] = useState(null);
  // Is the course card showing its search instead of its course? Forced open
  // when the round has no course — there is nothing else for the card to be.
  const [pickingCourse, setPickingCourse] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null); // { courseId, draft: {...} }
  const [manualCourse, setManualCourse] = useState(null); // null | draft object when manually adding
  const [coursePreview, setCoursePreview] = useState(null); // course to preview before confirming add
  const [localDbPrompt, setLocalDbPrompt] = useState(null); // { sbCourse, query } — prompt user to use local or fetch fresh
  const [editRound, setEditRound] = useState(() => { for (let r = 1; r <= NUM_ROUNDS; r++) { if (!finalizedRounds[r]) return r; } return NUM_ROUNDS; });
  // Keep editRound pointing at the active round when finalization state changes.
  // The key is extracted rather than inlined so it is a plain value React can
  // compare — a call expression in a dependency array is re-evaluated but never
  // memoised.
  const finalizedRoundsKey = JSON.stringify(finalizedRounds);
  useEffect(() => {
    setEditRound(r => {
      if (!finalizedRounds[r]) return r;
      for (let i = 1; i <= NUM_ROUNDS; i++) { if (!finalizedRounds[i]) return i; }
      return NUM_ROUNDS;
    });
    // Deep-compared on purpose: finalizedRounds is a new object on every
    // snapshot, so depending on it directly would re-run this constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalizedRoundsKey]);
  // Keep the selected round on screen when something OTHER than a tap moves it
  // — finalizing advances the round, and scoring's "no course" link jumps to
  // one — which matters once the strip is wide enough to scroll sideways.
  useEffect(() => {
    const el = roundStripRef.current?.querySelector(`[data-round="${editRound}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [editRound]);
  useEffect(() => {
    if (!externalSettingsOpen) return;
    setTab(EXTERNAL_TAB[externalSettingsTab] || "rounds");
    // Course setup is per-round and now lives in the Rounds tab, so a link that
    // named a round has to select it — otherwise "no course for Round 3" drops
    // you on Round 1's setup and the fix looks like it did nothing.
    if (externalSettingsRound) setEditRound(externalSettingsRound);
    if (onExternalSettingsHandled) onExternalSettingsHandled();
    // Keyed on the OPEN flag alone. This consumes a one-shot deep link, and
    // depending on what it reads would re-apply that link on every unrelated
    // change — dragging the director back to the round it named.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSettingsOpen]);
  const [finalizeModal, setFinalizeModal] = useState(null); // { round, scores[], missing[] }

  // On mount, check if any round is ready to finalize and show popup
  const buildFinalizeModal = (r) => {
    const tr = tRounds.find(t => t.round_number === r);
    const course = tr ? courses.find(c => c.id === tr.course_id) : null;
    // The standings a director is shown before finalizing, off the same
    // computeRoundLine the leaderboard ranks on. It used to total the card by
    // hand and take the whole course handicap off the end, which counted a
    // withdrawal's sentinel holes as strokes played and gave a partial card
    // every one of its strokes on holes it had not reached — so the preview
    // could disagree with the board it was about to publish.
    const scores = activePlayers.map(p => {
      const line = computeRoundLine({
        scores: holeData[`${p.id}_${r}`] || {},
        holePars: course?.hole_pars || [],
        holeHcps: course?.hole_handicaps || [],
        ch: courseHandicapFor({
          handicapIndex: p.handicap_index,
          course: course || { slope: 113, rating: 72, par: 72 },
          tee: course ? getPlayerTee(r, p.id, course) : null,
        }),
      });
      return { id: p.id, name: p.name, gross: line.gross, netToPar: line.netToPar };
    }).sort((a, b) => a.netToPar - b.netToPar);
    const missing = activePlayers.filter(p => {
      const wdTp = tPlayers.find(tp => tp.player_id === p.id);
      if (wdTp?.status === "WD") return false; // WD players not flagged as missing
      const s = holeData[`${p.id}_${r}`] || {};
      for (let h = 0; h < 18; h++) { if (!(s[h] > 0)) return true; }
      return false;
    }).map(p => p.name);
    return { round: r, course, scores, missing };
  };

  useEffect(() => {
    for (let r = 1; r <= (tournament?.num_rounds || NUM_ROUNDS); r++) {
      if (finalizedRounds[r]) continue;
      // Check if all groups for this round have been finalized by scoring groups
      const roundGroups = (pairingsData || {})[r] || [];
      const allGroupsFinalized = roundGroups.length > 0 && roundGroups.every(grp => {
        const key = `${r}_${grp.slice().sort().join(",")}`;
        return finalizedRounds[key];
      });
      // Also check if all players have all 18 holes filled
      const allHolesDone = activePlayers.length > 0 && activePlayers.every(p => {
        const scores = holeData[`${p.id}_${r}`] || {};
        for (let h = 0; h < 18; h++) { if (!(scores[h] > 0)) return false; }
        return true;
      });
      if (allGroupsFinalized || allHolesDone) {
        setFinalizeModal(buildFinalizeModal(r));
        break;
      }
    }
    // ON MOUNT ONLY, deliberately. This raises the finalize prompt for a round
    // that is already complete when the director opens the tab. Re-running it on
    // every change to the data it reads would re-raise that prompt over whatever
    // they were doing, every time a score landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ac = K.acc;
  const acGlow = K.accGlow;

  // Search for a course - debounced
  const searchTimerRef = useRef(null);
  const doCourseSearch = (query, stateOverride) => {
    setCourseSearch(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim() || query.trim().length < MIN_COURSE_QUERY) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      // Where to look and in what order is lib/courseSearch's, with a test —
      // the scramble's setup screen runs the same search, and this is the one
      // copy of it. See searchCourses.
      setSearchResults(await searchCourses(query, {
        state: stateOverride !== undefined ? stateOverride : courseStateFilter,
      }));
      setSearchLoading(false);
    }, COURSE_SEARCH_DEBOUNCE_MS);
  };

  const addCourseToLibrary = (c) => {
    addCourse(c);
    // Clear the query: what you want to see next is your course list with the
    // new course in it, not the results you just finished with.
    setCourseSearch("");
    setSearchResults([]);
    setManualCourse(null);
    // You searched from inside a round's setup, so an empty round is asking for
    // this course. Only fill an EMPTY one — never silently move a round the
    // director already assigned — and say so, since the assignment is the part
    // that is easy to miss.
    const roundTaken = !!tRounds.find(t => t.round_number === editRound && t.course_id);
    if (!roundTaken && !finalizedRounds[editRound]) {
      setCourseForRound(editRound, c);
      setPickingCourse(false);
      notify(`${c.name} added — Round ${editRound} is set`);
    } else {
      notify(`${c.name} added to your courses`);
    }
  };
  const numRounds = tournament?.num_rounds || NUM_ROUNDS;

  // ── Deleting a player, wherever it is raised from ──
  // One flow behind both callers, because the decision is the same one and it
  // is not a decision to have two copies of: check what the record books and
  // the other editions say (lib/playerDelete), name what goes, then write.
  //
  // Returns whether it happened, so the player editor knows to close.
  const askDelete = async ({ pid, name, historyName = null }) => {
    if (!deletePlayer || !editionsHolding) return false;
    const scoredHoles = Array.from({ length: numRounds }, (_, i) => i + 1)
      .reduce((n, r) => n + holesEntered(holeData, pid, r), 0);
    const verdict = deleteVerdict({
      historyName,
      // A read, taken on the tap: this console only ever loads its OWN
      // edition's roster, so 2027 is invisible from here until it is asked
      // about. Its failure is a refusal — see the module.
      otherEditions: await editionsHolding(pid),
      scoredHoles,
      claimed: Object.values(claims || {}).some(c => c === pid),
    });
    if (!verdict.allowed) { notify(verdict.why); return false; }
    if (!(await confirm({
      title: `Delete ${name}?`,
      message: deletionLines({ name, warnings: verdict.warnings }).join("\n"),
      confirmLabel: "Delete",
      destructive: true,
    }))) return false;
    await deletePlayer(pid);
    notify(`Deleted ${name}`);
    return true;
  };

  // ── Single source of truth for round setup completion ──
  // Every place that shows "is this round ready?" (round cards, sub-tab dots,
  // the needs-setup banner) derives from this one function so the definition
  // of "done" lives in exactly one spot.
  const getRoundStatus = (r) => {
    const tr = tRounds.find(t => t.round_number === r);
    const course = tr ? courses.find(c => c.id === tr.course_id) : null;
    const hasCourse = !!course;
    const groups = (pairingsData || {})[r] || [];
    const teeTimes = (teeTimesData[r] || []);
    const hasPlayers = activePlayers.length > 0;
    // Who has no tee for this round — the ids, not just a yes/no, because the
    // console names them. One definition, in lib/roundSetup, so the warning
    // banner, the round pill and the nav dot cannot disagree about who is
    // missing; it also catches an assignment pointing at a tee the course no
    // longer has, which resolves to nothing exactly as a blank does.
    const noTee = hasCourse && hasPlayers
      ? missingTees({ players: activePlayers, assignments: teeData[r] || {}, teeNames: (course.tee_boxes || []).map(t => t.name) })
      : [];
    const allTees = hasPlayers && noTee.length === 0;
    const groupsDone = groups.length > 0 && groups.flat().length === activePlayers.length;
    const teeTimesDone = groups.length > 0 && groups.every((_, gi) => teeTimes[gi] && teeTimes[gi].trim() !== "");
    const teesDone = hasCourse && !!teesSaved[r] && !teesModified[r] && allTees;
    const pairingsDone = hasCourse && groupsDone && teeTimesDone;
    // The sentence behind a red P. Three conditions collapse into one badge,
    // and without this it says only that one of them failed — see
    // pairingsTrouble, and the evening it cost.
    const pairingsWhy = pairingsDone ? null : pairingsTrouble({
      hasCourse, groups, teeTimes, rosterCount: activePlayers.length,
    });
    return {
      round: r, course, hasCourse, allTees, noTee, groupsDone, teeTimesDone,
      teesDone, pairingsDone, pairingsWhy,
      allDone: hasCourse && teesDone && pairingsDone,
      finalized: !!finalizedRounds[r],
    };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 0 auto" }}>

      {/* Finalize round popup modal */}
      {finalizeModal && (
        <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: SCRIM, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto" }}>
          <div style={{ background: K.card, borderRadius: R.xl, border: `1px solid ${K.bdr}`, width: "100%", maxWidth: 420, overflow: "hidden", marginTop: "auto", marginBottom: "auto" }}>
            {/* Header */}
            <div style={{ background: K.gold + ALPHA.wash, borderBottom: `1px solid ${K.gold}${ALPHA.hair}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: FS.lead }}>⚡</span>
              <div>
                <div style={{ fontSize: FS.body, fontWeight: 800, color: K.gold }}>Round {finalizeModal.round} Complete</div>
                <div style={{ fontSize: FS.label, color: K.t3 }}>{finalizeModal.course?.name || "Review scores before finalizing"}</div>
              </div>
            </div>
            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 56px 56px", padding: "6px 16px", borderBottom: `1px solid ${K.bdr}`, background: K.inp }}>
              <span style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase" }}>#</span>
              <span style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase" }}>Player</span>
              <span style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase", textAlign: "center" }}>Net</span>
              <span style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase", textAlign: "center" }}>Gross</span>
            </div>
            {/* Net scores list */}
            <div style={{ padding: "8px 0" }}>
              {finalizeModal.scores.map((p, i) => {
                // Compute tied positions
                const tiedAbove = i > 0 && finalizeModal.scores[i-1].netToPar === p.netToPar;
                const tiedBelow = i < finalizeModal.scores.length - 1 && finalizeModal.scores[i+1].netToPar === p.netToPar;
                const isTied = tiedAbove || tiedBelow;
                let pos = i + 1;
                if (tiedAbove) { let j = i - 1; while (j >= 0 && finalizeModal.scores[j].netToPar === p.netToPar) j--; pos = j + 2; }
                const posLabel = isTied ? `T${pos}` : `${pos}`;
                return (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr 56px 56px", alignItems: "center", padding: "7px 12px", margin: "3px 8px", borderRadius: R.sm, border: `1px solid ${K.bdr}`, background: K.card }}>
                    <span style={{ fontSize: FS.label, fontWeight: 700, color: pos === 1 && !tiedAbove ? K.acc : K.t3 }}>{posLabel}</span>
                    <span style={{ fontSize: FS.small, fontWeight: 600, color: K.t1 }}>{p.name}</span>
                    <span style={{ fontSize: FS.small, fontWeight: 800, textAlign: "center", color: p.netToPar < 0 ? K.under : p.netToPar > 0 ? K.t2 : K.t1 }}>
                      {p.netToPar === 0 ? "E" : p.netToPar > 0 ? `+${p.netToPar}` : p.netToPar}
                    </span>
                    <span style={{ fontSize: FS.label, textAlign: "center", color: K.t3 }}>{p.gross > 0 ? p.gross : "—"}</span>
                  </div>
                );
              })}
            </div>
            {/* Missing scores warning */}
            {finalizeModal.missing.length > 0 && (
              <div style={{ padding: "8px 16px", background: K.warn + ALPHA.wash, borderTop: `1px solid ${K.warn}${ALPHA.tint}` }}>
                <span style={{ fontSize: FS.label, color: K.warn }}>⚠️ Missing scores: {finalizeModal.missing.join(", ")}</span>
              </div>
            )}
            {/* Actions */}
            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${K.bdr}` }}>
              <button onClick={() => setFinalizeModal(null)} style={{
                flex: 1, padding: "10px 0", borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`,
                color: K.t2, fontSize: FS.small, fontWeight: 600, cursor: "pointer",
              }}>Review Later</button>
              <button onClick={() => { onFinalizeRound(finalizeModal.round); if (finalizeModal.round < numRounds) { setEditRound(finalizeModal.round + 1); setTab("rounds"); } setFinalizeModal(null); }} style={{
                flex: 1, padding: "10px 0", borderRadius: R.md,
                background: finalizeModal.missing.length > 0 ? K.warn : K.acc,
                border: "none", color: K.bg, fontSize: FS.small, fontWeight: 700, cursor: "pointer",
              }}>{finalizeModal.missing.length > 0 ? "Finalize Anyway" : "✓ Finalize Round"}</button>
            </div>
          </div>
        </div>
      )}


      {/* ── Top-level tabs ──────────────────────────────────────────
          Five always-visible tabs, replacing the round-selector + sub-tabs
          + gear-modal shell. Ported from Bourbon Cup's Admin, whose console
          is one flat set of tabs rather than a round-scoped view with
          everything else hidden behind a gear.

          Pinned in a StickyTop so the bar lands in the SAME place on every
          tab regardless of that tab's content height — see ui.jsx. */}
      <StickyTop padBottom={10}>
        <SegmentedToggle
          options={demoOnly
            ? [["rounds","Rounds"],["betting","Betting"]]
            : [["players","Players"],["rounds","Rounds"],["betting","Betting"],["event","Event"]]}
          value={tab}
          onChange={setTab}
        />
      </StickyTop>

      {/* The round selector belongs to the two ROUND-SCOPED tabs only.
          Players, Courses and Event act on the tournament as a whole, and a
          round picker above them would imply otherwise. */}
      {tab === "rounds" && (<>
        {(() => {
          const _finalizePending = Object.entries(pairingsData || {}).some(([rnd, groups]) => {
            if (!groups.length) return false;
            return groups.every(grp => {
              const gk = `${rnd}_${grp.slice().sort().join(",")}`;
              if (finalizedRounds[gk] || finalizedRounds[parseInt(rnd)]) return false;
              return grp.every(pid => {
                const pd = holeData[`${pid}_${rnd}`] || {};
                return Object.values(pd).filter(s => s > 0).length === 18;
              });
            });
          });
          if (!_finalizePending) return null;
          return (
            <button onClick={() => setShowFinalizeModal(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "10px 14px", borderRadius: R.md, marginBottom: 10, background: K.warn, border: "none", color: ON_ACC, fontSize: FS.small, fontWeight: 800, cursor: "pointer", letterSpacing: "0.01em" }}>
              <span style={{ fontSize: FS.lead }}>🏆</span>Round ready to finalize — tap to close out
            </button>
          );
        })()}

      {/* Round pills, each with its own date under it.

          The date used to be one row of every day the tournament runs, shading
          the one this round plays: four days on screen to say one thing about
          one round, and the same four again when you moved to the next round.
          Now each round shows its own date and only its own — as many dates as
          there are rounds — under the pill it belongs to. Tapping one selects
          that round and opens the day list for it, so the full set of days is
          on screen only while a date is actually being chosen. */}
      {/* Four rounds share the width evenly. Beyond that they would be too
          narrow to read a date under, so the strip switches to fixed-width
          columns and scrolls sideways instead — the round count is a setting,
          and this is what happens when it grows past what a phone fits. */}
      <div ref={roundStripRef} className={numRounds > 4 ? "wbc-hscroll" : undefined}
        style={{
          display: "flex", gap: 4, marginBottom: 10, alignItems: "stretch",
          ...(numRounds > 4 ? { overflowX: "auto", overflowY: "hidden", paddingBottom: 2 } : {}),
        }}>
        {Array.from({ length: numRounds }, (_, i) => i + 1).map(r => {
          const st = getRoundStatus(r);
          const isFinal = st.finalized;
          const isActive = editRound === r;
          const teesDone = st.teesDone;
          const pairingsDone = st.pairingsDone;
          const rDate = (roundDates || {})[r];
          return (
            <div key={r} data-round={r} style={{ flex: numRounds > 4 ? "0 0 78px" : 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <button onClick={() => setEditRound(r)} style={{
              width: "100%", padding: "7px 4px 6px", borderRadius: R.md, cursor: "pointer",
              background: isActive ? acGlow : K.card,
              border: `${isActive ? "2px" : "1px"} solid ${isActive ? ac : isFinal ? K.bdr + ALPHA.tint : K.bdr + ALPHA.line}`,
              color: isFinal ? K.t3 : isActive ? ac : K.t2,
              opacity: isFinal && !isActive ? 0.4 : 1,
              transition: `all ${MOTION}`,
            }}>
              <div style={{ fontSize: FS.label, fontWeight: isActive ? 700 : 500, marginBottom: 3 }}>
                {isFinal ? "🔒 " : ""}Rd {r}
              </div>
              {isFinal ? (
                <div style={{ fontSize: FS.micro, color: K.t3 }}>Final</div>
              ) : (
                <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                  {/* Two states of not-done, drawn differently. Tees that are
                      merely unsaved are a step the director has not reached
                      yet; a player with NO tee is a fault that will produce a
                      wrong course handicap, so it gets the filled red dot
                      rather than the outline everything-else-pending wears. */}
                  {[["T", teesDone, st.noTee.length > 0], ["P", pairingsDone, false]].map(([lbl, done, fault]) => (
                    <div key={lbl} style={{
                      display: "flex", alignItems: "center", gap: 2,
                      fontSize: FS.micro, fontWeight: 700,
                      color: done ? K.ok : fault ? K.danger : K.danger + ALPHA.panel,
                    }}>
                      <div style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: done ? K.ok : fault ? K.danger : "transparent",
                        border: `1px solid ${done ? K.ok : fault ? K.danger : K.danger + ALPHA.line}`,
                      }} />
                      {lbl}
                    </div>
                  ))}
                </div>
              )}
            </button>
            {onSetRoundDate && (
              isFinal
                ? <div style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, textAlign: "center", padding: "3px 0", opacity: isActive ? 1 : 0.4 }}>{rDate ? chipDate(rDate) : "—"}</div>
                : <button onClick={() => { setEditRound(r); setDatePickRound(r); }} style={{
                    width: "100%", padding: "4px 2px", borderRadius: R.sm, cursor: "pointer",
                    background: rDate ? ac  + ALPHA.wash : "transparent",
                    border: `1px solid ${rDate ? ac  + ALPHA.hair : K.warn + ALPHA.line}`,
                    color: rDate ? ac : K.warn,
                    fontSize: FS.micro, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{rDate ? chipDate(rDate) : "+ date"}</button>
            )}
            </div>
          );
        })}
      </div>

      {/* ── Why the round being edited is not ready ──
          The P in the strip above has three ways to be red and, on its own,
          says the same thing for all of them. This is the sentence: which of
          the three, and which player or group.

          Only for the round actually open, and only when there is something to
          say — a line that appears under every round would be a wall of text
          on a phone, and one that never disappears stops being read. See
          pairingsTrouble in lib/roundSetup for the ordering. */}
      {(() => {
        const why = getRoundStatus(editRound).pairingsWhy;
        if (!why) return null;
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 7, marginBottom: 10,
            padding: "7px 10px", borderRadius: R.sm,
            background: K.danger + ALPHA.wash, border: `1px solid ${K.danger}${ALPHA.line}`,
          }}>
            <span aria-hidden style={{ fontSize: FS.micro, fontWeight: 800, color: K.danger, flexShrink: 0 }}>P</span>
            <span style={{ fontSize: FS.label, fontWeight: 600, color: K.t2, lineHeight: 1.4 }}>{why}</span>
          </div>
        );
      })()}

        {/* The day list, for ONE round, only while it is being chosen. The
            choices are the days the tournament runs — typed once in Admin →
            Event — because every round of a four-day event is one of those
            four days, and a free date field is how a round ends up scheduled
            in the wrong month. Two rounds CAN share a day: 36-hole days are
            normal, so a day another round already uses is marked, not blocked.
            No dates on the event yet: a plain date field, so nothing that
            worked before stops working. */}
        {datePickRound != null && (() => {
          const r = datePickRound;
          const days = tournamentDays(tournamentMeta?.startDate, tournamentMeta?.endDate);
          const mine = (roundDates || {})[r] || "";
          // A date set before the event dates were (or after they moved) still
          // shows, as its own chip — otherwise the round would look unscheduled
          // while the leaderboard and the scoring gate use it.
          // Empty when the event has no dates, so the calendar below renders
          // even once this round HAS a date — see roundDateChoices for the
          // one-item-list dead end that used to make a date unchangeable.
          const chips = roundDateChoices(days, mine);
          const pick = (d) => { onSetRoundDate(r, d); setDatePickRound(null); };
          return (
            <Popup onClose={() => setDatePickRound(null)} maxWidth={340} portal>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: FS.label, fontWeight: 800, color: K.t1, textTransform: "uppercase", letterSpacing: "0.05em" }}>Round {r} · play date</span>
                <button onClick={() => setDatePickRound(null)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
              </div>
              {chips.length === 0 ? (
                <>
                  <DateRangeCalendar mode="day" start={mine} end="" onChange={(d) => pick(d)} />
                  <div style={{ fontSize: FS.label, color: K.t3, marginTop: 8, lineHeight: 1.5 }}>
                    Set the tournament dates in Event and this becomes a list of the days it runs.
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {chips.map(d => {
                    const on = mine === d;
                    const others = Object.entries(roundDates || {})
                      .filter(([rr, v]) => v === d && Number(rr) !== r)
                      .map(([rr]) => Number(rr))
                      .sort((a, b) => a - b);
                    return (
                      <button key={d} onClick={() => pick(on ? "" : d)} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        padding: "10px 12px", borderRadius: R.md, cursor: "pointer",
                        background: on ? ac : K.inp,
                        border: `1px solid ${on ? ac : K.bdr}`,
                        color: on ? ON_ACC : K.t1, fontSize: FS.small, fontWeight: 700,
                      }}>
                        <span>{chipDate(d, true)}</span>
                        <span style={{ fontSize: FS.label, fontWeight: 700, color: on ? ON_ACC : K.t3 }}>
                          {on ? "✓ this round" : others.length ? `also R${others.join(", R")}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Popup>
          );
        })()}

      </>)}


              {tab === "event" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <TournamentPanel meta={tournamentMeta} onSave={onSaveTournamentMeta} notify={notify}
                    confirm={confirm} scoredRounds={scoredRounds} />
                  <AccessPanel notify={notify} confirm={confirm} />
                  {/* Who has come through that door, when they were last
                      here, and whether an alert would reach them. Beside the
                      password rather than on the Players tab, where the same
                      names are already listed alphabetically for editing —
                      this list is sorted by recency and read as a whole. */}
                  <PlayerActivityPanel players={activePlayers} />
                </div>
              )}
              {tab === "players" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <SectionLabel style={{ marginBottom: 0 }}>Roster ({activePlayers.length})</SectionLabel>
                    <Btn size="sm" onClick={() => setEditingPlayer({ isNew: true, first: "", last: "", nick: "", hi: "", dir: false })}>
                      + Add player
                    </Btn>
                  </div>
                  <Card pad={0} style={{ overflow: "hidden" }}>
                    {activePlayers.length === 0 && (
                      <div style={{ padding: "18px 14px", textAlign: "center", fontSize: FS.small, color: K.t3 }}>
                        Nobody on the roster yet.
                      </div>
                    )}
                    {[...activePlayers].sort((a,b) => a.name.localeCompare(b.name)).map((p, i) => (
                      <PlayerRow
                        key={p.id}
                        player={p}
                        isLast={i === activePlayers.length - 1}
                        isDirector={playerIsDirector(memberships, claims, p.id)}
                        account={membershipForPlayer(memberships, claims, p.id)}
                        onOpen={() => {
                          const parts = splitName(p);
                          setEditingPlayer({
                            pid: p.id, first: parts.first, last: parts.last,
                            // The nickname box shows a nickname only when a
                            // PERSON typed the stored name — otherwise it sits
                            // empty on its placeholder, which is what "no
                            // nickname" means.
                            //
                            // Tested against both conventions, which is the
                            // whole trap: this compared against the current
                            // one only, so every roster name written under the
                            // old one arrived here looking hand-chosen and
                            // pre-filled the box. Then it won on save — a
                            // director could type the surname that was missing,
                            // save, and watch the name not change, because the
                            // legacy name had been sitting in the nickname
                            // field the entire time.
                            nick: isGeneratedName(p.name, parts.first, parts.last) ? "" : p.name,
                            hi: String(p.handicap_index ?? ""),
                            dir: playerIsDirector(memberships, claims, p.id),
                          });
                        }}
                      />
                    ))}
                  </Card>
                  {(() => {
                    const claimed = new Set(Object.values(claims || {}));
                    const waiting = (memberships || []).filter(m => !claimed.has(claims?.[m.id] ?? claims?.[m.uid]) || !(claims?.[m.id] ?? claims?.[m.uid]));
                    if (!waiting.length) return null;
                    return (
                      <div style={{ fontSize: FS.label, color: K.t3, marginTop: 8, lineHeight: 1.5 }}>
                        {waiting.length} signed in without claiming a name yet — they appear here once they do.
                      </div>
                    );
                  })()}

                  {/* ── Player records off the roster ──
                      Not "inactive players": a man who played in 2019 and is
                      not coming this year is inactive, and he is deliberately
                      NOT here — he has a career, he is in the returning
                      picker, and nothing about him should be deleteable from a
                      phone. What is here is the residue: a record with no
                      rounds behind it and no place in this year's field.

                      It has to be its own list because the editor above opens
                      off a ROSTER row, so a demo name already moved to
                      inactive would otherwise be unreachable — visible in the
                      "Played before?" picker forever, and removable only from
                      the Firebase console. */}
                  {deletablePool.length > 0 && (
                    <>
                      <SectionLabel style={{ marginTop: 16 }}>Not in this year&apos;s field</SectionLabel>
                      <Card pad={0} style={{ overflow: "hidden" }}>
                        {deletablePool.map((r, i) => (
                          <div key={r.id} style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
                            borderBottom: i === deletablePool.length - 1 ? "none" : `1px solid ${K.bdr}${ALPHA.hair}`,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.name}
                              </div>
                              <div style={{ fontSize: FS.micro, color: K.t3, marginTop: 1 }}>{returningLine(r)}</div>
                            </div>
                            <Btn variant="dangerOutline" size="sm" style={{ flexShrink: 0, whiteSpace: "nowrap" }}
                              onClick={() => askDelete({ pid: r.id, name: r.name })}>
                              Delete
                            </Btn>
                          </div>
                        ))}
                      </Card>
                      <div style={{ fontSize: FS.label, color: K.t3, marginTop: 6, lineHeight: 1.45 }}>
                        Player records with no recorded rounds behind them. Add one back to this year from
                        {" "}+ Add player, or delete it for good.
                      </div>
                    </>
                  )}
                </div>
              )}


      {/* ── Betting ── */}
      {/* Just the prices. What a seat costs is event SETUP — settled once
          before anybody tees off — so it belongs beside the roster and the
          rounds rather than on the screen the field is reading during play.
          Who is IN each game stays on the Betting tab, next to the pot the
          answer changes. */}
      {tab === "betting" && (
        <div style={{ marginTop: 4 }}>
          <SectionLabel>What a seat costs</SectionLabel>
          <Card>
            <BuyInPrices
              // The market POOL, not the roster: a man in the market without
              // playing is a seat sold, and a price sheet that counted only
              // the field would tell the director a different number to the
              // one the Betting tab's pot is counted from. His `outside` flag
              // is what keeps him out of the other four games' counts.
              players={marketPool}
              games={SIDE_GAME_KEYS.map(k => ({
                key: k, ...SIDE_GAME_LABELS[k],
                amount: sideGames?.[k]?.amount || 0,
                // The rebuy is incurred by placing halfway shares, not tagged,
                // so its count comes off the bets — the same list the pot is
                // counted from. Everything else is the director's own list.
                ids: k === "rebuy" ? rebuyIds : (sideGames?.[k]?.in ?? null),
                paid: sideGames?.[k]?.paid ?? [],
              }))}
              onChange={onUpdateSideGames}
            />
          </Card>
        </div>
      )}

      {tab === "event" && (
        <div style={{ marginTop: 16 }}>
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${K.bdr}${ALPHA.hair}`, display: "flex", flexDirection: "column", gap: 8 }}>
                <Btn onClick={async () => {
                  // MUST be awaited. This was window.confirm — a synchronous
                  // boolean — until useConfirm() was introduced in this
                  // component and shadowed the global. The hook returns a
                  // PROMISE, which is always truthy, so the un-awaited form
                  // silently wiped the tournament with no prompt at all.
                  const ok = await confirm({
                    title: "Clear all tournament data?",
                    message: "Clears all scores, course assignments, pairings, tee assignments, skins and scorecard signatures.\n\nPreserved: the player roster, handicap indexes, the event setup (name, location, rounds) and the event password.\n\nThis cannot be undone.",
                    confirmLabel: "Clear everything",
                    destructive: true,
                  });
                  if (ok) startFresh();
                }} variant="dangerOutline" block>🗑 Start Fresh — Clear All Data</Btn>
              </div>
        </div>
      )}
      {editingCourse && (() => {
        const d = editingCourse.draft;
        // Coerce on the way out. A tee typed in by hand has an empty string in
        // every number and the write path stores what it is handed, so ""
        // would land in Firestore as a slope. Refused outright when a tee has
        // no name: the tee_boxes document id and every tee assignment are
        // derived from that name, and two blank ones are one document.
        const saveEdit = () => {
          if (unnamedTees(d.tee_boxes).length) { notify("Every tee needs a name"); return; }
          addCourse({ ...d, tee_boxes: normalizeTees(d.tee_boxes, d.par) });
          setEditingCourse(null);
        };
        const addTee = () => {
          setRefetch({ busy: false, msg: "" });
          setEditingCourse(prev => ({ ...prev, draft: { ...prev.draft, tee_boxes: [...(prev.draft.tee_boxes || []), newTeeBox()] } }));
        };
        const setTee = (i, patch) => setEditingCourse(prev => {
          const tbs = [...prev.draft.tee_boxes];
          tbs[i] = { ...tbs[i], ...patch };
          return { ...prev, draft: { ...prev.draft, tee_boxes: tbs } };
        });
        const refetchTees = async () => {
          setRefetch({ busy: true, msg: "" });
          const tees = await fetchCourseTees(d.name, d.state);
          if (!tees.length) { setRefetch({ busy: false, msg: "Nothing came back for that name" }); return; }
          // Add what is missing, leave what is there. A tee already in the
          // draft may have been corrected by hand — a refetch is for filling
          // gaps, not for overwriting the director.
          const have = new Set((d.tee_boxes || []).map(t => (t.name || "").toLowerCase()));
          const added = tees.filter(t => !have.has((t.name || "").toLowerCase()));
          if (added.length) {
            setEditingCourse(prev => ({ ...prev, draft: { ...prev.draft, tee_boxes: [...(prev.draft.tee_boxes || []), ...added] } }));
          }
          setRefetch({
            busy: false,
            msg: added.length
              ? `Added ${added.length} tee${added.length === 1 ? "" : "s"} — Save to keep`
              : `All ${tees.length} tee${tees.length === 1 ? "" : "s"} already here`,
          });
        };
        const inpStyle = { background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.xs, color: K.t1, fontSize: FS.micro, textAlign: "center", width: "100%", padding: "2px 0", boxSizing: "border-box" };
        return (
          <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: K.bg, zIndex: 200, display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ paddingTop: "max(14px, calc(env(safe-area-inset-top, 0px) + 14px))", paddingBottom: 10, paddingLeft: 16, paddingRight: 16, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${K.bdr}`, flexShrink: 0, background: K.bg }}>
              <Btn variant="secondary" size="sm" style={{ color: K.t2 }} onClick={() => setEditingCourse(null)}>Cancel</Btn>
              <span style={{ fontWeight: 700, fontSize: FS.body, color: K.t1 }}>Edit Course</span>
              <button onClick={saveEdit} style={{ background: ac, border: "none", borderRadius: R.sm, color: K.bg, fontSize: FS.small, fontWeight: 700, padding: "6px 18px", cursor: "pointer" }}>Save</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 48px" }}>
              {/* "Wrong course entirely" is a thing you discover while looking at
                  its scorecard, so the swap is offered here rather than as a
                  second button on the card. Only when this IS the round's
                  course — editing one from the picker is already a swap away.
                  Discards the draft: you are leaving to pick a different course,
                  and saving edits to the one you are abandoning is not the ask. */}
              {editingCourse.courseId === (tRounds.find(t => t.round_number === editRound)?.course_id) && (
                <button onClick={() => { setEditingCourse(null); setPickingCourse(true); }}
                  style={{ width: "100%", marginBottom: 16, padding: "10px 0", borderRadius: R.sm, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t2, fontSize: FS.small, fontWeight: 700, cursor: "pointer" }}>
                  Change Round {editRound} to a different course
                </button>
              )}
              <div style={{ marginBottom: 16 }}><div style={{ fontSize: FS.label, color: K.t3, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Course Name</div><input value={d.name || ""} onChange={e => setEditingCourse(prev => ({ ...prev, draft: { ...prev.draft, name: e.target.value } }))} style={{ width: "100%", padding: "9px 10px", background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, fontSize: FS.lead, boxSizing: "border-box" }} /></div>
              {/* Two ways to fill a tee list, because refetching is not always
                  one. Refetch sits under the name it searches on — edit the
                  name first if the import got it wrong, and this finds the
                  right course. But the APIs are routinely short a tee or two
                  and a second fetch returns the same short list, so Add tee is
                  the way out of that: a blank row to type the ones off the
                  scorecard in the pro shop. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: FS.label, color: K.t3, fontWeight: 600, textTransform: "uppercase" }}>Tee boxes</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Btn variant="secondary" size="sm" onClick={addTee} style={{ color: ac, borderColor: ac + ALPHA.line }}>+ Add tee</Btn>
                  <Btn variant="secondary" size="sm" onClick={refetchTees} disabled={refetch.busy} style={{ color: ac, borderColor: ac + ALPHA.line }}>
                    {refetch.busy ? "Fetching\u2026" : "Refetch tees"}
                  </Btn>
                </div>
              </div>
              {(d.tee_boxes || []).length === 0 && (
                <div style={{ fontSize: FS.label, color: K.warn, marginBottom: 8 }}>No tees on this course — add them by hand, or refetch.</div>
              )}
              {refetch.msg && (
                <div style={{ fontSize: FS.label, color: K.t3, marginBottom: 8 }}>{refetch.msg}</div>
              )}
              {/* Sorted from the tips down, and KEYED by the tee's index in
                  the draft rather than by its position in that sort. The row a
                  slope is being typed into moves as it is typed — keyed by
                  position, the cursor would stay put while the values slid
                  underneath it. See lib/teeEditor. */}
              {orderTeesForEdit(d.tee_boxes).map(({ tee: tb, index }) => (
                <div key={index} style={{ background: K.card, border: `1px solid ${K.bdr}`, borderRadius: R.md, padding: "10px 12px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    {/* The swatch IS the colour picker — an invisible select
                        over it, the same way the manual-entry and preview
                        editors do it. Naming an unnamed tee off the colour is
                        the common case: pick Blue, and it is the blues. Going
                        the other way is the common case too, so a tee with no
                        colour picked previews the one its NAME resolves to —
                        type "Gold" and the square is gold, which is what the
                        card will look like once it saves. */}
                    <div style={{ position: "relative", width: 16, height: 16, flexShrink: 0 }}>
                      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                        <TeeColorSwatch color={tb.color || resolveTeeColor({ name: tb.name, color: "" }, index)} name={tb.name} size={16} style={{ width: "100%", height: "100%" }} />
                      </div>
                      <select value={Object.entries(TEE_COLOR_MAP).find(([, v]) => v === (tb.color || ""))?.[0] || ""}
                        onChange={e => { const key = e.target.value; setTee(index, { color: TEE_COLOR_MAP[key] || tb.color || "", name: tb.name || key.charAt(0).toUpperCase() + key.slice(1) }); }}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", fontSize: FS.small }}>
                        <option value="">—</option>
                        {["Black","Blue","White","Gold","Red","Green","Silver","Yellow","Orange","Purple","Maroon","Teal","Platinum"].map(n => <option key={n} value={n.toLowerCase()}>{n}</option>)}
                      </select>
                    </div>
                    <input value={tb.name || ""} onChange={e => setTee(index, { name: e.target.value })} placeholder="Tee name"
                      style={{ flex: 1, minWidth: 0, padding: "5px 8px", background: K.inp, border: `1px solid ${tb.name ? ac + ALPHA.hair : K.warn}`, borderRadius: R.sm, color: K.t1, fontWeight: 700, fontSize: FS.body, boxSizing: "border-box" }} />
                    <button onClick={() => setEditingCourse(prev => ({ ...prev, draft: { ...prev.draft, tee_boxes: prev.draft.tee_boxes.filter((_, i) => i !== index) } }))}
                      style={{ background: "transparent", border: "none", color: K.t3, cursor: "pointer", fontSize: FS.lead, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}>✕</button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["rating", "slope", "par", "yardage"].map(f => (
                      <div key={f} style={{ flex: 1 }}>
                        <div style={{ fontSize: FS.micro, color: K.t3, textTransform: "uppercase", marginBottom: 3 }}>{f === "yardage" ? "yards" : f}</div>
                        <input inputMode="decimal" value={tb[f] ?? ""} onChange={e => setTee(index, { [f]: e.target.value })}
                          style={{ width: "100%", padding: "7px 6px", background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, textAlign: "center", boxSizing: "border-box" }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {[["Front", 0, 9], ["Back", 9, 9]].map(([label, start, count]) => { const pars = (d.hole_pars||[]).slice(start, start+count); const hcps = (d.hole_handicaps||[]).slice(start, start+count); return (<div key={label} style={{ marginBottom: 8 }}><div style={{ fontSize: FS.label, color: K.t3, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label} 9</div><div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 2, fontSize: FS.micro }}><div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>{Array.from({length:count},(_,i)=><div key={i} style={{ textAlign:"center", color:K.t2, fontWeight:700, padding:"2px 0" }}>{start+i+1}</div>)}<div /></div><div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 2, background: K.inp, borderRadius: R.sm, padding: "2px 0", marginBottom: 2 }}><div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px", fontSize: FS.micro }}>Par</div>{Array.from({length:count},(_,i) => (<input key={i} inputMode="numeric" value={pars[i]??""} onChange={e => setEditingCourse(prev => { const hp=[...(prev.draft.hole_pars||[])]; hp[start+i]=parseInt(e.target.value)||0; return {...prev,draft:{...prev.draft,hole_pars:hp}}; })} style={inpStyle} />))}<div style={{ textAlign:"center", color:ac, fontWeight:800, padding:"3px 0", fontSize: FS.label }}>{pars.reduce((a,b)=>a+(+b||0),0)}</div></div><div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 2 }}><div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px", fontSize: FS.micro }}>HCP</div>{Array.from({length:count},(_,i) => (<input key={i} inputMode="numeric" value={hcps[i]??""} onChange={e => setEditingCourse(prev => { const hh=[...(prev.draft.hole_handicaps||[])]; hh[start+i]=parseInt(e.target.value)||0; return {...prev,draft:{...prev.draft,hole_handicaps:hh}}; })} style={{...inpStyle, color:K.t3}} />))}<div /></div></div>); })}
            </div>
          </div>
        );
      })()}
      {confirmCourse && (confirmCourse.round || confirmCourse.delete) && (
        <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: SCRIM, zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setConfirmCourse(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: K.card, borderRadius: R.xl, padding: "20px 20px 16px", width: "100%", maxWidth: 360, boxShadow: "0 16px 48px rgba(0,0,0,0.6)" }}>
            {confirmCourse.round ? (<><div style={{ fontSize: FS.body, fontWeight: 700, color: K.warn, marginBottom: 8 }}>Reassign Round {confirmCourse.round}?</div><div style={{ fontSize: FS.small, color: K.t2, marginBottom: 20, lineHeight: 1.4 }}>Move R{confirmCourse.round} to <strong style={{ color: K.t1 }}>{confirmCourse.course.name}</strong>?</div><div style={{ display: "flex", gap: 10 }}><Btn variant="secondary" style={{ flex: 1, color: K.t2 }} onClick={() => setConfirmCourse(null)}>Cancel</Btn><Btn style={{ flex: 1 }} onClick={() => { setCourseForRound(confirmCourse.round, confirmCourse.course); setConfirmCourse(null); setPickingCourse(false); doCourseSearch(""); }}>Move</Btn></div></>) : (<><div style={{ fontSize: FS.body, fontWeight: 700, color: K.danger, marginBottom: 8 }}>Remove Course?</div><div style={{ fontSize: FS.small, color: K.t2, marginBottom: 20, lineHeight: 1.4 }}>Remove <strong style={{ color: K.t1 }}>{confirmCourse.course.name}</strong>?{confirmCourse.assignedRounds.length > 0 && <span style={{ color: K.warn }}> (unassigns R{confirmCourse.assignedRounds.join(", R")})</span>}</div><div style={{ display: "flex", gap: 10 }}><Btn variant="secondary" style={{ flex: 1, color: K.t2 }} onClick={() => setConfirmCourse(null)}>Cancel</Btn><Btn variant="danger" style={{ flex: 1 }} onClick={() => { confirmCourse.assignedRounds.forEach(r => setCourseForRound(r, { id: null, name: "" })); addCourse({ _delete: true, id: confirmCourse.course.id }); setConfirmCourse(null); }}>Remove</Btn></div></>)}
          </div>
        </div>
      )}
      {/* ── Round N: ONE card for the course and its tees ────────────────
          There used to be three stacked boxes here — an assigned-course
          summary, a course library/search box, and a tee card — each with its
          own header and padding, which is most of a phone screen before you
          reach a single player. They are one card now, because they are one
          decision: the round plays one course, off one set of tees.

          The card has two states. With a course assigned it shows that course
          and goes straight into tee assignment; the search is folded away
          behind "Change", since a round that already has a course does not
          need a search box parked under it. With no course (or after tapping
          Change) the same card IS the search.

          Cross-round assignment chips are gone with the old library grid: one
          course per round, picked in the round it belongs to. Using the same
          course twice is switching the round selector above and picking it
          again. */}
      {tab === "rounds" && (() => {
        const st = getRoundStatus(editRound);
        const assigned = st.course;
        const locked = st.finalized;
        const picking = !locked && (!assigned || pickingCourse);
        const closePicker = () => { setPickingCourse(false); doCourseSearch(""); setManualCourse(null); };
        return (
          <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${assigned ? ac  + ALPHA.hair : K.bdr}`, overflow: "hidden", marginBottom: 12 }}>

            {/* Header: what round, what course, and the way out of both states */}
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${K.bdr}` }}>
              {assigned && !picking && (
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: FS.body, fontWeight: 700, color: K.t1 }}>{assigned.name}</div>
                    {/* This line used to also carry an "R4 unset" run naming
                        every round with no course, on the theory that the round
                        pills above did not show it. They do: teesDone and
                        pairingsDone both require a course, so a round without
                        one wears two hollow red dots and can never do anything
                        else. The pills are the badge; a second copy of them in
                        prose, under a different round's course, was noise. */}
                    {locked && (
                      <div style={{ fontSize: FS.label, color: K.t3, fontWeight: 700 }}>Finalized</div>
                    )}
                  </div>
                  {!locked && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      {/* Tee sign-off. Lit while there is something to sign off —
                          never saved, or saved and then changed — and spent once
                          the round's tees are settled. A tick that is also a
                          button is a status light you have to discover you can
                          press; this says the word. */}
                      {(() => {
                        const saved = !!(teesSaved || {})[editRound];
                        const modified = !!(teesModified || {})[editRound];
                        const pending = !saved || modified;
                        return (
                          <button onClick={() => pending && onTeesSave && onTeesSave(editRound)}
                            title={pending ? "Save tee selections for this round" : "Tees saved"}
                            style={{
                              flexShrink: 0, padding: "5px 12px", borderRadius: R.sm, cursor: pending ? "pointer" : "default",
                              background: pending ? ac : "transparent",
                              border: `1px solid ${pending ? "transparent" : K.bdr}`,
                              color: pending ? ON_ACC : K.t3, fontSize: FS.label, fontWeight: 700,
                              transition: `background ${MOTION} ease, border-color ${MOTION} ease, color ${MOTION} ease`,
                            }}>{pending ? "Save" : "Saved"}</button>
                        );
                      })()}
                      {/* Pars, handicaps and tee boxes for the course this round is
                          playing — and, from inside the editor, swapping the course
                          for a different one. */}
                      <button onClick={() => { setRefetch({ busy: false, msg: "" }); setEditingCourse({ courseId: assigned.id, draft: { ...assigned, hole_pars: [...(assigned.hole_pars || Array(18).fill(4))], hole_handicaps: [...(assigned.hole_handicaps || Array(18).fill(0))], tee_boxes: (assigned.tee_boxes || []).map(t => ({ ...t })) } }); }}
                        style={{ flexShrink: 0, padding: "5px 12px", borderRadius: R.sm, background: "transparent", border: `1px solid ${ac}${ALPHA.line}`, color: ac, fontSize: FS.label, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                    </div>
                  )}
                </div>
              )}

              {/* A finalized round with no course is a dead end by design — there
                  is nothing to set and nothing to play. Say that rather than
                  leaving an empty card. */}
              {locked && !assigned && (
                <div style={{ fontSize: FS.label, color: K.t3 }}>Round {editRound} is finalized, and no course was ever set for it.</div>
              )}

              {picking && (
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={courseStateFilter} onChange={e => { setCourseStateFilter(e.target.value); if (courseSearch.trim().length >= 2) doCourseSearch(courseSearch, e.target.value); }}
                    style={{ width: 62, padding: "8px 5px", background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, flexShrink: 0 }}>
                    <option value="">All</option>
                    {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input value={courseSearch} onChange={e => doCourseSearch(e.target.value)} placeholder={`Search courses for Round ${editRound}…`}
                    style={{ flex: 1, minWidth: 0, padding: "8px 11px", background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, fontSize: FS.lead, boxSizing: "border-box" }} />
                  {/* Cancel only exists when there is something to go back to. */}
                  {assigned
                    ? <button onClick={closePicker} style={{ flexShrink: 0, padding: "0 10px", borderRadius: R.sm, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, fontSize: FS.label, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                    : courseSearch !== "" && <button onClick={() => { doCourseSearch(""); setManualCourse(null); }} style={{ flexShrink: 0, padding: "0 10px", borderRadius: R.sm, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, fontSize: FS.small, cursor: "pointer" }}>✕</button>}
                </div>
              )}

            </div>

            {/* ── PICKING: your courses, then the API ── */}
            {picking && (() => {
              const q = courseSearch.trim().toLowerCase();
              const searching = q.length >= 2;
              // The imported years brought ~50 courses in with them, each frozen
              // at the rating it was played off a decade ago. They belong to
              // their edition, not to a director setting up next Saturday, and
              // unfiltered they bury the handful actually in rotation.
              const pickable = courses.filter(c => !isHistoryCourseId(c.id));
              const lib = searching
                ? pickable.filter(c => (c.name || "").toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q))
                : pickable;
              const use = (c) => { setCourseForRound(editRound, c); closePicker(); };
              return (
                <>
                  {pickable.length === 0 && (
                    <div style={{ padding: 14, textAlign: "center", color: K.t3, fontSize: FS.label, lineHeight: 1.5 }}>
                      {demoOnly
                        ? "No courses saved yet. A director adds them to the shared list; anything in it can be used here."
                        : "No courses yet — search above to pull one from the course database, or add it by hand."}
                    </div>
                  )}
                  {courses.length > 0 && lib.length === 0 && (
                    <div style={{ padding: "9px 14px", color: K.t3, fontSize: FS.label }}>Nothing you have saved matches “{courseSearch.trim()}”.</div>
                  )}
                  {lib.length > 0 && (
                    <>
                      <div style={{ padding: "7px 14px 3px", fontSize: FS.micro, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your courses</div>
                      {lib.map((c, i) => {
                        const isAssigned = assigned && assigned.id === c.id;
                        const otherRounds = Array.from({ length: numRounds }, (_, ri) => ri + 1).filter(r => r !== editRound && tRounds.find(t => t.round_number === r && t.course_id === c.id));
                        return (
                          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderBottom: i < lib.length - 1 ? `1px solid ${K.bdr}${ALPHA.wash}` : "none", background: isAssigned ? ac  + ALPHA.wash : "transparent" }}>
                            {/* The whole row picks the course — the button beside
                                it is a label for what tapping does, not the only
                                place you may tap. */}
                            <button onClick={() => { if (!isAssigned) use(c); }} style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: isAssigned ? "default" : "pointer" }}>
                              <div style={{ fontSize: FS.small, fontWeight: 600, color: K.t1 }}>{c.name}</div>
                              <div style={{ fontSize: FS.micro, color: K.t3 }}>
                                {c.city}{c.city && c.state ? ", " : ""}{c.state}
                                {(c.tee_boxes || []).length ? ` · ${c.tee_boxes.length} tee${c.tee_boxes.length === 1 ? "" : "s"}` : ""}
                                {otherRounds.length > 0 ? ` · R${otherRounds.join(", R")}` : ""}
                              </div>
                            </button>
                            {isAssigned
                              ? <span style={{ fontSize: FS.micro, fontWeight: 700, color: ac, flexShrink: 0 }}>✓ this round</span>
                              : <button onClick={() => use(c)} style={{ flexShrink: 0, fontSize: FS.label, fontWeight: 700, color: K.t2, background: "transparent", border: `1px solid ${K.bdr}`, borderRadius: R.sm, padding: "3px 9px", cursor: "pointer" }}>Use</button>}
                            {/* Editing or removing a course rewrites the shared
                                library, which is not edition-scoped — a
                                sandbox administrator may USE a course and may
                                not change one. See demoOnly above. */}
                            {!demoOnly && <>
                              <button title="Edit course" onClick={() => setEditingCourse({ courseId: c.id, draft: { ...c, hole_pars: [...(c.hole_pars || Array(18).fill(4))], hole_handicaps: [...(c.hole_handicaps || Array(18).fill(0))], tee_boxes: (c.tee_boxes || []).map(t => ({ ...t })) } })}
                                style={{ flexShrink: 0, background: "transparent", border: "none", color: ac, fontSize: FS.label, fontWeight: 700, cursor: "pointer", padding: "2px 2px" }}>Edit</button>
                              <button title="Remove from your courses" onClick={() => setConfirmCourse({ course: c, delete: true, assignedRounds: Array.from({ length: numRounds }, (_, ri) => ri + 1).filter(r => tRounds.find(t => t.round_number === r && t.course_id === c.id)) })}
                                style={{ flexShrink: 0, background: "transparent", border: "none", color: K.t3, fontSize: FS.small, cursor: "pointer", padding: "2px 2px", lineHeight: 1 }}>✕</button>
                            </>}
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* API results — only once the query is worth sending, and
                      never for a sandbox administrator: pulling a course out
                      of the database ADDS it to the shared library, which the
                      rules refuse them. The saved list above is theirs to
                      assign from. */}
                  {searching && !demoOnly && (
                    <div style={{ padding: 14, borderTop: `1px solid ${K.bdr}` }}>
                      <div style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Search results</div>
                  {searchLoading && <div style={{ textAlign: "center", padding: 12, color: K.t3, fontSize: FS.label }}>Searching courses...</div>}
                  {!searchLoading && courseSearch.trim().length >= 2 && searchResults.length === 0 && !manualCourse && (
                    <div style={{ textAlign: "center", padding: "10px 0", color: K.t3, fontSize: FS.label }}>No courses found</div>
                  )}
                  {!searchLoading && manualCourse && (() => {
                    const mc = manualCourse;
                    const setMc = fn => setManualCourse(prev => fn(prev));
                    const inpBase = { background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.sm, color: K.t1, padding: "6px 8px", fontSize: FS.small, boxSizing: "border-box" };
                    const tinyInp = { background: K.inp, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.xs, color: K.t1, fontSize: FS.micro, textAlign: "center", width: "100%", padding: "2px 1px", boxSizing: "border-box" };
                    const label = (txt) => <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>{txt}</div>;
                    const canSave = mc.name.trim().length > 1;
                    return (
                      <div style={{ background: K.card, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.md, padding: 14, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: FS.small, fontWeight: 800, color: K.t1 }}>Manual Course Entry</span>
                          <button onClick={() => setManualCourse(null)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
                        </div>

                        {/* Name / City / State */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px", gap: 6, marginBottom: 8 }}>
                          <div>
                            {label("Course Name")}
                            <input value={mc.name} onChange={e => setMc(p=>({...p,name:e.target.value}))} style={{...inpBase, width:"100%"}} placeholder="e.g. Treetops Resort" />
                          </div>
                          <div>
                            {label("City")}
                            <input value={mc.city} onChange={e => setMc(p=>({...p,city:e.target.value}))} style={{...inpBase, width:"100%"}} placeholder="e.g. Gaylord" />
                          </div>
                          <div>
                            {label("State")}
                            <select value={mc.state} onChange={e => setMc(p=>({...p,state:e.target.value}))} style={{...inpBase, width:"100%"}}>
                              <option value="">—</option>
                              {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Tee Boxes */}
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            {label("Tee Boxes")}
                            <button onClick={() => setMc(p=>({...p, tee_boxes:[...p.tee_boxes, {name:"", color:"#888888", rating:72.0, slope:113, par:72, yardage:0}]}))}
                              style={{ fontSize: FS.micro, padding: "1px 6px", borderRadius: R.xs, background: "transparent", border: `1px solid ${ac}${ALPHA.line}`, color: ac, cursor: "pointer", fontWeight: 700 }}>+ Tee</button>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "12px 70px 50px 44px 32px 32px 40px 20px", gap: 3, fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 2, paddingLeft: 2 }}>
                            <div/>
                            <div>Name</div><div>Color</div><div>Rating</div><div>Slope</div><div>Par</div><div>Yards</div><div/>
                          </div>
                          {mc.tee_boxes.map((tb, tbi) => (
                            <div key={tbi} style={{ display: "grid", gridTemplateColumns: "12px 70px 50px 44px 32px 32px 40px 20px", gap: 3, marginBottom: 3, alignItems: "center" }}>
                              <TeeColorSwatch color={tb.color} name={tb.name} size={10} />
                              <input value={tb.name} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],name:e.target.value}; return {...p,tee_boxes:t};})} style={{...tinyInp, textAlign:"left", padding:"2px 4px"}} placeholder="Name" />
                              <div style={{ position:"relative", width:"100%", height:22, flexShrink:0 }}>
                                <div style={{ position:"absolute", inset:0, borderRadius: R.xs, background:tb.color||"#888", border:"1px solid #ffffff25", pointerEvents:"none" }} />
                                <select value={Object.entries(TEE_COLOR_MAP).find(([,v])=>v===(tb.color||""))?.[0] || "black"}
                                  onChange={e => { const clr = TEE_COLOR_MAP[e.target.value] || tb.color || "#888888"; setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],color:clr}; return {...p,tee_boxes:t};}); }}
                                  style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", fontSize: FS.small }}>
                                  {[["Black","#2c2c2c"],["Blue","#2d8fd4"],["White","#e8e8e8"],["Gold","#d4a843"],["Red","#9b2335"],["Green","#2d8a4e"],["Silver","#a8b2bd"],["Yellow","#e6c619"],["Orange","#e67e22"],["Purple","#7b2d8b"],["Maroon","#6b1c2a"],["Teal","#1a8a7a"],["Platinum","#c0c0c0"]].map(([n])=><option key={n} value={n.toLowerCase()}>{n}</option>)}
                                </select>
                              </div>
                              <input value={tb.rating} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],rating:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                              <input value={tb.slope} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],slope:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                              <input value={tb.par} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],par:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                              <input value={tb.yardage} onChange={e => setMc(p=>{const t=[...p.tee_boxes]; t[tbi]={...t[tbi],yardage:e.target.value}; return {...p,tee_boxes:t};})} style={tinyInp} />
                              <button onClick={() => setMc(p=>({...p,tee_boxes:p.tee_boxes.filter((_,i)=>i!==tbi)}))} style={{ background:"transparent", border:"none", color:K.t3, fontSize: FS.label, cursor:"pointer", padding:0, lineHeight:1 }}>✕</button>
                            </div>
                          ))}
                        </div>

                        {/* Hole Pars & Handicaps */}
                        {[["Front 9", 0, 9], ["Back 9", 9, 9]].map(([label9, start, count]) => (
                          <div key={label9} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 3, textTransform: "uppercase" }}>{label9}</div>
                            <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                              <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                              {Array.from({length:count},(_,i) => <div key={i} style={{ textAlign:"center", color:K.t2, fontWeight:700, padding:"2px 0" }}>{start+i+1}</div>)}
                              <div />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro, background: K.inp, borderRadius: R.xs, marginBottom: 2 }}>
                              <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                              {Array.from({length:count},(_,i) => (
                                <input key={i} value={mc.hole_pars[start+i]??""} onChange={e => setMc(p=>{const hp=[...p.hole_pars]; hp[start+i]=e.target.value; return {...p,hole_pars:hp};})}
                                  style={{ background:"transparent", border:"none", color:K.t1, fontSize: FS.micro, fontWeight:700, textAlign:"center", width:"100%", padding:"3px 0" }} />
                              ))}
                              <div style={{ textAlign:"center", color:ac, fontWeight:800, padding:"3px 0", fontSize: FS.micro }}>
                                {mc.hole_pars.slice(start,start+count).reduce((a,b)=>a+(parseInt(b)||0),0)}
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                              <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                              {Array.from({length:count},(_,i) => (
                                <input key={i} value={mc.hole_handicaps[start+i]??""} onChange={e => setMc(p=>{const hh=[...p.hole_handicaps]; hh[start+i]=e.target.value; return {...p,hole_handicaps:hh};})}
                                  style={{ background:"transparent", border:"none", color:K.t3, fontSize: FS.micro, textAlign:"center", width:"100%", padding:"2px 0" }} />
                              ))}
                              <div />
                            </div>
                          </div>
                        ))}

                        {/* Save button */}
                        <button onClick={() => {
                          const firstTee = mc.tee_boxes[0];
                          const course = {
                            ...mc,
                            par: parseInt(firstTee?.par) || 72,
                            slope: parseInt(firstTee?.slope) || 113,
                            rating: parseFloat(firstTee?.rating) || 72.0,
                            hole_pars: mc.hole_pars.map(v=>parseInt(v)||4),
                            hole_handicaps: mc.hole_handicaps.map(v=>parseInt(v)||0),
                            tee_boxes: mc.tee_boxes.map(tb=>({...tb, rating:parseFloat(tb.rating)||72.0, slope:parseInt(tb.slope)||113, par:parseInt(tb.par)||72, yardage:parseInt(tb.yardage)||0})),
                          };
                          addCourseToLibrary(course);
                          setManualCourse(null);
                        }} disabled={!canSave} style={{ width:"100%", padding:"10px 0", borderRadius: R.sm, background: canSave ? ac : K.bdr, border:"none", color: canSave ? K.bg : K.t3, fontSize: FS.small, fontWeight:700, cursor: canSave ? "pointer" : "default", marginTop:4 }}>
                          ✓ Add Course
                        </button>
                      </div>
                    );
                  })()}
                  {!searchLoading && searchResults.filter(c => !courses.find(ex => ex.id === c.id)).map(c => (
                    <button key={c.id} onClick={() => {
                      const sbVer = c._sbVersion || (c.updated_at ? c : null);
                      const hasLocalData = !!(sbVer && (sbVer.updated_at || c.updated_at));
                      if (hasLocalData) {
                        // Course exists in local DB — prompt user to use local or fetch fresh
                        const localCourse = sbVer || c;
                        setLocalDbPrompt({ sbCourse: localCourse, apiCourse: c._apiVersion || null, fullCourse: c });
                      } else if (c._apiVersion) {
                        if (c._apiHasReal && !c._sbHasReal) {
                          const { _apiVersion, _sbHasReal, _apiHasReal, ...sbBase } = c;
                          setCoursePreview({ ...sbBase, ...c._apiVersion, _apiVersion: c._apiVersion, _apiHasReal: true, _sbHasReal: false });
                        } else {
                          setCoursePreview(c);
                        }
                      } else {
                        setCoursePreview(c);
                      }
                    }} style={{ display: "block", width: "100%", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.md, padding: "10px 14px", cursor: "pointer", textAlign: "left", color: K.t1, marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontWeight: 600, fontSize: FS.small }}>{c.name}</div>
                            {c._incompleteData && <span style={{ fontSize: FS.micro, background: "#d4584520", border: "1px solid #d4584540", color: "#d45845", borderRadius: R.xs, padding: "1px 5px", fontWeight: 700 }}>⚠ incomplete data</span>}
                            {!c._incompleteData && (c.tee_boxes?.length || 0) < 2 && <span style={{ fontSize: FS.micro, background: K.gold + ALPHA.tint, border: `1px solid ${K.gold}${ALPHA.hair}`, color: K.gold, borderRadius: R.xs, padding: "1px 5px", fontWeight: 700 }}>⚠ 1 tee</span>}
                            {c._source && c._source !== "WBC History" && <span style={{ fontSize: FS.micro, background: `${ac}${ALPHA.wash}`, border: `1px solid ${ac}${ALPHA.hair}`, color: ac, borderRadius: R.xs, padding: "1px 5px", fontWeight: 600 }}>{c._source}</span>}
                            {c.updated_at && (() => {
                              const d = new Date(c.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                              return (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: FS.micro, background: "#2d8a4e20", border: "1px solid #2d8a4e40", color: "#2d8a4e", borderRadius: R.xs, padding: "1px 5px", fontWeight: 600 }}>
                                  <img src={TROPHY_SVG_URL} alt="" style={{ width: 9, height: 9, filter: "brightness(0) saturate(100%) invert(42%) sepia(73%) saturate(400%) hue-rotate(100deg) brightness(95%)" }} />
                                  {d}{c.updated_by && c.updated_by !== "Unknown" ? ` · ${c.updated_by}` : ""}
                                </span>
                              );
                            })()}
                          </div>
                          <div style={{ fontSize: FS.label, color: K.t3 }}>{c.city}{c.state ? `, ${c.state}` : ""}{c.par ? ` · Par ${c.par}` : ""}{(() => { const realTbSlope = (c.tee_boxes || []).find(t => parseInt(t.slope) !== 113)?.slope; const displaySlope = realTbSlope || (c.slope && parseInt(c.slope) !== 113 ? c.slope : null); return displaySlope ? ` · Slope ${displaySlope}` : ""; })()}</div>
                        </div>
                        <span style={{ color: ac, fontSize: FS.label, fontWeight: 700 }}>Preview →</span>
                      </div>
                    </button>
                  ))}
                  {/* Adding by hand is offered whenever a search is on, not only
                      when it came back empty. The API returning SOMETHING is not
                      the same as it returning the course you are playing, and the
                      old shape — button only when there were no results at all —
                      left a director who could see three wrong courses with no
                      way through except typing a nonsense query to clear them. */}
                  {!searchLoading && courseSearch.trim().length >= 2 && !manualCourse && (
                    <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
                      <button onClick={() => setManualCourse({
                        id: `manual_${Date.now()}`,
                        name: courseSearch.trim(),
                        city: "", state: courseStateFilter || "",
                        par: 72, slope: 113, rating: 72.0,
                        hole_pars: Array(18).fill(4),
                        hole_handicaps: Array(18).fill(0).map((_,i)=>i+1),
                        tee_boxes: [
                          { name: "Black", color: "#222222", rating: 74.0, slope: 130, par: 72, yardage: 6800 },
                          { name: "Blue",  color: "#1a56db", rating: 72.0, slope: 120, par: 72, yardage: 6400 },
                          { name: "White", color: "#e5e7eb", rating: 70.0, slope: 113, par: 72, yardage: 6000 },
                          { name: "Red",   color: "#e02424", rating: 68.0, slope: 108, par: 72, yardage: 5400 },
                        ],
                      })} style={{ padding: "7px 16px", borderRadius: R.sm, background: "transparent", border: `1px solid ${ac}`, color: ac, fontSize: FS.label, fontWeight: 700, cursor: "pointer" }}>
                        + Add “{courseSearch.trim()}” by hand
                      </button>
                    </div>
                  )}
                  {/* Local DB prompt modal */}
                  {localDbPrompt && (() => {
                    const { sbCourse } = localDbPrompt;
                    const tbs = sbCourse.tee_boxes || [];
                    const updatedAt = sbCourse.updated_at;
                    const updatedBy = sbCourse.updated_by || "Unknown";
                    const formattedDate = updatedAt ? new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
                    const ScorecardPreview = ({ course }) => {
                      const hp = course.hole_pars || [];
                      const hh = course.hole_handicaps || [];
                      if (!hp.length) return <div style={{ fontSize: FS.label, color: K.t3, fontStyle: "italic", marginBottom: 8 }}>No hole data available</div>;
                      return (
                        <div style={{ marginBottom: 10 }}>
                          {[["Front", 0, 9], ["Back", 9, 9]].map(([lbl, start, count]) => {
                            const pars = hp.slice(start, start + count);
                            const hcps = hh.slice(start, start + count);
                            const firstTee = (course.tee_boxes || [])[0];
                            const yds = (firstTee?.hole_yards || []).slice(start, start + count);
                            const hasYds = yds.some(y => y > 0);
                            return (
                              <div key={lbl} style={{ marginBottom: 4 }}>
                                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                  <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                                  {Array.from({length: count}, (_, i) => <div key={i} style={{ textAlign: "center", color: K.t2, fontWeight: 700, padding: "2px 0" }}>{start + i + 1}</div>)}
                                  <div style={{ textAlign: "center", color: K.t3, fontSize: FS.micro, padding: "2px 0" }}>Tot</div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro, background: K.inp, borderRadius: R.xs, marginBottom: 1 }}>
                                  <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                                  {pars.map((p, i) => <div key={i} style={{ textAlign: "center", color: K.t1, fontWeight: 700, padding: "3px 0" }}>{p || "–"}</div>)}
                                  <div style={{ textAlign: "center", color: ac, fontWeight: 800, padding: "3px 0", fontSize: FS.micro }}>{pars.reduce((a, b) => a + (parseInt(b) || 0), 0)}</div>
                                </div>
                                {hcps.some(h => h > 0) && (
                                  <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro, marginBottom: 1 }}>
                                    <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                                    {hcps.map((h, i) => <div key={i} style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{h || "–"}</div>)}
                                    <div />
                                  </div>
                                )}
                                {hasYds && (
                                  <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                    <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>Yds</div>
                                    {yds.map((y, i) => <div key={i} style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{y || "–"}</div>)}
                                    <div style={{ textAlign: "center", color: K.t3, padding: "2px 0" }}>{yds.reduce((a, b) => a + (parseInt(b) || 0), 0) || ""}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    };
                    return (
                      <CoursePreviewPortal>
                      <div style={{ position: "fixed", inset: 0, background: SCRIM, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                        <div style={{ background: K.card, borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto", padding: "20px 18px 28px" }}>
                          {/* Header */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: FS.lead, color: K.t1, marginBottom: 2 }}>{sbCourse.name}</div>
                              <div style={{ fontSize: FS.label, color: K.t3 }}>{[sbCourse.city, sbCourse.state].filter(Boolean).join(", ")} · Par {sbCourse.par} · Slope {sbCourse.slope}</div>
                            </div>
                            <span onClick={() => setLocalDbPrompt(null)} style={{ fontSize: FS.title, color: K.t3, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>✕</span>
                          </div>

                          {/* Local DB notice */}
                          <div style={{ background: `${ac}${ALPHA.wash}`, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.md, padding: "10px 14px", marginBottom: 16 }}>
                            <div style={{ fontWeight: 700, fontSize: FS.small, color: ac, marginBottom: 4 }}>📁 Course exists in local database</div>
                            <div style={{ fontSize: FS.label, color: K.t2 }}>
                              Last saved {formattedDate ? `on ${formattedDate}` : ""} by <strong>{updatedBy}</strong>
                            </div>
                            <div style={{ fontSize: FS.label, color: K.t3, marginTop: 2 }}>
                              {tbs.length} tee {tbs.length === 1 ? "box" : "boxes"}{tbs.length > 0 ? ` — ${tbs.map(t => t.name).join(", ")}` : ""}
                            </div>
                          </div>

                          {/* Tee boxes preview */}
                          {tbs.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Tee Boxes</div>
                              <div style={{ display: "grid", gridTemplateColumns: "14px 1fr 44px 38px 30px 46px", gap: "3px 4px", fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 3, paddingLeft: 2 }}>
                                <div/><div>Name</div><div style={{textAlign:"center"}}>Rating</div><div style={{textAlign:"center"}}>Slope</div><div style={{textAlign:"center"}}>Par</div><div style={{textAlign:"center"}}>Yards</div>
                              </div>
                              {tbs.map((tb, i) => (
                                <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr 44px 38px 30px 46px", gap: "3px 4px", marginBottom: 3, alignItems: "center", fontSize: FS.label }}>
                                  <TeeColorSwatch color={tb.color} name={tb.name} size={12} />
                                  <div style={{ color: K.t1, fontWeight: 600 }}>{tb.name}</div>
                                  <div style={{ textAlign: "center", color: K.t2 }}>{tb.rating}</div>
                                  <div style={{ textAlign: "center", color: K.t2 }}>{tb.slope}</div>
                                  <div style={{ textAlign: "center", color: K.t2 }}>{tb.par}</div>
                                  <div style={{ textAlign: "center", color: K.t2 }}>{tb.yardage ? tb.yardage.toLocaleString() : "–"}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Scorecard preview */}
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Scorecard</div>
                            <ScorecardPreview course={sbCourse} />
                          </div>

                          {/* Action buttons */}
                          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                            <button onClick={() => {
                              // Use local data — open preview with Firestore course
                              setLocalDbPrompt(null);
                              setCoursePreview({ ...sbCourse, _source: "WBC History" });
                            }} style={{ flex: 1, padding: "12px 0", borderRadius: R.md, background: ac, border: "none", color: "#0a1628", fontSize: FS.small, fontWeight: 700, cursor: "pointer" }}>
                              ✓ Use Local Data
                            </button>
                            <button onClick={async () => {
                              // Fetch fresh from API — run search and open preview with API data
                              setLocalDbPrompt(null);
                              setSearchLoading(true);
                              try {
                                const q = sbCourse.name;
                                const stateParam = sbCourse.state ? `&state=${encodeURIComponent(sbCourse.state)}` : "";
                                const res = await fetch(apiUrl(`/api/courses2?search=${encodeURIComponent(q)}${stateParam}`));
                                const rapidRaw = res.ok ? await res.json() : [];
                                // Through the same parser the search uses. The raw row is
                                // scorecard/slopeRating shaped; the preview wants tee_boxes
                                // and hole tables, so an unparsed row shows a course with no
                                // tees at all — which is the opposite of what "fresh" means.
                                const allApi = parseRapidAPI(Array.isArray(rapidRaw) ? rapidRaw : rapidRaw.courses || [], sbCourse.state);
                                // Simple: find best match by name
                                const match = allApi.find(c => (c.name || "").toLowerCase().includes(q.toLowerCase().split(" ")[0]));
                                if (match) {
                                  setCoursePreview({ ...sbCourse, ...match, id: sbCourse.id, _source: match._source || "API", _freshFetch: true });
                                } else {
                                  // No API match — fall back to local
                                  setCoursePreview({ ...sbCourse, _source: "WBC History" });
                                }
                              } catch {
                                setCoursePreview({ ...sbCourse, _source: "WBC History" });
                              }
                              setSearchLoading(false);
                            }} style={{ flex: 1, padding: "12px 0", borderRadius: R.md, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t2, fontSize: FS.small, fontWeight: 600, cursor: "pointer" }}>
                              🔄 Fetch Fresh
                            </button>
                          </div>
                        </div>
                      </div>
                      </CoursePreviewPortal>
                    );
                  })()}

                  {/* Course preview/confirm modal */}
                  {coursePreview && (() => {
                    const draft = coursePreview;
                    const setDraft = fn => setCoursePreview(prev => fn(prev));
                    const tbs = draft.tee_boxes || [];
                    const hasConflict = !!draft._apiVersion;
                    const ti = { background: K.bg, border: `1px solid ${ac}${ALPHA.hair}`, borderRadius: R.xs, color: K.t1, fontSize: FS.micro, textAlign: "center", width: "100%", padding: "3px 2px", boxSizing: "border-box" };
                    const tiL = { ...ti, textAlign: "left", padding: "3px 5px" };
                    return (
                      <CoursePreviewPortal>
                      <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: SCRIM, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                        <div style={{ background: K.card, borderRadius: R.xl, border: `1px solid ${ac}${ALPHA.hair}`, width: "100%", maxWidth: 420, maxHeight: "calc(100vh - 48px)", overflowY: "auto", padding: 0 }}>

                          {/* Header */}
                          <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${K.bdr}`, position: "sticky", top: 0, background: K.card, zIndex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1, marginRight: 8 }}>
                                <input value={draft.name} onChange={e => setDraft(p => ({...p, name: e.target.value}))}
                                  style={{ background: "transparent", border: "none", borderBottom: `1px solid ${ac}${ALPHA.hair}`, color: K.t1, fontSize: FS.lead, fontWeight: 800, width: "100%", padding: "2px 0" }} />
                                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                                  <input value={draft.city} onChange={e => setDraft(p => ({...p, city: e.target.value}))} placeholder="City"
                                    style={{ ...tiL, fontSize: FS.lead, flex: 1 }} />
                                  <select value={draft.state} onChange={e => setDraft(p => ({...p, state: e.target.value}))}
                                    style={{ ...ti, fontSize: FS.label, width: 52 }}>
                                    <option value="">—</option>
                                    {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              </div>
                              <button onClick={() => setCoursePreview(null)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
                            </div>

                            {/* Source conflict banner */}
                            {hasConflict && (() => {
                              const sbHasReal = draft._sbHasReal;
                              const apiHasReal = draft._apiHasReal;
                              const sbSlope = draft.tee_boxes?.find(t => parseInt(t.slope) !== 113)?.slope || draft.slope;
                              const apiSlope = draft._apiVersion?.tee_boxes?.find(t => parseInt(t.slope) !== 113)?.slope || draft._apiVersion?.slope;
                              const bothReal = sbHasReal && apiHasReal;
                              const bannerColor = bothReal ? K.gold : "#5b9bd5";
                              const bannerMsg = bothReal
                                ? "⚡ Both sources have real slope data — review each and pick the most accurate:"
                                : "ℹ️ One source has real slope data — selecting the better one:";
                              return (
                                <div style={{ marginTop: 8, padding: "8px 10px", background: `${bannerColor}${ALPHA.wash}`, border: `1px solid ${bannerColor}${ALPHA.hair}`, borderRadius: R.sm }}>
                                  <div style={{ fontSize: FS.micro, color: bannerColor, fontWeight: 700, marginBottom: 6 }}>{bannerMsg}</div>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button onClick={() => setDraft(p => { const {_apiVersion, _sbHasReal, _apiHasReal, ...sb} = p; return sb; })}
                                      style={{ flex: 1, padding: "6px 4px", borderRadius: R.sm, background: sbHasReal ? ac + ALPHA.tint : "transparent", border: `1px solid ${sbHasReal ? ac : K.bdr}`, color: sbHasReal ? ac : K.t3, fontSize: FS.micro, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                                      📦 WBC History
                                      <div style={{ fontSize: FS.micro, fontWeight: 400, color: K.t3, marginTop: 2 }}>{draft.tee_boxes?.length || 0} tees · Slope {sbSlope || "?"}</div>
                                      {sbHasReal && <div style={{ fontSize: FS.micro, color: ac, marginTop: 1 }}>✓ real data</div>}
                                      {!sbHasReal && <div style={{ fontSize: FS.micro, color: "#d4584580", marginTop: 1 }}>placeholder</div>}
                                    </button>
                                    <button onClick={() => setDraft(p => { const api = p._apiVersion; return { ...p, par: api.par, slope: api.slope, rating: api.rating, hole_pars: api.hole_pars, hole_handicaps: api.hole_handicaps, tee_boxes: api.tee_boxes, _apiVersion: undefined, _sbHasReal: undefined, _apiHasReal: undefined }; })}
                                      style={{ flex: 1, padding: "6px 4px", borderRadius: R.sm, background: apiHasReal && !sbHasReal ? ac + ALPHA.tint : "transparent", border: `1px solid ${apiHasReal ? ac : K.bdr}`, color: apiHasReal ? ac : K.t3, fontSize: FS.micro, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                                      🌐 API (Fresh)
                                      <div style={{ fontSize: FS.micro, fontWeight: 400, color: K.t3, marginTop: 2 }}>{draft._apiVersion?.tee_boxes?.length || 0} tees · Slope {apiSlope || "?"}</div>
                                      {apiHasReal && <div style={{ fontSize: FS.micro, color: ac, marginTop: 1 }}>✓ real data</div>}
                                      {!apiHasReal && <div style={{ fontSize: FS.micro, color: "#d4584580", marginTop: 1 }}>placeholder</div>}
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}
                            {!hasConflict && draft._incompleteData && (
                              <div style={{ marginTop: 8, padding: "8px 10px", background: "#d4584510", border: "1px solid #d4584540", borderRadius: R.sm, fontSize: FS.micro, color: "#d45845" }}>
                                ⚠ Neither API has complete data for this course. Slope, rating, and tee boxes may be missing or inaccurate — please enter them manually before adding.
                              </div>
                            )}
                            {!hasConflict && !draft._incompleteData && (draft.tee_boxes?.length || 0) < 2 && (
                              <div style={{ marginTop: 8, padding: "8px 10px", background: K.gold + ALPHA.wash, border: `1px solid ${K.gold}${ALPHA.hair}`, borderRadius: R.sm, fontSize: FS.micro, color: K.gold }}>
                                ⚠ Only {draft.tee_boxes?.length || 0} tee box found — most courses have multiple tees. Tap <strong>+ Tee</strong> above to add Black, Blue, White, Red etc. with their ratings and slopes.
                              </div>
                            )}
                            {!hasConflict && !draft._incompleteData && (draft.tee_boxes?.length || 0) >= 2 && (
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                                <div style={{ fontSize: FS.micro, color: K.t3, fontStyle: "italic" }}>Review and edit before adding — tap any field to change it</div>
                                {draft._source && <span style={{ fontSize: FS.micro, background: `${ac}${ALPHA.wash}`, border: `1px solid ${ac}${ALPHA.hair}`, color: ac, borderRadius: R.xs, padding: "1px 6px", fontWeight: 600, flexShrink: 0 }}>{draft._source}</span>}
                                {!draft._source && <span style={{ fontSize: FS.micro, background: "#88888815", border: "1px solid #88888830", color: K.t3, borderRadius: R.xs, padding: "1px 6px", fontWeight: 600, flexShrink: 0 }}>WBC History</span>}
                              </div>
                            )}
                          </div>

                          <div style={{ padding: "12px 16px" }}>

                            {/* Tee Boxes — fully editable */}
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 700, textTransform: "uppercase" }}>Tee Boxes</div>
                                <button onClick={() => setDraft(p => ({ ...p, tee_boxes: [...(p.tee_boxes||[]), { name: "", color: "#888888", rating: 72.0, slope: 113, par: 72, yardage: 0 }] }))}
                                  style={{ fontSize: FS.micro, padding: "2px 7px", borderRadius: R.xs, background: "transparent", border: `1px solid ${ac}${ALPHA.line}`, color: ac, cursor: "pointer", fontWeight: 700 }}>+ Tee</button>
                              </div>
                              {tbs.length === 0 && <div style={{ fontSize: FS.label, color: K.warn, marginBottom: 8, fontStyle: "italic" }}>⚠ No tees from API — add them manually below</div>}
                              {/* Column headers */}
                              <div style={{ display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 30px 46px 18px", gap: "3px 4px", fontSize: FS.micro, color: K.t3, fontWeight: 600, marginBottom: 3, paddingLeft: 2 }}>
                                <div/><div>Name</div><div style={{textAlign:"center"}}>Rating</div><div style={{textAlign:"center"}}>Slope</div><div style={{textAlign:"center"}}>Par</div><div style={{textAlign:"center"}}>Yards</div><div/>
                              </div>
                              {tbs.map((tb, i) => (
                                <div key={i} style={{ display: "grid", gridTemplateColumns: "18px 1fr 44px 38px 30px 46px 18px", gap: "3px 4px", marginBottom: 4, alignItems: "center" }}>
                                  <div style={{ position:"relative", width:18, height:18, flexShrink:0 }}>
                                    <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}><TeeColorSwatch color={tb.color} name={tb.name} size={18} style={{ borderRadius: R.xs, width:"100%", height:"100%" }} /></div>
                                    <select value={Object.entries(TEE_COLOR_MAP).find(([,v])=>v===(tb.color||""))?.[0] || "black"}
                                      onChange={e => { const clr = TEE_COLOR_MAP[e.target.value] || "#888888"; setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],color:clr,name:t[i].name||e.target.value.charAt(0).toUpperCase()+e.target.value.slice(1)}; return {...p,tee_boxes:t}; }); }}
                                      style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0, cursor:"pointer", fontSize: FS.small }}>
                                      {[["Black","#2c2c2c"],["Blue","#2d8fd4"],["White","#e8e8e8"],["Gold","#d4a843"],["Red","#9b2335"],["Green","#2d8a4e"],["Silver","#a8b2bd"],["Yellow","#e6c619"],["Orange","#e67e22"],["Purple","#7b2d8b"],["Maroon","#6b1c2a"],["Teal","#1a8a7a"],["Platinum","#c0c0c0"]].map(([n])=><option key={n} value={n.toLowerCase()}>{n}</option>)}
                                    </select>
                                  </div>
                                  <input value={tb.name} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],name:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={tiL} placeholder="Name" />
                                  <input value={tb.rating} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],rating:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={ti} />
                                  <input value={tb.slope} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],slope:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={ti} />
                                  <input value={tb.par} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],par:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={ti} />
                                  <input value={tb.yardage} onChange={e => setDraft(p => { const t=[...p.tee_boxes]; t[i]={...t[i],yardage:e.target.value}; return {...p,tee_boxes:t}; })}
                                    style={ti} />
                                  <button onClick={() => setDraft(p => ({...p, tee_boxes: p.tee_boxes.filter((_,j) => j!==i)}))}
                                    style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.label, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
                                </div>
                              ))}
                            </div>

                            {/* Scorecard — editable pars & handicaps */}
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: FS.micro, color: K.t3, fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Scorecard</div>
                              {(draft.hole_pars?.length === 0) && <div style={{ fontSize: FS.label, color: K.warn, marginBottom: 6, fontStyle: "italic" }}>⚠ No hole data from API — enter pars below</div>}
                              {[["Front", 0, 9], ["Back", 9, 9]].map(([lbl, start, count]) => {
                                const pars = (draft.hole_pars || Array(18).fill(4)).slice(start, start+count);
                                const hcps = (draft.hole_handicaps || Array(18).fill(0)).slice(start, start+count);
                                return (
                                  <div key={lbl} style={{ marginBottom: 6 }}>
                                    <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                      <div style={{ color: K.t3, fontWeight: 600, padding: "2px 0" }}>Hole</div>
                                      {Array.from({length:count},(_,i) => <div key={i} style={{ textAlign:"center", color:K.t2, fontWeight:700, padding:"2px 0" }}>{start+i+1}</div>)}
                                      <div style={{ textAlign:"center", color:K.t3, fontSize: FS.micro, padding:"2px 0" }}>Tot</div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro, background: K.inp, borderRadius: R.xs, marginBottom: 1 }}>
                                      <div style={{ color: K.t3, fontWeight: 600, padding: "3px 2px" }}>Par</div>
                                      {Array.from({length:count},(_,i) => (
                                        <input key={i} value={pars[i] ?? ""} onChange={e => setDraft(p => { const hp=[...(p.hole_pars||Array(18).fill(4))]; hp[start+i]=e.target.value; return {...p,hole_pars:hp}; })}
                                          style={{ background:"transparent", border:"none", color:K.t1, fontSize: FS.micro, fontWeight:700, textAlign:"center", width:"100%", padding:"3px 0" }} />
                                      ))}
                                      <div style={{ textAlign:"center", color:ac, fontWeight:800, padding:"3px 0", fontSize: FS.micro }}>{pars.reduce((a,b)=>a+(parseInt(b)||0),0)}</div>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                      <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>HCP</div>
                                      {Array.from({length:count},(_,i) => (
                                        <input key={i} value={hcps[i] ?? ""} onChange={e => setDraft(p => { const hh=[...(p.hole_handicaps||Array(18).fill(0))]; hh[start+i]=e.target.value; return {...p,hole_handicaps:hh}; })}
                                          style={{ background:"transparent", border:"none", color:K.t3, fontSize: FS.micro, textAlign:"center", width:"100%", padding:"2px 0" }} />
                                      ))}
                                      <div />
                                    </div>
                                    {(() => {
                                      const activeTee = (draft.tee_boxes || [])[0];
                                      const hy = activeTee?.hole_yards || [];
                                      if (!hy.some(y => y > 0)) return null;
                                      const yds = hy.slice(start, start+count);
                                      const tot = yds.reduce((a,b) => a+(parseInt(b)||0), 0);
                                      return (
                                        <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 30px`, gap: 1, fontSize: FS.micro }}>
                                          <div style={{ color: K.t3, fontWeight: 600, padding: "2px 2px" }}>Yds</div>
                                          {yds.map((y, i) => <div key={i} style={{ textAlign: "center", color: K.t3, padding: "2px 0", fontSize: FS.micro }}>{y || "–"}</div>)}
                                          <div style={{ textAlign: "center", color: K.t3, padding: "2px 0", fontSize: FS.micro }}>{tot || ""}</div>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                              <button onClick={() => setCoursePreview(null)} style={{ flex: 1, padding: "10px 0", borderRadius: R.sm, background: "transparent", border: `1px solid ${K.bdr}`, color: K.t3, fontSize: FS.small, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                              <button onClick={() => {
                                const firstTee = draft.tee_boxes?.[0];
                                const finalCourse = {
                                  ...draft,
                                  par: parseInt(firstTee?.par) || draft.par || 72,
                                  slope: parseInt(firstTee?.slope) || draft.slope || 113,
                                  rating: parseFloat(firstTee?.rating) || draft.rating || 72.0,
                                  hole_pars: (draft.hole_pars||[]).map(v => parseInt(v)||4),
                                  hole_handicaps: (draft.hole_handicaps||[]).map(v => parseInt(v)||0),
                                  tee_boxes: (draft.tee_boxes||[]).map(tb => ({...tb, rating:parseFloat(tb.rating)||72.0, slope:parseInt(tb.slope)||113, par:parseInt(tb.par)||72, yardage:parseInt(tb.yardage)||0})),
                                };
                                addCourseToLibrary(finalCourse);
                                setSearchResults(prev => prev.filter(r => r.id !== draft.id));
                                setCoursePreview(null);
                              }} style={{ flex: 2, padding: "10px 0", borderRadius: R.sm, background: ac, border: "none", color: K.bg, fontSize: FS.small, fontWeight: 700, cursor: "pointer" }}>✓ Add Course</button>
                            </div>
                          </div>
                        </div>
                      </div>
                      </CoursePreviewPortal>
                    );
                  })()}
                <div style={{ fontSize: FS.micro, color: K.t3, textAlign: "center", marginTop: 6 }}>Course data from RapidAPI · add by hand if it is not listed</div>
                    </div>
                  )}

                  {/* Clearing the round is not the same as changing it, and it is
                      rare — it lives at the bottom of the picker rather than
                      taking a button slot next to Change and Edit. */}
                  {assigned && (
                    <button onClick={() => { setCourseForRound(editRound, { id: null, name: "" }); closePicker(); }}
                      style={{ width: "100%", padding: "9px 0", background: "transparent", border: "none", borderTop: `1px solid ${K.bdr}`, color: K.t3, fontSize: FS.label, fontWeight: 700, cursor: "pointer" }}>
                      Clear the course for Round {editRound}
                    </button>
                  )}
                </>
              );
            })()}

            {/* ── Nobody plays off the course's default rating ──
                A player with no tee does not fail, they fall through to the
                course's own rating and slope — which is an import default, not
                a box anybody tees off. So the console says who, says what it
                will cost, and offers the fix in the same breath, because the
                answer is almost always "the tee everyone else is on".

                It sits ABOVE the tee assigner rather than inside it: the
                per-player list folds away by default, and a warning that hides
                behind a disclosure is a warning nobody reads. */}
            {assigned && !picking && !locked && st.noTee.length > 0 && (() => {
              const nameOfPid = (pid) => activePlayers.find(p => p.id === pid)?.name || pid;
              // What to put them on: whatever most of the field is already
              // playing, falling back to the course's own default pick.
              const counts = {};
              activePlayers.forEach(p => { const t = (teeData[editRound] || {})[p.id]; if (t) counts[t] = (counts[t] || 0) + 1; });
              const tees = assigned.tee_boxes || [];
              const popular = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
              const fixTee = tees.find(t => t.name === popular)?.name || getDefaultTee(tees)?.name || tees[0]?.name;
              return (
                <div style={{ padding: "10px 14px", background: `${K.danger}${ALPHA.wash}`, borderTop: `1px solid ${K.danger}${ALPHA.hair}`, borderBottom: `1px solid ${K.bdr}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: K.danger, flexShrink: 0 }} />
                    <span style={{ fontSize: FS.label, fontWeight: 800, color: K.danger, letterSpacing: 0.6, textTransform: "uppercase" }}>
                      {st.noTee.length} {st.noTee.length === 1 ? "player has" : "players have"} no tee set
                    </span>
                  </div>
                  <div style={{ fontSize: FS.label, color: K.t2, lineHeight: 1.5 }}>
                    {missingTeeNames(st.noTee, nameOfPid)}
                  </div>
                  {fixTee && (
                    <button
                      onClick={() => {
                        const next = { ...(teeData[editRound] || {}) };
                        st.noTee.forEach(pid => { next[pid] = fixTee; });
                        setTeeBulk(editRound, next);
                        if ((teesSaved || {})[editRound]) onTeesModify && onTeesModify(editRound);
                      }}
                      style={{
                        marginTop: 8, padding: "6px 12px", borderRadius: R.sm,
                        background: K.danger, border: "1px solid transparent", color: ON_DANGER,
                        fontSize: FS.label, fontWeight: 700, cursor: "pointer",
                      }}>
                      Put {st.noTee.length === 1 ? "them" : "them all"} on {fixTee}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* ── ASSIGNED: tees, in the same card as the course they belong to ── */}
            {assigned && !picking && (
              <TeeAssigner activePlayers={activePlayers} tRounds={tRounds} courses={courses} teeData={teeData} setTeeBulk={setTeeBulk} finalizedRounds={finalizedRounds} editRound={editRound} teesSaved={teesSaved} onTeesModify={onTeesModify} />
            )}
          </div>
        );
      })()}

      {/* Groups and tee times for this round, under the course and tees they
          are played on. It was its own tab, which split one job across two:
          the round selector, the play date and the course all lived over here,
          and the foursomes that use them lived over there. */}
      {tab === "rounds" && (
        <PairingsEditor key={`${editRound}:${activePlayers.length}`} activePlayers={activePlayers} pairingsData={pairingsData} setPairings={setPairings} tRounds={tRounds} courses={courses} teeTimesData={teeTimesData} setTeeTimesData={setTeeTimesData} roundDates={roundDates} onSetRoundDate={onSetRoundDate} scoringOpen={scoringOpen} onSetScoringOpen={onSetScoringOpen} pairingStrategy={pairingStrategy} onSetPairingStrategy={onSetPairingStrategy} leaderboard={leaderboard} finalizedRounds={finalizedRounds} getPlayerTee={getPlayerTee} editRound={editRound} holeData={holeData} />
      )}

      {/* Discard one player's card for this round. Sits at the bottom of the
          Rounds tab because it is a repair, not part of setup — but in the
          tab scoped to the round it acts on, so "this round" is never
          ambiguous. Only offered for players who have actually posted. */}
      {tab === "rounds" && (() => {
        const posted = activePlayers
          .map(p => ({ p, holes: holesEntered(holeData, p.id, editRound) }))
          .filter(x => x.holes > 0);
        if (posted.length === 0) return null;
        return (
          <div style={{ marginTop: 14 }}>
            <SectionLabel color={K.danger}>Discard a card · Round {editRound}</SectionLabel>
            <Card pad={0} style={{ overflow: "hidden" }}>
              {posted.map(({ p, holes }, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderBottom: i < posted.length - 1 ? `1px solid ${K.bdr}${ALPHA.hair}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: FS.label, color: K.t3 }}>{holes} hole{holes === 1 ? "" : "s"} posted</div>
                  </div>
                  <Btn onClick={async () => {
                    const ok = await confirm({
                      title: `Discard ${p.name}'s round ${editRound}?`,
                      message: `Deletes all ${holes} hole${holes === 1 ? "" : "s"} they have posted for this round. Their roster entry, handicap index and other rounds are untouched.\n\nThey can re-enter the round from the scoring screen afterwards.`,
                      confirmLabel: "Discard",
                      destructive: true,
                    });
                    if (!ok) return;
                    const n = await onDiscardRoundScores(editRound, p.id);
                    notify(`Discarded ${n} hole${n === 1 ? "" : "s"} for ${p.name}`);
                  }} variant="dangerOutline" size="sm" style={{ flexShrink: 0 }}>
                    Discard
                  </Btn>
                </div>
              ))}
            </Card>
            {getRoundStatus(editRound).finalized && (
              <div style={{ fontSize: FS.label, color: K.warn, marginTop: 6, lineHeight: 1.45 }}>
                Round {editRound} is finalized. Discarding a card here removes its scores but does not un-finalize the round.
              </div>
            )}
          </div>
        );
      })()}

      {showFinalizeModal && (
        <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, right: 0, background: SCRIM, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowFinalizeModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "80vh", background: K.bg, borderRadius: "16px 16px 0 0", border: `1px solid ${K.bdr}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${K.bdr}`, flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: FS.body, color: K.t1 }}>Finalize Rounds</span>
              <button onClick={() => setShowFinalizeModal(false)} style={{ background: "transparent", border: "none", color: K.t3, fontSize: FS.title, cursor: "pointer", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", padding: "12px 16px 32px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: FS.label, color: K.t3, marginBottom: 2 }}>
              Finalize a group once all 18 holes are entered and scores are confirmed. Finalized scores are locked on the leaderboard.
            </div>
          {Array.from({ length: NUM_ROUNDS }, (_, i) => i + 1).map(rnd => {
            const rndGroups = (pairingsData || {})[rnd] || [];
            const tr = tRounds.find(t => t.round_number === rnd);
            const courseName = tr ? (courses.find(c => c.id === tr.course_id)?.name || "No course") : "No course";
            if (rndGroups.length === 0) return null;
            return (
              <div key={rnd}>
                <div style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                  Round {rnd} · {courseName}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {rndGroups.map((grp, gi) => {
                    const groupKey = `${rnd}_${grp.slice().sort().join(",")}`;
                    const isFinalized = finalizedRounds[groupKey] || finalizedRounds[rnd];
                    const holesComplete = grp.every(pid => {
                      const pd = holeData[`${pid}_${rnd}`] || {};
                      return Object.keys(pd).length === 18 && Object.values(pd).every(s => s > 0);
                    });
                    const holesEntered = grp.reduce((total, pid) => {
                      const pd = holeData[`${pid}_${rnd}`] || {};
                      return Math.max(total, Object.values(pd).filter(s => s > 0).length);
                    }, 0);
                    const playerNames = grp.map(pid => {
                      const p = activePlayers.find(x => x.id === pid);
                      return p ? shortName(p) : pid;
                    }).join(", ");
                    return (
                      <div key={gi} style={{
                        background: isFinalized ? K.acc + ALPHA.wash : K.card,
                        border: `1px solid ${isFinalized ? K.acc + ALPHA.hair : K.bdr}`,
                        borderRadius: R.md, padding: "10px 12px",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t1, marginBottom: 2 }}>
                            Group {gi + 1}
                            {isFinalized && <span style={{ marginLeft: 6, fontSize: FS.label, color: K.acc, fontWeight: 700 }}>✓ FINAL</span>}
                          </div>
                          <div style={{ fontSize: FS.label, color: K.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playerNames}</div>
                          <div style={{ fontSize: FS.label, color: holesComplete ? K.ok : K.warn, marginTop: 3 }}>
                            {holesComplete ? "All 18 holes entered" : `${holesEntered}/18 holes entered`}
                          </div>
                        </div>
                        {isFinalized ? (
                          <Btn variant="secondary" size="sm" style={{ color: K.t3, whiteSpace: "nowrap", flexShrink: 0 }}
                            onClick={() => { onUnfinalizeRound(groupKey); notify("Round unfinalized"); }}>↩ Unfinalize</Btn>
                        ) : (
                          <Btn
                            size="sm" style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                            onClick={() => { if (!holesComplete) return; onFinalizeRound(groupKey); notify(`Group ${gi+1} Round ${rnd} finalized`); }}
                            disabled={!holesComplete}
                          >✓ Finalize</Btn>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
            </div>
          </div>
        </div>
      )}

      <PlayerEditor
        editing={editingPlayer}
        set={patch => setEditingPlayer(prev => prev ? { ...prev, ...patch } : prev)}
        onClose={() => setEditingPlayer(null)}
        tPlayers={tPlayers} players={activePlayers}
        memberships={memberships} claims={claims} authUid={authUid}
        holeData={holeData} numRounds={numRounds}
        notify={notify} confirm={confirm} tournamentStarted={tournamentStarted}
        onRemove={removePlayer}
        askDelete={askDelete}
        returning={returningPool}
        indexOf={careerIndex}
        onSave={async (v) => {
          if (v.isNew) {
            await addPlayerToTournament(v.name, v.hi, { first_name: v.first, last_name: v.last }, v.pid);
            return;
          }
          await updateName(v.pid, v.name, { first_name: v.first, last_name: v.last });
          // updateHI is the GUARDED path everywhere else in this console. Here
          // the warning has already been shown inside the editor's own
          // confirmation, so this calls the raw writer rather than raising a
          // second dialog saying the same thing.
          if (v.hiChanged) await updateHI(v.pid, v.hi);
          if (v.dir) {
            const res = await onSetDirector(v.dir.uid, v.dir.on);
            if (!res.ok) notify(res.error);
            else notify(v.dir.on ? `${v.name} is a director` : `${v.name} is no longer a director`);
          } else {
            notify(`${v.name} saved`);
          }
        }}
      />

      {/* Single confirmation host for this console — every `await confirm(...)`
          in AdminView and the panels it renders resolves through this one. */}
      <ConfirmModal modal={confirmModal} />
    </div>
  );
}
