// ══════════════════════════════════════════════════════════════════
//  Side bets — the wagers the app does not run
// ══════════════════════════════════════════════════════════════════
//
// Ported from The Bourbon Cup, where it is the fourth tab of the same screen.
//
// Skins, CTP, low net and the market are games the app SCORES: it knows the
// rules, reads the cards and works out who won. A side bet is the opposite.
// Two players agree something between themselves on the first tee — closest on
// 17, first to break 90, a press on the back — and the app has no idea what any
// of that means and should not pretend to.
//
// So this is a LEDGER, not a game. It records who, against whom, for how much
// and on what terms, and it settles nothing. The terms are free text on
// purpose: every attempt to enumerate the shapes a bar bet can take ends with
// somebody's bet not fitting the form, and then it lives on a napkin again,
// which is the thing this replaces.
//
// It is also the one thing on the Betting tab with NO POT. Every other game
// there is counted from the director's buy-in sheet and paid out of one pile;
// a side bet is two men and a handshake, and no money passes through anybody
// collecting. That is why nothing here divides, and why the header card counts
// exposure rather than a pot.
//
// ── What is trusted and what is not ───────────────────────────────
// `created_by` is an auth uid and is pinned by firestore.rules to the caller's
// own — it is the field the delete rule trusts, so it has to be unforgeable at
// the moment it is written, exactly like `uploadedBy` on a photo.
//
// `player_a` / `player_b` are ROSTER ids, and the rules do not check them
// either way. WBC can map a uid to a player (see myPlayerId() in
// firestore.rules, which the market already leans on), and the settle rule uses
// it — but nothing stops a member logging a bet between two other people,
// because that is a thing somebody standing at the bar with a phone genuinely
// does. The record is public to the whole field, so a bet nobody agreed to is a
// bet with two names on it in front of everybody who would know better. Sixteen
// people at a golf course; visibility is the enforcement.
export const SIDE_BETS_COL = "wbc_side_bets";

// Free text, capped. See buildSideBet for why.
export const MAX_DETAIL = 280;

// One id per bet, and it has to be unique across a field of phones creating
// them at the same time on the same tee. Time alone is not: two players tapping
// Save in the same millisecond would collide and one bet would silently
// overwrite the other. The random tail is what makes that a non-event.
//
// Deliberately NOT edition-namespaced the way docIds mints a scorecard
// signature: the random tail already makes a collision with a cloned year's
// impossible, and `tournament_id` is what scopes the row.
export const sideBetId = (now, rand) =>
  `wbc_sidebet_${now}_${Math.floor(rand * 1e6).toString(36)}`;

// What the form has to be able to say NO to, in the order a person fills it
// in. Returns a message or null — the caller shows the first thing wrong
// rather than a list, because a two-field form with three errors on it is a
// form somebody closes.
export const sideBetError = ({ playerA, playerB, amount }) => {
  if (!playerA || !playerB) return "Pick both players.";
  if (playerA === playerB) return "A bet needs two different players.";
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return "Enter an amount.";
  return null;
};

// The document, built from a validated form. Kept here rather than in the
// component so the shape has one author and the tests can see it.
export const buildSideBet = ({
  id, tournamentId, createdBy, playerA, playerB, amount, detail, now,
}) => ({
  id,
  tournament_id: tournamentId,
  // The uid, not the roster id — see the note above on what the rules can
  // actually check.
  created_by: createdBy,
  player_a: playerA,
  player_b: playerB,
  amount: Number(amount),
  // Trimmed and capped. Free text that can grow without limit is free text
  // that eventually arrives as a wall on a phone screen, and the terms of a
  // golf bet have never needed a second paragraph.
  detail: String(detail || "").trim().slice(0, MAX_DETAIL),
  // Nobody has said it is paid yet, and a new bet says so explicitly rather
  // than by omission. Bets written before settling existed have no field at
  // all; settledBy() reads both as the same empty answer.
  settled_by: [],
  created_at: now,
});

