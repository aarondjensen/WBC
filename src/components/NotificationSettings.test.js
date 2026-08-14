/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the notification screen say a true thing on every device?
// ══════════════════════════════════════════════════════════════════
//
// The usual mount question, and then the one this screen exists to get right:
// it renders FIVE different cards depending on what the device can do, only
// one of which has a toggle in it, and four of which are pure instructions. An
// instruction card that renders on the wrong device is not a cosmetic bug —
// it is a set of steps somebody will follow to a place the tournament isn't,
// and on the App Store it is a Guideline 2.1 rejection.
//
// The branch that made this file necessary is the native one. Both Capacitor
// shells report "unsupported" — no Push API in a WKWebView, none in Android's
// WebView — and iOS additionally reports "not standalone", so the native app
// matched the iOS-Safari branch exactly and told people inside an installed
// app to go and install it. Nothing could have caught that but a test that
// mounts this component with the native probe returning true.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement as h } from "react";

// Mutable so each test can put the component on a different device. Both
// modules are mocked wholesale: the question here is which card renders for a
// given set of answers, never what the answers are made of.
const env = vi.hoisted(() => ({
  native: false,
  permission: "default",
  standalone: true,
  iosCapable: true,
}));

vi.mock("../firebase", () => ({
  isNativePlatform: () => env.native,
}));

vi.mock("../lib/notifications", () => ({
  getNotificationPermissionState: () => env.permission,
  isStandalonePWA: () => env.standalone,
  isIOSPushCapable: () => env.iosCapable,
  checkSubscriptionStatus: async () => false,
  getCachedSubscriptionStatus: () => false,
  registerForPush: async () => ({ success: true }),
  unsubscribeFromPush: async () => {},
  sendTestPush: async () => 0,
}));

const { NotificationSettings } = await import("./NotificationSettings");

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

const setUserAgent = (ua) =>
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

beforeEach(() => {
  env.native = false;
  env.permission = "default";
  env.standalone = true;
  env.iosCapable = true;
  setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120");
});

afterEach(cleanup);

const mount = () => render(h(NotificationSettings, {
  user: { id: "p1", name: "Tester" },
  notify: vi.fn(),
  onPermissionChange: vi.fn(),
}));

describe("NotificationSettings", () => {
  it("gives a capable browser the switch", () => {
    mount();
    expect(screen.getByText("Notifications off")).toBeTruthy();
  });

  it("explains a denial instead of offering a dead switch", () => {
    env.permission = "denied";
    mount();
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.queryByText("Notifications off")).toBeNull();
  });

  it("walks an iPhone in a Safari tab through installing", () => {
    setUserAgent(IPHONE_UA);
    env.permission = "unsupported";
    env.standalone = false;
    mount();
    expect(screen.getByText("Add to your home screen first")).toBeTruthy();
  });

  it("tells an old iPhone that installing will not help", () => {
    setUserAgent(IPHONE_UA);
    env.iosCapable = false;
    mount();
    expect(screen.getByText("iOS update needed")).toBeTruthy();
  });

  // ── The one this file was written for ──
  // Native iOS answers "unsupported" AND "not standalone" AND matches the
  // iPhone user-agent, so it satisfies the Add to Home Screen branch on every
  // clause. The native check has to come first or the App Store build tells
  // its users to install an app they are holding.
  it("does not send the iOS app to Safari to install itself", () => {
    setUserAgent(IPHONE_UA);
    env.native = true;
    env.permission = "unsupported";
    env.standalone = false;
    mount();
    expect(screen.queryByText("Add to your home screen first")).toBeNull();
    expect(screen.getByText("Not in the app yet")).toBeTruthy();
    expect(document.body.textContent).toContain("wannabecup.com");
  });

  // Android's WebView reaches the same dead end by a different route, and the
  // browser card it used to land on ("use Chrome, Edge or Safari") is just as
  // unfollowable from inside a Play build.
  it("does not send the Android app off to another browser", () => {
    setUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120");
    env.native = true;
    env.permission = "unsupported";
    mount();
    expect(screen.queryByText("Not supported here")).toBeNull();
    expect(screen.getByText("Not in the app yet")).toBeTruthy();
  });

  // No toggle in the native card, deliberately: a switch that cannot come on
  // is a worse answer than a sentence saying where to go.
  it("shows no switch in a native shell", () => {
    env.native = true;
    mount();
    expect(screen.queryByText("Notifications off")).toBeNull();
    expect(screen.queryByText("Notifications on")).toBeNull();
  });
});
