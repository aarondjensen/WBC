// ══════════════════════════════════════════════════════════════════
//  accounts — the door in front of the tournament.
// ══════════════════════════════════════════════════════════════════
//
// Ported from The Bourbon Cup (src/lib/accounts.js), adapted to WBC's
// collections. The shape of the idea is unchanged, and the reason for it is
// worth restating because it is the part that looks redundant and is not:
//
// Signing in with Google or Apple (src/firebase.js) proves you own a Google
// or Apple account. It proves nothing else. Anybody can make a Google
// account, and this app's Firebase config ships in the bundle by design —
// so "signed in" on its own would let any stranger who viewed source, or
// skipped the app and talked to Firestore directly, rewrite sixteen years
// of tournament history.
//
// So between signing in and touching anything, an account has to present
// the tournament password and be issued a MEMBERSHIP: a wbc_accounts/{uid}
// document. The password is checked by the SECURITY RULES, not here. It
// lives in wbc_secrets/access, which no client may read — rules `get()` is
// not subject to read rules, which is exactly what lets them compare
// against a secret they never serve — and the rules gate every write in the
// project on the membership document existing.
//
// That is the difference between a password and a doorman. A client-side
// check is a doorman: it holds until somebody opens devtools. This holds
// against reading the bundle, disabling the JavaScript, or never loading
// the app at all.
//
// ── Three steps, each seen once ───────────────────────────────────
//   1. Sign in with Google or Apple   (src/firebase.js)
//   2. Enter the tournament password  (this file — joinWithCode)
//   3. Claim your name off the roster (App.jsx → wbc_users)
//
// Steps 2 and 3 are separate documents on purpose. The door has to come
// before the claim — the rules gate the claim write on membership — and a
// membership exists for accounts that have not claimed a name yet (a
// director bootstrapping, somebody who signed in on the drive up).
//
// ── Why a raw Firestore SDK, when App.jsx has a `db` helper ────────
// Because that helper catches every error and returns null, which is the
// one thing this module cannot tolerate. Here a permission-denied means
// "wrong password" and a dropped connection means "ask again later", and
// collapsing both into null would put the password screen in front of
// somebody who is already through it, on the first tee, with no signal.
import { doc, getDoc, setDoc, collection, onSnapshot } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { _app, _db } from "../firebase";

// One membership document per account, keyed BY the uid so the rules can
// check `exists(.../wbc_accounts/$(request.auth.uid))` in one hop.
export const ACCOUNTS_COL = "wbc_accounts";
// The password itself. Read-denied to every client bar a director; only the
// rules ever compare against it.
export const SECRETS_COL = "wbc_secrets";
export const ACCESS_DOC = "access";

