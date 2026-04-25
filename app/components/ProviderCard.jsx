// Provider card — collapsible row with expanded stats + model list.
// Ported from Claude Design; added a 'loading' status branch.
const { useState: useStateC } = React;

// Compute a compare-mode split from the doubled-window data.
// Returns null when compare mode is off or there's no breakdown to split.
// Splits dailyBreakdown by calendar boundary (not by entry count) so sparse
// usage days don't misclassify into the wrong half.
function computeCompareSplit(data, compareWindowDays) {
  if (!compareWindowDays || compareWindowDays <= 0) return null;
  const breakdown = Array.isArray(data && data.dailyBreakdown) ? data.dailyBreakdown : null;
  if (!breakdown || !breakdown.length) return null;
  const currentCutoffMs = Date.now() - compareWindowDays * 86400 * 1000;
  const dateOf = (r) => Date.parse(String(r.date || '').slice(0, 10) + 'T00:00:00Z');
  const sumIt = (rows) => {
    let tokens = 0, cost = 0, requests = 0;
    for (const r of rows) {
      tokens += (r.input || 0) + (r.output || 0) + (r.cache_read || 0) + (r.cached || 0);
      cost   += Number(r.cost) || 0;
      requests += Number(r.requests) || 0;
    }
    return { tokens, cost, requests };
  };
  const current = breakdown.filter((r) => Number.isFinite(dateOf(r)) && dateOf(r) >= currentCutoffMs);
  const prior   = breakdown.filter((r) => Number.isFinite(dateOf(r)) && dateOf(r) < currentCutoffMs);
  const c = sumIt(current);
  const p = sumIt(prior);
  const pct = (curr, prev) => (prev > 0 ? ((curr - prev) / prev) * 100 : (curr > 0 ? null : 0));
  return {
    current: c,
    prior: p,
    deltaTokens: pct(c.tokens, p.tokens),
    deltaCost:   pct(c.cost,   p.cost),
    priorAvailable: prior.length > 0 && (p.tokens > 0 || p.cost > 0),
    compareWindowDays,
  };
}

