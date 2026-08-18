/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the director's sign-in panel appear, with the right answers on it?
// ══════════════════════════════════════════════════════════════════
//
// A mount test, for the reason every screen in this project gets one — it
// rides inside AdminView, which is lazy-loaded, so nothing else would find a
// broken import until a director tapped Players.
//
// The arithmetic underneath it is tested in lib/playerActivity. What is
// checked here is that the two answers a director came for actually reach the
// screen, and that the states nobody develops against — nothing read yet, and
// a roster where nobody has signed in — draw something rather than nothing.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement as h } from "react";

const data = { wbc_users: [], wbc_notifications_tokens: [] };
let held = null;

vi.mock("../lib/db", () => ({
  db: {
    get: (col) => held
      ? new Promise(r => held.push(() => r(data[col])))
      : Promise.resolve(data[col]),
  },
}));

const { PlayerActivityPanel } = await import("./PlayerActivityPanel");

afterEach(() => { cleanup(); held = null; });

const PLAYERS = [
  { id: "aaron_j", name: "Aaron J" },
  { id: "dave_s", name: "Dave S" },
  { id: "pete_l", name: "Pete L" },
];

const flush = () => new Promise(r => setTimeout(r, 0));

describe("PlayerActivityPanel", () => {
  it("shows how long ago each player was here, and whether alerts will reach them", async () => {
    data.wbc_users = [
      { id: "u1", player_id: "aaron_j", lastLoginAt: Date.now() - 24 * 60_000 },
      { id: "u2", player_id: "dave_s", lastLoginAt: Date.now() - 3 * 86_400_000 },
    ];
    data.wbc_notifications_tokens = [{ id: "t1", player_id: "aaron_j" }];
    render(h(PlayerActivityPanel, { players: PLAYERS }));
    await flush();

    expect(screen.getByText("24m ago")).toBeTruthy();
    expect(screen.getByText("3d ago")).toBeTruthy();
    expect(screen.getByText("🔔 ON")).toBeTruthy();
    expect(screen.getByText("ALERTS OFF")).toBeTruthy();
    // A man with no account has expressed no preference, so the row says that
    // rather than claiming he turned alerts off.
    expect(screen.getByText("NO ACCOUNT")).toBeTruthy();
    expect(screen.getByText(/2 of 3 signed in · 1 with notifications on/)).toBeTruthy();
  });

  it("says it is reading before either collection has answered", async () => {
    held = [];
    render(h(PlayerActivityPanel, { players: PLAYERS }));
    expect(screen.getByText("Reading…")).toBeTruthy();
    held.forEach(fn => fn());
    await flush();
    expect(screen.queryByText("Reading…")).toBe(null);
  });

  it("mounts an empty roster", async () => {
    data.wbc_users = [];
    data.wbc_notifications_tokens = [];
    render(h(PlayerActivityPanel, { players: [] }));
    await flush();
    expect(screen.getByText("Nobody on the roster yet.")).toBeTruthy();
    expect(screen.getByText(/0 of 0 signed in/)).toBeTruthy();
  });

  it("mounts a roster where nobody has signed in yet", async () => {
    data.wbc_users = [];
    data.wbc_notifications_tokens = [];
    render(h(PlayerActivityPanel, { players: PLAYERS }));
    await flush();
    expect(screen.getAllByText("Never signed in").length).toBe(3);
    expect(screen.getAllByText("NO ACCOUNT").length).toBe(3);
  });
});
