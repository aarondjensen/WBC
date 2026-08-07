// ══════════════════════════════════════════════════════════════════
//  market — the shares game.
// ══════════════════════════════════════════════════════════════════
//
// The third side game, and the only one that is not derived from a scorecard.
// Skins fall out of the cards and CTP is tagged on the course; this one is a
// BET, placed by a player on another player, before the shot that decides it
// has been hit.
//
// The rules, as they are played:
//
//   • Everybody in the game gets 20 shares BEFORE the tournament starts, to
//     spread across any combination of golfers they like. All 20 on one name,
//     one each on twenty names, anything between.
//   • After the halfway round is complete — half the tournament's worth of
//     information — the same people get 10 MORE shares to place, knowing what
//     the board looks like.
//   • The pot is divided by the total shares held on the golfer who wins the
//     tournament, and each holder takes their share of it.
//
// So the second window is the whole point of the game: the opening 20 are a
// guess, and the closing 10 are a correction bought with two rounds of
// evidence. That is also why the windows have to CLOSE on something
// unambiguous, and why they close on scores rather than on a director's
// switch — a share placed on the leader after the leader is known is not a
// bet, and nobody wants to argue about when the window shut.
//
// Everything here is pure so it can be tested without Firebase. The storage
// shape (documents in `skins` with skin_type "market") lives in App.jsx; this
// module only ever sees the parsed bets.

// ── The two windows ────────────────────────────────────────────────
export const MARKET_OPENING_SHARES = 20;
export const MARKET_MID_SHARES = 10;
// The round whose completion opens the second window. Two rounds in is
// "half the tournament" for the four-round event WBC actually plays; a
// shorter event clamps below (see midRoundFor) so the second window can
// never open on the last round, when there is nothing left to bet on.
export const MARKET_MID_ROUND = 2;

// The halfway round for an event of `numRounds`. Null when the event is too
// short to have one — a two-round tournament's "halfway" is its final round,
// and re-opening the market there would be betting on a finished board.
export const midRoundFor = (numRounds) => {
  const n = Number(numRounds) || 0;
  if (n < 3) return null;
  return Math.min(MARKET_MID_ROUND, n - 1);
};

// ── Lots ───────────────────────────────────────────────────────────
// A window's allocation is an ARRAY of { pid, shares } rather than a map
// keyed by player id. Firestore's setDoc(merge:true) merges maps field by
// field, so a golfer dropped to zero would keep their old value forever;
// an array is replaced wholesale, which is what "this is my portfolio now"
// means.

// Positive whole shares only, one lot per golfer, biggest holding first.
// Called on the way in AND on the way out, so a hand-edited document and a
// freshly saved one read the same.
export function normalizeLots(lots) {
  const totals = new Map();
  (lots || []).forEach(l => {
    const pid = l?.pid;
    const n = Math.floor(Number(l?.shares) || 0);
    if (!pid || n <= 0) return;
    totals.set(pid, (totals.get(pid) || 0) + n);
  });
  return [...totals.entries()]
    .map(([pid, shares]) => ({ pid, shares }))
    .sort((a, b) => b.shares - a.shares || String(a.pid).localeCompare(String(b.pid)));
}

export const totalShares = (lots) =>
  (lots || []).reduce((sum, l) => sum + (Math.floor(Number(l?.shares) || 0) > 0 ? Math.floor(Number(l.shares)) : 0), 0);

export const sharesOn = (lots, pid) =>
  (lots || []).filter(l => l?.pid === pid).reduce((sum, l) => sum + (Math.floor(Number(l.shares)) || 0), 0);

// Set one golfer's holding, capped so a window can never be overspent. The
// cap is computed against the OTHER lots, not against the current total, so
// dragging a holding up and back down doesn't strand shares.
export function setLotShares(lots, pid, shares, cap) {
  const clean = normalizeLots(lots);
  const others = clean.filter(l => l.pid !== pid);
  const room = cap == null ? Infinity : Math.max(0, cap - totalShares(others));
  const n = Math.max(0, Math.min(room, Math.floor(Number(shares) || 0)));
  return normalizeLots(n > 0 ? [...others, { pid, shares: n }] : others);
}

