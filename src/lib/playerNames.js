// ══════════════════════════════════════════════════════════════════
//  playerNames — the ways this app says who somebody is.
// ══════════════════════════════════════════════════════════════════
//
// A player carries a `name` — "A Jensen" — and that string is what every
// screen in the app renders. It is also the older of the two records: the
// roster predates first_name/last_name being stored at all, so a name may
// exist with nothing behind it.
//
// That leaves these questions, and they have different answers:
//
//   toDisplayName   given the parts, what goes on a leaderboard row. A first
//                   INITIAL and the surname, the way a tour board prints it.
//   displayNameFor  the same answer for a player already on file, whose name
//                   was generated years ago under an older convention or typed
//                   by a director as a nickname. See below.
//   shortName       one word, for the places a row only has room for one.
//   fullName        the whole thing, for the admin console and anywhere a
//                   person is being administered rather than scored.
//   splitName       the inverse, best-effort, so opening the player editor on
//                   a roster row from 2011 puts the name in the right boxes
//                   instead of showing blanks.
//
// ── Why the convention changed, and what it cost ───────────────────
// It was "Aaron J" — the first name and a last initial. It is the other way
// round now, which is how every tour prints a board and how a room of golfers
// says a name out loud. The surname is the part that distinguishes people, and
// on a board that has held two Daves for a decade it was the part being thrown
// away.
//
// The names on file did NOT change. A player's id is derived from his display
// name the first time he is added ("Aaron J" → aaron_j) and that id is what
// binds him to sixteen years of history and to his sign-in claim — so the
// stored string is identity, not presentation, and rewriting it in Firestore
// would file men beside themselves. displayNameFor restyles on the way to the
// screen instead, and the id underneath never moves.
//
// splitName is a GUESS and only a guess: it exists so the editor has somewhere
// to start, and whatever the director confirms is what gets stored. It splits
// on the first space, so "Van Der Berg" seeds as first "Van", last "Der Berg"
// — wrong, and wrong in a way somebody can see and fix in the field they are
// already looking at, which is the point.

// First initial + surname. What goes on a row.
//
// No full stop after the initial, deliberately: the id a new player files
// under is his display name with the spaces knocked out, and "A. Jensen" would
// put a full stop in the middle of it.
export const toDisplayName = (first, last) => {
  const f = (first || "").trim();
  const l = (last || "").trim();
  return l ? `${f ? `${f[0].toUpperCase()} ` : ""}${l}` : f;
};

// The convention this app used until now — first name, last initial. Kept for
// one job: recognising a name the app GENERATED, so it can be restyled, and
// telling it apart from a nickname a director typed, which cannot.
export const legacyDisplayName = (first, last) => {
  const f = (first || "").trim();
  const l = (last || "").trim();
  return l ? `${f} ${l[0].toUpperCase()}`.trim() : f;
};

// Did the APP write this name, or did a person type it?
//
// The question every caller here is really asking, and it has to be asked
// against BOTH conventions: a name generated in 2019 is "Aaron J" and one
// generated today is "A Jensen", and both are the app's own work. Answering it
// against only the current one makes every name in the roster look
// hand-chosen, which is the difference between a name that restyles itself and
// a nickname that must not be touched.
export const isGeneratedName = (name, first, last) => {
  const stored = (name || "").trim();
  if (!stored) return false;
  return stored === toDisplayName(first, last) || stored === legacyDisplayName(first, last);
};

// What to print for a player on file.
//
// A row with no first/last is a legacy row and prints exactly as stored:
// there is nothing to restyle it from, and its name is the only record of who
// it is. A row WITH parts prints the current convention — unless the stored
// name is neither convention, which means a director typed it, and a nickname
// somebody chose outranks a format.
export const displayNameFor = (p) => {
  const first = (p?.first_name || "").trim();
  const last = (p?.last_name || "").trim();
  const stored = (p?.name || "").trim();
  if (!first && !last) return stored;
  if (!stored) return toDisplayName(first, last);
  return isGeneratedName(stored, first, last) ? toDisplayName(first, last) : stored;
};

// Parts from whatever is on file. Stored parts win; otherwise the display name
// is split on the first space. See the note above on why the guess is fine.
export const splitName = (p) => {
  if (p?.first_name || p?.last_name) return { first: p.first_name || "", last: p.last_name || "" };
  const parts = String(p?.name || "").trim().split(/\s+/);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
};

// One word, where a row has room for one: the group line on the scoring
// screen, the player column on a scorecard nine holes wide.
//
// The surname, which is the word that tells two of them apart — but not when
// the surname IS the initial, which is what a name stored under the old
// convention reduces to. "A Jensen" is Jensen; "Aaron J" is still Aaron.
export const shortName = (p) => {
  const { first, last } = splitName(p);
  const l = (last || "").trim().replace(/\.$/, "");
  return l.length > 1 ? l : ((first || "").trim() || l);
};

// The whole name, from the parts when they exist and from the display name
// when they do not — a roster row that predates the split still has to be able
// to answer this.
export const fullName = (p) =>
  (p?.first_name || p?.last_name)
    ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim()
    : (p?.name || "");
