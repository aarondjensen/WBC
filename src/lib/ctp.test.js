import { describe, it, expect } from "vitest";
import {
  groupTeeOrder, groupLabel, tagAheadOfPlay,
  readClaims, winningClaim, resolvePin, canTakePin, OVERRIDE_KEY, ctpLedger, carryLabel,
} from "./ctp";

const PAIRINGS = {
  1: [
    ["a", "b", "c", "d"],
    ["e", "f", "g", "h"],
    ["i", "j", "k", "l"],
  ],
};

describe("groupTeeOrder", () => {
  it("gives a group's index in the round's draw", () => {
    expect(groupTeeOrder(PAIRINGS, 1, ["a", "b", "c", "d"])).toBe(0);
    expect(groupTeeOrder(PAIRINGS, 1, ["i", "j", "k", "l"])).toBe(2);
  });

  it("matches on the roster, not the order it arrived in", () => {
    expect(groupTeeOrder(PAIRINGS, 1, ["h", "f", "e", "g"])).toBe(1);
  });

  it("is null for a group that is not in the draw", () => {
    expect(groupTeeOrder(PAIRINGS, 1, ["x", "y"])).toBe(null);
  });

  it("is null for a round with no pairings, and for no group at all", () => {
    expect(groupTeeOrder(PAIRINGS, 2, ["a", "b", "c", "d"])).toBe(null);
    expect(groupTeeOrder({}, 1, ["a", "b"])).toBe(null);
    expect(groupTeeOrder(PAIRINGS, 1, [])).toBe(null);
    expect(groupTeeOrder(PAIRINGS, 1, null)).toBe(null);
  });

  // Off first is index 0, and a group that is not in the draw must not read
  // as the first one off.
  it("tells 'not in the draw' apart from 'off first'", () => {
    expect(groupTeeOrder(PAIRINGS, 1, ["x"])).not.toBe(0);
  });
});

describe("groupLabel", () => {
  it("counts from one, the way the tee sheet does", () => {
    expect(groupLabel(0)).toBe("Group 1");
    expect(groupLabel(2)).toBe("Group 3");
  });

  it("has something to say when the order is unknown", () => {
    expect(groupLabel(null)).toBe("another group");
  });
});

describe("tagAheadOfPlay", () => {
  // The case this exists for: group 2 walks off a par 3 without entering,
  // group 3 finishes the hole and tags it, and group 2 finally puts their
  // scores in twenty minutes later against a tag from behind them.
  it("flags a tag made by a group playing behind this one", () => {
    expect(tagAheadOfPlay({ leaderOrder: 2, myOrder: 1 })).toEqual({
      leaderOrder: 2,
      label: "Group 3",
    });
  });

  it("says nothing when the tag came from a group ahead", () => {
    expect(tagAheadOfPlay({ leaderOrder: 0, myOrder: 1 })).toBe(null);
  });

  it("says nothing when the tag is this group's own", () => {
    expect(tagAheadOfPlay({ leaderOrder: 1, myOrder: 1 })).toBe(null);
    expect(tagAheadOfPlay({ leaderOrder: 3, leaderKey: "g", myOrder: 1, myKey: "g" })).toBe(null);
  });

  // A director's override off the Betting tab carries no group, and neither
  // does a tag written before tags recorded one. Both are unknown, not early.
  it("says nothing when either order is unknown", () => {
    expect(tagAheadOfPlay({ leaderOrder: null, myOrder: 1 })).toBe(null);
    expect(tagAheadOfPlay({ leaderOrder: 2, myOrder: null })).toBe(null);
    expect(tagAheadOfPlay({})).toBe(null);
  });
});

// ══════════════════════════════════════════════════════════════════
//  Claims: one answer per group, and the winner derived from them.
// ══════════════════════════════════════════════════════════════════

const tag = (playerId, distanceFt, order, extra = {}) =>
  ({ kind: "tag", player_id: playerId, distance_ft: distanceFt, order, ...extra });

