// Settings sheet — app-level preferences. API key management lives in its
// own ApiKeysSheet (reached via the "API Keys →" entry below).
function SettingsSheet({
  open, onClose, onBack,
  badgeStyle = 'monogram', onBadgeStyleChange,
  trayMode = 'off', onTrayModeChange,
  traySource = 'all', onTraySourceChange,
  trayContent = 'tokens', onTrayContentChange,
  trayQuota = 'claude-code:5h', onTrayQuotaChange,
  currentDays = 30,
  usage = {},
  isPro = false,
}) {
  // Human label for the current window: "24h" / "7d" / "Last 30d" etc.
  const rangeShort = {
    1: '24h', 7: '7d', 14: '14d', 30: '30d', 90: '90d', 180: '180d',
  }[currentDays] || (currentDays + 'd');
  const t = TOKENS.color;

  // Launch-at-login state. Loaded from main on mount + every time the sheet
  // opens (covers users who toggled it externally via System Settings).
  const [launchAtLogin, setLaunchAtLoginState] = React.useState({ supported: true, enabled: false });
  React.useEffect(() => {
    if (!open || !window.api?.getLaunchAtLogin) return;
    window.api.getLaunchAtLogin().then((s) => s && setLaunchAtLoginState(s));
  }, [open]);
  const toggleLaunchAtLogin = async () => {
    if (!window.api?.setLaunchAtLogin) return;
    const next = !launchAtLogin.enabled;
    setLaunchAtLoginState((s) => ({ ...s, enabled: next })); // optimistic
    const res = await window.api.setLaunchAtLogin(next);
    if (res) setLaunchAtLoginState(res);
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
        {onBack ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <IconBtn onClick={onBack} title="Back to menu">{Icons.arrowLeft}</IconBtn>
            <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Settings</div>
          </div>
        ) : (
          <SheetMinimize onClick={onClose} />
        )}

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

        {/* Launch at login — table-stakes for menu-bar apps. macOS-only;
            the toggle hides on platforms where setLoginItemSettings isn't
            available (no current Tokenly distribution targets non-macOS, but
            the renderer is robust to it). */}
        {launchAtLogin.supported && (
          <div style={{
            background: t.card, border: `1px solid ${t.cardBorder}`,
            borderRadius: 10, padding: '10px 12px', marginBottom: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Launch at login</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                Open Tokenly automatically when you sign in. Starts hidden — only the tray icon appears.
              </div>
            </div>
            <button
              onClick={toggleLaunchAtLogin}
              role="switch"
              aria-checked={launchAtLogin.enabled}
              style={{
                position: 'relative',
                width: 38, height: 22, borderRadius: 999,
                border: 0, cursor: 'pointer', flexShrink: 0,
                background: launchAtLogin.enabled ? t.accent : 'rgba(255,255,255,0.10)',
                transition: 'background .15s',
                padding: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 2, left: 2,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff',
                transform: launchAtLogin.enabled ? 'translateX(16px)' : 'translateX(0)',
                transition: 'transform .18s cubic-bezier(0.22, 1, 0.36, 1)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }} />
            </button>
          </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
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

          {/* Content selector — tokens / quota / both. Picks WHAT goes in the
              menu bar title alongside the icon. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: t.textDim, flexShrink: 0, width: 48 }}>Show</div>
            <div style={{
              flex: 1,
              display: 'flex', background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${t.cardBorder}`, borderRadius: 7, padding: 2, gap: 1,
            }}>
              {[
                { v: 'tokens', label: 'Tokens',  title: 'Show only token counts (the existing behavior).' },
                { v: 'quota',  label: 'Quota',   title: 'Show only a subscription quota %, like Claude 5h 73%.' },
                { v: 'both',   label: 'Both',    title: 'Tokens · Quota %, separated by a dot.' },
              ].map((opt) => {
                const active = trayContent === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => onTrayContentChange && onTrayContentChange(opt.v)}
                    title={opt.title}
                    style={{
                      flex: 1,
                      background: active ? t.accent : 'transparent',
                      color: active ? '#fff' : t.textDim,
                      border: 0, padding: '5px 8px', borderRadius: 6,
                      fontSize: 10.5, fontWeight: 500, cursor: 'pointer',
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                      transition: 'background .15s, color .15s',
                    }}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>

          {/* Quota source — which provider/window to display when content
              includes a quota. Options are derived from currently-loaded
              quota data so we never show a window the user can't actually
              read right now. */}
          {(trayContent === 'quota' || trayContent === 'both') && (() => {
            const opts = [];
            const claude = usage['claude-code']?.data?.quota;
            if (claude && !claude._unavailable) {
              if (claude.fiveHour)     opts.push({ v: 'claude-code:5h',   label: 'Claude · 5h' });
              if (claude.sevenDay)     opts.push({ v: 'claude-code:7d',   label: 'Claude · 7d' });
              if (claude.sevenDayOpus) opts.push({ v: 'claude-code:opus', label: 'Claude · Opus 7d' });
            }
            const codex = usage['codex']?.data?.quota;
            if (codex && !codex._unavailable) {
              if (codex.fiveHour) opts.push({ v: 'codex:5h', label: 'ChatGPT · 5h' });
              if (codex.sevenDay) opts.push({ v: 'codex:7d', label: 'ChatGPT · 7d' });
            }
            const gemini = usage['gemini-cli']?.data?.quota;
            if (gemini && !gemini._unavailable && Array.isArray(gemini.rows)) {
              gemini.rows.forEach((r, i) => {
                opts.push({ v: `gemini-cli:row${i}`, label: `Gemini · ${r.label || 'bucket ' + i}` });
              });
            }
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 11, color: t.textDim, flexShrink: 0, width: 48 }}>Quota</div>
                {opts.length === 0 ? (
                  <div style={{
                    flex: 1, fontSize: 10.5, color: t.textMute, lineHeight: 1.5,
                    background: 'rgba(0,0,0,0.2)', border: `1px dashed ${t.cardBorder}`,
                    borderRadius: 7, padding: '7px 10px',
                  }}>
                    No quota data yet. Open Tokenly's main view once so quotas load — they'll show here next.
                  </div>
                ) : (
                  <select
                    value={trayQuota}
                    onChange={(e) => onTrayQuotaChange && onTrayQuotaChange(e.target.value)}
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
                    {opts.map((o) => (
                      <option key={o.v} value={o.v}>{o.label}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })()}
        </div>

      </section>
    </React.Fragment>
  );
}

// Navigation row. The left slot takes an `icon` describing what the button
// does (key, bell, download, etc.). Max-gated rows indicate their tier via
// the right-side chip only — no full gold outline/background on the button
// itself, so the list stays visually calm.
function SettingsEntry({ t, title, subtitle, onClick, locked, maxUnlocked, icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left',
        background: t.card,
        border: `1px solid ${t.cardBorder}`,
        borderRadius: 10, padding: '10px 12px', marginBottom: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        cursor: 'pointer', fontFamily: 'inherit', color: t.text,
        opacity: locked ? 0.72 : 1,
        transition: 'opacity .15s, border-color .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {icon && (
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${t.cardBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: t.textDim, flexShrink: 0,
          }}>
            {icon}
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
      ) : maxUnlocked ? (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: '#1a1408',
          background: 'linear-gradient(135deg, #ffd772, #e8a441)',
          border: '1px solid rgba(232,164,65,0.55)',
          padding: '3px 7px', borderRadius: 5, flexShrink: 0, whiteSpace: 'nowrap',
          lineHeight: 1,
        }}>Max</span>
      ) : (
        <span style={{ color: t.textDim, flexShrink: 0, fontSize: 14 }}>→</span>
      )}
    </button>
  );
}

window.SettingsSheet = SettingsSheet;
