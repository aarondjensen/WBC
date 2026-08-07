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
// expects, and the alternative is reaching for a backdrop. It was written
// inline here first; My Account needed the same gesture and it now lives in
// lib/useSheetDrag, so both sheets answer a thumb identically. This menu never
// scrolls, so the hook's at-the-top gate is always satisfied here.
import { K, FONT, FS, R, ALPHA, MOTION, SHADOW } from "../theme";
import { useSheetDrag } from "../lib/useSheetDrag";

export function MoreMenu({ open, onClose, onSelect, isDirector, adminFlag, notifFlag, activeYear, navH = 62 }) {
  const { dragY, handlers } = useSheetDrag({ onClose });

  if (!open) return null;

  const items = [
    ...(isDirector ? [{ key: "admin", label: "Admin Settings", flag: adminFlag }] : []),
    // The record book: every player's WBC Index and the rounds behind it. It
    // sits with the EVENT rather than with the person because it is about the
    // tournament's history, not about the phone holding it — and above the
    // rule, so a player with no Admin entry still opens the menu onto
    // something that isn't their own settings.
    { key: "players", label: "Players" },
    // Every year the tournament has been run in this app. It sits with the
    // EVENT, directly under the record book, because it answers the same
    // question from the other side: Players is one golfer across the years,
    // this is one year across the golfers. The active year rides on the row
    // so the menu says which tournament is on screen without opening it.
    { key: "editions", label: "Tournaments", value: activeYear ? String(activeYear) : null },
    // The photo library, under the year it belongs to. It follows the active
    // edition the same way the leaderboard does, so it sits directly below the
    // control that changes which year is on screen rather than above it — the
    // row that answers "which tournament" reads first, then the two rows that
    // show one.
    { key: "photos", label: "Photos" },
    // Notifications used to be a row of its own here. It is a setting ABOUT
    // YOU — which device buzzes, and for what — so it lives inside My Account
    // beside the other two, rather than as a sibling of the tournament. The
    // flag comes with it: the dot that said "your notifications need a
    // decision" now rides the row that opens them.
    { key: "account", label: "My Account", person: true, flag: notifFlag },
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
        {...handlers}
        style={{
          position: "fixed",
          // Flush with the top of the bar: -1px so the menu's bottom border and
          // the bar's top border stay the single hairline they are.
          bottom: navH - 1,
          right: "max(8px, calc(50vw - 232px))",
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY === 0 ? `transform ${MOTION} ease` : "none",
          width: 220,
          background: K.card,
          borderRadius: R.lg,
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
            {item.value && (
              <span style={{ fontSize: FS.small, fontWeight: 700, color: K.t3, flexShrink: 0 }}>{item.value}</span>
            )}
            {item.flag && <span style={{ width: 6, height: 6, borderRadius: "50%", background: K.acc, flexShrink: 0 }} />}
          </button>
        ))}
      </div>
    </>
  );
}

export default MoreMenu;
