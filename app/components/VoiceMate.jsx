// VoiceMate — standalone hands-free voice AI, opens via ⌘⇧V.
// Greets on mount, then runs an always-on VAD loop: speak → 1.5s of silence
// ends the turn → Whisper STT → LLM (streaming) → OpenAI TTS → re-arm mic.
// Closing the window saves the transcript into Tokenly chat history.
const { useState: useStateVm, useEffect: useEffectVm, useRef: useRefVm, useCallback: useCallbackVm } = React;

const VAD_RMS_THRESHOLD = 0.018;       // RMS floor that counts as "speech"
const VAD_MIN_SPEECH_MS = 300;         // Need >= this long of speech before silence-end can fire
const VAD_SILENCE_END_MS = 2600;       // Trailing silence that ends a turn — generous so natural mid-sentence pauses don't truncate
const MIN_SEGMENT_MS = 500;            // Drop ultra-short captures (false triggers)
const MAX_SEGMENT_MS = 60 * 1000;      // Hard cap so a stuck mic doesn't blow up Whisper

function newVmId() {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function VoiceMate() {
  const t = (window.TOKENS && TOKENS.color) || { text: '#ecedf3', textDim: '#8a8c99', textMute: '#5d6070', accent: '#7c5cff', accent2: '#22d3ee', green: '#34d399', red: '#f87171', amber: '#fbbf24' };

  // Conversation state.
  const convIdRef = useRefVm(newVmId());
  const [messages, setMessages] = useStateVm([]);
  const messagesRef = useRefVm(messages);
  useEffectVm(() => { messagesRef.current = messages; }, [messages]);

  // Top-level FSM: 'greeting' → 'listening' → 'thinking' → 'speaking' → 'listening' …
  // 'error' can be entered from any state; user can click End at any time.
  const [phase, setPhase] = useStateVm('greeting');
  const phaseRef = useRefVm(phase);
  useEffectVm(() => { phaseRef.current = phase; }, [phase]);

  const [error, setError] = useStateVm(null);
  const [model, setModel] = useStateVm('gpt-4o-mini');
  const [provider, setProvider] = useStateVm('openai');
  const [voice, setVoice] = useStateVm('alloy');
  const [hasOpenaiKey, setHasOpenaiKey] = useStateVm(true);
  const [level, setLevel] = useStateVm(0); // 0..1 — for orb pulse intensity

  // Model picker UI state.
  const [modelsByProvider, setModelsByProvider] = useStateVm({ openai: [], anthropic: [], google: [] });
  const [keysMeta, setKeysMeta] = useStateVm({ openai: { present: false }, anthropic: { present: false }, google: { present: false } });
  const [favoriteModels, setFavoriteModels] = useStateVm({ openai: [], anthropic: [], google: [] });
  const [pickerOpen, setPickerOpen] = useStateVm(false);

  // Long-term memory: a compact summary of past conversations injected into
  // the system prompt so the model stays aware of what the user has been
  // working on across sessions.
  const memoryRef = useRefVm('');
  // Compact snapshot of current Tokenly usage data — refreshed on mount and
  // at the start of every assistant turn so questions like "what did I spend
  // on Claude this week?" get answered from real numbers, not guesses.
  const usageSnapshotRef = useRefVm(null);

  // Running cost of THIS conversation — STT + LLM + TTS rolled up. All three
  // bill directly to the user's API account, not Tokenly. The footer shows
  // a live total + a breakdown so the user can see what voice is costing
  // them in real time.
  const [voiceCosts, setVoiceCosts] = useStateVm({ stt: 0, llm: 0, tts: 0, total: 0 });
  const voiceCostsRef = useRefVm({ stt: 0, llm: 0, tts: 0, total: 0 });
  function addCost(slot, amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const next = { ...voiceCostsRef.current };
    next[slot] = (next[slot] || 0) + amount;
    next.total = (next.stt || 0) + (next.llm || 0) + (next.tts || 0);
    voiceCostsRef.current = next;
    setVoiceCosts(next);
  }

  const stopRef = useRefVm(false); // user pressed End — short-circuit any in-flight loop step
  const audioElRef = useRefVm(null);
  const streamIdRef = useRefVm(null);

  // ------- One-shot: load prefs + memory + greet ---------------------------
  useEffectVm(() => {
    let cancelled = false;
    (async () => {
      try {
        const [prefs, km, models, convs] = await Promise.all([
          window.api.chatGetPrefs(),
          window.api.chatKeysMeta(),
          window.api.chatListModels(),
          window.api.chatListConversations(),
        ]);
        if (cancelled) return;
        if (prefs) {
          if (prefs.voice)             setVoice(prefs.voice);
          if (prefs.favoriteModels)    setFavoriteModels(prefs.favoriteModels);
          if (prefs.primary?.provider) {
            const prov = prefs.primary.provider;
            // First favorite for the primary provider takes precedence over
            // the curated default — same affordance as the chat picker.
            const favForProv = prefs.favoriteModels?.[prov] || [];
            const initialModel = favForProv[0] || prefs.primary.model;
            setProvider(prov);
            if (initialModel) setModel(initialModel);
          }
        }
        setKeysMeta(km || {});
        setModelsByProvider(models || {});
        setHasOpenaiKey(!!km?.openai?.present);
        if (!km?.openai?.present) {
          setPhase('error');
          setError('Add an OpenAI API key in Tokenly Chat to use voice (Whisper + TTS).');
          return;
        }
        memoryRef.current = await buildMemoryBlock(convs || []);
        try { usageSnapshotRef.current = await window.api.chatUsageSnapshot({ days: 30 }); }
        catch { usageSnapshotRef.current = null; }
      } catch (err) {
        if (!cancelled) { setPhase('error'); setError(err?.message || String(err)); }
        return;
      }
      if (cancelled) return;
      // Speak the greeting, then start listening.
      const greeting = "Hi, I'm Tokenly. How can I help you?";
      setMessages([{ role: 'assistant', content: greeting, timestamp: Date.now() }]);
      await speak(greeting, voiceRefValue());
      if (!stopRef.current) startListening();
    })();
    return () => { cancelled = true; stopRef.current = true; cleanupAudio(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build a compact "what we've talked about" digest from prior conversations.
  // We pull the most recent 30, lightly summarize each by title + last
  // assistant turn snippet, and bound the total at ~6000 chars so the system
  // prompt stays sane regardless of how much history exists.
  async function buildMemoryBlock(convList) {
    const recent = (convList || []).slice(0, 30);
    if (!recent.length) return '';
    const lines = [];
    for (const c of recent) {
      try {
        const full = await window.api.chatLoadConversation(c.id);
        if (!full) continue;
        const lastAssistant = [...(full.messages || [])].reverse().find((m) => m.role === 'assistant' && m.content);
        const snippet = lastAssistant ? String(lastAssistant.content).replace(/```[\s\S]*?```/g, ' [code] ').replace(/\s+/g, ' ').trim().slice(0, 220) : '';
        const dateStr = new Date(c.updatedAt || c.createdAt || Date.now()).toISOString().slice(0, 10);
        lines.push(`- ${dateStr} · ${c.title || 'Untitled'}${snippet ? ` — ${snippet}` : ''}`);
      } catch {}
    }
    let block = lines.join('\n');
    if (block.length > 6000) block = block.slice(0, 6000) + '\n…';
    return block;
  }

  // The voice setting may load from prefs after greeting starts; capture
  // whatever's current at speak-time via this getter rather than closing
  // over a stale value.
  const voiceVarRef = useRefVm(voice);
  useEffectVm(() => { voiceVarRef.current = voice; }, [voice]);
  function voiceRefValue() { return voiceVarRef.current; }

  // ------- Audio resources -------------------------------------------------
  const audioCtxRef = useRefVm(null);
  const micStreamRef = useRefVm(null);
  const recRef = useRefVm(null);
  const analyserRef = useRefVm(null);
  const rafRef = useRefVm(0);
  const cleanupAudio = useCallbackVm(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (recRef.current) {
      try { recRef.current.stop(); } catch {}
      recRef.current = null;
    }
    if (micStreamRef.current) {
      for (const tr of micStreamRef.current.getTracks()) try { tr.stop(); } catch {}
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    if (audioElRef.current) { try { audioElRef.current.pause(); } catch {} }
  }, []);

  // ------- TTS: speak a string and resolve when playback ends --------------
  async function speak(text, voiceName) {
    setPhase('speaking');
    try {
      const res = await window.api.chatTts({ text, voice: voiceName || 'alloy' });
      if (!res.ok) throw new Error(res.error || 'TTS failed');
      // OpenAI tts-1 bills $0.015 per 1K input characters. Estimate from the
      // text we just sent (capped at 4096 by main.js to match OpenAI's limit).
      const chars = Math.min(4096, (text || '').length);
      addCost('tts', (chars / 1000) * 0.015);
      const bytes = base64ToBytes(res.audioB64);
      const blob = new Blob([bytes], { type: res.mime || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const a = audioElRef.current || (audioElRef.current = new Audio());
      a.src = url;
      await new Promise((resolve) => {
        const cleanup = () => { URL.revokeObjectURL(url); a.onended = a.onerror = null; resolve(); };
        a.onended = cleanup;
        a.onerror = cleanup;
        a.play().catch(cleanup);
      });
    } catch (err) {
      // Don't kill the loop if a single TTS call fails — log and move on.
      console.warn('[voicemate] TTS error:', err);
    }
  }

  // ------- Listening: VAD-bounded recording --------------------------------
  const startListening = useCallbackVm(async () => {
    if (stopRef.current) return;
    setPhase('listening');
    setLevel(0);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      setPhase('error');
      setError('Microphone access was denied. Open System Settings → Privacy → Microphone to allow Tokenly.');
      return;
    }
    micStreamRef.current = stream;

    // Analyser for VAD level monitoring.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    src.connect(analyser);
    analyserRef.current = analyser;
    const buf = new Uint8Array(analyser.fftSize);

    // Recorder (we'll stop it the moment VAD says "done").
    const mr = new MediaRecorder(stream, { mimeType: pickMime() });
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      try { for (const tr of stream.getTracks()) tr.stop(); } catch {}
      micStreamRef.current = null;
      try { ctx.close(); } catch {}
      audioCtxRef.current = null;
      analyserRef.current = null;
      const elapsed = Date.now() - startedAt;
      const blob = chunks.length ? new Blob(chunks, { type: mr.mimeType }) : null;
      // Re-arm if we never heard speech, or if the segment was clearly too
      // short to be a real utterance.
      if (!everSpoke || elapsed < MIN_SEGMENT_MS || !blob) {
        if (!stopRef.current) startListening();
        return;
      }
      // Whisper-1 bills at $0.006/minute of audio (rounded up to the second).
      const seconds = elapsed / 1000;
      addCost('stt', (seconds / 60) * 0.006);
      handleUtterance(blob, mr.mimeType);
    };
    recRef.current = mr;
    mr.start();
    const startedAt = Date.now();
    let everSpoke = false;
    let lastLoudAt = 0;
    let firstLoudAt = 0;

    const tick = () => {
      if (stopRef.current || phaseRef.current !== 'listening' || !analyserRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        return;
      }
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      setLevel(Math.min(1, rms * 8));
      const now = Date.now();
      const loud = rms > VAD_RMS_THRESHOLD;
      if (loud) {
        if (!firstLoudAt) firstLoudAt = now;
        if (now - firstLoudAt >= VAD_MIN_SPEECH_MS) everSpoke = true;
        lastLoudAt = now;
      }
      const elapsed = now - startedAt;
      const trailingSilence = lastLoudAt ? (now - lastLoudAt) : elapsed;
      const shouldEnd =
        elapsed >= MAX_SEGMENT_MS ||
        (everSpoke && trailingSilence >= VAD_SILENCE_END_MS);
      if (shouldEnd) {
        if (mr.state === 'recording') { try { mr.stop(); } catch {} }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  function pickMime() {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const c of cands) try { if (MediaRecorder.isTypeSupported(c)) return c; } catch {}
    return '';
  }

  // ------- Pipeline: STT → LLM → TTS, then loop back to listening ----------
  const handleUtterance = useCallbackVm(async (blob, mime) => {
    if (stopRef.current) return;
    setPhase('thinking');
    setLevel(0);

    // Whisper.
    let userText = '';
    try {
      const ab = await blob.arrayBuffer();
      const b64 = arrayBufferToBase64(ab);
      const res = await window.api.chatTranscribe({ audioB64: b64, mime, filename: 'speech.webm' });
      if (!res.ok) throw new Error(res.error || 'Transcription failed');
      userText = (res.text || '').trim();
    } catch (err) {
      console.warn('[voicemate] STT error:', err);
      // Re-listen rather than dying on one bad capture.
      if (!stopRef.current) startListening();
      return;
    }
    if (!userText) {
      if (!stopRef.current) startListening();
      return;
    }
    if (stopRef.current) return;

    setMessages((m) => m.concat({ role: 'user', content: userText, timestamp: Date.now() }));

    // Stream LLM reply.
    const sid = 's_vm_' + newVmId();
    streamIdRef.current = sid;
    let assistantText = '';
    setMessages((m) => m.concat({ role: 'assistant', content: '', timestamp: Date.now(), streaming: true, model, provider }));

    const outgoing = messagesRef.current
      .filter((mm) => mm.role === 'user' || mm.role === 'assistant')
      .map((mm) => ({ role: mm.role, content: mm.content || '' }))
      .concat([{ role: 'user', content: userText }]);

    let resolveStream;
    const streamDone = new Promise((r) => { resolveStream = r; });

    if (!handleUtterance.listenerInstalled) {
      // One-time listener registration — guarded by a property on the
      // function itself since useEffect runs once for VoiceMate's lifetime.
      handleUtterance.listenerInstalled = true;
    }

    // Subscribe per call. ipcRenderer.on doesn't dedupe, so we rely on a
    // streamId match to filter out events that aren't ours.
    const handler = (evt) => {
      if (!evt || evt.streamId !== streamIdRef.current) return;
      if (evt.type === 'delta') {
        assistantText += evt.text || '';
        setMessages((m) => {
          const arr = m.slice();
          const last = arr[arr.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            arr[arr.length - 1] = { ...last, content: assistantText };
          }
          return arr;
        });
      } else if (evt.type === 'done' || evt.type === 'aborted') {
        setMessages((m) => {
          const arr = m.slice();
          const last = arr[arr.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            arr[arr.length - 1] = { ...last, content: evt.text || assistantText, streaming: false, usage: evt.usage || null, cost: evt.cost || 0 };
          }
          return arr;
        });
        // LLM cost arrives in the stream done event (already includes the
        // cached-input multiplier). Direct billing — main.js doesn't proxy.
        if (evt.cost) addCost('llm', evt.cost);
        resolveStream();
      } else if (evt.type === 'error') {
        setMessages((m) => {
          const arr = m.slice();
          const last = arr[arr.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            arr[arr.length - 1] = { ...last, error: evt.message, streaming: false };
          }
          return arr;
        });
        resolveStream();
      }
    };
    if (window.api?.onChatStreamEvent) window.api.onChatStreamEvent(handler);

    // Refresh the usage snapshot so longer voice sessions pick up data
    // refreshes (the Tokenly main view polls every 60s; we piggyback).
    try { usageSnapshotRef.current = await window.api.chatUsageSnapshot({ days: 30 }); } catch {}

    const baseSystem = 'You are a friendly voice assistant for Tokenly, a Mac AI-spend monitor. Keep responses concise (1-3 sentences) and conversational, since the user will hear you spoken aloud rather than read you.';
    const memory = memoryRef.current;
    const usage = usageSnapshotRef.current;
    let system = baseSystem;
    if (usage) {
      // Compact JSON dump — typically ~2-4KB. Includes per-provider totals,
      // top models, today's burn, and quota %s. Voice replies should cite
      // these numbers concretely rather than approximating.
      system += `\n\nLIVE TOKENLY USAGE DATA (the user's real numbers as of ${usage.generatedAt}, last ${usage.windowDays} days):\n${JSON.stringify(usage)}\n\nIMPORTANT TOKEN SCHEMA — the user's "total tokens" question must include cache reads. Each provider's tokens object has these fields:\n  • input         — fresh input tokens\n  • output        — generated output tokens\n  • cache_write   — tokens written to prompt cache (billed at input rate)\n  • cache_read    — tokens served from prompt cache (billed at 0.1× input)\n  • reasoning     — internal reasoning tokens (counted as output for billing)\n  • total         — canonical sum of all of the above. ALWAYS USE THIS WHEN ANSWERING "TOTAL TOKEN USE" QUESTIONS.\n\nDo NOT compute total as input + output. That excludes cache, which is often the biggest component (a heavy prompt-caching user can have 100x more cache_read than input). When the user asks "how many tokens have I used", quote tokens.total. When they ask "how much input vs output", quote those separately. The same rule applies to totals.total at the top level for "across all providers".\n\nWhen the user asks about their token usage, costs, top models, quotas, or trends — use this data to answer with real numbers. Mention dollar amounts in plain English ("$12.40" → "twelve dollars and forty cents") since the response is spoken. If a value isn't in this snapshot, say you don't have that data rather than making one up.`;
    }
    if (memory) {
      system += `\n\nPAST CONVERSATIONS — what the user has been working on across past Tokenly conversations:\n${memory}\n\nIf the user references something earlier or from past conversations, use this context. Do not bring it up unprompted.`;
    }

    try {
      await window.api.chatStream({
        streamId: sid,
        provider, model,
        messages: outgoing,
        system,
      });
    } catch (err) {
      console.warn('[voicemate] stream invoke failed:', err);
    }
    await streamDone;
    if (stopRef.current) return;

    // Speak the reply.
    if (assistantText.trim()) {
      await speak(stripMarkdownForTTS(assistantText), voiceRefValue());
    }
    if (stopRef.current) return;

    // Loop.
    startListening();
  }, [provider, model]);

  // ------- End conversation: save + close ----------------------------------
  const onEnd = useCallbackVm(async () => {
    if (stopRef.current) return;
    stopRef.current = true;
    cleanupAudio();
    if (streamIdRef.current) { try { window.api.chatCancel(streamIdRef.current); } catch {} }
    setPhase('saving');

    const m = messagesRef.current;
    const hasUserTurn = m.some((x) => x.role === 'user');
    if (hasUserTurn) {
      // Title from first user message; fall back to "Voice chat".
      const firstUser = m.find((x) => x.role === 'user');
      const title = firstUser ? String(firstUser.content || '').replace(/\s+/g, ' ').trim().slice(0, 60) : 'Voice chat';
      const totals = m.reduce((acc, x) => {
        if (x.usage) {
          acc.input += x.usage.input || 0;
          acc.output += x.usage.output || 0;
        }
        if (x.cost) acc.cost += x.cost;
        return acc;
      }, { input: 0, output: 0, cost: 0 });
      // Voice-specific costs (STT + TTS) live in their own bucket so the
      // history view can show the full picture per conversation.
      const voiceCostBreakdown = voiceCostsRef.current || { stt: 0, llm: 0, tts: 0, total: 0 };
      const conv = {
        id: convIdRef.current,
        title: title || 'Voice chat',
        provider, model,
        createdAt: m[0]?.timestamp || Date.now(),
        updatedAt: Date.now(),
        messages: m,
        totals: { ...totals, voiceCost: voiceCostBreakdown.total, voiceCostBreakdown },
        voiceMode: true,
      };
      try { await window.api.chatSaveConversation(conv); } catch (err) { console.warn('[voicemate] save failed:', err); }
    }
    try { await window.api.voiceMateClose(); } catch {}
  }, [cleanupAudio, provider, model]);

  // Save on window-unload as a safety net (e.g. user clicks the close button
  // on the window chrome instead of the End button).
  useEffectVm(() => {
    const onBeforeUnload = () => { if (!stopRef.current) onEnd(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [onEnd]);

  // ------- Render ----------------------------------------------------------
  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', flexDirection: 'column',
      borderRadius: 22,
      overflow: 'hidden',
      background: `
        radial-gradient(140% 60% at 50% 0%, rgba(124, 92, 255, 0.30), transparent 60%),
        radial-gradient(120% 60% at 50% 100%, rgba(34, 211, 238, 0.20), transparent 60%),
        linear-gradient(180deg, #0e0e16 0%, #06060c 100%)
      `,
      border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
      WebkitFontSmoothing: 'antialiased',
      color: t.text,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      userSelect: 'none',
    }}>
      {/* Drag handle */}
      <div style={{
        height: 28, WebkitAppRegion: 'drag',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.18)',
        }} />
        <button
          onClick={onEnd}
          aria-label="Close"
          title="End conversation"
          style={{
            position: 'absolute', top: 8, right: 10,
            width: 22, height: 22, borderRadius: 11,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            color: t.textDim, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            WebkitAppRegion: 'no-drag', fontFamily: 'inherit',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </div>

      {/* Orb */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16, padding: 16,
      }}>
        <Orb phase={phase} level={level} t={t} />
        <PhaseText phase={phase} error={error} t={t} />
      </div>

      {/* Last lines of transcript — gives the user something to scan back to */}
      <div style={{
        padding: '0 18px 6px', minHeight: 44, maxHeight: 80,
        overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 3,
      }}>
        {messages.slice(-2).map((m, i) => (
          <div key={i} style={{
            fontSize: 11, color: m.role === 'user' ? t.text : t.textDim,
            opacity: i === 0 && messages.length > 1 ? 0.55 : 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <span style={{ color: t.textMute, marginRight: 6 }}>{m.role === 'user' ? 'You' : 'AI'}</span>
            {m.content || (m.streaming ? '…' : '')}
          </div>
        ))}
      </div>

      {/* Running cost — voice (Whisper + TTS) + LLM all bill direct to the
          user's API account. Shown live so it's never a surprise. */}
      <div style={{
        padding: '4px 18px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 6, flexShrink: 0,
      }}>
        <div
          title={
            `Voice (Whisper STT + OpenAI TTS): $${voiceCosts.stt.toFixed(4)} + $${voiceCosts.tts.toFixed(4)}\n` +
            `LLM (${provider} · ${model}): $${voiceCosts.llm.toFixed(4)}\n\n` +
            `All charges bill directly to your provider API account.`
          }
          style={{
            fontSize: 9.5, color: t.textMute, letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums', cursor: 'help',
          }}
        >
          THIS CONVERSATION · {voiceCosts.total < 0.01 ? '< $0.01' : '$' + voiceCosts.total.toFixed(2)}
        </div>
        <div style={{ fontSize: 9, color: t.textMute, letterSpacing: '0.04em' }}>
          Billed to your API
        </div>
      </div>

      {/* Footer / model picker / End button */}
      <div style={{
        padding: '8px 16px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, flexShrink: 0, position: 'relative',
      }}>
        <button
          onClick={() => setPickerOpen((o) => !o)}
          title="Change model"
          style={{
            background: 'rgba(255,255,255,0.05)', color: t.textDim,
            border: '1px solid rgba(255,255,255,0.10)',
            padding: '5px 9px', borderRadius: 7,
            fontSize: 10, letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
            WebkitAppRegion: 'no-drag',
          }}
        >
          <span style={{ textTransform: 'uppercase' }}>{provider}</span> · {model}
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        {pickerOpen && (
          <ModelPickerPopover
            t={t}
            provider={provider}
            model={model}
            modelsByProvider={modelsByProvider}
            keysMeta={keysMeta}
            favorites={favoriteModels}
            onPick={(p, m) => { setProvider(p); setModel(m); setPickerOpen(false); }}
            onToggleFavorite={async (p, mid) => {
              const next = await window.api.chatToggleFavoriteModel({ provider: p, model: mid });
              if (next) setFavoriteModels(next);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
        <button
          onClick={onEnd}
          style={{
            background: 'rgba(248,113,113,0.18)', color: t.red,
            border: '1px solid rgba(248,113,113,0.4)',
            padding: '7px 14px', borderRadius: 9,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            WebkitAppRegion: 'no-drag',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          End
        </button>
      </div>
    </div>
  );
}
window.VoiceMate = VoiceMate;

function Orb({ phase, level, t }) {
  // Each phase paints the orb a different hue + intensity. Level (0..1)
  // drives the radius while listening so the orb visibly responds to voice.
  const meta = {
    greeting:  { color: t.accent2, base: 90, levelGain: 0,  intensity: 0.7 },
    listening: { color: t.accent2, base: 78, levelGain: 32, intensity: 0.9 },
    thinking:  { color: t.accent,  base: 86, levelGain: 0,  intensity: 0.85 },
    speaking:  { color: t.green,   base: 94, levelGain: 0,  intensity: 1 },
    saving:    { color: t.textDim, base: 80, levelGain: 0,  intensity: 0.4 },
    error:     { color: t.red,     base: 80, levelGain: 0,  intensity: 0.6 },
  }[phase] || { color: t.textDim, base: 80, levelGain: 0, intensity: 0.4 };
  const r = meta.base + meta.levelGain * level;
  const animate = phase === 'thinking' || phase === 'speaking' || phase === 'greeting';
  return (
    <div style={{
      position: 'relative', width: 180, height: 180,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Outer halo */}
      <div style={{
        position: 'absolute',
        width: r + 60, height: r + 60, borderRadius: '50%',
        background: `radial-gradient(circle, ${meta.color}33 0%, transparent 70%)`,
        filter: 'blur(8px)',
        transition: 'width 120ms ease-out, height 120ms ease-out',
      }} />
      {/* Core */}
      <div style={{
        width: r, height: r, borderRadius: '50%',
        background: `radial-gradient(circle at 35% 30%, ${meta.color} 0%, ${meta.color}cc 40%, ${meta.color}66 100%)`,
        boxShadow: `0 0 ${24 * meta.intensity}px ${meta.color}aa, inset 0 0 30px rgba(255,255,255,0.15)`,
        transition: 'width 120ms ease-out, height 120ms ease-out, background-color 200ms',
        animation: animate ? 'vmpulse 1.6s ease-in-out infinite' : 'none',
      }} />
      <style>{`
        @keyframes vmpulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.06); opacity: 0.92; }
        }
      `}</style>
    </div>
  );
}

function PhaseText({ phase, error, t }) {
  const map = {
    greeting:  { line: 'Saying hello…',     sub: '' },
    listening: { line: "I'm listening",     sub: 'Speak whenever you\'re ready' },
    thinking:  { line: 'Thinking…',         sub: '' },
    speaking:  { line: 'Speaking',          sub: '' },
    saving:    { line: 'Saving conversation…', sub: '' },
    error:     { line: 'Something went wrong', sub: error || '' },
  };
  const m = map[phase] || { line: phase, sub: '' };
  return (
    <div style={{ textAlign: 'center', minHeight: 36 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: t.text, letterSpacing: '-0.01em' }}>{m.line}</div>
      {m.sub && <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 4, lineHeight: 1.4, padding: '0 28px' }}>{m.sub}</div>}
    </div>
  );
}

function ModelPickerPopover({ t, provider, model, modelsByProvider, keysMeta, favorites, onPick, onToggleFavorite, onClose }) {
  const ref = useRefVm(null);
  useEffectVm(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);
  const labels = { openai: 'OpenAI', anthropic: 'Claude', google: 'Gemini' };
  return (
    <div ref={ref} style={{
      position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 6,
      background: 'rgba(15,15,22,0.98)',
      border: '1px solid rgba(255,255,255,0.14)',
      borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
      maxHeight: 320, overflowY: 'auto',
      padding: 4, zIndex: 50,
      WebkitAppRegion: 'no-drag',
    }}>
      {Object.keys(labels).map((pid) => {
        const ok = !!keysMeta[pid]?.present;
        const all = modelsByProvider[pid] || [];
        const favSet = new Set((favorites && favorites[pid]) || []);
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
              {labels[pid]}
              {!ok && <span style={{ color: t.amber, textTransform: 'none', letterSpacing: 0 }}>· no key</span>}
            </div>
            {favList.length > 0 && (
              <React.Fragment>
                {favList.map((m) => (
                  <VmModelRow key={`f-${m.id}`} t={t} m={m}
                    selected={pid === provider && m.id === model}
                    favorited disabled={!ok}
                    onPick={() => onPick(pid, m.id)}
                    onToggleFavorite={() => onToggleFavorite && onToggleFavorite(pid, m.id)} />
                ))}
                {restList.length > 0 && <div style={{ margin: '4px 8px', height: 1, background: 'rgba(255,255,255,0.06)' }} />}
              </React.Fragment>
            )}
            {restList.map((m) => (
              <VmModelRow key={m.id} t={t} m={m}
                selected={pid === provider && m.id === model}
                disabled={!ok}
                onPick={() => onPick(pid, m.id)}
                onToggleFavorite={() => onToggleFavorite && onToggleFavorite(pid, m.id)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function VmModelRow({ t, m, selected, disabled, favorited, onPick, onToggleFavorite }) {
  const [hov, setHov] = useStateVm(false);
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
        <div style={{ fontWeight: 500 }}>{m.label}</div>
        <div style={{ fontSize: 9.5, color: t.textMute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' }}>{m.id}</span>
          {m.desc && <span> · {m.desc}</span>}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite && onToggleFavorite(); }}
        title={favorited ? 'Unfavorite' : 'Favorite'}
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

// ---- shared helpers ------------------------------------------------------
function arrayBufferToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function stripMarkdownForTTS(s) {
  if (!s) return '';
  return String(s)
    .replace(/```[\s\S]*?```/g, ' (code block omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}