// ── Where the tournament has got to ────────────────────────────────
// Both read the cards rather than the finalize flags. `finalizedRounds` is
// keyed by round number from Admin and by GROUP KEY from the scoring screen,
// so "is round 2 finalized" is not a question it can answer on its own — and
// a window that opened on one device and not another would be worse than one
// that opens a few minutes late.

export const roundStarted = (holeData, players, round) =>
  (players || []).some(p => Object.values((holeData || {})[`${p.id}_${round}`] || {}).some(v => v > 0));

// Complete = everybody who posted a score in the round posted all 18. A
// player who never teed off is not holding the round open (a withdrawal
// mid-event is normal); a group still out on 14 is.
export function roundComplete(holeData, players, round) {
  const started = (players || []).filter(p =>
    Object.values((holeData || {})[`${p.id}_${round}`] || {}).some(v => v > 0));
  if (started.length === 0) return false;
  return started.every(p => {
    const scores = (holeData || {})[`${p.id}_${round}`] || {};
    for (let h = 0; h < 18; h++) if (!(scores[h] > 0)) return false;
    return true;
  });
}

// ── When the bell rings ────────────────────────────────────────────
// The opening window shuts at the FIRST TEE TIME of round one, not at the
// first score posted in it.
//
// Scores were the wrong signal. The first group tees off at 7:00 and does not
// post a hole for twenty minutes; in that gap the 8:30 group is still in the
// car park with the board in front of them and the market wide open. Worse,
// a group that forgets to score keeps it open for everybody. A clock closes
// on the whole field at once, which is what "before the tournament starts"
// has always meant.
//
// Returns a timestamp in LOCAL time, because a tee time is local to the
// course and the phones reading it are standing on it. Null when the round
// has no date or no tee sheet yet — see marketWindows for what happens then.
//
// `minutesList` is minutes-since-midnight, already parsed, so this stays pure
// and the app's one tee-time parser stays in the app.
export function teeOffAt(dateStr, minutesList) {
  const mins = (minutesList || []).filter(m => Number.isFinite(m));
  const d = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d || mins.length === 0) return null;
  const first = Math.min(...mins);
  return new Date(+d[1], +d[2] - 1, +d[3], Math.floor(first / 60), first % 60).getTime();
}

