/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  What opening Tournaments actually costs
// ══════════════════════════════════════════════════════════════════
//
// editions.js talks to Firestore, so both it and the SDK are mocked and the
// fake records every read. That is the point of the test rather than a means
// to it: the summaries were always correct, they just took sixty-seven round
// trips to arrive, and nothing about a correct answer would have caught that.
// So this pins the SHAPE of the traffic — one read per small collection, one
// count per edition, pairings only for a year still being played — alongside
// the answers themselves.
//
// jsdom for localStorage: the cache write is part of the path being tested.
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── The fake ──────────────────────────────────────────────────────
// Every collection this module reads, and a log of how it was reached.
let DB = {};
let reads = [];
let failCollections = new Set();
// A count that fails for ONE year, which is the interesting failure: the other
// fifteen are readable and must still be reported.
let failCountFor = new Set();

const rowsIn = (col, wh = []) => (DB[col] || []).filter(r =>
  wh.every(w => r[w.field] === w.value));

vi.mock("../firebase", () => ({
  _db: {},
  getActiveTournamentId: () => "wbc_2026",
  setActiveTournamentId: () => {},
  getEditionSlug: () => "2026",
}));

vi.mock("firebase/firestore", () => ({
  collection: (_db, col) => ({ col, wh: [] }),
  query: (ref, ...wh) => ({ col: ref.col, wh }),
  where: (field, op, value) => ({ field, op, value }),
  doc: (_db, col, id) => ({ col, id }),
  setDoc: async () => {},
  deleteDoc: async () => {},
  getDocs: async (q) => {
    reads.push({ op: "getDocs", col: q.col, tid: q.wh?.find(w => w.field === "tournament_id")?.value });
    if (failCollections.has(q.col)) throw new Error(`denied: ${q.col}`);
    return { docs: rowsIn(q.col, q.wh || []).map(d => ({ data: () => d })) };
  },
  getCountFromServer: async (q) => {
    const tid = q.wh?.find(w => w.field === "tournament_id")?.value;
    reads.push({ op: "count", col: q.col, tid });
    if (failCollections.has(q.col) || failCountFor.has(tid)) throw new Error(`denied: ${q.col}`);
    return { data: () => ({ count: rowsIn(q.col, q.wh || []).length }) };
  },
}));

const { loadEditionSummaries, cachedEditionSummaries } = await import("./editions");

// ── The fixture ───────────────────────────────────────────────────
// One of each kind of year the picker has to tell apart: a finished
// tournament, one being played, a shell with a roster and no cards, and a
// blank row nobody has touched.
const rep = (n, row) => Array.from({ length: n }, () => ({ ...row }));

const IDS = ["wbc_2015", "wbc_2026", "wbc_2027", "wbc_2028"];

beforeEach(() => {
  localStorage.clear();
  reads = [];
  failCollections = new Set();
  failCountFor = new Set();
  DB = {
    tournament_players: [
      ...rep(6, { tournament_id: "wbc_2015" }),
      ...rep(12, { tournament_id: "wbc_2026" }),
      ...rep(8, { tournament_id: "wbc_2027" }),
    ],
    tournament_rounds: [
      ...rep(4, { tournament_id: "wbc_2015" }),
      ...rep(4, { tournament_id: "wbc_2026" }),
    ],
    tournament_state: [
      { tournament_id: "wbc_2015", meta: { rounds: 4 },
        finalized_rounds: { 1: true, 2: true, 3: true, 4: true } },
      { tournament_id: "wbc_2026", meta: { rounds: 4 }, finalized_rounds: { 1: true } },
    ],
    hole_scores: [
      ...rep(432, { tournament_id: "wbc_2015" }),
      ...rep(100, { tournament_id: "wbc_2026" }),
    ],
    pairings: [
      { tournament_id: "wbc_2026", round_number: 2, group_number: 1, player_id: "aaron_j" },
      { tournament_id: "wbc_2026", round_number: 2, group_number: 1, player_id: "brian_k" },
    ],
  };
});

const countOf = (op, col) => reads.filter(r => r.op === op && r.col === col).length;

