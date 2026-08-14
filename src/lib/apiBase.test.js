import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ══════════════════════════════════════════════════════════════════
//  apiBase — the web must not move, and native must.
// ══════════════════════════════════════════════════════════════════
//
// The failure this guards is quiet in both directions. Prefix the web call and
// every course search breaks in production. Leave the native one relative and
// it resolves inside the app bundle, 404s, and the director's course search
// reports "no results" for every query — on a screen no store reviewer opens,
// so the person who finds it is whoever is adding next year's courses.
//
// API_BASE is computed once at module load, so each test re-imports.

const load = async () => import("./apiBase");

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

const asNative = (native) =>
  vi.stubGlobal("window", { Capacitor: { isNativePlatform: () => native } });

describe("in a browser", () => {
  it("leaves the path exactly as the call site wrote it", async () => {
    asNative(false);
    const { API_BASE, apiUrl } = await load();
    expect(API_BASE).toBe("");
    expect(apiUrl("/api/courses2?search=treetops")).toBe("/api/courses2?search=treetops");
  });

  it("treats a page with no Capacitor global as the web", async () => {
    vi.stubGlobal("window", {});
    const { API_BASE } = await load();
    expect(API_BASE).toBe("");
  });

  it("does not throw when there is no window at all", async () => {
    // Vitest's node environment, a build step, a server render.
    vi.stubGlobal("window", undefined);
    const { API_BASE } = await load();
    expect(API_BASE).toBe("");
  });
});

describe("inside a Capacitor shell", () => {
  it("points at the deployed site", async () => {
    asNative(true);
    const { API_BASE, apiUrl } = await load();
    expect(API_BASE).toBe("https://wannabecup.com");
    expect(apiUrl("/api/courses2?search=treetops"))
      .toBe("https://wannabecup.com/api/courses2?search=treetops");
  });

  it("keeps the query string and the leading slash intact", async () => {
    asNative(true);
    const { apiUrl } = await load();
    const path = "/api/courses2?search=a%20b&state=MI";
    expect(apiUrl(path).endsWith(path)).toBe(true);
    expect(apiUrl(path).startsWith("https://")).toBe(true);
  });
});
