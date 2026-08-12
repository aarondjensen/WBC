// ══════════════════════════════════════════════════════════════════
//  surnames — the half of every player's name the app never stored.
// ══════════════════════════════════════════════════════════════════
//
// Sixteen years of records call a man "Aaron J". The registry does, the
// history in data/history.js does, and every CSV under data/ does — first name
// plus a last initial, and the surname nowhere at all. So when the display
// convention changed to a first initial and a surname there was nothing to
// build one from: "Aaron J" does not contain "Jensen", and no amount of code
// gets it back.
//
// This is that missing half, given by the director, keyed by the id each man
// is filed under. It is applied when the registry loads, to records that do
// not already carry first_name/last_name of their own — a record that knows
// its own parts is always believed over this file.
//
// ── What this is NOT ──
// It is not a rename. A player's id was derived from his ORIGINAL display name
// ("Aaron J" → aaron_j) and that id is what binds him to his career, his
// sign-in claim and sixteen years of rounds. Nothing here touches an id, and
// nothing here is written back to Firestore: it fills in a name on the way to
// the screen. Delete this file and the app still works, with the old names.
//
// Add a man here when he joins, or leave him out and the board simply shows
// him as it always did.
export const SURNAMES = {
  aaron_j: "Jensen",
  andy_v: "Vigo",
  bob_b: "Bergeron",
  brian_k: "Kelley",
  dave_k: "Kelley",
  eric_o: "Olson",
  jeff_b: "Blanton",
  joe_s: "Stevens",
  john_c: "Curtis",
  matt_v: "Vigo",
  ray_h: "Hsu",
  russ_w: "Westbury",
  scott_r: "Rhoades",
  steve_v: "Vigo",
};
