/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { createElement as h } from "react";
import { usePullToRefresh } from "./usePullToRefresh";

afterEach(cleanup);

// jsdom does no layout, so every element reads 0/0/0 for the three metrics the
// gesture actually decides on. Stamp them by hand — this is the whole point of
// the test: whether the hook asks the RIGHT element for its scrollTop.
const sized = (el, { client, scroll, top = 0 }) => {
  Object.defineProperty(el, "clientHeight", { value: client, configurable: true });
  Object.defineProperty(el, "scrollHeight", { value: scroll, configurable: true });
  Object.defineProperty(el, "scrollTop", { value: top, writable: true, configurable: true });
  return el;
};

// jsdom has no TouchEvent constructor. The handlers only ever read
// `e.touches[0].clientY`, so a plain Event carrying that is enough — and
// `cancelable` is what makes defaultPrevented mean something, which is the
// assertion these tests turn on.
const touch = (type, y, target) => {
  const e = new Event(type, { bubbles: true, cancelable: type === "touchmove" });
  e.touches = [{ clientY: y }];
  act(() => { target.dispatchEvent(e); });
  return e;
};

// The Pairings/Leaderboard shape: an app body that CANNOT scroll (it is a flex
// column whose child is flex:1) wrapped around a stack that can.
const buildTree = ({ stackScrolls, stackTop = 0 }) => {
  const body = document.createElement("div");
  body.className = "wbc-app-body";
  sized(body, { client: 600, scroll: 600 });
  const stack = document.createElement("div");
  stack.style.overflowY = "auto";
  sized(stack, stackScrolls
    ? { client: 500, scroll: 900, top: stackTop }
    : { client: 500, scroll: 500 });
  const row = document.createElement("div");
  stack.appendChild(row);
  body.appendChild(stack);
  document.body.appendChild(body);
  return { body, stack, row };
};

const Harness = () => {
  const { pullY } = usePullToRefresh({ hasNewBundle: async () => false });
  return h("span", { "data-testid": "pull" }, pullY);
};

const pullOf = (utils) => Number(utils.getByTestId("pull").textContent);

describe("usePullToRefresh — which element owns the gesture", () => {
  it("leaves a scrolled-down inner stack alone, so it can be scrolled back up", () => {
    // The reported bug: on Pairings the app body never scrolls, so its
    // scrollTop is permanently 0 and every downward drag read as "at top" —
    // preventDefault killed the inner stack's own scroll and the tab stuck.
    const { row } = buildTree({ stackScrolls: true, stackTop: 300 });
    const utils = render(h(Harness));

    touch("touchstart", 200, row);
    const move = touch("touchmove", 240, row);

    expect(move.defaultPrevented).toBe(false);
    expect(pullOf(utils)).toBe(0);
  });

  it("still pulls when the inner stack IS at its top", () => {
    const { row } = buildTree({ stackScrolls: true, stackTop: 0 });
    const utils = render(h(Harness));

    touch("touchstart", 200, row);
    expect(touch("touchmove", 220, row).defaultPrevented).toBe(true);
    touch("touchmove", 260, row);

    expect(pullOf(utils)).toBeGreaterThan(0);
  });

  it("still pulls on a tab with no inner scroller of its own", () => {
    const { row } = buildTree({ stackScrolls: false });
    const utils = render(h(Harness));

    touch("touchstart", 200, row);
    touch("touchmove", 220, row);
    touch("touchmove", 260, row);

    expect(pullOf(utils)).toBeGreaterThan(0);
  });

  it("ignores a stack that is told to scroll but has nothing to scroll", () => {
    // `overflow-y: auto` is a backstop on both these tabs — present on a stack
    // that usually fits. A stack that fits is not the scroller.
    const { stack, row } = buildTree({ stackScrolls: false });
    Object.defineProperty(stack, "scrollTop", { value: 0, writable: true, configurable: true });
    const utils = render(h(Harness));

    touch("touchstart", 200, row);
    touch("touchmove", 220, row);
    touch("touchmove", 260, row);

    expect(pullOf(utils)).toBeGreaterThan(0);
  });
});
