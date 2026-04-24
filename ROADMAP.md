# Tokenly — Product Roadmap

Prioritized by **impact × feasibility**. Current shipped version is **1.8.1**.

Tiers:
- **Tier 1** — ship within 2 weeks. Compounds fast.
- **Tier 2** — ship within 2 months. Widens the moat.
- **Tier 3** — within 6 months. Platform bets.
- **Explicitly not shipping** — scope discipline.

---

## ✅ Shipped in prior sessions

### 1.1. Auto-update via `electron-updater` + GitHub Releases — SHIPPED 1.2.1
- `electron-updater` polls `latest-mac.yml` on GitHub Releases every 4h
- Native macOS "Install & Relaunch" prompt when new version downloads
- Tray menu has manual "Check for Updates…" entry
- Every release uploads DMG + zip + manifest via `npm run dist:publish` (PAT in `GH_TOKEN`)
- Same code signature across versions preserves macOS Keychain ACL — users don't re-auth for saved keys
- Dual-upload discipline: GitHub Release (for existing users) **and** Netlify Blob (for new buyers) — forget either and one audience is stuck

### 1.4. Budget alerts + daily spend notifications — SHIPPED 1.5.0 (pending release)
Scope: **API sources only** (OpenAI / Anthropic / OpenRouter). List-price estimates from local tools are not real money for subscription users — they don't participate in $ budgets. Future token-based thresholds for local tools are a v2.
- Daily $ budgets per provider + overall (sum across APIs)
- Thresholds fire at 50% / 80% / 100% — native macOS notifications, once per UTC day per threshold (dedup via ledger at `~/Library/Application Support/Tokenly/alerts.json`)
- Daily spend summary notification at user-chosen local hour (default 5pm), mixing API $ + local token totals
- Budgets persisted to `~/Library/Application Support/Tokenly/budgets.json` (not encrypted — no secrets)
- New IPC surface: `budgets:get` / `budgets:set` / `alerts:maybe-fire` / `alerts:maybe-fire-summary`
- Enabled by the `costTrend` array added to every API fetcher — per-day cost bucketing that unlocks §2.2 "Compare ranges" work too
- v2 follow-ups: monthly budgets (needs always-on 30d fetch), token-based thresholds for local tools, colored in-app progress bars under primary counters

### 1.2. Live pricing refresh from a hosted table — SHIPPED 1.4.0 (pending release)
- Hosted JSON at `https://trytokenly.app/pricing.json` with versioned schema (`schema_version: 1`)
- App fetches 8s after launch + every 24h + on-demand via tray menu → "Refresh Pricing Tables"
- Disk cache at `~/Library/Application Support/Tokenly/pricing.json` loaded at boot
- Three-layer fallback: remote in-memory → disk cache → bundled `*_PRICING` arrays in `main.js`
- Rate changes now ship in minutes via a PR + `netlify deploy --prod` — no app rebuild needed
- Automated monitoring agent (GitHub Action polling LiteLLM + provider pricing pages) is the separate follow-up task

### 1.3. Menubar live tokens — SHIPPED 1.3.0
Two-axis control:
- **Source**: All providers / any single provider
- **Period**: Off / Today / Last Xd (dynamic label) / Both
- Grouped dropdown: `Local tools (subscription-bundled)` vs `API billing (pay-as-you-go)`
- Tray tag prefix (`CC`, `AI`, etc.) when a specific source is picked
- Window-mode formula matches card exactly: `input + output + cache_read + cached`

### 1.5. Gemini CLI support — SHIPPED 1.2
Third keyless card. Reads `~/.gemini/tmp/<project_hash>/chats/*.json`, parses per-turn `tokens: { input, output, cached, thoughts, tool, total }` blocks. Cleanest schema of any local source.

### Bonus shipped features (not originally in Tier 1 plan but landed along the way)

- **OpenRouter remaining balance strip** — `GET /api/v1/credits` → green ⚡ strip on card showing `$X of $Y remaining`
- **Codex rate-limit quota strip** — latest `rate_limits` snapshot from rollout events → "5h 32% / 7d 67% / team"
- **Download recovery** — `/recover` page + edge function + Resend. 365-day re-download window. Canonical sender is `support@trytokenly.app` via ImprovMX + Gmail send-as.
- **Codex → Codex CLI rename** + Claude Code tooltip clarity (includes Desktop) — shipped 1.3.0
- **Brand logos default** — toggle defaults to logos not monograms — shipped 1.3.0
- **macOS public repo + licensing** — source code at `github.com/tokenlyapp/tokenly`, public

---

## Tier 1 — Ship next

### 1.6. Product Hunt + Hacker News launch
**Impact:** 10/10 (for acquisition), 0/10 (for product). First 500 users come from here. Do it once, do it well.
**Effort:** 8h to prep.
**What it looks like:** 60-second demo GIF, tight one-paragraph pitch, launch comment that tells the "why," at least 3 friends primed to upvote in first 2 hours, live answering questions hour-by-hour for 24h.
**Blocks:** Nothing blocking. Auto-update already shipped so post-launch bug fixes propagate automatically — the original concern is resolved.

