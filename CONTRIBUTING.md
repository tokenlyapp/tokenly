# Contributing to Tokenly

Thanks for wanting to help make Tokenly better. A few ground rules to save us both time.

## Reporting bugs

Please use the [bug report template](https://github.com/tokenlyapp/tokenly/issues/new/choose) — the form asks for the version, macOS version, chip, and affected provider, which saves a couple of back-and-forth rounds before we can reproduce the issue.

Before filing:
- Make sure you're on the latest version (**Tokenly menu → Check for Updates…**). Tokenly auto-updates every 4 hours on its own, but if you've just installed, a quick manual check confirms you're current.
- Search [existing issues](https://github.com/tokenlyapp/tokenly/issues?q=is%3Aissue) — provider-edge-case bugs often have a thread going.
- Scrub any API keys or personal file paths from pasted logs.

## Requesting features

Use the [feature request template](https://github.com/tokenlyapp/tokenly/issues/new/choose). Describe the problem first, the proposed solution second — this keeps us focused on the underlying need rather than a specific implementation.

## Pull requests

Small, focused PRs are welcome:
- Bug fixes with a linked issue
- Typo / copy corrections
- Documentation clarifications
- New provider support *if* the provider exposes a documented usage API or a stable local log format (not an opaque SQLite blob we'd have to reverse-engineer per release)

Please **open an issue first** before writing code on anything that's larger than ~30 lines or touches:
- The main process (`main.js`)
- The IPC bridge (`preload.js`)
- Any provider fetcher
- The pricing math

Tokenly has a specific product direction and architectural style documented in `PROJECT.md` — unplanned larger changes usually need a conversation before code, to avoid wasted effort if the direction doesn't match.

## Out of scope

To set expectations honestly, these are **not** things Tokenly will accept PRs for:

- Windows or Linux ports — Tokenly is deliberately a Mac-native tool. Cross-platform would require a different architecture.
- Telemetry, analytics, or crash reporting of any kind — the "no telemetry" promise is a core product value.
- Scraping consumer web UIs (ChatGPT.com, Claude.ai) or parsing encrypted local conversation stores — brittle and privacy-invasive.
- Built-in AI chat or assistant features — Tokenly is a measurement tool, not a gateway.
- In-app credit top-ups or managing provider billing on behalf of users — we show what you've spent; we don't touch your account.

## Local development

```bash
git clone https://github.com/tokenlyapp/tokenly.git
cd tokenly
npm install
npm start
```

That launches Tokenly against your real `~/.claude/`, `~/.codex/`, and `~/.gemini/` directories. No API keys are needed to iterate on local-provider cards; for API-card work, paste an admin key in Settings once and it's encrypted via `safeStorage`.

To package a local DMG (unsigned):

```bash
npm run dist
# → dist/Tokenly-<version>-universal.dmg
```

Unsigned builds will trigger macOS Gatekeeper on first launch. Right-click → Open bypasses that.

## Security reports

**Do not open a public issue for security vulnerabilities.** Email `support@trytokenly.app` with `SECURITY:` in the subject. We aim to acknowledge within one business day and ship a fix within a week for anything affecting user data or keys.

## Code of conduct

Be decent. Tokenly is a small indie project; the contribution volume is low enough that a formal CoC would be overkill, but harassment, slurs, or drive-by negativity will get you blocked without warning. Constructive disagreement is welcome.

## Licensing

Contributions are accepted under the same license as the project itself (see [`LICENSE`](LICENSE)). By submitting a PR, you certify you wrote the code and have the right to contribute it.
