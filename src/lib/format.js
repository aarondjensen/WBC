// ══════════════════════════════════════════════════════════════════
//  format — the small conversions every screen does.
// ══════════════════════════════════════════════════════════════════
//
// A tee time is typed by a director as "8:00 AM", stored as that string, and
// then sorted, compared, spaced and counted down to — all of which need a
// number. A score is held as a signed integer and read as "+2", "E", "−1".
//
// None of that is interesting, which is exactly why it belongs in one file.
// These lived at App.jsx's module scope, which made them invisible to any
// component that moved out of it — and the first view to move needed three of
// them, at which point the choice is either an export from a 10,000-line
// module or a copy. Both are worse than this.

// ── To par, as golf writes it ──────────────────────────────────────
// Level par is "E", not "0" or "+0" — a scoreboard that prints 0 is a
// scoreboard nobody in a clubhouse recognises. Null is an em dash: a round not
// yet played has no score, which is a different thing from having shot level.
export const fmtPar = (n) => (n == null ? "—" : n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);

// ── Tee times ──────────────────────────────────────────────────────
// "8:00 AM" → minutes since midnight, and back. The string is what a director
// typed and what the tee sheet stores; minutes are what everything else needs
// to sort by, space at intervals, take a minimum of, or count down to.
//
// Returns null rather than 0 for anything unparseable, and the difference
// matters: 0 is a real time (midnight) and a caller doing `if (mins)` on a
// failed parse would silently place a group at the top of the sheet.
export const teeTimeToMinutes = (str) => {
  if (!str) return null;
  const match = String(str).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = (match[3] || "").toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
};

// Minutes since midnight → "7:30 AM". Wraps rather than overflowing, so a tee
// sheet spaced past midnight comes back round to the morning instead of
// printing a 25th hour.
export const minutesToTimeStr = (mins) => {
  if (mins == null) return "";
  const norm = ((mins % 1440) + 1440) % 1440;
  let h = Math.floor(norm / 60);
  const m = norm % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
};
