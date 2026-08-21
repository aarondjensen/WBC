import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { _app, _auth, onAuthStateChanged, doGoogleSignIn, doAppleSignIn, doSignOut, consumeRedirectResult, deleteAccount, USERS_COLLECTION, NATIVE_APPLE_ENABLED, APPLE_PROVIDER_ENABLED, isNativePlatform, isAndroidNative, AUTH_PROVIDERS_ENABLED, TOURNAMENT_ID, getEditionSlug, getTournamentYear, isDefaultEdition, rememberDirector, rememberSignedIn, hadAuthSession, getHomeEditionId, getActiveTournamentId } from "./firebase";
import { readMembership, isDirectorAccount, resolveMember, setDirector, subscribeMemberships } from "./lib/accounts";
// The fourth way in — no account, no password, no roster spot, no writes.
import { guestUser, isGuest, setGuestWrites, GUEST_NOTICE } from "./lib/guestMode";
import { K, FS, R, ALPHA, MOTION, SHADOW, getTheme, setTheme, entranceBg } from "./theme";
import { Toggle, SectionLabel, Card, Toast, Btn } from "./components/ui";
import { computeIndividualBoard, rankIndividualBoard, WD_SCORE } from "./lib/individualBoard";
// Only what the SHELL still needs — the rest went to the Betting tab with it.
import { fieldFor, computeSkins, toggleIn } from "./lib/sideGames";
import { normalizeLots, openingSharesLeft, marketWindows, eligibleBets, rebuyers, teeOffAt, roundComplete, marketOutsiders } from "./lib/market";
// Which books this phone may hold, and when a director publishes the reveal.
import { betsToHold, shouldPublish, betsSignature } from "./lib/marketSeal";
import { SyncBanner } from "./components/SyncBanner";
import { LeaderboardView } from "./components/LeaderboardView";
import { GateScreen } from "./components/GateScreen";
// Tee times survive a re-group because of these two — see lib/teeSheet.js.
import { rowsToTeeTimes, mergeTeeTimes } from "./lib/teeSheet";
// Score documents → the holeData map, deletions included — see lib/holeScores.
import { applyScoreChanges, roundOf } from "./lib/holeScores";
// Whether this phone is actually reaching the server — see lib/connection.
import { useSyncStatus } from "./lib/useSyncStatus";
// Edition rows + career names → the roster every screen renders. The join and
// the rule for when to redo it live together — see lib/roster.
import { useRoster } from "./lib/roster";
import { useSheetDrag } from "./lib/useSheetDrag";
import { usePullToRefresh, hasNewBundle } from "./lib/usePullToRefresh";
// Fetching the tabs nobody has tapped yet — see lib/whenIdle.
import { warmChunks, whenIdle } from "./lib/whenIdle";
// Keeping the app shell on the phone — see lib/swRegister.
import { registerAppServiceWorker } from "./lib/swRegister";
import { NotificationPrompt } from "./components/NotificationPrompt";
import { registerForPush, getCachedSubscriptionStatus, getNotificationPermissionState, isStandalonePWA } from "./lib/notifications";
import { shouldPromptForPush, wasPrompted, markPrompted, PUSH_PROMPT_DELAY_MS } from "./lib/notificationPrompt";
import { rowsToPairings, dedupeGroups } from "./lib/pairings";
import { EditionBanner } from "./components/EditionBanner";
import { warmEditions, cachedEditions } from "./lib/editions";
import { lockNotice, isEditionLocked, canAdminEdition, demoOnlyAdmin } from "./lib/editionLock";
import { editionClosedToMembers } from "./lib/editionLifecycle";
import { liveEdition, editionBannerShowing } from "./lib/editionHome";
import { holdForAuth } from "./lib/authHold";
import { docIds } from "./lib/editionId";
import { scopeFor, scopedRegistry } from "./lib/playerScope";
// The small conversions every screen does — see lib/format.
import { teeTimeToMinutes } from "./lib/format";
// How many rounds this event plays — a live binding. See lib/rounds.
import { NUM_ROUNDS, setRoundCount } from "./lib/rounds";
import { db, writes } from "./lib/db";
import { registryRows, roundRows, courseIdsOf, stitchCourses } from "./lib/staticData";
import { getDefaultTee } from "./lib/defaultTee";
import { missingTees } from "./lib/roundSetup";
import { indexFor, matchHistoryName } from "./lib/handicap";
import { groupKey as groupKeyOf, roundOfGroupKey, liveRound, roundFinalized, switchableGroups, groupProgress } from "./lib/groupSwitch";
import { AppHeader } from "./components/AppHeader";
import { GroupSwitcher } from "./components/GroupSwitcher";
import { MoreMenu } from "./components/MoreMenu";
// ── The tabs, fetched off the critical path and warmed straight after ──
// Every one of these is a screen nobody is looking at when the app opens, and
// together they were most of what a phone downloaded before it could draw a
// leaderboard. `lazy` moves them into chunks of their own.
//
// On its own that would be a bad trade for THIS app. The Scoring tab is
// tapped on a tee box, and a chunk that has not been fetched yet needs a
// network at the exact moment there may not be one. So every one of them is
// WARMED after first paint — see the warm effect below and lib/whenIdle. Off
// the critical path, on the phone before anybody taps.
const OnCourseScoring = lazy(() => import("./components/OnCourseScoring").then(m => ({ default: m.OnCourseScoring })));
const PlayersView = lazy(() => import("./components/PlayersView").then(m => ({ default: m.PlayersView })));
const GroupsView = lazy(() => import("./components/GroupsView").then(m => ({ default: m.GroupsView })));
// Picking your name off the roster, shown once per account and never again.
// It is here for what it DRAGS: ClaimScreen renders the Tournaments sheet, so
// a static import of it pinned EditionSwitcher into the startup bundle and
// undid the deferral above. Not warmed, for the same reason — warming it
// would fetch that sheet on every launch to serve a screen almost nobody
// sees. It is reached one moment after an OAuth round trip, so the network it
// needs is the network that just answered.
const ClaimScreen = lazy(() => import("./components/ClaimScreen").then(m => ({ default: m.ClaimScreen })));
// The two sheets off the More menu. Warmed when that menu opens rather than
// on idle — the same trick warmEditions() already plays with their DATA, one
// tap ahead of the sheet they belong to.
const EditionSwitcher = lazy(() => import("./components/EditionSwitcher").then(m => ({ default: m.EditionSwitcher })));
const NotificationSettings = lazy(() => import("./components/NotificationSettings").then(m => ({ default: m.NotificationSettings })));
// ── The gallery, fetched only if somebody opens it ──
// Its data subscription is already deferred until first open (see the
// wbc_media listener), for the reason that the photo index is the one
// collection whose size is unbounded. The CODE deserves the same treatment:
// it is the largest view nobody looks at during a round, and a phone on a tee
// box should not be carrying it. `lazy` puts it in its own chunk that is
// fetched on the first tap and cached for the rest of the session.
const PhotosView = lazy(() => import("./components/PhotosView"));
// The director's console — the draw editor, the tee assigner, the player
// editor, the course search, the event calendar. Roughly a third of the app's
// JavaScript, and one person in the field opens it. Lazy, so the other eleven
// never download it to read a leaderboard. See components/AdminView.
const AdminView = lazy(() => import("./components/AdminView").then(m => ({ default: m.AdminView })));
import { photoUploadsAllowed, uploadsDisabledReason } from "./lib/media";
import { returningPlayers, returningLine } from "./lib/returningPlayers";
import { WBC_LOGO, WBC_FAVICON, clampRounds, SIDE_GAME_KEYS, defaultTournamentName } from "./constants";
// firebase/messaging is NOT imported here — see the MODULE LOAD POLICY note in
// lib/notifications.js. It is pulled in dynamically by the one effect that
// listens for foreground pushes, so it stays out of the startup bundle (it is
// the largest piece of the SDK nothing needs to draw a leaderboard) and a
// browser that cannot load it at all fails inside that effect rather than
// taking this whole chunk down with it.



// Player registry — populated from Firestore on mount
let DEMO_PLAYERS = [];

// ── How many rounds this event plays ──────────────────────────────
// Four almost every year; three when the schedule loses a day (2010, 2011 and
// 2022 all ran three). It used to be a hard constant here, which made a
// three-round year a code change and a redeploy — so it is now part of the
// event setup a director edits in Admin → Event, stored on the tournament_state
// document as `meta.rounds`.
//
// NUM_ROUNDS and setRoundCount moved to lib/rounds — read the header there
// before touching either. It explains the one rule that makes a module-level
// mutable safe here (assigned during render, from state, before children
// render) and why the other kind took the app down once. The screens are
// moving out of this file one at a time, and a component in src/components
// cannot import a binding from the app shell without a circular import.
//
// DEFAULT_NUM_ROUNDS / ROUND_CHOICES / clampRounds are in constants.js — the
// Tournaments picker needs the same numbers to tell a finished year from a
// live one. Both are imported at the top of this file.

// Derived from the ACTIVE edition rather than pinned to 2026, so switching to
// wbc_2027 renames the default tournament and moves the year without a code
// change. `num_rounds` reads the live round count above, so this object and
// NUM_ROUNDS can never disagree — several call sites reach for one or the
// other and used to get different answers once the count stopped being fixed.
const TOURNAMENT = {
  get id() { return TOURNAMENT_ID; },
  get name() { return defaultTournamentName(getTournamentYear()); },
  get year() { return getTournamentYear(); },
  get num_rounds() { return NUM_ROUNDS; },
  status: "active",
};

// ── Firebase initialized above ──
// ── Firebase / Firestore configuration ──
// Firebase config + app/db initialization live in src/firebase.js (the
// extracted auth module — single source of truth for all Firebase infra).
// _app and _db are imported at the top of this file.
//
// TOURNAMENT_ID is no longer a constant here — it is the active-edition live
// binding exported by firebase.js and imported at the top of this file. Every
// read of it below picks up whichever edition is currently selected.

// CTP distance wheel — whole feet, 1..CTP_MAX_FT. Ported from MNQ's hole-CTP prompt.
// A ball outside 60 ft on a par 3 isn't winning a closest-to-pin, so the wheel caps
// there rather than scrolling forever.
// CTP_MAX_FT lives in constants.js — the Betting tab needs it from its own file.
// CTP_WHEEL_ITEM / CTP_WHEEL_H are in constants.js — the scoring screen is its
// own file now and the wheel goes with it.

// ── Google/Apple sign-in feature flags ──
// AUTH_PROVIDERS_ENABLED is defined in src/firebase.js (single source of truth,
// since it also controls authDomain + the auth resolver there) and imported
// above. It gates the "Sign in with Google/Apple" section on the login screen
// and the auth subscription effect. Keep it FALSE until the Phase 1 console
// work documented in firebase.js is done; the PIN login is unaffected.

// Aaron's decision for the trusted 12-player group: a manual "pick your name"
// claim links immediately, with no director-approval step. Flip to TRUE later
// to require approval before a manual claim resolves (that path is not built
// yet — it would write a pending record instead of claiming outright).
const CLAIM_REQUIRES_APPROVAL = false;

// ── Push notifications (FCM) ──
// Web Push VAPID PUBLIC key (not a secret — ships in the client bundle).
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates.
const VAPID_KEY = "BF3PLSs3kpCVHbhnbuBo1gSYeLKhYYwEgICUo07xRpuQP8LyxqkLkSV969ZcIptb1ZSY81h8738lblo9N2goNGo";

// The Firestore data layer — `db`, and the `writes` tracker the sync banner
// reads — is in lib/db. Every screen is its own file now and each of them
// needs it; see the header there for the three things worth knowing.

// Push registration moved to src/lib/notifications.js, alongside the
// unsubscribe / status / test-send half it never had. registerForPush is
// imported at the top of this file; the settings screen owns the rest.


// ── _e: the active edition's slug, for document ids ──
// Every id below that used to hardcode `2026` calls this instead, so a second
// edition writes `hs_2027_...` rather than colliding with 2026's documents.
// See getEditionSlug in firebase.js for why it's a slug and not a prefix.
//
// A FUNCTION, not a captured constant: a module-level `const slug =
// getEditionSlug()` would freeze whichever edition happened to be active when
// this module was first evaluated, which is exactly the bug the live binding
// on TOURNAMENT_ID exists to avoid.
const _e = () => getEditionSlug();

// Which round a score document belongs to, and the fold that turns those
// documents into holeData, both live in lib/holeScores — imported at the top
// of this file. There is no second bulk parser beside them any more: there
// used to be one, for a cold-start read of the whole collection that ran
// alongside the subscription, so a score document had two readings that could
// disagree. The subscription's fold is the only one now.
// Convert holeData entry to a Firestore document
const holeDataToRow = (pid, rnd, holeIdx, score, courseId) => ({
  id: docIds.holeScore(_e(), rnd, pid, holeIdx),
  round_score_id: docIds.roundScore(_e(), rnd, pid),
  tournament_id: TOURNAMENT_ID,
  player_id: pid,
  course_id: courseId || "unknown",
  round_number: rnd,
  hole_number: holeIdx + 1,
  score: score,
});

// The draw — how a round's groups get decided — is in lib/pairingDraw with
// a test. See the header there; the search it runs is the most algorithmic
// thing in this app and had nothing checking it.

// Convert tee assignment rows → teeData format { round: { pid: teeName } }
const rowsToTeeData = (rows) => {
  const td = {};
  rows.forEach(r => {
    if (!td[r.round_number]) td[r.round_number] = {};
    td[r.round_number][r.player_id] = r.tee_name;
  });
  return td;
};

// The RECORDED course handicap, when a row carries one → { round: { pid: ch } }.
//
// Only imported editions have it (see lib/historyImport.js). The early WBCs set
// a handicap once and played it on every course, so those years cannot be
// re-derived from an index — the board reads this instead when it is present,
// and falls through to calcCH for the running tournament, which is every row
// this map comes out empty for.
const rowsToCourseHandicaps = (rows) => {
  const ch = {};
  rows.forEach(r => {
    if (!Number.isFinite(r.course_handicap)) return;
    if (!ch[r.round_number]) ch[r.round_number] = {};
    ch[r.round_number][r.player_id] = r.course_handicap;
  });
  return ch;
};

// Convert skins rows (skin_type "ctp") → ctpData { round: { holeNum: { playerId, distanceFt, distance, taggedByName } } }
// CTP is TOURNAMENT-WIDE: exactly one winner per par-3 per round, held by whichever
// group has tagged the closest ball so far. Later groups see the standing tag as the
// number to beat and can claim it — see the CTP prompt in OnCourseScoring.
const rowsToCtp = (rows) => {
  const cd = {};
  (rows || []).filter(r => r.skin_type === "ctp" && r.player_id).forEach(r => {
    const rnd = roundOf(r);
    if (!cd[rnd]) cd[rnd] = {};
    const ft = (r.distance_ft === 0 || r.distance_ft) ? r.distance_ft : null;
    cd[rnd][r.hole_number] = {
      playerId: r.player_id,
      distanceFt: ft,
      distance: r.distance || (ft ? `${ft} ft` : ""),
      taggedByName: r.tagged_by_name || "",
      // WHICH GROUP tagged it, and where that group tees off. The name alone
      // says who typed; this says where they were in the field, which is the
      // only way a group entering late can be told that the number in front
      // of them came from BEHIND them. Null on a director's override and on
      // any tag written before this was recorded — see lib/ctp, where an
      // unknown order deliberately says nothing.
      taggedGroupKey: r.tagged_group_key || null,
      taggedGroupOrder: Number.isInteger(r.tagged_group_order) ? r.tagged_group_order : null,
      // Who has walked off this green, seen the standing tag and let it
      // stand. See onConfirmCtp — it is the other half of the on-course
      // prompt, and the only record that a group answered rather than
      // never being asked.
      confirmedBy: Array.isArray(r.confirmed_by) ? r.confirmed_by : [],
    };
  });
  return cd;
};

// Convert market rows (skin_type "market") → [{ pid, opening: [{pid,shares}], mid: [...] }]
//
// The market rides in `skins` alongside the CTP tags rather than in a
// collection of its own, and that is a deliberate trade: `skins` is already
// subscribed, already scoped by tournament_id, already cleared by Start Fresh,
// and already member-writable in firestore.rules — which the market needs,
// because the person placing a bet is a player, not the director. A new
// collection would have been tidier and would have been inert until somebody
// deployed a rules change.
//
// Lots are normalised on the way in so a hand-edited document, a document
// written by an older bundle and a freshly saved one all read the same.
const rowsToMarket = (rows) =>
  (rows || [])
    .filter(r => r.skin_type === "market" && r.player_id)
    .map(r => ({
      pid: r.player_id,
      opening: normalizeLots(r.opening),
      mid: normalizeLots(r.mid),
    }))
    .sort((a, b) => String(a.pid).localeCompare(String(b.pid)));

// The side games' money, off tournament_state.side_games, with every field
// present whether or not the document carries it. `in` stays NULLISH when it
// has never been set — that is what "everybody" is — so this fills in the
// shape and deliberately does not fill in that answer.
//
// `rebuy` is the market's halfway window, and it is a BUY-IN of its own
// rather than a free top-up on the market seat: about half the field takes
// it and its money goes into the same market pot. It carries a PRICE here
// but no list — the ten shares are open to everybody in the market game and
// the debt is incurred by placing them, so who is in for it is read off the
// bets rather than tagged (see lib/market rebuyers). Keeping it as a fourth
// game is what puts it on the collection sheet as a column instead of the
// director holding "and also these six rebought" in their head.
// SIDE_GAME_KEYS / SIDE_GAME_LABELS live in constants.js — Admin and the
// Betting tab both read them, and the Betting tab is its own file now.
const mergeSideGames = (raw) => {
  const out = {};
  SIDE_GAME_KEYS.forEach(k => {
    const g = (raw || {})[k] || {};
    out[k] = {
      amount: Number(g.amount) || 0,
      in: Array.isArray(g.in) ? g.in : null,
      // Who has actually handed the money over. Separate from `in` because
      // tagging the field and collecting from it are days apart, and unlike
      // `in` a missing list means NOBODY — paying is an affirmative act, so
      // there is no everybody-by-default here.
      paid: Array.isArray(g.paid) ? g.paid : [],
      // Skins is the only one with a hand-typed pot to preserve: it is the
      // game WBC was already playing before any of this existed.
      ...(k === "skins" ? { pot: Number(g.pot) || 0 } : {}),
    };
  });
  return out;
};

// Convert tee times rows → teeTimesData { round: [time, time, ...] }
// calcCH now lives in lib/individualBoard.js, alongside the net-to-par math it
// feeds, and is imported at the top of this file — one implementation for the
// leaderboard, the scorecards and the finalize preview alike.
// fmtPar, teeTimeToMinutes and minutesToTimeStr now live in lib/format —
// see the header there. They are imported at the top of this file.


// The scoring gate — SCORING_LEAD_MIN and isScoringOpen — is in
// lib/scoringGate, with a test. See the header there for what each closed
// door is protecting against.
// localDateISO and fmtRoundDate are in lib/format, imported at the top.
// The tee-colour logic — TEE_COLOR_MAP, resolveTeeColor, getComboColors and
// the light/dark tests — is in lib/teeColors with a test. Imported below.
// TeeColorSwatch — handles solid, combo (diagonal split), and black (gray+dot) tees
// TeeColorSwatch is components/TeeColorSwatch.jsx — it is drawn on five
// screens and they are becoming five files.


// K moved to src/theme.js when a second file needed it — see that file's
// header. Imported at the top; every read below is unchanged.


// GroupSetup moved to components/GroupSetup.jsx — see the header there.

const BettingView = lazy(() => import("./components/BettingView"));

// GroupsView moved to components/GroupsView.jsx — see the header there.





// GateScreen moved to components/GateScreen.jsx — see the header there.

const sortCoursesByRound = (list, rounds) => {
  return [...list].sort((a, b) => {
    const ra = rounds.find(r => r.course_id === a.id)?.round_number ?? 99;
    const rb = rounds.find(r => r.course_id === b.id)?.round_number ?? 99;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name); // fallback alpha for unassigned
  });
};

