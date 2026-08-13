// ══════════════════════════════════════════════════════════════════
//  db — the Firestore data layer.
// ══════════════════════════════════════════════════════════════════
//
// Every read and write in the app goes through this object. It lived at the
// top of App.jsx, which was fine while App.jsx was the app; it is not fine now
// that the screens are their own files and each of them needs it.
//
// Three things worth knowing before using it.
//
// ── Writes are TRACKED, not awaited for correctness ──
// `writes` counts what has been handed over and not yet acknowledged, and the
// sync banner reads it. This matters more than it sounds: a Firestore write
// with no signal does not fail — it does not resolve either. It sits in a
// queue until the phone has a bar again. So `await db.upsert(…)` is not a
// guarantee the write landed, and a `catch` around it only ever fires on a
// rules denial. See lib/connection.
//
// ── Everything merges ──
// `upsert` is setDoc with merge:true, so a partial write updates the named
// fields and leaves the rest. That is what makes `db.upsert(col, { id, one:
// field })` safe, and it is also why an array is used wherever a wholesale
// replacement is meant — a MAP would merge key by key and keep a value the
// caller intended to delete. See the note on market lots in lib/market.
//
// ── Batches, because listeners publish per commit ──
// upsertMany / replaceMany exist because a loop of single writes is N commits,
// and every phone in the field repaints on each one — a re-drawn round would
// visibly fill in a group at a time. Batched, it lands in one frame. 490 per
// batch: Firestore's limit is 500 and the margin is for the deletes that ride
// along in replaceMany.

import {
  collection, query, where, getDocs, getDocsFromCache, doc, setDoc, deleteDoc,
  writeBatch, onSnapshot,
} from "firebase/firestore";
import { _db, _auth } from "../firebase";
import { createWriteTracker } from "./connection";
import { writesBlocked } from "./guestMode";

// ── Writes handed over but not yet acknowledged ──
// Every write below is registered here on its way out. See lib/connection for
// why this is the only honest way to know whether a phone is really talking to
// the server: a Firestore write with no signal does not fail, it simply never
// resolves, so a queue that is not draining is the symptom and there is no
// error anywhere to catch.
export const writes = createWriteTracker();

// ── The guest tour writes nothing ──────────────────────────────────
// Somebody who came in through the Guest button has no account, so every write
// below would be refused by firestore.rules anyway. What this stops is the
// refusal being INVISIBLE and slow: a write handed to Firestore by a client
// with no auth does not come back as an error a tester can see, it goes into
// the offline queue and sits there — and `writes` above counts exactly that,
// so the sync banner would tell somebody tapping around that their phone had
// lost the network.
//
// So a guest's writes stop here, at the one door they all go through. Their
// taps still land in local React state, which is what makes the tour feel like
// the app rather than a screenshot; nothing is handed to the server.
//
// The condition is deliberately an AND with "nobody is signed in" — see
// lib/guestMode for why a latch that can swallow a real player's scores is the
// most dangerous thing this file could contain.
//
// Returns the same shape a successful write returns, because a caller that
// checked would be checking whether the server took it, and no caller should
// learn "you are a guest" from a write result.
const refuseGuestWrite = () => writesBlocked(!!_auth?.currentUser);