// ── The clock on the wall ──────────────────────────────────────────
// How long is left, broken up and pre-formatted. A deadline printed as a time
// of day makes a player do arithmetic against their own watch; a countdown
// answers the only question they actually have, which is whether there is
// still time to think about it.
//
// Rounded UP to the second, so the last tick reads 0:01 and not 0:00 — a
// market that says nothing is left while it is still taking shares is lying
// about the more important of the two.
//
// The label changes shape with the scale, because "37h 12m 04s" is precision
// nobody can use and "2224:04" is not a number at all:
//
//   days out    2d 5h      — the shape of a plan
//   hours out   5h 12m     — the shape of a morning
//   under 1h    12:04      — the shape of a decision, ticking
export function countdown(msLeft) {
  const total = Math.max(0, Math.ceil((msLeft ?? 0) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const label = total <= 0 ? "Closed"
    : days > 0 ? `${days}d ${hours}h`
    : hours > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m`
    : `${mins}:${String(secs).padStart(2, "0")}`;
  // `urgent` is the last hour — the point at which the screen should stop
  // being informative and start being a warning, and also the point at which
  // the seconds are worth ticking.
  return { total, days, hours, mins, secs, label, urgent: total > 0 && total <= 3600, done: total <= 0 };
}

// How often the screen has to repaint to keep that label honest. Under an
// hour the seconds are moving and it needs one a second; above it the label
// only turns over each minute, so thirty seconds is already twice as often as
// it can possibly change. Nobody needs a per-second interval running through
// a Thursday night to keep "2d 5h" up to date.
export const countdownTick = (msLeft) => ((msLeft ?? 0) <= 3600_000 ? 1000 : 30_000);

// ── The windows, given where play has got to ───────────────────────
// Each returns { key, label, shares, open, closed, note } — `note` is the
// one-line explanation the screen shows when a window is shut, because
// "you cannot place these yet" and "you left these on the table" are very
// different messages to a player holding unspent shares.
export function marketWindows({ holeData, players, numRounds, firstTeeAt = null, now = null }) {
  const midRound = midRoundFor(numRounds);
  const started1 = roundStarted(holeData, players, 1);
  // The bell. A score in round 1 still shuts the window as a backstop — a
  // tournament with no date or no tee sheet has no bell to ring, and one
  // that is already being played must not have an open market whatever the
  // clock says.
  const belled = firstTeeAt != null && now != null && now >= firstTeeAt;
  const shut = belled || started1;

  const opening = {
    key: "opening",
    label: "Opening bell",
    shares: MARKET_OPENING_SHARES,
    open: !shut,
    closed: shut,
    at: firstTeeAt,
    note: shut ? "Closed — tournament in progress."
      : firstTeeAt != null ? "Open until the first tee time."
      : "Open until the first score of Round 1.",
  };

  if (midRound == null) {
    return {
      opening,
      mid: {
        key: "mid", label: "Halfway", shares: MARKET_MID_SHARES,
        open: false, closed: true, exists: false,
        note: "This event is too short for a second window.",
      },
    };
  }

  const midDone = roundComplete(holeData, players, midRound);
  const nextStarted = roundStarted(holeData, players, midRound + 1);
  return {
    opening,
    mid: {
      key: "mid",
      label: `After Round ${midRound}`,
      shares: MARKET_MID_SHARES,
      exists: true,
      round: midRound,
      open: midDone && !nextStarted,
      closed: nextStarted,
      note: nextStarted
        ? `Closed — Round ${midRound + 1} is under way.`
        : midDone
          ? `Open until the first score of Round ${midRound + 1}.`
          : `Opens when Round ${midRound} is complete.`,
    },
  };
}

// ── Reading a bet ──────────────────────────────────────────────────
// A bet document holds the two windows separately, because they close
// separately: once the opening window shuts, those 20 are settled and only
// the second array can still move.
export const lotsFor = (bet, key) => normalizeLots(key === "mid" ? bet?.mid : bet?.opening);
export const allLots = (bet) => normalizeLots([...(bet?.opening || []), ...(bet?.mid || [])]);

// Bets that count: everybody still in the market game. A player the director
// has taken out of the market entirely stops holding shares, which is the one
// case where the board would otherwise disagree with the pot.
//
// `inMarket` is a predicate so the caller keeps the null-means-everybody rule
// in one place (see lib/sideGames fieldFor).
export const eligibleBets = ({ bets, inMarket }) => (bets || []).filter(b => inMarket(b.pid));

// How many of the opening 20 a player has NOT placed yet. Zero once the book
// is full, and 20 for somebody who has never opened it.
//
// This is what the nudge on the Betting tab counts. Unplaced shares are not a
// smaller bet — they are no bet at all on those shares, and the window shuts
// on a clock rather than on a reminder, so a man who meant to finish his book
// in the car park and forgot has simply thrown that part of his buy-in away.
export function openingSharesLeft(bets, pid) {
  const bet = (bets || []).find(b => b.pid === pid);
  return Math.max(0, MARKET_OPENING_SHARES - totalShares(lotsFor(bet, "opening")));
}

// ── Who owes the halfway rebuy ─────────────────────────────────────
// The second window is a second BUY-IN, and it is INCURRED, not prepaid:
// the ten shares are open to everybody in the market game, and placing any of
// them is what puts a man in for the rebuy. He settles up with the director
// afterwards like every other debt at this tournament.
//
// That is the right way round for the same reason the buy-in sheet exists at
// all. A prepaid rebuy needs the director to collect from half the field at
// the turn and tag each one before anybody can place, which is the exact
// sequence of taps this screen was built to delete. Deriving it means the
// column fills itself, and the one thing the director has to know — who owes
// what — is answered by what people actually did rather than by a list
// somebody had to keep in step with them.
//
// Any shares at all, not a prorated count: this is a seat, not a per-share
// price. One share in the second window costs the same as ten, which is also
// why nobody places just one.
export const rebuyers = (bets) =>
  (bets || []).filter(b => totalShares(normalizeLots(b.mid)) > 0).map(b => b.pid);

// ── The board ──────────────────────────────────────────────────────
// Every golfer anybody holds shares in, richest first. `perShare` is what a
// share in that golfer pays IF they win — the pot divided by the shares on
// them — which is the number that makes this read like a market: the more of
// the field that piles onto the favourite, the less the favourite pays.
export function marketBoard({ bets, players, pot }) {
  const held = new Map();
  (bets || []).forEach(b => allLots(b).forEach(l => held.set(l.pid, (held.get(l.pid) || 0) + l.shares)));
  const total = [...held.values()].reduce((a, b) => a + b, 0);
  const nameOf = (pid) => (players || []).find(p => p.id === pid)?.name || pid;
  return [...held.entries()]
    .map(([pid, shares]) => ({
      pid,
      name: nameOf(pid),
      shares,
      pct: total > 0 ? (shares / total) * 100 : 0,
      perShare: shares > 0 ? (pot || 0) / shares : 0,
    }))
    .sort((a, b) => b.shares - a.shares || a.name.localeCompare(b.name));
}

// What each bettor is holding in total, for the "who is in" list.
export function marketHoldings({ bets, players }) {
  const nameOf = (pid) => (players || []).find(p => p.id === pid)?.name || pid;
  return (bets || [])
    .map(b => ({ pid: b.pid, name: nameOf(b.pid), lots: allLots(b), shares: totalShares(allLots(b)) }))
    .filter(r => r.shares > 0)
    .sort((a, b) => b.shares - a.shares || a.name.localeCompare(b.name));
}

// ── The director's worklist ────────────────────────────────────────
// Every player in the market game and how much of each window they have
// placed — NOT what they placed it on.
//
// This is the thing a director actually needs and could not get anywhere
// else. `marketHoldings` only lists people who have already bet, so the man
// who handed his picks over on a napkin and never opened the app was
// invisible on the one screen meant to chase him. The counts are the
// checklist; the composition is a tap away in his book.
//
// Alphabetical, because it is read by looking for a name. `outstanding` is
// the number who have placed nothing at all, which is the count worth putting
// on the drawer that opens this.
export function marketRoster({ players, bets }) {
  const rows = (players || []).map(p => {
    const bet = (bets || []).find(b => b.pid === p.id) || {};
    const opening = totalShares(lotsFor(bet, "opening"));
    const mid = totalShares(lotsFor(bet, "mid"));
    return { pid: p.id, name: p.name, opening, mid, placed: opening + mid };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { rows, outstanding: rows.filter(r => r.placed === 0).length };
}

// ── The payout ─────────────────────────────────────────────────────
// The whole pot goes to the shares on ONE golfer. Everybody else's shares
// are worth nothing, which is the game — there is no place money here.
//
// A winner nobody backed leaves `totalShares` at 0. The pot is not divided
// by zero and it is not silently kept: `unclaimed` says so, and the screen
// prints it, because that is a conversation for the room and not something
// the app should decide.
export function marketPayouts({ bets, winnerId, pot }) {
  const rows = (bets || [])
    .map(b => ({ pid: b.pid, shares: sharesOn(allLots(b), winnerId) }))
    .filter(r => r.shares > 0);
  const total = rows.reduce((sum, r) => sum + r.shares, 0);
  const perShare = total > 0 ? (pot || 0) / total : 0;
  return {
    totalShares: total,
    perShare,
    unclaimed: !!winnerId && total === 0,
    rows: rows
      .map(r => ({ ...r, payout: r.shares * perShare }))
      .sort((a, b) => b.shares - a.shares || String(a.pid).localeCompare(String(b.pid))),
  };
}
