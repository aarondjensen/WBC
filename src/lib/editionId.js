// ══════════════════════════════════════════════════════════════════
//  editionId — edition slugs and the document ids built from them.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React. That is the point — firebase.js initializes an
// app at import time, so anything that imports it is untestable in a plain
// unit test. These functions are the part that most needs testing, so they
// live on their own and firebase.js imports THEM.
//
// Why this file exists at all
// ───────────────────────────
// WBC embeds the year directly in its document ids — `hs_2026_r1_aaron_j_h4`,
// `tp_2026_aaron_j`, `tr_2026_r1`. Every one of those was a hardcoded `2026`,
// which meant a second edition would write the SAME ids and silently overwrite
// the first. Its rows carry a different tournament_id, so the reads separate
// correctly and the corruption would not show up until two editions existed.
//
// So the year now comes from the active edition. The rule is a SLUG — the
// edition id with its `wbc_` prefix removed — chosen specifically so the
// existing edition's ids come out byte-identical:
//
//   wbc_2026 → "2026"   → `hs_2026_r1_…`   (exactly what is in Firestore now)
//   wbc_2027 → "2027"   → `hs_2027_r1_…`
//
// editionId.test.js pins that back-compatibility against the literal strings,
// so a future change to the scheme fails a test instead of orphaning a
// tournament's worth of scores.

// The `wbc_` prefix is optional so a bare year ("2026") is accepted too — the
// switcher builds ids via editionIdForYear, but a hand-written config value
// shouldn't produce `wbc_wbc_2026`.
export const editionSlug = (tid) => String(tid ?? "").replace(/^wbc_/, "") || String(tid ?? "");

export const editionIdForYear = (year) => `wbc_${year}`;

// ── The sandbox ────────────────────────────────────────────────────
// One edition that is not a year. It exists so there is somewhere to hand
// beta testers — twelve of them, needing the tournament password before they
// can exercise anything, and a membership is not edition-scoped — without
// pointing them at a tournament that counts.
//
// NOT `wbc_2026_demo`, which was the obvious first shape and the wrong one.
// A year-shaped sandbox puts two rows both reading "2026" in the picker, and
// tapping a row reloads the whole app into that edition: a director switching
// years in a hurry during a live tournament taps the wrong 2026. It also goes
// stale — a 2027 sandbox is in the way the moment 2027 is a real tournament.
// A sandbox with no year in it collides with nothing, this year or in five.
//
// Its slug is "demo", so every document it holds is `hs_demo_r1_…`,
// `tp_demo_…` — a namespace no year can ever produce, because a year is four
// digits. Nothing it contains can overwrite anything real, which is the
// property that makes it safe to wipe and re-cut whenever.
export const SANDBOX_EDITION_ID = "wbc_demo";

// Compared against the id, never inferred from a missing year: an edition row
// that failed to load its year is not a sandbox, it is a year we could not
// read, and the two must not be confused — one is disposable and the other is
// a tournament.
export const isSandboxEdition = (tid) => String(tid ?? "") === SANDBOX_EDITION_ID;

// The edition's year, for display. Falls back to the current year when the id
// carries no digits (a named edition like wbc_masters).
export const editionYear = (tid, fallback) =>
  parseInt(String(tid ?? "").replace(/\D/g, ""), 10) || fallback || new Date().getFullYear();

// ── Document id builders ───────────────────────────────────────────
// One place where the shape of every edition-scoped document id is written
// down. Each takes the slug explicitly rather than reading a module-level
// active edition, which is what keeps this file pure and testable — App.jsx
// passes `getEditionSlug()` at each call site.
export const docIds = {
  // hole_scores: one document per player, per round, per hole. `hole` is a
  // ZERO-BASED index here and one-based in the id, matching the stored
  // hole_number field.
  holeScore: (slug, round, pid, holeIdx) => `hs_${slug}_r${round}_${pid}_h${holeIdx + 1}`,
  // Not a document id — the grouping field stamped onto each hole_scores row.
  roundScore: (slug, round, pid) => `rs_${slug}_r${round}_${pid}`,
  // pairings: one document per player, per round — `group` is one-based.
  pairing: (slug, round, group, pid) => `pair_${slug}_r${round}_g${group}_${pid}`,
  // tee_assignments: one per player, per round.
  teeAssignment: (slug, round, pid) => `ta_${slug}_r${round}_${pid}`,
  // tournament_players: the roster binding for this edition.
  tournamentPlayer: (slug, pid) => `tp_${slug}_${pid}`,
  // tournament_rounds: which course each round is played on.
  tournamentRound: (slug, round) => `tr_${slug}_r${round}`,
  // skins, skin_type "ctp": one per par-3, per round.
  ctp: (slug, round, hole) => `ctp_${slug}_r${round}_h${hole}`,
  // skins, skin_type "market": one per BETTOR — the whole portfolio, both
  // windows, on one document. Per-bettor rather than per-lot because a
  // portfolio is edited as a whole: shares move between golfers, and a lot
  // taken to zero has to disappear rather than linger at zero.
  marketBet: (slug, pid) => `mkt_${slug}_${pid}`,

  // wbc_scorecard_sigs: one per scoring group, per round. The odd one out.
  //
  // Its key is a GROUP key — `${round}_${sorted player ids}` — built by the
  // scoring screen and used as the in-memory key for both scorecardSigs and
  // finalizedRounds. It carries no year, so the same four golfers playing
  // round 1 in two editions would produce the same document.
  //
  // Unlike every builder above, the slug cannot simply be interpolated: these
  // documents ALREADY EXIST for 2026 under the bare group key, and changing
  // their ids would orphan every signature in the running tournament. So the
  // original edition keeps bare ids and later editions are prefixed — the same
  // compromise Bourbon Cup made for its first edition.
  //
  // Safe because the subscription resolves the in-memory key from the
  // `groupKey` FIELD (`d.groupKey || d.id`), not from the document id, so the
  // prefix never reaches application state.
  scorecardSig: (slug, groupKey, legacy = false) =>
    legacy ? String(groupKey) : `${slug}__${groupKey}`,
};
