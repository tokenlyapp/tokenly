// Shared UI atoms for the LLM Usage app.
const { useState, useEffect, useRef, useMemo } = React;

const PROVIDERS = [
  { id: 'claude-code', name: 'Claude Code', abbr: 'CC', logoId: 'anthropic',
    keyless: true,
    keyHelp: 'Real-time local tracking from ~/.claude/projects/ — no key needed. Covers Claude Code CLI + Claude desktop usage. Prices are estimates computed from a local table.',
    keyLink: 'docs.anthropic.com/en/docs/claude-code', keyPlaceholder: '' },
  { id: 'codex', name: 'Codex', abbr: 'CX',
    keyless: true,
    keyHelp: 'Real-time local tracking from ~/.codex/logs_2.sqlite — no key needed. Includes ChatGPT-subscription-bundled usage (labeled separately).',
    keyLink: 'platform.openai.com/docs/codex', keyPlaceholder: '' },
  { id: 'gemini-cli', name: 'Gemini CLI', abbr: 'GC',
    keyless: true, logoId: 'gemini',
    keyHelp: 'Real-time local tracking from ~/.gemini/tmp/ — no key needed. Covers Gemini CLI terminal sessions. Prices are estimates from published Google rates.',
    keyLink: 'github.com/google-gemini/gemini-cli', keyPlaceholder: '' },
  { id: 'openai', name: 'OpenAI API', abbr: 'AI',
    keyPrefix: 'sk-admin-', requiresAdmin: true,
    keyHelp: 'Platform → Organization → Admin keys. Must be an org owner. Regular project keys (sk-proj-…, sk-…) will 403.',
    keyLink: 'platform.openai.com/settings/organization/admin-keys', keyPlaceholder: 'sk-admin-…' },
  { id: 'anthropic', name: 'Anthropic API', abbr: 'AN',
    keyPrefix: 'sk-ant-admin', requiresAdmin: true,
    keyHelp: 'Console → Settings → Admin Keys. Requires Primary Owner. Regular sk-ant-api- keys cannot read usage/cost reports.',
    keyLink: 'console.anthropic.com/settings/admin-keys', keyPlaceholder: 'sk-ant-admin01-…' },
  { id: 'openrouter', name: 'OpenRouter', abbr: 'OR',
    keyPrefix: null, requiresAdmin: true,
    keyHelp: 'A Management key (not a regular API key) from OpenRouter → Settings → Management Keys. Delayed data: OpenRouter aggregates by completed UTC day, so today\'s usage doesn\'t appear until tomorrow.',
    keyLink: 'openrouter.ai/settings/management-keys', keyPlaceholder: 'sk-or-v1-…' },
];
window.PROVIDERS = PROVIDERS;

// Number formatters (tabular, compact).
function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}
function fmtMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '$0.00';
  if (v > 0 && v < 0.01) return '<$0.01';
  if (v >= 10000) return '$' + Math.round(v).toLocaleString();
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
window.fmt = fmt;
window.fmtMoney = fmtMoney;

// Context picks 'monogram' (colored initial) or 'logo' (SVG).
const BadgeStyleContext = React.createContext('monogram');
window.BadgeStyleContext = BadgeStyleContext;

