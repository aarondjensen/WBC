// ══════════════════════════════════════════════════════════════════
//  useConfirm — promise-based confirmations on the shared ConfirmModal.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup. A themed, non-blocking replacement for the pattern
// WBC's admin console had grown organically: a bespoke piece of state per
// destructive action (`confirmCourse`, `hiWarn`, `finalizeModal`, …), each
// with its own hand-rolled two-button JSX. Those are fine individually and
// unmaintainable in aggregate — five confirmations, five slightly different
// looks, and every new one starts from scratch.
//
//   const { confirm, confirmModal } = useConfirm();
//   ...
//   if (await confirm({ title, message, confirmLabel, destructive })) { ... }
//   // or shorthand:  if (await confirm("Remove this?")) { ... }
//   ...
//   // render ONCE, anywhere in the component's tree:
//   <ConfirmModal modal={confirmModal} />
//
// `confirm` returns a Promise<boolean> that resolves true on confirm and false
// on cancel / backdrop. Non-blocking (unlike window.confirm) so the rest of the
// app keeps painting behind it, and it picks up the live theme.
import { useCallback, useRef, useState } from "react";

export function useConfirm() {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    const o = typeof options === "string" ? { message: options } : (options || {});
    return new Promise((resolve) => {
      // A confirm raised while another is open would otherwise strand the
      // first promise unresolved forever, and any `await confirm(...)` behind
      // it never returns. Settle the outgoing one as a cancel.
      if (resolver.current) resolver.current(false);
      resolver.current = resolve;
      setOpts(o);
    });
  }, []);

  const settle = useCallback((result) => {
    setOpts(null);
    const r = resolver.current;
    resolver.current = null;
    if (r) r(result);
  }, []);

  // Shaped for <ConfirmModal modal={…}/> — null when idle so it renders
  // nothing. A title always exists so ConfirmModal never no-ops on us.
  const confirmModal = opts && {
    title: opts.title || "Are you sure?",
    message: opts.message,
    confirmLabel: opts.confirmLabel,
    cancelLabel: opts.cancelLabel,
    destructive: opts.destructive,
    eyebrow: opts.eyebrow,
    alert: opts.alert,
    onConfirm: () => settle(true),
    onCancel: () => settle(false),
  };

  return { confirm, confirmModal };
}