// ── Is this account through the door, and who is it? ────────────────
// Returns the membership document, or null for "signed in, not a member".
// Errors are deliberately NOT caught: a failed read is not the same answer
// as "no membership". The caller (App.jsx) retries before deciding.
//
// The document also carries `is_director`, which is the only thing in the
// project that grants Admin. Nobody can set it on themselves — the rules
// reject a create that carries it, and an update to your own — so it comes
// either from another director or from the Firebase console, which is where
// the first one has to come from. The app reads it here rather than from a
// hardcoded list of player ids, so the Admin tab can never appear for
// somebody whose writes the rules would refuse.
export async function readMembership(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(_db, ACCOUNTS_COL, String(uid)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export const isDirectorAccount = (membership) => membership?.is_director === true;

// Is this account through the door? `answer` is a membership read paired with
// the uid it was made FOR — {uid, doc} — and `uid` is the account signed in
// right now. Returns true (through), false (a definitive no) or undefined
// (unknown: no answer yet, or the answer is about a different account).
//
// The pairing is the whole point. Auth resolving changes the signed-in uid one
// render before a new read can start, so for that render the previous answer
// is stale. Read as a plain document, the stale value for "nobody is signed
// in" — null — is shaped exactly like "the read came back no", and the app
// showed the event-password screen to players who were already through it,
// for one frame, on every refresh. Comparing the uids makes that window
// undefined, which is what callers already treat as "still in flight".
export const resolveMember = (answer, uid) =>
  (answer && answer.uid === (uid ?? null)) ? !!answer.doc : undefined;

// Deployed rules that predate this build have no wbc_accounts rule at all,
// so they refuse every request against it — including the read below,
// before any password is compared. Reported as a wrong password, that sends
// a tournament director hunting for a typo in a code that was never the
// problem. It is worth its own message.
const STALE_RULES =
  "The database rules are out of date, so this can't be checked yet — nothing to do with the password. " +
  "Tell a tournament director to re-publish firestore.rules.";

// ── Presenting the password ─────────────────────────────────────────
// The code travels as a field on the membership document, because that is
// the only channel the rules can see — they compare it against the secret
// and reject the write outright if it differs. It stays on the document
// afterwards, readable by this account alone, which is the person who typed
// it in the first place.
export async function joinWithCode(authUser, code) {
  if (!authUser?.uid) return { ok: false, error: "Not signed in." };
  try {
    // Already through? Say so and write nothing. Not just an optimisation:
    // the rules deny UPDATE on a membership document, so a second create by
    // somebody who already has one would come back permission-denied and be
    // reported below as a wrong password. It is also the recovery path when
    // the startup check could not reach the network and fell through to this
    // screen anyway.
    //
    // A DENIAL here is never about the code — this read is allowed to
    // anybody asking after their own membership — so it is caught
    // separately rather than falling into the catch below.
    try {
      if (await readMembership(authUser.uid)) return { ok: true };
    } catch (e) {
      if (e?.code === "permission-denied") return { ok: false, error: STALE_RULES };
      throw e;
    }
    await setDoc(doc(_db, ACCOUNTS_COL, authUser.uid), {
      id: authUser.uid,
      uid: authUser.uid,
      code: (code || "").trim(),
      email: authUser.email || null,
      joined_at: new Date().toISOString(),
    });
    return { ok: true };
  } catch (e) {
    if (e?.code === "permission-denied") {
      return { ok: false, error: "That password isn't right." };
    }
    return { ok: false, error: "Could not check that — check signal and try again." };
  }
}

// ── Appointing a director ───────────────────────────────────────────
// Writes the one field the rules honour, on somebody else's membership.
// Refused unless you are a director already, and refused outright on your
// own document — nobody appoints themselves, and nobody can step down from
// inside the app, which is what keeps the set of directors from being
// emptied by mistake.
//
// The target must have signed in AND been through the password screen: the
// flag lives on a membership document, and there is nothing to flag until
// one exists.
export async function setDirector(uid, on) {
  if (!uid) return { ok: false, error: "That player hasn't signed in yet." };
  try {
    await setDoc(doc(_db, ACCOUNTS_COL, String(uid)), { is_director: !!on }, { merge: true });
    return { ok: true };
  } catch (e) {
    if (e?.code === "permission-denied") {
      return { ok: false, error: "Only a director can do that, and not to their own account." };
    }
    return { ok: false, error: "Could not save that — check signal and try again." };
  }
}

// Every membership, for a director's Admin screen — so the crown on screen
// is drawn from the same flag the rules check, rather than from a list in
// the bundle that can disagree with it. A non-director cannot read this;
// the rules allow the listing only for a director.
export function subscribeMemberships(cb) {
  try {
    return onSnapshot(
      collection(_db, ACCOUNTS_COL),
      snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => { console.warn("[accounts] membership listing refused:", err?.code || err?.message); cb([]); },
    );
  } catch (e) {
    console.warn("[accounts] membership subscribe failed:", e?.message || e);
    return () => {};
  }
}

// A director can always see their own membership, so an empty list means
// the read was refused, not that nobody has signed in. In practice that is
// one thing: rules older than this build, with no clause letting a director
// list the collection.
export const accountsUnreadable = (memberships) => (memberships || []).length === 0;

// ── Reading the password back ───────────────────────────────────────
// Directors only, enforced by the rules — a stranger who could read this
// would not need to be told the password at all.
//
// Three answers, and the third is why this does not just return a string.
// "No password set" and "I was not allowed to look" are the same absence to
// a caller that swallows the error, and they are opposite instructions to
// the director reading the screen: one says the door is open, the other says
// the rules need re-publishing. This is also the screen somebody reaches for
// while debugging a password that will not work, which is exactly the wrong
// moment to be told a comforting lie.
export async function readAccessCode() {
  try {
    const snap = await getDoc(doc(_db, SECRETS_COL, ACCESS_DOC));
    return { ok: true, code: (snap.exists() ? snap.data()?.code : null) || null };
  } catch (e) {
    if (e?.code === "permission-denied") {
      return { ok: false, error: "Can't read it — the rules deployed to Firebase are older than this app. Re-publish firestore.rules." };
    }
    return { ok: false, error: "Couldn't read it — check signal and try again." };
  }
}

// ── Setting the password ────────────────────────────────────────────
// Saving an empty value removes the requirement — the rules treat a blank
// or missing code as an open door, which is also what makes the very first
// setup possible before any code exists.
export async function setAccessCode(code) {
  try {
    await setDoc(doc(_db, SECRETS_COL, ACCESS_DOC), { id: ACCESS_DOC, code: (code || "").trim() || null });
    return { ok: true };
  } catch (e) {
    if (e?.code === "permission-denied") {
      return { ok: false, error: "Only a director can change the password." };
    }
    return { ok: false, error: "Could not save the password." };
  }
}

// ── Giving up a membership ──────────────────────────────────────────
// Called by the account-deletion flow. The rules deny `delete` on
// wbc_accounts to every client, deliberately — a client that could delete
// its own membership is one loosened rule away from deleting somebody
// else's — so this goes through a callable that acts on the VERIFIED auth
// context and takes no uid argument. See functions/index.js.
//
// Best-effort by construction: a membership left behind when the Auth user
// is gone grants nothing (nothing can sign in as that uid again), so
// refusing to delete somebody's account because a callable was not deployed
// is the worse failure of the two.
export async function releaseMembership() {
  try {
    await httpsCallable(getFunctions(_app), "deleteMembership")();
    return { ok: true };
  } catch (e) {
    // Deployed by hand, like the rules. Until it is, this is the failure —
    // and it must not stop the deletion.
    console.warn("[accounts] membership release skipped:", e?.code || e?.message || e);
    return { ok: false, reason: e?.code || "failed" };
  }
}

// ── membershipForPlayer ─────────────────────────────────────────────
// Which signed-in account, if any, has claimed a given player.
//
// Bourbon Cup answers this from a field on the player document
// (`player.auth_uid`). WBC stores the binding the other way round — the
// `wbc_users` collection maps uid → player_id, mirrored in memory as the
// `claims` map — so the lookup is a reverse scan of that map rather than a
// field read. Same question, opposite index.
//
// Matched on the membership's document id first, then a `uid` field: both are
// the same value for a membership the app created, but a membership typed
// into the Firebase console by hand — which is how the FIRST director is
// made — may only have the id.
export const membershipForPlayer = (memberships, claims, playerId) => {
  if (!playerId) return null;
  return (memberships || []).find(m => {
    const claimed = claims?.[m.id] ?? claims?.[m.uid];
    return claimed === playerId;
  }) || null;
};

export const playerIsDirector = (memberships, claims, playerId) =>
  membershipForPlayer(memberships, claims, playerId)?.is_director === true;
