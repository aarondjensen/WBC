// ══════════════════════════════════════════════════════════════════
//  GroupsView — the draw, as a player reads it.
// ══════════════════════════════════════════════════════════════════
//
// Who is playing with whom, and off what time. Read-only: the draw is made in
// Admin (PairingsEditor), and this is the tab the other fifteen people open to
// find out where they are supposed to be at 7:40.
//
// The tee-time strip is the point of it. A group without a time is a group
// nobody can plan around, so an undrawn or untimed round says so plainly
// rather than rendering an empty frame.
import { useState, useMemo, useRef, useLayoutEffect } from "react";
import { K, FS, R, ALPHA, FONT } from "../theme";
import { fitPairings, rungLines, nameWidthCeiling, CARD_GAP } from "../lib/pairingsFit";
import { TeeColorSwatch } from "./TeeColorSwatch";
import { isLightTee, isDarkTee } from "../lib/teeColors";
import { calcCH } from "../lib/individualBoard";

export function GroupsView({ players, round, tRounds, courses, pairingsData, teeTimesData, getPlayerTee, user }) {
  const tr = tRounds.find(t => t.round_number === round);
  const course = tr ? courses.find(c => c.id === tr.course_id) : null;
  const groups = useMemo(() => (pairingsData || {})[round] || [], [pairingsData, round]);
  const roundTeeTimes = (teeTimesData || {})[round] || [];

  // The draw is a handful of cards and it used to sit at FS.small with a third
  // of the tab empty below it. So the size comes from the space: measure what
  // the stack has been given and take the biggest rung that fits it — the same
  // bargain the leaderboard strikes, and the one the type scale is written for.
  //
  // Only the players actually on a card count towards the shape, because that
  // is what gets drawn: a pairing pointing at a player who has left the roster
  // renders nothing, and counting it would buy height for a row that is not
  // there and step the whole tab down a rung to pay for it.
  const stackRef = useRef(null);
  const [box, setBox] = useState({ h: 0, w: 0 });
  const drawn = useMemo(
    () => groups.map(grp => grp.map(pid => players.find(p => p.id === pid)).filter(Boolean)),
    [groups, players],
  );
  const sizes = useMemo(() => drawn.map(grp => grp.length), [drawn]);
  // Re-measure when the shape of the draw changes, not when its identity does:
  // a Firestore snapshot that rewrites the same four foursomes is not a reason
  // to read the layout again. The names ride along because the longest one is
  // the other half of the fit, and a substitution can change it.
  const drawShape = `${sizes.join(",")}|${drawn.flat().map(p => p.name).join("|")}`;
  // useLayoutEffect, not useEffect: this measures and then restyles from the
  // measurement, so running it after paint shows one frame at the wrong size.
  // The stack is flex: 1 against a floor, so its height is the space on offer
  // and does NOT move when the rung it feeds changes — no measure/grow loop.
  useLayoutEffect(() => {
    const measure = () => {
      const el = stackRef.current;
      if (!el) return;
      setBox(prev => (prev.h === el.clientHeight && prev.w === el.clientWidth
        ? prev
        : { h: el.clientHeight, w: el.clientWidth }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [drawShape]);

  // The longest name on the stack, in pixels per pixel of font size — the other
  // half of the fit. Canvas rather than the DOM because a name only overflows
  // once it has been drawn too big, and the point is not to draw it too big.
  //
  // Measured at 100px and divided down, so one measurement covers every rung.
  // toUpperCase() because the app paints names in capitals and text-transform
  // is a CSS thing the canvas knows nothing about — measure the string the
  // browser will draw, not the one Firestore stores. And measured a second
  // time on fonts.ready, because Montserrat arrives over the network and the
  // fallback it is measured against until then is the narrower of the two,
  // which is the direction that truncates.
  const [nameWidthPerPx, setNameWidthPerPx] = useState(0);
  useLayoutEffect(() => {
    const names = drawn.flat().map(p => p.name);
    if (names.length === 0) return undefined;
    let live = true;
    const measureNames = () => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx || !live) return;
      ctx.font = `600 100px ${FONT}`;
      setNameWidthPerPx(nameWidthCeiling(names.map(n => ctx.measureText(n.toUpperCase()).width / 100)));
    };
    measureNames();
    if (document.fonts) document.fonts.ready.then(measureNames);
    return () => { live = false; };
  }, [drawn]);

  const fit = fitPairings(box.h, sizes, box.w, nameWidthPerPx);
  const { rowLine, headLine } = rungLines(fit);

  const getTeeColor = (p) => {
    if (!course) return "#e8e8e8";
    const tee = getPlayerTee(round, p.id, course);
    return tee?.color || "#e8e8e8";
  };
  const getTeeName = (p) => {
    if (!course) return "";
    const tee = getPlayerTee(round, p.id, course);
    return tee?.name || "";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.title, margin: 0, fontWeight: 800, display: "inline" }}>Round {round}</h2>
        {course && <span style={{ fontSize: FS.small, color: K.t3, marginLeft: 10 }}>{course.name} · Par {course.par}</span>}
      </div>
      {groups.length > 0 ? (
        // The stack takes the rest of the tab whatever it holds — that height
        // IS the input to the fit above. overflowY stays auto as a backstop:
        // a draw too deep for even the smallest rung scrolls rather than
        // losing its last group off the bottom.
        <div ref={stackRef} style={{ display: "flex", flexDirection: "column", gap: CARD_GAP, flex: 1, minHeight: 0, overflowY: "auto" }}>
          {drawn.map((rows, gi) => {
            const teeTime = roundTeeTimes[gi];
            return (
            <div key={gi} style={{ background: K.card, borderRadius: R.md, border: `1px solid ${K.bdr}`, overflow: "hidden", flexShrink: 0 }}>
              <div style={{ padding: `${fit.headPad}px 12px`, fontSize: fit.head, lineHeight: `${headLine}px`, fontWeight: 700, color: K.acc, borderBottom: `1px solid ${K.bdr}`, background: K.accGlow, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{teeTime || `Group ${gi + 1}`}</span>
                {teeTime && <span style={{ fontSize: fit.headSub, fontWeight: 500, color: K.t3 }}>Group {gi + 1}</span>}
              </div>
              {rows.map((p, pi) => {
                const ch = course ? (() => { const tee = getPlayerTee(round, p.id, course); return calcCH(p.handicap_index, tee?.slope || course.slope, tee?.rating || course.rating, tee?.par || course.par); })() : 0;
                const teeName = getTeeName(p);
                const teeClr = getTeeColor(p);
                const isMe = p.id === user.id;
                return (
                  <div key={p.id} style={{ padding: `${fit.rowPad}px 12px`, lineHeight: `${rowLine}px`, display: "grid", gridTemplateColumns: "5fr 1.6fr 2.4fr 2fr", alignItems: "center", borderBottom: pi < rows.length - 1 ? `1px solid ${K.bdr}${ALPHA.wash}` : "none", background: isMe ? K.t2 + ALPHA.wash : "transparent" }}>
                    {/* The name is the one cell that can outgrow its column as
                        the rung climbs, so it ellipses rather than wrapping —
                        a wrapped row is a row taller than the fit paid for. */}
                    <span style={{ fontWeight: 600, fontSize: fit.name, color: isMe ? K.gold : K.t1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ fontSize: fit.cell, fontWeight: 600, color: K.t2, textAlign: "center" }}>{p.handicap_index}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: fit.cell, fontWeight: 600, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", color: isDarkTee(teeClr) ? "#9ca3af" : isLightTee(teeClr) ? K.t3 : teeClr }}>
                      {teeName && <>
                        <TeeColorSwatch color={teeClr} name={teeName} size={fit.swatch} />
                        {teeName}
                      </>}
                    </span>
                    <span style={{ color: K.t2, fontSize: fit.cell, fontWeight: 500, textAlign: "right", whiteSpace: "nowrap" }}>{course ? `CH ${ch}` : "–"}</span>
                  </div>
                );
              })}
            </div>
          )})}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: FS.jumbo, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: FS.body, fontWeight: 700, color: K.t1, marginBottom: 6 }}>No Pairings Set</div>
          <div style={{ fontSize: FS.small, color: K.t3 }}>Pairings will appear here once the tournament director sets them up.</div>
        </div>
      )}
    </div>
  );
}

// ── ADMIN ──
// The tee-colour dot on a player tile in the draw. Rendered whether or not the
// player HAS a tee yet: the slot is what lines the dots up into a column down
// the grid, and a tile that simply omits it shunts its name left and breaks the
// column for every tile beside it.
//
// The ring is what keeps a dark tee marker visible on a dark tile — so it is
// drawn in the body ink, which is near-white in the dark theme and near-black
// in daylight. A hardcoded white one vanishes the moment the app is light.

export default GroupsView;
