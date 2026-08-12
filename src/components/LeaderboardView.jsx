// ══════════════════════════════════════════════════════════════════
//  LeaderboardView — the board, and the scorecard behind each row.
// ══════════════════════════════════════════════════════════════════
//
// The screen the app opens on, and the one a spectator on a couch is looking
// at. A row per player, ranked, with the round columns beside it; tapping one
// opens that player's card for whichever round they want.
//
// The ranking is not here. lib/individualBoard computes and orders the board,
// and it is deliberately the same code the `leaderboard` pairing mode draws
// its order from — see that module's header for why the standings players read
// and the order the draw is taken from must be one number, not two.
//
// What is here is the layout, and the layout has one hard problem worth
// knowing about before touching it: the columns are MEASURED, not guessed, so
// Total lands under the trophy behind it. That is a read-then-restyle, which
// is why it runs in useLayoutEffect — in useEffect the browser paints the
// guessed width first and the real one a frame later, and the whole player
// column visibly jumps on every mount.
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { K, FS, fsStep, R, ALPHA, MOTION } from "../theme";
import { Popup } from "./Popup";
import { LB_COL, LB_PAD_L, WBC_TROPHY, WBC_TROPHY_SILHOUETTE } from "../constants";
import { NUM_ROUNDS } from "../lib/rounds";
import { fmtPar } from "../lib/format";
import { courseHandicapFor, buildStrokesMap, WD_SCORE } from "../lib/individualBoard";
import { teeTimesByPlayer, roundInPlay, thruStatus } from "../lib/thruStatus";

