import { describe, it, expect } from "vitest";
import { teeTimeLabel, teeTimesByPlayer, roundInPlay, thruStatus } from "./thruStatus";

describe("teeTimeLabel", () => {
  it("collapses the meridiem to one letter so a time fits the column", () => {
    expect(teeTimeLabel("8:40 AM")).toBe("8:40a");
    expect(teeTimeLabel("10:20 pm")).toBe("10:20p");
    expect(teeTimeLabel("8:40a.m.")).toBe("8:40a");
  });

  it("leaves a bare time alone", () => {
    expect(teeTimeLabel("8:40")).toBe("8:40");
    expect(teeTimeLabel("12:10")).toBe("12:10");
  });

  it("passes through anything that isn't a time", () => {
    // A director who typed "Shotgun" meant it; cutting it down would be worse
    // than letting it run long.
    expect(teeTimeLabel("Shotgun")).toBe("Shotgun");
  });

  it("is empty for nothing", () => {
    expect(teeTimeLabel("")).toBe("");
    expect(teeTimeLabel("   ")).toBe("");
    expect(teeTimeLabel(null)).toBe("");
    expect(teeTimeLabel(undefined)).toBe("");
  });
});

describe("teeTimesByPlayer", () => {
  it("gives every player in a group that group's time", () => {
    const map = teeTimesByPlayer([["a", "b"], ["c"]], ["8:40", "8:50"]);
    expect(map).toEqual({ a: "8:40", b: "8:40", c: "8:50" });
  });

  it("is empty-string, not undefined, for a group with no time set", () => {
    expect(teeTimesByPlayer([["a"]], [])).toEqual({ a: "" });
  });

  it("survives missing pairings entirely", () => {
    expect(teeTimesByPlayer()).toEqual({});
    expect(teeTimesByPlayer([null, ["a"]], ["8:40", "8:50"])).toEqual({ a: "8:50" });
  });
});

describe("roundInPlay", () => {
  const rows = (...thrus) => thrus.map(t => ({ rds: [{ thru: t }] }));

  it("is false before anyone posts a score", () => {
    expect(roundInPlay(rows(0, 0), 1, false)).toBe(false);
  });

  it("is true from the first score posted", () => {
    expect(roundInPlay(rows(1, 0), 1, false)).toBe(true);
  });

  // The stretch this exists for: every card is in, nothing is finalized, and
  // the board should still be showing today's 18 rather than the total.
  it("stays true once every group is in at 18", () => {
    expect(roundInPlay(rows(18, 18), 1, false)).toBe(true);
  });

  it("ends when the director finalizes", () => {
    expect(roundInPlay(rows(18, 18), 1, true)).toBe(false);
  });

  it("reads the round asked for, not the first one", () => {
    const p = [{ rds: [{ thru: 18 }, { thru: 0 }] }];
    expect(roundInPlay(p, 2, false)).toBe(false);
  });

  it("survives a player with no round data", () => {
    expect(roundInPlay([{}, { rds: [] }], 1, false)).toBe(false);
  });
});

describe("thruStatus", () => {
  it("counts only this round while it is being played", () => {
    expect(thruStatus({ inPlay: true, roundThru: 5, totalThru: 41 }))
      .toEqual({ kind: "thru", text: "5" });
  });

  it("holds at 18 after a group walks off, until the round is finalized", () => {
    expect(thruStatus({ inPlay: true, roundThru: 18, totalThru: 54 }))
      .toEqual({ kind: "thru", text: "18" });
    expect(thruStatus({ inPlay: false, roundThru: 18, totalThru: 54 }))
      .toEqual({ kind: "total", text: "54" });
  });

  it("shows the tee time for a group that has not gone out", () => {
    expect(thruStatus({ inPlay: true, roundThru: 0, totalThru: 36, teeTime: "8:40 AM" }))
      .toEqual({ kind: "tee", text: "8:40a" });
  });

  it("falls back to a dash when that group has no tee time set", () => {
    expect(thruStatus({ inPlay: true, roundThru: 0, totalThru: 36 }))
      .toEqual({ kind: "none", text: "—" });
  });

  it("shows the tournament total when no round is in play", () => {
    expect(thruStatus({ inPlay: false, totalThru: 36 }))
      .toEqual({ kind: "total", text: "36" });
  });

  it("is a dash for a player who has not played a hole all week", () => {
    expect(thruStatus({ inPlay: false, totalThru: 0 })).toEqual({ kind: "none", text: "—" });
  });

  it("is a dash for a withdrawn player, tee time or not", () => {
    expect(thruStatus({ inPlay: true, isWD: true, teeTime: "8:40" }))
      .toEqual({ kind: "none", text: "—" });
  });

  it("defaults to a dash with no arguments at all", () => {
    expect(thruStatus()).toEqual({ kind: "none", text: "—" });
  });
});
