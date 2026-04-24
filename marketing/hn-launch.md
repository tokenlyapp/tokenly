# Tokenly — Hacker News Show HN launch

> Paste-ready content + mechanics for launching Tokenly on Hacker News.
> v1.8.1 freemium-native positioning: free for local tools (Claude Code / Codex / Gemini CLI); **Tokenly Max is $5.99 one-time** and adds OpenAI / Anthropic / OpenRouter admin billing, budget alerts, and CSV export.

---

## When to post

- **Tuesday or Wednesday, 7:00–9:30 AM Eastern.** East Coast devs on their first coffee; SF still asleep. Post has ~4 hours to build momentum before the main traffic wave.
- Monday works too. **Avoid Friday afternoon and weekends.**
- Don't post HN and Product Hunt the same day. Separate by 24–48h.

## Posting mechanics

**Account prep (1 day ahead, optional but recommended):**
Account at `news.ycombinator.com/login`. Brand-new accounts that post once and never comment get auto-flagged. The day before: leave 3–4 thoughtful comments on unrelated threads. Twenty minutes of work drops flag risk to near-zero.

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

**Primary (personal framing — typically does best on HN):**
```
Show HN: I built a menu-bar tracker for my Claude Code and Codex spend
```
*(72 chars)*

**Alternate (product-first):**
```
Show HN: Tokenly – menu-bar AI spend tracker, keys stay on your Mac
```
*(66 chars)*

**Alternate (freemium-angle):**
```
Show HN: Free menu-bar tracker for Claude Code/Codex, $5.99 for API billing
```
*(79 chars)*

## URL
```
https://trytokenly.app
```

---

## First comment — paste verbatim as a top-level reply to your own post

> HN only renders italics (`*text*`), paragraph breaks, and auto-linked URLs. The block below is already in HN-compatible plain text.

```
Hey HN, Austin here. Solo dev, first real launch.

I live in Claude Code and Codex CLI all day, and at the end of last month I genuinely had no idea how much money I'd spent. Anthropic dashboard, OpenAI, OpenRouter, Gemini — six tabs, three login sessions, numbers that never added up to what my card got charged. So I spent three weekends building a menu-bar app that pulls it all into one place.

Tokenly sits in your menu bar with a live token counter. Click it and you get cards for each source.

Claude Code, Codex CLI, and Gemini CLI read straight from your local files. Each CLI writes per-session logs to a hidden folder, and Tokenly parses those. No key needed. Also covers Claude Desktop and Codex Desktop since they share the same folders. If a Claude Max subscription is the only AI you pay for, the app is free and you're done.

If you also pay providers directly, $5.99 one-time unlocks a tier called Max that adds OpenAI / Anthropic / OpenRouter billing via their admin APIs. Actual billed dollars, not tokens-times-published-rates. No subscription, lifetime updates.

A few things that caught me out while building it:

One of my own Codex log files was 1.1 GB. I was reading it with a plain file read at first, which crashed the process. Node won't hand you a single string that long. Had to switch to streaming line by line.

Codex also ships with a SQLite file that looks like it should have your usage data, but it doesn't. It's an OpenTelemetry sampling buffer that captures about 1% of events. Burned two hours on that before I found the real logs.

Anthropic's billing API returns amounts in cents, as a string. OpenAI's returns them in dollars, as a number. I mixed them up early on and briefly showed someone their Anthropic bill as $843 when it was actually $8.43. They were nicer about it than I deserved.

OpenAI's output token count already includes reasoning tokens. If you add the reasoning count separately, you double-count. Took a user report to catch.

Antigravity — I went deep trying to include it and gave up. Google syncs all state to their servers, nothing useful sits locally. Wrote up what I tried in the readme in case anyone else is going down that road.

Keys get encrypted with the macOS Keychain the moment you paste them. No account, no telemetry, no backend. The website is a Stripe link and a static page. Source is public: https://github.com/tokenlyapp/tokenly

macOS 13+. Happy to hear about anything weird that breaks — LiteLLM proxies, local routers, unusual CLIs.
```

### Why this version works

