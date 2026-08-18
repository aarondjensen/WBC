/** @vitest-environment jsdom */
// ══════════════════════════════════════════════════════════════════
//  Does the sheet appear, in each of the states it exists for?
// ══════════════════════════════════════════════════════════════════
//
// A screen in src/components/ gets a test that it APPEARS — the arithmetic is
// pinned next door in editionLifecycle.test.js. What is worth mounting here is
// the set of shapes this file has, because they differ by more than a button:
// a member sees a door, a director sees controls, and a year that refuses to
// be deleted has to SAY so rather than quietly drop the bin, which is the
// whole reason the actions left the row.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement as h } from "react";
import { EditionSheet } from "./EditionSheet";

afterEach(cleanup);

const YEAR = { id: "wbc_2025", year: 2025, name: "WBC 2025" };
const SANDBOX = { id: "wbc_demo", year: null, name: "DEMO Sandbox" };

const show = (props = {}) =>
  render(h(EditionSheet, { edition: YEAR, state: "setup", canManage: true, onClose: () => {}, ...props }));

describe("EditionSheet", () => {
  it("renders nothing without an edition", () => {
    const { container } = render(h(EditionSheet, { edition: null, onClose: () => {} }));
    expect(container.textContent).toBe("");
  });

  it("leads with the year and names the tournament under it", () => {
    // Somebody arriving here tapped a row part-way down a scroll of seventeen.
    show();
    expect(screen.getByText("2025")).toBeTruthy();
    expect(screen.getByText("WBC 2025")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
  });

  it("badges the sandbox instead of inventing a year for it", () => {
    // wbc_demo has no year on purpose — two rows both reading 2026 is a
    // director in a hurry opening the wrong one mid-tournament.
    show({ edition: SANDBOX, isSandbox: true });
    expect(screen.getByText("DEMO")).toBeTruthy();
    expect(screen.getByText("DEMO Sandbox")).toBeTruthy();
  });

  it("gives a member the door and nothing else", () => {
    show({ canManage: false });
    expect(screen.getByText("Open this tournament")).toBeTruthy();
    expect(screen.queryByText("Lock")).toBeNull();
    expect(screen.queryByText("Delete this tournament")).toBeNull();
  });

  it("gives a director the lock, pointed the way the year is not", () => {
    show();
    expect(screen.getByText("Lock")).toBeTruthy();
    cleanup();
    show({ edition: { ...YEAR, locked: true } });
    expect(screen.getByText("Unlock")).toBeTruthy();
    expect(screen.getByText("Locked")).toBeTruthy();
  });

  it("says why a finished tournament refuses to be deleted", () => {
    // The sentence deleteVerdict has always produced and the row could only
    // express by drawing nothing at all.
    show({ state: "complete" });
    expect(screen.queryByText("Delete this tournament")).toBeNull();
    expect(screen.getByText(/record of the event/)).toBeTruthy();
  });

  it("has no door on the year you are already in, and says so", () => {
    show({ isActive: true });
    expect(screen.queryByText("Open this tournament")).toBeNull();
    expect(screen.getByText("ACTIVE")).toBeTruthy();
    expect(screen.getByText(/Open another year first/)).toBeTruthy();
  });

  it("leaves a member on the active year with a sentence rather than an empty sheet", () => {
    show({ isActive: true, canManage: false });
    expect(screen.getByText(/viewing this tournament/)).toBeTruthy();
  });

  it("carries the counts the row was showing", () => {
    show({ summary: "16 players · 4 rounds · 1,152 scores" });
    expect(screen.getByText("16 players · 4 rounds · 1,152 scores")).toBeTruthy();
  });

  it("hands each action back to the caller", () => {
    const calls = [];
    const spy = (name) => () => calls.push(name);
    show({ onOpen: spy("open"), onLock: spy("lock"), onDelete: spy("delete"), onClose: spy("close") });
    fireEvent.click(screen.getByText("Open this tournament"));
    fireEvent.click(screen.getByText("Lock"));
    fireEvent.click(screen.getByText("Delete this tournament"));
    fireEvent.click(screen.getByText("Close"));
    expect(calls).toEqual(["open", "lock", "delete", "close"]);
  });

  it("offers nothing while a write is in flight", () => {
    // Two taps on Lock is two writes and a confirm behind a confirm.
    const calls = [];
    show({ busy: true, onLock: () => calls.push("lock") });
    fireEvent.click(screen.getByText("Lock"));
    expect(calls).toEqual([]);
  });
});
