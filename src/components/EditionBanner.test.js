/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { EditionBanner } from "./EditionBanner";

// switchEdition reloads the whole app, which jsdom cannot do and a test does
// not want done to it.
const switched = vi.fn();
vi.mock("../lib/editions", () => ({ switchEdition: (id) => switched(id) }));

afterEach(() => { cleanup(); switched.mockClear(); });

describe("EditionBanner", () => {
  it("says nothing at all in the tournament being played", () => {
    const { container } = render(h(EditionBanner, { viewingId: "wbc_2026", liveId: "wbc_2026" }));
    expect(container.innerHTML).toBe("");
  });

  it("offers the way back from a past year", () => {
    render(h(EditionBanner, { viewingId: "wbc_2014", liveId: "wbc_2026" }));
    expect(screen.getByText("2014")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to 2026" })).toBeTruthy();
  });

  // The sandbox has no year of its own — dated, both halves would read 2026.
  it("names the sandbox rather than dating it", () => {
    render(h(EditionBanner, { viewingId: "wbc_demo", liveId: "wbc_2026" }));
    expect(screen.getByText("the demo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to 2026" })).toBeTruthy();
  });

  it("draws nothing when there is no live tournament to point at", () => {
    const { container } = render(h(EditionBanner, { viewingId: "wbc_2014", liveId: "" }));
    expect(container.innerHTML).toBe("");
  });

  it("switches on the tap, with no confirm in the way", () => {
    render(h(EditionBanner, { viewingId: "wbc_2014", liveId: "wbc_2026" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to 2026" }));
    expect(switched).toHaveBeenCalledWith("wbc_2026");
  });
});
