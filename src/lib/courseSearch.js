// ══════════════════════════════════════════════════════════════════
//  courseSearch — reading a golf course out of the course API.
// ══════════════════════════════════════════════════════════════════
//
// Adding a course to a round means finding it in a public database. That is
// RapidAPI, behind /api/courses2. There used to be a second one behind
// /api/courses (golfcourseapi.com), merged in to fill gaps; it stopped
// returning data and was removed, along with the merge logic that only existed
// because there were two sources.
//
// What survives from having had two is the caution about the numbers. A course
// row is frequently returned with slope 113 on every tee — 113 is the slope of
// an AVERAGE course, and it is what this API emits when it does not actually
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
// Hoisted out of doCourseSearch so the course EDITOR can reach the same API
// with the same parsing. Refetching a course's tees and searching for a new
// course have to agree about what a tee box is, and the only way to be sure of
// that is for them to run the same code.
import { apiUrl } from "./apiBase";
import { resolveTeeColor } from "./teeColors.js";

export const STATE_NAMES = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming" };
export const STATE_ABBREVS = Object.fromEntries(Object.entries(STATE_NAMES).map(([k,v]) => [v.toUpperCase(), k]));
// Does this course's state match what the director typed?
//
// Either side can arrive as an abbreviation or a full name — the API is not
// consistent about it, and neither are people — so BOTH are normalised to an
// abbreviation and compared once. The previous version tested three cases by
// hand and two of them were the same one: a course returned as "MI" was
// dropped whenever the filter was typed as "Michigan", which is the spelling
// somebody reaching for a state filter is most likely to use.
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

// ── searchCourses ──────────────────────────────────────────────────────────
// One query, two places to look, in this order:
//
//   1. THE COURSES THIS APP ALREADY HOLDS. Sixteen years of WBC history are in
//      Firestore with hand-corrected pars and stroke indexes on them, and a
//      course somebody has already fixed beats the API's version of the same
//      course every time. Matching on name OR city, because "Gaylord" is how
//      you look for Treetops.
//   2. THE COURSE API, for everything else — minus anything already found
//      above, matched by name, so the corrected copy is the one on screen.
//
// Neither source is allowed to take the search down with it: a Firestore
// failure still leaves the API's answers, and an API failure still leaves the
// library's. Both failing returns an empty list rather than an error, because
// "nothing matched" and "the network is gone" look the same to somebody
// standing in a car park and the useful move in both cases is to try again.
//
// This lived inside AdminView and is out here now because the scramble's setup
// screen needs the same search — a director adding the course a scramble is
// played on is doing exactly what a director adding a course to Round 2 does,
// and two copies of it is two chances for one of them to stop agreeing with
// the API.
//
// The loaders are injected so this can be tested without Firestore or a
// network; the defaults below are what both screens actually run.
export const MIN_COURSE_QUERY = 2;

// How long a search field waits after the last keystroke. Every screen that
// searches courses uses it, so the API sees one request per word typed rather
// than one per letter.
export const COURSE_SEARCH_DEBOUNCE_MS = 400;

// Firestore's `in` takes at most 30 values. The tee boxes for a wide result
// set are fetched in batches for that reason — a single query over 40 course
// ids throws, and a throw here used to take EVERY saved course out of the
// results and quietly leave only the API's.
const IN_BATCH = 30;

// `db` is reached by dynamic import rather than at the top of this file so
// that importing the parsing helpers here does not drag Firebase into the
// graph — this module is also read by a test suite and by a lazy screen, and
// only this one function needs the database.
// `db` is reached by dynamic import rather than at the top of this file so
// that importing the parsing helpers here does not drag Firebase into the
// graph — this module is also read by a test suite and by a lazy screen, and
// only this one function needs the database.
//
// THE CACHE FIRST, then the server. `courses` and `tee_boxes` are two of the
// read-once collections lib/db keeps a stored copy of, and a cache read never
// leaves the phone: it is instant, it is billed nothing, and — the part that
// matters here — it cannot hang. A director searching from a car park gets
// their own library out of the cache while the server read is still deciding.
// Null from getCached means nothing is STORED, which is a different answer
// from nothing being there, so that is the one case that falls through.
const readCached = async (db, col, filters) => (await db.getCached(col, filters)) || (await db.get(col, filters)) || [];

