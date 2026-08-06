// ══════════════════════════════════════════════════════════════════
//  BellCountdown — how long until the field tees off
// ══════════════════════════════════════════════════════════════════
//
//  The same instant the market's opening bell rings — round one's first tee
//  time — counted down across the top of the app, where it is not a deadline
//  so much as an anticipation. One number, two meanings: the tournament
//  starting and the market shutting.
//
//  IT WRAPS THE MARK rather than sitting beside it, taking the logo as its
//  children and setting days and hours to its left, minutes and seconds to
//  its right. Two numeric pairs of near-identical ink either side of a fixed
//  30px glyph is symmetric BY CONSTRUCTION, which is the thing AppHeader's
//  own note says flanking a centred mark normally is not — the year and the
//  city fail at it because "GAYLORD, MI" outweighs "2026" three to one, and
//  four two-digit cells simply cannot. Both flanks are `flex: 1 1 0`, so the
//  mark holds the centre of the SCREEN no matter what the digits do.
//
//  IT OWNS ITS OWN CLOCK, deliberately. Holding `now` in App and passing it
//  down would re-render the entire tree once a second — every leaderboard
//  row, every scorecard, on a phone in a bag. Here the tick reaches eight
//  spans.
//
//  At zero it renders the mark alone, so the header returns to exactly the
//  layout it has had all along and nothing is left behind announcing that
//  something used to be there.
import { useState, useEffect } from "react";
import { countdown } from "../lib/market";
import { K, FS } from "../theme";

// One cell. Zero-padded and tabular so the row does not breathe in and out
// as the seconds turn over — the one thing that makes a running clock in a
// fixed header look broken. `minWidth` holds the cell open at "09" so the
// mark does not shuffle sideways when a two-digit value drops to one.
function Unit({ value, label, urgent }) {
  return (
    <div style={{ textAlign: "center", minWidth: 22 }}>
      <div style={{
        fontSize: FS.small, fontWeight: 800, lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
        // The last hour turns the clock amber. By then it has stopped being
        // information and started being a countdown.
        color: urgent ? K.warn : K.acc,
      }}>{String(value).padStart(2, "0")}</div>
      <div style={{ fontSize: FS.micro, fontWeight: 700, letterSpacing: 0.5, color: K.t3, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function BellCountdown({ at, children }) {
  const [now, setNow] = useState(() => Date.now());
  const c = at == null ? null : countdown(at - now);
  const done = c == null || c.done;
  // Every second, all the way out, because the seconds cell is on screen the
  // whole time — a slower tick would leave it visibly frozen. It costs one
  // re-render of eight spans, which is what wrapping the mark in its own
  // component rather than lifting `now` into App buys.
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [done]);

  if (done) return children;
  return (
    // Tight on purpose. The header's right corner holds an absolutely
    // positioned control — Exit for a guest, the group switcher for a
    // director — and on a 320px phone a loose cluster puts SEC against it
    // with a pixel to spare. Keeping the four cells close also reads better:
    // one object either side of the mark rather than four scattered numbers.
    <div style={{ alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", justifyContent: "flex-end", gap: 6 }}>
        <Unit value={c.days} label="DAYS" urgent={c.urgent} />
        <Unit value={c.hours} label="HRS" urgent={c.urgent} />
      </div>
      {children}
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", justifyContent: "flex-start", gap: 6 }}>
        <Unit value={c.mins} label="MIN" urgent={c.urgent} />
        <Unit value={c.secs} label="SEC" urgent={c.urgent} />
      </div>
    </div>
  );
}

export default BellCountdown;
