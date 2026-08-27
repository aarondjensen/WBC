// ══════════════════════════════════════════════════════════════════
//  AttestBanner — the in-app half of the red bubble.
// ══════════════════════════════════════════════════════════════════
//
// A push went out saying "time to attest your scorecard", the phone put a
// badge on the icon, and then the app it opened said nothing at all. The only
// attest control in the whole app is buried in the Scoring tab, on the group
// and round that tab happens to be pointing at — and Scoring jumps to the
// first unfinalized round on tap, so the card actually waiting was regularly
// somewhere the player had no way to reach. The bubble was the only thing that
// knew, and a bubble cannot tell you what it wants.
//
// So this is the row that says it. One line, under the header, on every tab:
// which round is waiting, who signed it, and a button that puts the app on
// that exact round with the card on screen.
//
// It renders from lib/pendingAttest — the SAME list the app badge counts — so
// the two cannot disagree. If the icon says one, this row is showing, and
// clearing this row clears the icon. That is the entire point of it.
//
// Absent when there is nothing owed, which is nearly always: sixteen men who
// attest on the tee box never see this row at all.
import { K, FS, R, ALPHA, ON_ACC } from "../theme";

/**
 * @param {Array}    items  lib/pendingAttest pendingAttestations() output
 * @param {Function} onGo   (round, groupKey) => void — take me to that card
 */
export function AttestBanner({ items, onGo }) {
  const list = items || [];
  if (list.length === 0) return null;

  // The oldest one, which pendingAttestations already sorted to the front: it
  // is the round furthest behind, and it is the one holding a leaderboard up.
  // The rest are counted rather than listed — a phone is one line wide, and
  // finishing the first is how you get to the second anyway.
  const [next] = list;
  const more = list.length - 1;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 12px 7px 14px",
      borderBottom: `1px solid ${K.bdr}`, background: K.warn + ALPHA.wash,
    }}>
      <span aria-hidden="true" style={{ fontSize: FS.small, flexShrink: 0 }}>✍️</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: FS.label, fontWeight: 700, letterSpacing: "0.03em",
        color: K.t2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {/* The round is the part that has to survive being cut off, so it goes
            first — the scorer's name is a courtesy, and "+1 more" after it is
            the only thing that tells a player the badge is counting past one. */}
        <b style={{ color: K.t1 }}>Round {next.round}</b> needs your attest
        {next.signedByName ? <> — signed by {next.signedByName}</> : null}
        {more > 0 ? <> · +{more} more</> : null}
      </span>
      <button
        onClick={() => onGo && onGo(next.round, next.groupKey)}
        style={{
          flexShrink: 0, padding: "5px 11px", borderRadius: R.pill, border: "none",
          font: "inherit", background: K.warn, color: ON_ACC,
          fontSize: FS.label, fontWeight: 800, letterSpacing: "0.03em",
          cursor: "pointer", lineHeight: 1.4,
        }}
      >Attest</button>
    </div>
  );
}
