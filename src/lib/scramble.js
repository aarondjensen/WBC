// ══════════════════════════════════════════════════════════════════
//  scramble — the one-round team game that sits beside the tournament.
// ══════════════════════════════════════════════════════════════════
//
// The WBC's individual rounds are the tournament. The scramble is not: it is
// ONE round, three teams, and a single ball per team — so nothing about it
// belongs on the individual leaderboard, in the pairings draw, or in the
// finalize/sign path. It has its own setup screen, its own scoring screen and
// its own store, and none of them touch the four rounds.
//
// ── Where it is kept, and why it is not its own collection ────────
// The whole game is one small object on the edition's tournament_state
// document: a flag, a course, three rosters and three cards. That is 54
// numbers at its largest, and tournament_state is already a document every
// phone subscribes to and every member may write (see firestore.rules), so
// filing it there is one merge write per tap and NO new security rule — the
// catch-all at the bottom of the rules file denies any collection nobody has
// written one for, and widening that surface for 54 numbers would be the
// riskiest part of a feature that is otherwise entirely additive.
//
// Firestore's merge is deep for maps, which is what makes this safe with three
// teams scoring at once: a write of { scramble: { scores: { og: { 4: 5 } } } }
// leaves YG's and NG's cards alone. The ROSTERS are arrays for the opposite
// reason — an array is replaced wholesale, so taking somebody off a team
// actually takes them off it. Same rule the market lots follow; see lib/db.
//
// Everything here is pure. The screens are components/ScrambleSetup and
// components/ScrambleScoring.

// ── The three teams ──
// Labels only. OG/YG/NG is what the tournament calls them and what the header
// button spells out; this file does not invent expansions for them.
export const SCRAMBLE_TEAMS = [
  { key: "og", label: "OG" },
  { key: "yg", label: "YG" },
  { key: "ng", label: "NG" },
];

export const SCRAMBLE_TEAM_KEYS = SCRAMBLE_TEAMS.map(t => t.key);

export const SCRAMBLE_HOLES = 18;

export const teamLabel = (key) => (SCRAMBLE_TEAMS.find(t => t.key === key) || {}).label || "";

// ── The stored shape, normalized ──
// Every reader goes through this rather than reaching into the raw document.
// The field is absent on every edition that has never opened the setup screen,
// half-present on one that has been through an older version of it, and a map
// where an array is expected the moment somebody edits the document by hand.
export function mergeScramble(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const teams = {};
  const scores = {};
  SCRAMBLE_TEAM_KEYS.forEach(key => {
    const roster = (src.teams || {})[key];
    teams[key] = Array.isArray(roster) ? roster.filter(Boolean) : [];
    const card = (src.scores || {})[key];
    scores[key] = card && typeof card === "object" ? { ...card } : {};
  });
  return {
    on: !!src.on,
    courseId: src.courseId || null,
    teams,
    scores,
  };
}

// ── Who is on which team ──
// One team per player: the roster edit below enforces it, and this returns the
// first hit so a document that somehow holds a player twice still answers.
export function teamOf(scramble, pid) {
  const { teams } = mergeScramble(scramble);
  return SCRAMBLE_TEAM_KEYS.find(key => teams[key].includes(pid)) || null;
}

// Three empty rosters — the Clear button, and the base every editor starts
// from.
export function emptyTeams() {
  const teams = {};
  SCRAMBLE_TEAM_KEYS.forEach(k => { teams[k] = []; });
  return teams;
}

// Move a player onto a team, or off every team when `key` is null. Returns a
// NEW rosters object; the player is removed from wherever they were first, so
// there is no path to being on two teams at once.
export function assignToTeam(teams, pid, key) {
  const base = mergeScramble({ teams }).teams;
  const next = {};
  SCRAMBLE_TEAM_KEYS.forEach(k => { next[k] = base[k].filter(id => id !== pid); });
  if (key && next[key]) next[key] = [...next[key], pid];
  return next;
}

// The players nobody has placed yet — the pool the setup screen deals from.
export function unassignedIds(players, teams) {
  const base = mergeScramble({ teams }).teams;
  const placed = new Set(SCRAMBLE_TEAM_KEYS.flatMap(k => base[k]));
  return (players || []).map(p => p.id).filter(id => !placed.has(id));
}

// A team's roster as player objects, in the order the director placed them.
// Ids with no player behind them (a roster edit after the teams were built)
// drop out rather than rendering as a blank chip.
export function teamPlayers(teams, key, players) {
  const base = mergeScramble({ teams }).teams;
  return (base[key] || []).map(id => (players || []).find(p => p.id === id)).filter(Boolean);
}

