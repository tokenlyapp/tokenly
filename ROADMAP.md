# Tokenly — Product Roadmap

Prioritized by **impact × feasibility**. Impact is a mix of user value, conversion potential, and differentiation vs. every other AI usage tracker. Feasibility accounts for how much code (or money) a change requires.

Tiers:
- **Tier 1** — ship within 2 weeks. Compounds fast.
- **Tier 2** — ship within 2 months. Widens the moat.
- **Tier 3** — within 6 months. Platform bets.
- **Explicitly not shipping** — scope discipline.

Each item has: a **why**, an estimated **effort** (hours), and any **dependencies**.

---

## Tier 1 — Ship next

### 1.1. Auto-update via `electron-updater` + GitHub Releases
**Impact:** 10/10. Without this, every user is stuck on whatever version they installed. First bug fix after launch creates a permanent fragmentation problem.
**Effort:** 4h.
**What it looks like:** Users see a native macOS "A new Tokenly is available" banner. One click installs. No re-download, no re-keychain-prompt.
**Key moves:**
- `npm install electron-updater`
- Add `autoUpdater.checkForUpdatesAndNotify()` to `main.js` app-ready
- `"publish": [{"provider": "github", "owner": "...", "repo": "tokenly"}]` in `package.json` build config
- GitHub Actions workflow on `git tag v*` that runs `npm run dist -- --publish always`
**Blocks:** nothing. Do this first.

### 1.2. Live pricing refresh from a hosted table
**Impact:** 9/10. Today prices are hardcoded. Anthropic shipped Opus 4.7 with unchanged headline prices but a new tokenizer (~35% more tokens per call) — our estimates drifted by over 30% silently. A remotely-updated price table means users always see accurate estimates without waiting for app updates.
**Effort:** 6h.
**What it looks like:** Ship a `pricing.json` on the Netlify site that the app fetches once per day (with 24h fallback to bundled prices on network failure).
**Key moves:**
- Host `https://trytokenly.app/pricing.json` with the two tables
- Add a daily fetch in `main.js` with local cache at `~/Library/Application Support/Tokenly/pricing.json`
- Fall back to in-bundle prices if fetch fails
**Blocks:** none. Pairs naturally with auto-update (shared infra).

### 1.3. Menubar live total — show current cost in the tray itself
**Impact:** 9/10. The app is visible zero pixels when collapsed. Surfacing `$45.22` right next to the clock transforms Tokenly from "something you open" to "ambient utility." Every competitor does this; we don't yet.
**Effort:** 3h.
**What it looks like:** Tray icon shows `⦿ $45.22` (icon + tabular amount). Click still opens popover. User can toggle between showing total, today's spend, or nothing.
**Key moves:**
- `tray.setTitle(' $45.22')` updated on every refresh
- Setting for: Total / Today / Hidden
- Careful formatting for small + large values (`$0.14`, `$1.2K`, `$15`)
**Blocks:** none.

### 1.4. Budget alerts + daily spend notifications
**Impact:** 9/10. Users who track usage want to *act* on it. "You've spent $38 of your $50 daily budget" fires at 80% threshold. Missed budget events are the #1 reason people keep Tokenly open.
**Effort:** 6h.
**What it looks like:** Settings adds "Daily budget" and "Monthly budget" fields per provider. Native macOS notifications at 80% and 100%. Small colored bar beneath the primary counter showing budget progress.
**Key moves:**
- Persist budgets alongside keys (encrypted, same store)
- Compute on every refresh; notify once per threshold crossing per day (ledger-persisted to avoid spam)
- Use `Notification` API via `new Notification(title, options)` — native macOS banners
**Blocks:** none.

### 1.5. Gemini CLI support (read `~/.gemini/`) — ✅ **SHIPPED in v1.2**
**Impact delivered:** Third keyless card alongside Claude Code and Codex. Reads `~/.gemini/tmp/<project_hash>/chats/*.json` and captures per-turn `{ input, output, cached, thoughts, tool, total }` directly from Google's session format. Cleanest parser of all three local sources.

### 1.6. Product Hunt + Hacker News launch
**Impact:** 10/10 (for acquisition), 0/10 (for product). First 500 users come from here. Do it once, do it well.
**Effort:** 8h to prep.
**What it looks like:** 60-second demo GIF, tight one-paragraph pitch, launch comment that tells the "why" ("I was tired of three open dashboards"), at least 3 friends primed to upvote in the first 2 hours, live on discord/twitter answering questions hour-by-hour for the first 24h.
**Blocks:** auto-update (1.1) must be shipped before launch — otherwise everyone is forever on v1.0.

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

### 2.4. Pro tier with paywalled features
**Impact:** 9/10 (for revenue). First $2K MRR comes from this split.
**Effort:** 12h.
**What it looks like:** Tokenly Free — Claude Code + Codex cards only (the zero-setup flow). Tokenly Pro ($4/mo or $39/yr) — unlocks OpenAI/Anthropic/OpenRouter cards, CSV export, budget alerts, compare ranges. Enforce via a local license-key check that calls a thin Cloudflare Worker.

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
**Blocks:** auto-update (1.1). Setapp insists their bundle handles updates, so we'd need to conditionally disable electron-updater when running inside Setapp.

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

- **No Antigravity integration.** Probed exhaustively April 2026. Antigravity is cloud-first by design — `chat.ChatSessionStore.index` stays empty even after active agent sessions, no `*token*` / `*gemini*` keys exist in any local sqlite, the one suspicious 4.7MB blob turned out to be VS Code's localization cache, and `antigravityUnifiedStateSync.*` in storage.json confirms agent state syncs to Google's servers. The only path to their usage data would be an enterprise-OAuth'd Google Cloud Billing flow — not viable in a $1.99 indie app. Revisit only if Google publishes a public consumer usage API.
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
- Budget alerts (1.4) drives retention (user comes back to check) and opens the door for a Pro tier
- Gemini (1.5) unlocks a new audience segment without cannibalizing existing

**Why Tier 2 after:**
- All Tier 2 items assume a steady flow of users — no point shipping compare-ranges (2.2) until enough users have 60 days of data
- Pro tier (2.4) requires enough value-adds (2.1–2.3 especially) to justify the upgrade

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
| Pro tier conversion | 5% | 12% |
| App Store rating (when MAS ships) | 4.6+ | 4.7+ |
| Support tickets per 100 users / week | <5 | <2 |
| Time-to-first-value (download → first card populated) | <60s | <30s |

If D7 retention is below 30% at month 3, something is structurally wrong (probably data quality — consider Tier 2.5 pricing overrides ASAP).

If Pro conversion is below 3%, the paywall split is wrong — expand free tier.
