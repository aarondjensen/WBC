// ══════════════════════════════════════════════════════════════════
//  returningPlayers — who has played before and is not in this field.
// ══════════════════════════════════════════════════════════════════
//
// Setting up a new year is mostly subtraction and addition on last year's
// roster: two men are not coming, and one who missed last year is back. The
// subtraction is easy — remove him from the roster. The addition had one trap
// in it, and this module exists to close it.
//
// A player's id is DERIVED FROM HIS DISPLAY NAME ("Aaron J" → aaron_j), and
// that id is what binds him to his career: his sign-in claim, and every row he
// has ever written. Adding a returning man by typing his name works only if
// the typing lands on exactly the name that produced the id — "AJ" or "Aaron
// Jensen" mints a NEW player who happens to look like him, whose account claim
// still points at the old id. Nothing about that failure is visible on the
// roster screen. It shows up when he cannot post his own score.
//
// So the picker hands back the id rather than re-deriving it, and this module
// decides who is in the picker. Two sources, because neither alone is the
// whole record:
//
//   the players registry   everyone the app has ever had a roster row for,
//                          and the only place the real ids live
//   HISTORY_PLAYERS        the record books, which reach back to 2012 — years
//                          before this app existed and wrote any registry row
//
// A man in both is listed once, off his registry row, because that row carries
// the id that matters. A man only in the history gets the derived id, which is
// the right answer for him: there is no other id to be wrong about.
import { HISTORY_PLAYERS } from "../data/history.js";
import { indexFor, matchHistoryName } from "./handicap.js";

// The id a display name files under. This derivation is the roster's from the
// beginning and must not drift — see addPlayerToTournament, which falls back to
// it for a genuinely new player.
export const idForName = (name) =>
  String(name || "").trim().toLowerCase().replace(/\s+/g, "_");

// First/last for a registry row that predates the parts being stored — the
// same best-effort split the player editor seeds itself from.
const partsOf = (row) => {
  if (row?.first_name || row?.last_name) return { first: row.first_name || "", last: row.last_name || "" };
  const bits = String(row?.name || "").trim().split(/\s+/);
  return { first: bits[0] || "", last: bits.slice(1).join(" ") };
};

// ── returningPlayers ───────────────────────────────────────────────
// registry     rows from the `players` collection: { id, name, first_name, last_name }
// rosterIds    player_ids already holding a tournament_players row for THIS
//              edition — withdrawals included. A man on the roster is not
//              somebody to add, and un-withdrawing is a different action.
// historyNames the record books. Injectable, with indexOf/matchName, so the
//              selection can be tested without asserting on real careers.
//              `indexOf(historyName, playerId)` — see the note where it is
//              called for why it takes both.
//
// Returns one row per addable player, alphabetical:
//   { id, name, first, last, historyName, index, rounds, lastYear }
export function returningPlayers({
  registry = [],
  rosterIds = [],
  historyNames = HISTORY_PLAYERS,
  indexOf = (name) => indexFor(name),
  matchName = matchHistoryName,
} = {}) {
  const onRoster = new Set((rosterIds || []).filter(Boolean).map(String));
  const rows = [];
  // History names already carried by a registry row — whether or not that row
  // is on the roster. Filing them here is what stops a man appearing twice,
  // once under his real id and once under a derived one.
  const filed = new Set();

  for (const row of registry || []) {
    if (!row?.id) continue;
    const historyName = matchName(row, historyNames) || null;
    if (historyName) filed.add(historyName);
    if (onRoster.has(String(row.id))) continue;
    rows.push({ id: String(row.id), name: row.name || "", ...partsOf(row), historyName });
  }

  for (const name of historyNames || []) {
    if (filed.has(name)) continue;
    const id = idForName(name);
    if (onRoster.has(id) || rows.some(r => r.id === id)) continue;
    const bits = String(name).trim().split(/\s+/);
    rows.push({ id, name, first: bits[0] || "", last: bits.slice(1).join(" "), historyName: name });
  }

  return rows
    .map(r => {
      // The id goes with the name because a career now has two halves: the
      // record books, which are keyed by history name, and the WBCs played
      // since they were last generated, which are keyed by player_id. A man
      // whose first tournament was last year has only the second — so the call
      // is made for him too, rather than only for a name the bundle knows.
      const idx = indexOf(r.historyName, r.id);
      const rounds = idx?.rounds || [];
      return {
        ...r,
        index: idx?.index ?? null,
        rounds: rounds.length,
        // historyFor sorts newest first, so the first round is the last one played.
        lastYear: rounds[0]?.year ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── returningLine ──────────────────────────────────────────────────
// The subtitle under a name in the picker. It answers the only question the
// list raises — "is this the right man?" — and a year answers it better than a
// count does, since the director knows which years he was there.
export const returningLine = (r) => {
  if (!r?.rounds) return "No recorded rounds";
  return `${r.rounds} recorded · last played ${r.lastYear}`;
};
