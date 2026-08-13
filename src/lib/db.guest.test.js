// ══════════════════════════════════════════════════════════════════
//  Does a guest write anything?
// ══════════════════════════════════════════════════════════════════
//
// The claim the Guest button rests on is that somebody with no account can tap
// every screen in the app and change nothing. firestore.rules is what makes
// that true of the DATABASE; this is what makes it true of the phone — no
// write handed over, so nothing queued behind a client that will never be
// allowed to send it (see the note in db.js, and lib/guestMode).
//
// Firestore is mocked wholesale here. The question is not what Firestore does
// with a write, it is whether one is ever handed to it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setGuestWrites } from "./guestMode";

// vi.mock factories are hoisted above the imports, so anything they close over
// has to be hoisted with them.
const fs = vi.hoisted(() => ({
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  commit: vi.fn(async () => {}),
  batchSet: vi.fn(),
  batchDelete: vi.fn(),
}));
// Mutable, so a test can put somebody in the signed-in seat.
const auth = vi.hoisted(() => ({ currentUser: null }));

vi.mock("firebase/firestore", () => ({
  collection: (...a) => a,
  query: (...a) => a,
  where: (...a) => a,
  doc: (...a) => a,
  getDocs: async () => ({ empty: false, docs: [{ ref: "r1" }] }),
  getDocsFromCache: async () => ({ empty: true, docs: [] }),
  onSnapshot: () => () => {},
  setDoc: (...a) => fs.setDoc(...a),
  deleteDoc: (...a) => fs.deleteDoc(...a),
  writeBatch: () => ({ set: fs.batchSet, delete: fs.batchDelete, commit: fs.commit }),
}));

vi.mock("../firebase", () => ({ _db: {}, _auth: auth }));

const { db } = await import("./db");

const ROW = { id: "hs_2026_r1_aaron_j_h4", score: 4 };

const wrote = () =>
  fs.setDoc.mock.calls.length + fs.deleteDoc.mock.calls.length + fs.commit.mock.calls.length;

beforeEach(() => {
  fs.setDoc.mockClear(); fs.deleteDoc.mockClear(); fs.commit.mockClear();
  fs.batchSet.mockClear(); fs.batchDelete.mockClear();
  auth.currentUser = null;
});

afterEach(() => setGuestWrites(false));

describe("a guest looking around", () => {
  beforeEach(() => setGuestWrites(true));

  it("hands nothing to Firestore, by any of the five doors", async () => {
    await db.upsert("hole_scores", ROW);
    await db.upsertMany("hole_scores", [ROW, { ...ROW, id: "b" }]);
    await db.replaceMany("pairings", [ROW], ["gone"]);
    await db.delete("skins", [{ field: "tournament_id", op: "==", value: "wbc_2026" }]);
    await db.deleteDoc("wbc_media", "m1");
    expect(wrote()).toBe(0);
  });

  it("answers as though the write went, so nothing on screen reads as an error", async () => {
    // A guest's taps land in local React state and stop there. A caller that
    // saw a failure here would draw a failure — and there isn't one to draw.
    expect(await db.upsert("hole_scores", ROW)).toEqual(ROW);
    expect(await db.upsertMany("hole_scores", [ROW])).toBe(true);
    expect(await db.deleteDoc("wbc_media", "m1")).toBe(true);
  });
});

describe("everybody else", () => {
  it("writes normally when no guest is looking around", async () => {
    await db.upsert("hole_scores", ROW);
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
  });

  // The failure mode this whole design is arranged around: a latch stuck on
  // for a signed-in player would swallow scores typed on a tee box, silently,
  // with no error anywhere to catch. Being signed in overrules it.
  it("writes for a signed-in player even if the latch is stuck on", async () => {
    setGuestWrites(true);
    auth.currentUser = { uid: "uid_1" };
    await db.upsert("hole_scores", ROW);
    expect(fs.setDoc).toHaveBeenCalledTimes(1);
  });
});
