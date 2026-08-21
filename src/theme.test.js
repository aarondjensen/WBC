// ══════════════════════════════════════════════════════════════════
//  The palettes, and the contrast that is the point of them.
// ══════════════════════════════════════════════════════════════════
//
// The dark palette carries a comment explaining that its two greys were
// BRIGHTENED because t3 sat at 3.2:1 and t3 is exactly where the 9px text is.
// That fix is the kind a second palette silently undoes: a light theme picked by
// eye looks fine on a desk and disappears on a phone in sun.
//
// So the ratios are asserted rather than described. Every token that carries
// text clears AA on both of its surfaces, in both themes, and the two themes are
// held to the same hierarchy — light is not allowed to be a flatter app.
import { describe, it, expect, afterEach } from "vitest";
import { K, THEMES, THEME_KEY, getTheme, setTheme, toggleTheme, ON_ACC, SHADOW, DIM_PLACED } from "./theme";
import { readFileSync } from "node:fs";

// WCAG 2.1 relative luminance and contrast.
const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const h = String(hex).replace("#", "");
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// Snapshot the palette for a theme without leaving that theme selected.
const paletteFor = (name) => { setTheme(name); return { ...K }; };

afterEach(() => setTheme("dark"));

// Every token carrying TEXT, on both surfaces it is ever drawn on.
const INK = ["t1", "t2", "t3", "acc", "accDim", "warn", "danger", "tourn",
             "eagle", "birdie", "bogey", "dbl", "ok", "under", "gold"];

describe.each(THEMES)("%s palette", (theme) => {
  const P = paletteFor(theme);

  it.each(INK)("%s clears AA (4.5:1) on both bg and card", (token) => {
    expect(contrast(P[token], P.bg), `${token} on bg`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(P[token], P.card), `${token} on card`).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the three greys in a real hierarchy", () => {
    const [c1, c2, c3] = ["t1", "t2", "t3"].map(t => contrast(P[t], P.bg));
    expect(c1).toBeGreaterThan(c2);
    expect(c2).toBeGreaterThan(c3);
    // Each step visibly separated, not three shades of the same idea.
    expect(c1 / c2).toBeGreaterThan(1.3);
    expect(c2 / c3).toBeGreaterThan(1.3);
  });

  it("keeps card and inp as surfaces, not boundaries", () => {
    // Both sit within a hair of the page; they read as depth, not as blocks.
    expect(contrast(P.card, P.bg)).toBeLessThan(1.3);
    expect(contrast(P.inp, P.bg)).toBeLessThan(1.3);
  });

  it("a filled accent button's ink is readable on the fill", () => {
    setTheme(theme);
    expect(contrast(ON_ACC, P.acc)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the two themes are the same app", () => {
  it("define exactly the same tokens", () => {
    const [dark, light] = [paletteFor("dark"), paletteFor("light")];
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  });

  it("agree on which greys are which — no flatter light theme", () => {
    const [dark, light] = [paletteFor("dark"), paletteFor("light")];
    for (const t of ["t1", "t2", "t3"]) {
      const d = contrast(dark[t], dark.bg);
      const l = contrast(light[t], light.bg);
      // Within 25% of each other: the same hierarchy, not a coincidence.
      expect(Math.max(d, l) / Math.min(d, l), `${t}: dark ${d.toFixed(1)} vs light ${l.toFixed(1)}`)
        .toBeLessThan(1.25);
    }
  });

  it("invert the page — light's ink IS dark's page", () => {
    const [dark, light] = [paletteFor("dark"), paletteFor("light")];
    expect(light.t1).toBe(dark.bg);
  });

  it("keeps par printed in the muted ink in both", () => {
    for (const t of THEMES) { const P = paletteFor(t); expect(P.par).toBe(P.t2); }
  });
});

describe("switching", () => {
  it("mutates K in place, so every call site holding it repaints", () => {
    const ref = K;
    setTheme("light");
    expect(K).toBe(ref);                 // same object identity
    expect(K.bg).toBe("#f2f5f9");        // different contents
    setTheme("dark");
    expect(K.bg).toBe("#080f1a");
  });

  it("moves the accent ink with the theme", () => {
    setTheme("light");
    const onLight = ON_ACC;
    setTheme("dark");
    expect(onLight).not.toBe(ON_ACC);
  });

  it("softens the shadow in daylight", () => {
    setTheme("dark");
    const darkShadow = SHADOW;
    setTheme("light");
    expect(SHADOW).not.toBe(darkShadow);
  });

  it("toggles and reports the theme it landed on", () => {
    setTheme("dark");
    expect(toggleTheme()).toBe("light");
    expect(getTheme()).toBe("light");
    expect(toggleTheme()).toBe("dark");
  });

  it("falls back to dark for anything it does not recognise", () => {
    expect(setTheme("chartreuse")).toBe("dark");
    expect(setTheme(undefined)).toBe("dark");
  });

  // vitest runs these in node, which has no localStorage — theme.js guards for
  // exactly that (a phone with storage blocked is the real case) and carries on
  // in memory. Stubbed here so the persistence path is actually exercised rather
  // than skipped.
  it("remembers the choice", () => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    };
    try {
      setTheme("light");
      expect(store.get(THEME_KEY)).toBe("light");
      setTheme("dark");
      expect(store.get(THEME_KEY)).toBe("dark");
    } finally { delete globalThis.localStorage; }
  });

  it("still switches when storage is blocked", () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    try {
      expect(setTheme("light")).toBe("light");
      expect(K.bg).toBe("#f2f5f9");
    } finally { delete globalThis.localStorage; }
  });
});

