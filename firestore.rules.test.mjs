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
// Three halves now that `enforcing()` is TRUE, and all of them matter:
//
//   • The door must hold: your own uid only, the right password, no
//     self-appointed directors, no client-side deletes.
//   • Enforcement must actually bite. An anonymous write to any tournament
//     collection is asserted to FAIL. These are the assertions that used to
//     read assertSucceeds, back when the file shipped with enforcing() false
//     and the tournament data was as open as it had always been — the flip is
//     stated here on purpose rather than discovered on a tee box.
//   • Enforcement must not bite the FIELD. Everything a phone does during a
//     round — post a score, set a tee, withdraw somebody, sign a card,
//     finalize — is asserted to still succeed for a signed-in MEMBER, and the
//     director-only half is asserted to fail for a member without the crown.
//     If one of those inverts, a rules deploy is about to eat scores.
//
// Run it:
//   npx firebase-tools emulators:start --only firestore --project wbc-test
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node firestore.rules.test.mjs
//
// Order is load-bearing below: nobody is a member until they create a
// membership, and nobody is a director until one is flagged with the rules
// disabled. The anon-denied block therefore runs first, and the member and
// director blocks run after the setup that earns each one.
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
// Signed in, never through the password screen. The account that proves
// "signed in" and "allowed" are different questions.
const dana = env.authenticatedContext("uid_dana").firestore();

// ── Enforcement bites: no membership, no writes ──
// Every one of these was an assertSucceeds while enforcing() was false.
await check("anon CANNOT write a hole score", () =>
  assertFails(setDoc(doc(anon, "hole_scores/hs_1"), { score: 4 })));
await check("anon CANNOT write tournament_state", () =>
  assertFails(setDoc(doc(anon, "tournament_state/ts_1"), { finalized: {} })));
await check("anon CANNOT write tee_assignments", () =>
  assertFails(setDoc(doc(anon, "tee_assignments/ta_1"), { tee_name: "Blue" })));
await check("anon CANNOT write tournament_players", () =>
  assertFails(setDoc(doc(anon, "tournament_players/tp_1"), { status: "WD" })));
await check("anon CANNOT write players (director-only)", () =>
  assertFails(setDoc(doc(anon, "players/p_1"), { name: "Test" })));
await check("anon CANNOT write skins", () =>
  assertFails(setDoc(doc(anon, "skins/sk_1"), { hole: 3 })));
await check("anon CANNOT write a scorecard signature", () =>
  assertFails(setDoc(doc(anon, "wbc_scorecard_sigs/sig_1"), { signedBy: "x" })));
await check("anon CANNOT create an edition", () =>
  assertFails(setDoc(doc(anon, "wbc_editions/wbc_2027"), { year: 2027 })));
await check("anon CANNOT post a photo", () =>
  assertFails(setDoc(doc(anon, "wbc_media/med_2026_anon"), { uploadedBy: "uid_mike", host: "storage" })));

// Signed in is NOT enough — this is the whole reason the door exists.
await check("signed-in non-member CANNOT write a hole score", () =>
  assertFails(setDoc(doc(dana, "hole_scores/hs_2"), { score: 5 })));

// Reads stay open, deliberately: the shared leaderboard link and the Guest
// button both depend on it. If this one flips, that is a product decision and
// isOpen() is the single place it is made.
await check("anon can still read the leaderboard", () =>
  assertSucceeds(getDoc(doc(anon, "hole_scores/hs_1"))));

// ── The door works, which is the whole point of stage one ──
await check("signed-in can READ own membership (the read that was refused)", () =>
  assertSucceeds(getDoc(doc(mike, "wbc_accounts/uid_mike"))));
