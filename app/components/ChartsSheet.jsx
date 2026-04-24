// Charts sheet — full-screen analytics view with KPI tiles, stacked area
// cost timeline, tokens-by-category breakdown, a top-models ranking, and a
// 30-day linear-regression projection. Data is pulled entirely from the
// cached `usage` map in App.jsx — no re-fetch, so numbers match the cards.
const { useState: useStateCh, useEffect: useEffectCh, useMemo: useMemoCh, useRef: useRefCh, useLayoutEffect: useLayoutEffectCh } = React;

// Hook: reports the live pixel width of a DOM node so SVG charts can render
// at exact size without viewBox stretch. Re-measures on window resize via
// ResizeObserver.
function useMeasuredWidth(fallback = 360) {
  const ref = useRefCh(null);
  const [width, setWidth] = useStateCh(fallback);
  useLayoutEffectCh(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(100, Math.floor(el.clientWidth)));
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return [ref, width];
}

const TOKEN_CATEGORIES = [
  { key: 'input',          label: 'Input',          color: '#7c5cff' },
  { key: 'output',         label: 'Output',         color: '#22d3ee' },
  { key: 'cache_read',     label: 'Cache read',     color: '#34d399' },
  { key: 'cache_creation', label: 'Cache write',    color: '#fbbf24' },
  { key: 'cached',         label: 'Cached',         color: '#60a5fa' },
  { key: 'reasoning',      label: 'Reasoning',      color: '#f472b6' },
  { key: 'tool',           label: 'Tool',           color: '#f87171' },
];

// Days we regress over to forecast the next month. Too short and the line
// whips on one noisy day; too long and it misses recent trend shifts.
const REGRESSION_WINDOW = 14;
const PROJECTION_DAYS = 30;

