// ══════════════════════════════════════════════════════════════════
//  ScrambleSetup — the director's console for the one round that is
//  not the tournament.
// ══════════════════════════════════════════════════════════════════
//
// The Admin console, cut down to a single round. That is the whole design
// brief and it is why this reads the way it does: the same StickyTop with a
// round pill under it, the same status dots on that pill, the same card
// stack, the same tap-a-player-then-tap-a-slot roster editor. A director who
// has set up a round in Admin has already used this screen.
//
// What it does NOT carry is everything the four rounds need and a scramble
// does not: no tee sheet (one ball a team, and they go off together), no tee
// assignment (nobody's course handicap is applied to a scramble here), no
// pairing strategy, no finalize, no sign-and-attest. A scramble is a course, three
// teams and a card.
//
// The one control with consequences is the switch. Throwing it puts the
// OG/YG/NG button in the app header on every phone in the field, which is the
// only way anybody reaches the scoring screen — so it stays disabled until
// there is something behind it, and what is missing is printed under it. See
// scrambleBlockers in lib/scramble.
//
// Everything it writes goes through one `onUpdate(patch)` up to the shell,
// which merges it onto tournament_state.scramble. Nothing here talks to
// Firestore.
import { useRef, useState } from "react";
import { K, FS, R, ALPHA, MOTION, DIM_PLACED } from "../theme";
import { StickyTop, SectionLabel, Card, Btn, Toggle } from "./ui";
import { shortName } from "../lib/playerNames";
import { fmtPar } from "../lib/format";
import {
  SCRAMBLE_TEAMS, SCRAMBLE_BUTTON, mergeScramble, teamOf, assignToTeam,
  unassignedIds, teamPlayers, autoSplit, teamLine, scrambleBlockers, canTurnOn, emptyTeams,
} from "../lib/scramble";

