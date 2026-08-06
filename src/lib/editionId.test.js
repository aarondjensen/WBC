import { describe, it, expect } from "vitest";
import { editionSlug, editionIdForYear, editionYear, docIds } from "./editionId";

describe("editionSlug", () => {
  it("strips the wbc_ prefix", () => {
    expect(editionSlug("wbc_2026")).toBe("2026");
    expect(editionSlug("wbc_2027")).toBe("2027");
  });

  it("accepts a bare year unchanged", () => {
    expect(editionSlug("2026")).toBe("2026");
  });

  it("supports a non-year edition id", () => {
    expect(editionSlug("wbc_masters")).toBe("masters");
  });

  it("strips only a LEADING prefix", () => {
    expect(editionSlug("wbc_2026_wbc_x")).toBe("2026_wbc_x");
  });

  it("does not collapse distinct editions onto one slug", () => {
    const slugs = ["wbc_2026", "wbc_2027", "wbc_2028", "wbc_masters"].map(editionSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("degrades to a string for empty or nullish input rather than throwing", () => {
    expect(editionSlug("")).toBe("");
    expect(editionSlug(null)).toBe("");
    expect(editionSlug(undefined)).toBe("");
  });
});

describe("editionIdForYear", () => {
  it("round-trips with editionSlug", () => {
    expect(editionSlug(editionIdForYear(2027))).toBe("2027");
  });

  it("rebuilds the id the app already ships with", () => {
    expect(editionIdForYear(2026)).toBe("wbc_2026");
  });
});

describe("editionYear", () => {
  it("reads the year out of an edition id", () => {
    expect(editionYear("wbc_2026")).toBe(2026);
    expect(editionYear("wbc_2031")).toBe(2031);
  });

  it("falls back when the id carries no digits", () => {
    expect(editionYear("wbc_masters", 2026)).toBe(2026);
  });

  it("uses the current year as the last resort", () => {
    expect(editionYear("wbc_masters")).toBe(new Date().getFullYear());
  });
});

// ══════════════════════════════════════════════════════════════════
//  The back-compatibility contract.
// ══════════════════════════════════════════════════════════════════
//
// These literals are the document ids ALREADY IN FIRESTORE for the 2026
// tournament. The builders replaced hardcoded `2026` templates, and if their
// output ever stops matching these strings the running tournament's scores,
// pairings and roster are orphaned — the app would write a parallel set of
// documents and silently show an empty event.
//
// So they are pinned here as exact strings, deliberately not built from the
// helpers under test.
describe("docIds — 2026 back-compatibility", () => {
  const S = editionSlug("wbc_2026");

  it("hole_scores", () => {
    expect(docIds.holeScore(S, 1, "aaron_j", 0)).toBe("hs_2026_r1_aaron_j_h1");
    expect(docIds.holeScore(S, 3, "scott_r", 17)).toBe("hs_2026_r3_scott_r_h18");
  });

  it("round_score_id", () => {
    expect(docIds.roundScore(S, 2, "aaron_j")).toBe("rs_2026_r2_aaron_j");
  });

  it("pairings", () => {
    expect(docIds.pairing(S, 1, 1, "aaron_j")).toBe("pair_2026_r1_g1_aaron_j");
    expect(docIds.pairing(S, 4, 3, "scott_r")).toBe("pair_2026_r4_g3_scott_r");
  });

  it("tee_assignments", () => {
    expect(docIds.teeAssignment(S, 2, "aaron_j")).toBe("ta_2026_r2_aaron_j");
  });

  it("tournament_players", () => {
    expect(docIds.tournamentPlayer(S, "aaron_j")).toBe("tp_2026_aaron_j");
  });

  it("tournament_rounds", () => {
    expect(docIds.tournamentRound(S, 4)).toBe("tr_2026_r4");
  });

  it("ctp skins", () => {
    expect(docIds.ctp(S, 1, 7)).toBe("ctp_2026_r1_h7");
  });

  it("market bets — one document per bettor", () => {
    expect(docIds.marketBet(S, "aaron_j")).toBe("mkt_2026_aaron_j");
  });

  // The original edition keeps BARE group keys as document ids. Signatures
  // for the running tournament are already stored under them, and prefixing
  // would orphan every one.
  it("scorecard signatures stay bare on the original edition", () => {
    const key = "1_aaron_j,scott_r";
    expect(docIds.scorecardSig(S, key, true)).toBe("1_aaron_j,scott_r");
  });
});

describe("docIds — edition isolation", () => {
  const A = editionSlug("wbc_2026");
  const B = editionSlug("wbc_2027");

  // The whole point of the change: same player, same round, same hole, in two
  // editions, must not be the same document. Before this, both wrote
  // `hs_2026_...` and the second edition overwrote the first.
  it("gives two editions different ids for the same score", () => {
    expect(docIds.holeScore(A, 1, "aaron_j", 0)).not.toBe(docIds.holeScore(B, 1, "aaron_j", 0));
    expect(docIds.holeScore(B, 1, "aaron_j", 0)).toBe("hs_2027_r1_aaron_j_h1");
  });

  it("isolates every edition-scoped id builder, not just scores", () => {
    const built = (slug) => [
      docIds.holeScore(slug, 1, "p", 0),
      docIds.roundScore(slug, 1, "p"),
      docIds.pairing(slug, 1, 1, "p"),
      docIds.teeAssignment(slug, 1, "p"),
      docIds.tournamentPlayer(slug, "p"),
      docIds.tournamentRound(slug, 1),
      docIds.ctp(slug, 1, 7),
      docIds.marketBet(slug, "p"),
    ];
    const a = built(A), b = built(B);
    a.forEach((id, i) => expect(id).not.toBe(b[i]));
  });

  // The group key carries a round and a player set but no year, so without a
  // prefix the same foursome playing round 1 in two editions would share one
  // signature document.
  it("separates scorecard signatures once past the original edition", () => {
    const key = "1_aaron_j,scott_r";
    const legacy = docIds.scorecardSig(A, key, true);
    const next = docIds.scorecardSig(B, key, false);
    expect(legacy).not.toBe(next);
    expect(next).toBe("2027__1_aaron_j,scott_r");
  });

  it("separates two non-original editions from each other", () => {
    const key = "1_aaron_j,scott_r";
    expect(docIds.scorecardSig(editionSlug("wbc_2028"), key))
      .not.toBe(docIds.scorecardSig(B, key));
  });

  it("keeps ids distinct across rounds, groups, holes and players", () => {
    const ids = [
      docIds.holeScore(A, 1, "p", 0),
      docIds.holeScore(A, 2, "p", 0),
      docIds.holeScore(A, 1, "q", 0),
      docIds.holeScore(A, 1, "p", 1),
      docIds.pairing(A, 1, 1, "p"),
      docIds.pairing(A, 1, 2, "p"),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