// Provider badge — monogram on colored gradient, or brand SVG on a light chip.
function ProviderBadge({ id, size = 26, radius = 7 }) {
  const mode = React.useContext(BadgeStyleContext);
  const [a, b] = TOKENS.color.providers[id];
  const provider = PROVIDERS.find(p => p.id === id);
  const abbr = provider.abbr;
  const logoFile = provider.logoId || id;

  if (mode === 'logo') {
    return (
      <div style={{
        width: size, height: size, borderRadius: radius,
        background: 'rgba(255,255,255,0.92)',
        border: '1px solid rgba(0,0,0,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, overflow: 'hidden',
      }}>
        <img
          src={`assets/${logoFile}.svg`}
          alt={abbr}
          draggable={false}
          style={{ width: size * 0.66, height: size * 0.66, objectFit: 'contain', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: radius,
      background: `linear-gradient(135deg, ${a}, ${b})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.42, fontWeight: 700, letterSpacing: '-0.02em',
      flexShrink: 0,
    }}>{abbr}</div>
  );
}
window.ProviderBadge = ProviderBadge;

// Status dot.
function StatusDot({ status }) {
  const styles = {
    ok:    { background: TOKENS.color.green, boxShadow: '0 0 6px rgba(52,211,153,0.7)' },
    err:   { background: TOKENS.color.red },
    warn:  { background: TOKENS.color.amber },
    idle:  { background: TOKENS.color.textMute },
  };
  return <div style={{ width: 6, height: 6, borderRadius: '50%', ...styles[status] }} />;
}
window.StatusDot = StatusDot;

// Ghost icon button (28×28).
function IconBtn({ children, onClick, title, spinning, active }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 28, height: 28,
        background: hov || active ? TOKENS.color.cardHover : TOKENS.color.card,
        border: `1px solid ${hov || active ? TOKENS.color.cardBorderStrong : TOKENS.color.cardBorder}`,
        color: hov || active ? TOKENS.color.text : TOKENS.color.textDim,
        borderRadius: 8,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', padding: 0, transition: 'all .15s',
      }}
    >
      <span style={{ display: 'inline-flex', animation: spinning ? 'llmspin .8s linear infinite' : 'none' }}>
        {children}
      </span>
    </button>
  );
}
window.IconBtn = IconBtn;

// Hover info pill — small (i) that pops a styled tooltip below on hover.
// Uses position:fixed + getBoundingClientRect so the tooltip escapes any
// overflow-hidden / overflow-auto ancestor.
function InfoTip({ text, emphasis = false }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState(null);
  const iconRef = React.useRef(null);
  const t = TOKENS.color;
  const stroke = emphasis ? t.amber : t.textMute;
  const TOOLTIP_W = 252;

  const open = () => {
    if (!iconRef.current) return;
    const r = iconRef.current.getBoundingClientRect();
    // Right-align the tooltip with the icon's right edge; clamp to viewport.
    const vw = window.innerWidth;
    let left = r.right - TOOLTIP_W;
    left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8));
    setPos({ top: r.bottom + 6, left });
    setHover(true);
  };
  const close = () => setHover(false);

  return (
    <span
      ref={iconRef}
      onMouseEnter={open}
      onMouseLeave={close}
      onClick={(e) => e.stopPropagation()}
      style={{ display: 'inline-flex', cursor: 'help', alignItems: 'center' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      {hover && pos && ReactDOM.createPortal(
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000,
          width: TOOLTIP_W, padding: '10px 12px',
          background: 'rgba(15,15,22,0.98)',
          border: `1px solid ${emphasis ? 'rgba(251,191,36,0.35)' : t.cardBorderStrong}`,
          borderRadius: 9,
          fontSize: 10.5, color: t.text, lineHeight: 1.5,
          boxShadow: '0 10px 28px rgba(0,0,0,0.7)',
          pointerEvents: 'none',
          whiteSpace: 'normal',
          textAlign: 'left',
          fontFamily: TOKENS.type.family,
        }}>{text}</div>,
        document.body
      )}
    </span>
  );
}
window.InfoTip = InfoTip;

// Per-provider tooltip copy used on the collapsed-row amount.
const PROVIDER_COST_INFO = {
  'claude-code': {
    emphasis: true,
    title: 'List-price estimate',
    body: 'Computed from local ~/.claude/projects logs × published per-million-token rates. This is NOT what you paid. If you\'re on Claude Max/Pro, your real cost is your flat monthly subscription. Think of this as "value extracted" from your plan.',
  },
  'codex': {
    emphasis: true,
    title: 'List-price estimate',
    body: 'Computed from local ~/.codex/sessions rollouts × published OpenAI rates. NOT your actual charge. If you\'re on ChatGPT Team/Pro/Plus, your real cost is your flat subscription — this shows what the same usage would cost at API rates.',
  },
  'gemini-cli': {
    emphasis: true,
    title: 'List-price estimate',
    body: 'Computed from local ~/.gemini/tmp session files × published Google rates. NOT your actual charge — Gemini CLI uses a generous free quota + Google AI subscription tiers. This shows what the same usage would cost at pay-as-you-go API rates.',
  },
  'openai': {
    emphasis: false,
    title: 'Actual billed spend',
    body: 'Real dollars from OpenAI\'s /v1/organization/costs endpoint — this is the number on your API invoice. Pre-credit: if you have prepay or promo credits, the invoice may collect less. Does not include ChatGPT-subscription usage (Codex card covers that).',
  },
  'anthropic': {
    emphasis: false,
    title: 'Actual billed spend',
    body: 'Real dollars from Anthropic\'s /cost_report endpoint — your API invoice figure. Pre-credit. Does NOT include Claude Code / Claude.ai subscription usage — that\'s billed separately and shows on the Claude Code card.',
  },
  'openrouter': {
    emphasis: false,
    title: 'Actual billed spend',
    body: 'Real dollars reported by OpenRouter\'s activity endpoint. Rolled up per completed UTC day — today\'s usage appears after 00:00 UTC.',
  },
};
window.PROVIDER_COST_INFO = PROVIDER_COST_INFO;

// Icons.
const Icons = {
  refresh: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>,
  gear: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  caret: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>,
  close: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  eye: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>,
  check: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  arrow: <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>,
};
window.Icons = Icons;
