// API Keys sheet — admin-key disclaimer + one input row per admin-API provider
// (OpenAI, Anthropic, OpenRouter). Split out from SettingsSheet so the main
// settings screen stays scannable. Navigated to from Settings → "API Keys →".
const { useState: useStateK } = React;

function ApiKeysSheet({
  open, onClose, onBack,
  savedKeys = {},
  onSave, onRemove, onOpenExternal,
}) {
  const t = TOKENS.color;
  const [revealed, setRevealed] = useStateK({});
  const [drafts, setDrafts] = useStateK({});
  const [saving, setSaving] = useStateK({});

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
          // Max-only sheet: gold top edge + subtle glow marks it as a premium surface.
          borderTop: '1px solid rgba(232,164,65,0.45)',
          boxShadow: '0 -1px 24px rgba(232,164,65,0.12)',
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
            <IconBtn onClick={onBack} title="Back to Settings">{Icons.arrowLeft}</IconBtn>
          )}
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            API Keys
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
              color: '#1a1408', lineHeight: 1,
              background: 'linear-gradient(135deg, #ffd772, #e8a441)',
              border: '1px solid rgba(232,164,65,0.55)',
            }}>Max</span>
          </div>
        </div>
        <div style={{
          fontSize: 10.5, color: t.textDim, marginTop: 4, marginBottom: 12, lineHeight: 1.5,
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
window.ApiKeysSheet = ApiKeysSheet;
