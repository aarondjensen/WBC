import { describe, it, expect } from "vitest";
import { EDITION_LOCATIONS, locationForYear } from "./editionLocation";

describe("locationForYear", () => {
  it("gives each imported year its own city", () => {
    // The bug this table exists for: every one of these read "Gaylord, MI",
    // because a year with no location fell through to a hardcoded fallback.
    expect(locationForYear(2015)).toBe("Augusta, MI");
    expect(locationForYear(2018)).toBe("Oscoda, MI");
    expect(locationForYear(2019)).toBe("Stanwood, MI");
    expect(locationForYear(2021)).toBe("Lewiston, MI");
    expect(locationForYear(2023)).toBe("Bellaire, MI");
  });

  it("covers every year the WBC has been played", () => {
    for (let y = 2010; y <= 2025; y++) {
      expect(locationForYear(y), `${y} has no location`).not.toBe("");
    }
  });

  it("names the courses for the year with no home base anybody remembers", () => {
    // 2013 is Gaylord, Williamsburg, Bellaire and Roscommon with no host
    // resort. Naming the four courses beats picking one of the four towns and
    // calling it the answer — and it is why the header wraps to two lines.
    expect(locationForYear(2013))
      .toBe("Black Forest / Lochenheath / The Legend / Forest Dunes");
  });

  it("the years that shared a venue share a city, and the rest do not", () => {
    // 2010–2012 are all PGA Village and 2015/2022 are both Gull Lake View —
    // everything else is somewhere new, which is the fact that made one
    // hardcoded city wrong fifteen times out of sixteen.
    const distinct = new Set(Object.values(EDITION_LOCATIONS));
    expect(distinct.size).toBeGreaterThanOrEqual(10);
    expect(locationForYear(2010)).toBe(locationForYear(2012));
    expect(locationForYear(2015)).toBe(locationForYear(2022));
    expect(locationForYear(2014)).not.toBe(locationForYear(2013));
  });

  it("takes a year as a string, which is how an edition id yields one", () => {
    expect(locationForYear("2017")).toBe("Kewadin, MI");
  });

  it("is empty for a year we have no answer for, rather than guessing", () => {
    // The header drops the separator on an empty string and shows the bare
    // year. A default city here would put the wrong one on every future
    // edition the day it is created.
    expect(locationForYear(2031)).toBe("");
    expect(locationForYear(null)).toBe("");
    expect(locationForYear(undefined)).toBe("");
    expect(locationForYear("wbc_masters")).toBe("");
  });
});
