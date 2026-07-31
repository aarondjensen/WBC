// ══════════════════════════════════════════════════════════════════
//  AppHeader — the cup mark over YEAR · CITY
// ══════════════════════════════════════════════════════════════════
//
//  Ported from Bourbon Cup's AppHeader. WBC's version was a left-aligned row:
//  a trophy PNG, the tournament name, and a hardcoded "Gaylord, MI · Aug
//  26–29" underneath, with the account controls opposite. This is BC's shape —
//  a centred mark over one centred caption.
//
//  Why the year and city STACK under the mark rather than flanking it. Placing
//  them either side is centred only in the geometric sense: the mark holds the
//  middle column, but "GAYLORD, MI" carries near three times the ink of
//  "2026", so the weight piles up on one side and the cluster reads as leaning.
//  Every fix that keeps the three abreast is a balancing act against label
//  lengths that change with the tournament — a longer city, a two-word one —
//  so the row needs re-tuning each time it changes. Stacking is symmetric by
//  construction: one centred mark, one centred line, nothing to re-tune.
//
//  The right-hand controls are ABSOLUTELY POSITIONED rather than being a flex
//  sibling. WBC, unlike BC, keeps its sync dot and Account button up here, and
//  a `justify-content: space-between` row would centre the mark against
//  whatever those controls happen to be — so the header would visibly shift
//  when the notification bell appears or a longer player name lands in the
//  Account button. Taking them out of flow means the centred column is centred
//  on the SCREEN, which is the only definition that holds.
//
//  The year comes from the active edition, not the calendar — the same
//  getTournamentYear() the login screen uses — so a director browsing 2027's
//  setup can't be shown a header that says 2026. The location is the
//  director's, set in Admin → Event; the fallback is only for an edition that
//  has not been through that screen.
//
//  The mark is drawn as a CSS MASK rather than an <img> so it takes the theme
//  accent exactly, the same technique the pull-to-refresh indicator uses.
import { K, FONT, FS } from "../theme";
import { TROPHY_SVG_URL } from "../constants";
import { getTournamentYear } from "../firebase";

// The single knob for how far the header sits from the top of the screen.
// 5px above the platform's inset: on an installed iOS app with status-bar
// style "black" the inset resolves to 0 and this is a plain 5px gap below an
// opaque status bar. On Android edge-to-edge and in a browser tab the inset is
// real and the 5px rides on top of it.
const HEADER_SAFE_PAD = "calc(env(safe-area-inset-top, 0px) + 5px)";

export function AppHeader({ location, fallbackLocation = "Gaylord, MI", right }) {
  return (
    <div style={{
      position: "relative", zIndex: 50, flexShrink: 0,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      // Longhand rather than a shorthand, so the inset-aware top can't be
      // silently overwritten by a later `padding:` in the same object.
      paddingTop: HEADER_SAFE_PAD,
      paddingLeft: 12, paddingRight: 12, paddingBottom: 7,
      // Opaque: this band is what the status bar sits on, and content
      // scrolling in the body must not show through it.
      background: K.bg,
      borderBottom: `1px solid ${K.bdr}`,
      fontFamily: FONT,
    }}>
      <div style={{
        width: 25, height: 28, background: K.acc, flexShrink: 0,
        WebkitMask: `url("${TROPHY_SVG_URL}") center/contain no-repeat`,
        mask: `url("${TROPHY_SVG_URL}") center/contain no-repeat`,
      }} />

      <div style={{
        fontSize: FS.label, fontWeight: 800, letterSpacing: 2.2, color: K.t2,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
      }}>
        {getTournamentYear()} · {(location || fallbackLocation).toUpperCase()}
      </div>

      {right && (
        <div style={{
          position: "absolute", right: 12, top: HEADER_SAFE_PAD,
          display: "flex", alignItems: "center", gap: 8,
        }}>{right}</div>
      )}
    </div>
  );
}

export default AppHeader;
