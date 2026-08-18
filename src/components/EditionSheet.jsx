// ══════════════════════════════════════════════════════════════════
//  EditionSheet — everything you can do to one tournament year.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup, which reworked its picker first and hit the same
// wall: at a 320pt viewport a row carrying a year, a state, a summary line
// and two controls has nothing left for the summary, and every rearrangement
// of five things is another arrangement of five things. So the controls came
// off the row instead.
//
// What it buys here, beyond the width:
//
//   • THE REFUSALS FINALLY GET THEIR SENTENCE. `deleteVerdict` has always
//     returned a `why` for every year it will not delete — "Finished
//     tournaments can't be deleted, this is the record of the event" — and the
//     row had nowhere to put it, so it drew no bin at all and left a director
//     to infer the rule from an absence. A sheet has room for a sentence.
//   • THE BIN GETS A WORD. A 15px 🗑 eight pixels from a row that reloads the
//     app is a mis-tap on a phone in sunlight; "Delete this tournament", in
//     red, behind a tap, is not. The grave confirm still follows it.
//   • ONE ROW FOR BOTH AUDIENCES. The director/member fork was three
//     conditionals inside the row; it is now two buttons against none in here.
//
// The destructive confirms — delete, and locking a year — stay exactly where
// they were. Those are the two a person should have to answer twice.
import { K, ON_ACC, FS, R, ALPHA } from "../theme";
import { Popup } from "./Popup";
import { IconLock, IconUnlock, IconTrash, IconPencil } from "./Icons";
import { editionActions } from "../lib/editionLifecycle";

const metaWord = {
  fontSize: FS.label, fontWeight: 800, letterSpacing: "0.06em",
  textTransform: "uppercase", lineHeight: 1,
};

// One action, and it LOOKS like a button now — bordered, centred, sized to sit
// beside another. They used to be borderless full-width rows with an
// explanatory hint on the right, which read as a list of settings rather than
// as two things a director can do; the words on them ("Rename", "Unlock") say
// what they do, and a hint saying it again is a hint nobody needs twice.
function Action({ icon: Icon, label, danger, onClick, disabled }) {
  const ink = danger ? K.danger : K.t1;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      padding: "11px 10px", borderRadius: R.sm, font: "inherit",
      border: `1px solid ${danger ? K.danger + ALPHA.line : K.bdr}`,
      background: danger ? `${K.danger}${ALPHA.wash}` : K.inp,
      fontSize: FS.body, fontWeight: 700, color: ink,
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
    }}>
      <span aria-hidden style={{ flexShrink: 0, display: "flex", color: danger ? K.danger : K.t3 }}>
        <Icon size={16} />
      </span>
      <span style={{ minWidth: 0 }}>{label}</span>
    </button>
  );
}

const Divider = () => <div style={{ height: 1, background: K.bdr, margin: "6px 10px" }} />;

/**
 * @param {object}  edition      the row that was tapped
 * @param {string}  state        editionState() for it — drives the delete guard
 * @param {string}  location     where it was played, for under the year
 * @param {number}  players      how many golfers are on its roster; null while counting
 * @param {boolean} countsFresh  have the counts landed (so null means none, not "not yet")
 * @param {Array}   courses      [{ round, name }], null while they are being read
 * @param {boolean} isActive     is this the edition the app has open
 * @param {boolean} isSandbox    the disposable scratch copy
 * @param {boolean} canManage    draw the director half
 */
