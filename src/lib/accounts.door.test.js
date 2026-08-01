import { describe, it, expect } from "vitest";
import { resolveMember } from "./accounts";

// The gate renders on `fbUser && member === false`. Everything below is about
// keeping that expression false for any state the app can actually be in
// except a real, current "no".

const GATE_SHOWS = (answer, fbUser) => !!fbUser && resolveMember(answer, fbUser?.uid) === false;

const NO_ANSWER_YET = { uid: undefined, doc: null };
const SIGNED_OUT = { uid: null, doc: null };
const MEMBER = uid => ({ uid, doc: { uid, is_director: false } });
const NOT_A_MEMBER = uid => ({ uid, doc: null });

describe("resolveMember", () => {
  it("is unknown before any read has happened", () => {
    expect(resolveMember(NO_ANSWER_YET, undefined)).toBe(undefined);
    expect(resolveMember(NO_ANSWER_YET, "u1")).toBe(undefined);
  });

  it("answers for the account it was actually read for", () => {
    expect(resolveMember(MEMBER("u1"), "u1")).toBe(true);
    expect(resolveMember(NOT_A_MEMBER("u1"), "u1")).toBe(false);
  });

  it("is unknown when the answer belongs to a different account", () => {
    expect(resolveMember(MEMBER("u1"), "u2")).toBe(undefined);
    expect(resolveMember(NOT_A_MEMBER("u1"), "u2")).toBe(undefined);
  });

  it("treats signed-out as a definitive non-member", () => {
    expect(resolveMember(SIGNED_OUT, undefined)).toBe(false);
    expect(resolveMember(SIGNED_OUT, null)).toBe(false);
  });

  it("survives a missing answer without throwing", () => {
    expect(resolveMember(undefined, "u1")).toBe(undefined);
    expect(resolveMember(null, "u1")).toBe(undefined);
  });
});

describe("the event-password gate, across a refresh", () => {
  // The sequence a returning player's phone actually goes through on reload.
  // Step 3 is the regression: fbUser has arrived, the membership effect has
  // not re-run yet, so the answer still says "nobody is signed in". That frame
  // used to satisfy `fbUser && member === false` and paint the password screen
  // at somebody who was already through the door.
  it("never shows the gate while auth is still settling", () => {
    const uid = "u1";
    const steps = [
      { name: "first render, nothing known", answer: NO_ANSWER_YET, fbUser: null },
      { name: "effect ran, no auth user yet", answer: SIGNED_OUT, fbUser: null },
      { name: "auth resolved, answer still stale", answer: SIGNED_OUT, fbUser: { uid } },
      { name: "read in flight for the new uid", answer: SIGNED_OUT, fbUser: { uid } },
      { name: "read landed — member", answer: MEMBER(uid), fbUser: { uid } },
    ];
    for (const s of steps) {
      expect(GATE_SHOWS(s.answer, s.fbUser), `gate must stay hidden: ${s.name}`).toBe(false);
    }
  });

  it("still shows the gate on a real no, once the read is in for that account", () => {
    const uid = "newcomer";
    expect(GATE_SHOWS(NOT_A_MEMBER(uid), { uid })).toBe(true);
  });

  it("does not show the gate to a signed-out visitor", () => {
    expect(GATE_SHOWS(SIGNED_OUT, null)).toBe(false);
  });

  it("re-closes the door when a different account signs in", () => {
    // Switching accounts must not carry the previous account's pass over.
    expect(GATE_SHOWS(MEMBER("u1"), { uid: "u2" })).toBe(false);   // unknown, not a no
    expect(resolveMember(MEMBER("u1"), "u2")).toBe(undefined);      // and not a yes either
  });
});
