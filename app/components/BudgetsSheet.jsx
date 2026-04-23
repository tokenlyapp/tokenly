// Budgets sheet — configure daily $ budget thresholds for API-billed providers
// and a daily spend summary notification. API-only by design: list-price
// estimates from local tools (Claude Code / Codex / Gemini CLI) aren't real
// money for subscription users, so they don't participate in budgets.
//
// Evaluation happens in App.jsx on every refresh; this sheet is purely
// configuration + persistence.
const { useState: useStateB, useEffect: useEffectB } = React;

const BUDGET_PROVIDERS = [
  { id: 'openai',     name: 'OpenAI API',    badgeId: 'openai'     },
  { id: 'anthropic',  name: 'Anthropic API', badgeId: 'anthropic'  },
  { id: 'openrouter', name: 'OpenRouter',    badgeId: 'openrouter' },
];

function hourLabel(h) {
  const h12 = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12}:00 ${ampm}`;
}

function BudgetsSheet({ open, onClose }) {
  const t = TOKENS.color;
  const [budgets, setBudgets] = useStateB(null);
  const [saving, setSaving] = useStateB(false);
  const [savedMsg, setSavedMsg] = useStateB(null);

  useEffectB(() => {
    if (!open) return;
    (async () => {
      try {
        const b = await window.api.getBudgets();
        setBudgets(b);
      } catch {
        setBudgets({ enabled: true, daily: {}, summary: { enabled: true, hour: 17 } });
      }
    })();
  }, [open]);

  const updateDaily = (providerId, raw) => {
    const cleaned = String(raw).replace(/[^0-9.]/g, '');
    const num = cleaned === '' ? null : Number(cleaned);
    setBudgets((b) => ({
      ...b,
      daily: { ...(b.daily || {}), [providerId]: Number.isFinite(num) && num > 0 ? num : null },
    }));
  };

  const updateEnabled = (v) => setBudgets((b) => ({ ...b, enabled: v }));
  const updateSummaryEnabled = (v) => setBudgets((b) => ({ ...b, summary: { ...(b.summary || {}), enabled: v } }));
  const updateSummaryHour = (v) => setBudgets((b) => ({ ...b, summary: { ...(b.summary || {}), hour: Number(v) } }));

  const save = async () => {
    if (!budgets || saving) return;
    setSaving(true);
    try {
      const res = await window.api.setBudgets(budgets);
      setSavedMsg(res?.ok ? 'Saved.' : 'Save failed.');
      setTimeout(() => setSavedMsg(null), 1500);
    } finally {
      setSaving(false);
    }
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
          maxHeight: '92%',
          overflowY: 'auto',
        }}
      >
        <div style={{
          width: 36, height: 4, background: 'rgba(255,255,255,0.15)',
          borderRadius: 2, margin: '0 auto 10px',
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Budget Alerts</div>
          <IconBtn onClick={onClose} title="Close">{Icons.close}</IconBtn>
        </div>
        <div style={{
          fontSize: 10.5, color: t.textDim, marginTop: 4, marginBottom: 12, lineHeight: 1.5,
        }}>
          Native notifications when your API spend crosses 50%, 80%, or 100% of a daily budget. API sources only — list-price estimates from local tools don't participate.
        </div>

        {/* Master enable toggle */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '10px 12px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Enable budget alerts</div>
            <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
              Pauses all threshold notifications without clearing your budgets.
            </div>
          </div>
          <Toggle value={!!budgets?.enabled} onChange={updateEnabled} t={t} />
        </div>

        {/* Daily budgets per provider + overall */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 12,
          opacity: budgets?.enabled ? 1 : 0.55, pointerEvents: budgets?.enabled ? 'auto' : 'none',
          transition: 'opacity .15s',
        }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Daily budgets (USD)</div>
            <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
              Leave blank to skip a threshold. Thresholds fire at 50% / 80% / 100% once per UTC day.
            </div>
          </div>

          {BUDGET_PROVIDERS.map((p) => (
            <BudgetRow
              key={p.id}
              badgeId={p.badgeId}
              label={p.name}
              value={budgets?.daily?.[p.id]}
              onChange={(v) => updateDaily(p.id, v)}
              t={t}
            />
          ))}
          <div style={{ height: 1, background: t.cardBorder, margin: '6px 0 6px' }} />
          <BudgetRow
            badgeId={null}
            label="Overall (sum across APIs)"
            value={budgets?.daily?._overall}
            onChange={(v) => updateDaily('_overall', v)}
            t={t}
            emphasize
          />
        </div>

        {/* Daily spend summary */}
        <div style={{
          background: t.card, border: `1px solid ${t.cardBorder}`,
          borderRadius: 10, padding: '12px 14px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Daily spend summary</div>
              <div style={{ fontSize: 10, color: t.textMute, marginTop: 2, lineHeight: 1.45 }}>
                One notification per day with today's total API spend and local-tool token usage.
              </div>
            </div>
            <Toggle
              value={!!budgets?.summary?.enabled}
              onChange={updateSummaryEnabled}
              t={t}
            />
          </div>

          {budgets?.summary?.enabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <div style={{ fontSize: 11, color: t.textDim, width: 60, flexShrink: 0 }}>Notify at</div>
              <select
                value={budgets.summary.hour ?? 17}
                onChange={(e) => updateSummaryHour(e.target.value)}
                style={{
                  flex: 1, appearance: 'none', WebkitAppearance: 'none',
                  background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${t.cardBorder}`,
                  color: t.text, borderRadius: 7, padding: '6px 10px',
                  fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'inherit', outline: 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hourLabel(h)} (local time)</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Save footer */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
          {savedMsg && (
            <span style={{ fontSize: 10.5, color: t.green }}>{savedMsg}</span>
          )}
          <button
            onClick={save}
            disabled={!budgets || saving}
            style={{
              background: t.accent, color: '#fff', border: 0,
              padding: '8px 18px', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: (!budgets || saving) ? 'default' : 'pointer',
              opacity: (!budgets || saving) ? 0.55 : 1, fontFamily: 'inherit',
            }}
          >{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </section>
    </React.Fragment>
  );
}

