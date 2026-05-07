# Tokenly AI Operations System Plan

> **For Hermes:** Use `subagent-driven-development`, `claude-code`, and GitHub PR workflow skills to implement this plan task-by-task. Major product, pricing, privacy, infrastructure, or public-launch changes require Austin approval before execution or merge.

**Goal:** Build an AI-operated Tokenly product system where Hermes acts as the orchestrator, specialized Claude Code/subagent workers audit and improve the app/site/launch materials, and canonical docs/Notion/GitHub checks stay updated as changes land.

**Architecture:** Hermes is the durable orchestrator. It schedules recurring audits, decomposes work into specialist agents, reviews their outputs, opens PRs, and asks Austin for approval on major changes. Claude Code agents are focused workers with narrow specialties, ideally running in isolated branches/worktrees so failures and context bleed are minimized.

**Tech Stack:** Hermes Agent cron jobs, Hermes `delegate_task`, Claude Code CLI, Git branches/PRs, GitHub Actions, Notion mirror script, Tokenly app/site/launch repos.

---

## Operating Model

Hermes should act like Tokenly's AI chief-of-staff / technical operator, not an unchecked deploy bot.

Hermes is responsible for:

- Maintaining the canonical Tokenly source-of-truth.
- Proposing product improvements.
- Auditing app code, website copy, launch copy, docs, and metadata for drift.
- Spawning focused subagents for specialty work.
- Routing code changes through branches and PRs.
- Running verification gates before asking for merge/deploy approval.
- Updating Notion mirrors and rollout task status.
- Surfacing concise decisions to Austin.

Hermes should not:

- Merge or deploy major changes without Austin approval.
- Change pricing, privacy posture, account/backend behavior, telemetry, or public positioning without Austin approval.
- Let one generalist agent make broad app/product changes without specialist review.
- Push secrets, tokens, credentials, or raw env values into docs, PRs, logs, or chat.

---

## Approval Tiers

### Tier 0: Observe / Report

No approval required.

Examples:

- Daily drift audit.
- Read-only codebase audit.
- Bug/inefficiency report.
- Competitive/product research summary.
- Notion mirror sync from already-approved canonical docs.

### Tier 1: Low-risk local changes

Hermes may prepare local branches/PRs, then summarize.

Examples:

- Documentation cleanup.
- Non-public internal comments.
- Test-only additions.
- Lint/format fixes.
- Audit-script improvements that do not change product behavior.

### Tier 2: Product/code changes requiring PR review

Hermes may propose and implement in a branch, but Austin approves merge/deploy.

Examples:

- App feature improvements.
- UX/UI changes.
- Performance refactors.
- Provider tracking changes.
- Website copy changes.
- Launch copy changes.

### Tier 3: Explicit approval before implementation

Hermes must ask Austin before coding.

Examples:

- Pricing or paid-tier changes.
- Privacy/telemetry/backend/account behavior changes.
- License/purchase/Stripe behavior changes.
- Data storage or user API-key handling changes.
- Public launch narrative changes across channels.
- Anything that could affect user trust, revenue, or release timing.

---

## Specialist Agent Roster

Each specialist should receive a narrow prompt, exact repo paths, allowed scope, verification commands, and explicit non-goals.

### 1. App Architecture Auditor

Focus:

- Electron main/preload/renderer architecture.
- React state management.
- File/log ingestion boundaries.
- Background process lifecycle.
- Menu-bar/tray behavior.
- IPC surface area.

Typical output:

- Ranked architectural risks.
- Specific refactor opportunities.
- Files to inspect.
- Suggested PR-sized fixes.

Allowed by default:

- Read-only audits.
- Draft plans.

Requires approval before:

- Broad architecture refactors.
- IPC contract changes.

### 2. Quota Provider Specialist

Focus:

- Claude, ChatGPT, Gemini quota sources.
- CLI OAuth/token usage flows.
- Quota wording accuracy.
- Failure modes when providers change APIs/UI.

Typical output:

- Provider reliability report.
- Regression tests or fixtures.
- Update recommendations.

Requires approval before:

- Any change that alters OAuth/token handling or user credential storage.

### 3. Privacy / Security Reviewer

Focus:

- User API keys stay local.
- No accidental telemetry/backend/proxying.
- Secrets handling.
- SafeStorage/encryption behavior.
- IPC and local file access risks.

Typical output:

- Security findings by severity.
- Concrete patches for safe fixes.
- Blocker list for any PR touching sensitive areas.