const defaultLoadSaved = async (q, state) => {
  const { db } = await import("./db");
  const qLower = q.toLowerCase();
  const rows = await readCached(db, "courses");
  if (!rows.length) return [];
  const filtered = rows.filter(r => {
    const nameMatch = (r.name || "").toLowerCase().includes(qLower);
    const cityMatch = (r.city || "").toLowerCase().includes(qLower);
    return (nameMatch || cityMatch) && (state ? stateMatches(r.state, state) : true);
  }).slice(0, 40);
  const ids = filtered.map(r => r.id).filter(Boolean);
  const tbRows = [];
  for (let i = 0; i < ids.length; i += IN_BATCH) {
    tbRows.push(...await readCached(db, "tee_boxes", [{ field: "course_id", op: "in", value: ids.slice(i, i + IN_BATCH) }]));
  }
  return filtered.map(c => ({
    ...c,
    hole_pars: c.hole_pars || [],
    hole_handicaps: c.hole_handicaps || [],
    _source: "WBC History",
    tee_boxes: tbRows.filter(t => t.course_id === c.id).map((t, ti) => {
      // A tee box saved as 113 when the COURSE knows better is the API's "I
      // do not know" written onto a row somebody has since corrected.
      const tbSlope = parseInt(t.slope), courseSlope = parseInt(c.slope);
      const slope = (tbSlope === 113 && courseSlope && courseSlope !== 113) ? courseSlope : t.slope;
      return { ...t, slope, color: resolveTeeColor(t, ti) };
    }),
  }));
};

const defaultLoadApi = async (q, state) => {
  const stateParam = state ? `&state=${encodeURIComponent(state)}` : "";
  const r = await fetch(apiUrl(`/api/courses2?search=${encodeURIComponent(q)}${stateParam}`));
  if (!r.ok) return [];
  const data = await r.json();
  const raw = Array.isArray(data) ? data : (data.courses || data.data || []);
  return parseRapidAPI(raw, state);
};

// How long the saved-course read is given before the search goes on without
// it. A cached Firestore read answers in milliseconds; a read made with no
// signal does not answer AT ALL — getDocs on a disconnected phone neither
// resolves nor rejects, it waits (see the note at the top of lib/db). Awaited
// unguarded, that is a search field that spins forever in a car park with one
// bar, even though the course API answered fine.
export const SAVED_COURSES_TIMEOUT_MS = 6000;

// Settle a loader to a list no matter what it does: throw, answer with
// nothing, or never answer at all. The timer is cleared on the winning path so
// a resolved search leaves nothing pending behind it.
const settle = async (promise, ms) => {
  let timer = null;
  try {
    const out = ms
      ? await Promise.race([promise, new Promise(res => { timer = setTimeout(() => res(null), ms); })])
      : await promise;
    return out || [];
  } catch (e) {
    console.log("[courses] a source failed:", e);
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export async function searchCourses(query, { state = "", loadSaved = defaultLoadSaved, loadApi = defaultLoadApi } = {}) {
  const q = String(query || "").trim();
  if (q.length < MIN_COURSE_QUERY) return [];

  // Both at once. They used to be chained — the library read, then the API —
  // which made every search the sum of two round trips rather than the longer
  // of them, and put the slower and less reliable of the two first.
  const [saved, found] = await Promise.all([
    settle(Promise.resolve().then(() => loadSaved(q, state)), SAVED_COURSES_TIMEOUT_MS),
    settle(Promise.resolve().then(() => loadApi(q, state))),
  ]);

  const known = new Set(saved.map(c => (c.name || "").toLowerCase()));
  const api = found.filter(c => !known.has((c.name || "").toLowerCase()));

  // A row of 113s is the API saying it does not know this course's ratings.
  // Flagged rather than dropped: the row is still the right course, and for a
  // scramble — where no handicap is applied at all — the pars are all that
  // matter. What must not happen is a tournament played off ratings nobody
  // measured without somebody being told.
  return [...saved, ...api].map(c => ({ ...c, _incompleteData: !hasRealSlope(c) }));
}

// ── fetchCourseTees ────────────────────────────────────────────────────────
// Ask the course API again for ONE course's tee boxes. Same parsing as the
// search, best name match wins.
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
    const r = await fetch(apiUrl(`/api/courses2?search=${encodeURIComponent(q)}${stateParam}`));
    if (r.ok) {
      const raw = await r.json();
      found.push(...parseRapidAPI(Array.isArray(raw) ? raw : (raw.courses || []), state));
    }
  } catch (e) { console.log("[refetch/RapidAPI] failed:", e); }
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
