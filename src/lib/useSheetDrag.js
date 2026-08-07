// ══════════════════════════════════════════════════════════════════
//  useSheetDrag — pull a bottom sheet down to dismiss it.
// ══════════════════════════════════════════════════════════════════
//
// A sheet that opens from the bottom of the screen is opened by a thumb that
// is already down there, and the gesture that hand expects to close it is a
// flick back down. The alternative is reaching for a backdrop, which on a tall
// phone means moving the whole hand.
//
// MoreMenu had this written inline and it worked, because that menu is a fixed
// stack of rows that never scrolls. My Account is the case that breaks it: it
// scrolls, and a naive downward drag anywhere in a scrolling sheet dismisses
// it instead of scrolling it — the content jumps away under the finger.
//
// The gate is `atTop`, and it is sampled ONCE at touch start rather than read
// live on every move. Both halves of that matter:
//
//   • Sampled at start, a drag begun mid-content stays a scroll for its whole
//     length, even after it scrolls up to the top. The sheet does not suddenly
//     tear off the bottom of the screen halfway through a flick.
//   • Read live, the reverse also goes wrong: scrolling up to the top and
//     continuing would hand the rest of the gesture to the dismiss, which is
//     how you close a sheet you were only trying to read.
//
// The element the handlers are spread onto is the scrolling element itself,
// so scrollTop comes off `currentTarget` and there is no ref to thread.
import { useRef, useState } from "react";

// How far down the sheet has to be let go to dismiss rather than spring back.
// 80px is MoreMenu's number, kept so the two sheets answer a thumb the same.
export const DISMISS_PX = 80;

// How far the sheet follows the finger. Downward only: a sheet anchored to the
// bottom of the screen has nowhere to go upwards, and following an upward drag
// would let it tear off the bottom edge.
export function dragOffset({ startY, currentY, atTop }) {
  if (startY == null || !atTop) return 0;
  const dy = currentY - startY;
  return dy > 0 ? dy : 0;
}

export function dismisses(dragY, threshold = DISMISS_PX) {
  return dragY > threshold;
}

// `enabled` is for the states where closing is not on offer — an account
// mid-deletion, say, where the backdrop is already inert. A sheet that refuses
// a tap but follows a swipe is telling the user two different things.
export function useSheetDrag({ onClose, threshold = DISMISS_PX, enabled = true }) {
  const startRef = useRef(null);
  const [dragY, setDragY] = useState(0);

  const reset = () => { startRef.current = null; setDragY(0); };

  const onTouchStart = (e) => {
    if (!enabled) return;
    startRef.current = {
      y: e.touches[0].clientY,
      atTop: (e.currentTarget.scrollTop || 0) <= 0,
    };
    setDragY(0);
  };

  const onTouchMove = (e) => {
    const start = startRef.current;
    if (!start) return;
    setDragY(dragOffset({ startY: start.y, currentY: e.touches[0].clientY, atTop: start.atTop }));
  };

  const onTouchEnd = () => {
    if (!startRef.current) return;
    if (dismisses(dragY, threshold)) onClose?.();
    reset();
  };

  return {
    dragY,
    // A cancelled touch — an incoming call, a system gesture taking over —
    // never fires touchend, so without this the sheet stays parked wherever
    // the finger left it.
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset },
  };
}