---

## Tier 2 — Within 2 months

### 2.1. CSV / JSON export
**Impact:** 7/10. Finance teams and solo founders reconciling expense reports want the raw data. Becomes a Pro-tier feature.
**Effort:** 4h.
**What it looks like:** Right-click any card → "Export last 90 days as CSV." Pivots rows as `date, provider, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, source`.

### 2.2. Compare ranges (period-over-period)
**Impact:** 8/10. Ranges today are absolute ("last 30d"); comparing "this 30d vs. prior 30d" shows whether usage is trending up/down — a vital signal for startup founders.
**Effort:** 10h.
**What it looks like:** Double-tap the range picker to enter compare mode. Each card shows `$45.22 (↑ 23% vs prior 30d)` with a split sparkline.

### 2.3. Per-project cost grouping (Claude Code)
**Impact:** 8/10. Claude Code JSONL includes `cwd` — the project directory that was active for each turn. Grouping by project answers "how much did I spend on Project X?" which is the question every consultant, every freelancer, and every agency asks.
**Effort:** 6h.
**What it looks like:** Expanded Claude Code card gets a "By project" tab. Shows cost per directory name.

### 2.4. Tokenly Max paywall — SHIPPED across 1.6.0 / 1.8.0 / 1.8.1
**Impact:** 9/10 (for revenue). First $2K ARR comes from this split.
**Shipped actuals:** Tokenly Free — Claude Code + Codex CLI + Gemini CLI cards (the zero-setup flow). Tokenly Max — **$5.99 one-time, lifetime updates** — unlocks OpenAI / Anthropic / OpenRouter admin billing cards, budget alerts, CSV export, menu-bar tag for API sources. Enforced via a local license-key check against a Netlify Edge Function (`/api/license-verify`); Stripe webhook auto-emails the activation code via Resend. Pricing landed at $5.99 one-time rather than the originally-planned $4/mo or $39/yr — simpler story, stronger HN narrative, and matches indie-Mac-app norms.

### 2.5. Settings → customize pricing
**Impact:** 6/10. Enterprise customers often have negotiated discounts. Letting them plug their real per-M-token rates in makes the estimate match their actual invoice.
**Effort:** 4h.
**What it looks like:** Settings → Advanced → Pricing overrides. Per-model input/output rate fields. Scope: per provider.

### 2.6. Widget / pinned mini window
**Impact:** 6/10. Some users want a permanent floating tile showing today's burn, not a popover you have to open.
**Effort:** 8h.
**What it looks like:** Cmd-Shift-click the tray icon → spawns a frameless 260×120 widget that floats above all windows, shows `$12.45 today · $X open in dashboard` pulse dot, click-through transparent.

### 2.7. Bring-your-own-models via custom endpoints
**Impact:** 7/10. Users on LiteLLM, OpenRouter proxies, Helicone, self-hosted Ollama, etc. have usage data in their proxy logs but no way to surface it in Tokenly.
**Effort:** 10h.
**What it looks like:** Settings → Custom provider → base URL + auth header + pricing table. Tokenly issues `GET /usage` against it. Nerd-catnip feature.

### 2.8. macOS launch-at-login
**Impact:** 5/10. Table stakes for menu-bar apps. People forget it exists if it doesn't come back after reboot.
**Effort:** 1h.
**What it looks like:** Settings toggle. Use `app.setLoginItemSettings({ openAtLogin: true })`.

### 2.9. Keyboard shortcuts
**Impact:** 5/10. Power users expect `⌘R` refresh, `⌘,` settings, `⌘1–5` to expand each card. Free polish; low-risk.
**Effort:** 3h.

### 2.10. "What's new" changelog in-app
**Impact:** 6/10. After auto-update (1.1), users don't know what they got. A small "Changelog" link in Settings → fetches the release notes from GitHub.
**Effort:** 3h.

---

## Tier 3 — Within 6 months

### 3.1. Team mode (shared usage view)
**Impact:** 9/10 in contract value. $9/user/mo. Startup CTOs want to see team-wide AI spend.
**Effort:** 40h. Requires a backend — not just a stream-DMG function, but real persistent storage, auth, a shared dashboard.
**What it looks like:** Invite teammates via email; shared view at a web URL shows aggregate per-person per-provider spend.

### 3.2. iOS companion app (read-only peek)
**Impact:** 6/10. Not everyone has their Mac open. A phone widget showing today's AI spend is a small daily touchpoint.
**Effort:** 30h (SwiftUI, App Store submission).
**What it looks like:** iPhone widget + full app. Reads the same Stripe-gated download token to fetch a signed cache of the Mac app's latest state from a tiny cloud store.

### 3.3. Mac App Store version
**Impact:** 5/10 (Setapp would be bigger). MAS has discovery benefits but demands app sandbox, which kills the "read ~/.claude/ with no prompt" flow.
**Effort:** 40h to refactor file access behind `NSOpenPanel` + security-scoped bookmarks.
**Decision rule:** only worth it if direct-download conversion stalls. First prioritize Setapp listing (no sandboxing required, great long-tail discovery).