function ChartsSheet({ open, onClose, onBack, usage = {}, days = 30, onDaysChange, isPro = false }) {
  const t = TOKENS.color;
  const [selected, setSelected] = useStateCh(() => new Set(PROVIDERS.map((p) => p.id)));
  // View mode — 'cost' focuses on dollars, 'tokens' focuses on token counts.
  // Persisted so users who prefer one view land there next time.
  const [mode, setMode] = useStateCh(() => {
    try { return localStorage.getItem('chartsMode') || 'cost'; } catch { return 'cost'; }
  });
  const updateMode = (v) => {
    setMode(v);
    try { localStorage.setItem('chartsMode', v); } catch {}
  };
  // Ref to the scrollable content region — we clone SVGs / nodes from here
  // for PDF + PNG export so what the user sees is exactly what they export.
  const contentRef = useRefCh(null);
  const [exporting, setExporting] = useStateCh(null); // null | 'pdf' | 'png'
  const [exportMenuOpen, setExportMenuOpen] = useStateCh(false);
  const [exportMsg, setExportMsg] = useStateCh(null);   // { kind: 'ok'|'err', text }

  // Seed provider filter when the sheet opens so we default to providers
  // that actually have data — no point in a filter chip for an empty series.
  useEffectCh(() => {
    if (!open) return;
    const next = new Set();
    for (const p of PROVIDERS) {
      const u = usage[p.id];
      if (u && u !== 'loading' && u.ok) next.add(p.id);
    }
    if (next.size === 0) for (const p of PROVIDERS) next.add(p.id);
    setSelected(next);
  }, [open]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const activeProviders = useMemoCh(
    () => PROVIDERS.filter((p) => selected.has(p.id)),
    [selected],
  );

  // ---- Aggregation ---------------------------------------------------------
  const axis = useMemoCh(() => buildDailyAxis(days), [days, open]);

  // Aggregate both cost and token series in one pass — consumed by whichever
  // mode ('cost' | 'tokens') is active. Keeping both around is cheap and lets
  // the toggle switch instantly without re-computing.
  const agg = useMemoCh(() => {
    const costByDay   = axis.map(() => ({ total: 0 }));
    const tokensByDay = axis.map(() => ({ total: 0 }));
    const categoryByDay = axis.map(() => Object.fromEntries(TOKEN_CATEGORIES.map((c) => [c.key, 0])));

    for (const p of activeProviders) {
      const u = usage[p.id];
      if (!u || u === 'loading' || !u.ok) continue;
      const idx = indexBreakdown(u.data?.dailyBreakdown);
      axis.forEach((date, i) => {
        const row = idx[date];
        if (!row) return;
        const cost = Number(row.cost || 0);
        costByDay[i][p.id] = cost;
        costByDay[i].total += cost;

        let tokenTotal = 0;
        for (const c of TOKEN_CATEGORIES) {
          const v = Number(row[c.key] || 0);
          if (v) {
            categoryByDay[i][c.key] += v;
            tokenTotal += v;
          }
        }
        tokensByDay[i][p.id] = tokenTotal;
        tokensByDay[i].total += tokenTotal;
      });
    }

    // Model ranking — merge per-provider `models` arrays, tag with provider.
    const modelMap = {};
    for (const p of activeProviders) {
      const u = usage[p.id];
      if (!u || u === 'loading' || !u.ok) continue;
      for (const m of u.data?.models || []) {
        const name = m.model || m.name || 'unknown';
        const key = `${p.id}::${name}`;
        const tokens = (m.input || 0) + (m.output || 0) + (m.cache_read || 0)
                     + (m.cache_creation || 0) + (m.cached || 0) + (m.reasoning || 0)
                     + (m.thoughts || 0) + (m.tool || 0);
        const prev = modelMap[key] || { provider: p.id, provider_name: p.name, model: name, cost: 0, tokens: 0, requests: 0 };
        prev.cost     += Number(m.cost || 0);
        prev.tokens   += tokens;
        prev.requests += Number(m.requests || 0);
        modelMap[key] = prev;
      }
    }
    const modelsByCost   = Object.values(modelMap).sort((a, b) => (b.cost   - a.cost)   || (b.tokens - a.tokens));
    const modelsByTokens = Object.values(modelMap).sort((a, b) => (b.tokens - a.tokens) || (b.cost   - a.cost));

    // KPIs — cost mode
    const totalCost = costByDay.reduce((a, d) => a + d.total, 0);
    const daysWithSpend = costByDay.filter((d) => d.total > 0).length || 1;
    const avgDailyCost = totalCost / daysWithSpend;

    // KPIs — tokens mode
    const totalTokens = tokensByDay.reduce((a, d) => a + d.total, 0);
    const daysWithTokens = tokensByDay.filter((d) => d.total > 0).length || 1;
    const avgDailyTokens = totalTokens / daysWithTokens;

    // Projections — OLS on trailing window, for both metrics.
    const projectOne = (series) => {
      const trailing = series.slice(-REGRESSION_WINDOW);
      const reg = linearRegression(trailing);
      const np = trailing.length;
      let projected = 0;
      const projSeries = [];
      for (let i = 0; i < PROJECTION_DAYS; i++) {
        const y = Math.max(0, reg.slope * (np + i) + reg.intercept);
        projSeries.push(y);
        projected += y;
      }
      return { trailing, reg, projSeries, projected };
    };
    const costProj   = projectOne(costByDay.map((d) => d.total));
    const tokensProj = projectOne(tokensByDay.map((d) => d.total));

    return {
      costByDay, tokensByDay, categoryByDay,
      modelsByCost, modelsByTokens,
      totalCost, avgDailyCost,
      totalTokens, avgDailyTokens,
      costProj, tokensProj,
    };
  }, [axis, activeProviders, usage]);

  // ---- Export handlers ---------------------------------------------------
  const todayStr = new Date().toISOString().slice(0, 10);
  const exportSuffix = `${mode}-${days}d-${todayStr}`;

  const doExportPdf = async () => {
    if (!contentRef.current || exporting) return;
    setExporting('pdf');
    setExportMenuOpen(false);
    try {
      const html = buildPdfHtml(contentRef.current, {
        mode, days, rangeLabel: rangeLabelShort(days),
        generatedAt: new Date().toLocaleString(),
      });
      const res = await window.api.exportChartsPdf({
        html,
        suggestedName: `tokenly-analytics-${exportSuffix}.pdf`,
      });
      if (res?.ok) setExportMsg({ kind: 'ok', text: 'PDF saved.' });
      else if (!res?.canceled) setExportMsg({ kind: 'err', text: res?.error || 'PDF export failed.' });
    } catch (err) {
      setExportMsg({ kind: 'err', text: err?.message || 'PDF export failed.' });
    } finally {
      setExporting(null);
    }
  };

  const doExportPng = async () => {
    if (!contentRef.current || exporting) return;
    setExporting('png');
    setExportMenuOpen(false);
    try {
      const files = await svgsToPngBundle(contentRef.current, exportSuffix);
      if (!files.length) {
        setExportMsg({ kind: 'err', text: 'No SVG charts found to export.' });
        return;
      }
      const res = await window.api.saveBundle({
        files,
        title: 'Choose a folder for the chart PNGs',
      });
      if (res?.ok) setExportMsg({ kind: 'ok', text: `Saved ${res.count} PNG${res.count === 1 ? '' : 's'}.` });
      else if (!res?.canceled) setExportMsg({ kind: 'err', text: res?.error || 'PNG export failed.' });
    } catch (err) {
      setExportMsg({ kind: 'err', text: err?.message || 'PNG export failed.' });
    } finally {
      setExporting(null);
    }
  };

  useEffectCh(() => {
    if (!exportMsg) return;
    const id = setTimeout(() => setExportMsg(null), 2200);
    return () => clearTimeout(id);
  }, [exportMsg]);

  // Per-chart export: captures just that card's DOM rect as a PNG and saves.
  const doExportCard = async (cardEl, title) => {
    if (!cardEl || exporting) return;
    setExporting('png');
    try {
      const { bytes } = await captureChartCard(cardEl, 1);
      if (!bytes) {
        setExportMsg({ kind: 'err', text: 'Capture failed.' });
        return;
      }
      const res = await window.api.saveBinaryFile({
        suggestedName: `tokenly-${slugify(title || 'chart')}-${exportSuffix}.png`,
        bytes,
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });
      if (res?.ok) setExportMsg({ kind: 'ok', text: 'PNG saved.' });
      else if (!res?.canceled) setExportMsg({ kind: 'err', text: res?.error || 'PNG save failed.' });
    } catch (err) {
      setExportMsg({ kind: 'err', text: err?.message || 'PNG save failed.' });
    } finally {
      setExporting(null);
    }
  };

  // Mode-dependent view variables — picked here so every chart receives a
  // consistent set of "current metric" data and formatters.
  const isTokens = mode === 'tokens';
  const seriesByDay = isTokens ? agg.tokensByDay : agg.costByDay;
  const models      = isTokens ? agg.modelsByTokens : agg.modelsByCost;
  const total       = isTokens ? agg.totalTokens : agg.totalCost;
  const avgDaily    = isTokens ? agg.avgDailyTokens : agg.avgDailyCost;
  const proj        = isTokens ? agg.tokensProj : agg.costProj;
  const fmtValue    = isTokens ? fmt : fmtMoney;
  const fmtCompact  = isTokens ? fmtTokensCompact : fmtMoneyCompact;
  const unitSuffix  = isTokens ? ' tok' : '';
  const unitPerDay  = isTokens ? '/d' : '/d';
  const topModel    = models[0] || null;

  // ---- Render --------------------------------------------------------------
  return (
    <React.Fragment>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .2s',
          zIndex: 50,
        }}
      />
      <section
        style={{
          position: 'absolute', inset: 0,
          background: `
            radial-gradient(600px 220px at 50% -40px, rgba(124,92,255,0.2), transparent 65%),
            linear-gradient(180deg, #12121c 0%, #08080d 100%)
          `,
          borderTop: '1px solid rgba(232,164,65,0.45)',
          boxShadow: '0 -1px 24px rgba(232,164,65,0.12)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform .28s cubic-bezier(0.2, 0.9, 0.3, 1)',
          // zIndex 70 (not 60 like the other sheets). The LicenseSheet and other
          // bottom sheets sit later in the App.jsx render tree at zIndex 60, so
          // at equal priority they'd paint on top of Analytics even while closed
          // — transform:translateY(100%) hides them visually but any internal
          // scroll/focus inside can peek through. 70 keeps Analytics watertight.
          zIndex: 70,
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Sticky header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 5,
          padding: '10px 14px 8px',
          background: 'linear-gradient(180deg, #12121c 0%, rgba(18,18,28,0.92) 90%, rgba(18,18,28,0) 100%)',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onBack && <IconBtn onClick={onBack} title="Back">{Icons.arrowLeft}</IconBtn>}
            <div style={{ fontSize: 14, fontWeight: 600, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              Analytics
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                color: '#1a1408', lineHeight: 1,
                background: 'linear-gradient(135deg, #ffd772, #e8a441)',
                border: '1px solid rgba(232,164,65,0.55)',
              }}>Max</span>
            </div>
            {/* Export button — gold-tinted like other Max surfaces. Opens a small
                popover menu with the two supported formats. */}
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <button
                onClick={() => setExportMenuOpen((o) => !o)}
                disabled={!!exporting}
                title={exporting ? 'Exporting…' : 'Export charts'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  height: 28, padding: '0 10px', borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(255,215,114,0.2), rgba(232,164,65,0.08))',
                  border: '1px solid rgba(232,164,65,0.5)',
                  color: exporting ? t.textDim : '#ffd772',
                  cursor: exporting ? 'default' : 'pointer',
                  fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                  boxShadow: '0 0 10px rgba(232,164,65,0.2)',
                  opacity: exporting ? 0.7 : 1,
                  transition: 'opacity .15s',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {exporting === 'pdf' ? 'PDF…' : exporting === 'png' ? 'PNG…' : 'Export'}
              </button>
              {exportMenuOpen && !exporting && (
                <React.Fragment>
                  {/* Dismiss on outside click */}
                  <div
                    onClick={() => setExportMenuOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 9 }}
                  />
                  <div style={{
                    position: 'absolute', top: 34, right: 0, zIndex: 10,
                    minWidth: 220,
                    background: 'linear-gradient(180deg, #15151f 0%, #0d0d14 100%)',
                    border: '1px solid rgba(232,164,65,0.4)',
                    borderRadius: 10, padding: 6,
                    boxShadow: '0 12px 28px rgba(0,0,0,0.5), 0 0 14px rgba(232,164,65,0.15)',
                  }}>
                    <ExportMenuItem
                      icon={(
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      )}
                      title="PDF report"
                      subtitle="One polished document · KPIs + all charts"
                      onClick={doExportPdf}
                      t={t}
                    />
                    <ExportMenuItem
                      icon={(
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="9" cy="9" r="1.5" />
                          <path d="M21 15l-5-5L5 21" />
                        </svg>
                      )}
                      title="PNG per chart"
                      subtitle="One file per chart · great for Slack/decks"
                      onClick={doExportPng}
                      t={t}
                    />
                  </div>
                </React.Fragment>
              )}
            </div>
            {exportMsg && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: exportMsg.kind === 'ok' ? t.green : t.red,
                whiteSpace: 'nowrap',
              }}>{exportMsg.text}</span>
            )}
            <IconBtn onClick={onClose} title="Close">{Icons.close}</IconBtn>
          </div>

          {/* Range picker — mirrors the main popover's ranges */}
          <div style={{
            marginTop: 8,
            display: 'flex',
            background: 'rgba(0,0,0,0.3)',
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 8, padding: 2, gap: 1,
          }}>
            {[
              { v: 7,   label: '7d' },
              { v: 14,  label: '14d' },
              { v: 30,  label: '30d' },
              { v: 90,  label: '90d' },
              { v: 180, label: '180d' },
            ].map((r) => {
              const active = days === r.v;
              return (
                <button
                  key={r.v}
                  onClick={() => onDaysChange && onDaysChange(r.v)}
                  style={{
                    flex: 1, border: 0, padding: '5px 0', borderRadius: 6,
                    background: active ? t.accent : 'transparent',
                    color: active ? '#fff' : t.textDim,
                    fontSize: 10.5, fontWeight: 600, letterSpacing: '-0.01em',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontVariantNumeric: 'tabular-nums',
                    transition: 'background .15s, color .15s',
                  }}
                >{r.label}</button>
              );
            })}
          </div>

          {/* Cost / Tokens mode toggle — prominent tab UI */}
          <div style={{
            marginTop: 8,
            display: 'flex',
            background: 'rgba(0,0,0,0.35)',
            border: `1px solid ${t.cardBorder}`,
            borderRadius: 9, padding: 2, gap: 1,
          }}>
            {[
              { v: 'cost',   label: '$ Cost',  sub: 'USD spend' },
              { v: 'tokens', label: 'Tokens',  sub: 'Token volume' },
            ].map((opt) => {
              const active = mode === opt.v;
              return (
                <button
                  key={opt.v}
                  onClick={() => updateMode(opt.v)}
                  style={{
                    flex: 1, border: 0, padding: '6px 10px', borderRadius: 7,
                    background: active ? `linear-gradient(135deg, ${t.accent}, ${t.accent}dd)` : 'transparent',
                    color: active ? '#fff' : t.textDim,
                    fontSize: 11.5, fontWeight: 700, letterSpacing: '-0.01em',
                    cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: active ? `0 2px 8px ${t.accent}44` : 'none',
                    transition: 'background .15s, color .15s',
                  }}
                  title={opt.sub}
                >{opt.label}</button>
              );
            })}
          </div>

          {/* Provider filter chips — full names for scannability; padding +
              font shrunk slightly so six chips still fit two rows at 460px. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {PROVIDERS.map((p) => {
              const checked = selected.has(p.id);
              const [a, b] = TOKENS.color.providers[p.id] || [t.accent, t.accent];
              const u = usage[p.id];
              const hasData = u && u !== 'loading' && u.ok;
              return (
                <button
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  title={hasData ? p.name : `${p.name} — no data loaded`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 8px', borderRadius: 999,
                    background: checked ? `linear-gradient(135deg, ${a}33, ${b}33)` : 'rgba(0,0,0,0.25)',
                    border: `1px solid ${checked ? b + '88' : t.cardBorder}`,
                    color: checked ? t.text : t.textDim,
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 9.5, fontWeight: 600, letterSpacing: '-0.01em',
                    opacity: hasData ? 1 : 0.55,
                    whiteSpace: 'nowrap',
                    transition: 'background .15s, border-color .15s',
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${a}, ${b})`,
                    boxShadow: checked ? `0 0 6px ${b}55` : 'none',
                  }} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} style={{ padding: '4px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* KPI tiles — 2x2 grid; metric swaps with the Cost/Tokens toggle */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <KPI
              label={`${rangeLabelShort(days)} ${isTokens ? 'tokens' : 'spend'}`}
              value={fmtValue(total)}
              t={t}
              tint={t.accent}
            />
            <KPI
              label={`Avg daily ${isTokens ? 'tokens' : 'spend'}`}
              value={fmtValue(avgDaily)}
              hint={`over ${Math.min(days, seriesByDay.filter((d) => d.total > 0).length || 1)} active days`}
              t={t}
              tint={t.accent2}
            />
            <KPI
              label="Projected next 30d"
              value={fmtValue(proj.projected)}
              hint={projectionHint(proj.reg, proj.trailing)}
              t={t}
              tint={t.green}
            />
            <KPI
              label={`Top model by ${isTokens ? 'tokens' : 'spend'}`}
              value={topModel ? shortModel(topModel.model) : '—'}
              hint={topModel
                ? (isTokens
                    ? `${fmt(topModel.tokens)} tok · ${fmtMoney(topModel.cost)}`
                    : `${fmtMoney(topModel.cost)} · ${fmt(topModel.tokens)} tok`)
                : 'no usage yet'}
              t={t}
              tint={t.amber}
            />
          </div>

          {/* Chart 1 — Over time, stacked by provider (cost OR tokens) */}
          <ChartCard
            t={t}
            title={isTokens ? 'Tokens over time' : 'Cost over time'}
            subtitle={`Per day, stacked by provider · past ${days}d`}
            legend={activeProviders.map((p) => {
              const [a, b] = TOKENS.color.providers[p.id];
              return { label: p.name, color: b };
            })}
            onExport={doExportCard}
            exporting={exporting}
          >
            <StackedAreaChart
              axis={axis}
              valueByDay={seriesByDay}
              providers={activeProviders}
              fmtCompact={fmtCompact}
              fmtFull={fmtValue}
              unitPerDay={unitPerDay}
              t={t}
            />
          </ChartCard>

          {/* Chart 2 — Tokens by category (only meaningful in Tokens mode; hide in Cost mode to stay focused) */}
          {isTokens && (
            <ChartCard
              t={t}
              title="Tokens by category"
              subtitle="Daily stacked · by token type"
              legend={TOKEN_CATEGORIES
                .filter((c) => agg.categoryByDay.some((d) => d[c.key] > 0))
                .map((c) => ({ label: c.label, color: c.color }))}
              onExport={doExportCard}
              exporting={exporting}
            >
              <StackedBarChart axis={axis} categoryByDay={agg.categoryByDay} t={t} />
            </ChartCard>
          )}

          {/* Chart 3 — Projection (cost OR tokens) */}
          <ChartCard
            t={t}
            title={isTokens ? 'Token projection' : 'Spend projection'}
            subtitle={`Linear fit on trailing ${REGRESSION_WINDOW}d · forecast next ${PROJECTION_DAYS}d`}
            onExport={doExportCard}
            exporting={exporting}
          >
            <ProjectionChart
              trailing={proj.trailing}
              projection={proj.projSeries}
              fmtCompact={fmtCompact}
              fmtFull={fmtValue}
              unitPerDay={unitPerDay}
              t={t}
            />
          </ChartCard>

          {/* Chart 4 — Top models */}
          <ChartCard
            t={t}
            title={isTokens ? 'Top models by tokens' : 'Top models by spend'}
            subtitle="Ranked across all selected providers"
            onExport={doExportCard}
            exporting={exporting}
          >
            <TopModelsBar
              models={models.slice(0, 12)}
              total={total}
              primaryKey={isTokens ? 'tokens' : 'cost'}
              t={t}
            />
          </ChartCard>
        </div>
      </section>
    </React.Fragment>
  );
}

