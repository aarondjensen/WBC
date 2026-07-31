// ══════════════════════════════════════════════════════════════════
//  firestore.rules.test.mjs — run this before deploying a rules change
// ══════════════════════════════════════════════════════════════════
//
// Ported from The Bourbon Cup, and it exists because the first version of
// these rules deployed to the console did not know wbc_accounts existed, so
// the password screen could not even READ whether you were a member — the
// app said "the database rules are out of date" and nobody could get in.
// That is the class of failure this file catches in ten seconds.
//
// Two halves, and both matter:
//
//   • STAGE ONE (enforcing() == false, how the file ships today) must add
//     the door WITHOUT closing any path that works right now. Every write a
//     phone makes on a tee box is asserted to still succeed unauthenticated.
//     If one of those starts failing, a rules deploy is about to eat scores.
//   • The door itself must hold in both stages: your own uid only, the right
//     password, no self-appointed directors, no client-side deletes.
//
// Run it:
//   npx firebase-tools emulators:start --only firestore --project wbc-test
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node firestore.rules.test.mjs
//
// When enforcing() is flipped to true, the first six assertions below are
// EXPECTED to flip with it — swap their assertSucceeds for assertFails and
// add signed-in-member equivalents. That edit is the point: it makes the
// change in behaviour something you state on purpose rather than discover.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import fs from "node:fs";

const env = await initializeTestEnvironment({
  projectId: "wbc-rules-test",
  firestore: { host: "127.0.0.1", port: 8080, rules: fs.readFileSync("firestore.rules", "utf8") },
});

// Start from nothing. Without this a second run inherits the password and the
// director flags the first run set, and half the assertions quietly invert —
// which is worse than failing, because it looks like the rules changed.
await env.clearFirestore();

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, e?.message?.slice(0, 120)]); }
};

const anon = env.unauthenticatedContext().firestore();
const mike = env.authenticatedContext("uid_mike").firestore();
const aaron = env.authenticatedContext("uid_aaron").firestore();

// ── Stage one must not break anything that works today ──
await check("anon can write a hole score (status quo)", () =>
  assertSucceeds(setDoc(doc(anon, "hole_scores/hs_1"), { score: 4 })));
await check("anon can write tournament_state (finalize path)", () =>
  assertSucceeds(setDoc(doc(anon, "tournament_state/ts_1"), { finalized: {} })));
await check("anon can write tee_assignments (setTee from scoring)", () =>
  assertSucceeds(setDoc(doc(anon, "tee_assignments/ta_1"), { tee_name: "Blue" })));
await check("anon can write tournament_players (markPlayerWD)", () =>
  assertSucceeds(setDoc(doc(anon, "tournament_players/tp_1"), { status: "WD" })));
await check("anon can write players (admin, open in stage one)", () =>
  assertSucceeds(setDoc(doc(anon, "players/p_1"), { name: "Test" })));
await check("anon can read the leaderboard", () =>
  assertSucceeds(getDoc(doc(anon, "hole_scores/hs_1"))));

// ── The door works, which is the whole point of stage one ──
await check("signed-in can READ own membership (the read that was refused)", () =>
  assertSucceeds(getDoc(doc(mike, "wbc_accounts/uid_mike"))));
await check("signed-in can create own membership, no password set", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_accounts/uid_mike"), { uid: "uid_mike", code: "" })));
await check("cannot mint a membership for somebody else", () =>
  assertFails(setDoc(doc(mike, "wbc_accounts/uid_someone_else"), { uid: "x", code: "" })));
await check("cannot make yourself a director at create", () =>
  assertFails(setDoc(doc(aaron, "wbc_accounts/uid_aaron"), { uid: "uid_aaron", code: "", is_director: true })));
await check("nobody can delete a membership from a client", () =>
  assertFails(deleteDoc(doc(mike, "wbc_accounts/uid_mike"))));
await check("non-director cannot read the password", () =>
  assertFails(getDoc(doc(mike, "wbc_secrets/access"))));
await check("anon cannot read the password", () =>
  assertFails(getDoc(doc(anon, "wbc_secrets/access"))));

// ── With a password set, the door checks it (case-insensitively) ──
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_secrets/access"), { code: "Wannabe26" });
});
const carl = env.authenticatedContext("uid_carl").firestore();
const dave = env.authenticatedContext("uid_dave").firestore();
await check("right password (different case) gets in", () =>
  assertSucceeds(setDoc(doc(carl, "wbc_accounts/uid_carl"), { uid: "uid_carl", code: "WANNABE26" })));
await check("wrong password refused", () =>
  assertFails(setDoc(doc(dave, "wbc_accounts/uid_dave"), { uid: "uid_dave", code: "nope" })));

// ── Director: flagged by hand in the console, then it works ──
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_accounts/uid_aaron"), { uid: "uid_aaron", is_director: true });
});
await check("director can read the password", () =>
  assertSucceeds(getDoc(doc(aaron, "wbc_secrets/access"))));
await check("director can set the password", () =>
  assertSucceeds(setDoc(doc(aaron, "wbc_secrets/access"), { code: "newone" })));
await check("director can appoint another director", () =>
  assertSucceeds(setDoc(doc(aaron, "wbc_accounts/uid_mike"), { is_director: true }, { merge: true })));
await check("director cannot change their OWN crown", () =>
  assertFails(setDoc(doc(aaron, "wbc_accounts/uid_aaron"), { is_director: false }, { merge: true })));

await env.cleanup();
for (const [s, n, e] of results) console.log(s.padEnd(5), n, e ? `— ${e}` : "");
const failed = results.filter(r => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
