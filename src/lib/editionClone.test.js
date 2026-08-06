import { describe, it, expect } from "vitest";
import {
  plannedYear, plannedSource, summaryLine, editionHasContent, newestBuiltEdition,
  reyearName, cloneMeta, cloneSideGames,
  cloneRosterRow, cloneRoundRow, editionDoc, overwriteWarning, rosterHandicap,
} from "./editionClone";

// The real shape this screen got wrong once, and must never get wrong again:
// a finished 2025 labelled DRAFT, and an empty 2026 — the app's original
// default pointer — labelled PUBLISHED. Every default below has to read the
// COUNTS and ignore the labels.
const REAL = [
  { id: "wbc_2026", year: 2026, status: "published" },
  { id: "wbc_2025", year: 2025, status: "draft" },
];
const REAL_SUMS = {
  wbc_2026: { players: 0, rounds: 0, scores: 0 },
  wbc_2025: { players: 16, rounds: 4, scores: 1368 },
};

describe("editionHasContent", () => {
  it("is true for a year holding anything at all", () => {
    expect(editionHasContent({ players: 16, rounds: 0, scores: 0 })).toBe(true);
    expect(editionHasContent({ players: 0, rounds: 0, scores: 3 })).toBe(true);
  });

  it("is false for an empty year, and for one we couldn't read", () => {
    expect(editionHasContent({ players: 0, rounds: 0, scores: 0 })).toBe(false);
    expect(editionHasContent(undefined)).toBe(false);
  });
});

describe("newestBuiltEdition", () => {
  it("picks the year that holds a tournament, not the newest row", () => {
    expect(newestBuiltEdition(REAL, REAL_SUMS)?.id).toBe("wbc_2025");
  });

  it("knows nothing without counts", () => {
    expect(newestBuiltEdition(REAL, null)).toBe(null);
  });
});

describe("plannedYear", () => {
  it("offers the year after the last one actually played", () => {
    // 2026 exists but is empty — that is the year being built, not a year to
    // skip past. This is the exact bug the counts were added to kill.
    expect(plannedYear(REAL, REAL_SUMS, 2026)).toBe(2026);
  });

  it("moves on once that year has a tournament in it", () => {
    const sums = { ...REAL_SUMS, wbc_2026: { players: 16, rounds: 4, scores: 20 } };
    expect(plannedYear(REAL, sums, 2026)).toBe(2027);
  });

  it("never offers a year the tournament has already skipped past", () => {
    const rows = [{ id: "wbc_2025", year: 2025 }];
    expect(plannedYear(rows, { wbc_2025: { players: 16 } }, 2028)).toBe(2028);
  });

  it("falls back to one past the newest row when the counts failed", () => {
    expect(plannedYear(REAL, null, 2026)).toBe(2027);
  });

  it("falls back to the current year with no editions at all", () => {
    expect(plannedYear([], REAL_SUMS, 2026)).toBe(2026);
    expect(plannedYear(undefined, null, 2026)).toBe(2026);
  });

  it("ignores rows with no usable year", () => {
    expect(plannedYear([{ id: "a", year: null }, { id: "b" }], null, 2026)).toBe(2026);
  });
});

describe("plannedSource", () => {
  it("copies from the year that has a tournament in it", () => {
    expect(plannedSource(REAL, REAL_SUMS, 2026)).toBe("wbc_2025");
  });

  it("never copies from the target year or later", () => {
    const rows = [...REAL, { id: "wbc_2024", year: 2024, status: "archived" }];
    const sums = { ...REAL_SUMS, wbc_2024: { players: 14, rounds: 4, scores: 1000 } };
    expect(plannedSource(rows, sums, 2025)).toBe("wbc_2024");
  });

  it("falls back to the newest earlier year when nothing behind it has content", () => {
    const rows = [{ id: "wbc_2025", year: 2025 }];
    expect(plannedSource(rows, { wbc_2025: { players: 0, rounds: 0, scores: 0 } }, 2026)).toBe("wbc_2025");
    expect(plannedSource(rows, null, 2026)).toBe("wbc_2025");
  });

  it("has no source with nothing behind the target", () => {
    expect(plannedSource(REAL, REAL_SUMS, 2025)).toBe("");
    expect(plannedSource([], null, 2026)).toBe("");
  });
});

