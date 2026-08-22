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

// ── The pairing tokens are server-only, and nothing may soften that ──
// wbc_auth_pairings holds Firebase CUSTOM TOKENS — a document read here is a
// sign-in as that account. Both ends go through Cloud Functions, whose Admin
// SDK bypasses these rules, so the correct client access is NONE, and this is
// asserted from every direction rather than assumed from the catch-all: a
// signed-in member is the account most likely to be handed access by a
// well-meaning future rule, and a director the next.
const PAIR_DOC = "wbc_auth_pairings/" + "A".repeat(43);
await check("nobody signed out can read a pairing token", () =>
  assertFails(getDoc(doc(anon, PAIR_DOC))));
await check("a member cannot read a pairing token", () =>
  assertFails(getDoc(doc(mike, PAIR_DOC))));
await check("a member cannot write one either", () =>
  assertFails(setDoc(doc(mike, PAIR_DOC), { token: "forged" })));
await check("nobody signed out can write one", () =>
  assertFails(setDoc(doc(anon, PAIR_DOC), { token: "forged" })));

// ── The market: a book belongs to one player, and it is money ──
// `skins` holds the CTP tags AND the market's bets. Under a flat member write
// any player could rewrite anybody's book — not by a path the app offers, but
// the app is not what enforces this. The rule matches a bet's player_id
// against the claim mike made just above (uid_mike → "mike_r").
//
// These must run BEFORE mike is made a director further down, or the refusals
// invert.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "skins/mk_aarons"), { skin_type: "market", player_id: "aaron_j", opening: [{ pid: "aaron_j", shares: 20 }] });
});
await check("member can write their OWN market bet", () =>
  assertSucceeds(setDoc(doc(mike, "skins/mk_mikes"), { skin_type: "market", player_id: "mike_r", opening: [{ pid: "mike_r", shares: 20 }] })));
await check("member CANNOT open a book in somebody else's name", () =>
  assertFails(setDoc(doc(mike, "skins/mk_forged"), { skin_type: "market", player_id: "aaron_j", opening: [] })));
await check("member CANNOT rewrite somebody else's book by merge", () =>
  assertFails(setDoc(doc(mike, "skins/mk_aarons"), { opening: [{ pid: "mike_r", shares: 20 }] }, { merge: true })));
await check("member CANNOT delete a book", () =>
  assertFails(deleteDoc(doc(mike, "skins/mk_mikes"))));

// CTP stays communal — a pin is tagged by whichever group is standing on it,
// naming whoever hit the shot, and a later group answers the standing tag.
// Both are member writes about somebody else and must keep working.
await check("member can tag a CTP for another player", () =>
  assertSucceeds(setDoc(doc(mike, "skins/ctp_r1_h4"), { skin_type: "ctp", player_id: "aaron_j", distance_ft: 12 })));
await check("member can confirm a standing CTP tag", () =>
  assertSucceeds(setDoc(doc(mike, "skins/ctp_r1_h4"), { confirmed_by: ["mike_r"] }, { merge: true })));

// A signed-in account that never claimed a profile has no player_id, which
// must match nothing rather than everything.
await check("unclaimed account CANNOT write a market bet", () =>
  assertFails(setDoc(doc(dana, "skins/mk_dana"), { skin_type: "market", player_id: "mike_r", opening: [] })));

// ── The market is SEALED, and not only on screen ──
// The Betting tab hid other players' books; the collection did not. Anybody
// could read them straight out of Firestore, which made the blind market — the
// thing that stops the halfway window being a copy of the consensus — a
// convention rather than a rule.
await check("member can read their OWN book", () =>
  assertSucceeds(getDoc(doc(mike, "skins/mk_mikes"))));
await check("member CANNOT read somebody else's book", () =>
  assertFails(getDoc(doc(mike, "skins/mk_aarons"))));
await check("anon CANNOT read a book at all", () =>
  assertFails(getDoc(doc(anon, "skins/mk_aarons"))));

