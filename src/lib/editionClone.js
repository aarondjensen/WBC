// ══════════════════════════════════════════════════════════════════
//  editionClone — what carries from one year to the next, and what
//  does not.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React. `editions.js` does the Firestore reads and
// writes; this file decides the SHAPE of every row it writes, which is the
// part that is worth a test. (editions.js imports firebase.js, which
// initializes an app at import time, so anything living there is untestable
// in a plain unit test — the same reason editionId.js exists.)
//
// The one rule behind every function here: a clone copies SETUP, never
// RESULTS. Scores, pairings, tee assignments, skins, CTPs, signatures and
// finalization are not in this file at all, because they never carry. What
// does carry is the answer to "who is playing, where, for how much" — the
// things a director would otherwise re-type from last year's sheet.
//
// The trap this file exists to close is the middle ground: fields that LOOK
// like setup and are actually last year's answers. The tournament's start and
// end dates are setup — and they are August 2025, and cloning them into 2026
// would open the new tournament already over. Same for who bought into skins.
// Each one is dropped deliberately below, next to why.
import { docIds } from "./editionId";

// ── Which years actually happened ──────────────────────────────────
// Everything below decides what the New-year form opens pointed at, and all
// of it reads the same thing: how much is IN each edition.
//
// It used to read `status`, and that was wrong in the way that matters —
// wrong quietly, and wrong on real data. Nothing set `status` meaningfully
// before the picker existed: `ensureActiveEditionDoc` stamps "published" on
// whichever edition a phone happens to point at, so the app's original
// default (wbc_2026, empty) reads PUBLISHED while a year holding a finished
// tournament reads DRAFT. A form that trusted those labels offered to clone
// the empty year into the year after next.
//
// A count cannot lie in that direction. Sixteen roster rows and thirteen
// hundred scores are a tournament whatever the row is labelled, and zero of
// everything is an empty shell whatever the row is labelled.
//
// summaries: { [editionId]: { players, rounds, scores } }, or null when the
// counts could not be read — every function here degrades to the old
// newest-row behaviour rather than guessing.
const yearOf = (e) => Number(e?.year);
const dated = (editions) => (editions || []).filter(e => e?.id && Number.isFinite(yearOf(e)));
const newestFirst = (rows) => [...rows].sort((a, b) => yearOf(b) - yearOf(a));

export const editionHasContent = (s) =>
  !!s && ((s.players | 0) > 0 || (s.rounds | 0) > 0 || (s.scores | 0) > 0);

// The newest edition that actually holds a tournament.
export const newestBuiltEdition = (editions = [], summaries = null) =>
  (summaries ? newestFirst(dated(editions)).find(e => editionHasContent(summaries[e.id])) : null) || null;

// The year the director is here to build: one past the newest year that has
// anything in it, or this year if that is further out (a tournament that
// skipped years should not offer a year it skipped).
//
// An EMPTY edition for the target year is deliberately not a reason to skip
// past it. That row is usually the shell a phone seeded, and it is exactly
// the year being built — cloning INTO it is supported, so offering it is the
// honest answer rather than a collision.
export const plannedYear = (editions = [], summaries = null, currentYear = new Date().getFullYear()) => {
  const rows = dated(editions);
  if (!rows.length) return currentYear;
  const built = newestBuiltEdition(rows, summaries);
  const base = built ? yearOf(built) : Math.max(...rows.map(yearOf));
  return Math.max(base + 1, currentYear);
};

// The edition to copy FROM: the most recent year before the target that has
// something in it. Cloning from an empty year copies nothing, and that
// failure is silent — a clone that copied nothing looks exactly like a clone
// that worked, right up until the roster screen is empty on the first tee.
export const plannedSource = (editions = [], summaries = null, targetYear) => {
  const before = newestFirst(dated(editions).filter(e => yearOf(e) < Number(targetYear)));
  const built = summaries ? before.find(e => editionHasContent(summaries[e.id])) : null;
  return (built || before[0])?.id || "";
};

