// ══════════════════════════════════════════════════════════════════
//  constants — shared assets.
// ══════════════════════════════════════════════════════════════════
// Extracted from App.jsx when a second FILE needed the trophy: AppHeader
// draws it as a CSS mask, and so does the pull-to-refresh indicator. Keeping
// the path in App.jsx and passing it down as a prop would have made app
// identity something the shell hands to its own header.

// Clean SVG trophy for large silhouette display
export const TROPHY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260">
  <!-- Cup body -->
  <path d="M55,10 L145,10 L145,20 C145,20 170,22 170,45 C170,68 152,88 130,95 C124,115 118,125 110,130 L110,160 L130,160 L135,175 L65,175 L70,160 L90,160 L90,130 C82,125 76,115 70,95 C48,88 30,68 30,45 C30,22 55,20 55,20 Z" fill="white"/>
  <!-- Left handle detail -->
  <path d="M55,20 C55,20 42,22 38,30 C34,38 34,52 42,62 C48,70 58,76 70,80" fill="none" stroke="white" stroke-width="0" />
  <!-- Right handle detail -->
  <path d="M145,20 C145,20 158,22 162,30 C166,38 166,52 158,62 C152,70 142,76 130,80" fill="none" stroke="white" stroke-width="0" />
  <!-- Base stem -->
  <rect x="88" y="160" width="24" height="20" rx="2" fill="white"/>
  <!-- Base platform -->
  <rect x="58" y="175" width="84" height="14" rx="5" fill="white"/>
  <!-- Base foot -->
  <rect x="50" y="189" width="100" height="10" rx="5" fill="white"/>
</svg>`;

export const TROPHY_SVG_URL = `data:image/svg+xml;utf8,${encodeURIComponent(TROPHY_SVG)}`;