// CTP has to stay world-readable through all of that: a standing pin is
// exactly the number the next group needs, and the guest leaderboard shows it.
await check("anon can still read a CTP tag", () =>
  assertSucceeds(getDoc(doc(anon, "skins/ctp_r1_h4"))));

// The reveal. One world-readable document, written by a director once the
// tournament is over, because sealing the books also seals the final board.
await check("anon can read the published market result", () =>
  assertSucceeds(getDoc(doc(anon, "wbc_market_result/mr_wbc_2026"))));
await check("member CANNOT publish the market result", () =>
  assertFails(setDoc(doc(mike, "wbc_market_result/mr_wbc_2026"), { bets: [] })));

// ── The side bet ledger ──
// A wager the app records and does not run (src/lib/sideBets.js). It is world-
// readable, unlike the books above — a side bet names both its sides on its own
// row, so there is nothing to seal — and the three things worth pinning are the
// three the screen's affordances mirror: an author cannot be forged, a bet is
// only editable by the person who logged it, and the ONE thing a member may
// write on a document they do not own is a `settled_by` mark on a bet they are
// actually in.
//
// Runs before mike is made a director further down, or every refusal inverts.
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  // Aaron's bet against Mike: Mike is a side of it and did not write it.
  await setDoc(doc(f, "wbc_side_bets/sb_theirs"), {
    id: "sb_theirs", tournament_id: "wbc_2026", created_by: "uid_aaron",
    player_a: "aaron_j", player_b: "mike_r", amount: 20, settled_by: [],
  });
  // A bet between two other men entirely.
  await setDoc(doc(f, "wbc_side_bets/sb_others"), {
    id: "sb_others", tournament_id: "wbc_2026", created_by: "uid_aaron",
    player_a: "aaron_j", player_b: "carl_x", amount: 20, settled_by: [],
  });
});
const sideBet = (over = {}) => ({
  tournament_id: "wbc_2026", created_by: "uid_mike",
  player_a: "mike_r", player_b: "aaron_j", amount: 20, settled_by: [], ...over,
});
await check("member can log a side bet", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_side_bets/sb_mine"), sideBet({ id: "sb_mine" }))));
await check("member CANNOT log one under somebody else's name", () =>
  assertFails(setDoc(doc(mike, "wbc_side_bets/sb_forged"), sideBet({ id: "sb_forged", created_by: "uid_aaron" }))));
await check("member can fix the terms of their own bet", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_side_bets/sb_mine"), { detail: "front nine, straight up" }, { merge: true })));
await check("member CANNOT become the author of a bet by editing it", () =>
  assertFails(setDoc(doc(mike, "wbc_side_bets/sb_mine"), { created_by: "uid_aaron" }, { merge: true })));
await check("member CANNOT rewrite a bet somebody else logged", () =>
  assertFails(setDoc(doc(mike, "wbc_side_bets/sb_theirs"), { amount: 5 }, { merge: true })));
// The one door that lets a member write a document they do not own — and the
// reason the door exists at all: a bet is settled when BOTH sides say it is.
await check("the other side of a bet CAN mark it paid", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_side_bets/sb_theirs"), { settled_by: ["mike_r"] }, { merge: true })));
await check("a bystander CANNOT mark somebody else's bet paid", () =>
  assertFails(setDoc(doc(mike, "wbc_side_bets/sb_others"), { settled_by: ["mike_r"] }, { merge: true })));
// The door is one field wide. Anything riding along with the mark is an edit
// to a bet the caller does not own, which is the thing above.
await check("a settle mark CANNOT smuggle another field through with it", () =>
  assertFails(setDoc(doc(mike, "wbc_side_bets/sb_theirs"), { settled_by: ["mike_r"], amount: 1 }, { merge: true })));
// Deliberately not "either player in the bet" — the other side of a bet you
// dispute is not yours to erase. lib/sideBets canDeleteSideBet mirrors this.
await check("member CANNOT delete a bet they did not log", () =>
  assertFails(deleteDoc(doc(mike, "wbc_side_bets/sb_theirs"))));
await check("member can delete their own bet", () =>
  assertSucceeds(deleteDoc(doc(mike, "wbc_side_bets/sb_mine"))));
await check("anon can read the ledger", () =>
  assertSucceeds(getDoc(doc(anon, "wbc_side_bets/sb_theirs"))));
await check("anon CANNOT log a bet", () =>
  assertFails(setDoc(doc(anon, "wbc_side_bets/sb_anon"), sideBet({ id: "sb_anon" }))));

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

// The budget circuit breaker. A member must not be able to clear a breaker a
// budget tripped — that is the difference between a cap and a suggestion.
await check("anybody can read whether photo uploads are on", () =>
  assertSucceeds(getDoc(doc(anon, "wbc_config/photos"))));
await check("member CANNOT clear the budget circuit breaker", () =>
  assertFails(setDoc(doc(mike, "wbc_config/photos"), { uploadsDisabled: false })));

// Tripped, the breaker must actually stop a create — not merely hide a button.
// Deleting has to keep working while it is tripped: removing photos is how the
// bill comes back down, so a breaker that blocked deletes would be backwards.
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  await setDoc(doc(f, "wbc_config/photos"), { uploadsDisabled: true });
  await setDoc(doc(f, "wbc_media/med_2026_before"), { uploadedBy: "uid_mike", host: "storage", edition: "2026" });
});
await check("breaker tripped: member CANNOT post a photo", () =>
  assertFails(setDoc(doc(mike, "wbc_media/med_2026_blocked"), { uploadedBy: "uid_mike", host: "storage", edition: "2026" })));
await check("breaker tripped: member CAN still delete their own photo", () =>
  assertSucceeds(deleteDoc(doc(mike, "wbc_media/med_2026_before"))));
await check("breaker tripped: gallery still readable", () =>
  assertSucceeds(getDoc(doc(anon, "wbc_media/med_2026_theirs"))));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_config/photos"), { uploadsDisabled: false });
});
await check("breaker cleared: member can post again", () =>
  assertSucceeds(setDoc(doc(mike, "wbc_media/med_2026_after"), { uploadedBy: "uid_mike", host: "storage", edition: "2026" })));

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
// Not even the crown reaches the pairing tokens. There is no such thing as a
// person who should read one — the two Cloud Functions that own them bypass
// these rules entirely, and a director's console is where somebody would go
// looking if a rule here ever let them.
await check("a director cannot read a pairing token either", () =>
  assertFails(getDoc(doc(aaron, PAIR_DOC))));
