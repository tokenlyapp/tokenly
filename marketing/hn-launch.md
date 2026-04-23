# Tokenly — Hacker News Show HN launch

> Paste-ready content + mechanics for launching Tokenly on Hacker News. See also `/Users/adowney/Documents/LLM Usage Dash/ROADMAP.md` Tier 1.6 and `OPERATIONS.md` for the release checklist that feeds the launch.

---

## When to post

- **Tuesday or Wednesday, 7:00–9:30 AM Eastern.** East Coast devs on their first coffee; SF still asleep. Post has ~4 hours to build momentum before the main traffic wave.
- Monday works too. **Avoid Friday afternoon and weekends.**
- Don't post HN and Product Hunt the same day. Separate by 24–48h.

## Posting mechanics

**Account prep (1 day ahead, optional but recommended):**
- Account at `news.ycombinator.com/login`. A brand-new account that posts once and never comments gets auto-flagged. Day before: leave 3–4 thoughtful comments on unrelated threads. 20 minutes of work, drops flag risk to near-zero.

**Posting steps:**
1. Click **submit** in the top nav.
2. **Title** must start with `Show HN: ` (exact capitalization, space after colon).
3. **URL** = `https://trytokenly.app` — the landing page, *not* Stripe checkout. HN auto-flags direct payment links.
4. **Leave the text box empty.** Show HN convention: URL OR text, not both.
5. Submit.
6. **Immediately** post a top-level comment on your own submission with the story (template below). This is where selling actually happens — the submission itself is just the doorway.

**Don't:**
- Ask people to upvote in Slack/Discord/group chats. HN detects coordinated voting via IP clustering and shadowbans.
- Resubmit if it flops — one shot per URL for ~a year.
- Use promotional language ("revolutionary," "best," "amazing") in the title — instant flag.
- Post from a VPN or shared IP.

**If auto-flagged** (post disappears from /newest within minutes): email `hn@ycombinator.com` with a polite one-liner. They un-flag ~70% of legit requests within 24h.

**For the first 6 hours after posting:**
- Reply to every comment, including snarky ones. Genuine, not defensive.
- If someone finds a bug: "Good catch, I'll fix that today" — then fix it and reply with the commit link. Voters reward this heavily.
- "Why not just use X?" — answer honestly, don't argue superiority. "Fair question — X is great at Y, this is aimed at Z."

---

## Title (pick one)

**Primary (product-first):**
```
Show HN: Tokenly – menu-bar AI spend tracker, keys stay on your Mac
```
*(66 chars)*

**Recommended (personal framing — typically does better on HN):**
```
Show HN: I built a menu-bar tracker for my Claude Code and Codex spend
```
*(72 chars)*

## URL
```
https://trytokenly.app
```

---

## First comment — paste verbatim as a top-level reply to your own post

> HN doesn't render markdown. Only italics (`*text*`), paragraph breaks, and auto-linked URLs. The block below is already formatted for HN. Swap `$X` for your final price.

