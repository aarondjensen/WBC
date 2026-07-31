// ══════════════════════════════════════════════════════════════════
//  MoreMenu — the nav's fifth slot, and what lives behind it.
// ══════════════════════════════════════════════════════════════════
//
// Ported from Bourbon Cup's SlideMenu. It exists because a bottom bar has
// about five slots and an app has more than five destinations: the ones that
// are not the EVENT — settings, your account, the director console — belong
// together behind one door rather than each competing for a tab.
//
// Before this, WBC spread them across three places with no relationship to
// each other: Admin was a nav tab, Account was a button in the header, and
// Notifications was a section inside the Account sheet reachable only by
// opening Account first. Nothing said they were the same kind of thing.
//
// Ordering follows BC's: the EVENT first (Admin acts on the tournament), then
// a full-weight rule, then the PERSON (their notifications, their account).
// The rule is what says "this one isn't the event".
//
// Drag-to-dismiss is carried over because the menu opens from the bottom bar,
// where a thumb already is — a downward flick is the gesture that hand
// expects, and the alternative is reaching for a backdrop.
import { useRef, useState } from "react";
import { K, FONT, FS, ALPHA, SHADOW } from "../theme";

export function MoreMenu({ open, onClose, onSelect, isDirector, adminFlag, notifFlag, navH = 62 }) {
  const startYRef = useRef(null);
  const [dragY, setDragY] = useState(0);

  const handleTouchStart = (e) => { startYRef.current = e.touches[0].clientY; setDragY(0); };
  const handleTouchMove = (e) => {
    if (startYRef.current == null) return;
    const dy = e.touches[0].clientY - startYRef.current;
    // Downward only. An upward drag on a menu anchored to the bottom bar has
    // nowhere to go, and following it would let the sheet tear off the bar.
    if (dy > 0) setDragY(dy);
  };
  const handleTouchEnd = () => {
    if (dragY > 80) onClose();
    setDragY(0);
    startYRef.current = null;
  };

  if (!open) return null;

  const items = [
    ...(isDirector ? [{ key: "admin", label: "Admin Settings", flag: adminFlag }] : []),
    { key: "notifications", label: "Notifications", person: true, flag: notifFlag },
    { key: "account", label: "My Account", person: true },
  ];
  // Index of the first personal item — the one that gets the full-weight rule.
  const firstPersonIdx = items.findIndex(i => i.person);

  return (
    <>
      {/* Full-screen catcher rather than a dimmed scrim: this menu is small
          and anchored, and darkening the whole board behind it would read as
          a modal taking over the app rather than a bar opening. */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200 }} />
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          // Flush with the top of the bar: -1px so the menu's bottom border and
          // the bar's top border stay the single hairline they are.
          bottom: navH - 1,
          right: "max(8px, calc(50vw - 232px))",
          transform: `translateY(${dragY}px)`,
          transition: dragY === 0 ? "transform 0.2s ease" : "none",
          width: 220,
          background: K.card,
          borderRadius: 12,
          border: `1px solid ${K.bdr}`,
          boxShadow: `0 -4px 24px ${SHADOW}`,
          zIndex: 201,
          overflow: "hidden",
          fontFamily: FONT,
        }}
      >
        {items.map((item, idx) => (
          <button
            key={item.key}
            onClick={() => { onSelect(item.key); onClose(); }}
            style={{
              width: "100%", padding: "12px 16px",
              background: "transparent",
              // A full-weight rule above the first personal item, a hairline
              // between the rest: the break is what says "this one isn't the
              // event".
              borderTop: idx === 0 ? "none" : `1px solid ${K.bdr}${idx === firstPersonIdx ? "" : ALPHA.hair}`,
              borderLeft: "none", borderRight: "none", borderBottom: "none",
              color: item.flag ? K.acc : K.t1,
              fontSize: FS.body, fontWeight: item.flag ? 700 : 500,
              cursor: "pointer", textAlign: "left",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            }}
          >
            <span>{item.label}</span>
            {item.flag && <span style={{ width: 6, height: 6, borderRadius: "50%", background: K.acc, flexShrink: 0 }} />}
          </button>
        ))}
      </div>
    </>
  );
}

export default MoreMenu;
