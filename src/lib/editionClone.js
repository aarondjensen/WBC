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

// The year a director opening the New-edition form is most likely typing.
//
// A DRAFT for a year still ahead of us is that year, already claimed and not
// yet built — which is the normal state of the year they came here to build,
// because `wbc_2026` gets seeded into the list the moment a phone points at
// it. Offering 2027 instead, because 2026 "exists", would send them past the
// job they opened the form to do.
//
// Failing that: one past the newest edition, or the current year if that is
// further out (a tournament that skipped a year should not offer the year it
// skipped). With no editions at all it is simply this year.
export const nextEditionYear = (editions = [], currentYear = new Date().getFullYear()) => {
  const rows = (editions || []).filter(e => Number.isFinite(Number(e?.year)));
  const drafts = rows
    .filter(e => e.status === "draft" && Number(e.year) >= currentYear)
    .map(e => Number(e.year))
    .sort((a, b) => a - b);
  if (drafts.length) return drafts[0];
  const years = rows.map(e => Number(e.year));
  if (!years.length) return currentYear;
  return Math.max(Math.max(...years) + 1, currentYear);
};

// The edition that form should be cloning FROM: the most recent year before
// the target that was actually played.
//
// Status is what separates "played" from "exists". A draft is usually the
// empty shell a phone seeded, and cloning from it would copy a roster of
// nobody over the roster the director wanted — the failure is silent, because
// a clone that copies nothing looks exactly like a clone that worked.
export const defaultCloneSource = (editions = [], targetYear) => {
  const before = (editions || [])
    .filter(e => e?.id && Number.isFinite(Number(e.year)) && Number(e.year) < Number(targetYear))
    .sort((a, b) => Number(b.year) - Number(a.year));
  return (before.find(e => e.status !== "draft") || before[0])?.id || "";
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

// tournament_players — the roster binding row for the new edition.
//
// player_id is a permanent career identity and is deliberately NOT
// regenerated: it is what ties a golfer to sixteen years of history. The
// handicap index carries as this year's starting point.
//
// `status` is dropped rather than copied — it holds last year's WD, and a
// player who withdrew from 2025 starts 2026 in the field like everyone else.
export const cloneRosterRow = (tp, { slug, tournamentId } = {}) => {
  const pid = tp?.player_id;
  if (!pid) return null;
  const { status: _wd, id: _oldId, ...rest } = tp;
  return { ...rest, id: docIds.tournamentPlayer(slug, pid), tournament_id: tournamentId };
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
