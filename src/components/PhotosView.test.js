/** @vitest-environment jsdom */
// The same low-ceiling question BettingView.test.js asks, for the other view
// that is fetched on demand: does a screen appear when somebody taps it?
//
// Lazy-loading is what makes this worth a test of its own. A missing import in
// a chunk that is only fetched on the first tap cannot fail at build time and
// cannot fail on any other screen — it waits until somebody opens the gallery,
// which on this app is usually somebody standing in a bar showing a photo to
// the person next to them.
//
// The grouping, the delete rules and the upload validation are all pure and
// tested in lib/media. This is only mounting.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { PhotosView } from "./PhotosView";

afterEach(cleanup);

const photo = (id, round, uploadedBy = "uid_aaron") => ({
  id, mediaId: id, edition: "2026", kind: "photo", host: "storage",
  url: `https://example.test/${id}.webp`,
  thumbUrl: `https://example.test/${id}_thumb.webp`,
  path: `editions/2026/${id}.webp`, thumbPath: `editions/2026/${id}_thumb.webp`,
  w: 1600, h: 1200, round, caption: `Hole ${round}`,
  uploadedBy, uploadedByName: "Aaron J",
  createdAt: "2026-08-26T14:00:00.000Z",
});

const baseProps = {
  items: [photo("p1", 1), photo("p2", 2, "uid_dave"), photo("p3", null)],
  year: 2026,
  uid: "uid_aaron",
  isDirector: false,
  isGuest: false,
  canPost: true,
  uploadsBlockedReason: "",
  onUpload: vi.fn(),
  onDelete: vi.fn(),
  notify: vi.fn(),
};

const mount = (extra = {}) => render(h(PhotosView, { ...baseProps, ...extra }));

describe("PhotosView renders", () => {
  it("mounts with a gallery", () => {
    mount();
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  it("mounts with nothing posted yet", () => {
    mount({ items: [] });
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  it("mounts for a guest, who cannot post", () => {
    mount({ isGuest: true, canPost: false, uid: null });
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  it("mounts for a director", () => {
    mount({ isDirector: true });
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  // The budget breaker trips and the upload button goes, replaced by the
  // reason. See onBudgetAlert in functions/index.js.
  it("mounts with uploads switched off by the budget breaker", () => {
    mount({ canPost: false, uploadsBlockedReason: "Photo uploads are paused — storage spend reached its budget." });
    expect(document.body.textContent).toContain("paused");
  });

  it("opens a photo without throwing", () => {
    mount();
    const tiles = document.querySelectorAll("img");
    expect(tiles.length).toBeGreaterThan(0);
    fireEvent.click(tiles[0].closest("button") || tiles[0]);
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });

  it("mounts an archived edition, whose bytes a client cannot delete", () => {
    mount({ items: [{ ...photo("p9", 1), host: "pages" }] });
    expect(document.body.textContent.length).toBeGreaterThan(0);
  });
});