```
Hey HN — Austin here, solo maker.

I use Claude Code and Codex CLI heavily and wanted one place to see what I was actually burning day-to-day. Six provider dashboards was too many tabs, and pasting sk-admin-... keys into random web tools didn't sit right. So I built this for myself and figured other devs might want it.

Tokenly pulls from six sources:

- Claude Code and Codex CLI: reads the local .jsonl rollout files. No keys needed. Also covers Claude Desktop and Codex Desktop, which write to the same folders.

- Gemini CLI: parses ~/.gemini/tmp/<hash>/chats/*.json.

- OpenAI, Anthropic, OpenRouter admin APIs: actual billed dollars.

Cards are clearly labeled as "list-price estimate" (computed from tokens) or "actual billed spend" (from provider APIs) so you never confuse the two. This matters more than I realized — a lot of the confusion around Claude Max ROI vs. API pay-as-you-go comes from people conflating these.

Keys are encrypted with macOS safeStorage (Keychain-backed) and never leave your Mac. The website only runs Stripe checkout + DMG delivery. No account, no telemetry, no backend, no server-side anything. Source is public: https://github.com/tokenlyapp/tokenly

Things I got wrong while building this, in case any of it saves someone else the pain:

1. One of my own Codex rollout files was 1.1 GB. fs.readFileSync blew past V8's string-length cap and SIGTRAPed the app. Had to rewrite with readline.createInterface and fs.createReadStream so memory stays one line at a time.

2. Codex's logs_2.sqlite is an OpenTelemetry buffer that captures roughly 1% of real usage. I wasted 2 hours treating it as the source of truth before finding the JSONL rollouts under ~/.codex/sessions/.

3. Anthropic's billing API returns amounts in cents as a bare string. OpenAI's returns dollars as {value: "0.074"}. I briefly shipped "your Anthropic bill is $843" when it was actually $8.43. Two different providers, two different conventions, one embarrassing screenshot.

4. OpenAI's output_tokens already includes reasoning tokens. Adding reasoning_token_count on top double-counts. Took a user report to catch that one.

5. Antigravity (Google's new agentic IDE) is not locally parseable. All state syncs to their servers — chat.ChatSessionStore.index stays empty even during active use. Spent ~2h confirming this so I could explicitly rule it out.

It's $X one-time, macOS 13+, universal binary (Apple Silicon + Intel), auto-updates via GitHub Releases. No subscription.

Very happy to take feedback — especially on provider edge cases I haven't hit. If you have a weird setup (LiteLLM proxy, self-hosted OpenRouter alt, some other local CLI I haven't heard of), I'd love to hear what breaks.
```

### Why this comment works

- **"I built it for myself" opener** — HN's favorite narrative arc. Positions you as a user solving your own problem, not a founder selling.
- **Specific technical war stories** — the 1.1 GB file, the Codex OTel red herring, cents-vs-dollars. Signals real engineering and honest struggle. Each one is a comment-thread starter.
- **Explicit "no backend, no telemetry"** — HN's values skew libertarian on privacy. Direct appeal.
- **Source link prominent.** Open source is a 2–3× upvote multiplier for indie tools. Don't bury it.
- **Specific ask for feedback** — "tell me about your weird LiteLLM setup," not "let me know what you think." Gives people a reason to comment, which drives the ranking algorithm.

---

## Pre-flight checklist (24h before posting)

- [ ] Landing page loads fast and Buy button works
- [ ] `trytokenly.app` resolves from multiple networks (not just yours)
- [ ] One purchase tested end-to-end with a real card
- [ ] GitHub issue template pinned
- [ ] `CONTRIBUTING.md` or at least a basic `README.md` in the repo
- [ ] Email/push on for GitHub issues (don't miss a bug report during the 6h window)
- [ ] Demo GIF embedded in `README.md`
- [ ] No "coming soon" or half-finished copy on the landing page
- [ ] Stripe dashboard open in a tab for real-time sales watch
- [ ] Calendar cleared for 6h post-launch

---

## What success looks like

| Tier | Upvotes | Visitors | Paid conversions | Probability |
|---|---|---|---|---|
| Flop | <5 | — | — | ~40% |
| Decent | 30–80 | 1,500–4,000 | 15–40 | ~50% |
| Hit (front page 6–24h) | 150+ | 20,000+ | 150–400 | ~8% |
| Home run (#1 front page) | 500+ | 50,000+ | 500+ | <2% |

Technical-depth in the first comment is the biggest lever for moving from *decent* to *hit*.

---

## Post-launch (within 72h)

- **Ship a point release** with anything the HN thread surfaces — even tiny. Reply in the thread: "Just shipped 1.3.1 with the fix from [username]'s comment." Massive goodwill.
- **Product Hunt launch** 24–48h after HN peak. Different headline. Don't reuse HN comment verbatim.
- **Twitter thread** linking back to the HN discussion with the most interesting comment callouts.
- **Write a post-mortem blog post** on the launch — revenue numbers, what worked, what didn't. Indie Hackers + dev.to + your own site. Compounds for months.