await check("a director cannot forge one", () =>
  assertFails(setDoc(doc(aaron, PAIR_DOC), { token: "forged" })));

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

// The market's one correction. Entering a book for somebody whose phone died
// before the bell is the only way a missed allocation gets in, so a director
// writes any player's — and clears the board at Start Fresh.
await check("director can enter a book for another player", () =>
  assertSucceeds(setDoc(doc(aaron, "skins/mk_carls"), { skin_type: "market", player_id: "carl_x", opening: [{ pid: "carl_x", shares: 20 }] })));
await check("director can clear a book (Start Fresh)", () =>
  assertSucceeds(deleteDoc(doc(aaron, "skins/mk_carls"))));
// The whole board, throughout — the correction path and the settling-up both
// need it, and it is what the reveal is published from.
await check("director can read anybody's book", () =>
  assertSucceeds(getDoc(doc(aaron, "skins/mk_aarons"))));
await check("director can publish the market result", () =>
  assertSucceeds(setDoc(doc(aaron, "wbc_market_result/mr_wbc_2026"), { tournament_id: "wbc_2026", bets: [] })));

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
await check("director can clear the budget circuit breaker by hand", () =>
  assertSucceeds(setDoc(doc(aaron, "wbc_config/photos"), { uploadsDisabled: false })));

// The ledger's director half: correcting a bet somebody typed wrong, and
// removing one that should never have been logged. Same reasoning as the
// photos — an argument about a bet is the director's to settle.
await check("director can correct a bet somebody else logged", () =>
  assertSucceeds(setDoc(doc(aaron, "wbc_side_bets/sb_others"), { amount: 40 }, { merge: true })));
