// ══════════════════════════════════════════════════════════════════
//  courseSearch — reading a golf course out of two different APIs.
// ══════════════════════════════════════════════════════════════════
//
// Adding a course to a round means finding it in a public database, and there
// are two of them behind /api/courses and /api/courses2. They disagree about
// almost everything: field names, how a tee box is shaped, whether the state
// is "MI" or "Michigan", and whether the numbers are real.
//
// That last one is the whole reason this file is careful. A course row is
// frequently returned with slope 113 on every tee — 113 is the slope of an
// AVERAGE course, and it is what these APIs emit when they do not actually
// know. Accept it and the tournament is played off handicaps computed from a
// course nobody has measured, which is wrong in a way no screen would show.
// So `hasRealSlope` exists, and search results carrying real ratings sort
// above ones that do not.
//
// Extracted from App.jsx because the search and the course EDITOR both parse
// these responses, and because none of it had a test — the parsing of an
// external API being exactly the code most likely to meet a shape nobody
// anticipated.

// ── Course-API parsing ─────────────────────────────────────────────────────
// Hoisted out of doCourseSearch so the course EDITOR can reach the same two
// APIs with the same parsing. Refetching a course's tees and searching for a
// new course have to agree about what a tee box is, and the only way to be
// sure of that is for them to run the same code.
import { resolveTeeColor } from "./teeColors.js";

export const STATE_NAMES = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming" };
export const STATE_ABBREVS = Object.fromEntries(Object.entries(STATE_NAMES).map(([k,v]) => [v.toUpperCase(), k]));
// Does this course's state match what the director typed?
//
// Either side can arrive as an abbreviation or a full name — the two APIs
// disagree, and so do people — so BOTH are normalised to an abbreviation and
// compared once. The previous version tested three cases by hand and two of
// them were the same one: a course returned as "MI" was dropped whenever the
// filter was typed as "Michigan", which is the spelling somebody reaching for
// a state filter is most likely to use.
//
// An empty filter matches everything: no filter means the search was not
// narrowed, not that nothing qualifies.
export const stateMatches = (courseState, filter) => {
  if (!filter || !courseState) return true;
  const toAbbrev = (v) => {
    const u = String(v).trim().toUpperCase();
    return STATE_ABBREVS[u] || u;   // full name → abbreviation; an abbreviation stays itself
  };
  return toAbbrev(courseState) === toAbbrev(filter);
};

export const decodeHtml = (str) => str ? str.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'") : str;
export const hasRealSlope = (c) => (c.tee_boxes || []).some(tb => parseInt(tb.slope) !== 113) || (parseInt(c.slope) !== 113 && !!c.slope);

export const parseRapidAPI = (rawCourses, stateFilter) => rawCourses
  .filter(c => stateMatches(c.state, stateFilter))
  .map((c, ci) => {
    // This API: top-level courseRating/slopeRating, scorecard[].tees.teeBox1/teeBox2...
    const sc = Array.isArray(c.scorecard) ? c.scorecard : [];
    const hole_pars = sc.map(h => parseInt(h.Par) || 4);
    const hole_handicaps = sc.map(h => parseInt(h.Handicap) || 0);
    const par = hole_pars.reduce((a, b) => a + b, 0) || 72;
    // Collect all tee box keys across all holes
    const teeKeys = [...new Set(sc.flatMap(h => h.tees ? Object.keys(h.tees) : []))];
    const tees = teeKeys.length ? teeKeys.map((key, ti) => {
      const sample = sc.find(h => h.tees?.[key]);
      const color = sample?.tees?.[key]?.color || key;
      const yardage = sc.reduce((a, h) => a + (parseInt(h.tees?.[key]?.yards) || 0), 0);
      const hole_yards = sc.map(h => parseInt(h.tees?.[key]?.yards) || 0);
      return {
        name: color || key,
        color: resolveTeeColor({ name: color || key, color: color || "" }, ti),
        slope: parseInt(c.slopeRating) || 113,
        rating: parseFloat(c.courseRating) || 72.0,
        par, yardage, hole_yards,
      };
    }) : [{
      name: "Default",
      color: resolveTeeColor({ name: "Default", color: "" }, 0),
      slope: parseInt(c.slopeRating) || 113,
      rating: parseFloat(c.courseRating) || 72.0,
      par, yardage: 0, hole_yards: [],
    }];
    return {
      id: `rapid_${c._id || ci}`,
      name: decodeHtml(c.name) || "Unknown",
      city: c.city || "", state: c.state || "",
      par, slope: parseInt(c.slopeRating) || 113,
      rating: parseFloat(c.courseRating) || 72.0,
      hole_pars, hole_handicaps, tee_boxes: tees,
      _source: "RapidAPI",
    };
  });