// ── Settling ──────────────────────────────────────────────────────
// A bet is settled when BOTH players say it is, and not before. One player
// marking it paid is a claim; the other agreeing is the record.
//
// That asymmetry is the whole reason this is a two-sided mark rather than a
// `settled: true` boolean. A boolean would let whoever tapped first close the
// bet on the other's behalf, and the argument this feature exists to prevent
// is exactly "I paid you" / "no you didn't". With two marks the disagreement
// stays visible on the row instead of being resolved by whoever was quicker.
//
// The marks are ROSTER ids, not auth uids — the same identity the rest of the
// tournament is played in, and what myPlayerId() resolves a phone to.
export const settledBy = (bet) =>
  Array.isArray(bet?.settled_by) ? bet.settled_by : [];

export const hasSettled = (bet, pid) => !!pid && settledBy(bet).includes(pid);

// Both sides, and only the two sides. A stray id — from a player swapped out
// of a bet that was edited, say — must not be able to settle it on its own.
export const isSettled = (bet) =>
  !!bet && hasSettled(bet, bet.player_a) && hasSettled(bet, bet.player_b);

// A player's own mark, toggled. Returns the next array, deduped, and never
// carrying an id that is not one of the two players — so a withdrawn mark
// leaves nothing behind and a re-mark cannot stack.
//
// An ARRAY, and that is load-bearing rather than incidental: db.upsert merges,
// and a map would merge key by key and keep a mark the caller meant to remove.
// Same reason the market's lots are an array. See lib/db.
export const toggleSettled = (bet, pid) => {
  const sides = [bet?.player_a, bet?.player_b];
  const current = settledBy(bet).filter(id => sides.includes(id));
  if (!sides.includes(pid)) return current;
  return current.includes(pid)
    ? current.filter(id => id !== pid)
    : [...current, pid];
};

// Is this player in this bet? Both sides, because "my bets" means bets I am
// ON, not bets I typed in.
export const inSideBet = (bet, pid) =>
  !!pid && (bet.player_a === pid || bet.player_b === pid);

// What the row should say to THIS reader, in one word the screen can switch
// on. Kept here rather than in the component so the states are enumerable and
// testable, and so a new one cannot be added on screen without being named.
//
//   settled   both sides have marked it — done
//   waiting   you marked it, the other player has not
//   confirm   they marked it, it is your turn — the only state that asks
//             anything of the reader
//   open      neither side has marked it
//   watching  you are not in this bet; the states above are not yours to act
//             on, and it still says where the bet has got to
export const settleState = (bet, pid) => {
  if (isSettled(bet)) return "settled";
  if (!inSideBet(bet, pid)) return "watching";
  const other = bet.player_a === pid ? bet.player_b : bet.player_a;
  if (hasSettled(bet, pid)) return "waiting";
  if (hasSettled(bet, other)) return "confirm";
  return "open";
};

// Newest first, but SETTLED BETS SINK. A ledger is read for what is still
// owed, and a weekend's worth of squared-up bets sitting between the live
// ones is the pile of paper this replaces. Within each group it is still
// newest first, so the one just made is still at the top of the list that
// matters.
export const sortSideBets = (bets) =>
  [...bets].sort((a, b) =>
    (isSettled(a) ? 1 : 0) - (isSettled(b) ? 1 : 0)
    || (b.created_at || 0) - (a.created_at || 0));

// The header card's three numbers. `mine` is EXPOSURE — what this player has
// riding, win or lose — not a net position, because nothing here knows who
// won. Calling it anything else would be the screen claiming knowledge it
// does not have.
export const sideBetTotals = (bets, pid) => {
  let atStake = 0, mine = 0;
  bets.forEach(b => {
    const amt = Number(b.amount) || 0;
    atStake += amt;
    if (inSideBet(b, pid)) mine += amt;
  });
  return { atStake, count: bets.length, mine };
};

// Who may remove one. Mirrors the `delete` rule in firestore.rules exactly —
// the person who logged it, or a director cleaning up. Anybody else gets no
// affordance, which is the honest thing to show: a button that only fails is
// worse than no button.
//
// Deliberately NOT "either player in the bet". The other side of a bet you
// dispute is not yours to erase — that is an argument to have on the tee, and
// the director is the one who settles those here as everywhere else.
export const canDeleteSideBet = (bet, { uid, isDirector }) =>
  !!bet && (isDirector === true || (!!uid && bet.created_by === uid));

