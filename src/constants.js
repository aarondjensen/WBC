// ══════════════════════════════════════════════════════════════════
//  constants — shared assets.
// ══════════════════════════════════════════════════════════════════
// Extracted from App.jsx when a second FILE needed them: AppHeader and the
// pull-to-refresh indicator both draw the app mark as a CSS mask. Keeping the
// paths in App.jsx and passing them down as props would have made app identity
// something the shell hands to its own header.

// ── How many rounds the WBC plays ──
// Here rather than in App.jsx because a second file needs it: the Tournaments
// picker counts a past year's finalized rounds against this to decide whether
// that year is FINISHED — and a finished tournament is the one thing the
// picker refuses to delete. Two copies of "how many rounds" would mean the
// guard and the app could disagree about when a year is over.
export const DEFAULT_NUM_ROUNDS = 4;
// What Admin offers. Not a free-text field: the only two answers the WBC has
// ever had are three and four, and a fat-fingered "44" would mean 44 rounds of
// empty leaderboard columns.
export const ROUND_CHOICES = [3, 4];
export const clampRounds = (n) => {
  const v = parseInt(n, 10);
  return ROUND_CHOICES.includes(v) ? v : DEFAULT_NUM_ROUNDS;
};

// ── The app mark ──
// The golfer at the top of his follow-through. This is WBC's identity — it is
// the home-screen icon, the pull-to-refresh spinner and the header mark — and
// the trophy below is a TROPHY: an award, used where a result is being shown.
// They are not interchangeable, which is why both are here rather than one
// standing in for the other.
export const WBC_LOGO = "/wbc-icon-512.png";
// The 192px cut, for the apple-touch-icon. Kept here with its sibling even
// though the favicon effect currently writes the path literally.
export const WBC_FAVICON = "/wbc-icon-192.png";

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

// ── How far a closest-to-the-pin can be ─────────────────────────────
// The top of the distance wheel. 60 feet is past the point where anybody is
// claiming a pin, and a wheel that runs to 200 is a wheel nobody can reach the
// useful end of. Shared because the on-course prompt and the director's
// override in the Betting tab are separate files that must offer the same
// range — an override that could not reproduce a tagged distance would be a
// correction tool that cannot correct.
export const CTP_MAX_FT = 60;

// ── The side games, named once ──────────────────────────────────────
// Which games exist and what they are called. Here rather than in App.jsx
// because the two screens that need them are now different FILES: Admin's
// price sheet and the Betting tab's collection sheet, which have to list the
// same games in the same order or the director is reading two sheets that
// disagree about what is owed.

export const SIDE_GAME_KEYS = ["skins", "ctp", "lownet", "market", "rebuy"];
// The order and the wording the Betting tab's collection sheet uses. `short`
// has to fit a 38px column on a phone.
export const SIDE_GAME_LABELS = {
  skins:  { label: "Skins",           short: "SKIN" },
  ctp:    { label: "Closest to Pin",  short: "CTP" },
  lownet: { label: "Low Net",         short: "NET" },
  market: { label: "Market",          short: "MKT" },
  rebuy:  { label: "Market rebuy",    short: "RE" },
};

// ── The closest-to-the-pin distance wheel ───────────────────────────
// Its two measurements. Shared because the wheel is drawn on the scoring
// screen and its range has to match the director's override in the Betting
// tab, which is a different file — an override that could not reproduce a
// tagged distance would be a correction tool that cannot correct.
export const CTP_WHEEL_ITEM = 36;   // px per row — also the scroll-snap stride
export const CTP_WHEEL_H = 150;     // px visible wheel height


