// ══════════════════════════════════════════════════════════════════
//  ui — small shared presentational primitives.
// ══════════════════════════════════════════════════════════════════
//  One home for chrome that was previously written inline, differently, at
//  each call site in App.jsx. Ported from Bourbon Cup's components/ui.jsx;
//  all colors come from WBC's theme.
//    • SegRule         — the accent rule under a selected segment.
//    • SegmentedToggle — the rounded pill tab switcher.
//    • StickyTop       — the pinned control strip at the top of a tab.

import { K, FONT, FS, R, ALPHA, MOTION, SHADOW, ON_ACC, ON_DANGER, segThumb, segTrack } from "../theme";

// ── Btn ──
// The one button. WBC had 126 of them written inline and no primitive, so the
// SAME control — "this is the action" — came out at four radii, six sizes and
// five different inks depending on which panel it was in. The 29 accent-filled
// ones alone carried three inks: ON_ACC (which exists for exactly this), K.bg
// (the hand-rolled version of ON_ACC) and a raw "#fff".
//
// Three sizes, picked to land where the existing values already cluster
// rather than to impose a new rhythm — 8/10/12 covered 86 of the 103 buttons
// that set a radius, so those stay the radii and the type comes off FS.
//
//   sm   a control inside a row: chips, inline edit, per-hole actions
//   md   the default. Card actions, modal buttons, admin panel controls
//   lg   a screen's one CTA — sign in, join, start the round
//
// Five variants, because a button's job is one of five things:
//   primary        the action. Filled accent.
//   secondary      an action that isn't THE action. Sunken fill, bordered.
//   danger         a destructive action, filled — the confirm in a confirm.
//   dangerOutline  a destructive action offered in passing, not yet confirmed.
//   ghost          chrome you can tap: close, back, expand.
//
// `disabled` is the component's, not the call site's: every hand-rolled
// version of it picked its own combination of dimmed ink, dimmed fill and
// cursor, and this collapses them to one. Anything genuinely bespoke can still
// come through `style`, which merges last.
const BTN_SIZES = {
  sm: { fontSize: FS.small, padding: "7px 12px", borderRadius: R.sm,  gap: 5 },
  md: { fontSize: FS.body,  padding: "10px 14px", borderRadius: R.md, gap: 6 },
  lg: { fontSize: FS.lead,  padding: "13px 16px", borderRadius: R.lg, gap: 8 },
};

const BTN_VARIANTS = {
  primary:       { background: K.acc,  color: ON_ACC,    border: "1px solid transparent" },
  secondary:     { background: K.inp,  color: K.t1,      border: `1px solid ${K.bdr}` },
  danger:        { background: K.danger, color: ON_DANGER, border: "1px solid transparent" },
  dangerOutline: { background: "transparent", color: K.danger, border: `1px solid ${K.danger}${ALPHA.line}` },
  ghost:         { background: "transparent", color: K.t2, border: "1px solid transparent" },
};

export function Btn({
  variant = "primary", size = "md", block = false, disabled = false,
  children, style, ...rest
}) {
  const v = disabled
    ? { background: K.inp, color: K.t3, border: `1px solid ${K.bdr}` }
    : BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  return (
    <button
      disabled={disabled}
      style={{
        ...BTN_SIZES[size] || BTN_SIZES.md,
        ...v,
        fontWeight: 700,
        fontFamily: FONT,
        cursor: disabled ? "default" : "pointer",
        display: block ? "flex" : "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: block ? "100%" : undefined,
        minWidth: 0,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// The rule that marks the thumb. A child rather than a border because it is
// shorter than the pill: an edge-to-edge line reads as a second border on the
// thumb, a short one reads as an underline on the label.
export function SegRule({ compact = false }) {
  return (
    <span style={{
      position: "absolute", left: "50%", transform: "translateX(-50%)",
      bottom: compact ? 3 : 4, width: compact ? 12 : 18, height: 2,
      borderRadius: R.xs, background: K.acc,
    }} />
  );
}

// ── SegmentedToggle ──
// options: array of [key, label]. `value` is the active key; `onChange(key)`
// fires on tap. Extra container style via `style` (e.g. { marginBottom: 14 }).
//
// Two variants:
//   segmented  a sunken track holding the thumb. The default, and what a mode
//              switch inside a card looks like.
//   pills      free-standing buttons with a gap between them — a row of TABS
//              sitting on the page rather than in a card. Unselected sits in
//              the sunken fill so the selected one has something to be raised
//              out of; the track variant gets that from the track itself.
//
// The track owns its background and its buttons are borderless; the pills have
// no track and each button carries its own edge. That is the whole difference —
// the selected state is the same object in both.
//
// `badge` on an option renders a small trailing dot, which is how the Rounds
// tab shows a round is fully set up without adding a second row of text.
export function SegmentedToggle({ options, value, onChange, variant = "segmented", letterSpacing, style, compact = false }) {
  const tracked = variant === "segmented";
  const track = tracked ? segTrack({ compact }) : { gap: 6 };
  const btn = (on) => (tracked
    ? segThumb(on, { compact })
    : { ...segThumb(on, { compact, sunken: true }), borderRadius: R.sm, border: `1px solid ${on ? "transparent" : K.bdr}` });
  return (
    <div style={{ display: "flex", ...track, ...style }}>
      {options.map(([k, label, badge]) => {
        const on = value === k;
        return (
          <button
            key={k}
            onClick={onChange ? () => onChange(k) : undefined}
            style={{
              flex: 1, padding: tracked ? (compact ? "5px 0" : "8px 0") : "8px 4px",
              fontSize: compact ? FS.label : FS.small, fontWeight: 700, cursor: "pointer",
              fontFamily: FONT, display: "flex", alignItems: "center",
              justifyContent: "center", gap: 5, minWidth: 0, ...btn(on),
              ...(letterSpacing != null ? { letterSpacing } : {}),
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            {/* A dot beside the label. A BOOLEAN reads as done/not-done in
                the accent; a COLOUR STRING is a filled dot in that colour,
                which is how a tab says something needs attention rather than
                merely reporting a state. */}
            {badge != null && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: typeof badge === "string" ? badge : badge ? K.acc : "transparent",
                border: `1.5px solid ${typeof badge === "string" ? badge : badge ? K.acc : K.t3 + ALPHA.line}`,
              }} />
            )}
            {on && <SegRule compact={compact} />}
          </button>
        );
      })}
    </div>
  );
}

// ── StickyTop ──
// The pinned control strip at the top of a tab. Every tab leads with the one
// control the whole view is steered from — the Admin tab bar, the round pills —
// and each of them pins here, so that control lands in the SAME place on every
// tab instead of wherever that tab's content height happens to put it.
//
// Two details are what make it hold:
//   • The wrapper is painted in the page bg and carries the gap BELOW it as
//     padding, so content scrolls under it with nothing showing through.
//   • A sticky box pins to the scroll container's CONTENT box, not its padding
//     box, so the body's top padding stays a live strip of scrolling content
//     ABOVE the pin — cards slide through it. The absolute cover (bottom:100%)
//     paints that strip in the page bg. It rides directly above the wrapper
//     rather than being sized to the body's padding, so it stays correct if
//     that padding ever changes; the scroll container clips the overhang.
export function StickyTop({ children, padTop = 0, padBottom = 12, style }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 5,
      background: K.bg, paddingTop: padTop, paddingBottom: padBottom,
      ...style,
    }}>
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: "100%",
        height: 40, background: K.bg, pointerEvents: "none",
      }} />
      {children}
    </div>
  );
}

