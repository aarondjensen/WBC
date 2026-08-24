// ══════════════════════════════════════════════════════════════════
//  ScrambleScoring — the Scoring tab with one ball on it.
// ══════════════════════════════════════════════════════════════════
//
// Reached only from the OG/YG/NG button the scramble puts in the app header,
// and only while the director has the scramble switched on. It is the same
// screen as components/OnCourseScoring by design — the same hole strips, the
// same hole banner with par and stroke index, the same ScoreButtonRow, the
// same full-scorecard popout — because it is used in the same conditions by
// the same hands, and a second scoring screen that behaved differently is how
// somebody posts a 5 on the wrong hole.
//
// The one difference is the whole point of it: a scramble team plays ONE ball,
// so there is ONE score input on the hole rather than a card per player. That
// removes most of what makes the tournament screen large — no course
// handicaps, no stroke dots, no per-player net, no withdraw, no sign, no
// attest, no finalize. A team, a hole, a number.
//
// The team switcher sits where a director's group switcher does the same job
// on the tournament screen: this is the ONE control that points the screen at
// somebody else's card, and it is on this screen rather than in the header
// because everybody has it — a scramble team keeps its own card, and any of
// the three might be the one in your hand.
//
// Everything it computes is in lib/scramble; everything it writes goes up to
// the shell as onSaveHole(teamKey, holeIdx, score).
import { useEffect, useRef, useState } from "react";
import { K, FS, R, ALPHA, MOTION, FONT, SHADOW } from "../theme";
import { SegmentedToggle, Card, SectionLabel } from "./ui";
import { Popup } from "./Popup";
import { ScoreButtonRow } from "./ScoreButtonRow";
import { shortName } from "../lib/playerNames";
import { fmtPar } from "../lib/format";
import { openingHole } from "../lib/holeAdvance";
import {
  SCRAMBLE_TEAMS, SCRAMBLE_HOLES, mergeScramble, teamOf, teamPlayers,
  teamLine, scrambleStandings, teamLabel,
} from "../lib/scramble";

// How long the posted score stays on screen before the card walks to the next
// hole. The tournament screen advances on the same beat once a whole group is
// in; here one tap completes the hole, so the pause is all there is between
// posting and moving — long enough to read the number back, short enough that
// nobody taps forward before it fires.
const ADVANCE_MS = 900;

