// Pricing sheet — read-only view of the current per-model rates the app is
// using to estimate cost. Data comes from the hosted pricing.json (remote) or
// the bundled fallback arrays in main.js. Mirrors the SettingsSheet pattern:
// bottom-drawer with blurred backdrop, slide-in animation.
const { useState: useStateP, useEffect: useEffectP } = React;

// Provider meta for display. Maps pricing.json provider keys → human label +
// badge id (reuses ProviderBadge from atoms.jsx). Multiplier keys are mapped
// to short chip labels.
const PRICING_PROVIDER_META = {
  claude: {
    label: 'Anthropic (Claude)',
    badgeId: 'anthropic',
    blurb: 'Used for Claude Code local parsing + Anthropic API.',
  },
  openai: {
    label: 'OpenAI',
    badgeId: 'openai',
    blurb: 'Used for Codex local parsing + OpenAI API.',
  },
  gemini: {
    label: 'Google (Gemini)',
    badgeId: 'gemini-cli',
    blurb: 'Used for Gemini CLI local parsing.',
  },
};

const MULTIPLIER_LABELS = {
  cache_5m_write: '5m cache write',
  cache_1h_write: '1h cache write',
  cache_read: 'Cache read',
  thoughts_as_output: 'Thoughts priced as output',
  tool_as_input: 'Tool tokens priced as input',
  reasoning_included_in_output: 'Reasoning incl. in output',
};

function formatPerMillion(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0';
  if (n < 0.1) return '$' + n.toFixed(3);
  return '$' + n.toFixed(2);
}

function formatLocalDate(dateLike) {
  if (dateLike == null || dateLike === 0) return null;
  try {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

function PricingSheet({ open, onClose, onBack }) {
  const t = TOKENS.color;
  const [tables, setTables] = useStateP(null);
  const [loading, setLoading] = useStateP(false);
  const [refreshing, setRefreshing] = useStateP(false);
  const [justRefreshed, setJustRefreshed] = useStateP(false);
  const [error, setError] = useStateP(null);

  const loadTables = async () => {
    setLoading(true);
    try {
      const data = await window.api.getPricingTables();
      setTables(data);
      setError(null);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Refresh the hosted file from the CDN, then re-read tables. Enforces a
  // minimum spinner duration so the animation is visible even when the CDN
  // cache is warm and the fetch completes in <50ms. On success, briefly
  // flashes a "Updated ✓" state so the button clearly acknowledges the click.
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    const startedAt = Date.now();
    const MIN_SPIN_MS = 650;
    try {
      const result = await window.api.refreshPricing();
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SPIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_SPIN_MS - elapsed));
      }
      if (result?.tables) setTables(result.tables);
      if (!result?.ok) {
        setError(`Refresh failed (${result?.reason || 'unknown'}) — showing last cached rates.`);
      } else {
        setJustRefreshed(true);
        setTimeout(() => setJustRefreshed(false), 1500);
      }
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setRefreshing(false);
    }
  };

  // Load on open. Re-fetch every time the sheet is opened so timestamps stay
  // truthful when the user reopens after hours.
  useEffectP(() => {
    if (open) loadTables();
  }, [open]);

  const sourceLabel =
    tables?.source === 'remote' ? 'Loaded from trytokenly.app'
    : tables?.source === 'bundled' ? 'Using bundled offline fallback'
    : 'Loading…';
  // Primary date = when this app last successfully pulled from the CDN.
  // Updates every time the user clicks Refresh. Falls back to the server's
  // `updated_at` (the rates' effective date) only if we never refreshed.
  const refreshedLabel = formatLocalDate(tables?.fetched_at) || formatLocalDate(tables?.updated_at);
  const ratesChangedLabel = formatLocalDate(tables?.updated_at);
  const ratesDifferFromRefresh = ratesChangedLabel && refreshedLabel && ratesChangedLabel !== refreshedLabel;

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
        {!onBack && <SheetMinimize onClick={onClose} />}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBack && (
            <IconBtn onClick={onBack} title="Back to Settings">{Icons.arrowLeft}</IconBtn>
          )}
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Current Pricing</div>
        </div>
        <div style={{
          fontSize: 10.5, color: t.textDim, marginTop: 4, marginBottom: 12, lineHeight: 1.5,
        }}>
          Per-million-token USD rates used to estimate cost. List prices from each provider — your actual invoice may differ for tiered or negotiated plans.
        </div>

        {/* Meta banner: source + updated + refresh */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(34,211,238,0.10), rgba(124,92,255,0.10))',
          border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '10px 12px', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 600, color: t.text,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: tables?.source === 'remote' ? t.green : t.amber,
                boxShadow: tables?.source === 'remote'
                  ? '0 0 6px rgba(52,211,153,0.6)'
                  : '0 0 6px rgba(251,191,36,0.4)',
              }} />
              {sourceLabel}
            </div>
            {refreshedLabel && (
              <div style={{ fontSize: 10, color: t.textDim, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                Last refreshed {refreshedLabel}
                {ratesDifferFromRefresh && (
                  <span style={{ color: t.textMute }}> · rates last changed {ratesChangedLabel}</span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{
              background: justRefreshed
                ? 'rgba(52,211,153,0.22)'
                : refreshing ? 'rgba(124,92,255,0.25)' : t.accent,
              color: justRefreshed ? t.green : '#fff',
              border: justRefreshed ? '1px solid rgba(52,211,153,0.45)' : 0,
              padding: '6px 12px', borderRadius: 7,
              fontSize: 10.5, fontWeight: 600,
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.85 : 1,
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
              flexShrink: 0,
              transition: 'background .2s, color .2s, border .2s',
            }}
          >
            <span style={{
              display: 'inline-flex', lineHeight: 0,
              animation: refreshing ? 'llmspin 0.75s linear infinite' : 'none',
            }}>
              {justRefreshed ? Icons.check : Icons.refresh}
            </span>
            {refreshing ? 'Refreshing…' : justRefreshed ? 'Updated' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div style={{
            fontSize: 10.5, color: t.red,
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.2)',
            borderRadius: 8, padding: '8px 10px', marginBottom: 12, lineHeight: 1.45,
          }}>
            {error}
          </div>
        )}

        {/* Provider sections */}
        {loading && !tables ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: t.textDim, fontSize: 11 }}>
            Loading pricing tables…
          </div>
        ) : (
          Object.entries(PRICING_PROVIDER_META).map(([key, meta]) => {
            const prov = tables?.providers?.[key];
            if (!prov) return null;
            return (
              <ProviderPricingSection
                key={key}
                meta={meta}
                provider={prov}
                t={t}
              />
            );
          })
        )}

        {/* Footer note */}
        <div style={{
          fontSize: 9.5, color: t.textMute, marginTop: 14, lineHeight: 1.5,
          padding: '10px 12px',
          background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 10,
        }}>
          Prices auto-refresh daily from <span style={{ color: t.accent2 }}>trytokenly.app/pricing.json</span>.
          When offline, the app uses a copy bundled with your installed version.
          Multipliers apply to the input rate unless noted.
        </div>
      </section>
    </React.Fragment>
  );
}