await check("director can remove a bet somebody else logged", () =>
  assertSucceeds(deleteDoc(doc(aaron, "wbc_side_bets/sb_others"))));

// ══════════════════════════════════════════════════════════════════
//  A LOCKED EDITION
// ══════════════════════════════════════════════════════════════════
//
// `locked: true` on an edition freezes that year against everybody but a
// director. It exists because a membership is not edition-scoped — being in
// the tournament lets you write to EVERY tournament, and the Tournaments
// picker is offered to every member — so twelve beta testers with the event
// password are twelve people one tap away from the live scorecards.
//
// Four things have to hold, and the last two are the ones that would make this
// a worse bug than the one it fixes:
//
//   • a locked year refuses a member's writes, on every collection
//   • a DIRECTOR still gets through, or a mis-tapped padlock strands a
//     tournament with nobody able to correct it
//   • it fails OPEN — no edition document, or no tournament_id on the row,
//     means writable. `ensureActiveEditionDoc` seeds the index row lazily, so
//     there is a real window where a new year is being played before its
//     document exists, and failing closed there means the tournament cannot
//     start
//   • READING is untouched. Freezing a year is not hiding it.
//
// `carl` is the plain member here: `mike` was appointed a director further up
// and would pass the exemption rather than test it.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "wbc_editions/wbc_2019"), { id: "wbc_2019", year: 2019, locked: true });
  await setDoc(doc(db, "wbc_editions/wbc_2026"), { id: "wbc_2026", year: 2026, locked: false });
  // The row a member will try to drag out of the frozen year, and one in the
  // open year to drag INTO it.
  await setDoc(doc(db, "hole_scores/hs_locked_1"), { tournament_id: "wbc_2019", score: 4 });
  await setDoc(doc(db, "hole_scores/hs_open_1"), { tournament_id: "wbc_2026", score: 4 });
});

// The control: the same write, one year either side of the padlock.
await check("member can write a hole score in an UNLOCKED year", () =>
  assertSucceeds(setDoc(doc(carl, "hole_scores/hs_open_2"), { tournament_id: "wbc_2026", score: 4 })));
await check("member CANNOT write a hole score in a LOCKED year", () =>
  assertFails(setDoc(doc(carl, "hole_scores/hs_locked_2"), { tournament_id: "wbc_2019", score: 4 })));

// Every other collection a phone writes during a round. A lock that held on
// scores but let a card be signed, a tee changed or a man withdrawn would be
// a lock in name only.
await check("member CANNOT set a tee in a locked year", () =>
  assertFails(setDoc(doc(carl, "tee_assignments/ta_locked"), { tournament_id: "wbc_2019", tee_name: "Blue" })));
await check("member CANNOT withdraw somebody in a locked year", () =>
  assertFails(setDoc(doc(carl, "tournament_players/tp_locked"), { tournament_id: "wbc_2019", status: "WD" })));
await check("member CANNOT finalize in a locked year", () =>
  assertFails(setDoc(doc(carl, "tournament_state/ts_locked"), { tournament_id: "wbc_2019", finalized: {} })));
await check("member CANNOT write round state in a locked year", () =>
  assertFails(setDoc(doc(carl, "wbc_rounds_state/rs_locked"), { tournament_id: "wbc_2019", round: 1 })));
await check("member CANNOT sign a card in a locked year", () =>
  assertFails(setDoc(doc(carl, "wbc_scorecard_sigs/sig_locked"), { tournament_id: "wbc_2019", groupKey: "g1" })));
await check("member CANNOT tag a CTP in a locked year", () =>
  assertFails(setDoc(doc(carl, "skins/ctp_locked"), { tournament_id: "wbc_2019", skin_type: "ctp", hole: 7 })));
