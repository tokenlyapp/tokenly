// What's new — pulls release notes from GitHub Releases (tokenlyapp/tokenly)
// via the `changelog:get` IPC. Renders a tight subset of GitHub-flavored
// markdown without taking on a markdown dep: headers, bold, inline code,
// links, bullets, blockquotes. Anything fancier (tables, images) renders as
// plain text — fine for our release-notes shape.

function formatPublishedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Inline-formatting pass: bold, code, links. Returns an array of React nodes.
function renderInline(text, t, openExternal, keyPrefix = 'i') {
  // Walk a tiny token list. We do bold (**), code (`), then links ([t](u)).
  // To keep it simple we do them in a single regex that captures one token
  // per match in priority order.
  const out = [];
  let i = 0, idx = 0;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > i) out.push(text.slice(i, m.index));
    if (m[1]) out.push(<strong key={`${keyPrefix}-b-${idx++}`}>{m[2]}</strong>);
    else if (m[3]) out.push(
      <code key={`${keyPrefix}-c-${idx++}`} style={{
        background: 'rgba(255,255,255,0.06)',
        padding: '1px 5px', borderRadius: 4,
        fontFamily: TOKENS.type.mono, fontSize: 10.5,
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

// Block-level pass. Splits on blank lines into paragraphs; recognizes
// `# / ## / ### / ####` headers and `- ` / `* ` bullet runs.
function renderMarkdown(md, t, openExternal) {
  if (!md) return null;
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blank line → block separator
    if (!line.trim()) { i++; continue; }

    // Header
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const sizes = { 1: 14, 2: 13, 3: 12, 4: 11.5 };
      const weights = { 1: 700, 2: 700, 3: 600, 4: 600 };
      const margins = { 1: '14px 0 6px', 2: '12px 0 6px', 3: '10px 0 4px', 4: '8px 0 4px' };
      blocks.push(
        <div key={`h-${i}`} style={{
          fontSize: sizes[level], fontWeight: weights[level],
          color: t.text, margin: margins[level], lineHeight: 1.3,
        }}>
          {renderInline(h[2], t, openExternal, `h${i}`)}
        </div>
      );
      i++;
      continue;
    }

    // Blockquote — note style
    if (line.startsWith('>')) {
      const text = line.replace(/^>\s?/, '');
      blocks.push(
        <div key={`q-${i}`} style={{
          background: 'rgba(124,92,255,0.08)',
          borderLeft: `2px solid ${t.accent}`,
          padding: '6px 10px', borderRadius: '0 6px 6px 0',
          fontSize: 11, color: t.textDim,
          margin: '8px 0', lineHeight: 1.5,
        }}>
          {renderInline(text, t, openExternal, `q${i}`)}
        </div>
      );
      i++;
      continue;
    }

    // Bullet run (consume contiguous bullet lines)
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} style={{
          margin: '4px 0 8px', paddingLeft: 18,
          fontSize: 11.5, color: t.textDim, lineHeight: 1.55,
        }}>
          {items.map((it, j) => (
            <li key={j} style={{ marginBottom: 3 }}>{renderInline(it, t, openExternal, `li${i}-${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph (consume contiguous non-blank, non-special lines)
    const paraLines = [];
    while (i < lines.length && lines[i].trim()
      && !/^(#{1,4})\s/.test(lines[i])
      && !/^\s*[-*]\s+/.test(lines[i])
      && !lines[i].startsWith('>')) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`p-${i}`} style={{
        fontSize: 11.5, color: t.textDim, lineHeight: 1.55,
        margin: '6px 0',
      }}>
        {renderInline(paraLines.join(' '), t, openExternal, `p${i}`)}
      </p>
    );
  }
  return blocks;
}

function ChangelogSheet({ open, onClose, currentVersion, onMarkSeen }) {
  const t = TOKENS.color;
  const [releases, setReleases] = React.useState(null); // null = loading
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    if (!open || !window.api?.getChangelog) return;
    setReleases(null); setErr(null);
    window.api.getChangelog().then((data) => {
      if (!Array.isArray(data) || !data.length) {
        setReleases([]);
        if (!Array.isArray(data)) setErr('Could not reach GitHub. Check your connection.');
      } else {
        setReleases(data);
      }
    }).catch((e) => { setReleases([]); setErr(String(e && e.message || e)); });
  }, [open]);

  // Mark the current version as "seen" the first time the user opens the
  // sheet on this version. Hides the post-update banner from now on.
  React.useEffect(() => {
    if (open && currentVersion && onMarkSeen) onMarkSeen(currentVersion);
  }, [open, currentVersion, onMarkSeen]);

  const onOpenExternal = (url) => window.api?.openExternal?.(url);

  return (
    <React.Fragment>
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .2s', zIndex: 70,
        }}
      />
      <section style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(180deg, #15151f 0%, #0d0d14 100%)',
        borderTop: `1px solid ${t.cardBorderStrong}`,
        borderRadius: '16px 16px 0 0',
        padding: '10px 16px 22px',
        transform: open ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform .25s cubic-bezier(0.2, 0.9, 0.3, 1)',
        zIndex: 80,
        maxHeight: '95%', overflowY: 'auto',
      }}>
        <SheetMinimize onClick={onClose} />

        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>What's new</div>
            <div style={{ fontSize: 10.5, color: t.textMute, marginTop: 2 }}>
              Release notes pulled live from GitHub.
            </div>
          </div>
          {currentVersion && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
              color: t.textDim,
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${t.cardBorder}`,
              borderRadius: 999, padding: '2px 8px',
              fontVariantNumeric: 'tabular-nums',
            }}>v{currentVersion}</span>
          )}
        </div>

        {releases === null && (
          <div style={{ padding: '18px 4px', fontSize: 11, color: t.textDim }}>Loading…</div>
        )}
        {releases && releases.length === 0 && (
          <div style={{ padding: '18px 4px', fontSize: 11, color: t.textDim }}>
            {err || 'No releases yet.'}
          </div>
        )}
        {releases && releases.map((r) => {
          const isCurrent = currentVersion && r.version === currentVersion;
          return (
            <div key={r.tag} style={{
              background: t.card, border: `1px solid ${isCurrent ? t.accent + '55' : t.cardBorder}`,
              borderRadius: 12, padding: '12px 14px 14px', marginBottom: 10,
              boxShadow: isCurrent ? `0 0 0 1px ${t.accent}22` : 'none',
            }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 8, marginBottom: 4,
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em',
                  color: isCurrent ? t.accent : t.text,
                }}>
                  {r.title || r.tag}
                  {isCurrent && (
                    <span style={{
                      marginLeft: 8, fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                      color: t.accent,
                      background: 'rgba(124,92,255,0.16)',
                      border: `1px solid ${t.accent}55`,
                      borderRadius: 999, padding: '1px 6px',
                      verticalAlign: 1,
                    }}>YOU'RE ON THIS</span>
                  )}
                  {r.prerelease && !isCurrent && (
                    <span style={{
                      marginLeft: 8, fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                      color: t.amber,
                      background: 'rgba(251,191,36,0.10)',
                      border: `1px solid ${t.amber}44`,
                      borderRadius: 999, padding: '1px 6px',
                      verticalAlign: 1,
                    }}>PRERELEASE</span>
                  )}
                </div>
                <div style={{
                  fontSize: 10, color: t.textMute, flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}>{formatPublishedAt(r.publishedAt)}</div>
              </div>
              <div>
                {renderMarkdown(r.body, t, onOpenExternal)}
              </div>
              {r.url && (
                <div style={{ marginTop: 8 }}>
                  <a href={r.url}
                    onClick={(e) => { e.preventDefault(); onOpenExternal(r.url); }}
                    style={{
                      fontSize: 10, color: t.textDim,
                      textDecoration: 'none', borderBottom: `1px solid ${t.textMute}55`,
                    }}>View on GitHub →</a>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </React.Fragment>
  );
}

window.ChangelogSheet = ChangelogSheet;
