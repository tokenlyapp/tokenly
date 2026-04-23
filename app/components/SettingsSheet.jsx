// Settings sheet — slides up from bottom with API key rows.
const { useState: useStateS } = React;

function SettingsSheet({
  open, onClose, savedKeys = {}, onSave, onRemove, onOpenExternal,
  badgeStyle = 'monogram', onBadgeStyleChange,
  trayMode = 'off', onTrayModeChange,
  traySource = 'all', onTraySourceChange,
  currentDays = 30,
  onOpenPricing,
  onOpenBudgets,
}) {
  // Human label for the current window: "24h" / "7d" / "Last 30d" etc.
  const rangeShort = {
    1: '24h', 7: '7d', 14: '14d', 30: '30d', 90: '90d', 180: '180d',
  }[currentDays] || (currentDays + 'd');
  const t = TOKENS.color;
  const [revealed, setRevealed] = useStateS({});
  const [drafts, setDrafts] = useStateS({});
  const [saving, setSaving] = useStateS({});

  const doSave = async (pid) => {
    const v = (drafts[pid] || '').trim();
    if (!v) return;
    setSaving({ ...saving, [pid]: true });
    try {
      await onSave(pid, v);
      setDrafts((d) => ({ ...d, [pid]: '' }));
    } finally {
      setSaving((s) => ({ ...s, [pid]: false }));
    }
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
          maxHeight: '88%',
          overflowY: 'auto',
        }}
      >
        <div style={{
          width: 36, height: 4, background: 'rgba(255,255,255,0.15)',
          borderRadius: 2, margin: '0 auto 10px',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>API Keys</div>
          <IconBtn onClick={onClose} title="Close">{Icons.close}</IconBtn>
        </div>
        <div style={{
          fontSize: 10.5, color: t.textDim, marginTop: 4, marginBottom: 10, lineHeight: 1.5,
        }}>
          Keys are encrypted with your OS keychain and never leave this machine.
        </div>

        {/* Admin-key required banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(124,92,255,0.10))',
          border: '1px solid rgba(251,191,36,0.28)',
          borderRadius: 10, padding: '10px 12px', marginBottom: 12,
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'rgba(251,191,36,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: t.amber, flexShrink: 0, fontWeight: 700, fontSize: 13,
          }}>!</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: t.text, letterSpacing: '-0.01em' }}>
              Admin API keys required
            </div>
            <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 3, lineHeight: 1.45 }}>
              Usage and cost endpoints only accept <span style={{ fontFamily: TOKENS.type.mono, color: t.text }}>sk-admin-…</span> (OpenAI)
              and <span style={{ fontFamily: TOKENS.type.mono, color: t.text }}>sk-ant-admin01-…</span> (Anthropic) keys.
              Regular project keys will fail with 401/403.
            </div>
          </div>
        </div>

        {/* Appearance — badge style toggle */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Appearance</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                Show brand logos or colored monograms for each provider.
              </div>
            </div>
            <div style={{
              display: 'inline-flex', background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: 2, flexShrink: 0,
            }}>
              {[
                { v: 'monogram', label: 'Initials' },
                { v: 'logo', label: 'Logos' },
              ].map((opt) => {
                const active = badgeStyle === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => onBadgeStyleChange && onBadgeStyleChange(opt.v)}
                    style={{
                      background: active ? t.accent : 'transparent',
                      color: active ? '#fff' : t.textDim,
                      border: 0, padding: '4px 10px', borderRadius: 6,
                      fontSize: 10.5, fontWeight: 500, cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background .15s, color .15s',
                    }}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {PROVIDERS.map((p) => (
              <ProviderBadge key={p.id} id={p.id} size={28} radius={7} />
            ))}
          </div>
        </div>

        {/* View current pricing — opens the read-only rates sheet */}
        {onOpenPricing && (
          <button
            onClick={onOpenPricing}
            style={{
              width: '100%', textAlign: 'left',
              background: t.card, border: `1px solid ${t.cardBorder}`,
              borderRadius: 10, padding: '10px 12px', marginBottom: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              cursor: 'pointer', fontFamily: 'inherit', color: t.text,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>View current pricing</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                Per-model USD rates the app uses to estimate cost. Auto-refreshed daily.
              </div>
            </div>
            <span style={{ color: t.textDim, flexShrink: 0, fontSize: 14 }}>→</span>
          </button>
        )}

        {/* Budget alerts — opens the budgets configuration sheet */}
        {onOpenBudgets && (
          <button
            onClick={onOpenBudgets}
            style={{
              width: '100%', textAlign: 'left',
              background: t.card, border: `1px solid ${t.cardBorder}`,
              borderRadius: 10, padding: '10px 12px', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              cursor: 'pointer', fontFamily: 'inherit', color: t.text,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Budget alerts</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                Daily $ thresholds for API spend + daily spend summary notification.
              </div>
            </div>
            <span style={{ color: t.textDim, flexShrink: 0, fontSize: 14 }}>→</span>
          </button>
        )}

        {/* Menu bar tokens — dual control: which source, which period */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 12,
        }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Menu bar tokens</div>
            <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
              Show a live token count next to the Tokenly icon. Pick which provider and which time window.
            </div>
          </div>

          {/* Source dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: t.textDim, flexShrink: 0, width: 48 }}>Source</div>
            <select
              value={traySource}
              onChange={(e) => onTraySourceChange && onTraySourceChange(e.target.value)}
              style={{
                flex: 1,
                appearance: 'none', WebkitAppearance: 'none',
                background: 'rgba(0,0,0,0.3)',
                border: `1px solid ${t.cardBorder}`,
                color: t.text, borderRadius: 7, padding: '6px 10px',
                fontSize: 11, fontWeight: 500, cursor: 'pointer',
                fontFamily: 'inherit', outline: 'none',
              }}
            >
              <option value="all">All providers</option>
              <optgroup label="Local tools (subscription-bundled)">
                {PROVIDERS.filter((p) => p.keyless).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
              <optgroup label="API billing (pay-as-you-go)">
                {PROVIDERS.filter((p) => !p.keyless).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Period segmented control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 11, color: t.textDim, flexShrink: 0, width: 48 }}>Period</div>
            <div style={{
              flex: 1,
              display: 'flex', background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${t.cardBorder}`, borderRadius: 7, padding: 2, gap: 1,
            }}>
              {[
                { v: 'off',    label: 'Off' },
                { v: 'today',  label: 'Today' },
                { v: 'window', label: `Last ${rangeShort}` },
                { v: 'hybrid', label: 'Both' },
              ].map((opt) => {
                const active = trayMode === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => onTrayModeChange && onTrayModeChange(opt.v)}
                    style={{
                      flex: 1,
                      background: active ? t.accent : 'transparent',
                      color: active ? '#fff' : t.textDim,
                      border: 0, padding: '5px 8px', borderRadius: 6,
                      fontSize: 10.5, fontWeight: 500, cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontVariantNumeric: 'tabular-nums',
                      transition: 'background .15s, color .15s',
                      whiteSpace: 'nowrap',
                    }}
                    title={
                      opt.v === 'today'  ? 'Tokens consumed since 00:00 UTC today.' :
                      opt.v === 'window' ? `Rolling total for the last ${rangeShort}. Matches what the card shows for the selected source.` :
                      opt.v === 'hybrid' ? `Today (since 00:00 UTC) / Last ${rangeShort}` :
                      'Hide the token count'
                    }
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>
        </div>

        {PROVIDERS.filter((p) => !p.keyless).map((p) => {
          const saved = savedKeys[p.id];
          const isRev = revealed[p.id];
          const val = drafts[p.id] || '';
          const busy = saving[p.id];
          return (
            <div key={p.id} style={{
              background: t.card, border: `1px solid ${t.cardBorder}`,
              borderRadius: 10, padding: '10px 12px', marginBottom: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 12, minWidth: 0 }}>
                  <ProviderBadge id={p.id} size={20} radius={5} />
                  {p.name}
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                    color: t.amber, background: 'rgba(251,191,36,0.12)',
                    border: '1px solid rgba(251,191,36,0.3)',
                    padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                  }}>Admin key</span>
                </div>
                {saved && (
                  <div style={{ fontSize: 10, color: t.green, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {Icons.check}
                    <span style={{ fontFamily: TOKENS.type.mono }}>Saved ••••{saved}</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, color: t.textMute, marginBottom: 8, lineHeight: 1.45 }}>
                {p.keyHelp}{' '}
                <a
                  onClick={() => onOpenExternal && onOpenExternal(`https://${p.keyLink}`)}
                  style={{ color: t.accent2, cursor: 'pointer', textDecoration: 'none' }}
                >Get admin key →</a>
              </div>
              {val && p.keyPrefix && !val.startsWith(p.keyPrefix) && (
                <div style={{
                  fontSize: 10, color: t.red, marginBottom: 6, lineHeight: 1.4,
                  background: 'rgba(248,113,113,0.08)',
                  border: '1px solid rgba(248,113,113,0.2)',
                  borderRadius: 6, padding: '5px 8px',
                }}>
                  This doesn't look like an admin key. It should start with <span style={{ fontFamily: TOKENS.type.mono }}>{p.keyPrefix}</span>.
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={val}
                  onChange={(e) => setDrafts({ ...drafts, [p.id]: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') doSave(p.id); }}
                  placeholder={p.keyPlaceholder}
                  spellCheck={false}
                  autoComplete="off"
                  style={{
                    flex: 1, minWidth: 0,
                    background: 'rgba(0,0,0,0.3)',
                    border: `1px solid ${t.cardBorder}`,
                    color: t.text,
                    padding: '7px 10px', borderRadius: 7,
                    fontSize: 11, fontFamily: TOKENS.type.mono,
                    outline: 'none',
                    WebkitTextSecurity: isRev ? 'none' : 'disc',
                    userSelect: 'text',
                  }}
                />
                <button
                  onClick={() => setRevealed({ ...revealed, [p.id]: !isRev })}
                  title={isRev ? 'Hide' : 'Show'}
                  style={{
                    width: 28, height: 28, background: t.card,
                    border: `1px solid ${t.cardBorder}`, borderRadius: 7,
                    color: t.textDim, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', padding: 0,
                  }}
                >{Icons.eye}</button>
                <button
                  onClick={() => doSave(p.id)}
                  disabled={busy || !val}
                  style={{
                    background: t.accent, color: '#fff', border: 0,
                    padding: '0 12px', borderRadius: 7, fontSize: 11,
                    fontWeight: 500, cursor: busy || !val ? 'default' : 'pointer',
                    opacity: busy || !val ? 0.55 : 1,
                    fontFamily: 'inherit',
                  }}
                >{busy ? '…' : 'Save'}</button>
                {saved && (
                  <button
                    onClick={() => onRemove(p.id)}
                    style={{
                      background: 'rgba(248,113,113,0.15)', color: t.red,
                      border: `1px solid rgba(248,113,113,0.3)`,
                      padding: '0 10px', borderRadius: 7, fontSize: 11,
                      fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >Remove</button>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </React.Fragment>
  );
}
window.SettingsSheet = SettingsSheet;
