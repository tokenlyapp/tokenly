# Tokenly content maintenance playbook

Last audited: 2026-05-07T00:03:50Z

Goal: keep Tokenly organized so the app repo, website, launch docs, blog posts, social drafts, and Notion rollout tasks do not drift.

## Ownership model

Canonical product facts live in:

- App repo: `/opt/data/repos/tokenly/docs/SOURCE_OF_TRUTH.md`

Implementation truth lives in:

- `/opt/data/repos/tokenly/package.json`
- `/opt/data/repos/tokenly/main.js`
- `/opt/data/repos/tokenly/preload.js`
- `/opt/data/repos/tokenly/app/components/*.jsx`
- `/opt/data/repos/tokenly/pricing.json` or the hosted pricing source

Public website truth lives in:

- `/opt/data/repos/tokenly-site/*.html`
- `/opt/data/repos/tokenly-site/components/*.jsx`
- `/opt/data/repos/tokenly-site/blog-content/*.md`
- `/opt/data/repos/tokenly-site/blog/*.html`
- `/opt/data/repos/tokenly-site/components/blog-posts.js`
- `/opt/data/repos/tokenly-site/pricing.json`

Launch/distribution truth lives in:

- `/opt/data/repos/tokenly-launch/launch/3-month-launch/*`
- `/opt/data/repos/tokenly-launch/launch/blog/*`
- `/opt/data/repos/tokenly-launch/launch/hn-launch.md`
- `/opt/data/repos/tokenly-launch/launch/twitter-thread.md`
- `/opt/data/repos/tokenly-launch/_hermes/*`
- Typefully drafts, when scheduling X content
- Tokenly Launch Notion rollout database

## Required update checklist for any product change

Use this checklist whenever Tokenly changes in a user-visible way.

1. App/code
   - Update version in `package.json` if shipping a release.
   - Update implementation.
   - Update relevant in-app mock/demo fixtures if website previews depend on them.
   - Update app README and PROJECT build record.

2. Source of truth
   - Update `/opt/data/repos/tokenly/docs/SOURCE_OF_TRUTH.md` in the same change.
   - If a claim is uncertain, mark it as “needs verification” instead of letting it leak into marketing copy.

3. Website
   - Update static pages and React components.
   - Update `components/blog-posts.js` if title/description/read-time/card metadata changes.
   - Update `blog/<slug>.html` static SEO/OG/schema shells if blog title, description, canonical, image, or schema changes.
   - Update `blog-content/<slug>.md` bodies.
   - Update `sitemap.xml` only if URLs are added/removed.
   - Preserve existing slugs unless Austin explicitly wants a redirect/migration.

4. Launch/social docs
   - Update launch docs if the claim affects launch positioning.
   - For HN/Product Hunt/Reddit/Indie Hackers/community copy, lead with free local value and keep pricing/tier language secondary or absent.
   - For X, paid tiers/prices can be direct after the problem is established.
   - If editing existing Typefully drafts, patch drafts in place and preserve media IDs.

5. Notion
   - If the work corresponds to an existing Tokenly rollout task, mark it In progress before starting and Done after completion using `/opt/data/scripts/tokenly_notion_status.py`.
   - For source-of-truth/playbook changes, update the Notion mirror page so the launch workspace stays readable without leaving Notion.
   - Do not invent Notion tasks unless Austin asks, except for explicit organization/system work where he has asked to keep everything up to date.

6. Verification
   - Run the audit script from the app repo:
     `node scripts/audit-content-claims.mjs`
     or `npm run audit:content`
   - For website changes, run:
     `git diff --check`
     `node -c components/blog-posts.js`
     `npm run inject-gtm -- --dry-run`
   - For app changes, run the relevant app checks/build that fit the change.
   - For live publishing, verify the public endpoint actually serves the updated text before claiming it is live.

## Drift categories to watch

High-risk drift:

- Version numbers.
- Pricing: free, $5.99 Max, $8.99 Max + AI.
- Whether Tokenly is described as a “Mac menu-bar app” publicly and “Electron-based macOS app” technically; avoid “native macOS” / “Mac-native” in public copy.
- Free vs paid feature boundaries.
- Claude rate-limit wording.
- Subscription quotas vs local token logs.
- Unsupported surfaces like ChatGPT Desktop, Cursor, Windsurf, Antigravity, Perplexity.
- Privacy claims: no backend/no telemetry/no proxy/keys stay local.
- Blog slug preservation.

