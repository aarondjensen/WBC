// ══════════════════════════════════════════════════════════════════
//  PlayerActivityPanel — who is actually in the app, from Admin.
// ══════════════════════════════════════════════════════════════════
//
// Two columns and a summary line, answering the two questions a director asks
// in the week before a tournament and could not ask the app before this:
//
//   LAST SEEN   the sign-in stamp App.jsx writes on every launch. Shown as a
//               time ago rather than a date, because "24m ago" is read at a
//               glance and "Aug 16" is arithmetic.
//   ALERTS      whether push will actually reach them. Read off the token
//               collection, not off browser permission — see lib/notifications
//               for why those two disagree, and why only the tokens are true.
//
// The join and the sort live in lib/playerActivity; this file draws them.
//
// SORTED BY RECENCY, not by name, and that is the whole layout decision — and
// the reason this lives on the Event tab rather than the Players one. A roster
// sorted alphabetically, one row per man, is already there and is for EDITING
// him. What is wanted here is the tail: the men at the bottom who have never
// opened it, and the men with alerts off who will not hear that their tee time
// moved. It sits under the event password because it is the same subject —
// the door, and who has come through it.
import { K, FS, R, ALPHA } from "../theme";
import { SectionLabel, Card } from "./ui";
import { usePlayerActivity } from "../lib/playerActivity";

const Pill = ({ tone, children }) => (
  <span style={{
    flexShrink: 0, fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.4,
    padding: "3px 7px", borderRadius: R.sm, whiteSpace: "nowrap",
    color: tone, background: `${tone}${ALPHA.wash}`, border: `1px solid ${tone}${ALPHA.line}`,
  }}>{children}</span>
);

export function PlayerActivityPanel({ players }) {
  const { rows, summary, loading } = usePlayerActivity(players);

  return (
    <div style={{ marginTop: 18 }}>
      <SectionLabel>Sign-ins &amp; alerts</SectionLabel>
      <Card pad={0} style={{ overflow: "hidden" }}>
        {/* Nothing is painted until BOTH reads have answered. Half the join is
            not a partial answer here, it is a wrong one: with the accounts in
            and the tokens still out, every row reads "alerts off", and with
            neither in, every man on the roster reads "never signed in". */}
        {loading && (
          <div style={{ padding: "18px 14px", textAlign: "center", fontSize: FS.small, color: K.t3 }}>
            Reading…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div style={{ padding: "18px 14px", textAlign: "center", fontSize: FS.small, color: K.t3 }}>
            Nobody on the roster yet.
          </div>
        )}
        {!loading && rows.map((r, i) => (
          <div key={r.id} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
            borderBottom: i === rows.length - 1 ? "none" : `1px solid ${K.bdr}${ALPHA.hair}`,
            // A player who has never signed in is not a problem to be flagged
            // — plenty of the field never will — so he is dimmed rather than
            // coloured. The colour is spent on the row that IS actionable:
            // signed in, alerts off.
            opacity: r.signedIn ? 1 : 0.55,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.name}
              </div>
              <div style={{ fontSize: FS.micro, color: K.t3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.lastSeenLabel}
                {/* Only worth saying when it is more than one: a man with a
                    phone and a laptop gets the alert twice, and that is the
                    question this answers when he says he got two. */}
                {r.devices > 1 && ` · ${r.devices} devices`}
              </div>
            </div>
            {r.notifications === "on" && <Pill tone={K.acc}>🔔 ON</Pill>}
            {r.notifications === "off" && <Pill tone={K.warn}>ALERTS OFF</Pill>}
            {r.notifications === null && <Pill tone={K.t3}>NO ACCOUNT</Pill>}
          </div>
        ))}
      </Card>
      {!loading && (
      <div style={{ fontSize: FS.label, color: K.t3, marginTop: 6, lineHeight: 1.45 }}>
        {summary.signedIn} of {summary.total} signed in · {summary.notifying} with notifications on.
        {" "}Every player is asked once, the first time they log in — they can change it
        under their own name, in Notifications.
      </div>
      )}
    </div>
  );
}

export default PlayerActivityPanel;
