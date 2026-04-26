// HistorySheet — read-only browser for past Tokenly chat conversations
// (the chats started inside this app). Reuses the markdown rendering from
// ChatSheet for the transcript view.
const { useState: useStateH, useEffect: useEffectH, useMemo: useMemoH } = React;

function HistorySheet({ open, onClose, onBack, onOpenExternal, isPro }) {
  const t = TOKENS.color;
  const isPopover = (typeof window.api?.mode === 'function') ? window.api.mode() === 'popover' : false;
  const [items, setItems] = useStateH([]);
  const [loading, setLoading] = useStateH(false);
  const [search, setSearch] = useStateH('');
  const [selectedId, setSelectedId] = useStateH(null);
  const [transcript, setTranscript] = useStateH(null);
  const [transcriptLoading, setTranscriptLoading] = useStateH(false);

  useEffectH(() => {
    if (!open || !isPro) return;
    setLoading(true);
    (async () => {
      const tk = await window.api.chatListConversations().catch(() => []);
      const sorted = [...(tk || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setItems(sorted);
      setLoading(false);
    })();
  }, [open, isPro]);

  const filtered = useMemoH(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => (i.title || '').toLowerCase().includes(q) || (i.project || '').toLowerCase().includes(q));
  }, [items, search]);

  useEffectH(() => {
    if (!selectedId) { setTranscript(null); return; }
    setTranscriptLoading(true);
    (async () => {
      const conv = await window.api.chatLoadConversation(selectedId);
      setTranscript(conv);
      setTranscriptLoading(false);
    })();
  }, [selectedId]);

  if (!open) return null;

  return (
    <React.Fragment>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
        zIndex: 70,
      }} />
      <section style={{
        position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
        background: 'linear-gradient(180deg, #15151f 0%, #0a0a13 100%)',
        borderTop: '1px solid rgba(232,164,65,0.45)',
        boxShadow: '0 -1px 24px rgba(232,164,65,0.12)',
        zIndex: 80,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header — leaves room for traffic lights when in detached desktop window */}
        <div style={{
          padding: isPopover ? '8px 12px' : '8px 12px 8px 78px',
          borderBottom: `1px solid ${t.cardBorder}`,
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          WebkitAppRegion: isPopover ? 'no-drag' : 'drag',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' }}>
          <IconBtn onClick={onBack || onClose} title={onBack ? 'Back to menu' : 'Close'}>
            {onBack ? Icons.arrowLeft : Icons.chevronDown}
          </IconBtn>
          <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            History
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
              color: '#1a1408', lineHeight: 1,
              background: 'linear-gradient(135deg, #ffd772, #e8a441)',
              border: '1px solid rgba(232,164,65,0.55)',
            }}>Max</span>
          </div>
          </span>
          <div style={{ flex: 1 }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              background: 'rgba(0,0,0,0.3)', color: t.text,
              border: `1px solid ${t.cardBorder}`, borderRadius: 7,
              padding: '5px 9px', fontSize: 11, outline: 'none',
              width: 160, fontFamily: 'inherit',
              WebkitAppRegion: 'no-drag',
            }}
          />
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* List */}
          <div style={{
            width: 240, flexShrink: 0,
            borderRight: `1px solid ${t.cardBorder}`,
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.18)',
          }}>
            {loading ? (
              <div style={{ padding: 14, fontSize: 11, color: t.textDim }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 14, fontSize: 11, color: t.textMute, textAlign: 'center' }}>
                {search ? 'No matches' : 'No conversations'}
              </div>
            ) : filtered.map((i) => (
              <div
                key={i.id}
                onClick={() => setSelectedId(i.id)}
                style={{
                  padding: '8px 10px', margin: '4px 4px',
                  borderRadius: 6, cursor: 'pointer',
                  background: i.id === selectedId ? 'rgba(124,92,255,0.18)' : 'transparent',
                  border: `1px solid ${i.id === selectedId ? 'rgba(124,92,255,0.4)' : 'transparent'}`,
                }}
                onMouseEnter={(e) => { if (i.id !== selectedId) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { if (i.id !== selectedId) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  {i.voiceMode && <span style={{ color: t.accent2, fontSize: 9 }} title="Voice conversation">●</span>}
                  <div style={{
                    fontSize: 11, fontWeight: 500, color: t.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
                  }}>{i.title || 'Untitled'}</div>
                </div>
                <div style={{
                  fontSize: 9.5, color: t.textMute,
                  display: 'flex', justifyContent: 'space-between', gap: 5,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  <span>{i.project || (i.model && shortModel(i.model)) || '—'}</span>
                  <span>{relTimeShort(i.updatedAt)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Transcript */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '14px 16px' }}>
            {!selectedId ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: t.textMute, fontSize: 11, gap: 6,
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <div>Select a conversation</div>
              </div>
            ) : transcriptLoading ? (
              <div style={{ fontSize: 11, color: t.textDim }}>Loading transcript…</div>
            ) : !transcript ? (
              <div style={{ fontSize: 11, color: t.red }}>Could not load this conversation.</div>
            ) : (
              <Transcript transcript={transcript} t={t} onOpenExternal={onOpenExternal} />
            )}
          </div>
        </div>
      </section>
    </React.Fragment>
  );
}
window.HistorySheet = HistorySheet;

function shortModel(m) {
  if (!m) return '';
  return String(m).replace(/^claude-/, '').replace(/-\d{8}$/, '').slice(0, 24);
}
function relTimeShort(ms) {
  if (!ms) return '';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  if (d < 30) return d + 'd';
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo + 'mo';
  return Math.floor(mo / 12) + 'y';
}

function Transcript({ transcript, t, onOpenExternal }) {
  // Combine LLM + voice (STT + TTS) costs for a single "what this conversation
  // cost you" figure. Voice-only costs come from VoiceMate's running ledger.
  const totalCost = (transcript.totals?.cost || 0) + (transcript.totals?.voiceCost || 0);
  return (
    <React.Fragment>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{transcript.title || 'Untitled'}</div>
        <div style={{
          fontSize: 10.5, color: t.textDim, marginTop: 4,
          display: 'flex', gap: 10, flexWrap: 'wrap',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {transcript.provider && <span>· {(window.PROVIDER_LABELS_CHAT?.[transcript.provider]?.name) || transcript.provider}</span>}
          {transcript.model && <span style={{ fontFamily: TOKENS.type.mono }}>{shortModel(transcript.model)}</span>}
          {transcript.project && <span>· {transcript.project}</span>}
          <span>· {(transcript.messages || []).length} msgs</span>
          {totalCost > 0 && <span>· {fmtMoney(totalCost)}</span>}
        </div>
      </div>
      {(transcript.messages || []).map((m, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 9.5, color: t.textMute, letterSpacing: '0.04em',
            textTransform: 'uppercase', marginBottom: 4,
          }}>{m.role}</div>
          <div style={{
            background: m.role === 'user' ? 'rgba(124,92,255,0.10)' : t.card,
            border: `1px solid ${m.role === 'user' ? 'rgba(124,92,255,0.25)' : t.cardBorder}`,
            borderRadius: 10, padding: '10px 12px',
            userSelect: 'text',
          }}>
            {m.role === 'assistant' && window.chatRenderMarkdown
              ? window.chatRenderMarkdown(m.content || '', t, onOpenExternal)
              : <div style={{ fontSize: 12, color: t.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', fontFamily: m.role === 'assistant' ? 'inherit' : 'inherit' }}>{m.content}</div>
            }
          </div>
        </div>
      ))}
    </React.Fragment>
  );
}