function ProviderCard({ provider, data, expanded, onToggle, onOpenSettings, onOpenExternal, isPro = false, onOpenLicense, compareWindowDays = 0 }) {
  const [hover, setHover] = useStateC(false);
  // "By model" | "By project". Persisted per provider in localStorage.
  const viewKey = `tky.breakdownView.${provider.id}`;
  const initialView = (() => {
    try { return localStorage.getItem(viewKey) || 'model'; } catch { return 'model'; }
  })();
  const [breakdownView, setBreakdownViewRaw] = useStateC(initialView);
  const setBreakdownView = (v) => {
    setBreakdownViewRaw(v);
    try { localStorage.setItem(viewKey, v); } catch {}
  };
  const t = TOKENS.color;

  // API-billed providers are paywalled. Render a locked body regardless of
  // whether a key is saved — deactivated Max users keep their encrypted
  // keys but lose access until they reactivate.
  const lockedForFree = !provider.keyless && !isPro;

  const renderBody = () => {
    if (lockedForFree) {
      return (
        <div style={{
          padding: '14px 12px 12px', textAlign: 'center',
          fontSize: 11.5, color: t.textDim, lineHeight: 1.5,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(124,92,255,0.12)',
            border: '1px solid rgba(124,92,255,0.3)',
            color: t.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 10px',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <div style={{ color: t.text, fontWeight: 500 }}>{provider.name} is part of Tokenly Max.</div>
          <div style={{ fontSize: 10, color: t.textMute, marginTop: 4 }}>
            Unlock API billing + budget alerts for $5.99 lifetime.
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenLicense && onOpenLicense(); }}
            style={{
              marginTop: 10, padding: '6px 14px', borderRadius: 7,
              background: t.accent, color: '#fff', fontWeight: 600,
              fontSize: 11, border: 0, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 8px rgba(124,92,255,0.35)',
            }}
          >Unlock Tokenly Max</button>
        </div>
      );
    }
    if (!data || !data.present) {
      if (provider.keyless) {
        const hints = {
          'codex':      { dir: '~/.codex/sessions/',  link: 'https://developers.openai.com/codex' },
          'gemini-cli': { dir: '~/.gemini/tmp/',      link: 'https://github.com/google-gemini/gemini-cli' },
          'claude-code':{ dir: '~/.claude/projects/', link: 'https://claude.com/claude-code' },
        };
        const hint = hints[provider.id] || hints['claude-code'];
        return (
          <div style={{
            padding: '14px 12px 12px', textAlign: 'center',
            fontSize: 11.5, color: t.textDim, lineHeight: 1.5,
          }}>
            <div>{provider.name} not detected.</div>
            <div style={{ fontSize: 10, color: t.textMute, marginTop: 4 }}>
              Install {provider.name} — usage will appear automatically once it creates{' '}
              <span style={{ fontFamily: TOKENS.type.mono, color: t.textDim }}>{hint.dir}</span>.
            </div>
            <a
              onClick={(e) => { e.stopPropagation(); onOpenExternal && onOpenExternal(hint.link); }}
              style={{ display: 'inline-block', marginTop: 8, color: t.accent2, fontSize: 11, cursor: 'pointer', textDecoration: 'none' }}
            >Get {provider.name} →</a>
          </div>
        );
      }
      return (
        <div style={{
          padding: '14px 12px 12px', textAlign: 'center',
          fontSize: 11.5, color: t.textDim, lineHeight: 1.5,
        }}>
          <div>No <strong style={{ color: t.text }}>Admin API key</strong> set for {provider.name}.</div>
          <div style={{ fontSize: 10, color: t.textMute, marginTop: 4 }}>
            Starts with <span style={{ fontFamily: TOKENS.type.mono, color: t.textDim }}>{provider.keyPrefix}…</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSettings && onOpenSettings(); }}
            style={{
              marginTop: 10, padding: '6px 14px', borderRadius: 7,
              background: t.accent, color: '#fff', fontWeight: 500,
              fontSize: 11, border: 0, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >Add {provider.name} admin key</button>
        </div>
      );
    }
    if (data.status === 'loading') {
      return (
        <div style={{ paddingTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.025)',
                border: `1px solid ${t.cardBorder}`,
                borderRadius: 8, padding: '7px 9px', height: 42,
              }}>
                <div className="llm-skel" style={{ width: '60%', height: 8, borderRadius: 4 }} />
                <div className="llm-skel" style={{ width: '80%', height: 12, borderRadius: 4, marginTop: 6 }} />
              </div>
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ padding: '7px 0' }}>
              <div className="llm-skel" style={{ width: '55%', height: 10, borderRadius: 4 }} />
              <div className="llm-skel" style={{ width: '40%', height: 8, borderRadius: 4, marginTop: 4 }} />
            </div>
          ))}
        </div>
      );
    }
    if (data.status === 'error') {
      return (
        <div style={{ padding: '10px 2px 4px', fontSize: 11, color: t.red, lineHeight: 1.5 }}>
          {data.error}
        </div>
      );
    }
    if (data.mode === 'balance' && data.balance) {
      const b = data.balance;
      const curr = (b.currency || 'USD').toUpperCase();
      const symbol = curr === 'USD' ? '$' : curr === 'CNY' ? '¥' : '';
      return (
        <div style={{ paddingTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
            {[
              ['Total', `${symbol}${b.total.toFixed(2)}`],
              ['Topped up', `${symbol}${b.toppedUp.toFixed(2)}`],
              ['Granted', `${symbol}${b.granted.toFixed(2)}`],
            ].map(([label, val]) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.025)',
                border: `1px solid ${t.cardBorder}`,
                borderRadius: 8, padding: '7px 9px',
              }}>
                <div style={{ fontSize: 9, color: t.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '6px 2px 2px', fontSize: 10.5, color: t.textDim, lineHeight: 1.5 }}>
            {data.note}
            {data.link && (
              <>{' '}<a
                onClick={(e) => { e.stopPropagation(); onOpenExternal && onOpenExternal(data.link); }}
                style={{ color: t.accent2, textDecoration: 'none', cursor: 'pointer' }}
              >Open dashboard →</a></>
            )}
          </div>
        </div>
      );
    }
    if (!data.totals) {
      return (
        <div style={{ padding: '10px 2px 4px', fontSize: 11, color: t.textDim, lineHeight: 1.5 }}>
          {data.note}
          {data.link && (
            <div style={{ marginTop: 6 }}>
              <a
                onClick={(e) => { e.stopPropagation(); onOpenExternal && onOpenExternal(data.link); }}
                style={{ color: t.accent2, textDecoration: 'none', cursor: 'pointer' }}
              >
                Open dashboard →
              </a>
            </div>
          )}
        </div>
      );
    }

    // Local (subscription-bundled) sources show `$` as a list-price *value*,
    // not real spend. The expanded footer label honors that.
    const isEstimate = !!(PROVIDER_COST_INFO[provider.id] && PROVIDER_COST_INFO[provider.id].emphasis);

    const miniStats = provider.id === 'anthropic'
      ? [
          ['Input', fmt(data.totals.input)],
          ['Output', fmt(data.totals.output)],
          ['Cache Write', fmt(data.totals.cache_creation)],
          ['Cache Read', fmt(data.totals.cache_read)],
        ]
      : [
          ['Input', fmt(data.totals.input)],
          ['Cached', fmt(data.totals.cached || 0)],
          ['Output', fmt(data.totals.output)],
          ['Requests', fmt(data.totals.requests)],
        ];

    const trend = data.trend || [];
    const trendMax = Math.max(1, ...trend);
    const dailyAvg = trend.length ? trend.reduce((a, b) => a + b, 0) / trend.length : 0;

    // In compare mode, the trend is over the doubled window. Anything before
    // the midpoint is "prior", anything from the midpoint on is "current".
    // Used to dim/brighten bars and draw a subtle divider.
    const compareSplitIdx = compareWindowDays > 0 && trend.length > 1
      ? Math.max(1, trend.length - compareWindowDays)
      : null;

    return (
      <div style={{ paddingTop: 10 }}>
        {provider.id === 'openrouter' && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            background: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.22)',
            borderRadius: 8, padding: '7px 10px', marginBottom: 10,
            fontSize: 10.5, color: t.textDim, lineHeight: 1.4,
          }}>
            <span style={{
              flexShrink: 0, color: t.amber, fontWeight: 700,
              background: 'rgba(251,191,36,0.18)',
              width: 16, height: 16, borderRadius: 4,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, lineHeight: 1,
            }}>!</span>
            <span>OpenRouter only exposes completed UTC days. Today's usage won't appear until after 00:00 UTC.</span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
          {miniStats.map(([label, val]) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.025)',
              border: `1px solid ${t.cardBorder}`,
              borderRadius: 8, padding: '7px 8px',
            }}>
              <div style={{ fontSize: 9, color: t.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Remaining balance (OpenRouter) / rate-limit quota (Codex rollouts) strip.
            Suppressed entirely when OAuth-derived `quota` is present (it owns
            the visual treatment now via the dedicated block below). */}
        {(data.balance || data.keyQuota || (data.rateLimits && !data.quota)) && (
          <div
            title={data.rateLimit ? `Rate limit: ${data.rateLimit.requests} req / ${data.rateLimit.interval}` : undefined}
            style={{
              background: 'rgba(52,211,153,0.08)',
              border: '1px solid rgba(52,211,153,0.22)',
              borderRadius: 8, padding: '8px 10px', marginBottom: 10,
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
              fontSize: 11, color: t.text,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
            {data.balance && (
              <span>
                <span style={{ color: t.textDim }}>Balance</span>{' '}
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoney(data.balance.remaining)}
                </span>
                <span style={{ color: t.textMute }}> of {fmtMoney(data.balance.total)}</span>
              </span>
            )}
            {data.keyQuota && (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: t.textMute }}>·</span>{' '}
                <span style={{ color: t.textDim }}>Key cap</span>{' '}
                <span style={{ fontWeight: 600, color: (data.keyQuota.usedPercent > 80 ? t.amber : t.text) }}>
                  {fmtMoney(data.keyQuota.usage)}
                </span>
                <span style={{ color: t.textMute }}> of {fmtMoney(data.keyQuota.limit)}</span>
              </span>
            )}
            {data.rateLimits && !data.balance && !data.quota && (() => {
              const p = data.rateLimits.primary;
              const s = data.rateLimits.secondary;
              const fmtPct = (v) => v != null ? `${Math.round(v)}%` : '—';
              const fmtWin = (mins) => mins >= 1440 ? `${Math.round(mins/1440)}d` : mins >= 60 ? `${Math.round(mins/60)}h` : `${mins}m`;
              return (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p && <span><span style={{ color: t.textDim }}>{fmtWin(p.window_minutes)} window</span>{' '}<span style={{ fontWeight: 600, color: (p.used_percent > 80 ? t.amber : t.text) }}>{fmtPct(p.used_percent)} used</span></span>}
                  {s && <span>{' '}<span style={{ color: t.textMute }}>·</span>{' '}<span style={{ color: t.textDim }}>{fmtWin(s.window_minutes)}</span>{' '}<span style={{ fontWeight: 600, color: (s.used_percent > 80 ? t.amber : t.text) }}>{fmtPct(s.used_percent)}</span></span>}
                  {data.rateLimits.plan_type && <span>{' '}<span style={{ color: t.textMute }}>· {data.rateLimits.plan_type}</span></span>}
                </span>
              );
            })()}
          </div>
        )}

        {/* Claude OAuth quota — session/weekly windows + overage cap. */}
        {data.quota && (() => {
          const q = data.quota;
          // Use the provider's brand gradient as the default fill — Claude reads
          // warm-coral, OpenRouter would read violet, etc. Only escalate to amber
          // when usage is getting tight (>80%) and red on actual overage (>100%).
          const brand = (TOKENS.color.providers && TOKENS.color.providers[provider.id]) || [t.accent, t.accentHover];
          const [brandLight, brandDark] = brand;
          const fmtPct = (v) => v != null ? `${Math.round(v)}%` : '—';
          const colorFor = (p) => p > 100 ? t.red : p > 80 ? t.amber : brandDark;
          const labelColorFor = (p) => p > 100 ? t.red : p > 80 ? t.amber : t.text;
          // ISO timestamp → "Resets in 3h 17m" / "Resets in 2d 4h" / "Resets soon".
          // Returns null on missing / unparseable / past timestamps so the UI hides cleanly.
          const fmtResetIn = (iso) => {
            if (!iso) return null;
            const ms = Date.parse(iso);
            if (!Number.isFinite(ms)) return null;
            const delta = ms - Date.now();
            if (delta <= 0) return null;
            const mins = Math.round(delta / 60000);
            if (mins < 1) return 'Resets in <1m';
            if (mins < 60) return `Resets in ${mins}m`;
            const hours = Math.floor(mins / 60);
            const remMins = mins % 60;
            if (hours < 24) return remMins ? `Resets in ${hours}h ${remMins}m` : `Resets in ${hours}h`;
            const days = Math.floor(hours / 24);
            const remHours = hours % 24;
            return remHours ? `Resets in ${days}d ${remHours}h` : `Resets in ${days}d`;
          };

          // Quota rows can come either as named fields (Claude/Codex) or as
          // an explicit `rows` array (Gemini's per-model-family rollup).
          const rows = Array.isArray(q.rows) ? q.rows.slice() : [];
          if (!rows.length) {
            if (q.fiveHour)     rows.push({ key: '5h',   label: '5-hour session', win: q.fiveHour });
            if (q.sevenDay)     rows.push({ key: '7d',   label: '7-day weekly',   win: q.sevenDay });
            if (q.sevenDayOpus) rows.push({ key: 'opus', label: 'Opus 7-day',     win: q.sevenDayOpus });
          }

          const e = q.extraUsage && q.extraUsage.enabled && q.extraUsage.limit > 0 ? q.extraUsage : null;
          const ePct = e ? (e.used / e.limit) * 100 : null;

          // Brand prefix shown next to the plan name in the header.
          const brandPrefix = provider.id === 'claude-code' ? 'Claude'
                            : provider.id === 'codex'       ? 'ChatGPT'
                            : provider.id === 'gemini-cli'  ? 'Gemini'
                            : provider.name;
          const headerLabel = q.planTier
            ? `${brandPrefix} ${q.planTier}`
            : `${brandPrefix} subscription`;

          const Bar = ({ pct }) => {
            const raw = Math.max(0, pct || 0);
            const w = Math.min(100, raw); // visual width caps at 100; label still shows the true %
            const isOver = raw > 100;
            const isHot  = raw > 80;
            // Below 80%: brand gradient (warm Claude coral / brand colors).
            // 80–100%: brand → amber gradient as a "warming up" cue.
            // Above 100%: solid red, with a soft pulse so it reads as alert.
            const fill = isOver
              ? `linear-gradient(90deg, ${t.red}, ${t.red})`
              : isHot
                ? `linear-gradient(90deg, ${brandLight}, ${t.amber})`
                : `linear-gradient(90deg, ${brandLight}, ${brandDark})`;
            const glow = isOver ? `${t.red}66` : isHot ? `${t.amber}55` : `${brandDark}55`;
            return (
              <div style={{
                height: 6, borderRadius: 999, overflow: 'hidden',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{
                  width: `${w}%`, height: '100%',
                  background: fill,
                  borderRadius: 999,
                  transition: 'width 500ms cubic-bezier(0.22, 1, 0.36, 1)',
                  boxShadow: `0 0 8px ${glow}`,
                }} />
              </div>
            );
          };

          return (
            <div style={{
              background: 'rgba(255,255,255,0.025)',
              border: `1px solid ${t.cardBorder}`,
              borderRadius: 10, padding: '10px 12px 12px', marginBottom: 10,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {/* Header — brand-tinted dot, plan name, optional credits chip */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7,
                fontSize: 9, color: t.textMute, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${brandLight}, ${brandDark})`,
                    boxShadow: `0 0 4px ${brandDark}88`,
                  }} />
                  <span>{headerLabel}</span>
                </span>
                {q.credits && (q.credits.unlimited || (q.credits.balance != null && q.credits.balance > 0)) && (
                  <span style={{
                    fontSize: 9, letterSpacing: '0.04em',
                    color: t.text, fontWeight: 600,
                    background: `linear-gradient(135deg, ${brandLight}22, ${brandDark}22)`,
                    border: `1px solid ${brandDark}44`,
                    borderRadius: 999, padding: '1px 8px',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {q.credits.unlimited ? '∞ Credits' : `${fmtMoney(q.credits.balance)} Credits`}
                  </span>
                )}
              </div>

              {rows.map((r) => {
                const resetIn = fmtResetIn(r.win.resetsAt);
                return (
                  <div key={r.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11 }}>
                      <span style={{ color: t.textDim }}>{r.label}</span>
                      <span style={{
                        fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        color: labelColorFor(r.win.usedPercent),
                      }}>{fmtPct(r.win.usedPercent)}</span>
                    </div>
                    <Bar pct={r.win.usedPercent} />
                    {resetIn && (
                      <div style={{
                        fontSize: 9.5, color: t.textMute, textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums', marginTop: 1,
                      }}>{resetIn}</div>
                    )}
                  </div>
                );
              })}

              {e && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11 }}>
                    <span style={{ color: t.textDim }}>Overage Cap</span>
                    <span style={{
                      fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                      color: labelColorFor(ePct),
                    }}>
                      {fmtMoney(e.used)}
                      <span style={{ color: t.textMute, fontWeight: 400 }}> of {fmtMoney(e.limit)}</span>
                    </span>
                  </div>
                  <Bar pct={ePct} />
                </div>
              )}
            </div>
          );
        })()}

        {trend.length > 1 && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 8, padding: '8px 10px 8px', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: t.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Daily tokens{compareSplitIdx ? ' · prior vs current' : ''}
              </div>
              <div style={{ fontSize: 10, color: t.textDim, fontVariantNumeric: 'tabular-nums' }}>avg {fmt(dailyAvg)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 32, position: 'relative' }}>
              {trend.map((v, i) => {
                const isPrior = compareSplitIdx != null && i < compareSplitIdx;
                const fill = v > 0
                  ? (isPrior
                      ? `linear-gradient(180deg, ${t.textDim} 0%, rgba(138,140,153,0.18) 100%)`
                      : `linear-gradient(180deg, ${t.accent} 0%, rgba(124,92,255,0.35) 100%)`)
                  : 'rgba(255,255,255,0.06)';
                return (
                  <div key={i} style={{
                    flex: 1,
                    height: v > 0 ? `${Math.max(8, (v / trendMax) * 100)}%` : '6%',
                    background: fill,
                    borderRadius: 1.5,
                    opacity: isPrior ? 0.55 : 1,
                  }} title={fmt(v) + ' tokens' + (isPrior ? ' (prior period)' : '')} />
                );
              })}
              {compareSplitIdx != null && (
                <div style={{
                  position: 'absolute', top: -2, bottom: -2,
                  left: `calc(${(compareSplitIdx / trend.length) * 100}% - 0.5px)`,
                  width: 1, background: 'rgba(255,255,255,0.20)',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 9, color: t.textMute, marginTop: 4, fontVariantNumeric: 'tabular-nums',
            }}>
              <span>{trend.length}d ago</span>
              {compareSplitIdx != null && (
                <span style={{ color: t.textDim, fontWeight: 500 }}>
                  prior {compareWindowDays}d  ·  current {compareWindowDays}d
                </span>
              )}
              <span>today</span>
            </div>
          </div>
        )}

        {provider.id === 'openai' && (data.lineItems || []).length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: t.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Cost by line item
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data.lineItems.slice(0, 8).map((li) => {
                const pct = data.totals.cost > 0 ? (li.cost / data.totals.cost) * 100 : 0;
                return (
                  <div key={li.name} style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, padding: '4px 8px',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${t.cardBorder}`,
                    borderRadius: 6, overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute', inset: 0,
                      width: `${pct}%`,
                      background: 'linear-gradient(90deg, rgba(124,92,255,0.18), rgba(124,92,255,0.04))',
                      pointerEvents: 'none',
                    }} />
                    <div style={{
                      position: 'relative', fontSize: 10.5, color: t.text,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      minWidth: 0, flex: 1,
                    }} title={li.name}>{li.name}</div>
                    <div style={{
                      position: 'relative', fontSize: 10.5, fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                    }}>{fmtMoney(li.cost)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Breakdown header: by-model is universal; by-project shown only
            when the local fetcher emits it (Claude / Codex / Gemini). */}
        {(() => {
          const hasProjects = Array.isArray(data.byProject) && data.byProject.length > 0;
          const view = hasProjects ? breakdownView : 'model';
          const TabBtn = ({ k, label }) => {
            const active = view === k;
            return (
              <button
                onClick={(e) => { e.stopPropagation(); setBreakdownView(k); }}
                style={{
                  background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: `1px solid ${active ? t.cardBorderStrong : 'transparent'}`,
                  color: active ? t.text : t.textMute,
                  fontSize: 9, letterSpacing: '0.04em', textTransform: 'uppercase',
                  padding: '3px 8px', borderRadius: 999, cursor: 'pointer',
                  fontWeight: active ? 600 : 500,
                }}
              >{label}</button>
            );
          };
          return (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 4, marginTop: 4,
            }}>
              <div style={{
                fontSize: 9, color: t.textMute, textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>{view === 'project' ? 'By project' : 'By model'}</div>
              {hasProjects && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <TabBtn k="model"   label="Model" />
                  <TabBtn k="project" label="Project" />
                </div>
              )}
            </div>
          );
        })()}
        <div>
          {breakdownView === 'project' && Array.isArray(data.byProject) && data.byProject.length > 0 ? (
            data.byProject.slice(0, 12).map((p, i, arr) => {
              const tokens = (p.input || 0) + (p.output || 0) + (p.cache_read || 0) + (p.cached || 0);
              const topModel = (p.models && p.models[0]) ? p.models[0].model : null;
              const sourceMix = p.entrypoints
                ? Object.entries(p.entrypoints).sort((a, b) => b[1] - a[1])
                    .map(([k]) => (k === 'claude-cli' ? 'CLI' : k === 'claude-desktop' ? 'Desktop' : k))
                    .slice(0, 2).join(' + ')
                : (p.originators
                    ? Object.entries(p.originators).sort((a, b) => b[1] - a[1])
                        .map(([k]) => (k === 'codex_cli' ? 'CLI' : (k === 'Codex Desktop' || k === 'codex_desktop') ? 'Desktop' : k))
                        .slice(0, 2).join(' + ')
                    : null);
              const meta = [
                topModel,
                `${fmt(p.requests)} req`,
                p.sessions ? `${p.sessions} session${p.sessions === 1 ? '' : 's'}` : null,
                sourceMix,
              ].filter(Boolean).join(' · ');
              return (
                <div key={p.cwd} title={p.cwd} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 0', gap: 8,
                  borderBottom: i === arr.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 11.5, fontWeight: 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{p.project}</div>
                    <div style={{ fontSize: 10, color: t.textMute, marginTop: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(tokens)}</div>
                    {p.cost != null && p.cost > 0 && (
                      <div style={{ fontSize: 10, color: t.textDim, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                        {fmtMoney(p.cost)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <>
              {(data.models || []).length === 0 && (
                <div style={{ padding: '10px 2px', fontSize: 11, color: t.textDim }}>
                  No usage in this window.
                </div>
              )}
              {(data.models || []).slice(0, 12).map((m, i, arr) => {
                const tokens = (m.input || 0) + (m.output || 0) + (m.cache_read || 0) + (m.cached || 0);
                const meta = provider.id === 'anthropic'
                  ? `in ${fmt(m.input)} · out ${fmt(m.output)}${m.cache_creation ? ' · cw ' + fmt(m.cache_creation) : ''}${m.cache_read ? ' · cr ' + fmt(m.cache_read) : ''}`
                  : `in ${fmt(m.input)}${m.cached ? ' (cached ' + fmt(m.cached) + ')' : ''} · out ${fmt(m.output)} · ${fmt(m.requests)} req`;
                return (
                  <div key={m.model} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 0', gap: 8,
                    borderBottom: i === arr.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 11.5, fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{m.model}</div>
                      <div style={{ fontSize: 10, color: t.textMute, marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{meta}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(tokens)}</div>
                      {m.cost != null && m.cost > 0 && (
                        <div style={{ fontSize: 10, color: t.textDim, fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>
                          {fmtMoney(m.cost)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
        <div style={{
          marginTop: 8, paddingTop: 6, borderTop: `1px solid ${t.cardBorder}`,
          fontSize: 9.5, color: t.textMute, display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{isEstimate ? 'Token value $ · UTC window' : 'Accrued spend · UTC window'}</span>
          <span>Last {data.windowDays || '—'}d</span>
        </div>
      </div>
    );
  };

  const rightSide = () => {
    // Max-locked providers never show spend/token numbers in the header —
    // whatever data was left in state from a prior Max session should stay
    // hidden until the user reactivates.
    if (lockedForFree) {
      return (
        <>
          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 5, color: t.textMute, fontSize: 10.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Max required
          </div>
        </>
      );
    }
    if (!data || !data.present) return <StatusDot status="idle" />;
    if (data.status === 'loading') {
      const isEstimate = !!(PROVIDER_COST_INFO[provider.id] && PROVIDER_COST_INFO[provider.id].emphasis);
      // Wider primary skeleton for local (tokens) cards, narrower for API (dollars).
      const primaryW = isEstimate ? 72 : 58;
      const secondaryW = isEstimate ? 64 : 88;
      return (
        <>
          <div style={{ textAlign: 'right' }}>
            <div className="llm-skel-accent" style={{ width: primaryW, height: 14, borderRadius: 4, marginLeft: 'auto' }} />
            <div className="llm-skel-accent" style={{ width: secondaryW, height: 8, borderRadius: 4, marginTop: 4, marginLeft: 'auto', opacity: 0.6 }} />
          </div>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: TOKENS.color.accent,
            animation: 'llmpulse 1.2s ease-in-out infinite',
            boxShadow: '0 0 8px rgba(124,92,255,0.8)',
          }} />
        </>
      );
    }
    if (data.status === 'error') return <StatusDot status="err" />;
    if (data.mode === 'balance' && data.balance) {
      const b = data.balance;
      const curr = (b.currency || 'USD').toUpperCase();
      const symbol = curr === 'USD' ? '$' : curr === 'CNY' ? '¥' : '';
      return (
        <>
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
            }}>{symbol}{b.total.toFixed(2)}</div>
            <div style={{ fontSize: 10, color: t.textDim, marginTop: 1 }}>balance · {curr}</div>
          </div>
          <StatusDot status={b.available ? 'ok' : 'warn'} />
        </>
      );
    }
    if (!data.totals) {
      return (
        <>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: t.textDim }}>Key OK</div>
          </div>
          <StatusDot status="ok" />
        </>
      );
    }
    const fullTokens = (data.totals.input || 0) + (data.totals.output || 0) + (data.totals.cache_read || 0) + (data.totals.cached || 0);
    const info = PROVIDER_COST_INFO[provider.id];
    const isEstimate = !!(info && info.emphasis);

    // Compare mode: when active, the primary number reflects the CURRENT
    // half of the doubled fetch window. Delta vs prior is rendered as a pill.
    // When compare is off (compareWindowDays = 0) the values fall back to the
    // full-window totals and no pill renders.
    const split = computeCompareSplit(data, compareWindowDays);
    const tokens = split ? split.current.tokens : fullTokens;
    const cost   = split ? split.current.cost   : data.totals.cost;

    // For local (estimate) cards: tokens are the primary number, cost is the tiny caption.
    // For API cards: dollars are the primary number, "actual spend" is the tiny caption.
    const primary = isEstimate ? fmt(tokens) + ' tok' : fmtMoney(cost);
    const compareLabel = split ? `vs prior ${compareWindowDays}d` : null;
    const secondaryBase = isEstimate
      ? { text: 'token value ' + fmtMoney(cost), color: TOKENS.color.amber }
      : { text: 'actual spend · ' + fmt(tokens) + ' tok', color: t.textDim };
    const secondary = compareLabel
      ? { text: `${secondaryBase.text} · ${compareLabel}`, color: secondaryBase.color }
      : secondaryBase;

    return (
      <>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end',
            fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
          }}>
            <span>{primary}</span>
            {split && (() => {
              // Delta uses the metric that's "primary" for this card type:
              // tokens for local/estimate cards, cost for API cards.
              const delta = isEstimate ? split.deltaTokens : split.deltaCost;
              if (!split.priorAvailable) {
                return (
                  <span title="Not enough prior-period data to compare." style={{
                    fontSize: 9, fontWeight: 600, color: t.textMute,
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${t.cardBorder}`,
                    borderRadius: 999, padding: '1px 6px',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>NEW</span>
                );
              }
              if (delta == null) return null;
              const up = delta > 0.5;
              const down = delta < -0.5;
              // Up = more usage = engagement signal (green).
              // Down = less usage (red). Roughly flat = amber.
              const c = up ? t.green : down ? t.red : t.amber;
              const arrow = up ? '↑' : down ? '↓' : '·';
              const mag = Math.abs(delta);
              const label = mag >= 100 ? `${arrow} ${Math.round(mag)}%` : `${arrow} ${mag.toFixed(mag < 10 ? 1 : 0)}%`;
              return (
                <span
                  title={`Current ${compareWindowDays}d: ${isEstimate ? fmt(split.current.tokens) + ' tok' : fmtMoney(split.current.cost)} · Prior ${compareWindowDays}d: ${isEstimate ? fmt(split.prior.tokens) + ' tok' : fmtMoney(split.prior.cost)}`}
                  style={{
                    fontSize: 9.5, fontWeight: 700,
                    color: c,
                    background: `${c}1c`,
                    border: `1px solid ${c}3a`,
                    borderRadius: 999, padding: '1px 6px',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '0.02em',
                  }}
                >{label}</span>
              );
            })()}
            {info && (
              <InfoTip
                emphasis={isEstimate}
                text={
                  <span>
                    <span style={{
                      display: 'inline-block', fontSize: 9, fontWeight: 700,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      color: isEstimate ? TOKENS.color.amber : TOKENS.color.green,
                      marginBottom: 4,
                    }}>{info.title}</span>
                    <br />
                    {info.body}
                  </span>
                }
              />
            )}
          </div>
          <div style={{
            fontSize: 10,
            color: secondary.color,
            fontVariantNumeric: 'tabular-nums', marginTop: 1,
            fontWeight: isEstimate ? 600 : 500,
          }}>
            {secondary.text}
          </div>
        </div>
        <StatusDot status="ok" />
      </>
    );
  };

  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: t.card,
        border: `1px solid ${hover ? t.cardBorderStrong : t.cardBorder}`,
        borderRadius: 14,
        marginBottom: 10,
        // Don't clip — tooltips on the header need to escape the card bounds.
        backdropFilter: 'blur(20px)',
        transition: 'border-color .2s, opacity .2s',
        position: 'relative',
        opacity: lockedForFree ? 0.82 : 1,
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px', cursor: 'pointer', gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <ProviderBadge id={provider.id} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{provider.name}</div>
              {data && data.status && data.status.indicator && data.status.indicator !== 'none' && (() => {
                // Statuspage indicator → color + short label.
                const ind = data.status.indicator;
                const palette = {
                  minor:       { c: t.amber, label: 'Minor' },
                  major:       { c: t.red,   label: 'Major' },
                  critical:    { c: t.red,   label: 'Outage' },
                  maintenance: { c: t.accent2, label: 'Maint.' },
                };
                const meta = palette[ind] || { c: t.amber, label: ind };
                return (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      if (data.status.pageUrl && onOpenExternal) onOpenExternal(data.status.pageUrl);
                    }}
                    title={`${data.status.description || meta.label} — click to open status page`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: meta.c,
                      background: `${meta.c}1f`,
                      border: `1px solid ${meta.c}55`,
                      borderRadius: 999, padding: '1px 6px',
                      cursor: data.status.pageUrl ? 'pointer' : 'default',
                    }}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: meta.c,
                      boxShadow: `0 0 4px ${meta.c}`,
                      animation: ind === 'critical' || ind === 'major' ? 'llmpulse 1.4s ease-in-out infinite' : 'none',
                    }} />
                    {meta.label}
                  </span>
                );
              })()}
              <div style={{
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform .2s', color: t.textMute, display: 'inline-flex',
              }}>{Icons.caret}</div>
            </div>
            <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 1, fontFamily: TOKENS.type.mono }}>
              {(() => {
                // Provider-specific subtitles. Keyless providers show what's
                // being tracked locally; keyed providers show the masked key tail.
                if (provider.id === 'claude-code') return data?.present ? 'CLI + Desktop · real-time' : 'not detected';
                if (provider.id === 'codex')       return data?.present ? 'CLI + Desktop · real-time' : 'not detected';
                if (provider.id === 'gemini-cli')  return data?.present ? 'CLI · real-time' : 'not detected';
                if (provider.keyless)              return data?.present ? 'local · real-time' : 'not detected';
                return data?.present ? `•••• ${data.tail}` : 'No key';
              })()}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {rightSide()}
        </div>
      </div>
      {expanded && (
        <div style={{
          padding: '0 14px 12px',
          borderTop: `1px solid ${t.cardBorder}`,
          animation: 'llmfade .2s ease',
        }}>
          {renderBody()}
        </div>
      )}
    </div>
  );
}
window.ProviderCard = ProviderCard;
