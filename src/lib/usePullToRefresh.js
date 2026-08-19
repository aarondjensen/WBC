// ══════════════════════════════════════════════════════════════════
//  usePullToRefresh — iOS-style pull-down-to-refresh.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup's lib/usePullToRefresh.js. The gesture logic is
// unchanged — same 0.4x dampening, 120px max pull, 80px trigger threshold,
// 2px "at top" tolerance, and the iOS Safari bounce fix — so the gesture
// feels identical across BC, MNQ and WBC.
//
// What the caller owns and passes in:
//   • hasNewBundle   — async () => boolean. Whether a newer Vite build has
//                      shipped; when true the hook hard-reloads so the user
//                      picks up the latest code. This is the main reason the
//                      gesture is worth having in an installed PWA, where
//                      there is no address bar to reload from.
//   • onRefresh      — called when there is NO new bundle. WBC passes one:
//                      most of its data is live via onSnapshot, but a few
//                      collections are read once at mount (see the caller).
//   • scrollClass    — className of the main scroll container the handlers
//                      walk up to find.
//
// Returns { pullY, refreshing, resetPull, PULL_THRESHOLD }; the caller's
// indicator reads those directly.
//
// ── One deliberate difference from Bourbon Cup ──
// BC suppresses the gesture while a modal is open via a `popupOpenRef` the
// app keeps in sync by hand — one useEffect per piece of modal state, and a
// modal whose state nobody remembered to add is a modal the gesture fights.
// WBC instead marks every overlay in the DOM (`data-popup` on Popup's
// backdrop) and bails if the walk up from the touch target crosses one. That
// covers portaled and inline popups alike, with nothing to keep in sync.

import { useState, useRef, useCallback, useEffect } from "react";

const PULL_THRESHOLD = 80;     // px of pull needed to trigger a refresh
const MAX_PULL = 120;          // indicator can't drift past this
const DRAG_RATE = 0.4;         // finger-to-indicator dampening
const AT_TOP_TOL = 2;          // scrollTop <= this counts as "at top" (iOS subpixel)
const START_SLOP = 5;          // downward px before the pull actually begins
const HARD_SAFETY_MS = 8000;   // force-reset if the refresh work hangs
const SOFT_WATCHDOG_MS = 2000; // reset a pull stuck > 0 with no refresh running
const REFRESH_DELAY_MS = 600;  // brief hold so the spin reads as intentional

