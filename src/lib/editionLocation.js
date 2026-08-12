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
// The courses each year was played on, in data/courses.csv, and the town each
// of those courses is in. Most years are one RESORT and the answer is not in
// doubt — 2021 is all four Garland courses (Lewiston), 2018 is the three
// Lakewood Shores courses (Oscoda), 2019 is Tullymore and St Ives (Stanwood),
// 2017 is both A-Ga-Ming courses (Kewadin). Where a year toured several towns
// this is the base the trip was run out of, not the only town it touched:
// 2014 played Black Lake in Onaway and three Gaylord courses, and it is a
// Gaylord tournament.
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
  // Gull Lake View country: Yarrow, Stonehedge South and Gull Lake West are
  // Augusta, Bedford Valley the next town over.
  2015: "Augusta, MI",
  // The Grande and Cascades are Jackson; Calderone is Grass Lake, ten minutes
  // east.
  2016: "Jackson, MI",
  // Sundance and Torch are the two courses at A-Ga-Ming.
  2017: "Kewadin, MI",
  // The Gailes, Serradella and Blackshire are Lakewood Shores; Red Hawk is
  // East Tawas, just down the shore.
  2018: "Oscoda, MI",
  // Tullymore and St Ives, the two courses at Tullymore Golf Resort.
  2019: "Stanwood, MI",
  // Based at Crystal Mountain — its Mountain course, plus Arcadia Bluffs and
  // its South course down the coast and Betsie Valley in between. The RESORT
  // rather than its town (Thompsonville), because that is the name the trip
  // is remembered by.
  2020: "Crystal Mountain, MI",
  // All four Garland courses: Fountains, Reflections, Swampfire, Monarch.
  2021: "Lewiston, MI",
  // Back to Gull Lake View — Stoatin Brae twice and Stonehedge North.
  2022: "Augusta, MI",
  // Shanty Creek's Legend and Cedar River plus Hawk's Eye, all Bellaire, with
  // Forest Dunes in Roscommon on the front end.
  2023: "Bellaire, MI",
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
