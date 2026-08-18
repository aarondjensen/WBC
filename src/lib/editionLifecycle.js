// ══════════════════════════════════════════════════════════════════
//  editionLifecycle — what state a tournament year is in, and what
//  may be done to it.
// ══════════════════════════════════════════════════════════════════
//
// Pure. Given what an edition HOLDS, this says where it is in its life and
// whether a director may delete it. lib/editions.js gathers the facts from
// Firestore and enforces the verdict; nothing here talks to a database.
//
// Why the state is derived and not stored
// ───────────────────────────────────────
// It used to be a `status` field with three values a director set by hand, and
// it was wrong on real data the first day it shipped: a finished 2025 read
// DRAFT because that is what createEdition stamps and nobody had changed it,
// while an empty 2026 read PUBLISHED because that is what ensureActiveEditionDoc
// stamps on whatever edition a phone points at. A label nobody maintains is not
// a fact about the tournament — it is a fact about which code path created the
// row.
//
// A count and a finalization map cannot drift that way. Sixteen players with
// thirteen hundred scores and every round signed off IS a finished tournament,
// whatever the row says, and that is the answer the delete guard needs to be
// right about.
// `roundCount` arrives already resolved (lib/editions.js clamps it off
// tournament_state.meta) so this file stays free of the app's constants and a
// caller can hand it any tournament shape it likes.
import { roundFinalized } from "./groupSwitch";

// The states, in the order a year passes through them. `unknown` is not one of
// them — it means the counts could not be read, and is handled separately
// everywhere precisely because it is not a state the tournament is in.
export const EDITION_STATES = ["empty", "setup", "live", "complete"];

// Is every round of this tournament done?
//
// `roundFinalized` is the app's own answer, reused rather than re-derived: a
// round ends either because the director finalized it from Admin (which stores
// the ROUND NUMBER) or because every group signed its own card (which stores a
// GROUP KEY each). A guard that knew about only one of those would call a
// finished tournament unfinished and offer to delete it.
//
// A tournament with no round count resolved is never complete — better to
// treat an unreadable year as still running than to call it finished.
export const allRoundsFinalized = ({ roundCount, finalizedRounds, pairings } = {}) => {
  const n = Number(roundCount) || 0;
  if (n <= 0) return false;
  for (let r = 1; r <= n; r++) {
    if (!roundFinalized(finalizedRounds || {}, pairings || {}, r)) return false;
  }
  return true;
};

// summary — what lib/editions.js counted for this edition:
//   { players, rounds, scores, roundCount, finalizedRounds, pairings }
// The last three are only gathered for a year that has scores; a year nobody
// has played cannot be finished, so there is nothing to ask about it.
export const editionState = (summary) => {
  if (!summary) return "unknown";
  const n = (v) => Number(v) || 0;
  const scores = n(summary.scores);
  if (!scores) return (n(summary.players) || n(summary.rounds)) ? "setup" : "empty";
  return allRoundsFinalized(summary) ? "complete" : "live";
};

export const STATE_LABEL = {
  empty: "Empty",
  setup: "Not started",
  live: "In progress",
  complete: "Complete",
  unknown: "Couldn't read",
};

// ── May this year be deleted? ──────────────────────────────────────
// Deleting an edition takes every score in it with it, and a tournament's
// scores are the only record that it happened — the spreadsheets they were
// reconciled against are a separate artefact that nothing here writes back to.
// So the answer is graded by what would actually be lost:
//
//   active     no. Pulling the running app's data out from under itself leaves
//              a director staring at an empty tournament with no way back.
//   complete   NO, and not behind a confirm either. A finished tournament is
//              the record of a finished tournament; there is no version of
//              "are you sure" that makes destroying one a thing the app should
//              help with. Bin it from the Firebase console if it truly must go.
//   unknown    no. We could not read what is in there, and "I could not check"
//              is not permission — it is the strongest reason to refuse.
//   live       yes, but this is the dangerous one: scores made on the course
//              this week, and no confirm that says "Delete" in the abstract is
//              going to be read. The caller is expected to name the count.
//   setup      yes. A roster and a draw, both re-creatable in minutes.
//   empty      yes. Nothing is lost.
export const deleteVerdict = (state, { isActive = false, isSandbox = false } = {}) => {
  if (isActive) return { allowed: false, reason: "active", why: "This is the tournament the app is showing. Open another year first." };
  // ── The sandbox is disposable by definition ──
  // Every refusal below is about a RECORD: a finished tournament is the record
  // of the event, and a year we could not read might be one. The sandbox is
  // neither. It is a scratch copy that exists to be played with and thrown
  // away, and testers filling it with four finished rounds — which is exactly
  // what a good beta test looks like — would otherwise make it permanent, in
  // the app, with the only way out being the Firestore console.
  //
  // Still refused while it is ACTIVE, above: deleting the edition the app is
  // currently showing is a different bug and the sandbox is not exempt from it.
  if (isSandbox) return { allowed: true, reason: "sandbox", grave: false };
  if (state === "complete") return { allowed: false, reason: "complete", why: "Finished tournaments can't be deleted — this is the record of the event." };
  if (state === "unknown") return { allowed: false, reason: "unknown", why: "Couldn't read what's in this year, so it won't be deleted." };
  if (state === "live") return { allowed: true, reason: "live", grave: true };
  return { allowed: true, reason: state, grave: false };
};

