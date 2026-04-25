// Live app — fetches real data via window.api (preload bridge).
const { useState: useStateA, useEffect: useEffectA, useCallback } = React;

// MainMenuSheet — slide-up sheet collapsing the previously-scrunched header
// row (refresh / chat / analytics / history / settings / license). Each row
// is a tappable card with icon + label + description. Mirrors the styling
// of other sheets in the app (ApiKeysSheet, ChangelogSheet) so it feels
// native to the rest of the surface.
function MainMenuSheet({
  open, onClose,
  isPro, isAi,
  chatOpen, chartsOpen, sheetOpen,
  onOpenChat, onOpenVoice, onOpenHistory, onOpenAnalytics,
  onOpenApiKeys, onOpenBudgets, onOpenExport,
  onOpenPricing, onOpenChangelog,
  onOpenSettings, onOpenLicense,
}) {
  const t = TOKENS.color;

  const chatIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
  const historyIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
  const micIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V5a3 3 0 0 0-3-3z"/>
      <path d="M19 11a7 7 0 0 1-14 0"/>
      <path d="M12 18v4"/>
    </svg>
  );
  const analyticsIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>
    </svg>
  );
  const keysIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4"/>
      <path d="M10.85 12.15 19 4"/>
      <path d="m18 5 3 3"/>
      <path d="m15 8 3 3"/>
    </svg>
  );
  const bellIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z"/>
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    </svg>
  );
  const downloadIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
  const tagIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  );
  const sparkleIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.7 5.8 21 7 14.1 2 9.3 9 8.5 12 2"/>
    </svg>
  );
  const settingsIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
    </svg>
  );
  const lockIcon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>
  );

  // Each row carries a `tier` ('free' | 'max' | 'max-ai') so the badge is a
  // permanent indicator of what unlocks the surface — not a lock state. Free
  // rows render no badge. Max rows render a "Max" pill. Max + AI rows render
  // a "Max + AI" pill. Locked Max-tier rows whose user lacks the tier route
  // through onOpenLicense via the wiring below.
  const items = [
    { id: 'chat',       tier: 'max-ai', label: 'Chat',
      sublabel: isAi ? 'Talk to OpenAI, Claude, or Gemini (text)' : 'Direct chat with the major models',
      icon: chatIcon, onClick: onOpenChat, active: chatOpen },
    { id: 'voice',      tier: 'max-ai', label: 'Voice AI',
      sublabel: isAi ? 'Hands-free brainstorming · ⌘⇧V from anywhere' : 'Speak to AI · always-on mic conversation',
      icon: micIcon, onClick: onOpenVoice },
    { id: 'history',    tier: 'max-ai', label: 'Chat history',
      sublabel: 'Past conversations + Claude Code sessions',
      icon: historyIcon, onClick: onOpenHistory },
    { id: 'analytics',  tier: 'max',    label: 'Analytics',
      sublabel: 'Charts, projections, exports',
      icon: analyticsIcon, onClick: onOpenAnalytics, active: chartsOpen },
    { id: 'apikeys',    tier: 'max',    label: 'API keys',
      sublabel: 'OpenAI · Anthropic · OpenRouter admin keys',
      icon: keysIcon, onClick: onOpenApiKeys },
    { id: 'budgets',    tier: 'max',    label: 'Budget alerts',
      sublabel: 'Daily spend thresholds + summary',
      icon: bellIcon, onClick: onOpenBudgets },
    { id: 'export',     tier: 'max',    label: 'Export data',
      sublabel: 'CSV / JSON of trends, totals, models',
      icon: downloadIcon, onClick: onOpenExport },
    { id: 'pricing',    tier: 'free',   label: 'View current pricing',
      sublabel: 'Per-model rates, refreshed daily',
      icon: tagIcon, onClick: onOpenPricing },
    { id: 'changelog',  tier: 'free',   label: "What's new",
      sublabel: 'Recent Tokenly releases',
      icon: sparkleIcon, onClick: onOpenChangelog },
    { id: 'settings',   tier: 'free',   label: 'Settings',
      sublabel: 'Appearance, menu bar, launch at login',
      icon: settingsIcon, onClick: onOpenSettings, active: sheetOpen },
    { id: 'license',    tier: 'free',   label: isAi ? 'Tokenly Max + AI' : isPro ? 'Tokenly Max' : 'Unlock Tokenly Max',
      sublabel: isAi ? 'Lifetime activation · view or remove your code'
              : isPro ? 'Lifetime activation · upgrade to Max + AI'
              : '$5.99 for Max · $8.99 for Max + AI · both lifetime',
      icon: lockIcon, onClick: onOpenLicense },
  ];

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
          padding: '10px 16px 18px',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .25s cubic-bezier(0.2, 0.9, 0.3, 1)',
          zIndex: 60,
          maxHeight: '92%',
          overflowY: 'auto',
        }}
      >
        <SheetMinimize onClick={onClose} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Menu</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it) => (
            <MenuRow key={it.id} t={t} item={it} />
          ))}
        </div>
      </section>
    </React.Fragment>
  );
}
window.MainMenuSheet = MainMenuSheet;

