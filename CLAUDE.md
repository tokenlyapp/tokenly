# Tokenly Claude Code Operating Context

This file is loaded by Claude Code when working in the Tokenly app repo.

## Repos

- App repo: `/opt/data/repos/tokenly`
- Website repo: `/opt/data/repos/tokenly-site`
- Launch repo: `/opt/data/repos/tokenly-launch`

## Canonical Sources

- Product/source-of-truth: `docs/SOURCE_OF_TRUTH.md`
- Maintenance workflow: `docs/CONTENT_MAINTENANCE_PLAYBOOK.md`
- AI operations plan: `docs/TOKENLY_AI_OPERATIONS_PLAN.md`
- Content audit: `scripts/audit-content-claims.mjs`
- Notion mirror sync: `scripts/sync-notion-source-of-truth.py`

## Required Commands

Before finalizing product/content-facing changes, run:

```bash
npm run audit:content
```

When source-of-truth/playbook docs change and Notion credentials are available, run:

```bash
python3 scripts/sync-notion-source-of-truth.py
```

## Product Wording Rules

- Public marketing wording: `Mac menu-bar app`.
- Technical docs may say: `Electron-based macOS app`.
- Avoid public native-implementation claims unless explicitly reframed as OS integration rather than implementation technology.

## Claude Quota Wording Rules

Use:

- `5-hour rolling burst window`
- `weekly usage cap`

Avoid active/public claims like:

unsupported legacy Claude quota-window phrasings; use SOURCE_OF_TRUTH wording only.

## Approval Rules

Do not implement or merge changes involving the following without Austin approval:

- pricing or paid-tier strategy
- privacy posture
- telemetry/backend/account behavior
- OAuth/token handling
- Stripe/license behavior
- user API-key storage or transmission
- release/deploy actions
- public launch narrative changes across channels

Low-risk docs/tests/lint/audit improvements can be prepared in branches and PRs, but major product changes require approval before implementation or merge.

## Secret Handling

Never print, preserve, or commit secrets, API keys, tokens, passwords, credentials, or connection strings. Replace any encountered value with `[REDACTED]`.

## Agent Usage

Use project agents in `.claude/agents/` for focused work:

- `app-architecture-auditor`
- `quota-provider-specialist`
- `privacy-security-reviewer`
- `performance-reliability-engineer`
- `ux-product-reviewer`
- `website-seo-schema-specialist`
- `launch-social-strategist`
- `release-ci-operator`

Prefer narrow, specialist review before broad implementation.
