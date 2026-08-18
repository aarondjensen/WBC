// ══════════════════════════════════════════════════════════════════
//  EditionBanner — the way back from a year that is over.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup. More → Tournaments is a one-way trip in practice:
// opening 2014 reloads the app into a finished tournament, and the pointer is
// persisted — so the app STAYS in 2014 until somebody remembers that the way
// out is four taps back through a menu they opened once, out of curiosity. The
// symptom is not "I am in the wrong year", it is "the app is broken, there are
// no scores in it".
//
// lib/editionHome now brings a device home on the next cold start, which is
// the same failure caught from the other end. This is the half that works
// while the app is OPEN — and it is the visible half: the snap-back happens
// silently between launches, whereas somebody staring at an empty 2014
// leaderboard on the first tee needs the way out to be on the screen they are
// already looking at.
//
// A thin row, seated on top of the bottom nav, saying which year is on screen
// and offering the one being played. Present only while those two differ,
// which is why it costs nothing on the ordinary path — the sixteen men who
// never touch the picker never see it.
//
// It sits INSIDE the nav's box rather than above it, and that is load-bearing
// in two ways: the shell measures that box (`navH`) to seat the More menu on
// top of it, so a sibling row would end up underneath the menu; and the nav is
// the shell's last in-flow row, so anything inside it is reserved by layout
// rather than by a measured spacer.
//
// One tap, no confirm. The picker asks before opening a year because the
// destination is a choice; here the destination is home and the whole point is
// that getting back is quick.
import { K, FS, R, ALPHA, ON_ACC } from "../theme";
import { switchEdition } from "../lib/editions";
import { isSandboxEdition, editionYear } from "../lib/editionId";
import { editionBannerShowing } from "../lib/editionHome";

// The YEAR, not the tournament's name. A name is whatever a director typed
// ("WBC 2014", "DEMO Sandbox") and this row is one line tall on a phone,
// sharing it with a button — so the name would be an ellipsis by the third
// word. Four characters, never truncated, and the year is what anybody names a
// WBC by anyway.
//
// The sandbox is NAMED rather than dated, because it has no year of its own:
// editionYear falls back to the current one for an id with no digits in it, so
// a dated sandbox would read "You're viewing 2026 · Back to 2026" — a button
// naming the year it was already in, which goes somewhere else entirely.
//
// No year-clash fallback, unlike Bourbon Cup's copy of this. BC can hold two
// editions with the same year (bc_2026 and bc_2026_demo); here the id IS the
// year (wbc_2026) so two rows cannot share one, and the sandbox is the single
// yearless edition — see lib/editionId.
const label = (id) => (isSandboxEdition(id) ? "the demo" : String(editionYear(id)));

/**
 * @param {string} viewingId  the edition the app has open
 * @param {string} liveId     the tournament being played, or "" for none
 */
export function EditionBanner({ viewingId, liveId }) {
  if (!editionBannerShowing(viewingId, liveId)) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "5px 12px 5px 14px",
      borderBottom: `1px solid ${K.bdr}`, background: K.acc + ALPHA.wash,
    }}>
      <span style={{
        flex: 1, minWidth: 0, fontSize: FS.label, fontWeight: 700, letterSpacing: "0.03em",
        color: K.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        You&rsquo;re viewing <b style={{ color: K.t1 }}>{label(viewingId)}</b>
      </span>
      <button
        onClick={() => switchEdition(liveId)}
        style={{
          flexShrink: 0, padding: "5px 11px", borderRadius: R.pill, border: "none",
          font: "inherit", background: K.acc, color: ON_ACC,
          fontSize: FS.label, fontWeight: 800, letterSpacing: "0.03em",
          cursor: "pointer", lineHeight: 1.4,
        }}
      >Back to {label(liveId)}</button>
    </div>
  );
}