// The side bet ledger answers to the padlock like everything else. It is the
// one collection that does NOT close when a tournament merely finishes — see
// canWriteLedger, and the finished-year block below — so the padlock is the
// only thing that stops a member writing into 2019, and it has to hold.
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  // Carl's claim, so he is a player and not merely an account: the settle door
  // is gated on the phone being one of the two names on the bet.
  await setDoc(doc(f, "wbc_users/uid_carl"), { uid: "uid_carl", player_id: "carl_x" });
  await setDoc(doc(f, "wbc_side_bets/sb_locked"), {
    id: "sb_locked", tournament_id: "wbc_2019", created_by: "uid_aaron",
    player_a: "aaron_j", player_b: "carl_x", amount: 20, settled_by: [],
  });
});
await check("member CANNOT log a side bet in a locked year", () =>
  assertFails(setDoc(doc(carl, "wbc_side_bets/sb_locked_new"), { id: "sb_locked_new", tournament_id: "wbc_2019", created_by: "uid_carl", player_a: "carl_x", player_b: "aaron_j", amount: 20, settled_by: [] })));
await check("member CANNOT mark one paid in a locked year either", () =>
  assertFails(setDoc(doc(carl, "wbc_side_bets/sb_locked"), { settled_by: ["carl_x"] }, { merge: true })));

// Deleting out of a frozen year is an edit to it.
await check("member CANNOT delete out of a locked year", () =>
  assertFails(deleteDoc(doc(carl, "hole_scores/hs_locked_1"))));

// ── Both ends of an update, which is the hole a naive version leaves ──
// Checking only the incoming document would let a member take a card that
// lives in the frozen year and rewrite it into an open one — the frozen
// tournament edited, by relabelling rather than by writing.
await check("member CANNOT move a row OUT of a locked year", () =>
  assertFails(setDoc(doc(carl, "hole_scores/hs_locked_1"), { tournament_id: "wbc_2026", score: 9 }, { merge: true })));
await check("member CANNOT move a row INTO a locked year", () =>
  assertFails(setDoc(doc(carl, "hole_scores/hs_open_1"), { tournament_id: "wbc_2019", score: 9 }, { merge: true })));

// ── The exemption, which is what keeps a mis-tap recoverable ──
await check("director CAN write a hole score in a locked year", () =>
  assertSucceeds(setDoc(doc(aaron, "hole_scores/hs_locked_3"), { tournament_id: "wbc_2019", score: 5 })));
await check("director CAN delete out of a locked year", () =>
  assertSucceeds(deleteDoc(doc(aaron, "hole_scores/hs_locked_3"))));
await check("director CAN unlock a year", () =>
  assertSucceeds(setDoc(doc(aaron, "wbc_editions/wbc_2019"), { locked: false }, { merge: true })));
await check("member CANNOT unlock a year", () =>
  assertFails(setDoc(doc(carl, "wbc_editions/wbc_2019"), { locked: false }, { merge: true })));

// ── Fails OPEN, three ways ──
// Each of these is a shape that exists in the real database right now, and
// every one of them has to stay writable. A default of "locked" here would
// have frozen seventeen years of tournaments on deploy and stopped the next
// one from starting.
await check("no edition document at all: still writable", () =>
  assertSucceeds(setDoc(doc(carl, "hole_scores/hs_noedition"), { tournament_id: "wbc_1999", score: 4 })));
await check("no tournament_id on the row: still writable", () =>
  assertSucceeds(setDoc(doc(carl, "hole_scores/hs_notid"), { score: 4 })));
await check("edition document with no locked field: still writable", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "wbc_editions/wbc_2013"), { id: "wbc_2013", year: 2013 });
  });
  return assertSucceeds(setDoc(doc(carl, "hole_scores/hs_2013"), { tournament_id: "wbc_2013", score: 4 }));
});

// ── Freezing is not hiding ──
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_editions/wbc_2019"), { locked: true }, { merge: true });
});
await check("a locked year is still readable by a member", () =>
  assertSucceeds(getDoc(doc(carl, "hole_scores/hs_locked_1"))));
await check("a locked year is still readable by a guest", () =>
  assertSucceeds(getDoc(doc(anon, "hole_scores/hs_locked_1"))));

// ── And it lifts ──
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_editions/wbc_2019"), { locked: false }, { merge: true });
});
await check("unlocked again: the member's write lands", () =>
  assertSucceeds(setDoc(doc(carl, "hole_scores/hs_thawed"), { tournament_id: "wbc_2019", score: 4 })));

