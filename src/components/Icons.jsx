// ══════════════════════════════════════════════════════════════════
//  Icons — the app's line glyphs, as SVG rather than emoji.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup, which hit this first in its tournaments picker.
// Deliberately the same six glyphs at the same stroke weight in both apps:
// one codebase's worth of drawing, and a padlock that means the same thing
// on either phone.
//
// Three things go wrong with 🔒 / 🔓 / 🗑 on a list row, and the picker had
// all three:
//
//   • THEY IGNORE `color`. A colour font paints its own palette, so a padlock
//     is yellow whatever the theme says — on a teal-accented app, twice as
//     obviously. That is why lock state had to be carried by `opacity: 0.35`:
//     a switch whose only two positions were "bright" and "washed out".
//   • 🔒 AND 🔓 ARE THE SAME PICTURE at 15px. The only difference is a shackle
//     tilted a few degrees, and the row asked a director to read it at a
//     glance to know whether a year was frozen.
//   • THEY ARE THE PLATFORM'S DRAWING, NOT OURS. The same character renders
//     differently on iOS, Android and a desktop browser — three shells off one
//     codebase, three pictures.
//
// So: one stroke weight, `currentColor` throughout, sized by the caller.
// `color` works, which means a locked year lights the accent and an unlocked
// one sits in `K.t3` — state carried by the theme's own ink rather than by
// washing a picture out.
//
// `aria-hidden`, because an icon beside a word is decoration; a control with
// no visible label carries its own `title`/`aria-label` on the BUTTON, which
// is where a screen reader wants it.
function Glyph({ size = 16, width = 1.6, children }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"
      style={{ width: size, height: size, display: "block", flexShrink: 0 }}
      fill="none" stroke="currentColor" strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

// Shackle down = shut. The open one lifts it clear of the right-hand side —
// a difference that survives being 16px on a phone, which is the whole point.
export const IconLock = (p) => (
  <Glyph {...p}>
    <rect x="4.5" y="8.8" width="11" height="7.2" rx="1.6" />
    <path d="M7 8.8V6.6a3 3 0 0 1 6 0v2.2" />
  </Glyph>
);

export const IconUnlock = (p) => (
  <Glyph {...p}>
    <rect x="4.5" y="8.8" width="11" height="7.2" rx="1.6" />
    <path d="M7 8.8V6.6a3 3 0 0 1 6 0" />
  </Glyph>
);

export const IconTrash = (p) => (
  <Glyph {...p}><path d="M4.5 6h11M8 6V4.6h4V6M6.4 6l.6 9.4h6l.6-9.4" /></Glyph>
);

// Points at what is behind the tap. On a list row it is the whole promise
// that the row does something.
export const IconChevron = (p) => (
  <Glyph {...p}><path d="M8 5l5 5-5 5" /></Glyph>
);

export const IconPencil = (p) => (
  <Glyph {...p}><path d="M13.5 3.5a1.6 1.6 0 0 1 2.3 2.3L7.4 14.2 4 15l.8-3.4Z" /></Glyph>
);

// Two arrows passing — "replace this with another one". The sandbox rebuild.
export const IconSwap = (p) => (
  <Glyph {...p}><path d="M6 7h9l-2.4-2.4M14 13H5l2.4 2.4" /></Glyph>
);
