// ══════════════════════════════════════════════════════════════════
//  SyncBanner — "this phone is on its own"
// ══════════════════════════════════════════════════════════════════
//
// The one thing a scorer on a course could not previously find out. A score
// posted with no signal looks identical to one that reached everybody: the
// button goes gold, the running total moves, and the write sits in a queue on
// that handset. See lib/connection for why there is no error to catch.
//
// ── Why it is IN FLOW rather than floating ──
// Everything else the app puts at the top of the screen is fixed-position and
// transient: the toast, the pull-to-refresh spinner, the scoring screen's
// hole-state bar. This one can be up for a whole hole, and a fixed strip that
// sits there for ten minutes eventually covers something somebody needs to
// tap — the hole-state bar in particular lives at exactly the same coordinates
// on the one screen where both are most likely to be showing at once.
//
// So it takes its own row and pushes the app down by its own height. Nothing
// overlaps, nothing has to be told to move, and the cost is a few pixels only
// while there is genuinely something wrong.
//
// ── Why it is a strip and not a modal ──
// Losing signal on a golf course is normal and the app keeps working through
// it. This is a fact to be aware of, not a failure to acknowledge, so it says
// what is true and takes no tap to get rid of — it goes on its own when the
// writes land.
import { K, R, FS, ALPHA, FONT } from "../theme";

export function SyncBanner({ status }) {
  if (!status) return null;
  const ink = K.warn;
  return (
    <div
      // aria-live, because the whole point is that this appears without
      // anybody having navigated to it. `polite` rather than `assertive`: it
      // should be read at the next natural pause, not cut across whatever the
      // person is already being told.
      role="status"
      aria-live="polite"
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 14px",
        background: ink + ALPHA.tint,
        borderBottom: `1px solid ${ink}${ALPHA.line}`,
        color: ink,
        fontFamily: FONT,
        fontSize: FS.label,
        fontWeight: 700,
        lineHeight: 1.25,
        flexShrink: 0,
      }}
    >
      {/* A slashed cloud. Drawn rather than an emoji so it takes the theme's
          warn colour exactly, the same reason the header's mark is a mask. */}
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={ink}
           strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }} aria-hidden="true">
        <path d="M17.5 17H7a4 4 0 01-.7-7.94" />
        <path d="M9.5 5.6A5 5 0 0117 9h.5a3.7 3.7 0 012.1 6.7" />
        <line x1="3" y1="3" x2="21" y2="21" />
      </svg>
      <span style={{ flex: 1, minWidth: 0 }}>{status.label}</span>
      {/* The reassurance, present only when this phone is actually holding
          something: nothing typed into it is lost, it is queued. Without that
          the sensible response to the banner would be to stop scoring, which
          is the opposite of what the app can handle. See lib/connection for
          why a phone with nothing pending gets the fact and no advice. */}
      {status.hint ? (
        <span style={{ color: K.t2, fontWeight: 600, fontSize: FS.micro, whiteSpace: "nowrap" }}>
          {status.hint}
        </span>
      ) : null}
    </div>
  );
}

export default SyncBanner;
