// License sheet — Tokenly Max upgrade + activation UX.
// Both states (Free and Max) show the same activation-code panel so users
// can freely toggle: paste a code to go Max, click Remove to return to Free,
// paste again to reactivate. The upgrade marketing (price hero + feature
// list) only appears on the Free tier where it's relevant.
const { useState: useStateL, useEffect: useEffectL } = React;

// Live $5.99 Tokenly Max Stripe Payment Link. Matches the one on
// trytokenly.app's Buy button.
const BUY_URL = 'https://buy.stripe.com/8x2fZga2HawRcQq9YD0sU0a';

const MAX_FEATURES = [
  { label: 'OpenAI API · Anthropic API · OpenRouter' },
  { label: 'Daily budget alerts + spend summary' },
  { label: 'Menu-bar token counter for API sources' },
  { label: 'All future API-side features' },
];

function LicenseSheet({ open, onClose, onBack, tier, license, onLicenseChange, onOpenExternal }) {
  const t = TOKENS.color;
  const isMax = tier === 'max';

  const [code, setCode] = useStateL('');
  const [busy, setBusy] = useStateL(false);
  const [error, setError] = useStateL(null);
  const [flash, setFlash] = useStateL(null); // 'activated' | 'removed' | null

  // Reset transient state every time the sheet reopens.
  useEffectL(() => {
    if (!open) { setCode(''); setError(null); setFlash(null); }
  }, [open]);

  const activate = async () => {
    if (busy) return;
    const trimmed = code.trim();
    if (!trimmed) { setError('Paste the activation code from your purchase email.'); return; }
    setBusy(true); setError(null);
    try {
      const res = await window.api.activateLicense(trimmed);
      if (!res?.ok) {
        const reason = res?.reason || 'unknown';
        setError(
          reason === 'invalid_format'
            ? 'That doesn\'t look like a Tokenly activation code. It should start with "cs_".'
          : reason === 'not_paid' || reason === 'refunded'
            ? 'This code isn\'t tied to an active purchase (refunded or unpaid).'
          : reason === 'invalid_session'
            ? 'We can\'t find that code in Stripe. Double-check it from your purchase email.'
          : `Activation failed (${reason}).`
        );
      } else {
        setFlash('activated');
        setCode('');
        onLicenseChange && onLicenseChange(res);
        setTimeout(() => setFlash(null), 2800);
      }
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await window.api.deactivateLicense();
      onLicenseChange && onLicenseChange({ tier: 'free', license: null });
      setFlash('removed');
      setTimeout(() => setFlash(null), 2800);
    } finally {
      setBusy(false);
    }
  };

  const openBuy = () => {
    onOpenExternal ? onOpenExternal(BUY_URL) : window.open(BUY_URL, '_blank');
  };

  const activatedLabel = license?.activated_at
    ? new Date(license.activated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const lockIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );

  return (
    <React.Fragment>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(6px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .2s',
          zIndex: 50,
        }}
      />
      <section
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(180deg, #15151f 0%, #0d0d14 100%)',
          borderTop: `1px solid ${t.cardBorderStrong}`,
          borderRadius: '16px 16px 0 0',
          padding: '10px 16px 20px',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .25s cubic-bezier(0.2, 0.9, 0.3, 1)',
          zIndex: 60,
          maxHeight: '95%',
          overflowY: 'auto',
        }}
      >
        <SheetMinimize onClick={onClose} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBack && (
            <IconBtn onClick={onBack} title="Back">{Icons.arrowLeft}</IconBtn>
          )}
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Tokenly Max</div>
        </div>

        {/* Tier status banner — always visible, colored by state */}
        <div style={{
          background: isMax
            ? 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(34,211,238,0.10))'
            : 'rgba(255,255,255,0.04)',
          border: isMax
            ? '1px solid rgba(52,211,153,0.35)'
            : `1px solid ${t.cardBorder}`,
          borderRadius: 12,
          padding: '12px 14px', marginTop: 10, marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: isMax ? 'rgba(52,211,153,0.22)' : 'rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isMax ? t.green : t.textMute, flexShrink: 0,
          }}>{isMax ? Icons.check : lockIcon}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>
              {isMax ? 'Tokenly Max active' : 'Tokenly Max inactive'}
            </div>
            <div style={{ fontSize: 10, color: t.textDim, marginTop: 2, lineHeight: 1.45 }}>
              {isMax
                ? (activatedLabel ? `Activated ${activatedLabel}` : 'Active on this Mac')
                : 'You\'re on the free tier — Claude Code, Codex CLI, and Gemini CLI only.'}
            </div>
          </div>
        </div>

        {/* Activation code panel — ALWAYS visible so toggling in/out of Max
            is one place. Free: paste a code + Activate. Max: see the saved
            code + Remove to go back to Free. */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>Activation code</div>
          <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.5, marginBottom: 10 }}>
            {isMax
              ? 'This code is unlocking Max on this Mac. Remove to return to Free; paste again anytime to come back.'
              : 'Paste the code from your Tokenly Max purchase email to activate. Starts with '}
            {!isMax && <span style={{ fontFamily: TOKENS.type.mono, color: t.textDim }}>cs_…</span>}
          </div>

          {isMax ? (
            <React.Fragment>
              <div style={{
                fontFamily: TOKENS.type.mono, fontSize: 11, color: t.text,
                background: 'rgba(0,0,0,0.3)',
                border: `1px solid ${t.cardBorder}`,
                borderRadius: 7, padding: '8px 10px',
                wordBreak: 'break-all', userSelect: 'all',
                marginBottom: 8,
              }}>{license?.session_id || '—'}</div>
              <button
                onClick={remove}
                disabled={busy}
                style={{
                  width: '100%',
                  padding: '9px 14px', borderRadius: 7,
                  background: 'rgba(248,113,113,0.12)', color: t.red,
                  border: '1px solid rgba(248,113,113,0.3)',
                  fontSize: 11, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.55 : 1, fontFamily: 'inherit',
                }}
              >{busy ? '…' : 'Remove code · return to Free'}</button>
            </React.Fragment>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') activate(); }}
                placeholder="cs_live_…"
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1, minWidth: 0,
                  background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${t.cardBorder}`,
                  color: t.text,
                  padding: '8px 10px', borderRadius: 7,
                  fontSize: 11, fontFamily: TOKENS.type.mono,
                  outline: 'none',
                }}
              />
              <button
                onClick={activate}
                disabled={busy || !code.trim()}
                style={{
                  background: t.accent, color: '#fff', border: 0,
                  padding: '0 14px', borderRadius: 7, fontSize: 11,
                  fontWeight: 600, cursor: busy || !code.trim() ? 'default' : 'pointer',
                  opacity: busy || !code.trim() ? 0.55 : 1,
                  fontFamily: 'inherit',
                }}
              >{busy ? '…' : 'Activate'}</button>
            </div>
          )}

          {error && (
            <div style={{
              fontSize: 10.5, color: t.red, marginTop: 8, lineHeight: 1.4,
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 6, padding: '6px 8px',
            }}>{error}</div>
          )}
          {flash === 'activated' && (
            <div style={{
              fontSize: 10.5, color: t.green, marginTop: 8, lineHeight: 1.4,
              background: 'rgba(52,211,153,0.08)',
              border: '1px solid rgba(52,211,153,0.25)',
              borderRadius: 6, padding: '6px 8px',
            }}>Tokenly Max activated. Welcome aboard.</div>
          )}
          {flash === 'removed' && (
            <div style={{
              fontSize: 10.5, color: t.textDim, marginTop: 8, lineHeight: 1.4,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${t.cardBorder}`,
              borderRadius: 6, padding: '6px 8px',
            }}>Activation code removed. You're back on the free tier.</div>
          )}
        </div>

        {/* Free-tier only: upgrade marketing */}
        {!isMax && (
          <React.Fragment>
            <div style={{
              background: 'linear-gradient(135deg, rgba(124,92,255,0.18), rgba(34,211,238,0.12))',
              border: '1px solid rgba(124,92,255,0.35)',
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: t.text }}>
                  $5.99
                </div>
                <div style={{ fontSize: 11, color: t.textDim, fontWeight: 500 }}>one-time · lifetime</div>
              </div>
              <div style={{ fontSize: 11, color: t.textDim, marginTop: 4, lineHeight: 1.5 }}>
                Pay once, unlock forever. No subscription. Every future API-side feature is included.
              </div>
            </div>

            <div style={{
              background: t.card, border: `1px solid ${t.cardBorder}`,
              borderRadius: 10, padding: '10px 12px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.text, marginBottom: 8 }}>
                What Max unlocks
              </div>
              {MAX_FEATURES.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', fontSize: 11, color: t.text,
                  borderTop: i > 0 ? `1px solid ${t.cardBorder}` : 0,
                }}>
                  <span style={{ color: t.green, display: 'inline-flex', flexShrink: 0 }}>{Icons.check}</span>
                  <span>{f.label}</span>
                </div>
              ))}
            </div>

            <button
              onClick={openBuy}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10,
                background: t.accent, color: '#fff', border: 0,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', marginBottom: 10,
                boxShadow: '0 2px 12px rgba(124,92,255,0.35)',
              }}
            >Unlock Tokenly Max — $5.99</button>

            <div style={{
              fontSize: 9.5, color: t.textMute, lineHeight: 1.5, textAlign: 'center',
              padding: '6px 8px',
            }}>
              Lost your code? Visit <span style={{ color: t.accent2 }}>trytokenly.app/recover</span> and we'll email a fresh one.
            </div>
          </React.Fragment>
        )}
      </section>
    </React.Fragment>
  );
}

window.LicenseSheet = LicenseSheet;
