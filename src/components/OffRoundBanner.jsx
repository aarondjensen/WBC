// ══════════════════════════════════════════════════════════════════
//  OffRoundBanner — the scoring screen is pointed at a round nobody
//  is playing, and the safety catch that keeps it read-only.
// ══════════════════════════════════════════════════════════════════
//
// The loudest of the three tells the director's crown carries — the round
// header in its list, the warn-tinted chip in the app header, and this. It is
// the only one that costs the scoring screen any height, which it is worth: it
// is the one in the eyeline of somebody typing. The screen renders it ONLY when
// the app is off the live round, so a director working the round everybody is
// playing sees exactly what they saw before this existed, and a player never
// sees it at all.
//
// The row says which state the screen is in and carries both moves a director
// can want from it, as two separate hit targets:
//
//   the TEXT, left — back to the round the tournament is on. Somebody who
//     opened Round 1 to fix one hole should not have to find the crown again to
//     leave. With no live round to return to — every round finalized, the event
//     over — it is a plain span rather than a control that looks like it goes
//     somewhere and does nothing.
//   the BUTTON, right — the safety catch. Off, it reads Edit and arms the
//     group; on, it reads Done and drops the arming. Tapping a score button
//     while it is off asks the same question, so this is the deliberate way in
//     rather than the only one.
//
// Two buttons rather than one row that does both, because a nested button is
// not a thing, and because "leave" and "start editing" are opposite enough that
// sharing a hit target would be its own accident.
import { K, FONT, FS, R, ALPHA } from "../theme";

export function OffRoundBanner({ round, live, editLocked, onReturn, onToggleEdit }) {
  // Read-only is the resting state and it is stated in grey; armed is the
  // exception and the only one that gets the warn colour. The two must not look
  // alike at a glance — that glance is the whole feature.
  const inner = (
    <>
      <span style={{ display: "block", fontSize: FS.small, fontWeight: 800, letterSpacing: 0.5, color: editLocked ? K.t2 : K.warn }}>
        {editLocked ? `ROUND ${round} — NOT LIVE · READ-ONLY` : `EDITING ROUND ${round} — NOT LIVE`}
      </span>
      <span style={{ display: "block", fontSize: FS.label, color: K.t3, lineHeight: 1.35 }}>
        {editLocked
          ? (live != null ? `Not the live round. Tap for Round ${live}.` : "The event is over.")
          : (live != null
            ? `Changes post straight away. Tap for Round ${live}.`
            : "Changes post straight away and move the final result.")}
      </span>
    </>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, width: "100%",
      marginBottom: 8, padding: "5px 6px 5px 10px", borderRadius: R.sm, flexShrink: 0,
      background: editLocked ? K.card : `${K.warn}${ALPHA.wash}`,
      border: `1px solid ${editLocked ? `${K.bdr}${ALPHA.line}` : `${K.warn}${ALPHA.line}`}`,
      fontFamily: FONT,
    }}>
      <span aria-hidden="true" style={{ fontSize: FS.small, lineHeight: 1 }}>{editLocked ? "🔒" : "⚠️"}</span>
      {live != null && onReturn ? (
        <button onClick={onReturn} style={{
          minWidth: 0, flex: 1, textAlign: "left", padding: "2px 0",
          background: "transparent", border: "none", cursor: "pointer", fontFamily: FONT,
        }}>{inner}</button>
      ) : (
        <span style={{ minWidth: 0, flex: 1 }}>{inner}</span>
      )}
      <button onClick={onToggleEdit} style={{
        flexShrink: 0, padding: "6px 10px", borderRadius: R.sm, cursor: "pointer", fontFamily: FONT,
        fontSize: FS.label, fontWeight: 800, letterSpacing: 0.5,
        background: editLocked ? K.inp : `${K.warn}${ALPHA.line}`,
        border: `1px solid ${editLocked ? K.bdr : K.warn}`,
        color: editLocked ? K.t2 : K.warn,
      }}>
        {editLocked ? "Edit" : "Done"}
      </button>
    </div>
  );
}

export default OffRoundBanner;
