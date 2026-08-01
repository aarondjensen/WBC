// ══════════════════════════════════════════════════════════════════
//  Popup + ConfirmModal — shared modal chrome.
// ══════════════════════════════════════════════════════════════════
//
// Popup is WBC's existing modal, moved out of App.jsx unchanged in behavior
// and given one new option: `portal`.
//
// Why portal matters
// ──────────────────
// `position: fixed` is viewport-relative only while no ancestor has a
// transform, filter or backdrop-filter — any of those makes that ancestor the
// containing block and traps the modal inside it, clipped and mis-positioned.
// The admin player rows and several animated panels use transforms, so a
// modal raised from inside one of them renders in the wrong place. Portaling
// to <body> puts it back in the root stacking context.
//
// Popup defaults to inline (portal={false}) so every existing caller in
// App.jsx behaves exactly as before. ConfirmModal always portals — a confirm
// is by definition the topmost layer, and it is routinely raised from inside
// another popup.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { K, SCRIM } from "../theme";
import { Btn } from "./ui";

// Backdrop dismisses by default; opt out with dismissOnBackdrop={false} for
// destructive/blocking modals. Card height caps at (--app-height - 90px) so
// long content scrolls without pushing the modal off-screen on iOS PWA.
export function Popup({
  children, onClose, maxWidth = 420, background, borderColor,
  padding = 14, dismissOnBackdrop = true, zIndex = 300, overlayPadding = 12,
  portal = false,
}) {
  const node = (
    <div
      onClick={dismissOnBackdrop ? onClose : undefined}
      // Marks this subtree as a modal for usePullToRefresh, which bails when
      // the walk up from a touch target crosses it. That is what stops the
      // page's pull-to-refresh fighting a scrolling modal, without the app
      // having to keep a "is any popup open" ref in sync by hand.
      data-popup="1"
      style={{ position: "fixed", inset: 0, background: SCRIM, zIndex, display: "flex", alignItems: "center", justifyContent: "center", padding: overlayPadding }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: background || K.bg, border: `1px solid ${borderColor || K.bdr}`, borderRadius: 16, width: "100%", maxWidth, maxHeight: "calc(var(--app-height, 100dvh) - 90px)", overflowY: "auto", padding }}
      >
        {children}
      </div>
    </div>
  );

  return portal && typeof document !== "undefined"
    ? createPortal(node, document.body)
    : node;
}

// ──────────────────────────────────────────────────────────────────
//  ConfirmModal — canonical title / message / Cancel / Confirm modal.
//
//  Two API styles, both supported:
//    Nullable-state (what useConfirm produces):
//      <ConfirmModal modal={confirmModal} />
//    Inline props:
//      <ConfirmModal title="…" message="…" onConfirm={..} onCancel={..}
//        destructive />
//
//  Renders nothing when neither title nor message is present (or when `modal`
//  is explicitly null). `destructive` renders a red confirm button; `alert`
//  drops the Cancel button for informational notices with nothing to decide.
// ──────────────────────────────────────────────────────────────────
export function ConfirmModal(props) {
  // Prefer an explicit `modal` prop if present (even when null — that's the
  // nullable-state gate); otherwise read inline props.
  const m = "modal" in props ? props.modal : props;
  if (!m) return null;
  if (!m.title && !m.message) return null;
  return <ConfirmModalInner m={m} />;
}

// Split so the mount effect below can use hooks past ConfirmModal's
// nullable-state early returns.
function ConfirmModalInner({ m }) {
  // Drop the on-screen keyboard the moment a confirm opens. A confirm is
  // routinely raised while a text field still has focus (typing a handicap,
  // then tapping Save) and iOS does NOT shrink the layout viewport for the
  // keyboard — so this centered card could sit hidden under the keys while
  // the popup beneath it stays visible, reading as "the confirm is behind".
  useEffect(() => {
    const el = document.activeElement;
    if (el && el !== document.body && typeof el.blur === "function") el.blur();
  }, []);

  const isDanger = m.destructive === true;
  const handleCancel = m.onCancel || (() => {});

  return (
    <Popup onClose={handleCancel} maxWidth={340} zIndex={4000} padding={20} portal>
      {m.eyebrow && (
        <div style={{ fontSize: 10, fontWeight: 700, color: K.acc, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
          {m.eyebrow}
        </div>
      )}
      <div style={{ fontSize: 14, fontWeight: 700, color: K.t1, marginBottom: m.message ? 6 : 16 }}>
        {m.title}
      </div>
      {m.message && (
        <div style={{ fontSize: 13, color: K.t2, lineHeight: 1.5, marginBottom: 16, whiteSpace: "pre-line" }}>
          {m.message}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {!m.alert && (
          <Btn variant="secondary" onClick={handleCancel} style={{ flex: 1, color: K.t2 }}>
            {m.cancelLabel || "Cancel"}
          </Btn>
        )}
        {/* Which ink a filled button takes is decided by the fill — the red is
            dark enough for white, the teal is not — and Btn owns that pairing
            now, so `danger` carries its own ink rather than the call site
            remembering to hand it one. */}
        <Btn variant={isDanger ? "danger" : "primary"} onClick={m.onConfirm} style={{ flex: 1 }}>
          {m.confirmLabel || (m.alert ? "OK" : "Confirm")}
        </Btn>
      </div>
    </Popup>
  );
}

