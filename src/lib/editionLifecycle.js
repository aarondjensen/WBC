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
export const deleteVerdict = (state, { isActive = false } = {}) => {
  if (isActive) return { allowed: false, reason: "active", why: "This is the tournament the app is showing. Open another year first." };
  if (state === "complete") return { allowed: false, reason: "complete", why: "Finished tournaments can't be deleted — this is the record of the event." };
  if (state === "unknown") return { allowed: false, reason: "unknown", why: "Couldn't read what's in this year, so it won't be deleted." };
  if (state === "live") return { allowed: true, reason: "live", grave: true };
  return { allowed: true, reason: state, grave: false };
};