Requires approval before:

- Any data-handling behavior change.

### 4. Performance / Reliability Engineer

Focus:

- App startup time.
- Memory/CPU usage.
- Log scanning efficiency.
- Watchers/background tasks.
- Retry/backoff behavior.
- Build/release reliability.

Typical output:

- Bottleneck list.
- Benchmarks or reproduction commands.
- Small PR-sized performance fixes.

### 5. UX / Product Experience Reviewer

Focus:

- Menu-bar UX.
- Onboarding.
- Pricing/free-vs-Max clarity.
- User comprehension.
- Error states and empty states.

Typical output:

- Product improvement proposals.
- UX paper cuts.
- Screens/flows to change.
- Copy suggestions aligned with source-of-truth.

Requires approval before:

- Major flow changes.
- Pricing/paywall UX changes.

### 6. Website / SEO / Schema Specialist

Focus:

- Website copy accuracy.
- Metadata/schema consistency.
- Blog/source-of-truth alignment.
- Public wording: “Mac menu-bar app.”
- Channel-specific positioning rules.

Typical output:

- Website drift report.
- PRs for metadata/copy fixes.
- SEO opportunities.

### 7. Launch / Social Strategist

Focus:

- HN, Product Hunt, Reddit, IndieHackers, X, community launch copy.
- Channel-specific positioning.
- Avoiding paid-tier foregrounding in community launch posts.
- X can be more direct about paid features.

Typical output:

- Launch calendar updates.
- Post drafts.
- Message-market fit improvements.

Requires approval before:

- Publishing/scheduling external posts.

### 8. Release / CI Operator

Focus:

- GitHub Actions.
- Netlify/Fly/GitHub release flow.
- Auto-update/release verification.
- Build and deployment checks.

Typical output:

- CI improvements.
- Release checklist updates.
- Failure diagnosis.

Requires approval before:

- Production deploys.
- Release publication.

---

## Recurring Loops

### Daily Drift Watchdog

Already exists:

- Hermes cron job: `e86216ff7c66`
- Runs every 24h.
- Checks content drift and repo status.

Next upgrade:

- Expand from content-only drift into operational digest:
  - app repo status
  - site repo status
  - launch repo status
  - open PR status
  - failed GitHub Actions
  - stale Notion tasks
  - high-risk source-of-truth changes

### Weekly Product Audit

Proposed recurring job.

Purpose:

- Spawn read-only specialist audits.
- Produce a ranked Tokenly improvement backlog.
- No code changes unless Austin approves.

Suggested cadence:

- Weekly, Monday morning.

Specialists:

- App Architecture Auditor
- Privacy / Security Reviewer
- Performance / Reliability Engineer
- UX / Product Experience Reviewer
- Website / SEO / Schema Specialist

Output:

- Top 5 recommended improvements.
- Risk level.
- Estimated effort.
- Which specialist should implement.
- Whether Austin approval is required.

### PR/Branch Maintenance Loop

Proposed recurring job.

Purpose:

- Watch open Tokenly PRs.
- Check CI state.
- Summarize blockers.
- Propose next action.

Suggested cadence:

- Daily or every 12h while active PRs exist.

---

## Implementation Workflow for Changes

### Step 1: Identify opportunity

Sources:

- Austin request.
- Daily audit finding.
- Weekly specialist audit.
- CI failure.
- User feedback.
- Launch/content drift.

### Step 2: Classify approval tier

Use the Approval Tiers above.

If Tier 3, ask Austin before implementation.

### Step 3: Create focused task graph

Examples:

- Security issue:
  - Security Reviewer audits.
  - App specialist implements fix.
  - Security Reviewer re-reviews.
  - Release/CI Operator verifies.

- UX improvement:
  - UX Reviewer writes spec.
  - App specialist implements.
  - Website/SEO specialist updates docs/copy if needed.
  - Content drift scanner verifies.

- Provider quota change:
  - Quota Provider Specialist audits provider behavior.
  - App specialist implements.
  - Privacy/Security Reviewer checks credential handling.
  - Website/SEO specialist updates public docs if product facts changed.

### Step 4: Use isolated branches/worktrees

Each implementation should use a dedicated branch.

Recommended branch naming:

- `audit/<area>-<short-description>` for read-only audit docs.
- `fix/<area>-<short-description>` for bug fixes.
- `feat/<area>-<short-description>` for product changes.
- `docs/<area>-<short-description>` for docs/copy changes.