export function ScrambleScoring({ scramble, players = [], courses = [], user, onSaveHole, onGoToSetup }) {
  const sc = mergeScramble(scramble);
  const course = courses.find(c => c.id === sc.courseId) || null;

  // Which team's card is on screen. Yours if you are on one — the common case,
  // and the one where a picker is a step nobody should have to take — and
  // otherwise the first team, which is what a director or a guest opens onto.
  const [team, setTeam] = useState(() => teamOf(sc, user?.id) || SCRAMBLE_TEAMS[0].key);
  // Where the thumb has walked, per team — empty until somebody navigates or
  // posts. See the note under `currentHole`.
  const [walked, setWalked] = useState({});
  const [showFullCard, setShowFullCard] = useState(false);
  const advanceTimer = useRef(null);

  const card = sc.scores[team] || {};
  const holePars = course ? (course.hole_pars || []) : [];
  const holeHcps = course ? (course.hole_handicaps || []) : [];

  // ── Which hole is on screen ────────────────────────────────────
  // The tournament screen resolves this in an effect and has to guard against
  // a cold load doing it against scores that have not arrived — pairings and
  // hole scores come over separate subscriptions, and a card that is empty
  // because nothing is posted looks exactly like one that is empty because
  // nothing has loaded (see the note in OnCourseScoring).
  //
  // Here it is simply DERIVED, which makes that whole class of bug impossible:
  // until somebody navigates, the hole is wherever lib/holeAdvance says this
  // team's card runs out, recomputed from whatever has arrived. The moment a
  // thumb moves — a tile, an arrow, a posted score — the position is theirs
  // and the derivation stops applying. Per team, so switching cards and coming
  // back lands where you left rather than at the front of somebody else's.
  const opening = openingHole([team], (_k, h) => card[h]);
  const currentHole = walked[team] != null ? walked[team] : (opening.resolved ? opening.hole : 0);
  const par = holePars[currentHole] || 4;
  const hcp = holeHcps[currentHole] || (currentHole + 1);
  const score = card[currentHole] || 0;

  // A pending advance belongs to the hole it was scheduled on. Walking away by
  // hand, switching teams or leaving the screen cancels it — otherwise the card
  // jumps a hole under somebody who has already moved.
  const cancelAdvance = () => {
    if (advanceTimer.current) { clearTimeout(advanceTimer.current); advanceTimer.current = null; }
  };
  useEffect(() => cancelAdvance, []);

  const setHole = (key, h) => setWalked(w => ({ ...w, [key]: Math.min(SCRAMBLE_HOLES - 1, Math.max(0, h)) }));
  const goToHole = (h) => { cancelAdvance(); setHole(team, h); };

  const pickScore = (val) => {
    cancelAdvance();
    // Pin the hole before the write lands. Without this the derivation above
    // would move the card to the next unscored hole the instant the score
    // posts, and the number nobody got to read back is the one they typed.
    setHole(team, currentHole);
    onSaveHole(team, currentHole, val);
    // Only a fresh post walks forward. Clearing a hole (val 0) or correcting
    // one that already had a number is somebody working on THIS hole, and
    // sliding the card out from under them is the opposite of helping.
    if (val > 0 && !(score > 0) && currentHole < SCRAMBLE_HOLES - 1) {
      const next = currentHole + 1;
      const on = team;
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        setHole(on, next);
      }, ADVANCE_MS);
    }
  };

  const roster = teamPlayers(sc.teams, team, players);
  const line = teamLine(card, holePars);
  const standings = scrambleStandings(sc, holePars);

  // ── The course has to be set before anything here means a number ──
  // Same empty state the tournament screen puts up, and the same door out of
  // it for the one person who can fix it.
  if (!course) return (
    <div>
      <h2 style={{ fontFamily: FONT, fontSize: FS.title, margin: "0 0 14px", fontWeight: 800 }}>Scramble</h2>
      <div
        onClick={user?.isDirector && onGoToSetup ? onGoToSetup : undefined}
        style={{ background: K.card, borderRadius: R.xl, border: `1px dashed ${K.warn}${ALPHA.hair}`, padding: 32, textAlign: "center", cursor: user?.isDirector ? "pointer" : "default" }}
      >
        <div style={{ fontSize: FS.display, marginBottom: 8 }}>🏌️</div>
        <p style={{ color: K.warn, fontWeight: 600, margin: "0 0 4px" }}>No course set for the scramble</p>
        {user?.isDirector
          ? <p style={{ color: K.acc, fontSize: FS.small, margin: 0, fontWeight: 600 }}>Tap to set it up in More → Scramble →</p>
          : <p style={{ color: K.t2, fontSize: FS.small, margin: 0 }}>Waiting on your tournament director.</p>
        }
      </div>
    </div>
  );

  return (
    <div>
      {/* ── Whose card this is ─────────────────────────────────────
          Three teams, always all three, always in the same order — the switch
          is also the only place the other two cards are reachable from, and a
          picker that hid the empty ones would change shape as the round went
          on. */}
      <SegmentedToggle
        options={SCRAMBLE_TEAMS.map(t => {
          const l = teamLine(sc.scores[t.key], holePars);
          return [t.key, t.label, l.complete ? K.acc : l.thru > 0 ? K.warn : false];
        })}
        value={team}
        onChange={(k) => { cancelAdvance(); setTeam(k); }}
        style={{ marginBottom: 8 }}
      />

      {/* Hole navigator — front nine over back nine, exactly as the tournament
          screen draws it. A tile is lit once this team has a ball in the hole. */}
      <div style={{ marginBottom: 8 }}>
        {[0, 9].map(start => (
          <div key={start} style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 6 }}>
            {Array.from({ length: 9 }, (_, i) => start + i).map(i => {
              const scored = card[i] > 0;
              const isCurrent = i === currentHole;
              return (
                <button key={i} onClick={() => goToHole(i)} style={{
                  flex: 1, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative", zIndex: isCurrent ? 1 : 0,
                  borderRadius: scored || isCurrent ? R.lg : R.sm,
                  border: scored && !isCurrent ? `1.5px solid ${K.acc}${ALPHA.line}` : "none",
                  cursor: "pointer",
                  fontSize: FS.small, fontWeight: 700,
                  background: isCurrent ? K.acc : scored ? K.accDim + ALPHA.wash : K.card,
                  color: isCurrent ? K.bg : scored ? K.acc : K.t3,
                  outline: isCurrent ? `2px solid ${K.acc}` : "none",
                  outlineOffset: 1,
                  transition: `all ${MOTION}`,
                }}>{i + 1}</button>
              );
            })}
          </div>
        ))}
      </div>

      <button onClick={() => setShowFullCard(true)} style={{
        width: "100%", padding: "9px 0", borderRadius: R.sm, marginBottom: 8, cursor: "pointer",
        background: K.card, border: `1px solid ${K.acc}${ALPHA.hair}`, color: K.t1,
        boxShadow: `0 1px 2px ${SHADOW}`,
        fontFamily: FONT, fontSize: FS.small, fontWeight: 700, letterSpacing: 0.5,
      }}>Full Scorecard</button>

      {/* Current hole — par left, stroke index right, the number between. */}
      <div style={{
        background: `linear-gradient(135deg, ${K.card}, ${K.hover})`,
        borderRadius: R.lg, border: `1px solid ${K.bdr}`, padding: "10px 16px",
        marginBottom: 8, position: "relative",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => goToHole(currentHole - 1)} disabled={currentHole === 0} aria-label="Previous hole"
            style={{ width: 34, height: 34, borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`, color: currentHole === 0 ? K.t3 + ALPHA.hair : K.t1, fontSize: FS.lead, cursor: "pointer", fontWeight: 700 }}>‹</button>
          <div style={{ fontSize: FS.label, color: K.t3, textAlign: "center" }}>
            <span style={{ fontWeight: 600 }}>Par</span>
            <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t3, lineHeight: 1, marginTop: 2 }}>{par}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: FS.label, color: K.t1, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Hole</div>
            <div style={{ fontSize: FS.jumbo, fontWeight: 800, fontFamily: FONT, lineHeight: 1, color: K.t1 }}>{currentHole + 1}</div>
          </div>
          <div style={{ fontSize: FS.label, color: K.t3, textAlign: "center" }}>
            <span style={{ fontWeight: 600 }}>HCP</span>
            <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t3, lineHeight: 1, marginTop: 2 }}>{hcp}</div>
          </div>
          <button onClick={() => goToHole(currentHole + 1)} disabled={currentHole === SCRAMBLE_HOLES - 1} aria-label="Next hole"
            style={{ width: 34, height: 34, borderRadius: R.md, background: K.inp, border: `1px solid ${K.bdr}`, color: currentHole === SCRAMBLE_HOLES - 1 ? K.t3 + ALPHA.hair : K.t1, fontSize: FS.lead, cursor: "pointer", fontWeight: 700 }}>›</button>
        </div>
      </div>

      {/* ── The one score on the screen ────────────────────────────
          The tournament screen stacks one of these per player. A scramble team
          plays one ball, so there is one — and the heading is the team and who
          is on it rather than a name and a course handicap. */}
      <div style={{ background: K.card, borderRadius: R.md, border: `1px solid ${K.bdr}`, padding: "8px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: FS.body, fontWeight: 700, color: K.acc, flexShrink: 0 }}>{teamLabel(team)}</span>
            <span style={{ fontSize: FS.label, color: K.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {roster.length ? roster.map(shortName).join(", ") : "Nobody on this team yet"}
            </span>
          </div>
          {line.thru > 0 && (
            <span style={{ fontSize: FS.label, color: K.t3, flexShrink: 0 }}>
              Thru {line.thru}: <span style={{ color: line.toPar < 0 ? K.under : K.t2, fontWeight: 700 }}>{fmtPar(line.toPar)}</span>
            </span>
          )}
        </div>
        <ScoreButtonRow score={score} par={par} forName={teamLabel(team)} onPick={pickScore} />
      </div>

      {/* ── Where the three of them stand ──────────────────────────
          A scramble has no leaderboard tab of its own, and the answer is three
          rows long — so it rides under the card it is computed from. */}
      <SectionLabel style={{ marginTop: 14 }}>Scramble</SectionLabel>
      <Card pad={0} style={{ overflow: "hidden", marginBottom: 8 }}>
        {standings.map((row, i) => (
          <div key={row.key} onClick={() => { cancelAdvance(); setTeam(row.key); }} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer",
            borderTop: i === 0 ? "none" : `1px solid ${K.bdr}${ALPHA.hair}`,
            background: row.key === team ? K.acc + ALPHA.wash : "transparent",
          }}>
            <span style={{ fontSize: FS.small, fontWeight: 800, color: row.key === team ? K.acc : K.t1, width: 28, flexShrink: 0 }}>{row.label}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: FS.micro, color: K.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {teamPlayers(sc.teams, row.key, players).map(shortName).join(", ")}
            </span>
            <span style={{ fontSize: FS.micro, color: K.t3, flexShrink: 0 }}>{row.thru > 0 ? `Thru ${row.thru}` : "—"}</span>
            <span style={{
              fontSize: FS.small, fontWeight: 800, width: 34, textAlign: "right", flexShrink: 0,
              color: row.toPar == null ? K.t3 : row.toPar < 0 ? K.under : K.t2,
            }}>{fmtPar(row.toPar)}</span>
          </div>
        ))}
      </Card>

      {/* Full scorecard — all three teams, all eighteen holes. The tournament
          screen's popout shows one group's players; this shows the whole
          scramble, because three cards IS the whole scramble. */}
      {showFullCard && (
        <Popup onClose={() => setShowFullCard(false)} maxWidth={460}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: FS.label, color: K.t3 }}>{course.name} · Scramble</div>
            <div style={{ fontSize: FS.lead, fontWeight: 800, color: K.t1 }}>Full Scorecard</div>
          </div>
          {[0, 9].map(start => {
            const holes = Array.from({ length: 9 }, (_, i) => start + i);
            const cb = { textAlign: "center", padding: "3px 0", minWidth: 0 };
            const grid = { display: "grid", gridTemplateColumns: `34px repeat(9, 1fr) 30px`, alignItems: "center" };
            const parTot = holes.reduce((a, h) => a + (holePars[h] || 0), 0);
            return (
              <div key={start} style={{ marginBottom: 12 }}>
                <div style={{ ...grid, borderBottom: `1px solid ${K.bdr}` }}>
                  <div style={{ ...cb, fontSize: FS.micro, color: K.t3, fontWeight: 700 }}>{start === 0 ? "OUT" : "IN"}</div>
                  {holes.map(h => <div key={"h" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t3 }}>{h + 1}</div>)}
                  <div style={{ ...cb, fontSize: FS.micro, color: K.t3, fontWeight: 700 }}>TOT</div>
                </div>
                <div style={{ ...grid, borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                  <div style={{ ...cb, fontSize: FS.micro, color: K.t3 }}>Par</div>
                  {holes.map(h => <div key={"p" + h} style={{ ...cb, fontSize: FS.label, fontWeight: 600, color: K.t2 }}>{holePars[h] || "-"}</div>)}
                  <div style={{ ...cb, fontSize: FS.label, fontWeight: 700, color: K.t2 }}>{parTot || "-"}</div>
                </div>
                {SCRAMBLE_TEAMS.map(t => {
                  const tc = sc.scores[t.key] || {};
                  const sum9 = holes.reduce((a, h) => a + (tc[h] > 0 ? tc[h] : 0), 0);
                  return (
                    <div key={t.key} style={{ ...grid, background: t.key === team ? K.acc + ALPHA.wash : "transparent" }}>
                      <div style={{ ...cb, fontSize: FS.micro, fontWeight: 800, color: t.key === team ? K.acc : K.t2 }}>{t.label}</div>
                      {holes.map(h => {
                        const v = tc[h];
                        const sd = v > 0 ? v - (holePars[h] || 0) : 0;
                        return (
                          <div key={t.key + h} style={{
                            ...cb, fontSize: FS.label, fontWeight: 700,
                            color: !(v > 0) ? K.t3 + ALPHA.hair : sd < 0 ? K.under : sd > 0 ? K.t2 : K.t1,
                          }}>{v > 0 ? v : "·"}</div>
                        );
                      })}
                      <div style={{ ...cb, fontSize: FS.label, fontWeight: 800, color: K.t1 }}>{sum9 || "-"}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </Popup>
      )}
    </div>
  );
}

export default ScrambleScoring;