// ── A finished year is closed even with no padlock on it ─────────
// The lock is a director's deliberate act; these are the years nobody thought
// about. Sixteen finished tournaments sit one tap away in the picker, any
// member may open one, and until this rule a member standing in an unlocked
// 2014 could post a score into a tournament that ended twelve years ago.
//
// "Finished" is every round accounted for in tournament_state — see
// editionFinished. Asserted from both sides, because the direction it fails is
// what matters: a year still being played must keep taking scores.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  // 2014: four rounds, all four signed off. Unlocked, deliberately.
  await setDoc(doc(db, "wbc_editions/wbc_2014"), { id: "wbc_2014", year: 2014, locked: false });
  await setDoc(doc(db, "tournament_state/ts_wbc_2014"), {
    id: "ts_wbc_2014", tournament_id: "wbc_2014",
    meta: { rounds: 4 }, finalized_rounds: { 1: true, 2: true, 3: true, 4: true },
  });
  await setDoc(doc(db, "hole_scores/hs_2014_1"), { tournament_id: "wbc_2014", score: 4 });
  // 2026: the tournament being played. One round done, three to go.
  await setDoc(doc(db, "tournament_state/ts_wbc_2026"), {
    id: "ts_wbc_2026", tournament_id: "wbc_2026",
    meta: { rounds: 4 }, finalized_rounds: { 1: true },
  });
});

await check("member CANNOT post a score into a finished year", () =>
  assertFails(setDoc(doc(carl, "hole_scores/hs_2014_2"), { tournament_id: "wbc_2014", score: 4 })));
await check("member CANNOT withdraw somebody from a finished year", () =>
  assertFails(setDoc(doc(carl, "tournament_players/tp_2014"), { tournament_id: "wbc_2014", status: "WD" })));
await check("member CANNOT edit a card that is already in a finished year", () =>
  assertFails(setDoc(doc(carl, "hole_scores/hs_2014_1"), { score: 9 }, { merge: true })));
await check("member CANNOT bet in a finished year", () =>
  assertFails(setDoc(doc(carl, "skins/ctp_2014"), { tournament_id: "wbc_2014", skin_type: "ctp", hole: 7 })));

// ── …EXCEPT the side bet ledger, which outlives the golf ──
// The one deliberate exception in this file, and the direction matters: bets
// are squared up in the car park after the last card is in, so a ledger that
// went read-only when the tournament finished would go read-only exactly when
// the money starts moving. See canWriteLedger in firestore.rules. The padlock
// still stops it — asserted in the locked block above.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_side_bets/sb_2014"), {
    id: "sb_2014", tournament_id: "wbc_2014", created_by: "uid_aaron",
    player_a: "aaron_j", player_b: "carl_x", amount: 20, settled_by: [],
  });
});
await check("member CAN still mark a side bet paid in a FINISHED year", () =>
  assertSucceeds(setDoc(doc(carl, "wbc_side_bets/sb_2014"), { settled_by: ["carl_x"] }, { merge: true })));
await check("member CAN still log a side bet in a FINISHED year", () =>
  assertSucceeds(setDoc(doc(carl, "wbc_side_bets/sb_2014_new"), { id: "sb_2014_new", tournament_id: "wbc_2014", created_by: "uid_carl", player_a: "carl_x", player_b: "aaron_j", amount: 20, settled_by: [] })));

// Both ends, so a row cannot be carried out of a finished year and edited.
await check("member CANNOT move a row OUT of a finished year", () =>
  assertFails(setDoc(doc(carl, "hole_scores/hs_2014_1"), { tournament_id: "wbc_2026", score: 9 }, { merge: true })));
await check("member CANNOT move a row INTO a finished year", () =>
  assertFails(setDoc(doc(carl, "hole_scores/hs_open_1"), { tournament_id: "wbc_2014", score: 9 }, { merge: true })));

