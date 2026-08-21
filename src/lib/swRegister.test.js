import { describe, it, expect, vi } from "vitest";
import { shouldRegisterSW, registerAppServiceWorker, SW_URL, SW_SCOPE } from "./swRegister";

const env = (over = {}) => ({
  supported: true, isProd: true, isNative: false,
  protocol: "https:", hostname: "wannabecup.com", ...over,
});

describe("shouldRegisterSW", () => {
  it("registers on the deployed site", () => {
    expect(shouldRegisterSW(env())).toBe(true);
  });

  // `npm run preview` is how this gets exercised before it ships, so localhost
  // has to count as a secure context — which the platform agrees with.
  it("registers on localhost, so a production build can be tried out", () => {
    expect(shouldRegisterSW(env({ protocol: "http:", hostname: "localhost" }))).toBe(true);
    expect(shouldRegisterSW(env({ protocol: "http:", hostname: "127.0.0.1" }))).toBe(true);
  });

  // A worker caching a dev server is a worker handing yesterday's modules back
  // to the person editing them.
  it("stays out of the dev server's way", () => {
    expect(shouldRegisterSW(env({ isProd: false }))).toBe(false);
    expect(shouldRegisterSW(env({ isProd: false, hostname: "localhost", protocol: "http:" }))).toBe(false);
  });

  // The Capacitor builds read their assets out of the app bundle. There is no
  // network in that path and so nothing for a cache to save.
  it("stays off the native builds", () => {
    expect(shouldRegisterSW(env({ isNative: true }))).toBe(false);
  });

  it("does nothing where the browser has no worker support", () => {
    expect(shouldRegisterSW(env({ supported: false }))).toBe(false);
  });

  it("refuses an insecure origin, where the platform would refuse anyway", () => {
    expect(shouldRegisterSW(env({ protocol: "http:", hostname: "wannabecup.com" }))).toBe(false);
  });

  it("survives being called with nothing", () => {
    expect(shouldRegisterSW()).toBe(false);
  });
});

describe("registerAppServiceWorker", () => {
  it("registers the one worker that already owns the scope", async () => {
    const register = vi.fn(() => Promise.resolve({ scope: "/" }));
    await registerAppServiceWorker({ ...env(), register });
    expect(register).toHaveBeenCalledWith(SW_URL, { scope: SW_SCOPE });
  });

  // Same script, same scope as lib/notifications.js asks for, which is what
  // makes the two call sites idempotent rather than a fight over the scope.
  it("names the same script the push registration does", () => {
    expect(SW_URL).toBe("/firebase-messaging-sw.js");
    expect(SW_SCOPE).toBe("/");
  });

  it("does not register where it should not", async () => {
    const register = vi.fn();
    await registerAppServiceWorker({ ...env({ isProd: false }), register });
    expect(register).not.toHaveBeenCalled();
  });

  // The app has just fetched every one of these files over the network. A
  // failed registration means the next launch is no faster — it does not mean
  // this one is broken, and it must not read as an error to somebody opening
  // a leaderboard.
  it("swallows a registration failure", async () => {
    const register = vi.fn(() => Promise.reject(new Error("SecurityError")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(registerAppServiceWorker({ ...env(), register })).resolves.toBeNull();
    warn.mockRestore();
  });
});