## Recommended ongoing process

### Before each shipping session

1. Read `/opt/data/repos/tokenly/docs/SOURCE_OF_TRUTH.md`.
2. Check `git status` in all three repos:
   - `/opt/data/repos/tokenly`
   - `/opt/data/repos/tokenly-site`
   - `/opt/data/repos/tokenly-launch`
3. Check the Notion rollout task list for matching tasks.

### During the session

1. Keep one current todo list.
2. If working on Tokenly launch tasks, update Notion status in real time when a matching task exists.
3. When making product claims, quote or derive them from the source-of-truth doc or app code.
4. If app code and docs disagree, treat app code/package version as canonical until Austin says otherwise, then update docs.

### Before finalizing

1. Run the audit script.
2. Check diffs.
3. List known unresolved drift explicitly.
4. If publishing, verify the live website URL.
5. If changes were made, state exact files changed and whether they are committed/pushed/live.

## Suggested repository policy

Add this to future PR discipline:

- Any PR that changes app behavior must include either:
  - an update to `docs/SOURCE_OF_TRUTH.md`, or
  - a short note in the PR explaining why source-of-truth docs are unaffected.
- Any PR that changes pricing/tiering/claims must run `scripts/audit-content-claims.mjs`.
- Any PR that changes blog content must preserve the slug unless a redirect is included and verified.

## Automation now in place

The app repo includes a reusable content audit command:

```bash
npm run audit:content
```

The app repo also includes a GitHub Actions workflow:

```text
.github/workflows/content-drift-check.yml
```

That workflow runs on pull requests, pushes to `main`, and manual dispatch when content/code files change. It checks out the app repo, then best-effort checks out `tokenly-site` and `tokenly-launch`, and runs `scripts/audit-content-claims.mjs` against all available repos.

For private cross-repo checkouts, add a GitHub secret named `TOKENLY_CONTENT_AUDIT_TOKEN` with read access to:

- `tokenlyapp/tokenly`
- `tokenlyapp/tokenly-site`
- `tokenlyapp/tokenly-launch`

If the secret is absent or one sibling repo cannot be checked out, the scan still runs on available roots and prints the missing root in the report.

For source-of-truth/playbook Notion mirroring, run:

```bash
python3 scripts/sync-notion-source-of-truth.py
```

Required environment:

- `NOTION_API_KEY` or `NOTION_TOKEN`
- `NOTION_LAUNCH_PAGE_ID`

The script updates these child pages under the Tokenly Launch hub:

- Tokenly Source Of Truth
- Tokenly Content Maintenance Playbook

Hermes also has scheduled Tokenly operations loops:

```text
Cron job: Tokenly daily operations digest
Job ID: e86216ff7c66
Schedule: every 24h
```

The daily job runs the content audit command, checks git status in the app/site/launch repos, inspects open PR/check state where credentials allow it, checks in-progress Notion rollout tasks, and reports a concise green/yellow/red operations digest to the origin conversation.

```text
Cron job: Tokenly weekly product audit
Job ID: 18aad1d37fb1
Schedule: Mondays at 15:00 UTC
```

The weekly job is read-only/proposal-only. It audits app architecture, privacy/security, performance/reliability, UX/product experience, and website/launch consistency, then returns a ranked improvement backlog. It must not implement code, push branches, create PRs, merge, deploy, publish, or schedule external posts without an explicit current user instruction.

The app repo also includes the AI operations plan and Claude Code project context:

```text
docs/TOKENLY_AI_OPERATIONS_PLAN.md
CLAUDE.md
.claude/agents/
.github/pull_request_template.md
```

These files define the specialist roster, approval tiers, PR reporting format, and Claude Code operating context for future Tokenly work.

## Current next cleanup targets

1. Keep public copy on “Mac menu-bar app”; keep technical docs on “Electron-based macOS app” where implementation detail matters.
2. Keep Claude quota wording on “5-hour rolling burst window” + “weekly cap”; reserve “7d” for literal UI/API labels only.
3. Maintain the Notion mirror whenever source-of-truth/playbook content changes.
4. Keep the audit script wired into the automated PR/release/content workflow so drift checks happen before publishing.
5. Do a second pass over website SEO/schema metadata whenever headline positioning changes.