export function EditionSheet({
  edition, state = "unknown", location = "", players = null, countsFresh = false,
  courses = null, isActive = false, isSandbox = false,
  canManage = false, busy = false, onOpen, onRename, onLock, onDelete, onClose,
}) {
  if (!edition) return null;
  const acts = editionActions({ edition, state, isActive, isSandbox, canManage });

  return (
    // 3500 puts it on the rung BETWEEN the picker (3000) and a ConfirmModal
    // (4000): above the list it was opened from, below the delete and lock
    // confirms it raises. Without an explicit number it takes Popup's default
    // 300 and renders UNDERNEATH the picker — present in the DOM, invisible on
    // screen, and only a screenshot catches it.
    <Popup onClose={onClose} portal zIndex={3500} maxWidth={420} padding={0} outerPadding={12}>
      {/* ── The name IS the heading ───────────────────────────────
          "WBC 2025 · Gaylord, MI", once, at heading size. The year used to sit
          above it at display size, which said the same four digits twice on a
          sheet opened by tapping those four digits — and pushed everything
          this screen exists for below the fold.

          No state word and no padlock word either. Both were labels on facts
          the sheet shows anyway: what a finished tournament is, is obvious
          from the year on it, and the lock's own button says Unlock when it is
          on. ACTIVE stays, because which edition the app has OPEN is the one
          thing here that cannot be read off the tournament itself. */}
      <div style={{ padding: "15px 15px 13px", borderBottom: `1px solid ${K.bdr}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: FS.lead, fontWeight: 800, color: K.t1, lineHeight: 1.25 }}>
            {edition.name || edition.id}{location ? ` · ${location}` : ""}
          </div>
          {isSandbox && (
            <span style={{
              ...metaWord, flexShrink: 0, color: K.tourn,
              border: `1px solid ${K.tourn}${ALPHA.line}`, background: `${K.tourn}${ALPHA.wash}`,
              padding: "4px 8px", borderRadius: R.xs,
            }}>DEMO</span>
          )}
          {isActive && (
            <span style={{ ...metaWord, flexShrink: 0, color: ON_ACC, background: K.acc, padding: "4px 8px", borderRadius: R.xs }}>
              ACTIVE
            </span>
          )}
        </div>
        {/* ── What this tournament WAS ─────────────────────────────
            The row says the year and where it was played; this is the tap
            deeper, and what belongs a tap deeper is what the row could not
            hold: how many men were in it and what they played.

            The counts the row used to carry are not restated here. They are
            still gathered — the state dot and the delete guard are built on
            them — and they are still spelled out at the two places a director
            decides on them: the clone-source list and the delete confirm. */}
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
          <div style={{ fontSize: FS.small, fontWeight: 700, color: K.t2 }}>
            {players === null
              ? (countsFresh ? "Roster couldn't be read" : "Counting the roster…")
              : `${players} player${players === 1 ? "" : "s"}`}
          </div>

          {/* Round order, and a round whose course row has gone missing keeps
              its place with a dash — a blank beside R3 is the honest rendering
              of a course deleted out from under a finished tournament. */}
          {courses === null ? (
            <div style={{ fontSize: FS.label, fontWeight: 600, color: K.t3 }}>Reading the courses…</div>
          ) : courses.length === 0 ? (
            <div style={{ fontSize: FS.label, fontWeight: 600, color: K.t3 }}>No courses set</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {courses.map(({ round, name }) => (
                <div key={round} style={{ display: "flex", gap: 8, fontSize: FS.small, lineHeight: 1.35 }}>
                  <span style={{
                    flexShrink: 0, width: 22, fontWeight: 800, color: K.t3,
                    fontVariantNumeric: "tabular-nums",
                  }}>R{round}</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: name ? K.t1 : K.t3 }}>
                    {name || "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: "flex", flexDirection: "column", padding: 7,
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
      }}>
        {acts.open && (
          <button onClick={onOpen} disabled={busy} style={{
            padding: 12, borderRadius: R.sm, border: "none", font: "inherit",
            background: K.acc, color: ON_ACC, fontSize: FS.body, fontWeight: 800,
            letterSpacing: "0.03em", cursor: busy ? "default" : "pointer",
          }}>Open this tournament</button>
        )}
        {acts.open && canManage && <Divider />}

        {/* The director's two everyday controls, side by side: neither one
            needs a full row, and a pair reads as a pair. Both keep their
            confirms where they had them — locking asks, and so does unlocking
            now, because what it thaws is the record of a finished event. */}
        {(acts.rename || acts.lock) && (
          <div style={{ display: "flex", gap: 7 }}>
            {acts.rename && onRename && (
              <Action icon={IconPencil} label="Rename" onClick={onRename} disabled={busy} />
            )}
            {acts.lock && (
              <Action
                icon={acts.locked ? IconUnlock : IconLock}
                label={acts.locked ? "Unlock" : "Lock"}
                onClick={onLock} disabled={busy}
              />
            )}
          </div>
        )}

        {/* The bin, on its own row and in red, because it is not one of the
            everyday two. The years it refuses simply do not draw it: the
            reason used to be spelled out here and it was a paragraph
            explaining an absence nobody had asked about. */}
        {acts.delete && <div style={{ display: "flex", marginTop: 7 }}>
          <Action icon={IconTrash} label="Delete this tournament" danger onClick={onDelete} disabled={busy} />
        </div>}

        {/* What is left of the refusals: a next step, or a read that failed.
            See editionActions for why a finished year says nothing here. */}
        {acts.deleteWhy && (
          <p style={{ margin: "9px 4px 2px", fontSize: FS.small, fontWeight: 600, color: K.t3, lineHeight: 1.5 }}>
            {acts.deleteWhy}
          </p>
        )}

        {/* A member looking at the year they are already in has nothing to do
            here at all, and an empty sheet is worse than a sentence. */}
        {!acts.open && !canManage && (
          <p style={{ margin: "2px 10px 6px", fontSize: FS.small, fontWeight: 600, color: K.t3, lineHeight: 1.5 }}>
            You&rsquo;re viewing this tournament.
          </p>
        )}

        <button onClick={onClose} style={{
          marginTop: 6, padding: 11, borderRadius: R.sm, font: "inherit",
          background: K.inp, border: `1px solid ${K.bdr}`, color: K.t2,
          fontSize: FS.body, fontWeight: 700, cursor: "pointer",
        }}>Close</button>
      </div>
    </Popup>
  );
}
