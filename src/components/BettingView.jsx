// ══════════════════════════════════════════════════════════════════
//  BettingView — the four side games, and the money behind them.
// ══════════════════════════════════════════════════════════════════
//
// Skins, closest-to-the-pin, low net and the market, plus the collection sheet
// the director actually works from in a car park. The arithmetic is all in
// lib/sideGames and lib/market, which are pure and tested; what lives here is
// the screen.
//
// Extracted from App.jsx, where it was the single largest thing in a
// ten-thousand-line file — 1,700 lines of it, holding the rules for a game
// played for real money, in the same module as the app shell and the score
// entry. It came out cleanly because it had almost no coupling to that module:
// four constants and three formatters, all of which now live in constants.js
// and lib/format where a second file can reach them.
//
// It is loaded on demand (see App.jsx), because nobody opens the Betting tab
// while walking down a fairway and a phone on a course should not be carrying
// it.

import { useState, useEffect, useRef } from "react";
import { K, FS, R, ALPHA, MOTION, FONT } from "../theme";
import { SegmentedToggle, StickyTop, SectionLabel, Card, Btn } from "./ui";
import { Popup, ConfirmModal } from "./Popup";
import { BuyInTracker } from "./BuyIns";
import { useConfirm } from "../lib/useConfirm";
import { CTP_MAX_FT, SIDE_GAME_KEYS, SIDE_GAME_LABELS } from "../constants";
import { fmtPar, teeTimeToMinutes, minutesToTimeStr } from "../lib/format";
import { courseHandicapFor, buildStrokesMap, computeRoundLine, WD_SCORE } from "../lib/individualBoard";
import { shortName } from "../lib/playerNames";
import { fieldFor, potFor, perUnit, computeSkins, allSkins, skinCounts, lowNetRounds, lowNetRoundField } from "../lib/sideGames";
import { roundFinalized } from "../lib/groupSwitch";
import {
  MARKET_OPENING_SHARES, MARKET_MID_SHARES, marketWindows, totalShares,
  countdown, countdownTick, countdownTone, midRoundFor,
  sharesOn, setLotShares, lotsFor, allLots, marketBoard, marketHoldings, marketPayouts,
  roundComplete, eligibleBets, rebuyers, marketRoster, teeOffAt, marketOutsiders,
} from "../lib/market";


