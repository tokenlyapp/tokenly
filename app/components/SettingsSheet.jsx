// Settings sheet — app-level preferences. API key management lives in its
// own ApiKeysSheet (reached via the "API Keys →" entry below).
function SettingsSheet({
  open, onClose, savedKeys = {},
  badgeStyle = 'monogram', onBadgeStyleChange,
  trayMode = 'off', onTrayModeChange,
  traySource = 'all', onTraySourceChange,
  currentDays = 30,
  onOpenPricing,
  onOpenBudgets,
  onOpenApiKeys,
}) {
  // Human label for the current window: "24h" / "7d" / "Last 30d" etc.
  const rangeShort = {
    1: '24h', 7: '7d', 14: '14d', 30: '30d', 90: '90d', 180: '180d',
  }[currentDays] || (currentDays + 'd');
  const t = TOKENS.color;

  const savedKeyCount = Object.values(savedKeys || {}).filter(Boolean).length;

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

        {/* Appearance — badge style toggle */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '10px 12px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Icon appearance</div>
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
              <div style={{ fontSize: 12, fontWeight: 600 }}>View current LLM token pricing</div>
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
              borderRadius: 10, padding: '10px 12px', marginBottom: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              cursor: 'pointer', fontFamily: 'inherit', color: t.text,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Set budget alerts</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                Daily $ thresholds for API spend + daily spend summary notification.
              </div>
            </div>
            <span style={{ color: t.textDim, flexShrink: 0, fontSize: 14 }}>→</span>
          </button>
        )}

        {/* API Keys — opens the dedicated key-management sheet */}
        {onOpenApiKeys && (
          <button
            onClick={onOpenApiKeys}
            style={{
              width: '100%', textAlign: 'left',
              background: t.card, border: `1px solid ${t.cardBorder}`,
              borderRadius: 10, padding: '10px 12px', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              cursor: 'pointer', fontFamily: 'inherit', color: t.text,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>API Keys</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                {savedKeyCount > 0
                  ? `${savedKeyCount} saved · encrypted with your OS keychain.`
                  : 'Add admin keys for OpenAI, Anthropic, or OpenRouter to track API billing.'}
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
      </section>
    </React.Fragment>
  );
}
window.SettingsSheet = SettingsSheet;
