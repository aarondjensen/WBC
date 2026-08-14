// ══════════════════════════════════════════════════════════════════
//  playerScope — which registry rows belong to which edition.
// ══════════════════════════════════════════════════════════════════
//
// A player exists in TWO places, and they are scoped differently on purpose:
//
//   players              the career record — the name and the permanent id
//                        that ties a man to sixteen years of golf. GLOBAL,
//                        because a career is not a fact about one year.
//   tournament_players   this edition's roster row. Per-edition, because who
//                        turned up in 2026 has nothing to do with 2027.
//
// That split is right for real tournaments and wrong for exactly one edition:
// the sandbox. A director filling wbc_demo with test names was minting career
// records — global ones — so twelve fake golfers turned up in every real
// edition's "Played before?" picker, and would have been swept onto the roster
// wholesale by the bootstrap in App.jsx the first time a real edition loaded
// without one. Nothing about that is visible from inside the demo, which is
// where the names were typed and where they looked correctly contained.
//
// So a registry row minted inside the sandbox carries `edition_id`, and a row
// that carries one is only visible in the edition that owns it. Absence means
// global: every row written before this existed, and every row a real edition
// writes, has no `edition_id` and is seen everywhere — which is the behaviour
// that must not change, since those rows ARE the career records.
import { SANDBOX_EDITION_ID, isSandboxEdition } from "./editionId.js";

// ── scopeFor ───────────────────────────────────────────────────────
// The scope a NEW registry row is minted with. Sandbox rows are stamped with
// the sandbox; a real edition writes an explicit null.
//
// The null is not decoration. Registry writes MERGE, so a row that already
// carries `edition_id: wbc_demo` keeps it forever unless something clears it —
// and that row is invisible to every real edition, which means a director in
// 2026 adding the same name would write into a document he cannot see, and get
// a roster row whose player has no name to draw. Writing null says "this id is
// a career record now", which is exactly what a real edition claiming it
// means.
export const scopeFor = (tid) =>
  ({ edition_id: isSandboxEdition(tid) ? SANDBOX_EDITION_ID : null });

// ── inEdition ──────────────────────────────────────────────────────
// May this edition see this row? An unstamped row is a career record and is
// visible everywhere; a stamped one belongs to its own edition and nowhere
// else.
export const inEdition = (row, tid) => {
  const owner = row?.edition_id;
  if (!owner) return true;
  return String(owner) === String(tid ?? "");
};

// ── scopedRegistry ─────────────────────────────────────────────────
// The registry as one edition sees it. Applied at the READ, not at the write,
// so it covers every consumer at once — the roster join, the Players tab, the
// returning-player picker, the sign-in claim list and the roster bootstrap —
// rather than leaving each of them to remember.
export const scopedRegistry = (rows = [], tid) =>
  (rows || []).filter(r => inEdition(r, tid));

// Whether a row is one of the sandbox's own — for the copy that has to say so
// ("this player only exists in the demo").
export const isSandboxRow = (row) => isSandboxEdition(row?.edition_id);
