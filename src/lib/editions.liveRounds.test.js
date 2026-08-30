/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Reading the years the bundled history has not caught up with
// ══════════════════════════════════════════════════════════════════
//
// data/history.js stops at 2025. Every WBC played in this app since is in
// Firestore, and until loadLiveRounds existed the Players tab could not see
// any of it: a man who played 2026 opened 2027 and found none of it on his
// chart, while the roster he was on had been seeded from those very cards.
//
// So this suite pins both halves — the ANSWER (whose rounds, and which slots
// the field is measured on) and the COST. The cost is the reason the answer is
// cached at all: a year holds twelve players × four rounds × eighteen holes of
// documents, and paying that on every open of a tab, on every phone, is not a
// way to draw a bar chart. What a second open must cost is one count query.
//
// Firestore is mocked, on the same pattern as editions.summaries.test.
// jsdom for localStorage: the cache is half of what is being tested.
import { describe, it, expect, beforeEach, vi } from "vitest";

let DB = {};
let reads = [];
let failCollections = new Set();

const rowsIn = (col, wh = []) => (DB[col] || []).filter(r =>
  wh.every(w => r[w.field] === w.value));

vi.mock("../firebase", () => ({
  _db: {},
  // 2027 is the year being played — the one loadLiveRounds must leave alone.
  getActiveTournamentId: () => "wbc_2027",
  setActiveTournamentId: () => {},
  getEditionSlug: () => "2027",
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
    if (failCollections.has(q.col)) throw new Error(`denied: ${q.col}`);
    return { data: () => ({ count: rowsIn(q.col, q.wh || []).length }) };
  },
}));

const { loadLiveRounds, cachedLiveRounds } = await import("./editions");

// ── The fixture ───────────────────────────────────────────────────
// Four years the loader has to tell apart: one inside the bundled history, the
// one that has been played since, the sandbox, and the year being played.
const CARD = (tid, pid, round, strokes) =>
  Array.from({ length: 18 }, (_, i) => ({
    tournament_id: tid, player_id: pid, round_number: round,
    hole_number: i + 1, score: strokes,
  }));

const countOf = (op, col, tid = undefined) => reads.filter(r =>
  r.op === op && r.col === col && (tid === undefined || r.tid === tid)).length;

beforeEach(() => {
  localStorage.clear();
  reads = [];
  failCollections = new Set();
  DB = {
    wbc_editions: [
      { id: "wbc_2015", year: 2015, name: "WBC 2015" },
      { id: "wbc_2026", year: 2026, name: "WBC 2026" },
      { id: "wbc_2027", year: 2027, name: "WBC 2027" },
      { id: "wbc_demo", year: 2026, name: "Sandbox" },
    ],
    tournament_rounds: [
      { tournament_id: "wbc_2026", round_number: 1, course_id: "treetops" },
      { tournament_id: "wbc_2026", round_number: 2, course_id: "treetops" },
      { tournament_id: "wbc_2027", round_number: 1, course_id: "treetops" },
    ],
    courses: [{ id: "treetops", name: "THE MASTERPIECE", rating: 71.4, slope: 134, par: 71 }],
    tee_boxes: [{ course_id: "treetops", name: "BLUE", rating: 70.1, slope: 128, par: 71 }],
    tee_assignments: [{ tournament_id: "wbc_2026", round_number: 2, player_id: "matt_v", tee_name: "BLUE" }],
    hole_scores: [
      ...CARD("wbc_2026", "matt_v", 1, 5),
      ...CARD("wbc_2026", "matt_v", 2, 5),
      ...CARD("wbc_2026", "aaron_j", 1, 4),
      ...CARD("wbc_2027", "matt_v", 1, 5),
      ...CARD("wbc_demo", "tester_t", 1, 6),
    ],
  };
});

