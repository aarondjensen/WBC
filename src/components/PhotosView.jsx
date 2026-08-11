// ══════════════════════════════════════════════════════════════════
//  PhotosView — the tournament's photo library.
// ══════════════════════════════════════════════════════════════════
//
// Seventeen years of the WBC, one edition at a time. What is on screen follows
// the edition selected in Tournaments, so this screen answers "what did 2014
// look like" with the same control that answers "what did 2014 score".
//
// The photos themselves are not hosted by this app and are not in Firestore.
// Firestore holds an index — one document per photo, carrying the two URLs to
// draw it from — and the bytes live on hosts that hard-cap rather than bill.
// src/lib/media.js is where that decision is written down; this file only
// draws what the index points at.
//
// ── Why the grid is thumbnails and squares ────────────────────────
// A gallery is the one screen in this app that can cost real money to render.
// Everything else is numbers; this is megabytes, on a phone, outdoors, on
// whatever signal a golf course has. So the grid loads ONLY the 400px square
// thumbnails (~25KB each) and the 1600px display copy is fetched when a photo
// is actually opened — a screen of twelve photos costs ~300KB instead of ~3MB.
//
// Squares, because a contact sheet of mixed aspect ratios has ragged rows and
// no two photos the same size, which reads as a directory listing rather than
// a set of pictures. The crop is centred and happens once, at upload.
//
// `loading="lazy"` on top of that means scrolling a 500-photo year still only
// pays for the rows that get looked at.
//
// ── Grouping ──────────────────────────────────────────────────────
// Rounds in order, then everything that belongs to the tournament but not to a
// round — the drive up, the dinner, the trophy — under one heading at the end.
// For an imported archive that last group is usually the whole year, so it is
// not styled as leftovers.
import { useEffect, useMemo, useRef, useState } from "react";
import { K, FONT, FS, R, ALPHA, MOTION } from "../theme";
import { Btn, Card, SectionLabel } from "./ui";
import { Popup } from "./Popup";
import { groupByRound, canDelete, validateSource, uploadFailureMessage } from "../lib/media";

// Grid geometry. Three across is what fits a 375px handset with a gap that
// still reads as a gap; the cells stay square via aspectRatio so a slow
// thumbnail does not collapse the row it is in and shove everything below it
// up the screen.
const COLS = 3;
const GAP = 4;

// Clearance under the last row, matching PlayersView: the nav bar's trophy
// sits in a dome rising 24px above the bar, so a grid ending at the bar's edge
// has its final row half-covered.
const BOTTOM_PAD = 44;

// ── Tile ───────────────────────────────────────────────────────────
function Tile({ item, onOpen }) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      onClick={() => onOpen(item)}
      style={{
        padding: 0, border: "none", background: K.inp, cursor: "pointer",
        aspectRatio: "1 / 1", borderRadius: R.sm, overflow: "hidden",
        display: "block", width: "100%",
      }}
    >
      {failed ? (
        // A thumbnail that will not load is a broken link in the index, not a
        // broken app. Say so in the cell rather than showing the browser's own
        // torn-page icon, which on a dark background is unreadable anyway.
        <span style={{ fontSize: FS.small, color: K.t3, fontFamily: FONT }}>—</span>
      ) : (
        <img
          src={item.thumbUrl}
          alt={item.caption || ""}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
    </button>
  );
}

