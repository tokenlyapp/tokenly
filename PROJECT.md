# Tokenly — Project Memory

> Live monitor for AI spend across Claude Code, Codex, OpenAI, Anthropic, and OpenRouter. macOS menu-bar app. Keys stay on your Mac.

This document is the complete build record as of the first public release. Read it before making architectural changes — it captures hard-won context that's easy to re-break.

---

## 1. Brand & positioning

| | |
|---|---|
| **Name** | Tokenly |
| **Domain** | [trytokenly.app](https://trytokenly.app) |
| **Tagline** | Live monitor for AI spend |
| **Price** | $1.99 one-time |
| **Target platform** | macOS 13+ (universal: Apple Silicon + Intel) |
| **App bundle ID** | `app.tokenly.desktop` |
| **Primary category** | Developer Tools |

**Positioning statement:** *"Every token and dollar your AI tools consumed — live, in your menu bar, with keys that never leave your Mac."*

Two distinct audiences:
1. **Solo devs on Claude Max / ChatGPT Team** — want to see subscription ROI via list-price tokens/dollars
2. **Startups with OpenAI/Anthropic Admin keys** — want to see authoritative API spend

Tokenly serves both by clearly labeling each card as either *"list-price estimate"* (amber, tokens-first) or *"actual billed spend"* (green, dollars-first).

---

## 2. Architecture

Three independent pieces, each deployed separately:

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│   macOS Desktop App  │     │   Marketing Site     │     │  Checkout + Delivery │
│   (Electron)         │     │   (Netlify static)   │     │  (Netlify Edge Fn)   │
│                      │     │                      │     │                      │
│ • Tray + popover     │     │ • Landing page       │     │ • Verify Stripe      │
│ • Local JSONL parser │     │ • Stripe buy buttons │     │ • Stream DMG from    │
│ • Admin API fetchers │     │ • Thank-you page     │     │   Netlify Blobs      │
│ • safeStorage keys   │     │ • OG preview + SEO   │     │ • 72h re-dl ledger   │
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
  /Users/adowney/Documents/    /Users/adowney/Downloads/    (deployed w/ site)
  LLM Usage Dash/              tokenly-netlify/
```

These are **intentionally decoupled**: the app talks to providers directly, never to our servers. The site never sees a user's API keys. The Edge Function only handles delivery.

---

## 3. The macOS app (`/Users/adowney/Documents/LLM Usage Dash/`)

### Tech stack

- **Electron 33** — the runtime. Universal binary.
- **React 18 + Babel Standalone** — UI, compiled at runtime in the renderer. Kept in-browser so we can iterate on components without a build step.
- **macOS `safeStorage`** — encrypts every saved API key using the OS keychain.
- **macOS `fs.watch`** — recursive watchers on `~/.claude/projects/` and `~/.codex/sessions/` for sub-second refresh.
- **No native modules** — we tried `better-sqlite3` early on, removed after moving to rollout-JSONL parsing. Keeps packaging simple.

### File layout

```
LLM Usage Dash/
├── main.js                     # Electron main process: tray, windows, IPC, all provider fetchers
├── preload.js                  # Safe bridge exposing window.api to renderer
├── index.html                  # Renderer shell with React CDN + Babel transforms
├── styles.css                  # Global CSS reset + keyframes
├── package.json                # electron-builder config lives here
├── icon.icns                   # Packaged app icon (generated from build/icon.svg)
├── icon.png                    # 1024² master used for dock + window icons
├── favicon-{16,32,64}.png      # Web favicons (from icon.svg)
├── apple-touch-icon.png        # 180² iOS homescreen
├── build/
│   ├── icon.svg                # Vector master: squircle + violet/cyan T + cyan pulse dot
│   ├── icon.iconset/           # 12 macOS sizes for iconutil
│   ├── tray-template.svg       # 22px monochrome menu-bar glyph
│   ├── tray-template.png       # 22×22 (1x) rendered for packaging
│   ├── tray-template@2x.png    # 44×44 (Retina)
│   └── entitlements.mac.plist  # Hardened Runtime + network client entitlements
├── app/components/
│   ├── tokens.js               # Design tokens (colors per provider, type scale, radii)
│   ├── atoms.jsx               # ProviderBadge, InfoTip, icons, PROVIDERS list, format helpers
│   ├── ProviderCard.jsx        # The collapsible card for each provider
│   ├── SettingsSheet.jsx       # Bottom-sheet with API key inputs
│   └── App.jsx                 # Root component — tray orchestration, refresh loop, state
├── assets/
│   ├── anthropic.svg openai.svg codex.svg openrouter.svg  # Brand logos (SVG)
│   └── deepseek.svg gemini.svg perplexity.svg  # Pulled in earlier explorations; unused now
└── marketing/
    ├── LISTING.md              # Mac App Store listing copy (for future MAS submission)
    └── screenshots.html        # 5 styled App Store screenshot mockups at 2880×1800
```

### Runtime data flow

```
                      ┌──────────── USER OPENS APP ────────────┐
                      │                                        │
                      ▼                                        │
             Tray icon created                          Optional dock icon
             (template PNG auto-tinted by macOS)        for detached window
                      │
                      ▼
            Popover window created (hidden, 460×640)
                      │
                      ▼
      ┌──── Renderer loads index.html → boots React ────┐
      │                                                  │
      │  App.jsx mounts → runs refreshAll()              │
      │                                                  │
      │   ┌───────────────────┴──────────────────┐       │
      │   ▼                                      ▼       │
      │ window.api.getKeyMeta()         window.api.fetchUsage(p, days)
      │   │                                      │       │
      │   ▼                                      ▼       │
      │ ipcMain loadKeys() decrypts        ipcMain dispatches:
      │ from keys.enc (safeStorage)        • claude-code → fetchClaudeCodeLocal()
      │                                    • codex → fetchCodexLocal()
      │                                    • openai → fetchOpenAI() [HTTPS]
      │                                    • anthropic → fetchAnthropic() [HTTPS]
      │                                    • openrouter → fetchOpenRouter() [HTTPS]
      │                                            │
      │                                            ▼
      │                              Result cached in fetchCache (8s TTL)
      │                              Overlapping requests coalesced via fetchInflight
      │                                            │
      └────── setUsage() → render cards ◀──────────┘
                      │
                      ▼
      fs.watch fires on new JSONL write
              (Claude Code / Codex) → 5s debounce → refresh-now IPC
                      │
                      ▼
              Auto-refresh every 30s (60s for 90d/180d)
              Paused when window hidden (visibilityState check)
```

### Provider-specific fetchers

| Provider | Source | Shape | Notes |
|---|---|---|---|
| **Claude Code** | Streams `~/.claude/projects/**/*.jsonl` line-by-line via `readline` | Each line is a JSON event; we keep only `type: "assistant"` with `message.usage` | Dedups by `message.id`. Filters by `timestamp` to window. Pre-filters files by `mtime`. **Streaming required** — conversation files can exceed V8's string limit. |
| **Codex** | Streams `~/.codex/sessions/**/*.jsonl` and `~/.codex/archived_sessions/*.jsonl` | Tracks `currentModel` from `turn_context` events; reads `event_msg.payload.type === "token_count"` for `last_token_usage` | Dedups by `session_meta.payload.id`. **The `logs_2.sqlite` was a dead end** — it's an OTel buffer that only captures ~1% of real usage. Rollout JSONL is the source of truth. |
| **OpenAI API** | `GET /v1/organization/usage/completions` + `/v1/organization/costs` | Paginated (max 31 buckets/page); totals from `/costs` grouped by `line_item` | Requires **Admin API key** (sk-admin-…). Regular project keys 403. Costs in **dollars** as `amount.value` string. |
| **Anthropic API** | `GET /v1/organizations/usage_report/messages` + `/cost_report` | Paginated; amounts returned as plain strings on `amount` (not nested .value) | Requires **Admin Key** (sk-ant-admin…). **Amount is in CENTS**, not dollars — must divide by 100. This was the second-biggest bug we caught. |
| **OpenRouter** | `GET /api/v1/activity` | Per-day, per-model rows with `usage` (USD), `prompt_tokens`, `completion_tokens`, `reasoning_tokens` | Requires **Management key** (not a regular API key). Data aggregates by completed UTC day — today's usage appears tomorrow. |

### Local-source cost calculation

Tokens come free from local logs, but dollar amounts require multiplication against published pricing. Tables live in `main.js`:

- `CLAUDE_PRICING` — per-million-token rates for Claude model families (Opus 4.x = $5/$25 after the April 2026 price drop)
- `OPENAI_PRICING` — per-million-token rates (gpt-5.4 = $2.50/$15, gpt-5.4-codex = $1.25/$10, etc.)

Cache math:
- **Anthropic 5m cache write**: 1.25× input
- **Anthropic 1h cache write**: 2× input
- **Anthropic cache read**: 0.1× input
- **OpenAI cached input**: 0.1× input

Output tokens from OpenAI **already include reasoning tokens** — do not add `reasoning_token_count` separately or you double-count.

### Key storage

- Storage location: `~/Library/Application Support/Tokenly/keys.enc`
- Encryption: `safeStorage.encryptString()` — AES via macOS Keychain access
- Decryption path: only the app bundle with the matching code signature can decrypt. Re-signing invalidates the ACL and prompts the user again on next launch.
- Allowed providers hard-coded: `['openai', 'anthropic', 'openrouter']` (claude-code + codex are keyless). Unknown keys are pruned on every load.

### Window management

**Tray-first pattern:** app boots into a popover mode by default. Clicking the tray icon toggles visibility. Right-click opens a context menu (Toggle Popover / Open Desktop Window / Refresh / Quit).

- **Popover**: 460×640, frameless, alwaysOnTop, auto-hides on blur, positioned under the tray icon via `getBoundingClientRect` clamping
- **Desktop window**: 460×720, traffic lights, resizable, minimizable to tray
- User preference (`prefersDesktop`) persists in `~/Library/Application Support/Tokenly/prefs.json`

### UI behavioral details

- **Badge style** — `BadgeStyleContext` lets users switch between colored-initial monograms and brand-SVG logos (Settings → Appearance). Preference in `localStorage`.
- **Range picker** — segmented control across 6 ranges. Version counter (`refreshVersionRef`) invalidates stale in-flight fetches when the user switches ranges mid-refresh.
- **Loading state** — cards show violet-tinted `llm-skel-accent` shimmer specifically sized to the primary counter (wider for local cards, narrower for API cards). The tray-style pulse dot replaces the status indicator.
- **Freshness badge** — green pill with live-ticking "just now" / "8s ago" / "2m ago" label. Ticks every second via a separate `nowTick` state.
- **InfoTip tooltips** — `ReactDOM.createPortal` to `document.body` so they escape card overflow + scroll containers. Position computed via `getBoundingClientRect` clamped to 8px from viewport edges.

### Stability layers

Layered to tolerate the "while Claude writes to disk, we're watching Claude write to disk" feedback loop:

1. **Main-process cache** (`fetchCache`, 8s TTL) — repeat `(provider, days)` calls return cached value.
2. **In-flight coalescing** (`fetchInflight`) — concurrent identical fetches share one promise.
3. **Renderer version counter** — stale fetch results from prior ranges are silently dropped.
4. **Structural-equality short-circuit on `setUsage`** — identical payloads skip React re-renders entirely.
5. **fs.watch debounce** — 5-second windows so bursts collapse to one refresh.
6. **Visibility-gated polling** — `document.visibilityState !== 'visible'` pauses the 30s poll entirely.
7. **Hard 2 GB file size cap** — individual rollout JSONL files above this are skipped rather than attempted. Catches pathological cases.
8. **Streaming file reads** (`readline.createInterface`) — memory usage stays one-line-at-a-time regardless of file size. Required — one of the user's Codex rollout files was 1.1 GB.

---

## 4. Marketing site (`/Users/adowney/Downloads/tokenly-netlify/`)

Static HTML + React rendered in-browser via Babel Standalone. Hosted on Netlify.

```
tokenly-netlify/
├── index.html                  # Shell + React CDN + meta tags + SEO schemas
├── thank-you.html              # Post-purchase page: fetches /api/download
├── components/
│   ├── App.jsx                 # Landing page (Nav → Hero → Showcase → Features → FAQ → CTA)
│   ├── StripeSheet.jsx         # (legacy, unused) mock payment modal
│   ├── MockDashboard.jsx       # Live-preview dashboard inside the marketing hero
│   └── tokens.js               # Design tokens (shared with app for 1:1 visual match)
├── site-assets/
│   ├── icon.svg                # Squircle app icon
│   ├── og-image.svg            # OG preview source (1200×630)
│   ├── og-image.png            # OG rendered PNG (used by all social platforms)
│   ├── anthropic.svg openai.svg codex.svg openrouter.svg  # Brand logos
│   └── provider-{id}.svg       # Alternate provider icons (for dashboard preview)
├── app-components/             # Copy of app/components/ so the hero iframe renders the REAL app UI
├── app-mock.html               # Iframe-loaded mock that stubs window.api with fake data
├── netlify/
│   └── edge-functions/
│       └── download.mjs        # Stripe verify + stream DMG from Netlify Blobs
├── netlify.toml                # Publish config, redirects, headers
├── sitemap.xml                 # Submitted to Google Search Console
├── robots.txt                  # Allow all; disallow /api/ and /thank-you.html
├── package.json                # Stripe + @netlify/blobs deps (for the edge function)
└── _deprecated/ (if any)
```

### Landing-page flow

1. **Nav** — sticky, blurs on scroll. Logo → `Tokenly` → Features / FAQ / Buy
2. **Hero** — the centerpiece. Headline with violet→cyan gradient, badge copy *"NEW · v1.0"*, Buy button ($1.99), "See how it works" link, four trust badges
3. **Showcase** — `MenuBarFrame` wraps an `<iframe src="app-mock.html">` that renders the real ProviderCard tree against stubbed data. Changes to the actual app JSX propagate by re-copying `app-components/`.
4. **Features** — 2×2 grid on tablet+, stacked on mobile. Four cards: Zero setup · Freshness · Honesty · Security
5. **Providers strip** — logos + what-we-read line per provider
6. **How it works** — 3 numbered steps (Download → Paste keys → Watch)
7. **FAQ** — accordion of common questions
8. **Final CTA** — restates price + Buy button

### SEO + social

- **Open Graph + Twitter Cards** — both point to `https://trytokenly.app/site-assets/og-image.png` (1200×630 showing the app popover with no marketing copy; title/description are owned by meta tags)
- **Schema.org JSON-LD** — three blocks: `SoftwareApplication` (price, platform, features), `Organization` (brand logo for Knowledge Panel), `WebSite` (canonical URL)
- **sitemap.xml** — single URL entry with embedded `image:image` referencing the OG preview
- **robots.txt** — allows all; disallows `/api/`, `/.netlify/`, and `/thank-you.html`

### Security + performance headers (`netlify.toml`)

- `X-Frame-Options: SAMEORIGIN` (allows own iframe; blocks external embedding)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: payment=(self)` (enables Apple Pay; disables others)
- `Cache-Control: public, max-age=31536000, immutable` on `/site-assets/*`
- `www.trytokenly.app → trytokenly.app` 301 redirect

---

## 5. Checkout + delivery (the hardest part)

### The flow

```
User clicks "Buy $1.99" → STRIPE_CHECKOUT_URL (set in components/App.jsx)
    ↓
Stripe Checkout (hosted by Stripe — no code on our end)
    ↓
Payment succeeds → Stripe redirects to success_url:
    https://trytokenly.app/thank-you.html?session_id={CHECKOUT_SESSION_ID}
    ↓
thank-you.html runs JavaScript → fetch('/api/download?session_id=...')
    ↓
Netlify Edge Function at netlify/edge-functions/download.mjs:
    1. Reads session_id from URL params
    2. Calls Stripe API: GET /v1/checkout/sessions/{id}
       (auth: STRIPE_SECRET_KEY from Netlify env vars)
    3. Checks session.payment_status === 'paid'
    4. Checks Netlify Blob "redemptions/{session_id}":
         - If no record: record firstUsed timestamp
         - If exists and <72h old: allow re-download
         - If >72h: return 410 Gone
    5. Fetches blob "downloads/Tokenly.dmg" as a stream
    6. Returns the stream as application/octet-stream with
       Content-Disposition: attachment; filename="Tokenly.dmg"
    ↓
Browser receives the stream → writes to ~/Downloads/Tokenly.dmg
```

### Critical gotchas we hit

1. **Netlify Lambda Functions cap responses at 6 MB** — the DMG is 184 MB. **Must use Edge Functions** (`netlify/edge-functions/`) which support unlimited streaming. Symptom: DMG "downloads" but opens as "corrupted disk image."
2. **`netlify blobs:set <store> <key> <path-string>`** stores the path **as a literal string**, not the file contents. Must use `--input <path>` flag to upload the file bytes. Symptom: downloaded DMG is ~70 bytes of text.
3. **`{CHECKOUT_SESSION_ID}` is a literal** — Stripe substitutes it automatically. Don't URL-encode or transform it in the Payment Link config.
4. **Test-mode Payment Links don't work with live secret keys** (and vice versa). When switching to Live mode, regenerate the Payment Link AND swap `STRIPE_SECRET_KEY` env var together.

### Required env vars (set via `netlify env:set`)

- `STRIPE_SECRET_KEY` — starts with `sk_test_` (test mode) or `sk_live_` (production). Must match the mode of your Payment Link.

### Required Netlify Blobs stores

- `downloads` — contains `Tokenly.dmg` (~184 MB)
- `redemptions` — JSON records `{ firstUsed, email }` keyed by Stripe session_id

### Security properties of this flow

✓ DMG URL is **not publicly accessible** — no direct path exists.
✓ Every download requires a valid Stripe `session_id` tied to a paid session.
✓ Stripe session IDs are unguessable (high-entropy tokens).
✓ Re-downloads are allowed for 72h, then permanently blocked — even if a paid session_id leaks, its usefulness expires.
✓ Pushing a new DMG version invalidates all prior shared links (every buyer re-downloads on new versions; pirates don't).

---

## 6. How shipping works end-to-end

### Building a new release of the app

```bash
cd "/Users/adowney/Documents/LLM Usage Dash"

# Bump version
npm version patch   # or minor / major

# Load Apple credentials (stored in .env.local, gitignored)
source .env.local
# Variables: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID

# Build + sign + notarize + staple in one command
npm run dist

# Output: dist/Tokenly-X.Y.Z-universal.dmg (signed, notarized, stapled, ~184 MB)

# Verify before distributing
codesign --verify --verbose=2 "dist/mac-universal/Tokenly.app"
spctl --assess --verbose "dist/mac-universal/Tokenly.app"
xcrun stapler validate "dist/Tokenly-*.dmg"
# All three should pass with "source=Notarized Developer ID"
```

### Uploading a new DMG to production

```bash
cd ~/Downloads/tokenly-netlify

# Upload to Netlify Blobs (replaces the existing blob)
netlify blobs:set downloads Tokenly.dmg \
  --input "/Users/adowney/Documents/LLM Usage Dash/dist/Tokenly-X.Y.Z-universal.dmg"

# Verify upload
netlify blobs:get downloads Tokenly.dmg --output /tmp/verify.dmg
ls -lh /tmp/verify.dmg  # should be ~184 MB
file /tmp/verify.dmg    # should say "zlib compressed data"
```

No site redeploy needed — the Edge Function reads from the blob on every request.

### Publishing site changes

```bash
cd ~/Downloads/tokenly-netlify

# Deploy the current folder to production
netlify deploy --prod
```

### The complete Stripe → live setup (one-time)

1. Stripe Dashboard → Products → Add product → $1.99 one-time
2. Create Payment Link. After-payment settings: *Don't show confirmation page → Redirect to URL*. URL: `https://trytokenly.app/thank-you.html?session_id={CHECKOUT_SESSION_ID}`
3. Copy the `https://buy.stripe.com/...` URL
4. Open `components/App.jsx`. Replace `STRIPE_CHECKOUT_URL = 'https://buy.stripe.com/REPLACE_ME'` with the real URL
5. `netlify env:set STRIPE_SECRET_KEY "sk_live_..."`
6. `netlify deploy --prod`
7. Test one purchase end-to-end with a real card (refund immediately from Stripe Dashboard)

---

## 7. Pricing table maintenance

These live in `main.js` and must be updated when providers announce price changes.

### Current (April 2026)

**Claude (`CLAUDE_PRICING`)** — per million tokens, standard tier:
| Model family | Input | Output |
|---|---|---|
| Opus 4.5+ | $5 | $25 |
| Opus 4.0–4.4 | $5 | $25 |
| Sonnet 4.x | $3 | $15 |
| Haiku 4.5 | $1 | $5 |
| Haiku 4.0–4.4 | $0.80 | $4 |
| 3.7 Sonnet | $3 | $15 |
| 3.5 Sonnet | $3 | $15 |
| 3.5 Haiku | $0.80 | $4 |
| 3 Opus | $15 | $75 |
| 3 Haiku | $0.25 | $1.25 |

**OpenAI (`OPENAI_PRICING`)** — per million tokens:
| Model family | Input | Output |
|---|---|---|
| gpt-5.4-codex | $1.25 | $10 |
| gpt-5.4-mini | $0.25 | $2 |
| gpt-5.4 | $2.50 | $15 |
| gpt-5-codex | $1.25 | $10 |
| gpt-5-mini | $0.25 | $2 |
| gpt-5 | $1.25 | $10 |
| o1-mini | $1.10 | $4.40 |
| o1 | $15 | $60 |
| gpt-4.1-mini | $0.40 | $1.60 |
| gpt-4.1 | $2 | $8 |
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-4o | $2.50 | $10 |

### When a provider changes pricing

1. Update the relevant `*_PRICING` table in `main.js`
2. Bump app version: `npm version patch`
3. Rebuild + re-upload blob (see shipping section)
4. Users who refresh after update pick up new prices automatically — **historical windows re-compute at the new prices on every refresh**, so prior days re-price themselves. That's intentional; it means the list-price estimate always reflects *current* list prices, which is the most useful baseline for subscription-ROI decisions.

### Cache / reasoning multipliers (rarely change)

- Anthropic 5m cache write: 1.25× input
- Anthropic 1h cache write: 2× input
- Anthropic cache read: 0.1× input
- OpenAI cached input: 0.1× input
- OpenAI reasoning: already included in `output_tokens` — do not add separately

---

## 8. Non-obvious bugs we've hit (so we don't hit them again)

| Bug | Root cause | Fix |
|---|---|---|
| Anthropic showed $843 instead of $8.48 | `amount` returned as string **in cents**, not dollars | Divide `amount` by 100 in `readAmount()` |
| Anthropic showed $0 after fix attempts | My reader was looking for `amount.value` — Anthropic returns `amount` as a bare string | `readAmount()` handles both `string` and `{value, currency}` shapes |
| Codex showed $0.11 (should have been hundreds) | `logs_2.sqlite` is an OTel buffer that misses 99% of events | Read `sessions/**/*.jsonl` rollouts instead |
| Codex crashed app with SIGTRAP | One rollout file was 1.1 GB — exceeded V8 string limit via `fs.readFileSync` | Stream with `readline.createInterface` over `fs.createReadStream` |
| Claude Code cost was 3× too high | Opus 4.x priced at old Opus 3 rates ($15/$75 instead of $5/$25) | Updated `CLAUDE_PRICING` |
| OpenAI 90d/180d returned HTTP 400 | `limit` parameter hard-capped at 31 | Keep `limit: 31`, let pagination walk the rest |
| Money rendered as `$00.074495000000000000...` | OpenAI returns `amount.value` as a string; I did `0 + "0.074"` → string concat | `Number(...)` wrap + `Number.isFinite` guard |
| Range switches stuck on stale 180d data | Renderer in-flight lock didn't account for `days` changing | Replaced with version counter that invalidates stale fetches |
| Tray icon missing after DMG install | `directories.buildResources: "build"` excludes `build/` from app bundle | `extraResources` entry + multi-path loader in `makeTrayIcon()` |
| DMG "corrupted" after Stripe checkout | Netlify Lambda Functions cap responses at 6 MB | Use Edge Functions — unlimited streaming |
| Blob upload stored the path as a string | `netlify blobs:set` without `--input` treats arg as value | Always pass `--input <path>` for binary files |
| Site app preview blank after security header update | `X-Frame-Options: DENY` blocks all iframes, including own | Change to `SAMEORIGIN` |
| Popover blurs-and-hides immediately at launch | Launching from Terminal focuses Terminal; popover loses focus | Debounce blur handler — ignore events <250ms after toggle |

---

## 9. Intentional non-features

Listed here so they don't sneak back in as requests.

- **No Antigravity integration.** We confirmed in April 2026 that Antigravity (Google's agentic IDE) does not persist conversation or token data locally. Probe path: `~/Library/Application Support/Antigravity/` — all `state.vscdb` files contain only VS Code UI state, `chat.ChatSessionStore.index` stays empty during active use, IndexedDB is empty, `~/.antigravity/` holds only config, and `storage.json` contains `antigravityUnifiedStateSync.*` markers indicating server-side state sync. The 4.7MB `blob_storage/*/0` file we inspected is VS Code's localization cache, not agent data. No path to their usage data without an enterprise-OAuth'd Google Cloud Billing flow we can't ship.
- **No Cursor integration.** Cursor's `state.vscdb` can grow to 25GB+ of opaque JSON blobs without clean per-turn token fields. Their own cursor.com dashboard is the authoritative billing view and has no public API.
- **No analytics, telemetry, or crash reporting.** Zero external calls except to provider APIs the user configured.
- **No account system.** No login, no server-side profile, no sync across devices.
- **No per-session OAuth to consumer ChatGPT / Claude.ai.** Scraping web session cookies is against both providers' ToS and breaks on every UI redesign.
- **No "rate alerts" email/SMS.** Would require a backend; first version is purely client-side.
- **No CSV export in v1.** See ROADMAP.md for when.
- **No Mac App Store version in v1.** Requires app sandbox rework. Direct DMG distribution is faster, fully controlled, and higher-margin.
- **No Windows or Linux builds.** Electron supports both but the entire source material (Claude Code, Codex, tray idioms) is macOS-centric for v1.

---

## 10. Key credentials & where they live

| Credential | Location | Used by |
|---|---|---|
| Apple Developer ID cert | macOS Keychain (installed via Xcode → Settings → Accounts) | `electron-builder` (auto-discovered) |
| `APPLE_ID` | `.env.local` in app repo (gitignored) | Notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | `.env.local` in app repo | Notarization |
| `APPLE_TEAM_ID` | `.env.local` in app repo | Notarization |
| `STRIPE_SECRET_KEY` | Netlify env vars (set via `netlify env:set`) | Edge Function session verification |
| User's provider API keys | macOS Keychain via `safeStorage`, encrypted as `~/Library/Application Support/Tokenly/keys.enc` | App runtime |

**Never commit any of the above to git.** `.gitignore` already covers `.env`, `.env.local`, and `dist/`.