describe("loadLiveRounds — the answer", () => {
  it("hands back last year's rounds, under the player who played them", async () => {
    const live = await loadLiveRounds();
    expect(live.byPlayer.matt_v.map(r => r.key)).toEqual(["2026-2", "2026-1"]);
    expect(live.byPlayer.aaron_j.map(r => r.key)).toEqual(["2026-1"]);
    // 18 holes of 5, against the course's own rating where no tee was assigned:
    // (90 − 71.4) × 113 / 134.
    expect(live.byPlayer.matt_v[1].gross).toBe(90);
    expect(live.byPlayer.matt_v[1].differential).toBe(15.7);
  });

  // The rating a round is handicapped against must be the one it was PLAYED
  // off, which is the tee, falling back to the course. Same resolution calcCH
  // scores the round with.
  it("measures a round against the tee the player was assigned", async () => {
    const live = await loadLiveRounds();
    expect(live.byPlayer.matt_v[0].differential).toBe(17.6);   // (90 − 70.1) × 113 / 128
  });

  it("reports the rounds the tournament played, for the asterisk to measure against", async () => {
    expect((await loadLiveRounds()).slots).toEqual(["2026-2", "2026-1"]);
  });

  // Three years it must not touch, for three different reasons: 2015 is
  // already in the bundled history and would be counted twice, the sandbox is
  // testers' practice and belongs to nobody's career, and 2027 is being played
  // — its scores are already streaming into the app over a live listener.
  it("leaves alone the years that are not its business", async () => {
    const live = await loadLiveRounds();
    expect(live.byPlayer.tester_t).toBeUndefined();
    expect(live.slots.some(k => k.startsWith("2015") || k.startsWith("2027"))).toBe(false);
    for (const tid of ["wbc_2015", "wbc_2027", "wbc_demo"]) {
      expect(countOf("count", "hole_scores", tid), tid).toBe(0);
      expect(countOf("getDocs", "hole_scores", tid), tid).toBe(0);
    }
  });
});

describe("loadLiveRounds — what it costs", () => {
  it("reads a year's cards once and then asks only whether the count moved", async () => {
    await loadLiveRounds();
    expect(countOf("getDocs", "hole_scores")).toBe(1);
    reads = [];

    const again = await loadLiveRounds();
    expect(countOf("count", "hole_scores")).toBe(1);
    expect(countOf("getDocs", "hole_scores")).toBe(0);
    expect(again.byPlayer.matt_v.map(r => r.key)).toEqual(["2026-2", "2026-1"]);
  });

  it("re-reads the cards once the count has moved", async () => {
    await loadLiveRounds();
    DB.hole_scores.push(...CARD("wbc_2026", "brian_k", 1, 4));
    reads = [];

    const again = await loadLiveRounds();
    expect(countOf("getDocs", "hole_scores")).toBe(1);
    expect(again.byPlayer.brian_k.map(r => r.key)).toEqual(["2026-1"]);
  });

  // A cached year is the whole answer, so the tab paints its chart on the
  // frame it opens rather than after a round trip.
  it("remembers across a reload, with no network at all", async () => {
    await loadLiveRounds();
    reads = [];
    expect(cachedLiveRounds().byPlayer.matt_v.map(r => r.key)).toEqual(["2026-2", "2026-1"]);
    expect(reads).toHaveLength(0);
  });

  it("knows nothing before anything has been loaded", () => {
    expect(cachedLiveRounds()).toEqual({ byPlayer: {}, slots: [] });
  });
});

describe("loadLiveRounds — when Firestore says no", () => {
  // The index of years is read fresh every time rather than taken from the
  // picker's cache, which is only written when somebody opens Tournaments. The
  // year this is looking for is by definition a new one.
  it("finds a year created since this device last opened the picker", async () => {
    await loadLiveRounds();
    DB.wbc_editions.push({ id: "wbc_2029", year: 2029, name: "WBC 2029" });
    DB.tournament_rounds.push({ tournament_id: "wbc_2029", round_number: 1, course_id: "treetops" });
    DB.hole_scores.push(...CARD("wbc_2029", "matt_v", 1, 4));

    const live = await loadLiveRounds();
    expect(live.slots).toContain("2029-1");
  });

  // A network that failed is not a career that vanished. The rounds already on
  // this device stay, rather than every index quietly dropping a year.
  it("keeps what it already knew about a year it cannot read", async () => {
    await loadLiveRounds();
    failCollections = new Set(["hole_scores"]);
    const live = await loadLiveRounds();
    expect(live.byPlayer.matt_v.map(r => r.key)).toEqual(["2026-2", "2026-1"]);
  });

  it("says nothing rather than throwing when it has never read a thing", async () => {
    failCollections = new Set(["hole_scores"]);
    await expect(loadLiveRounds()).resolves.toEqual({ byPlayer: {}, slots: [] });
  });

  it("keeps what it knew when it cannot even read the list of years", async () => {
    await loadLiveRounds();
    failCollections = new Set(["wbc_editions"]);
    const live = await loadLiveRounds();
    expect(live.byPlayer.matt_v.map(r => r.key)).toEqual(["2026-2", "2026-1"]);
  });
});