// ── Dealing the teams out ──
// A snake deal down the handicap order: best three across, then back the other
// way. Straight round-robin hands the first team the three lowest indexes,
// which is not a game. Ties keep the roster's own order, so the same roster
// always deals the same way — a director who taps this twice gets the same
// three teams rather than a reshuffle they have to inspect.
export function autoSplit(players) {
  const ordered = [...(players || [])].sort((a, b) =>
    (parseFloat(a.handicap_index) || 0) - (parseFloat(b.handicap_index) || 0));
  const teams = {};
  SCRAMBLE_TEAM_KEYS.forEach(k => { teams[k] = []; });
  const n = SCRAMBLE_TEAM_KEYS.length;
  ordered.forEach((p, i) => {
    const row = Math.floor(i / n);
    const col = i % n;
    const key = SCRAMBLE_TEAM_KEYS[row % 2 === 0 ? col : n - 1 - col];
    teams[key].push(p.id);
  });
  return teams;
}

// ── A team's card ──
// `scores` is the hole-indexed map for ONE team. A hole with no ball in yet is
// absent or 0, the same convention the individual cards use, so `> 0` is what
// counts as played everywhere in this file.
export function teamLine(scores, holePars) {
  const card = scores && typeof scores === "object" ? scores : {};
  const pars = Array.isArray(holePars) ? holePars : [];
  let total = 0;
  let parThru = 0;
  let thru = 0;
  for (let h = 0; h < SCRAMBLE_HOLES; h++) {
    const s = card[h];
    if (!(s > 0)) continue;
    thru += 1;
    total += s;
    parThru += pars[h] || 0;
  }
  return {
    thru,
    total,
    // Null rather than 0 on a card with nothing on it: a team that has not
    // teed off is not level par, and "E" beside three empty teams is the kind
    // of thing somebody reads as a result.
    toPar: thru > 0 ? total - parThru : null,
    complete: thru === SCRAMBLE_HOLES,
  };
}

// Every team's card, ranked. Teams that have not started sort last whatever
// the others are doing — they have no score to be ahead of anybody with.
export function scrambleStandings(scramble, holePars) {
  const sc = mergeScramble(scramble);
  const rows = SCRAMBLE_TEAMS.map(t => ({ ...t, ...teamLine(sc.scores[t.key], holePars) }));
  return rows.sort((a, b) => {
    if (a.thru === 0 && b.thru === 0) return 0;
    if (a.thru === 0) return 1;
    if (b.thru === 0) return -1;
    return a.toPar - b.toPar || b.thru - a.thru;
  });
}

// ── What is still missing before this can be switched on ──
// The switch is what puts the OG/YG/NG button in front of sixteen people, so
// it stays disabled until there is something behind it: a course to read pars
// off, and at least two teams with somebody on them. Returned as sentences
// because the setup screen prints them under the switch — a disabled control
// with no explanation is a bug report.
export function scrambleBlockers(scramble, players) {
  const sc = mergeScramble(scramble);
  const out = [];
  if (!sc.courseId) out.push("Pick the course the scramble is played on.");
  const manned = SCRAMBLE_TEAM_KEYS.filter(k => sc.teams[k].length > 0).length;
  if (manned < 2) out.push("Put players on at least two teams.");
  const left = unassignedIds(players, sc.teams).length;
  // Not a blocker — a director may well be running the scramble for twelve of
  // the sixteen — but it is the mistake worth naming before the switch is
  // thrown, because the men left out are the ones who cannot see their card.
  if (manned >= 2 && left > 0) out.push(`${left} player${left === 1 ? " is" : "s are"} not on a team yet.`);
  return out;
}

// Only the first two are reasons to keep the switch off; the leftover-players
// line is a warning that reads in the same list.
export function canTurnOn(scramble) {
  const sc = mergeScramble(scramble);
  if (!sc.courseId) return false;
  return SCRAMBLE_TEAM_KEYS.filter(k => sc.teams[k].length > 0).length >= 2;
}

// Whether the header button should be on screen at all.
export const scrambleLive = (scramble) => mergeScramble(scramble).on;

// ── Where the app opens on a scramble day ──────────────────────────
// The app opens on the leaderboard, which is right on all but one kind of
// day. A scramble is ONE round and it is only ever switched on while it is
// being played, so on that day the tab everybody wants is Scoring: they are
// standing on a tee box with a ball to post, not looking up a total.
//
// Three guards, and each of them is a way this could go wrong rather than a
// hypothetical:
//
//   FIRST SNAPSHOT ONLY. The scramble flag arrives over a subscription, so it
//   changes twice for two completely different reasons — once when the app
//   learns what is already true, and again when a director throws the switch
//   with sixteen phones in sixteen pockets. Only the first is a landing. The
//   second must move nobody: pulling a man off the card he is entering to show
//   him a screen he did not ask for is the worst thing this could do.
//
//   NOT OVER A DEEP LINK. A notification tap names the screen it wants. The
//   app is not entitled to overrule it.
//
//   NOT OVER A TAP. If the phone has already been pointed somewhere in the
//   beat before the snapshot landed, that is a person choosing, and it wins.
//
// `atBootView` is the caller's answer to the last of those — it knows what it
// opened on and where it is now.
export function opensOnScramble(scramble, { firstSnapshot = false, deepLinked = false, atBootView = false } = {}) {
  if (!firstSnapshot || deepLinked || !atBootView) return false;
  return scrambleLive(scramble);
}