// ── PendingTile ────────────────────────────────────────────────────
// A photo that has been picked but is not in Firestore yet, drawn in the same
// cell shape as a real one so the grid does not jump when it lands.
//
// Two states, because the two halves of an upload feel different and only one
// of them can be measured:
//
//   preparing  decoding and re-encoding, on the phone. No byte count exists
//              for it, so the tile breathes — a slow pulse that says "working"
//              without claiming progress it cannot know.
//   uploading  bytes on the wire, which Firebase reports, so this gets a real
//              determinate bar. On course wifi it is the part worth watching.
//
// A fake progress bar for the first phase would be worse than none: it would
// sit at some invented percentage during the slowest part and then jump.
function PendingTile({ item }) {
  const uploading = item.phase === "uploading";
  return (
    <div style={{
      position: "relative", aspectRatio: "1 / 1", borderRadius: R.sm,
      overflow: "hidden", background: K.inp,
    }}>
      <style>{`@keyframes wbcPhotoPulse { 0%,100% { opacity: 0.34; } 50% { opacity: 0.62; } }`}</style>
      <img
        src={item.preview}
        alt=""
        style={{
          width: "100%", height: "100%", objectFit: "cover", display: "block",
          // The preview sits back so it reads as not-yet-real, and breathes
          // until there is a number worth showing.
          opacity: uploading ? 0.68 : undefined,
          animation: uploading ? "none" : "wbcPhotoPulse 1.4s ease-in-out infinite",
        }}
      />
      {/* The bar rides the bottom edge of the cell rather than floating in the
          middle: at three tiles across the cell is small, and anything centred
          covers the photo it is describing. */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: 3,
        background: `${K.bg}${ALPHA.panel}`,
      }}>
        <div style={{
          width: uploading ? `${Math.round(item.fraction * 100)}%` : "100%",
          height: "100%",
          background: K.acc,
          opacity: uploading ? 1 : 0.45,
          transition: `width ${MOTION} linear`,
        }} />
      </div>
    </div>
  );
}

