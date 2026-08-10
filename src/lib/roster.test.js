/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement as h } from "react";
import { joinRoster, useRoster } from "./roster";

const REGISTRY = [
  { id: "aaron_j", name: "Aaron J", first_name: "Aaron", last_name: "Jensen" },
  { id: "dave_s", name: "Dave S", first_name: "Dave", last_name: "Smith" },
  { id: "finn_w", name: "Finn W", first_name: "Finn", last_name: "Walsh" },
];

const rows = [
  { id: "tp_2026_dave_s", player_id: "dave_s", handicap_index: 8.4, status: "active" },
  { id: "tp_2026_aaron_j", player_id: "aaron_j", handicap_index: 12, status: "active" },
  { id: "tp_2026_finn_w", player_id: "finn_w", handicap_index: 3.1, status: "WD" },
];

describe("joinRoster", () => {
  it("joins edition rows to career names", () => {
    const out = joinRoster({ tPlayers: rows, registry: REGISTRY });
    expect(out.map(p => p.name)).toEqual(["Aaron J", "Dave S", "Finn W"]);
  });

  it("takes the handicap from the EDITION row, not the registry", () => {
    const out = joinRoster({ tPlayers: rows, registry: REGISTRY });
    expect(out.find(p => p.id === "aaron_j").handicap_index).toBe(12);
    expect(out.find(p => p.id === "dave_s").handicap_index).toBe(8.4);
  });

  it("carries the career fields through", () => {
    const [aaron] = joinRoster({ tPlayers: rows, registry: REGISTRY });
    expect(aaron).toMatchObject({ id: "aaron_j", first_name: "Aaron", last_name: "Jensen", tp_id: "tp_2026_aaron_j" });
  });

  it("sorts by name, whatever order the rows arrived in", () => {
    const out = joinRoster({ tPlayers: [...rows].reverse(), registry: REGISTRY });
    expect(out.map(p => p.name)).toEqual(["Aaron J", "Dave S", "Finn W"]);
  });

  it("tags withdrawals rather than hiding them, for the leaderboard", () => {
    const out = joinRoster({ tPlayers: rows, registry: REGISTRY, withdrawn: "include" });
    expect(out.find(p => p.id === "finn_w").isWD).toBe(true);
    expect(out.find(p => p.id === "aaron_j").isWD).toBe(false);
  });

  it("drops withdrawals for the screens that only want the field", () => {
    const out = joinRoster({ tPlayers: rows, registry: REGISTRY, withdrawn: "exclude" });
    expect(out.map(p => p.id)).toEqual(["aaron_j", "dave_s"]);
    expect(out[0]).not.toHaveProperty("isWD");
  });

  it("treats a missing handicap as scratch rather than NaN", () => {
    const out = joinRoster({
      tPlayers: [{ id: "t1", player_id: "aaron_j", status: "active" }],
      registry: REGISTRY,
    });
    expect(out[0].handicap_index).toBe(0);
  });

  it("drops a row with no registry entry — there is no name to draw", () => {
    const out = joinRoster({
      tPlayers: [...rows, { id: "t9", player_id: "ghost", handicap_index: 5, status: "active" }],
      registry: REGISTRY,
    });
    expect(out.map(p => p.id)).not.toContain("ghost");
    expect(out).toHaveLength(3);
  });

  // THE SHAPE OF THE OUTAGE. An empty registry is not "no players"; it is
  // "the names have not arrived". The join cannot tell, and correctly returns
  // nothing — which is only safe because the caller re-runs it. See useRoster.
  it("returns nothing at all when the registry has not loaded", () => {
    expect(joinRoster({ tPlayers: rows, registry: [] })).toEqual([]);
  });

  it("survives empty and missing inputs", () => {
    expect(joinRoster({})).toEqual([]);
    expect(joinRoster({ tPlayers: null, registry: null })).toEqual([]);
    expect(joinRoster({ tPlayers: [null], registry: REGISTRY })).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════
//  The regression. This is the test that would have caught the outage.
// ══════════════════════════════════════════════════════════════════
//
// The rows arrive from the on-disk cache almost instantly; the names come over
// the network and land later. Every one of these renders the two halves in
// that real order and asserts the roster is there once both have.
// createElement rather than JSX so this stays a `.test.js` beside the module
// it tests, which is how every other suite in this repo is filed.
//
// Driven entirely by PROPS, and re-rendered with new ones, which is the shape
// the real thing has: both halves are state in WBCApp and arrive as new array
// references when their loads land.
function Harness({ tPlayers, registry }) {
  const { allPlayers, activePlayers } = useRoster(tPlayers, registry);
  const names = (list) => list.map(p => p.name).join(",");
  return h("div", null,
    h("span", { "data-testid": "all" }, names(allPlayers)),
    h("span", { "data-testid": "active" }, names(activePlayers)),
  );
}

// `arrive` is the second load landing — the moment the outage turned on.
const mount = (tPlayers, registry) => {
  const view = render(h(Harness, { tPlayers, registry }));
  return {
    arrive: (nextRows, nextRegistry) =>
      view.rerender(h(Harness, { tPlayers: nextRows, registry: nextRegistry })),
  };
};
const all = () => screen.getByTestId("all").textContent;
const active = () => screen.getByTestId("active").textContent;

// Explicit, because Testing Library only registers its own afterEach when the
// test framework's globals are exposed, and this project imports describe/it
// rather than turning `globals` on. Without it every render stacks up in the
// same document and the queries find several of each.
afterEach(cleanup);

describe("useRoster — the halves arriving out of order", () => {
  it("is empty while only the rows have arrived", () => {
    mount(rows, []);
    expect(all()).toBe("");
  });

  // The outage, exactly: rows first, names second. Before the fix the roster
  // stayed empty here for the life of the session.
  it("fills in when the names land AFTER the rows", () => {
    const v = mount(rows, []);
    expect(all()).toBe("");

    v.arrive(rows, REGISTRY);

    expect(all()).toBe("Aaron J,Dave S,Finn W");
    expect(active()).toBe("Aaron J,Dave S");
  });

  it("fills in when the rows land AFTER the names", () => {
    const v = mount([], REGISTRY);
    expect(all()).toBe("");

    v.arrive(rows, REGISTRY);

    expect(all()).toBe("Aaron J,Dave S,Finn W");
  });

  it("survives the names arriving in two goes, as a refresh delivers them", () => {
    const v = mount(rows, [REGISTRY[0]]);
    expect(all()).toBe("Aaron J");

    v.arrive(rows, REGISTRY);

    expect(all()).toBe("Aaron J,Dave S,Finn W");
  });

  it("keeps up when a player is added to the roster later", () => {
    const v = mount(rows.slice(0, 1), REGISTRY);
    expect(all()).toBe("Dave S");

    v.arrive(rows, REGISTRY);

    expect(all()).toBe("Aaron J,Dave S,Finn W");
  });

  it("keeps up when a withdrawal comes in", () => {
    const v = mount(rows, REGISTRY);
    expect(active()).toBe("Aaron J,Dave S");

    v.arrive(rows.map(r => r.player_id === "dave_s" ? { ...r, status: "WD" } : r), REGISTRY);

    expect(active()).toBe("Aaron J");
    expect(all()).toBe("Aaron J,Dave S,Finn W");
  });

  it("never goes empty once both halves are in", () => {
    const v = mount(rows, REGISTRY);
    v.arrive([...rows], [...REGISTRY]);
    expect(all()).toBe("Aaron J,Dave S,Finn W");
  });
});
