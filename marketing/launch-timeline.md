# Tokenly — Launch timeline

**Target post date:** Tuesday, April 28, 2026, ~7:30 AM ET
**Today:** Thursday, April 23, 2026 (T-5)
**Status:** All 10 pre-flight items done. Product is launch-ready.

This document is the 5-day runway — what to ship when, ranked by impact on the HN post and the 7-day tail that follows.

---

## Top-3 highest-impact moves (do these first if you only have an hour)

1. **HN account warm-up** — 3–4 thoughtful comments on unrelated HN threads between today and Monday. Without this, your brand-new "Austin-posts-once-and-runs" account gets auto-flagged within minutes. This is the single most likely way the whole launch gets killed before it starts.
2. **Pre-draft 10 reply templates** for common HN objections. The first 6 hours after posting is a race — you cannot write thoughtful replies from a cold start while stressed and refreshing. Templates you can tweak cut reply time from 5 minutes to 30 seconds.
3. **Individual DMs to 10 dev friends Monday night.** Not a group blast. Ten separate "hey, launching Tokenly tomorrow AM, HN link incoming, would love your eyes if you have a min." Real humans clicking your landing page in the first hour are pure gold for ranking velocity, and individual DMs don't trip HN's brigading detection.

Everything else is supporting work around these three.

---

## Day-by-day

### Thursday, April 23 (today, T-5) — 45 min

- [ ] **Create / log into your HN account** and bookmark https://news.ycombinator.com/newest
- [ ] **First HN comment of your warm-up** — pick any front-page thread where you have genuine opinion: macOS dev tooling, Electron vs. native, API pricing, indie making, AI tooling. Leave one thoughtful comment (2–4 sentences, no self-promotion, no link to your stuff). Example thread types that are always live: "Ask HN" threads, any TC launch, any Electron discussion.
- [ ] **Draft the Twitter thread** for launch day (template below). Keep it in a note on your phone so it's ready.

### Friday, April 24 (T-4) — 1.5 hrs

- [ ] **HN comment #2** — different thread, different topic. Keep it organic.
- [ ] **Write Product Hunt submission** for Thursday, Apr 30 launch (2 days after HN peaks). Different tagline than HN — PH is less technical, more product-marketing. Save as draft in your notes.
- [ ] **Draft r/macapps post** for Wednesday, Apr 29. "I built a menu-bar tracker for AI spend" framing. Will post the day after HN.
- [ ] **Compile your DM list** — 10 specific dev friends who (a) use Claude Code / Cursor / Codex and (b) would genuinely care. Names + contact method (iMessage, Signal, Telegram, whatever you use).
- [ ] **Lobste.rs invite check** — if you have a Lobste.rs account, great. If not, you need an invite from an existing user. Lobste.rs traffic is small but high-quality; a front-page Lobste.rs slot on Wed/Thu extends the launch tail by days.

### Saturday, April 25 (T-3) — 1 hr

- [ ] **HN comment #3** — keep the cadence.
- [ ] **Write your 10 reply templates** (see section below). Save them somewhere you can copy-paste on launch day — I'd recommend a TextExpander snippet or just a pinned note on your Mac.
- [ ] **Test the GitHub README on mobile** — open `github.com/tokenlyapp/tokenly` on your phone. Does the demo GIF render? Does it feel fast? Is the CTA ("Download from trytokenly.app") visible above the fold on a small screen? 80% of HN mobile clicks bounce if the first screen looks broken.

### Sunday, April 26 (T-2) — 2 hrs

- [ ] **HN comment #4** (if you can).
- [ ] **Write the first-person launch blog post** — 600–900 words on your own domain or a Medium / dev.to / Substack. Title something like "I spent three weekends building a menu-bar tracker for AI spend" or "What I learned parsing 1.1 GB of Claude Code logs." Don't publish yet — it goes live at 10 AM ET Tuesday (2.5 hours after HN post) so you can link to it in thread replies.
- [ ] **Record one backup demo GIF** — something like 10 seconds, focusing on just the "click tray → see numbers" moment. Keep as a Plan B you can drop into a reply if someone asks "can you just show me what happens when I click it?" Don't embed now.
- [ ] **Dry-run the HN submit flow** — go to https://news.ycombinator.com/submit, fill in title + URL, do NOT hit submit. This just confirms the path is muscle-memory on launch morning.