### 3.4. Setapp listing
**Impact:** 8/10. Passive, high-intent audience. Setapp users already pay a subscription and try anything new; zero-marketing revenue.
**Effort:** 8h (notarized DMG + their review).
**Catch:** auto-update now shipped, so Setapp requires conditionally disabling electron-updater when running inside Setapp (they handle updates via their own bundle). Add a packaged-env check.

### 3.5. Pricing history / pricing changelog
**Impact:** 6/10. Nerd delight. Every pricing table change is silently absorbed; surfacing "Claude Opus 4.7 dropped from $15/$75 to $5/$25 on April 14" is a story people share.
**Effort:** 4h.

### 3.6. Accessibility + VoiceOver pass
**Impact:** 7/10 in brand signal, uncertain in raw usage. Required for MAS anyway.
**Effort:** 8h.

### 3.7. Light-mode theme
**Impact:** 5/10. Some users prefer light. All the colors are tokenized so it's mostly a restyling pass.
**Effort:** 10h.

### 3.8. Localization (Japanese, German, French first)
**Impact:** 6/10. Tokenly's target audience is English-first globally, but indie Mac app market in Japan specifically is strong for productivity tools.
**Effort:** 15h + ongoing translation costs.

### 3.9. Browser extension — quick usage peek
**Impact:** 4/10. Users on Chromebooks or Linux workstations who also use Mac could see data on the web. Very long tail.
**Effort:** 30h.

---

## Explicitly not shipping

- **No Antigravity integration.** Probed exhaustively April 2026. Antigravity is cloud-first by design — `chat.ChatSessionStore.index` stays empty even after active agent sessions, no `*token*` / `*gemini*` keys exist in any local sqlite, the one suspicious 4.7MB blob turned out to be VS Code's localization cache, and `antigravityUnifiedStateSync.*` in storage.json confirms agent state syncs to Google's servers. The only path to their usage data would be an enterprise-OAuth'd Google Cloud Billing flow — not viable in a solo indie app. Revisit only if Google publishes a public consumer usage API.
- **No Cursor integration.** Cursor's sqlite grows to 25GB+ and stores conversations as opaque JSON blobs without clean per-turn token fields. Their own dashboard at cursor.com/settings is the authoritative billing view — no public API. Revisit if Cursor ships an official usage API.
- **No telemetry or analytics.** Positioning moat. Don't even consider sentry/posthog/heap/etc.
- **No ChatGPT / Claude.ai session cookie scraping.** ToS-violating, fragile, gets rejected from both MAS and Setapp.
- **No built-in AI assistant ("ask Tokenly about your spend").** Every AI app is adding this. Users with Tokenly *already* have a chat UI open. Doesn't add value, adds liability (prompt injection, hallucinated cost advice).
- **No tax/expense automation features** (beyond CSV export). That's a different product. Mercury integration would be a partnership, not a feature.
- **No Discord bot / Slack bot.** Unless Team mode (3.1) justifies it, notifications via those channels are a distraction.
- **No in-app purchases of AI credits.** We are a measurement tool. Conflict of interest to sell what we measure.
- **No Windows or Linux build.** Every v1 user owns a Mac. Platform expansion only if Team mode demands cross-platform.

---

## Sequencing logic

**Why Tier 1 first:**
- Auto-update (1.1) must ship before Product Hunt (1.6) — otherwise forever-stuck v1 users
- Live pricing (1.2) + menubar total (1.3) are the two highest-frequency-use features — they're what users notice every day
- Budget alerts (1.4) drives retention (user comes back to check) and opened the door for Tokenly Max monetization
- Gemini (1.5) unlocks a new audience segment without cannibalizing existing

**Why Tier 2 after:**
- All Tier 2 items assume a steady flow of users — no point shipping compare-ranges (2.2) until enough users have 60 days of data
- Tokenly Max (2.4, shipped) established the paywall boundary; 2.1–2.3 are the value-adds that make the $5.99 upgrade compelling as the product matures

**Why Tier 3 is patient:**
- Team mode (3.1) is a completely different product shape; don't start until solo-user product is stable
- MAS (3.3) is worth the sandbox pain only if direct-distribution conversion plateaus
- Browser extension (3.9), iOS app (3.2) are platform bets with 5–10× the code overhead of tier 1 items

---

## Success metrics to watch

| Metric | Target (month 3) | Target (month 6) |
|---|---|---|
| Installs | 500 | 2,500 |
| Paying users (ARR) | $1K | $10K |
| D7 retention | 40% | 55% |
| Tokenly Max conversion | 5% | 12% |
| App Store rating (when MAS ships) | 4.6+ | 4.7+ |
| Support tickets per 100 users / week | <5 | <2 |
| Time-to-first-value (download → first card populated) | <60s | <30s |

If D7 retention is below 30% at month 3, something is structurally wrong (probably data quality — consider Tier 2.5 pricing overrides ASAP).

If Max conversion is below 3%, the paywall split is wrong — expand the free tier.