// What a year has in it, in one line. This is the sentence that makes the
// list readable: which row is the tournament and which is a shell is the
// question the status label was answering wrongly.
export const summaryLine = (s) => {
  if (!s) return "";
  if (!editionHasContent(s)) return "Empty";
  const n = (v) => Number(v || 0).toLocaleString();
  const bits = [];
  if (s.players) bits.push(`${n(s.players)} player${s.players === 1 ? "" : "s"}`);
  if (s.rounds) bits.push(`${n(s.rounds)} round${s.rounds === 1 ? "" : "s"}`);
  if (s.scores) bits.push(`${n(s.scores)} score${s.scores === 1 ? "" : "s"}`);
  return bits.join(" · ");
};

// Move the year in a cloned tournament's name onto the new edition.
//
// Only the SOURCE year is replaced, never any other four digits: "WBC 2025"
// becomes "WBC 2026", and a name that carries no year ("Wanna Be Cup") is left
// exactly as it was rather than having a year invented for it.
export const reyearName = (name, fromYear, toYear) => {
  const s = String(name ?? "").trim();
  if (!s || !fromYear || !toYear || String(fromYear) === String(toYear)) return s;
  return s.split(String(fromYear)).join(String(toYear));
};

// tournament_state.meta — the tournament's name, location and round count.
//
// startDate/endDate are OMITTED rather than blanked: `_upsert` merges, so
// leaving them out keeps whatever the target edition already had (a director
// who dated 2026 before cloning does not lose those dates), while a brand-new
// edition simply has none. Blanking them would wipe the good answer to save
// re-typing the stale one.
export const cloneMeta = (meta, { fromYear, toYear } = {}) => {
  if (!meta || typeof meta !== "object") return null;
  const { startDate: _start, endDate: _end, ...rest } = meta;
  const name = reyearName(meta.name, fromYear, toYear);
  const out = { ...rest };
  if (name) out.name = name;
  else delete out.name;
  return out;
};

// tournament_state.side_games — the price of a seat in each betting game.
//
// The AMOUNT carries: skins costs what it cost last year until somebody says
// otherwise, and re-typing five numbers is exactly the errand a clone exists
// to save. Nothing else does:
//
//   in    who bought in — a per-year answer, and last year's list would have
//         the buy-in sheet showing men as paid up before anyone has paid.
//         Reset to null, which is "nobody tagged yet" and reads as everybody
//         (see fieldFor in lib/sideGames.js) — the state a tournament that
//         has never opened the sheet is already in.
//   pot   the typed skins pot — a running total of money collected, which is
//         a result. Zeroed explicitly so a merge can't leave last year's
//         standing.
//
// Games with no price set are skipped entirely: there is nothing to carry.
export const cloneSideGames = (sideGames) => {
  if (!sideGames || typeof sideGames !== "object") return null;
  const out = {};
  for (const [game, cfg] of Object.entries(sideGames)) {
    const amount = Number(cfg?.amount) || 0;
    if (amount <= 0) continue;
    out[game] = { amount, in: null };
    if (cfg?.pot !== undefined) out[game].pot = 0;
  }
  return Object.keys(out).length ? out : null;
};

// ── The handicap a cloned roster row starts on ─────────────────────
// The year being cloned FROM has just been played, and those rounds change
// what every man in it is worth. Carrying his old index forward regardless is
// how 2026 came to be playing off numbers typed a year earlier, before four
// more rounds existed to argue with them.
//
// So a player who completed rounds in the source edition starts the new year on
// a WBC Index recomputed to include them. Everyone else carries forward:
//
//   • a director cloning a year nobody played yet gets their setup back
//     untouched, rather than every hand-set number replaced by arithmetic
//   • a player on the roster who never posted a card has nothing new to say
//     about his index, so it stands
//   • a first-timer with no history and no completed rounds keeps whatever the
//     director typed, because the alternative is scratch by accident
//
// `index` is the recomputed WBC Index (null when there isn't one) and
// `playedRounds` is how many complete cards the source edition holds for them.
export const rosterHandicap = (tp, { index = null, playedRounds = 0 } = {}) => {
  const carried = Number(tp?.handicap_index);
  const fallback = Number.isFinite(carried) ? carried : 0;
  if (!(playedRounds > 0)) return fallback;
  // `Number(null)` is 0 and 0 is a legal index, so "no index" has to be
  // rejected before the number check rather than by it — otherwise a
  // first-timer with nothing to compute from is silently made scratch.
  if (index == null || String(index).trim() === "") return fallback;
  const fresh = Number(index);
  return Number.isFinite(fresh) ? fresh : fallback;
};