// ── Editing ───────────────────────────────────────────────────────
// A bet is written down on a tee box, one-handed, often by whichever of the
// two got their phone out first — so the terms arrive wrong more often than
// any other record in this app. Twenty becomes two hundred, the wrong Dave
// gets picked off a list of sixteen, and the detail says "back" when the bet
// was the front. Without an edit the fix is delete and retype, which only the
// author can do at all, and which loses the settle marks and the row's place
// in the ledger along with the typo.
//
// Who may: a director, the person who logged it, and — unlike deleting —
// EITHER PLAYER IN IT. That asymmetry is deliberate. Deleting a bet you
// dispute erases the argument; correcting one you are a side of is the
// argument, held in front of the whole field, on a row both names are on.
// Sixteen people at a golf course: visibility is the enforcement, exactly as
// it is for who may log a bet in the first place.
//
// Mirrors the `update` clause in firestore.rules. An affordance the rules
// would refuse is worse than no affordance.
export const canEditSideBet = (bet, { uid, pid, isDirector }) =>
  !!bet && !!uid && (isDirector === true
    || bet.created_by === uid
    || inSideBet(bet, pid));

// The patch a save writes, from the same validated form the add sheet fills.
// Deliberately NOT the whole document: `id` addresses the row, and everything
// the caller has no business moving — `tournament_id`, `created_by`,
// `created_at` — is absent rather than written back, so a merge cannot carry a
// stale copy of it over the truth.
export const buildSideBetEdit = (bet, { playerA, playerB, amount, detail }) => {
  const next = {
    id: bet.id,
    player_a: playerA,
    player_b: playerB,
    amount: Number(amount),
    detail: String(detail || "").trim().slice(0, MAX_DETAIL),
  };
  // WHO is in it and WHAT IT IS WORTH are the two things a "paid" mark was
  // about. Move either and the marks are a claim about a bet that no longer
  // exists — so they go, and both sides say it again against the new terms.
  // A wording fix is not that: the detail getting clearer does not un-pay
  // anybody, and clearing a settled row for a typo would be the app picking
  // an argument nobody was having.
  const moved = next.player_a !== bet.player_a
    || next.player_b !== bet.player_b
    || next.amount !== (Number(bet.amount) || 0);
  // An array, and written every time — see toggleSettled for why a map would
  // merge the removed marks straight back in.
  next.settled_by = moved
    ? []
    : settledBy(bet).filter(id => [next.player_a, next.player_b].includes(id));
  return next;
};

// ── Running it back ───────────────────────────────────────────────
// A settled bet is the end of one wager and, at a golf tournament, very often
// the start of the next one: the money changes hands on the 18th green and
// somebody says "again tomorrow, double". Retyping it is four fields and two
// name pickers on a phone in a car park, which is exactly the friction that
// sends a bet back onto a napkin.
//
// A REPEAT IS A NEW BET, not a resurrection of the old one. The settled row
// stays settled and stays on the board — it is the record that the first
// wager was paid, and reopening it to run it again would erase the one thing
// the ledger is for. Nothing links the two rows either: a chain of rematches
// is a thing to read down the list, not a structure the ledger has to carry.
//
// Only on a bet that is actually finished. A live bet already exists; the
// button on it would be a way to accidentally have the same wager twice.
export const canRepeatSideBet = (bet, { uid, pid }) =>
  !!uid && isSettled(bet) && inSideBet(bet, pid);

// The same terms, in the shape the form holds them — a string amount, because
// that is what an input has and Number() is buildSideBet's job. It seeds the
// sheet rather than writing anything: the rematch is usually the same bet
// with the stakes moved, and the tap that opens it is not the tap that agrees
// to it.
export const repeatSideBetSeed = (bet) => ({
  playerA: bet?.player_a || "",
  playerB: bet?.player_b || "",
  amount: bet?.amount == null ? "" : String(bet.amount),
  detail: String(bet?.detail || ""),
});
