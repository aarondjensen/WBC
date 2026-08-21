import { describe, it, expect } from "vitest";
import {
  PAIR_ID_BYTES, PAIR_TTL_MS, PAIR_PARAM,
  isPairId, encodePairId, encodePairing, decodePairing,
  readPairParam, stripPairParam, pairingUrl,
  pairingErrorMessage, PAIRING_ERRORS, PAIRING_FALLBACK,
} from "./authPairing";

const NOW = 1_700_000_000_000;
const bytes = (fill) => new Uint8Array(PAIR_ID_BYTES).fill(fill);
const ID = encodePairId(bytes(7));

describe("the pairing id", () => {
  it("is 43 base64url characters, with no padding to lose in a URL", () => {
    expect(ID).toHaveLength(43);
    expect(ID).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(isPairId(ID)).toBe(true);
  });

  it("carries all 32 bytes, so it is the full 256 bits it claims to be", () => {
    expect(encodePairId(bytes(0))).not.toBe(encodePairId(bytes(1)));
    // Differing only in the LAST byte still changes the id — a truncating
    // encoder would pass every other test in this file.
    const a = new Uint8Array(PAIR_ID_BYTES).fill(9);
    const b = new Uint8Array(PAIR_ID_BYTES).fill(9); b[PAIR_ID_BYTES - 1] = 8;
    expect(encodePairId(a)).not.toBe(encodePairId(b));
  });

  it("refuses to be built from the wrong number of bytes", () => {
    expect(() => encodePairId(new Uint8Array(16))).toThrow();
    expect(() => encodePairId(null)).toThrow();
  });

  // Whoever holds one gets signed in, so anything short, absent or
  // wrong-shaped has to be refused everywhere it is read.
  it("rejects everything that is not exactly one", () => {
    for (const bad of [null, undefined, "", "short", `${ID}x`, ID.slice(0, 42), 42, {}, `${ID.slice(0, 42)}+`]) {
      expect(isPairId(bad)).toBe(false);
    }
  });
});

describe("what the home-screen app keeps", () => {
  it("round-trips the id", () => {
    expect(decodePairing(encodePairing(ID, NOW), NOW)).toBe(ID);
  });

  it("is still claimable a few minutes later, across an app relaunch", () => {
    expect(decodePairing(encodePairing(ID, NOW), NOW + 5 * 60 * 1000)).toBe(ID);
  });

  it("expires, so yesterday's abandoned pairing is not offered today", () => {
    expect(decodePairing(encodePairing(ID, NOW), NOW + PAIR_TTL_MS + 1)).toBe(null);
  });

  it("reads nothing, junk and the wrong shape as nothing", () => {
    for (const bad of [null, "", "{not json", "[]", JSON.stringify({ id: ID })]) {
      expect(decodePairing(bad, NOW)).toBe(null);
    }
  });

  it("refuses a stored id that is not a real pairing id", () => {
    expect(decodePairing(JSON.stringify({ id: "nope", at: NOW }), NOW)).toBe(null);
  });
});

describe("the Safari side of the link", () => {
  it("finds the id it was opened with", () => {
    expect(readPairParam(`?${PAIR_PARAM}=${ID}`)).toBe(ID);
    expect(readPairParam(`?other=1&${PAIR_PARAM}=${ID}`)).toBe(ID);
  });

  it("ignores an ordinary visit", () => {
    expect(readPairParam("")).toBe(null);
    expect(readPairParam("?utm_source=text")).toBe(null);
  });

  // The parameter is on a public URL. Somebody poking at it is not a player
  // with a problem, so it is ignored rather than reported.
  it("ignores a malformed one instead of trying to use it", () => {
    expect(readPairParam(`?${PAIR_PARAM}=../../etc`)).toBe(null);
    expect(readPairParam(`?${PAIR_PARAM}=`)).toBe(null);
  });
});