// ── The leaderboard's fixed columns ─────────────────────────────────
// Here rather than in the board's own file because the app shell measures
// against them too — see the column sizing in LeaderboardView.
// The board's fixed column widths, in one place because TWO things read them:
// the grid template, and the measurement that centres Total under the trophy.
// They used to be literals in the template and a comment in the measurement,
// and the comment went stale — the # column had been widened from 24 to 36
// while the arithmetic still said 24, so Total sat a dozen pixels off the
// trophy it is supposed to line up with. Widths are sized to the widest string
// each column can hold at its font size, measured rather than guessed: Total
// takes the "STROKES" header (38px, the widest thing in that column — wider
// than any score), Thru takes a "12:10p" tee time at 28px, # takes "T12" plus
// a movement arrow at 32px.
//
// The round columns are NOT in here: they split whatever is left, four ways,
// so `prior` is only the floor below which "+11" stops fitting. Fixed widths
// plus a flexible gap is what made them look uneven — see LB_PAD_R.
// The leaderboard's fixed tracks. The player column is not here because it is
// not fixed — it takes whatever these four leave, which is what lets a long
// surname have every pixel going spare.
//
// `total` is wider than the number it holds needs to be, and deliberately: it
// is right-aligned with nothing ruling it off, so the width IS the gap between
// the name and the score. Same for the four rounds, which are one track split
// four ways rather than four tracks.
// Measured, twice, against the two states that squeeze this row hardest.
//
// The player column is what is left after these four, and the longest name in
// the field has to fit it: at 360 they leave it 116px, and "O FITZGERALD" — the
// longest surname on the roster, in the caps the board draws — takes 109.
//
// `thru` is 40 for a value that is not a hole count. On the morning of a round
// this column holds a TEE TIME, and "10:24a" measures 33.7 even at the two
// rungs down it is drawn at — in a 34px track it ran flush into the total
// beside it, which by then is a real number rather than a dash. The six
// pixels come off the four rounds, which have digits to spare.
export const LB_COL = { num: 26, total: 50, thru: 40, priorMin: 25 };
// A hair of padding either side of a row, and no more. The board used to be a
// bordered card inset from the page, so its rows needed room between their ink
// and that border; it has no border now — the page's own padding is the margin
// — and anything more here would set the board in from a frame that is not
// there. Even on both sides, because there is no longer a band running to the
// right-hand edge for the last round column to sit against.
export const LB_PAD_L = 2;


export const WBC_TROPHY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIoAAADgAgMAAAChhhbLAAAACVBMVEX///8i06f///8qYg9HAAAAAXRSTlMAQObYZgAAAAFiS0dEAIgFHUgAAAAHdElNRQfqAhwPCRGrKvWFAAACeElEQVRYw+3YW3LdIAwAUPHBDsp+9NN/dQb2v5WaxzUgJFCapNOkZvK8PmM9kO2bAAwrpNdCUFYnKhpJSpJwiS1aTVrWEs6vJu2TkU16zH9pwj8W6zGKyQdRNfVo/kqqScWknfHdxK0huD6casL1mQ3uTD5yGdgZehkwGr81aDNJNXibIJrYDJbTec1E6AZl46ibq0GiycdyMsUk2ZRHxhvMtW9Sn/1tojKptbJuZBRhMkp/jobeZtL7jSuDU3/cGffpBuuBsleaqWX5bmBvcG+wzuLOlMOelBuZ3aS7OJvxW6MMRzQbZzGxn+1kcGN8M/ROE2j4przPbMbvTJuKGlIzMJQnG2cxbUcgikNGQ+mvmLJpF3S+9WqmDXIb64OpU8ZNmeP72VyT/1MTXmW14kVDt0kGEyQz7OjdoLAaN7wtKd0UjO+hamGCCaNJ68bHOZ32i2AGUrdl2S4XR1NvaNz4yTjZ0GhgLQxba/v6YTBBMnE2eRRnc704p1OSXgyejWMGuMlPG0ZyYZ6Z5f3qlbSbjYuLobO5XmGG7QTUOZi3Kywkz/RYGJbt4cGQGRIMzcYJBub3Uu1mwg1OJkgG4mjW7tQTDQ2KYqir9F9sNoTF+iwvNqpysGOoOZhm4JzOGIwMBlXjz6F60nqonvTO+FPlRuOOKd8J0daEQ3fuhPanqQnhY76dgQ86zxczYKi9XDwfYf5iny3XsuWeYDCGe1R/yBmIhhJbeip90T6QlnhIx2Dq3++7UEIwwXzW/2mdZPAxb+nhYx7zpQ3OxHJdeMnQbIJk4jc1rHaxP6yHlr0wPS8sz6b1RARnhIKZ0/4J8jqdZBo0Jn4DUtjOuhjt96MAAAAASUVORK5CYII=";

// The watermark behind the leaderboard. A FILE rather than a data URI: as
// base64 it was 27,000 characters of App.jsx and ~20KB of every JS bundle,
// re-downloaded on every deploy because it rode inside code that changes
// constantly. As a static asset it is fetched once and cached for a year,
// and it stops being the reason a code generator gives up on this file.
export const WBC_TROPHY_SILHOUETTE = "/wbc-trophy-silhouette.png";