describe("summaryLine", () => {
  it("says what a year holds", () => {
    expect(summaryLine({ players: 16, rounds: 4, scores: 1368 })).toBe("16 players · 4 rounds · 1,368 scores");
  });

  it("names an empty year as empty rather than listing nothing", () => {
    expect(summaryLine({ players: 0, rounds: 0, scores: 0 })).toBe("Empty");
  });

  it("leaves out what isn't there, and singularises", () => {
    expect(summaryLine({ players: 1, rounds: 0, scores: 1 })).toBe("1 player · 1 score");
  });

  it("is blank for a year whose counts couldn't be read", () => {
    expect(summaryLine(null)).toBe("");
  });
});

describe("reyearName", () => {
  it("moves the source year onto the new one", () => {
    expect(reyearName("WBC 2025", 2025, 2026)).toBe("WBC 2026");
    expect(reyearName("Wanna Be Cup 2025 — Gaylord", 2025, 2026)).toBe("Wanna Be Cup 2026 — Gaylord");
  });

  it("leaves a name that carries no year alone", () => {
    expect(reyearName("Wanna Be Cup", 2025, 2026)).toBe("Wanna Be Cup");
  });

  it("only touches the source year, not every number", () => {
    expect(reyearName("WBC 2025 · 2000 Club", 2025, 2026)).toBe("WBC 2026 · 2000 Club");
  });

  it("is a no-op without both years", () => {
    expect(reyearName("WBC 2025", null, 2026)).toBe("WBC 2025");
    expect(reyearName("WBC 2025", 2026, 2026)).toBe("WBC 2025");
  });
});

describe("cloneMeta", () => {
  const meta = {
    name: "WBC 2025", location: "Gaylord, MI", rounds: 4,
    startDate: "2025-08-07", endDate: "2025-08-10",
  };

  it("carries the name, location and round count", () => {
    const out = cloneMeta(meta, { fromYear: 2025, toYear: 2026 });
    expect(out.name).toBe("WBC 2026");
    expect(out.location).toBe("Gaylord, MI");
    expect(out.rounds).toBe(4);
  });

  it("never carries last year's dates", () => {
    const out = cloneMeta(meta, { fromYear: 2025, toYear: 2026 });
    expect("startDate" in out).toBe(false);
    expect("endDate" in out).toBe(false);
  });

  it("returns null when there is no meta to clone", () => {
    expect(cloneMeta(null, { fromYear: 2025, toYear: 2026 })).toBe(null);
  });
});

describe("cloneSideGames", () => {
  const src = {
    skins: { amount: 20, in: ["aaron_j", "mike_d"], pot: 260 },
    ctp: { amount: 10, in: ["aaron_j"] },
    lownet: { amount: 0, in: null },
    market: { amount: 25, in: ["mike_d"] },
  };

  it("carries the price of a seat", () => {
    const out = cloneSideGames(src);
    expect(out.skins.amount).toBe(20);
    expect(out.ctp.amount).toBe(10);
    expect(out.market.amount).toBe(25);
  });

  it("never carries who bought in", () => {
    const out = cloneSideGames(src);
    expect(out.skins.in).toBe(null);
    expect(out.ctp.in).toBe(null);
    expect(out.market.in).toBe(null);
  });

  it("zeroes the collected pot rather than leaving last year's standing", () => {
    expect(cloneSideGames(src).skins.pot).toBe(0);
  });

  it("skips games with no price set", () => {
    expect("lownet" in cloneSideGames(src)).toBe(false);
  });

  it("returns null when nothing was priced", () => {
    expect(cloneSideGames({ skins: { amount: 0, in: null } })).toBe(null);
    expect(cloneSideGames(null)).toBe(null);
  });
});

describe("cloneRosterRow", () => {
  const tp = {
    id: "tp_2025_aaron_j", tournament_id: "wbc_2025",
    player_id: "aaron_j", handicap_index: 12.4, status: "wd",
  };

  it("rebuilds the id against the new edition and keeps the career player_id", () => {
    const row = cloneRosterRow(tp, { slug: "2026", tournamentId: "wbc_2026" });
    expect(row.id).toBe("tp_2026_aaron_j");
    expect(row.player_id).toBe("aaron_j");
    expect(row.tournament_id).toBe("wbc_2026");
  });

  it("carries the handicap index forward when the source year was not played", () => {
    expect(cloneRosterRow(tp, { slug: "2026", tournamentId: "wbc_2026" }).handicap_index).toBe(12.4);
  });

  it("starts them on a recomputed index when they played the source year", () => {
    const row = cloneRosterRow(tp, { slug: "2026", tournamentId: "wbc_2026", index: 9.8, playedRounds: 4 });
    expect(row.handicap_index).toBe(9.8);
  });

  it("drops last year's withdrawal", () => {
    expect("status" in cloneRosterRow(tp, { slug: "2026", tournamentId: "wbc_2026" })).toBe(false);
  });

  it("skips a row with no player", () => {
    expect(cloneRosterRow({ id: "tp_2025_x" }, { slug: "2026", tournamentId: "wbc_2026" })).toBe(null);
  });
});

