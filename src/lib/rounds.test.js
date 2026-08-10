import { describe, it, expect, afterEach } from "vitest";
import { NUM_ROUNDS, setRoundCount, getRoundCount, roundList } from "./rounds";
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
