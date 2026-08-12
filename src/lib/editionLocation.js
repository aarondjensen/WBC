// ══════════════════════════════════════════════════════════════════
//  editionLocation — where each WBC was played.
// ══════════════════════════════════════════════════════════════════
//
// Pure: no Firebase, no React, for the same reason editionId.js and
// historyImport.js are — firebase.js initializes an app at import time, so
// anything importing it is untestable in a plain unit test. Both the header
// (a React component) and the import script (plain Node) read this table.
//
// ── Why this exists ───────────────────────────────────────────────
// The header reads "2026 · Gaylord, MI", and the city half comes from
// tournament_state.meta.location — the field a director fills in under
// Admin → Event. The imported years (2010–2025, see historyImport.js) never
// had one written: the source CSVs in data/ record courses, scores and
// champions, and nothing about where anybody stayed.
//
// A missing location fell through to a HARDCODED "Gaylord, MI" in AppHeader,
// so switching to 2015 in Tournaments produced "2015 · Gaylord, MI" — a
// tournament played in Augusta, three hours south. The WBC plays somewhere new
// nearly every year; a single fallback city is wrong for fifteen of the
// sixteen it has been run.
//
// ── Where these came from ─────────────────────────────────────────
// The courses each year was played on, in data/courses.csv, and where the trip
// that played them was based.
//
// A year run out of ONE RESORT is named for the resort, not for the township
// it is registered in — "2021 · Garland, MI", not Lewiston; "2018 · Lakewood
// Shores, MI", not Oscoda. Seven of the sixteen are like that, and the
// resort is the name the trip is remembered by: nobody says they played
// Kewadin, they say they played A-Ga-Ming. Half of those townships are
// unincorporated places whose name means nothing to anybody who was there.
//
// A year that TOURED gets the town it was based out of, which is not the only
// town it touched: 2014 played Black Lake in Onaway and three Gaylord courses,
// and it is a Gaylord tournament.
//
// It is a hand-kept table rather than something derived from the course rows
// because a course's town is not in the data — data/courses.csv carries a
// name, a rating and a slope, and the registry (`courses`) holds a city only
// for the ones a director has typed in by hand.
//
// ── Keeping it current ────────────────────────────────────────────
// A year the app RUNS gets its location from the director under Admin → Event
// and never reads this table — meta.location wins everywhere it is set. This
// is the fallback for a year that has none, which after 2025 means only the
// imported ones. A year that is missing here shows as the bare year, which is
// the honest answer: no city is better than the wrong one.
export const EDITION_LOCATIONS = {
  // PGA Golf Club at PGA Village — Ryder, Dye and Wanamaker are its three
  // courses, and DATA-GUIDE.md names the venue outright for 2010 and 2011.
  2010: "Port St. Lucie, FL",
  2011: "Port St. Lucie, FL",
  // Same village, with a fourth round down the coast at Abacoa in Jupiter.
  2012: "Port St. Lucie, FL",
  // The one year with no centre of gravity — Black Forest (Gaylord),
  // Lochenheath (Williamsburg), The Legend (Bellaire) and Forest Dunes
  // (Roscommon) are four towns and no resort, and nobody remembers where the
  // trip was based. The courses stand in for a city rather than a town being
  // picked out of the four and called the answer. It is long enough that the
  // header ellipsises it on a phone; a made-up home base would fit, and be a
  // made-up home base.
  2013: "Black Forest / Lochenheath / The Legend / Forest Dunes",
  // Black Lake in Onaway, then The Tribute, The Signature and The Masterpiece
  // — Otsego Club and Treetops, both Gaylord.
  2014: "Gaylord, MI",
  // Three of the four are Gull Lake View's own — Bedford Valley, Stonehedge
  // South and Gull Lake West — with Yarrow, up the road in the same town.
  2015: "Gull Lake View, MI",
  // The Grande and Cascades are Jackson; Calderone is Grass Lake, ten minutes
  // east.
  2016: "Jackson, MI",
  // Sundance and Torch are the two courses at A-Ga-Ming, played twice each.
  2017: "A-Ga-Ming, MI",
  // The Gailes, Serradella and Blackshire are all three of Lakewood Shores';
  // Red Hawk is East Tawas, just down the shore.
  2018: "Lakewood Shores, MI",
  // Tullymore and St Ives, the resort's two courses, played twice each.
  2019: "Tullymore, MI",
  // Based at Crystal Mountain — its Mountain course, plus Arcadia Bluffs and
  // its South course down the coast and Betsie Valley in between. The RESORT
  // rather than its town (Thompsonville), because that is the name the trip
  // is remembered by.
  2020: "Crystal Mountain, MI",
  // All four Garland courses: Fountains, Reflections, Swampfire, Monarch.
  2021: "Garland, MI",
  // Back to Gull Lake View, seven years on — Stoatin Brae twice and
  // Stonehedge North.
  2022: "Gull Lake View, MI",
  // The Legend and Cedar River are two of Shanty Creek's own, with Hawk's Eye
  // in the same town and Forest Dunes an hour out on the front end.
  2023: "Shanty Creek, MI",
  // Southwest Michigan, spread wide: Pine View Spruce is Three Rivers, and
  // Medalist (Marshall), Angels Crossing (Vicksburg) and Binder Park (Battle
  // Creek) are the drives out of it.
  2024: "Three Rivers, MI",
  // The Tribute, The Premier, The Loon and The Lakes — Otsego Club, Treetops
  // and The Loon, all Gaylord.
  2025: "Gaylord, MI",
};

// The city for a year, or "" when we have none. Empty rather than a guessed
// default: the header drops the separator and shows the bare year, which is
// what a tournament nobody has set a location on should say.
export const locationForYear = (year) => EDITION_LOCATIONS[Number(year)] || "";
