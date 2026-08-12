// ══════════════════════════════════════════════════════════════════
//  Does every man in the record books come out right?
// ══════════════════════════════════════════════════════════════════
//
// surnames.js is a hand-kept file — a director adds a line when somebody
// joins — and it is the input to three separate things that do not know about
// each other: what the board prints, what a group line calls him, and which
// sixteen years of rounds his handicap index is computed from.
//
// The last one is why this exists. The index is found by matching a player to
// a HISTORY_PLAYERS name, and that match runs off first_name — so a surname
// typed into this file wrong does not look wrong anywhere. The board still
// reads plausibly, and the man quietly plays off the wrong number, or off
// none.
import { describe, it, expect } from "vitest";
import { SURNAMES } from "./surnames";
import { HISTORY_PLAYERS } from "./history";
import { withKnownSurname, displayNameFor, shortName } from "../lib/playerNames";
import { matchHistoryName } from "../lib/handicap";

// A registry row as it actually arrives: the legacy display name, the id
// derived from it years ago, and no first/last of its own.
const asStored = (historyName) => withKnownSurname({
  id: historyName.trim().toLowerCase().replace(/\s+/g, "_"),
  name: historyName,
});

describe("surnames", () => {
  it("has a line for everybody in the record books", () => {
    const missing = HISTORY_PLAYERS.filter(h => !SURNAMES[h.trim().toLowerCase().replace(/\s+/g, "_")]);
    expect(missing).toEqual([]);
  });

  it("prints every one of them as a first initial and a surname", () => {
    HISTORY_PLAYERS.forEach(h => {
      expect(displayNameFor(asStored(h))).toMatch(/^[A-Z] \S{2,}$/);
    });
  });

  // Three Vigos and two Kelleys share a surname; nobody may share a board row.
  it("leaves no two players looking alike on the board", () => {
    const board = HISTORY_PLAYERS.map(h => displayNameFor(asStored(h)));
    expect(new Set(board).size).toBe(board.length);
  });

  // ...and nobody may share a group line either, which is what the short name
  // is for and the reason it is the first name rather than the surname.
  it("leaves no two players looking alike in a group line", () => {
    const short = HISTORY_PLAYERS.map(h => shortName(asStored(h)));
    expect(new Set(short).size).toBe(short.length);
  });

  // The one that would fail silently: a wrong surname breaks the history
  // match, and a broken history match is a missing WBC Index.
  it("keeps every player pointed at his own sixteen years", () => {
    HISTORY_PLAYERS.forEach(h => {
      expect(matchHistoryName(asStored(h))).toBe(h);
    });
  });
});
