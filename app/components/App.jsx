// Live app — fetches real data via window.api (preload bridge).
const { useState: useStateA, useEffect: useEffectA, useCallback } = React;

function LLMUsageApp() {
  const mode = (typeof window.api?.mode === 'function') ? window.api.mode() : 'desktop';
  const isPopover = mode === 'popover';
  const [expanded, setExpanded] = useStateA({ 'claude-code': true, 'codex': true, 'gemini-cli': true, openai: true, anthropic: true, openrouter: false });
  const [sheetOpen, setSheetOpen] = useStateA(false);
  const [pricingOpen, setPricingOpen] = useStateA(false);
  const [spinning, setSpinning] = useStateA(false);
  const [days, setDays] = useStateA(() => {
    try { return parseInt(localStorage.getItem('windowDays') || '30', 10) || 30; } catch { return 30; }
  });
  const updateDays = (v) => {
    setDays(v);
    try { localStorage.setItem('windowDays', String(v)); } catch {}
  };
  const [meta, setMeta] = useStateA({});       // provider -> { present, tail }
  const [usage, setUsage] = useStateA({});     // provider -> { ok, data?|error? } | 'loading'
  const [booted, setBooted] = useStateA(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useStateA(null);
  const [nowTick, setNowTick] = useStateA(Date.now());
  const [badgeStyle, setBadgeStyle] = useStateA(() => {
    // Default to brand logos — users recognize the real marks faster than initials.
    try { return localStorage.getItem('badgeStyle') || 'logo'; } catch { return 'logo'; }
  });
  const updateBadgeStyle = (v) => {
    setBadgeStyle(v);
    try { localStorage.setItem('badgeStyle', v); } catch {}
  };

  // Two-axis tray display: which provider (source) × which period (mode).
  // Both persist to localStorage.
  const [trayMode, setTrayMode] = useStateA(() => {
    try { return localStorage.getItem('trayMode') || localStorage.getItem('trayDisplay') || 'off'; } catch { return 'off'; }
  });
  const updateTrayMode = (v) => {
    setTrayMode(v);
    try { localStorage.setItem('trayMode', v); } catch {}
  };
  const [traySource, setTraySource] = useStateA(() => {
    try { return localStorage.getItem('traySource') || 'all'; } catch { return 'all'; }
  });
  const updateTraySource = (v) => {
    setTraySource(v);
    try { localStorage.setItem('traySource', v); } catch {}
  };

  const t = TOKENS.color;
  const RANGES = [
    { v: 1, label: '24h' },
    { v: 7, label: '7d' },
    { v: 14, label: '14d' },
    { v: 30, label: '30d' },
    { v: 90, label: '90d' },
    { v: 180, label: '180d' },
  ];
  const rangeLabel = {
    1: 'Last 24 hours', 7: 'Last 7 days', 14: 'Last 14 days',
    30: 'Last 30 days', 90: 'Last 90 days', 180: 'Last 180 days',
  }[days] || `Last ${days} days`;

  const refreshMeta = useCallback(async () => {
    const m = await window.api.getKeyMeta();
    setMeta(m);
    return m;
  }, []);

  // Version counter to discard stale results. Bumps on every refresh + every `days` change.
  // Any fetch whose version doesn't match the latest is ignored — so a slow 180d fetch
  // can't clobber freshly-loaded 30d data.
  const refreshVersionRef = React.useRef(0);
  // When days changes, invalidate any in-flight data AND mark all present providers
  // as loading so the primary counter shows a shimmer rather than stale numbers.
  useEffectA(() => {
    refreshVersionRef.current++;
    setUsage((prev) => {
      const next = {};
      for (const p of PROVIDERS) {
        if (meta[p.id]?.present) next[p.id] = 'loading';
        else if (prev[p.id] != null) next[p.id] = prev[p.id];
      }
      return next;
    });
  }, [days]);

  const refreshAll = useCallback(async () => {
    const myVersion = ++refreshVersionRef.current;
    setSpinning(true);
    try {
      const m = await refreshMeta();
      if (myVersion !== refreshVersionRef.current) return;
      await Promise.all(PROVIDERS.map(async (p) => {
        if (!m[p.id]?.present) return;
        const res = await window.api.fetchUsage(p.id, days);
        if (myVersion !== refreshVersionRef.current) return; // stale — user switched ranges
        setUsage((prev) => {
          const old = prev[p.id];
          if (old && old.ok === res.ok && JSON.stringify(old) === JSON.stringify(res)) return prev;
          return { ...prev, [p.id]: res };
        });
      }));
    } finally {
      if (myVersion === refreshVersionRef.current) {
        setSpinning(false);
        setBooted(true);
        setLastRefreshedAt(Date.now());
      }
    }
  }, [days, refreshMeta]);

  useEffectA(() => { refreshAll(); }, [refreshAll]);

  useEffectA(() => {
    // Poll slowly. Local file scans are fast but noisy if overlapped;
    // coalescing in the main process + lock above handle bursts. 60s for short
    // windows, 5min for long windows which rarely change minute-to-minute.
    const pollMs = days >= 90 ? 300_000 : 60_000;
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return; // pause when hidden
      refreshAll();
    }, pollMs);
    return () => clearInterval(t);
  }, [refreshAll, days]);

  // Tick once a second so the "Xs ago" label stays fresh.
  useEffectA(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffectA(() => {
    if (window.api?.onRefreshNow) window.api.onRefreshNow(() => refreshAll());
    if (window.api?.onOpenPricing) window.api.onOpenPricing(() => setPricingOpen(true));
  }, [refreshAll]);

  // Keep the menu-bar title synced with aggregated tokens whenever usage, mode,
  // or source changes. Small debounce so rapid usage updates don't spam IPC.
  useEffectA(() => {
    if (!window.api?.setTrayTitle) return;
    const handle = setTimeout(() => {
      const title = computeTrayTitle(trayMode, traySource, usage);
      window.api.setTrayTitle(title);
    }, 250);
    return () => clearTimeout(handle);
  }, [trayMode, traySource, usage]);

  const keysPresent = Object.values(meta).some((m) => m?.present);
  const isFirstRun = booted && !keysPresent;

  useEffectA(() => {
    if (!booted) return;
    if (isFirstRun) {
      setExpanded({ 'claude-code': false, 'codex': false, 'gemini-cli': false, openai: false, anthropic: false, openrouter: false });
    } else {
      setExpanded((prev) => {
        const next = { ...prev };
        for (const p of PROVIDERS) {
          if (meta[p.id]?.present && next[p.id] === undefined) next[p.id] = true;
        }
        return next;
      });
    }
  }, [booted, isFirstRun, meta]);

  const savedKeys = {};
  for (const p of PROVIDERS) if (meta[p.id]?.present) savedKeys[p.id] = meta[p.id].tail;

  const dataFor = (pid) => {
    const m = meta[pid];
    if (!m?.present) return { present: false, status: 'empty' };
    const u = usage[pid];
    if (u === 'loading' || u == null) return { present: true, tail: m.tail, status: 'loading' };
    if (!u.ok) return { present: true, tail: m.tail, status: 'error', error: u.error };
    return { present: true, tail: m.tail, status: 'ok', ...u.data };
  };

  const onOpenExternal = (url) => window.api.openExternal(url);
  const onSaveKey = async (id, v) => {
    await window.api.setKey(id, v);
    await refreshAll();
  };
  const onRemoveKey = async (id) => {
    await window.api.setKey(id, '');
    await refreshAll();
  };

  return (
    <BadgeStyleContext.Provider value={badgeStyle}>
    <div style={{
      width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden',
      color: t.text,
      fontFamily: TOKENS.type.family,
      fontSize: 13,
      background: `
        radial-gradient(1200px 400px at 50% -150px, rgba(124, 92, 255, 0.25), transparent 60%),
        radial-gradient(800px 300px at 100% 0%, rgba(34, 211, 238, 0.12), transparent 55%),
        linear-gradient(180deg, ${t.bgGrad1} 0%, ${t.bgGrad2} 100%)
      `,
      WebkitFontSmoothing: 'antialiased',
      userSelect: 'none',
    }}>
      {/* Single-row titlebar — inline with traffic lights (desktop) or flush top (popover) */}
      <header style={{
        height: 40, padding: isPopover ? '0 12px' : '0 12px 0 78px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, position: 'relative', zIndex: 20,
        WebkitAppRegion: isPopover ? 'no-drag' : 'drag',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{
            width: 9, height: 9, borderRadius: '50%',
            background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`,
            boxShadow: '0 0 12px rgba(124, 92, 255, 0.7)',
            animation: 'llmpulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }} />
          <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.01em' }}>Tokenly</div>
          <div style={{ fontSize: 11, color: t.textMute, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>· {rangeLabel}</span>
            {lastRefreshedAt && (
              <span title={new Date(lastRefreshedAt).toLocaleString()} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '1px 6px', borderRadius: 10,
                background: spinning ? 'rgba(124,92,255,0.18)' : 'rgba(52,211,153,0.12)',
                color: spinning ? t.accent : t.green,
                fontSize: 9.5, fontWeight: 600, letterSpacing: '0.02em',
              }}>
                <span style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: spinning ? t.accent : t.green,
                }} />
                {spinning ? 'LIVE' : timeAgo(nowTick - lastRefreshedAt)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag', alignItems: 'center', flexShrink: 0 }}>
          <IconBtn onClick={() => refreshAll()} title="Refresh" spinning={spinning}>{Icons.refresh}</IconBtn>
          <IconBtn onClick={() => setSheetOpen(true)} title="API Keys" active={sheetOpen}>{Icons.gear}</IconBtn>
          {isPopover ? (
            <IconBtn onClick={() => window.api.detachWindow()} title="Detach to desktop window">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
            </IconBtn>
          ) : (
            <IconBtn onClick={() => window.api.minimizeToTray()} title="Minimize to menu bar">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 9l-7 7-7-7"/></svg>
            </IconBtn>
          )}
        </div>
      </header>

      {/* Segmented range picker */}
      <div style={{
        padding: '8px 14px 10px', position: 'relative', zIndex: 15,
      }}>
        <div style={{
          display: 'flex',
          background: 'rgba(0,0,0,0.25)',
          border: `1px solid ${t.cardBorder}`,
          borderRadius: 9, padding: 2, gap: 1,
        }}>
          {RANGES.map((r) => {
            const active = days === r.v;
            return (
              <button
                key={r.v}
                onClick={() => updateDays(r.v)}
                style={{
                  flex: 1, border: 0, padding: '5px 0', borderRadius: 7,
                  background: active ? t.accent : 'transparent',
                  color: active ? '#fff' : t.textDim,
                  fontSize: 10.5, fontWeight: 600, letterSpacing: '-0.01em',
                  cursor: 'pointer', fontFamily: 'inherit',
                  fontVariantNumeric: 'tabular-nums',
                  transition: 'background .15s, color .15s',
                  boxShadow: active ? '0 2px 8px rgba(124,92,255,0.35)' : 'none',
                }}
              >{r.label}</button>
            );
          })}
        </div>
      </div>

      <main style={{
        position: 'absolute', top: 92, left: 0, right: 0, bottom: 0,
        overflowY: 'auto', padding: '4px 14px 18px',
      }}>
        {isFirstRun ? (
          <FirstRunEmpty onOpenSettings={() => setSheetOpen(true)} />
        ) : (
          PROVIDERS.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              data={dataFor(p.id)}
              expanded={!!expanded[p.id]}
              onToggle={() => setExpanded({ ...expanded, [p.id]: !expanded[p.id] })}
              onOpenSettings={() => setSheetOpen(true)}
              onOpenExternal={onOpenExternal}
            />
          ))
        )}
      </main>

      <SettingsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        savedKeys={savedKeys}
        onSave={onSaveKey}
        onRemove={onRemoveKey}
        onOpenExternal={onOpenExternal}
        badgeStyle={badgeStyle}
        onBadgeStyleChange={updateBadgeStyle}
        trayMode={trayMode}
        onTrayModeChange={updateTrayMode}
        traySource={traySource}
        onTraySourceChange={updateTraySource}
        currentDays={days}
        onOpenPricing={() => { setSheetOpen(false); setPricingOpen(true); }}
      />
      <PricingSheet
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
      />
    </div>
    </BadgeStyleContext.Provider>
  );
}
window.LLMUsageApp = LLMUsageApp;

// Aggregate TOKEN counts for the menu-bar title.
//   mode   — 'off' | 'today' | 'window' | 'hybrid'
//   source — 'all' or a provider id like 'claude-code'
//
// Semantics:
//   Today     = tokens consumed since 00:00 UTC today (UTC calendar day).
//               Pulled from the last bar of each provider's trend array.
//   Last Xd   = tokens in the popover's selected rolling window.
//               Uses totals with the SAME formula as the card's rightSide
//               label (input + output + cache_read + cached), so the tray
//               and card agree exactly when the same source is selected.
function computeTrayTitle(mode, source, usage) {
  if (!mode || mode === 'off') return '';

  const providerList = (source === 'all')
    ? PROVIDERS
    : PROVIDERS.filter((p) => p.id === source);

  // Match the card's rightSide formula exactly.
  const cardTokens = (t) =>
      (t.input      || 0)
    + (t.output     || 0)
    + (t.cache_read || 0)
    + (t.cached     || 0);

  let windowTotal = 0;
  let todayTotal = 0;
  for (const p of providerList) {
    const u = usage[p.id];
    if (!u || u === 'loading' || !u.ok || !u.data) continue;
    const t = u.data.totals || {};

    // "Last Xd" uses the exact same formula the card displays.
    windowTotal += cardTokens(t);

    // "Today" = last UTC-day bucket from the trend. Note: trend buckets are
    // provider-specific (each provider includes slightly different token
    // categories in its trend), so "Today" is close but not identical to a
    // card slice. "Today" is intentionally UTC-calendar-day-so-far.
    const trend = u.data.trend || [];
    if (trend.length) {
      todayTotal += trend[trend.length - 1] || 0;
    }
  }

  const fmt = (n) => {
    if (!Number.isFinite(n) || n < 0) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  };

  const tag = (source === 'all')
    ? ''
    : (PROVIDERS.find((p) => p.id === source)?.abbr || '') + ' ';

  if (mode === 'today')  return ' ' + tag + fmt(todayTotal);
  if (mode === 'window') return ' ' + tag + fmt(windowTotal);
  if (mode === 'hybrid') return ' ' + tag + fmt(todayTotal) + ' / ' + fmt(windowTotal);
  return '';
}

function timeAgo(ms) {
  if (ms == null || ms < 0) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  return h + 'h ago';
}

function FirstRunEmpty({ onOpenSettings }) {
  const t = TOKENS.color;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 24px 40px', textAlign: 'center', gap: 14,
    }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {PROVIDERS.map((p) => (
          <div key={p.id} style={{ opacity: 0.55 }}>
            <ProviderBadge id={p.id} size={32} radius={9} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8, letterSpacing: '-0.01em' }}>
        Track spend across four models, in one window.
      </div>
      <div style={{ fontSize: 11.5, color: t.textDim, lineHeight: 1.5, maxWidth: 280 }}>
        Add an Admin API key for each provider you use. Keys are stored in the macOS keychain and never leave this machine.
      </div>
      <button
        onClick={onOpenSettings}
        style={{
          marginTop: 6, padding: '8px 16px', borderRadius: 8,
          background: t.accent, color: '#fff', fontWeight: 500,
          fontSize: 12, border: 0, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 4px 14px rgba(124, 92, 255, 0.35)',
        }}
      >Add API keys</button>
    </div>
  );
}
window.FirstRunEmpty = FirstRunEmpty;
