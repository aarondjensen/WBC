import { describe, it, expect } from "vitest";
import { rowsToTeeTimes, mergeTeeTimes } from "./teeSheet";

const row = (round, group, player, tee_time) => ({
  round_number: round, group_number: group, player_id: player, tee_time,
});

describe("rowsToTeeTimes", () => {
  it("reads one time per group off the rows", () => {
    const tt = rowsToTeeTimes([
      row(1, 1, "a", "8:40 AM"), row(1, 1, "b", "8:40 AM"),
      row(1, 2, "c", "8:48 AM"),
    ]);
    expect(tt[1]).toEqual(["8:40 AM", "8:48 AM"]);
  });

  it("leaves a group with no rows UNKNOWN, not blank", () => {
    // Group 1 has nobody in it; group 2 does.
    const tt = rowsToTeeTimes([row(1, 2, "c", "8:48 AM")]);
    expect(tt[1][0]).toBeUndefined();
    expect(tt[1][1]).toBe("8:48 AM");
  });

  it("reads a cleared time as blank, which is not unknown", () => {
    const tt = rowsToTeeTimes([row(1, 1, "a", null)]);
    expect(tt[1][0]).toBe("");
  });

  it("ignores malformed rows rather than throwing", () => {
    expect(rowsToTeeTimes(null)).toEqual({});
    expect(rowsToTeeTimes([null, {}, row(1, 0, "a", "9:00 AM")])).toEqual({});
  });
});

describe("mergeTeeTimes", () => {
  const known = { 1: ["8:40 AM", "8:48 AM", "8:56 AM"] };

  it("keeps a time for a group the snapshot cannot report", () => {
    // Mid re-group: group 2's rows are gone for an instant.
    const snapshot = { 1: ["8:40 AM", undefined, "8:56 AM"] };
    expect(mergeTeeTimes(known, snapshot)[1]).toEqual(["8:40 AM", "8:48 AM", "8:56 AM"]);
  });

  it("keeps the whole round when the snapshot has no rows for it", () => {
    expect(mergeTeeTimes(known, {})[1]).toEqual(["8:40 AM", "8:48 AM", "8:56 AM"]);
  });

  it("keeps groups past the end of a short snapshot", () => {
    const snapshot = { 1: ["8:40 AM"] };
    expect(mergeTeeTimes(known, snapshot)[1]).toEqual(["8:40 AM", "8:48 AM", "8:56 AM"]);
  });

  it("lets the director clear a time", () => {
    // "" is a decision, not an absence — it must win over what we knew.
    const snapshot = { 1: ["", "8:48 AM", "8:56 AM"] };
    expect(mergeTeeTimes(known, snapshot)[1][0]).toBe("");
  });

  it("lets the director change a time", () => {
    const snapshot = { 1: ["9:10 AM", "8:48 AM", "8:56 AM"] };
    expect(mergeTeeTimes(known, snapshot)[1][0]).toBe("9:10 AM");
  });

  it("takes rounds the previous sheet had never seen", () => {
    const merged = mergeTeeTimes(known, { 2: ["1:20 PM"] });
    expect(merged[1]).toEqual(["8:40 AM", "8:48 AM", "8:56 AM"]);
    expect(merged[2]).toEqual(["1:20 PM"]);
  });

  it("survives empty input on either side", () => {
    expect(mergeTeeTimes(null, null)).toEqual({});
    expect(mergeTeeTimes(known, null)).toEqual(known);
    expect(mergeTeeTimes(null, known)).toEqual(known);
  });

  it("does not mutate what it was given", () => {
    const prev = { 1: ["8:40 AM", "8:48 AM"] };
    const next = { 1: [undefined, "9:00 AM"] };
    mergeTeeTimes(prev, next);
    expect(prev[1]).toEqual(["8:40 AM", "8:48 AM"]);
    expect(next[1]).toEqual([undefined, "9:00 AM"]);
  });
});
