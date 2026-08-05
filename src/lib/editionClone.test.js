import { describe, it, expect } from "vitest";
import {
  nextEditionYear, defaultCloneSource, reyearName, cloneMeta, cloneSideGames,
  cloneRosterRow, cloneRoundRow, editionDoc, overwriteWarning,
} from "./editionClone";

describe("nextEditionYear", () => {
  it("offers the year after the newest edition", () => {
    expect(nextEditionYear([{ year: 2025 }, { year: 2024 }], 2026)).toBe(2026);
    expect(nextEditionYear([{ year: 2025 }, { year: 2026 }], 2026)).toBe(2027);
  });

  it("never offers a year the tournament has already skipped past", () => {
    // Last played 2025, it is now 2028 — 2026 is not the year being planned.
    expect(nextEditionYear([{ year: 2025 }], 2028)).toBe(2028);
  });

  it("falls back to the current year with no editions at all", () => {
    expect(nextEditionYear([], 2026)).toBe(2026);
    expect(nextEditionYear(undefined, 2026)).toBe(2026);
  });

  it("ignores rows with no usable year", () => {
    expect(nextEditionYear([{ year: 2025 }, { year: null }, {}], 2026)).toBe(2026);
  });

  // The case this rule exists for: wbc_2026 is already in the list because a
  // phone pointed at it, empty, while 2025 is the year that was played.
  it("offers the draft year that is already claimed but not yet built", () => {
    const rows = [
      { id: "wbc_2026", year: 2026, status: "draft" },
      { id: "wbc_2025", year: 2025, status: "published" },
    ];
    expect(nextEditionYear(rows, 2026)).toBe(2026);
  });

  it("ignores a draft for a year already behind us", () => {
    const rows = [
      { id: "wbc_2026", year: 2026, status: "published" },
      { id: "wbc_2024", year: 2024, status: "draft" },
    ];
    expect(nextEditionYear(rows, 2026)).toBe(2027);
  });

  it("takes the earliest unbuilt year when several are drafted", () => {
    const rows = [
      { id: "wbc_2027", year: 2027, status: "draft" },
      { id: "wbc_2026", year: 2026, status: "draft" },
    ];
    expect(nextEditionYear(rows, 2026)).toBe(2026);
  });
});

describe("defaultCloneSource", () => {
  const rows = [
    { id: "wbc_2026", year: 2026, status: "draft" },
    { id: "wbc_2025", year: 2025, status: "published" },
    { id: "wbc_2024", year: 2024, status: "archived" },
  ];

  it("clones from the last year actually played, not the empty draft", () => {
    expect(defaultCloneSource(rows, 2026)).toBe("wbc_2025");
  });

  it("never clones from a year at or after the target", () => {
    expect(defaultCloneSource(rows, 2025)).toBe("wbc_2024");
  });

  it("falls back to a draft when there is nothing else behind the target", () => {
    expect(defaultCloneSource([{ id: "wbc_2025", year: 2025, status: "draft" }], 2026)).toBe("wbc_2025");
  });

  it("has no source with nothing behind the target", () => {
    expect(defaultCloneSource(rows, 2024)).toBe("");
    expect(defaultCloneSource([], 2026)).toBe("");
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

  it("carries the handicap index forward as this year's starting point", () => {
    expect(cloneRosterRow(tp, { slug: "2026", tournamentId: "wbc_2026" }).handicap_index).toBe(12.4);
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
