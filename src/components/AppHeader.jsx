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
//  The mark is the APP LOGO — the golfer — not the trophy. They are different
//  things: the golfer is WBC's identity (home-screen icon, pull-to-refresh
//  spinner, this header), while the trophy is an award, used where a result is
//  being shown. Drawn as a CSS MASK rather than an <img> so it takes the theme
//  accent exactly, which is the same technique the pull-to-refresh indicator
//  uses on the same asset — the PNG is a flat silhouette on transparency, so
//  its alpha channel is what gets masked.
import { K, FONT, FS } from "../theme";
import { WBC_LOGO } from "../constants";
import { getTournamentYear } from "../firebase";
import { BellCountdown } from "./BellCountdown";

// The single knob for how far the header sits from the top of the screen.
// 5px above the platform's inset: on an installed iOS app with status-bar
// style "black" the inset resolves to 0 and this is a plain 5px gap below an
// opaque status bar. On Android edge-to-edge and in a browser tab the inset is
// real and the 5px rides on top of it.
// Exported because anything that wants to sit ON this band — the scoring
// screen's "advancing" toast — has to start from the same inset the header
// does, or it lands somewhere else on a phone with a notch.
export const HEADER_SAFE_PAD = "calc(env(safe-area-inset-top, 0px) + 5px)";

// `countdownAt` is the moment the field tees off, or null when the round has
// no date and no tee sheet yet. Given one, the mark gets the countdown wrapped
// around it — see BellCountdown for why the digits flank the logo rather than
// taking a corner. Given null, or once it has run out, the header is exactly
// the header it has always been.
export function AppHeader({ location, fallbackLocation = "Gaylord, MI", right, countdownAt = null }) {
  const mark = (
    <div style={{
      width: 30, height: 30, background: K.acc, flexShrink: 0,
      WebkitMask: `url("${WBC_LOGO}") center/contain no-repeat`,
      mask: `url("${WBC_LOGO}") center/contain no-repeat`,
    }} />
  );
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
      {countdownAt != null ? <BellCountdown at={countdownAt}>{mark}</BellCountdown> : mark}

      {/* WBC's own display treatment, not the one this layout was ported
          with. Both apps set Montserrat, so the FAMILY was never the
          difference — what came across from Bourbon Cup was its caption
          idiom: 10px, +2.2 tracking, all-caps, in the muted text colour.
          WBC sets its titles the opposite way, and does so everywhere else
          in the app — larger, NEGATIVE tracking, full-strength ink, and
          sentence case, so a location reads "Gaylord, MI" rather than being
          shouted. */}
      <div style={{
        fontSize: FS.lead, fontWeight: 800, letterSpacing: "-0.01em", color: K.t1,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
      }}>
        {getTournamentYear()} · {location || fallbackLocation}
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
