import { describe, it, expect } from "vitest";
import { returningPlayers, returningLine, idForName } from "./returningPlayers";

// A stand-in record book, so these tests keep passing when a real year is
// appended to data/history.js.
const NAMES = ["Aaron J", "Bob B", "Ray H"];
const CAREERS = {
  "Aaron J": { index: 11.4, rounds: [{ year: 2025 }, { year: 2023 }] },
  "Bob B": { index: 18.2, rounds: [{ year: 2019 }] },
  "Ray H": { index: null, rounds: [] },
};
const indexOf = (name) => CAREERS[name] || { index: null, rounds: [] };

// The real matcher's shape, reduced to what these tests need: a registry row
// matches a history name via its display name or its first + last initial.
const matchName = (p, names = NAMES) => {
  const full = (p?.name || "").trim().toLowerCase();
  const parts = `${(p?.first_name || "").trim()} ${(p?.last_name || "").trim().charAt(0)}`.trim().toLowerCase();
  return names.find(n => n.toLowerCase() === full || n.toLowerCase() === parts) || null;
};

const call = (opts) => returningPlayers({ historyNames: NAMES, indexOf, matchName, ...opts });

describe("returningPlayers", () => {
  it("offers a registry player who is not on this year's roster", () => {
    const rows = call({ registry: [{ id: "bob_b", name: "Bob B" }], rosterIds: [] });
    expect(rows.find(r => r.name === "Bob B")).toMatchObject({ id: "bob_b", historyName: "Bob B" });
  });

  // Aaron survives here because he is in the record books with no registry row
  // — the second source. Bob is the one being tested: on the roster, gone.
  it("leaves out anybody already on the roster", () => {
    const registry = [{ id: "bob_b", name: "Bob B" }, { id: "ray_h", name: "Ray H" }];
    expect(call({ registry, rosterIds: ["bob_b"] }).map(r => r.id)).toEqual(["aaron_j", "ray_h"]);
  });

  // The reason the module exists: the id comes from the record, never from
  // re-deriving the name the director happens to type.
  it("carries the registry's own id, even when the name would derive a different one", () => {
    const registry = [{ id: "legacy_7", name: "Bob B", first_name: "Bob", last_name: "Barker" }];
    const row = call({ registry, rosterIds: [] }).find(r => r.historyName === "Bob B");
    expect(row.id).toBe("legacy_7");
    expect(row).toMatchObject({ first: "Bob", last: "Barker" });
  });

  it("reaches back to players in the record books with no registry row", () => {
    const rows = call({ registry: [], rosterIds: [] });
    expect(rows.map(r => r.id)).toEqual(["aaron_j", "bob_b", "ray_h"]);
    expect(rows[0]).toMatchObject({ name: "Aaron J", first: "Aaron", last: "J" });
  });

  it("lists a man once when he is in both the registry and the history", () => {
    const registry = [{ id: "legacy_7", name: "Bob B", first_name: "Bob", last_name: "Barker" }];
    const rows = call({ registry, rosterIds: [] });
    expect(rows.filter(r => r.historyName === "Bob B").map(r => r.id)).toEqual(["legacy_7"]);
  });

  // The case that would otherwise put a man on the picker while he is playing:
  // his registry row is on the roster, so his history entry must not stand in
  // for it under a derived id.
  it("does not offer the history entry of a man whose registry row is on the roster", () => {
    const registry = [{ id: "legacy_7", name: "Bob B", first_name: "Bob", last_name: "Barker" }];
    expect(call({ registry, rosterIds: ["legacy_7"] }).map(r => r.name)).toEqual(["Aaron J", "Ray H"]);
  });

  it("offers a registry player with no history at all", () => {
    const rows = call({ registry: [{ id: "new_guy", name: "New G" }], rosterIds: [] });
    const row = rows.find(r => r.id === "new_guy");
    expect(row).toMatchObject({ historyName: null, index: null, rounds: 0, lastYear: null });
  });

  it("attaches the index, the round count and the last year played", () => {
    const [row] = call({ registry: [], rosterIds: [], historyNames: ["Aaron J"] });
    expect(row).toMatchObject({ index: 11.4, rounds: 2, lastYear: 2025 });
  });

  it("sorts alphabetically — the list is looked up, not ranked", () => {
    const registry = [{ id: "zed_z", name: "Zed Z" }, { id: "abe_a", name: "Abe A" }];
    expect(call({ registry, rosterIds: [] }).map(r => r.name))
      .toEqual(["Aaron J", "Abe A", "Bob B", "Ray H", "Zed Z"]);
  });

  it("skips registry rows with no id rather than inventing one", () => {
    expect(call({ registry: [{ name: "Ghost G" }], rosterIds: [] }).map(r => r.name))
      .toEqual(["Aaron J", "Bob B", "Ray H"]);
  });

  it("returns everybody when nothing is passed at all", () => {
    expect(returningPlayers({ historyNames: NAMES, indexOf, matchName })).toHaveLength(3);
    expect(returningPlayers().length).toBeGreaterThan(0);
  });
});

describe("returningLine", () => {
  it("names the last year he was there", () => {
    expect(returningLine({ rounds: 8, lastYear: 2023 })).toBe("8 recorded · last played 2023");
  });

  it("says so plainly when there is no career behind the name", () => {
    expect(returningLine({ rounds: 0, lastYear: null })).toBe("No recorded rounds");
    expect(returningLine(null)).toBe("No recorded rounds");
  });
});

describe("idForName", () => {
  it("files a display name the way the roster always has", () => {
    expect(idForName("Aaron J")).toBe("aaron_j");
    expect(idForName("  Mary Lou B  ")).toBe("mary_lou_b");
  });

  it("survives a missing name", () => {
    expect(idForName(null)).toBe("");
  });
});