// tournament_players — the roster binding row for the new edition.
//
// player_id is a permanent career identity and is deliberately NOT
// regenerated: it is what ties a golfer to sixteen years of history. The
// handicap index is re-derived from the source year's play — see
// rosterHandicap — rather than copied.
//
// `status` is dropped rather than copied — it holds last year's WD, and a
// player who withdrew from 2025 starts 2026 in the field like everyone else.
export const cloneRosterRow = (tp, { slug, tournamentId, index = null, playedRounds = 0 } = {}) => {
  const pid = tp?.player_id;
  if (!pid) return null;
  const { status: _wd, id: _oldId, ...rest } = tp;
  return {
    ...rest,
    id: docIds.tournamentPlayer(slug, pid),
    tournament_id: tournamentId,
    handicap_index: rosterHandicap(tp, { index, playedRounds }),
  };
};

// tournament_rounds — which course each round is played on.
//
// course_id points at the GLOBAL course registry (Treetops is Treetops in any
// year), so it carries as-is and there is nothing to copy alongside it.
export const cloneRoundRow = (r, { slug, tournamentId } = {}) => {
  const round = Number(r?.round_number);
  if (!Number.isFinite(round) || round <= 0) return null;
  const { id: _oldId, ...rest } = r;
  return { ...rest, id: docIds.tournamentRound(slug, round), tournament_id: tournamentId, round_number: round };
};

// ── The edition document itself ────────────────────────────────────
// Cloning into a year that ALREADY EXISTS is a supported move, and the reason
// is the shape of a real season: `wbc_2026` gets seeded the moment a director's
// phone points at it, so by the time they sit down to build next year from last
// year's setup, the row for it is often already there — empty. Refusing would
// mean deleting the year to create it.
//
// So an existing edition keeps its own status (a published year does not get
// demoted to draft by a clone landing in it) and its own name unless a new one
// was typed. Only `created_from` is always rewritten: it names where the setup
// standing in this edition actually came from.
export const editionDoc = ({ year, id, name, sourceId = null, existing = null }) => ({
  id,
  year: Number(year),
  name: String(name ?? "").trim() || existing?.name || `WBC ${year}`,
  status: existing?.status || "draft",
  created_from: sourceId ?? existing?.created_from ?? null,
  // Carried from the target, never from the SOURCE. A clone copies last year's
  // setup into this year; it does not copy last year's decision to freeze
  // itself, or every year cloned from a finished tournament would be born
  // locked. Carrying the target's own value is what stops a clone into a
  // locked year quietly unlocking it — which is the direction that matters,
  // because the write goes through setDoc with merge and a director is exempt
  // from the lock they would be clearing. See lib/editionLock.js.
  locked: existing?.locked === true,
});

// What the confirm has to say before a clone lands in a year that already
// exists. Only the collections this clone will actually write are named —
// promising to overwrite a roster the director did not tick would be a lie in
// the more alarming direction.
export const overwriteWarning = (options = {}) => {
  const parts = [];
  if (options.players) parts.push("roster and handicap indexes");
  if (options.rounds) parts.push("round setup");
  if (options.tournamentName) parts.push("name and location");
  if (options.buyIns) parts.push("buy-in amounts");
  return parts;
};
