// ── chDeltas ───────────────────────────────────────────────────────
// What a tee move does to the field's course handicaps.
//
// The director's console flashes the change beside each player's CH after a
// tee move — "▼6" — and this is where that number comes from. It exists as its
// own module because the answer is the same whether one player is moved or
// the whole field is, and the console had only ever worked out the one-player
// case: tapping a tee tile to put EVERYBODY on Gold, the move that shifts the
// most strokes in the tournament, said nothing at all.

import { calcCH } from "./individualBoard";

// How long a delta badge stays up, in ms. It is the only trace a tee move
// leaves — a second later the CH beside it is just a number, with nothing to
// say it moved — so it has to outlast the director's eye travelling down a
// field of twenty names, twice.
export const CH_DELTA_MS = 12000;

const chOn = (player, tees, teeName) => {
  const tee = tees.find(t => t.name === teeName);
  return tee ? calcCH(player.handicap_index, tee.slope, tee.rating, tee.par) : null;
};

// The course-handicap change a move makes, as `{ playerId: delta }`.
//
// A player is left out when:
//   • their course handicap does not move — they were already on that tee, or
//     on a different one that plays to the same number. A "▲0" is noise on a
//     set-all, where most of the field is usually already there.
//   • they had NO tee before. A first assignment has nothing to be a delta
//     from; "▲14" against nothing is not a change, it is the value. This is
//     the same rule the row itself follows — an unassigned player shows no CH
//     rather than one computed off a default nobody chose.
//   • either tee is not on the course. An assignment can outlive the tee box
//     it names.
export function chDeltasFor(players = [], tees = [], before = {}, after = {}) {
  const out = {};
  players.forEach(p => {
    const from = before[p.id];
    const to = after[p.id];
    if (!from || !to) return;
    const oldCH = chOn(p, tees, from);
    const newCH = chOn(p, tees, to);
    if (oldCH === null || newCH === null) return;
    if (newCH !== oldCH) out[p.id] = newCH - oldCH;
  });
  return out;
}
