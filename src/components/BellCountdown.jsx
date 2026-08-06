// ══════════════════════════════════════════════════════════════════
//  BellCountdown — how long until the field tees off
// ══════════════════════════════════════════════════════════════════
//
//  The same clock the market's opening bell runs on, in the header corner,
//  where it is not a deadline so much as an anticipation. Round one's first
//  tee time is the moment the tournament starts and the moment the market
//  shuts, so there is one number and it means both.
//
//  IT OWNS ITS OWN CLOCK, deliberately. Holding `now` in App and passing it
//  down would re-render the entire tree once a second through the last hour
//  before the first tee — every leaderboard row, every scorecard, on a phone
//  in a bag. Here the per-second setState reaches four spans.
//
//  It renders NOTHING once the bell has rung, rather than a zero or a "started"
//  badge. The header corner is shared with the director's group switcher, and
//  a countdown that has finished counting is worth less than the space.
import { useState, useEffect } from "react";
import { countdown, countdownTick } from "../lib/market";
import { K, FS } from "../theme";

export function BellCountdown({ at }) {
  const [now, setNow] = useState(() => Date.now());
  const left = at == null ? null : at - now;
  const c = left == null ? null : countdown(left);
  const done = c == null || c.done;
  // Seconds in the last hour, thirty otherwise — above an hour the label
  // cannot change faster than once a minute, so anything quicker is repaints
  // for nothing. Keyed on `urgent` rather than on the milliseconds so the
  // interval is not torn down and rebuilt on every tick.
  const fast = !done && c.urgent;
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setNow(Date.now()), countdownTick(fast ? 0 : Infinity));
    return () => clearInterval(t);
  }, [done, fast]);

  if (done) return null;
  return (
    <div style={{ textAlign: "right", lineHeight: 1.1 }}>
      <div style={{ fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.8, color: K.t3 }}>TEE OFF IN</div>
      <div style={{
        fontSize: FS.small, fontWeight: 800, letterSpacing: 0.3,
        // Tabular figures so the number does not jitter left and right as the
        // seconds turn over — the one thing that makes a running clock in a
        // fixed corner look broken.
        fontVariantNumeric: "tabular-nums",
        color: c.urgent ? K.warn : K.acc,
      }}>{c.label}</div>
    </div>
  );
}

export default BellCountdown;
