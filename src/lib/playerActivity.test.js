/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Sign-in times and alert state, and the three-source join under them.
// ══════════════════════════════════════════════════════════════════
//
// The hook is rendered rather than called, for the reason roster.test.js
// exists: this is a join of the roster, the accounts and the token rows, and
// all three arrive on different clocks. The bug it would have — a memo that
// names the source that happened to be fast — does not show up in a pure test.
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement as h } from "react";

const gets = { wbc_users: [], wbc_notifications_tokens: [] };
let resolveUsers, resolveTokens;

vi.mock("./db", () => ({
  db: {
    get: (col) => col === "wbc_users"
      ? new Promise(r => { resolveUsers = () => r(gets.wbc_users); })
      : new Promise(r => { resolveTokens = () => r(gets.wbc_notifications_tokens); }),
  },
}));

const {
  timeAgo, toMillis, accountsByPlayer, devicesByPlayer,
  buildActivity, activitySummary, usePlayerActivity,
} = await import("./playerActivity");

afterEach(cleanup);

const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);
const ago = (ms) => NOW - ms;
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

const PLAYERS = [
  { id: "aaron_j", name: "Aaron J" },
  { id: "dave_s", name: "Dave S" },
  { id: "pete_l", name: "Pete L" },
];

describe("timeAgo", () => {
  it("says the minutes for the first hour", () => {
    expect(timeAgo(ago(24 * MIN), NOW)).toBe("24m ago");
    expect(timeAgo(ago(59 * MIN), NOW)).toBe("59m ago");
  });

  it("rounds down, so an hour is never fifty minutes", () => {
    expect(timeAgo(ago(119 * MIN), NOW)).toBe("1h ago");
  });

  it("steps up through hours, days, weeks and years", () => {
    expect(timeAgo(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(timeAgo(ago(2 * DAY), NOW)).toBe("2d ago");
    expect(timeAgo(ago(20 * DAY), NOW)).toBe("2w ago");
    expect(timeAgo(ago(400 * DAY), NOW)).toBe("1y ago");
  });

  it("says just now inside the first minute", () => {
    expect(timeAgo(ago(5000), NOW)).toBe("just now");
  });

  // Two phones a minute apart is ordinary; "in 1m ago" is not a thing to print.
  it("treats a clock running ahead as just now, not as the future", () => {
    expect(timeAgo(NOW + 90_000, NOW)).toBe("just now");
  });

  it("has nothing to say about a missing stamp", () => {
    expect(timeAgo(null, NOW)).toBe(null);
    expect(timeAgo(undefined, NOW)).toBe(null);
  });
});

describe("toMillis", () => {
  // Three generations of this app wrote these fields three different ways.
  it("takes a number, an ISO string, a Date and a Firestore Timestamp", () => {
    expect(toMillis(NOW)).toBe(NOW);
    expect(toMillis(new Date(NOW).toISOString())).toBe(NOW);
    expect(toMillis(new Date(NOW))).toBe(NOW);
    expect(toMillis({ seconds: NOW / 1000, nanoseconds: 0 })).toBe(NOW);
  });

  it("refuses nonsense rather than returning NaN", () => {
    expect(toMillis("not a date")).toBe(null);
    expect(toMillis(NaN)).toBe(null);
    expect(toMillis(null)).toBe(null);
  });
});

describe("accountsByPlayer", () => {
  it("keeps the most recent row when one player has signed in twice", () => {
    // Deleting an account and signing back in with Apple leaves two rows on
    // the same player_id, and the answer wanted is the later one.
    const m = accountsByPlayer([
      { id: "u1", player_id: "aaron_j", lastLoginAt: ago(5 * DAY) },
      { id: "u2", player_id: "aaron_j", lastLoginAt: ago(2 * MIN) },
    ]);
    expect(m.get("aaron_j").lastSeen).toBe(ago(2 * MIN));
  });

  it("falls back to claimedAt for rows written before the stamp existed", () => {
    const m = accountsByPlayer([{ id: "u1", player_id: "dave_s", claimedAt: ago(3 * DAY) }]);
    expect(m.get("dave_s").lastSeen).toBe(ago(3 * DAY));
  });

  it("ignores a row with no player claimed yet", () => {
    const m = accountsByPlayer([{ id: "u1", uid: "u1", lastLoginAt: NOW }]);
    expect(m.size).toBe(0);
  });
});

describe("devicesByPlayer", () => {
  it("counts a row written under either field name", () => {
    const m = devicesByPlayer([
      { id: "t1", playerId: "aaron_j" },
      { id: "t2", player_id: "aaron_j" },
      { id: "t3", player_id: "dave_s" },
    ]);
    expect(m.get("aaron_j")).toBe(2);
    expect(m.get("dave_s")).toBe(1);
  });

  // registerForPush writes BOTH names onto one document. Read as one
  // collection that is one device, and counting it twice would tell a
  // director a man has two phones.
  it("counts a row carrying both names once", () => {
    const m = devicesByPlayer([{ id: "t1", playerId: "aaron_j", player_id: "aaron_j" }]);
    expect(m.get("aaron_j")).toBe(1);
  });
});

describe("buildActivity", () => {
  const users = [
    { id: "u1", player_id: "aaron_j", email: "a@x.com", lastLoginAt: ago(24 * MIN) },
    { id: "u2", player_id: "dave_s", lastLoginAt: ago(3 * DAY) },
  ];
  const tokens = [{ id: "t1", player_id: "aaron_j" }];

  it("puts the most recent sign-in first and the never-signed-in last", () => {
    const rows = buildActivity({ players: PLAYERS, users, tokens, now: NOW });
    expect(rows.map(r => r.id)).toEqual(["aaron_j", "dave_s", "pete_l"]);
  });

  it("reads the alert state off the tokens, not off the account", () => {
    const rows = buildActivity({ players: PLAYERS, users, tokens, now: NOW });
    expect(rows[0]).toMatchObject({ notifications: "on", devices: 1, lastSeenLabel: "24m ago" });
    expect(rows[1]).toMatchObject({ notifications: "off", devices: 0, lastSeenLabel: "3d ago" });
  });

  // "Off" is a preference. Somebody who has never signed in has not had the
  // chance to express one, so the row says so instead.
  it("says nothing about alerts for a player with no account", () => {
    const rows = buildActivity({ players: PLAYERS, users, tokens, now: NOW });
    expect(rows[2]).toMatchObject({ id: "pete_l", signedIn: false, notifications: null, lastSeenLabel: "Never signed in" });
  });

  it("survives every source being empty", () => {
    expect(buildActivity()).toEqual([]);
    expect(buildActivity({ players: PLAYERS }).every(r => !r.signedIn)).toBe(true);
  });

  it("sorts the never-signed-in group by name, since it is a to-do list", () => {
    const rows = buildActivity({ players: [{ id: "z", name: "Zeb" }, { id: "b", name: "Bo" }], now: NOW });
    expect(rows.map(r => r.name)).toEqual(["Bo", "Zeb"]);
  });
});

describe("activitySummary", () => {
  it("counts the field, the signed in, and the reachable", () => {
    const rows = buildActivity({
      players: PLAYERS,
      users: [{ id: "u1", player_id: "aaron_j", lastLoginAt: NOW }, { id: "u2", player_id: "dave_s", lastLoginAt: NOW }],
      tokens: [{ id: "t1", player_id: "aaron_j" }],
      now: NOW,
    });
    expect(activitySummary(rows)).toEqual({ total: 3, signedIn: 2, notifying: 1 });
  });
});

// ── The hook ────────────────────────────────────────────────────────
// Three sources, landed the slow way round. See lib/roster for the outage
// this shape caused once already.
function Probe({ players }) {
  const { rows, loading } = usePlayerActivity(players);
  return h("div", null,
    h("div", { "data-testid": "loading" }, String(loading)),
    ...rows.map(r => h("div", { key: r.id, "data-testid": `row-${r.id}` }, `${r.lastSeenLabel}|${r.notifications}`)),
  );
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe("usePlayerActivity", () => {
  beforeEach(() => {
    gets.wbc_users = [{ id: "u1", player_id: "aaron_j", lastLoginAt: Date.now() }];
    gets.wbc_notifications_tokens = [{ id: "t1", player_id: "aaron_j" }];
  });

  it("stays loading until BOTH reads have answered", async () => {
    render(h(Probe, { players: PLAYERS }));
    expect(screen.getByTestId("loading").textContent).toBe("true");
    resolveUsers(); await flush();
    expect(screen.getByTestId("loading").textContent).toBe("true");
    resolveTokens(); await flush();
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("recomputes when the tokens land after the accounts", async () => {
    render(h(Probe, { players: PLAYERS }));
    resolveUsers(); await flush();
    // Accounts in, tokens still out: the man is signed in and, as far as
    // anything knows so far, unreachable.
    expect(screen.getByTestId("row-aaron_j").textContent).toBe("just now|off");
    resolveTokens(); await flush();
    expect(screen.getByTestId("row-aaron_j").textContent).toBe("just now|on");
  });

  it("recomputes when the accounts land after the tokens", async () => {
    render(h(Probe, { players: PLAYERS }));
    resolveTokens(); await flush();
    expect(screen.getByTestId("row-aaron_j").textContent).toBe("Never signed in|null");
    resolveUsers(); await flush();
    expect(screen.getByTestId("row-aaron_j").textContent).toBe("just now|on");
  });

  // The one the roster outage was actually about: the roster is a THIRD
  // source, and it routinely arrives after both reads have finished.
  it("recomputes when the roster lands last of all", async () => {
    const { rerender } = render(h(Probe, { players: [] }));
    resolveUsers(); resolveTokens(); await flush();
    expect(screen.queryByTestId("row-aaron_j")).toBe(null);
    rerender(h(Probe, { players: PLAYERS }));
    expect(screen.getByTestId("row-aaron_j").textContent).toBe("just now|on");
  });

  it("treats a refused read as an empty collection rather than hanging", async () => {
    gets.wbc_users = null;
    gets.wbc_notifications_tokens = null;
    render(h(Probe, { players: PLAYERS }));
    resolveUsers(); resolveTokens(); await flush();
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("row-aaron_j").textContent).toBe("Never signed in|null");
  });
});