export function ScrambleSetup({ scramble, onUpdate, players = [], courses = [], notify, onOpenScoring }) {
  const sc = mergeScramble(scramble);
  // The player waiting to be placed. Same two-tap gesture the pairings editor
  // uses — tap a name, tap a team — because a drag is not a gesture that works
  // one-handed on a phone.
  const [selected, setSelected] = useState(null);
  const courseCard = useRef(null);

  const course = courses.find(c => c.id === sc.courseId) || null;
  const holePars = course ? (course.hole_pars || []) : [];
  const blockers = scrambleBlockers(sc, players);
  const ready = canTurnOn(sc);
  const pool = new Set(unassignedIds(players, sc.teams));
  const manned = SCRAMBLE_TEAMS.filter(t => sc.teams[t.key].length > 0).length;
  // Any ball struck at all. Changing the course after that would re-read every
  // hole's par under scores that were posted against a different one, so the
  // picker says so rather than silently rewriting three cards' worth of
  // to-par.
  const scored = SCRAMBLE_TEAMS.some(t => Object.values(sc.scores[t.key]).some(s => s > 0));

  const nameOf = (pid) => {
    const p = players.find(pp => pp.id === pid);
    return p ? shortName(p) : pid;
  };

  const setTeams = (teams) => { setSelected(null); onUpdate({ teams }); };

  const tapPlayer = (pid) => {
    // Tapping a placed player takes them off their team; tapping a free one
    // arms them for the next team tap. Tapping the armed one again disarms.
    const on = teamOf(sc, pid);
    if (on) { setTeams(assignToTeam(sc.teams, pid, null)); return; }
    setSelected(prev => (prev === pid ? null : pid));
  };

  const tapTeam = (key) => {
    if (!selected) return;
    setTeams(assignToTeam(sc.teams, selected, key));
  };

  const toggleOn = () => {
    if (!sc.on && !ready) return;
    const next = !sc.on;
    onUpdate({ on: next });
    if (notify) notify(next ? `Scramble is on — ${SCRAMBLE_BUTTON} is in the header` : "Scramble is off");
  };

  return (
    <div>
      {/* ── The round strip, with one round in it ──────────────────
          The Admin console pins a row of round pills here and the eye learns
          to start there. There is exactly one scramble round, so this is that
          row with a single pill: not a selector, but the same summary of what
          is done and what is not — C for the course, T for the teams — and
          the course name where a play date rides in Admin. */}
      <StickyTop padBottom={10}>
        <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{
              width: "100%", padding: "7px 4px 6px", borderRadius: R.md, textAlign: "center",
              background: K.accGlow, border: `2px solid ${K.acc}`, color: K.acc,
            }}>
              <div style={{ fontSize: FS.label, fontWeight: 700, marginBottom: 3 }}>
                {sc.on ? "🏌️ " : ""}Scramble
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                {[["C", !!course], ["T", manned >= 2]].map(([lbl, done]) => (
                  <div key={lbl} style={{
                    display: "flex", alignItems: "center", gap: 2,
                    fontSize: FS.micro, fontWeight: 700,
                    color: done ? K.ok : K.danger + ALPHA.panel,
                  }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: done ? K.ok : "transparent",
                      border: `1px solid ${done ? K.ok : K.danger + ALPHA.line}`,
                    }} />
                    {lbl}
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => courseCard.current?.scrollIntoView({ behavior: "smooth", block: "center" })} style={{
              width: "100%", padding: "4px 2px", borderRadius: R.sm, cursor: "pointer",
              background: course ? K.acc + ALPHA.wash : "transparent",
              border: `1px solid ${course ? K.acc + ALPHA.hair : K.warn + ALPHA.line}`,
              color: course ? K.acc : K.warn,
              fontSize: FS.micro, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{course ? course.name : "+ course"}</button>
          </div>
          {/* The pill strip in Admin runs four wide. One pill stretched across
              a phone would read as a banner rather than as a round, so the
              rest of the row is left as the empty columns it is. */}
          <div style={{ flex: 2 }} />
        </div>
      </StickyTop>

      {/* ── The switch ─────────────────────────────────────────────
          First card, because it is the only thing on this screen anybody in
          the field can see the result of. */}
      <Card style={{ marginBottom: 12 }} pad={10}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: FS.small, fontWeight: 800, color: sc.on ? K.acc : K.t1 }}>
              Scramble round {sc.on ? "on" : "off"}
            </div>
            <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5, marginTop: 3 }}>
              {sc.on
                ? <>Everybody has <strong style={{ color: K.acc }}>{SCRAMBLE_BUTTON}</strong> in the app header. Tapping it opens the team card.</>
                : <>Turning this on puts an <strong style={{ color: K.t2 }}>{SCRAMBLE_BUTTON}</strong> button in the app header for the whole field. It is the only way in to the scramble card.</>}
            </div>
          </div>
          <Toggle on={sc.on} busy={!sc.on && !ready} onChange={toggleOn} label="Scramble round" />
        </div>

        {blockers.length > 0 && (
          <div style={{
            marginTop: 10, padding: "7px 10px", borderRadius: R.sm,
            background: (ready ? K.warn : K.danger) + ALPHA.wash,
            border: `1px solid ${ready ? K.warn : K.danger}${ALPHA.line}`,
          }}>
            {blockers.map(line => (
              <div key={line} style={{ fontSize: FS.label, fontWeight: 600, lineHeight: 1.5, color: ready ? K.warn : K.danger }}>
                {line}
              </div>
            ))}
          </div>
        )}

        {sc.on && onOpenScoring && (
          <Btn block size="sm" variant="secondary" style={{ marginTop: 10 }} onClick={onOpenScoring}>
            Open the scramble card →
          </Btn>
        )}
      </Card>

      {/* ── The course ─────────────────────────────────────────────
          Picked from the courses this edition already holds, not searched for.
          Adding a course to the tournament is Admin → Rounds' job and it is a
          different, much larger control (the API search, the tee boxes, the
          hole-by-hole editor); a second copy of it here would be a second
          place courses come from. */}
      <div ref={courseCard}>
        <SectionLabel>Course</SectionLabel>
        <Card style={{ marginBottom: 12 }} pad={10}>
          {courses.length === 0 ? (
            <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5 }}>
              No courses on this tournament yet. Add one in Admin → Rounds and it will show up here.
            </div>
          ) : (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {courses.map(c => {
                const on = c.id === sc.courseId;
                return (
                  <button key={c.id} onClick={() => onUpdate({ courseId: on ? null : c.id })} style={{
                    padding: "7px 8px", borderRadius: R.sm, cursor: "pointer", textAlign: "left",
                    background: on ? K.acc + ALPHA.tint : K.hover,
                    border: `1.5px solid ${on ? K.acc : K.bdr}`,
                    color: on ? K.acc : K.t1,
                    transition: `background ${MOTION}`,
                  }}>
                    <div style={{ fontSize: FS.label, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={{ fontSize: FS.micro, color: on ? K.acc : K.t3, marginTop: 2 }}>Par {c.par || (c.hole_pars || []).reduce((a, b) => a + b, 0) || "—"}</div>
                  </button>
                );
              })}
            </div>
            {scored && (
              <div style={{ marginTop: 8, fontSize: FS.label, fontWeight: 600, color: K.warn, lineHeight: 1.5 }}>
                Cards have been started. Changing the course now re-reads every hole&apos;s par under scores posted against the old one.
              </div>
            )}
          </>)}
        </Card>
      </div>

      {/* ── The teams ──────────────────────────────────────────────
          The pairings editor's gesture, three slots instead of four groups and
          no cap on how many go in one: a scramble team is however many the
          director puts on it. */}
      <SectionLabel>Teams</SectionLabel>
      <Card style={{ marginBottom: 8 }} pad={10}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: FS.micro, color: K.t3, fontWeight: 600 }}>
            {selected ? `Tap a team to add ${nameOf(selected)}` : "Tap a player, then tap a team"}
          </span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <span onClick={() => setTeams(autoSplit(players))} style={{
              fontSize: FS.micro, fontWeight: 700, cursor: "pointer", padding: "2px 7px",
              borderRadius: R.xs, color: K.acc, border: `1px solid ${K.acc}${ALPHA.hair}`,
            }}>Auto-split</span>
            {manned > 0 && (
              <span onClick={() => setTeams(emptyTeams())} style={{
                fontSize: FS.micro, fontWeight: 700, cursor: "pointer", padding: "2px 7px",
                borderRadius: R.xs, color: K.danger, border: `1px solid ${K.danger}${ALPHA.hair}`,
              }}>Clear</span>
            )}
          </div>
        </div>

        {players.length === 0 ? (
          <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.5 }}>No players on this tournament yet.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
            {players.map(p => {
              const isSel = selected === p.id;
              const placed = !pool.has(p.id);
              return (
                <button key={p.id} onClick={() => tapPlayer(p.id)} style={{
                  padding: "6px", borderRadius: R.sm, cursor: "pointer", textAlign: "left",
                  background: isSel ? K.acc + ALPHA.tint : K.hover,
                  border: `1.5px solid ${isSel ? K.acc : K.bdr}`,
                  color: isSel ? K.acc : K.t1,
                  opacity: placed && !isSel ? DIM_PLACED : 1,
                  transition: `opacity ${MOTION}`,
                }}>
                  <div style={{ fontSize: FS.label, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {shortName(p)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {SCRAMBLE_TEAMS.map(t => {
        const roster = teamPlayers(sc.teams, t.key, players);
        const canDrop = !!selected && !sc.teams[t.key].includes(selected);
        const line = teamLine(sc.scores[t.key], holePars);
        return (
          <div key={t.key} onClick={() => { if (canDrop) tapTeam(t.key); }} style={{
            background: K.card, borderRadius: R.lg, marginBottom: 8, padding: 10,
            border: `1.5px solid ${canDrop ? K.acc : K.bdr}`,
            cursor: canDrop ? "pointer" : "default",
            transition: `border-color ${MOTION}`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: roster.length > 0 ? 6 : 0 }}>
              <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc }}>
                {t.label} <span style={{ fontWeight: 400, color: K.t3, fontSize: FS.micro }}>({roster.length})</span>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* A team that has started carries its card here, because the
                    director editing rosters is the one person who needs to see
                    that taking a man off a team is happening mid-round. */}
                {line.thru > 0 && (
                  <span style={{ fontSize: FS.micro, color: K.t3, fontWeight: 600 }}>
                    Thru {line.thru} · <span style={{ color: line.toPar < 0 ? K.under : K.t2, fontWeight: 700 }}>{fmtPar(line.toPar)}</span>
                  </span>
                )}
                {canDrop && <span style={{ fontSize: FS.micro, color: K.acc, fontWeight: 600 }}>Tap to add {nameOf(selected)}</span>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 4 }}>
              {roster.map(p => (
                <button key={p.id} onClick={e => { e.stopPropagation(); setTeams(assignToTeam(sc.teams, p.id, null)); }} style={{
                  padding: "6px 12px 6px 6px", borderRadius: R.sm, textAlign: "left", cursor: "pointer",
                  position: "relative", background: K.hover, border: `1.5px solid ${K.bdr}`, color: K.t1,
                }}>
                  <span aria-hidden="true" style={{
                    position: "absolute", top: 1, right: 3, color: K.t3, fontSize: FS.micro, lineHeight: 1,
                  }}>✕</span>
                  <div style={{ fontSize: FS.label, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {shortName(p)}
                  </div>
                </button>
              ))}
              {roster.length === 0 && (
                <div onClick={e => { e.stopPropagation(); if (selected) tapTeam(t.key); }} style={{
                  gridColumn: "1 / -1", borderRadius: R.sm,
                  border: `1.5px dashed ${canDrop ? K.acc + ALPHA.line : K.bdr}`,
                  minHeight: 38, display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: canDrop ? "pointer" : "default",
                }}>
                  <span style={{ fontSize: FS.body, color: canDrop ? K.acc + ALPHA.line : K.t3 + ALPHA.hair, fontWeight: 300 }}>+</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ScrambleSetup;