export const parseGolfCourseAPI = (rawCourses) => {
  const arr = Array.isArray(rawCourses) ? rawCourses : (rawCourses.courses || []);
  return arr.map((c, ci) => {
    const teesObj = c.tees || {};
    const allTees = Array.isArray(teesObj.male) && teesObj.male.length ? teesObj.male : (teesObj.female || []);
    const tees = allTees.map((t, ti) => ({
      name: t.tee_name || "Default",
      color: resolveTeeColor({ name: t.tee_name || "", color: "" }, ti),
      rating: parseFloat(t.course_rating) || 72.0,
      slope: parseInt(t.slope_rating) || 113,
      par: parseInt(t.par_total) || 72,
      yardage: parseInt(t.total_yards) || 0,
      hole_yards: (t.holes || []).map(h => parseInt(h.yardage) || 0),
    }));
    const firstTee = allTees[0]; const holes = firstTee?.holes || [];
    return {
      id: `gc_${c.id || ci}`,
      name: decodeHtml([c.club_name, c.course_name].filter(Boolean).join(" – ") || c.name || "Unknown"),
      city: c.location?.city || c.city || "", state: c.location?.state || c.state || "",
      par: parseInt(firstTee?.par_total) || 72,
      slope: parseInt(firstTee?.slope_rating) || 113,
      rating: parseFloat(firstTee?.course_rating) || 72.0,
      hole_pars: holes.map(h => parseInt(h.par) || 4),
      hole_handicaps: holes.map(h => parseInt(h.handicap) || 0),
      tee_boxes: tees,
      _source: "GolfCourseAPI",
    };
  });
};

// ── fetchCourseTees ────────────────────────────────────────────────────────
// Ask the course APIs again for ONE course's tee boxes. Both endpoints, same
// parsing as the search, best name match wins.
//
// Why the editor needs this: a course arrives with whatever tees the API had
// that day, and the editor can delete them. Delete the wrong one — or find the
// course was imported with a single "Default" tee when it really has five —
// and the only way back used to be removing the course and searching for it
// again, which loses every hand edit and every round already assigned to it.
export const fetchCourseTees = async (name, state) => {
  const q = (name || "").trim();
  if (q.length < 2) return [];
  const stateParam = state ? `&state=${encodeURIComponent(state)}` : "";
  const found = [];
  try {
    const r = await fetch(`/api/courses2?search=${encodeURIComponent(q)}${stateParam}`);
    if (r.ok) {
      const raw = await r.json();
      found.push(...parseRapidAPI(Array.isArray(raw) ? raw : (raw.courses || []), state));
    }
  } catch (e) { console.log("[refetch/RapidAPI] failed:", e); }
  try {
    const r2 = await fetch(`/api/courses?search=${encodeURIComponent(q)}${stateParam}`);
    if (r2.ok) found.push(...parseGolfCourseAPI(await r2.json()));
  } catch (e) { console.log("[refetch/GolfCourseAPI] failed:", e); }
  if (!found.length) return [];
  // Exact name first, then anything containing it, then whatever came back —
  // and among equals prefer the one carrying real ratings over a row of 113s.
  const lc = q.toLowerCase();
  const rank = (c) => {
    const n = (c.name || "").toLowerCase();
    return (n === lc ? 0 : n.includes(lc) || lc.includes(n) ? 1 : 2) * 2 + (hasRealSlope(c) ? 0 : 1);
  };
  const best = [...found].sort((a, b) => rank(a) - rank(b))[0];
  return best?.tee_boxes || [];
};

// ── TEE ASSIGNER ──
