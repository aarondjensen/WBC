// ══════════════════════════════════════════════════════════════════
//  LeaderboardView — the board, and the scorecard behind each row.
// ══════════════════════════════════════════════════════════════════
//
// The screen the app opens on, and the one a spectator on a couch is looking
// at. A row per player, ranked, with the round beside it; tapping one opens
// that player's card for whichever round they want.
//
// The ranking is not here. lib/individualBoard computes and orders the board,
// and it is deliberately the same code the `leaderboard` pairing mode draws
// its order from — see that module's header for why the standings players read
// and the order the draw is taken from must be one number, not two.
//
// What is here is the layout, and it is drawn with NO RULES — no line between
// two columns, none between two rows bar one hairline, no box around anything.
// Alignment holds the columns apart and weight carries the hierarchy. That is
// worth knowing before touching it, because every instinct when a board looks
// crowded is to reach for a divider, and a divider is what this stopped being.
//
// The one measurement left is vertical: the rows are fitted to the height of
// the board so a full field lands on one screen, in a useLayoutEffect, because
// it is a read-then-restyle and running it after paint shows a frame at the
// wrong size.
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { K, FS, fsStep, R, ALPHA, MOTION } from "../theme";
import { Popup } from "./Popup";
import { ScoreCell } from "./ScoreCell";
import { LB_COL, LB_PAD_L, WBC_TROPHY, WBC_TROPHY_SILHOUETTE } from "../constants";
import { NUM_ROUNDS } from "../lib/rounds";
import { fmtPar } from "../lib/format";
import { courseHandicapFor, buildStrokesMap, WD_SCORE } from "../lib/individualBoard";
import { scoreCellMetrics } from "../lib/scoreMarks";
import { teeTimesByPlayer, roundInPlay, thruStatus } from "../lib/thruStatus";

// ── Toggle ─────────────────────────────────────────────────────────
// The board's segmented pill: two labels, one of them on. Every control on
// this screen is one of these, and they were three hand-copied versions of the
// same twelve lines.
//
// `options` is [label, value] pairs and `value` is whichever is showing, so a
// toggle carries no state of its own — the board holds it, which is what lets
// the round pill relabel itself as the round moves.
function Toggle({ options, value, onPick }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
      background: K.bdr + ALPHA.tint, borderRadius: R.pill, padding: "2px 3px", gap: 1,
    }} onClick={() => onPick(v => !v)}>
      {options.map(([label, val]) => (
        // The unselected label was t3 held back to 53% — under 2:1 on this
        // background, so the option you were NOT on was the one you could not
        // read. Off is plain t3 and on is t1: the same on/off gap, both
        // legible.
        <span key={label} style={{
          fontSize: FS.micro, fontWeight: 600, padding: "2px 0", borderRadius: R.xl,
          width: 30, textAlign: "center",
          background: value === val ? K.t3 + ALPHA.hair : "transparent",
          color: value === val ? K.t1 : K.t3,
          transition: `background ${MOTION}, color ${MOTION}`,
        }}>{label}</span>
      ))}
    </div>
  );
}

