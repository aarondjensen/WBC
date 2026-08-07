// ══════════════════════════════════════════════════════════════════
//  mediaSave — getting a photo out of the app and onto a phone.
// ══════════════════════════════════════════════════════════════════
//
// Long-pressing a photo already offers "Save to Photos" on iOS and "Download
// image" on Android — nothing in this app suppresses the callout menu. This
// exists because a button is discoverable and a long-press is folklore, and
// because on iOS the share sheet does the job in one tap rather than three.
//
// Three routes, tried in order, each a fallback for the one before:
//
//   1. Share sheet with the file attached. iOS shows "Save Image", AirDrop,
//      Messages — the thing somebody standing on a tee actually wants.
//   2. A download link. Desktop and Android; drops the file in Downloads.
//   3. Open the photo in a new tab. Saves nothing by itself, but puts the
//      full-size image somewhere the platform's own long-press works.
//
// ── Why route 3 has to exist ──────────────────────────────────────
// Routes 1 and 2 both need the BYTES, and fetching bytes cross-origin needs
// CORS configured on the storage bucket. Loading an <img> does not, which is
// why the gallery works without it. So on a bucket with no CORS config the
// fetch fails, and the honest response is to hand the photo to the browser
// rather than show an error for something the user can still do themselves.
//
// The `download` attribute is deliberately not used on the raw remote URL: it
// is ignored cross-origin, so it silently degrades to a navigation. Route 2
// downloads a local object URL, where it is honoured.
import { downloadFilename } from "./media";

// Both halves matter: `share` alone exists on browsers that cannot take files,
// and calling it with files there throws rather than degrading.
const canShareFiles = (files) => {
  try {
    return typeof navigator !== "undefined"
      && typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare({ files });
  } catch {
    return false;
  }
};

const openInNewTab = (url) => {
  // noopener because this is a link to a bucket URL, and a tab opened without
  // it gets a handle back to this one.
  const win = window.open(url, "_blank", "noopener,noreferrer");
  // window.open returns null when a popup blocker refuses it, and browsers
  // also refuse some schemes outright. Saying "opened the photo" when nothing
  // opened sends somebody looking for a tab that does not exist — so the two
  // outcomes are reported separately, and the blocked one points at the photo
  // already on screen, which is the thing they can actually act on.
  return win ? "opened" : "blocked";
};

// Returns what actually happened, so the caller can say something true:
//   "shared"    handed to the OS share sheet
//   "saved"     downloaded as a file
//   "opened"    fell back to a new tab; the user saves it themselves
//   "cancelled" the share sheet was dismissed — say nothing at all
export const savePhoto = async (item) => {
  const url = item?.url;
  if (!url) throw new Error("That photo has no file to save.");
  const name = downloadFilename(item);

  let blob;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    blob = await res.blob();
  } catch {
    // Almost always CORS on the bucket. Nothing to tell the user about — the
    // new tab gets them to the same place.
    return openInNewTab(url);
  }

  const file = new File([blob], name, { type: blob.type || "image/jpeg" });

  if (canShareFiles([file])) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      // AbortError is the user closing the sheet — a deliberate no, not a
      // failure, and falling through to a download would override their
      // decision by saving the photo anyway.
      if (e?.name === "AbortError") return "cancelled";
      // NotAllowedError means the tap's activation expired while the photo
      // downloaded. The file is in hand, so save it the other way.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return "saved";
  } finally {
    // Revoked on the next tick rather than immediately: Safari has cancelled
    // an in-flight download when the object URL disappeared in the same frame
    // as the click.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
  }
};
