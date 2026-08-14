import { describe, it, expect } from "vitest";
import { scopeFor, inEdition, scopedRegistry, isSandboxRow } from "./playerScope";
import { SANDBOX_EDITION_ID } from "./editionId";

describe("scopeFor", () => {
  it("stamps a sandbox row with its edition", () => {
    expect(scopeFor(SANDBOX_EDITION_ID)).toEqual({ edition_id: SANDBOX_EDITION_ID });
  });

  // Explicitly null rather than absent: registry writes merge, so a real
  // edition claiming an id that a demo row already holds has to CLEAR the
  // stamp, or it writes into a document it cannot see.
  it("clears the stamp on a real edition", () => {
    expect(scopeFor("wbc_2026")).toEqual({ edition_id: null });
    expect(scopeFor("wbc_2027")).toEqual({ edition_id: null });
    expect(scopeFor(undefined)).toEqual({ edition_id: null });
  });

  it("promotes a demo row to a career record when a real edition claims it", () => {
    const demoRow = { id: "test_one", edition_id: SANDBOX_EDITION_ID };
    const merged = { ...demoRow, ...scopeFor("wbc_2026") };
    expect(inEdition(merged, "wbc_2026")).toBe(true);
    expect(inEdition(merged, SANDBOX_EDITION_ID)).toBe(true);
  });
});

describe("inEdition", () => {
  it("shows an unstamped row everywhere", () => {
    const row = { id: "aaron_j", name: "Aaron J" };
    expect(inEdition(row, "wbc_2026")).toBe(true);
    expect(inEdition(row, SANDBOX_EDITION_ID)).toBe(true);
    expect(inEdition({ ...row, edition_id: null }, "wbc_2026")).toBe(true);
    expect(inEdition({ ...row, edition_id: "" }, "wbc_2026")).toBe(true);
  });

  it("keeps a sandbox row inside the sandbox", () => {
    const row = { id: "test_guy", edition_id: SANDBOX_EDITION_ID };
    expect(inEdition(row, SANDBOX_EDITION_ID)).toBe(true);
    expect(inEdition(row, "wbc_2026")).toBe(false);
    expect(inEdition(row, "wbc_2027")).toBe(false);
  });
});

describe("scopedRegistry", () => {
  const rows = [
    { id: "aaron_j", name: "Aaron J" },
    { id: "test_one", name: "Test One", edition_id: SANDBOX_EDITION_ID },
    { id: "matt_v", name: "Matt V" },
  ];

  it("hides demo players from a real edition", () => {
    expect(scopedRegistry(rows, "wbc_2026").map(r => r.id)).toEqual(["aaron_j", "matt_v"]);
  });

  it("shows the careers AND the demo players inside the demo", () => {
    expect(scopedRegistry(rows, SANDBOX_EDITION_ID).map(r => r.id))
      .toEqual(["aaron_j", "test_one", "matt_v"]);
  });

  it("survives junk", () => {
    expect(scopedRegistry(null, "wbc_2026")).toEqual([]);
    expect(scopedRegistry(undefined, "wbc_2026")).toEqual([]);
  });
});

describe("isSandboxRow", () => {
  it("is true only for a row the sandbox minted", () => {
    expect(isSandboxRow({ edition_id: SANDBOX_EDITION_ID })).toBe(true);
    expect(isSandboxRow({ edition_id: "wbc_2026" })).toBe(false);
    expect(isSandboxRow({})).toBe(false);
    expect(isSandboxRow(null)).toBe(false);
  });
});
