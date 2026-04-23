// License sheet — Tokenly Max upgrade + activation UX.
// Free users land here from any locked entry (API Keys, Budget alerts, API
// provider cards). Max users see their activation info + a deactivate button
// (useful for support / reinstalls).
const { useState: useStateL, useEffect: useEffectL } = React;

// Live $5.99 Tokenly Max Stripe Payment Link. Mirrors the one on
// trytokenly.app's Buy button so a buyer who lost their activation email
// can re-purchase from inside the app (rare, but harmless).
const BUY_URL = 'https://buy.stripe.com/8x2fZga2HawRcQq9YD0sU0a';

const MAX_FEATURES = [
  { label: 'OpenAI API · Anthropic API · OpenRouter',   bundled: true },
  { label: 'Daily budget alerts + spend summary',       bundled: true },
  { label: 'Menu-bar token counter for API sources',    bundled: true },
  { label: 'All future API-side features',              bundled: true },
];

function LicenseSheet({ open, onClose, onBack, tier, license, onLicenseChange, onOpenExternal }) {
  const t = TOKENS.color;
  const [code, setCode] = useStateL('');
  const [busy, setBusy] = useStateL(false);
  const [error, setError] = useStateL(null);
  const [justActivated, setJustActivated] = useStateL(false);

  // Reset transient state every time the sheet reopens.
  useEffectL(() => {
    if (!open) {
      setCode(''); setError(null); setJustActivated(false);
    }
  }, [open]);

  const isMax = tier === 'max';

  const activate = async () => {
    if (busy) return;
    const trimmed = code.trim();
    if (!trimmed) { setError('Paste the activation code from your purchase email.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await window.api.activateLicense(trimmed);
      if (!res?.ok) {
        const reason = res?.reason || 'unknown';
        setError(
          reason === 'invalid_format'
            ? 'That doesn\'t look like a Tokenly activation code. It should start with "cs_".'
            : `Activation failed (${reason}).`
        );
      } else {
        setJustActivated(true);
        setCode('');
        onLicenseChange && onLicenseChange(res);
      }
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (busy) return;
    if (!window.confirm('Deactivate Tokenly Max on this Mac? Your activation code can reactivate anytime.')) return;
    setBusy(true);
    try {
      await window.api.deactivateLicense();
      onLicenseChange && onLicenseChange({ tier: 'free', license: null });
    } finally {
      setBusy(false);
    }
  };

  const openBuy = () => {
    onOpenExternal ? onOpenExternal(BUY_URL) : window.open(BUY_URL, '_blank');
  };

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
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
            {isMax ? 'Tokenly Max' : 'Unlock Tokenly Max'}
          </div>
        </div>

        {isMax ? <ActiveBlock license={license} onDeactivate={deactivate} busy={busy} t={t} /> : (
          <React.Fragment>
            {/* Hero */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(124,92,255,0.18), rgba(34,211,238,0.12))',
              border: '1px solid rgba(124,92,255,0.35)',
              borderRadius: 12,
              padding: '14px 16px',
              marginTop: 8, marginBottom: 12,
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

            {/* Features */}
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
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${t.cardBorder}`, lineHeight: 1.45 }}>
                Free keeps: Claude Code · Codex CLI · Gemini CLI (the three local sources) + pricing sheet + settings.
              </div>
            </div>

            {/* Buy button */}
            <button
              onClick={openBuy}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 10,
                background: t.accent, color: '#fff', border: 0,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', marginBottom: 14,
                boxShadow: '0 2px 12px rgba(124,92,255,0.35)',
              }}
            >Unlock Tokenly Max — $5.99</button>

            {/* Activation code */}
            <div style={{
              background: t.card, border: `1px solid ${t.cardBorder}`,
              borderRadius: 10, padding: '10px 12px', marginBottom: 10,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.text }}>Already paid?</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                Paste the activation code from your purchase email. It starts with{' '}
                <span style={{ fontFamily: TOKENS.type.mono, color: t.textDim }}>cs_…</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
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
              {error && (
                <div style={{
                  fontSize: 10.5, color: t.red, marginTop: 8, lineHeight: 1.4,
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.2)',
                  borderRadius: 6, padding: '6px 8px',
                }}>{error}</div>
              )}
              {justActivated && (
                <div style={{
                  fontSize: 10.5, color: t.green, marginTop: 8, lineHeight: 1.4,
                  background: 'rgba(52,211,153,0.08)',
                  border: '1px solid rgba(52,211,153,0.25)',
                  borderRadius: 6, padding: '6px 8px',
                }}>Tokenly Max activated. Welcome aboard.</div>
              )}
            </div>

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

function ActiveBlock({ license, onDeactivate, busy, t }) {
  const activatedLabel = license?.activated_at
    ? new Date(license.activated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(34,211,238,0.10))',
        border: '1px solid rgba(52,211,153,0.35)',
        borderRadius: 12,
        padding: '12px 14px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: 'rgba(52,211,153,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: t.green, flexShrink: 0,
        }}>{Icons.check}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>Tokenly Max active</div>
          <div style={{ fontSize: 10, color: t.textDim, marginTop: 2 }}>
            {activatedLabel ? `Activated ${activatedLabel}` : 'Active on this Mac.'}
          </div>
        </div>
      </div>

      {license?.session_id && (
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 10.5, color: t.textDim, marginBottom: 4 }}>Activation code</div>
          <div style={{
            fontFamily: TOKENS.type.mono, fontSize: 11, color: t.text,
            wordBreak: 'break-all', userSelect: 'all',
          }}>{license.session_id}</div>
        </div>
      )}

      <button
        onClick={onDeactivate}
        disabled={busy}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 8,
          background: 'rgba(248,113,113,0.12)', color: t.red,
          border: '1px solid rgba(248,113,113,0.3)',
          fontSize: 11, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.55 : 1, fontFamily: 'inherit',
        }}
      >Deactivate on this Mac</button>
      <div style={{
        fontSize: 9.5, color: t.textMute, lineHeight: 1.5, textAlign: 'center',
        marginTop: 6,
      }}>
        Useful before uninstalling or handing the Mac off. Your activation code reactivates anytime.
      </div>
    </div>
  );
}

window.LicenseSheet = LicenseSheet;
