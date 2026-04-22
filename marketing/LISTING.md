# Tokenly — Mac App Store / Landing Page Copy

All copy is sized to App Store character limits. Same copy works for the DMG landing page, Setapp, and Product Hunt.

---

## Basic identity

- **App Name** (30 chars): `Tokenly`
- **Subtitle** (30 chars): `Live monitor for AI spend`
- **Bundle ID**: `app.tokenly.desktop`
- **Primary Category**: Developer Tools
- **Secondary Category**: Productivity
- **Age Rating**: 4+
- **Copyright**: `© 2026 Tokenly. All rights reserved.`

---

## Promotional text (170 chars — update any time without review)

```
Real-time token + cost tracking for Claude Code, Codex, OpenAI, Anthropic, and OpenRouter — all in your menu bar. Keys stay on your Mac.
```

---

## Description (4,000 chars — what appears on the App Store page)

```
Tokenly is a live monitor for your AI spend. It sits in your Mac menu bar and shows exactly how many tokens and dollars each model is costing you — across every AI tool you use — updating in real time.

It reads local usage data from Claude Code and Codex directly (no API key needed), and pulls authoritative cost reports from OpenAI, Anthropic, and OpenRouter via their official Admin APIs. Tokens and dollars are broken down per model, per day, with a trend sparkline so you can see spikes at a glance.

— FIVE PROVIDERS, ONE GLASS —

• Claude Code — reads ~/.claude/projects/ directly. Every turn, every model, every cache token. Zero setup, updates the moment Claude finishes a message.
• Codex — reads ~/.codex/sessions/ rollouts. Handles ChatGPT Team/Pro/Plus subscription usage that the OpenAI API dashboard never shows.
• OpenAI API — authoritative billed spend via the Admin Usage/Costs endpoint, grouped by line item (chat, embeddings, images, audio).
• Anthropic API — authoritative spend via the Admin Cost Report. Cached inputs, cache writes, cache reads all accounted for.
• OpenRouter — unified activity across 300+ routed models, with per-model dollar amounts.

— TWO DIFFERENT TRUTHS, CLEARLY LABELED —

Your local tools (Claude Code, Codex) bill through a subscription. The admin APIs only show pay-as-you-go spend. Tokenly shows both — and makes it unmistakable which is which. Local cards show tokens first with an amber "list-price estimate" caption. API cards show dollars first with a "actual spend" caption and a real-time freshness badge.

— KEYS STAY ON YOUR MAC —

Every API key you paste is encrypted with the macOS keychain (via safeStorage) and never leaves your machine. No server, no telemetry, no account required. Tokenly has never made a network request on your behalf other than directly to the provider you asked it to watch.

— FEATURES —

• Menu-bar popover (click the icon) + detachable desktop window
• Six range toggles: 24h / 7d / 14d / 30d / 90d / 180d — preference persists
• Live "just now" / "8s ago" freshness badge, updating every second
• Per-model breakdown with token counts, request counts, cache hit stats
• Daily spark-bars showing usage shape at a glance
• Cost by line item (OpenAI) — chat, embeddings, images, audio, fine-tuning
• Logo or monogram mode for provider badges — your choice
• Dark, compact, designed for the second monitor
• Zero analytics, zero tracking, zero accounts

— WHO IT'S FOR —

Engineers on Claude Max or ChatGPT Team wanting to see subscription ROI. Startup founders watching API burn against a runway. FinOps teams reconciling Admin dashboards without opening three tabs. Anyone who's felt "I have no idea what my AI bill looks like today" — this fixes that.

— REAL-TIME DATA —

Claude Code and Codex data refresh sub-second after each new message via file watchers. API cards poll every 30 seconds (5 minutes for long ranges). Manual refresh is one click.
```

---

## Keywords (100 chars, comma-separated)

```
ai usage,claude code,openai,anthropic,codex,openrouter,token tracker,menu bar,llm,cost monitor
```

**Why these specifically:** `ai usage`, `token tracker`, `llm`, and `menu bar` are high-intent search terms. Brand terms (`claude code`, `openai`, `anthropic`, `codex`, `openrouter`) catch direct lookups. `cost monitor` overlaps with finance/budgeting browsers. Keep under 100 chars; duplicates and plurals are wasted space.

---

## Release notes (first version, 4,000 chars — shown on app updates)

```
First public release. Tokenly now includes:

• Real-time Claude Code and Codex tracking from local log files
• Authoritative spend from OpenAI, Anthropic, and OpenRouter Admin APIs
• Menu-bar popover and detachable desktop window
• Six date-range toggles with per-range caching
• Live freshness badge and sparkline per provider
• macOS keychain encryption for all API keys
• Logo or monogram badge styles
• Zero analytics. All data local.
```