export function usePullToRefresh({
  hasNewBundle,
  onRefresh,
  scrollClass = "wbc-app-body",
} = {}) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const pullYRef = useRef(0);
  const pullingRef = useRef(false);

  // Manual reset escape hatch — used by the soft watchdog below, and exported
  // in case a caller needs to abort a stuck pull.
  const resetPull = useCallback(() => {
    setPullY(0);
    pullYRef.current = 0;
    touchStartY.current = 0;
    pullingRef.current = false;
  }, []);

  // Installs document-level touch listeners that watch for a downward drag at
  // the top of the scroll container. Suppressed entirely while `refreshing`
  // (one refresh at a time). passive:false on touchmove is required because we
  // preventDefault() to stop the browser's native overscroll bounce.
  useEffect(() => {
    if (refreshing) return;

    // ── Which element is the finger actually scrolling? ──────────────
    // Not always the app body. Pairings and the leaderboard both lay out to
    // the height they HAVE rather than the height of what is in them: the app
    // body is a flex column, the screen inside it is flex:1, and the stack of
    // rows carries its own `overflow-y: auto` as a backstop for a draw too
    // deep to shrink any further. When that backstop is doing its job the app
    // body cannot scroll at all — its scrollTop is pinned at 0 forever — and
    // asking IT whether we are "at top" answers yes on every touch, including
    // the ones where the stack is scrolled half way down.
    //
    // That is not a cosmetic wrong answer. `atTop` is what licenses the
    // preventDefault() below, so every upward flick on a scrolled stack had
    // its native scroll cancelled and turned into a pull instead: the tab
    // scrolled down fine and then would not come back, and only switching
    // tabs — which remounts the stack at scrollTop 0 — got it unstuck.
    //
    // So walk up and take the INNERMOST element that is genuinely scrolling,
    // falling back to the app body when nothing between it and the touch is.
    const scrollsItself = (el) => {
      if (el.scrollHeight - el.clientHeight <= 1) return false;
      const oy = window.getComputedStyle(el).overflowY;
      return oy === "auto" || oy === "scroll";
    };

    // Returns the element the gesture belongs to, or null if we cross a popup
    // backdrop first (it belongs to the modal, not the page) or never reach
    // the app body at all (touch outside it).
    const findScrollEl = (target) => {
      let el = target;
      let inner = null;
      while (el) {
        if (el.dataset && el.dataset.popup != null) return null;
        if (el.classList && el.classList.contains(scrollClass)) return inner || el;
        // Both halves of scrollsItself matter: `overflow-y: auto` on a stack
        // that fits is not a scroller, and a tall stack in a `visible` box
        // scrolls an ancestor rather than itself. A stack that fits leaves
        // `inner` null and the pull keeps working exactly as it always has.
        if (!inner && el.nodeType === 1 && scrollsItself(el)) inner = el;
        el = el.parentElement;
      }
      return null;
    };
    let activeScrollEl = null;

    const handleStart = (e) => {
      activeScrollEl = findScrollEl(e.target);
      if (!activeScrollEl) { touchStartY.current = 0; return; }
      touchStartY.current = e.touches[0].clientY;
      pullingRef.current = false;
    };

    const handleMove = (e) => {
      if (!touchStartY.current) return;
      // 2px tolerance absorbs subpixel scrollTop rounding on iOS: with
      // safe-area-inset plus momentum cleanup, 1px was too strict and the
      // gesture failed when visually at top but scrollTop read ~1.5.
      const atTop = activeScrollEl ? activeScrollEl.scrollTop <= AT_TOP_TOL : false;
      const currentY = e.touches[0].clientY;
      const diff = currentY - touchStartY.current;

      if (pullingRef.current) {
        if (diff <= 0 || !atTop) {
          pullingRef.current = false;
          pullYRef.current = 0;
          setPullY(0);
          touchStartY.current = currentY;
        } else {
          // 0.4x dampening gives the pull a sense of tension; capped at
          // MAX_PULL so the indicator can't drift indefinitely.
          e.preventDefault();
          const val = Math.min(diff * DRAG_RATE, MAX_PULL);
          pullYRef.current = val;
          setPullY(val);
        }
      } else if (atTop && diff > 0) {
        // CRITICAL iOS fix: preventDefault on EVERY at-top downward touchmove,
        // not only after the threshold. iOS Safari's native overscroll bounce
        // begins on the very first downward move at scrollTop=0; once that
        // animation starts, later preventDefault calls are ignored and the
        // bounce overrides the custom pull.
        e.preventDefault();
        if (diff > START_SLOP) {
          touchStartY.current = currentY;
          pullingRef.current = true;
          pullYRef.current = 0;
          setPullY(0);
        }
      } else if (!atTop) {
        touchStartY.current = currentY;
      }
    };

    const handleEnd = () => {
      pullingRef.current = false;
      activeScrollEl = null;
      if (pullYRef.current < PULL_THRESHOLD) {
        setPullY(0); pullYRef.current = 0; touchStartY.current = 0;
        return;
      }
      // Threshold met — commit. Pin the indicator at threshold height while
      // the work runs so it doesn't snap back mid-spin. 8s hard safety in case
      // the bundle check or the refresh itself hangs.
      setPullY(PULL_THRESHOLD); pullYRef.current = PULL_THRESHOLD;
      setRefreshing(true);
      const hardSafety = setTimeout(() => {
        setRefreshing(false); setPullY(0); pullYRef.current = 0; touchStartY.current = 0;
      }, HARD_SAFETY_MS);
      setTimeout(async () => {
        try {
          const needsUpdate = hasNewBundle ? await hasNewBundle() : false;
          if (needsUpdate) { clearTimeout(hardSafety); window.location.reload(); return; }
          if (onRefresh) await onRefresh();
        } catch { /* swallow — finally still resets the UI */ } finally {
          clearTimeout(hardSafety);
          setRefreshing(false); setPullY(0); pullYRef.current = 0; touchStartY.current = 0;
        }
      }, REFRESH_DELAY_MS);
    };

    document.addEventListener("touchstart", handleStart, { passive: true });
    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("touchend", handleEnd, { passive: true });
    document.addEventListener("touchcancel", handleEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleStart);
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
    };
  }, [refreshing, hasNewBundle, onRefresh, scrollClass]);

  // Soft safety watchdog: if pullY drifts above zero without a refresh
  // running, reset it after 2s. Catches the rare case where touchend /
  // touchcancel doesn't fire and the indicator sticks part-way down. 2s is
  // long enough that a legitimate sub-threshold pull isn't cut off.
  useEffect(() => {
    if (pullY > 0 && !refreshing) {
      const safety = setTimeout(resetPull, SOFT_WATCHDOG_MS);
      return () => clearTimeout(safety);
    }
  }, [pullY, refreshing, resetPull]);

  return { pullY, refreshing, resetPull, PULL_THRESHOLD };
}

// ── hasNewBundle ────────────────────────────────────────────────────
// Whether a new app build has shipped since this client loaded. Vite emits
// hashed asset URLs per build, so comparing the script/stylesheet paths in a
// freshly-fetched index.html against what is in the DOM tells us the running
// code is stale. AbortController + 4s timeout so a flaky network can't hang
// the refresh gesture; any failure answers "no" and the pull falls through to
// its normal refresh rather than erroring in the user's face.
export async function hasNewBundle() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const html = await fetch(`/index.html?t=${Date.now()}`, {
      cache: "no-store", signal: controller.signal,
    }).then(r => r.text());
    const fresh = [];
    let m;
    const scriptRe = /<script[^>]+src="([^"]+)"/g;
    while ((m = scriptRe.exec(html)) !== null) fresh.push(m[1]);
    const linkRe = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g;
    while ((m = linkRe.exec(html)) !== null) fresh.push(m[1]);
    const linkRe2 = /<link[^>]+href="([^"]+)"[^>]+rel="stylesheet"/g;
    while ((m = linkRe2.exec(html)) !== null) fresh.push(m[1]);
    const toPath = (u) => { try { return new URL(u, location.href).pathname; } catch { return u; } };
    const current = new Set([
      ...Array.from(document.querySelectorAll("script[src]")).map(s => toPath(s.src)),
      ...Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).map(l => toPath(l.href)),
    ]);
    return fresh.some(a => !current.has(toPath(a)));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
