// ══════════════════════════════════════════════════════════════════
//  theme — the WBC palette, in one place.
// ══════════════════════════════════════════════════════════════════
//
// `K` was defined inline in App.jsx and read ~650 times from there. It moved
// out the moment a second FILE needed it: the extracted Popup/ConfirmModal are
// part of the same visual system, and the alternative — passing the palette
// down as props, or each component keeping its own copy of the hexes — is how
// two greens drift apart.
//
// This mirrors Bourbon Cup's src/theme.js, which is the app WBC is being
// aligned with. App.jsx still imports `K` and everything reading it there is
// unchanged.

export const K = {
  bg: "#080f1a", card: "#0e1829", inp: "#0a1425", hover: "#142036",
  acc: "#22d3a7", accDim: "#0d9b73", accGlow: "rgba(34,211,167,0.12)",
  tourn: "#38bdf8", tournGlow: "rgba(56,189,248,0.12)",
  warn: "#f59e0b", danger: "#ef4444",
  t1: "#e8edf5", t2: "#8b9ec2", t3: "#526484",
  bdr: "#1a2b47",
  eagle: "#3b82f6", birdie: "#22c55e", par: "#8b9ec2", bogey: "#eab308", dbl: "#ef4444",
};

// Ink for a filled accent button. Which ink an accent button takes is decided
// by the FILL, not by the theme — K.bg happens to be near-black here, but
// spelling it out separately keeps that a deliberate contrast choice rather
// than a coincidence that breaks if the background ever lightens.
export const ON_ACC = "#04121b";