// ── And the direction that must never invert ──
// A tournament being played takes scores from the field, and a correction to a
// finished one is a director's to make.
await check("member CAN still post a score in the year being played", () =>
  assertSucceeds(setDoc(doc(carl, "hole_scores/hs_2026_live"), { tournament_id: "wbc_2026", score: 4 })));
await check("director CAN still correct a finished year", () =>
  assertSucceeds(setDoc(doc(aaron, "hole_scores/hs_2014_fix"), { tournament_id: "wbc_2014", score: 5 })));

// ── Fails OPEN, the same three ways the lock does ──
// Each is a shape the real database holds, and every one of them has to keep
// taking writes: a year that cannot be read is not a year that is over.
await check("no state document at all: still writable", () =>
  assertSucceeds(setDoc(doc(carl, "hole_scores/hs_nostate"), { tournament_id: "wbc_2007", score: 4 })));
await check("state document with no round count: still writable", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "tournament_state/ts_wbc_2008"), {
      tournament_id: "wbc_2008", finalized_rounds: { 1: true, 2: true },
    });
  });
  return assertSucceeds(setDoc(doc(carl, "hole_scores/hs_2008"), { tournament_id: "wbc_2008", score: 4 }));
});
await check("a round still open: still writable", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "tournament_state/ts_wbc_2009"), {
      tournament_id: "wbc_2009", meta: { rounds: 4 }, finalized_rounds: { 1: true, 2: true, 3: true },
    });
  });
  return assertSucceeds(setDoc(doc(carl, "hole_scores/hs_2009"), { tournament_id: "wbc_2009", score: 4 }));
});

// Reading is untouched, the same way freezing is not hiding.
await check("a finished year is still readable by a guest", () =>
  assertSucceeds(getDoc(doc(anon, "hole_scores/hs_2014_1"))));

// ── The sandbox is an edition like any other, to the rules ───────
// `wbc_demo` is special only in the APP — excluded from the year arithmetic,
// from the clone-source list and from bulk locking. firestore.rules knows
// nothing about it and must not: it is still behind the membership gate (a
// tester needs the event password to reach it, which is the whole reason the
// lock exists) and it is still lockable, so a director can freeze it when the
// beta is over without a second mechanism.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_editions/wbc_demo"), { id: "wbc_demo", year: null });
});
await check("member can write in the sandbox", () =>
  assertSucceeds(setDoc(doc(carl, "hole_scores/hs_demo_1"), { tournament_id: "wbc_demo", score: 4 })));
await check("anon still CANNOT write in the sandbox", () =>
  assertFails(setDoc(doc(anon, "hole_scores/hs_demo_2"), { tournament_id: "wbc_demo", score: 4 })));
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_editions/wbc_demo"), { locked: true }, { merge: true });
});
await check("a locked sandbox refuses a member, like any other edition", () =>
  assertFails(setDoc(doc(carl, "hole_scores/hs_demo_3"), { tournament_id: "wbc_demo", score: 4 })));

// ── …with ONE exception: inside it, a member is an administrator ──
// The beta testers and the store reviewers have no crown and cannot be given
// one before they sign in, so the draw and the round setup — director-only
// everywhere else — are theirs inside `wbc_demo`. See canAdminEdition.
//
// What is asserted here is mostly the LIMIT of that grant, because the grant
// itself is the easy half: it must not reach the live tournament, must not
// reach the collections that are not edition-scoped, and must not be
// carryable across by relabelling a row.
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), "wbc_editions/wbc_demo"), { locked: false }, { merge: true });
});
await check("member CAN set a round's course in the sandbox", () =>
  assertSucceeds(setDoc(doc(carl, "tournament_rounds/tr_demo_r1"), { tournament_id: "wbc_demo", round_number: 1, course_id: "c1" })));
await check("member CAN make the draw in the sandbox", () =>
  assertSucceeds(setDoc(doc(carl, "pairings/pair_demo_r1_g1_x"), { tournament_id: "wbc_demo", round_number: 1, group_number: 1 })));
await check("member CAN clear the sandbox's skins, the way Start Fresh does", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "skins/ctp_demo_wipe"), { tournament_id: "wbc_demo", skin_type: "ctp", hole: 7 });
  });
  return assertSucceeds(deleteDoc(doc(carl, "skins/ctp_demo_wipe")));
});