// ── db: Firestore data layer ──
export const db = {
  _q: (col, filters = []) => {
    const ref = collection(_db, col);
    return filters.length ? query(ref, ...filters.map(f => where(f.field, f.op, f.value))) : ref;
  },
  get: async (col, filters = []) => {
    try {
      const snap = await getDocs(db._q(col, filters));
      return snap.docs.map(d => d.data());
    } catch(e) { console.error("db.get error:", col, e); return null; }
  },
  // ── This phone's own copy, with no round trip at all ──
  // firebase.js goes to some trouble to enable a persistent cache, and the
  // SUBSCRIBED collections get the benefit for free: a listener answers from
  // disk the moment it attaches. The four READ-ONCE collections did not —
  // getDocs asks the server — so a relaunch spent two chained round trips
  // fetching the rounds, the courses and their tee boxes before a leaderboard
  // had a par to compare anything to, every time, on data that had not
  // changed since the last launch.
  //
  // Reading them from the cache first draws the board off the stored copy and
  // lets the server's answer land on top of it. It is billed nothing: a cache
  // read never reaches Firestore.
  //
  // Null when nothing is stored — a fresh install, a cleared browser, a
  // collection this device has never queried. "Nothing stored" and "nothing
  // there" are different answers and only the second one is worth painting,
  // so a caller that would act on emptiness is handed neither.
  getCached: async (col, filters = []) => {
    try {
      const snap = await getDocsFromCache(db._q(col, filters));
      return snap.empty ? null : snap.docs.map(d => d.data());
    } catch { return null; }  // no cache, cache disabled, or nothing stored
  },
  upsert: async (col, data) => {
    if (!data.id) { console.error("db.upsert: missing id", col, data); return null; }
    if (refuseGuestWrite()) return data;
    try {
      await writes.track(setDoc(doc(_db, col, String(data.id)), data, { merge: true }), col);
      return data;
    } catch(e) { console.error("db.upsert error:", col, e); return null; }
  },
  // Write many rows as ONE commit. A `for (const r of rows) await upsert(r)`
  // loop is not just N round trips — every commit fires the collection's
  // onSnapshot, and those handlers rebuild their state from the SERVER copy.
  // So a bulk change lands as N repaints, each showing the rows written so
  // far and the rest still on their old values: the change appears to crawl
  // down the list. One batch is one snapshot, so the whole set flips at once.
  upsertMany: async (col, rows) => {
    const valid = (rows || []).filter(r => r && r.id);
    if (!valid.length) return true;
    if (refuseGuestWrite()) return true;
    try {
      // 500 is Firestore's hard cap on writes per batch; 490 leaves room.
      for (let i = 0; i < valid.length; i += 490) {
        const batch = writeBatch(_db);
        valid.slice(i, i + 490).forEach(r => batch.set(doc(_db, col, String(r.id)), r, { merge: true }));
        await writes.track(batch.commit(), col);
      }
      return true;
    } catch(e) { console.error("db.upsertMany error:", col, e); return null; }
  },
  // Write a set of rows and delete another set in the SAME commit. Doing it as
  // a delete followed by writes means the collection is briefly missing
  // everything the delete took, and every listener sees that gap and rebuilds
  // its state from it.
  replaceMany: async (col, rows, deleteIds = []) => {
    const valid = (rows || []).filter(r => r && r.id);
    const gone = (deleteIds || []).filter(Boolean);
    if (!valid.length && !gone.length) return true;
    if (refuseGuestWrite()) return true;
    try {
      // 500 writes per batch is Firestore's cap; 490 leaves room. Deletes ride
      // in the first batch so the replacement lands with them.
      const ops = [
        ...gone.map(id => ({ kind: "del", id })),
        ...valid.map(r => ({ kind: "set", row: r })),
      ];
      for (let i = 0; i < ops.length; i += 490) {
        const batch = writeBatch(_db);
        ops.slice(i, i + 490).forEach(op => {
          if (op.kind === "del") batch.delete(doc(_db, col, String(op.id)));
          else batch.set(doc(_db, col, String(op.row.id)), op.row, { merge: true });
        });
        await writes.track(batch.commit(), col);
      }
      return true;
    } catch(e) { console.error("db.replaceMany error:", col, e); return null; }
  },
  delete: async (col, filters = []) => {
    if (refuseGuestWrite()) return true;
    try {
      const snap = await getDocs(db._q(col, filters));
      if (snap.empty) return true;
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 490) {
        const batch = writeBatch(_db);
        docs.slice(i, i + 490).forEach(d => batch.delete(d.ref));
        await writes.track(batch.commit(), col);
      }
      return true;
    } catch(e) { console.error("db.delete error:", col, e); return null; }
  },
  deleteDoc: async (col, id) => {
    if (refuseGuestWrite()) return true;
    try { await writes.track(deleteDoc(doc(_db, col, String(id))), col); return true; }
    catch(e) { console.error("db.deleteDoc error:", col, e); return null; }
  },
  // `onError` is optional and exists for the one caller that has to know the
  // difference between "not answered yet" and "answered no": the roster
  // listener, which owns `storageLoaded`. Without it a refused read would
  // leave the leaderboard in its pre-load blank state forever, waiting for a
  // snapshot that is never coming.
  // The third callback argument is the snapshot's METADATA, and `fromCache` on
  // it is load-bearing for exactly one caller. A listener answers from the
  // on-disk cache first and the server a moment later, so an EMPTY first
  // snapshot means "this phone has not been told yet", not "there is nothing".
  // Anything that would act on emptiness has to be able to tell those apart —
  // see the roster bootstrap, which writes a whole roster on that decision.
  subscribe: (col, filters = [], callback, onError) => {
    try {
      return onSnapshot(
        db._q(col, filters),
        snap => callback(snap.docs.map(d => d.data()), snap.docChanges(), snap.metadata),
        err => { console.error("db.subscribe error:", col, err); if (onError) onError(err); }
      );
    } catch(e) {
      console.error("db.subscribe setup error:", col, e);
      if (onError) onError(e);
      return () => {};
    }
  },
};

export default db;