export function LeaderboardView({ lb, round, holeData, tRounds, courses, tPlayers, getPlayerTee, getPlayerCH = () => null, finalizedRounds, skinWins, pairingsData, teeTimesData, loaded = true }) {
  const [expanded, setExpanded] = useState(null);
  const [scorecardRound, setScorecardRound] = useState(null);
  const [showGross, setShowGross] = useState(false);
  const [showToPar, setShowToPar] = useState(true);
  // Reset to Net + To-Par whenever leaderboard mounts
  useEffect(() => { setShowGross(false); setShowToPar(true); }, []);
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const [rowStyle, setRowStyle] = useState({ padding: "6px 12px", fontSize: FS.small });
  const [rowMinH, setRowMinH] = useState(0);

  // Compute player column width to center Total, and align trophy to match.
  //
  // useLayoutEffect, not useEffect: this MEASURES the container and then
  // restyles from the measurement. useEffect runs after the browser has
  // painted, so the "auto" width below was painted first and the real width
  // one frame later — the player column visibly jumped from ~39px to ~122px
  // on every mount, which is what the pull-to-refresh flash was. Laying out
  // synchronously before paint means the wrong layout is never shown.
  const [playerColW, setPlayerColW] = useState("auto");
  useLayoutEffect(() => {
    const align = () => {
      if (!containerRef.current) return;
      // offsetWidth counts the board's own 1px border on each side; inside it
      // the rows are padded on the left only, and run to the board's inner edge
      // on the right.
      const containerW = containerRef.current.offsetWidth;
      const innerW = containerW - 2;          // inside the board's border
      const gridW = innerW - LB_PAD_L;        // the row's content box
      // Total's centre sits at padL + num + playerW + total/2 from the board's
      // inner edge, and the board is centred in the viewport — so putting that
      // at the board's own midpoint puts it under the trophy behind it. The
      // padding is one-sided now, so it has to be in this sum rather than
      // cancelling out of it.
      const centred = innerW / 2 - LB_PAD_L - LB_COL.num - LB_COL.total / 2;
      // On a narrow phone the fixed columns want more than half the width, and
      // honouring the centring would squeeze the round columns below the width
      // a "+11" needs. So centred is a CEILING, not a rule: the player column
      // gives way first, and Total drifts off the trophy rather than the round
      // columns becoming unreadable.
      const fixed = LB_COL.num + LB_COL.total + LB_COL.thru + LB_COL.priorMin * NUM_ROUNDS;
      const playerW = Math.max(60, Math.min(centred, gridW - fixed));
      setPlayerColW(`${Math.floor(playerW)}px`);
    };
    align();
    const t = setTimeout(align, 150);
    window.addEventListener("resize", align);
    return () => { clearTimeout(t); window.removeEventListener("resize", align); };
  }, [lb.length]);

  // Track previous positions for movement arrows
  const prevPositions = useRef({});
  const [movements, setMovements] = useState({});
  useEffect(() => {
    const newMov = {};
    lb.forEach((p, idx) => {
      const prev = prevPositions.current[p.id];
      if (prev != null && prev !== idx) newMov[p.id] = prev > idx ? "up" : "down";
    });
    setMovements(newMov);
    const newPos = {};
    lb.forEach((p, idx) => { newPos[p.id] = idx; });
    prevPositions.current = newPos;
  }, [lb.map(p => p.id).join(",")]);

  // Row styles handled via CSS flex — rowStyle kept for font size only.
  // useLayoutEffect for the same reason as the column measurement above: this
  // reads the rendered height and rewrites the row font size and padding from
  // it, so running it after paint shows one frame at the pre-measurement size.
  useLayoutEffect(() => {
    const calc = () => {
      if (!containerRef.current || !headerRef.current || lb.length === 0) return;
      // Use the container's own bounding rect — it already lives inside the padded content area
      const containerRect = containerRef.current.getBoundingClientRect();
      const headerH = headerRef.current.offsetHeight;
      // Available = space from bottom of grid header to bottom of container
      const available = containerRect.height - headerH;
      const perRow = Math.floor(available / lb.length);
      const clampedPerRow = Math.min(perRow, 36);
      // The rung the whole row is built from: the name and Total sit one above
      // it, Thru and the round columns one below. A full field on a short
      // screen drops the lot back a rung rather than clipping.
      //
      // A rung lower than it looks like it should be, because px type is not
      // px on a phone. Android's system font-size setting multiplies every
      // font-size in the WebView — but not the column widths beside them, which
      // are layout and stay put. So the board has to be drawn small enough that
      // it still fits AFTER the user's own setting has stretched it. Measured
      // against the real roster in uppercase: built on FS.body the names began
      // clipping at 1.15x on a 360 phone, which is the first notch a lot of
      // people are already on. Built on FS.small they survive that everywhere
      // and 1.3x on a 390.
      const fSize = clampedPerRow >= 26 ? FS.small : FS.label;
      // Same object identity when the numbers have not moved, so the delayed
      // re-measure below is free unless it actually found a different layout.
      setRowStyle(prev => (prev.fontSize === fSize && prev.lineHeight === 1 && prev.padding === undefined)
        ? prev : { fontSize: fSize, lineHeight: 1 });
      setRowMinH(perRow);
    };
    calc();
    const t = setTimeout(calc, 100);
    window.addEventListener("resize", calc);
    return () => { clearTimeout(t); window.removeEventListener("resize", calc); };
  }, [lb.length]);

  // What the Thru column is counting right now — see lib/thruStatus. The round
  // is "in play" from the first score anyone posts until the director
  // finalizes, and for that whole stretch the column is about TODAY: holes into
  // this round for anyone who has teed off, the group's tee time for anyone who
  // hasn't. Outside it, the tournament total.
  const inPlay = roundInPlay(lb, round, finalizedRounds[round]);
  // The board stops being a running total and becomes a RESULT the moment the
  // director finalizes the last round. Nothing else marks the end of a
  // tournament — scores can still be corrected up to that point.
  const tournamentOver = !!finalizedRounds[NUM_ROUNDS];
  const teeTimes = useMemo(
    () => teeTimesByPlayer((pairingsData || {})[round], (teeTimesData || {})[round]),
    [pairingsData, teeTimesData, round],
  );

  const renderScorecard = (p) => {
    const tp = tPlayers.find(t => t.player_id === p.id);
    const hi = parseFloat(tp?.handicap_index) || 0;
    // Find rounds with scores
    const availRounds = [];
    for (let r = 1; r <= NUM_ROUNDS; r++) {
      const tr = tRounds.find(t => t.round_number === r);
      if (!tr) continue;
      const course = courses.find(c => c.id === tr.course_id);
      if (!course) continue;
      const key = `${p.id}_${r}`;
      const scores = holeData[key] || {};
      if (Object.keys(scores).length === 0) continue;
      availRounds.push(r);
    }
    if (availRounds.length === 0) return <div style={{ padding: 12, fontSize: FS.small, color: K.t2 }}>No scores yet</div>;

    const viewRound = scorecardRound && availRounds.includes(scorecardRound) ? scorecardRound : availRounds[availRounds.length - 1];
    const tr = tRounds.find(t => t.round_number === viewRound);
    const course = courses.find(c => c.id === tr.course_id);
    const key = `${p.id}_${viewRound}`;
    const scores = holeData[key] || {};
    const holePars = course.hole_pars || [];
    const holeHcps = course.hole_handicaps || [];
    const tee = getPlayerTee(viewRound, p.id, course);
    // Same two shared functions the board itself ranks on — this card used to
    // derive the handicap without consulting the recorded one, and re-roll the
    // stroke allocation by hand, so an imported year could print a scorecard
    // whose net did not add up to the total on the row that opened it.
    const ch = courseHandicapFor({
      handicapIndex: hi,
      course,
      tee,
      recorded: getPlayerCH(viewRound, p.id),
    });
    const strokeMap = buildStrokesMap(ch, holeHcps);
    const frontPar = holePars.slice(0,9).reduce((a,b)=>a+b,0);
    const backPar = holePars.slice(9).reduce((a,b)=>a+b,0);
    let frontGross = 0, backGross = 0, frontNet = 0, backNet = 0;
    for (let h = 0; h < 18; h++) {
      const g = scores[h];
      // A withdrawal fills its remaining holes with the sentinel so the card
      // stays structurally complete; totalling those would print a gross in
      // the hundreds. Same exclusion computeRoundLine makes.
      if (!(g > 0) || g === WD_SCORE) continue;
      // A plus handicap gives strokes BACK, so the sign travels with the map —
      // buildStrokesMap allocates by magnitude and leaves it to the caller.
      const st = (strokeMap[h] || 0) * (ch < 0 ? -1 : 1);
      if (h < 9) { frontGross += g; frontNet += (g - st); } else { backGross += g; backNet += (g - st); }
    }
    const rc = { r: viewRound, course, holePars, scores, strokeMap, ch, frontPar, backPar, frontGross, backGross, frontNet, backNet, tee };

    const totalGross = rc.frontGross + rc.backGross;
    const totalNet = rc.frontNet + rc.backNet;
    const totalPar = rc.frontPar + rc.backPar;
    const netToPar = totalNet - totalPar;

    return (
      <div style={{ padding: "8px 10px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {availRounds.length > 1 ? (
              <select value={viewRound} onChange={e => setScorecardRound(parseInt(e.target.value))} onClick={e => e.stopPropagation()} style={{
                background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.xs, color: K.acc, fontSize: FS.label, fontWeight: 700, padding: "2px 4px", cursor: "pointer",
              }}>
                {availRounds.map(r => {
                  const c = courses.find(cs => cs.id === tRounds.find(t => t.round_number === r)?.course_id);
                  return <option key={r} value={r}>Rd {r}: {c?.name || "—"}</option>;
                })}
              </select>
            ) : (
              <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc }}>Rd {rc.r}: {rc.course.name}</span>
            )}
            <span style={{ fontSize: FS.micro, color: K.t2 }}>CH {rc.ch}</span>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: FS.label }}>
            <span style={{ color: K.t2 }}>Gross <strong style={{ color: K.t1 }}>{totalGross || "—"}</strong></span>
            <span style={{ color: K.t2 }}>Net <strong style={{ color: netToPar < 0 ? K.under : K.t1 }}>{totalNet || "—"}</strong></span>
          </div>
        </div>
            {[["Front", 0, 9, rc.frontPar, rc.frontGross], ["Back", 9, 9, rc.backPar, rc.backGross]].map(([label, start, count, parT, grossT]) => (
              <div key={label} style={{ marginBottom: 4 }}>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 1, fontSize: FS.micro }}>
                  <div style={{ color: K.t2, fontWeight: 600, padding: "2px 0" }}></div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => (
                    <div key={h} style={{ textAlign: "center", color: K.t2, fontWeight: 600, padding: "2px 0" }}>{h+1}</div>
                  ))}
                  <div style={{ textAlign: "center", color: K.t2, fontWeight: 700 }}></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 1, fontSize: FS.micro }}>
                  <div style={{ color: K.t2, padding: "2px 0", fontSize: FS.micro }}>Par</div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => (
                    <div key={h} style={{ textAlign: "center", color: K.t2, padding: "2px 0" }}>{rc.holePars[h]}</div>
                  ))}
                  <div style={{ textAlign: "center", color: K.t2, fontWeight: 700 }}>{parT}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `28px repeat(${count}, 1fr) 32px`, gap: 1 }}>
                  <div style={{ color: K.t2, padding: "3px 0", fontSize: FS.micro, fontWeight: 600 }}>Scr</div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => {
                    const s = rc.scores[h];
                    const d = s ? s - rc.holePars[h] : null;
                    const st = rc.strokeMap[h] || 0;
                    const isSkin = skinWins[`${rc.r}_${h}`] === p.id;
                    const clr = isSkin ? K.gold : K.t2;
                    return (
                      <div key={h} style={{
                        textAlign: "center", fontSize: FS.label, fontWeight: 700, padding: "1px 0",
                        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
                        height: 22,
                      }}>
                        {s && d !== 0 && d != null && (
                          <div style={{ position: "absolute", width: 20, height: 20, left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
                            <div style={{ position: "absolute", inset: 0, borderRadius: d < 0 ? "50%" : R.xs, border: `1.5px solid ${clr}` }} />
                            {(d <= -2 || d >= 2) && <div style={{ position: "absolute", inset: 3, borderRadius: d < 0 ? "50%" : R.xs, border: `1px solid ${clr}` }} />}
                          </div>
                        )}
                        <span style={{ position: "relative", zIndex: 1, color: isSkin ? K.gold : K.t2 }}>
                          {s || "·"}
                          {st > 0 && <span style={{ position: "absolute", top: -1, left: "100%", display: "flex", gap: 1, paddingLeft: 1 }}>
                            {Array.from({length: st}).map((_, i) => <span key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: K.acc, display: "block" }} />)}
                          </span>}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{ textAlign: "center", fontSize: FS.small, fontWeight: 800, color: K.t2, display: "flex", alignItems: "center", justifyContent: "center", height: 22 }}>{grossT || ""}</div>
                </div>
              </div>
            ))}
      </div>
    );
  };

  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Giant trophy silhouette behind entire leaderboard — fixed so it never shifts */}
      <img src={WBC_TROPHY_SILHOUETTE} alt="" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 480, height: "100vh",
        maxWidth: "100vw",
        opacity: 0.08,
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 0,
        objectFit: "contain",
      }} />
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Title inline with stacked pills */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10, gap: 8 }}>
        {/* Left pill — Net/Gross */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <div onClick={() => setShowGross(g => !g)} style={{
            display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
            background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1,
          }}>
            {/* The unselected label was t3 held back to 53% — under 2:1 on
                this background, so the option you were NOT on was the one you
                could not read. Off is plain t3 and on is t1: the same on/off
                gap, both legible. */}
            {[["Net", false], ["Gross", true]].map(([label, val]) => (
              <span key={label} style={{
                fontSize: FS.micro, fontWeight: 600, padding: "2px 0", borderRadius: R.xl,
                width: 30, textAlign: "center",
                background: showGross === val ? K.t3 + ALPHA.hair : "transparent",
                color: showGross === val ? K.t1 : K.t3,
                transition: `background ${MOTION}, color ${MOTION}`,
              }}>{label}</span>
            ))}
          </div>
        </div>
        {/* Center — title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.title, margin: 0, fontWeight: 800 }}>Leaderboard</h2>
          {(() => {
            // No FINAL badge beside the title: the trophy on position 1 says
            // the tournament is decided, and saying it twice on one screen
            // only competes with itself.
            //
            // The round still has to be UNfinalized for LIVE, which is what
            // the badge used to establish by returning before this line. A
            // finalized round can still hold a card that stops short — a
            // withdrawal, a group that signed at 14 — and a partial card in a
            // closed round is not play in progress.
            const live = !finalizedRounds[round]
              && lb.some(p => !p.isWD && p.rds?.[round - 1]?.thru > 0 && p.rds[round - 1].thru < 18);
            if (!live) return null;
            return (
              <>
                <style>{`@keyframes wbcLivePulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: R.md, background: K.danger + ALPHA.wash, border: "1px solid #ef444440" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: K.danger, animation: "wbcLivePulse 1.5s ease-in-out infinite" }} />
                  <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.danger, letterSpacing: ".08em" }}>LIVE</span>
                </span>
              </>
            );
          })()}
        </div>
        {/* Right pill — Par/Total */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div onClick={() => setShowToPar(v => !v)} style={{
            display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
            background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1,
          }}>
            {[["Par", true], ["Total", false]].map(([label, val]) => (
              <span key={label} style={{
                fontSize: FS.micro, fontWeight: 600, padding: "2px 0", borderRadius: R.xl,
                width: 30, textAlign: "center",
                background: showToPar === val ? K.t3 + ALPHA.hair : "transparent",
                color: showToPar === val ? K.t1 : K.t3,
                transition: `background ${MOTION}, color ${MOTION}`,
              }}>{label}</span>
            ))}
          </div>
        </div>
      </div>
      <div ref={containerRef} style={{ background: "transparent", borderRadius: R.lg, border: `1px solid ${K.bdr}`, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Build dynamic grid: #, Player, Total, Thru, then one equal track per round */}
        {(() => {
          const allPriorRounds = Array.from({ length: NUM_ROUNDS }, (_, i) => i + 1);
          // Four EQUAL tracks filling everything left over, instead of four
          // fixed ones with a flexible gap in front. The gap column made R1's
          // cell — the space between the band's edge and the first rule — the
          // width of a round plus the gap, and the row's right padding did the
          // same for R4 against the board's edge. On a 390 phone that read as
          // 100 / 55 / 56 / 83 against tracks that were all exactly 24: the
          // arithmetic was even and the board was not.
          const gridCols = `${LB_COL.num}px ${playerColW} ${LB_COL.total}px ${LB_COL.thru}px${allPriorRounds.map(() => " 1fr").join("")}`;
          const gridStyle = { display: "grid", gridTemplateColumns: gridCols, alignItems: "center" };
          // Total and Thru are drawn as one band running the whole height of
          // the board rather than as numbers sitting loose in each row. Every
          // row paints its own slice — full-bleed top to bottom — and the
          // slices stack into one continuous block, so where a player stands
          // and how far in they are read together, boxed off from the
          // round-by-round detail either side. The hairline is on the OUTER
          // edge of each end only: a rule between Total and Thru would split
          // the band back into two columns, which is what it exists to undo.
          // Inset shadows rather than borders for the same reason the round
          // columns use them — a border is width, and Total is the column the
          // whole board is aligned to. Drawn as a border it pushed its own
          // number half a pixel off the trophy behind it.
          const bandStart = {
            alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center",
            background: K.t3 + ALPHA.wash, boxShadow: `inset 1px 0 0 ${K.bdr}`,
          };
          const bandEnd = { ...bandStart, boxShadow: `inset -1px 0 0 ${K.bdr}` };
          // Ruling between the round columns, so four numbers in a row read as
          // four rounds rather than one string of digits. Full-strength K.bdr,
          // the same rule the card edge and the header divider are drawn in:
          // held back to a third of that it computed to 1.08:1 against the
          // background, which is a line that exists in the stylesheet and not
          // on the screen. The band still leads on its background tint rather
          // than on having a heavier edge. None on R1 — its left edge is
          // already the gap.
          //
          // Drawn as an inset shadow rather than a border because a border is
          // LAYOUT. Under border-box it ate a pixel off the left of every cell
          // that had one, which R1 did not — so R1 centred its number in 24px
          // while R2-R4 centred theirs in 23px starting a pixel over, and the
          // four columns came out spaced 24.5, 24, 24. The same pixel pushed
          // every number half a pixel right of its own track, giving each cell
          // 12.5 of air on one side of its value and 11.5 on the other. A
          // shadow paints the identical line and costs no width, so all four
          // tracks are the same box and the numbers sit dead centre in them.
          const roundCell = (i) => ({
            alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: i === 0 ? undefined : `inset 1px 0 0 ${K.bdr}`,
          });
          return (
            <>
              {/* The one row that does NOT step up with the rest of the board.
                  These are eyebrows, not data, and "STROKES" already fills the
                  Total column at micro — a rung up and it spills over the band
                  it is supposed to cap. */}
              <div ref={headerRef} style={{ ...gridStyle, padding: `7px 0 7px ${LB_PAD_L}px`, fontSize: FS.micro, fontWeight: 600, color: K.t2, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${K.bdr}` }}>
                <span>#</span>
                <span>Player</span>
                {/* Negative margin eats the header's own padding so the band
                    starts at the top edge instead of 7px down from it. */}
                {(() => {
                  const label = showGross ? "Gross" : showToPar ? "Total" : "Strokes";
                  // "STROKES" is two letters longer than the other two labels
                  // and fills the column on its own; the eyebrow tracking is
                  // what tips it out over the band's hairline. The long label
                  // goes untracked rather than the column growing for a word
                  // only one of the three toggle states ever shows.
                  return <span style={{ ...bandStart, margin: "-7px 0", padding: "7px 0", fontWeight: 700, color: K.t2, letterSpacing: label.length > 5 ? 0 : undefined }}>{label}</span>;
                })()}
                <span style={{ ...bandEnd, margin: "-7px 0", padding: "7px 0", fontWeight: 700, color: K.t2 }}>Thru</span>
                {allPriorRounds.map((r, i) => <span key={r} style={{ ...roundCell(i), margin: "-7px 0", padding: "7px 0" }}>R{r}</span>)}
              </div>
              {/* Only once the round data is actually in. An empty `lb` also means
                  "Firestore has not answered yet", and reporting that as "no scores"
                  flashed the message up on every reload before the board arrived. */}
              {lb.length === 0 && (loaded
                ? <div style={{ padding: 24, textAlign: "center", color: K.t2, fontSize: FS.small }}>No scores yet — be the first!</div>
                : <div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: FS.small, opacity: 0.5 }}>&nbsp;</div>)}
              <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: expanded ? "auto" : "hidden" }}>
              {(() => {
                // Pre-compute tied positions
                const posMap = {};
                let i = 0;
                while (i < lb.length) {
                  if (lb[i].roundsPlayed === 0) { posMap[lb[i].id] = i + 1; i++; continue; }
                  let j = i + 1;
                  while (j < lb.length && lb[j].roundsPlayed > 0 && lb[j].totalNetToPar === lb[i].totalNetToPar) j++;
                  const tied = j - i > 1;
                  for (let k = i; k < j; k++) posMap[lb[k].id] = tied ? `T${i + 1}` : i + 1;
                  i = j;
                }
                const rows = lb.map((p, idx) => {
                const pos = posMap[p.id] ?? idx + 1;
                const top3 = pos === 1 || pos === "T1";
                // A tie at the top stays a tie: both rows get the trophy rather
                // than the board picking a champion out of sort order, which is
                // a decision the scores have not made.
                const isChampion = tournamentOver && top3 && !p.isWD && p.roundsPlayed > 0;
                const isExpanded = expanded === p.id;
                const mov = movements[p.id];
                const displayTotal = showGross
                  ? (() => {
                      let g = 0;
                      for (let r = 1; r <= NUM_ROUNDS; r++) {
                        const scores = holeData[`${p.id}_${r}`] || {};
                        Object.values(scores).forEach(s => { g += s; });
                      }
                      return g > 0 ? g : null;
                    })()
                  : showToPar
                    ? (p.roundsPlayed > 0 ? p.totalNetToPar : null)
                    : (() => {
                        // Net total strokes across all rounds
                        let netTotal = 0; let hasAny = false;
                        for (let r = 1; r <= NUM_ROUNDS; r++) {
                          const prRd = p.rds[r - 1];
                          if (prRd && !prRd.wd && prRd.netToPar != null) {
                            const tr2 = tRounds.find(t => t.round_number === r);
                            const c2 = tr2 ? courses.find(c => c.id === tr2.course_id) : null;
                            const par2 = c2?.hole_pars?.reduce((a,b) => a+b, 0) || 72;
                            netTotal += prRd.netToPar + par2;
                            hasAny = true;
                          }
                        }
                        return hasAny ? netTotal : null;
                      })();
                return (
                  <div key={p.id} style={{ flex: isExpanded ? "0 0 auto" : 1, minHeight: (expanded && !isExpanded) ? rowMinH : 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div onClick={() => { setExpanded(isExpanded ? null : p.id); setScorecardRound(null); }} style={{ ...gridStyle, padding: `0 0 0 ${LB_PAD_L}px`, minHeight: 28, height: "100%", alignItems: "center", borderBottom: `1px solid ${K.bdr}${ALPHA.wash}`, background: "transparent", cursor: "pointer", fontSize: rowStyle.fontSize, lineHeight: 1 }}>
                      {/* # */}
                      <span style={{ fontWeight: 800, fontSize: rowStyle.fontSize, color: top3 ? K.acc : K.t2, display: "flex", alignItems: "center", gap: 1 }}>
                        {isChampion
                          ? <img src={WBC_TROPHY} alt="Champion" title="Champion" style={{ height: fsStep(rowStyle.fontSize, 2), display: "block" }} />
                          : pos}
                        {/* Stays at micro while the rest of the row steps up:
                            "T12" plus an arrow is what sizes the # column, and
                            a bigger glyph pushes the pair past its width. */}
                        {mov && <span style={{ fontSize: FS.micro, color: mov === "up" ? K.ok : K.danger, lineHeight: 1 }}>{mov === "up" ? "▲" : "▼"}</span>}
                      </span>
                      {/* Player — a rung above the fitted row size. The name is
                          what you scan the board for, and at the row size it
                          was reading as one column of many. */}
                      <div style={{ fontWeight: isChampion ? 800 : 600, color: isChampion ? K.acc : undefined, fontSize: fsStep(rowStyle.fontSize, 1), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 4 }}>
                        {p.name}
                      </div>
                      {/* Total */}
                      {/* Full-strength ink, not the t2 the row's other numbers
                          take: under par still prints red, everything else is
                          the brightest thing in the row. */}
                      <span style={{ ...bandStart, fontWeight: 800, fontSize: fsStep(rowStyle.fontSize, 1), color: p.isWD || displayTotal == null ? K.t2 : (!showGross && showToPar && displayTotal < 0 ? K.under : K.t1) }}>
                        {p.isWD ? <span style={{ fontSize: fsStep(rowStyle.fontSize, -1), color: K.t2, fontWeight: 700 }}>WD</span> : displayTotal != null ? (showGross || !showToPar ? displayTotal : fmtPar(displayTotal)) : "—"}
                      </span>
                      {/* Thru — today's holes while the round is being played,
                          the tournament total once it is finalized. A tee time
                          drops a rung: it is the one value here that isn't a
                          hole count, and it has more characters to fit. */}
                      {(() => {
                        const st = thruStatus({
                          inPlay,
                          roundThru: p.rds[round - 1]?.thru || 0,
                          totalThru: p.totalThru,
                          teeTime: teeTimes[p.id],
                          isWD: p.isWD,
                        });
                        return (
                          <span style={{
                            ...bandEnd,
                            fontSize: fsStep(rowStyle.fontSize, st.kind === "tee" ? -2 : -1),
                            color: K.t2,
                            // The one cell the app-wide caps have to sit out.
                            // teeTimeLabel lowercases the meridiem to make a
                            // time fit this column, and it fits by a third of a
                            // pixel: "10:24a" measures 33.7 against a 34px
                            // track, "10:24A" measures 34.9 and crosses the
                            // band's right-hand rule. Two rungs down is already
                            // as small as this value goes, so the case is the
                            // only thing left to give.
                            textTransform: st.kind === "tee" ? "none" : undefined,
                          }}>
                            {st.text}
                          </span>
                        );
                      })()}
                      {/* Prior rounds — always show all 4 */}
                      {allPriorRounds.map((r, i) => {
                        const prRd = p.rds[r - 1];
                        const isWDRound = prRd?.wd;
                        const prVal = isWDRound ? null : showGross
                          ? (() => { const scores = holeData[`${p.id}_${r}`] || {}; const g = Object.values(scores).filter(s => s !== 99).reduce((a,b) => a+b, 0); return g > 0 ? g : null; })()
                          : showToPar
                            ? prRd?.netToPar
                            : (() => {
                                if (!prRd || prRd.netToPar == null) return null;
                                const tr2 = tRounds.find(t => t.round_number === r);
                                const c2 = tr2 ? courses.find(c => c.id === tr2.course_id) : null;
                                const par2 = c2?.hole_pars?.reduce((a,b) => a+b, 0) || 72;
                                return prRd.netToPar + par2;
                              })();
                        // These carried an opacity on top of an already-dim t3,
                        // which put a played round at under 2:1 against the
                        // background — a number you could see was there without
                        // being able to read it. The ink alone sets them back
                        // now: t2 for a round played, t3 for the dash standing
                        // in for one that wasn't.
                        return (
                          <span key={r} style={{ ...roundCell(i), fontSize: fsStep(rowStyle.fontSize, -1), color: prVal != null && !showGross && showToPar && prVal < 0 ? K.under : isWDRound || prVal == null ? K.t3 : K.t2 }}>
                            {isWDRound ? "WD" : prVal != null ? (showGross || !showToPar ? prVal : fmtPar(prVal)) : "—"}
                          </span>
                        );
                      })}
                    </div>
                    {isExpanded && (
                      <div style={{ borderBottom: `1px solid ${K.bdr}${ALPHA.hair}`, background: K.bg + ALPHA.panel }}>
                        {renderScorecard(p)}
                      </div>
                    )}
                  </div>
                );
              });
                return <>{rows}</>;
              })()}
              </div>
            </>
          );
        })()}
      </div>
      </div>
    </div>
  );
}

// ── NINE CARD ──

// The three taps this app makes — tapScore, tapNudge, tapBigAction — live in
// lib/haptics, imported at the top of this file.

// The scoring screen — and the score row, the hole-state bar and the labels
// that are only ever drawn by it — moved to components/OnCourseScoring.jsx.
// See the header there.

export default LeaderboardView;
