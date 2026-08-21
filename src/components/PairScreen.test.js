/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Do the two pairing screens actually appear?
// ══════════════════════════════════════════════════════════════════
//
// The usual mount test, and it matters more than most here. These two screens
// are the ONLY way an Apple-only player gets into the home-screen app (see
// lib/authPairing), they are lazy-loaded so a broken import cannot fail
// anywhere earlier, and neither of them can be reached from a dev machine —
// the flow that opens them starts with iOS refusing to bring a form POST home.
//
// So: mount every state each screen has, and assert the words a player needs
// are on the screen rather than just that nothing threw. The states nobody
// develops against — "not yet", "error" — are the point.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
// h() rather than JSX: this project's *.test.js files are parsed as plain JS —
// see BettingView.test.js, which does the same.
import { createElement as h } from "react";
import { PairWaitScreen, PairDoneScreen } from "./PairScreen";

afterEach(cleanup);

const URL_ = "https://wannabecup.com/?pair=" + "A".repeat(43);

describe("PairWaitScreen — the home-screen app's half", () => {
  it("mounts, and says where they are going", () => {
    render(h(PairWaitScreen, { url: URL_, onCheck: () => {}, onCancel: () => {} }));
    expect(screen.getByText(/Finish in Safari/i)).toBeTruthy();
    // getByRole, not getByText: "Open Safari" is deliberately said twice — once
    // in step 1 and once on the thing you tap — and the test should be looking
    // at the link.
    expect(screen.getByRole("link", { name: /Open Safari/i })).toBeTruthy();
  });

  // The link is the whole mechanism: a target=_blank anchor is what hands a
  // URL to Safari from inside a home-screen app.
  it("hands the pairing URL to a new tab", () => {
    render(h(PairWaitScreen, { url: URL_, onCheck: () => {}, onCancel: () => {} }));
    const link = screen.getByRole("link", { name: /Open Safari/i });
    expect(link.getAttribute("href")).toBe(URL_);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("claims when they say they are back", () => {
    const onCheck = vi.fn();
    render(h(PairWaitScreen, { url: URL_, onCheck: onCheck, onCancel: () => {} }));
    fireEvent.click(screen.getByText(/I'm signed in/i));
    expect(onCheck).toHaveBeenCalled();
  });

  it("says nothing is waiting yet, without calling it a failure", () => {
    render(h(PairWaitScreen, { url: URL_, status: "not-yet", onCheck: () => {}, onCancel: () => {} }));
    expect(screen.getByText(/Nothing to pick up yet/i)).toBeTruthy();
  });

  it("shows a real error when there is one", () => {
    render(h(PairWaitScreen, { url: URL_, status: "error", error: "Boom.", onCheck: () => {}, onCancel: () => {} }));
    expect(screen.getByText("Boom.")).toBeTruthy();
  });

  it("does not let them claim twice while one is in flight", () => {
    render(h(PairWaitScreen, { url: URL_, status: "checking", onCheck: () => {}, onCancel: () => {} }));
    expect(screen.getByText(/Checking/i).closest("button").disabled).toBe(true);
  });

  // ── The loop the first real user fell into ──────────────────────
  // The manifest declared a scope, so iOS treated the pairing URL as part of
  // the app and kept the link instead of handing it to Safari: tap Open
  // Safari, watch the page reload onto the same screen, repeat. The scope is
  // gone, but whether a link escapes a home-screen app is iOS's call, read
  // from a manifest cached when the icon was made — so an old icon can still
  // do it, and this is the way out that does not depend on iOS at all.
  it("swaps the link for a copyable URL once it has bounced", () => {
    render(h(PairWaitScreen, { url: URL_, bounced: true, onCheck: () => {}, onCancel: () => {} }));
    expect(screen.queryByRole("link", { name: /Open Safari/i })).toBe(null);
    expect(screen.getByRole("button", { name: /Copy link/i })).toBeTruthy();
    // Selectable by hand, for a browser that refuses the clipboard outright.
    expect(screen.getByText(URL_)).toBeTruthy();
  });

  it("says what iOS did, rather than blaming the sign-in", () => {
    render(h(PairWaitScreen, { url: URL_, bounced: true, onCheck: () => {}, onCancel: () => {} }));
    expect(screen.getByText(/kept that link inside the app/i)).toBeTruthy();
    expect(screen.getByText(/paste it into the address bar/i)).toBeTruthy();
  });

  // Bounced is sticky and the claim runs on every foreground, so the two have
  // to coexist: the instructions must survive a "nothing yet" answer.
  it("keeps the copy instructions while it goes on claiming", () => {
    render(h(PairWaitScreen, { url: URL_, bounced: true, status: "not-yet", onCheck: () => {}, onCancel: () => {} }));
    expect(screen.getByRole("button", { name: /Copy link/i })).toBeTruthy();
    expect(screen.getByText(/Nothing to pick up yet/i)).toBeTruthy();
  });

  it("offers the copy escape before it has bounced too", () => {
    render(h(PairWaitScreen, { url: URL_, onCheck: () => {}, onCancel: () => {} }));
    expect(screen.getByRole("button", { name: /Copy the link/i })).toBeTruthy();
  });

  it("copies to the clipboard, and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(h(PairWaitScreen, { url: URL_, bounced: true, onCheck: () => {}, onCancel: () => {} }));
    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    await screen.findByText(/Link copied/i);
    expect(writeText).toHaveBeenCalledWith(URL_);
    vi.unstubAllGlobals();
  });

  // A clipboard that throws must not leave a button claiming it worked.
  it("shows the URL to select when the clipboard refuses", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    render(h(PairWaitScreen, { url: URL_, onCheck: () => {}, onCancel: () => {} }));
    fireEvent.click(screen.getByRole("button", { name: /Copy the link/i }));
    await screen.findByText(URL_);
    expect(screen.queryByText(/Link copied/i)).toBe(null);
    vi.unstubAllGlobals();
  });

  it("has a way back to the sign-in screen", () => {
    const onCancel = vi.fn();
    render(h(PairWaitScreen, { url: URL_, onCheck: () => {}, onCancel: onCancel }));
    fireEvent.click(screen.getByRole("button", { name: /^←\s*Back$/ }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("PairDoneScreen — Safari's half", () => {
  it("mounts while the token is being filed", () => {
    render(h(PairDoneScreen, { status: "offering" }));
    expect(screen.getByText(/Pairing/i)).toBeTruthy();
  });

  // The one sentence the whole flow depends on somebody reading.
  it("sends them back to the home-screen icon when it worked", () => {
    render(h(PairDoneScreen, { status: "done", onDismiss: () => {} }));
    expect(screen.getByText(/You're signed in/i)).toBeTruthy();
    expect(screen.getByText(/home screen/i)).toBeTruthy();
  });

  it("offers a retry when it did not", () => {
    const onRetry = vi.fn();
    render(h(PairDoneScreen, { status: "error", error: "Nope.", onRetry: onRetry }));
    expect(screen.getByText("Nope.")).toBeTruthy();
    fireEvent.click(screen.getByText(/Try again/i));
    expect(onRetry).toHaveBeenCalled();
  });

  it("lets somebody who only wanted Safari carry on there", () => {
    const onDismiss = vi.fn();
    render(h(PairDoneScreen, { status: "done", onDismiss: onDismiss }));
    fireEvent.click(screen.getByText(/carry on here in Safari/i));
    expect(onDismiss).toHaveBeenCalled();
  });
});