describe("readClaims", () => {
  it("takes both the stored snake_case and the shape the app holds", () => {
    const c = readClaims({ g1: tag("aaron_j", 12, 0, { by_name: "Aaron J" }) });
    expect(c.g1).toMatchObject({ kind: "tag", playerId: "aaron_j", distanceFt: 12, order: 0, byName: "Aaron J" });
  });

  // This is read straight off Firestore, where a half-written document is a
  // real thing and must not take the scoring screen down.
  it("drops rubbish rather than trusting it", () => {
    expect(readClaims(null)).toEqual({});
    expect(readClaims({ g1: null, g2: "nope", g3: { kind: "sandwich" } })).toEqual({});
  });

  it("keeps an unknown order as null rather than as off first", () => {
    expect(readClaims({ g1: tag("a", 5, "first") }).g1.order).toBe(null);
  });
});

describe("winningClaim", () => {
  it("gives the pin to the closest ball, whatever order it was written in", () => {
    const c = readClaims({ g3: tag("c", 5, 2), g1: tag("a", 12, 0), g2: tag("b", 9, 1) });
    expect(winningClaim(c)).toMatchObject({ key: "g3", playerId: "c", distanceFt: 5 });
  });

  // The case the whole model exists for: two groups tagging at once used to be
  // last-write-wins, so a nine-footer could take the pin off a five-footer.
  it("does not let a longer ball overwrite a shorter one", () => {
    const c = readClaims({ g1: tag("a", 5, 0), g2: tag("b", 9, 1) });
    expect(winningClaim(c).playerId).toBe("a");
  });

  // A tie goes to whoever PLAYED it first, not whoever had signal first.
  it("breaks a tie on tee order", () => {
    const c = readClaims({ g3: tag("c", 8, 2), g1: tag("a", 8, 0) });
    expect(winningClaim(c).key).toBe("g1");
  });

  it("is stable when a tie cannot be broken on order", () => {
    const c = readClaims({ zz: tag("z", 8, null), aa: tag("a", 8, null) });
    expect(winningClaim(c).key).toBe("aa");
  });

  // A tag nobody paced is a claim without a measurement; it must not sort as
  // zero feet and take the pin off a measured one.
  it("puts an unmeasured tag behind every measured one", () => {
    const c = readClaims({ g1: tag("a", null, 0), g2: tag("b", 30, 1) });
    expect(winningClaim(c).playerId).toBe("b");
  });

  it("lets a director's override beat every group claim", () => {
    const c = readClaims({ g1: tag("a", 2, 0), [OVERRIDE_KEY]: { kind: "override", player_id: "z", distance_ft: 40 } });
    expect(winningClaim(c)).toMatchObject({ key: OVERRIDE_KEY, playerId: "z" });
  });

  it("has no winner when every group passed", () => {
    expect(winningClaim(readClaims({ g1: { kind: "pass" }, g2: { kind: "pass" } }))).toBe(null);
    expect(winningClaim({})).toBe(null);
  });
});

describe("resolvePin", () => {
  it("reads the winner off the claims, with the group that made it", () => {
    const pin = resolvePin({ claims: { g1: tag("a", 12, 0, { by_name: "Aaron J" }), g2: tag("b", 7, 1, { by_name: "Dave S" }) } });
    expect(pin).toMatchObject({ playerId: "b", distanceFt: 7, distance: "7 ft", taggedByName: "Dave S", taggedGroupKey: "g2", taggedGroupOrder: 1 });
  });

  // An override is not a group, so it carries no order — and lib's rule is
  // that an unknown order says nothing rather than guessing.
  it("gives an override no tee order to be compared on", () => {
    const pin = resolvePin({ claims: { [OVERRIDE_KEY]: { kind: "override", player_id: "z", distance_ft: 9 } } });
    expect(pin.playerId).toBe("z");
    expect(pin.taggedGroupOrder).toBe(null);
    expect(pin.taggedGroupKey).toBe(null);
  });

  // The confirmation race: two groups confirming used to read the list out of
  // local state and write it back whole, so one of them was erased.
  it("collects confirmations from every group that gave one", () => {
    const pin = resolvePin({
      claims: {
        g1: tag("a", 6, 0),
        g2: { kind: "confirm", by: "dave_s" },
        g3: { kind: "confirm", by: "mike_t" },
      },
    });
    expect(pin.confirmedBy).toEqual(["dave_s", "mike_t"]);
    expect(pin.answeredGroups.sort()).toEqual(["g1", "g2", "g3"]);
  });

  it("counts a pass as having been asked, which is the whole point of writing it down", () => {
    const pin = resolvePin({ claims: { g1: { kind: "pass" }, g2: { kind: "pass" } } });
    expect(pin.playerId).toBe(null);
    expect(pin.answeredGroups.sort()).toEqual(["g1", "g2"]);
  });

  // A pin tagged before claims existed, and every pin an imported year carries.
  it("falls back to the flat winner a document used to hold", () => {
    const legacy = { playerId: "a", distanceFt: 11, distance: "11 ft", taggedByName: "Aaron J", taggedGroupKey: "1_a", taggedGroupOrder: 0, confirmedBy: ["dave_s"] };
    const pin = resolvePin({ legacy });
    expect(pin).toMatchObject({ playerId: "a", distanceFt: 11, taggedGroupOrder: 0 });
    expect(pin.confirmedBy).toEqual(["dave_s"]);
  });

  it("merges legacy confirmations with claim ones rather than picking a side", () => {
    const pin = resolvePin({
      claims: { g1: tag("a", 6, 0), g2: { kind: "confirm", by: "mike_t" } },
      legacy: { confirmedBy: ["dave_s"] },
    });
    expect(pin.confirmedBy).toEqual(["dave_s", "mike_t"]);
  });

  it("survives an empty document", () => {
    expect(resolvePin()).toMatchObject({ playerId: null, answeredGroups: [] });
    expect(resolvePin({}).confirmedBy).toEqual([]);
  });
});

