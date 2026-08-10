import { describe, it, expect } from "vitest";
import { isScoringOpen, SCORING_LEAD_MIN } from "./scoringGate";

// Round 1 is played on the 26th at 8:00 AM.
const ROUND_DATES = { 1: "2026-08-26", 2: "2026-08-27" };
const at = (h, m, day = 26) => new Date(2026, 7, day, h, m);

const ask = (extra = {}) => isScoringOpen({
  round: 1,
  teeTime: "8:00 AM",
  roundDates: ROUND_DATES,
  scoringOpen: {},
  isDirector: false,
  now: at(7, 45),
  ...extra,
});

describe("isScoringOpen — the ordinary morning", () => {
  it("opens SCORING_LEAD_MIN before the tee time", () => {
    expect(ask({ now: at(7, 30) })).toBe(true);
  });

  it("is shut a minute before that", () => {
    expect(ask({ now: at(7, 29) })).toBe(false);
  });

  it("stays open all the way round", () => {
    expect(ask({ now: at(8, 0) })).toBe(true);
    expect(ask({ now: at(12, 30) })).toBe(true);
    expect(ask({ now: at(23, 59) })).toBe(true);
  });

  it("is shut first thing in the morning", () => {
    expect(ask({ now: at(6, 0) })).toBe(false);
  });

  it("uses the lead time it publishes", () => {
    const teeMin = 8 * 60;
    const open = teeMin - SCORING_LEAD_MIN;
    expect(ask({ now: at(Math.floor(open / 60), open % 60) })).toBe(true);
  });
});

// The failure this gate exists to prevent: Round 3 scores landing in Round 1.
describe("isScoringOpen — the wrong round", () => {
  it("is shut on a round that is not today", () => {
    expect(isScoringOpen({
      round: 2, teeTime: "8:00 AM", roundDates: ROUND_DATES, scoringOpen: {},
      isDirector: false, now: at(9, 0, 26),
    })).toBe(false);
  });

  it("opens that same round on its own day", () => {
    expect(isScoringOpen({
      round: 2, teeTime: "8:00 AM", roundDates: ROUND_DATES, scoringOpen: {},
      isDirector: false, now: at(9, 0, 27),
    })).toBe(true);
  });

  it("is shut the day after, so nobody posts into yesterday", () => {
    expect(ask({ now: at(9, 0, 27) })).toBe(false);
  });
});

describe("isScoringOpen — closed by default when it cannot tell", () => {
  it("is shut with no date on the round", () => {
    expect(ask({ roundDates: {} })).toBe(false);
    expect(ask({ roundDates: null })).toBe(false);
  });

  it("is shut with no tee time", () => {
    expect(ask({ teeTime: null, now: at(12, 0) })).toBe(false);
    expect(ask({ teeTime: "", now: at(12, 0) })).toBe(false);
  });

  it("is shut on a tee time it cannot read", () => {
    expect(ask({ teeTime: "sometime after breakfast", now: at(12, 0) })).toBe(false);
  });
});

describe("isScoringOpen — the two ways in", () => {
  // The fix-it path. A gate that locks the director out locks out the only
  // person who can repair a card entered against the wrong name.
  it("is always open to a director", () => {
    expect(ask({ isDirector: true, now: at(3, 0) })).toBe(true);
    expect(ask({ isDirector: true, roundDates: {}, teeTime: null })).toBe(true);
    expect(ask({ isDirector: true, now: at(9, 0, 27) })).toBe(true);
  });

  // Rain delay, shotgun start, a round moved forward.
  it("opens when a director forces the round open", () => {
    expect(ask({ scoringOpen: { 1: true }, now: at(3, 0) })).toBe(true);
    expect(ask({ scoringOpen: { 1: true }, roundDates: {} })).toBe(true);
  });

  it("does not open a DIFFERENT round when one is forced", () => {
    expect(isScoringOpen({
      round: 2, teeTime: "8:00 AM", roundDates: ROUND_DATES, scoringOpen: { 1: true },
      isDirector: false, now: at(9, 0, 26),
    })).toBe(false);
  });

  it("treats anything but an explicit true as not forced", () => {
    expect(ask({ scoringOpen: { 1: false }, now: at(3, 0) })).toBe(false);
    expect(ask({ scoringOpen: { 1: "yes" }, now: at(3, 0) })).toBe(false);
  });
});

describe("isScoringOpen — an afternoon tee time", () => {
  it("opens half an hour before a 1:15 PM start", () => {
    expect(ask({ teeTime: "1:15 PM", now: at(12, 45) })).toBe(true);
    expect(ask({ teeTime: "1:15 PM", now: at(12, 44) })).toBe(false);
  });
});
