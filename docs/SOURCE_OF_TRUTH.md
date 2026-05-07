# Tokenly source of truth

Last audited: 2026-05-07T00:03:50Z
Canonical repo: https://github.com/tokenlyapp/tokenly
Canonical website: https://trytokenly.app

This file is the product fact source of truth. Website copy, launch copy, README/PROJECT docs, Typefully drafts, Product Hunt/HN/Reddit copy, and blog posts should be checked against this before publishing.

## Current product identity

- Product name: Tokenly.
- Current app version: 2.1.1, from `package.json` in the app repo.
- Platform: macOS 13+.
- Distribution: universal DMG/zip for Apple Silicon and Intel via GitHub Releases; website download/delivery is on Netlify.
- App type: macOS menu-bar desktop app built with Electron 33 and React 18. Public marketing should call it a “Mac menu-bar app.” Technical docs can say “Electron-based macOS app.” Avoid “native macOS” or “Mac-native” in public copy unless explicitly discussing platform integration rather than implementation.
- Bundle ID: `app.tokenly.desktop`.
- Category: Developer Tools.
- Public website: https://trytokenly.app.
- Public app repo: https://github.com/tokenlyapp/tokenly.
- Support email: support@trytokenly.app.
- License: source-available FSL-1.1-MIT, converts to MIT after two years.

## Core positioning

Tokenly shows the token usage and AI spend that normal subscription/provider UIs make hard to see.

Best concise shape:

> Tokenly is a Mac menu-bar app that reads local Claude Code/Desktop, Codex CLI/Desktop, and Gemini CLI usage logs, does the token math, and shows today / 7d / 30d / per-model / per-project totals. Local tracking and live subscription quota meters are free. Optional paid tiers add admin/API billing, analytics/export, and direct chat/voice surfaces using the user's own keys.

For HN/Product Hunt/Reddit/Indie Hackers/community launch posts:

- Lead with free local visibility and subscription-value math.
- Mention no account, no backend, no telemetry.
- Avoid foregrounding pricing, paid tier names, or “first time charging money” framing.
- If paid features are needed, mention them briefly and secondarily as provider/API billing integrations or export/analytics for people who also pay providers directly.

For X/Twitter:

- It is okay to mention Tokenly Max, Max + AI, and exact prices more directly after the educational problem is established.

## Tier model

### Tokenly Free

Price: free forever.

Includes:

- Local usage tracking for Claude Code and Claude Desktop via `~/.claude/projects/**/*.jsonl`.
- Local usage tracking for Codex CLI and Codex Desktop via `~/.codex/sessions/**/*.jsonl`, plus archived sessions where applicable.
- Local usage tracking for Gemini CLI via `~/.gemini/tmp/<project>/chats/*.json`.
- Live subscription quota meters by reading existing CLI OAuth credentials:
  - Claude Pro/Max from `api.anthropic.com/api/oauth/usage`.
  - ChatGPT Pro/Plus/Team/Business from `chatgpt.com/backend-api/wham/usage`.
  - Gemini Free/Paid/Workspace from `cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`.
- Live pricing sheet / pricing refresh from `https://trytokenly.app/pricing.json`.
- Auto-update via GitHub Releases.
- No account, no backend, no telemetry.

### Tokenly Max

Price: $5.99 one-time / lifetime.

Adds:

- OpenAI API org/admin usage and cost tracking. Requires an admin API key such as `sk-admin-...`; project keys are not sufficient.
- Anthropic API org/admin usage and cost tracking. Requires an admin/usage-capable key.
- OpenRouter activity, credits/balance, per-key spend cap, and rate-limit info. Requires a management key.
- API-source menu-bar counters.
- Budget alerts at 50%, 80%, and 100%.
- Daily spend summary notification.
- Analytics view with KPIs, stacked charts, per-category token bars, top models, and 30-day projection.
- CSV / JSON / PDF / PNG export.

### Tokenly Max + AI