// ── SectionLabel ──
// The all-caps eyebrow above a card or group. WBC wrote this inline a dozen
// times with four different sizes and three different letter-spacings.
export function SectionLabel({ children, color = K.t3, style }) {
  return (
    <div style={{
      fontSize: FS.label, fontWeight: 700, color,
      letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, ...style,
    }}>{children}</div>
  );
}

// ── Card ──
// The standard bordered surface every admin panel is built from.
//
// `ref` is taken as an ordinary prop and passed to the surface, which React 19
// allows without forwardRef. It exists because a caller occasionally has to
// bring a card into view — the Betting tab's director scrolls back to the
// market book after picking a player's name out of a list further down — and
// the alternative is wrapping the card in a bare div at each such call site.
export function Card({ children, style, pad = 14, ref }) {
  return (
    <div ref={ref} style={{
      background: K.card, borderRadius: R.lg, border: `1px solid ${K.bdr}`,
      padding: pad, ...style,
    }}>{children}</div>
  );
}

// ── Toast ──
// The transient "slides down from the top" confirmation, ported from Bourbon
// Cup. WBC already had the state for this — `notify()` sets `notif` on a 2.5s
// timer — but the only place it was ever RENDERED was the admin settings
// modal's header. Every notify() raised from anywhere else in the app set a
// string nobody displayed.
//
// Rendered once at the app root so a message shows wherever it is raised.
export function Toast({ message, top = 30 }) {
  if (!message) return null;
  return (
    <>
      <style>{`@keyframes wbcToastDown { 0% { transform: translateX(-50%) translateY(-20px); opacity: 0; } 100% { transform: translateX(-50%) translateY(0); opacity: 1; } }`}</style>
      <div style={{
        position: "fixed", top, left: "50%", transform: "translateX(-50%)",
        background: K.card, border: `1px solid ${K.acc}${ALPHA.line}`,
        color: K.t1, padding: "10px 22px", borderRadius: R.lg,
        fontSize: FS.body, fontWeight: 700, zIndex: 5000,
        maxWidth: "80vw", textAlign: "center",
        boxShadow: `0 8px 32px ${SHADOW}`,
        animation: "wbcToastDown 0.3s ease",
        fontFamily: FONT,
      }}>
        {message}
      </div>
    </>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────
// The on/off switch. It lived privately inside NotificationSettings, which was
// fine while notifications were the only thing you could switch on — then the
// theme picker arrived beside it in My Account as a segmented control, and one
// sheet had two different shapes meaning the same thing.
//
// The knob stays white in both themes. It is a physical switch, not a surface:
// the thing that reads as "on" is the accent track behind it, and a knob that
// followed the palette would leave the light theme with a pale knob on a pale
// track saying nothing.
export function Toggle({ on, busy, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={onChange} disabled={busy}
      style={{
        width: 52, height: 30, borderRadius: R.xl, border: "none", padding: 0,
        background: on ? K.acc : K.bdr, position: "relative", flexShrink: 0,
        cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
        transition: `background ${MOTION} ease`,
      }}>
      <span style={{
        position: "absolute", top: 3, left: on ? 25 : 3, width: 24, height: 24,
        borderRadius: "50%", background: "#fff", transition: `left ${MOTION} ease`,
        boxShadow: `0 1px 3px ${SHADOW}`,
      }} />
    </button>
  );
}