// ── Lightbox ───────────────────────────────────────────────────────
// The display copy, its caption, and — for whoever is allowed to remove it —
// a delete. Arrow keys and the on-screen chevrons move through the same
// flattened, sorted list the grid is showing, so paging never jumps between
// groups in an order the screen did not display.
function Lightbox({ item, items, onClose, onStep, onDelete, onSave, canRemove, busy, saving }) {
  const idx = items.findIndex(i => i.id === item.id);
  // The key handler is bound once, but `onStep` closes over the current photo
  // and changes every time one is opened. Held in a ref — updated in an effect,
  // never during render — so the listener always calls the live one without
  // being torn down and re-added on each step.
  const stepRef = useRef(onStep);
  useEffect(() => { stepRef.current = onStep; }, [onStep]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") stepRef.current(-1);
      if (e.key === "ArrowRight") stepRef.current(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Popup onClose={onClose} maxWidth={640} padding={0} portal>
      <div style={{ position: "relative", background: "#000", borderRadius: R.xl, overflow: "hidden" }}>
        <img
          src={item.url}
          alt={item.caption || ""}
          style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }}
        />
        {items.length > 1 && (
          <>
            <ChevronButton side="left" onClick={() => onStep(-1)} />
            <ChevronButton side="right" onClick={() => onStep(1)} />
          </>
        )}
      </div>
      <div style={{ padding: 14, fontFamily: FONT }}>
        {item.caption && (
          <div style={{ fontSize: FS.body, color: K.t1, marginBottom: 6 }}>{item.caption}</div>
        )}
        <div style={{ fontSize: FS.small, color: K.t3, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <span>{item.uploadedByName || "—"}</span>
          <span>{items.length ? `${idx + 1} of ${items.length}` : ""}</span>
        </div>
        {/* Save is for everybody, including a guest browsing on the couch —
            it takes nothing and adds nothing to the tournament. Remove sits
            beside it only for the people allowed to, and stays the quieter
            outline so the destructive one is not the bigger target. */}
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <Btn size="sm" block disabled={saving} onClick={() => onSave(item)}>
            {saving ? "Saving…" : "Save photo"}
          </Btn>
          {canRemove && (
            <Btn variant="dangerOutline" size="sm" block disabled={busy} onClick={() => onDelete(item)}>
              {busy ? "Removing…" : "Remove"}
            </Btn>
          )}
        </div>
      </div>
    </Popup>
  );
}

function ChevronButton({ side, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      style={{
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        [side]: 6, width: 38, height: 38, borderRadius: "50%",
        background: `${K.bg}${ALPHA.wash}`, border: `1px solid ${K.bdr}`,
        color: K.t1, fontSize: FS.body, fontWeight: 700, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}

// ── PhotosView ─────────────────────────────────────────────────────
export function PhotosView({
  items, year, uid, isDirector, isGuest, canPost, uploadsBlockedReason = "",
  onUpload, onDelete, notify,
}) {
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // Photos picked but not yet in Firestore, drawn as real tiles from local
  // object URLs. See onFiles.
  const [pending, setPending] = useState([]);
  const fileRef = useRef(null);

  // Object URLs are a memory allocation, not a string — a batch of twenty
  // 4MB photos left unrevoked is 80MB held until the tab dies. onFiles revokes
  // each as it finishes; this catches the case where the screen is closed
  // mid-upload.
  const pendingRef = useRef(pending);
  useEffect(() => { pendingRef.current = pending; }, [pending]);
  useEffect(() => () => pendingRef.current.forEach(p => URL.revokeObjectURL(p.preview)), []);

  const groups = useMemo(() => groupByRound(items), [items]);
  // The flattened list the lightbox pages through — the same order the groups
  // are drawn in, so "next" on screen and "next" in the array are one thing.
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);

  const step = (dir) => {
    if (!open) return;
    const i = flat.findIndex(x => x.id === open.id);
    if (i === -1) return;
    const next = flat[(i + dir + flat.length) % flat.length];
    if (next) setOpen(next);
  };

  const pick = () => fileRef.current?.click();

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])];
    // Reset immediately so picking the same file twice in a row still fires a
    // change event — without this the second attempt looks like nothing
    // happened at all.
    e.target.value = "";
    if (!files.length) return;

    const rejected = files.map(f => validateSource(f)).filter(r => !r.ok);
    if (rejected.length) notify?.(rejected[0].reason);
    const usable = files.filter(f => validateSource(f).ok);
    if (!usable.length) return;

    // A tile per picked photo, on screen before a single byte moves, showing
    // the photo itself from a local object URL. The point is that the grid
    // answers "did it take my photo?" immediately — a spinner in a button
    // leaves somebody staring at an unchanged screen wondering whether the tap
    // registered, and on a tee box the next thing they do is tap again.
    const queued = usable.map((file, i) => ({
      key: `${Date.now()}_${i}_${file.name || i}`,
      file,
      preview: URL.createObjectURL(file),
      fraction: 0,
      phase: "queued",
    }));
    setPending(queued);

    setBusy(true);
    let done = 0;
    const failures = [];
    for (const p of queued) {
      const track = (fraction, phase) =>
        setPending(cur => cur.map(x => (x.key === p.key ? { ...x, fraction, phase } : x)));
      try {
        await onUpload(p.file, track);
        done += 1;
      } catch (err) {
        // Keep going. A batch of twenty that stops dead on the one photo the
        // browser could not decode is worse than nineteen uploaded photos and
        // a count of what did not make it.
        failures.push(err);
        console.error("photo upload failed:", err);
      }
      // Drop the placeholder either way. On success the real tile arrives from
      // Firestore a moment later; on failure the message says what happened.
      URL.revokeObjectURL(p.preview);
      setPending(cur => cur.filter(x => x.key !== p.key));
    }
    setBusy(false);

    if (!failures.length) {
      notify?.(done === 1 ? "Photo added." : `${done} photos added.`);
      return;
    }
    // Say what actually went wrong. This used to report "couldn't be read" for
    // every failure — decode, encode, network, permissions all collapsed into
    // one wrong sentence, on a phone with no console to check. The thrown
    // messages are written to be read by whoever is holding it; a Firebase
    // error code is not, so those get translated.
    notify?.(`${done ? `${done} added. ` : ""}${uploadFailureMessage(failures[0], failures.length)}`);
  };

  // The Storage-saving code is browser-only and pulls in nothing at start —
  // same reasoning as the upload module, loaded when somebody first saves.
  const save = async (item) => {
    setSaving(true);
    try {
      const how = await import("../lib/mediaSave").then(m => m.savePhoto(item));
      if (how === "saved") notify?.("Photo saved.");
      // "shared" says nothing: the OS sheet already gave its own confirmation,
      // and a toast on top of it is the app talking over the platform.
      // "cancelled" says nothing either — the user chose that.
      else if (how === "opened") notify?.("Opened the photo — press and hold it to save.");
      // Nothing opened, so point at the photo that IS on screen rather than at
      // a tab that never appeared.
      else if (how === "blocked") notify?.("Press and hold the photo to save it.");
    } catch (err) {
      console.error("photo save failed:", err);
      notify?.("Couldn't save that photo.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    setBusy(true);
    try {
      await onDelete(item);
      // Step off the deleted photo rather than closing: removing three bad
      // shots in a row should not mean reopening the lightbox three times.
      const i = flat.findIndex(x => x.id === item.id);
      const next = flat[i + 1] || flat[i - 1] || null;
      setOpen(next && next.id !== item.id ? next : null);
      notify?.("Photo removed.");
    } catch (err) {
      console.error("photo delete failed:", err);
      notify?.("Couldn't remove that photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: FONT, paddingBottom: BOTTOM_PAD }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: FS.lead, fontWeight: 700, color: K.t1 }}>Photos</div>
          <div style={{ fontSize: FS.small, color: K.t3 }}>
            {year ? `${year} · ` : ""}{items.length} {items.length === 1 ? "photo" : "photos"}
          </div>
        </div>
        {canPost && (
          <>
            {/* `capture` is deliberately absent: it forces the camera and
                hides the library, and most photos worth adding were taken
                hours ago. Leaving it off gives both on iOS and Android. */}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onFiles}
              style={{ display: "none" }}
            />
            <Btn size="sm" disabled={busy} onClick={pick}>
              {pending.length ? `Adding ${pending.length}…` : busy ? "Adding…" : "Add photos"}
            </Btn>
          </>
        )}
      </div>

      {/* The budget circuit breaker, said out loud. A vanished Add button with
          no explanation reads as a bug, and the first thing somebody does
          about a bug is try again — so the reason is on screen, and it says
          what still works. Browsing is deliberately unaffected. */}
      {uploadsBlockedReason && !isGuest && (
        <Card style={{ marginBottom: 12, borderColor: `${K.warn}${ALPHA.line}` }} pad={12}>
          <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.45 }}>
            {uploadsBlockedReason}
            <br />
            <span style={{ color: K.t3 }}>Browsing and removing photos still work.</span>
          </div>
        </Card>
      )}

      {/* Photos on their way up, above the finished ones. They sit outside the
          round groups on purpose — an in-flight photo has no round tag yet,
          and filing it under a heading it might not end up in would move it
          twice. */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SectionLabel color={K.acc}>
            Adding {pending.length} {pending.length === 1 ? "photo" : "photos"}
          </SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: GAP }}>
            {pending.map(p => <PendingTile key={p.key} item={p} />)}
          </div>
        </div>
      )}

      {!items.length && !pending.length ? (
        <Card style={{ textAlign: "center", padding: 24 }}>
          {/* `canPost` is already false for a guest, so the nudge to add the
              first one only ever reaches somebody who can. */}
          <div style={{ fontSize: FS.body, color: K.t2, marginBottom: canPost ? 10 : 0 }}>
            No photos from this tournament yet.{canPost ? " Add the first one." : ""}
          </div>
        </Card>
      ) : (
        groups.map(group => (
          <div key={group.round ?? "loose"} style={{ marginBottom: 18 }}>
            <SectionLabel>{group.label}</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: GAP }}>
              {group.items.map(item => (
                <Tile key={item.id} item={item} onOpen={setOpen} />
              ))}
            </div>
          </div>
        ))
      )}

      {open && (
        <Lightbox
          item={open}
          items={flat}
          busy={busy}
          saving={saving}
          canRemove={canDelete(open, { uid, isDirector })}
          onStep={step}
          onDelete={remove}
          onSave={save}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

export default PhotosView;