Price: $8.99 one-time / lifetime.

Adds everything in Max, plus:

- Direct in-app chat with OpenAI, Anthropic/Claude, and Google/Gemini using the user's regular provider API keys.
- Web search with citations.
- Live dictation in the composer.
- Hands-free Voice AI window opened with `⌘⇧V`.
- Conversation memory/history.
- Unified history for Tokenly chats plus readable Claude Code sessions.
- Usage-aware chat/voice context.

Important billing/privacy line:

> Chat and voice requests go directly from the user's Mac to the configured provider using the user's own API keys. Tokenly does not proxy those requests. Provider usage bills directly to the user's provider account. The $8.99 covers the Tokenly software surface only.

## Data sources and mechanisms

### Local sources

- Claude Code / Claude Desktop: `~/.claude/projects/**/*.jsonl`.
  - Claude Desktop and Claude Code share this folder.
  - Tokenly dedupes overlapping turns by message ID.
  - Per-project grouping uses `cwd` where available and falls back to decoded folder names.
- Codex CLI / Codex Desktop: `~/.codex/sessions/**/*.jsonl` and archived sessions.
  - Source mix can use originators such as `codex_cli` and `Codex Desktop`.
  - `logs_2.sqlite` is not the source of truth; it is treated as a dead end / sampling buffer in prior investigations.
- Gemini CLI: `~/.gemini/tmp/<project_slug>/chats/*.json`.
  - Project folder slug feeds per-project grouping.
  - `thoughts` are reasoning and are priced as output; `tool` context is priced as input.

### Subscription quota sources

- Claude: reads Claude CLI OAuth credentials from `~/.claude/.credentials.json` or Keychain `Claude Code-credentials`; refreshes via `platform.claude.com/v1/oauth/token`; usage from `api.anthropic.com/api/oauth/usage`.
- Codex / ChatGPT: reads `~/.codex/auth.json`; refreshes via `auth.openai.com/oauth/token`; quota/usage from `chatgpt.com/backend-api/wham/usage`.
- Gemini: reads `~/.gemini/oauth_creds.json`; refreshes via `oauth2.googleapis.com/token`; quota from `cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`.

### Admin/API billing sources

- OpenAI API: `/v1/organization/usage/completions` plus `/v1/organization/costs`; dollars from cost endpoint.
- Anthropic API: `/v1/organizations/usage_report`; watch unit/shape carefully because historical notes mention cents/string behavior.
- OpenRouter: `/api/v1/activity`, `/api/v1/credits`, and `/api/v1/key` for enrichment.

## Token math facts

- Tokenly distinguishes list-price estimates from actual billed spend.
- Local CLI/Desktop sources are list-price estimates / subscription-value math, not invoices.
- API/admin sources are actual billed spend where provider endpoints return billing data.
- Tokenly separates input, output, cache read, cache write/cache creation, reasoning/thought, tool/context buckets where source data exposes them.
- Anthropic cache reads are priced at 10% of input; cache writes use provider-specific multipliers such as 5m 1.25x and 1h 2x.
- OpenAI cached input is discounted.
- OpenAI reasoning tokens are already included in output token counts for the relevant API responses; do not add reasoning again in marketing or math explanations.
- Total token usage should include input + output + cache read + cache write/cache creation + relevant source-specific buckets; do not define total as only input + output.

## Privacy/security claims

Safe claims:

- No account.
- No backend for app usage tracking.
- No telemetry, analytics, or crash reporting from the app.
- API/admin/chat keys stay on the Mac.
- Keys are encrypted with Electron/macOS `safeStorage`, backed by macOS Keychain.
- Provider/API/chat calls go directly from the app to providers where the user configured keys.
- Tokenly never proxies chat/voice requests.
- The website/checkout/delivery infrastructure handles purchase/download flow, not user provider keys.

Nuance:

- The app does make network calls for configured providers, live pricing refresh, GitHub Releases auto-update/changelog, and provider status feeds.
- The website uses Netlify/Stripe/Resend/Netlify Blobs for checkout, activation, recovery, and delivery.

## Unsupported / intentionally not claimed

- ChatGPT Desktop local conversation extraction is not supported because local conversation storage is encrypted.
- Claude.ai / ChatGPT web / Gemini web-only usage is not directly read unless exposed through local CLI/Desktop logs or quota endpoints.
- Cursor is not supported; local data is opaque and/or dashboard-side data is authoritative.
- Windsurf is not supported unless it exposes parseable local data or a public usage API.
- Antigravity is not supported; prior investigation found cloud-synced state and nothing locally parseable.
- Perplexity is deferred / unsupported without a public usage API; avoid browser-cookie scraping claims.
- Windows and Linux builds are not supported.

## Claude Max rate-limit wording

Use the corrected two-limit public model:

- 5-hour rolling burst window.
- Broader weekly cap.

Avoid claiming:

- “three independent windows” as the actual model.
- an official separate “7-day rolling” ring/window unless verified by official docs.
- that Claude cannot identify which limit was hit.

Preferred pain point:

> Claude can surface limit/reset information, but users usually see it after interruption. Tokenly helps expose local usage pressure before that wall.

## Website and repo structure

App repo:

- `/opt/data/repos/tokenly`
- Important files: `package.json`, `README.md`, `PROJECT.md`, `main.js`, `preload.js`, `renderer.js`, `app/components/*.jsx`, `pricing.json`/pricing fetch logic where applicable.

Marketing site repo:

- `/opt/data/repos/tokenly-site`
- Static pages: root `*.html`.
- Blog bodies: `blog-content/<slug>.md`.
- Static blog shells / SEO / OG / schema: `blog/<slug>.html`.
- Blog list/card metadata: `components/blog-posts.js`.
- Site pricing file: `pricing.json`.
- Netlify config/functions: `netlify.toml`, `netlify/`.

Launch/docs repo:

- `/opt/data/repos/tokenly-launch`
- Launch campaign materials: `launch/3-month-launch/*`, `launch/blog/*`, `launch/hn-launch.md`, `launch/twitter-thread.md`, `launch/rollout-plan.md`, `_hermes/*`.

## Known current audit findings from 2026-05-07

Fixed during the initial organization pass:

1. App `PROJECT.md` current shipped version was updated from 2.0.1 to 2.1.1, with `package.json` named as the source of truth.
2. App `README.md` stale “no built-in AI assistant” wording was replaced with the accurate no-proxy/no-cookie-scraping/no-telemetry line.
3. `launch/hn-launch.md` and `marketing/hn-launch.md` old v1.8.1/pricing-first header was replaced with current free-local-value-first HN positioning.

Current decisions / remaining watch items:

1. Public marketing wording is “Mac menu-bar app.” Technical docs may say “Electron-based macOS app.” Avoid “native macOS” / “Mac-native” in public copy because Tokenly is Electron-based.
2. Claude-public-facing explanatory content should say “5-hour rolling burst window” plus “weekly cap” / “weekly usage cap.” Use “7d” only where it is a literal app/UI/API label or a non-Claude provider-specific label.
3. Stale phrase scans only found “three independent windows” in corrective context inside the Claude rate-limit article and this source-of-truth doc, not as an asserted claim.

## Update rules

When product behavior changes:

1. Update this file first or in the same PR as the code change.
2. Update app README/PROJECT if public/product-facing facts changed.
3. Update marketing site page copy, metadata, schema, blog cards, blog shells, and blog bodies as needed.
4. Update launch docs/Typefully drafts if the change affects launch positioning.
5. Run `node scripts/audit-content-claims.mjs` from the app repo after changes.
6. For Tokenly launch/community copy, re-apply the channel rule: non-X public communities lead with free local value; X may mention paid tiers/prices more directly.
7. Keep the Notion source-of-truth mirror current when this file or the playbook changes.