// ── What the picker draws on a row, and what the sheet offers ───────
// Ported from Bourbon Cup, which reworked its own picker first. Both apps had
// the same failure at a 320pt viewport — a row carrying five or six things
// with the identifying part squeezed — and both landed on the same shape: the
// row states, the sheet acts.
//
// These live here rather than in the component because each one decides
// whether something RENDERS AT ALL, which is the class of bug a screenshot
// catches a week late and a test catches instantly.

// The name, but only when it says something the year does not.
//
// Sixteen editions called "WBC ####" printed beside a bold year is the same
// word sixteen times. A tournament somebody actually named is the case worth
// the space, and it is the case this detects.
//
// An EXACT match against the app's own title, not "does the name end in the
// year". The looser rule was tried in the other app and it is wrong in the
// direction that loses information: a year named "Bandon Dunes 2024" comes
// back as a bare numeral. The title is passed in so the helper is portable —
// Bourbon Cup's tournament is not called WBC.
//
// Compared case- and whitespace-insensitively, because `createEdition` writes
// `WBC ${year}` itself but a director retyping it by hand should not get the
// year twice over a stray double space.
const flat = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export const editionDisplayName = (edition, title = "WBC") => {
  const name = String(edition?.name ?? "").trim();
  if (!name) return null;
  const year = String(edition?.year ?? "").trim();
  if (!year) return name;               // the sandbox: no year to be redundant with
  if (flat(name) === flat(year)) return null;
  if (title && flat(name) === flat(`${title} ${year}`)) return null;
  return name;
};

// ── Is this year closed to members? ────────────────────────────────
// The app's copy of `editionFinished()` in firestore.rules, and it exists so
// the app can SAY what the rules are about to do. A tournament with every
// round signed off refuses member writes whether or not anybody locked it, and
// a refused write is otherwise silent — scores that vanish on a tee box with
// nothing on screen explaining why is the failure the lock banner exists for.
//
// Counted the way the rules count it, deliberately, rather than the way
// `allRoundsFinalized` does: only ROUND NUMBERS in the finalization map, never
// a round closed by every group signing its card. The rules cannot see a group
// key, so a year finished that way still takes writes — and a notice claiming
// otherwise would be telling somebody the door is shut while it is open.
//
// Zero rounds is never closed: a year whose round count could not be read is
// one we know nothing about, and that has to fall the same way the rule does.
export const editionClosedToMembers = ({ finalizedRounds, roundCount } = {}) => {
  const n = Number(roundCount) || 0;
  if (n <= 0) return false;
  const rounds = Object.keys(finalizedRounds || {}).filter(k => /^\d+$/.test(String(k)));
  return rounds.length >= n;
};

// ── What may be done to this year ──────────────────────────────────
// One place, so the sheet and any future caller agree — and so the REFUSALS
// come with their sentence attached.
//
// That last part is the reason this exists at all. `deleteVerdict` has always
// returned a `why` for every year it refuses ("Finished tournaments can't be
// deleted — this is the record of the event"), and the picker has never had
// anywhere to put it: the row drew no bin and left the director to infer the
// rule from an absence. The sheet has room for a sentence, so the sentence
// finally gets shown.
//
// `canManage` is the same non-boundary it is everywhere else here —
// firestore.rules is what actually allows a write to wbc_editions. This only
// decides what a person is offered, so nobody is handed a tap that comes back
// refused.
export const editionActions = ({
  edition, state = "unknown", isActive = false, isSandbox = false, canManage = false,
} = {}) => {
  const verdict = deleteVerdict(state, { isActive, isSandbox });
  return {
    // Nowhere to go: you are already in it.
    open: !isActive,
    // A name is a label on a row; it files nothing and breaks nothing, so
    // every year a director can manage may be renamed — including the one
    // they are standing in, and including a locked one. The lock freezes what
    // is IN a tournament (see editionLock); what it is called is not that.
    rename: canManage,
    lock: canManage,
    locked: edition?.locked === true,
    delete: canManage && verdict.allowed,
    // Scores made on the course this week. The caller names the count.
    graveDelete: canManage && verdict.allowed && verdict.grave === true,
    // The sentence the row could only express by drawing nothing — but only
    // when it says something a director can act on or needs to know: "open
    // another year first" is a next step, and "couldn't read what's in this
    // year" is a warning that the sheet above it may be wrong too.
    //
    // A FINISHED tournament refusing the bin is neither. It is the rule of the
    // app, it is obvious from the year on the sheet, and printing it under
    // every one of sixteen finished years is a paragraph explaining an absence
    // nobody asked about.
    deleteWhy: canManage && !verdict.allowed && verdict.reason !== "complete" ? verdict.why : null,
  };
};
