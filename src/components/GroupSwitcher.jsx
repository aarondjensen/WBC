// ══════════════════════════════════════════════════════════════════
//  GroupSwitcher — a director pointing the Scoring tab at any group,
//  in any round.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup, onto WBC's groups-and-rounds shape. Why the hole in
// the scoring gate exists at all, and who it is for, is written up in
// lib/groupSwitch.
//
// It crosses ROUNDS, which is the part WBC did not have. The director's group
// list on the scoring screen shows the round the app is on and nothing else,
// so a card that came in wrong in Round 1 could not be reached from inside the
// app once Round 2 started — the fix was a Firebase console edit on document
// ids. This lists every round, and a round that is not the live one is
// labelled as such at every point where somebody could mistake one for the
// other: in this list, on the trigger chip, and in a banner across the top of
// the scoring screen.
//
// ── Why the trigger is a crown over G3 and not a labelled pill ─────
// It rides in the app header's right-hand cluster, beside the sync dot — chrome
// that is already on screen and already that tall — so the scoring screen pays
// nothing for it. Not a row, not a corner of one. That is also where it belongs
// by rights: it is a tool for pointing the app at a group, not a step in
// entering a score.
//
// Two lines, because the crown alone does not say WHICH group you are pointed
// at, and that is the question a director asks it. What it does not carry is
// the word "Group" or a caret — neither was ever part of the answer at a
// glance. The popup is the disclosure.
//
// A row of pills is what a multi-group director would otherwise get, and it
// does not survive eight groups. It also names the wrong thing: a director
// hunting for the group in front of them is not looking for "Group 6", they
// are looking for the four people standing there. So this is a button that
// opens a list, and the list leads with the names.
import { useState } from "react";
import { K, FONT, FS, R, ALPHA } from "../theme";
import { Popup } from "./Popup";

// The group's number is its position in its OWN round's draw, which is what
// the pairings screen, the tee sheet and the group list all call it.
const label = (g) => `Group ${g.index + 1}`;
const shortLabel = (g) => `G${g.index + 1}`;

const byRound = (groups) => {
  const rounds = new Map();
  (groups || []).forEach(g => {
    if (!rounds.has(g.round)) rounds.set(g.round, []);
    rounds.get(g.round).push(g);
  });
  return [...rounds.entries()].sort((a, b) => a[0] - b[0]);
};

// The one line of status a group gets in this list, in the same words the
// director's own group list uses so the two never disagree.
const statusOf = (p) => {
  if (p.finalized) return { text: "Final", color: K.acc };
  if (p.complete) return { text: "18 ✓ Ready", color: K.warn };
  if (p.thru > 0) return { text: `Thru ${p.thru}`, color: K.warn };
  return { text: "Not started", color: K.t3 };
};

export function GroupSwitcher({ groups, currentKey, live, nameOf, progressOf, onPick }) {
  const [open, setOpen] = useState(false);
  const rounds = byRound(groups);
  const current = (groups || []).find(g => g.key === currentKey) || null;
  // The screen is pointed somewhere other than the round everybody else is
  // playing — including at nothing at all, which is what an empty draw hands us
  // and is exactly when the crown is the only way forward. Every affordance
  // here changes when this is true; nothing about the control should read the
  // same in both states.
  const offRound = current == null || current.round !== live;

  return (
    <>
      {/* No wrapper and no margin: the caller places this, and today the caller
          is the app header's right-hand cluster. */}
      <button onClick={() => setOpen(true)}
        title={current == null
          ? "Open a group to score"
          : offRound
            ? `Round ${current.round} · ${label(current)} — not the live round`
            : `${label(current)} — score another group`}
        aria-label={current == null
          ? "Open a group to score"
          : offRound
            ? `Round ${current.round}, ${label(current)}. Not the live round. Change round or group.`
            : `${label(current)}. Score another group`}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 2, flexShrink: 0, minWidth: 38,
          padding: "3px 7px", borderRadius: R.sm, cursor: "pointer", fontFamily: FONT,
          // Off-round is a warn-tinted chip, not a neutral one. The banner on
          // the screen says it in words; this says it in the corner of the eye,
          // which is where a director glancing up actually looks.
          background: offRound ? `${K.warn}${ALPHA.wash}` : K.card,
          border: `1px solid ${offRound ? K.warn : K.bdr}`,
        }}>
        {/* The crown is the tell that this control is not what everyone else on
            the course is looking at; the line under it is where the screen is
            currently pointed — carrying the ROUND too as soon as that is not
            the one everybody assumes. */}
        <span aria-hidden="true" style={{ fontSize: FS.label, lineHeight: 1 }}>👑</span>
        <span aria-hidden="true" style={{
          fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1,
          color: offRound ? K.warn : K.t2,
        }}>
          {current == null ? "OPEN" : offRound ? `R${current.round}·${shortLabel(current)}` : shortLabel(current)}
        </span>
      </button>

      {open && (
        <Popup onClose={() => setOpen(false)} maxWidth={420} padding={0} portal zIndex={500}>
          <div style={{ fontFamily: FONT, padding: "16px 16px 8px" }}>
            <div style={{ fontSize: FS.lead, fontWeight: 800, color: K.t1, letterSpacing: "-0.01em" }}>
              Score another group
            </div>
            <div style={{ fontSize: FS.label, color: K.t3, lineHeight: 1.45, marginTop: 3 }}>
              Anything you enter posts as that group&apos;s own score.
            </div>
          </div>
          <div style={{ padding: "0 10px 14px", maxHeight: "60vh", overflowY: "auto", overscrollBehavior: "contain" }}>
            {rounds.map(([round, gs]) => (
              <div key={round}>
                {/* The round header is what keeps this list honest. A director
                    scrolling past "ROUND 2 · FINAL" into a group has been told
                    twice before they tap. */}
                <div style={{
                  display: "flex", alignItems: "baseline", gap: 6,
                  padding: "12px 4px 2px", fontFamily: FONT,
                }}>
                  <span style={{ fontSize: FS.small, fontWeight: 800, letterSpacing: 1, color: K.t2 }}>
                    ROUND {round}
                  </span>
                  <span style={{
                    fontSize: FS.micro, fontWeight: 800, letterSpacing: 1,
                    color: round === live ? K.ok : K.t3,
                  }}>
                    {round === live ? "LIVE" : "NOT LIVE"}
                  </span>
                </div>
                {gs.map(g => {
                  const on = g.key === currentKey;
                  const status = statusOf(progressOf(g));
                  return (
                    <button key={g.key} onClick={() => { onPick(g); setOpen(false); }} style={{
                      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                      padding: "9px 11px", marginTop: 6, borderRadius: R.md, fontFamily: FONT,
                      background: on ? `${K.acc}${ALPHA.wash}` : K.card,
                      border: `1px solid ${on ? K.acc : K.bdr}${ALPHA.line}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: FS.small, fontWeight: 800, letterSpacing: 0.5, color: on ? K.acc : K.t2 }}>
                          {label(g)}
                        </span>
                        <span style={{ fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5, color: status.color, marginLeft: "auto" }}>
                          {status.text}
                        </span>
                      </div>
                      <div style={{
                        fontSize: FS.label, fontWeight: 600, lineHeight: 1.5, color: K.t1,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {g.ids.map(nameOf).join(" · ") || "—"}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Popup>
      )}
    </>
  );
}

export default GroupSwitcher;
