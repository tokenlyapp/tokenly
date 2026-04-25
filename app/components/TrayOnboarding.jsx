// TrayOnboarding — frameless, transparent, non-focusable overlay that
// appears below the menu-bar tray icon the first (and only the first) time
// a user dismisses the popover. The visual goal is "Tokenly didn't quit —
// it's right up there, one click away."
//
// Lifecycle:
//   - main.js opens this window when popover.on('blur') fires AND the
//     `trayOnboardingShown` pref is false. Pref flips immediately so we
//     never double-show.
//   - Component fades + slides in, holds for ~10s, fades out, asks main to
//     close the window.
//   - User can dismiss early via the small × in the corner.

const { useState: useStateTo, useEffect: useEffectTo } = React;

function TrayOnboarding() {
  // Three phases — drives all the staggered animations:
  //   'enter'   — fade + slide in, hold
  //   'leaving' — fade + slide out
  const [phase, setPhase] = useStateTo('enter');

  // Schedule the auto-dismiss. 8s is enough to read; 1.2s is the leaving
  // animation duration before we ask main to actually close the window.
  useEffectTo(() => {
    const tStart = setTimeout(() => setPhase('leaving'), 8000);
    return () => clearTimeout(tStart);
  }, []);

  useEffectTo(() => {
    if (phase !== 'leaving') return;
    const tClose = setTimeout(() => {
      try { window.api.trayOnboardingClose(); } catch {}
    }, 1200);
    return () => clearTimeout(tClose);
  }, [phase]);

  const dismiss = () => setPhase('leaving');

  // Visible state for entry transition — set to true on first paint so CSS
  // transitions kick in (we render with opacity:0 / translateY:-12, then
  // flip to opacity:1 / translateY:0 in a microtask).
  const [visible, setVisible] = useStateTo(false);
  useEffectTo(() => {
    const r = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const isLeaving = phase === 'leaving';

  return (
    <React.Fragment>
      <style>{`
        html, body, #root { background: transparent !important; }
        @keyframes tk-arrow-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }
        @keyframes tk-icon-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 14px rgba(124,92,255,0.55), 0 0 28px rgba(34,211,238,0.18); }
          50%      { transform: scale(1.08); box-shadow: 0 0 22px rgba(124,92,255,0.85), 0 0 38px rgba(34,211,238,0.35); }
        }
        @keyframes tk-ring {
          0%   { transform: scale(0.4); opacity: 0.55; }
          100% { transform: scale(1.55); opacity: 0; }
        }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0,
        // Whole window is transparent — only the floating card has chrome.
        // Pointer-events default to bypass; overrides on the card itself
        // so the dismiss × is clickable.
        pointerEvents: 'none',
      }}>

        {/* Arrow + glowing tray-icon ghost — sits at the very top, lined up
            with the actual tray icon since the BrowserWindow is positioned
            directly under it by main.js. */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          opacity: visible && !isLeaving ? 1 : 0,
          transform: visible && !isLeaving ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'opacity .35s ease-out, transform .45s cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}>
          {/* Spectral T glyph echoing the menu-bar icon. Pulses to draw the eye. */}
          <div style={{
            position: 'relative',
            width: 26, height: 26,
            marginTop: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Expanding ring that fires once a second */}
            <div style={{
              position: 'absolute', inset: 0,
              border: '1.5px solid rgba(124,92,255,0.55)',
              borderRadius: 7,
              animation: 'tk-ring 1.6s ease-out infinite',
            }} />
            <div style={{
              width: 22, height: 22,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #7c5cff 0%, #22d3ee 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 13, fontWeight: 800, letterSpacing: '-0.04em',
              animation: 'tk-icon-pulse 1.8s ease-in-out infinite',
            }}>T</div>
          </div>

          {/* Upward-pointing arrow */}
          <svg width="14" height="10" viewBox="0 0 14 10" style={{
            marginTop: 6,
            animation: 'tk-arrow-bob 1.6s ease-in-out infinite',
          }}>
            <path d="M7 0 L13 8 L8 8 L8 10 L6 10 L6 8 L1 8 Z" fill="rgba(124,92,255,0.85)" />
          </svg>
        </div>

        {/* Floating message card */}
        <div style={{
          position: 'absolute', top: 80, left: 14, right: 14,
          padding: '14px 16px 12px',
          background: `
            linear-gradient(180deg, rgba(21,21,31,0.96) 0%, rgba(13,13,20,0.96) 100%)
          `,
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(124,92,255,0.30)',
          borderRadius: 14,
          boxShadow: '0 24px 60px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), 0 0 50px -10px rgba(124,92,255,0.35)',
          opacity: visible && !isLeaving ? 1 : 0,
          transform: visible && !isLeaving ? 'translateY(0) scale(1)' : 'translateY(-6px) scale(0.97)',
          transition: 'opacity .4s ease-out .06s, transform .55s cubic-bezier(0.2, 0.9, 0.3, 1) .06s',
          pointerEvents: 'auto',
          color: '#ecedf3',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
          WebkitFontSmoothing: 'antialiased',
          userSelect: 'none',
        }}>
          {/* Dismiss × — small, dim, top-right of the card */}
          <button
            onClick={dismiss}
            aria-label="Got it"
            title="Got it"
            style={{
              position: 'absolute', top: 6, right: 6,
              width: 20, height: 20, borderRadius: 10,
              background: 'transparent', border: 0,
              color: 'rgba(255,255,255,0.35)',
              cursor: 'pointer', padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>

          <div style={{
            fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', gap: 7,
            marginBottom: 4,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 18, height: 18, borderRadius: 5,
              background: 'linear-gradient(135deg, #7c5cff, #22d3ee)',
              color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '-0.04em',
            }}>T</span>
            Tokenly lives up there.
          </div>
          <div style={{ fontSize: 11.5, color: '#8a8c99', lineHeight: 1.5, paddingRight: 12 }}>
            Click the <strong style={{ color: '#ecedf3' }}>T</strong> in your menu bar anytime to peek at your AI spend. We'll stay quiet in the background until you do.
          </div>

          <div style={{
            display: 'flex', justifyContent: 'flex-end',
            marginTop: 10,
          }}>
            <button
              onClick={dismiss}
              style={{
                background: 'linear-gradient(135deg, #7c5cff, #22d3ee)',
                color: '#fff',
                border: 0, borderRadius: 7,
                padding: '6px 12px',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
                fontFamily: 'inherit', cursor: 'pointer',
                boxShadow: '0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 18px -4px rgba(124,92,255,0.55)',
              }}
            >Got it</button>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
window.TrayOnboarding = TrayOnboarding;