describe("cloneRoundRow", () => {
  const r = { id: "tr_2025_r3", tournament_id: "wbc_2025", round_number: 3, course_id: "treetops_masterpiece" };

  it("rebuilds the id and keeps the course", () => {
    const row = cloneRoundRow(r, { slug: "2026", tournamentId: "wbc_2026" });
    expect(row.id).toBe("tr_2026_r3");
    expect(row.round_number).toBe(3);
    expect(row.course_id).toBe("treetops_masterpiece");
    expect(row.tournament_id).toBe("wbc_2026");
  });

  it("skips a row with no round number", () => {
    expect(cloneRoundRow({ id: "tr_2025_r0", round_number: 0 }, { slug: "2026", tournamentId: "wbc_2026" })).toBe(null);
    expect(cloneRoundRow({}, { slug: "2026", tournamentId: "wbc_2026" })).toBe(null);
  });
});

describe("editionDoc", () => {
  it("starts a brand-new edition as a draft naming its source", () => {
    const d = editionDoc({ year: 2026, id: "wbc_2026", name: "", sourceId: "wbc_2025" });
    expect(d).toEqual({
      id: "wbc_2026", year: 2026, name: "WBC 2026",
      status: "draft", created_from: "wbc_2025",
    });
  });

  it("does not demote an edition that already exists", () => {
    const d = editionDoc({
      year: 2026, id: "wbc_2026", name: "", sourceId: "wbc_2025",
      existing: { id: "wbc_2026", name: "The Big One", status: "published", created_from: null },
    });
    expect(d.status).toBe("published");
    expect(d.name).toBe("The Big One");
    expect(d.created_from).toBe("wbc_2025");
  });

  it("prefers a typed name over the existing one", () => {
    const d = editionDoc({
      year: 2026, id: "wbc_2026", name: "  WBC XVII  ", sourceId: null,
      existing: { name: "The Big One", status: "draft" },
    });
    expect(d.name).toBe("WBC XVII");
  });
});

describe("overwriteWarning", () => {
  it("names only what the clone will actually write", () => {
    expect(overwriteWarning({ players: true, rounds: false, tournamentName: true, buyIns: false }))
      .toEqual(["roster and handicap indexes", "name and location"]);
  });

  it("is empty when the clone copies nothing", () => {
    expect(overwriteWarning({})).toEqual([]);
  });
});


// ── rosterHandicap ──
// What a cloned roster row starts on. The source year has just been played, so
// a man who played it starts the new one on an index that includes those
// rounds; everyone else keeps what they had.
describe("rosterHandicap", () => {
  const tp = { player_id: "aaron_j", handicap_index: 12.4 };

  it("takes the recomputed index for a player who posted cards", () => {
    expect(rosterHandicap(tp, { index: 9.8, playedRounds: 4 })).toBe(9.8);
  });

  it("keeps the carried index when the source year was never played", () => {
    expect(rosterHandicap(tp, { index: 9.8, playedRounds: 0 })).toBe(12.4);
  });

  it("keeps it for a rostered player who posted nothing", () => {
    expect(rosterHandicap(tp, { index: null, playedRounds: 0 })).toBe(12.4);
  });

  // A first-timer with no history: the director's typed number is the only one
  // there is, and scratch-by-accident is the failure to avoid.
  it("keeps a typed number when there is no index to compute", () => {
    expect(rosterHandicap({ handicap_index: 4.7 }, { index: null, playedRounds: 4 })).toBe(4.7);
  });

  it("accepts a scratch recomputed index", () => {
    expect(rosterHandicap(tp, { index: 0, playedRounds: 4 })).toBe(0);
  });

  it("falls back to zero when there is nothing at all", () => {
    expect(rosterHandicap({}, {})).toBe(0);
    expect(rosterHandicap(null, {})).toBe(0);
  });

  it("ignores a carried value that is not a number", () => {
    expect(rosterHandicap({ handicap_index: "" }, {})).toBe(0);
  });
});
