import { createRoot } from 'react-dom/client'
import { Component } from 'react'
import './index.css'
import App from './App.jsx'

// ── TEMPORARY DIAGNOSTIC: why is env(safe-area-inset-top) still 0 on native? ──
// Measures the ACTUAL resolved inset by probing a real element, and reports the
// viewport meta the DOM ended up with. Remove once the header sits correctly.
setTimeout(() => {
  try {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:1px;visibility:hidden;' +
      'height:env(safe-area-inset-top, 0px);';
    document.body.appendChild(probe);
    const insetTop = getComputedStyle(probe).height;
    probe.style.height = 'env(safe-area-inset-bottom, 0px)';
    const insetBottom = getComputedStyle(probe).height;
    probe.remove();

    const vp = document.querySelector('meta[name="viewport"]');
    console.log(
      '[safe-area-diag]',
      'protocol=', location.protocol,
      '| hasCapacitor=', !!window.Capacitor,
      '| isNative=', (() => { try { return window.Capacitor?.isNativePlatform?.(); } catch { return 'ERR'; } })(),
      '| viewportMeta=', vp ? vp.getAttribute('content') : 'NONE',
      '| metaCount=', document.querySelectorAll('meta[name="viewport"]').length,
      '| insetTop=', insetTop,
      '| insetBottom=', insetBottom,
      '| innerHeight=', window.innerHeight,
      '| screenHeight=', window.screen?.height
    );
  } catch (e) {
    console.log('[safe-area-diag] failed:', e?.message || e);
  }
}, 800);

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
