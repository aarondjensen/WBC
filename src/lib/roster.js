// ══════════════════════════════════════════════════════════════════
//  roster — this edition's players, from the two halves they arrive in.
// ══════════════════════════════════════════════════════════════════
//
// The roster every screen renders does not exist in any one place. It is a
// JOIN:
//
//   tournament_players   this edition's rows — who is in it, off what index,
//                        and whether they have withdrawn. Arrives over a live
//                        subscription.
//   players (registry)   the career record — the NAMES, and the permanent id
//                        that ties a person to sixteen years of history.
//                        Arrives over a one-shot read.
//
// A row whose registry entry is missing is dropped, because there is nothing
// to draw: no name, no display. That is the correct handling of a genuinely
// orphaned row — and it is also the sharpest edge in this app.
//
// ── The bug this module was extracted after ────────────────────────
// The two halves arrive on very different clocks. The subscription answers
// from the on-disk cache in about a millisecond; the registry is a network
// round trip. So the join routinely runs FIRST with rows and no names,
// correctly drops every one of them, and returns an empty tournament.
//
// That is fine, and momentary, on one condition: that it runs again when the
// names land. When this was two `useMemo`s in App.jsx keyed on the rows alone,
// it did not. Every player disappeared from a live tournament — leaderboard,
// scoring, pairings, all of it — and stayed gone for the session, because the
// empty answer was cached and nothing invalidated it. Nothing was deleted;
// nothing could be seen.
//
// So the join and the hook that memoizes it live together here, and the hook's
// dependency list is the fix. Keeping them in one file is the point: the rule
// is not "remember to list registry", it is "there is one way to build a
// roster and it already lists it".

import { useMemo } from "react";

// ── joinRoster ─────────────────────────────────────────────────────
// Pure. Rows + registry → the player objects every screen consumes, sorted by
// name the way the app has always sorted them.
//
//   withdrawn: "include" — every row, each tagged `isWD`. What the leaderboard
//              wants: a withdrawal is still shown, ranked last.
//   withdrawn: "exclude" — WD rows dropped entirely. What pairings, tee
//              assignments and the buy-in sheet want.
//
// `handicap_index` comes from the EDITION row, never the registry: what a
// golfer plays off is a fact about this tournament, and the same person can
// carry a different one next year. Everything else is the career record.
export function joinRoster({ tPlayers = [], registry = [], withdrawn = "include" }) {
  const byId = new Map((registry || []).filter(p => p && p.id).map(p => [p.id, p]));
  const keepWD = withdrawn === "include";

  return (tPlayers || [])
    .filter(tp => tp && (keepWD || tp.status !== "WD"))
    .map(tp => {
      const p = byId.get(tp.player_id);
      // No registry entry. Either the names have not loaded yet, or this row
      // is orphaned — indistinguishable from here, and both render as nothing.
      // See the header for why the CALLER has to re-run this when they land.
      if (!p) return null;
      const row = {
        ...p,
        handicap_index: parseFloat(tp.handicap_index) || 0,
        tp_id: tp.id,
      };
      if (keepWD) row.isWD = tp.status === "WD";
      return row;
    })
    .filter(Boolean)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

// ── useRoster ──────────────────────────────────────────────────────
// Both cuts of the roster, memoized on BOTH halves.
//
// `registry` in the dependency list is the whole reason this is a hook rather
// than two calls at the call site. It has to be a real read of a real value —
// a dependency that is named but unused is one the linter reports as
// unnecessary and the next person deletes, which is precisely the deletion
// that empties a live tournament.
export function useRoster(tPlayers, registry) {
  const allPlayers = useMemo(
    () => joinRoster({ tPlayers, registry, withdrawn: "include" }),
    [tPlayers, registry],
  );
  const activePlayers = useMemo(
    () => joinRoster({ tPlayers, registry, withdrawn: "exclude" }),
    [tPlayers, registry],
  );
  return { allPlayers, activePlayers };
}
