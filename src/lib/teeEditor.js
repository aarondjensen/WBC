// ══════════════════════════════════════════════════════════════════
//  teeEditor — the tee list a course editor shows, and what it saves.
// ══════════════════════════════════════════════════════════════════
//
// The course APIs are not complete. A course comes back with three tee boxes
// when it has five, and the two that are missing are usually the ones somebody
// in the group actually plays. Refetching does not help — the API does not
// have them either — so the editor has to let a director type one in, and the
// three things that makes non-obvious are here, with tests.
//
// ORDER. The list reads top-down from the tips, so it sorts by slope
// descending. A tee just added has no slope yet, which sorts it to the bottom
// — where the "Add tee" button is, so that is exactly right. What is not right
// is a row re-sorting out from under a thumb: `orderTeesForEdit` carries each
// tee's index in the draft so the row can be KEYED by it, and typing a slope
// then moves the row with the cursor still in it rather than swapping the
// values under two stationary inputs.
//
// SHAPE. A tee typed by hand arrives with an empty string in every number, and
// the write path stores what it is handed. `normalizeTees` is what stops ""
// reaching Firestore as a slope, and it is the same coercion the manual-entry
// and preview editors already do inline.
//
// COLOUR. A tee typed by hand has no colour, and a stored "" draws as a grey
// square on every screen that shows a tee. The name is what a colour is
// derived from everywhere else in the app (see lib/teeColors), so it is what
// fills the gap here too — an explicit pick from the editor's swatch always
// wins over it.
//
// NAME. A tee box's document id is derived from its name, and so is the tee
// assignment that points at it. Two blank names collide onto one document, so
// a blank one cannot be saved — `unnamedTees` is what the editor asks before
// it lets Save through.
import { resolveTeeColor } from "./teeColors";

// A blank tee, for the director to fill in. Every number is empty rather than
// pre-filled with the 113/72 placeholders: those are the API's way of saying
// it does not know, and a tee added BY HAND is one somebody does know the
// numbers for. Empty also means it sorts to the bottom, where it was added.
export const newTeeBox = () => ({ name: "", color: "", rating: "", slope: "", par: "", yardage: "" });

// [{ tee, index }] sorted by slope descending, index being the tee's position
// in the draft — which is what edits and deletes address, and what the row
// keys off. Array#sort is stable, so equal slopes (and the 0 that a blank
// slope parses to) keep the order they were added in.
export const orderTeesForEdit = (teeBoxes = []) =>
  teeBoxes
    .map((tee, index) => ({ tee, index }))
    .sort((a, b) => (parseFloat(b.tee.slope) || 0) - (parseFloat(a.tee.slope) || 0));

// Tees with nothing in the name. The editor blocks Save on these rather than
// dropping them silently — see the note above on document ids.
export const unnamedTees = (teeBoxes = []) => teeBoxes.filter(tb => !String(tb.name || "").trim());

// Numbers as numbers, names trimmed. 113 and 72.0 are the placeholders the
// rest of the app already reads as "unknown" (see courseSearch's hasRealSlope),
// so a field left blank lands on them rather than on "".
export const normalizeTees = (teeBoxes = [], coursePar = 72) =>
  teeBoxes.map((tb, i) => {
    const name = String(tb.name || "").trim();
    return {
      ...tb,
      name,
      color: tb.color || resolveTeeColor({ name, color: "" }, i),
      rating: parseFloat(tb.rating) || 72.0,
      slope: parseInt(tb.slope) || 113,
      par: parseInt(tb.par) || parseInt(coursePar) || 72,
      yardage: parseInt(tb.yardage) || 0,
    };
  });

// The tee_boxes document id, derived from the course and the tee's name. It is
// derived rather than random because the write is an upsert of the whole set
// on every save; App.jsx built this string in three places and they have to
// agree, or a rename writes a second document instead of replacing the first.
export const teeBoxDocId = (courseId, name) =>
  `tb_${courseId}_${String(name || "default").toLowerCase().replace(/\s+/g, "_")}`;

// Which tee_boxes documents a save should DELETE: the ones the course had
// before and does not have now. Without this a tee removed in the editor comes
// straight back on the next load — the course row no longer lists it, but its
// document is still in the collection the course's tees are read from, and a
// rename leaves the old name behind as a second tee nobody added.
export const staleTeeBoxIds = (courseId, previousTees = [], nextTees = []) => {
  const keep = new Set(nextTees.map(tb => teeBoxDocId(courseId, tb.name)));
  const gone = new Set();
  previousTees.forEach(tb => {
    const id = teeBoxDocId(courseId, tb.name);
    if (!keep.has(id)) gone.add(id);
  });
  return [...gone];
};
