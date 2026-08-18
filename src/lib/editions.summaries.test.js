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

const { loadEditionSummaries, cachedEditionSummaries, cachedEditions, warmEditions } =
  await import("./editions");

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
      { tournament_id: "wbc_2015", meta: { rounds: 4, location: "Augusta, MI" },
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
  it("counts on the server and never reads a countable collection whole", async () => {
    // A count is billed one read per thousand index entries; reading the same
    // collection to count it here is billed one read PER ROW. This file once
    // read the roster and round setup in bulk to save a hop, and it took the
    // picker from ~107 billed reads to ~250 — the hop is saved elsewhere now.
    await loadEditionSummaries(IDS);
    for (const col of ["tournament_players", "tournament_rounds", "hole_scores"]) {
      expect(countOf("count", col), `${col} should be counted`).toBe(IDS.length);
      expect(countOf("getDocs", col), `${col} should never be read whole`).toBe(0);
    }
  });

  it("reads tournament_state ONCE, not once per edition", async () => {
    // The one collection worth reading whole: a single document per year, and
    // what the picker wants from it is the finalization map rather than a
    // count. Read in bulk it arrives alongside the counts instead of behind
    // them, which is the hop that used to cost a whole extra round trip.
    await loadEditionSummaries(IDS);
    expect(countOf("getDocs", "tournament_state")).toBe(1);
    expect(countOf("count", "tournament_state")).toBe(0);
  });

  it("reads pairings only for a year the finalization map couldn't settle", async () => {
    // A finished year answers out of finalized_rounds and costs no read at
    // all; only the tournament being played needs the groups.
    await loadEditionSummaries(IDS);
    const pairingReads = reads.filter(r => r.col === "pairings");
    expect(pairingReads).toHaveLength(1);
    expect(pairingReads[0].tid).toBe("wbc_2026");
  });

  it("bills a handful of reads, not one per document in the history", async () => {
    // The number that matters for a squad of twelve toggling between years for
    // a fortnight. Counts are one billed read each at this scale, the state
    // read is one per year, and only the year being played costs its draw:
    //   4 editions × 3 counts + 4 state documents + 2 pairing rows = 18.
    // Reading the roster and round setup whole instead put the document total
    // in the hundreds for the same answer.
    await loadEditionSummaries(IDS);
    const billed = reads.reduce((n, r) => n + (
      r.op === "count" ? 1 : rowsIn(r.col, r.tid ? [{ field: "tournament_id", value: r.tid }] : []).length
    ), 0);
    expect(billed).toBeLessThan(25);
  });

  it("costs one burst of requests and one small follow-up, not four hops", async () => {
    await loadEditionSummaries(IDS);
    // 12 counts + 1 state read + 1 pairings read.
    expect(reads).toHaveLength(14);
  });

  it("does nothing at all when asked about no editions", async () => {
    expect(await loadEditionSummaries([])).toEqual({});
    expect(reads).toHaveLength(0);
  });
});

// ── One year at a time ────────────────────────────────────────────
// The list used to sit on "Counting…" until the slowest of fifty-one requests
// came back, and then fill in all at once. Each year is now reported as its
// own counts land.
describe("loadEditionSummaries — reporting as it goes", () => {
  it("hands over each year the moment its counts land", async () => {
    const seen = [];
    const out = await loadEditionSummaries(IDS, { onEdition: (id, s) => seen.push([id, s]) });
    expect(seen.map(([id]) => id).sort()).toEqual(IDS.slice().sort());
    // What is streamed IS what the map ends up holding — not a thinner
    // version of it that the row would have to draw differently.
    for (const [id, s] of seen) expect(out[id]).toEqual(s);
  });

  it("never reports a year it could not read", async () => {
    failCountFor.add("wbc_2015");
    failCollections.add("pairings");
    const seen = [];
    await loadEditionSummaries(IDS, { onEdition: (id) => seen.push(id) });
    // 2015's counts failed and 2026's draw could not be read — "we couldn't
    // read it" is not a summary line, and the final map leaves both out too.
    expect(seen.sort()).toEqual(["wbc_2027", "wbc_2028"]);
  });

  it("holds back the year being played until its draw lands, not a moment before", async () => {
    // Without the groups that year reads as still being played, and a dot
    // that turns from orange to green a moment later is a worse answer than
    // one that arrives a moment late.
    const at = [];
    await loadEditionSummaries(IDS, {
      onEdition: (id) => at.push([id, reads.filter(r => r.col === "pairings").length]),
    });
    const [, pairingsDone] = at.find(([id]) => id === "wbc_2026");
    expect(pairingsDone).toBe(1);
  });

  it("gathers and caches every year even when the caller's painter throws", async () => {
    const out = await loadEditionSummaries(IDS, {
      onEdition: () => { throw new Error("unmounted mid-paint"); },
    });
    expect(Object.keys(out).sort()).toEqual(IDS.slice().sort());
    expect(cachedEditionSummaries(IDS).wbc_2015.scores).toBe(432);
  });

  it("still reports nothing when a whole-collection read fails", async () => {
    failCollections.add("tournament_players");
    const seen = [];
    expect(await loadEditionSummaries(IDS, { onEdition: (id) => seen.push(id) })).toEqual({});
    expect(seen).toEqual([]);
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
    expect(s).toEqual({ players: 8, rounds: 0, scores: 0, location: "" });
    // No finalization on a year nobody has played — it would be a claim about
    // rounds that were never played.
    expect(s).not.toHaveProperty("finalizedRounds");
  });

  // Where it was played rides the state read the finalization map is already
  // making, which is why the row can say it without costing anything.
  it("carries the location a director set, off the same read", async () => {
    const s = await loadEditionSummaries(IDS);
    expect(s.wbc_2015.location).toBe("Augusta, MI");
    expect(s.wbc_2026.location).toBe("");
  });

  it("says an untouched year is empty", async () => {
    expect((await loadEditionSummaries(IDS)).wbc_2028)
      .toEqual({ players: 0, rounds: 0, scores: 0, location: "" });
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

  it("reports nothing when the state read fails, and swallows the counts with it", async () => {
    // The counts are already in flight when the state read comes back empty,
    // so their failures still have to be collected — a rejection landing with
    // nobody listening is an unhandled rejection in a director's console.
    failCollections.add("tournament_state");
    failCountFor.add("wbc_2015");
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

// ── The tap early ─────────────────────────────────────────────────
// Tournaments sits one tap inside the More menu, so the years are fetched
// while the menu is being read and the picker opens with rows already drawn.
describe("warmEditions", () => {
  beforeEach(() => { DB.wbc_editions = [{ id: "wbc_2026", year: 2026, name: "WBC 2026" }]; });

  it("fetches the years once, so the picker has rows the frame it opens", async () => {
    expect(cachedEditions()).toBeNull();
    warmEditions();
    await vi.waitFor(() => expect(cachedEditions()).toHaveLength(1));
    expect(reads.filter(r => r.col === "wbc_editions")).toHaveLength(1);
  });

  it("costs nothing on a device that has opened the picker before", async () => {
    warmEditions();
    await vi.waitFor(() => expect(cachedEditions()).toHaveLength(1));
    reads = [];
    warmEditions();
    warmEditions();
    expect(reads).toHaveLength(0);
  });

  it("is fire and forget — a read that fails is not a failure anybody waits on", async () => {
    failCollections.add("wbc_editions");
    expect(() => warmEditions()).not.toThrow();
    await vi.waitFor(() => expect(reads.some(r => r.col === "wbc_editions")).toBe(true));
    expect(cachedEditions()).toBeNull();
  });
});