// ── The copies of `bg` that live outside JavaScript ────────────────
// index.html paints the page before any module is parsed, and index.css paints
// the letterbox either side of the app column. Both hold their own copy of the
// two backgrounds, and a palette change that misses them shows up as a flash of
// the wrong theme on every load — the exact thing the pre-paint exists to stop.
describe("the backgrounds hardcoded outside theme.js", () => {
  const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
  const dark = paletteFor("dark").bg;
  const light = paletteFor("light").bg;

  // One index.html, and only one. This used to check a second copy at
  // src/index.html as well. Vite's root is the repo root and its entry is the
  // index.html beside package.json, so that file was never built, never
  // served, and never seen — but it WAS asserted against, which is what kept
  // it alive through every change it did not receive. By the end it disagreed
  // with the real one about the viewport, the theme colour and the favicon,
  // and it argued for each in comments as carefully as the entry argues for
  // the opposite. A duplicate nothing runs is a duplicate that is always
  // right, so it was deleted rather than fixed.
  it("index.html pre-paints both themes", () => {
    const html = read("../index.html");
    expect(html).toContain(THEME_KEY);
    expect(html).toContain(dark);
    expect(html).toContain(light);
  });

  it("index.css paints both themes", () => {
    const css = read("./index.css");
    expect(css).toContain(dark);
    expect(css).toContain(light);
  });

  // ── The splash holds a THIRD copy, and it is the visible one ──
  // index.html paints the entrance gradient itself now, so that something is
  // on screen before the bundle lands (see #wbc-splash). It is the same
  // picture App.jsx draws once it has mounted — entranceBg() over the two
  // `entrance` tokens — and the whole point is that the hand-off between them
  // is invisible. Move the palette without moving the splash and the screen
  // changes shade at the moment React appears, which is precisely the flash
  // the pre-paint above exists to prevent.
  it("index.html paints the entrance gradient both themes mount into", () => {
    const html = read("../index.html");
    expect(html).toContain(paletteFor("dark").entrance);
    expect(html).toContain(paletteFor("light").entrance);
    // Not just the colours — the gradient they are arranged into. entranceBg()
    // is a radial ellipse offset to 20%, and a splash that used them as a flat
    // fill would pass on the two lines above while still visibly changing when
    // the app took over.
    expect(html).toMatch(/radial-gradient\(ellipse at 20% 50%/);
  });

  // The browser paints what the app does not — scrollbars, the caret, control
  // internals, Android's auto-darkening — and guesses which way round from the
  // DEVICE unless told. Told in both files, and keyed off the app's theme
  // rather than pinned, or the guess is simply wrong the other way.
  it.each([["../index.html", read("../index.html")], ["./index.css", read("./index.css")]])(
    "%s declares a colour scheme that follows the theme", (_f, src) => {
      expect(src).toMatch(/color-scheme:\s*dark/);
      expect(src).toMatch(/\[data-theme="light"\][^{]*\{[^}]*color-scheme:\s*light/);
    });
});

// ── The pairing pool's player tiles ────────────────────────────────
// These were the last raw hex in the app — a dark navy typed straight into the
// style, which the light theme could not reach. It survived the switch as a
// dark tile carrying dark ink: the director's whole roster, unreadable, on the
// screen where the draw gets made. Held here because the tile is built from
// tokens now and the only thing keeping it legible is what those tokens are.
describe("a player tile in the pairing pool", () => {
  it.each(THEMES)("%s: separates from the card it sits on", (theme) => {
    const P = paletteFor(theme);
    // Enough to read as a tile, little enough to still read as one surface.
    expect(contrast(P.hover, P.card)).toBeGreaterThan(1.05);
    expect(contrast(P.hover, P.card)).toBeLessThan(1.5);
  });

  it.each(THEMES)("%s: a name stays readable once the player is placed", (theme) => {
    const P = paletteFor(theme);
    // DIM_PLACED is an opacity, so the ink lands part-way to the tile under it.
    const mix = (a, b, o) => {
      const px = (h) => [0, 2, 4].map(i => parseInt(String(h).replace("#", "").slice(i, i + 2), 16));
      const [x, y] = [px(a), px(b)];
      return "#" + x.map((c, i) => Math.round(o * c + (1 - o) * y[i]).toString(16).padStart(2, "0")).join("");
    };
    // AA for the 11px name it is — the whole reason 0.3 had to go.
    expect(contrast(mix(P.t1, P.hover, DIM_PLACED), P.hover)).toBeGreaterThanOrEqual(4.5);
  });
});
