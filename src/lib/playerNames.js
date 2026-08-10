// ══════════════════════════════════════════════════════════════════
//  playerNames — the three ways this app says who somebody is.
// ══════════════════════════════════════════════════════════════════
//
// A player carries a `name` — "Aaron J" — and that string is what every screen
// in the app renders. It is also the older of the two records: the roster
// predates first_name/last_name being stored at all, so a name may exist with
// nothing behind it.
//
// That leaves three questions, and they have different answers:
//
//   toDisplayName   given the parts, what goes on a leaderboard row. First
//                   name plus a last INITIAL, because a board on a phone has
//                   room for one of those and there have been two Daves.
//   fullName        the whole thing, for the admin console and anywhere a
//                   person is being administered rather than scored.
//   splitName       the inverse, best-effort, so opening the player editor on
//                   a roster row from 2011 puts the name in the right boxes
//                   instead of showing blanks.
//
// splitName is a GUESS and only a guess: it exists so the editor has somewhere
// to start, and whatever the director confirms is what gets stored. It splits
// on the first space, so "Van Der Berg" seeds as first "Van", last "Der Berg"
// — wrong, and wrong in a way somebody can see and fix in the field they are
// already looking at, which is the point.

// First name + last initial. What goes on a row.
export const toDisplayName = (first, last) => {
  const f = (first || "").trim();
  const l = (last || "").trim();
  return l ? `${f} ${l[0].toUpperCase()}` : f;
};

// The whole name, from the parts when they exist and from the display name
// when they do not — a roster row that predates the split still has to be able
// to answer this.
export const fullName = (p) =>
  (p?.first_name || p?.last_name)
    ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
    : (p?.name || "");

// Parts from whatever is on file. Stored parts win; otherwise the display name
// is split on the first space. See the note above on why the guess is fine.
export const splitName = (p) => {
  if (p?.first_name || p?.last_name) return { first: p.first_name || "", last: p.last_name || "" };
  const parts = String(p?.name || "").trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
};