// ---- Atoms -----------------------------------------------------------------

function ExportMenuItem({ icon, title, subtitle, onClick, t }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 7,
        background: 'transparent', border: 0,
        cursor: 'pointer', fontFamily: 'inherit', color: t.text,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(232,164,65,0.1)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{
        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
        background: 'linear-gradient(135deg, rgba(255,215,114,0.2), rgba(232,164,65,0.08))',
        border: '1px solid rgba(232,164,65,0.4)',
        color: '#ffd772',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 9.5, color: t.textMute, marginTop: 1, lineHeight: 1.3 }}>{subtitle}</div>
      </div>
    </button>
  );
}

function KPI({ label, value, hint, t, tint }) {
  return (
    <div style={{
      background: t.card, border: `1px solid ${t.cardBorder}`,
      borderRadius: 10, padding: '10px 12px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${tint}, transparent)`,
      }} />
      <div style={{
        fontSize: 9.5, color: t.textMute, letterSpacing: '0.05em',
        textTransform: 'uppercase', fontWeight: 600, marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em',
        color: t.text, fontVariantNumeric: 'tabular-nums',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</div>
      {hint && (
        <div style={{
          fontSize: 9.5, color: t.textDim, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{hint}</div>
      )}
    </div>
  );
}

function ChartCard({ t, title, subtitle, legend, children, onExport, exporting }) {
  const cardRef = useRefCh(null);
  const handleExport = (e) => {
    e.stopPropagation();
    if (onExport && cardRef.current) onExport(cardRef.current, title);
  };
  return (
    <div ref={cardRef} style={{
      background: t.card, border: `1px solid ${t.cardBorder}`,
      borderRadius: 10, padding: '12px 14px',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Title row — with inline export button on the right */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.4 }}>{subtitle}</div>
          )}
        </div>
        {onExport && (
          <button
            onClick={handleExport}
            disabled={!!exporting}
            title={exporting ? 'Exporting…' : 'Export this chart as PNG'}
            // Intentionally omitted from PDF/PNG capture via [data-export-button] — the
            // PDF builder strips buttons, and capturePage includes them but the ink is
            // too subtle to hurt.
            data-export-button
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(255,215,114,0.15), rgba(232,164,65,0.05))',
              border: '1px solid rgba(232,164,65,0.35)',
              borderRadius: 6,
              color: exporting ? t.textDim : '#ffd772',
              cursor: exporting ? 'default' : 'pointer',
              opacity: exporting ? 0.6 : 1,
              padding: 0,
              transition: 'opacity .15s, border-color .15s',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
      </div>
      {/* Legend — separate row below the title so it never fights the y-axis labels
          for visual real estate. Chip style makes "this is a key" unambiguous. */}
      {legend && legend.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4,
          marginBottom: 10,
          paddingBottom: 10,
          borderBottom: `1px dashed ${t.cardBorder}`,
        }}>
          {legend.map((l, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '2px 7px', borderRadius: 999,
              background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${t.cardBorder}`,
              fontSize: 9.5, color: t.textDim, fontWeight: 600,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: 2,
                background: l.color,
                boxShadow: `0 0 6px ${l.color}55`,
              }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

// ---- Charts ----------------------------------------------------------------

// Stacked area — providers stacked bottom-up. `valueByDay[i][pid]` = the
// metric value (either cost or tokens) for that provider on axis[i].
// `fmtCompact` / `fmtFull` are supplied by the parent so the same chart
// works for both $ and token modes.
function StackedAreaChart({ axis, valueByDay, providers, fmtCompact, fmtFull, unitPerDay, t }) {
  const [ref, W] = useMeasuredWidth(360);
  const H = 168, PAD_L = 44, PAD_R = 22, PAD_T = 24, PAD_B = 22;
  const n = axis.length;

  const totals = valueByDay.map((d) => d.total);
  const maxStackedTotal = Math.max(0.01, ...totals);
  const xFor = (i) => n <= 1 ? W / 2 : PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const yFor = (v) => PAD_T + (1 - v / maxStackedTotal) * (H - PAD_T - PAD_B);

  const cumulative = new Array(n).fill(0);
  const layers = [];
  for (const p of providers) {
    const [a, b] = TOKENS.color.providers[p.id] || [t.accent, t.accent];
    const top = [];
    const bot = [];
    for (let i = 0; i < n; i++) {
      const v = Number(valueByDay[i][p.id] || 0);
      const prev = cumulative[i];
      const next = prev + v;
      cumulative[i] = next;
      top.push([xFor(i), yFor(next)]);
      bot.push([xFor(i), yFor(prev)]);
    }
    layers.push({ path: pathFromPoints(top, bot), gradId: `areaGrad-${p.id}`, a, b, abbr: p.abbr });
  }

  const ticks = n <= 1 ? [0] : [0, Math.floor((n - 1) / 3), Math.floor(2 * (n - 1) / 3), n - 1];
  const empty = maxStackedTotal <= 0.01;

  const peakIdx = totals.reduce((best, v, i) => (v > totals[best] ? i : best), 0);
  const peakVal = totals[peakIdx] || 0;
  const avgVal = totals.reduce((a, v) => a + v, 0) / Math.max(1, totals.length);
  const yTicks = [0, 0.33, 0.66, 1].map((f) => ({ f, v: maxStackedTotal * f }));

  // Keep the peak callout inside the chart area — clamp text-anchor near edges.
  const peakAnchor = peakIdx === 0 ? 'start' : peakIdx === n - 1 ? 'end' : 'middle';

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <defs>
          {layers.map((l) => (
            <linearGradient key={l.gradId} id={l.gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={l.b} stopOpacity="0.85" />
              <stop offset="100%" stopColor={l.a} stopOpacity="0.15" />
            </linearGradient>
          ))}
        </defs>
        {yTicks.map(({ f, v }) => {
          const y = PAD_T + (1 - f) * (H - PAD_T - PAD_B);
          return (
            <g key={f}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end"
                fill={TOKENS.color.textMute} fontSize="9" fontFamily={TOKENS.type.mono}>
                {empty ? (f === 0 ? (fmtCompact(0)) : '') : fmtCompact(v)}
              </text>
            </g>
          );
        })}
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B}
          stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        {!empty && layers.map((l) => (
          <path key={l.gradId} d={l.path}
            fill={`url(#${l.gradId})`}
            stroke={l.b} strokeWidth="1" strokeOpacity="0.85" />
        ))}
        {/* Average reference — dashed amber line; label floated inside the chart above the line */}
        {!empty && avgVal > 0 && (
          <g>
            <line x1={PAD_L} x2={W - PAD_R} y1={yFor(avgVal)} y2={yFor(avgVal)}
              stroke={t.amber} strokeDasharray="3 3" strokeWidth="1" strokeOpacity="0.7" />
            <text x={W - PAD_R - 2} y={yFor(avgVal) - 3} textAnchor="end"
              fill={t.amber} fontSize="9" fontFamily={TOKENS.type.mono}>
              avg {fmtCompact(avgVal)}{unitPerDay}
            </text>
          </g>
        )}
        {!empty && peakVal > 0 && (
          <g>
            <circle cx={xFor(peakIdx)} cy={yFor(peakVal)} r="3"
              fill={t.accent2} stroke="#0a0a0f" strokeWidth="1.5" />
            <text x={xFor(peakIdx)} y={Math.max(PAD_T - 8, yFor(peakVal) - 6)} textAnchor={peakAnchor}
              fill={t.accent2} fontSize="9" fontFamily={TOKENS.type.mono} fontWeight="600">
              peak {fmtCompact(peakVal)}
            </text>
          </g>
        )}
        {empty && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill={TOKENS.color.textMute} fontSize="10" fontFamily={TOKENS.type.family}>
            No activity in this window
          </text>
        )}
        {ticks.map((i) => (
          <text key={i}
            x={xFor(i)} y={H - 6}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            fill={TOKENS.color.textMute}
            fontSize="9" fontFamily={TOKENS.type.mono}
          >{i === n - 1 ? 'today' : formatShortDate(axis[i])}</text>
        ))}
      </svg>
    </div>
  );
}

function pathFromPoints(top, bot) {
  if (!top.length) return '';
  const first = top[0];
  let d = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`;
  for (let i = 1; i < top.length; i++) d += ` L ${top[i][0].toFixed(2)} ${top[i][1].toFixed(2)}`;
  for (let i = bot.length - 1; i >= 0; i--) d += ` L ${bot[i][0].toFixed(2)} ${bot[i][1].toFixed(2)}`;
  d += ' Z';
  return d;
}

// Stacked vertical bars — CSS/flex, works great at narrow widths. Y-axis
// on the left, header-strip summary on the right so a user can translate
// the tallest bar into a real token count at a glance.
function StackedBarChart({ axis, categoryByDay, t }) {
  const n = axis.length;
  const perDayTotals = categoryByDay.map((d) => TOKEN_CATEGORIES.reduce((a, c) => a + (d[c.key] || 0), 0));
  const max = Math.max(1, ...perDayTotals);
  const empty = max <= 1;
  const totalTokens = perDayTotals.reduce((a, v) => a + v, 0);
  const peakIdx = perDayTotals.reduce((best, v, i) => (v > perDayTotals[best] ? i : best), 0);
  const avgTokens = totalTokens / Math.max(1, n);

  const gap = n > 60 ? 0 : n > 30 ? 1 : 2;
  const CHART_H = 140;
  const Y_AXIS_W = 40;
  const yTicks = [1, 0.66, 0.33, 0];

  return (
    <div style={{ width: '100%' }}>
      {/* Summary strip — avg + peak side-by-side above the bars */}
      {!empty && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          fontSize: 9.5, color: t.textDim, marginBottom: 6,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>
            <span style={{ color: t.textMute }}>Total</span>{' '}
            <span style={{ color: t.text, fontFamily: TOKENS.type.mono, fontWeight: 600 }}>{fmt(totalTokens)}</span>
          </span>
          <span>
            <span style={{ color: t.textMute }}>Peak</span>{' '}
            <span style={{ color: t.accent2, fontFamily: TOKENS.type.mono, fontWeight: 600 }}>{fmt(perDayTotals[peakIdx])}</span>
            <span style={{ color: t.textMute, marginLeft: 4 }}>· {formatShortDate(axis[peakIdx])}</span>
          </span>
          <span>
            <span style={{ color: t.textMute }}>Avg/day</span>{' '}
            <span style={{ color: t.amber, fontFamily: TOKENS.type.mono, fontWeight: 600 }}>{fmt(avgTokens)}</span>
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4 }}>
        {/* Y-axis labels */}
        <div style={{
          width: Y_AXIS_W, height: CHART_H, position: 'relative',
          flexShrink: 0,
        }}>
          {yTicks.map((f) => (
            <div key={f} style={{
              position: 'absolute', right: 4,
              top: (1 - f) * CHART_H - 6,
              fontSize: 9, color: t.textMute,
              fontFamily: TOKENS.type.mono, fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}>{empty ? (f === 0 ? '0' : '') : fmt(max * f)}</div>
          ))}
        </div>

        {/* Bars container */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {/* Background gridlines */}
          {yTicks.map((f) => (
            <div key={f} style={{
              position: 'absolute', left: 0, right: 0,
              top: (1 - f) * CHART_H,
              height: 1, background: f === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
              pointerEvents: 'none',
            }} />
          ))}
          {/* Average reference line */}
          {!empty && avgTokens > 0 && (
            <React.Fragment>
              <div style={{
                position: 'absolute', left: 0, right: 0,
                top: (1 - avgTokens / max) * CHART_H,
                height: 1,
                backgroundImage: `linear-gradient(to right, ${t.amber} 50%, transparent 50%)`,
                backgroundSize: '6px 1px',
                opacity: 0.7, pointerEvents: 'none', zIndex: 2,
              }} />
              <div style={{
                position: 'absolute', right: 0,
                top: (1 - avgTokens / max) * CHART_H - 11,
                fontSize: 8.5, color: t.amber, fontFamily: TOKENS.type.mono,
                background: 'rgba(10,10,15,0.85)', padding: '0 3px', borderRadius: 2,
                pointerEvents: 'none', zIndex: 3,
              }}>avg</div>
            </React.Fragment>
          )}

          <div style={{
            display: 'flex', alignItems: 'flex-end', gap,
            height: CHART_H,
            position: 'relative',
          }}>
            {empty ? (
              <div style={{
                flex: 1, textAlign: 'center', color: t.textMute,
                fontSize: 10, alignSelf: 'center',
              }}>No token activity in this window</div>
            ) : (
              categoryByDay.map((d, i) => {
                const total = perDayTotals[i];
                const heightPct = (total / max) * 100;
                const isPeak = i === peakIdx && total > 0;
                return (
                  <div key={i} style={{
                    flex: 1, height: '100%',
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                    minWidth: 1,
                  }} title={`${axis[i]} · ${fmt(total)} tokens`}>
                    <div style={{
                      height: `${heightPct}%`,
                      display: 'flex', flexDirection: 'column-reverse',
                      borderRadius: 2, overflow: 'hidden',
                      outline: isPeak ? `1px solid ${t.accent2}` : 'none',
                      outlineOffset: -1,
                    }}>
                      {TOKEN_CATEGORIES.map((c) => {
                        const v = d[c.key] || 0;
                        if (!v) return null;
                        const h = (v / total) * 100;
                        return (
                          <div key={c.key} style={{
                            height: `${h}%`, background: c.color, opacity: 0.82,
                          }} />
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* X-axis */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 9, color: t.textMute, fontFamily: TOKENS.type.mono,
            padding: '6px 0 0',
          }}>
            <span>{formatShortDate(axis[0])}</span>
            <span>{formatShortDate(axis[Math.floor(n / 2)])}</span>
            <span>today</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Linear-regression projection — solid past line, dashed future line.
function ProjectionChart({ trailing, projection, fmtCompact, fmtFull, unitPerDay, t }) {
  const [ref, W] = useMeasuredWidth(360);
  const H = 152, PAD_L = 44, PAD_R = 22, PAD_T = 24, PAD_B = 22;
  const combined = [...trailing, ...projection];
  const n = combined.length;
  const max = Math.max(0.01, ...combined);

  const xFor = (i) => n <= 1 ? W / 2 : PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const yFor = (v) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);

  const pastPath   = pointsToPath(trailing.map((v, i) => [xFor(i), yFor(v)]));
  const projPath   = pointsToPath(projection.map((v, i) => [xFor(trailing.length + i), yFor(v)]));
  const bridgePath = (trailing.length && projection.length)
    ? `M ${xFor(trailing.length - 1)} ${yFor(trailing[trailing.length - 1])} L ${xFor(trailing.length)} ${yFor(projection[0])}`
    : '';

  const empty = max <= 0.01;
  const avgPast = trailing.length ? trailing.reduce((a, v) => a + v, 0) / trailing.length : 0;
  const avgFuture = projection.length ? projection.reduce((a, v) => a + v, 0) / projection.length : 0;
  const yTicks = [0, 0.33, 0.66, 1].map((f) => ({ f, v: max * f }));

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="projAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={t.accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={t.accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Gridlines + y-axis $/d labels */}
        {yTicks.map(({ f, v }) => {
          const y = PAD_T + (1 - f) * (H - PAD_T - PAD_B);
          return (
            <g key={f}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={PAD_L - 6} y={y + 3} textAnchor="end"
                fill={TOKENS.color.textMute} fontSize="9" fontFamily={TOKENS.type.mono}>
                {empty ? (f === 0 ? (fmtCompact ? fmtCompact(0) : '$0') : '') : (fmtCompact ? fmtCompact(v) : fmtMoneyCompact(v))}
              </text>
            </g>
          );
        })}
        {trailing.length > 0 && projection.length > 0 && (
          <line
            x1={xFor(trailing.length - 0.5)} x2={xFor(trailing.length - 0.5)}
            y1={PAD_T} y2={H - PAD_B}
            stroke="rgba(124,92,255,0.3)" strokeDasharray="2 3" strokeWidth="1"
          />
        )}
        {!empty && trailing.length > 0 && (
          <React.Fragment>
            <path
              d={pastPath + ` L ${xFor(trailing.length - 1)} ${H - PAD_B} L ${xFor(0)} ${H - PAD_B} Z`}
              fill="url(#projAreaGrad)"
            />
            <path d={pastPath} stroke={t.accent} strokeWidth="1.6" fill="none" />
          </React.Fragment>
        )}
        {bridgePath && (
          <path d={bridgePath} stroke={t.green} strokeWidth="1.4" strokeDasharray="3 3" fill="none" />
        )}
        {!empty && projection.length > 0 && (
          <path d={projPath} stroke={t.green} strokeWidth="1.6" strokeDasharray="3 3" fill="none" />
        )}
        {/* End-of-forecast marker: circle + $/d callout at the rightmost projected point */}
        {!empty && projection.length > 0 && (
          <g>
            <circle
              cx={xFor(trailing.length + projection.length - 1)}
              cy={yFor(projection[projection.length - 1])}
              r="3" fill={t.green} stroke="#0a0a0f" strokeWidth="1.5"
            />
            <text
              x={xFor(trailing.length + projection.length - 1)}
              y={Math.max(PAD_T - 8, yFor(projection[projection.length - 1]) - 6)}
              textAnchor="end"
              fill={t.green} fontSize="9" fontFamily={TOKENS.type.mono} fontWeight="600">
              {(fmtCompact || fmtMoneyCompact)(projection[projection.length - 1])}{unitPerDay || '/d'}
            </text>
          </g>
        )}
        {empty && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill={TOKENS.color.textMute} fontSize="10" fontFamily={TOKENS.type.family}>
            Not enough history to project
          </text>
        )}
        {/* X-axis */}
        <text x={PAD_L} y={H - 6} fill={TOKENS.color.textMute} fontSize="9" fontFamily={TOKENS.type.mono}>
          −{trailing.length}d
        </text>
        {trailing.length > 0 && projection.length > 0 && (
          <text x={xFor(trailing.length - 0.5)} y={H - 6} fill={TOKENS.color.textMute} fontSize="9" fontFamily={TOKENS.type.mono} textAnchor="middle">
            today
          </text>
        )}
        <text x={W - PAD_R} y={H - 6} fill={TOKENS.color.textMute} fontSize="9" fontFamily={TOKENS.type.mono} textAnchor="end">
          +{projection.length}d
        </text>
      </svg>
      {/* Summary strip beneath the chart — pace comparison in plain words */}
      {!empty && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '8px 6px 0', fontSize: 9.5, color: t.textDim,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>
            <span style={{ color: t.textMute }}>Past avg</span>{' '}
            <span style={{ color: t.accent, fontFamily: TOKENS.type.mono, fontWeight: 600 }}>{(fmtFull || fmtMoney)(avgPast)}{unitPerDay || '/d'}</span>
          </span>
          <span>
            <span style={{ color: t.textMute }}>Forecast avg</span>{' '}
            <span style={{ color: t.green, fontFamily: TOKENS.type.mono, fontWeight: 600 }}>{(fmtFull || fmtMoney)(avgFuture)}{unitPerDay || '/d'}</span>
            {avgPast > 0 && (
              <span style={{
                color: avgFuture >= avgPast ? t.red : t.green, marginLeft: 4, fontWeight: 600,
              }}>
                {avgFuture >= avgPast ? '↑' : '↓'}{Math.abs(((avgFuture - avgPast) / avgPast) * 100).toFixed(0)}%
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function pointsToPath(pts) {
  if (!pts.length) return '';
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  return d;
}

// Top models — horizontal bars sized by share of the selected-window total.
function TopModelsBar({ models, total, primaryKey = 'cost', t }) {
  if (!models.length) {
    return <div style={{ color: t.textMute, fontSize: 10.5, padding: '8px 2px' }}>No model usage yet in this window.</div>;
  }
  const valueOf = (m) => (primaryKey === 'tokens' ? (m.tokens || 0) : (m.cost || 0));
  const max = Math.max(0.0001, ...models.map(valueOf));
  const fmtPrimary = primaryKey === 'tokens'
    ? (m) => `${fmt(m.tokens)} tok`
    : (m) => fmtMoney(m.cost);
  const fmtSecondary = primaryKey === 'tokens'
    ? (m) => `${fmtMoney(m.cost)}${m.requests ? ` · ${fmt(m.requests)} req` : ''}`
    : (m) => `${fmt(m.tokens)} tok${m.requests ? ` · ${fmt(m.requests)} req` : ''}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {models.map((m) => {
        const widthPct = (valueOf(m) / max) * 100;
        const sharePct = total > 0 ? (valueOf(m) / total) * 100 : 0;
        const [a, b] = TOKENS.color.providers[m.provider] || [t.accent, t.accent];
        return (
          <div key={`${m.provider}-${m.model}`} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 0', minWidth: 0,
          }}>
            <ProviderBadge id={m.provider} size={16} radius={4} />
            <div style={{ flex: '0 1 110px', minWidth: 60,
              fontSize: 11, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: t.text,
            }} title={m.model}>{shortModel(m.model)}</div>
            <div style={{
              flex: 1, minWidth: 30,
              position: 'relative',
              height: 8, background: 'rgba(255,255,255,0.05)',
              borderRadius: 4, overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: `${widthPct}%`,
                background: `linear-gradient(90deg, ${a}, ${b})`,
                borderRadius: 4,
                boxShadow: `0 0 8px ${b}44`,
              }} />
            </div>
            <div style={{
              flexShrink: 0,
              fontSize: 10.5, fontFamily: TOKENS.type.mono,
              color: t.text, fontVariantNumeric: 'tabular-nums',
              textAlign: 'right', lineHeight: 1.25,
            }}>
              <div>
                {fmtPrimary(m)}
                {sharePct >= 0.1 && (
                  <span style={{ color: t.textMute, marginLeft: 4 }}>{sharePct.toFixed(0)}%</span>
                )}
              </div>
              <div style={{ fontSize: 9, color: t.textMute }}>
                {fmtSecondary(m)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- Math helpers ----------------------------------------------------------

// Ordinary least squares on ys with x = 0..n-1. Returns {slope, intercept}.
function linearRegression(ys) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: n === 1 ? ys[0] : 0 };
  let sX = 0, sY = 0, sXY = 0, sXX = 0;
  for (let i = 0; i < n; i++) {
    sX += i; sY += ys[i];
    sXY += i * ys[i]; sXX += i * i;
  }
  const denom = n * sXX - sX * sX;
  const slope = denom === 0 ? 0 : (n * sXY - sX * sY) / denom;
  const intercept = (sY - slope * sX) / n;
  return { slope, intercept };
}

function buildDailyAxis(days) {
  const out = [];
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUTC.getTime() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function indexBreakdown(breakdown) {
  const out = {};
  for (const d of breakdown || []) out[d.date] = d;
  return out;
}

// ---- Formatting helpers ----------------------------------------------------

// Token formatter matching fmtMoneyCompact's visual budget. Shows raw numbers
// under 1K (so "457" reads cleanly), compacted otherwise ("12K", "3.4M").
function fmtTokensCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v < 1e3) return String(Math.round(v));
  if (v < 1e6) return (v / 1e3).toFixed(v < 1e4 ? 1 : 0) + 'K';
  if (v < 1e9) return (v / 1e6).toFixed(v < 1e7 ? 2 : 1) + 'M';
  return (v / 1e9).toFixed(2) + 'B';
}

// Money formatter that fits tight y-axis labels ($0 / $12 / $1.2K / $3.4M).
function fmtMoneyCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '$0';
  if (v < 1)    return '$' + v.toFixed(2);
  if (v < 100)  return '$' + v.toFixed(v < 10 ? 2 : 1);
  if (v < 1e3)  return '$' + Math.round(v);
  if (v < 1e6)  return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + (v / 1e6).toFixed(2) + 'M';
}

function rangeLabelShort(days) {
  return ({ 1: '24h', 7: '7d', 14: '14d', 30: '30d', 90: '90d', 180: '180d' })[days] || `${days}d`;
}

function formatShortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mi = Math.max(0, Math.min(11, Number(m) - 1));
  return `${months[mi]} ${Number(d)}`;
}

// Strip common version clutter so labels fit at narrow widths.
function shortModel(name) {
  if (!name) return '—';
  return String(name)
    .replace(/^claude-/, '')
    .replace(/^gpt-/, 'gpt-')
    .replace(/^gemini-/, 'g-')
    .replace(/-\d{8}$/, '')    // trailing YYYYMMDD
    .replace(/-\d{6}$/, '');   // trailing YYMMDD
}

function projectionHint(reg, trailing) {
  if (!trailing || trailing.length < 2) return 'insufficient history';
  const first = reg.intercept;
  const last = reg.slope * (trailing.length - 1) + reg.intercept;
  if (first <= 0.0001 && last <= 0.0001) return 'trend: flat';
  const deltaPct = first > 0.0001 ? ((last - first) / first) * 100 : 100;
  const arrow = Math.abs(deltaPct) < 1 ? '→' : deltaPct > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(deltaPct).toFixed(0)}% over ${trailing.length}d`;
}

// ---- Export helpers --------------------------------------------------------

// Build a self-contained, print-polished HTML document with a hero cover,
// KPI strip, and each chart on its own page section. Uses Chromium's native
// printToPDF (no html2canvas) for pixel-perfect SVG + HTML output.
function buildPdfHtml(rootEl, { mode, days, rangeLabel, generatedAt }) {
  const clone = rootEl.cloneNode(true);
  // Strip interactive bits — they look odd in a static report.
  clone.querySelectorAll('button').forEach((b) => b.remove());
  // Neutralize pixel widths so SVGs flow at print width without stretching.
  clone.querySelectorAll('svg').forEach((svg) => {
    const w = svg.getAttribute('width');
    const h = svg.getAttribute('height');
    if (w && h) {
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('width', '100%');
      svg.removeAttribute('height');
      svg.style.height = 'auto';
      svg.style.display = 'block';
    }
  });

  // Split out the KPI strip (first grid child) so we can style it bigger in
  // print, and the chart cards (the rest).
  const children = [...clone.children];
  const kpiEl = children.find((el) => el.style && el.style.display === 'grid');
  const chartEls = children.filter((el) => el !== kpiEl);

  const kpiHtml = kpiEl ? kpiEl.outerHTML : '';
  const chartsHtml = chartEls.map((el, i) => {
    // Try to extract the title so we can number each section.
    const titleEl = el.querySelector('div > div[style*="font-weight: 600"]');
    const title = titleEl ? titleEl.textContent : '';
    // Remove the inline title (we'll re-render it with a nicer section header).
    const host = el.cloneNode(true);
    const firstBlock = host.firstElementChild; // title + subtitle wrapper
    if (firstBlock) firstBlock.remove();
    return `
      <section class="chart-page">
        <div class="section-hdr">
          <span class="section-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="section-title">${escapeHtml(title)}</span>
        </div>
        <div class="section-card">${host.innerHTML}</div>
      </section>`;
  }).join('');

  const headerLabel = mode === 'tokens' ? 'Token volume' : 'USD spend';
  const heroMetric  = mode === 'tokens' ? 'Tokens' : '$ Cost';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Tokenly Analytics Report</title>
<style>
  @page { size: Letter; }
  :root {
    --bg:       #0a0a0f;
    --ink:      #ecedf3;
    --dim:      #a1a3af;
    --mute:     #6b6e7d;
    --border:   rgba(255,255,255,0.08);
    --gold:     #e8a441;
    --gold-lt:  #ffd772;
    --accent:   #7c5cff;
    --accent2:  #22d3ee;
  }
  html, body {
    margin: 0; padding: 0;
    background: var(--bg); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif;
    font-size: 11px; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  /* ---- Cover page ---------------------------------------------------- */
  .cover {
    height: 10.2in;   /* leave room for page footer */
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 0.6in 0.4in 0.2in;
    page-break-after: always;
    position: relative;
    background:
      radial-gradient(600px 340px at 50% -120px, rgba(124,92,255,0.28), transparent 60%),
      radial-gradient(500px 300px at 100% 120%, rgba(232,164,65,0.18), transparent 60%),
      var(--bg);
  }
  .cover-top {
    display: flex; align-items: center; gap: 10px;
    font-size: 12px; letter-spacing: 0.02em;
  }
  .cover-top .logo-dot {
    width: 14px; height: 14px; border-radius: 4px;
    background: linear-gradient(135deg, var(--gold-lt), var(--gold));
    box-shadow: 0 0 10px rgba(232,164,65,0.45);
  }
  .cover-top .brand { font-weight: 700; font-size: 13px; }
  .cover-top .brand-mute { color: var(--dim); }
  .cover-top .max-chip {
    margin-left: auto;
    font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em;
    padding: 3px 9px; border-radius: 5px; color: #1a1408;
    background: linear-gradient(135deg, var(--gold-lt), var(--gold));
    border: 1px solid rgba(232,164,65,0.7);
    text-transform: uppercase;
  }
  .cover-hero { margin: 1.2in 0; }
  .hero-eyebrow {
    font-size: 11px; color: var(--gold); font-weight: 700;
    letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 14px;
  }
  .hero-title {
    font-size: 48px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.05;
    margin: 0;
  }
  .hero-title .accent {
    background: linear-gradient(135deg, var(--gold-lt), var(--gold));
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .hero-sub {
    margin-top: 18px; font-size: 16px; color: var(--dim); font-weight: 500;
  }
  .cover-meta {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }
  .cover-meta .cell {
    padding: 4px 0;
  }
  .cover-meta .cell .k {
    font-size: 9.5px; color: var(--mute);
    text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
    margin-bottom: 4px;
  }
  .cover-meta .cell .v {
    font-size: 14px; color: var(--ink); font-weight: 600;
  }
  /* ---- KPI strip ----------------------------------------------------- */
  .kpis-wrap {
    padding: 0.45in 0.4in 0.2in;
  }
  .kpis-wrap h2 {
    font-size: 14px; font-weight: 700; letter-spacing: -0.015em;
    margin: 0 0 12px; display: flex; align-items: center; gap: 8px;
  }
  .kpis-wrap h2::before {
    content: ""; display: inline-block; width: 3px; height: 14px;
    border-radius: 2px;
    background: linear-gradient(180deg, var(--gold-lt), var(--gold));
  }
  /* Override app's 2-col KPI grid to 4-col strip for print */
  .kpis-wrap > div[style*="grid-template-columns: 1fr 1fr"] {
    display: grid !important;
    grid-template-columns: repeat(4, 1fr) !important;
    gap: 10px !important;
  }
  .kpis-wrap > div > div { /* individual KPI tile */
    padding: 14px 14px 12px !important;
    background: rgba(255,255,255,0.02) !important;
    border: 1px solid var(--border) !important;
    border-radius: 10px !important;
  }
  /* ---- Chart sections ------------------------------------------------ */
  .charts-wrap { padding: 0 0.4in 0.3in; }
  .chart-page {
    page-break-inside: avoid; break-inside: avoid;
    margin-bottom: 22px;
  }
  .section-hdr {
    display: flex; align-items: baseline; gap: 12px;
    margin: 0 0 10px;
  }
  .section-num {
    font-size: 11px; font-weight: 700; color: var(--gold);
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.08em;
  }
  .section-title {
    font-size: 17px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink);
  }
  .section-card {
    padding: 14px 16px 16px;
    background: rgba(255,255,255,0.025);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  /* Strip the inner ChartCard border since we're already wrapping it */
  .section-card > div[style*="border-radius: 10px"] {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
  }
  svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
  <!-- Cover page -->
  <div class="cover">
    <div class="cover-top">
      <span class="logo-dot"></span>
      <span class="brand">Tokenly</span>
      <span class="brand-mute">· Analytics</span>
      <span class="max-chip">Max</span>
    </div>
    <div class="cover-hero">
      <div class="hero-eyebrow">Report</div>
      <h1 class="hero-title">
        Your <span class="accent">${escapeHtml(heroMetric)}</span><br/>
        at a glance
      </h1>
      <div class="hero-sub">${escapeHtml(headerLabel)} · last ${escapeHtml(rangeLabel)}</div>
    </div>
    <div class="cover-meta">
      <div class="cell">
        <div class="k">Generated</div>
        <div class="v">${escapeHtml(generatedAt)}</div>
      </div>
      <div class="cell">
        <div class="k">Window</div>
        <div class="v">Last ${escapeHtml(rangeLabel)}</div>
      </div>
      <div class="cell">
        <div class="k">View</div>
        <div class="v">${escapeHtml(heroMetric)}</div>
      </div>
    </div>
  </div>

  <!-- KPI strip -->
  <div class="kpis-wrap">
    <h2>Summary</h2>
    ${kpiHtml}
  </div>

  <!-- Chart sections -->
  <div class="charts-wrap">
    ${chartsHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Capture every chart card as a PNG by rendering its cloned HTML in an
// isolated hidden BrowserWindow (via export:capture-html). This keeps the
// live UI pristine during export — no scrolling, no visible flicker, and
// zero chance that other sheets / overlays leak into the captured image.
async function svgsToPngBundle(rootEl, suffix) {
  if (!rootEl) return [];
  const cards = findChartCards(rootEl);
  const files = [];
  for (let i = 0; i < cards.length; i++) {
    try {
      const { bytes, label } = await captureChartCard(cards[i], i + 1);
      if (bytes) {
        files.push({
          name: `tokenly-${String(i + 1).padStart(2, '0')}-${slugify(label)}-${suffix}.png`,
          bytes,
        });
      }
    } catch { /* skip broken card, continue */ }
  }
  return files;
}

function findChartCards(rootEl) {
  // Every direct child of the content div is either the KPI grid (skip) or
  // a ChartCard. No className-based lookup needed — structural.
  const out = [];
  for (const child of rootEl.children) {
    if (!child || !child.style) continue;
    if (child.style.display === 'grid') continue; // KPI strip — captured separately
    out.push(child);
  }
  return out;
}

async function captureChartCard(cardEl, idx) {
  const titleEl = cardEl.querySelector('div[style*="font-weight: 600"]');
  const label = titleEl?.textContent?.trim() || `chart-${idx}`;

  // Render at the card's LIVE width so the layout stays identical to what
  // the user sees on screen — no scaling that pushes edge labels out of the
  // chart's internal padding. Electron's capturePage on a retina display
  // already gives us a 2× PNG from this, so the output is plenty sharp.
  const liveRect = cardEl.getBoundingClientRect();
  const RENDER_W = Math.max(380, Math.round(liveRect.width));
  const PADDING  = 24; // outer frame around the card in the isolated render
  const RENDER_H = Math.max(220, Math.round(liveRect.height) + PADDING * 2);

  const html = buildChartPngHtml(cardEl, RENDER_W, PADDING);
  const res = await window.api.captureHtml({
    html,
    width: RENDER_W + PADDING * 2,
    height: RENDER_H,
  });
  if (!res?.ok || !res.bytes) return { bytes: null, label };
  const bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes);
  return { bytes, label };
}

// Build a self-contained HTML doc containing just one chart card, at its
// live width. Layout is byte-for-byte identical to the popover so nothing
// overflows the internal padding of the chart SVGs.
function buildChartPngHtml(cardEl, renderWidth, padding) {
  const clone = cardEl.cloneNode(true);
  clone.querySelectorAll('[data-export-button]').forEach((b) => b.remove());
  clone.querySelectorAll('button').forEach((b) => b.remove());
  const body = clone.outerHTML;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0; padding: 0;
    background: #0d0d14; color: #ecedf3;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif;
    font-size: 13px; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    /* No overflow: hidden — the main process measures .frame's full bounds
       to crop the capture exactly, so we need unclamped scrollHeight here. */
  }
  .frame {
    padding: ${padding}px;
    width: ${renderWidth + padding * 2}px;
    box-sizing: border-box;
  }
  /* The cloned ChartCard is the direct child of .frame — lock it to the live
     width so internal chart layouts (y-axis padding, right-edge labels) stay
     inside the card's frame. */
  .frame > div {
    width: ${renderWidth}px !important;
    box-sizing: border-box;
  }
</style>
</head>
<body><div class="frame">${body}</div></body>
</html>`;
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'chart';
}

window.ChartsSheet = ChartsSheet;
