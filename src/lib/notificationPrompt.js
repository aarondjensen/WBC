// ══════════════════════════════════════════════════════════════════
//  notificationPrompt — the one time we ask.
// ══════════════════════════════════════════════════════════════════
//
// Push existed and nobody had it on. The switch was two taps down a menu, in
// a sheet called My Account, and a player who never went looking never found
// it — so tee-time and scoring alerts went out to a handful of devices, which
// is the same as not having built them.
//
// So a player is asked ONCE, the first time they are logged in, in a modal
// they have to answer. What this module owns is the decision to show it. The
// modal is components/NotificationPrompt; the actual permission request is
// registerForPush in lib/notifications, and it is fired from the BUTTON in
// that modal, never from here — iOS Safari suppresses a requestPermission()
// that no user gesture asked for, so an "ask on login" that called it
// directly would be silently ignored on exactly the devices that matter.
//
// ── Why our own flag, when the browser already has permission state ──
// Because "default" is not "we have not asked". A player who dismissed the
// browser's own prompt without choosing, or who closed our modal with Not
// now, is still on "default" and would be asked again on every single launch.
// The browser records a decision; this records the CONVERSATION, which is the
// thing that must not repeat.
//
// Per player and per device, like the subscription cache next to it: the
// browser grant is per device, so a player who says yes on their phone and
// then opens the app on a laptop has genuinely not been asked there yet.

// How long after a player lands to raise the card. Long enough that the app
// has painted and they can see what they are being asked about; short enough
// that it is still part of arriving rather than an interruption later on.
export const PUSH_PROMPT_DELAY_MS = 1200;

const PROMPT_PREFIX = "wbc_notif_prompted_";

export const wasPrompted = (playerId) => {
  if (!playerId || typeof localStorage === "undefined") return false;
  try { return localStorage.getItem(PROMPT_PREFIX + playerId) === "1"; } catch { return false; }
};

export const markPrompted = (playerId) => {
  if (!playerId || typeof localStorage === "undefined") return;
  try { localStorage.setItem(PROMPT_PREFIX + playerId, "1"); } catch { /* private mode */ }
};

// Test seam. Nothing in the app clears this; it exists so a test can put a
// device back to "never been asked" without reaching into the key format.
export const clearPrompted = (playerId) => {
  if (!playerId || typeof localStorage === "undefined") return;
  try { localStorage.removeItem(PROMPT_PREFIX + playerId); } catch { /* private mode */ }
};

// ── shouldPromptForPush ─────────────────────────────────────────────
// Pure, and every `false` below is a case where asking would be worse than
// staying quiet:
//
//   guest         nothing to notify them about and no player id to aim at.
//   native shell  neither Capacitor WebView has the Push API. The settings
//                 card says so in as many words; a modal offering a button
//                 that cannot work would be worse than the card.
//   prompted      asked already on this device. Once means once.
//   subscribed    already on. `false` here is a player who deliberately
//                 turned it OFF, and re-asking them is nagging.
//   permission    only "default" is a live question. "granted" is already
//                 answered and App.jsx re-registers silently; "denied" will
//                 not re-prompt no matter what we do — the browser refuses,
//                 and the way back is device settings, which the settings
//                 card explains; "unsupported" covers an iOS Safari tab and
//                 every browser without a service worker.
export const shouldPromptForPush = ({
  playerId, guest = false, native = false,
  permission = "default", subscribed = null, prompted = false,
} = {}) => {
  if (!playerId || guest || native || prompted) return false;
  if (subscribed === true || subscribed === false) return false;
  return permission === "default";
};
