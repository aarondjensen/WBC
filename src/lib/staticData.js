// ══════════════════════════════════════════════════════════════════
//  staticData — what the four read-once collections become.
// ══════════════════════════════════════════════════════════════════
//
// `players`, `tournament_rounds`, `courses` and `tee_boxes` are the half of
// the app that does NOT arrive over onSnapshot. A director edits them rarely,
// so they are read at mount and re-read on a pull, rather than costing four
// more live listeners on every phone in the field.
//
// The READS live in App.jsx — they need `db` and the active tournament id.
// What each row BECOMES lives here, because it is testable and because there
// should be exactly one copy of it.
//
// There were two. The mount load and pull-to-refresh each built the registry
// their own way, and they had drifted: the refresh took `name` straight off
// the stored record, so pulling to refresh on the 1st tee quietly undid the
// display convention the mount load applied and turned every "Aaron Jensen"
// back into "Aaron J". They disagreed about tee boxes too — one parsed slope,
// par and yardage, the other passed through whatever Firestore held.
import { withKnownSurname, displayNameFor } from "./playerNames";

// A stored number that may have been written as a string. Missing stays
// missing: a tee with no slope recorded is not a tee with a slope of NaN.
const int = (v) => (v === undefined || v === null || v === "" ? undefined : parseInt(v, 10));
const dec = (v) => (v === undefined || v === null || v === "" ? undefined : parseFloat(v));

// ── The career registry, as the app displays it ────────────────────
// The one place a stored player record becomes something a screen renders,
// and so the one place the display convention is applied. A name the app
// generated years ago under the old one — "Aaron J" — is restyled on the way
// in; a nickname a director typed is not, and neither is a row with no
// first/last to restyle from. See lib/playerNames.
//
// What is STORED never changes: the id binding a man to sixteen years of
// history was derived from that string, so it is identity, not presentation.
export const registryRows = (rows = []) =>
  (rows || [])
    .filter(r => r?.id)
    .map(r => {
      // The surname first, where the record does not carry one — see
      // data/surnames.js. Sixteen years of records store "Aaron J" and no
      // surname anywhere, so without this the convention below has nothing to
      // restyle and every board reads exactly as it did.
      const full = withKnownSurname(r);
      return {
        id: r.id,
        name: displayNameFor(full),
        first_name: full.first_name || "",
        last_name: full.last_name || "",
        index_override: r.index_override ?? null,
        // Which edition owns this record, for the rows that are owned by one —
        // the sandbox's. Absent on every career record, which is what makes
        // them global. Carried through here rather than dropped with the rest
        // of the stored document because the filter that acts on it runs on
        // THIS shape; see lib/playerScope.
        edition_id: r.edition_id || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

// ── Which course each round is played on ───────────────────────────
// In round order, and trimmed to the four fields the app stores about a
// round. Anything else on the document belongs to whatever wrote it.
export const roundRows = (rows = []) =>
  (rows || [])
    .filter(r => Number.isFinite(Number(r?.round_number)))
    .sort((a, b) => a.round_number - b.round_number)
    .map(r => ({
      id: r.id, tournament_id: r.tournament_id,
      round_number: r.round_number, course_id: r.course_id,
    }));

// The courses this tournament actually plays, deduplicated — two rounds on
// the same course is one course to fetch, and asking for it twice would spend
// half of a `where in` clause's room on a repeat.
export const courseIdsOf = (rounds = []) =>
  [...new Set((rounds || []).map(r => r?.course_id).filter(Boolean))];

// ── A course and the tees it is played from ────────────────────────
// Courses and their tee boxes are separate collections, and a round is scored
// against the TEE's rating and slope rather than the course's — so nothing
// can be worked out until they are stitched back together.
export const stitchCourses = (cRows = [], tbRows = []) =>
  (cRows || []).map(c => ({
    ...c,
    hole_pars: c.hole_pars || [],
    hole_handicaps: c.hole_handicaps || [],
    tee_boxes: (tbRows || [])
      .filter(t => t.course_id === c.id)
      .map(t => ({
        name: t.name, color: t.color,
        rating: dec(t.rating), slope: int(t.slope),
        par: int(t.par), yardage: int(t.yardage),
      })),
  }));
