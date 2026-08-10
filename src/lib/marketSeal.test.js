import { describe, it, expect } from "vitest";
import { betsToHold, shouldPublish, betsSignature } from "./marketSeal";

const bet = (pid, opening = [], mid = []) => ({ pid, opening, mid });
const lot = (pid, shares) => ({ pid, shares });

const MINE = [bet("mike_r", [lot("aaron_j", 20)])];
const ALL = [
  bet("mike_r", [lot("aaron_j", 20)]),
  bet("aaron_j", [lot("aaron_j", 12), lot("mike_r", 8)]),
];
const PUBLISHED = ALL;

describe("betsToHold", () => {
  it("gives a player their own book and nothing else while sealed", () => {
    expect(betsToHold({ own: MINE })).toEqual(MINE);
  });

  it("gives a director every book, throughout", () => {
    expect(betsToHold({ own: MINE, all: ALL, isDirector: true })).toEqual(ALL);
  });

  it("gives a player every book once a director has published them", () => {
    expect(betsToHold({ own: MINE, published: PUBLISHED })).toEqual(PUBLISHED);
  });

  // The director may still be correcting a book after the snapshot was taken.
  it("prefers a director's live read over the published snapshot", () => {
    const corrected = [...ALL, bet("carl_x", [lot("carl_x", 20)])];
    expect(betsToHold({ own: MINE, all: corrected, published: PUBLISHED, isDirector: true })).toEqual(corrected);
  });

  it("falls back to the published copy for a director whose wide read has not landed", () => {
    expect(betsToHold({ own: MINE, all: null, published: PUBLISHED, isDirector: true })).toEqual(PUBLISHED);
  });

  it("is empty rather than undefined when this phone has nothing", () => {
    expect(betsToHold({})).toEqual([]);
    expect(betsToHold({ own: null })).toEqual([]);
  });
});

describe("betsSignature", () => {
  it("does not care what order the books arrived in", () => {
    expect(betsSignature(ALL)).toBe(betsSignature([...ALL].reverse()));
  });

  it("does not care what order the lots arrived in", () => {
    const a = [bet("mike_r", [lot("aaron_j", 5), lot("carl_x", 3)])];
    const b = [bet("mike_r", [lot("carl_x", 3), lot("aaron_j", 5)])];
    expect(betsSignature(a)).toBe(betsSignature(b));
  });

  it("changes when somebody moves a share", () => {
    const moved = [bet("mike_r", [lot("aaron_j", 19)])];
    expect(betsSignature(MINE)).not.toBe(betsSignature(moved));
  });

  it("changes when a new book appears", () => {
    expect(betsSignature(MINE)).not.toBe(betsSignature(ALL));
  });

  it("distinguishes the two windows", () => {
    const opening = [bet("mike_r", [lot("aaron_j", 10)], [])];
    const mid = [bet("mike_r", [], [lot("aaron_j", 10)])];
    expect(betsSignature(opening)).not.toBe(betsSignature(mid));
  });

  it("is empty for nothing at all", () => {
    expect(betsSignature([])).toBe("");
    expect(betsSignature(null)).toBe("");
  });
});

describe("shouldPublish", () => {
  const base = { isDirector: true, eventComplete: true, bets: ALL, publishedSignature: "" };

  it("publishes once the event is over", () => {
    expect(shouldPublish(base)).toBe(true);
  });

  it("does not publish from a player's device", () => {
    expect(shouldPublish({ ...base, isDirector: false })).toBe(false);
  });

  it("does not publish mid-tournament — that would be the leak itself", () => {
    expect(shouldPublish({ ...base, eventComplete: false })).toBe(false);
  });

  it("does not publish an empty board", () => {
    expect(shouldPublish({ ...base, bets: [] })).toBe(false);
    expect(shouldPublish({ ...base, bets: null })).toBe(false);
  });

  // The one that stops it writing on every snapshot.
  it("does not republish what is already published", () => {
    expect(shouldPublish({ ...base, publishedSignature: betsSignature(ALL) })).toBe(false);
  });

  it("republishes after a director corrects a book", () => {
    const corrected = [...ALL, bet("carl_x", [lot("carl_x", 20)])];
    expect(shouldPublish({ ...base, bets: corrected, publishedSignature: betsSignature(ALL) })).toBe(true);
  });
});