export function LeaderboardView({ lb, round, holeData, tRounds, courses, tPlayers, getPlayerTee, getPlayerCH = () => null, finalizedRounds, skinWins, pairingsData, teeTimesData, loaded = true }) {
  const [expanded, setExpanded] = useState(null);
  const [scorecardRound, setScorecardRound] = useState(null);
  const [showGross, setShowGross] = useState(false);
  const [showToPar, setShowToPar] = useState(true);
  // ── One round, or all of them ──
  // The board carried a column per round at all times, which on a phone meant
  // five numbers sharing the ~170px left after the name, and Total and Thru —
  // the two anybody actually reads — squeezed to make room for three columns of
  // history that are mostly dashes until Saturday. One round shows by default
  // and the rest are a tap away.
  //
  // The round it shows is the round the board is ABOUT: the last one anybody
  // has posted a score in. That is the same round Thru is counting, so the two
  // columns beside each other agree — "thru 14, four under today" — and the
  // morning of round 2 still shows round 1 rather than a fresh column of
  // nothing.
  const [showAllRounds, setShowAllRounds] = useState(false);
  // The board stops being a running total and becomes a RESULT the moment the
  // director finalizes the last round. Nothing else marks the end of a
  // tournament — scores can still be corrected up to that point.
  const tournamentOver = !!finalizedRounds[NUM_ROUNDS];
  // Reset to Net + To-Par whenever leaderboard mounts — and to the whole week
  // once there is a whole week to show. "R4 only" is the wrong summary of a
  // finished tournament; by then the history IS the story, and the four
  // columns have no live round to compete with.
  useEffect(() => { setShowGross(false); setShowToPar(true); setShowAllRounds(tournamentOver); }, [tournamentOver]);
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const rowsRef = useRef(null);
  const expandedRef = useRef(null);
  const [rowStyle, setRowStyle] = useState({ padding: "6px 12px", fontSize: FS.small });
  const [rowH, setRowH] = useState(0);

  // The player column used to be MEASURED, so that Total landed dead centre of
  // the board and therefore under the trophy watermark behind it. That whole
  // apparatus is gone with the band it served: Total is right-aligned in a
  // fixed column now, on an edge shared with every other number in the stack,
  // and the name simply takes whatever is left. A column that fills the space
  // needs no arithmetic to find its width — and the pull-to-refresh flash the
  // measurement had to run in useLayoutEffect to avoid cannot happen to a
  // layout that is never computed in the first place.

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

  // Every row is MEASURED to one height and then held there, rather than each
  // row flexing to fill what is left. The rows divide the board's height evenly
  // the same way either way — but a flexed row is a row whose height is a
  // function of its neighbours, so opening one player's card re-laid out the
  // whole board around it: the tapped row lost the air it was centred in and
  // every other row resized under the scroll. A fixed height means expanding is
  // what it looks like — the card grows underneath the row and pushes the rows
  // below it down, and nothing above it moves at all.
  //
  // useLayoutEffect for the same reason as the column measurement above: this
  // reads the rendered height and rewrites the row height and font size from
  // it, so running it after paint shows one frame at the pre-measurement size.
  useLayoutEffect(() => {
    const calc = () => {
      if (!containerRef.current || !headerRef.current || lb.length === 0) return;
      // Use the container's own bounding rect — it already lives inside the padded content area
      const containerRect = containerRef.current.getBoundingClientRect();
      const headerH = headerRef.current.offsetHeight;
      // The rows box itself, once it exists: it is what the rows actually have
      // to divide, and unlike the container it does not count the board's own
      // border. It is a flex child with basis 0 and its overflow is not
      // visible, so its height is the space left over and never its content —
      // which is what makes it safe to measure while a card is open.
      // Container-minus-header is the same number a pixel or two out, for the
      // first pass before the box is on the page.
      const available = rowsRef.current?.clientHeight || (containerRect.height - headerH);
      // Two decimals rather than whole pixels: the rows are meant to fill the
      // board exactly, and rounding each one up is how a board with a full
      // field ends up a scroll tall with nothing to scroll to.
      const perRow = Math.floor((available / lb.length) * 100) / 100;
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
      // 28 is the floor a row is still readable at. Past that the board is
      // taller than the box and scrolls, which it has to be allowed to do —
      // the alternative is the bottom of the field being clipped off.
      setRowH(Math.max(28, perRow));
    };
    calc();
    const t = setTimeout(calc, 100);
    window.addEventListener("resize", calc);
    return () => { clearTimeout(t); window.removeEventListener("resize", calc); };
  }, [lb.length]);

  // Open a card on the bottom row of a full board and the card itself is below
  // the fold — the row you tapped is all you see happen. So once it has grown,
  // bring it up far enough to read, and no further: the row that was tapped
  // stays where the finger left it if the whole card cannot fit.
  //
  // Scrolls the rows box by hand rather than scrollIntoView, which walks up and
  // scrolls every ancestor it finds — on this screen that is the page behind
  // the board.
  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => {
      const el = expandedRef.current, box = rowsRef.current;
      if (!el || !box) return;
      const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      const below = r.bottom - b.bottom;
      if (below <= 0) return;
      box.scrollTo?.({ top: box.scrollTop + Math.min(below, r.top - b.top), behavior: "smooth" });
    }, 220);
    return () => clearTimeout(t);
  }, [expanded, scorecardRound]);

  // What the Thru column is counting right now — see lib/thruStatus. The round
  // is "in play" from the first score anyone posts until the director
  // finalizes, and for that whole stretch the column is about TODAY: holes into
  // this round for anyone who has teed off, the group's tee time for anyone who
  // hasn't. Outside it, the tournament total.
  const inPlay = roundInPlay(lb, round, finalizedRounds[round]);
  // The round the single round column shows — see the note on showAllRounds.
  // Counted DOWN from the last round so that a round somebody has started
  // always wins over one they have not, and falling back to the app's own
  // current round for a board where nobody has posted anything at all.
  const shownRound = useMemo(() => {
    for (let r = NUM_ROUNDS; r >= 1; r--) {
      const played = lb.some(p => {
        const rd = p?.rds?.[r - 1];
        return rd && (rd.netToPar != null || (rd.thru || 0) > 0 || rd.wd);
      });
      if (played) return r;
    }
    return round;
  }, [lb, round]);
  const teeTimes = useMemo(
    () => teeTimesByPlayer((pairingsData || {})[round], (teeTimesData || {})[round]),
    [pairingsData, teeTimesData, round],
  );

  // ── The card's two rule weights ──
  // The same pair the betting card is ruled in, and the same job: a hairline
  // between the holes inside a nine, so a column can be followed down from its
  // number to what was shot on it; `edge` around the nine and down the side of
  // the totals, which are not a hole and should not read as one.
  //
  // Both at full-strength K.bdr, which is the same call the board's own round
  // columns make a few lines down and for the same reason: this card is drawn
  // on the near-black panel behind the board rather than on the betting tab's
  // lighter card, and a rule held back to a fifth of the border colour on THIS
  // ground computes to about 1.05:1 — a line that exists in the stylesheet and
  // not on the screen. The nine holes lead on the wash behind their heads
  // rather than on a heavier rule.
  const cardHair = K.bdr;
  const cardEdge = `1px solid ${K.bdr}`;
  // First hole of the nine takes no rule — its left edge is the card's own.
  const cardCell = (first) => (first ? undefined : { boxShadow: `inset 1px 0 0 ${cardHair}` });
  const cardTotal = { boxShadow: `inset 1px 0 0 ${K.bdr}`, background: K.bdr + ALPHA.wash };

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

    // ── How big the card is drawn ──
    // The card is a SCREEN, not a cell in the board. It was built out of the
    // same micro/label rungs the row above it is squeezed into, which is what
    // made an 18-hole card something you had to bring the phone up to your face
    // to read — the whole point of opening it is to read the holes. Nothing is
    // competing with it for the width once it is open, so the numbers take the
    // room: the scores are small, the size the board's own rows are built on,
    // and the heads and pars sit a rung under them.
    //
    // Small is where it stops. The nine tracks split whatever the board is
    // wide, which is ~30px a hole on a 390 phone and ~27 on a 360, and a score
    // two or more off par is ringed TWICE — a rung further up and the outer
    // ring is wider than the track it has to fit in.
    return (
      <div style={{ padding: "10px 10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {availRounds.length > 1 ? (
              <select value={viewRound} onChange={e => setScorecardRound(parseInt(e.target.value))} onClick={e => e.stopPropagation()} style={{
                background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.xs, color: K.acc, fontSize: FS.small, fontWeight: 700, padding: "3px 5px", cursor: "pointer",
              }}>
                {availRounds.map(r => {
                  const c = courses.find(cs => cs.id === tRounds.find(t => t.round_number === r)?.course_id);
                  return <option key={r} value={r}>Rd {r}: {c?.name || "—"}</option>;
                })}
              </select>
            ) : (
              <span style={{ fontSize: FS.small, fontWeight: 700, color: K.acc }}>Rd {rc.r}: {rc.course.name}</span>
            )}
            <span style={{ fontSize: FS.label, color: K.t2 }}>CH {rc.ch}</span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: FS.label, alignItems: "baseline" }}>
            <span style={{ color: K.t2 }}>Gross <strong style={{ fontSize: FS.small, color: K.t1 }}>{totalGross || "—"}</strong></span>
            <span style={{ color: K.t2 }}>Net <strong style={{ fontSize: FS.small, color: netToPar < 0 ? K.under : K.t1 }}>{totalNet || "—"}</strong></span>
          </div>
        </div>
            {[["Front", 0, 9, rc.frontPar, rc.frontGross], ["Back", 9, 9, rc.backPar, rc.backGross]].map(([label, start, count, parT, grossT]) => (
              // ── Ruled, the way the skins card is ──
              // Nine numbers in a row with nothing between them is a string of
              // digits, not nine holes: following one hole down from its
              // number to its par to what was shot there meant counting across
              // three separate rows with the phone at arm's length. The rules
              // are the same two weights the betting card uses — `hair`
              // between holes inside a nine, `edge` around the nine and down
              // the side of the totals — and the two head rows sit on the same
              // wash so they read as one heading over the scores rather than
              // as two more rows of numbers.
              //
              // The vertical rules are inset shadows rather than borders,
              // which is the same reason the board's own round columns use
              // them: a border is width, and it would come off the inside of
              // eight cells out of nine and leave the first one a pixel wider
              // than its neighbours, with its digit half a pixel off centre.
              <div key={label} style={{ marginBottom: 8, border: cardEdge, borderRadius: R.xs, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: `30px repeat(${count}, 1fr) 34px`, fontSize: FS.label, background: K.bdr + ALPHA.wash }}>
                  <div style={{ color: K.t2, fontWeight: 600, padding: "3px 0 3px 4px" }}></div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => (
                    <div key={h} style={{ ...cardCell(h === start), textAlign: "center", color: K.t2, fontWeight: 600, padding: "3px 0" }}>{h+1}</div>
                  ))}
                  <div style={{ ...cardTotal, textAlign: "center", color: K.t3, fontWeight: 800 }}>{label === "Front" ? "OUT" : "IN"}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `30px repeat(${count}, 1fr) 34px`, fontSize: FS.label, background: K.bdr + ALPHA.wash, borderBottom: cardEdge }}>
                  <div style={{ color: K.t3, padding: "3px 0 3px 4px" }}>Par</div>
                  {Array.from({length: count}, (_, i) => start + i).map(h => (
                    <div key={h} style={{ ...cardCell(h === start), textAlign: "center", color: K.t3, padding: "3px 0" }}>{rc.holePars[h]}</div>
                  ))}
                  <div style={{ ...cardTotal, textAlign: "center", color: K.t3, fontWeight: 700 }}>{parT}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: `30px repeat(${count}, 1fr) 34px` }}>
                  <div style={{ color: K.t2, padding: "0 0 0 4px", fontSize: FS.label, fontWeight: 600, display: "flex", alignItems: "center" }}>Scr</div>
                  {/* Every mark on these — the ring, the ring outside it, the
                      stroke dots — is components/ScoreCell, which is the
                      scoring screen's Full Scorecard lifted out of it. This
                      card used to draw its own: dots hung off the top-right
                      corner of the digit, one per stroke however many that
                      was, and the ring coloured by whether the hole won a skin
                      instead of by what was shot. Two cards of the same round,
                      neither agreeing with the other.

                      A rung under the scoring screen's card in size, because
                      it is drawn in a board nine columns wide rather than in a
                      popup, and the outer ring has to fit the track it is in.
                      Everything else about it is that card. */}
                  {Array.from({length: count}, (_, i) => start + i).map(h => (
                    <ScoreCell key={h} fontSize={FS.small} style={cardCell(h === start)}
                      score={rc.scores[h]} par={rc.holePars[h]} strokes={rc.strokeMap[h]}
                      skin={skinWins[`${rc.r}_${h}`] === p.id} />
                  ))}
                  <div style={{ ...cardTotal, textAlign: "center", fontSize: FS.body, fontWeight: 800, color: K.t1, display: "flex", alignItems: "center", justifyContent: "center", height: scoreCellMetrics(FS.small).cell }}>{grossT || ""}</div>
                </div>
              </div>
            ))}
      </div>
    );
  };

  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Giant trophy silhouette behind entire leaderboard — fixed so it never
          shifts.
          Held back from the 8% it carried against the old board, but not by
          much. It could take 8% when what sat in front of it was a grid of
          ruled, tinted boxes, because the boxes were what the eye read; with
          the rules gone the rows are ink on the page and the silhouette's own
          edges started reading as marks across the middle of the field. Two
          points down is the settled answer: plainly there behind the board,
          and not competing with a score while somebody reads it.

          INVERTED in daylight, which is the whole reason it was missing there.
          The file is a WHITE silhouette with an alpha channel — the right
          thing behind a near-black page and completely invisible against a
          near-white one, where it had been quietly absent rather than subtle.
          Inverting turns it black and the same 6% reads as the same watermark.
          Keyed off the html data-theme attribute rather than off K, because
          this is a filter on an image and not a colour token — and that
          attribute is set by the pre-paint script in index.html, so it is
          right on the very first frame. */}
      <style>{`[data-theme="light"] .wbcLbMark{filter:invert(1)}`}</style>
      <img src={WBC_TROPHY_SILHOUETTE} alt="" className="wbcLbMark" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 480, height: "100vh",
        maxWidth: "100vw",
        opacity: 0.06,
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 0,
        objectFit: "contain",
      }} />
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* ── The title, and the three toggles under it ──
          One row each, so the toggles read as one set of controls rather than
          as decoration flanking a heading. They are spread edge to edge under
          it: the outer two line up with the ends of the rows below, the middle
          one sits under the title, and the row is symmetrical about the same
          centre line the heading is.

          The order left to right is the order they bite. Net/Gross and
          Par/Total change what the NUMBERS MEAN — both rewrite the total and
          the round columns in place without changing what is on the board —
          and the rounds toggle changes which COLUMNS ARE THERE. Two of a kind
          and then the odd one, which is why the odd one is on the end. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.title, margin: 0, fontWeight: 800 }}>Leaderboard</h2>
          {(() => {
            // No FINAL badge beside the title: the trophy on position 1 says
            // the tournament is decided, and saying it twice on one screen
            // only competes with itself.
            //
            // The round still has to be UNfinalized for LIVE. A finalized
            // round can still hold a card that stops short — a withdrawal, a
            // group that signed at 14 — and a partial card in a closed round
            // is not play in progress.
            //
            // It fits beside the word again now that nothing else is on this
            // line. It did not when a stack of pills held both ends: heading
            // plus badge plus two stacks came to 392px, and a 360 phone put
            // the right-hand stack past its own edge — which, with the board's
            // overflow hidden, is not a scroll but a toggle nobody can reach.
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
        {/* Three of the same control, so they are drawn by the same code —
            they were three copies of one twelve-line block, which is how the
            unselected label on one of them ended up a different grey from the
            other two for a while.

            Ruled off underneath. This rule and the one under the column heads
            are the two structural lines on the screen, and between them they
            make the heads a band rather than a row of grey words floating over
            the first player: controls above the line, what the columns are
            inside it, the board below. They are the weight the row dividers
            are, so the whole screen is ruled in one hairline and not three. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: `0 ${LB_PAD_L}px 9px`, borderBottom: `1px solid ${K.bdr}${ALPHA.line}` }}>
          <Toggle options={[["Net", false], ["Gross", true]]} value={showGross} onPick={setShowGross} />
          <Toggle options={[["Par", true], ["Total", false]]} value={showToPar} onPick={setShowToPar} />
          {/* The round side names the round it is offering to leave: "R2" is
              the column you are looking at, not a round number in the
              abstract, so it moves with the board. Nothing to offer on a
              one-round event, where the two states are the same board — but
              the slot stays, so the other two do not slide across when a
              three-round year becomes a four-round one. */}
          {NUM_ROUNDS > 1
            ? <Toggle options={[[`R${shownRound}`, false], ["All", true]]} value={showAllRounds} onPick={setShowAllRounds} />
            : <span />}
        </div>
      </div>
      <div ref={containerRef} style={{ background: "transparent", overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {(() => {
          // Every round, or the one the board is about. This list is what the
          // header and every row map over, so the two cannot come apart.
          const shownRounds = showAllRounds
            ? Array.from({ length: NUM_ROUNDS }, (_, i) => i + 1)
            : [shownRound];
          // ── No rules on this board, in any direction ──
          // What made it read as a spreadsheet was the grid: a line down every
          // column boundary and another across every row, so twelve players
          // came out as ninety-six boxes. All of it is gone. The columns are
          // held apart by ALIGNMENT — the name flush left and everything after
          // it flush right or centred in its own track — and the hierarchy is
          // carried by weight and ink instead of by a box: the total is the
          // biggest thing on the row, the name a rung under it, the position
          // and the thru and the rounds behind both in the quiet grey. One
          // hairline is left between players, at a third strength, and one
          // accent wash under the leader.
          //
          // The rounds are nested in a track of their own rather than sitting
          // as top-level columns. They are one thing — the history behind the
          // number in front — and grouping them is what lets the gap either
          // side of the group do the work the rules used to. It is also what
          // makes one round and four the same layout with a different width.
          //
          // Showing one round hands back three columns' worth of board, and it
          // goes where the squeeze was: Thru and the round column each take a
          // wider track, so the two live numbers stop touching, and everything
          // still going spare falls through to the name.
          const roundsW = showAllRounds ? LB_COL.priorMin * NUM_ROUNDS : LB_COL.oneRound;
          const thruW = showAllRounds ? LB_COL.thru : LB_COL.thruRoomy;
          const gridCols = `${LB_COL.num}px minmax(0, 1fr) ${LB_COL.total}px ${thruW}px ${roundsW}px`;
          // No column gap. The tracks are already wider than their contents —
          // that surplus IS the gap, and it sits where the alignment puts it:
          // to the LEFT of a right-aligned number, between it and whatever
          // ends before it. A gap on top of that would only push the four
          // rounds off the right edge.
          const gridStyle = { display: "grid", gridTemplateColumns: gridCols, alignItems: "center" };
          const roundGrid = { display: "grid", gridTemplateColumns: `repeat(${shownRounds.length}, 1fr)`, alignItems: "center" };
          // Right-aligned, both of them: a column of numbers reads as a column
          // when its digits line up on the same edge, and these are the two
          // that change width — "E" against "+11", "9" against "18".
          const totalCell = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
          const thruCell = { textAlign: "right", color: K.t3, fontVariantNumeric: "tabular-nums" };
          return (
            <>
              {/* Eyebrows, not data, and they say so: the smallest thing on
                  the screen, tracked wide, in the quiet grey, on nothing. No
                  fill — the rule under it is what separates it from the board,
                  and a strip of tint on top of that would be the one boxed
                  thing left on a board with no boxes. Paired with the rule
                  under the toggles it reads as a band; on its own it was a row
                  of grey words floating over the leader.
                  The position column goes unlabelled. A column of 1, 2, T3 in
                  front of a column of names is not a question anybody needs a
                  head to answer, and "#" was a character doing nothing. */}
              <div ref={headerRef} style={{ ...gridStyle, padding: `9px ${LB_PAD_L}px`, fontSize: FS.micro, fontWeight: 700, color: K.t3, textTransform: "uppercase", letterSpacing: "0.12em", borderBottom: `1px solid ${K.bdr}${ALPHA.line}` }}>
                <span />
                <span>Player</span>
                {(() => {
                  const label = showGross ? "Gross" : showToPar ? "Total" : "Strokes";
                  // "STROKES" is two letters longer than the other two labels
                  // and fills the column on its own; the eyebrow tracking is
                  // what tips it past the edge its digits line up on. The long
                  // label goes untracked rather than the column growing for a
                  // word only one of the three toggle states ever shows.
                  return <span style={{ textAlign: "right", letterSpacing: label.length > 5 ? 0 : undefined }}>{label}</span>;
                })()}
                <span style={{ textAlign: "right" }}>Thru</span>
                <div style={roundGrid}>
                  {shownRounds.map(r => <span key={r} style={{ textAlign: "center" }}>R{r}</span>)}
                </div>
              </div>
              {/* Only once the round data is actually in. An empty `lb` also means
                  "Firestore has not answered yet", and reporting that as "no scores"
                  flashed the message up on every reload before the board arrived. */}
              {lb.length === 0 && (loaded
                ? <div style={{ padding: 24, textAlign: "center", color: K.t2, fontSize: FS.small }}>No scores yet — be the first!</div>
                : <div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: FS.small, opacity: 0.5 }}>&nbsp;</div>)}
              {/* The card grows out of the row rather than appearing at full
                  size under it: the wrapper is a one-track grid animated from
                  a zero fraction to its content, which is the only way to run
                  a height transition to a height nobody has measured. A
                  browser that will not interpolate the track just shows the
                  card, which is where this was before.

                  Opening only. Closing a card is a tap that wants the board
                  back, and playing it out is 200ms of the row you are trying
                  to get to still moving. */}
              <style>{`@keyframes wbcCardOpen{from{grid-template-rows:0fr}to{grid-template-rows:1fr}}`}</style>
              {/* Always scrollable, not only while a card is open. A full field
                  on a short phone is already taller than the box before
                  anything is expanded, and hidden meant the last few players
                  were simply not reachable. */}
              <div ref={rowsRef} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "auto" }}>
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
                  <div key={p.id} ref={isExpanded ? expandedRef : undefined} style={{ flex: "0 0 auto", display: "flex", flexDirection: "column" }}>
                    {/* One player, one hairline, at a third of the border
                        colour. It was at full strength when there were rules
                        in the other direction too and it had to hold its own
                        against them; with those gone it is the only line on
                        the board, and a third is all it takes to separate two
                        names. Not under the last one — there is nothing below
                        it to separate from.

                        The leader is marked with a RULE, not with shading. It
                        was an accent wash fading out across the row, and a
                        gradient is the one thing on a flat board that cannot
                        help drawing attention to itself: it has no edge to
                        line up with anything, it reads as a smudge behind the
                        name rather than a mark on the row, and in daylight it
                        came out as a grey-green rectangle dying in the middle
                        of nowhere. Three pixels of accent down the left edge
                        says the same thing in a shape the rest of the screen
                        already uses — it lines up with the rules under the
                        heads, it has an edge, and it leaves the row the same
                        colour as every other row.

                        Painted as an inset shadow rather than a border for the
                        usual reason: a border is width, and it would push this
                        one row's columns three pixels right of the eleven
                        above and below it. */}
                    <div onClick={() => { setExpanded(isExpanded ? null : p.id); setScorecardRound(null); }} style={{ ...gridStyle, padding: `0 ${LB_PAD_L}px`, height: rowH || 28, flex: "0 0 auto", alignItems: "center",
                      boxShadow: idx === lb.length - 1 ? undefined : `inset 0 -1px 0 ${K.bdr}${ALPHA.line}`,
                      // Drawn as a background image sized to 60% of the row —
                      // the same trick the skins card marks a won hole with —
                      // rather than as an edge on the box. An edge runs the
                      // full height, so a tie at the top came out as one bar
                      // down two rows instead of a mark on each of them.
                      ...(top3 && !p.isWD ? {
                        backgroundImage: `linear-gradient(${K.acc}, ${K.acc})`,
                        backgroundSize: "3px 58%",
                        backgroundPosition: "left center",
                        backgroundRepeat: "no-repeat",
                      } : null),
                      cursor: "pointer", fontSize: rowStyle.fontSize, lineHeight: 1 }}>
                      {/* Position — a rung UNDER the row size and in the quiet
                          grey. It was the row's heaviest ink after the total,
                          which put the most weight on the least interesting
                          number: the order is already the order of the rows. */}
                      <span style={{ fontWeight: 700, fontSize: fsStep(rowStyle.fontSize, -1), color: top3 ? K.acc : K.t3, display: "flex", alignItems: "center", gap: 2, fontVariantNumeric: "tabular-nums" }}>
                        {isChampion
                          ? <img src={WBC_TROPHY} alt="Champion" title="Champion" style={{ height: fsStep(rowStyle.fontSize, 2), display: "block" }} />
                          : pos}
                        {/* Stays at micro while the rest of the row steps up:
                            "T12" plus an arrow is what sizes this column, and
                            a bigger glyph pushes the pair past its width. */}
                        {mov && <span style={{ fontSize: FS.micro, color: mov === "up" ? K.ok : K.danger, lineHeight: 1 }}>{mov === "up" ? "▲" : "▼"}</span>}
                      </span>
                      {/* Player — a rung above the fitted row size. The name is
                          what you scan the board for, and at the row size it
                          was reading as one column of many. Tightened a hair:
                          at this weight and size the default tracking makes a
                          long surname wider than it needs to be. */}
                      <div style={{ fontWeight: isChampion ? 800 : 600, color: isChampion ? K.acc : K.t1, fontSize: fsStep(rowStyle.fontSize, 1), letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </div>
                      {/* Total — the biggest thing on the row, two rungs over
                          the fitted size and one over the name. It is the
                          number the board exists to report, and it used to be
                          the same size as the name beside it, told apart only
                          by sitting in a tinted box. The box is gone; the size
                          is what says it matters now. Full-strength ink, and
                          under par still prints red. */}
                      <span style={{ ...totalCell, fontWeight: 800, fontSize: fsStep(rowStyle.fontSize, 2), color: p.isWD || displayTotal == null ? K.t3 : (!showGross && showToPar && displayTotal < 0 ? K.under : K.t1) }}>
                        {p.isWD ? <span style={{ fontSize: fsStep(rowStyle.fontSize, -1), color: K.t3, fontWeight: 700 }}>WD</span> : displayTotal != null ? (showGross || !showToPar ? displayTotal : fmtPar(displayTotal)) : "—"}
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
                            ...thruCell,
                            fontSize: fsStep(rowStyle.fontSize, st.kind === "tee" ? -2 : -1),
                            // The one cell the app-wide caps have to sit out.
                            // teeTimeLabel lowercases the meridiem to make a
                            // time fit this column, and it fits by a third of a
                            // pixel: "10:24a" measures 33.7 against a 34px
                            // track, "10:24A" measures 34.9 and runs into the
                            // rounds beside it. Two rungs down is already as
                            // small as this value goes, so the case is the only
                            // thing left to give.
                            textTransform: st.kind === "tee" ? "none" : undefined,
                          }}>
                            {st.text}
                          </span>
                        );
                      })()}
                      {/* Prior rounds — always show all 4, in a track of their
                          own. The group is the unit: four numbers with air
                          either side of it, rather than four columns fenced
                          off from the row they belong to. */}
                      <div style={roundGrid}>
                      {shownRounds.map((r) => {
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
                        // now: t2 for a round played, t3 for the round not
                        // reached yet.
                        //
                        // An en dash for a round that has not happened, not an
                        // em dash. Four of them across a row of unplayed rounds
                        // is a lot of ink for four pieces of nothing, and the
                        // shorter mark reads as a placeholder rather than as a
                        // result.
                        return (
                          <span key={r} style={{ textAlign: "center", fontVariantNumeric: "tabular-nums", fontSize: fsStep(rowStyle.fontSize, -1), color: prVal != null && !showGross && showToPar && prVal < 0 ? K.under : isWDRound || prVal == null ? K.t3 : K.t2 }}>
                            {isWDRound ? "WD" : prVal != null ? (showGross || !showToPar ? prVal : fmtPar(prVal)) : "–"}
                          </span>
                        );
                      })}
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ display: "grid", gridTemplateRows: "1fr", animation: `wbcCardOpen ${MOTION} ease-out` }}>
                        <div style={{ overflow: "hidden", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}`, background: K.bg + ALPHA.panel }}>
                          {renderScorecard(p)}
                        </div>
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
