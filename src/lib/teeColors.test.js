import { describe, it, expect } from "vitest";
import {
  TEE_COLOR_MAP, TEE_FALLBACK_COLORS,
  resolveTeeColor, getComboColors, isLightTee, isDarkTee, isBlackTee,
} from "./teeColors";

const tee = (name, color) => ({ name, color });

describe("resolveTeeColor", () => {
  it("knows the ordinary colours by name", () => {
    expect(resolveTeeColor(tee("Blue"), 0)).toBe(TEE_COLOR_MAP.blue);
    expect(resolveTeeColor(tee("White"), 0)).toBe(TEE_COLOR_MAP.white);
    expect(resolveTeeColor(tee("Gold"), 0)).toBe(TEE_COLOR_MAP.gold);
  });

  it("does not care about case or stray spacing", () => {
    expect(resolveTeeColor(tee("  BLUE "), 0)).toBe(TEE_COLOR_MAP.blue);
  });

  it("knows the names that are not colours", () => {
    expect(resolveTeeColor(tee("Championship"), 0)).toBe(TEE_COLOR_MAP.championship);
    expect(resolveTeeColor(tee("Tips"), 0)).toBe(TEE_COLOR_MAP.tips);
    expect(resolveTeeColor(tee("Forward"), 0)).toBe(TEE_COLOR_MAP.forward);
  });

  it("finds a colour word inside a longer name", () => {
    expect(resolveTeeColor(tee("Blue Tees"), 0)).toBe(TEE_COLOR_MAP.blue);
    expect(resolveTeeColor(tee("Senior Gold"), 0)).toBe(TEE_COLOR_MAP.senior);
  });

  // The whole reason the name is checked first: the API says #000000 when it
  // does not know, and believing it makes half the courses play black tees.
  it("ignores a stored black, which is the API saying it does not know", () => {
    expect(resolveTeeColor(tee("Blue", "#000000"), 0)).toBe(TEE_COLOR_MAP.blue);
    expect(resolveTeeColor(tee("Mystery", "#000000"), 0)).toBe(TEE_FALLBACK_COLORS[0]);
    expect(resolveTeeColor(tee("Mystery", "#000"), 0)).toBe(TEE_FALLBACK_COLORS[0]);
  });

  it("uses a real stored colour when the name means nothing", () => {
    expect(resolveTeeColor(tee("Ridge", "#123456"), 0)).toBe("#123456");
  });

  it("cycles the fallback palette so two unknown sets differ", () => {
    const a = resolveTeeColor(tee("Ridge"), 0);
    const b = resolveTeeColor(tee("Valley"), 1);
    expect(a).not.toBe(b);
    expect(resolveTeeColor(tee("Ridge"), TEE_FALLBACK_COLORS.length)).toBe(a);
  });

  it("survives a tee with no name at all", () => {
    expect(resolveTeeColor({}, 0)).toBe(TEE_FALLBACK_COLORS[0]);
  });
});

describe("getComboColors", () => {
  it("splits a two-colour tee set", () => {
    expect(getComboColors("Black/Blue")).toEqual([TEE_COLOR_MAP.black, TEE_COLOR_MAP.blue]);
  });

  it("accepts the separators courses actually use", () => {
    const expected = [TEE_COLOR_MAP.blue, TEE_COLOR_MAP.white];
    expect(getComboColors("Blue/White")).toEqual(expected);
    expect(getComboColors("Blue - White")).toEqual(expected);
    expect(getComboColors("Blue + White")).toEqual(expected);
    expect(getComboColors("Blue & White")).toEqual(expected);
    expect(getComboColors("Blue and White")).toEqual(expected);
  });

  it("is not a combo when both halves are the same colour", () => {
    expect(getComboColors("Blue/Blue")).toBe(null);
  });

  it("is not a combo when a half means nothing", () => {
    expect(getComboColors("Blue/Ridge")).toBe(null);
  });

  it("is not a combo for a plain name", () => {
    expect(getComboColors("Blue")).toBe(null);
    expect(getComboColors("")).toBe(null);
    expect(getComboColors(null)).toBe(null);
  });
});

// These decide whether a swatch needs an outline: a white tee on a dark card
// and a black tee on a dark card both vanish without one.
describe("isLightTee / isDarkTee", () => {
  it("knows the pale ones that need an outline", () => {
    expect(isLightTee(TEE_COLOR_MAP.white)).toBe(true);
    expect(isLightTee(TEE_COLOR_MAP.silver)).toBe(true);
    expect(isLightTee(TEE_COLOR_MAP.blue)).toBe(false);
  });

  it("knows the near-blacks", () => {
    expect(isDarkTee(TEE_COLOR_MAP.black)).toBe(true);
    expect(isDarkTee("#000000")).toBe(true);
    expect(isDarkTee(TEE_COLOR_MAP.championship)).toBe(true);
    expect(isDarkTee(TEE_COLOR_MAP.red)).toBe(false);
  });

  it("does not care about case", () => {
    expect(isDarkTee("#2C2C2C")).toBe(true);
    expect(isLightTee("#E8E8E8")).toBe(true);
  });

  it("is false for no colour at all", () => {
    expect(isLightTee(null)).toBe(false);
    expect(isDarkTee(undefined)).toBe(false);
    expect(isDarkTee("")).toBe(false);
  });

  it("isBlackTee is isDarkTee — one question, one answer", () => {
    for (const c of [TEE_COLOR_MAP.black, TEE_COLOR_MAP.blue, "#000000", null]) {
      expect(isBlackTee(c)).toBe(isDarkTee(c));
    }
  });
});
