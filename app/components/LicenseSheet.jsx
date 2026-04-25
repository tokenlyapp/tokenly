// License sheet — Tokenly Max + Max + AI upgrade and activation UX.
// Three tiers:
//   free    — keyless providers only, read-only pricing.
//   max     — $5.99 one-time. Admin-API providers, analytics, exports, budgets.
//   max-ai  — $8.99 one-time. Everything in Max plus chat (text + web search)
//             and voice (push-to-talk + standalone voice AI window).
const { useState: useStateL, useEffect: useEffectL } = React;

// Live $5.99 Tokenly Max one-time Payment Link.
const BUY_MAX_URL = 'https://buy.stripe.com/8x2fZga2HawRcQq9YD0sU0a';
// Max + AI one-time Payment Link ($8.99 lifetime).
const BUY_MAX_AI_URL = 'https://buy.stripe.com/4gMeVcfn15cx5nY4Ej0sU0c';

const MAX_FEATURES = [
  { label: 'OpenAI API · Anthropic API · OpenRouter usage tracking' },
  { label: 'Daily budget alerts + spend summary' },
  { label: 'Analytics, charts, PDF + CSV export' },
  { label: 'Menu-bar token counter for API sources' },
];
const MAX_AI_EXTRA = [
  { label: 'Tokenly Chat — direct API chat with OpenAI, Claude, Gemini' },
  { label: 'Web search built in (toggle in composer)' },
  { label: 'Live dictation — talk and watch your words appear' },
  { label: 'Voice AI window — ⌘⇧V hands-free brainstorming' },
  { label: 'Unified history across chats + Claude Code sessions' },
];

function LicenseSheet({ open, onClose, onBack, tier, license, onLicenseChange, onOpenExternal }) {
  const t = TOKENS.color;
  const isMax = tier === 'max' || tier === 'max-ai';
  const isAi  = tier === 'max-ai';

  const [code, setCode] = useStateL('');
  const [busy, setBusy] = useStateL(false);
  const [error, setError] = useStateL(null);
  const [flash, setFlash] = useStateL(null); // 'activated' | 'removed' | null

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
          : reason === 'subscription_canceled' || reason === 'subscription_past_due'
            ? 'This legacy Max + AI subscription isn\'t active anymore. Email support@trytokenly.app and we\'ll move you to the new lifetime tier.'
          : reason === 'wrong_product'
            ? 'That activation code is for a different product. Double-check the email you\'re pasting from.'
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
    const confirmed = window.confirm(
      'Remove your activation code from this Mac?\n\n' +
      'Heads-up — you paid a one-time fee for lifetime access. Your code still works forever, so there\'s nothing to re-buy if you change your mind.\n\n' +
      'Lost your code later? Visit trytokenly.app/recover and we\'ll re-send it.\n\n' +
      'Still want to remove it on this Mac?'
    );
    if (!confirmed) return;
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

  const openBuy = (url) => { onOpenExternal ? onOpenExternal(url) : window.open(url, '_blank'); };

  const activatedLabel = license?.activated_at
    ? new Date(license.activated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const lockIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );

  const tierStatusLabel = isAi ? 'Max + AI active' : (isMax ? 'Tokenly Max active' : 'Free tier');

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
        {!onBack && <SheetMinimize onClick={onClose} />}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBack && (
            <IconBtn onClick={onBack} title="Back">{Icons.arrowLeft}</IconBtn>
          )}
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Tokenly Max</div>
        </div>

        {/* Tier status banner */}
        <div style={{
          background: isMax
            ? 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(34,211,238,0.10))'
            : 'rgba(255,255,255,0.04)',
          border: isMax ? '1px solid rgba(52,211,153,0.35)' : `1px solid ${t.cardBorder}`,
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
            <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}>
              {tierStatusLabel}
              {isAi && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                  padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                  color: '#1a1408', lineHeight: 1,
                  background: 'linear-gradient(135deg, #ffd772, #e8a441)',
                  border: '1px solid rgba(232,164,65,0.55)',
                }}>+ AI</span>
              )}
            </div>
            <div style={{ fontSize: 10, color: t.textDim, marginTop: 2, lineHeight: 1.45 }}>
              {isMax
                ? (activatedLabel ? `Activated ${activatedLabel} · lifetime, no subscription` : 'Active on this Mac · lifetime')
                : 'Claude Code, Codex CLI, and Gemini CLI usage only.'}
            </div>
          </div>
        </div>

        {/* Free tier — show both pricing options side by side */}
        {!isMax && (
          <React.Fragment>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <PricingCard
                t={t}
                title="Max"
                price="$5.99"
                cadence="one-time"
                tagline="Lifetime access. Pay once, unlock forever."
                features={MAX_FEATURES}
                buttonLabel="Buy Max"
                onClick={() => openBuy(BUY_MAX_URL)}
                accent={t.accent}
              />
              <PricingCard
                t={t}
                title="Max + AI"
                price="$8.99"
                cadence="one-time · lifetime"
                tagline="Everything in Max + Tokenly Chat & Voice AI."
                features={[...MAX_FEATURES, ...MAX_AI_EXTRA]}
                buttonLabel="Buy Max + AI"
                onClick={() => openBuy(BUY_MAX_AI_URL)}
                highlighted
                accent="#e8a441"
              />
            </div>
          </React.Fragment>
        )}

        {/* Max-only — offer upgrade to Max + AI */}
        {isMax && !isAi && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,215,114,0.16), rgba(232,164,65,0.06))',
            border: '1px solid rgba(232,164,65,0.45)',
            borderRadius: 12, padding: '14px 16px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>Add AI for $8.99 lifetime</div>
            </div>
            <div style={{ fontSize: 11, color: t.textDim, marginTop: 4, lineHeight: 1.5, marginBottom: 10 }}>
              One-time payment. Unlock Tokenly Chat, web search, live dictation, and the standalone voice AI window. Chat + voice usage is billed directly to your provider API account.
            </div>
            {MAX_AI_EXTRA.slice(0, 3).map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 0', fontSize: 11, color: t.text,
              }}>
                <span style={{ color: '#e8a441', display: 'inline-flex', flexShrink: 0 }}>{Icons.check}</span>
                <span>{f.label}</span>
              </div>
            ))}
            <button
              onClick={() => openBuy(BUY_MAX_AI_URL)}
              style={{
                marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 9,
                background: 'linear-gradient(135deg, #ffd772, #e8a441)',
                color: '#1a1408', border: 0,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                letterSpacing: '0.02em',
              }}
            >Upgrade to Max + AI · $8.99</button>
          </div>
        )}

        {/* Activation code panel — always visible so toggling tier in/out is one place. */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>Activation code</div>
          <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.5, marginBottom: 10 }}>
            {isMax
              ? 'This code is unlocking your tier on this Mac. Remove to return to Free; paste again anytime to come back.'
              : 'Paste the code from your Tokenly purchase email. Starts with '}
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
            }}>Activated. Welcome aboard.</div>
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

        <div style={{
          fontSize: 9.5, color: t.textMute, lineHeight: 1.5, textAlign: 'center',
          padding: '4px 8px',
        }}>
          Lost your code? Visit <span style={{ color: t.accent2 }}>trytokenly.app/recover</span> and we'll email a fresh one.
        </div>
      </section>
    </React.Fragment>
  );
}

