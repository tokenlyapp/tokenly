// VoiceMate — standalone hands-free voice AI, opens via ⌘⇧V.
// Greets on mount, then runs an always-on VAD loop: speak → 1.5s of silence
// ends the turn → Whisper STT → LLM (streaming) → OpenAI TTS → re-arm mic.
// Closing the window saves the transcript into Tokenly chat history.
const { useState: useStateVm, useEffect: useEffectVm, useRef: useRefVm, useCallback: useCallbackVm } = React;

const VAD_RMS_THRESHOLD = 0.018;       // RMS floor that counts as "speech"
const VAD_MIN_SPEECH_MS = 220;         // Need >= this long of speech before silence-end can fire
const VAD_SILENCE_END_MS = 1100;       // Trailing silence that ends a turn — keep tight enough that turn-taking feels conversational, but long enough to ride through natural mid-sentence pauses
const MIN_SEGMENT_MS = 400;            // Drop ultra-short captures (false triggers)

// Prosody guidance for gpt-4o-mini-tts. Voice replies should sound like a
// person talking, not a newscast — calm, conversational, with natural
// pauses on commas/periods and correct unit pronunciation.
const TTS_VOICE_INSTRUCTIONS = "Speak naturally and conversationally, as if chatting with a friend. Use a calm, friendly tone. Pause briefly at commas and longer at periods. Pronounce numbers, dates, currencies, and unit symbols (Fahrenheit, Celsius, percent, dollars) as you would say them aloud, not as you'd read symbols.";
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
  // Promise that resolves once the initial memory + usage builds finish.
  // The first user turn awaits this so we don't ship a system prompt without
  // the knowledge block, but the greeting itself doesn't have to wait.
  const memoryReadyRef = useRefVm(Promise.resolve());

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
  // Holds the unregister fn for the current turn's stream listener so the
  // next turn can forcibly tear it down even if the prior turn never
  // reached its cleanup line (e.g., errored mid-handler).
  const prevOffStreamRef = useRefVm(null);
  // Approximate user location (city/region/country/timezone) discovered
  // once on mount via IP geolocation. Fed into the system prompt so the
  // voice AI's web searches default to the right place when the user asks
  // "what's the weather" or "what's open near me".
  const userLocationRef = useRefVm(null);

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
        // Kick off memory + usage builds in the background — they're not
        // needed for the greeting itself, only for the first user reply, so
        // we shouldn't block the greeting on them. The first turn awaits
        // memoryReadyRef before composing the system prompt.
        memoryReadyRef.current = (async () => {
          try { memoryRef.current = await buildMemoryBlock(convs || []); } catch {}
          try { usageSnapshotRef.current = await window.api.chatUsageSnapshot({ days: 30 }); }
          catch { usageSnapshotRef.current = null; }
        })();
        // Approximate location for localized web searches. ipapi.co is free
        // and doesn't require a key for ~30k requests/day. Falls back to
        // browser timezone alone if the call fails — even just the TZ helps
        // narrow the model's guess at "what city/country are you in".
        (async () => {
          try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4000);
            const res = await fetch('https://ipapi.co/json/', { signal: ctrl.signal })
              .finally(() => clearTimeout(timer));
            if (res.ok) {
              const j = await res.json();
              userLocationRef.current = {
                city: j.city || '', region: j.region || '', country: j.country_name || j.country || '',
                timezone: j.timezone || tz,
              };
            } else {
              userLocationRef.current = { timezone: tz };
            }
          } catch {
            try { userLocationRef.current = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '' }; } catch {}
          }
        })();
      } catch (err) {
        if (!cancelled) { setPhase('error'); setError(err?.message || String(err)); }
        return;
      }
      if (cancelled) return;
      // Speak the greeting, then start listening. Greeting fires immediately —
      // memory/usage finish loading in the background while we speak.
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
    // Load all conversations in parallel — sequential awaits used to dominate
    // first-greeting latency (one IPC round-trip per conversation, up to 30).
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
      const res = await window.api.chatTts({
        text, voice: voiceName || 'alloy',
        instructions: TTS_VOICE_INSTRUCTIONS,
      });
      if (!res.ok) throw new Error(res.error || 'TTS failed');
      // gpt-4o-mini-tts bills $0.60 per 1M input characters ($0.0006 / 1K).
      // Capped at 4096 by main.js to match OpenAI's limit.
      const chars = Math.min(4096, (text || '').length);
      addCost('tts', (chars / 1000) * 0.0006);
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
      // gpt-4o-mini-transcribe bills at $0.003/minute of audio.
      const seconds = elapsed / 1000;
      addCost('stt', (seconds / 60) * 0.003);
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

  // Strip Whisper's well-known silence hallucinations. Conservative — only
  // matches very short outputs so real speech is never dropped.
  function filterWhisperHallucinations(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const norm = raw.toLowerCase().replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '');
    if (!norm) return '';
    const KNOWN = new Set([
      'you', 'thank you', 'thanks', 'thanks for watching',
      'thanks for watching!', 'thank you for watching', 'bye', 'goodbye',
      'mhm', 'mm', 'uh', 'um', 'hmm', 'yeah', 'ok', 'okay',
      'subtitles by the amara.org community',
      'transcription by castingwords',
      'music', '[music]', '♪', '♪♪',
    ]);
    if (KNOWN.has(norm)) return '';
    if (norm.length <= 3) return '';
    return raw;
  }

  // ------- Pipeline: STT → LLM → TTS, then loop back to listening ----------
  const handleUtterance = useCallbackVm(async (blob, mime) => {
    if (stopRef.current) return;
    setPhase('thinking');
    setLevel(0);

    // Hard reset of anything left over from prior turns. Without this, a
    // listener that wasn't unregistered (because the previous turn errored
    // before reaching offStream) keeps firing on the new turn's deltas,
    // resurrects its old play loop, and overlapping audio comes out
    // garbled. Same for half-finished playback on the shared <Audio>.
    if (prevOffStreamRef.current) {
      try { prevOffStreamRef.current(); } catch {}
      prevOffStreamRef.current = null;
    }
    if (audioElRef.current) {
      try { audioElRef.current.pause(); audioElRef.current.src = ''; } catch {}
    }

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
    // Whisper sometimes emits fluent phantom text on near-silent audio that
    // happens to clear our VAD ("Thanks for watching", "you", ".", etc.).
    // Treat known hallucinations as silence and re-listen instead of feeding
    // them to the LLM as if the user had spoken.
    userText = filterWhisperHallucinations(userText);
    if (!userText) {
      if (!stopRef.current) startListening();
      return;
    }
    if (stopRef.current) return;

    setMessages((m) => m.concat({ role: 'user', content: userText, timestamp: Date.now() }));

    // ---- Voice plugins: short-circuit web_search for queries we can answer
    // locally with structured data (weather, crypto, currency, definitions,
    // wiki, time, air quality, news, translation, math). All plugins run in
    // parallel; each returns a block to inject into the LLM's system prompt.
    const pluginsBlock = await runVoicePlugins(userText, { location: userLocationRef.current });
    let pluginsSystemBlock = pluginsBlock
      ? `\n\nLIVE PLUGIN DATA (just fetched, use this verbatim — do NOT call web_search; remember the speak-friendly rules above):\n${pluginsBlock}`
      : '';

    // Stream LLM reply.
    const sid = 's_vm_' + newVmId();
    streamIdRef.current = sid;
    let assistantText = '';
    setMessages((m) => m.concat({ role: 'assistant', content: '', timestamp: Date.now(), streaming: true, model, provider }));

    // Sentence-chunked TTS pipeline. Start speaking the first sentence the
    // moment the LLM finishes it, instead of waiting for the entire reply.
    // Cuts perceived latency from "full reply length" to ~1 sentence.
    let spokenCursor = 0;
    const playQueue = [];
    let playLoopRunning = false;
    let allFlushedResolve;
    const allFlushed = new Promise((r) => { allFlushedResolve = r; });
    const startPlayLoop = async () => {
      if (playLoopRunning) return;
      playLoopRunning = true;
      while (playQueue.length) {
        const p = playQueue.shift();
        let info;
        try { info = await p; } catch { info = null; }
        if (stopRef.current) { playLoopRunning = false; allFlushedResolve(); return; }
        if (!info?.url) continue;
        const a = audioElRef.current || (audioElRef.current = new Audio());
        a.src = info.url;
        await new Promise((r) => {
          const cleanup = () => { try { URL.revokeObjectURL(info.url); } catch {} a.onended = a.onerror = null; r(); };
          a.onended = cleanup;
          a.onerror = cleanup;
          a.play().catch(cleanup);
        });
      }
      playLoopRunning = false;
      allFlushedResolve();
    };
    const enqueueTTS = (chunkText) => {
      const text = stripMarkdownForTTS(chunkText).trim();
      if (!text) return;
      setPhase('speaking');
      const p = (async () => {
        try {
          const res = await window.api.chatTts({
            text, voice: voiceRefValue() || 'alloy',
            instructions: TTS_VOICE_INSTRUCTIONS,
          });
          if (!res.ok) return null;
          const chars = Math.min(4096, text.length);
          addCost('tts', (chars / 1000) * 0.0006);
          const bytes = base64ToBytes(res.audioB64);
          const blob = new Blob([bytes], { type: res.mime || 'audio/mpeg' });
          return { url: URL.createObjectURL(blob) };
        } catch { return null; }
      })();
      playQueue.push(p);
      startPlayLoop();
    };
    let firstChunkEnqueued = false;
    const flushCompletedSentences = () => {
      const tail = assistantText.slice(spokenCursor);
      const re = /[^.!?\n]+[.!?\n]+(?=\s|$)/g;
      let m;
      let lastEnd = 0;
      const parts = [];
      while ((m = re.exec(tail)) !== null) {
        parts.push(m[0].trim());
        lastEnd = m.index + m[0].length;
      }
      if (!parts.length) return;
      // For the FIRST chunk, send it immediately regardless of size — every
      // millisecond of "user is waiting" matters more than a slight stutter
      // if the very first sentence is short. After the first chunk plays,
      // coalesce short fragments (abbreviations) into ~25-char buffers so
      // playback isn't choppy mid-response.
      const MIN_CHUNK = 25;
      const combined = [];
      let buf = '';
      for (const p of parts) {
        if (!firstChunkEnqueued && !buf) {
          // Ship the first sentence on its own, no coalescing wait.
          combined.push(p);
          firstChunkEnqueued = true;
          continue;
        }
        buf = buf ? buf + ' ' + p : p;
        if (buf.length >= MIN_CHUNK) { combined.push(buf); buf = ''; }
      }
      if (buf) combined.push(buf);
      for (const s of combined) enqueueTTS(s);
      spokenCursor += lastEnd;
      while (spokenCursor < assistantText.length && /\s/.test(assistantText[spokenCursor])) spokenCursor++;
    };

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
    let firstEventLogged = false;
    const handler = (evt) => {
      if (!evt || evt.streamId !== streamIdRef.current) return;
      if (!firstEventLogged) { console.warn('[voicemate] first stream event received:', evt.type); firstEventLogged = true; }
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
        // Kick off TTS for any sentence that just completed — first audio
        // can start before the LLM has finished streaming.
        flushCompletedSentences();
      } else if (evt.type === 'done' || evt.type === 'aborted') {
        if (evt.text) assistantText = evt.text;
        setMessages((m) => {
          const arr = m.slice();
          const last = arr[arr.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            arr[arr.length - 1] = { ...last, content: evt.text || assistantText, streaming: false, usage: evt.usage || null, cost: evt.cost || 0 };
          }
          return arr;
        });
        // Flush any trailing partial sentence that didn't end in punctuation.
        flushCompletedSentences();
        if (spokenCursor < assistantText.length) {
          const trailing = assistantText.slice(spokenCursor).trim();
          if (trailing) { enqueueTTS(trailing); spokenCursor = assistantText.length; }
        }
        // No more chunks coming — if the play loop already drained, signal done.
        if (!playQueue.length && !playLoopRunning) allFlushedResolve();
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
        if (!playQueue.length && !playLoopRunning) allFlushedResolve();
        resolveStream();
      }
    };
    // Subscribe per-turn and capture the unregister so we don't leak a
    // listener every loop. Without this, after a few turns the renderer is
    // running multiple stale handlers on the same delta event — the chunked
    // TTS pipeline gets duplicate sentences and the conversation effectively
    // freezes after Node hits the 10-listener warning threshold.
    let offStream = () => {};
    if (window.api?.onChatStreamEvent) {
      const ret = window.api.onChatStreamEvent(handler);
      if (typeof ret === 'function') offStream = ret;
    }
    // Stash on a ref so the NEXT turn's hard reset can tear this listener
    // down even if our own cleanup at end-of-turn never runs (e.g., an
    // exception bubbles before reaching `offStream()`).
    prevOffStreamRef.current = offStream;

    // Make sure the deferred initial memory/usage build has finished before
    // we compose the system prompt for the first turn. The initial build
    // already populated usageSnapshotRef once.
    try { await memoryReadyRef.current; } catch {}
    // Refresh the usage snapshot in the BACKGROUND so the next turn sees
    // fresher numbers. Awaiting it here used to hang voice forever if any
    // upstream usage API was slow/down — the snapshot loops through every
    // provider serially.
    window.api.chatUsageSnapshot({ days: 30 })
      .then((snap) => { if (snap) usageSnapshotRef.current = snap; })
      .catch(() => {});

    const nowISO = new Date().toISOString();
    const nowReadable = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const baseSystem = `You are a friendly voice assistant for Tokenly, a Mac AI-spend monitor. Keep responses concise (1-3 sentences) and conversational, since the user will hear you spoken aloud rather than read you.

CURRENT DATE/TIME: ${nowReadable} (${nowISO}). Use this when the user asks about "today", "this week", "right now", schedules, etc. Don't fall back to your training-data sense of "now".

You have a web_search tool available. USE IT — don't just answer from training data — whenever the user asks about anything that may have changed since your training cutoff: current events, news, weather, scores, stock or crypto prices, product releases, version numbers, schedules, "today's" / "latest" / "right now" anything. If the user asks "what's happening in the world today" or "what's the price of X," that requires a search. After searching, summarize the answer in one or two spoken sentences (don't list URLs aloud — the citations are surfaced separately).

SPEAK-FRIENDLY OUTPUT — every word you write will be read aloud by text-to-speech, so:
  - Spell out unit symbols: write "75 degrees Fahrenheit" not "75°F" or "75 F"; "20 degrees Celsius" not "20°C"; "60 percent" not "60%"; "5 dollars" not "$5".
  - Spell out abbreviations the user wouldn't say aloud: "Atlanta, Georgia" not "Atlanta, GA"; "United States" not "U.S."; "Doctor" not "Dr." (when it's a title).
  - Write dates the way a person would say them: "April twenty-seventh" or "Sunday, April twenty-seventh", not "4/27" or "2026-04-27".
  - Write times in spoken form: "three thirty in the afternoon" or "three thirty PM", not "15:30" or "3:30PM" without the space.
  - No bullet points, no markdown, no headings, no asterisks. One flowing spoken paragraph.`;
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
    // Location hint — without this the web_search tool returns generic
    // results and the model guesses (badly) when the user asks "weather
    // here" / "near me" / etc.
    const loc = userLocationRef.current;
    if (loc && (loc.city || loc.country || loc.timezone)) {
      const parts = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
      system += `\n\nUSER LOCATION (approximate, from IP geolocation${loc.timezone ? `, timezone ${loc.timezone}` : ''}): ${parts || loc.timezone}.\n\nWhen the user asks about anything location-dependent — weather, time, what's open, traffic, sports scores, "near me", "here", "today" — use THIS location in your web_search query (e.g., search "weather ${loc.city || parts}" not just "weather"). Don't ask the user where they are; you already know.`;
    }
    // Live weather data, if the turn was a weather query — populated above.
    if (pluginsSystemBlock) system += pluginsSystemBlock;

    console.warn('[voicemate] starting stream', sid, 'provider=' + provider, 'model=' + model);
    try {
      await window.api.chatStream({
        streamId: sid,
        provider, model,
        messages: outgoing,
        system,
        // Voice answers benefit from fresh info (news, prices, etc.) the same
        // way chat does. Same default-on behavior as ChatSheet.
        webSearch: true,
      });
    } catch (err) {
      console.warn('[voicemate] stream invoke failed:', err);
    }
    console.warn('[voicemate] awaiting streamDone');
    // 45s safety net: if the LLM stream is hung (web_search_preview can sit
    // silent for 10-20s while searching, but anything past 45s is broken),
    // abort it so the user isn't stuck on 'thinking' forever and we can
    // re-listen.
    const streamTimeout = new Promise((r) => setTimeout(() => {
      console.warn('[voicemate] stream timed out after 45s, cancelling');
      try { window.api.chatCancel && window.api.chatCancel(sid); } catch {}
      r();
    }, 45000));
    await Promise.race([streamDone, streamTimeout]);
    console.warn('[voicemate] streamDone resolved, queueLen=' + playQueue.length, 'playLoopRunning=' + playLoopRunning);
    // Detach the per-turn stream listener now that the LLM is done.
    try { offStream(); } catch {}
    if (prevOffStreamRef.current === offStream) prevOffStreamRef.current = null;
    if (stopRef.current) return;

    // Wait for the sentence-chunked TTS pipeline to finish playing — the
    // first sentence has typically been speaking since mid-stream, so this
    // resolves much sooner than the old "TTS the full reply at the end".
    // Cap the wait at 60s so a hung TTS call doesn't permanently freeze the
    // conversation in 'speaking' phase — the user would rather we re-listen
    // than wait forever.
    await Promise.race([
      allFlushed,
      new Promise((r) => setTimeout(() => { console.warn('[voicemate] allFlushed timed out'); r(); }, 60000)),
    ]);
    console.warn('[voicemate] allFlushed resolved, looping back to listen');
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
// ============================================================================
// Voice plugins
// ============================================================================
// Each plugin detects intent in the user's transcript and returns either:
//   - a string block to append to the LLM's system prompt (with structured
//     real-time data + an instruction to answer from it instead of web_search),
//   - or null/empty if it doesn't apply.
//
// The voice loop iterates VOICE_PLUGINS, fans out matched plugins in parallel,
// and concatenates the resulting blocks into the system prompt for that turn.
// All plugins use free APIs (no key) where possible; key-gated ones (Finnhub,
// NewsAPI, DeepL) check for the key and silently no-op if missing so the
// model falls back to web_search.

// ----- 1. Weather (Open-Meteo) ----------------------------------------------
function detectWeatherQuery(text) {
  if (!text) return null;
  const intent = /\b(weather|forecast|temperature|temp|how (?:warm|hot|cold)|raining|snowing|rainy|snowy|sunny|cloudy|humid|windy|precipitation)\b/i;
  if (!intent.test(text)) return null;
  const m = text.match(/\b(?:in|at|for|near|around)\s+((?:[A-Z][\w'-]*[,\s]*)+?)(?=\s*(?:\?|\.|tonight|today|tomorrow|now|right now|this (?:week|weekend|morning|afternoon|evening)|$))/i);
  if (m) return m[1].replace(/[\s,]+$/, '').trim();
  return '';
}
function weatherCodeToText(code) {
  if (code == null) return 'unknown conditions';
  if (code === 0) return 'clear skies';
  if (code === 1) return 'mainly clear';
  if (code === 2) return 'partly cloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'foggy';
  if (code >= 51 && code <= 57) return 'drizzling';
  if (code >= 61 && code <= 67) return 'raining';
  if (code >= 71 && code <= 77) return 'snowing';
  if (code >= 80 && code <= 82) return 'rain showers';
  if (code >= 85 && code <= 86) return 'snow showers';
  if (code >= 95 && code <= 99) return 'thunderstorms';
  return 'mixed conditions';
}
async function geocodePlace(place) {
  const ge = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`);
  if (!ge.ok) return null;
  const gj = await ge.json();
  return (gj.results && gj.results[0]) || null;
}
const weatherPlugin = {
  name: 'weather',
  async run(text, ctx) {
    const hint = detectWeatherQuery(text);
    if (hint === null) return '';
    const place = (hint && hint.trim())
      || (ctx.location ? [ctx.location.city, ctx.location.region, ctx.location.country].filter(Boolean).join(', ') : '');
    if (!place) return '';
    const r = await geocodePlace(place);
    if (!r) return '';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${r.latitude}&longitude=${r.longitude}`
      + `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max`
      + `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1`;
    const wx = await fetch(url);
    if (!wx.ok) return '';
    const j = await wx.json();
    const loc = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
    return `LIVE WEATHER (Open-Meteo, ${loc}): currently ${Math.round(j.current?.temperature_2m)} degrees Fahrenheit (feels like ${Math.round(j.current?.apparent_temperature)}), ${weatherCodeToText(j.current?.weather_code)}, humidity ${Math.round(j.current?.relative_humidity_2m)} percent, wind ${Math.round(j.current?.wind_speed_10m)} miles per hour. Today's high ${Math.round(j.daily?.temperature_2m_max?.[0])}, low ${Math.round(j.daily?.temperature_2m_min?.[0])}. Precip chance ${j.daily?.precipitation_probability_max?.[0]} percent.`;
  },
};

// ----- 2. Calculator / unit conversion (local, no API) ----------------------
// Detects "what is X plus/times/etc Y", "convert N units to other-units",
// "how many X in Y units". Evaluates locally — no LLM round-trip needed.
const UNITS = {
  // length
  m: 1, meter: 1, meters: 1, metre: 1, metres: 1,
  km: 1000, kilometer: 1000, kilometers: 1000,
  cm: 0.01, mm: 0.001,
  mi: 1609.344, mile: 1609.344, miles: 1609.344,
  ft: 0.3048, foot: 0.3048, feet: 0.3048,
  in: 0.0254, inch: 0.0254, inches: 0.0254,
  yd: 0.9144, yard: 0.9144, yards: 0.9144,
};
const WEIGHT = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  mg: 0.001,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
  ton: 907184.74, tons: 907184.74,
};
const VOLUME = {
  ml: 1, l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
  tsp: 4.92892, tsps: 4.92892, teaspoon: 4.92892, teaspoons: 4.92892,
  tbsp: 14.7868, tbsps: 14.7868, tablespoon: 14.7868, tablespoons: 14.7868,
  cup: 236.588, cups: 236.588,
  pint: 473.176, pints: 473.176, pt: 473.176,
  quart: 946.353, quarts: 946.353, qt: 946.353,
  gal: 3785.41, gallon: 3785.41, gallons: 3785.41,
  'fl oz': 29.5735, 'fluid ounce': 29.5735, 'fluid ounces': 29.5735,
};
function unitFamily(u) {
  u = u.toLowerCase();
  if (UNITS[u]) return ['length', UNITS[u]];
  if (WEIGHT[u]) return ['weight', WEIGHT[u]];
  if (VOLUME[u]) return ['volume', VOLUME[u]];
  return [null, 0];
}
function tempConvert(val, from, to) {
  const F = ['f', 'fahrenheit', 'degrees f', 'degrees fahrenheit'];
  const C = ['c', 'celsius', 'degrees c', 'degrees celsius'];
  const K = ['k', 'kelvin'];
  const norm = (u) => u.toLowerCase().trim();
  const fromF = F.includes(norm(from)), fromC = C.includes(norm(from)), fromK = K.includes(norm(from));
  const toF = F.includes(norm(to)), toC = C.includes(norm(to)), toK = K.includes(norm(to));
  if (!(fromF || fromC || fromK) || !(toF || toC || toK)) return null;
  let c;
  if (fromF) c = (val - 32) * 5 / 9;
  else if (fromK) c = val - 273.15;
  else c = val;
  if (toF) return c * 9 / 5 + 32;
  if (toK) return c + 273.15;
  return c;
}
const calcPlugin = {
  name: 'calc',
  async run(text) {
    // Pattern A: "convert N <unit> to <unit>" / "N <unit> in <unit>" / "how many <unit> in N <unit>"
    let m = text.match(/(?:convert\s+)?([\d.]+)\s*([a-z][a-z\s]*?)\s+(?:to|in|into)\s+([a-z][a-z\s]+?)(?:\?|\.|$)/i);
    let val, fromU, toU;
    if (m) { val = parseFloat(m[1]); fromU = m[2].trim(); toU = m[3].trim(); }
    else {
      const m2 = text.match(/how many\s+([a-z][a-z\s]+?)\s+(?:in|are in|equal)\s+([\d.]+)\s*([a-z][a-z\s]+?)(?:\?|\.|$)/i);
      if (m2) { toU = m2[1].trim(); val = parseFloat(m2[2]); fromU = m2[3].trim(); }
    }
    if (val != null && fromU && toU) {
      // Temperature first.
      const t = tempConvert(val, fromU, toU);
      if (t != null) return `CONVERSION: ${val} ${fromU} = ${Math.round(t * 100) / 100} ${toU}.`;
      const [fFam, fMul] = unitFamily(fromU);
      const [tFam, tMul] = unitFamily(toU);
      if (fFam && fFam === tFam) {
        const result = (val * fMul) / tMul;
        return `CONVERSION: ${val} ${fromU} = ${Math.round(result * 1000) / 1000} ${toU}.`;
      }
    }
    // Pattern B: arithmetic — "what is N op M (op P)?" with simple operators.
    const arith = text.match(/what(?:'s| is)\s+([\d.\s+\-*x×÷/()]+?)(?:\?|\.|$)/i);
    if (arith) {
      const expr = arith[1].replace(/x|×/gi, '*').replace(/÷/g, '/').trim();
      // Whitelist before eval.
      if (/^[\d\s+\-*/().]+$/.test(expr)) {
        try {
          // eslint-disable-next-line no-new-func
          const result = Function(`"use strict"; return (${expr});`)();
          if (Number.isFinite(result)) {
            return `CALCULATION: ${expr} = ${Math.round(result * 1000000) / 1000000}.`;
          }
        } catch {}
      }
    }
    return '';
  },
};

// ----- 3. Currency conversion (exchangerate.host, free no key) --------------
const CURRENCY_NAMES = {
  usd: 'US dollars', eur: 'euros', gbp: 'British pounds', jpy: 'Japanese yen',
  cad: 'Canadian dollars', aud: 'Australian dollars', chf: 'Swiss francs',
  cny: 'Chinese yuan', inr: 'Indian rupees', mxn: 'Mexican pesos',
  brl: 'Brazilian reals', krw: 'Korean won', sgd: 'Singapore dollars',
};
function normalizeCurrency(token) {
  const t = token.toLowerCase().trim().replace(/[.,]/g, '');
  const aliases = {
    'dollars': 'usd', 'dollar': 'usd', 'usd': 'usd', 'bucks': 'usd',
    'euros': 'eur', 'euro': 'eur', 'eur': 'eur',
    'pounds': 'gbp', 'pound': 'gbp', 'sterling': 'gbp', 'gbp': 'gbp',
    'yen': 'jpy', 'jpy': 'jpy',
    'canadian dollars': 'cad', 'cad': 'cad',
    'australian dollars': 'aud', 'aud': 'aud',
    'swiss francs': 'chf', 'francs': 'chf', 'chf': 'chf',
    'yuan': 'cny', 'rmb': 'cny', 'cny': 'cny',
    'rupees': 'inr', 'inr': 'inr',
    'pesos': 'mxn', 'mxn': 'mxn',
    'reals': 'brl', 'brl': 'brl',
    'won': 'krw', 'krw': 'krw',
  };
  return aliases[t] || (t.length === 3 ? t : null);
}
const currencyPlugin = {
  name: 'currency',
  async run(text) {
    const m = text.match(/(?:convert\s+)?([\d.]+)\s*([a-z][a-z\s]*?)\s+(?:to|in|into)\s+([a-z][a-z\s]+?)(?:\?|\.|$)/i);
    if (!m) return '';
    const amt = parseFloat(m[1]);
    const from = normalizeCurrency(m[2]);
    const to = normalizeCurrency(m[3]);
    if (!from || !to || from === to) return '';
    try {
      const res = await fetch(`https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=${amt}`);
      if (!res.ok) return '';
      const j = await res.json();
      if (j?.result == null) return '';
      const fromName = CURRENCY_NAMES[from] || from.toUpperCase();
      const toName = CURRENCY_NAMES[to] || to.toUpperCase();
      return `CURRENCY CONVERSION: ${amt} ${fromName} equals ${Math.round(j.result * 100) / 100} ${toName} (rate ${j.info?.rate}).`;
    } catch { return ''; }
  },
};

// ----- 4. Word definitions (dictionaryapi.dev, free no key) -----------------
const definePlugin = {
  name: 'define',
  async run(text) {
    const m = text.match(/\b(?:define|definition of|what does|meaning of|what's the meaning of)\s+(?:the word\s+)?([a-z][a-z'-]+?)(?:\s+mean)?(?:\?|\.|$)/i);
    if (!m) return '';
    const word = m[1].trim();
    if (word.length < 2 || word.length > 32) return '';
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!res.ok) return '';
      const j = await res.json();
      const entry = Array.isArray(j) ? j[0] : null;
      if (!entry?.meanings?.length) return '';
      const m1 = entry.meanings[0];
      const def = m1?.definitions?.[0]?.definition;
      if (!def) return '';
      return `DEFINITION (dictionaryapi.dev) — ${word} (${m1.partOfSpeech || 'noun'}): ${def}`;
    } catch { return ''; }
  },
};

// ----- 5. Wikipedia summary (free no key) -----------------------------------
const wikiPlugin = {
  name: 'wiki',
  async run(text) {
    // Triggers: "tell me about X", "who is X", "what is X" (when not weather/etc),
    // "explain X". Conservative — short queries only, otherwise too noisy.
    const m = text.match(/\b(?:tell me about|who (?:is|was)|what (?:is|was|are)|explain)\s+([A-Z][\w\s.'-]+?)(?:\?|\.|$)/i);
    if (!m) return '';
    let title = m[1].trim().replace(/\s+/g, '_');
    if (title.length < 2 || title.length > 80) return '';
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}?redirect=true`);
      if (!res.ok) return '';
      const j = await res.json();
      if (j.type === 'disambiguation' || !j.extract) return '';
      const ext = String(j.extract).slice(0, 600);
      return `WIKIPEDIA SUMMARY — ${j.title}: ${ext}`;
    } catch { return ''; }
  },
};

// ----- 6. Time / date / timezone (local, no API) ----------------------------
const TZ_ALIASES = {
  'tokyo': 'Asia/Tokyo', 'london': 'Europe/London', 'paris': 'Europe/Paris',
  'new york': 'America/New_York', 'nyc': 'America/New_York',
  'la': 'America/Los_Angeles', 'los angeles': 'America/Los_Angeles',
  'sf': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  'sydney': 'Australia/Sydney', 'singapore': 'Asia/Singapore',
  'dubai': 'Asia/Dubai', 'mumbai': 'Asia/Kolkata', 'delhi': 'Asia/Kolkata',
  'beijing': 'Asia/Shanghai', 'shanghai': 'Asia/Shanghai',
  'berlin': 'Europe/Berlin', 'madrid': 'Europe/Madrid', 'rome': 'Europe/Rome',
  'chicago': 'America/Chicago', 'denver': 'America/Denver',
  'toronto': 'America/Toronto', 'mexico city': 'America/Mexico_City',
};
const timePlugin = {
  name: 'time',
  async run(text, ctx) {
    // "what time is it [in <place>]" / "what's the time [in <place>]"
    const m = text.match(/\bwhat(?:'s| is)\s+(?:the\s+)?time(?:\s+(?:in|at)\s+([a-z][a-z\s]+?))?(?:\?|\.|$)/i);
    if (m) {
      const place = (m[1] || '').trim().toLowerCase();
      const tz = TZ_ALIASES[place] || (ctx.location?.timezone) || 'UTC';
      try {
        const now = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'long' }).format(new Date());
        const placeName = place || (ctx.location?.city ? `${ctx.location.city}` : 'your location');
        return `LOCAL TIME (${tz}, ${placeName}): ${now}.`;
      } catch { return ''; }
    }
    // "what day is it" / "what's today's date"
    if (/\b(what (?:day|date) is (?:it|today)|what'?s? (?:today|today's date|the date))\b/i.test(text)) {
      const tz = ctx.location?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const today = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
      return `TODAY: ${today}.`;
    }
    return '';
  },
};

// ----- 7. Air quality (Open-Meteo air-quality, free no key) -----------------
function aqiCategory(aqi) {
  if (aqi == null) return 'unknown';
  if (aqi <= 50) return 'good';
  if (aqi <= 100) return 'moderate';
  if (aqi <= 150) return 'unhealthy for sensitive groups';
  if (aqi <= 200) return 'unhealthy';
  if (aqi <= 300) return 'very unhealthy';
  return 'hazardous';
}
const airQualityPlugin = {
  name: 'air',
  async run(text, ctx) {
    if (!/\b(air quality|air pollution|aqi|smog|how (?:bad|good) is the air)\b/i.test(text)) return '';
    const m = text.match(/\b(?:in|at|for|near|around)\s+((?:[A-Z][\w'-]*[,\s]*)+?)(?=\s*(?:\?|\.|right now|today|now|$))/i);
    const place = (m && m[1].trim()) || (ctx.location ? [ctx.location.city, ctx.location.region, ctx.location.country].filter(Boolean).join(', ') : '');
    if (!place) return '';
    const r = await geocodePlace(place);
    if (!r) return '';
    try {
      const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${r.latitude}&longitude=${r.longitude}&current=us_aqi,pm2_5,pm10,ozone&timezone=auto`);
      if (!res.ok) return '';
      const j = await res.json();
      const a = j.current || {};
      const loc = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
      return `LIVE AIR QUALITY (Open-Meteo, ${loc}): US AQI ${Math.round(a.us_aqi)} (${aqiCategory(a.us_aqi)}), PM2.5 ${Math.round(a.pm2_5)} micrograms per cubic meter, PM10 ${Math.round(a.pm10)}, ozone ${Math.round(a.ozone)}.`;
    } catch { return ''; }
  },
};

// ----- 8. Crypto prices (CoinGecko, free no key) ----------------------------
const CRYPTO_ALIASES = {
  bitcoin: 'bitcoin', btc: 'bitcoin',
  ethereum: 'ethereum', eth: 'ethereum',
  solana: 'solana', sol: 'solana',
  cardano: 'cardano', ada: 'cardano',
  dogecoin: 'dogecoin', doge: 'dogecoin',
  ripple: 'ripple', xrp: 'ripple',
  polkadot: 'polkadot', dot: 'polkadot',
  litecoin: 'litecoin', ltc: 'litecoin',
  chainlink: 'chainlink', link: 'chainlink',
  polygon: 'matic-network', matic: 'matic-network',
  avalanche: 'avalanche-2', avax: 'avalanche-2',
};
const cryptoPlugin = {
  name: 'crypto',
  async run(text) {
    if (!/\b(price|worth|value|cost)\b/i.test(text)) return '';
    let coin = null;
    for (const k of Object.keys(CRYPTO_ALIASES)) {
      if (new RegExp(`\\b${k}\\b`, 'i').test(text)) { coin = CRYPTO_ALIASES[k]; break; }
    }
    if (!coin) return '';
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd&include_24hr_change=true`);
      if (!res.ok) return '';
      const j = await res.json();
      const d = j[coin];
      if (!d?.usd) return '';
      const chg = d.usd_24h_change;
      return `LIVE CRYPTO PRICE (CoinGecko) — ${coin.replace(/-/g, ' ')}: ${d.usd.toLocaleString('en-US', { maximumFractionDigits: 2 })} US dollars (${chg >= 0 ? 'up' : 'down'} ${Math.abs(chg).toFixed(2)} percent in the last 24 hours).`;
    } catch { return ''; }
  },
};

// ----- 9. Stock prices (Yahoo Finance, free no key) -------------------------
// Yahoo's chart endpoint is unofficial-but-stable and returns a current
// quote without auth. We hit it via main.js (voice:fetch-stock) so the
// renderer doesn't run into Yahoo's CORS preflight.
const stockPlugin = {
  name: 'stock',
  async run(text) {
    if (!/\b(stock|share|ticker)\b/i.test(text) && !/\bprice of\b/i.test(text)) return '';
    const m = text.match(/\b(?:price of|stock price of|stock for|ticker)\s+([A-Z]{1,5})\b/i)
      || text.match(/\b([A-Z]{1,5})\s+(?:stock|share)(?:\s+price)?\b/);
    if (!m) return '';
    const symbol = m[1].toUpperCase();
    try {
      const res = await window.api.voiceFetchStock?.(symbol);
      if (!res?.ok) return '';
      const chg = res.changePercent;
      return `LIVE STOCK PRICE (Yahoo Finance) — ${symbol}: ${res.price.toFixed(2)} ${res.currency || 'US dollars'} (${chg >= 0 ? 'up' : 'down'} ${Math.abs(chg).toFixed(2)} percent today, previous close ${res.previousClose.toFixed(2)}).`;
    } catch { return ''; }
  },
};

// ----- 10. Tech news (Hacker News, free no key) -----------------------------
// Routes to the right HN endpoint based on intent (Show HN, Ask HN, Best,
// New, or default Top). Asks the model to recite the items rather than
// summarize them — otherwise the "1-3 sentences" voice rule causes the LLM
// to condense five headlines into "the top stories include..." instead of
// actually reading them.
const newsPlugin = {
  name: 'news',
  async run(text) {
    // Match HN both as "HN" and as Whisper's likely transcriptions
    // ("H N", "H.N.", "Hacker News").
    // Allow plural ("Show HNs") and the "h n" / "h.n." Whisper transcriptions.
    const HN = `(?:hns?|h\\s*\\.?\\s*n\\.?|hacker\\s*news)`;
    const reIntent = new RegExp(`\\b(news|headlines|${HN}|top stories|show ${HN}|ask ${HN}|best (?:of )?${HN}|what's happening)\\b`, 'i');
    if (!reIntent.test(text)) return '';
    // Pick endpoint by intent.
    let endpoint = 'topstories', label = 'top stories';
    if (new RegExp(`\\bshow\\s*${HN}\\b`, 'i').test(text)) { endpoint = 'showstories'; label = 'Show HN posts'; }
    else if (new RegExp(`\\bask\\s*${HN}\\b`, 'i').test(text)) { endpoint = 'askstories'; label = 'Ask HN posts'; }
    else if (new RegExp(`\\bbest(?:\\s+(?:of\\s+)?${HN}|\\s+stories)\\b`, 'i').test(text)) { endpoint = 'beststories'; label = 'best stories'; }
    else if (new RegExp(`\\bnew\\s+(?:${HN}|stories)\\b`, 'i').test(text)) { endpoint = 'newstories'; label = 'newest stories'; }
    // How many to fetch — match user's number if they specified one.
    const numMatch = text.match(/\b(?:top\s+)?(\d{1,2})\b/);
    const count = Math.max(3, Math.min(10, numMatch ? parseInt(numMatch[1], 10) : 5));
    try {
      const ids = await fetch(`https://hacker-news.firebaseio.com/v0/${endpoint}.json`).then((r) => r.ok ? r.json() : []);
      if (!ids?.length) return '';
      const top = ids.slice(0, count);
      const items = await Promise.all(top.map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.ok ? r.json() : null)
      ));
      const valid = items.filter(Boolean);
      if (!valid.length) return '';
      const lines = valid.map((it, i) => `${i + 1}. ${it.title} (${it.score || 0} points, ${it.descendants || 0} comments)`);
      return `LIVE HACKER NEWS — current ${label} (top ${valid.length}):\n${lines.join('\n')}\n\nIMPORTANT: The user asked for a list. RECITE these items in order — say each one's number and title (skip the score/comment counts unless asked). Do NOT compress them into a summary like "the top stories include..."; the user wants to hear the actual headlines. Brief intro is fine ("Here are the top five Show HN posts right now:") followed by the numbered list.`;
    } catch { return ''; }
  },
};

// ----- 11. Translation (LibreTranslate public, free no key) -----------------
const TRANSLATE_LANGS = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it',
  portuguese: 'pt', dutch: 'nl', russian: 'ru', polish: 'pl', turkish: 'tr',
  arabic: 'ar', hebrew: 'he', hindi: 'hi',
  chinese: 'zh', japanese: 'ja', korean: 'ko', vietnamese: 'vi',
};
const translatePlugin = {
  name: 'translate',
  async run(text) {
    // "translate <phrase> to <lang>" / "how do you say <phrase> in <lang>"
    let m = text.match(/translate\s+(?:the (?:word|phrase|sentence)\s+)?(?:["'](.+?)["']|(.+?))\s+(?:to|into|in)\s+([a-z]+)(?:\?|\.|$)/i);
    let phrase, lang;
    if (m) { phrase = (m[1] || m[2] || '').trim(); lang = m[3].toLowerCase(); }
    else {
      const m2 = text.match(/how do (?:you|i) say\s+(?:["'](.+?)["']|(.+?))\s+in\s+([a-z]+)(?:\?|\.|$)/i);
      if (m2) { phrase = (m2[1] || m2[2] || '').trim(); lang = m2[3].toLowerCase(); }
    }
    if (!phrase || !lang) return '';
    const target = TRANSLATE_LANGS[lang] || (lang.length === 2 ? lang : null);
    if (!target) return '';
    try {
      const res = await fetch('https://libretranslate.de/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: phrase, source: 'auto', target, format: 'text' }),
      });
      if (!res.ok) return '';
      const j = await res.json();
      if (!j?.translatedText) return '';
      return `TRANSLATION (LibreTranslate) — "${phrase}" in ${lang}: "${j.translatedText}"`;
    } catch { return ''; }
  },
};

const VOICE_PLUGINS = [
  weatherPlugin, calcPlugin, currencyPlugin, definePlugin, wikiPlugin,
  timePlugin, airQualityPlugin, cryptoPlugin, stockPlugin, newsPlugin,
  translatePlugin,
];

// Run every plugin in parallel; collect non-empty blocks. Each plugin must be
// fast (<2s) and robust to bad input — failures are swallowed so a broken
// plugin can never block the voice loop.
async function runVoicePlugins(text, ctx) {
  const results = await Promise.all(VOICE_PLUGINS.map(async (p) => {
    try {
      const block = await p.run(text, ctx);
      if (block) console.warn('[voicemate] plugin', p.name, 'matched');
      return block || '';
    } catch (err) {
      console.warn('[voicemate] plugin', p.name, 'error:', err);
      return '';
    }
  }));
  return results.filter(Boolean).join('\n\n');
}

function stripMarkdownForTTS(s) {
  if (!s) return '';
  return String(s)
    // Code fences/blocks — describe rather than read aloud.
    .replace(/```[\s\S]*?```/g, ' code block omitted ')
    .replace(/`([^`]+)`/g, '$1')
    // Markdown emphasis (bold/italic), strikethrough, headings, list bullets.
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    // Markdown links: keep label, drop URL.
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Naked URLs — TTS reads them letter by letter ("h-t-t-p-s colon slash").
    // Just drop them; the chat UI shows citations separately.
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bwww\.[^\s)]+/gi, '')
    // Citation markers: [1], [12], [1,2], [1-3], 【1†source】 (Responses API).
    .replace(/\[\s*\d+(?:\s*[,-]\s*\d+)*\s*\]/g, '')
    .replace(/【[^】]*】/g, '')
    // Source attributions in parens at the end of sentences:
    // "(source: nytimes.com)", "(via reuters.com)".
    .replace(/\((?:source|via|from)[^)]{0,80}\)/gi, '')
    // Emojis & misc symbol pictographs — TTS verbalizes them inconsistently.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    // Em/en dashes → comma so TTS pauses naturally instead of saying "dash".
    .replace(/\s*[—–]\s*/g, ', ')
    // Footnote-style superscripts: ¹²³ etc.
    .replace(/[²³¹⁰⁴-⁹]+/g, '')
    // Collapse leftover whitespace and punctuation runs.
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}
