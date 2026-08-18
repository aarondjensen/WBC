/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Who gets asked to turn notifications on, and how often.
// ══════════════════════════════════════════════════════════════════
//
// jsdom for localStorage, which is where "we have already asked this person"
// lives — the browser's own permission state cannot answer that question,
// which is the whole reason this module exists.
import { describe, it, expect, beforeEach } from "vitest";
import { shouldPromptForPush, wasPrompted, markPrompted, clearPrompted } from "./notificationPrompt";

const base = { playerId: "aaron_j", permission: "default", subscribed: null, prompted: false };

beforeEach(() => localStorage.clear());

describe("shouldPromptForPush", () => {
  it("asks a player who has never been asked", () => {
    expect(shouldPromptForPush(base)).toBe(true);
  });

  it("never asks twice on the same device", () => {
    expect(shouldPromptForPush({ ...base, prompted: true })).toBe(false);
  });

  // Both of these are people who have already answered — one yes, one no —
  // and re-asking either is nagging.
  it("leaves alone anyone already subscribed", () => {
    expect(shouldPromptForPush({ ...base, subscribed: true })).toBe(false);
  });

  it("leaves alone anyone who deliberately turned it off", () => {
    expect(shouldPromptForPush({ ...base, subscribed: false })).toBe(false);
  });

  it("does not ask when the browser has already been answered", () => {
    expect(shouldPromptForPush({ ...base, permission: "granted" })).toBe(false);
    // A denial will not re-prompt no matter what we do; the way back is
    // device settings, which the settings card explains.
    expect(shouldPromptForPush({ ...base, permission: "denied" })).toBe(false);
  });

  // iOS Safari in a tab, and every browser without a service worker.
  it("does not ask where push cannot exist", () => {
    expect(shouldPromptForPush({ ...base, permission: "unsupported" })).toBe(false);
  });

  // Neither Capacitor WebView has the Push API — a modal offering a button
  // that cannot work is worse than the card that says so.
  it("does not ask inside the native shells", () => {
    expect(shouldPromptForPush({ ...base, native: true })).toBe(false);
  });

  it("does not ask a guest, who has nothing to be notified about", () => {
    expect(shouldPromptForPush({ ...base, guest: true })).toBe(false);
  });

  it("does not ask before a player id exists to aim at", () => {
    expect(shouldPromptForPush({ ...base, playerId: null })).toBe(false);
    expect(shouldPromptForPush()).toBe(false);
  });
});

describe("the asked-already flag", () => {
  it("remembers per player, so a shared device asks each of them once", () => {
    expect(wasPrompted("aaron_j")).toBe(false);
    markPrompted("aaron_j");
    expect(wasPrompted("aaron_j")).toBe(true);
    expect(wasPrompted("dave_s")).toBe(false);
  });

  it("closes the loop: marked means shouldPrompt says no", () => {
    markPrompted("aaron_j");
    expect(shouldPromptForPush({ ...base, prompted: wasPrompted("aaron_j") })).toBe(false);
    clearPrompted("aaron_j");
    expect(shouldPromptForPush({ ...base, prompted: wasPrompted("aaron_j") })).toBe(true);
  });

  it("shrugs off a missing player id rather than throwing", () => {
    expect(() => markPrompted(null)).not.toThrow();
    expect(wasPrompted(null)).toBe(false);
  });
});