window.LicenseSheet = LicenseSheet;

function PricingCard({ t, title, price, cadence, tagline, features, buttonLabel, onClick, highlighted, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: highlighted
        ? 'linear-gradient(135deg, rgba(255,215,114,0.16), rgba(232,164,65,0.06))'
        : 'rgba(255,255,255,0.03)',
      border: `1px solid ${highlighted ? 'rgba(232,164,65,0.5)' : t.cardBorder}`,
      borderRadius: 12, padding: '12px 12px 14px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: t.text, letterSpacing: '-0.01em' }}>{title}</div>
        {highlighted && (
          <span style={{
            fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em',
            padding: '2px 5px', borderRadius: 4, textTransform: 'uppercase',
            color: '#1a1408', lineHeight: 1,
            background: 'linear-gradient(135deg, #ffd772, #e8a441)',
          }}>Recommended</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: t.text, letterSpacing: '-0.02em' }}>{price}</div>
        <div style={{ fontSize: 10, color: t.textDim, fontWeight: 500 }}>{cadence}</div>
      </div>
      <div style={{ fontSize: 10.5, color: t.textDim, lineHeight: 1.45, minHeight: 30 }}>{tagline}</div>
      <div style={{ flex: 1 }}>
        {features.slice(0, 6).map((f, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 6,
            padding: '3px 0', fontSize: 10.5, color: t.textDim, lineHeight: 1.4,
          }}>
            <span style={{ color: accent, display: 'inline-flex', flexShrink: 0, marginTop: 2 }}>{Icons.check}</span>
            <span>{f.label}</span>
          </div>
        ))}
        {features.length > 6 && (
          <div style={{ fontSize: 10, color: t.textMute, marginTop: 4, paddingLeft: 16 }}>
            +{features.length - 6} more
          </div>
        )}
      </div>
      <button
        onClick={onClick}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 8,
          background: highlighted ? 'linear-gradient(135deg, #ffd772, #e8a441)' : t.accent,
          color: highlighted ? '#1a1408' : '#fff',
          border: 0, fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em',
        }}
      >{buttonLabel}</button>
    </div>
  );
}
