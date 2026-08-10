import { describe, it, expect } from "vitest";
import { fmtPar, teeTimeToMinutes, minutesToTimeStr, localDateISO, fmtRoundDate } from "./format";

describe("fmtPar", () => {
  it("writes level par the way a scoreboard does", () => {
    expect(fmtPar(0)).toBe("E");
  });

  it("signs the over-par side", () => {
    expect(fmtPar(1)).toBe("+1");
    expect(fmtPar(11)).toBe("+11");
  });

  it("leaves the under-par side with its own minus", () => {
    expect(fmtPar(-1)).toBe("-1");
    expect(fmtPar(-11)).toBe("-11");
  });

  // A round not yet played is not a round shot level.
  it("distinguishes no score from a score of nothing", () => {
    expect(fmtPar(null)).toBe("—");
    expect(fmtPar(undefined)).toBe("—");
    expect(fmtPar(0)).toBe("E");
  });
});

describe("teeTimeToMinutes", () => {
  it("reads a morning tee time", () => {
    expect(teeTimeToMinutes("8:00 AM")).toBe(8 * 60);
    expect(teeTimeToMinutes("7:30 AM")).toBe(7 * 60 + 30);
  });

  it("reads an afternoon one", () => {
    expect(teeTimeToMinutes("1:15 PM")).toBe(13 * 60 + 15);
  });

  it("handles both noons", () => {
    expect(teeTimeToMinutes("12:00 PM")).toBe(12 * 60);
    expect(teeTimeToMinutes("12:30 AM")).toBe(30);
  });

  it("does not care about case or spacing", () => {
    expect(teeTimeToMinutes("8:05am")).toBe(8 * 60 + 5);
    expect(teeTimeToMinutes("8:05 am")).toBe(8 * 60 + 5);
  });

  it("takes a bare time as 24-hour", () => {
    expect(teeTimeToMinutes("14:20")).toBe(14 * 60 + 20);
  });

  // Null, not 0. Midnight IS 0, so a caller testing truthiness on a failed
  // parse would put that group at the top of the tee sheet.
  it("answers null for anything it cannot read", () => {
    expect(teeTimeToMinutes("")).toBe(null);
    expect(teeTimeToMinutes(null)).toBe(null);
    expect(teeTimeToMinutes("soon")).toBe(null);
    expect(teeTimeToMinutes("8 AM")).toBe(null);
  });
});

describe("minutesToTimeStr", () => {
  it("prints the morning", () => {
    expect(minutesToTimeStr(8 * 60)).toBe("8:00 AM");
    expect(minutesToTimeStr(7 * 60 + 5)).toBe("7:05 AM");
  });

  it("prints the afternoon", () => {
    expect(minutesToTimeStr(13 * 60 + 15)).toBe("1:15 PM");
  });

  it("prints both noons the way a clock does", () => {
    expect(minutesToTimeStr(12 * 60)).toBe("12:00 PM");
    expect(minutesToTimeStr(0)).toBe("12:00 AM");
  });

  it("wraps past midnight rather than printing a 25th hour", () => {
    expect(minutesToTimeStr(25 * 60)).toBe("1:00 AM");
    expect(minutesToTimeStr(-30)).toBe("11:30 PM");
  });

  it("is empty for no time at all", () => {
    expect(minutesToTimeStr(null)).toBe("");
    expect(minutesToTimeStr(undefined)).toBe("");
  });

  it("round-trips whatever the tee sheet holds", () => {
    for (const t of ["7:00 AM", "8:10 AM", "12:00 PM", "1:45 PM", "6:05 PM"]) {
      expect(minutesToTimeStr(teeTimeToMinutes(t))).toBe(t);
    }
  });
});

describe("localDateISO", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(localDateISO(new Date(2026, 7, 15))).toBe("2026-08-15");
  });

  it("pads single-digit months and days", () => {
    expect(localDateISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  // The bug this shape exists to avoid: toISOString() is UTC, so an evening
  // in Michigan is already tomorrow in London.
  it("uses the LOCAL day, not UTC", () => {
    const lateEvening = new Date(2026, 7, 15, 22, 30);
    expect(localDateISO(lateEvening)).toBe("2026-08-15");
  });
});

describe("fmtRoundDate", () => {
  it("prints a round's date the way the chips show it", () => {
    expect(fmtRoundDate("2026-08-15")).toMatch(/Aug/);
    expect(fmtRoundDate("2026-08-15")).toMatch(/15/);
  });

  // `new Date("2026-08-15")` parses as UTC midnight and renders local, which
  // is yesterday for most of the Americas. Parsing the parts avoids it.
  it("does not slip a day west of Greenwich", () => {
    expect(fmtRoundDate("2026-08-15")).toBe(new Date(2026, 7, 15).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
  });

  it("is empty for no date and for nonsense", () => {
    expect(fmtRoundDate("")).toBe("");
    expect(fmtRoundDate(null)).toBe("");
    expect(fmtRoundDate("not-a-date")).toBe("");
  });
});
