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
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { K, FS, R, SCRIM } from "../theme";
import { Btn } from "./ui";

// ── One Popup API across the three apps ──
// This used to spell its props its own way — `dismissOnBackdrop` where Bourbon
// Cup and MnQ say `noBackdropClose`, `overlayPadding` where they say
// `outerPadding`, and `background`/`borderColor` where they pass `innerStyle`.
// Three modals with the same job and three vocabularies meant a fix written
// against one could not be pasted into the others, which is most of how they
// drifted in the first place. WBC was the odd one out, so WBC moved.
//
// zIndex takes a number OR one of the two names in Z_MAP. WBC's call sites use
// real numbers on a deliberate ladder (a confirm at 4000 over an admin sheet at
// 3000 over a scorecard at 350), so the numbers stay — the names are for new
// code that just wants "above the page" or "above everything".
const Z_MAP = { content: 500, modal: 900 };

// ── The rectangle that is actually visible ──────────────────────────
// Ported from Bourbon Cup. iOS does NOT shrink the CSS viewport units
// (vh/dvh/svh) for the on-screen keyboard, so a full-viewport overlay renders
// its card — and the text field in it — behind the keys. visualViewport is the
// only thing that knows where the visible strip is, so an overlay that has to
// hold an input is sized to exactly that.
//
// Only runs when `enabled`, which is the `viewportFit` opt-in: every popup
// that holds no input keeps the classic inset:0 overlay and pays nothing, not
// even the listeners.
function useViewportRect(enabled) {
  const read = () => {
    if (typeof window === "undefined") return { top: 0, left: 0, width: 0, height: 0 };
    const v = window.visualViewport;
    if (v) return { top: v.offsetTop, left: v.offsetLeft, width: v.width, height: v.height };
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  };
  const [rect, setRect] = useState(read);
  useEffect(() => {
    if (!enabled) return;
    const v = window.visualViewport;
    const update = () => setRect(read());
    update();
    if (v) { v.addEventListener("resize", update); v.addEventListener("scroll", update); }
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      if (v) { v.removeEventListener("resize", update); v.removeEventListener("scroll", update); }
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [enabled]);
  return rect;
}

export function Popup({
  children,
  onClose,
  maxWidth = 420,
  zIndex = 300,
  showClose = false,
  noBackdropClose = false,
  noEscClose = false,
  padding = 14,
  outerPadding = 12,
  innerStyle,
  portal = false,
  // ── Opt-ins, default off → byte-identical to the classic modal ──
  //  viewportFit — size the overlay to the visual viewport rather than the
  //                layout one, so a keyboard cannot cover the card. For a
  //                popup with a text field in it.
  //  align       — cross-axis placement: "center" (default) or "start". A tall
  //                form belongs at the top of the visible strip, not centred
  //                in what is left of it.
  viewportFit = false,
  align = "center",
}) {
  const z = typeof zIndex === "number" ? zIndex : (Z_MAP[zIndex] || 500);
  const rect = useViewportRect(viewportFit);

  // ESC closes unless disabled. Only registers when there is an onClose to call.
  //
  // `noBackdropClose` implies it. A modal that refuses a stray click outside
  // itself is a blocking or destructive one — the withdrawal confirm, the
  // scorecard sheet, a prompt that has to be answered — and every reason it
  // refuses the click applies to a stray keypress. Both flags exist because the
  // reverse is not true: a popup can want ESC off while still dismissing on the
  // backdrop. All three apps share this rule.
  const escCloses = !noEscClose && !noBackdropClose;
  useEffect(() => {
    if (!onClose || !escCloses) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, escCloses]);

  const handleBackdrop = () => {
    if (!noBackdropClose && onClose) onClose();
  };

  const node = (
    <div
      onClick={handleBackdrop}
      // Marks this subtree as a modal for usePullToRefresh, which bails when
      // the walk up from a touch target crosses it. That is what stops the
      // page's pull-to-refresh fighting a scrolling modal, without the app
      // having to keep a "is any popup open" ref in sync by hand.
      data-popup="1"
      style={{
        position: "fixed",
        // viewportFit pins the overlay to the live visible rect (above the
        // keyboard); otherwise the classic full-viewport overlay.
        ...(viewportFit
          ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
          : { inset: 0 }),
        background: SCRIM, zIndex: z, display: "flex",
        alignItems: align === "start" ? "flex-start" : "center",
        justifyContent: "center", padding: outerPadding, boxSizing: "border-box",
        overflowY: viewportFit ? "hidden" : "auto", overscrollBehavior: "contain",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: K.bg,
          border: `1px solid ${K.bdr}`,
          borderRadius: R.xl,
          width: "100%",
          maxWidth,
          // Caps at (--app-height - 90px) so long content scrolls instead of
          // pushing the modal off-screen in the iOS PWA.
          // viewportFit cards fill the visible rect and scroll inside it.
          maxHeight: viewportFit ? "100%" : "calc(var(--app-height, 100dvh) - 90px)",
          // ── The card is a FRAME. The scroller is inside it. ──
          // The card used to be the scroller. That works only for as long as
          // nothing is positioned against it: the moment a close button is
          // added, an absolute box inside a scrolling container scrolls away
          // with the content and leaves a tall popup with no way to shut it.
          // Both other apps hit that and fixed it this way; taking the shape
          // now means the first showClose here is safe rather than a bug.
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          ...innerStyle,
        }}
      >
        {showClose && onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute", top: 8, right: 8, width: 32, height: 32,
              borderRadius: R.md,
              // Opaque: content scrolls underneath this rather than carrying it
              // away, and a transparent button lets rows slide through the glyph.
              background: K.bg,
              border: "none", color: K.t3, fontSize: FS.lead, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", zIndex: 2, lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
        {/* Scrolling happens HERE, not on the card. position:relative + zIndex:0
            makes this its own stacking context, so content that sticks a header
            at a high z-index cannot paint over the close button.

            Layout intent from innerStyle is carried through, since callers that
            pass display:flex are sizing their CHILDREN, and the children now sit
            a level deeper. Everything else in innerStyle dresses the frame. */}
        <div style={{
          padding,
          overflowY: "auto",
          overscrollBehavior: "contain",
          flex: 1,
          minHeight: 0,
          position: "relative",
          zIndex: 0,
          ...(innerStyle?.display ? { display: innerStyle.display } : null),
          ...(innerStyle?.flexDirection ? { flexDirection: innerStyle.flexDirection } : null),
        }}>
          {children}
        </div>
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
        <div style={{ fontSize: FS.label, fontWeight: 700, color: K.acc, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
          {m.eyebrow}
        </div>
      )}
      <div style={{ fontSize: FS.body, fontWeight: 700, color: K.t1, marginBottom: m.message ? 6 : 16 }}>
        {m.title}
      </div>
      {m.message && (
        <div style={{ fontSize: FS.small, color: K.t2, lineHeight: 1.5, marginBottom: 16, whiteSpace: "pre-line" }}>
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