await check("signed-in can create own membership, no password set", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_accounts/uid_mike"), { uid: "uid_mike", code: "" })));
// ── …and enforcement must not bite the field ──
// mike is a member as of the assertion above. Everything a phone does during
// a round has to still work, or this deploy eats scores on a tee box.
await check("member can write a hole score", () =>
  assertSucceeds(setDoc(doc(mike, "hole_scores/hs_3"), { score: 4 })));
await check("member can write tournament_state (finalize path)", () =>
  assertSucceeds(setDoc(doc(mike, "tournament_state/ts_2"), { finalized: {} })));
await check("member can write tee_assignments (setTee from scoring)", () =>
  assertSucceeds(setDoc(doc(mike, "tee_assignments/ta_2"), { tee_name: "Blue" })));
await check("member can withdraw somebody (markPlayerWD)", () =>
  assertSucceeds(setDoc(doc(mike, "tournament_players/tp_2"), { status: "WD" })));
await check("member can sign a scorecard", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_scorecard_sigs/sig_2"), { signedBy: "uid_mike" })));
await check("member can write skins", () =>
  assertSucceeds(setDoc(doc(mike, "skins/sk_2"), { hole: 3 })));
await check("member can write wbc_rounds_state", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_rounds_state/rs_1"), { round: 1, finalized: true })));
await check("member can claim a name (wbc_users, own uid)", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_users/uid_mike"), { uid: "uid_mike", player_id: "mike_r" })));
await check("member CANNOT claim a name as somebody else", () =>
  assertFails(setDoc(doc(mike, "wbc_users/uid_aaron"), { uid: "uid_aaron", player_id: "aaron_j" })));

// ── The photo library ──
// Posting is a member write, like scoring. The three things worth pinning are
// that a member cannot post under another name, cannot quietly become the
// author of a photo by editing its caption, and cannot delete out of the
// ARCHIVE — whose bytes are a Cloudflare Pages deploy, not something a client
// delete can reach. src/lib/media.js canDelete() mirrors that last rule and
// media.test.js pins the mirror.
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  await setDoc(doc(f, "wbc_media/med_2026_theirs"), { uploadedBy: "uid_aaron", host: "storage", edition: "2026" });
  await setDoc(doc(f, "wbc_media/med_2019_archived"), { uploadedBy: "uid_mike", host: "pages", edition: "2019" });
});
await check("member can post a photo", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_media/med_2026_mine"), { uploadedBy: "uid_mike", host: "storage", edition: "2026" })));
await check("member CANNOT post a photo under somebody else's name", () =>
  assertFails(setDoc(doc(mike, "wbc_media/med_2026_forged"), { uploadedBy: "uid_aaron", host: "storage", edition: "2026" })));
await check("member can fix the caption on their own photo", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_media/med_2026_mine"), { caption: "18th green" }, { merge: true })));
await check("member CANNOT become the author of their own photo's replacement", () =>
  assertFails(setDoc(doc(mike, "wbc_media/med_2026_mine"), { uploadedBy: "uid_aaron" }, { merge: true })));
await check("member CANNOT edit somebody else's photo", () =>
  assertFails(setDoc(doc(mike, "wbc_media/med_2026_theirs"), { caption: "mine now" }, { merge: true })));
await check("member CANNOT delete somebody else's photo", () =>
  assertFails(deleteDoc(doc(mike, "wbc_media/med_2026_theirs"))));
await check("member CANNOT delete out of the archive, even their own", () =>
  assertFails(deleteDoc(doc(mike, "wbc_media/med_2019_archived"))));
await check("member can delete their own live photo", () =>
  assertSucceeds(deleteDoc(doc(mike, "wbc_media/med_2026_mine"))));
await check("anon can read the gallery", () =>
  assertSucceeds(getDoc(doc(anon, "wbc_media/med_2026_theirs"))));

// The director-owned half: no player screen reaches these, and a member
// without the crown must not either.
await check("member CANNOT write players", () =>
  assertFails(setDoc(doc(mike, "players/p_2"), { name: "Test" })));
await check("member CANNOT write courses", () =>
  assertFails(setDoc(doc(mike, "courses/c_1"), { name: "Test GC" })));
await check("member CANNOT assign a round to a course", () =>
  assertFails(setDoc(doc(mike, "tournament_rounds/tr_1"), { round_number: 1 })));
await check("member CANNOT write pairings", () =>
  assertFails(setDoc(doc(mike, "pairings/pr_1"), { group_number: 1 })));
await check("member CANNOT delete an edition", () =>
  assertFails(deleteDoc(doc(mike, "wbc_editions/wbc_2026"))));

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

// The director-owned half, from the other side. Same five collections the
// member above was refused.
await check("director can write players", () =>
  assertSucceeds(setDoc(doc(aaron, "players/p_3"), { name: "Test" })));
await check("director can write courses", () =>
  assertSucceeds(setDoc(doc(aaron, "courses/c_2"), { name: "Test GC" })));
await check("director can assign a round to a course", () =>
  assertSucceeds(setDoc(doc(aaron, "tournament_rounds/tr_2"), { round_number: 1 })));
await check("director can write pairings", () =>
  assertSucceeds(setDoc(doc(aaron, "pairings/pr_2"), { group_number: 1 })));
await check("director can create an edition", () =>
  assertSucceeds(setDoc(doc(aaron, "wbc_editions/wbc_2027"), { year: 2027 })));
// A director is a member first — the scoring half stays open to them.
await check("director can still write a hole score", () =>
  assertSucceeds(setDoc(doc(aaron, "hole_scores/hs_4"), { score: 3 })));

// The photo library's director half: the archive, and anything a member
// posted. A director is the one who can also re-run the Pages deploy that
// actually removes an archived photo's bytes, which is why the archive is
// theirs alone.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_media/med_2026_carls"), { uploadedBy: "uid_carl", host: "storage", edition: "2026" });
});
await check("director can delete out of the archive", () =>
  assertSucceeds(deleteDoc(doc(aaron, "wbc_media/med_2019_archived"))));
await check("director can remove a photo somebody else posted", () =>
  assertSucceeds(deleteDoc(doc(aaron, "wbc_media/med_2026_carls"))));

await env.cleanup();
for (const [s, n, e] of results) console.log(s.padEnd(5), n, e ? `— ${e}` : "");
const failed = results.filter(r => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