---

## URLs required

| Field | Example | Required? |
|---|---|---|
| Marketing URL | `https://tokenly.app` | Recommended |
| Support URL | `https://tokenly.app/support` or a GitHub Issues link | **Required** |
| Privacy Policy URL | `https://tokenly.app/privacy` | **Required** |
| EULA | Apple's standard EULA is fine | Optional |

---

## Privacy declaration (for App Privacy labels AND PrivacyInfo.xcprivacy)

Apple asks: *"Does your app collect data?"* — Answer: **No**.

For each category, our answer is:

| Category | Collected? | Notes |
|---|---|---|
| Contact Info | No | |
| Health & Fitness | No | |
| Financial Info | **Partially on-device only** | API keys stored locally in macOS keychain, never transmitted to Tokenly. |
| Location | No | |
| Sensitive Info | No | |
| Contacts | No | |
| User Content | **Partially on-device only** | Reads local log files from the user's own AI tools; never uploaded. |
| Browsing History | No | |
| Search History | No | |
| Identifiers | No | |
| Purchases | No | |
| Usage Data | No | No analytics. |
| Diagnostics | No | No crash reporting. |
| Other Data | No | |

The "Partially on-device only" framing is key — Apple lets you declare local-only data handling as non-collecting. Be careful with the wording.

---

## App Review notes (the private note to Apple reviewers)

```
Tokenly requires the reviewer to have OpenAI or Anthropic Admin API keys to see the full UI populated. To test without keys:

1. Open the app — the menu bar icon will appear
2. Click the icon to open the popover
3. All five cards will render. The Claude Code and Codex cards will show "not detected" empty states unless the reviewer has those tools installed locally.

API keys required to test the paid-API cards can be provided on request. All API keys are encrypted via macOS safeStorage and never leave the machine.

No account signup, no tracking, no analytics. The app makes network requests only to the provider endpoints the user has explicitly configured with a key.
```

---

## Listing screenshot requirements (macOS)

Apple requires at least one screenshot at one of these resolutions:

- **2880 × 1800** (16:10, retina MacBook) ← use this
- **2560 × 1600** (16:10, retina)
- **1440 × 900** (16:10, non-retina)
- **1280 × 800** (16:10, non-retina)

Minimum 1, maximum 10. First three are what matter — most users never scroll past.

**My recommended shot list (in order):**

1. **Hero**: The app in a desktop window on a beautiful wallpaper, all five cards populated, one expanded showing the per-model breakdown + sparkline. Caption overlay: *"Live spend across every AI tool."*
2. **Menu-bar popover in context**: Macbook desktop with the menu bar visible, popover open underneath the tray icon. Caption: *"Right in your menu bar."*
3. **Claude Code expanded card**: Close-up of the Claude Code card showing tokens as the primary counter, $ estimate underneath. Caption: *"Sees what your API dashboard can't."*
4. **Range picker animation frame**: Shows the segmented 24h/7d/14d/30d/90d/180d row with active state. Caption: *"From 24 hours to 180 days."*
5. **Settings sheet**: Showing the Admin Key required banner and a key being entered. Caption: *"Keys stay on your Mac. Never sent anywhere."*

See `marketing/screenshots.html` — open it in a browser and screenshot each section at the full resolution.

---

## App icon assets (already generated in `build/`)

- `icon.icns` — for the app bundle
- `icon.png` (1024²) — for App Store Connect upload
- `icon.iconset/` — all sizes (16, 32, 64, 128, 256, 512, 1024 @ 1x and 2x)

Apple wants a 1024×1024 non-transparent PNG for the App Store upload — use `icon.png`.

---

## Pricing

Recommended launch pricing:

- **Free tier**: All features for OpenAI + Anthropic API cards. Disable Claude Code / Codex cards.
- **Pro $4.99/mo or $39.99/yr**: Unlock Claude Code and Codex cards (the real killer feature).
- **Lifetime $69 (first 1,000 users, then sunset)**: Early adopter anchor price.

App Store's subscription model gives you 15% cut after year 1 (Small Business Program brings it down to 15% on day 1 if you make under $1M/yr).

---

## What's not listed here but you'll still need

- A **Privacy Policy** page — use a generator; ours can be very short since we don't collect anything
- A **Support URL** — GitHub Issues works in a pinch
- A **company address** — Apple requires this for App Store Connect but it's not publicly shown
- Your **D-U-N-S number** if registering as an organization (not needed for individual accounts)
