/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the sync strip say the right KIND of thing?
// ══════════════════════════════════════════════════════════════════
//
// The wording and the counting are lib/connection's and have their own suite.
// What is left here is the one decision this file makes, and it is the one
// that matters most on a tee box: a queued write and a REFUSED write must not
// look alike. The first is the app working — the score is on the phone and
// lands with the next bar of signal. The second is the score gone, rolled back
// out of the local cache, on no device anywhere.
//
// Amber and a slashed cloud for the first, red and a warning triangle for the
// second. Somebody reading it at arm's length with a glove on gets the
// difference from the colour before they get to the sentence.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createElement as h } from "react";
import { SyncBanner } from "./SyncBanner";
import { syncStatus } from "../lib/connection";
import { K } from "../theme";

afterEach(cleanup);

const strip = () => document.querySelector("[role='status']");

// jsdom hands back a resolved inline style, so #f59e0b comes out as
// rgb(245, 158, 11). Converted here rather than hardcoded so the assertion
// follows the theme's palette instead of restating it.
const asRgb = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe("SyncBanner", () => {
  // The resting state, and the reason the strip is worth its height when it
  // does appear: most of the time there is nothing to say.
  it("draws nothing at all when there is nothing wrong", () => {
    render(h(SyncBanner, { status: null }));
    expect(strip()).toBeNull();
  });

  it("carries the queue in the warn colour", () => {
    render(h(SyncBanner, { status: syncStatus({ online: false, pending: 3, kinds: { hole_scores: 3 } }) }));
    expect(screen.getByText("No signal — 3 scores still on this phone")).toBeTruthy();
    expect(strip().getAttribute("style")).toContain(`color: ${asRgb(K.warn)}`);
  });

  it("carries a refusal in the danger colour instead", () => {
    render(h(SyncBanner, { status: syncStatus({ online: true, refused: 2, refusedKinds: { hole_scores: 2 } }) }));
    expect(screen.getByText("2 scores did not save — nobody else has them")).toBeTruthy();
    expect(strip().getAttribute("style")).toContain(`color: ${asRgb(K.danger)}`);
  });

  // The hint is the only actionable line the strip ever carries, and a refusal
  // is the only state that has one worth acting on.
  it("says what to do about a refusal", () => {
    render(h(SyncBanner, { status: syncStatus({ online: true, refused: 1, refusedKinds: { skins: 1 } }) }));
    expect(screen.getByText("Check you're signed in")).toBeTruthy();
  });
});