// The live tournament is untouched by any of it.
await check("member still CANNOT set a round's course in a real year", () =>
  assertFails(setDoc(doc(carl, "tournament_rounds/tr_2026_r1"), { tournament_id: "wbc_2026", round_number: 1, course_id: "c1" })));
await check("member still CANNOT make the draw in a real year", () =>
  assertFails(setDoc(doc(carl, "pairings/pair_2026_r1_g1_x"), { tournament_id: "wbc_2026", round_number: 1, group_number: 1 })));

// Both ends, so the grant cannot be carried out of the sandbox on a rewritten
// tournament_id — the same hole the lock's editionOpen() closes.
await check("member CANNOT move a round row OUT of the sandbox", () =>
  assertFails(setDoc(doc(carl, "tournament_rounds/tr_demo_r1"), { tournament_id: "wbc_2026" }, { merge: true })));
await check("member CANNOT move a round row INTO the sandbox", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "tournament_rounds/tr_2026_r2"), { tournament_id: "wbc_2026", round_number: 2 });
  });
  return assertFails(setDoc(doc(carl, "tournament_rounds/tr_2026_r2"), { tournament_id: "wbc_demo" }, { merge: true }));
});

// The collections that are NOT edition-scoped, which is where WBC's version of
// this grant stops and Bourbon Cup's does not: the career registry is one row
// per golfer shared with sixteen years of history, and a course is shared by
// every edition that has ever played it. Neither carries a tournament_id, so
// neither can be inside the sandbox.
await check("member CANNOT edit the career registry, sandbox or not", () =>
  assertFails(setDoc(doc(carl, "players/aaron_j"), { name: "Renamed By A Tester" }, { merge: true })));
await check("member CANNOT add a course, sandbox or not", () =>
  assertFails(setDoc(doc(carl, "courses/c_demo_new"), { name: "Tester National" })));
await check("member CANNOT create or delete a tournament from inside the sandbox", () =>
  assertFails(setDoc(doc(carl, "wbc_editions/wbc_demo"), { name: "mine now" }, { merge: true })));

// ── The escape hatch still opens everything ──────────────────────
// enforcing() is documented above as the ONLY way back from a field that has
// been locked out: publish with `return false` and every phone can write again
// while somebody works out what happened. A lock that survived that lever
// would make it a partial escape — rules off, and a frozen year still refusing
// scores on a tee box, fixable only by a second deploy nobody mid-round would
// think to make.
//
// Checked against a SEPARATE environment holding a patched copy of the rules,
// because enforcing() is a constant in the file and there is no other way to
// ask this question. The patch is asserted to have applied: a silent no-op
// here would leave a test that passes by testing nothing.
{
  const source = fs.readFileSync("firestore.rules", "utf8");
  const patched = source.replace(
    /function enforcing\(\) \{\s*return true;\s*\}/,
    "function enforcing() {\n      return false;\n    }",
  );
  await check("the enforcing() patch actually applied", async () => {
    if (patched === source) throw new Error("enforcing() not found — this block is testing nothing");
  });

  const off = await initializeTestEnvironment({
    projectId: "wbc-rules-test-unenforced",
    firestore: { host: "127.0.0.1", port: 8080, rules: patched },
  });
  await off.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "wbc_editions/wbc_2019"), { id: "wbc_2019", year: 2019, locked: true });
  });
  // Not merely a non-member — an ANONYMOUS caller, which is the state a phone
  // is in when the thing being escaped is the membership check itself.
  const stranded = off.unauthenticatedContext().firestore();
  await check("enforcement OFF: a locked year takes writes again", () =>
    assertSucceeds(setDoc(doc(stranded, "hole_scores/hs_escape"), { tournament_id: "wbc_2019", score: 4 })));
  await off.cleanup();
}

await env.cleanup();
for (const [s, n, e] of results) console.log(s.padEnd(5), n, e ? `— ${e}` : "");
const failed = results.filter(r => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
