// Export sheet — CSV / JSON export for the currently-loaded usage window.
// Source of truth is whatever `usage` the main popover already has, so we
// don't re-fetch and numbers match what the user sees on the cards.
const { useState: useStateE, useEffect: useEffectE, useMemo: useMemoE } = React;

const DATASETS = [
  {
    id: 'daily',
    label: 'Daily trend',
    desc: 'One row per day per provider — tokens + cost.',
  },
  {
    id: 'totals',
    label: 'Provider totals',
    desc: 'One row per provider for the selected window.',
  },
  {
    id: 'models',
    label: 'Model breakdown',
    desc: 'Per-model tokens + cost, where providers expose it.',
  },
];

function ExportSheet({ open, onClose, onBack, usage = {}, meta = {}, days = 30, isPro = false }) {
  const t = TOKENS.color;

  const [format, setFormat] = useStateE('csv');
  const [dataset, setDataset] = useStateE('daily');
  const [selected, setSelected] = useStateE(() => new Set(PROVIDERS.map((p) => p.id)));
  const [saving, setSaving] = useStateE(false);
  const [toast, setToast] = useStateE(null); // { kind, text }

  // When the sheet opens, default to whichever providers actually have data
  // right now — avoids a user exporting a file full of empty rows.
  useEffectE(() => {
    if (!open) return;
    const next = new Set();
    for (const p of PROVIDERS) {
      const u = usage[p.id];
      if (u && u !== 'loading' && u.ok) next.add(p.id);
    }
    // Fall back to "all" if nothing has loaded yet (usually during first-run).
    if (next.size === 0) for (const p of PROVIDERS) next.add(p.id);
    setSelected(next);
  }, [open]);

  const toggleProvider = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(PROVIDERS.map((p) => p.id)));
  const selectNone = () => setSelected(new Set());

  const providersToExport = useMemoE(
    () => PROVIDERS.filter((p) => selected.has(p.id)),
    [selected],
  );

  // Build the export payload reactively so the preview + button stay in sync.
  const { rows, content, filename, mime, rowCount, byteCount } = useMemoE(() => {
    let rows = [];
    if (dataset === 'daily')  rows = buildDailyRows(providersToExport, usage);
    if (dataset === 'totals') rows = buildTotalsRows(providersToExport, usage, days);
    if (dataset === 'models') rows = buildModelRows(providersToExport, usage);

    const todayStr = new Date().toISOString().slice(0, 10);
    const fname = `tokenly-${dataset}-${days}d-${todayStr}.${format}`;
    const body = format === 'json'
      ? toJSON(rows, { dataset, windowDays: days, generatedAt: new Date().toISOString() })
      : toCSV(rows);
    return {
      rows,
      content: body,
      filename: fname,
      mime: format === 'json' ? 'application/json' : 'text/csv',
      rowCount: rows.length,
      byteCount: new Blob([body]).size,
    };
  }, [dataset, format, providersToExport, usage, days]);

  const preview = useMemoE(() => {
    if (!content) return '';
    const MAX_LINES = 28;
    const MAX_CHARS = 3200;
    let out = content;
    if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS) + '\n…';
    const lines = out.split('\n');
    if (lines.length > MAX_LINES) out = lines.slice(0, MAX_LINES).join('\n') + '\n…';
    return out;
  }, [content]);

  const handleSave = async () => {
    if (saving || !content || rowCount === 0) return;
    setSaving(true);
    try {
      const res = await window.api.saveExportFile({ suggestedName: filename, content, format });
      if (res?.ok) {
        setToast({ kind: 'ok', text: 'Saved.' });
      } else if (res?.canceled) {
        // Swallow — user dismissed the dialog on purpose.
      } else {
        setToast({ kind: 'err', text: res?.error || 'Save failed.' });
      }
    } catch (err) {
      setToast({ kind: 'err', text: err?.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  useEffectE(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const handleCopy = async () => {
    if (!content || rowCount === 0) return;
    try {
      await navigator.clipboard.writeText(content);
      setToast({ kind: 'ok', text: 'Copied.' });
    } catch {
      setToast({ kind: 'err', text: 'Copy failed.' });
    }
  };

  const rangeShort = ({
    1: '24h', 7: '7d', 14: '14d', 30: '30d', 90: '90d', 180: '180d',
  })[days] || `${days}d`;

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
            Export data
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
              color: '#1a1408', lineHeight: 1,
              background: 'linear-gradient(135deg, #ffd772, #e8a441)',
              border: '1px solid rgba(232,164,65,0.55)',
            }}>Max</span>
          </div>
          <span style={{
            fontSize: 10, color: t.textDim,
            padding: '3px 7px', borderRadius: 5,
            background: 'rgba(124,92,255,0.12)',
            border: `1px solid ${t.cardBorder}`,
            fontVariantNumeric: 'tabular-nums',
          }}>{rangeShort}</span>
        </div>
        <div style={{
          fontSize: 10.5, color: t.textDim, marginTop: 4, marginBottom: 12, lineHeight: 1.5,
        }}>
          Save what's currently shown in the popover as CSV or JSON. Mirrors the numbers on each card — no re-fetch, no separate math.
        </div>

        {/* Format toggle */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Format</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                CSV opens cleanly in Excel, Numbers, or a DataFrame. JSON preserves nested structure.
              </div>
            </div>
            <div style={{
              display: 'inline-flex', background: 'rgba(0,0,0,0.3)',
              border: `1px solid ${t.cardBorder}`, borderRadius: 8, padding: 2, flexShrink: 0,
            }}>
              {[
                { v: 'csv',  label: 'CSV' },
                { v: 'json', label: 'JSON' },
              ].map((opt) => {
                const active = format === opt.v;
                return (
                  <button
                    key={opt.v}
                    onClick={() => setFormat(opt.v)}
                    style={{
                      background: active ? t.accent : 'transparent',
                      color: active ? '#fff' : t.textDim,
                      border: 0, padding: '5px 14px', borderRadius: 6,
                      fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'inherit', letterSpacing: '0.02em',
                      transition: 'background .15s, color .15s',
                    }}
                  >{opt.label}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Dataset picker */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Dataset</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DATASETS.map((d) => {
              const active = dataset === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDataset(d.id)}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    background: active ? 'rgba(124,92,255,0.14)' : 'rgba(0,0,0,0.2)',
                    border: `1px solid ${active ? 'rgba(124,92,255,0.45)' : t.cardBorder}`,
                    cursor: 'pointer', fontFamily: 'inherit', color: t.text,
                    transition: 'background .15s, border-color .15s',
                  }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${active ? t.accent : t.textMute}`,
                    background: active ? t.accent : 'transparent',
                    boxShadow: active ? 'inset 0 0 0 2px #0d0d14' : 'none',
                    transition: 'background .15s, border-color .15s',
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600 }}>{d.label}</div>
                    <div style={{ fontSize: 10, color: t.textMute, marginTop: 1 }}>{d.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Provider multi-select */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Providers</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <MiniChip label="All"  onClick={selectAll}  t={t} />
              <MiniChip label="None" onClick={selectNone} t={t} />
            </div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
          }}>
            {PROVIDERS.map((p) => {
              const checked = selected.has(p.id);
              const u = usage[p.id];
              const hasData = u && u !== 'loading' && u.ok;
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProvider(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 9px', borderRadius: 7,
                    background: checked ? 'rgba(124,92,255,0.12)' : 'rgba(0,0,0,0.22)',
                    border: `1px solid ${checked ? 'rgba(124,92,255,0.4)' : t.cardBorder}`,
                    cursor: 'pointer', fontFamily: 'inherit', color: t.text,
                    transition: 'background .15s, border-color .15s',
                    opacity: hasData ? 1 : 0.62,
                  }}
                  title={hasData ? '' : 'No data loaded for this provider.'}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                    background: checked ? t.accent : 'transparent',
                    border: `1.5px solid ${checked ? t.accent : t.textMute}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff',
                  }}>
                    {checked && Icons.check}
                  </span>
                  <ProviderBadge id={p.id} size={18} radius={5} />
                  <span style={{ fontSize: 11, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.3) 100%)',
          border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, marginBottom: 10,
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: `1px solid ${t.cardBorder}`,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
                color: t.accent, textTransform: 'uppercase',
              }}>Preview</span>
              <span style={{
                fontSize: 10, color: t.textDim, fontFamily: TOKENS.type.mono,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{filename}</span>
            </div>
            <div style={{
              display: 'flex', gap: 10, fontSize: 9.5,
              color: t.textMute, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            }}>
              <span>{rowCount.toLocaleString()} {rowCount === 1 ? 'row' : 'rows'}</span>
              <span>·</span>
              <span>{formatBytes(byteCount)}</span>
            </div>
          </div>
          <pre style={{
            margin: 0, padding: '10px 12px',
            fontFamily: TOKENS.type.mono,
            fontSize: 10.5, lineHeight: 1.55,
            color: t.text,
            maxHeight: 180, overflow: 'auto',
            whiteSpace: 'pre',
            background: 'transparent',
          }}>
            {rowCount > 0 ? (
              format === 'csv'
                ? renderCSVPreview(preview, t)
                : <span>{preview}</span>
            ) : (
              <span style={{ color: t.textMute, fontFamily: TOKENS.type.family, fontSize: 11 }}>
                No rows to export. Pick at least one provider that has loaded data.
              </span>
            )}
          </pre>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
          {toast && (
            <span style={{
              fontSize: 10.5,
              color: toast.kind === 'ok' ? t.green : t.red,
            }}>{toast.text}</span>
          )}
          <button
            onClick={handleCopy}
            disabled={rowCount === 0}
            style={{
              background: 'transparent', color: t.textDim,
              border: `1px solid ${t.cardBorder}`,
              padding: '7px 14px', borderRadius: 8,
              fontSize: 11.5, fontWeight: 500,
              cursor: rowCount === 0 ? 'default' : 'pointer',
              opacity: rowCount === 0 ? 0.55 : 1,
              fontFamily: 'inherit',
            }}
          >Copy</button>
          <button
            onClick={handleSave}
            disabled={saving || rowCount === 0}
            style={{
              background: t.accent, color: '#fff', border: 0,
              padding: '8px 18px', borderRadius: 8,
              fontSize: 12, fontWeight: 600,
              cursor: (saving || rowCount === 0) ? 'default' : 'pointer',
              opacity: (saving || rowCount === 0) ? 0.55 : 1,
              fontFamily: 'inherit',
              boxShadow: '0 4px 14px rgba(124,92,255,0.35)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {saving ? 'Saving…' : 'Save file…'}
          </button>
        </div>
      </section>
    </React.Fragment>
  );
}

// Render CSV preview with a colored header row — small touch that makes
// the structure legible at a glance without parsing anything heavy.
function renderCSVPreview(text, t) {
  const nl = text.indexOf('\n');
  if (nl < 0) return <span style={{ color: t.accent }}>{text}</span>;
  const header = text.slice(0, nl);
  const body = text.slice(nl);
  return (
    <React.Fragment>
      <span style={{ color: t.accent, fontWeight: 600 }}>{header}</span>
      <span style={{ color: t.text }}>{body}</span>
    </React.Fragment>
  );
}

function MiniChip({ label, onClick, t }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${t.cardBorder}`,
        color: t.textDim,
        padding: '3px 8px', borderRadius: 5,
        fontSize: 10, fontWeight: 500, cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >{label}</button>
  );
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ---- Row builders ----------------------------------------------------------
// Uses the provider's `dailyBreakdown` which carries the full per-day split:
// {date, input, output, cache_read, cache_creation, cached, reasoning, tool,
//  requests, cost}. Different providers contribute different subsets — CSV
// header is a union, missing fields render as empty cells.
function buildDailyRows(providers, usage) {
  const rows = [];
  for (const p of providers) {
    const u = usage[p.id];
    if (!u || u === 'loading' || !u.ok) continue;
    const breakdown = u.data?.dailyBreakdown || [];
    for (const d of breakdown) {
      const row = {
        date: d.date,
        provider: p.id,
        provider_name: p.name,
      };
      // Only emit fields the provider actually tracks. Keeps the CSV honest
      // (empty cells instead of zeros that imply "zero tokens measured").
      if ('input'          in d) row.input_tokens          = Number(d.input          || 0);
      if ('output'         in d) row.output_tokens         = Number(d.output         || 0);
      if ('cached'         in d) row.cached_tokens         = Number(d.cached         || 0);
      if ('cache_read'     in d) row.cache_read_tokens     = Number(d.cache_read     || 0);
      if ('cache_creation' in d) row.cache_creation_tokens = Number(d.cache_creation || 0);
      if ('reasoning'      in d) row.reasoning_tokens      = Number(d.reasoning      || 0);
      if ('tool'           in d) row.tool_tokens           = Number(d.tool           || 0);
      if ('requests'       in d) row.requests              = Number(d.requests       || 0);
      row.total_tokens =
        (row.input_tokens          || 0) +
        (row.output_tokens         || 0) +
        (row.cached_tokens         || 0) +
        (row.cache_read_tokens     || 0) +
        (row.cache_creation_tokens || 0) +
        (row.reasoning_tokens      || 0) +
        (row.tool_tokens           || 0);
      row.cost_usd = Number(Number(d.cost || 0).toFixed(6));
      rows.push(row);
    }
  }
  return rows;
}

function buildTotalsRows(providers, usage, days) {
  const rows = [];
  for (const p of providers) {
    const u = usage[p.id];
    if (!u || u === 'loading' || !u.ok) continue;
    const t = u.data?.totals || {};
    rows.push({
      provider: p.id,
      provider_name: p.name,
      window_days: u.data?.windowDays || days,
      input_tokens:          Number(t.input         || 0),
      output_tokens:         Number(t.output        || 0),
      cache_read_tokens:     Number(t.cache_read    || 0),
      cache_creation_tokens: Number(t.cache_creation|| 0),
      cached_tokens:         Number(t.cached        || 0),
      reasoning_tokens:      Number(t.reasoning     || 0),
      tool_tokens:           Number(t.tool          || 0),
      requests:              Number(t.requests      || 0),
      cost_usd:              Number(Number(t.cost || 0).toFixed(6)),
      currency:              t.currency || 'USD',
    });
  }
  return rows;
}

function buildModelRows(providers, usage) {
  const rows = [];
  for (const p of providers) {
    const u = usage[p.id];
    if (!u || u === 'loading' || !u.ok) continue;
    const models = u.data?.models || [];
    for (const m of models) {
      rows.push({
        provider: p.id,
        provider_name: p.name,
        model: m.model || m.name || 'unknown',
        input_tokens:      Number(m.input      || 0),
        output_tokens:     Number(m.output     || 0),
        cached_tokens:     Number(m.cached     || 0),
        cache_read_tokens: Number(m.cache_read || 0),
        requests:          Number(m.requests   || 0),
        cost_usd:          Number(Number(m.cost || 0).toFixed(6)),
      });
    }
  }
  return rows;
}

// ---- Serializers -----------------------------------------------------------
function toCSV(rows) {
  if (!rows.length) return '';
  // Union of keys across rows — different providers may contribute different
  // fields (e.g. cache_creation_tokens only exists for Anthropic / Claude Code).
  const headerSet = new Set();
  for (const r of rows) for (const k of Object.keys(r)) headerSet.add(k);
  const headers = [...headerSet];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
  return lines.join('\n') + '\n';
}

function toJSON(rows, meta) {
  return JSON.stringify({
    dataset: meta.dataset,
    window_days: meta.windowDays,
    generated_at: meta.generatedAt,
    row_count: rows.length,
    rows,
  }, null, 2) + '\n';
}

window.ExportSheet = ExportSheet;
