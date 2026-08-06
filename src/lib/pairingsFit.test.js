import { describe, it, expect } from "vitest";
import { FS } from "../theme";
import { PAIRING_RUNGS, CARD_GAP, MAX_EXTRA_PAD, cardHeight, pairingsHeight, fitPairings, rungLines, nameColWidth } from "./pairingsFit";

// The two widths the tab is ever drawn at: a phone, and the 480px the app
// shell caps itself to on anything wider. Both are the stack's own width —
// the viewport less the 20px of body padding each side.
const PHONE = 350;
const WIDE = 440;

describe("pairingsFit", () => {
  it("rung 0 is the size the tab shipped as", () => {
    expect(PAIRING_RUNGS[0]).toMatchObject({ name: FS.small, cell: FS.label, rowPad: 5, headPad: 6 });
  });

  it("every rung is a rung of the type scale, and the ladder only climbs", () => {
    const rungs = Object.values(FS);
    PAIRING_RUNGS.forEach(r => {
      [r.name, r.cell, r.head, r.headSub].forEach(size => expect(rungs).toContain(size));
    });
    PAIRING_RUNGS.slice(1).forEach((r, i) => {
      const prev = PAIRING_RUNGS[i];
      expect(r.name).toBeGreaterThan(prev.name);
      expect(r.rowPad).toBeGreaterThanOrEqual(prev.rowPad);
      expect(r.minCol).toBeGreaterThanOrEqual(prev.minCol);
    });
  });

  it("the tee swatch never outgrows the line box it sits in", () => {
    // The row height is the name's line box. A swatch taller than that would
    // push the row past what pairingsHeight promised and the tab would scroll.
    PAIRING_RUNGS.forEach(r => expect(r.swatch).toBeLessThan(rungLines(r).rowLine));
  });

  it("a card is its header, its rows, the hairlines between them and its border", () => {
    const r = PAIRING_RUNGS[0];
    const { rowLine, headLine } = rungLines(r);
    // 2px card border + header (padding, line box, bottom border) + 4 rows + 3 hairlines
    expect(cardHeight(r, 4)).toBe(2 + (r.headPad * 2 + headLine + 1) + 4 * (r.rowPad * 2 + rowLine) + 3);
  });

  it("an empty group still costs its header", () => {
    const r = PAIRING_RUNGS[0];
    expect(cardHeight(r, 0)).toBe(2 + r.headPad * 2 + rungLines(r).headLine + 1);
  });

  it("the stack pays a gap between cards but not after the last one", () => {
    const r = PAIRING_RUNGS[0];
    expect(pairingsHeight(r, [4, 4])).toBe(cardHeight(r, 4) * 2 + CARD_GAP);
    expect(pairingsHeight(r, [4])).toBe(cardHeight(r, 4));
  });

  it("a taller rung is a taller stack", () => {
    const sizes = [4, 4, 4, 4];
    PAIRING_RUNGS.slice(1).forEach((r, i) => {
      expect(pairingsHeight(r, sizes)).toBeGreaterThan(pairingsHeight(PAIRING_RUNGS[i], sizes));
    });
  });

  it("picks the largest rung that fits", () => {
    const sizes = [4, 4, 4, 4];
    PAIRING_RUNGS.forEach(rung => {
      const exact = pairingsHeight(rung, sizes);
      expect(fitPairings(exact, sizes, WIDE)).toEqual(rung);
      // A pixel short of a rung is the rung below it.
      if (rung !== PAIRING_RUNGS[0]) expect(fitPairings(exact - 1, sizes, WIDE).name).toBeLessThan(rung.name);
    });
  });

  it("buys the bigger name before it buys whitespace", () => {
    // 700px of tab, four foursomes: FS.body fits at its tightest padding, so
    // the names go up a rung rather than the old size floating in 96px of air.
    const rung = fitPairings(700, [4, 4, 4, 4], PHONE);
    expect(rung.name).toBe(FS.body);
  });

  it("spends what is left over on row padding rather than leaving a gap", () => {
    const sizes = [4, 4];
    const base = pairingsHeight(PAIRING_RUNGS[0], sizes);
    // 16px spare across 8 rows is a pixel of padding above and below each.
    const rung = fitPairings(base + 16, sizes, PHONE);
    expect(rung.name).toBe(PAIRING_RUNGS[0].name);
    expect(rung.rowPad).toBe(PAIRING_RUNGS[0].rowPad + 1);
    expect(pairingsHeight(rung, sizes)).toBe(base + 16);
  });

  it("stops padding rows out past the point it reads as breathing room", () => {
    const top = PAIRING_RUNGS[PAIRING_RUNGS.length - 1];
    expect(fitPairings(5000, [4], WIDE).rowPad).toBe(top.rowPad + MAX_EXTRA_PAD);
  });

  it("never overflows the space it was given", () => {
    const draws = [[4], [4, 4], [4, 4, 4], [4, 4, 4, 4], [4, 4, 4, 4, 3], [3, 3, 3, 3, 3, 3], [1, 2], [0, 4]];
    for (let available = 0; available <= 1600; available += 7) {
      [PHONE, WIDE].forEach(w => draws.forEach(sizes => {
        const rung = fitPairings(available, sizes, w);
        if (pairingsHeight(rung, sizes) <= available) return;
        // The only draw allowed to overflow is one too deep for even rung 0,
        // and it must be sitting at rung 0 untouched when it does.
        expect(pairingsHeight(PAIRING_RUNGS[0], sizes)).toBeGreaterThan(available);
        expect(rung).toEqual(PAIRING_RUNGS[0]);
      }));
    }
  });

  it("holds at rung 0 before anything has been measured, and for an empty draw", () => {
    expect(fitPairings(0, [4, 4], WIDE)).toEqual(PAIRING_RUNGS[0]);
    expect(fitPairings(2000, [], WIDE)).toEqual(PAIRING_RUNGS[0]);
    expect(fitPairings(2000, null, WIDE)).toEqual(PAIRING_RUNGS[0]);
  });

  it("a draw too deep for the screen stays at the size it always was", () => {
    // Six foursomes on a short phone: nothing grows, nothing is clipped.
    expect(fitPairings(400, [4, 4, 4, 4, 4, 4], PHONE)).toEqual(PAIRING_RUNGS[0]);
  });

  it("a four-group draw grows once the tab is tall enough to take it", () => {
    // Four foursomes read at FS.small in 578px. A tall phone or the app's own
    // 480px window on a desktop has more than that to give, and that is a rung.
    expect(fitPairings(578, [4, 4, 4, 4], PHONE).name).toBe(FS.small);
    expect(fitPairings(760, [4, 4, 4, 4], PHONE).name).toBeGreaterThan(FS.small);
  });

  describe("the name column", () => {
    it("is 5fr of the row grid inside the card's border and padding", () => {
      expect(nameColWidth(WIDE)).toBeCloseTo((WIDE - 26) * (5 / 11), 5);
      expect(nameColWidth(0)).toBe(0);
    });

    it("caps a narrow phone below the rung its height would allow", () => {
      // All the height in the world; a 350px stack still stops at FS.lead
      // rather than truncating names to buy two more points of type.
      expect(fitPairings(5000, [4], PHONE).name).toBe(FS.lead);
      expect(fitPairings(5000, [4], WIDE).name).toBe(FS.title);
    });

    it("holds a stack with no measured width at the size it shipped as", () => {
      expect(fitPairings(5000, [4], 0).name).toBe(FS.body);
    });
  });
});