### Monday, April 27 (T-1) — 2 hrs

- [ ] **Final comment read-aloud.** Open `marketing/hn-launch.md`, read the first comment out loud once, slowly. Any sentence that feels robotic when spoken — rewrite. This is the highest-leverage 15 minutes of the whole week.
- [ ] **Send 10 individual DMs** — evening is fine. Template below. Do NOT post in any group chat, Slack, Discord, or Twitter thread. One-by-one personal messages only.
- [ ] **Pre-load your launch-day browser** — 6 pinned tabs in one window:
   1. Your HN submission page (once you post, switch to this URL)
   2. https://news.ycombinator.com/newest (to watch velocity)
   3. https://trytokenly.app (to check it's still up)
   4. https://dashboard.stripe.com/payments
   5. https://dashboard.stripe.com/webhooks (the endpoint detail page)
   6. https://github.com/tokenlyapp/tokenly/issues
- [ ] **Prep tomorrow logistics**: water bottle, snacks, lunch in fridge, phone chargers near your desk, bathroom break right before posting, partner/roommates warned to not interrupt.
- [ ] **Sleep 8 hours.** No alcohol. Set alarm for 6:30 AM.

### Tuesday, April 28 (T-0, LAUNCH DAY)

**6:30 AM ET** — Wake up. Coffee. Shower.

**7:00 AM ET** — Final pre-flight (5 min):
- Click `trytokenly.app` → click "Get Max" → confirm Stripe checkout loads
- Click `github.com/tokenlyapp/tokenly` → confirm GIF renders in README
- Check Stripe dashboard → zero failed webhook deliveries in last 48h

**7:15 AM ET** — Submit to HN:
1. news.ycombinator.com/submit
2. Title: `Show HN: I built a menu-bar tracker for my Claude Code and Codex spend`
3. URL: `https://trytokenly.app`
4. Leave text box empty
5. Hit submit
6. **Within 30 seconds**: post the first comment from `marketing/hn-launch.md` as a top-level reply

**7:20 AM ET** — Post launch-day tweet #1 (template below).

**7:25 AM ET** — Send the 10 DMs (you pre-composed them last night; just paste+send, one by one).

**7:30 AM – 10:00 AM ET** — **Active watch mode.** Refresh HN every ~2 min. Reply to every comment within 15 min of it appearing. If you hit `/show` front page by 8:30, you're on pace for decent. If main `/news` front page by 9:30, you're on pace for hit.

**10:00 AM ET** — **Publish the blog post** from your own domain (the one you drafted Sunday). Post tweet #2 linking to it and back to HN.

**10:30 AM ET – 1:00 PM ET** — Continue replying. If someone finds a bug: "Fixing now" → fix → `npm run dist:publish` → comment back with the version number.

**1:00 PM ET** — Lunch break (30 min, away from desk). Your post will not die in 30 min; your brain needs it.

**1:30 PM – 6:00 PM ET** — Back to thread. Late-afternoon US = early-evening Europe wave, expect a second bump.

**6:00 PM ET** — Downshift. Glance every hour. Let the post breathe overnight.

### Wednesday, April 29 (T+1, post-launch day 1) — 2 hrs

- [ ] **Post to r/macapps** (morning, 9–10 AM ET). Link to HN thread in the post.
- [ ] **Submit to Lobste.rs** if you have an account. Tag: `launch` + `mac`.
- [ ] **Reply to HN stragglers** — overnight comments from Europe/Asia. Should take 30 min.
- [ ] **Start drafting the post-mortem blog post** — revenue numbers, what worked, what didn't. Publishes the following Monday.

### Thursday, April 30 (T+2, Product Hunt day)

