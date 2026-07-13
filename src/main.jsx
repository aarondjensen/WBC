import { createRoot } from 'react-dom/client'
import { Component } from 'react'
import './index.css'
import App from './App.jsx'

// ─────────────────────────────────────────────────────────────────────────
// NATIVE-ONLY: enable safe-area insets.
//
// In the Capacitor shell the WebView fills the ENTIRE screen — including the
// area behind the status bar and the home indicator. (The installed PWA never
// had this problem: its opaque status bar meta made iOS reserve that space.)
//
// The header and bottom nav already carry the right CSS —
//   paddingTop: max(10px, calc(env(safe-area-inset-top, 0px) + 10px))
// — but env(safe-area-inset-*) only resolves to a NON-ZERO value when the
// viewport is declared `viewport-fit=cover`. index.html deliberately OMITS
// that (it triggers an iOS PWA viewport flip that corrupts --app-height and
// blanks the app), so on native the insets silently collapse to 0 and the
// header renders UNDER the status bar.
//
// Adding it here, at runtime and only when running natively, makes the insets
// resolve in the native shell while leaving the web/PWA viewport policy —
// and the bug it avoids — completely untouched.
// ─────────────────────────────────────────────────────────────────────────
try {
  if (window.Capacitor?.isNativePlatform?.()) {
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp && !vp.content.includes("viewport-fit")) {
      vp.setAttribute("content", vp.content + ", viewport-fit=cover");
    }
  }
} catch { /* non-native or no meta — nothing to do */ }

// ─────────────────────────────────────────────────────────────────────────
// Top-level error boundary.
//
// Until now the app had NO boundary: any render-time throw anywhere in the
// tree unmounts everything and leaves the bare #root background (dark navy) —
// a silent "flash then dark" with nothing on screen and nothing to go on.
// This does two jobs:
//   1. Hardening (needed for the app-store builds anyway): a crash now shows a
//      readable message + a Reload button instead of a dead dark screen.
//   2. Diagnosis: if the reopen "flash then dark" is a JS crash, the message
//      below will now appear ON the phone — tap "Show details" and screenshot
//      it. If instead the screen is still blank dark with NONE of this text,
//      the cause is NOT a render crash (it's layout/viewport), which narrows
//      the search decisively.
// ─────────────────────────────────────────────────────────────────────────
class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    // Surface to the remote-inspector console too.
    console.error("[WBC crash]", error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const box = {
      minHeight: "100vh", background: "#080f1e", color: "#e8eef7",
      fontFamily: "Montserrat, system-ui, sans-serif", padding: "24px 20px",
      display: "flex", flexDirection: "column", gap: 14, overflowY: "auto",
    };
    return (
      <div style={box}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f4c86b" }}>WBC hit an error</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.9 }}>
          The app caught a crash instead of going blank. Screenshot this and send it over.
        </div>
        <button
          onClick={() => { window.location.hash = ""; window.location.reload(); }}
          style={{ alignSelf: "flex-start", background: "linear-gradient(135deg,#f4c86b,#c99a3f)", color: "#080f1e", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
        >Reload</button>
        <details style={{ fontSize: 11, opacity: 0.8 }}>
          <summary style={{ cursor: "pointer", marginBottom: 8 }}>Show details</summary>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
{String(this.state.error?.message || this.state.error)}
{"\n\n"}
{String(this.state.error?.stack || "").split("\n").slice(0, 6).join("\n")}
{"\n\n"}
{String(this.state.info?.componentStack || "").split("\n").slice(0, 10).join("\n")}
          </pre>
        </details>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
)
