# Contributing to CoolDev

Thanks for contributing to CoolDev.

This guide covers the standard contributor flow for product work, runtime changes, docs, and releases.

## Before you start

Read these files first:

- `README.md`
- `docs/README.md`
- `docs/installation.md`
- `docs/self-hosting.md`
- `SECURITY.md`

## Local setup

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm test
npm run build
npm run smoke:ci
npm run release:check
```

## Commit messages

CoolDev uses conventional commits.

Examples:

```text
feat(auth): add password reset flow
fix(settings): keep bootstrap URL visible during domain cutover
docs(release): update release checklist
ci(labels): sync repo labels automatically
chore(release): prepare v0.1.0
```

Validate commit subjects locally:

```bash
npm run ci:commits -- --range origin/main..HEAD
```

## Pull requests

A good PR should:

- stay focused on one change set
- explain user-facing impact clearly
- include test coverage or validation notes
- pass CI

Release changes should also:

- update `CHANGELOG.md`
- review the public docs when behavior changes
- pass `npm run release:check`

Validate changelog gating locally when version changes:

```bash
npm run ci:changelog -- --from <base-sha> --to <head-sha>
```

## Labels and automation

PR labels are applied automatically from:

- changed files
- release-related files
- release/prerelease branch and title heuristics

Issue templates also attach labels automatically.

## Testing expectations

Before opening a PR, run the smallest relevant checks first, then the full set if needed.

Recommended baseline:

```bash
npm test
npm run build
```

For release/process changes, also run:

```bash
bash -n install.sh
bash scripts/ci-smoke.sh --with-build
npm run release:check
```

## Docs expectations

Update docs when you change:

- installation or upgrade flow
- first-run onboarding behavior
- resource workflows
- domain and HTTPS behavior
- provider setup or deployment workflows
- self-hosting or runtime assumptions

## Versioning and releases

Version helpers:

```bash
npm run version:patch
npm run version:minor
npm run version:major
npm run version:prerelease
npm run version:release
```

Release-note helpers:

```bash
npm run release:notes -- --current-ref HEAD
npm run changelog:update -- --current-ref HEAD
```

Tag flow:

```bash
npm run release:tag -- --push
```

## CODEOWNERS

CODEOWNERS are defined in `.github/CODEOWNERS`.

If you touch a protected area, expect review from the configured owners.
