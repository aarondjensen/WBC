// ══════════════════════════════════════════════════════════════════
//  OnCourseScoring — the screen somebody is holding on a tee box.
// ══════════════════════════════════════════════════════════════════
//
// Hole by hole for a whole group, then the card gets signed and attested. It
// is the screen this app exists for, and the one used in the worst conditions
// it will ever face: one hand, bright sun, gloves, and a signal that comes and
// goes between holes.
//
// Almost everything that could be a rule instead of a render lives elsewhere
// and is tested there — which is what makes a file this size manageable:
//
//   lib/scoringGate     whether this phone may post at all
//   lib/holeAdvance     which hole to open on, and where + goes next
//   lib/scoreEntry      the five buttons, the ± targets, what a score is called
//   lib/individualBoard the running total, the strokes, the course handicap
//   lib/groupSwitch     which group, and whether its round is done
//   lib/ctp             the closest-to-the-pin prompt's rules
//   lib/scoreGuard      what a re-draw would disturb
//
// What is left here is the screen: what is on it, when each prompt appears,
// and the transitions between holes.
//
// ScoreButtonRow, HoleStateBar and holeBarBtn came with it. Nothing else in
// the app draws them, and they were only in App.jsx because this was.

import { useState, useEffect, useRef } from "react";
import { K, ON_ACC, FS, R, ALPHA, MOTION, FONT, SHADOW } from "../theme";
import { Btn } from "./ui";
import { Popup, ConfirmModal } from "./Popup";
import { TeeColorSwatch } from "./TeeColorSwatch";
import { ScoreCell } from "./ScoreCell";
import { GroupSwitcher } from "./GroupSwitcher";
import { OffRoundBanner } from "./OffRoundBanner";
import { HEADER_SAFE_PAD } from "./AppHeader";
import { CTP_MAX_FT, CTP_WHEEL_ITEM, CTP_WHEEL_H } from "../constants";
import { NUM_ROUNDS } from "../lib/rounds";
import { shortName } from "../lib/playerNames";
import { fmtPar, teeTimeToMinutes, minutesToTimeStr, fmtRoundDate } from "../lib/format";
import { isScoringOpen, SCORING_LEAD_MIN } from "../lib/scoringGate";
import { tapScore, tapNudge, tapBigAction } from "../lib/haptics";
import { scoreWindow, nudgeUpTarget, nudgeDownTarget, scoreTerm } from "../lib/scoreEntry";
import { calcCH, courseHandicapFor, buildStrokesMap, computeRoundLine, WD_SCORE } from "../lib/individualBoard";
import { openingHole, nineComplete } from "../lib/holeAdvance";
import { groupKey as groupKeyOf, sameGroup, liveRound } from "../lib/groupSwitch";
import { useConfirm } from "../lib/useConfirm";
import { groupTrouble, roundTrouble, describeTrouble, blocksScoring } from "../lib/roundSetup";
import { groupTeeOrder, tagAheadOfPlay } from "../lib/ctp";

// Labels sit beneath the 5 par-relative buttons [par-1, par, par+1, par+2, par+3].
const SCORE_LABELS = ["Birdie", "Par", "Bogey", "Double", "Triple"];

// `scoreTerm` — what a score is CALLED — lives in lib/scoreEntry with the rest
// of the score-entry rules, and is imported at the top of this file.

