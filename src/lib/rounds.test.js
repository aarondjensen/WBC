import { describe, it, expect, afterEach } from "vitest";
import { NUM_ROUNDS, setRoundCount, getRoundCount, roundList, roundDateChoices } from "./rounds";
import { DEFAULT_NUM_ROUNDS } from "../constants";

// Module state, so every test puts it back.
afterEach(() => setRoundCount(DEFAULT_NUM_ROUNDS));

describe("setRoundCount", () => {
  it("takes the counts the WBC actually plays", () => {
    expect(setRoundCount(3)).toBe(3);
    expect(setRoundCount(4)).toBe(4);
  });

  it("returns the value it took, so it can be assigned from", () => {
    const n = setRoundCount(3);
    expect(n).toBe(getRoundCount());
  });

  // A fat-fingered "44" in Admin would otherwise be 44 empty leaderboard
  // columns. See ROUND_CHOICES.
  it("refuses anything else and falls back to the default", () => {
    expect(setRoundCount(44)).toBe(DEFAULT_NUM_ROUNDS);
    expect(setRoundCount(0)).toBe(DEFAULT_NUM_ROUNDS);
    expect(setRoundCount(-1)).toBe(DEFAULT_NUM_ROUNDS);
    expect(setRoundCount(null)).toBe(DEFAULT_NUM_ROUNDS);
    expect(setRoundCount("many")).toBe(DEFAULT_NUM_ROUNDS);
  });

  it("reads a numeric string, which is what an input gives you", () => {
    expect(setRoundCount("3")).toBe(3);
  });
});

// The property the whole design rests on: an importer sees the CURRENT value,
// not the one that was there when it imported.
describe("NUM_ROUNDS as a live binding", () => {
  it("starts at the default", () => {
    expect(NUM_ROUNDS).toBe(DEFAULT_NUM_ROUNDS);
  });

  it("updates for an importer that already imported it", () => {
    setRoundCount(3);
    expect(NUM_ROUNDS).toBe(3);
    setRoundCount(4);
    expect(NUM_ROUNDS).toBe(4);
  });

  it("agrees with getRoundCount, always", () => {
    for (const n of [3, 4, 3]) {
      setRoundCount(n);
      expect(NUM_ROUNDS).toBe(getRoundCount());
    }
  });
});

describe("roundList", () => {
  it("counts from 1 to the current round count", () => {
    setRoundCount(4);
    expect(roundList()).toEqual([1, 2, 3, 4]);
    setRoundCount(3);
    expect(roundList()).toEqual([1, 2, 3]);
  });

  it("can be asked about a count other than the live one", () => {
    setRoundCount(4);
    expect(roundList(3)).toEqual([1, 2, 3]);
    expect(NUM_ROUNDS).toBe(4);
  });

  it("clamps a nonsense count rather than building a nonsense list", () => {
    expect(roundList(44)).toHaveLength(DEFAULT_NUM_ROUNDS);
  });
});

// ══════════════════════════════════════════════════════════════════
//  The round-date picker's choices
// ══════════════════════════════════════════════════════════════════
//
// Written for a date that could be set and then never changed. A director put
// the wrong day on a round of the demo edition and found no way back to the
// calendar: the sandbox has no event dates (cloneMeta drops them on purpose),
// so there were no days to list — but the picker appended the round's OWN date
// to the empty list, producing a one-item list containing exactly the thing
// being changed. A one-item list is not a choice, and the calendar it should
// have fallen back to never rendered.
describe("roundDateChoices", () => {
  const DAYS = ["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"];

  it("offers the event's days", () => {
    expect(roundDateChoices(DAYS, "2026-08-28")).toEqual(DAYS);
  });

  it("offers them when the round has no date yet", () => {
    expect(roundDateChoices(DAYS, "")).toEqual(DAYS);
  });

  // A round scheduled before the event dates were set, or after they moved,
  // still has to show — otherwise it reads as unscheduled while the scoring
  // gate and the leaderboard are both using that date.
  it("keeps a date that falls outside the event, alongside the real days", () => {
    expect(roundDateChoices(DAYS, "2026-09-04")).toEqual([...DAYS, "2026-09-04"]);
  });

  // ── The one this exists for ──
  // No event dates means no list at all, so the caller shows a calendar. The
  // stray-date append is for reconciling a real schedule against a date
  // outside it; with no schedule there is nothing to reconcile, and appending
  // turns "pick any day" into "here is the day you already picked".
  it("offers nothing when the event has no dates, even with a date set", () => {
    expect(roundDateChoices([], "2026-08-30")).toEqual([]);
    expect(roundDateChoices([], "")).toEqual([]);
  });

  it("survives the shapes a cold load hands it", () => {
    expect(roundDateChoices()).toEqual([]);
    expect(roundDateChoices(null, null)).toEqual([]);
    expect(roundDateChoices([null, "2026-08-27", ""], "")).toEqual(["2026-08-27"]);
  });

  it("does not duplicate a date that is already one of the days", () => {
    expect(roundDateChoices(DAYS, "2026-08-29")).toEqual(DAYS);
  });
});
