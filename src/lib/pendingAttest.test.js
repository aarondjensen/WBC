// ══════════════════════════════════════════════════════════════════
//  What the badge is allowed to count.
// ══════════════════════════════════════════════════════════════════
//
// Every case below that expects an EMPTY list is a state where the app icon
// used to carry a red bubble and the app had nothing to show for it. Pure —
// no DOM, no Firebase; the shape of the data is the whole test.
import { describe, it, expect } from "vitest";
import { pendingAttestations, pendingAttestCount } from "./pendingAttest";

const ME = "aaron_j";
const SCORER = "matt_b";

// One signed Round 1 card: four men, the scorer, nobody attested yet.
const card = (over = {}) => ({
  signedBy: SCORER,
  signedByName: "Matt B",
  attestedBy: [],
  present: [ME, SCORER, "dave_k", "rob_l"],
  ...over,
});

const key1 = `1_${[ME, SCORER, "dave_k", "rob_l"].sort().join(",")}`;
const key2 = `2_${[ME, SCORER, "dave_k", "rob_l"].sort().join(",")}`;

const call = (over = {}) => pendingAttestations({
  scorecardSigs: { [key1]: card() },
  finalizedRounds: {},
  playerId: ME,
  tPlayers: [],
  ...over,
});

describe("pendingAttestations", () => {
  it("counts a signed card this player has not attested", () => {
    const out = call();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ groupKey: key1, round: 1, signedByName: "Matt B" });
  });

  it("stops counting it once they attest", () => {
    expect(call({ scorecardSigs: { [key1]: card({ attestedBy: [ME] }) } })).toHaveLength(0);
  });

  it("never counts the scorer's own card against them — signing is attesting", () => {
    expect(call({ scorecardSigs: { [key1]: card({ signedBy: ME }) } })).toHaveLength(0);
  });

  it("ignores a card this player was not in the group for", () => {
    expect(call({ scorecardSigs: { [key1]: card({ present: [SCORER, "dave_k"] }) } })).toHaveLength(0);
  });

  // ── The three phantom badges ──
  //
  // Admin's "Round N Complete" closes the round whether or not everybody
  // attested, and it stores the BARE ROUND NUMBER. The card is locked from
  // that moment — Scoring shows "Scorecard Final" with no buttons on it — so
  // there is nothing left to go and do, and the badge that used to sit there
  // permanently was pointing at a screen that could not clear it.
  it("drops a card once the director finalizes the whole round", () => {
    expect(call({ finalizedRounds: { 1: true } })).toHaveLength(0);
  });

  it("drops a card once its own group finalizes", () => {
    expect(call({ finalizedRounds: { [key1]: true } })).toHaveLength(0);
  });

  // Scoring builds its attest row from the group MINUS withdrawn players, so a
  // player WD'd after the card was signed has no button to press.
  it("owes nothing once the player has withdrawn", () => {
    expect(call({ tPlayers: [{ player_id: ME, status: "WD" }] })).toHaveLength(0);
  });

  it("still counts a card when somebody ELSE in the group withdrew", () => {
    expect(call({ tPlayers: [{ player_id: "dave_k", status: "WD" }] })).toHaveLength(1);
  });

  // ── Ordering ──
  // The round furthest behind is the one holding the tournament up, and it is
  // the one the banner offers first.
  it("puts the oldest round first", () => {
    const out = call({ scorecardSigs: { [key2]: card(), [key1]: card() } });
    expect(out.map(p => p.round)).toEqual([1, 2]);
  });

  it("counts more than one when a player owes more than one", () => {
    expect(pendingAttestCount({
      scorecardSigs: { [key1]: card(), [key2]: card() },
      finalizedRounds: {},
      playerId: ME,
    })).toBe(2);
  });

  // ── Nothing to answer with ──
  it("answers empty for a signed-out or guest phone", () => {
    expect(pendingAttestations({ scorecardSigs: { [key1]: card() }, playerId: null })).toEqual([]);
  });

  it("answers empty when nothing has loaded yet", () => {
    expect(pendingAttestations({ playerId: ME })).toEqual([]);
    expect(pendingAttestations()).toEqual([]);
  });

  it("survives a null entry in the map", () => {
    expect(call({ scorecardSigs: { [key1]: null } })).toEqual([]);
  });
});
