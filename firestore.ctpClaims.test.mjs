// ══════════════════════════════════════════════════════════════════
//  firestore.ctpClaims.test.mjs — does Firestore merge a map key by key?
// ══════════════════════════════════════════════════════════════════
//
// The whole closest-to-the-pin model rests on one property of the backend, and
// it is the only part of that model a unit test cannot reach.
//
// A pin is not stored as its answer. Each group writes ITS OWN claim, under
// its own group key, in a separate setDoc(merge:true) — and the winner is
// derived from all of them when they are read back (see lib/ctp). Two groups
// answering the same par 3 at the same moment therefore write two different
// keys of the same map, and neither may erase the other. If Firestore replaced
// the `claims` map wholesale instead of merging into it, the model would be
// the very last-write-wins bug it was built to remove — and every test in
// lib/ctp.test.js would still pass, because they all run against plain
// objects.
//
// So this asks the backend. It is deliberately NOT a vitest file: it runs
// under plain node, the same way firestore.rules.test.mjs does, because both
// need an emulator listening and neither can be part of `npm run test:run`.
//
// Run it:
//   npx firebase-tools emulators:exec --only firestore --project wbc-ctp-test \
//     "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node firestore.ctpClaims.test.mjs"
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(["PASS", name, ""]); }
  catch (e) { results.push(["FAIL", name, e?.message || String(e)]); }
};
const eq = (a, b, what) => {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${what}: expected ${y}, got ${x}`);
};

// Wide open: what is under test is Firestore's merge semantics, not the rules.
// firestore.rules.test.mjs is where the door is checked.
const env = await initializeTestEnvironment({
  projectId: "wbc-ctp-test",
  firestore: {
    host: "127.0.0.1", port: 8080,
    rules: "service cloud.firestore { match /databases/{db}/documents { match /{d=**} { allow read, write: if true; } } }",
  },
});

// The real shape of a group key — `${round}_${sorted player ids}`. The commas
// matter: they are illegal in a field PATH, which is exactly why a claim is
// written as a nested object rather than as `claims.<key>`.
const G1 = "1_aaron_j,dave_s,mike_t,scott_r";
const G2 = "1_greg_b";
const db = env.unauthenticatedContext().firestore();
const claims = async (id) => (await getDoc(doc(db, "skins", id))).data()?.claims;
const write = (id, body) => setDoc(doc(db, "skins", id), body, { merge: true });

// ── Two groups, two keys, one pin ──────────────────────────────────
await check("both groups' answers survive a simultaneous write", async () => {
  const id = "ctp_2026_r1_h7";
  await write(id, { skin_type: "ctp", claims: { [G1]: { kind: "tag", player_id: "scott_r", distance_ft: 8, order: 0 } } });
  await write(id, { claims: { [G2]: { kind: "confirm", by: "greg_b", order: 1 } } });
  const c = await claims(id);
  eq(Object.keys(c).sort(), [G1, G2].sort(), "both keys present");
  eq(c[G1].player_id, "scott_r", "group 1's tag");
  eq(c[G2].kind, "confirm", "group 2's confirmation");
});

await check("a write that names one key leaves the rest of the document alone", async () => {
  const snap = await getDoc(doc(db, "skins", "ctp_2026_r1_h7"));
  eq(snap.data().skin_type, "ctp", "the field written first");
});

// ── A group correcting itself ──────────────────────────────────────
// The reopen button on the scoring screen: a group re-answers its own pin, and
// must overwrite only its own claim.
await check("re-answering replaces that group's claim and no other", async () => {
  const id = "ctp_2026_r1_h12";
  await write(id, { claims: { [G1]: { kind: "tag", player_id: "a", distance_ft: 20, order: 0 } } });
  await write(id, { claims: { [G2]: { kind: "tag", player_id: "b", distance_ft: 9, order: 1 } } });
  await write(id, { claims: { [G1]: { kind: "tag", player_id: "c", distance_ft: 4, order: 0 } } });
  const c = await claims(id);
  eq([c[G1].player_id, c[G1].distance_ft], ["c", 4], "group 1 corrected");
  eq([c[G2].player_id, c[G2].distance_ft], ["b", 9], "group 2 untouched");
});

// ── The key itself ─────────────────────────────────────────────────
await check("a group key with commas in it is a legal map key", async () => {
  const id = "ctp_2026_r1_h17";
  await write(id, { claims: { [G1]: { kind: "pass", order: 0 } } });
  eq((await claims(id))[G1].kind, "pass", "the pass round-tripped");
});

// ── The director's override ────────────────────────────────────────
await check("an override lands beside the group claims rather than over them", async () => {
  const id = "ctp_2026_r1_h2";
  await write(id, { claims: { [G1]: { kind: "tag", player_id: "a", distance_ft: 12, order: 0 } } });
  await write(id, { claims: { director: { kind: "override", player_id: "z", distance_ft: 30 } } });
  const c = await claims(id);
  eq(Object.keys(c).sort(), [G1, "director"].sort(), "both survive");
  eq(c[G1].distance_ft, 12, "the group's tag is still on the document");
});

await env.cleanup();
for (const [s, n, e] of results) console.log(s.padEnd(5), n, e ? `— ${e}` : "");
const failed = results.filter(r => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
