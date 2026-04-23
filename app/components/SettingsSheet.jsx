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
  onOpenLicense,
  isPro = false,
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

        {/* Tokenly Max — always visible so Max users can always reach the
            activation sheet to view or remove their code. Free users get
            an upgrade CTA here too, right alongside the locked entries
            below. */}
        {onOpenLicense && (
          <button
            onClick={onOpenLicense}
            style={{
              width: '100%', textAlign: 'left',
              background: isPro
                ? 'linear-gradient(135deg, rgba(232,164,65,0.10), rgba(124,92,255,0.05))'
                : t.card,
              border: isPro
                ? '1px solid rgba(232,164,65,0.35)'
                : `1px solid ${t.cardBorder}`,
              borderRadius: 10, padding: '10px 12px', marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              cursor: 'pointer', fontFamily: 'inherit', color: t.text,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                Tokenly Max
                {isPro && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                    padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                    color: '#1a1408', lineHeight: 1,
                    background: 'linear-gradient(135deg, #ffd772, #e8a441)',
                    border: '1px solid rgba(232,164,65,0.55)',
                  }}>Max</span>
                )}
              </div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                {isPro
                  ? 'Active on this Mac. View your activation code or remove it here.'
                  : 'Unlock the APIs + budget alerts for $5.99 lifetime.'}
              </div>
            </div>
            {isPro ? (
              <span style={{ color: t.textDim, flexShrink: 0, fontSize: 14 }}>→</span>
            ) : (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                color: t.accent, background: 'rgba(124,92,255,0.12)',
                border: '1px solid rgba(124,92,255,0.3)',
                padding: '3px 7px', borderRadius: 5, flexShrink: 0, whiteSpace: 'nowrap',
              }}>Unlock Max</span>
            )}
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
              <option value="all">{isPro ? 'All providers' : 'All (local tools)'}</option>
              <optgroup label="Local tools (subscription-bundled)">
                {PROVIDERS.filter((p) => p.keyless).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
              {isPro && (
                <optgroup label="API billing (pay-as-you-go)">
                  {PROVIDERS.filter((p) => !p.keyless).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              )}
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

        {/* View current pricing — always accessible (Free + Max) */}
        {onOpenPricing && (
          <SettingsEntry
            t={t}
            title="View current LLM token pricing"
            subtitle="Per-model USD rates the app uses to estimate cost. Auto-refreshed daily."
            onClick={onOpenPricing}
          />
        )}

        {/* API Keys — locked behind Tokenly Max */}
        {onOpenApiKeys && (
          <SettingsEntry
            t={t}
            title="API Keys"
            subtitle={
              isPro
                ? (savedKeyCount > 0
                    ? `${savedKeyCount} saved · encrypted with your OS keychain.`
                    : 'Add admin keys for OpenAI, Anthropic, or OpenRouter to track API billing.')
                : 'Connect OpenAI, Anthropic, or OpenRouter admin keys.'
            }
            locked={!isPro}
            onClick={isPro ? onOpenApiKeys : onOpenLicense}
          />
        )}

        {/* Budget alerts — locked behind Tokenly Max */}
        {onOpenBudgets && (
          <SettingsEntry
            t={t}
            title="Set budget alerts"
            subtitle={
              isPro
                ? 'Daily $ thresholds for API spend + daily spend summary notification.'
                : 'Get notified when API spend crosses 50% / 80% / 100% of your daily budget.'
            }
            locked={!isPro}
            onClick={isPro ? onOpenBudgets : onOpenLicense}
          />
        )}
      </section>
    </React.Fragment>
  );
}

// Navigation row used for each "→" entry in the Settings sheet. When
// `locked`, dims the content and swaps the arrow for a 🔒 + "Unlock
// Tokenly Max" chip. Click still routes — caller decides whether to open
// the real sheet or the LicenseSheet.
function SettingsEntry({ t, title, subtitle, onClick, locked }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        background: t.card, border: `1px solid ${locked ? 'rgba(124,92,255,0.22)' : t.cardBorder}`,
        borderRadius: 10, padding: '10px 12px', marginBottom: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        cursor: 'pointer', fontFamily: 'inherit', color: t.text,
        opacity: locked ? 0.72 : 1,
        transition: 'opacity .15s, border-color .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {locked && (
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'rgba(124,92,255,0.15)',
            border: '1px solid rgba(124,92,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: t.accent, flexShrink: 0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{title}</div>
          <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>{subtitle}</div>
        </div>
      </div>
      {locked ? (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          color: t.accent, background: 'rgba(124,92,255,0.12)',
          border: '1px solid rgba(124,92,255,0.3)',
          padding: '3px 7px', borderRadius: 5, flexShrink: 0, whiteSpace: 'nowrap',
        }}>Unlock Max</span>
      ) : (
        <span style={{ color: t.textDim, flexShrink: 0, fontSize: 14 }}>→</span>
      )}
    </button>
  );
}

window.SettingsSheet = SettingsSheet;
