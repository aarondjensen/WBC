import { describe, it, expect } from "vitest";
import { newTeeBox, orderTeesForEdit, unnamedTees, normalizeTees, teeBoxDocId, staleTeeBoxIds } from "./teeEditor";

const tee = (name, slope) => ({ name, slope });

describe("orderTeesForEdit", () => {
  it("sorts by slope descending and reports each tee's index in the draft", () => {
    const tees = [tee("White", 118), tee("Black", 134), tee("Red", 109)];
    expect(orderTeesForEdit(tees).map(r => [r.tee.name, r.index]))
      .toEqual([["Black", 1], ["White", 0], ["Red", 2]]);
  });

  it("puts a tee with no slope yet at the bottom, where it was added", () => {
    const tees = [tee("White", 118), tee("Black", 134), newTeeBox()];
    expect(orderTeesForEdit(tees).map(r => r.tee.name)).toEqual(["Black", "White", ""]);
  });

  // Two tees added in a row both parse to slope 0, and both have to stay put
  // rather than trade places on every keystroke elsewhere in the form.
  it("keeps equal slopes in the order they were added", () => {
    const tees = [tee("Gold", 113), tee("Blue", 113), tee("Green", 113)];
    expect(orderTeesForEdit(tees).map(r => r.tee.name)).toEqual(["Gold", "Blue", "Green"]);
  });

  it("moves a row as its slope is typed, carrying its index with it", () => {
    const before = [tee("White", 118), newTeeBox()];
    expect(orderTeesForEdit(before)[1].index).toBe(1);
    const after = [tee("White", 118), { ...newTeeBox(), name: "Black", slope: "134" }];
    expect(orderTeesForEdit(after).map(r => [r.tee.name, r.index]))
      .toEqual([["Black", 1], ["White", 0]]);
  });

  it("handles no tees at all", () => {
    expect(orderTeesForEdit()).toEqual([]);
    expect(orderTeesForEdit([])).toEqual([]);
  });
});

describe("unnamedTees", () => {
  it("finds the ones that would collide onto one document", () => {
    expect(unnamedTees([tee("Blue", 120), newTeeBox(), { name: "   " }]).length).toBe(2);
  });
  it("passes a named set", () => {
    expect(unnamedTees([tee("Blue", 120), tee("Red", 109)])).toEqual([]);
  });
});

describe("normalizeTees", () => {
  it("turns a hand-typed tee into numbers", () => {
    const [tb] = normalizeTees([{ name: " Black ", rating: "74.2", slope: "138", par: "72", yardage: "6900" }]);
    expect(tb).toMatchObject({ name: "Black", rating: 74.2, slope: 138, par: 72, yardage: 6900 });
  });

  it("falls back to the placeholders for fields left blank", () => {
    const [tb] = normalizeTees([newTeeBox()], 71);
    expect(tb).toMatchObject({ rating: 72.0, slope: 113, par: 71, yardage: 0 });
  });

  // The whole point of the editor is fixing what the API got wrong, so a
  // colour or hole_yards already on the tee has to survive the coercion.
  it("leaves an explicitly picked colour and hole yards alone", () => {
    const [tb] = normalizeTees([{ name: "Championship", color: "#2d8fd4", hole_yards: [400], slope: "120" }]);
    expect(tb.color).toBe("#2d8fd4");
    expect(tb.hole_yards).toEqual([400]);
  });

  // A tee typed in by hand has no colour, and "" draws as a grey square on
  // every screen that shows a tee.
  it("takes a missing colour from the tee's name", () => {
    expect(normalizeTees([{ ...newTeeBox(), name: "Gold" }])[0].color).toBe("#d4a843");
  });

  it("falls back to the palette for a name that is not a colour", () => {
    const [tb] = normalizeTees([{ ...newTeeBox(), name: "Zebra" }]);
    expect(tb.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("teeBoxDocId", () => {
  it("is stable for the same course and tee name", () => {
    expect(teeBoxDocId("c1", "Blue")).toBe("tb_c1_blue");
    expect(teeBoxDocId("c1", "Blue/White")).toBe("tb_c1_blue/white");
    expect(teeBoxDocId("c1", "Back Tees")).toBe("tb_c1_back_tees");
  });
  it("matches the id App.jsx has always written for an unnamed tee", () => {
    expect(teeBoxDocId("c1", "")).toBe("tb_c1_default");
  });
});

describe("staleTeeBoxIds", () => {
  it("names the documents a removed tee leaves behind", () => {
    const before = [tee("Black", 134), tee("Blue", 124), tee("White", 118)];
    const after = [tee("Black", 134), tee("White", 118)];
    expect(staleTeeBoxIds("c1", before, after)).toEqual(["tb_c1_blue"]);
  });

  it("names the old document when a tee is renamed", () => {
    expect(staleTeeBoxIds("c1", [tee("Blu", 124)], [tee("Blue", 124)])).toEqual(["tb_c1_blu"]);
  });

  it("deletes nothing when tees are only added or edited", () => {
    const before = [tee("Black", 134)];
    const after = [tee("Black", 138), tee("Gold", 108)];
    expect(staleTeeBoxIds("c1", before, after)).toEqual([]);
  });

  it("deletes nothing on a course that had no tees", () => {
    expect(staleTeeBoxIds("c1", undefined, [tee("Black", 134)])).toEqual([]);
  });
});
