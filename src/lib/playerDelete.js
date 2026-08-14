// ══════════════════════════════════════════════════════════════════
//  playerDelete — may this player be deleted outright, and what goes.
// ══════════════════════════════════════════════════════════════════
//
// "Move to inactive" is the routine action and always has been: it takes a man
// off THIS year's roster and leaves his record, his index and his sign-in
// alone. It is the right move for the two men not coming this time.
//
// It is the wrong move for a name typed into the demo edition, or for "Aron"
// added at 11pm and re-added correctly a minute later. Those are not players
// standing down for a year — they are records that should not exist, and until
// now the only way to be rid of one was the Firebase console.
//
// So there is a delete, and this module is the part that decides whether it may
// run. The rule it enforces is the one that matters: A CAREER IS NOT
// DELETABLE FROM THIS APP. The id derived from a man's name is what binds him
// to every round he has played, his account claim and his hand-set index, and
// no confirmation dialog makes destroying that a thing a phone should do at a
// golf course. If the record books know the name, the answer is inactive.
//
// Everything else the delete would take is not refused — it is NAMED, so the
// confirmation says what goes rather than asking for trust.

// An edition id as a director would say it: "2026" for a year, "the demo" for
// the sandbox, and the raw id for anything else.
export const editionLabel = (tid) => {
  const s = String(tid ?? "").replace(/^wbc_/, "");
  if (!s) return "another edition";
  return s === "demo" ? "the demo" : s;
};

// ── deleteVerdict ──────────────────────────────────────────────────
// historyName    the name this player matches in the record books, or null.
//                Non-null means a real career — refused.
// otherEditions  tournament_ids OTHER than the current one that still hold a
//                roster row for them. Non-empty means deleting the registry
//                record would orphan another year's roster — refused.
//                `null` means the check could not be run, which is not
//                permission: refused too, the same way lib/editions treats an
//                unreadable edition summary.
// scoredHoles    holes they have posted in THIS edition. Deleted with them,
//                and said so.
// claimed        whether a sign-in is bound to this id. Not a refusal — the
//                claim resolves back to the pick-your-name screen — but it is
//                the surprise worth stating before the tap.
//
// Returns { allowed, reason, why, warnings }.
export const deleteVerdict = ({
  historyName = null,
  otherEditions = [],
  scoredHoles = 0,
  claimed = false,
} = {}) => {
  if (historyName) {
    return {
      allowed: false,
      reason: "career",
      why: `${historyName} is in the record books. Deleting the record would cut every round they have played loose from their name — move them to inactive instead, which is what that button is for.`,
      warnings: [],
    };
  }
  if (otherEditions == null) {
    return {
      allowed: false,
      reason: "unreadable",
      why: "Couldn't check whether they're on another year's roster, and not being able to check isn't permission. Try again when the connection is back.",
      warnings: [],
    };
  }
  if (otherEditions.length) {
    const list = otherEditions.map(editionLabel).join(", ");
    return {
      allowed: false,
      reason: "other-edition",
      why: `They're still on the roster in ${list}. Deleting the record here would leave a roster row over there with no name to draw. Take them off that edition first, or move them to inactive.`,
      warnings: [],
    };
  }

  const warnings = [];
  if (scoredHoles > 0) {
    warnings.push(`${scoredHoles} scored hole${scoredHoles === 1 ? "" : "s"} in this edition go with them.`);
  }
  if (claimed) {
    warnings.push("Somebody has signed in as this name. They keep their account and land back on the pick-your-name screen.");
  }
  return { allowed: true, reason: "ok", why: "", warnings };
};

// ── deletionLines ──────────────────────────────────────────────────
// What the confirmation lists. Written as the things that disappear, in the
// order somebody would miss them, so the dialog is an inventory rather than an
// adjective. The scored holes are already stated by the verdict's warnings —
// they are the one item here the caller does not have to know how to phrase.
export const deletionLines = ({ name, warnings = [] } = {}) => {
  const lines = [
    `${name || "This player"} is deleted outright: the player record, this edition's roster row, their pairings and their tee assignments.`,
  ];
  if (warnings.length) lines.push("", ...warnings);
  lines.push("", "This can't be undone. To take somebody off this year's field without losing them, use Move to inactive.");
  return lines;
};