- [ ] **Submit to Product Hunt at 12:01 AM PT** (3:01 AM ET). Product Hunt days run 12-to-12 Pacific. Submitting at 12:01 gives you a full 24h on leaderboard.
- [ ] **Twitter thread #3** at 9 AM ET linking to PH, referencing the HN result ("we hit #X on HN Tuesday, now on Product Hunt today"). Social proof compounds.
- [ ] **Post to Indie Hackers** — different angle, more "here's what I learned" than "launch." Keeps the tail going.

### Friday, May 1 (T+3)

- [ ] **Email anyone who bought Max during the week** — short personal "thank you, here's what's shipping next" message. Not automated. 10 minutes per buyer, but this is how you build the base that rebuys on your next product.
- [ ] **Finish the post-mortem post** with real numbers. Schedule it for Monday.

### Monday, May 4 (T+6)

- [ ] **Publish the post-mortem.** Dev.to + Indie Hackers + your own site. This is the piece that compounds for a year — SEO, Twitter reshares, future HN "N months later" posts.

---

## Content to pre-write

### The 10 reply templates (write these Saturday)

```
# Template 1 — "Why not just use [X]?"
Fair — [X] does [thing it's good at], and if that's your workflow it's a solid choice. Tokenly is narrower on purpose: menu-bar, no account, nothing server-side, macOS-only. Different tool for a slightly different job.

# Template 2 — "Does this work with ChatGPT?"
Unfortunately no. ChatGPT Desktop encrypts its local conversation store, so there's nothing to read off disk. Codex CLI and Codex Desktop work fine — they share the same unencrypted log folder.

# Template 3 — "Why not open source the whole thing?"
Source is public at github.com/tokenlyapp/tokenly. It's FSL-1.1-MIT — you can read, fork, run, modify. The license converts to plain MIT after 2 years. The only thing you can't do is repackage and sell a competing product.

# Template 4 — Bug report
Good catch, reproducing now. Will push a fix today and reply here with the commit. Thanks for the detail.

# Template 5 — Too expensive
Fair feedback. $5.99 feels right to me given it's one-time and includes every future API-side feature, but if there's a specific thing that would make it feel worth it I'm genuinely curious.

# Template 6 — Too cheap
Appreciate that — $5.99 is where it lands for now. If the data later says otherwise, I can adjust. Existing buyers are grandfathered regardless.

# Template 7 — Privacy skeptic ("how do I know it's not phoning home?")
Fair to be skeptical — that's the whole point of the README's "Privacy & security" section and the public source tree. You can audit every network call in main.js in about 10 minutes; the only outbound calls are to the providers you configured, plus GitHub Releases for updates and trytokenly.app/pricing.json for rate refreshes. No telemetry, no crash reporting, no analytics.

# Template 8 — Feature request (generic)
Good idea. Opened an issue here: [link]. Tokenly's roadmap is deliberately narrow, so I can't promise when — but this is exactly the kind of signal that moves things up the list.

# Template 9 — Windows / Linux
Mac-only by design, and unlikely to change soon. Cross-platform would require a different architecture and I'd rather the Mac version be excellent than the multi-platform version be mediocre. Totally fair if that's a dealbreaker.

# Template 10 — "What about [obscure tool X]?"
Haven't looked at [X] yet — if it exposes a usage API or writes predictable local logs, it's on the table. Can you drop a link here or file an issue? Genuinely helpful signal.
```

### The Twitter thread (draft Thursday, polish Sunday)