function MenuRow({ t, item }) {
  const [hov, setHov] = React.useState(false);
  // Uniform card style — no gold glow, no tinted border. The tier badge
  // alongside the label is the only visual indicator of what unlocks a row.
  const bg = hov ? t.cardHover : t.card;
  const border = `1px solid ${item.active ? t.cardBorderStrong : t.cardBorder}`;
  const iconColor = hov || item.active ? t.text : t.textDim;
  const tierBadge = item.tier === 'max-ai' ? 'Max + AI'
                  : item.tier === 'max'    ? 'Max'
                  : null;
  return (
    <button
      onClick={item.onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: bg, border, borderRadius: 11,
        padding: '11px 13px', cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit', color: t.text,
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'background .12s, border-color .12s',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        color: iconColor,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color .12s',
      }}>
        {item.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text, display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.label}
          {tierBadge && (
            <span style={{
              fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em',
              padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
              color: '#1a1408', lineHeight: 1,
              background: 'linear-gradient(135deg, #ffd772, #e8a441)',
              border: '1px solid rgba(232,164,65,0.55)',
            }}>{tierBadge}</span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 2, lineHeight: 1.4 }}>
          {item.sublabel}
        </div>
      </div>
      <span style={{ color: t.textMute, flexShrink: 0, display: 'inline-flex' }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6"/>
        </svg>
      </span>
    </button>
  );
}
window.MenuRow = MenuRow;