// ═══════════════════════════════════════════════════════════════
//  ScoreButtonRow — par-relative score control (ported from league)
// ═══════════════════════════════════════════════════════════════
// 5 par-relative buttons that recenter around par, flanked by −/+ nudge
// buttons. Birdie/Par/Bogey/Double/Triple labels render beneath. Tapping the
// selected score again clears it (onPick(0)). 44px touch targets per Apple HIG.
// `forName` is the player this row belongs to, used only to name the buttons
// for a screen reader. On screen the name is already the card's heading and
// repeating it would be noise; announced, "5, bogey" with no idea whose card
// it is is the difference between usable and not.
function ScoreButtonRow({ score, par, onPick, forName = "" }) {
  // Window and ± targets live in lib/scoreEntry — see the header there for
  // why a cold + opens past the top of the row rather than on a bogey.
  const { btns, shifted } = scoreWindow(par, score);
  // A shifted window would mislabel its buttons (an ace on a par 3 is not a
  // "Birdie"), so the labels drop out but keep their 12px slot — the row
  // height has to stay put.
  const showLabels = !shifted;
  const boxSize = 32;
  const handleNudge = (val) => { tapNudge(); onPick(Math.max(1, val)); };
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
      <button onClick={() => handleNudge(nudgeDownTarget(score, par))} aria-label={`One lower${forName ? " for " + forName : ""}`} style={{ width: 36, height: 44, borderRadius: R.sm, background: K.inp, border: "none", color: K.t3, fontSize: FS.body, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>−</button>
      {btns.map((btn, idx) => {
        const isCur = btn === score; const sd = btn - par;
        const isPar = btn === par;
        const showParAnchor = isPar && !isCur;
        const ringClr = sd < 0 ? K.danger : K.bg;
        return (
          <div key={btn} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
            {/* A rung above FS.body, unlike the ± either side of it. This is
                the number the whole screen exists to read and to hit, it sits
                in a 44px box with room to spare, and it is read at arm's
                length in sun. Nothing reflows: the box height is fixed. */}
            <button
              onClick={() => { tapScore(); onPick(isCur ? 0 : btn); }}
              // The visible label under the button is dropped on a shifted
              // window (an ace on a par 3 is not a "Birdie"), and the ± keys
              // have no text at all — so the name is built from par here
              // rather than read off the DOM.
              aria-label={`${forName ? forName + ", " : ""}${btn}${scoreTerm(btn, par) ? ", " + scoreTerm(btn, par) : ""}${isCur ? " — posted, tap to clear" : ""}`}
              aria-pressed={isCur}
              style={{ width: "100%", height: 44, borderRadius: R.sm, cursor: "pointer", fontSize: FS.lead, fontWeight: 800, border: "none", background: isCur ? K.acc : K.inp, color: isCur ? K.bg : K.t2, position: "relative", transition: `all ${MOTION}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {/* Selected-state rings: circles under par, squares over par */}
              {isCur && sd !== 0 && <div style={{ position: "absolute", width: boxSize, height: boxSize, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}><div style={{ position: "absolute", inset: 0, borderRadius: sd < 0 ? "50%" : R.xs, border: `1.5px solid ${ringClr}` }} />{Math.abs(sd) >= 2 && <div style={{ position: "absolute", inset: 3, borderRadius: sd < 0 ? "50%" : R.xs, border: `1px solid ${ringClr}` }} />}</div>}
              {/* Resting-state faint outlines on non-par, non-selected buttons */}
              {!isCur && sd !== 0 && <div style={{ position: "absolute", width: boxSize, height: boxSize, left: "50%", top: "50%", transform: "translate(-50%, -50%)", opacity: 0.15 }}><div style={{ position: "absolute", inset: 0, borderRadius: sd < 0 ? "50%" : R.xs, border: `1.25px solid ${sd < 0 ? K.danger : K.t2}` }} />{Math.abs(sd) >= 2 && <div style={{ position: "absolute", inset: 3, borderRadius: sd < 0 ? "50%" : R.xs, border: `1px solid ${sd < 0 ? K.danger : K.t2}` }} />}</div>}
              <span style={{ position: "relative", zIndex: 1 }}>{btn}</span>
            </button>
            <div style={{ fontSize: FS.micro, color: showParAnchor ? K.t2 : K.t3, fontWeight: showParAnchor ? 700 : 600, letterSpacing: 0.4, lineHeight: 1, height: 12 }}>
              {showLabels ? SCORE_LABELS[idx] : ""}
            </div>
          </div>
        );
      })}
      <button onClick={() => handleNudge(nudgeUpTarget(score, par))} aria-label={`One higher${forName ? " for " + forName : ""}`} style={{ width: 36, height: 44, borderRadius: R.sm, background: K.inp, border: "none", color: K.t3, fontSize: FS.body, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>+</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Popup — shared modal chrome (backdrop + centered card)
// Popup moved to components/Popup.jsx (alongside ConfirmModal, which builds on
// it) and is imported at the top of this file. Behavior is unchanged for every
// caller below; the extracted version adds an opt-in `portal` prop.

// ── ON-COURSE SCORING (replaces old ScoringView) ──
// Flow: Group Setup → Hole-by-hole for entire group → auto-advance
// ── The bar for "you are not on the live hole" ──
// Two states, half a tap apart: the hole is already scored, and you have
// chosen to edit it. They were drawn as two different things — a fixed amber
// bar on the header band, and an inline tinted strip above the score cards —
// which made tapping Edit look like the screen had changed into something
// else. Same bar for both, so what changes when you tap Edit is what it SAYS.
//
// It rides ON the app header for the reason the other bars here do: the header
// is a logo and a caption, so nothing under it is worth tapping, while the
// hole strip below it is exactly what a scorer reaches for while this is up.
// It stops 88px short of the right edge to leave the director's group switcher
// — the one live control on that band — uncovered.
const HoleStateBar = ({ glyph, label, children }) => (
  <div style={{
    position: "fixed", top: `calc(${HEADER_SAFE_PAD} + 6px)`, left: 12, right: 88,
    display: "flex", alignItems: "center", gap: 8,
    background: K.warn + ALPHA.tint, backdropFilter: "blur(8px)",
    border: `1.5px solid ${K.warn}`, borderRadius: R.lg, padding: "8px 12px",
    zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "toastDownBar 0.3s ease",
  }}>
    <span style={{
      flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: K.warn, color: ON_ACC,
      fontSize: FS.micro, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
    }}>{glyph}</span>
    <span style={{ flex: 1, fontSize: FS.small, fontWeight: 800, color: K.warn, lineHeight: 1.2 }}>{label}</span>
    {children}
  </div>
);
// The bar's two actions. Filled either way: the button that resolves this
// state should never be the quietest thing on the bar it belongs to.
const holeBarBtn = (fill) => ({
  padding: "7px 10px", borderRadius: R.sm, background: fill, border: "none",
  color: ON_ACC, fontSize: FS.label, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
});

export function OnCourseScoring({ user, players, round, tRounds, courses, holeData, tPlayers, onSaveHole, notify, pairingsData, teeTimesData, roundDates, scoringOpen, setTee, getPlayerTee, getPlayerCH = () => null, finalizedRounds, scorecardSigs, onSignScorecard, onAttestScorecard, onUnsignScorecard, onFinalizeRound, onUnfinalizeRound, onGoToAdminCourses, markPlayerWD, ctpData, onSetCtp, onConfirmCtp, directorPick, onGroupChange, onSetRound }) {
  const [group, setGroup] = useState(null);
  const [currentHole, setCurrentHole] = useState(0);
  const [manualOverride, setManualOverride] = useState(false);
  const [showTeePicker, setShowTeePicker] = useState(null);
  const [editingCompleted, setEditingCompleted] = useState(false);
  const [navSource, setNavSource] = useState("auto");
  const navSourceRef = useRef("auto");
  const setNavSourceSynced = (v) => { navSourceRef.current = v; setNavSource(v); };
  const [holeTransition, setHoleTransition] = useState("idle");
  const [transitionDir, setTransitionDir] = useState(1); // 1 = forward (→), -1 = backward (←)
  const [showFinalize, setShowFinalize] = useState(false);
  const [wdConfirm, setWdConfirm] = useState(null);
  const [showFullCard, setShowFullCard] = useState(false);
  // CTP inline prompt (par-3s only). showCtpForHole is the 0-indexed hole being asked.
  // promptedCtpKeys is a SESSION guard keyed by `${round}_${holeNum}_${groupKey}` — it
  // must include the group, because one device may score several groups (director doing
  // mock entry, or a scorer covering a second foursome). Keying on round+hole alone was
  // the bug: the first group to answer consumed the key and every later group was
  // silently skipped. A standing tag from an earlier group NO LONGER suppresses the
  // prompt — it's surfaced as the "current CTP" number to beat.
  const [showCtpForHole, setShowCtpForHole] = useState(null);
  const promptedCtpKeys = useRef({});
  const [ctpPickPlayer, setCtpPickPlayer] = useState("");
  // NULL until the group sets one. A seeded default is a number nobody chose,
  // and it would ride onto the card as though somebody had paced it off — so
  // the wheel starts unanswered and Tag stays dead until it is answered.
  const [ctpFeet, setCtpFeet] = useState(null);
  // Where the wheel PARKS before anything is chosen — the standing tag, or a
  // sensible 10 — kept apart from ctpFeet so parking somewhere is not the
  // same as choosing it.
  const [ctpFeetStart, setCtpFeetStart] = useState(10);
  // The wheel scrolls itself into position on mount, and that fires the same
  // scroll event a thumb does. This flips only on a real gesture, so the
  // programmatic scroll cannot mark the distance as chosen.
  const ctpWheelTouched = useRef(false);
  // Front 9 check — shown once per group per round as they arrive on hole 10.
  // Same session-guard shape as the CTP prompt, and for the same reason: one
  // device can score more than one group, so the key carries the group.
  const [showFront9, setShowFront9] = useState(false);
  const promptedFront9Keys = useRef({});

  // ── The safety catch on a round that is not being played ──
  // The group key editing has been ARMED for, or null. A director who opened
  // Round 1 to LOOK at a card gets a read-only screen: the score buttons are a
  // grid of large targets, so arriving somewhere is one brushed thumb from
  // changing it. Arming takes a confirmation that names the change, and it is
  // per GROUP — walking to another group, or back to the live round, drops it.
  const [armedKey, setArmedKey] = useState(null);
  const { confirm: confirmEdit, confirmModal: editConfirmModal } = useConfirm();

  const tr = tRounds.find(t => t.round_number === round);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;

  // Check if director pre-set pairings for this round
  const presetGroups = (pairingsData || {})[round] || [];
  const myPresetGroup = presetGroups.find(g => g.includes(user.id));

  // Auto-assign group from pairings if available and not manually overridden
  useEffect(() => {
    // Always reset editing state when round changes
    setEditingCompleted(false);
    // A manual pick only survives while the group it named is still IN this
    // round's draw. It used to survive the round change outright, which is how
    // a director who picked Group 3 in Round 1 kept looking at Round 1's four
    // players after finalizing advanced the app to Round 2 — under Round 2's
    // heading, writing Round 2 scores for a group that isn't playing in it.
    if (manualOverride && presetGroups.some(g => sameGroup(g, group))) return;
    if (manualOverride) setManualOverride(false);
    if (myPresetGroup) {
      // Update group if pairings were set/changed (even if group already exists)
      if (!sameGroup(myPresetGroup, group)) {
        setGroup(myPresetGroup);
        setCurrentHole(0);
      }
    } else {
      // No pairings for this round — clear any stale group from a previous round
      setGroup(null);
      setCurrentHole(0);
    }
  }, [round, JSON.stringify(myPresetGroup)]);

  // ── The director's crown, landing ──
  // A pick made in the app header (components/GroupSwitcher) arrives as
  // { seq, round, ids }; the round has already been set on the app, in the same
  // batch, so by the time this runs `round` is the picked one. `seq` is what
  // makes it a one-shot: the pick stays in state after it lands, and without a
  // consumed marker any later return to that round would silently re-apply it.
  //
  // This effect MUST stay below the auto-assign one above. Both run in the
  // same commit when a pick crosses rounds — that one drops the group it no
  // longer recognises, this one puts the picked group in its place — and React
  // runs a component's effects in the order they are declared.
  const appliedPickRef = useRef(0);
  useEffect(() => {
    if (!directorPick || directorPick.seq === appliedPickRef.current) return;
    if (directorPick.round !== round) return;
    appliedPickRef.current = directorPick.seq;
    setGroup(directorPick.ids);
    setManualOverride(true);
  }, [directorPick, round]);

  // What the crown is pointed at, reported up so the chip can name it. The
  // header is two components above this one and has no idea a round is being
  // scored; which group this screen resolved to is the one fact it needs.
  const reportedGroup = group ? groupKeyOf(round, group) : null;
  useEffect(() => {
    if (onGroupChange) onGroupChange(group ? { round, ids: group } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportedGroup]);

  // ── Resume at the right hole when the group is set ──
  //
  // Which hole is decided by lib/holeAdvance's openingHole (pure, tested).
  // What is decided HERE is when to trust the answer, and that is the fix for
  // a real cold-load bug:
  //
  //   Pairings and hole scores arrive over separate Firestore subscriptions
  //   with no ordering guarantee. This effect used to be keyed on [group]
  //   alone, so when the pairings landed first it ran against an empty score
  //   map, decided hole 1, and never ran again — a player rejoining a round
  //   mid-way opened on hole 1 and had to walk forward by hand.
  //
  // `positionedForRef` records the group we have positioned for using REAL
  // data. An unresolved answer (nothing posted yet) does not claim the group,
  // so the effect stays armed and re-runs when the scores arrive. That also
  // makes it idempotent: once positioned, later score changes don't yank the
  // screen away from the hole the user is on.
  const positionedForRef = useRef(null);
  const positionKey = group ? `${round}:${group.slice().sort().join(",")}` : null;
  // Cheap signal that the group's scores changed, so the effect can re-run
  // while unresolved without depending on the whole holeData map.
  const groupScoreSig = group
    ? group.map(id => Object.keys(holeData[`${id}_${round}`] || {}).length).join(",")
    : "";

  useEffect(() => {
    if (!group || !course) return;
    if (positionedForRef.current === positionKey) return;

    const pids = group.map(id => players.find(p => p.id === id)?.id).filter(Boolean);
    const readScore = (pid, h) => (holeData[`${pid}_${round}`] || {})[h] || 0;
    const { hole, allComplete, resolved } = openingHole(pids, readScore);

    if (!resolved) {
      // Nothing posted. That is either a genuinely fresh card or a card whose
      // scores have not loaded, and they are indistinguishable from here — so
      // show hole 1 but leave the group unclaimed, and correct it if scores
      // turn up.
      setCurrentHole(0);
      setNavSourceSynced("auto");
      setEditingCompleted(false);
      return;
    }

    positionedForRef.current = positionKey;
    setCurrentHole(hole);
    // Auto on a live edge so scoring advances; manual on a finished card so
    // edit mode shows instead.
    setNavSourceSynced(allComplete ? "manual" : "auto");
    // Clear edit mode when landing on a live edge. Without this, switching
    // FROM a completed group INTO a fresh one left the flag stuck true — and
    // edit mode suppresses both the CTP prompt and auto-advance. Second path
    // to the "later groups get no CTP popup" bug.
    setEditingCompleted(allComplete);
  }, [positionKey, groupScoreSig, course]);

  // Note: round changes from other tabs should NOT reset scoring state
  // since the scoring component stays mounted. The group persists.

  const holePars = course ? (course.hole_pars || []) : [];
  const holeHcps = course ? (course.hole_handicaps || []) : [];
  const groupPlayers = group ? group.map(id => players.find(p => p.id === id)).filter(Boolean) : [];
  const par = holePars[currentHole] || 4;
  const hcp = holeHcps[currentHole] || (currentHole + 1);

  const getScore = (pid) => {
    const key = `${pid}_${round}`;
    return (holeData[key] || {})[currentHole] || 0;
  };

  const allScored = group ? groupPlayers.every(p => getScore(p.id) > 0) : false;

  // Group-finalized state. HOISTED here (originally declared ~200 lines below,
  // just above the render's early returns). The effects further down close over
  // isGroupFinalized; on a cold reopen this component mounts with course/group
  // still null and the render takes an early `return` BEFORE the old declaration
  // ran — leaving isGroupFinalized in the temporal dead zone. React then fires
  // the already-registered passive effect, which touches it and throws
  // "Cannot access ... before initialization", unmounting the whole app to a
  // dark screen (the reopen "flash then dark" bug). Declaring it up here — before
  // any effect or early return — guarantees it's always initialized when those
  // closures run. Depends only on group/round/finalizedRounds, all available now.
  const _groupKey = group ? groupKeyOf(round, group) : null;
  const isGroupFinalized = _groupKey && (finalizedRounds[_groupKey] || finalizedRounds[round]);

  // ── Off the round being played ──
  // Only a director can be here: the round pills are gone on this tab, and the
  // crown is the only control that moves the app off the round the tournament
  // is on. Everybody else is on the live round by construction, and nothing
  // below this line renders for them.
  //
  // A null live round — every round finalized, the event over — counts as off
  // for anything a director opens. There is no round to be ON, and that is the
  // state where a stray edit is least likely to be noticed.
  const liveRoundNum = liveRound(finalizedRounds, NUM_ROUNDS);
  const offRound = !!user.isDirector && liveRoundNum !== round;
  // Read-only until armed. Compared against the group ACTUALLY on screen rather
  // than the one that was armed, so a selection that resolves elsewhere — the
  // pairings redrawn under the director's feet — lands read-only rather than
  // carrying an arming granted for something else.
  const editLocked = offRound && armedKey !== _groupKey;
  useEffect(() => {
    setArmedKey(k => (k != null && k !== _groupKey ? null : k));
  }, [_groupKey]);

  const isHoleComplete = (holeIdx) => {
    if (!group) return false;
    return groupPlayers.every(p => {
      const key = `${p.id}_${round}`;
      return (holeData[key] || {})[holeIdx] > 0;
    });
  };

  const findNextIncompleteHole = () => {
    for (let i = 0; i < 18; i++) {
      if (!isHoleComplete(i)) return i;
    }
    return 17; // all complete
  };

  const goToHole = (holeIdx) => {
    if (holeIdx === currentHole) return;
    const dir = holeIdx > currentHole ? 1 : -1;
    setTransitionDir(dir);
    setHoleTransition("out");
    setTimeout(() => {
      setNavSourceSynced("manual");
      setEditingCompleted(false);
      setCurrentHole(holeIdx);
      setHoleTransition("in-start"); // instant: new content placed off-screen right
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setHoleTransition("in-end"); // animated: slides in from right to center
        setTimeout(() => setHoleTransition("idle"), 250);
      }));
    }, 180);
  };

  const returnToPlay = () => {
    const next = findNextIncompleteHole();
    setNavSourceSynced("auto");
    setEditingCompleted(false);
    setCurrentHole(next);
  };

  // All 18 holes complete for the group
  const allRoundComplete = group ? (() => {
    const gPlayers = group.map(id => players.find(p => p.id === id)).filter(Boolean);
    return gPlayers.every(p => {
      for (let h = 0; h < 18; h++) { if (!((holeData[`${p.id}_${round}`] || {})[h] > 0)) return false; }
      return true;
    });
  })() : false;

  // When all 18 complete and not finalized, auto-show finalize prompt (only once)
  const shownFinalizeRef = useRef(false);
  useEffect(() => {
    if (!group) return;
    const groupKey = `${round}_${group.slice().sort().join(",")}`;
    const isFinalized = finalizedRounds[groupKey] || finalizedRounds[round];
    const isSignedNow = !!(scorecardSigs || {})[groupKey];
    if (allRoundComplete && !isFinalized && !isSignedNow && !shownFinalizeRef.current) {
      shownFinalizeRef.current = true;
      setCurrentHole(17);
      setNavSourceSynced("manual");
      setTimeout(() => setShowFinalize(true), 400);
    }
    if (!allRoundComplete) shownFinalizeRef.current = false;
  }, [allRoundComplete, JSON.stringify(group), round]);

  // Prompt for CTP when a par-3 completes for THIS group. Blocks the auto-advance
  // below until the group tags a winner or passes. Only prompts during fresh scoring —
  // not while editing an already-completed hole — since the Betting tab is the right
  // place for a director to correct a stale tag.
  //
  // CTP is tournament-wide (one winner per par-3 per round), so an existing tag from an
  // earlier group must NOT suppress this: every group gets asked, sees the standing
  // distance, and either beats it or passes. The only suppression is the per-group
  // session guard, so a group isn't re-nagged when it revisits its own hole.
  useEffect(() => {
    if (!group || isGroupFinalized) return;
    if (editingCompleted) return;
    if (par !== 3) return;
    if (!allScored) return;
    const holeNum = currentHole + 1;
    const key = `${round}_${holeNum}_${group.slice().sort().join(",")}`;
    if (promptedCtpKeys.current[key]) return;
    if (showCtpForHole === currentHole) return;
    promptedCtpKeys.current[key] = true;
    const leader = ((ctpData || {})[round] || {})[holeNum];
    // Seed the wheel at the standing distance so "beat it" means scrolling up, not
    // hunting from a cold 10 ft default.
    setCtpPickPlayer("");
    setCtpFeet(null);
    ctpWheelTouched.current = false;
    setCtpFeetStart(leader?.distanceFt ? Math.max(1, Math.min(CTP_MAX_FT, leader.distanceFt)) : 10);
    setShowCtpForHole(currentHole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allScored, par, currentHole, round, ctpData, editingCompleted, isGroupFinalized]);

  // Front 9 check — the turn is where a wrong number is still cheap to fix.
  // Once the group lands on hole 10 with all nine front holes in, the group's
  // gross front nine goes up as a card to eyeball before they play on. Once
  // per group per round: a group walking back to hole 4 and forward again is
  // not asking to be shown it twice. A par-3 ninth fires the CTP prompt first,
  // so this waits for that to close rather than stacking on top of it.
  useEffect(() => {
    if (!group || isGroupFinalized) return;
    if ((scorecardSigs || {})[_groupKey]) return;
    if (editingCompleted) return;
    if (currentHole !== 9) return;
    if (showCtpForHole !== null) return;
    const frontDone = nineComplete(
      groupPlayers.map(p => p.id),
      (pid, h) => (holeData[`${pid}_${round}`] || {})[h],
    );
    if (!frontDone) return;
    const key = `${round}_${group.slice().sort().join(",")}`;
    if (promptedFront9Keys.current[key]) return;
    promptedFront9Keys.current[key] = true;
    setShowFront9(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHole, group, round, holeData, editingCompleted, isGroupFinalized, showCtpForHole]);

  // Auto-advance after short delay when all scored (only on fresh scoring, not editing).
  // Suppressed while the CTP popup is open so the user isn't fighting the animation.
  useEffect(() => {
    if (showCtpForHole === currentHole) return;
    if (allScored && currentHole < 17 && navSourceRef.current === "auto" && !editingCompleted && !allRoundComplete) {
      const timer = setTimeout(() => {
        setTransitionDir(1);
        setHoleTransition("out");
        const advance = setTimeout(() => {
          setCurrentHole(h => {
            // Skip over any already-completed holes when auto-advancing
            let next = h + 1;
            while (next < 17 && groupPlayers.every(p => (holeData[`${p.id}_${round}`] || {})[next] > 0)) {
              next++;
            }
            return next;
          });
          setNavSourceSynced("auto");
          setHoleTransition("in-start");
          requestAnimationFrame(() => requestAnimationFrame(() => {
            setHoleTransition("in-end");
            setTimeout(() => setHoleTransition("idle"), 250);
          }));
        }, 180);
        return () => clearTimeout(advance);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [allScored, currentHole, editingCompleted, showCtpForHole]);

  // ── The scorecard's three numbers, off the board's own math ──
  //
  // All three used to be written out longhand here, and being a second
  // implementation is exactly how they came to be wrong:
  //
  //   • the stroke allocation was a hand-rolled three-pass copy of
  //     buildStrokesMap, which this file already imports;
  //   • the running total counted the WD sentinel as a real score, so a
  //     withdrawn playing partner sat there with a gross in the hundreds and
  //     a card that claimed to be thru 18 while the leaderboard, which knows
  //     to skip those holes, showed him thru 9;
  //   • it subtracted strokes unconditionally, so a plus handicap got them
  //     the wrong way round — they add to a net score, they do not come off.
  //
  // computeRoundLine has all three rules and a test file. This is now a call
  // into it, which is also what makes the running net on a tee box and the
  // number on the board the same number rather than two that agree.
  const getCH = (p) => courseHandicapFor({
    handicapIndex: p?.handicap_index,
    course,
    tee: course ? getPlayerTee(round, p.id, course) : null,
    recorded: getPlayerCH(round, p?.id),
  });

  const getTeeName = (p) => {
    const tee = getPlayerTee(round, p.id, course);
    return tee?.name || "Default";
  };

  const getStrokes = (p, holeIdx) => buildStrokesMap(getCH(p), holeHcps)[holeIdx] || 0;

  const getRunning = (pid) => {
    const p = players.find(x => x.id === pid);
    if (!course || !p) return { gross: 0, netToPar: 0, thru: 0 };
    const line = computeRoundLine({
      scores: holeData[`${pid}_${round}`] || {},
      holePars,
      holeHcps,
      ch: getCH(p),
    });
    return { gross: line.gross, netToPar: line.netToPar, thru: line.thru };
  };

  // ── The off-round banner ────────────────────────────────────────────
  // components/OffRoundBanner carries the look and the two hit targets; what
  // stays here is what they DO, since both act on this screen's own state.
  //
  // The confirm modal rides along with it. Every question this screen can ask
  // about an off-round edit is asked from inside this branch, so the two are
  // never apart — and the banner renders on each of the branches below that can
  // raise one.
  const offRoundBanner = offRound ? (
    <>
      <OffRoundBanner
        round={round} live={liveRoundNum} editLocked={editLocked}
        onReturn={onSetRound ? () => onSetRound(liveRoundNum) : null}
        onToggleEdit={async () => {
          if (!editLocked) { setArmedKey(null); return; }
          const ok = await confirmEdit({
            eyebrow: `Round ${round}`,
            title: "Edit scores in a round that isn't live?",
            message: [
              "This is not the round being played. Anything you change posts immediately and moves the leaderboard, and the players in this group are not asked.",
              "",
              "Editing stays on for this group until you tap Done or leave it.",
            ].join("\n"),
            confirmLabel: "Edit scores",
            destructive: true,
          });
          if (ok) setArmedKey(_groupKey);
        }}
      />
      <ConfirmModal modal={editConfirmModal} />
    </>
  ) : null;

  // What a score tap asks on a round that isn't live, and the tap itself. The
  // first tap does not enter a score, it asks — and it asks about THAT tap by
  // name: who, which hole, what it says now and what it would say. "Are you
  // sure?" is a question a thumb answers yes to without reading, and the tap
  // nobody meant to make is the whole point here.
  //
  // Saying yes applies the tap AND arms the group, so correcting a card is one
  // question rather than eighteen; the banner turns loud for as long as it
  // stays armed, and walking away from the group drops it.
  const saveScore = async (p, val) => {
    if (editLocked) {
      const was = getScore(p.id);
      const ok = await confirmEdit({
        eyebrow: `Round ${round} · Hole ${currentHole + 1}`,
        title: "Change a score in a round that isn't live?",
        message: [
          `${p.name}, hole ${currentHole + 1}: ${was > 0 ? was : "no score"} → ${val > 0 ? val : "no score"}.`,
          "",
          "This is not the round being played. The change posts immediately and moves the leaderboard, and the players in this group are not asked.",
          "",
          "Editing stays on for this group until you leave it.",
        ].join("\n"),
        confirmLabel: "Change it",
        destructive: true,
      });
      if (!ok) return;
      setArmedKey(_groupKey);
    }
    onSaveHole(p.id, round, currentHole, val);
  };

  // ── EARLY RETURNS (after all hooks) ──
  if (!course) return (
    <div>
      {offRoundBanner}
      <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.title, margin: "0 0 14px", fontWeight: 800 }}>Score — Round {round}</h2>
      <div
        onClick={user.isDirector && onGoToAdminCourses ? () => onGoToAdminCourses(round) : undefined}
        style={{ background: K.card, borderRadius: R.xl, border: `1px dashed ${K.warn}${ALPHA.hair}`, padding: 32, textAlign: "center", cursor: user.isDirector ? "pointer" : "default" }}
      >
        <div style={{ fontSize: FS.display, marginBottom: 8 }}>🏌️</div>
        <p style={{ color: K.warn, fontWeight: 600, margin: "0 0 4px" }}>No course set for Round {round}</p>
        {user.isDirector
          ? <p style={{ color: K.acc, fontSize: FS.small, margin: "0 0 0", fontWeight: 600 }}>Tap to set up course in Admin →</p>
          : <p style={{ color: K.t2, fontSize: FS.small, margin: 0 }}>Waiting on your tournament director.</p>
        }
      </div>
    </div>
  );

  if (!group) {
    if (myPresetGroup && !manualOverride) {
      setGroup(myPresetGroup);
      return null;
    }
    // Directors can pick any group to score. So can a GUEST — not to score it,
    // but because this screen is the app's centre of gravity and a guest has no
    // name in the draw, so without a picker the whole tab is a permanent
    // "waiting for pairings" for somebody who is not waiting for anything. What
    // they open is the same card the group is filling in; the writes behind
    // every tap on it stop in lib/guestMode, one layer down.
    if ((user.isDirector || user.isGuest) && presetGroups.length > 0) {
      return (
        <div style={{ padding: "16px 0" }}>
          {offRoundBanner}
          <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t2, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>{user.isGuest ? "Select Group to Watch" : "Select Group to Score"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {presetGroups.map((grp, gi) => {
              const grpPlayers = grp.map(id => players.find(p => p.id === id)).filter(Boolean);
              const grpKey = `${round}_${grp.slice().sort().join(",")}`;
              const isFinalized = finalizedRounds[grpKey] || finalizedRounds[round];
              const holesScored = Math.max(...grpPlayers.map(p => {
                const s = holeData[`${p.id}_${round}`] || {};
                return Object.values(s).filter(v => v > 0).length;
              }), 0);
              const allComplete = grpPlayers.every(p => { for (let h = 0; h < 18; h++) { if (!((holeData[`${p.id}_${round}`] || {})[h] > 0)) return false; } return true; });
              return (
                <div key={gi} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <button onClick={() => { setGroup(grp); setManualOverride(true); }} style={{
                    flex: 1, background: K.card, border: `1px solid ${K.bdr}`, borderRadius: R.lg,
                    padding: "12px 16px", cursor: "pointer", textAlign: "left",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: FS.label, fontWeight: 700, color: K.acc, marginBottom: 4 }}>Group {gi + 1}</div>
                      <div style={{ fontSize: FS.small, fontWeight: 600, color: K.t1 }}>{grpPlayers.map(shortName).join(", ")}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {isFinalized
                        ? <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc, background: K.accGlow, padding: "3px 8px", borderRadius: R.sm }}>✓ Final</span>
                        : allComplete
                          ? <span style={{ fontSize: FS.label, fontWeight: 700, color: K.warn, background: K.warn + ALPHA.wash, padding: "3px 8px", borderRadius: R.sm }}>18 ✓ Ready</span>
                          : holesScored > 0
                            ? <span style={{ fontSize: FS.label, fontWeight: 600, color: K.warn }}>Thru {holesScored}</span>
                            : <span style={{ fontSize: FS.label, color: K.t3 }}>Not started</span>
                      }
                    </div>
                  </button>
                  {allComplete && !isFinalized && !user.isGuest && (
                    <button onClick={() => { onFinalizeRound(grpKey); notify("Group finalized! ✓"); }} style={{
                      padding: "0 16px", borderRadius: R.lg, background: K.acc, border: "none",
                      color: K.bg, fontSize: FS.label, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap",
                    }}>✓ Finalize</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    // No draw for this round. For a player that is a wait; for a director it
    // is a job, and the job is two taps away, so say which it is.
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        {offRoundBanner}
        <div style={{ fontSize: FS.jumbo, marginBottom: 12 }}>⛳</div>
        <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>
          {user.isDirector ? `No pairings for Round ${round}` : "Waiting for Pairings"}
        </div>
        <div style={{ fontSize: FS.small, color: K.t3, marginBottom: user.isDirector ? 16 : 0 }}>
          {user.isDirector
            ? "Nobody can score this round until the groups are drawn."
            : "Your tournament director will set up groups before the round begins."}
        </div>
        {user.isDirector && onGoToAdminCourses && (
          <button onClick={() => onGoToAdminCourses(round)} style={{
            padding: "10px 20px", borderRadius: R.md, background: K.acc, border: "none",
            color: K.bg, fontSize: FS.small, fontWeight: 800, cursor: "pointer",
          }}>Set up Round {round} →</button>
        )}
      </div>
    );
  }

  // ── FINALIZED EARLY RETURN ──
  // (_groupKey / isGroupFinalized are hoisted to the top of the component so the
  // effects above can safely close over them — see the note there.)
  if (isGroupFinalized) return (
    <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {offRoundBanner}
      {/* Submitted notice */}
      <div style={{ background: K.acc + ALPHA.wash, border: `1px solid ${K.acc}${ALPHA.hair}`, borderRadius: R.xl, padding: "24px 20px", textAlign: "center" }}>
        <div style={{ fontSize: FS.display, marginBottom: 12 }}>🏆</div>
        <div style={{ fontSize: FS.body, fontWeight: 800, color: K.acc, marginBottom: user.isDirector ? 16 : 0 }}>Scorecard Final</div>
        {user.isDirector && (
          <button onClick={() => { onUnfinalizeRound(_groupKey); notify("Round unfinalized — scores unlocked"); }} style={{
            marginTop: 4, padding: "10px 20px", borderRadius: R.md,
            background: "transparent", border: `1px solid ${K.bdr}`,
            color: K.t3, fontSize: FS.small, fontWeight: 600, cursor: "pointer",
          }}>↩ Unfinalize to Edit Scores</button>
        )}
      </div>
    </div>
  );

  // ── DRAW GUARD ──
  // The screen is about to put a score row up for every player in `group`. If
  // that group is not a foursome out of this round's draw — the whole field in
  // one group, a player drawn twice, somebody who is no longer on the roster —
  // then every row below is a card being built against the wrong people, and
  // it saves as it goes. Scoring stops here and says so instead.
  //
  // Placed after the finalized early-return: a signed and locked card keeps
  // showing as final, because nothing about it is going to change.
  const _nameOf = (pid) => players.find(p => p.id === pid)?.name || "a player no longer on the roster";
  const _troubleWithGroup = groupTrouble(group, {
    rosterIds: players.map(p => p.id),
    otherGroups: presetGroups.filter(g => !sameGroup(g, group)),
  });
  if (blocksScoring(_troubleWithGroup)) {
    const nameOf = _nameOf;
    return (
      <div style={{ padding: "24px 4px" }}>
        {offRoundBanner}
        <div style={{ background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.line}`, borderRadius: R.xl, padding: "22px 20px", textAlign: "center" }}>
          <div style={{ fontSize: FS.display, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: FS.body, fontWeight: 800, color: K.warn, marginBottom: 8 }}>Round {round} pairings need a fix</div>
          <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.6, maxWidth: 320, margin: "0 auto" }}>
            {describeTrouble(_troubleWithGroup, nameOf)}
          </div>
          <div style={{ fontSize: FS.small, color: K.t3, lineHeight: 1.6, maxWidth: 320, margin: "10px auto 0" }}>
            {user.isDirector
              ? "Scoring is held until the draw is right — a card entered against the wrong group is the expensive kind of mistake."
              : "Your tournament director has to redraw this round before scoring can open. Nothing you have already posted is lost."}
          </div>
          {user.isDirector && onGoToAdminCourses && (
            <button onClick={() => onGoToAdminCourses(round)} style={{
              marginTop: 16, padding: "10px 20px", borderRadius: R.md, background: K.acc, border: "none",
              color: K.bg, fontSize: FS.small, fontWeight: 800, cursor: "pointer",
            }}>Fix Round {round} pairings →</button>
          )}
        </div>
      </div>
    );
  }

  // ── SCORING GATE ──
  // Non-directors can't enter scores until SCORING_LEAD_MIN before their group's
  // tee time on the round's scheduled date — unless a director has toggled the
  // round's scoring open. Directors always bypass (isScoringOpen returns true).
  // Placed after the finalized early-return so a locked group still shows its
  // final screen rather than the gate.
  const _myGroupIdx = group ? presetGroups.findIndex(g => g.slice().sort().join(",") === group.slice().sort().join(",")) : -1;
  const _myTeeTime = _myGroupIdx >= 0 ? ((teeTimesData || {})[round] || [])[_myGroupIdx] : null;
  const _scoringGateOpen = isScoringOpen({ round, teeTime: _myTeeTime, roundDates, scoringOpen, isDirector: user.isDirector });
  if (!_scoringGateOpen) {
    const teeMin = teeTimeToMinutes(_myTeeTime);
    const opensAt = teeMin != null ? minutesToTimeStr(teeMin - SCORING_LEAD_MIN) : null;
    const dateStr = (roundDates || {})[round];
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ fontSize: FS.jumbo, marginBottom: 12 }}>{_myTeeTime ? "⏱️" : "⚠️"}</div>
        <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>
          {_myTeeTime ? "Scoring Not Open Yet" : `Round ${round} has no tee times`}
        </div>
        {/* Without a tee time there is nothing for the gate to open on, so it
            stays shut — and "your director will open scoring" reads as a wait
            for something that is never going to happen on its own. Name the
            missing setting instead. */}
        <div style={{ fontSize: FS.small, color: K.t3, lineHeight: 1.7, maxWidth: 300, margin: "0 auto" }}>
          {_myTeeTime ? (
            <>
              Scoring for your group opens {SCORING_LEAD_MIN} minutes before your{" "}
              <strong style={{ color: K.t2 }}>{_myTeeTime}</strong> tee time
              {opensAt ? <> — at <strong style={{ color: K.acc }}>{opensAt}</strong></> : null}
              {dateStr ? <> on <strong style={{ color: K.t2 }}>{fmtRoundDate(dateStr)}</strong></> : null}.
            </>
          ) : (
            <>Scoring opens {SCORING_LEAD_MIN} minutes before your tee time, and this round has none set. Your tournament director needs to set them in Admin.</>
          )}
        </div>
        {_myGroupIdx >= 0 && (
          <div style={{ marginTop: 14, fontSize: FS.label, color: K.t3, opacity: 0.7 }}>Group {_myGroupIdx + 1}</div>
        )}
      </div>
    );
  }

  // ── SIGN / ATTESTATION STATE (two-phase scorecard, ported from league) ──
  // A signed-but-not-attested group renders in the main view (not the
  // finalized early-return). `finalizedRounds[groupKey]` still means FINAL
  // and triggers the early return above, so all existing lock checks stay
  // intact. `scorecardSigs[groupKey]` carries the in-between signed state.
  const groupKey = _groupKey;
  const isWDpid = (pid) => { const tp = tPlayers.find(t => t.player_id === pid); return tp?.status === "WD"; };
  const presentGroupPids = group ? group.filter(pid => !isWDpid(pid)) : [];
  const sig = groupKey ? (scorecardSigs || {})[groupKey] : null;
  const isSigned = !!sig;
  const signerPid = sig?.signedBy || null;
  const signerName = sig?.signedByName || null;
  const attestedPids = sig?.attestedBy || [];
  const presentNonSigners = presentGroupPids.filter(pid => pid !== signerPid);
  const allAttested = isSigned && presentNonSigners.every(pid => attestedPids.includes(pid));
  const meId = user?.id;

  // Walked back onto a hole this group has already finished. Drives the amber
  // bar on the header band, and suppresses the Round complete bar while it is
  // up — they share that band, and this one is the answer to what the player
  // just did. Signing is still one tap away in the footer.
  const onCompletedHole = !isSigned && navSource === "manual" && isHoleComplete(currentHole) && !editingCompleted;

  // ── What the DIRECTOR can't see from here ──
  // A director bypasses the scoring gate, so a round with no tee times looks
  // completely normal on this screen while every player in the field is stuck
  // on "Scoring Not Open Yet" — the one setup fault the person who can fix it
  // is structurally blind to. Same for another group's draw being broken:
  // this screen is one group, and the round is not.
  // One slim line, director only, and only when there is something to fix.
  const _setup = user.isDirector
    ? roundTrouble({ groups: presetGroups, teeTimes: (teeTimesData || {})[round], rosterIds: players.map(p => p.id) })
    : { broken: [], missingTeeTimes: [] };
  const _setupWarning = !user.isDirector ? null : (() => {
    // A stale draw in THIS group first — it is the one the director is looking
    // at, and it did not stop the screen, so nothing else will say it.
    if (_troubleWithGroup) return describeTrouble(_troubleWithGroup, _nameOf);
    const miss = _setup.missingTeeTimes.length;
    if (miss > 0) {
      return miss === _setup.groupCount
        ? "No tee times set — nobody else can score this round"
        : `${miss} group${miss === 1 ? "" : "s"} with no tee time — they can't score`;
    }
    if (_setup.broken.length > 0) return `Group ${_setup.broken[0].index + 1}'s draw needs a fix`;
    return null;
  })();

  const handleSign = () => {
    if (!groupKey) return;
    tapBigAction();
    const sName = user?.name || "Scorer";
    const nonSigners = presentGroupPids.filter(pid => pid !== meId);
    onSignScorecard(groupKey, meId, sName, presentGroupPids, round);
    setShowFinalize(false);
    notify(nonSigners.length === 0 ? "Scorecard signed ✓" : "Scorecard signed — awaiting attestation");
  };
  const handleAttest = (pid) => {
    if (!groupKey || !sig) return;
    tapBigAction();
    onAttestScorecard(groupKey, pid, presentNonSigners);
  };
  const handleUnsign = () => {
    if (!groupKey) return;
    onUnsignScorecard(groupKey);
    notify("Scorecard unsigned — scores unlocked");
  };

  return (
    <div>
      {offRoundBanner}
      {/* No header row here. The round, the course and the way back to the
          other groups all used to ride above the hole strips; the crown in the
          app header (components/GroupSwitcher) names the group and the round it
          belongs to, and reaches every group in every round rather than only
          this round's draw — so the row was spending the top of the scoring
          screen on an answer already on screen and a control already in the
          chrome. The hole strips start at the top now. */}
      {/* The director's one line about the round they can't see from here.
          A whole row is a lot on this screen, so it is 24px tall, it only
          exists when something is actually wrong, and tapping it lands on the
          round's setup rather than making anybody go looking. */}
      {_setupWarning && onGoToAdminCourses && (
        <div onClick={() => onGoToAdminCourses(round)} style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 8, cursor: "pointer",
          padding: "5px 10px", borderRadius: R.sm,
          background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.hair}`,
        }}>
          <span style={{ fontSize: FS.label }}>⚠️</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: FS.micro, fontWeight: 700, color: K.warn, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{_setupWarning}</span>
          <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.t3, letterSpacing: 0.5, flexShrink: 0 }}>FIX →</span>
        </div>
      )}

      {/* Hole navigator - Front 9 / Back 9 */}
      <div style={{ marginBottom: 8 }}>
        {[0, 9].map(start => (
          // 6px of air between the tiles, and between the two rows. The
          // current hole is ringed with a 2px outline set 1px off the button,
          // so it reaches 3px past its own box on every side — at a 2px gap
          // the neighbouring tiles painted over it and the ring looked cut
          // off down its sides. 6px clears the ring; the raised tile also
          // stacks above its neighbours so nothing can cover it.
          <div key={start} style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 6 }}>
            {Array.from({ length: 9 }, (_, i) => start + i).map(i => {
              const allScoredHole = groupPlayers.every(p => (holeData[`${p.id}_${round}`] || {})[i] > 0);
              const isCurrent = i === currentHole;
              return (
                <button key={i} onClick={() => goToHole(i)} style={{
                  flex: 1, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative", zIndex: isCurrent ? 1 : 0,
                  borderRadius: allScoredHole || isCurrent ? R.lg : R.sm,
                  border: allScoredHole && !isCurrent ? `1.5px solid ${K.acc}${ALPHA.line}` : "none",
                  cursor: "pointer",
                  // A rung above the label size these tiles used to wear. They
                  // are 18 targets across a phone and the number in them is
                  // how you find the one you want; the 32px tile carries it
                  // without growing.
                  fontSize: FS.small, fontWeight: 700,
                  background: isCurrent ? K.acc : allScoredHole ? K.accDim + ALPHA.wash : K.card,
                  color: isCurrent ? K.bg : allScoredHole ? K.acc : K.t3,
                  outline: isCurrent ? `2px solid ${K.acc}` : "none",
                  outlineOffset: 1,
                  transition: `all ${MOTION}`,
                }}>{i + 1}</button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Full Scorecard — Bourbon Cup's placement: a full-width bar under the
          hole strips and above the hole banner, rather than a pill tucked into
          the header row. It is the one control on this screen that isn't about
          the hole you're standing on, and at pill size it read as a label. The
          bar costs one slim row and is reachable without scrolling past four
          player cards. */}
      <button onClick={() => setShowFullCard(true)} style={{
        width: "100%", padding: "9px 0", borderRadius: R.sm, marginBottom: 8, cursor: "pointer",
        // A card-coloured bar with a neutral edge sat flat against the hole
        // strips above it and read as a caption. It keeps its footprint — a
        // hint of the accent on the edge, full-strength ink, and a shadow to
        // lift it off the background is enough to read as something to tap.
        background: K.card, border: `1px solid ${K.acc}${ALPHA.hair}`, color: K.t1,
        boxShadow: `0 1px 2px ${SHADOW}`,
        fontFamily: FONT, fontSize: FS.small, fontWeight: 700, letterSpacing: 0.5,
      }}>Full Scorecard</button>

      {/* Animated hole content */}
      <div style={{
        transition: holeTransition === "in-start" ? "none" : "opacity 0.2s ease, transform 0.2s ease",
        opacity: holeTransition === "out" ? 0 : holeTransition === "in-start" ? 0 : 1,
        transform: holeTransition === "out"
          ? `translateX(${transitionDir * -60}px)`
          : holeTransition === "in-start"
            ? `translateX(${transitionDir * 60}px)`
            : "translateX(0)",
      }}>

      {/* Current hole header - compact with par left, hcp right */}
      <div style={{
        background: `linear-gradient(135deg, ${K.card}, ${K.hover})`,
        borderRadius: R.lg, border: `1px solid ${K.bdr}`, padding: "10px 16px",
        marginBottom: 8, position: "relative",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => goToHole(Math.max(0, currentHole - 1))} disabled={currentHole === 0}
            style={{ width: 34, height: 34, borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`, color: currentHole === 0 ? K.t3 + ALPHA.hair : K.t1, fontSize: FS.lead, cursor: "pointer", fontWeight: 700 }}>‹</button>
          <div style={{ fontSize: FS.label, color: K.t3, textAlign: "center" }}>
            <span style={{ fontWeight: 600 }}>Par</span>
            <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t3, lineHeight: 1, marginTop: 2 }}>{par}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: FS.label, color: K.t1, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Hole</div>
            <div style={{ fontSize: FS.jumbo, fontWeight: 800, fontFamily: "'Montserrat', sans-serif", lineHeight: 1, color: K.t1 }}>{currentHole + 1}</div>
          </div>
          <div style={{ fontSize: FS.label, color: K.t3, textAlign: "center" }}>
            <span style={{ fontWeight: 600 }}>HCP</span>
            <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t3, lineHeight: 1, marginTop: 2 }}>{hcp}</div>
          </div>
          <button onClick={() => goToHole(Math.min(17, currentHole + 1))} disabled={currentHole === 17}
            style={{ width: 34, height: 34, borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`, color: currentHole === 17 ? K.t3 + ALPHA.hair : K.t1, fontSize: FS.lead, cursor: "pointer", fontWeight: 700 }}>›</button>
        </div>
      </div>

      {/* No CTP row rides above the players on a par 3. The prompt that fires
          once the hole is scored asks the question and shows the standing
          distance, so a second copy of it here only bought a row — and on a
          par 3 that row pushed the last player's score buttons down behind the
          tab bar. The prompt is the whole story. */}

      {/* Completed hole — the banner that used to sit here is now a bar on the
          header band (rendered outside the animated wrapper, below), so the
          read-only scores start where the score cards normally would. */}
      {onCompletedHole && (<>
        {/* Recorded scores - styled like scoring cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {groupPlayers.map(p => {
            const s = (holeData[`${p.id}_${round}`] || {})[currentHole] || 0;
            const ch = getCH(p);
            const strokes = getStrokes(p, currentHole);
            const maxBase = 8;
            const btnScores = [2,3,4,5,6,7,8];
            // Adjust range if score is outside normal buttons
            let displayScores = [...btnScores];
            if (s === 1) displayScores[0] = 1;
            if (s > maxBase) displayScores[displayScores.length - 1] = s;
            return (
              // Tapping a locked card IS the request to edit it — that tap was
              // already happening, it just landed on nothing.
              <div key={p.id} onClick={() => setEditingCompleted(true)} style={{
                background: K.card, borderRadius: R.md, border: `1px solid ${K.warn}${ALPHA.hair}`,
                padding: "8px 10px", opacity: 0.85, cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: FS.body, fontWeight: 700 }}>{p.name}</span>
                    <span style={{ fontSize: FS.label, color: K.acc, fontWeight: 700 }}>{ch}</span>
                    {strokes > 0 && <span style={{ color: K.acc, fontSize: FS.label, letterSpacing: "-1px" }}>{"●".repeat(strokes)}</span>}
                  </div>
                  <span style={{ fontSize: FS.micro, color: K.warn, fontWeight: 700, letterSpacing: "0.06em" }}>✏️ TAP TO EDIT</span>
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  {displayScores.map(btn => {
                    const isCur = btn === s;
                    const bsd = btn - par;
                    const bclr = bsd < 0 ? K.under : bsd === 0 ? K.t2 : K.eagle;
                    const sz = 32;
                    return (
                      <div key={btn} style={{
                        flex: 1, height: 38,
                        fontWeight: 800, fontSize: FS.body, textAlign: "center",
                        background: isCur ? K.t2 : K.t2 + ALPHA.wash,
                        color: isCur ? K.bg : K.t2,
                        borderRadius: R.sm, position: "relative",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isCur && bsd !== 0 && (
                          <div style={{ position: "absolute", width: sz, height: sz, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                            <div style={{ position: "absolute", inset: 0, borderRadius: bsd < 0 ? "50%" : R.xs, border: `1.5px solid ${bclr}` }} />
                            {(bsd <= -2 || bsd >= 2) && <div style={{ position: "absolute", inset: 3, borderRadius: bsd < 0 ? "50%" : R.xs, border: `1px solid ${bclr}` }} />}
                          </div>
                        )}
                        <span style={{ position: "relative", zIndex: 1 }}>{btn}</span>
                      </div>
                    );
                  })}
                  <div style={{ flex: "0 0 32px" }} />
                </div>
              </div>
            );
          })}
        </div>
      </>)}

      {/* Signed notice — score entry is locked once the card is signed (unsign to edit) */}
      {isSigned && (
        <div style={{ background: K.acc + ALPHA.wash, border: `1px solid ${K.acc}${ALPHA.hair}`, borderRadius: R.md, padding: "12px 14px", textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: FS.small, fontWeight: 800, color: K.acc, marginBottom: 2 }}>✍️ Scorecard Signed</div>
          <div style={{ fontSize: FS.label, color: K.t3 }}>Scores are locked while attestation is pending. Unsign below to edit.</div>
        </div>
      )}

      {/* Player score cards */}
      {!isSigned && !(navSource === "manual" && isHoleComplete(currentHole) && !editingCompleted) && (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
        {groupPlayers.map(p => {
          const score = getScore(p.id);
          const ch = getCH(p);
          const strokes = getStrokes(p, currentHole);
          const running = getRunning(p.id);

          return (
            <div key={p.id} style={{
              background: K.card, borderRadius: R.md, border: `1px solid ${K.bdr}`,
              padding: "8px 10px",
            }}>
              {/* Player header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: FS.body, fontWeight: 700 }}>{p.name}</span>
                  <span style={{ fontSize: FS.label, color: K.acc, fontWeight: 700 }}>{ch}</span>
                  {strokes > 0 && <span style={{ color: K.acc, fontSize: FS.label, letterSpacing: "-1px" }}>{"●".repeat(strokes)}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {running.thru > 0 && <span style={{ fontSize: FS.label, color: K.t3 }}>Thru {running.thru}: <span style={{ color: running.netToPar < 0 ? K.under : running.netToPar > 0 ? K.t2 : K.t2, fontWeight: 700 }}>{fmtPar(running.netToPar)}</span></span>}
                  <button onClick={() => setWdConfirm(p.id)} title="Withdraw player" style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, background: "transparent", border: `1px solid ${K.bdr}`, borderRadius: R.sm, padding: "2px 7px", cursor: "pointer", letterSpacing: 0.5, flexShrink: 0 }}>WD</button>
                </div>
              </div>

              {/* Tee picker - expandable */}
              {showTeePicker === p.id && course.tee_boxes && course.tee_boxes.length > 0 && (
                <div style={{ display: "flex", gap: 3, marginBottom: 6, flexWrap: "wrap" }}>
                  {course.tee_boxes.map(tee => {
                    const isActive = getTeeName(p) === tee.name;
                    const tp2 = tPlayers.find(t => t.player_id === p.id);
                    const hi2 = parseFloat(tp2?.handicap_index) || 0;
                    const previewCH = calcCH(hi2, tee.slope, tee.rating, tee.par);
                    return (
                      <button key={tee.name} onClick={() => { setTee(round, p.id, tee.name); setShowTeePicker(null); }} style={{
                        flex: 1, minWidth: 55, padding: "6px 4px", borderRadius: R.sm, cursor: "pointer", textAlign: "center",
                        background: isActive ? tee.color  + ALPHA.tint : K.inp,
                        border: `1.5px solid ${isActive ? tee.color : K.bdr}`,
                        color: K.t1,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginBottom: 1 }}>
                          <TeeColorSwatch color={tee.color} name={tee.name} size={8} />
                          <span style={{ fontSize: FS.label, fontWeight: 700 }}>{tee.name}</span>
                        </div>
                        <div style={{ fontSize: FS.micro, color: K.acc, fontWeight: 700 }}>CH {previewCH}</div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Score buttons — par-relative control (ported from league) */}
              {/* saveScore, not onSaveHole: on a round that isn't live the first
                  tap asks before it writes. See the note on saveScore. */}
              <ScoreButtonRow score={score} par={par} forName={p.name} onPick={(val) => saveScore(p, val)} />
            </div>
          );
        })}
      </div>
      )}

      </div>{/* end animated hole content */}

      {/* Footer — two-phase: Sign Scorecard → per-player Attest → FINAL */}
      <div style={{ marginTop: 8 }}>
        {isSigned ? (
          <div style={{ background: K.card, border: `1px solid ${K.acc}${ALPHA.hair}`, borderRadius: R.lg, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: FS.body }}>✍️</span>
              <span style={{ fontSize: FS.small, fontWeight: 800, color: K.acc }}>Scorecard Signed</span>
            </div>
            <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5, marginBottom: 10 }}>
              Signed by {signerName || "Scorer"}. {presentNonSigners.length === 0
                ? "No other players to attest — finalizing."
                : "Each player taps their name to attest their scores are correct."}
            </div>
            {presentNonSigners.length > 0 && (<>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {presentNonSigners.map(pid => {
                  const pl = players.find(pp => pp.id === pid);
                  const done = attestedPids.includes(pid);
                  return (
                    <button key={pid} disabled={done} onClick={() => handleAttest(pid)} style={{
                      fontSize: FS.small, fontWeight: 700, padding: "8px 12px", borderRadius: R.sm,
                      background: done ? K.acc + ALPHA.wash : K.inp,
                      border: `1.5px solid ${done ? K.acc + ALPHA.line : K.bdr}`,
                      color: done ? K.acc : K.t1, cursor: done ? "default" : "pointer",
                    }}>{done ? "✓ " : ""}{pl ? pl.name : pid}</button>
                  );
                })}
              </div>
              <div style={{ textAlign: "center", fontSize: FS.label, color: allAttested ? K.acc : K.warn, fontWeight: 700, marginBottom: 10 }}>
                {attestedPids.filter(pid => presentNonSigners.includes(pid)).length} of {presentNonSigners.length} attested{allAttested ? " — finalizing…" : ""}
              </div>
            </>)}
            <button onClick={handleUnsign} style={{
              width: "100%", padding: "8px 0", borderRadius: R.sm,
              background: "transparent", border: `1px solid ${K.bdr}`,
              color: K.t3, fontSize: FS.label, fontWeight: 600, cursor: "pointer",
            }}>↩ Unsign & edit scores</button>
          </div>
        ) : (() => {
          const hole18Done = groupPlayers.every(p => ((holeData[`${p.id}_${round}`] || {})[17] > 0));
          if (!hole18Done) return null;
          const allComplete = groupPlayers.every(p => { for (let h = 0; h < 18; h++) { if (!((holeData[`${p.id}_${round}`] || {})[h] > 0)) return false; } return true; });
          return (
            <Btn variant={allComplete ? "primary" : "secondary"} block onClick={() => setShowFinalize(true)}
              style={allComplete ? undefined : { background: K.card, color: K.t2 }}>✍️ Sign Scorecard</Btn>
          );
        })()}
      </div>

      {/* Full Scorecard popout — group, all 18 holes, stroke dots + birdie/bogey rings */}
      {showFullCard && (
        <Popup onClose={() => setShowFullCard(false)} maxWidth={460}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: FS.label, color: K.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{course ? course.name : ""} · Round {round}</div>
              </div>
              <button onClick={() => setShowFullCard(false)} style={{ flexShrink: 0, width: 30, height: 30, borderRadius: R.sm, border: `1px solid ${K.bdr}`, background: K.inp, color: K.t2, fontSize: FS.body, cursor: "pointer" }}>✕</button>
            </div>

            {[0, 9].map(start => {
              const holes = Array.from({ length: 9 }, (_, i) => start + i);
              const isFront = start === 0;
              const parTot = holes.reduce((a, h) => a + (holePars[h] || 0), 0);
              const par18 = holePars.slice(0, 18).reduce((a, p) => a + (p || 0), 0);
              const gridCols = isFront ? "54px repeat(9, minmax(0,1fr)) 30px" : "54px repeat(9, minmax(0,1fr)) 28px 32px";
              const cb = { display: "flex", alignItems: "center", justifyContent: "center", height: 32 };
              return (
                <div key={start} style={{ marginBottom: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 2 }}>
                    {/* HOLE */}
                    <div key="hl" style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 700, color: K.t3 }}>HOLE</div>
                    {holes.map(h => <div key={"h" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t3 }}>{h + 1}</div>)}
                    <div key="ho" style={{ ...cb, fontSize: FS.micro, fontWeight: 800, color: K.acc }}>{isFront ? "OUT" : "IN"}</div>
                    {!isFront && <div key="ht" style={{ ...cb, fontSize: FS.micro, fontWeight: 800, color: K.acc }}>TOT</div>}
                    {/* PAR */}
                    <div key="pl" style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 600, color: K.t3 }}>Par</div>
                    {holes.map(h => <div key={"p" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 600, color: K.t2 }}>{holePars[h] || "-"}</div>)}
                    <div key="po" style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t2 }}>{parTot || "-"}</div>
                    {!isFront && <div key="pt" style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t2 }}>{par18 || "-"}</div>}
                    {/* SI */}
                    <div key="sl" style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 600, color: K.t3 }}>Handicap</div>
                    {holes.map(h => <div key={"s" + h} style={{ ...cb, fontSize: FS.micro, color: K.t3 }}>{holeHcps[h] || "-"}</div>)}
                    <div key="so" style={cb} />
                    {!isFront && <div key="st" style={cb} />}
                    {/* players */}
                    {groupPlayers.map(p => {
                      const scMap = holeData[`${p.id}_${round}`] || {};
                      const sum9 = holes.reduce((a, h) => { const v = scMap[h]; return a + ((v > 0 && v < 90) ? v : 0); }, 0);
                      const sum18 = Array.from({ length: 18 }, (_, h) => h).reduce((a, h) => { const v = scMap[h]; return a + ((v > 0 && v < 90) ? v : 0); }, 0);
                      const cells = [
                        <div key={p.id + "-n"} style={{ ...cb, justifyContent: "flex-start", overflow: "hidden" }}>
                          <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortName(p)}</span>
                        </div>,
                        // The card's marks live in components/ScoreCell now —
                        // the ring, the second ring, the stroke dots and which
                        // of them a given number gets. They were drawn here
                        // and copied by hand onto the leaderboard's card,
                        // where the copy drifted; this is still the card that
                        // decides how they look, it just no longer decides it
                        // privately.
                        ...holes.map(h => (
                          <ScoreCell key={p.id + "-" + h} score={scMap[h]} par={holePars[h] || 4} strokes={getStrokes(p, h)} style={cb} />
                        )),
                        <div key={p.id + "-o"} style={{ ...cb, fontSize: FS.label, fontWeight: 800, color: K.t1 }}>{sum9 || ""}</div>,
                        ...(isFront ? [] : [<div key={p.id + "-t"} style={{ ...cb, fontSize: FS.label, fontWeight: 800, color: K.acc }}>{sum18 || ""}</div>]),
                      ];
                      return cells;
                    })}
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", margin: "2px 0 10px", fontSize: FS.micro, color: K.t3 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 11, height: 11, borderRadius: "50%", border: "1.5px solid #ef4444", display: "inline-block" }} /> Birdie</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: R.xs, border: "1.5px solid #3b82f6", display: "inline-block" }} /> Bogey+</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 4, height: 4, borderRadius: "50%", background: K.acc, display: "inline-block" }} /> Stroke</span>
            </div>

            <button onClick={() => setShowFullCard(false)} style={{ display: "block", width: "100%", padding: 10, background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.md, color: K.t2, fontSize: FS.small, fontWeight: 700, cursor: "pointer" }}>Close</button>
        </Popup>
      )}

      {/* Front 9 check — the group's gross front nine, put up once as they
          reach hole 10. Gross only, and no stroke dots or birdie rings: this
          is the "is that what you shot?" card, not the scorecard, and the
          numbers a player can check against their own memory are the raw
          ones. Tapping a hole number closes this and walks back to that hole,
          because catching a wrong number is only useful with a way to it. */}
      {showFront9 && (() => {
        const holes = Array.from({ length: 9 }, (_, i) => i);
        const parOut = holes.reduce((a, h) => a + (holePars[h] || 0), 0);
        const cb = { display: "flex", alignItems: "center", justifyContent: "center", height: 30 };
        const gridCols = "58px repeat(9, minmax(0,1fr)) 34px";
        const jump = (h) => { setShowFront9(false); goToHole(h); };
        return (
          <Popup onClose={() => setShowFront9(false)} maxWidth={420} dismissOnBackdrop={false} background={K.card} borderColor={K.acc + ALPHA.hair} padding={0} zIndex={340}>
            <div style={{ background: K.acc + ALPHA.wash, borderBottom: `1px solid ${K.acc}${ALPHA.hair}`, padding: "14px 20px", textAlign: "center" }}>
              <div style={{ fontSize: FS.body, fontWeight: 800, color: K.acc, letterSpacing: 0.3 }}>At the Turn</div>
            </div>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 2 }}>
                <div style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 700, color: K.t3 }}>HOLE</div>
                {holes.map(h => (
                  <button key={"h" + h} onClick={() => jump(h)} style={{ ...cb, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: FS.label, fontWeight: 700, color: K.acc }}>{h + 1}</button>
                ))}
                <div style={{ ...cb, fontSize: FS.micro, fontWeight: 800, color: K.acc }}>OUT</div>

                <div style={{ ...cb, justifyContent: "flex-start", fontSize: FS.micro, fontWeight: 600, color: K.t3 }}>Par</div>
                {holes.map(h => <div key={"p" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 600, color: K.t2 }}>{holePars[h] || "-"}</div>)}
                <div style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t2 }}>{parOut || "-"}</div>

                {groupPlayers.map(p => {
                  const scMap = holeData[`${p.id}_${round}`] || {};
                  const out = holes.reduce((a, h) => { const v = scMap[h]; return a + ((v > 0 && v < 90) ? v : 0); }, 0);
                  return [
                    <div key={p.id + "-n"} style={{ ...cb, justifyContent: "flex-start", overflow: "hidden" }}>
                      <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shortName(p)}</span>
                    </div>,
                    ...holes.map(h => {
                      const v = scMap[h];
                      const has = v > 0 && v < 90;
                      return <div key={p.id + "-" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t1 }}>{has ? v : (v >= 90 ? "—" : "")}</div>;
                    }),
                    <div key={p.id + "-o"} style={{ ...cb, fontSize: FS.label, fontWeight: 800, color: K.acc }}>{out || ""}</div>,
                  ];
                })}
              </div>

              {/* The hole numbers above are still buttons back to that hole —
                  the line that said so is gone, but the way back is not. */}
              <div style={{ height: 12 }} />

              <Btn variant="primary" block onClick={() => { tapBigAction(); setShowFront9(false); }}>On to the Back 9</Btn>
            </div>
          </Popup>
        );
      })()}

      {/* CTP popup — asks who was Closest to Pin when a par-3 completes for this group.
          Tournament-wide CTP: one winner per par-3 per round. Every group gets the
          prompt as they finish the hole; an earlier group's tag shows in the "current
          CTP" leader bar so this group knows the number to beat, and either claims it
          with a shorter distance or passes. Blocks auto-advance until answered.
          Explicit buttons only — no backdrop dismiss (we want a real answer). */}
      {showCtpForHole !== null && (() => {
        const holeNum = showCtpForHole + 1;
        const leader = ((ctpData || {})[round] || {})[holeNum];
        const leaderPl = leader ? players.find(p => p.id === leader.playerId) : null;
        const leaderDist = leader ? (leader.distanceFt ? `${leader.distanceFt} ft` : (leader.distance || "")) : "";
        const closeAndAdvance = () => { setShowCtpForHole(null); setCtpPickPlayer(""); };
        // Was this tag made by a group PLAYING BEHIND us? A group that walks
        // off a par 3 to make its tee time and puts the hole in fifteen
        // minutes later is shown a "current CTP" that did not exist when they
        // were on the green. Without saying so, the number reads as the group
        // ahead of them — and the tie rule, which hands the pin to whoever
        // tagged first, quietly runs backwards. See lib/ctp.
        const myTeeOrder = groupTeeOrder(pairingsData, round, group);
        const outOfOrder = leader ? tagAheadOfPlay({
          leaderOrder: leader.taggedGroupOrder,
          leaderKey: leader.taggedGroupKey,
          myOrder: myTeeOrder,
          myKey: _groupKey,
        }) : null;
        // Beating the standing tag is a strictly-shorter distance. Equal isn't closer —
        // ties keep the earlier group's tag (first to hole it holds the pin).
        // Undecided is not "beats it": until a distance is chosen there is
        // nothing to compare, so the question simply has not been answered.
        const chosen = ctpFeet != null;
        const beatsLeader = !leader || !leader.distanceFt || (chosen && ctpFeet < leader.distanceFt);
        // BOTH halves, deliberately. A name with no distance is a claim
        // nobody measured, and it would go onto the card looking like one
        // somebody did.
        const canTag = !!ctpPickPlayer && chosen && beatsLeader;
        const save = async () => {
          if (!canTag) return;
          tapBigAction();
          try { await onSetCtp?.(round, holeNum, ctpPickPlayer, ctpFeet, { key: _groupKey, order: myTeeOrder }); } catch {}
          closeAndAdvance();
        };
        // Wheel: park it on ctpFeetStart when the scroll node mounts, then derive feet
        // from scroll position. Snap stride === CTP_WHEEL_ITEM so a settle always lands
        // on a row.
        const wheelRef = (el) => {
          if (el && !el.dataset.init) {
            el.dataset.init = "1";
            el.scrollTop = (ctpFeetStart - 1) * CTP_WHEEL_ITEM;
          }
        };
        // A gesture, not a scroll, is what counts as choosing. Setting scrollTop above
        // fires the same scroll event a thumb does, so reading the scroll alone would
        // mark the parked value as chosen the instant the wheel appeared. Pointer,
        // touch and wheel between them cover a thumb, a stylus and a trackpad.
        const markTouched = () => { ctpWheelTouched.current = true; };
        const onWheelScroll = (e) => {
          if (!ctpWheelTouched.current) return;
          const v = Math.max(1, Math.min(CTP_MAX_FT, Math.round(e.currentTarget.scrollTop / CTP_WHEEL_ITEM) + 1));
          setCtpFeet(prev => (prev === v ? prev : v));
        };
        return (
          <Popup onClose={closeAndAdvance} maxWidth={360} dismissOnBackdrop={false} background={K.card} borderColor={K.acc + ALPHA.hair} padding={0} zIndex={350}>
            <div style={{ background: K.acc + ALPHA.wash, borderBottom: `1px solid ${K.acc}${ALPHA.hair}`, padding: "14px 20px", textAlign: "center" }}>
              <div style={{ fontSize: FS.hero, marginBottom: 4 }}>🎯</div>
              <div style={{ fontSize: FS.body, fontWeight: 800, color: K.acc, letterSpacing: 0.3 }}>Closest to Pin</div>
              <div style={{ fontSize: FS.label, color: K.t3, marginTop: 2 }}>Hole {holeNum} · Par 3</div>
            </div>
            <div style={{ padding: "14px 16px" }}>

              {/* Current-leader bar — the number to beat, tagged by an earlier group */}
              {leader && leaderPl && (
                <div style={{ background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.line}`, borderRadius: R.md, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                    <span style={{ fontSize: FS.body }}>⛳</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: FS.micro, fontWeight: 800, color: K.warn, letterSpacing: 1.2, textTransform: "uppercase" }}>Current CTP</span>
                      <span style={{ fontSize: FS.small, fontWeight: 700, color: K.t1 }}>{leaderPl.name}</span>
                    </span>
                    {leaderDist && <span style={{ fontSize: FS.small, fontWeight: 800, color: K.warn }}>{leaderDist}</span>}
                  </div>
                  {/* Tagged out of order — the group BEHIND us got in first.
                      Inside this bar rather than above it, because it is not a
                      second thing to read: it is what this number is. A group
                      that walked off to make its tee time is being shown a tag
                      from players who were still waiting to hit, and left to
                      itself the bar reads as the group ahead of them.
                      Two amber boxes stacked also read as one wall of shouting
                      on a phone in sunlight — the app's face is all caps, so
                      the copy stays short and there is only ever one box. */}
                  {outOfOrder && (
                    <div style={{ borderTop: `1px solid ${K.warn}${ALPHA.hair}`, padding: "7px 10px 8px", display: "flex", gap: 6 }}>
                      <span style={{ fontSize: FS.label }}>⏱</span>
                      <span style={{ fontSize: FS.label, color: K.t2, lineHeight: 1.45, minWidth: 0 }}>
                        <span style={{ fontWeight: 800, color: K.warn }}>{outOfOrder.label} tagged this after you finished.</span>
                        {" "}Tag it if you were closer — a tie stays theirs.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Who was closest ── */}
              {/* One card holding the whole first question: the names, and
                  the answer for when it was none of them. Passing used to sit
                  at the very bottom under Tag, which put the group's most
                  common answer furthest from the question and behind a
                  control that did not apply to them. */}
              <div style={{ background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.lg, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                  {leader ? "Who was closer?" : "Who was closest?"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                  {presentGroupPids.map(pid => {
                    const pl = players.find(p => p.id === pid);
                    if (!pl) return null;
                    const sel = ctpPickPlayer === pid;
                    return (
                      <button key={pid}
                        onClick={() => {
                          tapNudge();
                          // Changing who it was un-answers the distance: the
                          // number belonged to the other man's shot.
                          setCtpPickPlayer(sel ? "" : pid);
                          setCtpFeet(null);
                          ctpWheelTouched.current = false;
                        }}
                        style={{
                          padding: "11px 6px", borderRadius: R.md,
                          background: sel ? K.acc + ALPHA.tint : K.card,
                          border: `1px solid ${sel ? K.acc : K.bdr}`,
                          color: sel ? K.acc : K.t2,
                          fontSize: FS.small, fontWeight: 700, cursor: "pointer", textAlign: "center",
                        }}>{pl.name}</button>
                    );
                  })}
                </div>
                {/* Passing is an ANSWER, not a dismissal. A group that walks
                    off without getting inside the standing tag is saying it is
                    right, and recording that is what lets the Betting tab tell
                    "nobody has been asked" apart from "everybody has been
                    asked and it stands". The last group to confirm is the one
                    that settles the pin. */}
                <Btn variant="secondary" size="sm" block
                  onClick={async () => {
                    tapNudge();
                    if (leader) { try { await onConfirmCtp?.(round, holeNum, user?.id); } catch { /* the pass still closes */ } }
                    closeAndAdvance();
                  }}
                  style={{ color: K.t3 }}>
                  {leader ? `Confirm — ${leaderPl?.name || "the standing CTP"} keeps it` : "None of us — skip"}
                </Btn>
              </div>

              {/* ── How close ── */}
              {/* Only once somebody is claiming it. Asking a group to set a
                  distance before they have said whose shot it was is asking
                  the second question first, and the group whose answer is
                  "none of us" never needed it at all. */}
              {ctpPickPlayer && (
                <>
                  <div style={{ fontSize: FS.label, fontWeight: 800, color: K.t3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
                    Approx. distance
                  </div>
                  <div style={{ position: "relative", height: CTP_WHEEL_H, background: K.inp, border: `1px solid ${chosen ? K.acc + ALPHA.line : K.bdr}`, borderRadius: R.lg, overflow: "hidden", marginBottom: 10 }}>
                    {/* selection band */}
                    <div style={{ position: "absolute", left: 10, right: 10, top: "50%", height: CTP_WHEEL_ITEM + 2, transform: "translateY(-50%)", borderTop: `1.5px solid ${chosen ? K.acc : K.t3}`, borderBottom: `1.5px solid ${chosen ? K.acc : K.t3}`, borderRadius: R.xs, background: chosen ? K.acc + ALPHA.wash : "transparent", pointerEvents: "none", zIndex: 2 }} />
                    <div style={{ position: "absolute", right: 46, top: "50%", transform: "translateY(-50%)", fontSize: FS.label, fontWeight: 800, color: chosen ? K.acc : K.t3, letterSpacing: 1.2, pointerEvents: "none", zIndex: 2 }}>FT</div>
                    <div
                      ref={wheelRef}
                      onScroll={onWheelScroll}
                      onPointerDown={markTouched}
                      onTouchStart={markTouched}
                      onWheel={markTouched}
                      style={{ height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory", padding: `${(CTP_WHEEL_H - CTP_WHEEL_ITEM) / 2}px 0`, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
                    >
                      {Array.from({ length: CTP_MAX_FT }, (_, i) => i + 1).map(ft => (
                        <div key={ft} style={{ height: CTP_WHEEL_ITEM, lineHeight: `${CTP_WHEEL_ITEM}px`, textAlign: "center", fontSize: ft === ctpFeet ? FS.title : FS.lead, fontWeight: ft === ctpFeet ? 800 : 700, color: ft === ctpFeet ? K.t1 : K.t3, scrollSnapAlign: "center" }}>
                          {ft}
                        </div>
                      ))}
                    </div>
                    {/* edge fades */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 46, background: `linear-gradient(${K.inp}, transparent)`, pointerEvents: "none" }} />
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 46, background: `linear-gradient(transparent, ${K.inp})`, pointerEvents: "none" }} />
                  </div>

                  {/* Why the tag button is dead — surfaced instead of leaving it mysteriously grey */}
                  {!chosen && (
                    <div style={{ fontSize: FS.label, color: K.t3, textAlign: "center", marginBottom: 8, lineHeight: 1.4 }}>
                      Spin the wheel to set how close {shortName(players.find(p => p.id === ctpPickPlayer)) || "they"} was.
                    </div>
                  )}
                  {chosen && !beatsLeader && (
                    <div style={{ fontSize: FS.label, color: K.warn, textAlign: "center", marginBottom: 8, lineHeight: 1.4 }}>
                      {ctpFeet === leader.distanceFt
                        ? `Tied with ${leaderPl?.name || "the current CTP"} — the earlier tag holds.`
                        : `Not inside ${leaderDist} — ${leaderPl?.name || "the current CTP"} keeps it.`}
                    </div>
                  )}

                  <Btn block disabled={!canTag} onClick={save} style={{ letterSpacing: 0.5 }}>{leader ? "Tag New CTP" : "Tag CTP"}</Btn>
                </>
              )}
            </div>
          </Popup>
        );
      })()}

      {/* WD confirmation modal */}
      {wdConfirm && (
        <Popup onClose={() => setWdConfirm(null)} maxWidth={340} dismissOnBackdrop={false} background={K.card} borderColor={K.danger + ALPHA.line} padding={0} overlayPadding={24} zIndex={400}>
              <div style={{ background: K.danger + ALPHA.wash, borderBottom: `1px solid ${K.danger}${ALPHA.hair}`, padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: FS.hero, marginBottom: 6 }}>⛳</div>
                <div style={{ fontSize: FS.body, fontWeight: 800, color: K.danger }}>Withdraw Player</div>
              </div>
              <div style={{ padding: "16px 20px", textAlign: "center" }}>
                <div style={{ fontSize: FS.small, color: K.t1, fontWeight: 600, marginBottom: 6 }}>
                  {players.find(p => p.id === wdConfirm)?.name} has withdrawn from the WBC.
                </div>
                <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5 }}>
                  Remaining holes will be marked WD. Any completed holes count toward the skins game. This cannot be undone.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, padding: "0 16px 16px" }}>
                <Btn variant="secondary" size="sm" onClick={() => setWdConfirm(null)} style={{ flex: 1, color: K.t2 }}>Cancel</Btn>
                <Btn variant="danger" size="sm" onClick={() => { markPlayerWD(wdConfirm); setWdConfirm(null); }} style={{ flex: 1 }}>Confirm WD</Btn>
              </div>
        </Popup>
      )}

      {/* Finalize confirmation modal with mini scorecards */}
      {showFinalize && (() => {
        const finalizeMissing = [];
        groupPlayers.forEach(p => {
          const scores = holeData[`${p.id}_${round}`] || {};
          const missingHoles = [];
          for (let h = 0; h < 18; h++) { if (!(scores[h] > 0)) missingHoles.push(h + 1); }
          if (missingHoles.length > 0) finalizeMissing.push({ name: p.name, holes: missingHoles });
        });
        return (
          <Popup onClose={() => setShowFinalize(false)} maxWidth={400} background={K.card} zIndex={1000}>
              <div style={{ textAlign: "center", marginBottom: 10 }}>
                <div style={{ fontSize: FS.body, fontWeight: 800, color: K.t1 }}>Sign Scorecard — Round {round}</div>
                {course && <div style={{ fontSize: FS.label, color: K.acc, fontWeight: 600, marginTop: 2 }}>{course.name}</div>}
              </div>
              {finalizeMissing.length > 0 && (
                <div style={{ background: K.warn + ALPHA.wash, border: `1px solid ${K.warn}${ALPHA.hair}`, borderRadius: R.sm, padding: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: FS.label, color: K.warn, fontWeight: 600, marginBottom: 4 }}>⚠️ Missing scores</div>
                  {finalizeMissing.map(m => (
                    <div key={m.name} style={{ fontSize: FS.label, color: K.t2 }}>
                      <span style={{ fontWeight: 600 }}>{m.name}</span>: holes {m.holes.join(", ")}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ height: 4 }} />

              {/* Mini scorecards per player */}
              {groupPlayers.map(p => {
                // Same handicap and the same stroke allocation as everything
                // else on this screen — see the note above getCH.
                const ch = getCH(p);
                const scores = holeData[`${p.id}_${round}`] || {};
                let gross = 0, net = 0, frontGross = 0, backGross = 0;
                const strokeMap = buildStrokesMap(ch, holeHcps);
                for (let h = 0; h < 18; h++) {
                  const g = scores[h];
                  if (!(g > 0) || g === WD_SCORE) continue;
                  const st = (strokeMap[h] || 0) * (ch < 0 ? -1 : 1);
                  gross += g; net += g - st;
                  if (h < 9) { frontGross += g; } else { backGross += g; }
                }
                const parTotal = holePars.reduce((a, b) => a + b, 0);
                const cellBorder = `1px solid ${K.bdr}${ALPHA.line}`;
                const renderHalf = (startH, endH, subtotal) => (
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${endH - startH}, 1fr) 28px`, borderTop: cellBorder }}>
                    {/* Hole numbers row */}
                    {Array.from({ length: endH - startH }, (_, i) => startH + i).map(h => (
                      <div key={`n${h}`} style={{ textAlign: "center", fontSize: FS.micro, fontWeight: 600, color: K.t3, padding: "2px 0", borderRight: cellBorder, borderBottom: cellBorder }}>
                        {h + 1}
                      </div>
                    ))}
                    <div style={{ textAlign: "center", fontSize: FS.micro, fontWeight: 600, color: K.t3, padding: "2px 0", borderBottom: cellBorder }}>{startH === 0 ? "Out" : "In"}</div>
                    {/* Score row */}
                    {Array.from({ length: endH - startH }, (_, i) => startH + i).map(h => {
                      const s = scores[h];
                      const d = s ? s - holePars[h] : null;
                      return (
                        <div key={`s${h}`} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", borderRight: cellBorder, height: 26 }}>
                          {s && d != null && d !== 0 && (
                            <>
                              <div style={{
                                position: "absolute",
                                width: 18, height: 18,
                                borderRadius: d < 0 ? "50%" : R.xs,
                                border: `1px solid rgba(180,180,180,0.3)`,
                              }} />
                              {(d <= -2 || d >= 2) && (
                                <div style={{
                                  position: "absolute",
                                  width: 13, height: 13,
                                  borderRadius: d < 0 ? "50%" : R.xs,
                                  border: `1px solid rgba(180,180,180,0.3)`,
                                }} />
                              )}
                            </>
                          )}
                          <span style={{ position: "relative", fontSize: FS.small, fontWeight: 700, color: s ? K.t1 : K.t3 + ALPHA.hair }}>
                            {s || "—"}
                          </span>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: FS.small, fontWeight: 800, color: K.t2, height: 26 }}>{subtotal || "—"}</div>
                  </div>
                );
                return (
                  <div key={p.id} style={{ background: K.inp, borderRadius: R.sm, marginBottom: 8, overflow: "hidden", border: `1px solid ${K.bdr}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderBottom: cellBorder }}>
                      <span style={{ fontSize: FS.small, fontWeight: 700, color: K.t1 }}>{p.name}</span>
                      <div style={{ display: "flex", gap: 8, fontSize: FS.small }}>
                        <span style={{ color: K.t3 }}>Gross <strong style={{ color: K.t2 }}>{gross || "—"}</strong></span>
                        <span style={{ color: K.t3 }}>Net <strong style={{ color: net && (net - parTotal) < 0 ? K.under : K.t1 }}>{net || "—"}</strong></span>
                      </div>
                    </div>
                    {renderHalf(0, 9, frontGross)}
                    {renderHalf(9, 18, backGross)}
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowFinalize(false)} style={{
                  flex: 1, padding: "10px 0", borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`,
                  color: K.t2, fontSize: FS.small, fontWeight: 600, cursor: "pointer",
                }}>✏️ Edit Scores</button>
                <button onClick={handleSign} style={{
                  flex: 1, padding: "10px 0", borderRadius: R.md, background: finalizeMissing.length > 0 ? K.warn : K.acc, border: "none",
                  color: K.bg, fontSize: FS.small, fontWeight: 700, cursor: "pointer",
                }}>{finalizeMissing.length > 0 ? "Sign Anyway" : "✍️ Sign Scorecard"}</button>
              </div>
          </Popup>
        );
      })()}

      {/* Sits ON the app header rather than below it. At top: 80 this landed
          across the hole strip — the one part of the screen a player might be
          reaching for while it is up, since the toast is showing precisely
          when the group has just finished a hole and somebody wants to check
          or correct the one before it. The header underneath is a logo and a
          caption: nothing to tap, and nothing that changes in the second and
          a half this covers it. Offset from the same safe-area inset the
          header uses so it stays centred on that band on a notched phone. */}
      {allScored && currentHole < 17 && navSource === "auto" && !editingCompleted && (
        <div style={{ position: "fixed", top: `calc(${HEADER_SAFE_PAD} + 9px)`, left: "50%", transform: "translateX(-50%)", background: K.acc, color: K.bg, padding: "12px 48px", borderRadius: R.lg, fontSize: FS.small, fontWeight: 700, zIndex: 1000, whiteSpace: "nowrap", minWidth: 280, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "toastDown 0.3s ease", pointerEvents: "none" }}>
          ✓ Hole {currentHole + 1} saved — advancing...
        </div>
      )}
      {/* Round complete — on the header band, same as the advancing toast, and
          for a sharper reason: this one does not time out. It stays up until
          the card is signed, and at top: 80 it sat across the hole strip for
          as long as it was there — so a group that finished and then wanted to
          fix hole 3 had the way back to hole 3 covered by it.
          It is a BAR rather than a centred pill: it runs from the left edge to
          88px short of the right, which leaves the header's crown — the
          director's group switcher, the one live control up here — uncovered
          and tappable the whole time this is showing. */}
      {/* On a hole this group already finished — same band, same geometry as
          Round complete, in the warning colour. It has to live out here rather
          than up with the read-only scores it explains: the hole content is
          wrapped in a transformed div for the slide animation, and a transform
          makes its box the containing block for anything `position: fixed`
          inside it, which would drop this bar into the middle of the screen.
          "Resume Hole 18 →" shortens to "Hole 18 →" — the row has three things
          on it now, and the green button is self-evidently the way onward. */}
      {onCompletedHole && (
        <HoleStateBar glyph="✓" label={`Hole ${currentHole + 1} already scored`}>
          <button onClick={() => setEditingCompleted(true)} style={holeBarBtn(K.warn)}>✏️ Edit</button>
          <button onClick={returnToPlay} style={holeBarBtn(K.acc)}>Hole {findNextIncompleteHole() + 1} →</button>
        </HoleStateBar>
      )}
      {/* The other half of the same state, and now the same bar: you tapped
          Edit, the cards below went live, and this stays pinned to say which
          hole you are editing and how to get back to the live one. It was an
          inline strip above the cards, which scrolled away exactly when you
          were deepest into the thing it was warning you about. */}
      {editingCompleted && (
        <HoleStateBar glyph="✎" label={`Editing hole ${currentHole + 1}`}>
          <button onClick={returnToPlay} style={holeBarBtn(K.acc)}>Hole {findNextIncompleteHole() + 1} →</button>
        </HoleStateBar>
      )}
      {allRoundComplete && !isGroupFinalized && !isSigned && !showFinalize && !onCompletedHole && (
        <div style={{ position: "fixed", top: `calc(${HEADER_SAFE_PAD} + 6px)`, left: 12, right: 88, display: "flex", alignItems: "center", gap: 10, background: K.acc, color: K.bg, padding: "10px 14px", borderRadius: R.lg, fontSize: FS.small, fontWeight: 700, zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "toastDownBar 0.3s ease" }}>
          <span style={{ flex: 1 }}>🏆 Round complete!</span>
          <button onClick={() => setShowFinalize(true)} style={{ background: K.bg, color: K.acc, border: "none", borderRadius: R.sm, padding: "6px 14px", fontSize: FS.small, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>Sign Scorecard</button>
        </div>
      )}
    </div>
  );
}

// ── GROUP SETUP ──

export default OnCourseScoring;
