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

import { isSandboxEdition } from "./editionId";

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

// ── Every year at once ─────────────────────────────────────────────
// Seventeen editions is seventeen taps, and the whole point of the padlock is
// a setup a director does once before handing the app to testers: freeze the
// history, leave the sandbox open. Doing that one row at a time is the kind of
// chore that gets abandoned halfway, which leaves exactly the hole the lock
// was for.
//
// ONE BUTTON, and what it offers depends on where things stand: while any
// other year is open it locks them, and once they are all shut the same slot
// unlocks everything — because "lock all but the active year" with nothing
// left to lock is a dead control, and a dead control is worse than a different
// one.
//
// THE ACTIVE YEAR IS NEVER TOUCHED, in either direction. It is the tournament
// being played; freezing it is a thing a director might well want, but never
// as a side effect of tidying up the other sixteen. The single padlock on its
// own row is where that decision belongs, and it asks first.
//
// BOTH DIRECTIONS ASK HERE, which is where this parts company with the single
// toggle above. That one lets an unlock through without a question because
// tapping it again puts the year back exactly as it was. A bulk action has no
// such undo: it flattens whatever pattern of locks was there, and once
// "unlock all" has run, nothing remembers which years were frozen a moment
// ago. Re-locking is not an undo, it is a different arrangement.
//
// Null when there is nothing to offer — one edition, or none — so the caller
// renders no button rather than a disabled one.
export const bulkLockVerdict = (editions = [], activeId = null) => {
  // THE SANDBOX IS NEVER IN IT, in either direction, and this is the exclusion
  // the whole workflow turns on. The sequence a director actually runs is
  // "cut a sandbox, lock the history, hand out the link" — and if the sandbox
  // were swept up by "lock all but the active year" while they happened to be
  // standing on 2026, the testers would be handed a tournament that refuses
  // every tap. It is a scratch copy; freezing it is not a thing that means
  // anything. The padlock on its own row still works if somebody wants it.
  const others = (editions || [])
    .filter(e => e?.id && e.id !== activeId && !isSandboxEdition(e.id));
  if (!others.length) return null;

  const active = (editions || []).find(e => e?.id === activeId) || null;
  const activeYear = active?.year ?? null;
  const open = others.filter(e => !isEditionLocked(e));
  const n = (c) => `${c} ${c === 1 ? "year" : "years"}`;

  if (open.length) {
    return {
      next: true,
      ids: open.map(e => e.id),
      // "Lock every other year" was the fallback here, and on a phone it reads
      // as ALTERNATING years rather than "all the others" — which is the one
      // reading that would make a director hesitate over a button that locks
      // sixteen tournaments. It is also the label the sandbox always gets,
      // since the sandbox has no year to name: the common case, not the rare
      // one.
      label: activeYear ? `Lock all but ${activeYear}` : "Lock every tournament year",
      confirm: {
        title: `Lock ${n(open.length)}?`,
        body: `Only a director will be able to change ${open.length === 1 ? "it" : "them"}.`
          + (activeYear ? ` ${activeYear} stays open — it is the tournament being played.` : "")
          + ` Reading is unaffected: every leaderboard, card and photo stays visible to everyone.`,
        confirmLabel: `Lock ${n(open.length)}`,
      },
    };
  }

  return {
    next: false,
    ids: others.map(e => e.id),
    label: "Unlock all",
    confirm: {
      title: `Unlock ${n(others.length)}?`,
      body: `Every member will be able to post scores, sign cards and place bets in `
        + `${others.length === 1 ? "it" : "all of them"} again. Nothing remembers which years `
        + `were locked, so this cannot be undone by locking them back.`,
      confirmLabel: `Unlock ${n(others.length)}`,
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
