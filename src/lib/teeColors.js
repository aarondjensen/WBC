// ══════════════════════════════════════════════════════════════════
//  teeColors — what colour a set of tees actually is.
// ══════════════════════════════════════════════════════════════════
//
// A tee box arrives from the course API with a NAME and, sometimes, a colour.
// Neither can be trusted on its own.
//
// The name is what a golfer says — "the blues", "the tips" — and it is what
// the swatch has to agree with. The stored colour is frequently absent, and
// when it is present it is frequently "#000000", which is the API's way of
// saying it does not know rather than the tees being black. Drawing that
// literally gives a scorecard where half the courses have black tees.
//
// So the NAME wins, always, and the stored colour is the fallback for a name
// nothing recognises. Beyond that there is a palette cycled by index, because
// two tee sets on one card have to be told apart even when neither is named
// anything a person would call a colour.
//
// Extracted from App.jsx because the swatch is drawn on five screens and they
// are becoming five files. Pure, and testable, which it never was inline.

// Resolve tee color from name — handles standard colors, non-standard colors, and word names
export const TEE_COLOR_MAP = {
  black: "#2c2c2c", blue: "#2d8fd4", white: "#e8e8e8", gold: "#d4a843", red: "#9b2335",
  green: "#2d8a4e", silver: "#a8b2bd", yellow: "#e6c619", orange: "#e67e22", purple: "#7b2d8b",
  maroon: "#6b1c2a", navy: "#1b2a4a", teal: "#1a8a7a", tan: "#c4a86b", copper: "#b87333",
  bronze: "#cd7f32", champagne: "#f7e7ce", crimson: "#b22234", burgundy: "#800020",
  platinum: "#c0c0c0", pewter: "#8e8e8e", sand: "#c2b280", coral: "#ff7f50",
  tournament: "#1a1a2e", championship: "#1a1a2e", tips: "#1a1a2e", pro: "#2d8fd4", member: "#e8e8e8",
  ladies: "#c0392b", senior: "#d4a843", forward: "#d4a843", back: "#1a1a2e", middle: "#e8e8e8",
};
// Palette for unknown tee names (cycled by index)
export const TEE_FALLBACK_COLORS = ["#5b8fb9", "#8b5e3c", "#6b7b3a", "#8e44ad", "#2e86ab", "#a84632"];
export const resolveTeeColor = (tee, index) => {
  // Always check name first so known color names are normalized consistently
  const key = (tee.name || "").toLowerCase().trim();
  if (TEE_COLOR_MAP[key]) return TEE_COLOR_MAP[key];
  for (const [word, clr] of Object.entries(TEE_COLOR_MAP)) {
    if (key.includes(word)) return clr;
  }
  // Fall back to stored color only for unknown tee names
  if (tee.color && tee.color !== "#000" && tee.color !== "#000000") return tee.color;
  return TEE_FALLBACK_COLORS[index % TEE_FALLBACK_COLORS.length];
};
// Combo tee detection — splits "BLACK/BLUE" into ["#2c2c2c", "#2d8fd4"]
export const getComboColors = (name) => {
  if (!name) return null;
  const separators = ["/", "-", "+", "&", " and "];
  for (const sep of separators) {
    const parts = name.split(new RegExp(`\\s*${sep.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\s*`, "i")).map(p => p.trim().toLowerCase());
    if (parts.length === 2 && parts[0] !== parts[1]) {
      const c1 = TEE_COLOR_MAP[parts[0]] || (parts[0].includes("black") ? "#2c2c2c" : null);
      const c2 = TEE_COLOR_MAP[parts[1]] || (parts[1].includes("white") ? "#e8e8e8" : null);
      if (c1 && c2) return [c1, c2];
    }
  }
  return null;
};

export const isLightTee = (clr) => {
  if (!clr) return false;
  const light = ["#e8e8e8","#a8b2bd","#c0c0c0","#f7e7ce","#c2b280","#c4a86b","#8e8e8e"];
  return light.includes(clr.toLowerCase());
};
export const isDarkTee = (clr) => {
  if (!clr) return false;
  const dark = ["#1a1a2e","#000000","#111111","#0a0a0a","#1a1a1a","#222222","#2c2c2c","#2d2d2d","#0d0d0d","black"];
  return dark.includes(clr.toLowerCase());
};
export const isBlackTee = (clr) => isDarkTee(clr);

