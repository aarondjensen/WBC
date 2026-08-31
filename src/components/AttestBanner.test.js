/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the app say what the red bubble wanted?
// ══════════════════════════════════════════════════════════════════
//
// The failure this component exists for is silence: a badge on the home
// screen icon and an app with no sign of what it was for. So the test that
// matters is that a non-empty list PUTS SOMETHING ON SCREEN, and that the
// button on it hands back the round to go to — that round is the whole
// payload, because tapping the Scoring tab jumps to the live round instead
// and lands nowhere near an older card.
//
// Which cards belong in the list at all is lib/pendingAttest's question and
// has its own suite; this only checks the rendering of an answer.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { AttestBanner } from "./AttestBanner";

afterEach(cleanup);

const item = (over = {}) => ({ groupKey: "1_a,b,c,d", round: 1, signedBy: "matt_b", signedByName: "Matt B", ...over });

describe("AttestBanner", () => {
  it("names the round waiting and who signed it", () => {
    render(h(AttestBanner, { items: [item()], onGo: () => {} }));
    // getByText(/Round/) would find the bolded "Round 1" on its own; the
    // sentence it sits in is its parent.
    expect(screen.getByText("Round 1").parentElement.textContent)
      .toBe("Round 1 needs your attest — signed by Matt B");
  });

  it("hands the round back so the app can land on that card", () => {
    const onGo = vi.fn();
    render(h(AttestBanner, { items: [item({ round: 2 })], onGo }));
    fireEvent.click(screen.getByText("Attest"));
    expect(onGo).toHaveBeenCalledWith(2, "1_a,b,c,d");
  });

  // One line wide, so the second and later cards are counted rather than
  // listed — but they have to be counted, or a badge reading 2 sits above a
  // row that looks like it is about one thing.
  it("counts the ones it cannot fit", () => {
    render(h(AttestBanner, { items: [item(), item({ groupKey: "2_a,b,c,d", round: 2 })], onGo: () => {} }));
    expect(screen.getByText(/\+1 more/)).toBeTruthy();
  });

  it("says nothing at all when nothing is owed", () => {
    const { container } = render(h(AttestBanner, { items: [], onGo: () => {} }));
    expect(container.textContent).toBe("");
  });

  // The state every screen in this app spends most of its life in, and the one
  // that has to cost nothing: props that have not loaded yet.
  it("survives a missing list", () => {
    const { container } = render(h(AttestBanner, {}));
    expect(container.textContent).toBe("");
  });

  // A card signed by somebody whose name never made it onto the doc still has
  // to render — the round is the part that matters.
  it("renders without a signer name", () => {
    render(h(AttestBanner, { items: [item({ signedByName: null })], onGo: () => {} }));
    expect(screen.getByText(/needs your attest/)).toBeTruthy();
  });
});