function ProviderPricingSection({ meta, provider, t }) {
  const multipliers = provider?.multipliers || {};
  const models = provider?.models || [];
  const multiplierEntries = Object.entries(multipliers);

  return (
    <div style={{
      background: t.card,
      border: `1px solid ${t.cardBorder}`,
      borderRadius: 12,
      padding: '12px 12px 4px',
      marginBottom: 12,
    }}>
      {/* Provider header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <ProviderBadge id={meta.badgeId} size={26} radius={7} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text, letterSpacing: '-0.01em' }}>
            {meta.label}
          </div>
          <div style={{ fontSize: 9.5, color: t.textMute, marginTop: 1 }}>
            {meta.blurb}
          </div>
        </div>
      </div>

      {/* Multiplier chips */}
      {multiplierEntries.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10, marginBottom: 10 }}>
          {multiplierEntries.map(([k, v]) => (
            <MultiplierChip key={k} keyName={k} value={v} t={t} />
          ))}
        </div>
      )}

      {/* Model table */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        columnGap: 10,
        rowGap: 0,
        alignItems: 'center',
        padding: '0 2px',
      }}>
        {/* Column headers */}
        <div style={{
          fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: t.textMute, fontWeight: 600, paddingBottom: 6,
        }}>Model</div>
        <div style={{
          fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: t.textMute, fontWeight: 600, paddingBottom: 6, textAlign: 'right',
          minWidth: 62,
        }}>Input / M</div>
        <div style={{
          fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: t.textMute, fontWeight: 600, paddingBottom: 6, textAlign: 'right',
          minWidth: 62,
        }}>Output / M</div>

        {models.map((row, i) => (
          <React.Fragment key={i}>
            <div style={{
              fontSize: 11.5, color: t.text, padding: '7px 0',
              borderTop: i > 0 ? `1px solid ${t.cardBorder}` : 0,
              letterSpacing: '-0.01em',
            }}>
              {row.label || row.match}
            </div>
            <div style={{
              fontSize: 11.5, color: t.text, padding: '7px 0',
              borderTop: i > 0 ? `1px solid ${t.cardBorder}` : 0,
              textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              fontFamily: TOKENS.type.mono,
            }}>
              {formatPerMillion(row.input)}
            </div>
            <div style={{
              fontSize: 11.5, color: t.text, padding: '7px 0',
              borderTop: i > 0 ? `1px solid ${t.cardBorder}` : 0,
              textAlign: 'right', fontVariantNumeric: 'tabular-nums',
              fontFamily: TOKENS.type.mono,
            }}>
              {formatPerMillion(row.output)}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function MultiplierChip({ keyName, value, t }) {
  const label = MULTIPLIER_LABELS[keyName] || keyName;
  const isBoolean = typeof value === 'boolean';
  const display = isBoolean
    ? (value ? 'yes' : 'no')
    : (Number.isFinite(Number(value)) ? Number(value) + '×' : String(value));

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(124,92,255,0.10)',
      border: '1px solid rgba(124,92,255,0.25)',
      borderRadius: 999,
      padding: '3px 8px',
      fontSize: 9.5,
      color: t.text,
    }}>
      <span style={{ color: t.textDim }}>{label}</span>
      <span style={{
        fontFamily: TOKENS.type.mono, fontVariantNumeric: 'tabular-nums',
        color: t.accent2, fontWeight: 600,
      }}>{display}</span>
    </div>
  );
}

window.PricingSheet = PricingSheet;