### Step 5: Two-stage review

Every implemented change gets:

1. Spec compliance review.
2. Code quality/security/content review by relevant specialist.

Do not proceed if either reviewer requests changes.

### Step 6: Verification gate

Run relevant commands, for example:

```bash
cd /opt/data/repos/tokenly
npm run audit:content
```

Add app/site-specific build/test commands once standardized.

### Step 7: Update source-of-truth and Notion if needed

If product facts or operating process changed:

```bash
cd /opt/data/repos/tokenly
python3 scripts/sync-notion-source-of-truth.py
```

### Step 8: Open PR and ask Austin

PR summary should include:

- What changed.
- Why it matters.
- Which agents reviewed it.
- Verification results.
- Approval tier.
- Risks / rollback notes.

---

## Proposed First Implementation Tasks

### Task 1: Add project-level Claude Code agent definitions

**Objective:** Create `.claude/agents/` specialist definitions in the Tokenly app repo so Claude Code can invoke focused agents consistently.

**Files:**

- Create: `.claude/agents/app-architecture-auditor.md`
- Create: `.claude/agents/quota-provider-specialist.md`
- Create: `.claude/agents/privacy-security-reviewer.md`
- Create: `.claude/agents/performance-reliability-engineer.md`
- Create: `.claude/agents/ux-product-reviewer.md`
- Create: `.claude/agents/website-seo-schema-specialist.md`
- Create: `.claude/agents/launch-social-strategist.md`
- Create: `.claude/agents/release-ci-operator.md`

**Verification:**

```bash
cd /opt/data/repos/tokenly
claude agents
```

Expected:

- Project agents are visible or loadable by Claude Code.

### Task 2: Add Tokenly project context for Claude Code

**Objective:** Create/extend `CLAUDE.md` so every Claude Code session understands Tokenly architecture, commands, approval rules, and content/source-of-truth requirements.

**Files:**

- Create or modify: `CLAUDE.md`

**Must include:**

- App repo path.
- Site repo path.
- Launch repo path.
- Source-of-truth doc location.
- `npm run audit:content` requirement.
- Public wording rule: “Mac menu-bar app.”
- Claude quota wording rule.
- Approval tier summary.
- Secret handling rule.

### Task 3: Upgrade daily cron prompt

**Objective:** Expand the existing daily drift audit into a Tokenly operations digest.

**System:**

- Existing cron job: `e86216ff7c66`

**New checks:**

- App/site/launch git status.
- Open PR list.
- App content drift scan.
- Notion rollout tasks in progress/stale.
- Any unmerged source-of-truth changes.
- Recommended next actions.

### Task 4: Create weekly product-audit cron job

**Objective:** Schedule a weekly read-only Tokenly product audit that produces improvement proposals but does not implement without Austin approval.

**Specialist coverage:**

- App architecture.
- Privacy/security.
- Performance/reliability.
- UX/product.
- Website/content consistency.

**Output:**

- Top opportunities.
- Risk/effort/impact.
- Suggested owner/specialist.
- Whether approval is needed.

### Task 5: Add PR template for AI-operated changes

**Objective:** Make every Tokenly AI-generated PR report which agents participated, what was verified, and what approval tier applies.

**Files:**

- Create or modify: `.github/pull_request_template.md`

**Template sections:**

- Summary.
- Agent roles used.
- Approval tier.
- Verification.
- Source-of-truth / Notion impact.
- Risks and rollback.

---

## Definition of Done for the AI Operations System

The first version is working when:

- Claude Code has project-level specialist agents.
- `CLAUDE.md` gives every Claude Code session Tokenly operating context.
- Daily Hermes audit produces an operations digest, not just a content scan.
- Weekly product audit is scheduled.
- PRs have an AI-operations template.
- Source-of-truth and Notion mirror remain synchronized.
- Austin receives concise approval requests for Tier 3 and merge/deploy decisions.

---

## Open Decisions for Austin

1. Should Hermes be allowed to create PRs automatically for Tier 1 and Tier 2 work, as long as it does not merge without approval?
2. Should weekly product audits run on a fixed day/time?
3. Should the weekly audit output go to this chat, Notion, or both?
4. Should Claude Code agents be allowed to use `--dangerously-skip-permissions` in isolated worktrees, or should they stay tool-restricted and let Hermes handle approvals?
5. Should Release/CI Operator be allowed to trigger Netlify/GitHub release workflows, or only inspect/report unless Austin explicitly asks?
