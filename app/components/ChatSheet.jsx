// Tokenly Chat — direct-to-API chat sheet (Max-only).
// Streams from main.js via window.api.chatStream + window.api.onChatStreamEvent.
// Persists conversations through chat:save-conversation. Voice modes:
//   - Push-to-talk: hold hotkey, record, transcribe, drop in composer.
//   - Voice mode: continuous turn-taking (mic → STT → LLM → TTS → mic).
const { useState: useStateCt, useEffect: useEffectCt, useRef: useRefCt, useMemo: useMemoCt, useCallback: useCallbackCt } = React;

// -- Markdown renderer with code fences (extends ChangelogSheet's subset) ---
function chatRenderInline(text, t, openExternal, keyPrefix = 'i') {
  const out = [];
  let i = 0, idx = 0;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > i) out.push(text.slice(i, m.index));
    if (m[1]) out.push(<strong key={`${keyPrefix}-b-${idx++}`}>{m[2]}</strong>);
    else if (m[3]) out.push(
      <code key={`${keyPrefix}-c-${idx++}`} style={{
        background: 'rgba(255,255,255,0.08)',
        padding: '1px 5px', borderRadius: 4,
        fontFamily: TOKENS.type.mono, fontSize: 11,
      }}>{m[4]}</code>
    );
    else if (m[5]) out.push(
      <a key={`${keyPrefix}-a-${idx++}`}
        href={m[7]} onClick={(e) => { e.preventDefault(); openExternal && openExternal(m[7]); }}
        style={{ color: t.accent, textDecoration: 'none', borderBottom: `1px solid ${t.accent}55` }}
      >{m[6]}</a>
    );
    i = re.lastIndex;
  }
  if (i < text.length) out.push(text.slice(i));
  return out;
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useStateCt(false);
  const t = TOKENS.color;
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {}
  };
  return (
    <div style={{
      position: 'relative', margin: '8px 0',
      background: 'rgba(0,0,0,0.4)',
      border: `1px solid ${t.cardBorder}`,
      borderRadius: 8, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px 4px 10px',
        borderBottom: `1px solid ${t.cardBorder}`,
        background: 'rgba(255,255,255,0.03)',
      }}>
        <span style={{ fontSize: 9.5, color: t.textMute, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{lang || 'code'}</span>
        <button
          onClick={onCopy}
          style={{
            background: 'transparent', border: 0, color: copied ? t.green : t.textDim,
            fontSize: 10, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 6px',
          }}
        >{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre style={{
        margin: 0, padding: '10px 12px',
        fontFamily: TOKENS.type.mono, fontSize: 11.5,
        color: t.text, lineHeight: 1.55,
        overflowX: 'auto', whiteSpace: 'pre',
      }}>{code}</pre>
    </div>
  );
}

function chatRenderMarkdown(md, t, openExternal) {
  if (!md) return null;
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // consume closing fence
      blocks.push(<CodeBlock key={`code-${i}`} lang={lang} code={buf.join('\n')} />);
      continue;
    }

    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const sizes = { 1: 15, 2: 13.5, 3: 12.5, 4: 12 };
      blocks.push(
        <div key={`h-${i}`} style={{
          fontSize: sizes[level], fontWeight: 700, color: t.text,
          margin: '10px 0 4px', lineHeight: 1.3,
        }}>{chatRenderInline(h[2], t, openExternal, `h${i}`)}</div>
      );
      i++; continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} style={{
          margin: '4px 0 6px', paddingLeft: 18,
          fontSize: 12, color: t.text, lineHeight: 1.55,
        }}>
          {items.map((it, j) => (
            <li key={j} style={{ marginBottom: 2 }}>{chatRenderInline(it, t, openExternal, `li${i}-${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`} style={{
          margin: '4px 0 6px', paddingLeft: 22,
          fontSize: 12, color: t.text, lineHeight: 1.55,
        }}>
          {items.map((it, j) => (
            <li key={j} style={{ marginBottom: 2 }}>{chatRenderInline(it, t, openExternal, `oli${i}-${j}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.startsWith('>')) {
      const text = line.replace(/^>\s?/, '');
      blocks.push(
        <div key={`q-${i}`} style={{
          background: 'rgba(124,92,255,0.08)',
          borderLeft: `2px solid ${t.accent}`,
          padding: '6px 10px', borderRadius: '0 6px 6px 0',
          fontSize: 12, color: t.textDim, margin: '6px 0', lineHeight: 1.5,
        }}>{chatRenderInline(text, t, openExternal, `q${i}`)}</div>
      );
      i++; continue;
    }

    const paraLines = [];
    while (i < lines.length && lines[i].trim()
      && !/^(#{1,4})\s/.test(lines[i])
      && !/^\s*[-*]\s+/.test(lines[i])
      && !/^\s*\d+\.\s+/.test(lines[i])
      && !lines[i].startsWith('>')
      && !/^```/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <div key={`p-${i}`} style={{
        fontSize: 12, color: t.text, lineHeight: 1.55, margin: '4px 0',
        whiteSpace: 'pre-wrap',
      }}>{chatRenderInline(paraLines.join('\n'), t, openExternal, `p${i}`)}</div>
    );
  }
  return blocks;
}

// -- Helpers ---------------------------------------------------------------
function newConvId() {
  // 16-char crypto-random id; safe regex matches in main.js (^[A-Za-z0-9_-]{6,40}$).
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function streamId() { return 's_' + newConvId(); }
function relTime(ms) {
  if (!ms) return '';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
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

const PROVIDER_LABELS = {
  openai: { name: 'OpenAI',    color: ['#10a37f', '#0d8a6a'], short: 'OAI' },
  anthropic: { name: 'Claude', color: ['#d97757', '#b85f3f'], short: 'CLD' },
  google: { name: 'Gemini',    color: ['#4285f4', '#7c5cff'], short: 'GEM' },
};
window.PROVIDER_LABELS_CHAT = PROVIDER_LABELS;
window.chatRenderMarkdown = chatRenderMarkdown;

const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

// -- Main component --------------------------------------------------------
function ChatSheet({ open, onClose, onBack, onOpenExternal, isPro, onOpenHistory, onOpenVoice, registerVoiceController }) {
  const t = TOKENS.color;
  // Detached desktop window has traffic lights at top-left; reserve space.
  const isPopover = (typeof window.api?.mode === 'function') ? window.api.mode() === 'popover' : false;

  // Model registry (loaded once from main).
  const [models, setModels] = useStateCt({ openai: [], anthropic: [], google: [] });
  const [keysMeta, setKeysMeta] = useStateCt({ openai: { present: false }, anthropic: { present: false }, google: { present: false } });
  const [prefs, setPrefs] = useStateCt(null);

  // Current conversation state.
  const [conv, setConv] = useStateCt(() => emptyConv('openai', 'gpt-4o-mini'));
  const [provider, setProvider] = useStateCt('openai');
  const [model, setModel] = useStateCt('gpt-4o-mini');
  const [system, setSystem] = useStateCt('');
  const [showSystem, setShowSystem] = useStateCt(false);

  // Composer.
  const [draft, setDraft] = useStateCt('');
  const [streaming, setStreaming] = useStateCt(false);
  const [pendingId, setPendingId] = useStateCt(null);
  const streamRef = useRefCt({ id: null });
  const composerRef = useRefCt(null);
  const scrollRef = useRefCt(null);

  // Conversation list (sidebar).
  const [convList, setConvList] = useStateCt([]);
  const [showSidebar, setShowSidebar] = useStateCt(true);

  // Live-transcription state for the composer mic. Continuous record + chunked
  // Whisper passes — replaces the old push-to-talk + inline voice-mode flow
  // (voice mode now lives in the standalone VoiceMate window via ⌘⇧V).
  const [liveTranscribing, setLiveTranscribing] = useStateCt(false);
  const [liveError, setLiveError] = useStateCt(null);
  const liveRecRef = useRefCt(null);     // { mr, stream, chunks, mime, inFlight, cancelled }
  const liveTranscribingRef = useRefCt(false);

  // Web search toggle — flows into chat:stream IPC; routes OpenAI to Responses API.
  // Default ON: most chat questions benefit from fresh info; user can disable per-conversation.
  const [webSearch, setWebSearch] = useStateCt(() => {
    try { const v = localStorage.getItem('chatWebSearch'); return v == null ? true : v === '1'; } catch { return true; }
  });
  useEffectCt(() => {
    try { localStorage.setItem('chatWebSearch', webSearch ? '1' : '0'); } catch {}
  }, [webSearch]);

  // Inline keys editor.
  const [showKeys, setShowKeys] = useStateCt(false);

  // Live Tokenly knowledge: usage snapshot + memory digest of past conversations.
  // Mirrors the context VoiceMate injects so the text chat can answer questions
  // about the user's spend, models, quotas, and prior conversations too.
  const memoryRef = useRefCt('');
  const usageSnapshotRef = useRefCt(null);

  function emptyConv(prov, mdl) {
    return {
      id: newConvId(),
      title: 'New chat',
      provider: prov, model: mdl,
      createdAt: Date.now(), updatedAt: Date.now(),
      messages: [],
      totals: { input: 0, output: 0, cost: 0 },
      voiceMode: false,
    };
  }

  // ------- Initial load (models, keys, prefs, recent conversations) -------
  useEffectCt(() => {
    if (!open || !isPro) return;
    let cancelled = false;
    (async () => {
      const [m, km, p] = await Promise.all([
        window.api.chatListModels(),
        window.api.chatKeysMeta(),
        window.api.chatGetPrefs(),
      ]);
      if (cancelled) return;
      setModels(m || {});
      setKeysMeta(km || {});
      setPrefs(p || null);
      if (p?.primary) {
        // If the user has favorites pinned for this provider, default to
        // their first one — feels more like a personal default than the
        // baked-in "primary" model from prefs.
        const favForProv = p.favoriteModels?.[p.primary.provider] || [];
        const initialModel = favForProv[0] || p.primary.model;
        setProvider(p.primary.provider);
        setModel(initialModel);
        setConv((c) => (c.messages.length === 0 ? { ...c, provider: p.primary.provider, model: initialModel } : c));
      }
      const list = await window.api.chatListConversations();
      if (!cancelled) setConvList(list || []);
      // Build the same context VoiceMate uses: a short digest of recent
      // conversations + a 30-day usage snapshot. Both are best-effort and
      // refreshed lazily on each send.
      try { memoryRef.current = await buildMemoryDigest(list || []); } catch {}
      try { usageSnapshotRef.current = await window.api.chatUsageSnapshot({ days: 30 }); } catch { usageSnapshotRef.current = null; }
    })();
    return () => { cancelled = true; };
  }, [open, isPro]);

  // Compact "what we've talked about" digest from prior conversations.
  // Same shape as VoiceMate.buildMemoryBlock so behavior matches across modes.
  async function buildMemoryDigest(convList) {
    const recent = (convList || []).slice(0, 30);
    if (!recent.length) return '';
    const loaded = await Promise.all(recent.map((c) =>
      window.api.chatLoadConversation(c.id).then(
        (full) => ({ c, full }),
        () => ({ c, full: null }),
      ),
    ));
    const lines = [];
    for (const { c, full } of loaded) {
      if (!full) continue;
      const lastAssistant = [...(full.messages || [])].reverse().find((m) => m.role === 'assistant' && m.content);
      const snippet = lastAssistant ? String(lastAssistant.content).replace(/```[\s\S]*?```/g, ' [code] ').replace(/\s+/g, ' ').trim().slice(0, 220) : '';
      const dateStr = new Date(c.updatedAt || c.createdAt || Date.now()).toISOString().slice(0, 10);
      lines.push(`- ${dateStr} · ${c.title || 'Untitled'}${snippet ? ` — ${snippet}` : ''}`);
    }
    let block = lines.join('\n');
    if (block.length > 6000) block = block.slice(0, 6000) + '\n…';
    return block;
  }

  // Refresh keys meta after sheet returns from inline editing.
  const refreshKeys = useCallbackCt(async () => {
    const km = await window.api.chatKeysMeta();
    setKeysMeta(km || {});
  }, []);

  // Ref shadow of `conv` so async voice callbacks see the latest state without
  // adding it to their dep arrays (would re-allocate the callback on every keystroke).
  const convRef = useRefCt(conv);
  useEffectCt(() => { convRef.current = conv; }, [conv]);

  // ------- Persist conversation when messages change ------------------------
  useEffectCt(() => {
    if (!conv || conv.messages.length === 0) return;
    const t = setTimeout(() => {
      window.api.chatSaveConversation({ ...conv, updatedAt: Date.now() });
    }, 250);
    return () => clearTimeout(t);
  }, [conv]);

  // ------- Auto-scroll on new content --------------------------------------
  useEffectCt(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [conv.messages, streaming]);

  // ------- Stream listener (one-time setup) --------------------------------
  useEffectCt(() => {
    if (!window.api?.onChatStreamEvent) return;
    window.api.onChatStreamEvent((evt) => {
      if (!evt || evt.streamId !== streamRef.current.id) return;
      if (evt.type === 'delta') {
        setConv((c) => {
          const msgs = c.messages.slice();
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            msgs[msgs.length - 1] = { ...last, content: (last.content || '') + (evt.text || '') };
          }
          return { ...c, messages: msgs };
        });
      } else if (evt.type === 'done') {
        setConv((c) => {
          const msgs = c.messages.slice();
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            msgs[msgs.length - 1] = {
              ...last,
              content: evt.text || last.content,
              streaming: false,
              usage: evt.usage || null,
              cost: evt.cost || 0,
            };
          }
          const totals = {
            input: (c.totals?.input || 0) + (evt.usage?.input || 0),
            output: (c.totals?.output || 0) + (evt.usage?.output || 0),
            cost: (c.totals?.cost || 0) + (evt.cost || 0),
          };
          // Auto-title from first user message if still default.
          let title = c.title;
          if ((!title || title === 'New chat') && msgs.find((m) => m.role === 'user')) {
            const firstUser = msgs.find((m) => m.role === 'user');
            title = String(firstUser.content || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat';
          }
          return { ...c, messages: msgs, totals, title };
        });
        setStreaming(false);
        streamRef.current = { id: null };
      } else if (evt.type === 'citations') {
        setConv((c) => {
          const msgs = c.messages.slice();
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            msgs[msgs.length - 1] = { ...last, citations: evt.items };
          }
          return { ...c, messages: msgs };
        });
      } else if (evt.type === 'error') {
        setConv((c) => {
          const msgs = c.messages.slice();
          const last = msgs[msgs.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            msgs[msgs.length - 1] = { ...last, error: evt.message, streaming: false };
          }
          return { ...c, messages: msgs };
        });
        setStreaming(false);
        streamRef.current = { id: null };
      } else if (evt.type === 'aborted') {
        setStreaming(false);
        streamRef.current = { id: null };
      }
    });
  }, []);

  // ------- Send message ----------------------------------------------------
  const sendMessage = useCallbackCt(async (textOverride) => {
    const text = (textOverride != null ? textOverride : draft).trim();
    if (!text || streaming) return;
    if (!keysMeta[provider]?.present) {
      setShowKeys(true);
      return;
    }

    const id = streamId();
    streamRef.current = { id };
    setStreaming(true);
    setPendingId(id);
    if (textOverride == null) setDraft('');

    setConv((c) => {
      const msgs = c.messages.concat([
        { role: 'user', content: text, timestamp: Date.now() },
        { role: 'assistant', content: '', timestamp: Date.now(), streaming: true, model, provider, webSearch },
      ]);
      return { ...c, messages: msgs, provider, model, updatedAt: Date.now() };
    });

    // Build outgoing messages: only user/assistant turns, content as plain string.
    const outgoing = [...conv.messages, { role: 'user', content: text }]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content || '' }));

    // Refresh the usage snapshot opportunistically so the model always sees
    // the freshest numbers (matches VoiceMate's per-turn refresh).
    try { usageSnapshotRef.current = await window.api.chatUsageSnapshot({ days: 30 }); } catch {}

    // Compose the effective system prompt: user's custom prompt (if any) plus
    // the same Tokenly knowledge block the voice assistant gets — live usage
    // data + a digest of recent conversations.
    let effectiveSystem = system || '';
    const usage = usageSnapshotRef.current;
    const memory = memoryRef.current;
    if (usage) {
      effectiveSystem += `${effectiveSystem ? '\n\n' : ''}LIVE TOKENLY USAGE DATA (the user's real numbers as of ${usage.generatedAt}, last ${usage.windowDays} days):\n${JSON.stringify(usage)}\n\nIMPORTANT TOKEN SCHEMA — the user's "total tokens" question must include cache reads. Each provider's tokens object has these fields:\n  • input         — fresh input tokens\n  • output        — generated output tokens\n  • cache_write   — tokens written to prompt cache (billed at input rate)\n  • cache_read    — tokens served from prompt cache (billed at 0.1× input)\n  • reasoning     — internal reasoning tokens (counted as output for billing)\n  • total         — canonical sum of all of the above. ALWAYS USE THIS WHEN ANSWERING "TOTAL TOKEN USE" QUESTIONS.\n\nDo NOT compute total as input + output. That excludes cache, which is often the biggest component (a heavy prompt-caching user can have 100x more cache_read than input). When the user asks "how many tokens have I used", quote tokens.total. When they ask "how much input vs output", quote those separately. The same rule applies to totals.total at the top level for "across all providers".\n\nWhen the user asks about their token usage, costs, top models, quotas, or trends — use this data to answer with real numbers. If a value isn't in this snapshot, say you don't have that data rather than making one up.`;
    }
    if (memory) {
      effectiveSystem += `${effectiveSystem ? '\n\n' : ''}PAST CONVERSATIONS — what the user has been working on across past Tokenly conversations:\n${memory}\n\nIf the user references something earlier or from past conversations, use this context. Do not bring it up unprompted.`;
    }

    await window.api.chatStream({
      streamId: id,
      provider, model,
      messages: outgoing,
      system: effectiveSystem || undefined,
      webSearch,
    });
  }, [draft, streaming, keysMeta, provider, model, system, conv.messages, webSearch]);

  const cancelStream = useCallbackCt(() => {
    if (streamRef.current.id) window.api.chatCancel(streamRef.current.id);
  }, []);

  // ------- Conversation actions --------------------------------------------
  const newChat = useCallbackCt(() => {
    if (streaming) cancelStream();
    setConv(emptyConv(provider, model));
  }, [provider, model, streaming, cancelStream]);

  const refreshList = useCallbackCt(async () => {
    const list = await window.api.chatListConversations();
    setConvList(list || []);
  }, []);

  const openConversation = useCallbackCt(async (id) => {
    if (streaming) cancelStream();
    const loaded = await window.api.chatLoadConversation(id);
    if (loaded) {
      setConv(loaded);
      setProvider(loaded.provider);
      setModel(loaded.model);
    }
  }, [streaming, cancelStream]);

  const deleteConversation = useCallbackCt(async (id) => {
    await window.api.chatDeleteConversation(id);
    if (conv.id === id) setConv(emptyConv(provider, model));
    refreshList();
  }, [conv.id, provider, model, refreshList]);

  // ------- Live transcription: continuous Whisper chunking -----------------
  // Click the mic to enter live mode: we record continuously and re-transcribe
  // the accumulated audio every ~2s, replacing the composer text in place so
  // the user can see what was heard. Pressing Enter sends as normal. Click
  // mic again to stop transcribing without sending.
  function pickMime() {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const c of cands) try { if (MediaRecorder.isTypeSupported(c)) return c; } catch {}
    return '';
  }
  function arrayBufferToBase64(ab) {
    const bytes = new Uint8Array(ab);
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  }

  const startLiveTranscription = useCallbackCt(async () => {
    if (liveTranscribingRef.current) return;
    if (!keysMeta.openai?.present) {
      setLiveError('Add an OpenAI key to enable live transcription.');
      setShowKeys(true);
      return;
    }
    setLiveError(null);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      setLiveError('Microphone access was denied. Allow Tokenly in System Settings → Privacy → Microphone.');
      return;
    }
    const mime = pickMime();
    const mr = new MediaRecorder(stream, { mimeType: mime });
    const ctx = { mr, stream, chunks: [], mime: mr.mimeType, inFlight: false, cancelled: false };
    liveRecRef.current = ctx;
    liveTranscribingRef.current = true;
    setLiveTranscribing(true);

    // Each timeslice fires dataavailable; we transcribe the whole tail so the
    // composer keeps showing the most accurate reading of everything spoken.
    const transcribeTail = async () => {
      if (ctx.cancelled || ctx.inFlight || !ctx.chunks.length) return;
      ctx.inFlight = true;
      try {
        const blob = new Blob(ctx.chunks, { type: ctx.mime });
        const ab = await blob.arrayBuffer();
        const b64 = arrayBufferToBase64(ab);
        const res = await window.api.chatTranscribe({ audioB64: b64, mime: ctx.mime, filename: 'live.webm' });
        if (!ctx.cancelled && res.ok && typeof res.text === 'string') {
          setDraft(res.text.trim());
        }
      } catch {}
      ctx.inFlight = false;
    };

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size) ctx.chunks.push(e.data);
      // Fire-and-forget; gated by the inFlight flag so a slow Whisper call
      // doesn't queue up overlapping requests.
      if (!ctx.cancelled) transcribeTail();
    };
    mr.onstop = async () => {
      try { for (const tr of stream.getTracks()) tr.stop(); } catch {}
      // One last pass on the full audio so the final draft reflects everything
      // (otherwise the trailing 0–2s of speech can be missing).
      if (!ctx.cancelled) {
        // Wait for any in-flight to finish, then do a fresh pass.
        const waitIdle = () => new Promise((r) => {
          const t = setInterval(() => { if (!ctx.inFlight) { clearInterval(t); r(); } }, 80);
          setTimeout(() => { clearInterval(t); r(); }, 4000);
        });
        await waitIdle();
        await transcribeTail();
      }
      liveRecRef.current = null;
      liveTranscribingRef.current = false;
      setLiveTranscribing(false);
    };
    mr.start(2000); // emit a chunk every 2 seconds
  }, [keysMeta]);

  const stopLiveTranscription = useCallbackCt((opts = {}) => {
    const ctx = liveRecRef.current;
    if (!ctx) return;
    if (opts.cancel) ctx.cancelled = true;
    try { ctx.mr.stop(); } catch {}
  }, []);

  const toggleLiveTranscription = useCallbackCt(() => {
    if (liveTranscribingRef.current) stopLiveTranscription();
    else startLiveTranscription();
  }, [startLiveTranscription, stopLiveTranscription]);

  // ------- Voice controller registration -----------------------------------
  // App.jsx owns the global hotkey listener and calls into pttToggle when
  // ⌘⇧Space fires. ⌘⇧V opens VoiceMate window directly in main.js, so no
  // voiceModeToggle is needed here anymore.
  useEffectCt(() => {
    if (!registerVoiceController) return;
    registerVoiceController({
      liveTranscribing, streaming,
      pttToggle: toggleLiveTranscription,
    });
    return () => registerVoiceController(null);
  }, [liveTranscribing, streaming, toggleLiveTranscription, registerVoiceController]);

  // ------- Render ----------------------------------------------------------
  if (!open) return null;

  const cur = PROVIDER_LABELS[provider] || PROVIDER_LABELS.openai;
  const providerHasKey = keysMeta[provider]?.present;

  return (
    <React.Fragment>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
          zIndex: 50,
        }}
      />
      <section style={{
        position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
        background: 'linear-gradient(180deg, #15151f 0%, #0a0a13 100%)',
        borderTop: '1px solid rgba(232,164,65,0.45)',
        boxShadow: '0 -1px 24px rgba(232,164,65,0.12)',
        zIndex: 60,
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
          <IconBtn onClick={onBack || onClose} title={onBack ? 'Back to menu' : 'Close chat'}>
            {onBack ? Icons.arrowLeft : Icons.chevronDown}
          </IconBtn>
          <button
            onClick={() => setShowSidebar((s) => !s)}
            title={showSidebar ? 'Hide history' : 'Show history'}
            style={{
              width: 28, height: 28, background: showSidebar ? t.cardHover : t.card,
              border: `1px solid ${showSidebar ? t.cardBorderStrong : t.cardBorder}`,
              borderRadius: 8, color: showSidebar ? t.text : t.textDim,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            Chat
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, WebkitAppRegion: 'no-drag' }}>
          <ProviderModelPicker
            provider={provider} model={model}
            providers={Object.keys(PROVIDER_LABELS).filter((p) => keysMeta[p]?.present || true)}
            keysMeta={keysMeta}
            modelsByProvider={models}
            favorites={prefs?.favoriteModels || {}}
            onChange={(p, m) => {
              setProvider(p); setModel(m);
              if (conv.messages.length === 0) setConv((c) => ({ ...c, provider: p, model: m }));
            }}
            onToggleFavorite={async (p, mid) => {
              const next = await window.api.chatToggleFavoriteModel({ provider: p, model: mid });
              if (next) setPrefs((cur) => ({ ...(cur || {}), favoriteModels: next }));
            }}
          />
          <IconBtn
            onClick={() => setShowKeys((v) => !v)}
            title={providerHasKey ? 'API keys' : 'Add API key for this provider'}
            active={showKeys}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={providerHasKey ? 'currentColor' : t.amber} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="15" r="4" />
              <path d="M10.85 12.15 19 4" />
              <path d="m18 5 3 3" />
              <path d="m15 8 3 3" />
            </svg>
          </IconBtn>
          <IconBtn onClick={() => setShowSystem((v) => !v)} title="System prompt" active={showSystem}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
            </svg>
          </IconBtn>
          {onOpenHistory && (
            <IconBtn onClick={onOpenHistory} title="History (chats + Claude Code sessions)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </IconBtn>
          )}
          </span>
        </div>

        {/* Body: sidebar + chat */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {showSidebar && (
            <Sidebar
              t={t}
              convList={convList}
              currentId={conv.id}
              onNewChat={newChat}
              onOpenConv={openConversation}
              onDeleteConv={deleteConversation}
              onRefresh={refreshList}
            />
          )}

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            {/* System prompt drawer */}
            {showSystem && (
              <div style={{
                padding: '8px 12px', background: 'rgba(124,92,255,0.06)',
                borderBottom: `1px solid ${t.cardBorder}`,
              }}>
                <div style={{ fontSize: 10, color: t.textDim, marginBottom: 4 }}>System prompt (sent before every message)</div>
                <textarea
                  value={system}
                  onChange={(e) => setSystem(e.target.value)}
                  placeholder="You are a helpful assistant…"
                  rows={3}
                  style={{
                    width: '100%', resize: 'vertical',
                    background: 'rgba(0,0,0,0.3)', color: t.text,
                    border: `1px solid ${t.cardBorder}`, borderRadius: 7,
                    padding: '7px 10px', fontSize: 11.5, fontFamily: TOKENS.type.mono,
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {/* Inline keys editor */}
            {showKeys && (
              <InlineKeys
                t={t}
                keysMeta={keysMeta}
                onChange={refreshKeys}
                onClose={() => setShowKeys(false)}
                onOpenExternal={onOpenExternal}
              />
            )}

            {/* Messages */}
            <div ref={scrollRef} style={{
              flex: 1, minHeight: 0, overflowY: 'auto',
              padding: '14px 16px 12px',
            }}>
              {conv.messages.length === 0 ? (
                <EmptyState
                  t={t}
                  provider={cur}
                  hasKey={providerHasKey}
                  onAddKey={() => setShowKeys(true)}
                  onSuggestion={(s) => setDraft(s)}
                />
              ) : (
                conv.messages.map((m, i) => (
                  <Message
                    key={i}
                    t={t}
                    msg={m}
                    onOpenExternal={onOpenExternal}
                  />
                ))
              )}
              {liveError && (
                <div style={{
                  background: 'rgba(248,113,113,0.12)',
                  border: '1px solid rgba(248,113,113,0.3)',
                  borderRadius: 8, padding: '6px 10px',
                  fontSize: 11, color: t.red, marginTop: 8,
                }}>
                  {liveError}
                  <button onClick={() => setLiveError(null)} style={{
                    float: 'right', background: 'transparent', border: 0, color: t.red, cursor: 'pointer',
                    fontSize: 14, lineHeight: 1, padding: 0,
                  }}>×</button>
                </div>
              )}
            </div>

            {/* Cost footer */}
            {conv.totals && (conv.totals.cost > 0 || conv.totals.input > 0) && (
              <div style={{
                padding: '4px 16px',
                borderTop: `1px solid ${t.cardBorder}`,
                fontSize: 10, color: t.textMute,
                display: 'flex', justifyContent: 'space-between',
                fontVariantNumeric: 'tabular-nums',
              }}>
                <span>This conversation: {fmt(conv.totals.input)} in · {fmt(conv.totals.output)} out</span>
                <span>{fmtMoney(conv.totals.cost)}</span>
              </div>
            )}

            {/* Composer */}
            <Composer
              t={t}
              draft={draft} setDraft={setDraft}
              streaming={streaming}
              liveTranscribing={liveTranscribing}
              webSearch={webSearch}
              onToggleWebSearch={() => setWebSearch((v) => !v)}
              onSend={() => sendMessage()}
              onCancel={cancelStream}
              onToggleMic={toggleLiveTranscription}
              onOpenVoice={onOpenVoice}
              composerRef={composerRef}
              providerLabel={cur.name}
              modelLabel={model}
            />
          </div>
        </div>
      </section>
    </React.Fragment>
  );
}
window.ChatSheet = ChatSheet;

// =========================================================================
// Subcomponents
// =========================================================================

// Three pulsing dots that step in a wave. Used while an assistant message is
// streaming but no tokens have arrived yet — replaces the dead empty bubble.
function ThinkingDots() {
  const t = TOKENS.color;
  const dotStyle = (delay) => ({
    width: 6, height: 6, borderRadius: '50%',
    background: `linear-gradient(135deg, ${t.accent}, ${t.accent2})`,
    display: 'inline-block',
    animation: `tk-thinking-dot 1.4s ease-in-out ${delay}ms infinite`,
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 0', minHeight: 18 }}>
      <span style={dotStyle(0)} />
      <span style={dotStyle(180)} />
      <span style={dotStyle(360)} />
      <style>{`
        @keyframes tk-thinking-dot {
          0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
          40%           { opacity: 1;    transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}

function Sidebar({ t, convList, currentId, onNewChat, onOpenConv, onDeleteConv, onRefresh }) {
  return (
    <div style={{
      width: 180, flexShrink: 0,
      borderRight: `1px solid ${t.cardBorder}`,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(0,0,0,0.18)',
    }}>
      <button
        onClick={onNewChat}
        style={{
          margin: '8px', padding: '7px 10px',
          background: t.accent, color: '#fff',
          border: 0, borderRadius: 7, cursor: 'pointer',
          fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        New chat
      </button>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px 8px' }}>
        {convList.length === 0 ? (
          <div style={{ fontSize: 10.5, color: t.textMute, padding: '8px 10px', textAlign: 'center' }}>
            No conversations yet.
          </div>
        ) : convList.map((c) => (
          <div
            key={c.id}
            onClick={() => onOpenConv(c.id)}
            style={{
              padding: '7px 8px', margin: '0 4px 3px', borderRadius: 6,
              background: c.id === currentId ? 'rgba(124,92,255,0.18)' : 'transparent',
              border: `1px solid ${c.id === currentId ? 'rgba(124,92,255,0.4)' : 'transparent'}`,
              cursor: 'pointer',
              transition: 'background .12s',
            }}
            onMouseEnter={(e) => { if (c.id !== currentId) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={(e) => { if (c.id !== currentId) e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{
              fontSize: 11, fontWeight: 500, color: t.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {c.voiceMode && <span style={{ color: t.accent2, fontSize: 9 }}>●</span>}
              {c.title}
            </div>
            <div style={{
              fontSize: 9.5, color: t.textMute, marginTop: 2,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}>
              <span>{relTime(c.updatedAt)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm('Delete this conversation?')) onDeleteConv(c.id); }}
                title="Delete"
                style={{
                  background: 'transparent', border: 0, color: t.textMute,
                  cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1,
                }}
              >×</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderModelPicker({ provider, model, modelsByProvider, keysMeta, favorites, onChange, onToggleFavorite }) {
  const [open, setOpen] = useStateCt(false);
  const t = TOKENS.color;
  const ref = useRefCt(null);
  useEffectCt(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const cur = PROVIDER_LABELS[provider];
  const [a, b] = cur.color;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'rgba(0,0,0,0.3)', border: `1px solid ${t.cardBorder}`,
          color: t.text, padding: '5px 9px', borderRadius: 7,
          fontSize: 11, fontWeight: 500, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'inherit',
        }}
      >
        <span style={{
          width: 14, height: 14, borderRadius: 4,
          background: `linear-gradient(135deg, ${a}, ${b})`,
          color: '#fff', fontSize: 8, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{cur.short}</span>
        <span style={{ fontSize: 11 }}>{model}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4,
          background: 'rgba(15,15,22,0.98)',
          border: `1px solid ${t.cardBorderStrong}`,
          borderRadius: 9, boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          minWidth: 260, zIndex: 100, padding: 4,
          maxHeight: 420, overflowY: 'auto',
        }}>
          {Object.keys(PROVIDER_LABELS).map((pid) => {
            const lbl = PROVIDER_LABELS[pid];
            const ok = keysMeta[pid]?.present;
            const all = modelsByProvider[pid] || [];
            const favSet = new Set((favorites && favorites[pid]) || []);
            // Favorites preserve user-chosen order; non-favorites keep curated order.
            const favList = ((favorites && favorites[pid]) || [])
              .map((id) => all.find((m) => m.id === id))
              .filter(Boolean);
            const restList = all.filter((m) => !favSet.has(m.id));
            return (
              <div key={pid}>
                <div style={{
                  fontSize: 9.5, color: ok ? t.textDim : t.textMute,
                  letterSpacing: '0.05em', textTransform: 'uppercase',
                  padding: '6px 8px 3px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  {lbl.name}
                  {!ok && <span style={{ color: t.amber, textTransform: 'none', letterSpacing: 0 }}>· no key</span>}
                </div>
                {favList.length > 0 && (
                  <React.Fragment>
                    {favList.map((m) => (
                      <ModelPickerRow
                        key={`f-${m.id}`} t={t} model={m}
                        selected={pid === provider && m.id === model}
                        favorited disabled={!ok}
                        onPick={() => { onChange(pid, m.id); setOpen(false); }}
                        onToggleFavorite={() => onToggleFavorite && onToggleFavorite(pid, m.id)}
                      />
                    ))}
                    {restList.length > 0 && (
                      <div style={{
                        margin: '4px 8px', height: 1,
                        background: t.cardBorder,
                      }} />
                    )}
                  </React.Fragment>
                )}
                {restList.map((m) => (
                  <ModelPickerRow
                    key={m.id} t={t} model={m}
                    selected={pid === provider && m.id === model}
                    disabled={!ok}
                    onPick={() => { onChange(pid, m.id); setOpen(false); }}
                    onToggleFavorite={() => onToggleFavorite && onToggleFavorite(pid, m.id)}
                  />
                ))}
              </div>
            );
          })}
          <div style={{
            fontSize: 9, color: t.textMute, padding: '6px 10px 4px',
            borderTop: `1px solid ${t.cardBorder}`, marginTop: 4,
          }}>
            Click ★ to favorite — pinned models appear first across pickers.
          </div>
        </div>
      )}
    </div>
  );
}

// Single row inside the model picker — handles its own hover state so the star
// can light up independent of the main pick action.
function ModelPickerRow({ t, model, selected, disabled, favorited, onPick, onToggleFavorite }) {
  const [hov, setHov] = useStateCt(false);
  const m = model;
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'stretch',
        background: selected ? 'rgba(124,92,255,0.18)' : (hov ? 'rgba(255,255,255,0.04)' : 'transparent'),
        borderRadius: 5, opacity: disabled ? 0.5 : 1,
      }}
    >
      <button
        onClick={onPick}
        disabled={disabled}
        style={{
          flex: 1, textAlign: 'left',
          background: 'transparent', border: 0, padding: '6px 6px 6px 10px',
          color: disabled ? t.textMute : t.text,
          fontSize: 11, cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'inherit', display: 'block', minWidth: 0,
        }}
      >
        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
        </div>
        <div style={{ fontSize: 9.5, color: t.textMute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: TOKENS.type.mono }}>{m.id}</span>
          {m.desc && <span> · {m.desc}</span>}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite && onToggleFavorite(); }}
        title={favorited ? 'Unfavorite' : 'Favorite'}
        aria-label={favorited ? 'Unfavorite model' : 'Favorite model'}
        style={{
          background: 'transparent', border: 0, cursor: 'pointer',
          padding: '0 10px', color: favorited ? '#ffd772' : (hov ? t.textDim : 'transparent'),
          transition: 'color .12s', display: 'inline-flex', alignItems: 'center',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15 8.5 22 9.3 17 14.1 18.2 21 12 17.7 5.8 21 7 14.1 2 9.3 9 8.5 12 2"/>
        </svg>
      </button>
    </div>
  );
}

function InlineKeys({ t, keysMeta, onChange, onClose, onOpenExternal }) {
  const [drafts, setDrafts] = useStateCt({});
  const [saving, setSaving] = useStateCt({});
  const HELPS = {
    openai:    { label: 'OpenAI',    placeholder: 'sk-…',     link: 'https://platform.openai.com/api-keys',          help: 'Regular API key (sk-…). Used for chat, transcription, and TTS.' },
    anthropic: { label: 'Anthropic', placeholder: 'sk-ant-…', link: 'https://console.anthropic.com/settings/keys',   help: 'Regular API key (sk-ant-api03-…). Distinct from the admin key used for usage tracking.' },
    google:    { label: 'Google AI', placeholder: 'AIza…',    link: 'https://aistudio.google.com/apikey',            help: 'Google AI Studio API key. Used for Gemini chat.' },
  };
  const save = async (p) => {
    const v = (drafts[p] || '').trim();
    if (!v) return;
    setSaving((s) => ({ ...s, [p]: true }));
    try {
      await window.api.chatSetKey(p, v);
      setDrafts((d) => ({ ...d, [p]: '' }));
      onChange();
    } finally {
      setSaving((s) => ({ ...s, [p]: false }));
    }
  };
  return (
    <div style={{
      padding: '10px 12px', background: 'rgba(232,164,65,0.05)',
      borderBottom: `1px solid ${t.cardBorder}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600 }}>Chat API keys</div>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, color: t.textDim, cursor: 'pointer', fontSize: 14 }}>×</button>
      </div>
      <div style={{ fontSize: 10, color: t.textDim, marginBottom: 8, lineHeight: 1.5 }}>
        Stored in your macOS keychain. Separate from the admin keys used for usage tracking — chat needs regular API keys.
        <br />
        <strong style={{ color: t.text }}>All chat &amp; voice usage bills directly to your provider account.</strong> Tokenly never proxies your requests; the Max + AI subscription covers the app, not the API spend.
      </div>
      {['openai', 'anthropic', 'google'].map((p) => {
        const m = HELPS[p];
        const meta = keysMeta[p];
        const v = drafts[p] || '';
        return (
          <div key={p} style={{ marginBottom: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <div style={{ fontSize: 11, fontWeight: 500 }}>{m.label}</div>
              {meta?.present
                ? <span style={{ fontSize: 9.5, color: t.green, fontFamily: TOKENS.type.mono }}>•••• {meta.tail}</span>
                : <a onClick={() => onOpenExternal && onOpenExternal(m.link)} style={{ fontSize: 9.5, color: t.accent2, cursor: 'pointer' }}>Get key →</a>}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="password"
                value={v}
                onChange={(e) => setDrafts({ ...drafts, [p]: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') save(p); }}
                placeholder={meta?.present ? 'Replace key…' : m.placeholder}
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1, background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${t.cardBorder}`, color: t.text,
                  padding: '5px 8px', borderRadius: 6,
                  fontSize: 10.5, fontFamily: TOKENS.type.mono, outline: 'none',
                }}
              />
              <button
                onClick={() => save(p)}
                disabled={saving[p] || !v}
                style={{
                  background: t.accent, color: '#fff', border: 0,
                  padding: '0 10px', borderRadius: 6, fontSize: 10.5,
                  fontWeight: 500, cursor: saving[p] || !v ? 'default' : 'pointer',
                  opacity: saving[p] || !v ? 0.5 : 1, fontFamily: 'inherit',
                }}
              >{saving[p] ? '…' : 'Save'}</button>
              {meta?.present && (
                <button
                  onClick={async () => { await window.api.chatSetKey(p, ''); onChange(); }}
                  style={{
                    background: 'rgba(248,113,113,0.15)', color: t.red,
                    border: `1px solid rgba(248,113,113,0.3)`,
                    padding: '0 8px', borderRadius: 6, fontSize: 10.5,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >Remove</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ t, provider, hasKey, onAddKey, onSuggestion }) {
  const SUGS = [
    'Explain a tricky concept simply',
    'Draft a commit message for these changes',
    'Review this code for bugs',
    'Brainstorm ideas for…',
  ];
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: '40px 20px', gap: 10,
      minHeight: 200,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 11,
        background: `linear-gradient(135deg, ${provider.color[0]}, ${provider.color[1]})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em',
      }}>{provider.short}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
        Chat with {provider.name}
      </div>
      <div style={{ fontSize: 11, color: t.textDim, maxWidth: 320, lineHeight: 1.5 }}>
        {hasKey
          ? `Your messages go straight to ${provider.name}'s API. Costs flow into Tokenly.`
          : `Add a ${provider.name} API key to start.`}
      </div>
      {!hasKey ? (
        <button
          onClick={onAddKey}
          style={{
            marginTop: 6, padding: '8px 14px', borderRadius: 8,
            background: t.accent, color: '#fff', fontWeight: 600,
            fontSize: 11.5, border: 0, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >Add API key</button>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8, maxWidth: 380 }}>
          {SUGS.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              style={{
                background: t.card, border: `1px solid ${t.cardBorder}`,
                color: t.textDim, padding: '5px 10px', borderRadius: 14,
                fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ t, msg, onOpenExternal }) {
  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';
  // Thinking state = assistant message is streaming but no content has arrived
  // yet. Surfaces a clear "we're working on it" indicator instead of the
  // empty bubble that previously made the UI feel dead between send and first
  // token. Once tokens start flowing, the dots drop off automatically.
  const isThinking = isAssistant && msg.streaming && !msg.content;
  return (
    <div style={{
      marginBottom: 12,
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
        fontSize: 9.5, color: t.textMute, letterSpacing: '0.04em', textTransform: 'uppercase',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        {isUser ? 'You' : (msg.provider ? PROVIDER_LABELS[msg.provider]?.name : 'Assistant')}
        {msg.streaming && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: TOKENS.color.accent,
            animation: 'llmpulse 1.2s ease-in-out infinite',
          }} />
        )}
      </div>
      <div style={{
        background: isUser ? 'rgba(124,92,255,0.10)' : t.card,
        border: `1px solid ${isUser ? 'rgba(124,92,255,0.25)' : t.cardBorder}`,
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        padding: '10px 12px',
        userSelect: 'text',
        maxWidth: '82%',
      }}>
        {msg.error ? (
          <div style={{ fontSize: 11, color: t.red, fontFamily: TOKENS.type.mono }}>
            Error: {msg.error}
          </div>
        ) : isThinking ? (
          <ThinkingDots />
        ) : (
          isAssistant
            ? chatRenderMarkdown(msg.content || '', t, onOpenExternal)
            : <div style={{ fontSize: 12, color: t.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{msg.content}</div>
        )}
        {Array.isArray(msg.citations) && msg.citations.length > 0 && (
          <div style={{
            marginTop: 8, paddingTop: 8,
            borderTop: `1px dashed ${t.cardBorder}`,
            display: 'flex', flexWrap: 'wrap', gap: 4,
          }}>
            <span style={{ fontSize: 9.5, color: t.textMute, letterSpacing: '0.04em', textTransform: 'uppercase', alignSelf: 'center', marginRight: 2 }}>Sources</span>
            {msg.citations.slice(0, 8).map((c, j) => (
              <a
                key={j}
                onClick={(e) => { e.preventDefault(); onOpenExternal && onOpenExternal(c.url); }}
                title={c.url}
                style={{
                  fontSize: 10, color: TOKENS.color.accent2,
                  background: 'rgba(34,211,238,0.08)',
                  border: `1px solid rgba(34,211,238,0.25)`,
                  padding: '2px 6px', borderRadius: 4,
                  textDecoration: 'none', cursor: 'pointer',
                  maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  display: 'inline-block',
                }}
              >{c.title || c.url}</a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ t, draft, setDraft, streaming, liveTranscribing, webSearch, onToggleWebSearch, onSend, onCancel, onToggleMic, onOpenVoice, composerRef, providerLabel, modelLabel }) {
  const taRef = useRefCt(null);
  useEffectCt(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [draft]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div ref={composerRef} style={{
      padding: '8px 10px 10px',
      borderTop: `1px solid ${t.cardBorder}`,
      background: 'rgba(0,0,0,0.2)',
      flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 6,
        background: 'rgba(0,0,0,0.4)',
        border: `1px solid ${t.cardBorder}`, borderRadius: 10,
        padding: '6px 6px 6px 10px',
      }}>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={liveTranscribing ? 'Listening — speak, your words appear here…' : `Message ${providerLabel}…`}
          rows={1}
          style={{
            flex: 1, resize: 'none',
            background: 'transparent', color: t.text,
            border: 0, outline: 'none',
            padding: '6px 0',
            fontSize: 12.5, fontFamily: 'inherit',
            lineHeight: 1.45, maxHeight: 200, minHeight: 22,
          }}
        />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            onClick={onToggleWebSearch}
            title={webSearch ? 'Web search ON — model will search the web for fresh info' : 'Enable web search for this conversation'}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: webSearch ? 'rgba(34,211,238,0.18)' : t.card,
              border: `1px solid ${webSearch ? 'rgba(34,211,238,0.45)' : t.cardBorder}`,
              color: webSearch ? t.accent2 : t.textDim,
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              transition: 'background .12s, color .12s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M3 12h18"/>
              <path d="M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18"/>
            </svg>
          </button>
          <button
            onClick={onToggleMic}
            disabled={streaming}
            title={liveTranscribing ? 'Stop dictating · ⌘⇧Space' : 'Dictate · ⌘⇧Space anywhere'}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: liveTranscribing ? 'rgba(248,113,113,0.22)' : t.card,
              border: `1px solid ${liveTranscribing ? 'rgba(248,113,113,0.5)' : t.cardBorder}`,
              color: liveTranscribing ? t.red : t.textDim,
              cursor: streaming ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              animation: liveTranscribing ? 'llmpulse 1.6s ease-in-out infinite' : 'none',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 11a7 7 0 0 1-14 0"/>
              <path d="M12 18v4"/>
            </svg>
          </button>
          {/* Voice AI shortcut — opens the standalone voice window. Same
              effect as ⌘⇧V from anywhere in macOS. Surfaced as a button so
              users discover it without needing to know the hotkey. */}
          <button
            onClick={() => onOpenVoice && onOpenVoice()}
            disabled={streaming}
            title="Voice AI · ⌘⇧V — hands-free conversation"
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'rgba(34,211,238,0.10)',
              border: `1px solid rgba(34,211,238,0.30)`,
              color: t.accent2,
              cursor: streaming ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              opacity: streaming ? 0.5 : 1,
              transition: 'background .12s, color .12s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12c0-3 2-5 5-5h8c3 0 5 2 5 5s-2 5-5 5h-2l-4 3v-3H8c-3 0-5-2-5-5z"/>
            </svg>
          </button>
          {streaming ? (
            <button
              onClick={onCancel}
              title="Stop"
              style={{
                background: 'rgba(248,113,113,0.18)', color: t.red,
                border: `1px solid rgba(248,113,113,0.4)`,
                width: 30, height: 30, borderRadius: 8,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!draft.trim()}
              title="Send (Enter)"
              style={{
                background: draft.trim() ? t.accent : t.card,
                color: draft.trim() ? '#fff' : t.textMute,
                border: `1px solid ${draft.trim() ? t.accent : t.cardBorder}`,
                width: 30, height: 30, borderRadius: 8,
                cursor: draft.trim() ? 'pointer' : 'default',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                transition: 'background .12s, color .12s',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 4, fontSize: 9.5, color: t.textMute,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span>
          Enter to send · Shift+Enter newline · ⌘⇧Space dictate · ⌘⇧V voice AI
          {webSearch && <span style={{ color: t.accent2, marginLeft: 6 }}>· web ON</span>}
        </span>
        <span style={{ fontFamily: TOKENS.type.mono }}>{modelLabel}</span>
      </div>
    </div>
  );
}