function BudgetRow({ badgeId, label, value, onChange, t, emphasize }) {
  const shown = value == null || value === 0 ? '' : String(value);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 0',
    }}>
      {badgeId ? (
        <ProviderBadge id={badgeId} size={20} radius={5} />
      ) : (
        <div style={{
          width: 20, height: 20, borderRadius: 5,
          background: 'linear-gradient(135deg, rgba(34,211,238,0.25), rgba(124,92,255,0.25))',
          border: `1px solid ${t.cardBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: t.text, fontSize: 10, fontWeight: 700,
        }}>Σ</div>
      )}
      <div style={{
        flex: 1, minWidth: 0,
        fontSize: 11.5, color: t.text,
        fontWeight: emphasize ? 600 : 500,
      }}>{label}</div>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${t.cardBorder}`,
        borderRadius: 7, padding: '0 4px 0 10px',
        minWidth: 110,
      }}>
        <span style={{ color: t.textDim, fontSize: 11, fontFamily: TOKENS.type.mono, marginRight: 4 }}>$</span>
        <input
          type="text"
          inputMode="decimal"
          value={shown}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1, minWidth: 0,
            background: 'transparent', border: 0, outline: 'none',
            color: t.text, padding: '7px 0',
            fontSize: 11, fontFamily: TOKENS.type.mono,
            fontVariantNumeric: 'tabular-nums',
            textAlign: 'right',
          }}
        />
        <span style={{ color: t.textMute, fontSize: 9.5, marginLeft: 6 }}>/ day</span>
      </div>
    </div>
  );
}

function Toggle({ value, onChange, t }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 20, border: 0,
        background: value ? t.accent : 'rgba(255,255,255,0.12)',
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        transition: 'background .15s',
        padding: 0,
      }}
      aria-pressed={value}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff',
        transition: 'left .15s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

window.BudgetsSheet = BudgetsSheet;
