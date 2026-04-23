// Provider card — collapsible row with expanded stats + model list.
// Ported from Claude Design; added a 'loading' status branch.
const { useState: useStateC } = React;

function ProviderCard({ provider, data, expanded, onToggle, onOpenSettings, onOpenExternal, isPro = false, onOpenLicense }) {
  const [hover, setHover] = useStateC(false);
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

        {/* Remaining balance (OpenRouter) / rate-limit quota (Codex) strip */}
        {(data.balance || data.rateLimits) && (
          <div style={{
            background: 'rgba(52,211,153,0.08)',
            border: '1px solid rgba(52,211,153,0.22)',
            borderRadius: 8, padding: '8px 10px', marginBottom: 10,
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 11, color: t.text,
          }}>
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
            {data.rateLimits && !data.balance && (() => {
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

        {trend.length > 1 && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 8, padding: '8px 10px 8px', marginBottom: 10,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: t.textMute, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Daily tokens</div>
              <div style={{ fontSize: 10, color: t.textDim, fontVariantNumeric: 'tabular-nums' }}>avg {fmt(dailyAvg)}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 32 }}>
              {trend.map((v, i) => (
                <div key={i} style={{
                  flex: 1,
                  height: v > 0 ? `${Math.max(8, (v / trendMax) * 100)}%` : '6%',
                  background: v > 0
                    ? `linear-gradient(180deg, ${t.accent} 0%, rgba(124,92,255,0.35) 100%)`
                    : 'rgba(255,255,255,0.06)',
                  borderRadius: 1.5,
                }} title={fmt(v) + ' tokens'} />
              ))}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 9, color: t.textMute, marginTop: 4, fontVariantNumeric: 'tabular-nums',
            }}>
              <span>{trend.length}d ago</span>
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
        <div style={{ fontSize: 9, color: t.textMute, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, marginTop: 4 }}>
          By model
        </div>
        <div>
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
        </div>
        <div style={{
          marginTop: 8, paddingTop: 6, borderTop: `1px solid ${t.cardBorder}`,
          fontSize: 9.5, color: t.textMute, display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Accrued spend · UTC window</span>
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
    const tokens = (data.totals.input || 0) + (data.totals.output || 0) + (data.totals.cache_read || 0) + (data.totals.cached || 0);
    const info = PROVIDER_COST_INFO[provider.id];
    const isEstimate = !!(info && info.emphasis);

    // For local (estimate) cards: tokens are the primary number, cost is the tiny caption.
    // For API cards: dollars are the primary number, "actual spend" is the tiny caption.
    const primary = isEstimate ? fmt(tokens) + ' tok' : fmtMoney(data.totals.cost);
    const secondary = isEstimate
      ? { text: '≈ ' + fmtMoney(data.totals.cost) + ' est.', color: TOKENS.color.amber }
      : { text: 'actual spend · ' + fmt(tokens) + ' tok', color: t.textDim };

    return (
      <>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end',
            fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
          }}>
            <span>{primary}</span>
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
