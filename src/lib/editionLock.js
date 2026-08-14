// ══════════════════════════════════════════════════════════════════
//  editionLock — freezing a tournament year against everybody but a
//  director.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React. `editions.js` does the write and
// `firestore.rules` does the enforcing; this file decides what the control
// means and what it says before it is tapped.
//
// ── Why this one is STORED, when editionLifecycle's state is derived ──
// lib/editionLifecycle.js goes to some length to explain why a year's state is
// counted from what it holds rather than read off a label, and it is right:
// "is this tournament finished" is a fact about the data, and a label nobody
// maintains drifts away from it.
//
// A LOCK is not that kind of thing. It is not a fact about the tournament, it
// is an INTENTION about it — "nobody may write here for now" — and there is
// nothing to count that would reveal it. Two years with identical contents can
// differ only in whether the director wants one of them touched. So it is
// stored, on the edition document, and it is the one field on that row that
// something actually reads.
//
// ── What it is for ──
// The immediate reason is beta testing. Handing twelve Play testers the
// tournament password is the only way they can exercise the app, and a
// membership is not edition-scoped: firestore.rules gates writes on being a
// member, full stop, and the Tournaments list is offered to every member.
// So a tester can switch to the live tournament and post a score into it.
// Locking the live year is what makes a test edition safe to hand out.
//
// The lasting reason is that a finished tournament should stop moving. 2019 is
// over; nothing should be able to edit a card in it, least of all by accident
// on a phone somebody left on the Scoring tab.
//
// ── What a lock does NOT do ──
// It does not hide the year, and it does not stop reading. Every leaderboard,
// card and photo in a locked edition stays visible to everybody, guests
// included — freezing a tournament is not the same as hiding it.
//
// A DIRECTOR IS EXEMPT, in the rules and here. Somebody has to be able to fix
// a locked year, and the alternative is a flag that can strand a tournament
// nobody can correct.

// Missing, false, null and "not an edition at all" are all UNLOCKED. The
// default has to fall that way: every edition document written before this
// field existed has no `locked` on it, and a default of true would freeze
// seventeen years of tournaments the moment this deployed.
export const isEditionLocked = (edition) => edition?.locked === true;

// ── What the director is about to do, in words ─────────────────────
// Returned rather than written inline at the call site so the dangerous case
// can be tested, because it is the one that is easy to get wrong and
// expensive to discover: locking the year the app is CURRENTLY SHOWING stops
// scoring for everybody on it, immediately, and the person doing it is the
// one member who will not notice — a director is exempt, so their own writes
// keep working.
//
// Unlocking never asks. It only ever widens what is possible, and a control
// that interrogates you for undoing something makes people leave it alone.
export const lockVerdict = (edition, { isActive = false } = {}) => {
  const locked = isEditionLocked(edition);
  const year = edition?.year ?? edition?.id ?? "this year";

  if (locked) {
    return {
      next: false,
      confirm: null,
      label: "Unlock",
      title: `Unlock ${year} so members can write to it again`,
    };
  }

  return {
    next: true,
    label: "Lock",
    title: `Lock ${year} so only a director can change it`,
    confirm: {
      title: `Lock ${year}?`,
      body: isActive
        // The active edition is what every phone in the field is pointed at.
        ? `${year} is the tournament the app is showing right now. Locking it stops `
          + `scoring, signing and betting for everybody on it — their writes will be `
          + `refused, not queued. You will not see it happen: directors are exempt.`
        : `Nobody but a director will be able to post a score, sign a card or place a `
          + `bet in ${year}. Reading is unaffected — the leaderboard, the cards and the `
          + `photos stay visible to everyone.`,
      confirmLabel: "Lock it",
    },
  };
};

// The one-word state for a row in the list. Null when there is nothing to say,
// so a caller can render nothing rather than an empty badge.
export const lockBadge = (edition) => (isEditionLocked(edition) ? "LOCKED" : null);

// Shown on the tournament itself, not in the picker: what a member should be
// told when the year they are looking at will not accept their writes. Null
// for an unlocked edition, and null for a director, who is exempt and would
// otherwise be warned about a wall that is not there for them.
export const lockNotice = (edition, { isDirector = false } = {}) => {
  if (!isEditionLocked(edition) || isDirector) return null;
  const year = edition?.year ?? edition?.id ?? "This tournament";
  return `${year} is locked. Scores, signatures and bets can't be changed — ask a director.`;
};