describe("loadEditionSummaries — what it reads", () => {
  it("reads each small collection ONCE, not once per edition", async () => {
    // The change this file exists for. Four editions used to cost twelve count
    // queries across these three plus four more reads for the state documents;
    // it is now three reads flat, and it stays three at sixteen editions.
    await loadEditionSummaries(IDS);
    expect(countOf("getDocs", "tournament_players")).toBe(1);
    expect(countOf("getDocs", "tournament_rounds")).toBe(1);
    expect(countOf("getDocs", "tournament_state")).toBe(1);
    expect(countOf("count", "tournament_players")).toBe(0);
    expect(countOf("count", "tournament_rounds")).toBe(0);
  });

  it("keeps hole_scores a server-side count, one per edition", async () => {
    // The one collection too big to read: a year holds well over a thousand
    // scores, and downloading them to call .length on them is the thing
    // getCountFromServer exists to avoid.
    await loadEditionSummaries(IDS);
    expect(countOf("count", "hole_scores")).toBe(IDS.length);
    expect(countOf("getDocs", "hole_scores")).toBe(0);
  });

  it("reads pairings only for a year the finalization map couldn't settle", async () => {
    // A finished year answers out of finalized_rounds and costs no read at
    // all; only the tournament being played needs the groups.
    await loadEditionSummaries(IDS);
    const pairingReads = reads.filter(r => r.col === "pairings");
    expect(pairingReads).toHaveLength(1);
    expect(pairingReads[0].tid).toBe("wbc_2026");
  });

  it("costs a flat handful of round trips, not one per year per collection", async () => {
    await loadEditionSummaries(IDS);
    // 3 collection reads + 4 score counts + 1 pairings read.
    expect(reads).toHaveLength(8);
  });

  it("does nothing at all when asked about no editions", async () => {
    expect(await loadEditionSummaries([])).toEqual({});
    expect(reads).toHaveLength(0);
  });
});

describe("loadEditionSummaries — what it answers", () => {
  it("counts a finished year and reports every round signed off", async () => {
    const s = (await loadEditionSummaries(IDS)).wbc_2015;
    expect(s).toMatchObject({ players: 6, rounds: 4, scores: 432, roundCount: 4 });
    expect(s.finalizedRounds).toEqual({ 1: true, 2: true, 3: true, 4: true });
    expect(s.pairings).toEqual({});
  });

  it("carries the draw for the year being played", async () => {
    const s = (await loadEditionSummaries(IDS)).wbc_2026;
    expect(s).toMatchObject({ players: 12, rounds: 4, scores: 100 });
    expect(s.finalizedRounds).toEqual({ 1: true });
    expect(s.pairings).toEqual({ 2: [["aaron_j", "brian_k"]] });
  });

  it("says a roster with no cards has a roster and no cards", async () => {
    const s = (await loadEditionSummaries(IDS)).wbc_2027;
    expect(s).toEqual({ players: 8, rounds: 0, scores: 0 });
    // No finalization on a year nobody has played — it would be a claim about
    // rounds that were never played.
    expect(s).not.toHaveProperty("finalizedRounds");
  });

  it("says an untouched year is empty", async () => {
    expect((await loadEditionSummaries(IDS)).wbc_2028)
      .toEqual({ players: 0, rounds: 0, scores: 0 });
  });
});

describe("loadEditionSummaries — when a read fails", () => {
  it("leaves out only the year whose score count failed", async () => {
    // "We couldn't read it" and "there is nothing in it" are opposite answers,
    // and reporting the second would have the delete button offering to bin a
    // finished tournament.
    failCountFor.add("wbc_2015");
    const out = await loadEditionSummaries(IDS);
    expect(out).not.toHaveProperty("wbc_2015");
    expect(Object.keys(out).sort()).toEqual(["wbc_2026", "wbc_2027", "wbc_2028"]);
  });

  it("reports nothing at all when a whole-collection read fails", async () => {
    // Nothing was readable, so nothing is claimed — every year comes out
    // unknown, and deleteVerdict refuses across the board.
    failCollections.add("tournament_players");
    expect(await loadEditionSummaries(IDS)).toEqual({});
  });

  it("drops a year whose pairings could not be read", async () => {
    failCollections.add("pairings");
    const out = await loadEditionSummaries(IDS);
    expect(out).not.toHaveProperty("wbc_2026");
    expect(out).toHaveProperty("wbc_2015");
  });
});

describe("the cache the picker paints from", () => {
  it("knows nothing before the first load", () => {
    expect(cachedEditionSummaries(IDS)).toBeNull();
  });

  it("holds what the last load learned, with no reads at all", async () => {
    await loadEditionSummaries(IDS);
    reads = [];
    const cached = cachedEditionSummaries(IDS);
    expect(reads).toHaveLength(0);
    expect(cached.wbc_2015).toMatchObject({ players: 6, rounds: 4, scores: 432 });
    expect(cached.wbc_2026).toMatchObject({ players: 12, scores: 100 });
  });

  it("is replaced by the fresh answer, not merged into a stale one", async () => {
    await loadEditionSummaries(IDS);
    DB.hole_scores.push(...rep(50, { tournament_id: "wbc_2026" }));
    await loadEditionSummaries(IDS);
    expect(cachedEditionSummaries(["wbc_2026"]).wbc_2026.scores).toBe(150);
  });
});