describe("taking the id back out of the address bar", () => {
  it("strips it, and the lone question mark with it", () => {
    expect(stripPairParam(`https://wannabecup.com/?${PAIR_PARAM}=${ID}`))
      .toBe("https://wannabecup.com/");
  });

  it("keeps anything else that was in the URL", () => {
    expect(stripPairParam(`https://wannabecup.com/?a=1&${PAIR_PARAM}=${ID}&b=2`))
      .toBe("https://wannabecup.com/?a=1&b=2");
    expect(stripPairParam(`https://wannabecup.com/?${PAIR_PARAM}=${ID}#board`))
      .toBe("https://wannabecup.com/#board");
  });

  it("says there was nothing to strip, so no history write happens", () => {
    expect(stripPairParam("https://wannabecup.com/")).toBe(null);
    expect(stripPairParam("not a url")).toBe(null);
  });
});

describe("the URL Safari is opened with", () => {
  it("is the top of the app, carrying the id", () => {
    expect(pairingUrl("https://wannabecup.com", ID)).toBe(`https://wannabecup.com/?${PAIR_PARAM}=${ID}`);
  });

  it("is read back by the Safari side it was built for", () => {
    const url = new URL(pairingUrl("https://wannabecup.com", ID));
    expect(readPairParam(url.search)).toBe(ID);
  });
});

describe("what a failed pairing says", () => {
  // The bug this exists for: a callable's `message` for a server-side failure
  // is the code word again, so passing it through put the word "INTERNAL" on
  // screen under the button. Found by driving the flow with no network.
  // ── The distinction two people lost an afternoon to ─────────────
  // A function that RAN and threw carries a real explanation. A call that
  // never arrived carries the code word back as its own message, because a
  // browser cannot read the status of a response with no CORS headers — which
  // is what an undeployed function answers with. Collapsing both onto "check
  // your connection" sent two people to look at their wifi while the fault was
  // on the server.
  it("shows what the server said, when the server said anything", () => {
    const real = "The server couldn't create a pairing token. Tell Aaron.";
    expect(pairingErrorMessage("functions/internal", real)).toBe(real);
    expect(pairingErrorMessage("internal", real)).toBe(real);
  });

  it("ignores a message that is only the code echoed back", () => {
    expect(pairingErrorMessage("functions/internal", "internal")).toBe(PAIRING_ERRORS.internal);
    expect(pairingErrorMessage("internal", "internal")).toBe(PAIRING_ERRORS.internal);
    expect(pairingErrorMessage("internal", "")).toBe(PAIRING_ERRORS.internal);
    expect(pairingErrorMessage("internal", undefined)).toBe(PAIRING_ERRORS.internal);
    // Single tokens are never prose, whatever they say.
    expect(pairingErrorMessage("internal", "UNAVAILABLE")).toBe(PAIRING_ERRORS.internal);
  });

  // Unreachable and undeployed are the same code, so the wording cannot claim
  // to know which — and must not tell somebody whose app is plainly working
  // that their connection is at fault.
  it("does not blame the phone for a server that isn't there", () => {
    const msg = PAIRING_ERRORS.internal;
    expect(msg).not.toMatch(/check your connection/i);
    expect(msg).toMatch(/tell aaron/i);
  });

  it("never shows a player a Firebase error code", () => {
    const codes = [
      ...Object.keys(PAIRING_ERRORS),
      ...Object.keys(PAIRING_ERRORS).map(c => `functions/${c}`),
      "", null, undefined, "some/unknown-code", "internal ",
    ];
    for (const code of codes) {
      const msg = pairingErrorMessage(code);
      expect(msg).toMatch(/[a-z] [a-z]/i);       // a sentence, not a token
      expect(msg).toMatch(/[.!]$/);              // that finishes
      expect(msg.toLowerCase()).not.toBe("internal");
    }
  });

  it("reads a code with or without the callable prefix", () => {
    expect(pairingErrorMessage("functions/internal")).toBe(PAIRING_ERRORS.internal);
    expect(pairingErrorMessage("internal")).toBe(PAIRING_ERRORS.internal);
  });

  // "the app shipped but the functions did not" is the one failure a director
  // can actually act on, so it has to name the action.
  it("names the deploy when the function is not there", () => {
    expect(pairingErrorMessage("functions/not-found")).toMatch(/deploy the Cloud Functions/i);
  });

  it("falls back to something useful for a code it has never seen", () => {
    expect(pairingErrorMessage("functions/teapot")).toBe(PAIRING_FALLBACK);
    expect(PAIRING_FALLBACK).toMatch(/Safari/);
  });
});