// ── MAIN APP ──
export default function WBCApp() {
  // Session persistence: restore the logged-in user on relaunch so players
  // log in once per device (also needed so push can target the right person).
  const [user, setUser] = useState(() => {
    try { const s = localStorage.getItem("wbc_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  useEffect(() => {
    try {
      if (user && !user.isGuest) localStorage.setItem("wbc_user", JSON.stringify(user));
      else localStorage.removeItem("wbc_user");
    } catch {}
  }, [user]);

  // ── The guest tour writes nothing ──
  // Set here rather than at the Guest button, because this is the one place
  // that sees EVERY change of who is holding the phone — including logging out
  // of the tour, which is what clears it. The data layer reads the latch; see
  // lib/guestMode for why it takes being signed out as well as being latched
  // before it swallows anything.
  useEffect(() => { setGuestWrites(isGuest(user)); }, [user]);

  // ── Google/Apple auth + prebuild-and-claim state ──
  // claims: uid → player_id (mirror of the wbc_users collection). Its VALUES
  // are the source of truth for which player profiles are already claimed —
  // no redundant `claimed` flag is stored on the player record.
  const [claims, setClaims] = useState({});
  // undefined = Firebase has not answered yet; null = it answered, and nobody
  // is signed in. The two have to be told apart: the app draws the sign-in
  // screen for the second and must not draw it for the first. See the render
  // gates below and hadAuthSession in firebase.js.
  const [fbUser, setFbUser] = useState(undefined); // current Firebase Auth user
  const [claimState, setClaimState] = useState(null); // null | { status: "needs-claim", candidates }
  const [claimBusyId, setClaimBusyId] = useState(null);
  const [authMsg, setAuthMsg] = useState("");        // provider sign-in error, shown on login screen

  // ── The door: the tournament-password membership ──
  // wbc_accounts/{uid}, and the only place Admin access comes from, via its
  // `is_director` flag. `undefined` while the answer is in flight, which has
  // to stay distinguishable from null: showing the password screen to
  // somebody who is already through it, because a read had not landed yet,
  // would be its own bug. null means signed in but not a member.
  //
  // The answer is stored WITH the account it is about, in one value, because
  // the two must never disagree. Keeping only the document meant the answer
  // for "nobody is signed in" (null) was indistinguishable from "the read came
  // back no" — and auth resolving changes fbUser one render BEFORE the effect
  // below can start the new read. For that one render a returning player had a
  // truthy fbUser sitting next to a stale null, which is exactly the shape the
  // gate below tests for, so the password screen painted at somebody who was
  // already through it. Comparing the answer's uid against the current one
  // makes that window read as "still in flight", which is what it is.
  const [membershipAnswer, setMembershipAnswer] = useState({ uid: undefined, doc: null });
  const membership = membershipAnswer.doc;
  const member = resolveMember(membershipAnswer, fbUser?.uid);

  // Ask the door. A FAILED read is not a "no" — a phone coming up on bad
  // signal must not be told its password is needed again — so it retries
  // before giving an answer. If it still cannot tell, it falls through to the
  // password screen rather than hanging forever: that screen re-checks
  // membership on submit, so somebody who is already through gets waved past
  // as soon as the network returns.
  const loadMembership = useCallback(async (uid) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return { ok: true, doc: await readMembership(uid) }; }
      catch (e) {
        console.error("[gate] membership check", e);
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    return { ok: false, doc: null };
  }, []);

  useEffect(() => {
    if (!AUTH_PROVIDERS_ENABLED) { setMembershipAnswer({ uid: fbUser ? fbUser.uid : null, doc: null }); return; }
    if (!fbUser) { setMembershipAnswer({ uid: null, doc: null }); return; }
    let live = true;
    // No "in flight" write needed — the answer already fails the uid check
    // above the moment fbUser changes, so it reads as unresolved for free.
    (async () => {
      const { doc: m } = await loadMembership(fbUser.uid);
      if (live) setMembershipAnswer({ uid: fbUser.uid, doc: m });
    })();
    return () => { live = false; };
  }, [fbUser, loadMembership]);

  // Account sheet (log out / delete account). Delete is only offered to users
  // who actually signed in with a provider (fbUser set) — that's the "account"
  // the app stores require to be deletable. PIN-only players have no such
  // account to delete. deleteStage: null | "confirm" | "working".
  const [accountOpen, setAccountOpen] = useState(false);
  // Light or dark. The VALUE lives in theme.js (K is mutated in place, so every
  // call site repaints); this state exists only to make React re-render when it
  // changes — the palette is not React's to own.
  const [theme, setThemeState] = useState(getTheme);
  const pickTheme = (name) => { setThemeState(setTheme(name)); };
  const [menuOpen, setMenuOpen] = useState(false);
  // Every year the tournament has been run in this app. A sheet rather than a
  // view because opening one RELOADS the app onto that edition (see
  // lib/editions.js), so there is nothing to route back from.
  const [editionsOpen, setEditionsOpen] = useState(false);
  // Tournaments is a tap further in than this menu, so the years are fetched
  // while the menu is being read — see warmEditions, which does nothing at all
  // on a device that has opened the picker before.
  // The CHUNKS for both go with it. Tournaments and Notifications are the two
  // sheets this menu leads to, and a menu being read is a whole tap's worth of
  // warning that one of them is about to be opened.
  useEffect(() => {
    if (!menuOpen) return;
    warmEditions();
    return warmChunks([
      () => import("./components/EditionSwitcher"),
      () => import("./components/NotificationSettings"),
    ]);
  }, [menuOpen]);
  // The bar's real height, measured rather than guessed: the menu sits flush
  // on top of it, and the bar's height moves with the device's bottom inset.
  const navRef = useRef(null);
  const [navH, setNavH] = useState(62);
  // Measured, so useLayoutEffect — same reason as the leaderboard's column
  // sizing: a measure-then-restyle in useEffect paints the guessed 62px first
  // and the real height a frame later.
  useLayoutEffect(() => {
    const measure = () => { if (navRef.current) setNavH(navRef.current.offsetHeight); };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);
  const [deleteStage, setDeleteStage] = useState(null);
  const [deleteErr, setDeleteErr] = useState("");
  // handleDeleteAccount is defined further down, AFTER notify() exists — see note there.

  // The three ways out of the sheet — the backdrop, the ✕, and a swipe down —
  // all land here, so "closing" means one thing and the confirm stage can
  // never be left armed behind a closed sheet.
  const closeAccount = () => { setAccountOpen(false); setDeleteStage(null); };
  // A deletion in flight is the one state with no way out: the backdrop is
  // already inert while it runs, and the ✕ is hidden, so the swipe goes too.
  const accountDrag = useSheetDrag({ onClose: closeAccount, enabled: deleteStage !== "working" });

  // iOS standalone height fix, enforced from React. --app-height = window.innerHeight
  // (which excludes the home-indicator area that 100dvh wrongly includes). This
  // mirrors index.html but also runs after React mounts — critical now that a
  // persisted login mounts the constrained main view on first paint, before iOS
  // has settled the standalone viewport. Without it, the view can lock to a wrong
  // height (fat top gap + clipped bottom nav).
  useEffect(() => {
    // Is a text field focused — i.e. is the on-screen keyboard up? Drives the
    // shrink guard below. Must mirror index.html.
    const isEditing = () => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      if (el.isContentEditable) return true;
      return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || "");
    };
    const setAppHeight = (allowShrink = false) => {
      try {
        // GUARD: on iOS PWA cold-reopen/resume, window.innerHeight is briefly 0
        // (or an unstable tiny value) during the launch transition. Writing that
        // into --app-height collapses the fixed-height, overflow:hidden app
        // container to nothing — the "flash then dark blank screen" bug. Ignore
        // any non-sane measurement and keep the last good value (or the CSS
        // 100dvh fallback) so the view can never collapse. 100px floor is safe:
        // no real device viewport is shorter. Must mirror index.html.
        const h = window.innerHeight;
        if (!(h > 100)) return;
        // KEYBOARD GUARD: opening the on-screen keyboard shrinks innerHeight and
        // fires resize. Believing it collapses the app container the same way —
        // the bottom nav rides up into the middle of the screen with a black band
        // beneath it — and the grow-back resize does NOT reliably arrive when the
        // keyboard closes. Dismissing it by unmounting the field is the case that
        // strands it: save a course name in Admin and the editor (and its input)
        // disappear, so the height stays shrunk with no keyboard left to explain
        // it. While a field owns focus --app-height may grow but never shrink; a
        // genuine shrink while typing (rotation) still lands via the orientation
        // handler, which passes allowShrink, and via the re-measure after blur.
        const prev = parseFloat(document.documentElement.style.getPropertyValue("--app-height")) || 0;
        if (!allowShrink && prev && h < prev && isEditing()) return;
        document.documentElement.style.setProperty("--app-height", h + "px");
      } catch {}
    };
    // iOS scrolls the DOCUMENT to reveal a focused field even though html/body
    // are overflow:hidden, and does not always scroll back when the keyboard
    // goes — which lifts the whole app off the bottom of the screen and looks
    // identical to the collapse above. Nothing in this app scrolls the document
    // (every scroller is an inner pane), so pinning it back to 0 is always safe.
    const unscroll = () => {
      if (isEditing()) return; // don't fight iOS while it reveals the field
      try {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      } catch {}
    };
    const settle = (allowShrink = false) => { setAppHeight(allowShrink); unscroll(); };
    // Tracked, self-clearing timeouts: these fire on every blur and rotation for
    // the life of the app, so they must not pile up in the pending set.
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
    setAppHeight();
    [100, 300, 600].forEach(ms => later(() => setAppHeight(), ms));
    const onResize = () => settle(false);
    // Rotation overrides the shrink guard: the field usually keeps focus across
    // it, and the delays let the new viewport settle first.
    const onOrient = () => { [200, 500].forEach(ms => later(() => settle(true), ms)); };
    // Keyboard going away. Deliberately NOT allowShrink — moving between two
    // fields also fires focusout with the keyboard still up, and there the guard
    // (which only blocks while something is focused) is exactly what we want.
    const onFocusOut = () => { [50, 300, 700].forEach(ms => later(() => settle(false), ms)); };
    const onVis = () => { if (document.visibilityState === "visible") later(() => settle(false), 100); };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrient);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrient);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const [view, setView] = useState("leaderboard");
  const [round, setRound] = useState(1);
  // ── The director's crown ──
  // Which group the Scoring tab is pointed at, reported up by OnCourseScoring,
  // and the pick that points it somewhere else. Both live up here because the
  // crown that reads them is app CHROME: it rides in the header, above every
  // tab, and the header knows nothing about a round being scored. The pick
  // carries a sequence number so the screen below can apply it exactly once —
  // see the effect there.
  const [scoringGroup, setScoringGroup] = useState(null);
  const [directorPick, setDirectorPick] = useState(null);
  const pickSeq = useRef(0);
  // Is this phone actually reaching the server. Null — and so nothing on
  // screen — whenever the answer is yes, which is nearly always.
  const syncStatus = useSyncStatus(writes);
  const [notif, setNotif] = useState(null);
  // Kept next to the state it drives, and above every caller: several hook
  // dependency arrays name `notify`, and those are evaluated during render.
  const notify = useCallback(m => { setNotif(m); setTimeout(() => setNotif(null), 2500); }, []);

  // Set favicon. The APP MARK, matching index.html, the header and the
  // pull-to-refresh spinner — the trophy is the award, not the identity.
  // index.html already ships the same href; this runs anyway because a
  // previously-cached tab can be holding the old one.
  useEffect(() => {
    const link = document.querySelector("link[rel*='icon']") || document.createElement("link");
    link.type = "image/png"; link.rel = "shortcut icon"; link.href = WBC_FAVICON;
    document.head.appendChild(link);
    const apple = document.querySelector("link[rel='apple-touch-icon']") || document.createElement("link");
    apple.rel = "apple-touch-icon"; apple.href = WBC_FAVICON;
    document.head.appendChild(apple);
  }, []);

  // ── Viewport: no AUTO-zoom, but pinch stays ──
  //
  // This used to carry `maximum-scale=1, user-scalable=no`, which does two
  // very different things under one setting. The problem it was aimed at is
  // real: iOS zooms the whole page when a text input smaller than 16px takes
  // focus, and then does not zoom back, which on the scoring screen leaves a
  // scorer looking at a magnified corner of their own card.
  //
  // But the fix for that is the 16px rule below — that is what removes the
  // trigger. Blocking `user-scalable` on top of it takes away PINCH, which is
  // a different thing entirely and the one accessibility affordance this app
  // can least afford to lose: it is read outdoors, in sun, at arm's length, by
  // people who are mostly over forty. Somebody who wants a closer look at a
  // scorecard should be able to have one.
  //
  // iOS Safari has ignored user-scalable=no since iOS 10 anyway, so on the
  // platform this was written for it was never doing the job — it was only
  // taking pinch away from Android and desktop.
  //
  // NO viewport-fit=cover, and it must MATCH index.html exactly — see the note
  // there. Cover makes iOS report a real safe-area-inset-bottom; the nav bar
  // pads itself by --sab and lifts off the bottom of the screen. This string
  // and that one are one policy in two places, and they have to agree.
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1';

    // The actual fix for focus-zoom: a font size iOS will not zoom to reach.
    // `touch-action: manipulation` still suppresses the double-tap-to-zoom
    // delay, which is about tap latency on score buttons rather than about
    // whether zooming is allowed at all.
    const style = document.createElement('style');
    style.textContent = `
      body { touch-action: manipulation; -ms-touch-action: manipulation; }
      * { -webkit-text-size-adjust: 100%; }
      input:focus, select:focus, textarea:focus { font-size: 16px !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const [tPlayers, setTPlayers] = useState([]);
  const [tRounds, setTRounds] = useState([]);
  const [courseList, setCourseList] = useState([]);
  // The photo library's index for the active edition. See src/lib/media.js —
  // these documents point at the photos, they do not contain them.
  const [media, setMedia] = useState([]);
  // wbc_config/photos — the budget circuit breaker's flag. Null until read.
  const [photoConfig, setPhotoConfig] = useState(null);
  // ── The career registry, as state ──
  // DEMO_PLAYERS holds the same rows, but it is a module-level variable that
  // nothing re-renders on — which is fine for names read during a render and
  // useless for anything a screen has to react to. The Players tab reads
  // `index_override` off here and writes it back, so it needs the real thing.
  const [registry, setRegistry] = useState([]);
  // The active edition's index row. Read for one field — `locked` — see the
  // subscription and lib/editionLock. Null until it lands, and null is
  // UNLOCKED: a year whose row cannot be read is one the rules will let a
  // member write to, so a banner claiming otherwise would be the lie.
  const [activeEdition, setActiveEdition] = useState(null);
  // Which edition IS the tournament, as opposed to the one this device has
  // open — the destination EditionBanner offers. Read from the picker's cached
  // index rather than a subscription: it is one constant checked against a
  // list that is already on the device, and a phone that has never opened
  // Tournaments has no list to check, which liveEdition treats as "trust the
  // constant" rather than "there is nowhere to go". See lib/editionHome.
  const liveTournamentId = useMemo(() => liveEdition(cachedEditions() || [], getHomeEditionId()), []);
  // The banner takes the place of the page behind the trophy's dome — see the
  // note on editionBannerShowing.
  const bannerUp = editionBannerShowing(getActiveTournamentId(), liveTournamentId);
  const [holeData, setHoleData] = useState({});
  const [ctpData, setCtpData] = useState({});
  // ── The market's books, and which of them this phone may hold ──
  // Sealed on the SERVER now (see firestore.rules), so there is no single
  // subscription that returns "the bets" any more — what arrives depends on
  // who is holding the phone. See lib/marketSeal.
  //
  //   ownBets        this player's book. Every phone gets this.
  //   allBets        every book. Directors only; null on a player's phone.
  //   publishedBets  the reveal, posted by a director once the event is over.
  //                  Null until then; world-readable when it exists.
  const [ownBets, setOwnBets] = useState([]);
  const [allBets, setAllBets] = useState(null);
  const [publishedBets, setPublishedBets] = useState(null);
  // The three side games' money, from tournament_state.side_games. Each `in`
  // is an ARRAY of player ids, or NULL when no director has ever touched it —
  // and null means everybody, which is what every tournament played before
  // this existed was. An empty array is a different answer (nobody), so the
  // two must not be collapsed. See components/BuyIns.
  const [sideGames, setSideGames] = useState({
    skins: { amount: 0, in: null, pot: 0, paid: [] },
    ctp: { amount: 0, in: null, paid: [] },
    lownet: { amount: 0, in: null, paid: [] },
    market: { amount: 0, in: null, paid: [] },
    rebuy: { amount: 0, in: null, paid: [] },
  });
  const [pairingsData, setPairingsData] = useState({});
  const [teeData, setTeeData] = useState({});
  // Recorded course handicaps, for imported editions only — empty for the
  // running tournament. Loaded from the same rows as teeData because it rides
  // on them; see rowsToCourseHandicaps.
  const [courseHandicaps, setCourseHandicaps] = useState({});
  const [teesSaved, setTeesSaved] = useState({});
  const [teesModified, setTeesModified] = useState({});
  const [teeTimesData, setTeeTimesData] = useState({});
  const [finalizedRounds, setFinalizedRounds] = useState({});
  const [roundDates, setRoundDates] = useState({});   // { round: "YYYY-MM-DD" } — scheduled play date
  const [scoringOpen, setScoringOpen] = useState({}); // { round: true } — director force-open override
  const [pairingStrategy, setPairingStrategy] = useState({}); // { round: { mode, leadersLast } } — per-round auto-pairing method
  // Two-phase scorecard signing/attestation state, keyed by groupKey.
  // { [groupKey]: { signedBy, signedByName, attestedBy: [pids], signedAt } }
  const [scorecardSigs, setScorecardSigs] = useState({});
  // Just-signed / just-attested flash guard. When we optimistically write a
  // sig locally, we also stash it here with an expiry. The subscription
  // callback overlays these onto the docs-derived map, so a stale Firestore
  // snapshot arriving between our write and its echo can't clear the entry
  // and cause the UI to flash back to "unsigned" for a frame. Cleared
  // automatically once the doc round-trip confirms the same state.
  const pendingSigsRef = useRef(new Map()); // groupKey -> { sig, expiresAt }
  const mergePendingSigs = (fromDocs) => {
    const m = { ...fromDocs };
    const now = Date.now();
    pendingSigsRef.current.forEach((entry, k) => {
      if (entry.expiresAt < now) { pendingSigsRef.current.delete(k); return; }
      const echoed = m[k];
      if (!echoed) { m[k] = entry.sig; return; }
      // Sig doc present. Merge attest arrays (union), keep other fields
      // from the echoed doc since it's the authoritative signer state.
      const optimisticAttest = entry.sig.attestedBy || [];
      const echoedAttest = echoed.attestedBy || [];
      const hasAll = optimisticAttest.every(pid => echoedAttest.includes(pid));
      if (hasAll) {
        // Fully echoed — drop the pending entry.
        pendingSigsRef.current.delete(k);
      } else {
        m[k] = { ...echoed, attestedBy: [...new Set([...echoedAttest, ...optimisticAttest])] };
      }
    });
    return m;
  };
  // Auto-advance round when finalization changes. The key is extracted rather
  // than inlined in the dependency array so it is a plain value React can
  // compare — a call expression in there is re-evaluated but never memoised.
  const finalizedRoundsKey = JSON.stringify(finalizedRounds);
  useEffect(() => {
    setRound(r => {
      if (!finalizedRounds[r]) return r;
      for (let i = 1; i <= NUM_ROUNDS; i++) { if (!finalizedRounds[i]) return i; }
      return NUM_ROUNDS;
    });
    // Deep-compared on purpose: `finalizedRounds` is rebuilt as a new object
    // on every snapshot, so depending on it directly would re-run this
    // constantly. The stringified key IS the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalizedRoundsKey]);
  const [adminSettingsOpen, setAdminSettingsOpen] = useState(false);
  const [adminSettingsTab, setAdminSettingsTab] = useState("players");
  // Which round the deep link is about, when it is about one (scoring's "no
  // course set for Round 3" card). Null means "wherever admin was".
  const [adminSettingsRound, setAdminSettingsRound] = useState(null);
  // Editable event setup — { name, location, rounds }. Null until a director
  // saves one, at which point it overrides the TOURNAMENT constant everywhere
  // the event is named. Lives on the existing tournament_state doc rather than
  // in a collection of its own: it is one more piece of the same singleton,
  // and a new collection would need its own firestore.rules entry.
  const [tournamentMeta, setTournamentMeta] = useState(null);
  const tournamentName = tournamentMeta?.name || TOURNAMENT.name;
  const tournamentLocation = tournamentMeta?.location || "";

  // When the field tees off — round one's earliest tee time. The same instant
  // the market's opening bell rings, off the same derivation, so the header
  // and the Betting tab can never be counting to two different moments.
  // Null until the round has both a date and a tee sheet, which is what keeps
  // a countdown off a tournament nobody has scheduled yet.
  //
  // Up here beside the location because both render branches want it: the
  // guest leaderboard gets the same header, and a spectator waiting on the
  // first tee is the person most likely to be watching a countdown to it.
  const firstTeeAt = teeOffAt(roundDates[1], (teeTimesData[1] || []).map(teeTimeToMinutes));

  // Point the module-level NUM_ROUNDS at the saved count, DURING render rather
  // than from an effect. Everything below — and every child this render is
  // about to produce — reads that binding while rendering, so an effect would
  // paint one frame of a four-round leaderboard for a three-round event. The
  // assignment is idempotent and derived purely from state, which is what
  // makes it safe to do here.
  const numRounds = clampRounds(tournamentMeta?.rounds);
  // ── Is this year over, as far as the rules are concerned? ──
  // Every round signed off closes a tournament to members whether or not
  // anybody locked it (see editionFinished in firestore.rules), and the app
  // has to say so — a refused score with nothing on screen explaining it is
  // the failure the lock banner already exists for. Mirrors what the rules
  // count, not what the app counts; see editionClosedToMembers.
  const editionClosed = editionClosedToMembers({ finalizedRounds, roundCount: numRounds });
  if (NUM_ROUNDS !== numRounds) setRoundCount(numRounds);

  // Every group in every round — what the director's crown lists. Kept here
  // rather than inside the header's JSX so the same array decides whether the
  // crown appears at all: with one group there is nothing to switch to.
  const switchableGroupList = useMemo(
    () => switchableGroups(pairingsData, numRounds),
    [pairingsData, numRounds]
  );

  // The tab title follows the saved tournament name, so renaming the event in
  // the Event settings tab renames the browser tab too. Kept here rather than up
  // with the other one-shot document effects: the dependency array is evaluated
  // during render, so it has to sit below tournamentName's declaration or it
  // reads a const in its temporal dead zone and throws on first paint.
  useEffect(() => { document.title = tournamentName; }, [tournamentName]);

  // Shortening the event can strand the app on a round that no longer exists —
  // a director on Round 4 who switches to three would otherwise keep looking at
  // a scoring screen nothing else counts. Same reason this is here and not
  // beside the auto-advance effect further up: `numRounds` is declared above,
  // and a dep array is evaluated during render.
  useEffect(() => { setRound(r => Math.min(r, numRounds)); }, [numRounds]);
  const [storageLoaded, setStorageLoaded] = useState(false);

  // ── Pull-to-refresh ──
  // Two jobs, and the first is the reason it exists at all: an installed PWA
  // has no address bar, so a player running a stale bundle has no way to pick
  // up a new deploy. hasNewBundle diffs the hashed asset URLs and reloads.
  //
  // The second is the collections that are NOT live. Most of this app arrives
  // over onSnapshot — scores, pairings, tee assignments, skins, signatures,
  // roster, tournament state — so it needs no refreshing. But `players`,
  // `tournament_rounds`, `courses` and `tee_boxes` are read once at mount:
  // they change only when a director edits them, which is rare, and paying for
  // four more live listeners on every device would be a poor trade. The cost
  // is that a course assigned mid-trip doesn't reach anyone else's phone until
  // they relaunch. This is the pull that fixes that.
  // ── The static half, in two hops instead of four ──
  // ONE loader, used by the mount load, by the cache pass in front of it and
  // by the pull. It used to be written twice and the copies had drifted —
  // see the header of lib/staticData, which now owns the shaping.
  //
  // `read` is what does the fetching: db.get asks the server, db.getCached
  // asks this phone's own disk. Everything else is identical, which is the
  // point — a cache pass that shaped its rows differently would repaint the
  // whole board the moment the server answered.
  //
  // The two `Promise.all`s are the other half. The registry does not depend
  // on the rounds, and the tee boxes do not depend on the courses — both were
  // awaited one after the other, so a cold start spent four sequential round
  // trips fetching things that could have travelled together. Now it is two:
  // players+rounds, then courses+tees.
  const loadStaticData = useCallback(async (read) => {
    const [playerRows, trRows] = await Promise.all([
      read("players"),
      read("tournament_rounds", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]),
    ]);

    // Scoped on the way in, so every consumer of the registry — the roster
    // join, the Players tab, the returning-player picker, the claim list and
    // the bootstrap below — inherits it from one place. A player minted inside
    // the demo carries that edition and is invisible everywhere else; see
    // lib/playerScope. It is also what this function RETURNS, so the roster
    // bootstrap cannot seed a real tournament with a sandbox's test names.
    const scoped = scopedRegistry(registryRows(playerRows), TOURNAMENT_ID);

    if (playerRows?.length) {
      DEMO_PLAYERS = scoped;
      setRegistry(DEMO_PLAYERS);
      // DEMO_PLAYERS is module-level, so replacing it does not by itself
      // re-render anything that reads it. Nudge the state the roster derives
      // from so activePlayers/allPlayers recompute against the new names.
      setTPlayers(prev => [...prev]);
    }

    const rounds = roundRows(trRows);
    if (!rounds.length) return scoped;
    setTRounds(rounds);

    const courseIds = courseIdsOf(rounds);
    if (!courseIds.length) return scoped;
    const [cRows, tbRows] = await Promise.all([
      read("courses", [{ field: "id", op: "in", value: courseIds }]),
      read("tee_boxes", [{ field: "course_id", op: "in", value: courseIds }]),
    ]);
    if (cRows?.length) setCourseList(sortCoursesByRound(stitchCourses(cRows, tbRows), rounds));
    return scoped;
  }, []);

  const refreshStaticData = useCallback(() => loadStaticData(db.get), [loadStaticData]);

  const { pullY, refreshing: pullRefreshing, PULL_THRESHOLD } = usePullToRefresh({
    hasNewBundle,
    onRefresh: refreshStaticData,
  });

  // ── Load all data from Firestore on mount ──
  //
  // Two halves, and the split is the whole point of this block.
  //
  // READ ONCE: `players`, `tournament_rounds`, `courses`, `tee_boxes`. A
  // director edits these rarely, so four more live listeners on every phone
  // would be a poor trade; pull-to-refresh is what picks up a mid-trip change
  // (see refreshStaticData).
  //
  // SUBSCRIBED: everything else. A listener delivers a FULL initial snapshot
  // the moment it attaches, so it is already the load — which is why this
  // block no longer also db.get()s hole_scores, pairings, tee_assignments,
  // skins, tournament_state and tournament_players. Fetching them twice cost
  // three things and bought none:
  //
  //   • double the billed reads on every cold start, on the collection set
  //     that dominates them — hole_scores alone is 12 × 4 × 18 documents;
  //   • two parsers per collection, one incremental and one wholesale, free
  //     to drift apart;
  //   • a race. The read was never awaited before the listeners attached, so
  //     whichever landed second replaced the other's state wholesale, and the
  //     loser could be the newer answer.
  //
  // It also worked against the persistent cache firebase.js goes to some
  // trouble to enable: getDocs asks the SERVER, while a listener resumes from
  // its stored token and is sent only what changed since this phone last had
  // it. On the collections that matter the listener is strictly cheaper.
  useEffect(() => {
    // The static half, as a promise. The roster bootstrap below needs the
    // registry and the two arrive on different clocks — this one over
    // one-shot reads, the roster over its subscription — so the seeding
    // awaits it rather than racing it.
    //
    // TWO PASSES over the same four collections, and the first one costs no
    // network at all: it reads what this phone already has on disk (see
    // db.getCached), so a relaunch has its roster, its rounds and every
    // course rating in hand on the frame it mounts instead of after two
    // chained round trips. The server pass follows and replaces it.
    //
    // Awaited rather than raced, so the stored copy can never land on top of
    // the fresh one. It is an IndexedDB read of four small collections — a
    // few milliseconds against the hundreds the server pass is about to
    // spend — and on a cold install it finds nothing and returns immediately.
    //
    // The roster bootstrap below waits on the SERVER pass specifically: it
    // WRITES a roster off what it is handed, and seeding one off a stored copy
    // is the kind of thing that must not happen from a device's own memory.
    const registryReady = loadStaticData(db.getCached)
      .catch(() => null)
      .then(() => loadStaticData(db.get));
    registryReady.catch(e => console.error("Registry load failed:", e));

    (async () => {
      try {
        // Existing uid→player_id claims (wbc_users). Doc id is the uid.
        // DEFERRED (non-blocking): this feeds only the claim flow, which is
        // inert while AUTH_PROVIDERS_ENABLED is false. It used to sit here as an
        // awaited call BETWEEN players and the tournament data below, delaying
        // rounds/courses/scores by a full round-trip on every cold start (and
        // longer if wbc_users reads are denied by rules). On a reopen — where
        // the leaderboard mounts at t=0 with no login screen to buy load time —
        // that widened the empty-data window for no benefit. Fire-and-forget so
        // it can never gate the render-critical tournament payload.
        db.get(USERS_COLLECTION).then(userRows => {
          if (userRows?.length) {
            setClaims(Object.fromEntries(userRows.map(r => [r.uid || r.id, r.player_id]).filter(([u, pid]) => u && pid)));
          }
        }).catch(e => console.warn("[claims] wbc_users load skipped:", e?.message || e));
      } catch(e) { console.error("Load failed:", e); }
    })();


    // ── Real-time subscriptions via Firestore onSnapshot ──
    const unsubs = [];

    // Scores, applied as CHANGES rather than rebuilt. See lib/holeScores for
    // why the fold lives there — the short version is that a deletion is as
    // much a fact about a card as a score is, and this handler used to drop
    // them on the floor: a discarded round vanished on the director's phone
    // and stayed on everybody else's until they relaunched.
    unsubs.push(db.subscribe("hole_scores", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs, changes) => {
      const normalized = (changes || []).map(c => ({ type: c.type, row: c.doc.data() }));
      setHoleData(prev => applyScoreChanges(prev, normalized));
    }));

    // The active edition's own index row, for one field on it: `locked`. A
    // frozen year refuses every member write in firestore.rules, and without
    // this the refusal has no voice — scores would stop saving on a tee box
    // with nothing on screen saying why, which is the exact failure this app
    // has a banner for everywhere else it can happen.
    //
    // Subscribed rather than read once because the freeze can be thrown from
    // another phone mid-round: a director locking the year is precisely when
    // everybody else needs to be told, and a value read at launch would say
    // "open" until the app was relaunched.
    unsubs.push(db.subscribe("wbc_editions", [{ field: "id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      setActiveEdition(docs[0] || null);
    }));

    unsubs.push(db.subscribe("pairings", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      const sorted = docs.sort((a, b) => a.round_number - b.round_number || a.group_number - b.group_number || (a.player_id || "").localeCompare(b.player_id || ""));
      setPairingsData(rowsToPairings(sorted));
      // The SHEET wins, and the rows fill only what it has never known: a
      // director's tee sheet lives on tournament_state now, and a pairing row
      // is a copy of it made when the draw was written. Reading them the other
      // way round let a row written before the sheet — or one belonging to a
      // group that has since emptied — put a blank back over a real time.
      setTeeTimesData(prev => mergeTeeTimes(rowsToTeeTimes(sorted), prev));
    }));

    unsubs.push(db.subscribe("tee_assignments", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      setTeeData(rowsToTeeData(docs));
      setCourseHandicaps(rowsToCourseHandicaps(docs));
    }));

    // CTP is tournament-wide, so a tag from Group 1's phone has to reach Group 4's phone
    // before they hit that par 3 — otherwise the leader bar shows nothing to beat and
    // the last group in wins by default. Live subscription, same as scores.
    // CTP only. The market's bets used to ride along on this same
    // subscription, and they cannot any more: firestore.rules refuses a read
    // of somebody else's book, and Firestore fails the WHOLE query if one
    // document in it is refused. Asking for the tags by name is what keeps
    // this query answerable on every phone. The books arrive on their own
    // subscription below, narrowed to what the holder may see.
    unsubs.push(db.subscribe("skins", [
      { field: "tournament_id", op: "==", value: TOURNAMENT_ID },
      { field: "skin_type", op: "==", value: "ctp" },
    ], (docs) => {
      setCtpData(rowsToCtp(docs));
    }));

    unsubs.push(db.subscribe("tournament_state", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      if (docs?.length) {
        if (docs[0].finalized_rounds) setFinalizedRounds(docs[0].finalized_rounds);
        if (docs[0].tees_saved) setTeesSaved(docs[0].tees_saved);
        if (docs[0].tees_modified) setTeesModified(docs[0].tees_modified);
        if (docs[0].round_dates) setRoundDates(docs[0].round_dates);
        if (docs[0].tee_times) setTeeTimesData(prev => mergeTeeTimes(prev, docs[0].tee_times));
        if (docs[0].scoring_open) setScoringOpen(docs[0].scoring_open);
        if (docs[0].pairing_strategy) setPairingStrategy(docs[0].pairing_strategy);
        if (docs[0].meta) setTournamentMeta(docs[0].meta);
        if (docs[0].side_games) setSideGames(mergeSideGames(docs[0].side_games));
      }
    }));

    // Sign/attest lives in its own collection (one doc per group) so the
    // onScorecardSigned Cloud Function gets a clean per-group CREATE trigger.
    // Rebuild the in-memory map the UI reads from these docs, then overlay
    // any optimistic entries that haven't been echoed back yet (flash guard).
    unsubs.push(db.subscribe("wbc_scorecard_sigs", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      const fromDocs = {};
      docs.forEach(d => {
        const k = d.groupKey || d.id;
        fromDocs[k] = { signedBy: d.signedBy, signedByName: d.signedByName, attestedBy: d.attestedBy || [], present: d.present || [] };
      });
      setScorecardSigs(mergePendingSigs(fromDocs));
    }));

    // ── The roster, and the one-time bootstrap under it ──
    //
    // This listener's FIRST snapshot is also the answer to "does this edition
    // have a roster yet", which is what the seeding below keys on — so it no
    // longer needs a one-shot read of its own to ask.
    //
    // `rosterSeeded` keeps the seeding a one-time act. Without it, a director
    // who legitimately empties the roster would have it re-filled from the
    // registry on the very next snapshot.
    //
    // It is also what `storageLoaded` means now: `lb` is built from the
    // roster, so "the roster has answered" is exactly the question the
    // leaderboard's empty state has to have answered before it can say "no
    // scores yet" rather than flashing that at somebody mid-load.
    let rosterSeeded = false;
    unsubs.push(db.subscribe("tournament_players", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs, _changes, meta) => {
      setTPlayers(docs.map(r => ({ id: r.id, tournament_id: r.tournament_id, player_id: r.player_id, handicap_index: parseFloat(r.handicap_index) || 0, status: r.status || "active" })));
      setStorageLoaded(true);
      // ONLY THE SERVER MAY SAY A ROSTER IS EMPTY. A cached snapshot arrives
      // within a millisecond of the listener attaching and is empty whenever
      // this phone has not synced this query before — a fresh install, a
      // cleared browser, a device that has never opened this edition. Acting
      // on that would rewrite the whole roster from the registry: every
      // handicap the director typed replaced by a computed one, and everybody
      // moved to inactive quietly restored.
      if (meta?.fromCache) return;
      if (docs.length || rosterSeeded || !isDefaultEdition()) return;
      rosterSeeded = true;
      // One-time bootstrap for the ORIGINAL edition only: lift the global
      // player registry into a roster the first time this edition loads
      // without one.
      //
      // Gated on isDefaultEdition() because a NEW edition legitimately has
      // no roster — that is what "start blank" means. Without the guard,
      // creating an empty 2027 and switching to it would silently import
      // every golfer who has ever played, at index 0, and the director
      // would have to work out which ones to delete.
      // Seeded from the WBC Index, not from zero. The index computed off a
      // golfer's own history is the source of truth for what they play
      // off; a roster that starts everybody at scratch makes the director
      // type fourteen numbers that the app already knows, and a missed one
      // is a player scoring gross by accident. Admin can still override
      // any of them — that is what the Index field there is for.
      registryReady.then(playerRows => {
        if (!playerRows?.length) return;
        const seeded = playerRows.map(r => {
          const hist = matchHistoryName(r);
          const seedIdx = hist ? indexFor(hist, { override: r.index_override ?? null }).index : null;
          return { id: docIds.tournamentPlayer(_e(), r.id), tournament_id: TOURNAMENT_ID, player_id: r.id, handicap_index: seedIdx ?? 0, status: "active" };
        });
        setTPlayers(seeded);
        // One commit, not fourteen: the listener above republishes on every
        // one of them, so a per-row loop paints the roster filling in a name
        // at a time. See db.upsertMany.
        return db.upsertMany("tournament_players", seeded);
      }).catch(e => console.error("Roster bootstrap failed:", e));
    }, () => setStorageLoaded(true)));

    // Whether photo uploads are switched on. One tiny document, subscribed
    // with the rest because every phone needs it and it never changes — see
    // onBudgetAlert in functions/index.js, which only writes it on a
    // transition precisely so this listener stays quiet.
    unsubs.push(db.subscribe("wbc_config", [], (docs) => {
      setPhotoConfig(docs.find(d => d.id === "photos") || null);
    }));

    return () => unsubs.forEach(u => u && u());
    // loadStaticData is a stable useCallback — named so the linter can see it,
    // not because this block should ever re-run.
  }, [loadStaticData]);

  // ── The photo index, subscribed only once somebody opens Photos ──
  // Deliberately NOT in the block above. Every other subscription there is
  // bounded by the shape of a tournament — twelve players, four rounds,
  // eighteen holes — but this one grows with however many photos get posted,
  // and Firestore bills a read per document each time a listener attaches.
  //
  // The app has no persistent cache, so every cold start re-reads everything
  // it subscribes to. Attaching this on load would mean a phone that never
  // opens the gallery still paying for the whole index on each launch, times
  // twelve phones, times however often a phone reloads over a tournament
  // weekend. Mounting it on first open instead makes the cost proportional to
  // people actually looking at photos.
  //
  // `photosOpened` latches: once opened, the subscription stays for the rest
  // of the session, so coming back to the gallery is instant and posting a
  // photo still shows up live on every phone that has it open.
  // ── The market's books, subscribed to what this phone may read ──
  //
  // Separate from the mount effect above because it depends on WHO is signed
  // in, and that resolves later — a subscription started at mount would ask
  // as nobody and be refused.
  //
  // A director asks for every book; everybody else asks for their own by name.
  // The narrowing is not decoration: rules refuse a read of somebody else's
  // book, and a query that matched one would fail entirely rather than
  // returning the rest.
  // The two facts this depends on, read out as plain values. Naming `user` in
  // the dependency list would re-subscribe on every unrelated change to it;
  // naming only its fields while reading the whole object is the shape that
  // emptied a tournament earlier — so the effect reads exactly what it lists.
  const meId = user && !user.isGuest ? (user.id || null) : null;
  const meIsDirector = !!user?.isDirector;
  // ── Who gets Admin ────────────────────────────────────────────────
  // A director anywhere, and any member inside the SANDBOX — the beta testers
  // and store reviewers, who have no crown and cannot be given one before
  // they have signed in. The app mirrors firestore.rules here rather than
  // guessing at it (canAdminEdition exists in both), so the tab is never
  // offered to somebody whose every save would come back refused.
  //
  // `demoOnly` is the same person minus the crown, and it is what the Admin
  // screen hides its non-edition-scoped halves on: the career registry and
  // the courses are global in WBC, and no sandbox grant reaches them.
  const adminArgs = {
    isDirector: meIsDirector,
    isMember: !isGuest(user) && !!fbUser,
    tid: getActiveTournamentId(),
  };
  const canAdminHere = canAdminEdition(adminArgs);
  const sandboxAdmin = demoOnlyAdmin(adminArgs);
  useEffect(() => {
    if (!meId) { setOwnBets([]); setAllBets(null); return; }
    const base = [
      { field: "tournament_id", op: "==", value: TOURNAMENT_ID },
      { field: "skin_type", op: "==", value: "market" },
    ];
    if (meIsDirector) {
      return db.subscribe("skins", base, (docs) => {
        const bets = rowsToMarket(docs);
        setAllBets(bets);
        setOwnBets(bets.filter(b => b.pid === meId));
      });
    }
    setAllBets(null);
    return db.subscribe("skins", [...base, { field: "player_id", op: "==", value: meId }], (docs) => {
      setOwnBets(rowsToMarket(docs));
    });
  }, [meId, meIsDirector]);

  // ── The reveal ──
  // One world-readable document per edition, holding every book once the
  // tournament is over. Read by everybody, written by a director — see the
  // note in firestore.rules for why a director's device rather than a Cloud
  // Function.
  useEffect(() => {
    if (!storageLoaded) return;
    return db.subscribe("wbc_market_result", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      const row = docs && docs[0];
      setPublishedBets(Array.isArray(row?.bets) ? row.bets.map(b => ({
        pid: b.pid, opening: normalizeLots(b.opening), mid: normalizeLots(b.mid),
      })) : null);
    });
  }, [storageLoaded]);

  const [photosOpened, setPhotosOpened] = useState(false);
  useEffect(() => { if (view === "photos") setPhotosOpened(true); }, [view]);

  // ── The scoring screen mounts on its first open, and never unmounts ──
  // It is rendered under `display: none` rather than unmounted, so that a
  // scorer who steps over to the leaderboard mid-hole comes back to the card
  // exactly as they left it. That is worth keeping, and it is also why `lazy`
  // alone would have bought nothing here: an always-mounted component fetches
  // its chunk at mount, which is the moment this was trying to get out of.
  //
  // So the same latch the gallery uses. Before the first open there is no card
  // state to preserve — nobody has typed anything — and after it the mount is
  // permanent, so the behaviour it exists for is untouched.
  //
  // The one thing this changes: `scoringGroup` is reported UP by the screen,
  // and is null until it has mounted. Its only reader is the header's group
  // switcher, which renders behind `view === "scoring"` — so it cannot be read
  // before the mount that fills it.
  const [scoringOpened, setScoringOpened] = useState(false);
  useEffect(() => { if (view === "scoring") setScoringOpened(true); }, [view]);

  // ── Fetching the tabs before anybody taps them ──
  // The three tabs above are `lazy`, which keeps them out of the bundle a
  // phone downloads to draw a leaderboard. Left at that, the saving would be
  // paid for at the worst possible moment: the Scoring tab is opened standing
  // on a tee box, and that is exactly where the signal to fetch a chunk may
  // have gone.
  //
  // So they are fetched during the idle stretch after first paint, while the
  // app is doing nothing and the phone is still wherever it opened the app.
  // By the time anybody taps, the chunk is in the browser's cache and `lazy`
  // resolves without a network at all.
  //
  // Deliberately not gated on being signed in: somebody on the login screen
  // has a network by definition — they are authenticating over it — which
  // makes it the best moment there is to be doing this.
  useEffect(() => warmChunks([
    () => import("./components/OnCourseScoring"),
    () => import("./components/PlayersView"),
    () => import("./components/GroupsView"),
  ]), []);

  // ── And keeping all of it for next time ──
  // The chunks above are fetched once and then held by the service worker, so
  // the launch after this one reads the whole app off disk. Firestore already
  // does this for the DATA (see the persistent cache in firebase.js); this is
  // the same bargain for the code, and it is what makes the app open at all
  // on a course with no signal.
  //
  // On idle, and after the warm, for the same reason the warm is on idle: a
  // worker installing is a worker fetching its own dependencies, and none of
  // that should be happening while the leaderboard is still arriving. It does
  // nothing on the dev server or in the native builds — see lib/swRegister.
  useEffect(() => whenIdle(() => {
    registerAppServiceWorker({ isProd: import.meta.env.PROD, isNative: isNativePlatform() });
  }), []);
  useEffect(() => {
    if (!photosOpened) return;
    return db.subscribe("wbc_media", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }], (docs) => {
      setMedia(docs);
    });
  }, [photosOpened]);

  // Save tournament state to Firestore
  // Written on its own rather than through saveTournamentState: that helper
  // takes seven positional arguments and rewrites all of them, so threading an
  // eighth through every existing call site to change a name would be a much
  // bigger edit than the feature. db.upsert merges, so this touches only `meta`.
  const saveTournamentMeta = async (meta) => {
    setTournamentMeta(meta);
    await db.upsert("tournament_state", {
      id: `ts_${TOURNAMENT_ID}`,
      tournament_id: TOURNAMENT_ID,
      meta,
      updated_at: new Date().toISOString(),
    });
  };

  // ── The photo library's two writes ──
  // Both go through lib/mediaUpload.js, which owns the canvas work and the
  // bucket; this pair owns the Firestore side, because `db` lives here and a
  // second write path into wbc_media is how two of them drift apart.
  //
  // The order matters in both directions and is the opposite each time:
  //
  //   uploading  bytes first, then the index document. A document pointing at
  //              a photo that failed to upload is a broken tile in the grid;
  //              bytes with no document are invisible and cost 250KB.
  //   deleting   document first, then the bytes. The document is what makes
  //              the photo exist in the app, so removing it is what the person
  //              tapping Remove actually asked for — and if the byte delete
  //              then fails, the result is a hidden orphan rather than a photo
  //              that is still on screen after being deleted.
  const onUploadPhoto = async (file, onProgress) => {
    const uid = fbUser?.uid;
    if (!uid) throw new Error("You need to be signed in to add photos.");
    const { uploadPhoto } = await import("./lib/mediaUpload");
    const row = await uploadPhoto({
      file,
      onProgress,
      slug: _e(),
      uid,
      uploaderName: user?.name || "",
      // Tagged with the round in play, but only when posting into the LIVE
      // edition — a photo added while browsing 2014 has no business claiming
      // to be from round 2 of it. Inside the live tournament the guess is
      // right far more often than not and saves a picker on a screen somebody
      // is using one-handed on a tee box. A dinner photo landing under the
      // round it was taken during is a wrong label, not a lost photo.
      round: isDefaultEdition() ? round : null,
    });
    await db.upsert("wbc_media", row);
  };

  const onDeletePhoto = async (item) => {
    if (!item?.id) return;
    await db.deleteDoc("wbc_media", item.id);
    const { deletePhotoBytes } = await import("./lib/mediaUpload");
    await deletePhotoBytes(item);
  };

  const saveTournamentState = async (finalized, savedTees, modTees, rDates, sOpen, pStrat, tTimes) => {
    const tsSaved = savedTees !== undefined ? savedTees : teesSaved;
    const tsMod = modTees !== undefined ? modTees : teesModified;
    const rd = rDates !== undefined ? rDates : roundDates;
    const so = sOpen !== undefined ? sOpen : scoringOpen;
    const ps = pStrat !== undefined ? pStrat : pairingStrategy;
    const tt = tTimes !== undefined ? tTimes : teeTimesData;
    await db.upsert("tournament_state", {
      id: `ts_${TOURNAMENT_ID}`,
      tournament_id: TOURNAMENT_ID,
      finalized_rounds: finalized,
      tees_saved: tsSaved,
      tees_modified: tsMod,
      round_dates: rd,
      scoring_open: so,
      pairing_strategy: ps,
      // The tee sheet. It used to live ONLY on the pairing rows, which meant a
      // group with nobody in it had nowhere to keep its time — see the writer
      // in AdminView. It is a per-round admin setting like round_dates, and it
      // belongs beside them, independent of who is drawn into which group.
      tee_times: tt,
      updated_at: new Date().toISOString(),
    });
  };


  const startFresh = async () => {
    // Clear scores, rounds, pairings, tees — keep tournament_players (roster + HIs)
    try {
      await db.delete("hole_scores", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("pairings", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("tee_assignments", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("tournament_rounds", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("tournament_state", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("skins", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("wbc_scorecard_sigs", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      await db.delete("wbc_rounds_state", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
      // The reveal goes with the bets it was published from.
      await db.delete("wbc_market_result", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }]);
    } catch(e) { console.error("Start fresh clear failed:", e); }
    // Keep tPlayers (roster + HIs) intact — clear everything else
    setTRounds([]);
    setCourseList([]);
    setHoleData({});
    setCtpData({});
    // The side games go with the scorecards: the `skins` delete above took the
    // CTP tags AND every market portfolio, and the tournament_state delete took
    // the buy-in lists. Resetting them here keeps the screen agreeing with what
    // is left in Firestore instead of showing a pot nobody has bought into.
    setOwnBets([]); setAllBets(null); setPublishedBets(null);
    setSideGames(mergeSideGames(null));
    setPairingsData({});
    setTeeData({});
    setTeeTimesData({});
    setTeesSaved({});
    setTeesModified({});
    setFinalizedRounds({});
    setScorecardSigs({});
    setRoundDates({});
    setScoringOpen({});
    setPairingStrategy({});
    setRound(1);
    await saveTournamentState({}, {}, {}, {}, {}, {});
    // The event setup is not scorecard data. Deleting tournament_state above
    // takes `meta` down with it, so the name, location and round count have to
    // be written back onto the document saveTournamentState just recreated —
    // otherwise clearing the scores quietly renames the event and puts a
    // three-round year back to four.
    if (tournamentMeta) await saveTournamentMeta(tournamentMeta);
    notify("Scorecards cleared — player roster preserved");
  };

  // Account deletion.
  const handleDeleteAccount = useCallback(async () => {
    setDeleteErr("");
    setDeleteStage("working");
    try {
      await deleteAccount(user?.id);
      // Free the profile locally so it's immediately re-claimable. deleteAccount
      // already removed the wbc_users doc server-side, but claimedPlayerIds is
      // derived from the in-memory `claims` map (loaded once on mount), so we
      // must drop any uid→player_id entry pointing at the deleted player here —
      // otherwise the profile still looks claimed and won't show on the claim
      // roster until a full app reload.
      const freedPlayerId = user?.id;
      if (freedPlayerId) {
        setClaims(prev => Object.fromEntries(
          Object.entries(prev).filter(([, pid]) => pid !== freedPlayerId)
        ));
      }
      // deleteAccount clears the native provider session; also clear the web
      // session + local state so we land cleanly on the login screen.
      try { await doSignOut(); } catch { /* non-fatal */ }
      try { localStorage.removeItem("wbc_user"); } catch { /* non-fatal */ }
      setAccountOpen(false);
      setDeleteStage(null);
      setUser(null);
      notify("Your account has been deleted");
    } catch (e) {
      setDeleteStage("confirm");
      setDeleteErr(e?.message || "Couldn't delete your account. Please try again.");
    }
  }, [user, notify]);

  // ── Push notifications (client) ──
  const [notifPerm, setNotifPerm] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "denied"));

  // Foreground push → in-app banner (SW handles background).
  useEffect(() => {
    if (!user || user.isGuest) return;
    let unsub;
    (async () => {
      try {
        // Fetched here rather than at the top of the file: this listener is a
        // nicety that runs after a player is signed in, and the leaderboard
        // should not wait on the push SDK to download before it can paint.
        const { getMessaging, onMessage, isSupported } = await import("firebase/messaging");
        const supported = await isSupported().catch(() => false);
        if (!supported) return;
        const messaging = getMessaging(_app);
        unsub = onMessage(messaging, (payload) => {
          const d = payload.data || {};
          const msg = d.title ? (d.body ? `${d.title} — ${d.body}` : d.title) : d.body;
          if (msg) notify(msg);
        });
      } catch {}
    })();
    return () => { if (unsub) unsub(); };
    // Keyed on the logged-in user: this subscribes once per session, and notify
    // is a stable useCallback that never needs to re-establish it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── The login stamp ──
  // Written so Admin can answer "has he even opened it yet?" — see
  // lib/playerActivity, which reads it back. `wbc_users/{uid}` is the only
  // document a player may write about themselves (firestore.rules gates the
  // write on the uid matching the document id), so the stamp goes there
  // rather than onto the membership, which the rules make read-only to
  // everybody but a director setting `is_director`.
  //
  // ONCE PER SESSION, latched on a ref rather than left to the dependency
  // list: this effect re-runs whenever the user object is replaced, which
  // happens on an edition switch and on the director flag resolving, and a
  // "last seen" that rewrites itself several times a launch is a write per
  // render in everything but name.
  //
  // Fire and forget. A player whose stamp does not land still gets to play;
  // the failure is a director reading a slightly stale time.
  const loginStamped = useRef(null);
  useEffect(() => {
    if (!user || user.isGuest || !fbUser?.uid || member !== true) return;
    // Only once the claims map agrees this account owns this player. `user`
    // is restored from localStorage on boot, a beat before the claims land,
    // and the two can disagree — a phone that was last signed in as somebody
    // else. This write MERGES onto the claim document, so stamping off the
    // stored copy would be a "last seen" filed against the wrong man.
    if (claims[fbUser.uid] !== user.id) return;
    const key = `${fbUser.uid}:${user.id}`;
    if (loginStamped.current === key) return;
    loginStamped.current = key;
    // Nothing but the time. player_id is already on the document — it is what
    // was just checked — and re-sending an identity field on a merge is how a
    // stale copy overwrites a good one.
    db.upsert(USERS_COLLECTION, { id: fbUser.uid, uid: fbUser.uid, lastLoginAt: Date.now() })
      .catch(e => console.warn("[login] stamp skipped:", e?.message || e));
  }, [user, fbUser, member, claims]);

  // ── Asking, once, on the first login ──
  // Push was built, shipped and switched on by almost nobody, because the
  // only way to find the toggle was to go looking for it in a sheet called
  // My Account. So a player who has never been asked gets asked — see
  // lib/notificationPrompt for every case where asking would be worse than
  // silence, and components/NotificationPrompt for why the browser's own
  // permission sheet has to come out of that modal's button rather than out
  // of this effect.
  const [pushPrompt, setPushPrompt] = useState(false);
  useEffect(() => {
    if (!user || user.isGuest) return;
    if (!shouldPromptForPush({
      playerId: user.id,
      guest: !!user.isGuest,
      native: isNativePlatform(),
      permission: getNotificationPermissionState(),
      subscribed: getCachedSubscriptionStatus(user.id),
      prompted: wasPrompted(user.id),
    })) return;
    // A beat, so the first thing a player sees on opening the app is the
    // tournament rather than a dialog about the tournament.
    const t = setTimeout(() => setPushPrompt(true), PUSH_PROMPT_DELAY_MS);
    return () => clearTimeout(t);
  }, [user]);

  // Both ways out mark them as asked. "Not now" that asks again tomorrow is
  // how a prompt becomes the thing people dismiss without reading.
  const closePushPrompt = useCallback(() => {
    if (user?.id) markPrompted(user.id);
    setPushPrompt(false);
  }, [user]);

  const enablePushFromPrompt = useCallback(async () => {
    if (!user?.id) return;
    const res = await registerForPush(user.id);
    markPrompted(user.id);
    setPushPrompt(false);
    setNotifPerm(getNotificationPermissionState());
    if (res.success) notify("Notifications on");
    else if (res.state === "denied") notify("Blocked — you can allow them in your device settings");
    else if (res.state !== "unsupported") notify(`Couldn't enable: ${res.error || res.state}`);
  }, [user, notify]);

  // Keep this device's token fresh + mapped to the logged-in player when
  // permission is already granted, so a re-login re-registers silently.
  //
  // GUARDED on the cached subscription status, which is the whole reason that
  // cache exists as a tri-state. Browser permission stays "granted" forever
  // once given — including for somebody who has since turned notifications OFF
  // in settings — so an unguarded re-register would silently resubscribe them
  // on their next login and the toggle would appear not to work. `false` means
  // they said no on this device; `null` means we have never asked here, which
  // is the case this effect is for.
  useEffect(() => {
    if (!user || user.isGuest) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (getCachedSubscriptionStatus(user.id) === false) return;
    registerForPush(user.id);
  }, [user]);

  // App badge = scorecards this player still owes an attestation on. This is
  // the source of truth that reconciles the SW's optimistic badge increments.
  useEffect(() => {
    if (!user || user.isGuest) return;
    let count = 0;
    Object.values(scorecardSigs || {}).forEach(s => {
      if ((s.present || []).includes(user.id) && s.signedBy !== user.id && !(s.attestedBy || []).includes(user.id)) count++;
    });
    try {
      if (navigator.setAppBadge) { count > 0 ? navigator.setAppBadge(count) : (navigator.clearAppBadge && navigator.clearAppBadge()); }
      navigator.serviceWorker?.controller?.postMessage({ type: "SET_BADGE", count });
    } catch {}
  }, [scorecardSigs, user]);

  // Deep-link: a notification tap lands on /#scoring or /#leaderboard.
  useEffect(() => {
    const applyHash = () => {
      const h = (window.location.hash || "").replace("#", "");
      const map = { scoring: "scoring", leaderboard: "leaderboard", board: "leaderboard", pairings: "groups", groups: "groups", betting: "skins", skins: "skins", admin: "admin", photos: "photos" };
      if (map[h]) setView(map[h]);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  // ── The roster, as the app sees it ──
  // Both cuts of it — everybody, and everybody still playing — from
  // lib/roster, which owns the join and, more importantly, owns the
  // dependency list that says when to redo it. See that module's header:
  // getting this wrong emptied a live tournament, and it is the kind of wrong
  // that only appears when the two halves land in the unlucky order.
  //
  // `registry` is the STATE, not the module-level DEMO_PLAYERS this used to
  // read. They are the same array — setRegistry is handed DEMO_PLAYERS itself
  // by all three places that replace it — so callers that mutate it in place
  // still see their edit. The difference is that React now knows when it
  // changed.
  const { allPlayers, activePlayers } = useRoster(tPlayers, registry);

  // ── Who is in the market without playing ──────────────────────────
  // The market is the one buy-in that needs no tee time: it is a bet on who
  // wins, and a man off this year's roster can place it as well as anybody in
  // the field. So `side_games.market.in` is allowed to name somebody with no
  // roster row — an inactive player, off the career registry — and this is
  // where those ids get their names back.
  //
  // Everything else about him is unchanged. He is on no leaderboard, in no
  // pairing, and in no other buy-in; his id is the one his career and his
  // sign-in have always been filed under, which is the whole reason he is
  // picked off the registry rather than typed in.
  //
  // It sits up here with the roster because the SIGN-IN needs it: claiming a
  // name is the only way he reaches his own book, and that decision is made
  // long before the Betting tab is ever mounted.
  const inactivePlayers = useMemo(
    () => returningPlayers({ registry, rosterIds: tPlayers.map(t => t.player_id) })
      .map(r => ({ id: r.id, name: r.name, note: returningLine(r) })),
    [registry, tPlayers],
  );
  const marketOnly = useMemo(
    () => marketOutsiders({ ids: sideGames?.market?.in, roster: allPlayers, pool: inactivePlayers }),
    [sideGames, allPlayers, inactivePlayers],
  );
  // The field plus them: who can hold a book and who the market bills. The
  // field ALONE stays `allPlayers` — a man who is not playing cannot be backed
  // and cannot win, so he is never a name on anybody's sheet of golfers.
  const marketPool = useMemo(() => [...allPlayers, ...marketOnly], [allPlayers, marketOnly]);


  // ── Publishing the reveal ──
  // A director's device is the only client that can read every book, so it is
  // the one that posts them when the tournament is over. Everybody else's
  // Betting tab reads that document and gets its final board from it.
  //
  // Guarded three ways in lib/marketSeal — director, event actually finished,
  // and the books changed since whatever is already up there. The third is
  // what stops this writing on every snapshot; the second is what stops it
  // being the leak it exists to prevent.
  const publishedSigRef = useRef(null);
  useEffect(() => {
    const eventComplete = numRounds > 0 && allPlayers.length > 0
      && Array.from({ length: numRounds }, (_, i) => i + 1)
        .every(r => roundComplete(holeData, allPlayers, r));
    if (!shouldPublish({
      isDirector: meIsDirector,
      eventComplete,
      bets: allBets,
      publishedSignature: publishedSigRef.current,
    })) return;
    const sig = betsSignature(allBets);
    publishedSigRef.current = sig;
    db.upsert("wbc_market_result", {
      id: `mr_${TOURNAMENT_ID}`,
      tournament_id: TOURNAMENT_ID,
      bets: allBets.map(b => ({ pid: b.pid, opening: b.opening, mid: b.mid })),
      signature: sig,
      publishedAt: new Date().toISOString(),
    });
  }, [meIsDirector, allBets, holeData, allPlayers, numRounds]);

  // What the Betting tab actually computes from. See lib/marketSeal.
  const marketBets = useMemo(
    () => betsToHold({ own: ownBets, all: allBets, published: publishedBets, isDirector: meIsDirector }),
    [ownBets, allBets, publishedBets, meIsDirector],
  );


  // ── Claim flow ──
  // Set of player_ids already bound to a Firebase uid (single source of truth
  // is the claims map's values).
  const claimedPlayerIds = useMemo(() => new Set(Object.values(claims)), [claims]);

  // Write the uid→player_id claim and log the person in. Optimistic: local
  // state updates immediately so the UI advances, then the Firestore writes
  // follow. `method` records how the claim was resolved ("email" | "manual").
  const claimProfile = useCallback(async (fb, player, method) => {
    if (!fb || !player) return;
    const email = (fb.email || "").toLowerCase();
    const rec = {
      id: fb.uid, uid: fb.uid, tournament_id: TOURNAMENT_ID,
      player_id: player.id, email, displayName: fb.displayName || player.name,
      providers: (fb.providerData || []).map(p => p.providerId),
      // Stamped here as well as by the login effect, so the very first
      // launch has a time on it before anything re-runs. See lib/playerActivity.
      method, claimedAt: Date.now(), lastLoginAt: Date.now(),
    };
    setClaims(prev => ({ ...prev, [fb.uid]: player.id }));
    setClaimBusyId(null);
    setClaimState(null);
    setUser({ id: player.id, name: player.name, isDirector: isDirectorAccount(membership) });
    // The only record written is the uid→player_id claim (wbc_users). We do NOT
    // stamp the email onto the shared players profile — emails are never
    // collected ahead of time or stored on tournament profiles; a player simply
    // picks their name at sign-in.
    await db.upsert(USERS_COLLECTION, rec).catch(e => console.warn("[claim] wbc_users write failed", e));
    // `membership` is read for the isDirector seed above. Only ever called
    // from the claim screen's onClick, so a changing identity costs nothing.
  }, [membership]);

  // Subscribe to Firebase Auth. Also completes any pending redirect sign-in
  // (installed-PWA path) that resolves on cold start. Entirely skipped while
  // providers are disabled — no redirect/iframe machinery runs on cold start
  // until the feature is live.
  useEffect(() => {
    // Providers off: nobody can be signed in, so say so at once rather than
    // leaving the app holding for an answer that is never coming.
    if (!AUTH_PROVIDERS_ENABLED) { setFbUser(null); return; }

    // ── "Sign-in came back empty" is not a failure on its own ──
    // The redirect handler can return nothing to getRedirectResult() while
    // Firebase has ALREADY applied the credential — the pending record is
    // consumed during Auth's own initialisation, and what arrives instead is
    // the auth state, a moment later. Reported as an error, that is a red
    // notice on the sign-in screen belonging to somebody who is in the middle
    // of being signed in.
    //
    // It happened for real: a player photographed that message on his phone
    // while the admin screen showed him signed in six minutes earlier, and the
    // login stamp behind that row is only written once an account has been
    // resolved all the way to a player. He was in; the app told him he was
    // not.
    //
    // So an empty return is HELD, and only becomes a message if Firebase then
    // says nobody is signed in. `armed` survives until an answer arrives; the
    // timer is for the case where the listener's first answer is null and the
    // user lands a beat later, which is the ordering this cannot control.
    let armed = "";
    let settle = null;
    consumeRedirectResult().catch(e => {
      if (e?.code === "app/redirect-empty") {
        if (_auth?.currentUser) return;   // already in — nothing to report
        armed = e.message;
        settle = setTimeout(() => { if (armed && !_auth?.currentUser) setAuthMsg(armed); }, 2500);
        return;
      }
      setAuthMsg(e?.message || "Sign-in failed.");
    });

    const unsub = onAuthStateChanged(_auth, u => {
      setFbUser(u || null);
      // What the next cold start reads to decide whether to wait for this
      // answer or draw the sign-in screen straight away. Cleared on sign-out
      // by the same listener, which fires with null.
      rememberSignedIn(!!u);
      // Signed in after all: the redirect did its job by another route.
      if (u) { armed = ""; if (settle) { clearTimeout(settle); settle = null; } }
    });
    // Belt and braces. onAuthStateChanged fires once on init even offline, so
    // this should never be what ends the wait — but a splash that never
    // resolves is a worse bug than the flash this is fixing.
    const bail = setTimeout(() => setFbUser(v => (v === undefined ? null : v)), 4000);
    return () => { clearTimeout(bail); if (settle) clearTimeout(settle); unsub(); };
  }, []);

  // Resolve a signed-in Firebase user to a WBC player: already-claimed fast
  // path → manual "pick your name". No email matching — a player claims their
  // profile by choosing their name. Waits until the registry and existing
  // claims have loaded so it never mis-decides "unclaimed".
  useEffect(() => {
    if (!fbUser) { setClaimState(null); return; }
    // The door comes before the claim. Claiming a name is a write, and the
    // rules gate it on the membership document existing, so offering the
    // roster to somebody who has not been through the password screen would
    // just be a grid of names whose every tap is refused.
    if (member !== true) { setClaimState(null); return; }
    if (!storageLoaded) return;

    // 1. Already claimed → log straight in (idempotent; guarded against loops).
    const claimedPid = claims[fbUser.uid];
    if (claimedPid) {
      const p = DEMO_PLAYERS.find(pl => pl.id === claimedPid);
      if (p) {
        setClaimState(null);
        if (user?.id !== p.id) setUser({ id: p.id, name: p.name, isDirector: isDirectorAccount(membership) });
        return;
      }
      // Claimed to a player_id no longer in the registry — fall through to re-claim.
    }

    // 2. Manual "pick your name" (immediate link per CLAIM_REQUIRES_APPROVAL=false).
    //
    // The field, PLUS anybody the director has put in the market without
    // playing. A market-only player has money on this tournament and a book to
    // fill in, and the only way he reaches it is by claiming his own name —
    // leaving him off this list would mean a man who has paid $25 cannot get
    // past the sign-in screen. Everybody here is somebody a director named.
    const unclaimed = [...activePlayers, ...marketOnly].filter(p => !claimedPlayerIds.has(p.id));
    setClaimState({ status: "needs-claim", candidates: unclaimed });
  }, [fbUser, member, membership, claims, claimedPlayerIds, storageLoaded, activePlayers, marketOnly, user]);

  // ── Admin access rides on the MEMBERSHIP flag ──
  // `is_director` on wbc_accounts/{uid} is the only thing the security rules
  // will honour, so it has to be the only thing the app reads too — otherwise
  // a phone can show an Admin tab whose every write comes back refused, which
  // looks like the app is broken rather than like a permission problem.
  //
  // There was a DIRECTOR_IDS list here as a transition fallback, for the
  // window between this code landing and the two membership documents
  // actually carrying `is_director`. Those documents carry it now and
  // firestore.rules is enforcing, so the list is gone: a director on a
  // hardcoded list but not on the flag would get an Admin tab whose every
  // write comes back refused, which reads as a broken app rather than as a
  // permission problem. One source of truth, and it is the one the database
  // checks.
  //
  // Getting the crown back if the set is ever emptied is a Firebase console
  // edit on wbc_accounts — by design. Nothing in the app can appoint the
  // first director, because the rule requires one to already exist.
  useEffect(() => {
    if (!user || user.isGuest) return;
    const flag = isDirectorAccount(membership);
    // Remembered on the device for one decision made before any account has
    // loaded: whether an app opening in a past edition is put back into the
    // live tournament. A director building next year keeps their place; a
    // player who looked at 2014 does not. See lib/editionHome.
    rememberDirector(flag);
    if (user.isDirector !== flag) setUser(u => (u ? { ...u, isDirector: flag } : u));
  }, [membership, user]);

  // Every membership, but only for a director — the rules allow the listing to
  // nobody else, and nobody else has a screen that needs it. Subscribed rather
  // than fetched so appointing somebody updates the row you just tapped.
  const [memberships, setMemberships] = useState([]);
  useEffect(() => {
    if (!user?.isDirector) { setMemberships([]); return; }
    return subscribeMemberships(setMemberships);
  }, [user?.isDirector]);

  const onSetDirector = useCallback(async (uid, on) => setDirector(uid, on), []);

  // Provider sign-in handlers for the login screen.
  const handleGoogleSignIn = useCallback(async () => {
    setAuthMsg("");
    try { await doGoogleSignIn(); } catch (e) { setAuthMsg(e?.message || "Google sign-in failed."); }
  }, []);
  const handleAppleSignIn = useCallback(async () => {
    setAuthMsg("");
    try { await doAppleSignIn(); } catch (e) { setAuthMsg(e?.message || "Apple sign-in failed."); }
  }, []);

  // Unified logout: clear the Firebase session too, or the auth listener would
  // immediately re-resolve and log the person back in. Safe no-op for PIN-only
  // and guest users (no Firebase session to clear).
  const handleLogout = useCallback(async () => {
    setClaimState(null);
    setClaimBusyId(null);
    try { await doSignOut(); } catch { /* non-fatal */ }
    setUser(null);
  }, []);


  // Get a player's tee box for a round (returns tee object or null)
  // Null for the running tournament, which is what sends the board to calcCH.
  // Both wrapped so the memo below can depend on the FUNCTIONS rather than on a
  // hand-copied list of what they happen to read — which is how such a list goes
  // stale the moment the function changes.
  const getPlayerCH = useCallback((rnd, pid) => {
    const ch = courseHandicaps[rnd]?.[pid];
    return Number.isFinite(ch) ? ch : null;
  }, [courseHandicaps]);

  const getPlayerTee = useCallback((rnd, pid, course) => {
    if (!course || !course.tee_boxes || course.tee_boxes.length === 0) return null;
    const assigned = (teeData[rnd] || {})[pid];
    if (assigned) {
      const tee = course.tee_boxes.find(t => t.name === assigned);
      if (tee) return tee;
    }
    return getDefaultTee(course.tee_boxes) || course.tee_boxes[0];
  }, [teeData]);

  // The board, ranked best → worst. Both halves come from lib/individualBoard
  // so the standings players read and the order the `leaderboard` pairing mode
  // draws from are provably the same number — see that module's header for why
  // this is not computed here any more.
  // Who has taken the market's halfway rebuy. Derived from the bets, never
  // tagged — see lib/market rebuyers. It is computed HERE rather than only
  // inside the Betting tab because the Admin price sheet bills for it too,
  // and a count taken from the stored (unused) `in` list would have told the
  // director a different number to the one the pot is counted from.
  const rebuyIds = useMemo(() => {
    const inMarket = new Set(fieldFor(sideGames?.market?.in, marketPool).map(p => p.id));
    return rebuyers(eligibleBets({ bets: marketBets, inMarket: pid => inMarket.has(pid) }));
  }, [sideGames, marketPool, marketBets]);

  const getLeaderboard = useMemo(() =>
    rankIndividualBoard(computeIndividualBoard({
      players: allPlayers,
      numRounds,
      holeData,
      tRounds,
      courses: courseList,
      getPlayerTee,
      getPlayerCH,
    })),
  // teeData and courseHandicaps are covered transitively now — they are the
  // deps of getPlayerTee and getPlayerCH, which this depends on directly.
  [allPlayers, tRounds, courseList, holeData, numRounds, getPlayerCH, getPlayerTee]);

  const onSaveHole = async (pid, rnd, holeIdx, score) => {
    // Optimistic update
    setHoleData(prev => {
      const key = `${pid}_${rnd}`;
      return { ...prev, [key]: { ...(prev[key] || {}), [holeIdx]: score } };
    });
    // Persist to Firestore
    const tr = tRounds.find(t => t.round_number === rnd);
    const row = holeDataToRow(pid, rnd, holeIdx, score, tr?.course_id);
    await db.upsert("hole_scores", row);
  };

  // ── Withdraw a player ──
  // Sets the roster status and fills the rest of THIS round's card with the
  // sentinel, so the card stays structurally complete and every total knows to
  // skip those holes (see lib/individualBoard). Later rounds need no filling:
  // they have no card to complete, and the roster flag is what takes the player
  // out of contention on the board.
  //
  // Nothing here waits on the server, and that is the point. This used to
  // await nineteen writes in a row and only then raise its confirmation —
  // which is fine in a car park and useless on the twelfth hole, where a
  // Firestore write does not fail without signal but does not resolve either.
  // Withdrawing somebody out of range appeared to do nothing at all: no
  // confirmation, no error, for as long as the phone stayed out of range.
  //
  // Local state moves first, the confirmation follows it, and the writes go in
  // ONE batch behind both. Whether that batch has landed is the sync banner's
  // job to report — it is counting them.
  const markPlayerWD = async (pid) => {
    const tr = tRounds.find(t => t.round_number === round);
    const key = `${pid}_${round}`;
    const existing = holeData[key] || {};
    const updates = [];
    for (let h = 0; h < 18; h++) {
      if (!(existing[h] > 0)) updates.push(holeDataToRow(pid, round, h, WD_SCORE, tr?.course_id));
    }
    setHoleData(prev => {
      const filled = { ...(prev[key] || {}) };
      for (let h = 0; h < 18; h++) { if (!(filled[h] > 0)) filled[h] = WD_SCORE; }
      return { ...prev, [key]: filled };
    });
    setTPlayers(prev => prev.map(t => t.player_id === pid ? { ...t, status: "WD" } : t));
    notify(`Player withdrawn from tournament`);

    const tp = tPlayers.find(t => t.player_id === pid);
    if (tp) db.upsert("tournament_players", { ...tp, status: "WD" }, "id");
    if (updates.length) db.upsertMany("hole_scores", updates);
  };

  const setCourseForRound = async (rnd, course) => {
    if (course.id) {
      setCourseList(prev => prev.find(c => c.id === course.id) ? prev : [...prev, course]);
      // Upsert course to Firestore
      const { tee_boxes, ...courseData } = course;
      await db.upsert("courses", courseData);
      // Upsert tee boxes
      if (tee_boxes?.length) {
        for (const tb of tee_boxes) {
          const { hole_yards: hy2, _source: _s2, color: _c2, ...tbData2 } = tb;
          const tbPayload2 = {
            id: `tb_${course.id}_${(tb.name || "default").toLowerCase().replace(/\s+/g,"_")}`,
            course_id: course.id,
            color: tb.color || _c2,
            name: tbData2.name, rating: tbData2.rating, slope: tbData2.slope,
            par: tbData2.par, yardage: tbData2.yardage || 0,
          };
          if (Array.isArray(hy2) && hy2.some(y => y > 0)) tbPayload2.hole_yards = hy2;
          await db.upsert("tee_boxes", tbPayload2);
        }
      }
    }
    const trRow = { id: docIds.tournamentRound(_e(), rnd), tournament_id: TOURNAMENT_ID, round_number: rnd, course_id: course.id || null };
    setTRounds(prev => {
      const existing = prev.find(t => t.round_number === rnd);
      const updated = existing
        ? prev.map(t => t.round_number === rnd ? { ...t, course_id: course.id } : t)
        : (course.id ? [...prev, trRow] : prev);
      setTimeout(() => setCourseList(cl => sortCoursesByRound(cl, updated)), 800);
      return updated;
    });
    // Only upsert to Firestore if assigning a real course
    if (course.id) {
      await db.upsert("tournament_rounds", trRow);
    }
    // Auto-assign default tee
    if (course.id && course.tee_boxes?.length) {
      const defaultTee = getDefaultTee(course.tee_boxes);
      if (defaultTee) {
        const bulk = {};
        activePlayers.forEach(p => { bulk[p.id] = defaultTee.name; });
        setTeeData(prev => ({ ...prev, [rnd]: bulk }));
        const rows = activePlayers.map(p => ({ id: docIds.teeAssignment(_e(), rnd, p.id), tournament_id: TOURNAMENT_ID, round_number: rnd, player_id: p.id, tee_name: defaultTee.name }));
        await db.upsertMany("tee_assignments", rows);
      }
    }
  };

  const addCourse = async (course) => {
    if (course._delete) {
      // Remove from tournament's active course list (local state only)
      // Do NOT delete from Firestore — courses collection is a permanent library
      setCourseList(prev => prev.filter(c => c.id !== course.id));
      notify("Course removed from tournament");
      return;
    }
    // Strip all internal UI flags and tee_boxes before saving course row
    const { tee_boxes, _incompleteData, _apiVersion, _sbVersion,
            _sbHasReal, _apiHasReal, _source, _freshFetch, ...rawCourseData } = course;
    // Ensure course has a stable id
    const courseId = rawCourseData.id || `course_${Date.now()}`;
    const courseData = { ...rawCourseData, id: courseId };
    // Save course FIRST and wait for it before saving tee boxes (foreign key requirement)
    const now = new Date().toISOString();
    // `currentUser` is AdminView's name for this — in here it's `user`. The old
    // `typeof currentUser !== "undefined"` guard meant this always fell through
    // to "Unknown", so no course edit was ever attributed.
    const savedBy = user?.name || "Unknown";
    await db.upsert("courses", { ...courseData, updated_at: now, updated_by: savedBy }, "id");
    if (tee_boxes?.length) {
      let tbErrors = 0;
      for (const tb of tee_boxes) {
        const { color: _c, _source: _s, ...tbData } = tb;
        const tbPayload = {
          id: `tb_${courseId}_${(tb.name || "default").toLowerCase().replace(/\s+/g,"_")}`,
          course_id: courseId,
          color: tb.color,
          name: tbData.name,
          rating: tbData.rating,
          slope: tbData.slope,
          par: tbData.par,
          yardage: tbData.yardage || 0,
        };
        if (Array.isArray(tb.hole_yards) && tb.hole_yards.some(y => y > 0)) {
          tbPayload.hole_yards = tb.hole_yards;
        }
        try {
          await db.upsert("tee_boxes", tbPayload);
        } catch(tbErr) {
          console.error("Tee box save failed:", tbErr, tbPayload);
          tbErrors++;
        }
      }
      if (tbErrors > 0) {
        notify(`⚠ Course saved but ${tbErrors} tee box${tbErrors > 1 ? "es" : ""} failed to save — open and re-save to retry`);
      }
    }
    // Update local state with clean version (always, even if tee saves had errors)
    const cleanCourse = { ...courseData, tee_boxes: tee_boxes || [] };
    setCourseList(prev => sortCoursesByRound(
      prev.find(c => c.id === courseId) ? prev.map(c => c.id === courseId ? cleanCourse : c) : [...prev, cleanCourse],
      tRounds
    ));
    notify(`Added ${course.name}`);
  };

  // Returns the derived player id so the caller can key anything else it needs
  // to write for the new player off the SAME value rather than re-deriving it
  // and risking the two drifting apart.
  //
  // `existingId` is the returning-player path: an id read off a record that
  // already exists, which must be used AS IT IS rather than re-derived. A
  // legacy row's id and its display name do not have to agree, and deriving
  // over the top of one would file a man beside himself — new roster row, same
  // name, and his account claim still pointing at the record he has left.
  //
  // A registry row MINTED IN THE SANDBOX is stamped with that edition, and is
  // then invisible everywhere else — a name typed into the demo is a test
  // name, not a career, and an unstamped one turns up in every real edition's
  // "Played before?" picker forever. See lib/playerScope.
  //
  // Only a record this edition cannot already see is scoped, and that
  // qualifier is the whole safety of it. `db.upsert` MERGES, so scoping a row
  // that already exists would write `edition_id: wbc_demo` onto a real career —
  // and a director adding Aaron J to the demo, either off the returning picker
  // or by typing the name his id was derived from, would delete him from
  // 2026's registry without touching 2026. So an id already carrying a visible
  // record keeps the scope that record has.
  //
  // The other direction is the one that has to WRITE rather than skip: an id
  // whose only row is a demo row is invisible from here, so a real edition
  // adding that name is claiming it, and scopeFor clears the stamp instead of
  // leaving a roster row bound to a record nobody in this edition can read.
  const addPlayerToTournament = async (name, hi, parts = null, existingId = null) => {
    const id = existingId ? String(existingId) : name.toLowerCase().replace(/\s+/g, "_");
    const known = DEMO_PLAYERS.find(p => p.id === id);
    const rec = { id, name, ...(parts || {}), ...(known ? {} : scopeFor(TOURNAMENT_ID)) };
    if (!known) DEMO_PLAYERS.push({ ...rec });
    else Object.assign(known, rec);
    await db.upsert("players", rec, "id").catch(() => {});
    const newTp = { id: docIds.tournamentPlayer(_e(), id), tournament_id: TOURNAMENT_ID, player_id: id, handicap_index: hi, status: "active" };
    setTPlayers(prev => [...prev, newTp]);
    await db.upsert("tournament_players", newTp);
    // Seed default tee assignments
    const teeUpdates = [];
    tRounds.forEach(tr => {
      const course = courseList.find(c => c.id === tr.course_id);
      if (!course) return;
      const defaultTee = getDefaultTee(course.tee_boxes);
      if (!defaultTee) return;
      teeUpdates.push({ id: docIds.teeAssignment(_e(), tr.round_number, id), tournament_id: TOURNAMENT_ID, round_number: tr.round_number, player_id: id, tee_name: defaultTee.name });
    });
    if (teeUpdates.length) {
      setTeeData(prev => {
        const updated = { ...prev };
        teeUpdates.forEach(u => { updated[u.round_number] = { ...(updated[u.round_number] || {}), [id]: u.tee_name }; });
        return updated;
      });
      for (const row of teeUpdates) await db.upsert("tee_assignments", row);
    }
    await saveTournamentState(finalizedRounds);
    return id;
  };

  // ── Discard one player's round ──
  // Ported from Bourbon Cup. The fix for the two things that actually go wrong
  // on a scorecard: somebody enters a round against the wrong name, or a group
  // signs a card that turns out to be wrong. Before this the only remedy was
  // "Start Fresh", which wipes the whole tournament.
  //
  // Deletes by the STORED document id, so it clears whatever id scheme the row
  // was written under — the pre-editions bare `2026` ids and the edition-slug
  // ids both — falling back to rebuilding the id only if a row somehow lacks
  // one. Returns the number of holes removed so the caller can report it.
  //
  // ONE commit for the whole card. A per-hole delete loop is eighteen commits,
  // and every phone in the field publishes a repaint on each of them — the
  // discarded round visibly erodes a hole at a time on somebody else's
  // leaderboard. Batched, it is gone everywhere in one frame.
  const onDiscardRoundScores = async (round, pid) => {
    const rows = await db.get("hole_scores", [
      { field: "tournament_id", op: "==", value: TOURNAMENT_ID },
      { field: "player_id", op: "==", value: pid },
      { field: "round_number", op: "==", value: round },
    ]);
    const ids = (rows || []).map(r => r.id || docIds.holeScore(_e(), round, pid, (r.hole_number || 1) - 1));
    if (ids.length) await db.replaceMany("hole_scores", [], ids);
    // The subscription now says the same thing a moment later — it applies
    // removals, which is what it did not used to do — so this is only about
    // the panel that raised the action not re-rendering against a stale card
    // in the meantime.
    setHoleData(prev => { const n = { ...prev }; delete n[`${pid}_${round}`]; return n; });
    return ids.length;
  };

  const updateHI = async (pid, newHI) => {
    setTPlayers(prev => prev.map(tp => tp.player_id === pid ? { ...tp, handicap_index: newHI } : tp));
    const tp = tPlayers.find(t => t.player_id === pid);
    if (tp) await db.upsert("tournament_players", { ...tp, handicap_index: newHI }, "id");
  };

  // ── The hand-set WBC Index ──
  // A career-level number, so it lives on the `players` registry rather than on
  // this year's tournament_players row: an index a director corrects is a fact
  // about the golfer, not about the edition, and putting it on the edition
  // would mean setting it again every year.
  //
  // It is NOT the same number as `handicap_index` above. That one is the index
  // this tournament is played off and is locked once cards are in (see the
  // handicap-edit guard in AdminView); this one is what the Players tab
  // publishes as the golfer's WBC Index. Setting this does not move anybody's
  // course handicap or reshuffle a leaderboard.
  //
  // `null` clears it and the computed index comes back.
  const setIndexOverride = async (pid, value) => {
    const v = value == null || String(value).trim() === "" ? null : Number(value);
    const next = v != null && Number.isFinite(v) ? v : null;
    DEMO_PLAYERS = DEMO_PLAYERS.map(p => p.id === pid ? { ...p, index_override: next } : p);
    setRegistry(DEMO_PLAYERS);
    await db.upsert("players", { id: pid, index_override: next }, "id");
  };

  // `name` is the DISPLAY name ("Aaron J") that every screen outside the admin
  // console renders, and it stays the source of truth for those. first_name /
  // last_name are the full parts, edited only in the player editor, and the
  // display name is derived from them unless a nickname overrides it.
  const updateName = async (pid, newName, parts = null) => {
    const patch = { id: pid, name: newName, ...(parts || {}) };
    const p = DEMO_PLAYERS.find(pl => pl.id === pid);
    if (p) Object.assign(p, patch);
    else DEMO_PLAYERS.push({ ...patch });
    setTPlayers(prev => [...prev]); // trigger re-render
    await db.upsert("players", patch, "id").catch(() => {});
  };

  // ── Move a player to inactive ──
  // "Remove" is what it does to the EDITION — the tournament_players row and
  // this year's pairings — and the name has stayed that way because that is
  // still the write. What it has never done is remove a player: the `players`
  // record, the career id behind it and every historical round are untouched,
  // which is why the button that calls this says "Move to inactive" and why
  // the Players tab lists him under that heading afterwards.
  const removePlayer = async (pid) => {
    const tp = tPlayers.find(t => t.player_id === pid);
    setTPlayers(prev => prev.filter(tp => tp.player_id !== pid));
    if (tp) await db.deleteDoc("tournament_players", tp.id);
    // Remove from pairings
    setPairingsData(prev => {
      const updated = {};
      Object.keys(prev).forEach(rnd => {
        updated[rnd] = prev[rnd].map(grp => grp.filter(id => id !== pid)).filter(grp => grp.length > 0);
      });
      return updated;
    });
    await db.delete("pairings", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }, { field: "player_id", op: "==", value: pid }]);
    notify("Moved to inactive");
  };

  // ── Where else this man holds a roster row ────────────────────────
  // The one fact the delete decision needs that no screen already has: the
  // roster subscription is filtered to THIS edition, by design, so from in here
  // 2027 is invisible. Deleting the registry record while another year still
  // binds to it would leave that year's roster row with no name to draw — the
  // orphaned row lib/roster drops on sight, which is to say a player who
  // silently vanishes from a tournament nobody is looking at yet.
  //
  // Returns null when the read fails. The caller must treat that as a refusal
  // rather than as an empty list: not being able to check is not permission.
  const editionsHolding = async (pid) => {
    const rows = await db.get("tournament_players", [{ field: "player_id", op: "==", value: pid }]);
    if (!rows) return null;
    return [...new Set(rows.map(r => r.tournament_id).filter(t => t && t !== TOURNAMENT_ID))];
  };

  // ── Delete a player outright ──────────────────────────────────────
  // The other half of "Move to inactive", and everything that one deliberately
  // does not do. This takes the `players` record itself — the career id — plus
  // everything this edition has filed under it: the roster row, the pairings,
  // the tee assignments, the scores, and any skins document naming them (their
  // market book, and any CTP they are holding, which would otherwise be a tag
  // on a par 3 belonging to nobody).
  //
  // It exists for records that should not exist: a name typed into the demo, a
  // misspelling added twice. WHO MAY BE DELETED is not decided here — see
  // lib/playerDelete, which refuses anybody the record books know and anybody
  // another edition still rosters, and AdminView, which asks.
  //
  // Only this edition's rows are swept. That is not a shortcut: a man on
  // another year's roster cannot reach this function at all, so there is by
  // then nothing of his anywhere else to sweep.
  const deletePlayer = async (pid) => {
    const tp = tPlayers.find(t => t.player_id === pid);
    const gone = { field: "player_id", op: "==", value: pid };
    const here = { field: "tournament_id", op: "==", value: TOURNAMENT_ID };

    setTPlayers(prev => prev.filter(t => t.player_id !== pid));
    setPairingsData(prev => {
      const updated = {};
      Object.keys(prev).forEach(rnd => {
        updated[rnd] = prev[rnd].map(grp => grp.filter(id => id !== pid)).filter(grp => grp.length > 0);
      });
      return updated;
    });
    setTeeData(prev => {
      const next = {};
      Object.entries(prev).forEach(([rnd, byPlayer]) => {
        const { [pid]: _gone, ...rest } = byPlayer || {};
        next[rnd] = rest;
      });
      return next;
    });
    setHoleData(prev => {
      const next = { ...prev };
      // Keyed `${pid}_${round}`, and split from the RIGHT: a prefix match would
      // also take "aaron_j_2"'s cards while deleting "aaron".
      Object.keys(next).forEach(k => {
        const at = k.lastIndexOf("_");
        if (at > 0 && k.slice(0, at) === pid) delete next[k];
      });
      return next;
    });
    // The registry last in state, first in intent: every screen reads names
    // through it, so dropping it is what makes the player disappear.
    DEMO_PLAYERS = DEMO_PLAYERS.filter(p => p.id !== pid);
    setRegistry(DEMO_PLAYERS);

    if (tp) await db.deleteDoc("tournament_players", tp.id);
    await db.delete("pairings", [here, gone]);
    await db.delete("tee_assignments", [here, gone]);
    await db.delete("hole_scores", [here, gone]);
    await db.delete("skins", [here, gone]);
    await db.deleteDoc("players", pid);
  };

  // Compute gross skin wins for scorecard highlighting: { "round_holeIdx": playerId }
  // Gross skin wins for scorecard highlighting: { "round_holeIdx": playerId }.
  //
  // Computed through lib/sideGames, the same function the Betting tab runs, so
  // a gold circle on the leaderboard's card is provably the same skin the
  // Betting tab is paying for. It also respects the skins buy-in list: a hole
  // won by somebody who is not in the game is not a skin, and highlighting it
  // as one would put a circle on the board that the money disagrees with.
  const skinWins = useMemo(() => {
    const field = fieldFor(sideGames?.skins?.in, activePlayers);
    const wins = {};
    for (let r = 1; r <= numRounds; r++) {
      const tr = tRounds.find(t => t.round_number === r);
      const rCourse = tr ? courseList.find(c => c.id === tr.course_id) : null;
      if (!rCourse) continue;
      computeSkins({ players: field, holeData, round: r, pars: rCourse.hole_pars || [] })
        .filter(s => s.winner)
        .forEach(s => { wins[`${r}_${s.hole}`] = s.winner.pid; });
    }
    return wins;
  }, [activePlayers, holeData, tRounds, courseList, numRounds, sideGames]);

  // Tag / re-tag the tournament-wide CTP for a par 3. One doc per round+hole, so a
  // closer ball from a later group overwrites the standing tag.
  //
  // distance_ft is written EXPLICITLY (null when unknown) rather than omitted: db.upsert
  // uses setDoc(merge:true), so an omitted field would silently retain the previous
  // player's distance and attach it to the new winner. The tagging GROUP is written the
  // same way and for the same reason: a director's override off the Betting tab carries
  // no group, and inheriting the last group's tee order would have the prompt telling
  // the next group the field is out of order on the strength of a stale field.
  const onSetCtp = async (rnd, hole, pid, distanceFt = null, taggedGroup = null) => {
    const ft = (distanceFt === null || distanceFt === undefined || distanceFt === "") ? null : Number(distanceFt);
    const distance = ft ? `${ft} ft` : "";
    const taggedByName = user?.name || "";
    const taggedGroupKey = taggedGroup?.key || null;
    const taggedGroupOrder = Number.isInteger(taggedGroup?.order) ? taggedGroup.order : null;
    setCtpData(prev => ({
      ...prev,
      [rnd]: { ...(prev[rnd] || {}), [hole]: { playerId: pid, distanceFt: ft, distance, taggedByName, taggedGroupKey, taggedGroupOrder, confirmedBy: [] } },
    }));
    // Store CTP as a skin type in the skins table.
    // tournament_id was previously MISSING — which meant these docs were invisible to
    // every tournament-scoped query (including Start Fresh's cleanup) and could never
    // be loaded back. That's why CTPs evaporated on reload.
    const tr = tRounds.find(t => t.round_number === rnd);
    await db.upsert("skins", {
      id: docIds.ctp(_e(), rnd, hole),
      tournament_id: TOURNAMENT_ID,
      tournament_round_id: tr?.id || null,
      round_number: rnd,
      hole_number: hole,
      player_id: pid,
      skin_type: "ctp",
      distance_ft: ft,
      distance,
      tagged_by: user?.id || null,
      tagged_by_name: taggedByName,
      tagged_group_key: taggedGroupKey,
      tagged_group_order: taggedGroupOrder,
      tagged_at: new Date().toISOString(),
      // Cleared, not merged: a confirmation was agreement with a distance
      // that has just been beaten, and carrying it onto the new tag would
      // show groups signing off a number they never saw.
      confirmed_by: [],
    }, "id");
    // No toast. The prompt closing IS the acknowledgement, and this one fired
    // on a screen the group is about to walk away from — a banner over the
    // next hole's scores telling them what they just did.
  };

  // ── The side games' money ────────────────────────────────────────
  // A MERGE of only the named fields, deliberately: writing the whole shape
  // every time would materialise `in: null` as a stored field and destroy the
  // distinction between "never configured" (everybody) and "nobody in".
  // Firestore's setDoc(merge:true) merges maps field by field, so patching
  // { skins: { in: [...] } } leaves the skins buy-in price alone.
  //
  // Takes a PATCH SET keyed by game — { skins: {...}, ctp: {...} } — because
  // the collection sheet's row toggle changes all four games at once, and
  // four writes for one tap is four chances for half of them to land.
  //
  // Applied locally first so sixteen taps down a roster feel immediate.
  const onUpdateSideGames = async (patchByGame) => {
    setSideGames(prev => {
      const next = { ...prev };
      Object.entries(patchByGame).forEach(([k, patch]) => { next[k] = { ...next[k], ...patch }; });
      return next;
    });
    await db.upsert("tournament_state", {
      id: `ts_${TOURNAMENT_ID}`,
      tournament_id: TOURNAMENT_ID,
      side_games: patchByGame,
      updated_at: new Date().toISOString(),
    });
  };

  // ── Putting somebody in the market who is not playing ─────────────
  // The registry row is written FIRST, and whether or not he already has one:
  // the app resolves a sign-in by looking the claimed id up in the registry,
  // so a market-only player without a row could claim his name and be handed
  // the claim screen again on every launch. A man out of the record books who
  // predates this app has no row at all until this makes him one.
  //
  // Then the market's own list, materialised through toggleIn for the usual
  // reason: a market nobody has configured is stored as null, and appending to
  // null would read back as "one man is in the market and nobody else".
  const onAddMarketOutsider = async (person) => {
    if (!person?.id) return;
    const rec = { id: String(person.id), name: person.name || String(person.id) };
    if (!DEMO_PLAYERS.find(p => p.id === rec.id)) DEMO_PLAYERS.push({ ...rec });
    setRegistry(DEMO_PLAYERS.slice());
    await db.upsert("players", rec, "id").catch(() => {});
    await onUpdateSideGames({ market: { in: toggleIn(sideGames?.market?.in, allPlayers, rec.id) } });
  };

  // ── Placing a bet ────────────────────────────────────────────────
  // One document per bettor holding BOTH windows, written whole. The lots
  // are arrays rather than maps for exactly this reason: db.upsert merges,
  // and a map would keep a golfer the bettor has just sold out of.
  //
  // The window guard is on the screen, not here, because this is also the
  // director's correction path — a phone that died before the bell still has
  // to get its shares in.
  const onSaveMarketBet = async (pid, lots) => {
    if (!pid) return;
    const opening = normalizeLots(lots.opening);
    const mid = normalizeLots(lots.mid);
    // Optimistic, into whichever mirrors this phone actually holds: its own
    // book always, and the wide list too if a director is correcting somebody
    // else's. The subscriptions echo the same thing a moment later.
    const merge = (prev) => {
      const rest = (prev || []).filter(b => b.pid !== pid);
      return [...rest, { pid, opening, mid }].sort((a, b) => String(a.pid).localeCompare(String(b.pid)));
    };
    if (pid === user?.id) setOwnBets(merge);
    setAllBets(prev => (prev ? merge(prev) : prev));
    await db.upsert("skins", {
      id: docIds.marketBet(_e(), pid),
      tournament_id: TOURNAMENT_ID,
      skin_type: "market",
      player_id: pid,
      opening,
      mid,
      updated_at: new Date().toISOString(),
    });
  };

  // ── Confirming a standing CTP ────────────────────────────────────
  // The other answer the on-course prompt can take. A group that walks off a
  // par 3 without getting inside the standing tag is not saying nothing —
  // they are saying the tag is right, and that is the only thing that turns
  // "nobody has been asked" into "everybody has been asked and it stands".
  //
  // Additive and idempotent, so two phones in the same group confirming at
  // once converge instead of racing. A merge write of ONLY this field: the
  // winner, the distance and who tagged it belong to whoever tagged it.
  const onConfirmCtp = async (rnd, hole, pid) => {
    const rec = ((ctpData || {})[rnd] || {})[hole];
    if (!rec?.playerId || !pid) return;
    if ((rec.confirmedBy || []).includes(pid)) return;
    const confirmedBy = [...new Set([...(rec.confirmedBy || []), pid])];
    setCtpData(prev => ({
      ...prev,
      [rnd]: { ...(prev[rnd] || {}), [hole]: { ...rec, confirmedBy } },
    }));
    await db.upsert("skins", {
      id: docIds.ctp(_e(), rnd, hole),
      tournament_id: TOURNAMENT_ID,
      confirmed_by: confirmedBy,
    }, "id");
    // Same as onSetCtp: the prompt closing is the acknowledgement.
  };

  // ── The scorecard: signing, attesting, and calling a round done ──
  //
  // These five were inline arrow props on <OnCourseScoring> — one JSX
  // attribute list three thousand characters long, holding the rules for how
  // a card is signed. They are up here now because the paragraph below had to
  // be added to four of them, and a rule nobody can find is a rule that gets
  // added to three places out of four.

  // ── Telling the field a round is done ──
  //
  // `wbc_rounds_state` is the document the onRoundFinalized Cloud Function
  // watches; writing it is what sends "Round N is final" to every phone.
  // Until now only Admin's whole-round finalize button wrote it — and that is
  // not how a round normally ends. It normally ends on a tee box, with the
  // last group signing and attesting its own card, which writes a GROUP KEY
  // into tournament_state and nothing else. So the notification never went
  // out on the path the tournament actually takes.
  //
  // A round is done when every group drawn into it is done (lib/groupSwitch
  // roundFinalized), and that can only be asked AFTER the group's key lands —
  // which is why every path that finalizes a group asks it here rather than
  // each of them deciding for itself.
  //
  // Only the EDGES are written. A round of four groups would otherwise rewrite
  // this document every time a card was signed, and every phone in the field
  // holds a listener on it.
  //
  // Safe to race: four phones can notice the same round finish at the same
  // moment, and the function fires on the false→true transition, so the second
  // and later writes are not transitions and send nothing.
  const publishRoundFinalized = async (nextFinalized, key) => {
    const rnd = roundOfGroupKey(key);
    if (!rnd) return;
    const wasFinal = roundFinalized(finalizedRounds, pairingsData, rnd);
    const isFinal = roundFinalized(nextFinalized, pairingsData, rnd);
    if (wasFinal === isFinal) return;
    await db.upsert("wbc_rounds_state", {
      id: `${TOURNAMENT_ID}_r${rnd}`,
      tournament_id: TOURNAMENT_ID,
      round: rnd,
      finalized: isFinal,
    });
  };

  // Finalizing a group, and the two ways in: it is the last thing a signature
  // or the last attestation does, and it is also its own button.
  const finalizeGroup = async (key) => {
    const nf = { ...finalizedRounds, [key]: true };
    setFinalizedRounds(nf);
    await saveTournamentState(nf);
    await publishRoundFinalized(nf, key);
  };

  const onSignScorecard = async (key, signerPid, signerName, present, rnd) => {
    const nonSigners = (present || []).filter(pid => pid !== signerPid);
    const optimistic = { signedBy: signerPid, signedByName: signerName, attestedBy: [], present: present || [] };
    pendingSigsRef.current.set(key, { sig: optimistic, expiresAt: Date.now() + 8000 });
    setScorecardSigs(prev => ({ ...prev, [key]: optimistic }));
    await db.upsert("wbc_scorecard_sigs", {
      id: docIds.scorecardSig(_e(), key, isDefaultEdition()),
      tournament_id: TOURNAMENT_ID, groupKey: key, round: rnd,
      signedBy: signerPid, signedByName: signerName,
      present: present || [], attestedBy: [], signedAt: new Date().toISOString(),
    });
    // A group of one has nobody left to attest, so signing IS finalizing.
    if (nonSigners.length === 0) await finalizeGroup(key);
  };

  const onAttestScorecard = async (key, attesterPid, nonSigners) => {
    const cur = scorecardSigs[key];
    if (!cur) return;
    const attestedBy = [...new Set([...(cur.attestedBy || []), attesterPid])];
    pendingSigsRef.current.set(key, { sig: { ...cur, attestedBy }, expiresAt: Date.now() + 8000 });
    setScorecardSigs(prev => ({ ...prev, [key]: { ...prev[key], attestedBy } }));
    await db.upsert("wbc_scorecard_sigs", { id: docIds.scorecardSig(_e(), key, isDefaultEdition()), attestedBy });
    if ((nonSigners || []).every(pid => attestedBy.includes(pid))) await finalizeGroup(key);
  };

  const onUnsignScorecard = async (key) => {
    pendingSigsRef.current.delete(key);
    setScorecardSigs(prev => { const ns = { ...prev }; delete ns[key]; return ns; });
    await db.deleteDoc("wbc_scorecard_sigs", docIds.scorecardSig(_e(), key, isDefaultEdition()));
    if (!finalizedRounds[key]) return;
    const nf = { ...finalizedRounds };
    delete nf[key];
    setFinalizedRounds(nf);
    await saveTournamentState(nf);
    await publishRoundFinalized(nf, key);
  };

  const onUnfinalizeGroup = async (key) => {
    const nf = { ...finalizedRounds };
    delete nf[key];
    setFinalizedRounds(nf);
    setScorecardSigs(prev => { const ns = { ...prev }; delete ns[key]; return ns; });
    pendingSigsRef.current.delete(key);
    await db.deleteDoc("wbc_scorecard_sigs", docIds.scorecardSig(_e(), key, isDefaultEdition()));
    await saveTournamentState(nf);
    await publishRoundFinalized(nf, key);
  };

  // Admin's whole-round finalize. It goes through the same publish path a
  // group signing off does — the only difference is which key lands in
  // finalizedRounds, a bare round number rather than a group's.
  const finalizeWholeRound = async (rnd) => {
    const nf = { ...finalizedRounds, [rnd]: true };
    setFinalizedRounds(nf);
    await saveTournamentState(nf);
    await publishRoundFinalized(nf, rnd);
    if (rnd < NUM_ROUNDS) setRound(rnd + 1);
  };

  // Admin's undo, which can be handed either kind of key: a round number from
  // the round panel, or a group key from the per-card list beside it.
  const unfinalizeFromAdmin = async (key) => {
    if (!/^\d+$/.test(String(key))) return onUnfinalizeGroup(key);
    const nf = { ...finalizedRounds };
    delete nf[key];
    setFinalizedRounds(nf);
    await saveTournamentState(nf);
    await publishRoundFinalized(nf, key);
  };

  const setPairings = async (rnd, rawGroups) => {
    // The last gate before anything is written: nobody is seated twice. The
    // editor's own transforms already pull a player out of every group before
    // seating them (lib/pairings assignToGroup), so this should never fire —
    // which is exactly why it is here. The draw is the thing every screen
    // downstream trusts, the id scheme makes a stale row look like a real
    // seat, and "should never happen" is what the last one did.
    const groups = dedupeGroups(rawGroups);
    const existing = JSON.stringify(pairingsData[rnd] || []);
    const incoming = JSON.stringify(groups);
    if (existing === incoming) return;
    setPairingsData(prev => ({ ...prev, [rnd]: groups }));
    // Two things this has to get right, found the hard way from two directions.
    //
    // A round's TEE TIMES live on its pairing rows, so rewriting the draw
    // rewrites them: they survive only because they are copied back out of
    // `teeTimesData` below. If that client state is empty when a save lands —
    // a cold load that has not filled it yet, a save raised from a screen that
    // never subscribed — the round comes back with every tee time gone, which
    // reads as "admin cleared the tee times" and locks every non-director out
    // of scoring behind a gate with nothing to open on. So when client state
    // has nothing, ask Firestore what is actually stored.
    //
    // And the write is ONE commit. The old shape deleted every pairing row for
    // the round and then wrote the new ones one at a time; the delete commits
    // by itself, so every listener saw a round with no pairings and no tee
    // times and published that, then watched them come back a group at a time.
    // That was the flash. Deletes and writes ride in the same batch now, so
    // there is no moment in between to observe. Times carry across by GROUP
    // INDEX — group 1 keeps its time when its players change, which is the
    // whole point of a tee sheet.
    //
    // One read serves both: the stored times when the client has none, and the
    // ids to delete. Reading rather than trusting the local mirror also means a
    // row another director left behind cannot survive as a player in two groups.
    // ── A FAILED READ IS NOT AN EMPTY ROUND ──
    // This used to be `... || []`, and that one fallback is how a player ends
    // up in two groups.
    //
    // db.get answers null when the read FAILS and [] when the round genuinely
    // has no draw, and collapsing those together says "there is nothing stored,
    // so there is nothing to delete" about a round that is in fact fully drawn.
    // The new rows then land on top of the old ones — and because a pairing's
    // document id carries its group number, MOVING a player writes
    // pr_..._g2_aaron_j while pr_..._g1_aaron_j is left sitting there. Both
    // rows are real, both fold in, and the man is in two groups.
    //
    // Nothing surfaces it. The seat count quietly exceeds the roster, which
    // holds the round's setup badge red with no explanation, and the first
    // honest symptom is a scorecard with a name on it twice.
    //
    // It is also not a rare path: this is a phone on a golf course, and the
    // read is a network round trip. So a failed read now ABORTS the save with
    // something the director can act on. Refusing to write is the safe half —
    // the draw on screen is still theirs and the tap can be repeated — where
    // writing half of it is not.
    const onServer = await db.get("pairings", [{ field: "tournament_id", op: "==", value: TOURNAMENT_ID }, { field: "round_number", op: "==", value: rnd }]);
    if (onServer === null) {
      // Put the board back to what is actually stored, so the screen is not
      // showing a draw that was never saved.
      setPairingsData(prev => ({ ...prev, [rnd]: pairingsData[rnd] || [] }));
      notify("Couldn't reach the pairings — nothing was changed. Try again in a moment.");
      return;
    }
    let times = (teeTimesData[rnd] || []);
    if (!times.some(t => t)) times = rowsToTeeTimes(onServer)[rnd] || times;
    const rows = [];
    groups.forEach((grp, gi) => {
      grp.forEach(pid => {
        rows.push({ id: docIds.pairing(_e(), rnd, gi + 1, pid), tournament_id: TOURNAMENT_ID, round_number: rnd, group_number: gi + 1, player_id: pid, tee_time: times[gi] || null });
      });
    });
    const keep = new Set(rows.map(r => r.id));
    const stale = onServer.map(r => r.id).filter(id => id && !keep.has(id));
    await db.replaceMany("pairings", rows, stale);
    notify(`Round ${rnd} pairings saved`);
  };

  const setTee = async (rnd, pid, teeName) => {
    setTeeData(prev => ({ ...prev, [rnd]: { ...(prev[rnd] || {}), [pid]: teeName } }));
    await db.upsert("tee_assignments", { id: docIds.teeAssignment(_e(), rnd, pid), tournament_id: TOURNAMENT_ID, round_number: rnd, player_id: pid, tee_name: teeName }, "id");
  };

  const setTeeBulk = async (rnd, assignments) => {
    setTeeData(prev => ({ ...prev, [rnd]: { ...(prev[rnd] || {}), ...assignments } }));
    const rows = Object.entries(assignments).map(([pid, teeName]) => ({ id: docIds.teeAssignment(_e(), rnd, pid), tournament_id: TOURNAMENT_ID, round_number: rnd, player_id: pid, tee_name: teeName }));
    await db.upsertMany("tee_assignments", rows);
  };

  // ── LOGIN ──
  // The roster-tile + per-player-PIN screen that used to live here is gone.
  // It checked a password stored per player, in the client, out of a document
  // any phone could read — which is to say it was a doorman, not a lock, and
  // it also meant Admin had to hand out and keep track of twelve of them.
  //
  // Getting in is now: sign in with Google or Apple, type the ONE event
  // password (GateScreen, checked by firestore.rules against a secret no
  // client can read), then claim your name off the roster. The event password
  // is set in Admin → Event.

  // Check if any round needs admin finalization
  const adminActionNeeded = useMemo(() => {
    for (let r = 1; r <= numRounds; r++) {
      if (finalizedRounds[r]) continue;
      const tr = tRounds.find(t => t.round_number === r);
      if (!tr) continue;
      // A player with no tee for a round that is being treated as ready.
      //
      // Gated on the round having been signed off OR already carrying scores,
      // rather than on the assignment simply being absent: before setup nobody
      // has a tee and a dot that is red from the moment an edition is created
      // is a dot nobody looks at. Once the director has saved the tees — or
      // once a card is being posted against them — a missing one is a fault,
      // and this is the only place in the app that says so without opening
      // Admin first.
      const course = courseList.find(c => c.id === tr.course_id);
      if (course) {
        const settled = !!teesSaved[r] || activePlayers.some(p => Object.keys(holeData[`${p.id}_${r}`] || {}).length > 0);
        if (settled && missingTees({
          players: activePlayers,
          assignments: teeData[r] || {},
          teeNames: (course.tee_boxes || []).map(t => t.name),
        }).length > 0) return true;
      }
      const allDone = activePlayers.length > 0 && activePlayers.every(p => {
        const wdTp = tPlayers.find(tp => tp.player_id === p.id);
        if (wdTp?.status === "WD") return true; // WD players count as done
        const scores = holeData[`${p.id}_${r}`] || {};
        for (let h = 0; h < 18; h++) { if (!(scores[h] > 0)) return false; }
        return true;
      });
      if (allDone) return true;
    }
    return false;
  }, [activePlayers, holeData, finalizedRounds, tRounds, tPlayers, numRounds, courseList, teeData, teesSaved]);

  // ── The ways in ──
  // Sign in → tournament password → claim a name, each skipped once it has
  // been answered, which for almost everybody means none of them appear again
  // after the first time.
  //
  // The password screen appears on a DEFINITIVE no (member === false), never
  // while the answer is still in flight. That ordering is the whole point: a
  // returning player whose session restored from localStorage renders the app
  // immediately and the door resolves behind them, so a slow read on the first
  // tee never puts a signed-in player back on a login screen. If the door then
  // says no — a revoked membership, or a first sign-in — this appears a beat
  // later, which beats an app that looks like it works and silently fails
  // every write.
  if (fbUser && member === false) {
    return (
      <GateScreen
        fbUser={fbUser}
        onCancel={handleLogout}
        onPassed={async () => {
          // Re-read rather than assume: the membership document that was just
          // created is also where Admin access is read from, and a director
          // flag set in the console before the first sign-in would be missed
          // by a locally-invented one.
          const { doc: m } = await loadMembership(fbUser.uid);
          setMembershipAnswer({ uid: fbUser.uid, doc: m || { uid: fbUser.uid } });
        }}
      />
    );
  }

  // ── Nothing between here and the tournament may be the sign-in screen ──
  // Two gaps, one rule. Switching editions clears the stored player session on
  // purpose (see switchEdition) and reloads, so the app comes back up with no
  // player and no Firebase user yet — Auth restores itself from IndexedDB a
  // few hundred milliseconds later. Then, once it answers, there is a second
  // wait while the membership and the uid→player claim land.
  //
  // The render fell through to the sign-in screen in BOTH: first for the
  // length of the auth restore, and then — after that was fixed — for the
  // single frame between the membership answer and the effect that resolves
  // the player, which is what a recording of an edition switch caught.
  //
  // Held only where an answer is actually coming: a device that has signed in
  // before, or an account already in hand. A first-time visitor still gets the
  // sign-in screen on the first frame rather than a pulsing logo. See
  // lib/authHold, and note the claim screen is checked below — the hold gets
  // out of the way of the one question this flow does need to ask.
  // The pulsing mark shown while an answer is on its way. Named because it is
  // used twice: by the hold below, and as the fallback the claim screen shows
  // while its chunk arrives — which is the same wait, so it should not look
  // like a different one.
  const authHoldScreen = (
      <div style={{ minHeight: "var(--app-height, 100dvh)", background: entranceBg(), display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <img src={WBC_LOGO} alt="WBC" style={{ height: 72, opacity: 0.85, animation: "pulse 1.5s ease-in-out infinite", filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
        <style>{`@keyframes pulse { 0%,100% { opacity: 0.85; } 50% { opacity: 0.4; } }`}</style>
      </div>
  );

  if (holdForAuth({
    user,
    authKnown: fbUser !== undefined,
    hadSession: hadAuthSession(),
    signedIn: !!fbUser,
    needsClaim: claimState?.status === "needs-claim",
  })) {
    return authHoldScreen;
  }

  // A signed-in Firebase user with no resolved player takes precedence over the
  // login screen so they can pick their profile even before any app `user` is set.
  if (claimState?.status === "needs-claim") {
    return (
      <Suspense fallback={authHoldScreen}>
      <ClaimScreen
        fbUser={fbUser}
        candidates={claimState.candidates}
        busyId={claimBusyId}
        // A director writes through a lock, so the notice is not for them —
        // it would be telling somebody the door is shut while they are
        // holding the key. See canWriteEdition in firestore.rules.
        locked={(isEditionLocked(activeEdition) || editionClosed) && !isDirectorAccount(membership)}
        tournamentName={tournamentName}
        onClaim={(p) => { setClaimBusyId(p.id); claimProfile(fbUser, p, "manual"); }}
        onCancel={handleLogout}
      />
      </Suspense>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "var(--app-height, 100dvh)", background: entranceBg(), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", padding: 20 }}>
      <style>{`:root { --sab: env(safe-area-inset-bottom, 0px); }`}</style>
      {/* No font <link> here. index.html declares @font-face for the app font
          from this origin, so every screen — this one included, and every modal
          portaled out of it — already has it. A screen re-declaring it put the
          request back on fonts.googleapis.com and undid that. */}
        <style>{`
          @keyframes toastDown { 0% { transform: translateX(-50%) translateY(-20px); opacity: 0; } 100% { transform: translateX(-50%) translateY(0); opacity: 1; } }
          /* Same drop-in for a full-width bar, which holds no centring
             transform of its own to carry through the keyframe. */
          @keyframes toastDownBar { 0% { transform: translateY(-20px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
          @keyframes finalizeGlow { 0%,100% { box-shadow: 0 0 4px rgba(212,168,67,0.2); } 50% { box-shadow: 0 0 14px rgba(212,168,67,0.5); } }
          @keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.2; } }
        `}</style>

        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ width: 80, height: 100, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={WBC_LOGO} alt="WBC" style={{ height: 90, filter: "drop-shadow(0 4px 16px rgba(34,211,167,0.3))" }} />
          </div>
          <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontSize: FS.display, color: K.t1, margin: "0 0 4px", fontWeight: 800, letterSpacing: "-0.03em" }}>{tournamentName}</h1>
          <p style={{ color: K.t2, fontSize: FS.body, margin: "0 0 32px" }}>Wannabes. For Life.</p>

            <div>
              <p style={{ color: K.t3, fontSize: FS.label, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, margin: "0 0 12px" }}>Sign in</p>
              {/* ── Said in the installed app, and only there ──
                  Adding WBC to the home screen makes a SEPARATE app as far as
                  iOS is concerned: its own cookies, its own storage, and
                  therefore its own sign-in. Somebody who signed in on
                  wannabecup.com in Safari and then tapped the new icon is
                  looking at this screen for that reason and no other, and
                  everything of his — his membership, the name he claimed —
                  comes straight back the moment he signs in again.
                  The reason to say it is the fork in the next second: the two
                  buttons below are two different accounts, so reaching for the
                  other one because "Apple didn't work last time" arrives as a
                  stranger, on a roster his own name has already gone from. */}
              {isStandalonePWA() && (
                <p style={{ color: K.t3, fontSize: FS.label, fontWeight: 500, lineHeight: 1.45, margin: "-4px 0 12px" }}>
                  The home-screen app signs in separately. Use the same button you used on the website — the other makes a second account.
                </p>
              )}
              <button onClick={handleGoogleSignIn} style={{ width: "100%", padding: "13px 0", borderRadius: R.lg, background: "#fff", border: "none", color: "#1f1f1f", fontSize: FS.body, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Sign in with Google
              </button>
              {APPLE_PROVIDER_ENABLED && !isAndroidNative() && (!isNativePlatform() || NATIVE_APPLE_ENABLED) && (
                <button onClick={handleAppleSignIn} style={{ width: "100%", marginTop: 10, padding: "13px 0", borderRadius: R.lg, background: "#000", border: "none", color: "#fff", fontSize: FS.body, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <svg width="16" height="18" viewBox="0 0 384 512" aria-hidden="true" fill="#fff"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
                  Sign in with Apple
                </button>
              )}
              {authMsg && <div style={{ color: K.danger, fontSize: FS.small, fontWeight: 600, marginTop: 10 }}>{authMsg}</div>}
            </div>
          {(() => { const roundIsActive = Object.keys(holeData).some(key => { const parts = key.split("_"); const rnd = parseInt(parts[parts.length - 1]); return !finalizedRounds[rnd] && Object.keys(holeData[key] || {}).length > 0; }); const btnColor = roundIsActive ? K.acc : K.t2; const btnBorder = roundIsActive ? `1px solid ${K.acc}${ALPHA.hair}` : `1px solid ${K.bdr}`; return (<div style={{ marginTop: 24, borderTop: `1px solid ${K.bdr}${ALPHA.hair}`, paddingTop: 20 }}><button onClick={() => { setView("leaderboard"); setUser(guestUser()); }} style={{ width: "100%", padding: "13px 0", borderRadius: R.lg, background: "transparent", border: btnBorder, color: btnColor, fontSize: FS.body, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, letterSpacing: "0.02em" }} onMouseEnter={e => { e.currentTarget.style.background = btnColor  + ALPHA.wash; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{roundIsActive && <span style={{ width: 7, height: 7, borderRadius: "50%", background: K.acc, display: "inline-block", boxShadow: `0 0 6px ${K.acc}` }} />}<img src="/wbc-trophy.webp" alt="" style={{ height: 18, width: "auto", objectFit: "contain", filter: roundIsActive ? "none" : "brightness(0) invert(0.6)" }} />Live Leaderboard</button>
            {/* Said out loud, because the button no longer opens only a board.
                A guest gets every screen a player gets and can change none of
                them — which is the whole answer for a store reviewer or a beta
                tester, neither of whom has a password or a name on the roster,
                and it is what makes the button worth tapping for the spouse who
                only wanted the score. */}
            <div style={{ color: K.t3, fontSize: FS.label, fontWeight: 500, marginTop: 8, lineHeight: 1.4 }}>
              No account needed — browse the whole app, read-only.
            </div></div>); })()}
        </div>
      </div>
    );
  }
  // A guest used to get its own render branch here: the leaderboard, a header
  // and nothing else. It is gone, and a guest now falls through into the app
  // proper — same tabs, same screens, same pairings and betting and photos —
  // because the board alone was never the thing somebody with no account needed
  // to see. A store reviewer or a beta tester has to be able to MOVE around the
  // app to have looked at it, and none of them can be handed the event password
  // or a name off a roster of sixteen.
  //
  // What keeps that safe is not this screen: it is lib/guestMode's latch on the
  // data layer, and behind that firestore.rules, which refuses every write from
  // an account that has no membership — and a guest has no account at all.

  // ── MAIN ──
  // How far the bar's contents sit above the bottom of the screen.
  //
  // This was a bare safe-area inset, which is 0 on any device WITHOUT a home
  // indicator — every home-button iPhone and iPad. There the icons sat flush
  // on the physical edge, and a tap that landed slightly low hit the home
  // button instead of the button on screen: on those devices a held home
  // button is Siri, so a sloppy tap on the raised Board trophy opened Siri.
  //
  // So: a real floor for the devices with no inset, and a few px ON TOP of
  // the inset for the ones that have it, since the same slip is merely less
  // likely there rather than impossible.
  const NAV_BOTTOM_PAD = "max(16px, calc(env(safe-area-inset-bottom, 0px) + 6px))";

  // ── The nudge on the Betting tab ───────────────────────────────────
  // A red dot while YOU still have opening shares unplaced and the bell has
  // not rung. Unplaced shares are not a smaller bet — they are no bet at all
  // on those shares — and the window shuts on a clock, so the only thing
  // between a man who meant to finish his book and a wasted buy-in is being
  // told. It goes quiet the moment the book is full or the field tees off,
  // because after that there is nothing he can do about it.
  const marketNudge = (() => {
    if (!user || user.isGuest) return false;
    const ids = sideGames?.market?.in;
    if (ids != null && !ids.includes(user.id)) return false;
    if (openingSharesLeft(marketBets, user.id) === 0) return false;
    return marketWindows({
      holeData, players: allPlayers, numRounds, firstTeeAt, now: Date.now(),
    }).opening.open;
  })();

  const navItems = [
    { key: "groups", label: "Pairings", icon: "pairings" },
    { key: "scoring", label: "Scoring", icon: "score" },
    { key: "leaderboard", label: "Board", icon: "trophy" },
    { key: "skins", label: "Betting", icon: "betting" },
    // "More" rather than "Admin": the slot now opens a menu holding
    // everything that isn't the event — the director console, notifications
    // and the account — instead of being one of those three things and
    // leaving the other two scattered. See components/MoreMenu.
    { key: "more", label: "More", icon: "more" },
  ];

  return (
    <div style={{ minHeight: "var(--app-height, 100dvh)", background: "#030810", display: "flex", justifyContent: "center", overflow: "hidden" }}>
    <div style={{ height: "var(--app-height, 100dvh)", display: "flex", flexDirection: "column", background: K.bg, fontFamily: "'Montserrat', sans-serif", fontVariantNumeric: "lining-nums tabular-nums", color: K.t1, width: "100%", maxWidth: 480, position: "relative", boxShadow: "0 0 80px rgba(0,0,0,0.8)", flexShrink: 0, overflow: "hidden" }}>
      <style>{`:root { --sab: env(safe-area-inset-bottom, 0px); }`}</style>

      {/* Every notify() in the app lands here. It used to render only in the
          admin settings modal's header, so a message raised anywhere else —
          or from admin once that modal closed — was set and never shown. */}
      <Toast message={notif} />

      {/* "This phone is on its own." Renders nothing at all unless it has
          something to say — see components/SyncBanner. */}
      <SyncBanner status={syncStatus} />

      {/* ── The first-login notifications ask ──
          Raised over whatever the player landed on, once, and never again on
          this device. See lib/notificationPrompt for the decision and
          components/NotificationPrompt for why the button matters. */}
      {pushPrompt && (
        <NotificationPrompt onEnable={enablePushFromPrompt} onDismiss={closePushPrompt} />
      )}

      {/* ── The guest strip ──
          A guest can tap anything, and what they tap moves on their screen and
          nowhere else. That has to be SAID: a tester who types a score, watches
          the board move and then reloads to find it gone would file a bug, and
          the honest answer — "you were never signed in" — is not something a
          screen can leave to be inferred. It carries the way out too, since a
          guest has no account sheet worth opening for one button. */}
      {isGuest(user) && (
        /* `data-guest-strip` is a handle, not a style. scripts/screenshots.mjs
           captures in guest mode — Google refuses OAuth inside an
           automation-controlled browser, so signing the script in is not
           available — and this banner is the one thing on screen a real player
           never sees. Hiding it by a stable attribute is honest and durable;
           hunting for the element by its own text would break the day the
           wording changes, and silently. */
        <div data-guest-strip style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 20px", background: K.warn + ALPHA.wash, borderBottom: `1px solid ${K.warn}${ALPHA.hair}` }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: FS.label, fontWeight: 600, color: K.warn, lineHeight: 1.4 }}>{GUEST_NOTICE}</span>
          <button onClick={handleLogout} style={{ flexShrink: 0, background: "transparent", border: `1px solid ${K.warn}${ALPHA.line}`, borderRadius: R.sm, color: K.warn, fontSize: FS.label, fontWeight: 700, padding: "4px 12px", cursor: "pointer" }}>Exit</button>
        </div>
      )}

      {/* ── The frozen-year strip ──
          Same reasoning as the guest strip above it, and the same failure it
          prevents: a write that will never land has to say so BEFORE somebody
          spends a round typing into it. A locked edition refuses members in
          firestore.rules, so this is not the enforcement — it is the only
          place the enforcement is visible.

          Not shown to a director, who is exempt and would be reading a wall
          that is not there for them, and not to a guest, who already has a
          louder strip saying nothing they do is saved. */}
      {!isGuest(user) && lockNotice(activeEdition, { isDirector: !!user.isDirector, finished: editionClosed }) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 20px", background: K.t3 + ALPHA.wash, borderBottom: `1px solid ${K.t3}${ALPHA.hair}` }}>
          <span aria-hidden style={{ flexShrink: 0, fontSize: FS.label }}>🔒</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: FS.label, fontWeight: 600, color: K.t2, lineHeight: 1.4 }}>
            {lockNotice(activeEdition, { isDirector: !!user.isDirector, finished: editionClosed })}
          </span>
        </div>
      )}

      {/* Pull-to-refresh indicator. The app logo (golfer) as a MASK rather
          than an <img>, the same technique the nav uses, so the silhouette can
          be tinted and rotated cleanly — the PNG's alpha channel is what gets
          masked, and its background is fully transparent. Opacity ramps with
          the pull, and the ring lights up
          at the threshold — the two signals that tell you it will fire before
          you let go. position:fixed at top:0, so it clears the status bar /
          island itself via the safe-area inset. */}
      {pullY > 0 && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 999,
          display: "flex", justifyContent: "center",
          paddingTop: `calc(env(safe-area-inset-top, 0px) + ${Math.min(pullY, 100) - 20}px)`,
          transition: pullRefreshing ? "all .3s" : "none",
          pointerEvents: "none",
        }}>
          <style>{`
            @keyframes wbcPullSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes wbcPullGlow { 0%,100% { box-shadow: 0 0 8px ${K.acc}${ALPHA.line}; } 50% { box-shadow: 0 0 18px ${K.acc}${ALPHA.panel}; } }
          `}</style>
          <div style={{
            width: 44, height: 44, borderRadius: "50%", background: K.card,
            border: `2.5px solid ${pullY >= PULL_THRESHOLD ? K.acc : K.bdr}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: pullY >= PULL_THRESHOLD ? `0 0 12px ${K.acc}${ALPHA.line}` : `0 2px 12px ${SHADOW}`,
            transition: `border-color ${MOTION}, box-shadow ${MOTION}`, overflow: "hidden",
            animation: pullRefreshing ? "wbcPullGlow 1s ease-in-out infinite" : "none",
          }}>
            <div style={{
              // 32 not 26: the logo PNG carries ~19% transparent padding on
              // each side, so the golfer itself lands at roughly the size the
              // trophy SVG used to occupy. Still clears the 39px inner circle.
              width: 32, height: 32, background: K.acc,
              WebkitMask: `url("${WBC_LOGO}") center/contain no-repeat`,
              mask: `url("${WBC_LOGO}") center/contain no-repeat`,
              opacity: pullY >= PULL_THRESHOLD ? 1 : 0.3 + (pullY / PULL_THRESHOLD) * 0.7,
              transform: pullRefreshing ? "none" : `rotate(${pullY * 3}deg)`,
              animation: pullRefreshing ? "wbcPullSpin .8s linear infinite" : "none",
              transition: pullRefreshing ? "none" : "opacity .2s",
            }} />
          </div>
        </div>
      )}

      <AppHeader
        location={tournamentLocation}
        /* The director's crown — components/GroupSwitcher. Only on the
           Scoring tab, because that is the screen it points; only for a
           director, because the flag it reads is the same one the security
           rules check; and only when there is more than one group to point
           at, since with one it would be a control that changes nothing.
           Up here it costs the scoring screen nothing at all — not a row,
           not a corner of one. */
        countdownAt={firstTeeAt}
        right={user.isDirector && view === "scoring" && switchableGroupList.length > 1 && (
          <GroupSwitcher
            groups={switchableGroupList}
            currentKey={scoringGroup ? groupKeyOf(scoringGroup.round, scoringGroup.ids) : null}
            live={liveRound(finalizedRounds, numRounds)}
            nameOf={pid => allPlayers.find(p => p.id === pid)?.name || pid}
            progressOf={g => groupProgress(g.round, g.ids, holeData, finalizedRounds)}
            onPick={g => {
              pickSeq.current += 1;
              setDirectorPick({ seq: pickSeq.current, round: g.round, ids: g.ids });
              setRound(g.round);
            }}
          />
        )}
      />

      <MoreMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isDirector={canAdminHere}
        isGuest={isGuest(user)}
        adminFlag={adminActionNeeded && user.isDirector}
        notifFlag={notifPerm !== "granted" && !user.isGuest}
        activeYear={getTournamentYear()}
        navH={navH}
        onSelect={(key) => {
          if (key === "admin") { setView("admin"); return; }
          if (key === "players") { setView("players"); return; }
          if (key === "photos") { setView("photos"); return; }
          if (key === "editions") { setEditionsOpen(true); return; }
          if (key === "account") { setDeleteErr(""); setDeleteStage(null); setAccountOpen(true); }
        }}
      />

      {/* Tournaments — the years, off the More menu. Open to everybody
          (reading a past year is what the entry is for, and firestore.rules
          allows the read to any member); only a director gets the New-year
          form, the status pill and the delete. */}
      {/* Mounted only while open. The component already returns null when it
          is not (see the guard at the top of it), but a `lazy` one still
          fetches its chunk the moment it is mounted — so rendering it always
          would have undone the deferral. Warmed on the menu open above, which
          is the only way in, so the fallback below is a formality: null rather
          than a spinner, because a flash of "loading" inside a sheet that is
          itself animating in reads as a fault. */}
      {editionsOpen && (
        <Suspense fallback={null}>
          <EditionSwitcher
            open={editionsOpen}
            onClose={() => setEditionsOpen(false)}
            notify={notify}
            canManage={!!user.isDirector}
          />
        </Suspense>
      )}

      {/* Notifications, in their own sheet rather than a section buried inside
          Account. They are a menu entry now, so they need somewhere to land —
          and they are no longer rendered in the Account sheet, so a preference
          still has exactly one home. */}
      {accountOpen && (
        <div
          onClick={() => { if (deleteStage !== "working") closeAccount(); }}
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(3,8,16,0.72)", backdropFilter: "blur(2px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={e => e.stopPropagation()}
            {...accountDrag.handlers}
            style={{ width: "100%", maxWidth: 480, background: K.card, borderTop: `1px solid ${K.bdr}`, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: "0 20px calc(20px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -12px 40px rgba(0,0,0,0.6)",
              // Folding Notifications in here roughly tripled this sheet's
              // height, and a bottom sheet grows UPWARDS — so on a small phone
              // Delete account, the last thing in it, went off the top with no
              // way to reach it. Capped and scrollable.
              maxHeight: "calc(var(--app-height, 100dvh) - 40px)", overflowY: "auto",
              // Follows the finger on a swipe down, springs back on release
              // unless it went far enough — see lib/useSheetDrag. Left OFF at
              // rest rather than set to translateY(0): a transform of any value
              // makes this element the containing block for anything fixed
              // inside it, and this sheet is exactly the kind of place a modal
              // gets raised from.
              transform: accountDrag.dragY ? `translateY(${accountDrag.dragY}px)` : undefined,
              transition: accountDrag.dragY === 0 ? `transform ${MOTION} ease` : "none" }}
          >
            {/* Sticky, because both things in it are ways OUT of the sheet and
                this sheet scrolls: a ✕ that scrolls off the top is a close
                button you have to scroll back up to find, and the swipe only
                takes the gesture when the content is already at the top. The
                negative side margins let the background span the full width so
                the content passes underneath it rather than beside it. */}
            <div style={{ position: "sticky", top: 0, zIndex: 1, background: K.card, margin: "0 -20px", padding: "20px 20px 18px" }}>
              <div style={{ width: 38, height: 4, borderRadius: R.xs, background: K.bdr, margin: "0 auto" }} />
              {/* Hidden mid-deletion for the same reason the backdrop stops
                  dismissing: there is nothing to go back to yet. */}
              {deleteStage !== "working" && (
                <button onClick={closeAccount} aria-label="Close" style={{ position: "absolute", top: 5, right: 20, width: 32, height: 32, borderRadius: R.sm, border: `1px solid ${K.bdr}`, background: "transparent", color: K.t2, fontSize: FS.lead, cursor: "pointer", lineHeight: 1 }}>✕</button>
              )}
            </div>

            {deleteStage === null && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                  <div style={{ width: 42, height: 42, borderRadius: R.pill, background: `linear-gradient(135deg, ${K.acc}, ${K.accDim})`, display: "flex", alignItems: "center", justifyContent: "center", color: K.bg, fontWeight: 800, fontSize: FS.lead }}>
                    {(user.name || "?").trim().charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: FS.body, fontWeight: 700, color: K.t1 }}>{user.name}</div>
                    <div style={{ fontSize: FS.label, color: K.t3 }}>{user.isDirector ? "Tournament director" : isGuest(user) ? "Guest — read-only" : "Player"}</div>
                  </div>
                </div>

                {/* ── Appearance ── */}
                {/* The same row as the notifications switch directly below it,
                    down to the labelled card it sits on — the title changing
                    colour when it is on and the same Toggle. Two switches in
                    one sheet drawn two different ways read as two different
                    KINDS of setting, and a switch sitting loose on the sheet
                    while the one under it sits on a bordered card reads as the
                    loose one being part of the header. */}
                <SectionLabel>Appearance</SectionLabel>
                <Card>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: FS.body, fontWeight: 800, color: theme === "light" ? K.acc : K.t1 }}>
                        {theme === "light" ? "Light mode" : "Dark mode"}
                      </div>
                    </div>
                    <Toggle on={theme === "light"} label="Light mode"
                      onChange={() => pickTheme(theme === "light" ? "dark" : "light")} />
                  </div>
                </Card>

                {/* Notifications, in the sheet that is already about you.
                    It was a menu row of its own, which put "which of my devices
                    buzzes" a level up alongside the tournament itself — and
                    made My Account a screen with two buttons on it. */}
                {/* Not for a guest: every switch in here registers a push
                    token against a player id, and "guest" is not one. There is
                    nothing to notify them about and nobody to notify. */}
                {!isGuest(user) && (
                  <Suspense fallback={null}>
                    <NotificationSettings
                      user={user}
                      notify={notify}
                      onPermissionChange={setNotifPerm}
                    />
                  </Suspense>
                )}

                <div style={{ height: 1, background: K.bdr, margin: "18px 0 14px" }} />

                <Btn variant="secondary" block onClick={() => { setAccountOpen(false); handleLogout(); }}>
                  {isGuest(user) ? "Exit guest preview" : "Log out"}
                </Btn>

                {fbUser && (
                  <Btn variant="dangerOutline" block style={{ marginTop: 10 }} onClick={() => { setDeleteErr(""); setDeleteStage("confirm"); }}>
                    Delete account
                  </Btn>
                )}

                <div style={{ textAlign: "center", marginTop: 14 }}>
                  <a href="/privacy" target="_blank" rel="noopener" style={{ color: K.t3, fontSize: FS.label, textDecoration: "none" }}>Privacy Policy</a>
                </div>
              </>
            )}

            {(deleteStage === "confirm" || deleteStage === "working") && (
              <>
                <div style={{ fontSize: FS.lead, fontWeight: 800, color: K.t1, marginBottom: 10 }}>Delete your account?</div>
                <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.6, marginBottom: 12 }}>
                  This removes your login, your email address, and your notification settings. Your
                  historical tournament scores stay in the WBC record book as de-identified results,
                  no longer linked to you. This can't be undone.
                </div>
                <div style={{ fontSize: FS.label, color: K.t3, marginBottom: 16 }}>
                  Details in the <a href="/privacy" target="_blank" rel="noopener" style={{ color: K.t2 }}>Privacy Policy</a>.
                </div>

                {deleteErr && <div style={{ color: K.danger, fontSize: FS.small, fontWeight: 600, marginBottom: 12 }}>{deleteErr}</div>}

                <Btn
                  variant="danger" block
                  onClick={handleDeleteAccount}
                  disabled={deleteStage === "working"}
                >
                  {deleteStage === "working" ? "Deleting…" : "Permanently delete my account"}
                </Btn>
                <Btn
                  variant="secondary" block style={{ marginTop: 10, color: K.t2 }}
                  onClick={() => { if (deleteStage !== "working") { setDeleteStage(null); setDeleteErr(""); } }}
                  disabled={deleteStage === "working"}
                >
                  Cancel
                </Btn>
              </>
            )}
          </div>
        </div>
      )}

      {/* Players is a career record, not a round of this tournament — the
          round pills would be a control with nothing on the screen to steer.
          Photos is the same case from the other direction: the gallery carries
          its own round headings and shows every round at once, so a selector
          that picks one would contradict the screen under it. */}
      {view !== "admin" && view !== "scoring" && view !== "leaderboard" && view !== "players" && view !== "photos" && (
      <div style={{ display: "flex", gap: 6, padding: "10px 20px", borderBottom: `1px solid ${K.bdr}` }}>
        {Array.from({ length: NUM_ROUNDS }, (_, i) => i + 1).map(r => {
          const tr = tRounds.find(t => t.round_number === r);
          const c = tr ? courseList.find(cs => cs.id === tr.course_id) : null;
          return (
            <button key={r} onClick={() => setRound(r)} style={{
              flex: 1, padding: "8px 4px", fontSize: FS.small, fontWeight: round === r ? 700 : 500,
              color: round === r ? K.bg : K.t2,
              background: round === r ? `linear-gradient(135deg, ${K.acc}, ${K.accDim})` : K.card,
              border: `1px solid ${round === r ? "transparent" : K.bdr}`, borderRadius: R.sm, cursor: "pointer",
              lineHeight: 1.2,
            }}>
              <div>Rd {r}</div>
              {c && <div style={{ fontSize: FS.micro, opacity: 0.8, marginTop: 2, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3 }}>
                {c.name.replace(/^treetops\s*[–-]\s*/i, "").replace(/^(.*?)\s+GC$/i, "$1").replace(/^(.*?)\s+Golf\s+Club$/i, "$1")}
              </div>}
            </button>
          );
        })}
      </div>
      )}

      {/* Pairings joins the two views that lay out to the height they have
          rather than to the height of what is in them — the tab sizes its own
          type from that measurement, so it needs a floor to measure against. */}
      <div className="wbc-app-body" style={{ padding: (view === "leaderboard" || view === "admin") ? "14px 20px 0 20px" : "14px 20px", flex: 1, overflowY: "auto", overflowX: "hidden", display: (view === "leaderboard" || view === "admin" || view === "groups") ? "flex" : "block", flexDirection: "column", minHeight: 0, paddingBottom: (view === "leaderboard" || view === "admin") ? "28px" : 0 }}>
        {view === "leaderboard" && <LeaderboardView lb={getLeaderboard} round={round} holeData={holeData} tRounds={tRounds} courses={courseList} tPlayers={tPlayers} getPlayerTee={getPlayerTee} getPlayerCH={getPlayerCH} finalizedRounds={finalizedRounds} skinWins={skinWins} pairingsData={pairingsData} teeTimesData={teeTimesData} loaded={storageLoaded} />}
        {scoringOpened && (
        <div style={{ display: view === "scoring" ? "block" : "none", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: FS.small }}>Loading scoring…</div>}>
          <OnCourseScoring user={user} players={allPlayers} round={round} tRounds={tRounds} courses={courseList} holeData={holeData} tPlayers={tPlayers} onSaveHole={onSaveHole} notify={notify} pairingsData={pairingsData} teeTimesData={teeTimesData} roundDates={roundDates} scoringOpen={scoringOpen} setTee={setTee} getPlayerTee={getPlayerTee} getPlayerCH={getPlayerCH} finalizedRounds={finalizedRounds} scorecardSigs={scorecardSigs} onSignScorecard={onSignScorecard} onAttestScorecard={onAttestScorecard} onUnsignScorecard={onUnsignScorecard} onFinalizeRound={finalizeGroup} onUnfinalizeRound={onUnfinalizeGroup} onGoToAdminCourses={(rnd) => { setView("admin"); setAdminSettingsOpen(true); setAdminSettingsTab("course"); setAdminSettingsRound(rnd || null); }} markPlayerWD={markPlayerWD} ctpData={ctpData} onSetCtp={onSetCtp} onConfirmCtp={onConfirmCtp} directorPick={directorPick} onGroupChange={setScoringGroup} onSetRound={setRound} />
          </Suspense>
        </div>
        )}
        {view === "players" && <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: FS.small }}>Loading players…</div>}><PlayersView players={allPlayers} registry={registry} meId={user?.id} year={getTournamentYear()} isDirector={!!user.isDirector} onSetOverride={setIndexOverride} /></Suspense>}
        {/* Posting requires a real account: firestore.rules pins uploadedBy to
            the caller's uid, so a guest — who has no uid at all — could never
            have added to the library. It is not shown one either: the menu row
            is gone for a guest (components/MoreMenu), and this is the door that
            row is not the only way through. `view` survives a logout — it lives
            on the app shell, which never unmounts — so a player who was in the
            gallery when they logged out would otherwise hand the next guest the
            screen they left open. */}
        {view === "photos" && !isGuest(user) && <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: FS.small }}>Loading photos…</div>}><PhotosView items={media} year={getTournamentYear()} uid={fbUser?.uid || null} isDirector={!!user.isDirector} isGuest={!!user.isGuest} canPost={!user.isGuest && !!fbUser?.uid && photoUploadsAllowed(photoConfig)} uploadsBlockedReason={photoUploadsAllowed(photoConfig) ? "" : uploadsDisabledReason(photoConfig)} onUpload={onUploadPhoto} onDelete={onDeletePhoto} notify={notify} /></Suspense>}
        {view === "skins" && <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: FS.small }}>Loading betting…</div>}><BettingView players={allPlayers} round={round} tRounds={tRounds} courses={courseList} holeData={holeData} ctpData={ctpData} onSetCtp={onSetCtp} user={user} numRounds={numRounds} getPlayerTee={getPlayerTee} getPlayerCH={getPlayerCH} sideGames={sideGames} onUpdateSideGames={onUpdateSideGames} marketBets={marketBets} onSaveMarketBet={onSaveMarketBet} leaderboard={getLeaderboard} finalizedRounds={finalizedRounds} pairingsData={pairingsData} firstTeeAt={firstTeeAt} marketNudge={marketNudge} teeTimesData={teeTimesData} roundDates={roundDates} inactivePlayers={inactivePlayers} onAddMarketOutsider={user.isDirector ? onAddMarketOutsider : undefined} /></Suspense>}
        {view === "groups" && <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: FS.small }}>Loading pairings…</div>}><GroupsView players={activePlayers} round={round} tRounds={tRounds} courses={courseList} pairingsData={pairingsData} teeTimesData={teeTimesData} getPlayerTee={getPlayerTee} user={user} /></Suspense>}
        {view === "admin" && (canAdminHere ? <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: K.t3, fontSize: FS.small }}>Loading admin…</div>}><AdminView registry={registry} activePlayers={activePlayers} marketPool={marketPool} sideGames={sideGames} onUpdateSideGames={onUpdateSideGames} rebuyIds={rebuyIds} tournament={TOURNAMENT} tPlayers={tPlayers} tRounds={tRounds} courses={courseList} setCourseForRound={setCourseForRound} addCourse={addCourse} addPlayerToTournament={addPlayerToTournament} updateHI={updateHI} updateName={updateName} removePlayer={removePlayer} deletePlayer={deletePlayer} editionsHolding={editionsHolding} pairingsData={pairingsData} setPairings={setPairings} teeData={teeData} setTeeBulk={setTeeBulk} teeTimesData={teeTimesData} setTeeTimesData={async (updater) => {
              setTeeTimesData(prev => {
                const next = typeof updater === "function" ? updater(prev) : updater;
                // THE SHEET IS SAVED FIRST, and on its own document. Tee times
                // used to be written only onto pairing rows, so a time typed
                // against a group with nobody in it produced no rows and was
                // never stored at all — it sat in React state looking saved
                // until the next thing that rebuilt state from the server took
                // it away. A tee sheet is normally filled in BEFORE the draw,
                // which is exactly when there are no rows to carry it.
                saveTournamentState(finalizedRounds, undefined, undefined, undefined, undefined, undefined, next);
                // The rows keep their copy, because the scoring gate reads a
                // group's tee time off the row. One commit for all of them.
                const rows = [];
                Object.keys(next).forEach(rnd => {
                  (pairingsData[rnd] || []).forEach((grp, gi) => {
                    const teeTime = (next[rnd] || [])[gi] || null;
                    grp.forEach(pid => rows.push({
                      id: docIds.pairing(_e(), rnd, gi + 1, pid), tournament_id: TOURNAMENT_ID,
                      round_number: parseInt(rnd), group_number: gi + 1, player_id: pid, tee_time: teeTime,
                    }));
                  });
                });
                if (rows.length) db.upsertMany("pairings", rows);
                return next;
              });
            }} roundDates={roundDates} onSetRoundDate={async (rnd, dateStr) => { const next = { ...roundDates }; if (dateStr) next[rnd] = dateStr; else delete next[rnd]; setRoundDates(next); await saveTournamentState(finalizedRounds, teesSaved, teesModified, next, scoringOpen); }} scoringOpen={scoringOpen} onSetScoringOpen={async (rnd, open) => { const next = { ...scoringOpen }; if (open) next[rnd] = true; else delete next[rnd]; setScoringOpen(next); await saveTournamentState(finalizedRounds, teesSaved, teesModified, roundDates, next); }} pairingStrategy={pairingStrategy} onSetPairingStrategy={async (rnd, cfg) => { const next = { ...pairingStrategy }; if (cfg) next[rnd] = cfg; else delete next[rnd]; setPairingStrategy(next); await saveTournamentState(finalizedRounds, teesSaved, teesModified, roundDates, scoringOpen, next); }} leaderboard={getLeaderboard} holeData={holeData} finalizedRounds={finalizedRounds} onDiscardRoundScores={onDiscardRoundScores} onFinalizeRound={finalizeWholeRound} onUnfinalizeRound={unfinalizeFromAdmin} notify={notify} getPlayerTee={getPlayerTee} startFresh={startFresh} externalSettingsOpen={adminSettingsOpen} externalSettingsTab={adminSettingsTab} externalSettingsRound={adminSettingsRound} onExternalSettingsHandled={() => { setAdminSettingsOpen(false); setAdminSettingsTab("players"); setAdminSettingsRound(null); }} teesSaved={teesSaved} onTeesSave={async r => { const next = { ...teesSaved, [r]: true }; const nextMod = { ...teesModified, [r]: false }; setTeesSaved(next); setTeesModified(nextMod); await saveTournamentState(finalizedRounds, next, nextMod); }} teesModified={teesModified} onTeesModify={async r => { const nextMod = { ...teesModified, [r]: true }; setTeesModified(nextMod); await saveTournamentState(finalizedRounds, teesSaved, nextMod); }} memberships={memberships} onSetDirector={onSetDirector} claims={claims} authUid={fbUser?.uid || null} tournamentMeta={tournamentMeta} onSaveTournamentMeta={saveTournamentMeta} demoOnly={sandboxAdmin} /></Suspense> : (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ fontSize: FS.jumbo, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1 }}>Directors Only</div>
          </div>
        ))}
      </div>

      {/* The nav's box holds the way home as well as the tabs. Inside it
          rather than above it, so `navH` measures both — the More menu is
          seated on that measurement, and a sibling row would end up under it. */}
      <div ref={navRef} style={{ display: "flex", flexDirection: "column", background: K.nav, borderTop: `1px solid ${K.bdr}`, zIndex: 100, paddingBottom: NAV_BOTTOM_PAD, flexShrink: 0 }}>
        <EditionBanner viewingId={getActiveTournamentId()} liveId={liveTournamentId} />
        {/* zIndex so the trophy, which rises out of this row, paints over the
            banner rather than under it. */}
        <div style={{ display: "flex", position: "relative", zIndex: 1 }}>
        {navItems.map(item => {
          // More reads active while its menu is open OR while one of the views
          // it leads to (Admin, Players) is the one on screen — otherwise
          // opening either would leave the whole bar looking unselected.
          const active = item.key === "more" ? (menuOpen || view === "admin" || view === "players" || view === "photos") : view === item.key;
          const clr = active ? K.acc : K.t3;
          const iconSz = 18;
          const navIcon = () => {
            if (item.icon === "trophy") return <img src="/wbc-trophy.webp" alt="" style={{ width: 54, height: 54, objectFit: "contain", filter: active ? "none" : "brightness(0) saturate(100%) invert(40%) sepia(20%) saturate(600%) hue-rotate(185deg) brightness(90%)", marginTop: "-20px" }} />;
            if (item.icon === "pairings") return <svg aria-hidden="true" width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M21 21v-2a3 3 0 00-2-2.83"/></svg>;
            if (item.icon === "score") return <svg aria-hidden="true" width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>;
            if (item.icon === "betting") return <svg aria-hidden="true" width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
            if (item.icon === "more") return <svg aria-hidden="true" width={iconSz} height={iconSz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>;
            return null;
          };
          const isTrophy = item.key === "leaderboard";
          return (
            <button key={item.key} onClick={() => {
              // The only nav item that is not a destination.
              if (item.key === "more") { setMenuOpen(o => !o); return; }
              if (item.key === "scoring") {
                // Find the correct active round: first after consecutive finalized rounds
                let activeRound = 1;
                for (let i = 1; i <= NUM_ROUNDS; i++) {
                  if (finalizedRounds[i]) { activeRound = i + 1; } else { break; }
                }
                activeRound = Math.min(activeRound, NUM_ROUNDS);
                // Only call setRound if we actually need to change it — avoids
                // triggering the group/hole reset chain unnecessarily
                setRound(prev => prev === activeRound ? prev : activeRound);
              }
              setView(item.key);
            }}
            // The trophy tab draws no text label, so without this it is a
            // button with nothing in it but an image — "button" is all a
            // screen reader could announce. The others carry a visible label
            // and naming them again would say it twice.
            aria-label={isTrophy ? item.label : undefined}
            // `page` rather than `true`: these are destinations within the app,
            // which is what aria-current's page value is for.
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1, padding: "10px 4px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: "transparent", border: "none", cursor: "pointer", color: clr, position: "relative",
              marginTop: 0,
            }}>
              {isTrophy && !bannerUp && (
                // The dome the trophy sits in: a true 68px circle — equal
                // radii, so the arc is a circle and not a squashed ellipse —
                // with everything below the bar's top border clipped away.
                //
                // The circle is 34 tall but only rises 24, so its widest point
                // and the near-vertical sides beneath it fall 10px BELOW that
                // border and read as two stubs poking down past the top of the
                // bar. clip-path cuts the box off at exactly the border line,
                // taking those sides with it and leaving the arc untouched.
                <div style={{
                  position: "absolute", top: "-24px", left: "50%", transform: "translateX(-50%)",
                  width: 68, height: 34,
                  background: K.nav,
                  borderRadius: "34px 34px 0 0",
                  clipPath: "inset(0 0 10px 0)",
                  borderTop: `1px solid ${K.bdr}`,
                  borderLeft: `1px solid ${K.bdr}`,
                  borderRight: `1px solid ${K.bdr}`,
                  zIndex: -1,
                  pointerEvents: "none",
                }} />
              )}
              {navIcon()}
              {(item.key === "more"
                  ? ((adminActionNeeded && user.isDirector) || (notifPerm !== "granted" && !user.isGuest))
                  : item.key === "skins" && marketNudge) && (
                <span aria-hidden="true" style={{
                  position: "absolute", top: 6, right: "50%", marginRight: -14,
                  width: 8, height: 8, borderRadius: "50%", background: K.danger,
                  border: `2px solid ${K.nav}`,
                }} />
              )}
              <span style={{ fontSize: FS.micro, fontWeight: active ? 700 : 500, color: clr }}>{isTrophy ? "" : item.label}</span>
            </button>
          );
        })}
        </div>
      </div>
    </div>
    </div>
  );
}