```
Tweet 1 (launch moment):
After three weekends of work, Tokenly is live.

It's a menu-bar app that shows you every dollar and token you've spent across Claude Code, Codex, Gemini CLI, OpenAI, Anthropic, and OpenRouter — live, on your Mac.

The local tools are free. Full API billing is $5.99 one-time.

[HN LINK]

Tweet 2 (demo):
The whole point: one place, no dashboards, keys never leave your Mac.

[EMBED DEMO GIF]

Tweet 3 (the $843/$8.43 story — HN crowd will share this):
Building this taught me that Anthropic's billing API returns cents as a string and OpenAI's returns dollars as a number.

I mixed them up early and briefly showed someone their monthly bill as $843 when it was actually $8.43.

They were nicer about it than I deserved.

Tweet 4 (context-for-non-HN-people):
If you live in Claude Code like I do, the subscription ROI question is real — am I using $20/mo of Claude Max, or $200?

Tokenly shows the answer live. Token counts, dollar estimates, per-model breakdowns, 30-day trends.

Tweet 5 (link):
Free for local CLIs. Max for API billing.
Source: github.com/tokenlyapp/tokenly
Site: trytokenly.app

Happy to answer questions in the HN thread or here.
```

### The 10 DM template (Monday evening)

Personalize the first line for each friend. Copy-paste the middle.

```
Hey [name] — hope you're good.

Launching a thing I've been working on tomorrow morning (Tue Apr 28, ~7:30 AM ET, Show HN). It's a menu-bar app for tracking AI spend across Claude Code, Codex, Gemini, OpenAI, Anthropic, and OpenRouter — called Tokenly. trytokenly.app

If you're around tomorrow morning and have a minute, I'd really appreciate you taking a look and (if it resonates) leaving an honest comment on the HN post. Zero pressure — mostly want real humans hitting the page in the first hour so the algorithm notices, not a fake upvote brigade.

HN link will be in your DMs around 7:30 AM ET. Thanks either way 🙏
```

Then on launch morning you send each of them the actual HN link in a second message.

### The blog post (draft Sunday, publish Tuesday 10 AM ET)

Title options:
- "Three weekends, 1.1 GB of logs, and a menu-bar app: launching Tokenly"
- "What I learned parsing my own Claude Code usage"
- "Why I built a menu-bar tracker for AI spend (and what it cost me to be wrong by 100×)"

600–900 words. Content to hit:
- The origin moment (end of month, no idea what I spent)
- Three or four of the war stories from the HN comment, expanded to full paragraphs
- A screenshot of the dashboard showing real numbers from one of your days
- Closing: "Launching today on Show HN" + link to the HN thread

Don't re-use the HN comment text. Different audience, different format.

---

## What not to do

- **Don't post in any group chat, Slack, or Discord** with "go upvote this." HN detects this and will shadow-flag your post. IP-clustered votes are a bright red light.
- **Don't post on Twitter with "help me hit the front page of HN."** Same reason.
- **Don't submit to more than one community site simultaneously.** HN Tuesday, r/macapps Wednesday, PH Thursday, Lobste.rs Wed/Thu, IH Thursday. Each gets its own day; you get a new wave each time.
- **Don't refresh HN obsessively if it's flopping.** If you're at <5 upvotes after 90 minutes, it's going to flop. Don't spiral — learn from it, move on to the other channels Wed–Thu.
- **Don't email "please cover us" to journalists.** A tiny percentage of Show HNs that hit the front page get picked up organically by TechCrunch / The Verge / Ars. That's a bonus, not a plan. Earned coverage, not begged.

---

## Success rubric (what you're actually aiming for)

| Outcome | How you'll feel |
|---|---|
| **Flop** (<5 upvotes, off /newest in an hour) | Embarrassed. Don't be — ~40% of Show HNs flop. Use the other channels Wed/Thu. |
| **Decent** (30–80 upvotes, a few hours on /show) | Good. 15–40 Max conversions, 200–500 free downloads, real bug reports, a foundation for month two. |
| **Hit** (front page of /news, 6–24 hours) | Great. Revenue week, hundreds of stars on GitHub, press nibbles. Prepare for support volume Wed–Fri. |
| **Home run** (top 10 all day) | Spectacular. Clear your week. Servers and you will both be stressed. |

The timeline above is optimized for "decent or better." The difference between decent and flop is almost entirely: (1) account warm-up, (2) good first comment, (3) early-hour velocity from friends. You've handled #2 already. This week is about #1 and #3.