- **Opens with a moment, not a pitch.** "At the end of last month I genuinely had no idea how much money I'd spent" is a relatable scene — most readers will nod at that sentence. Opening with the problem beats opening with the product.
- **Specific, unglamorous numbers.** "1.1 GB," "about 1%," "$843 when it was $8.43," "two hours." HN is allergic to vague claims; specifics are cheap proof you're not making it up.
- **The war stories are casual, not performative.** Phrases like "caught me out," "burned two hours on that," and "they were nicer about it than I deserved" read like a dev remembering a bad week. The earlier draft framed them as "things I got wrong while building this, in case any of it saves someone else the pain" — that's how a medium.com post sounds, not how a person talks.
- **Technical depth stays accessible.** "Node won't hand you a single string that long" is the same bug as "exceeded V8's string-length cap" but anyone who's hit a memory error once knows what it means. "OpenTelemetry sampling buffer that captures about 1% of events" is technical enough to earn a follow-up comment, plain enough that a non-systems person understands the trap.
- **Pricing is inline, not a bulleted tier table.** A reader absorbs "$5.99 one-time unlocks a tier called Max" without having to parse a price card. And the "if Claude Max subscription is the only AI you pay for, the app is free" line shifts the buying decision to the reader's specific situation — nothing more persuasive than "you already have what you need."
- **Closes on a note, not a CTA.** "Happy to hear about anything weird that breaks" invites real replies (and specifically invites the nerdiest replies — LiteLLM setups, self-hosted routers). Better than "thoughts?" or "would love feedback."

### Writing the launch-day follow-up replies

When comments come in, match this same voice. A few templates for common threads:

**"Why not just use [X tool I've never heard of]?"**
> Fair — I looked at [X] when I was figuring this out. It does [thing X is good at]. Tokenly is narrower: menu-bar live counter, no account, no server component. Different tool for a slightly different need.

**"Does this work with ChatGPT?"**
> Unfortunately no. ChatGPT Desktop encrypts its local conversation store, so there's nothing to read. Codex CLI and Codex Desktop do work — they share the same log folder, unencrypted.

**"Why not open source the whole thing?"**
> Source is public at github.com/tokenlyapp/tokenly — it's FSL-1.1-MIT, which means you can read, fork, run locally, modify. The license converts to plain MIT after 2 years. The only thing it doesn't let you do is repackage and sell a competing product.

**"Someone found a bug."**
> Good catch, reproducing now. Will push a fix today and reply here with the commit.
> *(Then actually do it — voters track this.)*

**"Your pricing is too expensive / too cheap."**
> Too expensive: fair, let me know which features would make Max feel worth it.
> Too cheap: appreciate that, but $5.99 is where the pricing lands until I see data saying otherwise.

---

## Pre-flight checklist

- [x] Landing page loads fast and Buy button works
- [x] `trytokenly.app` resolves from multiple networks (DMARC added too)
- [x] One purchase tested end-to-end with a real card
- [x] GitHub issue templates pinned
- [x] `CONTRIBUTING.md` + `LICENSE` (FSL-1.1-MIT) in the repo
- [x] Email/push on for GitHub issues
- [x] Demo GIF embedded in `README.md`
- [x] No "coming soon" or dead code on the landing page
- [x] Stripe dashboard (desktop + mobile) ready for real-time sales watch
- [x] Calendar cleared for 6h post-launch

---

## What success looks like

| Tier | Upvotes | Visitors | Free downloads | Max conversions | Probability |
|---|---|---|---|---|---|
| Flop | <5 | — | — | — | ~40% |
| Decent | 30–80 | 1,500–4,000 | 200–500 | 10–25 | ~50% |
| Hit (front page 6–24h) | 150+ | 20,000+ | 2,500+ | 80–200 | ~8% |
| Home run (#1 front page) | 500+ | 50,000+ | 6,000+ | 250+ | <2% |

> Max conversion rate from free download is the biggest unknown. Assume 3–5% on launch-day audience (impulse-buying on novelty). Steady-state conversion will settle toward 1–2%.

The human voice in the first comment is the single biggest lever for moving from *decent* to *hit*. The freemium angle drives **volume of free downloads**, which compounds into Max conversions over the weeks following launch.

---

## Post-launch (within 72h)

- **Ship a point release** with anything the HN thread surfaces — even tiny. Reply in the thread: "Just shipped 1.8.2 with the fix from [username]'s comment." Massive goodwill.
- **Product Hunt launch** 24–48h after HN peak. Different headline, different first comment — don't reuse HN text.
- **Twitter thread** linking back to the HN discussion with the most interesting comment callouts.
- **Post-mortem blog post** on the launch — revenue numbers, what worked, what didn't. Indie Hackers + dev.to + your own site. Compounds for months.