// ── BETTING ──
//
// The three side games that run across the whole tournament rather than
// inside any one round. They are built on three different principles, and the
// difference is the point:
//
//   SKINS ARE DERIVED, never stored. Low score on a hole takes it, a tie
//   pushes it, and the pot divides by however many were won. There is no
//   skins editor anywhere in the app on purpose — a stored winner is a second
//   answer that can disagree with the card, and the card is the one the group
//   signed. See lib/sideGames.
//
//   CTP IS CAPTURED, because it is the one thing here the card does not
//   record. Groups tag their own par 3s from the Scoring tab as they walk off
//   the green, and the director settles each hole from this screen.
//
//   THE MARKET IS BET. Twenty shares before the tournament starts, ten more
//   once the halfway round is complete, spread across any golfers you like;
//   the pot divides by the shares held on whoever wins. See lib/market.
//
// What all four share is the money: a director tags who bought in and what a
// seat costs, and every pot on this screen is counted from that.
//
// `players` is the WHOLE roster, withdrawals included — not the active field
// every other screen takes. A man who paid his buy-ins and walked in on
// Saturday still owes them, still has his money in the pot, and still keeps
// the skins and the pin he won before he went; leaving him off the collection
// sheet loses the director money and leaving him out of the field quietly
// shrinks every pot he paid into. Each game decides for itself what a
// withdrawal means to it — computeSkins skips the WD sentinel hole by hole
// (which is the rule the withdraw dialog states: completed holes count), and
// lowNetRounds drops a withdrawn card outright.
export function BettingView({
  players, round, tRounds, courses, holeData, ctpData, onSetCtp, user, numRounds,
  getPlayerTee, getPlayerCH = () => null,
  sideGames, onUpdateSideGames, marketBets, onSaveMarketBet, leaderboard,
  finalizedRounds, pairingsData, firstTeeAt, marketNudge, teeTimesData, roundDates,
  // Who could be in the market without playing, and how one of them gets
  // added — see MARKET-ONLY PLAYERS below. Both optional: without them the
  // Betting tab is exactly this year's field's.
  inactivePlayers = [], onAddMarketOutsider,
}) {
  const [tab, setTab] = useState("skins");
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [grossMode, setGrossMode] = useState(true);
  // Which round's full field is open in the Low Net ledger. One at a time —
  // four open rounds is the same wall of numbers the ledger exists to avoid.
  const [openNetRound, setOpenNetRound] = useState(null);
  // Whose pins are itemized in the CTP leaders card.
  const [openCtpPlayer, setOpenCtpPlayer] = useState(null);
  // Each tab keeps its OWN round and its own open drawer. Sharing them would
  // mean opening one tab silently rearranged the other.
  const [skinsRound, setSkinsRound] = useState(null);
  const [ctpRound, setCtpRound] = useState(null);
  // ONE buy-in sheet, opened from any of the three pot cards. It used to be a
  // drawer per game, which meant the director's real job — working out what
  // each man owes across all four buy-ins — was four panels and a running
  // total held in their head.
  const [showBuyIns, setShowBuyIns] = useState(false);
  const [editPot, setEditPot] = useState(false);
  const [potInput, setPotInput] = useState("");
  // Director CTP override — hole currently being edited, plus the pending winner/feet.
  const [editCtpHole, setEditCtpHole] = useState(null);
  const [editCtpPlayer, setEditCtpPlayer] = useState("");
  const [editCtpFeet, setEditCtpFeet] = useState("");
  // The market: whose book is on screen, which window is being placed, and the
  // unsaved draft. A bet is not auto-saved the way a buy-in toggle is — moving
  // shares between two golfers is two taps that are only correct together.
  const [bookFor, setBookFor] = useState(null);
  const [bookWindow, setBookWindow] = useState(null);
  const [draft, setDraft] = useState(null);
  const [openHolder, setOpenHolder] = useState(null);
  // The director's shares worklist — who has handed their picks in and who
  // has not. Its own drawer rather than a section of the book, because it is
  // the INDEX into the book, not part of it.
  const [showRoster, setShowRoster] = useState(false);
  const { confirm, confirmModal } = useConfirm();
  // The bell has to ring on a screen nobody is touching. A player sitting on
  // this tab at 6:59 must watch the market shut at 7:00 rather than find out
  // by navigating away and back — so the clock ticks, but only while there is
  // something for it to close, and stops the moment it has.
  const [now, setNow] = useState(() => Date.now());

  // Gross is the default, so this never fires on arrival: reaching Net always
  // means somebody crossed the toggle to get there, which is a deliberate act
  // and therefore fair game. Fires every time they do it, which is the joke.
  //
  // It does NOT change the mode — Net stays selected behind the notice —
  // because the point is the comment, not the veto. `alert` gives it one OK
  // button rather than a choice, so it has to be dismissed rather than
  // drifting past like a toast.
  const pickMode = (gross) => {
    setGrossMode(gross);
    if (!gross) {
      confirm({
        title: "NET skins?!",
        message: "This is for entertainment purposes only, real men don't play net skins.",
        alert: true,
      });
    }
  };

  // The book lives above the holders list, so a director who taps Edit five
  // rows down has to be taken back to it — otherwise the selector changes off
  // screen and the tap looks like it did nothing.
  const bookRef = useRef(null);

  // ── Who is playing for what ──
  const skinsField = fieldFor(sideGames?.skins?.in, players);
  const ctpField = fieldFor(sideGames?.ctp?.in, players);
  const ctpInSet = new Set(ctpField.map(p => p.id));

  // ── MARKET-ONLY PLAYERS ──
  // The market is a bet on who WINS, so it is the only game here that does
  // not need a scorecard — and the only one whose field can therefore include
  // somebody who is not playing. A man off this year's roster buys in, places
  // his twenty, and collects if he picked right.
  //
  // Which forces the one distinction this file did not have before: the list
  // of people who can BET and the list of golfers who can be BACKED used to be
  // the same array. They are not the same question any more, and conflating
  // them would put a man who is not swinging a club on the sheet of names to
  // wager on.
  //
  //   players       the field. Who can be backed, whose cards make the board,
  //                 what every other buy-in and every window is counted from.
  //   marketPool    the field PLUS the market-only names. Who can hold a book,
  //                 who is billed for the market, whose name has to resolve.
  //
  // Everything below reads whichever of the two it actually means.
  const outsiders = marketOutsiders({ ids: sideGames?.market?.in, roster: players, pool: inactivePlayers });
  const marketPool = outsiders.length ? [...players, ...outsiders] : players;
  const marketField = fieldFor(sideGames?.market?.in, marketPool);
  const marketInSet = new Set(marketField.map(p => p.id));
  const nameIn = (pid) => marketPool.find(p => p.id === pid)?.name || pid;

  const skinsCounted = (sideGames?.skins?.amount || 0) > 0;
  const skinsPot = potFor({ amount: sideGames?.skins?.amount, count: skinsField.length, typed: sideGames?.skins?.pot });
  const ctpPot = potFor({ amount: sideGames?.ctp?.amount, count: ctpField.length });
  const lowNetField = fieldFor(sideGames?.lownet?.in, players);
  const lowNetPot = potFor({ amount: sideGames?.lownet?.amount, count: lowNetField.length });

  // ── Which round a tab lands on ──
  // The most recent round anybody has actually played, which is not the same
  // question as which round the app is ON: on the morning of Round 2 the app
  // points at a round with nothing in it while Round 1's results sit one tap
  // away. It follows the play on its own until somebody taps a round, and from
  // then on that choice stands.
  const roundList = Array.from({ length: numRounds }, (_, i) => i + 1);
  const playedRounds = roundList.filter(r =>
    players.some(p => Object.values(holeData[`${p.id}_${r}`] || {}).some(v => v > 0)));
  const defaultRound = playedRounds.length ? playedRounds[playedRounds.length - 1] : (roundList.includes(round) ? round : roundList[0]);
  const shownRound = roundList.includes(skinsRound) ? skinsRound : defaultRound;
  const ctpShownRound = roundList.includes(ctpRound) ? ctpRound : defaultRound;

  // A round's course and its two hole tables, resolved once.
  const roundSetup = (r) => {
    const tr = tRounds.find(t => t.round_number === r);
    const course = tr ? courses.find(c => c.id === tr.course_id) : null;
    return { tr, course, pars: course?.hole_pars || [], hcps: course?.hole_handicaps || [] };
  };

  // Every player's stroke allocation for a round, plus the signed course
  // handicap it came from — a plus player gives strokes back, so the sign has
  // to travel with the map. Gross mode needs neither.
  const strokesFor = (r) => {
    const { course } = roundSetup(r);
    const maps = {}; const chs = {};
    skinsField.forEach(p => {
      const ch = courseHandicapFor({
        handicapIndex: p.handicap_index,
        course,
        tee: course ? getPlayerTee(r, p.id, course) : null,
        recorded: getPlayerCH(r, p.id),
      });
      chs[p.id] = ch;
      maps[p.id] = buildStrokesMap(ch, course?.hole_handicaps || []);
    });
    return { maps, chs };
  };

  // What computeSkins needs for a round, in the mode currently selected.
  const skinsSetup = (r) => {
    const { pars } = roundSetup(r);
    if (grossMode) return { pars };
    const { maps, chs } = strokesFor(r);
    return { pars, strokeMaps: maps, chFor: (pid) => chs[pid] || 0 };
  };

  const won = allSkins({ players: skinsField, holeData, rounds: roundList, roundSetup: skinsSetup });
  const skinTotals = skinCounts(won);
  const totalSkinsWon = won.length;
  const perSkin = perUnit(skinsPot, totalSkinsWon);
  const shownSkins = computeSkins({ players: skinsField, holeData, round: shownRound, ...skinsSetup(shownRound) });

  // ── The CTP tab ──
  // Read through each round's OWN par table rather than straight off ctpData:
  // a record left on a hole that is no longer a par 3 — a course re-pointed
  // after the fact — would otherwise keep counting on a hole the tab no longer
  // shows. A tag naming somebody who is not in the CTP game does not score; it
  // still shows on its hole, because the document is the hole's answer, but
  // the board and the payout are for the players who bought in.
  const par3sFor = (r) => (roundSetup(r).pars || []).map((p, i) => (p === 3 ? i + 1 : null)).filter(Boolean);
  const ctpTags = roundList.flatMap(r =>
    par3sFor(r).flatMap(hole => {
      const rec = (ctpData[r] || {})[hole];
      return rec?.playerId && ctpInSet.has(rec.playerId) ? [{ round: r, hole, ...rec }] : [];
    }));
  const ctpLeaders = Object.values(ctpTags.reduce((acc, t) => {
    const e = acc[t.playerId] || (acc[t.playerId] = { pid: t.playerId, count: 0, best: null });
    e.count += 1;
    if (t.distanceFt != null && (e.best == null || t.distanceFt < e.best)) e.best = t.distanceFt;
    return acc;
  }, {}))
    // Most pins, then the closest single shot among equals — the tiebreak the
    // players would use themselves.
    .sort((a, b) => b.count - a.count || (a.best ?? Infinity) - (b.best ?? Infinity));
  const noPar3s = roundList.every(r => par3sFor(r).length === 0);
  // Every par 3 in the tournament, which is what the pot divides by — see
  // perUnit. It counts the holes on the courses as they are ASSIGNED, so a
  // round with no course yet contributes nothing and the per-pin figure
  // settles as the schedule fills in.
  const par3Count = roundList.reduce((n, r) => n + par3sFor(r).length, 0);
  const perPin = perUnit(ctpPot, par3Count);
  // A pin is PROVISIONAL while its round is live — a group still out can get
  // inside it — and FINAL the moment the round is done, which is the last
  // group signing its card or the director finalizing from Admin. Derived
  // rather than stamped on each tag, so un-finalizing a round correctly
  // un-settles its pins. See lib/groupSwitch roundFinalized.
  const roundSettled = (r) => roundFinalized(finalizedRounds, pairingsData, r);

  // ── The Low Net tab ──
  // One round line per player, resolved exactly the way the leaderboard
  // resolves it — same tee, same course handicap, same computeRoundLine — so
  // the low net paid here and the number on the board are the same number by
  // construction rather than by two implementations agreeing.
  //
  // The course handicap used to be a bare calcCH here, which quietly made that
  // paragraph untrue on an imported year: the board reads the RECORDED handicap
  // those years carry and this read a derived one, so the day's low net could
  // be paid to somebody the leaderboard did not have winning it.
  const lineFor = (pid, r) => {
    const { course } = roundSetup(r);
    if (!course) return null;
    return computeRoundLine({
      scores: holeData[`${pid}_${r}`] || {},
      holePars: course.hole_pars || [],
      holeHcps: course.hole_handicaps || [],
      ch: courseHandicapFor({
        handicapIndex: players.find(x => x.id === pid)?.handicap_index,
        course,
        tee: getPlayerTee(r, pid, course),
        recorded: getPlayerCH(r, pid),
      }),
    });
  };
  // The pot divides by the rounds the event HAS, not the rounds decided so
  // far — same reasoning as a CTP pin. A day's share is known before anybody
  // tees off, so winning Thursday is worth the same whatever happens Friday.
  const lowNetPerRound = perUnit(lowNetPot, roundList.length);
  const lowNetRows = lowNetRounds({ players: lowNetField, rounds: roundList, lineFor });

  // The round's tee sheet as one line — first off to last off. A round
  // nobody has finished has no result to print, and "nobody has finished
  // yet" only says what the empty row already says; when it goes off is the
  // thing somebody looking at an unplayed round actually wants.
  const teeWindowFor = (r) => {
    const mins = ((teeTimesData || {})[r] || []).map(teeTimeToMinutes).filter(m => Number.isFinite(m));
    if (mins.length === 0) return null;
    const lo = Math.min(...mins), hi = Math.max(...mins);
    return lo === hi ? minutesToTimeStr(lo) : `${minutesToTimeStr(lo)} – ${minutesToTimeStr(hi)}`;
  };

  // ── The market tab ──
  // ── The opening bell ──
  // `firstTeeAt` — round one's earliest tee time — is when the market shuts.
  // See lib/market teeOffAt for why a clock rather than the first score. It
  // arrives as a prop rather than being derived here because the header
  // counts down to the same instant, and two derivations of one moment is one
  // more than the number that can be right.
  // Round 3's earliest tee time — the halfway window's own bell, derived the
  // same way the opening one is. Both windows close on a clock now, which is
  // what lets both of them be counted down to.
  const midTeeAt = (() => {
    const mr = midRoundFor(numRounds);
    if (mr == null) return null;
    const mins = ((teeTimesData || {})[mr + 1] || []).map(teeTimeToMinutes).filter(m => Number.isFinite(m));
    return mins.length === 0 ? null : teeOffAt((roundDates || {})[mr + 1], mins);
  })();
  const windows = marketWindows({ holeData, players, numRounds, firstTeeAt, midTeeAt, now });
  // Each window's own clock, and the tone it prints in. Null when there is
  // nothing left to count — a bell already rung, a window not yet open, or a
  // round with no tee sheet to ring one from.
  const clockFor = (w) => (w.open && w.at != null && w.at > now ? countdown(w.at - now) : null);
  const TONE_INK = { far: K.acc, today: K.warn, urgent: K.danger, closed: K.t3 };
  const toneFor = (w) => TONE_INK[countdownTone(w.at == null ? 0 : w.at - now, w.at, now)];
  const openingClock = clockFor(windows.opening);
  const midClock = clockFor(windows.mid);
  const anyClock = openingClock || midClock;
  // Both windows run. There is nothing left to place and nothing left to
  // choose between, so the book stops being an editor and becomes a receipt:
  // one sheet, every golfer the player actually backed, opening and halfway
  // added together. A two-tab switch over two shut windows is asking a
  // question with no answers behind it.
  //
  // Directors keep the editor. The override is the only way to enter a book
  // for a phone that died before the bell, and it has to work after the bell
  // by definition.
  const allShut = windows.opening.closed && (windows.mid.exists === false || windows.mid.closed);
  const finalSheet = allShut && !user?.isDirector;
  const bellPending = anyClock != null;
  // The clock runs for as long as there is a bell left to ring, so `now` can
  // never go stale enough to leave the market taking shares after the field
  // has teed off. What the market tab decides is only the RATE: seconds tick
  // in the last hour while somebody is watching them, and everything else
  // settles for thirty, which is already twice as often as the label above an
  // hour can change. A per-second re-render of the whole Betting view behind
  // a tab nobody is on is battery spent on nothing.
  //
  // Depending on `bellFast` rather than on the remaining milliseconds is what
  // stops the effect tearing down and rebuilding the interval every tick.
  const bellFast = anyClock != null && anyClock.urgent && tab === "market";
  useEffect(() => {
    if (!bellPending) return;
    const t = setInterval(() => setNow(Date.now()), countdownTick(bellFast ? 0 : Infinity));
    return () => clearInterval(t);
  }, [bellPending, bellFast]);
  const eventComplete = roundList.length > 0 && roundList.every(r => roundComplete(holeData, players, r));
  // ── The market is SEALED until the tournament is over ──
  // Everything a player could read another player's hand off — the board, the
  // holders, the standing payout — is held back until every round is in.
  //
  // This is not modesty. The second window exists to let somebody buy a
  // correction with two rounds of evidence, and being able to see the field's
  // book before placing turns that into copying the consensus, or worse, into
  // a coordinated block on the leader. A blind market is the game.
  //
  // The DIRECTOR sees it throughout, because somebody has to be able to fix a
  // fat-fingered allocation and settle the thing at the end. What they see is
  // marked as sealed so they know it is not what the field is looking at.
  const sealed = !eventComplete && !user?.isDirector;
  // The leader, and whether that is a RESULT or a snapshot. Only a finished
  // event pays out; until then the same board is a projection and says so.
  const leader = (leaderboard || []).find(p => !p.isWD && !p.withdrew && p.roundsPlayed > 0) || null;
  const winnerId = leader?.id || null;
  const bets = eligibleBets({ bets: marketBets, inMarket: pid => marketInSet.has(pid) });
  // ── Who owes the halfway rebuy ──
  // Nobody tags this. The second window is open to everybody in the market
  // game and the rebuy is INCURRED by placing into it, so this list is read
  // off the bets — see lib/market rebuyers. It is what the buy-in sheet's RE
  // column shows and what the second half of the market pot is counted from,
  // which is the same thing said twice on purpose: what a man owes and what
  // is in the pot are one number, and they cannot drift if only one of them
  // exists.
  const rebuyPids = new Set(rebuyers(bets));
  const rebuyField = marketField.filter(p => rebuyPids.has(p.id));
  const rebuyAmount = sideGames?.rebuy?.amount || 0;
  // Both buy-ins land in ONE pot. The rebuy is more money on the same game,
  // not a second game — which is exactly why the ten shares it buys dilute
  // the twenty everybody already holds. The pot therefore GROWS during the
  // second window as people place, which is correct: it is a live tally of
  // what is owed, not a figure fixed at the turn.
  const marketPot = potFor({ amount: sideGames?.market?.amount, count: marketField.length })
    + potFor({ amount: rebuyAmount, count: rebuyField.length });
  // The board is the GOLFERS backed, so it reads the field; the holders are
  // the people holding, so they read the pool. Handing either one the other
  // list prints a raw player id where a name should be.
  const board = marketBoard({ bets, players, pot: marketPot });
  const holders = marketHoldings({ bets, players: marketPool });
  const payouts = marketPayouts({ bets, winnerId, pot: marketPot });

  // Whose book the editor is pointed at. A player only ever edits their own;
  // the director can point it anywhere, which is the path for the phone that
  // died before the bell.
  const myPid = user?.id || null;
  const bookPid = (user?.isDirector && bookFor) ? bookFor : myPid;
  const bookBet = bets.find(b => b.pid === bookPid) || marketBets.find(b => b.pid === bookPid) || { pid: bookPid, opening: [], mid: [] };
  // Which window the editor is placing into: the open one, unless the person
  // has picked. Both closed → the opening window, read-only.
  const activeWindow = bookWindow
    || (windows.opening.open ? "opening" : windows.mid.open ? "mid" : "opening");
  const win = activeWindow === "mid" ? windows.mid : windows.opening;
  // ── Who may place, in either window ──
  // Being IN THE MARKET is the whole test, and it is the same test for the
  // opening twenty and the halfway ten. Not being in this year's field is not
  // a reason: the market is a bet on who wins, so somebody who is not playing
  // holds a book like anybody else and gets both windows — the halfway ten
  // especially, since they are the correction bought with two rounds of
  // evidence and he watched the same two rounds.
  //
  // The rebuy is not a second gate either. It is INCURRED by placing rather
  // than prepaid (see lib/market rebuyers), which is exactly why nobody has to
  // have handed money over before the window will take shares — the sheet
  // bills whoever placed, afterwards. This comment used to say the opposite,
  // and the code has never done it.
  //
  // The one asymmetry is the CLOCK: a director can place into a shut window,
  // because entering a book for a phone that died before the bell has to work
  // after the bell by definition.
  const canPlace = !!bookPid && marketInSet.has(bookPid) && (win.open || !!user?.isDirector);
  // Placing anything into the second window is what takes on the rebuy, so
  // the book has to say what that costs BEFORE the first tap, not after.
  const owesRebuy = !!bookPid && rebuyPids.has(bookPid);
  const draftLots = draft && draft.pid === bookPid && draft.window === activeWindow
    ? draft.lots
    : lotsFor(bookBet, activeWindow);
  const placed = totalShares(draftLots);
  const remaining = win.shares - placed;
  const dirty = !!draft && draft.pid === bookPid && draft.window === activeWindow
    && JSON.stringify(draft.lots) !== JSON.stringify(lotsFor(bookBet, activeWindow));

  const roster = marketRoster({ players: marketField, bets });

  // Point the book at somebody and bring it into view. The one action every
  // route into the editor shares — the roster row, the holders row, and the
  // dropdown all end here — so a director cannot end up editing one player
  // while looking at another's numbers.
  const openBook = (pid, windowKey = null) => {
    setBookFor(pid);
    setBookWindow(windowKey);
    setDraft(null);
    setShowRoster(false);
    // After the drawer closes, so the book is where it will finally sit.
    requestAnimationFrame(() => bookRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const bump = (pid, delta) => {
    const next = setLotShares(draftLots, pid, sharesOn(draftLots, pid) + delta, win.shares);
    setDraft({ pid: bookPid, window: activeWindow, lots: next });
  };
  // Typed entry, capped the same way the steppers are. Twenty shares is
  // twenty taps on a stepper, and a director entering the field's picks off a
  // sheet of paper is doing that sixteen times.
  const setShares = (pid, value) => {
    const next = setLotShares(draftLots, pid, value, win.shares);
    setDraft({ pid: bookPid, window: activeWindow, lots: next });
  };
  const clearWindow = () => setDraft({ pid: bookPid, window: activeWindow, lots: [] });
  const commitBook = async () => {
    const lots = activeWindow === "mid"
      ? { opening: bookBet.opening, mid: draftLots }
      : { opening: draftLots, mid: bookBet.mid };
    await onSaveMarketBet(bookPid, lots);
    setDraft(null);
  };

  // One commit path for the typed pot, reached by blur — Enter just blurs the
  // field. Committing on both fired two Firestore writes for one edit.
  const commitPot = () => {
    setEditPot(false);
    const amt = parseFloat(potInput);
    onUpdateSideGames("skins", { pot: Number.isFinite(amt) && amt > 0 ? amt : 0 });
  };

  const money = (n) => `$${(n || 0).toFixed(2)}`;
  // A POT is always whole money — a round buy-in times a head count — so its
  // cents are two characters of noise on the largest figure on the screen. A
  // SHARE of one is not: $250 across seven skins is $35.71, and rounding that
  // would be rounding somebody's money.
  const potMoney = (n) => `$${Math.round(n || 0).toLocaleString()}`;

  const empty = (icon, title, sub) => (
    <Card style={{ padding: "48px 20px", textAlign: "center" }}>
      <div style={{ fontSize: FS.jumbo, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: FS.small, color: K.t3, maxWidth: 280, lineHeight: 1.5, margin: "0 auto" }}>{sub}</div>
    </Card>
  );

  // ── The pot card ──
  // The same card for all three games: what is in the pot on the left, what a
  // unit of it is worth on the right, and the way into the buy-in sheet under
  // it. `typed` opts skins into its inline pot editor — it is the only game
  // with a hand-entered pot to preserve, because it is the one WBC was already
  // playing before any of this existed.
  //
  // All three cards open the SAME sheet. The buy-ins were never really three
  // lists; they were one table the director was being made to read a column
  // at a time.
  const potCard = ({ label, pot, rightTop, rightBottom, summary, typed = false, columns = null }) => (
    <>
      <div style={{ background: K.card, borderRadius: R.lg, marginBottom: showBuyIns ? 0 : 10, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS.label, color: K.t3, fontWeight: 700, letterSpacing: 1 }}>{columns ? columns[0].label : label}</div>
            {/* Once a buy-in price is set the pot is COUNTED, not typed, so the
                inline editor gives way — the way to change it is to change who
                is in. */}
            {(!typed || skinsCounted) ? (
              <div style={{ fontSize: FS.title, fontWeight: 800, color: K.gold }}>{potMoney(pot)}</div>
            ) : editPot ? (
              <input autoFocus type="number" inputMode="decimal" value={potInput}
                onChange={e => setPotInput(e.target.value)}
                onBlur={commitPot}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{ fontSize: FS.title, fontWeight: 800, color: K.gold, background: "transparent", border: "none", borderBottom: `1px solid ${K.acc}`, outline: "none", width: 110, fontFamily: FONT }} />
            ) : (
              // Seed the field from the LIVE pot at the moment editing opens,
              // not at mount: the value arrives from Firestore after the first
              // render, and another director can change it while this screen is
              // open. Seeding at mount meant a director who tapped in and
              // straight back out saved a stale pot over the real one.
              <div onClick={() => { if (user?.isDirector) { setPotInput(String(sideGames?.skins?.pot || 0)); setEditPot(true); } }}
                style={{ fontSize: FS.title, fontWeight: 800, color: K.gold, cursor: user?.isDirector ? "pointer" : "default" }}>
                {potMoney(pot)}
              </div>
            )}
          </div>
          {/* THREE COLUMNS, when the tab has three numbers of equal standing
              rather than one headline and one derived figure. Skins does: the
              pot, how many were won, and what one is worth — and "12 skins
              won / $20.83 per skin" stacked in a corner made the middle
              number look like a caption on the third. The pot keeps the left
              column so the inline editor and the gold stay where they were,
              and the three tracks run left, centre, right so none of them
              reads as a stray beside the others. */}
          {columns ? columns.slice(1).map((c, i, all) => (
            <div key={c.label} style={{ flex: 1, minWidth: 0, textAlign: i === all.length - 1 ? "right" : "center" }}>
              <div style={{ fontSize: FS.label, color: K.t3, fontWeight: 700, letterSpacing: 1 }}>{c.label}</div>
              <div style={{ fontSize: FS.title, fontWeight: 800, color: K.acc, overflow: "hidden", textOverflow: "ellipsis" }}>{c.value}</div>
            </div>
          )) : (
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: FS.label, color: K.t3 }}>{rightTop}</div>
              <div style={{ fontSize: FS.body, fontWeight: 700, color: K.acc }}>{rightBottom}</div>
            </div>
          )}
        </div>
        {user?.isDirector && (
          <div
            onClick={() => setShowBuyIns(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 14px", borderTop: `1px solid ${K.bdr}` }}
          >
            <span style={{ flex: 1, fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.6 }}>
              {summary}
            </span>
            <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc, letterSpacing: 0.6 }}>
              BUY-INS {showBuyIns ? "▾" : "▸"}
            </span>
          </div>
        )}
      </div>
      {user?.isDirector && showBuyIns && (
        <BuyInTracker
          // The POOL, so a market-only name has a row to be billed on. Its
          // `outside` flag is what keeps him out of the other four buy-ins.
          players={marketPool}
          outsideCandidates={onAddMarketOutsider ? inactivePlayers : []}
          onAddOutside={onAddMarketOutsider}
          games={SIDE_GAME_KEYS.map(k => ({
            key: k, ...SIDE_GAME_LABELS[k],
            amount: sideGames?.[k]?.amount || 0,
            // The rebuy column is a readout of who has placed halfway shares,
            // not a list anybody keeps. Everything else is the director's.
            paid: sideGames?.[k]?.paid ?? [],
            // The rebuy column is a readout of who has placed halfway shares,
            // not a list anybody keeps, so its membership cannot be tagged —
            // only its payment.
            ...(k === "rebuy"
              ? { ids: rebuyField.map(p => p.id), derived: true }
              : { ids: sideGames?.[k]?.in ?? null }),
          }))}
          onChange={onUpdateSideGames}
        />
      )}
    </>
  );

  // ── Scorecards ──
  // Both renderers highlight the holes the SELECTED mode won, so a gold circle
  // on a card is always the skin the tab is currently paying for.
  const skinHolesFor = (pid) => new Set(won.filter(s => s.winner.pid === pid).map(s => `${s.round}_${s.hole}`));

  // Add up a nine — or a whole card — over the holes ACTUALLY PLAYED. Par is
  // accumulated alongside rather than taken from the course total, so a man
  // walking in after thirteen gets a to-par measured against thirteen holes
  // instead of being handed five phantom pars.
  const tallyHoles = (scores, pars, holes) => {
    let gross = 0, par = 0, played = 0;
    holes.forEach(i => {
      const raw = scores[i];
      if (raw > 0 && raw < WD_SCORE) { gross += raw; par += pars[i] || 0; played += 1; }
    });
    return { gross, par, played, toPar: gross - par };
  };
  const toParStr = (n) => (n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);

  // ── One player's week, round by round ──────────────────────────────
  // What this card is FOR is answering "where did his six skins come from",
  // and the old one made that nearly impossible: eight anonymous blocks of
  // nine, no round headings, no course names, no totals, and nothing but
  // whitespace between one round and the next. A gold circle told you a skin
  // landed but not which day it landed on.
  //
  // So each round is now its own bordered card with a heading — round, course,
  // skins taken that day, and the score — and the nines carry a ruled grid
  // with OUT and IN totals, which is the shape every golfer already knows how
  // to read.
  const renderInlineScorecard = (playerId) => {
    const p = players.find(pl => pl.id === playerId);
    if (!p) return null;
    const skinSet = skinHolesFor(playerId);
    const rows = [];
    for (const r of roundList) {
      const { course } = roundSetup(r);
      if (!course) continue;
      const scores = holeData[`${p.id}_${r}`] || {};
      if (!Object.values(scores).some(v => v > 0)) continue;
      // Strokes are only drawn in NET mode, where they are the whole
      // explanation for a gold circle sitting on an ordinary-looking number:
      // the card prints gross all week, so a skin won with a stroke is
      // otherwise a 5 that beat a field of 4s for no visible reason.
      const strokes = grossMode ? null : (strokesFor(r).maps[p.id] || {});
      rows.push({ r, scores, pars: course.hole_pars || [], courseName: course.name || "", strokes });
    }
    if (rows.length === 0) return null;

    // Two weights. `hair` rules the cells apart inside a nine — it has to be
    // visible enough to follow a column down three rows on a phone, which is
    // what the old borderless grid never let anybody do. `edge` frames the
    // round and fences off the totals.
    const hair = `1px solid ${K.bdr}${ALPHA.hair}`;
    const edge = `1px solid ${K.bdr}`;

    // Circles for under par; gold for a skin. A double circle is an eagle or
    // better, which is the convention the round card and the paper scorecard
    // both use.
    const ScoreCell = ({ score: raw, par, isSkin, strokes }) => {
      // Same rule as the field card: a WD hole is a dash, not a 99.
      const score = raw > 0 && raw < WD_SCORE ? raw : 0;
      if (!score) return <span style={{ fontSize: FS.micro, color: K.t3 }}>–</span>;
      const d = score - par;
      const isUnder = d < 0;
      const isDouble = d <= -2;
      const circleClr = isSkin ? K.gold : K.t2;
      return (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 19, height: 19 }}>
          {(isUnder || isSkin) && <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${circleClr}` }} />}
          {isDouble && <span style={{ position: "absolute", inset: 3, borderRadius: "50%", border: `1px solid ${circleClr}` }} />}
          {/* Strokes received, as the dots they are on a paper card. */}
          {strokes > 0 && (
            <span style={{ position: "absolute", top: -2, right: -4, display: "flex", gap: 1 }}>
              {Array.from({ length: Math.min(strokes, 3) }, (_, k) => (
                <span key={k} style={{ width: 2.5, height: 2.5, borderRadius: "50%", background: K.t3 }} />
              ))}
            </span>
          )}
          <span style={{ fontSize: FS.label, fontWeight: 700, color: isSkin ? K.gold : K.t2, position: "relative", zIndex: 1 }}>{score}</span>
        </span>
      );
    };

    return (
      <div style={{ padding: "8px 10px 10px", borderTop: hair }}>
        {rows.map(({ r, scores, pars, courseName, strokes }) => {
          const all = Array.from({ length: 18 }, (_, i) => i);
          const round = tallyHoles(scores, pars, all);
          const roundSkins = won.filter(s => s.winner.pid === p.id && s.round === r).length;

          const Nine = ({ holes, label }) => {
            const t = tallyHoles(scores, pars, holes);
            // The totals column is held at a fixed width rather than a share
            // of the table, so OUT and IN line up under one another whatever
            // the hole numbers do.
            const totCell = { textAlign: "center", padding: "3px 2px", borderLeft: edge, background: `${K.bdr}${ALPHA.wash}` };
            return (
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  {holes.map((_, i) => <col key={i} />)}
                  <col style={{ width: 34 }} />
                </colgroup>
                <tbody>
                  <tr style={{ background: `${K.bdr}${ALPHA.wash}` }}>
                    {holes.map(i => {
                      const isSkin = skinSet.has(`${r}_${i}`);
                      return (
                        <td key={i} style={{
                          textAlign: "center", fontSize: FS.micro, fontWeight: isSkin ? 800 : 700,
                          color: isSkin ? K.gold : K.t2, padding: "3px 1px",
                          borderLeft: i === holes[0] ? "none" : hair,
                          borderBottom: hair,
                          // A gold TICK under the number, not a gold cell and
                          // not a full-width rule. Filling the cell makes
                          // three skins on 7-8-9 run together into one block,
                          // and an edge-to-edge underline does the same thing
                          // one step later — the column definition this
                          // rebuild exists for disappears exactly where the
                          // card matters most. Inset to 55% and it reads as
                          // three marks on three holes.
                          ...(isSkin ? {
                            backgroundImage: `linear-gradient(${K.gold}, ${K.gold})`,
                            backgroundSize: "55% 2px",
                            backgroundPosition: "center bottom",
                            backgroundRepeat: "no-repeat",
                          } : null),
                        }}>{i + 1}</td>
                      );
                    })}
                    <td style={{ ...totCell, fontSize: FS.micro, fontWeight: 800, color: K.t3, letterSpacing: 0.5, borderBottom: hair }}>{label}</td>
                  </tr>
                  {/* Par sits on the same wash as the hole numbers above it,
                      and the pair is closed off with the heavier rule. Two
                      lines of heading over the scores, rather than the hole
                      numbers being a heading and par being the first row of
                      the table — which is what it read as when the wash
                      stopped at the row above and the rule under it was the
                      same hairline as every other. */}
                  <tr style={{ background: `${K.bdr}${ALPHA.wash}` }}>
                    {holes.map(i => (
                      <td key={i} style={{
                        textAlign: "center", fontSize: FS.micro, color: K.t3, padding: "2px 1px",
                        borderLeft: i === holes[0] ? "none" : hair, borderBottom: edge,
                      }}>{pars[i] || ""}</td>
                    ))}
                    <td style={{ ...totCell, fontSize: FS.micro, color: K.t3, borderBottom: edge }}>{t.par || ""}</td>
                  </tr>
                  <tr>
                    {holes.map(i => (
                      <td key={i} style={{ textAlign: "center", padding: "2px 1px", borderLeft: i === holes[0] ? "none" : hair }}>
                        <ScoreCell score={scores[i]} par={pars[i] || 0} isSkin={skinSet.has(`${r}_${i}`)} strokes={strokes ? strokes[i] || 0 : 0} />
                      </td>
                    ))}
                    <td style={{ ...totCell, fontSize: FS.label, fontWeight: 800, color: K.t1 }}>{t.gross || "–"}</td>
                  </tr>
                </tbody>
              </table>
            );
          };

          return (
            <div key={r} style={{ border: edge, borderRadius: R.sm, overflow: "hidden", marginBottom: 8 }}>
              {/* Which round, which course, what it was worth. The heading is
                  the entire point of the rebuild — without it the grids below
                  are eight interchangeable blocks of nine numbers. */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", background: `${K.bdr}${ALPHA.wash}`, borderBottom: edge }}>
                <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.acc, letterSpacing: 0.5, flexShrink: 0 }}>RD {r}</span>
                <span style={{ fontSize: FS.micro, color: K.t3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{courseName}</span>
                {roundSkins > 0 && (
                  <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.gold, flexShrink: 0 }}>
                    {roundSkins} SKIN{roundSkins !== 1 ? "S" : ""}
                  </span>
                )}
                {/* A card still out on the course says so, rather than showing
                    a total that looks like a finished round eight shots low. */}
                {round.played < 18 && (
                  <span style={{ fontSize: FS.micro, fontWeight: 700, color: K.t3, flexShrink: 0 }}>THRU {round.played}</span>
                )}
                <span style={{ fontSize: FS.label, fontWeight: 800, color: K.t1, flexShrink: 0 }}>{round.gross}</span>
                {/* Under par is RED, the same rule the leaderboard total
                    follows. A negative number in golf is red — teal here
                    was the app saying "accent" where the game says "under
                    par", and the two are not the same thing. */}
                <span style={{ fontSize: FS.micro, fontWeight: 800, color: round.toPar < 0 ? K.under : K.t3, flexShrink: 0, minWidth: 18, textAlign: "right" }}>
                  {toParStr(round.toPar)}
                </span>
              </div>
              <Nine holes={Array.from({ length: 9 }, (_, i) => i)} label="OUT" />
              <div style={{ height: 1, background: `${K.bdr}${ALPHA.line}` }} />
              <Nine holes={Array.from({ length: 9 }, (_, i) => i + 9)} label="IN" />
            </div>
          );
        })}
        {/* One line, once, at the foot of the whole card — the two circles are
            not self-explanatory and a player asked to take them on trust will
            read a birdie as a skin. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: FS.micro, color: K.t3, paddingTop: 2 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", border: `1.5px solid ${K.gold}`, display: "inline-block" }} /> SKIN
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: "50%", border: `1.5px solid ${K.t2}`, display: "inline-block" }} /> UNDER PAR
          </span>
          {!grossMode && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 3, height: 3, borderRadius: "50%", background: K.t3, display: "inline-block" }} /> STROKE
            </span>
          )}
        </div>
      </div>
    );
  };

  // Full round scorecard grid — everybody in the skins game, skins highlighted.
  const renderRoundScorecard = () => {
    const { course } = roundSetup(shownRound);
    if (!course) return (
      <Card style={{ padding: 20, textAlign: "center", color: K.t3, fontSize: FS.small }}>No course set for Round {shownRound}</Card>
    );
    const pars = course.hole_pars || [];
    const skinByHole = {};
    shownSkins.filter(s => s.winner).forEach(s => { skinByHole[s.hole] = s; });
    const allHoles = Array.from({length: 18}, (_, i) => i);
    const front9 = allHoles.slice(0, 9);
    const back9  = allHoles.slice(9);
    const posted = skinsField.filter(p => Object.values(holeData[`${p.id}_${shownRound}`] || {}).some(v => v > 0));
    if (posted.length === 0) return (
      <Card style={{ padding: 20, textAlign: "center", color: K.t3, fontSize: FS.small }}>No scores yet this round</Card>
    );
    const cellBdr = `1px solid ${K.bdr}${ALPHA.tint}`;
    const HalfTable = ({ holes }) => (
      <div style={{ paddingBottom: holes[0] === 0 ? 8 : 0, borderBottom: holes[0] === 0 ? `1px solid ${K.bdr}` : "none" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "20%" }} />
            {holes.map((_, i) => <col key={i} style={{ width: `${80 / holes.length}%` }} />)}
          </colgroup>
          {/* Hole and Par are a HEADING, and they were drawn in the same wash
              the striped player rows underneath are — so the head was the
              same shade as every second row of scores and read as two more
              of them. A rung up the alpha ladder separates the two: the head
              is the darker band, the stripes stay where they were, and the
              rule under Par closes the block at full strength rather than at
              a third of it. */}
          <thead style={{ background: `${K.bdr}${ALPHA.tint}` }}>
            <tr style={{ borderBottom: cellBdr }}>
              <td style={{ fontSize: FS.micro, fontWeight: 700, color: K.t2, padding: "4px 6px", borderBottom: cellBdr }}>Hole</td>
              {holes.map(i => (
                <td key={i} style={{ textAlign: "center", fontSize: skinByHole[i] ? FS.label : FS.micro, fontWeight: skinByHole[i] ? 800 : 700, color: skinByHole[i] ? K.gold : K.t1, padding: "4px 1px", borderLeft: cellBdr }}>
                  {i + 1}
                </td>
              ))}
            </tr>
            <tr style={{ borderBottom: `1px solid ${K.bdr}` }}>
              <td style={{ fontSize: FS.micro, fontWeight: 600, color: K.t3, padding: "3px 6px", letterSpacing: "0.03em" }}>Par</td>
              {holes.map(i => <td key={i} style={{ textAlign: "center", fontSize: FS.micro, fontWeight: 600, color: K.t3, padding: "3px 1px", borderLeft: cellBdr }}>{pars[i] || ""}</td>)}
            </tr>
          </thead>
          <tbody>
            {posted.map((p, pi) => {
              const scores = holeData[`${p.id}_${shownRound}`] || {};
              return (
                <tr key={p.id} style={{ borderTop: cellBdr, background: pi % 2 === 1 ? `${K.bdr}${ALPHA.wash}` : "transparent" }}>
                  <td style={{ fontSize: FS.label, fontWeight: 600, color: K.t1, padding: "3px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {shortName(p)}
                  </td>
                  {holes.map(i => {
                    // The WD sentinel is a marker, not a score. Withdrawals
                    // are on this card because their money is in the pot and
                    // the holes they DID play still won skins — but the holes
                    // they did not are a dash, the way the scoring screen
                    // draws them, not a row of 99s.
                    const raw = scores[i];
                    const s = raw > 0 && raw < WD_SCORE ? raw : 0;
                    const par = pars[i] || 0;
                    const isSkinWinner = skinByHole[i]?.winner?.pid === p.id;
                    const d = s ? s - par : null;
                    const isUnder = d !== null && d < 0;
                    const isDouble = d !== null && d <= -2;
                    const circleClr = isSkinWinner ? K.gold : K.t2;
                    return (
                      <td key={i} style={{ textAlign: "center", padding: "2px 1px", borderLeft: cellBdr }}>
                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, position: "relative" }}>
                          {/* `s > 0`, not `s`. An unplayed hole normalises to
                              the NUMBER 0 above, and `0 && <div/>` evaluates
                              to 0 — which React renders as a literal "0"
                              rather than nothing, the way false and undefined
                              do. Two of these lines per cell put "00" in front
                              of the dash on every hole the field had not
                              reached, right across the skins card. */}
                          {s > 0 && (isUnder || isSkinWinner) && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${circleClr}` }} />}
                          {s > 0 && isDouble && <div style={{ position: "absolute", inset: 3, borderRadius: "50%", border: `1px solid ${circleClr}` }} />}
                          <span style={{ fontSize: FS.label, fontWeight: 600, color: s ? (isSkinWinner ? K.gold : K.t2) : K.t3, position: "relative", zIndex: 1 }}>{s || "–"}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    return (
      <Card pad={10}>
        <HalfTable holes={front9} />
        <HalfTable holes={back9} />
      </Card>
    );
  };

  // The round pills. The card below is always open, so these pick which round
  // it shows rather than whether there is one — and the selected pill doubles
  // as the label saying which round is on screen.
  const roundPills = (value, onChange) => (
    <SegmentedToggle
      variant="pills"
      style={{ marginBottom: 8 }}
      options={roundList.map(r => [r, `Rd ${r}`])}
      value={value}
      onChange={onChange}
    />
  );

  return (
    <div>
      {/* Pinned so this tab's lead control sits exactly where every other
          tab's does, and so the lists scroll under it rather than taking it
          away. */}
      <StickyTop>
        <SegmentedToggle
          /* The same red dot the nav tab carries, on the sub-tab that can
             actually do something about it. Getting a player as far as the
             Betting tab and then leaving them to guess which of four games
             wanted them is most of the way to not telling them at all. */
          options={[["skins", "Skins"], ["ctp", "CTP"], ["lownet", "Low Net"],
                    ["market", "Market", marketNudge ? K.danger : undefined]]}
          value={tab} onChange={setTab}
        />
      </StickyTop>

      {tab === "skins" && (
        <div>
          {potCard({
            label: "POT", pot: skinsPot, typed: true,
            summary: `${skinsField.length} IN${skinsCounted ? ` · $${sideGames.skins.amount} EACH` : ""}`,
            columns: [
              { label: "POT" },
              { label: "SKINS", value: totalSkinsWon },
              { label: "EACH", value: money(perSkin) },
            ],
          })}

          {/* Net or gross. Gross is the default because it is the game WBC has
              always played here; net is what the leaderboard ranks on, and a
              field with a 20-shot spread wants to see both. */}
          <SegmentedToggle
            options={[[true, "Gross"], [false, "Net"]]}
            value={grossMode}
            onChange={pickMode}
            style={{ marginBottom: 10, width: 160, marginLeft: "auto", marginRight: "auto" }}
          />

          {/* SKINS LEADERS, with each row opening that player's own cards.
              One list rather than two: the money and the holes it was won on
              are the same question, and a second card repeating the same six
              names underneath was just a longer way to ask it. */}
          {Object.keys(skinTotals).length > 0 && (
            <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, marginBottom: 10, overflow: "hidden" }}>
              {/* The two trailing numbers get COLUMN HEADINGS rather than
                  each row re-labelling itself. "4 skins / 3 skins / 1 skin"
                  down a column is the same word printed six times to say
                  something the heading says once — and the word was doing the
                  work of telling you which number was which, so the heading
                  frees the row to be a number. Widths match the cells below
                  so the three line up. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
                <span style={{ flex: 1, minWidth: 0 }}>SKINS LEADERS</span>
                <span style={{ fontSize: FS.micro, color: K.t3, letterSpacing: 0.5, flexShrink: 0, width: 48, textAlign: "center" }}>COUNT</span>
                <span style={{ fontSize: FS.micro, color: K.t3, letterSpacing: 0.5, flexShrink: 0, width: 66, textAlign: "center" }}>$</span>
              </div>
              {Object.entries(skinTotals).sort((a, b) => b[1] - a[1]).map(([pid, count]) => {
                const isExpanded = expandedPlayer === pid;
                return (
                  <div key={pid} style={{ borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                    <div onClick={() => setExpandedPlayer(isExpanded ? null : pid)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer" }}>
                      {/* The leaderboard's chevron — a ▼ that turns over
                          rather than a ▶ that swings, scaled below the type
                          scale's floor because this is an affordance and not
                          data — but LEADING the row rather than trailing the
                          name. On the board it sits after the name because
                          the name is the row; here the row is a name and two
                          numbers, and the mark belongs where the eye starts. */}
                      <span style={{ fontSize: FS.micro, flexShrink: 0, color: isExpanded ? K.acc : K.t2, transition: `transform ${MOTION}`, display: "inline-block", transform: `${isExpanded ? "rotate(180deg)" : "rotate(0)"} scale(0.75)` }}>▼</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {players.find(p => p.id === pid)?.name || pid}
                      </span>
                      <span style={{ fontSize: FS.body, fontWeight: 700, color: K.acc, flexShrink: 0, width: 48, textAlign: "center" }}>{count}</span>
                      <span style={{ fontSize: FS.small, color: K.t3, flexShrink: 0, width: 66, textAlign: "center" }}>{money(count * perSkin)}</span>
                    </div>
                    {isExpanded && renderInlineScorecard(pid)}
                  </div>
                );
              })}
            </div>
          )}

          {roundPills(shownRound, setSkinsRound)}
          {renderRoundScorecard()}
        </div>
      )}

      {tab === "ctp" && (
        <div>
          {noPar3s
            ? empty("🎯", "No par 3s yet", "Closest-to-the-pin holes come from the course. They appear here once a round has a course with a par 3 on it.")
            : (
              <>
                {/* CTP never had a hand-entered pot to preserve, so it is
                    counted from the buy-ins or it is nothing. Hidden from
                    players until there IS one — "$0.00" is not worth a row on
                    a tournament whose director has not set a CTP buy-in. The
                    director keeps it either way; it is where they set one. */}
                {(ctpPot > 0 || user?.isDirector) && potCard({
                  label: "CTP POT", pot: ctpPot,
                  summary: `${ctpField.length} IN${(sideGames?.ctp?.amount || 0) > 0 ? ` · $${sideGames.ctp.amount} EACH` : ""}`,
                  // Just the count of pins the tournament HAS, which is what
                  // the pot divides by. How many are taken and how many are
                  // final are both said better further down — on the pin
                  // itself, where a taken hole carries a name and a FINAL
                  // marker — and a running "2 of 7 taken" up here was a
                  // progress bar for something nobody is waiting on.
                  rightTop: `${par3Count} total`,
                  rightBottom: `${money(perPin)} / pin`,
                })}

                {/* CTP LEADERS, with each row opening that player's own pins.
                    NO DISTANCE ON THE ROW. It used to carry the closest shot
                    of the week beside the count, which is one number standing
                    for several — a man with four pins has four distances and
                    the row printed his best as though it described all of
                    them. The count and the money are what the row is for;
                    every distance lives one tap down, on the pin it belongs
                    to. */}
                {ctpLeaders.length > 0 && (
                  <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, marginBottom: 10, overflow: "hidden" }}>
                    {/* The same two headings the skins card carries, at the
                        same widths, so the two leader boards in this tab read
                        as one idea rather than two layouts. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
                      <span style={{ flex: 1, minWidth: 0 }}>CTP LEADERS</span>
                      <span style={{ fontSize: FS.micro, color: K.t3, letterSpacing: 0.5, flexShrink: 0, width: 48, textAlign: "center" }}>COUNT</span>
                      <span style={{ fontSize: FS.micro, color: K.t3, letterSpacing: 0.5, flexShrink: 0, width: 66, textAlign: "center" }}>$</span>
                    </div>
                    {ctpLeaders.map(({ pid, count }) => {
                      const isOpen = openCtpPlayer === pid;
                      const mine = ctpTags
                        .filter(t => t.playerId === pid)
                        .sort((a, b) => a.round - b.round || a.hole - b.hole);
                      return (
                        <div key={pid} style={{ borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                          <div onClick={() => setOpenCtpPlayer(isOpen ? null : pid)}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer" }}>
                            {/* Chevron first, then the name — the affordance
                                sits where the eye starts the row rather than
                                at the far end of a name it has to read past. */}
                            <span style={{ fontSize: FS.micro, flexShrink: 0, color: isOpen ? K.acc : K.t2, transition: `transform ${MOTION}`, display: "inline-block", transform: `${isOpen ? "rotate(180deg)" : "rotate(0)"} scale(0.75)` }}>▼</span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {players.find(p => p.id === pid)?.name || pid}
                            </span>
                            {/* The count alone. The heading says what it is,
                                so the row does not have to say "CTPs" once
                                per line down the column. */}
                            <span style={{ fontSize: FS.body, fontWeight: 700, color: K.acc, flexShrink: 0, width: 48, textAlign: "center" }}>{count}</span>
                            <span style={{ fontSize: FS.small, color: K.t3, flexShrink: 0, width: 66, textAlign: "center" }}>{money(count * perPin)}</span>
                          </div>
                          {isOpen && (
                            <div style={{ padding: "2px 14px 8px", borderTop: `1px solid ${K.bdr}${ALPHA.tint}` }}>
                              {mine.map(t => (
                                <div key={`${t.round}_${t.hole}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                                  <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, flexShrink: 0, minWidth: 34 }}>Rd {t.round}</span>
                                  <span style={{ fontSize: FS.label, color: K.t2, flex: 1, minWidth: 0 }}>Hole {t.hole}</span>
                                  {/* The distance, here and nowhere else. A pin
                                      tagged without one prints a dash rather
                                      than a zero — nobody paced it, which is
                                      not the same as it being on the lip. */}
                                  <span style={{ fontSize: FS.small, fontWeight: 800, color: t.distanceFt != null ? K.warn : K.t3, flexShrink: 0, minWidth: 44, textAlign: "right" }}>
                                    {t.distanceFt != null ? `${t.distanceFt} ft` : "–"}
                                  </span>
                                  {/* A pin in a round still being played can
                                      still be taken off him. */}
                                  <span style={{ fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.4, flexShrink: 0, minWidth: 46, textAlign: "right", color: roundSettled(t.round) ? K.acc : K.t3 }}>
                                    {roundSettled(t.round) ? "FINAL" : "PENDING"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {roundPills(ctpShownRound, setCtpRound)}

                {(() => {
                  const { course } = roundSetup(ctpShownRound);
                  const par3s = par3sFor(ctpShownRound);
                  if (par3s.length === 0) return (
                    <Card style={{ padding: 14, textAlign: "center", color: K.t3, fontSize: FS.small }}>
                      No par 3s on {course?.name || "this course"}.
                    </Card>
                  );
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                        <SectionLabel style={{ marginBottom: 0, flex: 1 }}>{course?.name || "TBD"}</SectionLabel>
                        {/* Whether this round's pins are the answer or still
                            up for grabs. It is the same sentence the scoring
                            tab's par-3 chip prints, off the same derivation. */}
                        <span style={{ fontSize: FS.label, fontWeight: 800, letterSpacing: 0.5, color: roundSettled(ctpShownRound) ? K.acc : K.t3 }}>
                          {roundSettled(ctpShownRound) ? "ROUND FINAL" : "STILL OUT"}
                        </span>
                      </div>
                      {par3s.map(hole => {
                        const rec = (ctpData[ctpShownRound] || {})[hole];
                        const winner = rec ? players.find(p => p.id === rec.playerId) : null;
                        const dist = rec ? (rec.distanceFt ? `${rec.distanceFt} ft` : (rec.distance || "")) : "";
                        const isEd = editCtpHole === hole;
                        const settled = roundSettled(ctpShownRound);
                        const confirmers = (rec?.confirmedBy || [])
                          .map(pid => players.find(p => p.id === pid)?.name)
                          .filter(Boolean);
                        return (
                          <Card key={hole} style={{ border: `1px solid ${winner ? K.acc + ALPHA.line : K.bdr}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                              <div>
                                <span style={{ fontSize: FS.body, fontWeight: 700 }}>Hole {hole}</span>
                                <span style={{ fontSize: FS.small, color: K.t3, marginLeft: 8 }}>Par 3</span>
                              </div>
                              {winner ? (
                                <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
                                  <span style={{ fontSize: FS.body, fontWeight: 700, color: K.acc, whiteSpace: "nowrap" }}>🎯 {winner.name}</span>
                                  {dist && <span style={{ fontSize: FS.small, fontWeight: 800, color: K.warn }}>{dist}</span>}
                                </span>
                              ) : <span style={{ fontSize: FS.small, color: K.t3 }}>No winner yet</span>}
                            </div>

                            {/* The pin's standing. A tagged hole in a live
                                round is what the field has SO FAR — a group
                                still out can get inside it — so saying FINAL
                                only once the round is done is the difference
                                between a result and a running total. */}
                            {winner && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                                <span style={{
                                  fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5,
                                  padding: "2px 6px", borderRadius: R.xs,
                                  color: settled ? K.acc : K.t3,
                                  border: `1px solid ${settled ? K.acc + ALPHA.line : K.bdr}`,
                                }}>{settled ? "FINAL" : "PENDING"}</span>
                                {/* Groups that walked off, saw this tag and let
                                    it stand — the on-course prompt's other
                                    answer. It is how a director tells a pin
                                    nobody has been asked about apart from one
                                    the field has agreed on. */}
                                {confirmers.length > 0 && (
                                  <span style={{ fontSize: FS.label, color: K.t3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    Confirmed by {confirmers.join(", ")}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* A tag naming somebody who is not in the CTP game
                                still shows — the document is the hole's answer —
                                but it wins no money, and saying so here is
                                cheaper than a director wondering why the board
                                disagrees with the hole. */}
                            {rec?.playerId && !ctpInSet.has(rec.playerId) && (
                              <div style={{ fontSize: FS.label, color: K.warn, marginTop: 4 }}>Not in the CTP game — this pin pays nothing</div>
                            )}

                            {/* Tagged-by line — CTP is claimed on-course by whichever group was closest,
                                so it's worth showing who recorded it when a director is reconciling. */}
                            {rec?.taggedByName && !isEd && (
                              <div style={{ fontSize: FS.label, color: K.t3, marginTop: 4 }}>Tagged by {rec.taggedByName}</div>
                            )}

                            {/* Director override — available whether or not a tag exists. This is the
                                correction path for a mis-tagged winner or a mis-scrolled distance. */}
                            {user.isDirector && !isEd && (
                              <Btn variant="secondary" size="sm" block style={{ marginTop: 10 }}
                                onClick={() => { setEditCtpHole(hole); setEditCtpPlayer(rec?.playerId || ""); setEditCtpFeet(rec?.distanceFt ? String(rec.distanceFt) : ""); }}
                              >{winner ? "Edit CTP" : "Set CTP winner"}</Btn>
                            )}
                            {user.isDirector && isEd && settled && (
                              <div style={{ fontSize: FS.label, color: K.warn, marginTop: 8, lineHeight: 1.5 }}>
                                Round {ctpShownRound} is finalized — this pin is settled. Changing it moves money that has already been called.
                              </div>
                            )}
                            {user.isDirector && isEd && (
                              <div style={{ marginTop: 10 }}>
                                {/* Only players who bought into CTP are offered. A hole
                                    already tagged to somebody since taken out still shows
                                    their name above — that is what the document says — but
                                    they cannot be picked again. */}
                                <select value={editCtpPlayer} onChange={e => setEditCtpPlayer(e.target.value)} style={{ width: "100%", padding: "8px 12px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, marginBottom: 6 }}>
                                  <option value="">Select CTP winner...</option>
                                  {ctpField.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                                <input
                                  type="number" inputMode="numeric" min="1" max={CTP_MAX_FT}
                                  placeholder="Distance (ft)"
                                  value={editCtpFeet}
                                  onChange={e => setEditCtpFeet(e.target.value)}
                                  style={{ width: "100%", padding: "8px 12px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, marginBottom: 8, boxSizing: "border-box" }}
                                />
                                <div style={{ display: "flex", gap: 6 }}>
                                  <Btn size="sm" block disabled={!editCtpPlayer}
                                    onClick={async () => {
                                      if (!editCtpPlayer) return;
                                      const ft = editCtpFeet === "" ? null : Math.max(1, Math.min(CTP_MAX_FT, parseInt(editCtpFeet, 10) || 0)) || null;
                                      await onSetCtp(ctpShownRound, hole, editCtpPlayer, ft);
                                      setEditCtpHole(null);
                                    }}
                                  >Save</Btn>
                                  <Btn variant="secondary" size="sm" block onClick={() => setEditCtpHole(null)}>Cancel</Btn>
                                </div>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
        </div>
      )}

      {tab === "lownet" && (
        <div>
          {potCard({
            label: "LOW NET POT", pot: lowNetPot,
            summary: `${lowNetField.length} IN${(sideGames?.lownet?.amount || 0) > 0 ? ` · $${sideGames.lownet.amount} EACH` : ""}`,
            rightTop: `${roundList.length} round${roundList.length !== 1 ? "s" : ""}`,
            rightBottom: `${money(lowNetPerRound)} / round`,
          })}

          {/* Every round on one screen rather than behind pills: there are
              four of them, each is one line, and the question this tab
              answers — who took which day — is a comparison across them.

              A LEDGER, not a list. Gross, strokes and net each get a column
              and line up down the page, which is what turns "who won Rd 2"
              into "Rd 2 was tied off a 78 and an 85" without anybody doing
              arithmetic. The old row stacked those three numbers into a grey
              sub-line under the name, where they could not be compared with
              the round above.

              A tie is simply a second row under the same round number,
              carrying that man's OWN gross and strokes — two players tie on
              the net off different cards, so the single "2 tied on 71 net"
              the old row printed was true of the pair and a lie about each
              of them. */}
          <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
              <span style={{ flex: 1 }}>BY ROUND</span>
              <span style={{ color: K.t3 }}>{lowNetRows.filter(r => r.decided).length} OF {roundList.length}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                {/* The four score columns are held at near-equal widths so
                    the block of numbers reads as a block. WINNER takes the
                    slack; PAYS is the widest because "$15.63" is the longest
                    string on the row. */}
                <col style={{ width: 34 }} />
                <col />
                <col style={{ width: 36 }} />
                <col style={{ width: 32 }} />
                <col style={{ width: 34 }} />
                <col style={{ width: 32 }} />
                <col style={{ width: 54 }} />
              </colgroup>
              <thead>
                <tr style={{ background: `${K.bdr}${ALPHA.wash}` }}>
                  {[["RD", "left"], ["WINNER", "left"], ["Gross", "right"], ["CH", "right"], ["NET", "right"], ["±", "right"], ["PAYS", "right"]].map(([label, align], i, all) => (
                    <th key={label} style={{
                      textAlign: align, fontSize: FS.micro, fontWeight: 700, letterSpacing: 0.5, color: K.t3,
                      padding: "5px 4px", borderBottom: `1px solid ${K.bdr}${ALPHA.line}`,
                      paddingLeft: i === 0 ? 10 : 4, paddingRight: i === all.length - 1 ? 12 : 4,
                    }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lowNetRows.map((r, ri) => {
                  const settled = roundSettled(r.round);
                  const share = r.winners.length > 0 ? lowNetPerRound / r.winners.length : 0;
                  const courseName = roundSetup(r.round).course?.name || "";
                  const open = openNetRound === r.round;
                  const toggle = () => setOpenNetRound(open ? null : r.round);
                  // Banded by ROUND rather than by row, so a tie's two lines
                  // read as one day rather than as two separate results.
                  const band = ri % 2 === 1 ? `${K.bdr}${ALPHA.wash}` : "transparent";
                  const cell = (extra = {}) => ({
                    padding: "7px 4px", textAlign: "right", fontSize: FS.small, fontWeight: 600,
                    color: K.t2, borderTop: `1px solid ${K.bdr}${ALPHA.hair}`, ...extra,
                  });
                  // ── The round's own header strip ──
                  // Round, chevron and COURSE, on a line of their own above
                  // the winner. The course used to sit under the winner's
                  // name, which read as though it belonged to him rather than
                  // to the day — and on a tie it could only be printed under
                  // one of the two men who played it.
                  const headerRow = (
                    <tr key={`${r.round}_h`} onClick={toggle} style={{ background: `${K.bdr}${ALPHA.wash}`, cursor: "pointer" }}>
                      <td style={cell({ textAlign: "left", paddingLeft: 10, padding: "5px 4px 5px 10px" })}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: FS.label, fontWeight: 800, color: open ? K.acc : K.t3 }}>{r.round}</span>
                          {/* The leaderboard's chevron, same as everywhere. */}
                          <span style={{ fontSize: FS.micro, flexShrink: 0, color: open ? K.acc : K.t2, transition: `transform ${MOTION}`, display: "inline-block", transform: `${open ? "rotate(180deg)" : "rotate(0)"} scale(0.75)` }}>▼</span>
                        </span>
                      </td>
                      <td colSpan={6} style={cell({ textAlign: "left", padding: "5px 12px 5px 4px", fontSize: FS.micro, fontWeight: 700, letterSpacing: 0.4, color: K.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
                        {courseName || "No course set"}
                      </td>
                    </tr>
                  );
                  // The whole field for the day, lowest net first. It answers
                  // the question the winner's name provokes — by how much —
                  // and on a round still being played it is the only thing
                  // this tab can say at all.
                  // The rest of the field, starting at second. The winners
                  // are already printed above in full, so repeating them at
                  // the head of the list was the same two lines twice — the
                  // question this opens is who ELSE was out there.
                  const fieldRows = !open ? [] : lowNetRoundField({ players: lowNetField, round: r.round, lineFor })
                    .filter(f => !r.winners.some(w => w.pid === f.pid))
                    .map(f => {
                    const sub = (extra = {}) => cell({
                      fontSize: FS.label, borderTop: "none", color: K.t3,
                      background: `${K.bdr}${ALPHA.wash}`, padding: "5px 4px", ...extra,
                    });
                    return (
                      <tr key={`${r.round}_f_${f.pid}`}>
                        <td style={sub({ paddingLeft: 10 })} />
                        <td style={sub({ textAlign: "left", color: K.t2, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
                          {f.name}
                        </td>
                        <td style={sub()}>{f.gross}</td>
                        <td style={sub()}>{f.strokes}</td>
                        {/* A card still out has a gross and no round. Printing
                            its net would rank a man on the 14th against men
                            who have signed — the same thing lowNetRounds
                            refuses to do. */}
                        <td style={sub({ color: f.complete ? (f.net < 0 ? K.under : K.t2) : K.t3, fontWeight: 700 })}>
                          {f.complete ? f.netScore : "–"}
                        </td>
                        {/* A card still out takes BOTH trailing cells for its
                            standing. "THRU 16" does not fit the PAYS column
                            alone and wrapped onto two lines; the ± beside it
                            is empty on these rows anyway. */}
                        {f.complete ? (
                          <>
                            <td style={sub({ color: f.net < 0 ? K.under : K.t3, fontWeight: 700 })}>{fmtPar(f.net)}</td>
                            <td style={sub({ paddingRight: 12 })} />
                          </>
                        ) : (
                          <td colSpan={2} style={sub({ paddingRight: 12, fontSize: FS.micro, fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap" })}>
                            {f.wd ? "WD" : `THRU ${f.thru}`}
                          </td>
                        )}
                      </tr>
                    );
                  });
                  // A day the whole field tied, or one only the winner
                  // finished, opens onto nothing — which looks broken rather
                  // than empty unless it says so.
                  if (open && fieldRows.length === 0) fieldRows.push(
                    <tr key={`${r.round}_f_none`}>
                      <td style={cell({ paddingLeft: 10, borderTop: "none", background: `${K.bdr}${ALPHA.wash}`, padding: "5px 4px 5px 10px" })} />
                      <td colSpan={6} style={cell({ textAlign: "left", borderTop: "none", background: `${K.bdr}${ALPHA.wash}`, padding: "5px 12px 5px 4px", fontSize: FS.label, color: K.t3 })}>
                        Nobody else has posted
                      </td>
                    </tr>,
                  );

                  if (!r.decided) return [
                    headerRow,
                    <tr key={r.round} style={{ background: band }}>
                      <td style={cell({ paddingLeft: 10 })} />
                      <td colSpan={6} onClick={toggle} style={cell({ textAlign: "left", color: K.t3, paddingRight: 12, cursor: "pointer" })}>
                        {(() => {
                          const tee = teeWindowFor(r.round);
                          if (tee) return (
                            <>
                              <span style={{ fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5, color: K.t3 }}>TEE </span>
                              <span style={{ color: K.t2, fontWeight: 700 }}>{tee}</span>
                            </>
                          );
                          // No sheet drawn yet, so there is nothing to say
                          // except that the day is still empty.
                          return roundSetup(r.round).course ? "Nobody has finished yet" : "No scores yet";
                        })()}
                      </td>
                    </tr>,
                    ...fieldRows,
                  ];

                  return [
                    headerRow,
                    ...r.winners.map((w, wi) => (
                      <tr key={`${r.round}_${w.pid}`} style={{ background: band }}>
                        {/* The round number lives on the header strip above,
                            so the winner rows start at the name — and a tie's
                            two lines are simply two names under one day. */}
                        <td style={cell({ paddingLeft: 10, borderTop: wi > 0 ? "none" : undefined })} />
                        <td onClick={toggle} style={cell({ textAlign: "left", fontSize: FS.small, fontWeight: 700, color: K.t1, borderTop: wi > 0 ? "none" : undefined, cursor: "pointer", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })}>
                          {w.name}
                        </td>
                        <td style={cell({ borderTop: wi > 0 ? "none" : undefined })}>{w.gross}</td>
                        <td style={cell({ borderTop: wi > 0 ? "none" : undefined })}>{w.strokes}</td>
                        {/* The net as a SCORE — how a low net gets read out in
                            a car park — and the to-par beside it. BOTH take the
                            under-par red: a 67 on a par 72 is a number under
                            par whether it is written as 67 or as −5, and
                            colouring only one of them made the pair look like
                            two different facts. */}
                        <td style={cell({ fontSize: FS.body, fontWeight: 800, color: w.net < 0 ? K.under : K.t1, borderTop: wi > 0 ? "none" : undefined })}>{w.netScore}</td>
                        <td style={cell({ fontWeight: 800, color: w.net < 0 ? K.under : K.t1, borderTop: wi > 0 ? "none" : undefined })}>{fmtPar(w.net)}</td>
                        {/* A day still being played can change hands as the
                            last group comes in, so the money is held rather
                            than printed as though it had been paid. */}
                        <td style={cell({ paddingRight: 12, borderTop: wi > 0 ? "none" : undefined })}>
                          {settled
                            ? money(share)
                            : <span style={{ fontSize: FS.micro, fontWeight: 800, letterSpacing: 0.5, color: K.warn }}>OUT</span>}
                        </td>
                      </tr>
                    )),
                    ...fieldRows,
                  ];
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {tab === "market" && (
        <div>
          {potCard({
            label: "MARKET POT", pot: marketPot,
            // Two buy-ins in one pot, but the second count only appears once
            // it is FINAL. While the halfway window is open "3 rebuying" is a
            // running total that moves every time somebody taps, and a player
            // reading it as the field's verdict is reading a number that is
            // still being written. Shut, it is a fact: this many rebought.
            summary: `${marketField.length} IN${windows.mid.closed ? ` · ${rebuyField.length} REBUYS` : ""}`,
            rightTop: `${board.reduce((a, b) => a + b.shares, 0)} share${board.reduce((a, b) => a + b.shares, 0) !== 1 ? "s" : ""} placed`,
            rightBottom: `${holders.length} holder${holders.length !== 1 ? "s" : ""}`,
          })}

          {/* ── The director's shares worklist ── */}
          {/* Its own drawer, and the only place that lists a player who has
              placed NOTHING. The holders list below only knows about people
              who have already bet, which made the man who handed his picks
              over on paper invisible on the screen meant to chase him. */}
          {user?.isDirector && (
            <>
              <div
                onClick={() => setShowRoster(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                  background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`,
                  padding: "10px 14px", marginBottom: showRoster ? 0 : 10,
                }}
              >
                <span style={{ flex: 1, fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.6 }}>
                  {roster.rows.length - roster.outstanding} OF {roster.rows.length} HAVE WAGERED
                  {roster.outstanding > 0 ? ` · ${roster.outstanding} PENDING` : ""}
                </span>
                <span style={{ fontSize: FS.label, fontWeight: 700, color: K.acc, letterSpacing: 0.6 }}>
                  SHARES {showRoster ? "▾" : "▸"}
                </span>
              </div>

              {showRoster && (
                <div style={{ background: K.card, border: `1px solid ${K.acc}${ALPHA.line}`, borderRadius: R.sm, marginBottom: 10, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", fontSize: FS.label, color: K.t3, lineHeight: 1.4, borderBottom: `1px solid ${K.bdr}` }}>
                    Counts only — what they are holding stays in their book.
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 56px 56px", gap: 2, padding: "6px 12px", borderBottom: `1px solid ${K.bdr}` }}>
                    <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3, letterSpacing: 0.5 }}>PLAYER</span>
                    <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.t2, textAlign: "center" }}>OPEN</span>
                    <span style={{ fontSize: FS.micro, fontWeight: 800, color: K.t2, textAlign: "center" }}>HALF</span>
                  </div>
                  {roster.rows.map(r => {
                    const openFull = r.opening >= MARKET_OPENING_SHARES;
                    const midAny = r.mid > 0;
                    const cell = (n, full, tone) => (
                      <span style={{ textAlign: "center", fontSize: FS.small, fontWeight: 800, color: tone ? (full ? K.acc : K.warn) : K.t3 }}>
                        {n > 0 ? n : "–"}
                      </span>
                    );
                    return (
                      <div key={r.pid}
                        onClick={() => openBook(r.pid)}
                        style={{
                          display: "grid", gridTemplateColumns: "minmax(0,1fr) 56px 56px", gap: 2,
                          alignItems: "center", padding: "8px 12px", cursor: "pointer",
                          borderBottom: `1px solid ${K.bdr}${ALPHA.hair}`,
                          background: r.placed === 0 ? K.warn + ALPHA.wash : "transparent",
                        }}>
                        <span style={{ minWidth: 0, fontSize: FS.small, fontWeight: 600, color: r.placed > 0 ? K.t1 : K.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.name}
                        </span>
                        {cell(r.opening, openFull, r.opening > 0)}
                        {cell(r.mid, r.mid >= MARKET_MID_SHARES, midAny)}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {/* ── Your book ── */}
          {!bookPid ? null : !marketInSet.has(bookPid) ? (
            <Card style={{ marginBottom: 10, color: K.t3, fontSize: FS.small }}>
              {bookPid === myPid ? "You are not in the market game." : "That player is not in the market game."}
            </Card>
          ) : (
            <Card style={{ marginBottom: 10 }} ref={bookRef}>
              {/* NO TITLE ROW. A player has exactly one book and cannot look
                  at anybody else's, so "Your book" named the only thing it
                  could have been — and "4 of 20 left" is "16/20" on the
                  window tab said from the other end. The card starts on the
                  shares. A director gets a heading back below, because they
                  really can be looking at somebody else's. */}
              {/* The director places for somebody else — the path for the phone
                  that died before the bell, and the only way a shut window can
                  still be written to. */}
              {user?.isDirector && (
                <>
                  <select
                    value={bookPid}
                    onChange={e => openBook(e.target.value, bookWindow)}
                    style={{ width: "100%", padding: "8px 12px", background: K.inp, border: `1px solid ${K.bdr}`, borderRadius: R.sm, color: K.t1, fontSize: FS.small, marginBottom: 8 }}
                  >
                    {marketField.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === myPid ? " (you)" : ""}</option>)}
                  </select>
                  {/* A director editing somebody else's bet is a real act with
                      real money behind it, so the screen says whose book is
                      open rather than letting a changed dropdown be the only
                      sign of it. */}
                  {bookPid !== myPid && (
                    <div style={{ fontSize: FS.label, color: K.warn, marginBottom: 8, lineHeight: 1.5 }}>
                      Editing {nameIn(bookPid)}&apos;s shares as director.
                    </div>
                  )}
                  {/* And placing into a window the field can no longer touch is
                      a second thing again — worth saying out loud, because it
                      is the one edit nobody else could have made. */}
                  {!win.open && (
                    <div style={{ fontSize: FS.label, color: K.warn, marginBottom: 8, lineHeight: 1.5 }}>
                      This window is shut to the field. You are placing on the director&apos;s override.
                    </div>
                  )}
                </>
              )}

              {/* Both windows close on a tee time now, so both can be counted
                  down to — a player looking at the halfway tab in the car park
                  after round two needs the same answer the opening tab gave
                  him on Friday. */}
              {finalSheet ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                    <SectionLabel style={{ marginBottom: 0, flex: 1 }}>Your wagers</SectionLabel>
                    <span style={{ fontSize: FS.label, fontWeight: 700, color: K.t3 }}>
                      {totalShares(allLots(bookBet))} share{totalShares(allLots(bookBet)) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {allLots(bookBet).length === 0 ? (
                    <div style={{ fontSize: FS.small, color: K.t3, lineHeight: 1.5 }}>
                      You did not place any shares. Both windows are closed.
                    </div>
                  ) : allLots(bookBet).map(l => {
                    const openN = sharesOn(lotsFor(bookBet, "opening"), l.pid);
                    const midN = sharesOn(lotsFor(bookBet, "mid"), l.pid);
                    return (
                      <div key={l.pid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 700, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {players.find(p => p.id === l.pid)?.name || l.pid}
                        </span>
                        {/* The split, quietly, for anybody working out which
                            of the two calls this holding came from. It only
                            appears when the halfway ten actually went in. */}
                        {midN > 0 && (
                          <span style={{ flexShrink: 0, fontSize: FS.micro, fontWeight: 700, color: K.t3, letterSpacing: 0.3 }}>
                            {openN} + {midN}
                          </span>
                        )}
                        <span style={{ flexShrink: 0, width: 42, textAlign: "right", fontSize: FS.lead, fontWeight: 800, color: K.acc }}>{l.shares}</span>
                      </div>
                    );
                  })}
                </>
              ) : (<>
              {windows.mid.exists !== false && (
                <SegmentedToggle
                  compact
                  style={{ marginBottom: 4 }}
                  options={[["opening", `${windows.opening.label} · ${totalShares(lotsFor(bookBet, "opening"))}/${MARKET_OPENING_SHARES}`],
                            ["mid", `${windows.mid.label} · ${totalShares(lotsFor(bookBet, "mid"))}/${MARKET_MID_SHARES}`]]}
                  value={activeWindow}
                  onChange={k => { setBookWindow(k); setDraft(null); }}
                />
              )}

              {/* The two clocks sit UNDER the switch rather than inside it —
                  a tab is a control and a countdown is a readout, and packing
                  one into the other made the pill two lines tall for the sake
                  of a number that changes on its own. Each cell is half the
                  width so it lands under the tab it belongs to.
                  The tone escalates green → amber on the day of the tee time
                  → red inside the last hour; see lib/market countdownTone.
                  A window that has not opened yet prints NOTHING. "Not yet"
                  is the tab's own share count saying 0/10 already. */}
              {windows.mid.exists !== false && (openingClock || midClock || windows.opening.closed) && (
                <div style={{ display: "flex", marginBottom: 6 }}>
                  {[[windows.opening, openingClock], [windows.mid, midClock]].map(([w, clock]) => (
                    <span key={w.key} style={{
                      flex: 1, textAlign: "center",
                      fontSize: FS.label, fontWeight: 800, letterSpacing: 0.4,
                      fontVariantNumeric: "tabular-nums",
                      color: clock ? toneFor(w) : K.t3,
                    }}>{clock ? clock.label : w.closed ? "CLOSED" : ""}</span>
                  ))}
                </div>
              )}

              {/* What the second window costs, said before the first tap
                  rather than after. Nothing is prepaid here: placing a share
                  IS taking on the rebuy, so a player who has placed none is
                  being warned and a player who has placed some is being told
                  what they already owe. */}
              {activeWindow === "mid" && canPlace && rebuyAmount > 0 && (
                <div style={{
                  fontSize: FS.label, marginBottom: 8, lineHeight: 1.5, padding: "6px 10px",
                  borderRadius: R.sm, border: `1px solid ${owesRebuy ? K.acc : K.warn}${ALPHA.line}`,
                  color: owesRebuy ? K.acc : K.warn,
                }}>
                  {owesRebuy
                    ? `In for the $${rebuyAmount} rebuy — settle up with the director. Taking every share back off drops it.`
                    : `Placing any of these ${MARKET_MID_SHARES} puts ${bookPid === myPid ? "you" : "them"} in for the $${rebuyAmount} rebuy. Pay the director after.`}
                </div>
              )}

              {/* ── Who is on the sheet ──
                  An OPEN window lists the whole field, because any of them
                  can still be backed. A SHUT one lists only the golfers you
                  actually wagered on — the book as it stands, with the
                  fourteen names you passed over taken out of the way.
                  That is the sheet a player wants in front of him at the turn
                  while he decides where the halfway ten should go, and it is
                  the whole of what he owns once both windows have run.
                  Directors keep the full list on the override, because
                  entering a phone that died before the bell means entering a
                  name that is not on the sheet yet. */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {!canPlace && players.every(p => sharesOn(draftLots, p.id) === 0) && (
                  /* A shut window with nothing in it has no rows and, since
                     the note line came out, nothing else either — so it says
                     what happened rather than rendering an empty card. */
                  <div style={{ fontSize: FS.label, color: K.t3, padding: "4px 0 2px", lineHeight: 1.5 }}>
                    {win.closed ? "Nothing wagered in this window." : win.note}
                  </div>
                )}
                {(canPlace ? players : players.filter(p => sharesOn(draftLots, p.id) > 0)).map(p => {
                  const n = sharesOn(draftLots, p.id);
                  return (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                      {/* The name alone. It used to carry a "· 4 held" tail
                          repeating what the accent number beside it already
                          says, and the name brightening from t3 to t1 is the
                          same fact a third time. */}
                      <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: 600, color: n > 0 ? K.t1 : K.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      {/* A SHUT window is a receipt, not a control. The
                          steppers were rendered disabled, which is four grey
                          boxes per row saying "you cannot" to somebody who is
                          only reading. */}
                      {canPlace ? (
                        <>
                          <Btn variant="secondary" size="sm" disabled={n <= 0}
                            style={{ padding: "3px 10px", minWidth: 32 }}
                            onClick={() => bump(p.id, -1)}>−</Btn>
                          {/* The number is a FIELD, not a readout. Twenty shares
                              is twenty taps on a stepper, and a director entering
                              the field's picks off a sheet of paper does that
                              sixteen times over. Typing 12 is one action.
                              Capped through the same setLotShares the steppers
                              use, so a window still cannot be overspent however
                              the number got there. FS.lead because this is a real
                              input and anything under 16px makes iOS zoom the
                              page on focus and never zoom back. */}
                          <input
                            type="number" inputMode="numeric" min="0" max={win.shares}
                            value={n === 0 ? "" : String(n)} placeholder="0"
                            onChange={e => setShares(p.id, e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)}
                            onFocus={e => e.currentTarget.select()}
                            style={{
                              width: 38, textAlign: "center", fontSize: FS.lead, fontWeight: 800,
                              color: n > 0 ? K.acc : K.t3, background: "transparent",
                              border: "none", borderBottom: `1px solid ${K.bdr}`,
                              outline: "none", fontFamily: FONT, padding: 0,
                            }}
                          />
                          <Btn variant="secondary" size="sm" disabled={remaining <= 0}
                            style={{ padding: "3px 10px", minWidth: 32 }}
                            onClick={() => bump(p.id, 1)}>+</Btn>
                          {/* Five at a time. Twenty shares in fives is four taps
                              where the single stepper wanted twenty, and 5/10/15/20
                              is how the field actually talks about a book. It
                              clamps through the same setLotShares as everything
                              else, so tapping it with three left adds three. */}
                          <Btn variant="secondary" size="sm" disabled={remaining <= 0}
                            style={{ padding: "3px 8px", minWidth: 32 }}
                            onClick={() => bump(p.id, 5)}>+5</Btn>
                        </>
                      ) : (
                        <span style={{ flexShrink: 0, width: 42, textAlign: "right", fontSize: FS.lead, fontWeight: 800, color: K.acc }}>{n}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {canPlace && (
                <div style={{ marginTop: 10 }}>
                  <Btn block disabled={!dirty} onClick={commitBook}>{dirty ? "Wager shares" : "Wagered"}</Btn>
                  {/* The two ways back, under the commit rather than beside
                      it: three block buttons do not fit a phone, and these
                      are the undo pair, not alternatives to saving.
                      Clear beats taking twenty shares off one at a time,
                      which is what re-entering a misheard book meant. */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Btn variant="secondary" size="sm" block disabled={!dirty} onClick={() => setDraft(null)}>Reset</Btn>
                    <Btn variant="secondary" size="sm" block disabled={placed === 0} onClick={clearWindow}>Clear window</Btn>
                  </div>
                </div>
              )}
              </>)}
            </Card>
          )}

          {/* ── The market ── */}
          {board.length === 0
            ? empty("📈", "Nothing placed yet", `Everybody in gets ${MARKET_OPENING_SHARES} shares before the tournament starts, and ${MARKET_MID_SHARES} more once the halfway round is in. The pot splits between whoever is holding the winner.`)
            : sealed ? (
              // What is safe to show through the seal: how big the market is,
              // never how it is positioned. A player can see that the field
              // has bet, and their own book above it, and nothing else.
              <Card style={{ marginBottom: 10, textAlign: "center", padding: "28px 20px" }}>
                <div style={{ fontSize: FS.display, marginBottom: 10, opacity: 0.5 }}>🔒</div>
                <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1, marginBottom: 6 }}>The book is sealed</div>
                <div style={{ fontSize: FS.small, color: K.t3, maxWidth: 300, lineHeight: 1.5, margin: "0 auto" }}>
                  {board.reduce((a, b) => a + b.shares, 0)} shares are placed across {holders.length} {holders.length === 1 ? "player" : "players"}.
                  Who is holding whom opens when the tournament is over — betting blind is the game.
                </div>
              </Card>
            ) : (
              <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
                  <span style={{ flex: 1 }}>THE MARKET</span>
                  {!eventComplete && <span style={{ color: K.warn, marginRight: 8 }}>🔒 SEALED</span>}
                  <span style={{ color: K.t3 }}>SHARES · IF THEY WIN</span>
                </div>
                {board.map(r => {
                  const isLeader = r.pid === winnerId;
                  return (
                    <div key={r.pid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}`, background: isLeader ? K.accGlow : "transparent" }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: FS.body, fontWeight: 600, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {isLeader && <span style={{ color: K.gold }}>🏆 </span>}{r.name}
                      </span>
                      {/* The share of the market, as a bar rather than a second
                          number — this is the one thing on the screen that is
                          easier to read as a length than as a percentage. */}
                      <span style={{ width: 44, height: 4, borderRadius: R.xs, background: `${K.bdr}`, overflow: "hidden", flexShrink: 0 }}>
                        <span style={{ display: "block", width: `${Math.round(r.pct)}%`, height: "100%", background: K.acc }} />
                      </span>
                      <span style={{ fontSize: FS.body, fontWeight: 800, color: K.acc, width: 28, textAlign: "right", flexShrink: 0 }}>{r.shares}</span>
                      <span style={{ fontSize: FS.small, color: K.t3, width: 56, textAlign: "right", flexShrink: 0 }}>{money(r.perShare)}</span>
                    </div>
                  );
                })}
              </div>
            )}

          {/* ── The payout ── */}
          {/* Names and share counts, so it is sealed on the same terms as the
              board — a standing payout is the board read backwards. */}
          {winnerId && board.length > 0 && !sealed && (
            <div style={{ background: K.card, borderRadius: R.lg, border: `1px solid ${eventComplete ? K.gold + ALPHA.line : K.bdr}`, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 14px", borderBottom: `1px solid ${K.bdr}`, fontSize: FS.label, fontWeight: 700, color: K.gold, letterSpacing: 1 }}>
                {eventComplete ? "PAYOUT" : "IF IT ENDED NOW"}
              </div>
              <div style={{ padding: "8px 14px", fontSize: FS.small, color: K.t3, borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                {leader?.name} · {payouts.totalShares} share{payouts.totalShares !== 1 ? "s" : ""} held
                {payouts.totalShares > 0 ? ` · ${money(payouts.perShare)} each` : ""}
              </div>
              {payouts.unclaimed ? (
                <div style={{ padding: "12px 14px", fontSize: FS.small, color: K.warn, lineHeight: 1.5 }}>
                  Nobody is holding {leader?.name}. The {money(marketPot)} pot has no claimant — that is a conversation for the room, not something the app should decide.
                </div>
              ) : payouts.rows.map(r => (
                <div key={r.pid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${K.bdr}${ALPHA.hair}` }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: FS.body, fontWeight: 600, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nameIn(r.pid)}
                  </span>
                  <span style={{ fontSize: FS.body, fontWeight: 700, color: K.acc, flexShrink: 0 }}>{r.shares} sh</span>
                  <span style={{ fontSize: FS.small, fontWeight: 700, color: K.gold, width: 64, textAlign: "right", flexShrink: 0 }}>{money(r.payout)}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Who is holding what ── */}
          {holders.length > 0 && !sealed && (
            <Card style={{ marginBottom: 10 }}>
              <SectionLabel style={{ marginBottom: 8 }}>Holders</SectionLabel>
              {holders.map(h => {
                const isOpen = openHolder === h.pid;
                return (
                  <div key={h.pid} style={{ borderBottom: `1px solid ${K.bdr}${ALPHA.wash}` }}>
                    <div onClick={() => setOpenHolder(isOpen ? null : h.pid)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px", cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: K.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                        <span style={{ fontSize: FS.micro, flexShrink: 0, color: isOpen ? K.acc : K.t2, transition: `transform ${MOTION}`, display: "inline-block", transform: `${isOpen ? "rotate(180deg)" : "rotate(0)"} scale(0.75)` }}>▼</span>
                      </div>
                      <span style={{ color: K.acc, fontWeight: 800, flexShrink: 0 }}>{h.shares} sh</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: "0 4px 8px 20px" }}>
                        {h.lots.map(l => (
                          <div key={l.pid} style={{ display: "flex", justifyContent: "space-between", fontSize: FS.small, color: K.t2, padding: "3px 0" }}>
                            <span>{players.find(p => p.id === l.pid)?.name || l.pid}</span>
                            <span style={{ fontWeight: 700, color: K.t1 }}>{l.shares}</span>
                          </div>
                        ))}
                        {/* The correction path, at the point the mistake is
                            spotted. Reading a wrong allocation and then having
                            to scroll back up and find the name in a dropdown
                            is how the wrong man gets edited. */}
                        {user?.isDirector && (
                          <Btn variant="secondary" size="sm" style={{ marginTop: 6 }}
                            onClick={() => openBook(h.pid)}
                          >Edit these shares</Btn>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      <ConfirmModal modal={confirmModal} />
    </div>
  );
}

// ── GROUPS ──

export default BettingView;