describe("canTakePin", () => {
  it("takes an untagged pin with any measured distance", () => {
    expect(canTakePin({ leaderFt: null, myFt: 40, myOrder: 1 })).toBe(true);
  });

  it("will not take anything until a distance is chosen", () => {
    expect(canTakePin({ leaderFt: 12, myFt: null, myOrder: 0 })).toBe(false);
    expect(canTakePin({ leaderFt: null, myFt: null, myOrder: 0 })).toBe(false);
  });

  it("takes it with a shorter ball and refuses a longer one", () => {
    expect(canTakePin({ leaderFt: 12, leaderOrder: 0, myFt: 8, myOrder: 2 })).toBe(true);
    expect(canTakePin({ leaderFt: 12, leaderOrder: 0, myFt: 15, myOrder: 2 })).toBe(false);
  });

  // Agrees with winningClaim by construction — a prompt offering a tag the
  // board would then refuse to honour is worse than either rule alone.
  it("gives a tie to the group that played the hole first", () => {
    expect(canTakePin({ leaderFt: 8, leaderOrder: 2, myFt: 8, myOrder: 0 })).toBe(true);
    expect(canTakePin({ leaderFt: 8, leaderOrder: 0, myFt: 8, myOrder: 2 })).toBe(false);
  });

  it("keeps the standing tag when a tie cannot be settled on order", () => {
    expect(canTakePin({ leaderFt: 8, leaderOrder: null, myFt: 8, myOrder: 0 })).toBe(false);
    expect(canTakePin({ leaderFt: 8, leaderOrder: 0, myFt: 8, myOrder: null })).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
//  The carry.
// ══════════════════════════════════════════════════════════════════

// A par 3 in the chain. Defaults to a hole every group answered, since that is
// what makes a pin DECIDED and the carry is entirely about decided pins.
const pin = (round, hole, playerId = null, extra = {}) =>
  ({ round, hole, playerId, inGame: true, answered: 2, groupCount: 2, roundFinal: false, ...extra });

const sharesOf = (l) => l.pins.map(p => p.shares);

describe("ctpLedger", () => {
  it("pays one share a pin when every hole is taken", () => {
    const l = ctpLedger([pin(1, 2, "a"), pin(1, 7, "b"), pin(1, 12, "a")]);
    expect(sharesOf(l)).toEqual([1, 1, 1]);
    expect(l.leftover).toBe(0);
  });

  // The rule this exists for.
  it("rolls a dry pin onto the next one, which is then worth double", () => {
    const l = ctpLedger([pin(1, 2), pin(1, 7, "b")]);
    expect(sharesOf(l)).toEqual([0, 2]);
    expect(l.pins[1].carriedIn).toBe(1);
    expect(l.pins[0].carriesTo).toEqual({ round: 1, hole: 7 });
  });

  it("keeps stacking — two dry pins make the third worth triple", () => {
    const l = ctpLedger([pin(1, 2), pin(1, 7), pin(1, 12, "c")]);
    expect(sharesOf(l)).toEqual([0, 0, 3]);
    expect(l.pins[0].carriesTo).toEqual({ round: 1, hole: 12 });
    expect(l.pins[1].carriesTo).toEqual({ round: 1, hole: 12 });
  });

  it("starts the next pin fresh once a carry is taken", () => {
    const l = ctpLedger([pin(1, 2), pin(1, 7, "b"), pin(1, 12, "c")]);
    expect(sharesOf(l)).toEqual([0, 2, 1]);
  });

  // The chain is one sequence for the whole event, the way the pot is counted.
  it("carries across the end of a round into the next one", () => {
    const l = ctpLedger([pin(1, 17), pin(2, 2, "b")]);
    expect(sharesOf(l)).toEqual([0, 2]);
    expect(l.pins[0].carriesTo).toEqual({ round: 2, hole: 2 });
  });

  // Every par 3 puts exactly one share in, so the pot always has an owner.
  it("never creates or loses a share", () => {
    const l = ctpLedger([pin(1, 2), pin(1, 7, "b"), pin(1, 12), pin(1, 17), pin(2, 2, "c")]);
    const paid = l.pins.reduce((n, p) => n + p.shares, 0);
    expect(paid + l.leftover).toBe(5);
  });

  // ── What counts as nobody winning it ──
  it("treats a round that finished untagged as decided, asked or not", () => {
    const l = ctpLedger([pin(1, 2, null, { answered: 0, roundFinal: true }), pin(1, 7, "b")]);
    expect(sharesOf(l)).toEqual([0, 2]);
  });

  // He hit it closest and the pin is his; it just pays nobody, and the share
  // has to go somewhere rather than evaporate.
  it("carries a pin tagged to somebody who never bought in", () => {
    const l = ctpLedger([pin(1, 2, "outsider", { inGame: false }), pin(1, 7, "b")]);
    expect(l.pins[0].won).toBe(false);
    expect(sharesOf(l)).toEqual([0, 2]);
  });

  // ── A hole still out ──
  it("stops the chain at a pin nobody has answered yet", () => {
    const l = ctpLedger([pin(1, 2), pin(1, 7, null, { answered: 1 }), pin(1, 12, "c")]);
    expect(l.pins[1].pending).toBe(true);
    expect(l.pins[1].shares).toBe(2);          // what it is worth if taken
    expect(l.pins[2].atLeast).toBe(true);      // priced behind it, so a floor
    expect(l.pins[2].shares).toBe(1);
    expect(l.settled).toBe(false);
    expect(l.leftover).toBe(0);                // still travelling, not left over
  });

  it("does not send a carry to a pin behind an unresolved one", () => {
    const l = ctpLedger([pin(1, 2), pin(1, 7, null, { answered: 1 })]);
    expect(l.pins[0].carriesTo).toEqual({ round: 1, hole: 7 });
  });

  // ── The last pin of the week going dry ──
  it("splits a final carry evenly over the pins that were won", () => {
    const l = ctpLedger([pin(1, 2, "a"), pin(1, 7, "b"), pin(1, 12)]);
    expect(l.leftover).toBe(1);
    expect(l.bonusPerPin).toBe(0.5);
    expect(l.pins.map(p => p.totalShares)).toEqual([1.5, 1.5, 0]);
  });

  it("still pays the whole pot when the last pin is dry", () => {
    const l = ctpLedger([pin(1, 2, "a"), pin(1, 7), pin(1, 12)]);
    const paid = l.pins.reduce((n, p) => n + p.totalShares, 0);
    expect(paid).toBe(3);
  });

  it("leaves the money unclaimed when nobody won a single pin", () => {
    const l = ctpLedger([pin(1, 2), pin(1, 7)]);
    expect(l.leftover).toBe(2);
    expect(l.bonusPerPin).toBe(0);
  });

  it("has nothing to say about an event with no par 3s", () => {
    expect(ctpLedger([]).pins).toEqual([]);
    expect(ctpLedger().leftover).toBe(0);
  });
});

describe("carryLabel", () => {
  it("names a multiplied pin and stays quiet about a single share", () => {
    expect(carryLabel(3)).toBe("3×");
    expect(carryLabel(2)).toBe("2×");
    expect(carryLabel(1)).toBe(null);
    expect(carryLabel(0)).toBe(null);
  });
});