function LLMUsageApp() {
  const mode = (typeof window.api?.mode === 'function') ? window.api.mode() : 'desktop';
  const isPopover = mode === 'popover';
  const [expanded, setExpanded] = useStateA({ 'claude-code': true, 'codex': true, 'gemini-cli': true, openai: true, anthropic: true, openrouter: false });
  const [sheetOpen, setSheetOpen] = useStateA(false);
  const [pricingOpen, setPricingOpen] = useStateA(false);
  const [budgetsOpen, setBudgetsOpen] = useStateA(false);
  const [apiKeysOpen, setApiKeysOpen] = useStateA(false);
  const [exportOpen, setExportOpen] = useStateA(false);
  const [chartsOpen, setChartsOpen] = useStateA(false);
  const [licenseOpen, setLicenseOpen] = useStateA(false);
  const [changelogOpen, setChangelogOpen] = useStateA(false);
  const [chatOpen, setChatOpen] = useStateA(false);
  const [historyOpen, setHistoryOpen] = useStateA(false);
  const [menuOpen, setMenuOpen] = useStateA(false);
  // Voice controller registered by ChatSheet on mount. Held in a ref so
  // hotkey handlers always see the latest controller without re-registering.
  const voiceCtrlRef = React.useRef(null);
  // Pending hotkey action to fire once ChatSheet mounts. Set when a global
  // hotkey arrives while chat is closed; consumed when registerVoiceController
  // is called below.
  const pendingHotkeyRef = React.useRef(null);
  const flushPendingHotkey = useCallback(() => {
    const ctrl = voiceCtrlRef.current;
    const pending = pendingHotkeyRef.current;
    if (!ctrl || !pending) return;
    pendingHotkeyRef.current = null;
    if (pending === 'ptt' && typeof ctrl.pttToggle === 'function') ctrl.pttToggle();
  }, []);
  const registerVoiceController = useCallback((ctrl) => {
    voiceCtrlRef.current = ctrl;
    if (ctrl) flushPendingHotkey();
  }, [flushPendingHotkey]);
  const [appVersion, setAppVersion] = useStateA(null);
  // "Last seen" version is the version the user has already viewed in the
  // What's-new sheet. If app version is newer, the post-update banner shows.
  const [lastSeenVersion, setLastSeenVersion] = useStateA(() => {
    try { return localStorage.getItem('lastSeenVersion') || null; } catch { return null; }
  });
  const markVersionSeen = (v) => {
    if (!v || v === lastSeenVersion) return;
    setLastSeenVersion(v);
    try { localStorage.setItem('lastSeenVersion', v); } catch {}
  };
  const [licenseState, setLicenseState] = useStateA({ tier: 'free', license: null });
  // 'max' tier and 'max-ai' tier both unlock the original Max features
  // (admin-API providers, analytics, exports, budgets). 'max-ai' adds chat
  // and voice on top.
  const isPro = licenseState.tier === 'max' || licenseState.tier === 'max-ai';
  const isAi = licenseState.tier === 'max-ai';
  const [spinning, setSpinning] = useStateA(false);
  const [days, setDays] = useStateA(() => {
    try { return parseInt(localStorage.getItem('windowDays') || '30', 10) || 30; } catch { return 30; }
  });
  const updateDays = (v) => {
    setDays(v);
    try { localStorage.setItem('windowDays', String(v)); } catch {}
  };
  // Compare-to-prior-period mode. When ON, fetches double the window so each
  // card can split current vs prior and show a delta pill. Persists per-user.
  const [compare, setCompare] = useStateA(() => {
    try { return localStorage.getItem('compareMode') === '1'; } catch { return false; }
  });
  const updateCompare = (v) => {
    setCompare(v);
    try { localStorage.setItem('compareMode', v ? '1' : '0'); } catch {}
  };
  // Doubled fetch window when compare is on. Capped at 180 to match the
  // longest range we already support; OpenRouter caps at 30d server-side and
  // surfaces "prior unavailable" gracefully when its response is truncated.
  const fetchDays = compare ? Math.min(360, days * 2) : days;
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
  // What the menu bar title shows: 'tokens' (existing), 'quota' (a quota %),
  // 'both' (tokens + quota), or 'off'. Backwards-compatible default: tokens.
  const [trayContent, setTrayContent] = useStateA(() => {
    try { return localStorage.getItem('trayContent') || 'tokens'; } catch { return 'tokens'; }
  });
  const updateTrayContent = (v) => {
    setTrayContent(v);
    try { localStorage.setItem('trayContent', v); } catch {}
  };
  // Which quota window to show when trayContent includes a quota. Encoded as
  // `<provider>:<window>` — e.g. 'claude-code:5h', 'codex:7d', 'gemini-cli:row0'.
  const [trayQuota, setTrayQuota] = useStateA(() => {
    try { return localStorage.getItem('trayQuota') || 'claude-code:5h'; } catch { return 'claude-code:5h'; }
  });
  const updateTrayQuota = (v) => {
    setTrayQuota(v);
    try { localStorage.setItem('trayQuota', v); } catch {}
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
  }, [days, compare]);

  const refreshAll = useCallback(async () => {
    const myVersion = ++refreshVersionRef.current;
    setSpinning(true);
    try {
      const m = await refreshMeta();
      if (myVersion !== refreshVersionRef.current) return;
      await Promise.all(PROVIDERS.map(async (p) => {
        if (!m[p.id]?.present) return;
        // Non-keyless (API) providers are Max-only. Skip fetching them
        // entirely on Free to avoid wasted API calls + stale data.
        if (!isPro && !p.keyless) return;
        const res = await window.api.fetchUsage(p.id, fetchDays);
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
  }, [fetchDays, refreshMeta, isPro]);

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

  // Global voice / chat hotkeys. Main process registers the OS shortcuts;
  // here we handle the renderer-side dispatch. Opens the chat sheet first if
  // needed (Max-only — silently dropped on Free), then either dispatches
  // immediately to the registered voice controller, or stashes the action
  // until ChatSheet mounts and registers itself.
  // Read live state via refs so the IPC listener can register exactly once
  // — the underlying ipcRenderer.on doesn't expose a clean unsubscribe.
  const isAiRef = React.useRef(isAi);
  useEffectA(() => { isAiRef.current = isAi; }, [isAi]);
  const chatOpenRef = React.useRef(chatOpen);
  useEffectA(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);
  useEffectA(() => {
    if (!window.api?.onChatHotkey) return;
    window.api.onChatHotkey(({ kind }) => {
      // Chat + voice hotkeys gated on Max + AI. Without it, surface the
      // upsell sheet rather than silently dropping the gesture.
      if (!isAiRef.current) {
        setLicenseOpen(true);
        return;
      }
      pendingHotkeyRef.current = kind;
      if (!chatOpenRef.current) setChatOpen(true);
      flushPendingHotkey();
    });
    if (window.api?.onLicenseUpsell) {
      window.api.onLicenseUpsell(() => setLicenseOpen(true));
    }
    // No cleanup — preload's ipcRenderer.on doesn't return a removeListener.
    // Effect deps intentionally empty so we register exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load Tokenly Max license state on mount.
  useEffectA(() => {
    if (!window.api?.getLicense) return;
    (async () => {
      try {
        const res = await window.api.getLicense();
        if (res) setLicenseState(res);
      } catch {}
    })();
    // Listen for background-reverify downgrades (refund detection).
    if (window.api?.onLicenseChanged) {
      window.api.onLicenseChanged((state) => {
        if (state) setLicenseState(state);
      });
    }
  }, []);

  // When the tier flips Max → Free, wipe any cached API-provider usage so the
  // main popover doesn't show stale numbers behind the Max-locked overlay.
  // Load the app version on mount so the post-update banner can compare
  // against lastSeenVersion. Cheap IPC; one-shot. Brand-new installs (no
  // lastSeenVersion stored yet) auto-seed to the current version so the
  // banner doesn't show "Updated to vX" on a fresh first launch.
  useEffectA(() => {
    if (!window.api?.getAppVersion) return;
    window.api.getAppVersion().then((v) => {
      if (!v) return;
      setAppVersion(v);
      if (!lastSeenVersion) markVersionSeen(v);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffectA(() => {
    if (isPro) return;
    setUsage((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of PROVIDERS) {
        if (!p.keyless && next[p.id] !== undefined) {
          delete next[p.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // If the menu-bar tokens source was an API provider, snap back to 'all'.
    const sourceProv = PROVIDERS.find((p) => p.id === traySource);
    if (sourceProv && !sourceProv.keyless) {
      updateTraySource('all');
    }
  }, [isPro]);

  // ---- Budget alerts (API-only daily $ thresholds) ----------------------
  // Runs on every successful refresh. Candidate alerts are sent to main,
  // which dedupes against a per-day ledger before showing notifications.
  useEffectA(() => {
    if (!booted) return;
    if (!window.api?.maybeFireAlerts) return;
    (async () => {
      try {
        const budgets = await window.api.getBudgets();
        if (!budgets?.enabled) return;
        const daily = budgets.daily || {};
        const thresholds = budgets.thresholds || [0.5, 0.8, 1.0];
        const dayKey = new Date().toISOString().slice(0, 10); // UTC
        const alerts = [];

        let overallToday = 0;
        for (const pid of ['openai', 'anthropic', 'openrouter']) {
          const u = usage[pid];
          if (!u || u === 'loading' || !u.ok) continue;
          const costTrend = u.data?.costTrend || [];
          const todayCost = Number(costTrend[costTrend.length - 1]) || 0;
          overallToday += todayCost;

          const limit = Number(daily[pid]);
          if (!Number.isFinite(limit) || limit <= 0) continue;
          for (const th of thresholds) {
            if (todayCost >= limit * th) {
              const pct = Math.round(th * 100);
              const provName = PROVIDERS.find((p) => p.id === pid)?.name || pid;
              alerts.push({
                key: `daily:${pid}:${dayKey}:${th}`,
                title: `${provName}: ${pct}% of daily budget`,
                body: `$${todayCost.toFixed(2)} of $${limit.toFixed(2)} used today.`,
                severity: th >= 1 ? 'critical' : th >= 0.8 ? 'warn' : 'info',
              });
            }
          }
        }

        const overallLimit = Number(daily._overall);
        if (Number.isFinite(overallLimit) && overallLimit > 0) {
          for (const th of thresholds) {
            if (overallToday >= overallLimit * th) {
              const pct = Math.round(th * 100);
              alerts.push({
                key: `daily:_overall:${dayKey}:${th}`,
                title: `Overall API spend: ${pct}% of daily budget`,
                body: `$${overallToday.toFixed(2)} of $${overallLimit.toFixed(2)} used today across APIs.`,
                severity: th >= 1 ? 'critical' : th >= 0.8 ? 'warn' : 'info',
              });
            }
          }
        }

        if (alerts.length > 0) {
          await window.api.maybeFireAlerts(alerts);
        }
      } catch (e) {
        console.warn('[budgets] evaluation failed:', e);
      }
    })();
  }, [usage, booted]);

  // ---- Daily spend summary notification ----------------------------------
  // Checked every 5 min when the app is foregrounded. Main process enforces
  // once-per-day dedup, so over-eager polling here is harmless.
  useEffectA(() => {
    if (!booted) return;
    if (!window.api?.maybeFireDailySummary) return;

    const check = async () => {
      try {
        const budgets = await window.api.getBudgets();
        if (!budgets?.summary?.enabled) return;
        const targetHour = Number(budgets.summary.hour);
        const now = new Date();
        if (!Number.isFinite(targetHour) || now.getHours() < targetHour) return;

        const parts = [];
        let totalApi = 0;
        const shortName = (pid) => (PROVIDERS.find((p) => p.id === pid)?.abbr || pid);

        for (const pid of ['openai', 'anthropic', 'openrouter']) {
          const u = usage[pid];
          if (!u || u === 'loading' || !u.ok) continue;
          const todayCost = Number((u.data?.costTrend || []).slice(-1)[0]) || 0;
          if (todayCost > 0) {
            parts.push(`${shortName(pid)} $${todayCost.toFixed(2)}`);
            totalApi += todayCost;
          }
        }
        for (const pid of ['claude-code', 'codex', 'gemini-cli']) {
          const u = usage[pid];
          if (!u || u === 'loading' || !u.ok) continue;
          const todayTokens = Number((u.data?.trend || []).slice(-1)[0]) || 0;
          if (todayTokens > 0) {
            parts.push(`${shortName(pid)} ${fmt(todayTokens)} toks`);
          }
        }

        const title = totalApi > 0
          ? `Today's API spend: $${totalApi.toFixed(2)}`
          : `Today's AI usage`;
        const body = parts.length > 0 ? parts.join(' · ') : 'No usage recorded today yet.';
        await window.api.maybeFireDailySummary({ title, body });
      } catch (e) {
        console.warn('[summary] check failed:', e);
      }
    };

    check(); // once on mount after boot
    const id = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [booted, usage]);

  // Keep the menu-bar title synced with aggregated tokens whenever usage, mode,
  // or source changes. Small debounce so rapid usage updates don't spam IPC.
  useEffectA(() => {
    if (!window.api?.setTrayTitle) return;
    const handle = setTimeout(() => {
      const title = computeTrayTitle({ mode: trayMode, source: traySource, content: trayContent, quotaKey: trayQuota, usage, days, isPro });
      window.api.setTrayTitle(title);
    }, 250);
    return () => clearTimeout(handle);
  }, [trayMode, traySource, trayContent, trayQuota, usage, days, isPro]);

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
          <img
            src="icon.png"
            alt=""
            draggable={false}
            style={{
              width: 18, height: 18, borderRadius: 5,
              flexShrink: 0, display: 'block',
              WebkitAppRegion: 'no-drag',
              boxShadow: isPro
                ? '0 0 10px rgba(232,164,65,0.35)'
                : '0 0 10px rgba(124,92,255,0.35)',
              transition: 'box-shadow .2s',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.01em' }}>Tokenly</div>
            {isPro && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                color: '#1a1408',
                background: 'linear-gradient(135deg, #ffd772, #e8a441)',
                border: '1px solid rgba(232,164,65,0.55)',
                boxShadow: '0 0 10px rgba(232,164,65,0.35)',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}>{isAi ? 'Max + AI' : 'Max'}</span>
            )}
          </div>
          <div className="tky-header-meta" style={{ fontSize: 11, color: t.textMute, fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span className="tky-range-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {rangeLabel}</span>
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
          {/* Voice AI shortcut — opens the standalone voice window. Gated on
              Max + AI; falls back to the license upsell otherwise. The ⌘⇧V
              global hotkey does the same thing from anywhere in macOS. */}
          <div style={{
            background: isAi ? 'linear-gradient(135deg, rgba(255,215,114,0.2), rgba(232,164,65,0.08))' : 'transparent',
            border: isAi ? '1px solid rgba(232,164,65,0.5)' : '1px solid transparent',
            borderRadius: 9,
            boxShadow: isAi ? '0 0 10px rgba(232,164,65,0.25)' : 'none',
            display: 'inline-flex', padding: 0,
            transition: 'box-shadow .15s, border-color .15s',
          }}>
            <IconBtn
              onClick={() => isAi ? window.api.voiceMateOpen() : setLicenseOpen(true)}
              title={isAi ? 'Voice AI · ⌘⇧V' : 'Voice AI — unlock with Max + AI'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isAi ? '#ffd772' : 'currentColor'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V5a3 3 0 0 0-3-3z"/>
                <path d="M19 11a7 7 0 0 1-14 0"/>
                <path d="M12 18v4"/>
              </svg>
            </IconBtn>
          </div>
          <IconBtn onClick={() => setMenuOpen(true)} title="Menu" active={menuOpen}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h18"/>
            </svg>
          </IconBtn>
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

      {/* Segmented range picker + compare-to-prior toggle */}
      <div style={{
        padding: '8px 14px 10px', position: 'relative', zIndex: 15,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          flex: 1,
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
        {/* Compare-to-prior toggle. Doubles the fetch window so each card
            can split current vs prior and render a delta pill. */}
        <button
          onClick={() => updateCompare(!compare)}
          title={compare ? `Comparing last ${days}d vs prior ${days}d. Click to disable.` : 'Compare current period vs the prior period of the same length'}
          style={{
            border: `1px solid ${compare ? t.accent : t.cardBorder}`,
            background: compare ? 'rgba(124,92,255,0.18)' : 'rgba(0,0,0,0.25)',
            color: compare ? t.text : t.textDim,
            borderRadius: 9, padding: '5px 10px',
            fontSize: 10.5, fontWeight: 600, letterSpacing: '-0.01em',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'background .15s, color .15s, border-color .15s',
            boxShadow: compare ? '0 2px 8px rgba(124,92,255,0.25)' : 'none',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          vs prior
        </button>
      </div>

      <main style={{
        position: 'absolute', top: 92, left: 0, right: 0, bottom: 0,
        overflowY: 'auto', padding: '4px 14px 18px',
      }}>
        {/* Post-update "what's new" banner. Shows once per new version. */}
        {!isFirstRun && appVersion && lastSeenVersion && appVersion !== lastSeenVersion && (
          <div style={{
            background: `linear-gradient(135deg, ${t.accent}22, ${t.accent2}18)`,
            border: `1px solid ${t.accent}55`,
            borderRadius: 12, padding: '10px 12px', marginBottom: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{
                width: 24, height: 24, borderRadius: 7,
                background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', flexShrink: 0,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.7 5.8 21 7 14.1 2 9.3 9 8.5 12 2" />
                </svg>
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>
                  Tokenly updated to v{appVersion}
                </div>
                <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 1 }}>
                  See what's new in this release.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => setChangelogOpen(true)}
                style={{
                  background: t.accent, color: '#fff',
                  border: 0, borderRadius: 7, padding: '5px 10px',
                  fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >View</button>
              <button
                onClick={() => markVersionSeen(appVersion)}
                title="Dismiss"
                style={{
                  background: 'transparent', color: t.textMute,
                  border: 0, borderRadius: 7, padding: '5px 7px',
                  fontSize: 14, cursor: 'pointer', lineHeight: 1,
                  fontFamily: 'inherit',
                }}
              >×</button>
            </div>
          </div>
        )}
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
              isPro={isPro}
              onOpenLicense={() => setLicenseOpen(true)}
              compareWindowDays={compare ? days : 0}
            />
          ))
        )}
      </main>

      <MainMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        isPro={isPro}
        isAi={isAi}
        chatOpen={chatOpen}
        chartsOpen={chartsOpen}
        sheetOpen={sheetOpen}
        onOpenChat={() => { setMenuOpen(false); isAi ? setChatOpen(true) : setLicenseOpen(true); }}
        onOpenVoice={() => { setMenuOpen(false); isAi ? window.api.voiceMateOpen() : setLicenseOpen(true); }}
        onOpenHistory={() => { setMenuOpen(false); isAi ? setHistoryOpen(true) : setLicenseOpen(true); }}
        onOpenAnalytics={() => { setMenuOpen(false); isPro ? setChartsOpen(true) : setLicenseOpen(true); }}
        onOpenApiKeys={() => { setMenuOpen(false); isPro ? setApiKeysOpen(true) : setLicenseOpen(true); }}
        onOpenBudgets={() => { setMenuOpen(false); isPro ? setBudgetsOpen(true) : setLicenseOpen(true); }}
        onOpenExport={() => { setMenuOpen(false); isPro ? setExportOpen(true) : setLicenseOpen(true); }}
        onOpenPricing={() => { setMenuOpen(false); setPricingOpen(true); }}
        onOpenChangelog={() => { setMenuOpen(false); setChangelogOpen(true); }}
        onOpenSettings={() => { setMenuOpen(false); setSheetOpen(true); }}
        onOpenLicense={() => { setMenuOpen(false); setLicenseOpen(true); }}
      />
      <SettingsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onBack={() => { setSheetOpen(false); setMenuOpen(true); }}
        badgeStyle={badgeStyle}
        onBadgeStyleChange={updateBadgeStyle}
        trayMode={trayMode}
        onTrayModeChange={updateTrayMode}
        traySource={traySource}
        onTraySourceChange={updateTraySource}
        trayContent={trayContent}
        onTrayContentChange={updateTrayContent}
        trayQuota={trayQuota}
        onTrayQuotaChange={updateTrayQuota}
        currentDays={days}
        usage={usage}
        isPro={isPro}
      />
      <ApiKeysSheet
        open={apiKeysOpen && isPro}
        onClose={() => setApiKeysOpen(false)}
        onBack={() => { setApiKeysOpen(false); setMenuOpen(true); }}
        savedKeys={savedKeys}
        onSave={onSaveKey}
        onRemove={onRemoveKey}
        onOpenExternal={onOpenExternal}
      />
      <PricingSheet
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        onBack={() => { setPricingOpen(false); setMenuOpen(true); }}
      />
      <ChangelogSheet
        open={changelogOpen}
        onClose={() => setChangelogOpen(false)}
        onBack={() => { setChangelogOpen(false); setMenuOpen(true); }}
        currentVersion={appVersion}
        onMarkSeen={markVersionSeen}
      />
      <BudgetsSheet
        open={budgetsOpen && isPro}
        onClose={() => setBudgetsOpen(false)}
        onBack={() => { setBudgetsOpen(false); setMenuOpen(true); }}
      />
      <ExportSheet
        open={exportOpen && isPro}
        onClose={() => setExportOpen(false)}
        onBack={() => { setExportOpen(false); setMenuOpen(true); }}
        usage={usage}
        meta={meta}
        days={days}
        isPro={isPro}
      />
      <ChartsSheet
        open={chartsOpen && isPro}
        onClose={() => setChartsOpen(false)}
        onBack={() => { setChartsOpen(false); setMenuOpen(true); }}
        usage={usage}
        days={days}
        onDaysChange={updateDays}
        isPro={isPro}
      />
      {/* LicenseSheet is unmounted while Analytics is open. Belt-and-suspenders
          against a class of z-index / transform-escape bugs where a same-layer
          bottom sheet's content could peek through the scrollable Analytics view. */}
      {!chartsOpen && (
        <LicenseSheet
          open={licenseOpen}
          onClose={() => setLicenseOpen(false)}
          onBack={() => { setLicenseOpen(false); setMenuOpen(true); }}
          tier={licenseState.tier}
          license={licenseState.license}
          onLicenseChange={setLicenseState}
          onOpenExternal={onOpenExternal}
        />
      )}
      {/* ChatSheet stays mounted while open so streaming + voice state survive
          the user closing/reopening the popover. Hotkeys also need a mounted
          listener to work when triggered globally before the sheet has been
          opened in this session — see the global-hotkey effect below. */}
      <ChatSheet
        open={chatOpen && isAi}
        onClose={() => setChatOpen(false)}
        onBack={() => { setChatOpen(false); setMenuOpen(true); }}
        onOpenExternal={onOpenExternal}
        isPro={isAi}
        onOpenHistory={() => { setChatOpen(false); setHistoryOpen(true); }}
        onOpenVoice={() => window.api.voiceMateOpen()}
        registerVoiceController={registerVoiceController}
      />
      <HistorySheet
        open={historyOpen && isAi}
        onClose={() => setHistoryOpen(false)}
        onBack={() => { setHistoryOpen(false); setMenuOpen(true); }}
        onOpenExternal={onOpenExternal}
        isPro={isAi}
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
function computeTrayTitle({ mode, source, content = 'tokens', quotaKey, usage, days, isPro }) {
  // 'off' overrides everything — empty title.
  if (!mode || mode === 'off') return '';
  // Tokens-only users with content=tokens use the original behavior; users
  // who picked a content mode that excludes tokens skip the token block.
  const wantTokens = content === 'tokens' || content === 'both';
  const wantQuota  = content === 'quota'  || content === 'both';

  // Free users: API providers are Max-locked, so never roll their numbers
  // into the tray title. If the current source is an API provider, blank
  // the title — the state should have been snapped to 'all' elsewhere but
  // this is a belt-and-suspenders guard.
  const sourceProv = PROVIDERS.find((p) => p.id === source);
  if (!isPro && sourceProv && !sourceProv.keyless) return '';

  const fmt = (n) => {
    if (!Number.isFinite(n) || n < 0) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.round(n));
  };
  const rangeLabel = ({
    1: '24h', 7: '7d', 14: '14d', 30: '30d', 90: '90d', 180: '180d',
  })[days] || (days ? days + 'd' : 'range');

  // ----- Tokens block (existing logic, broken out for composability) -----
  let tokensSegment = '';
  if (wantTokens) {
    const providerList = (source === 'all')
      ? (isPro ? PROVIDERS : PROVIDERS.filter((p) => p.keyless))
      : PROVIDERS.filter((p) => p.id === source);

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
      windowTotal += cardTokens(t);
      const trend = u.data.trend || [];
      if (trend.length) todayTotal += trend[trend.length - 1] || 0;
    }
    const tag = (source === 'all') ? '' : (PROVIDERS.find((p) => p.id === source)?.abbr || '') + ' · ';
    if (mode === 'today')   tokensSegment = tag + 'Today ' + fmt(todayTotal);
    else if (mode === 'window') tokensSegment = tag + rangeLabel + ' ' + fmt(windowTotal);
    else if (mode === 'hybrid') tokensSegment = tag + 'Today ' + fmt(todayTotal) + ' · ' + rangeLabel + ' ' + fmt(windowTotal);
  }

  // ----- Quota block — pulls the configured window out of provider quota -----
  let quotaSegment = '';
  if (wantQuota && quotaKey) {
    const [provId, win] = String(quotaKey).split(':');
    const q = usage[provId]?.data?.quota;
    // Skip silently if the chosen quota is unavailable (no creds, transient
    // outage, etc.). The popover card already explains why.
    if (q && !q._unavailable) {
      let row = null;
      let label = '';
      if (win === '5h')   { row = q.fiveHour;     label = '5h'; }
      else if (win === '7d') { row = q.sevenDay;  label = '7d'; }
      else if (win === 'opus') { row = q.sevenDayOpus; label = 'Opus 7d'; }
      else if (win.startsWith('row')) {
        const idx = Number(win.slice(3)) || 0;
        const r = Array.isArray(q.rows) ? q.rows[idx] : null;
        if (r) { row = r.win; label = r.label || `bucket ${idx}`; }
      }
      if (row && Number.isFinite(row.usedPercent)) {
        const provAbbr = PROVIDERS.find((p) => p.id === provId)?.abbr || '';
        const pct = Math.round(row.usedPercent);
        // Reset countdown — same compact format the popover uses.
        let resetIn = '';
        if (row.resetsAt) {
          const ms = Date.parse(row.resetsAt) - Date.now();
          if (ms > 0) {
            const mins = Math.round(ms / 60000);
            if (mins < 60) resetIn = ` · ${mins}m`;
            else if (mins < 24 * 60) resetIn = ` · ${Math.floor(mins / 60)}h`;
            else resetIn = ` · ${Math.floor(mins / 60 / 24)}d`;
          }
        }
        quotaSegment = `${provAbbr} ${label} ${pct}%${resetIn}`;
      }
    }
  }

  const parts = [];
  if (tokensSegment) parts.push(tokensSegment);
  if (quotaSegment)  parts.push(quotaSegment);
  if (!parts.length) return '';
  return ' ' + parts.join(' · ');
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
        Every token and every dollar, across every model, in one window.
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
