# Contributing to CoolDev

Thanks for contributing to CoolDev.

This guide covers the normal contributor flow for product work, runtime changes, docs, and releases.

## Before you start

Read these files first:

- `README.md`
- `docs/branch-strategy.md`
- `docs/github-ruleset-checklist.md`
- `docs/commit-conventions.md`
- `docs/release-versioning.md`
- `docs/release-checklist.md`
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

## Branch naming

Recommended branch prefixes:

- `feat/*`
- `fix/*`
- `docs/*`
- `ci/*`
- `refactor/*`
- `perf/*`
- `test/*`
- `chore/*`
- `release/*`
- `hotfix/*`

Use `release/*` only for release stabilization.

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

### Normal PRs

A good PR should:

- stay focused on one change set
- explain user-facing impact clearly
- include test coverage or validation notes
- pass CI

### Release PRs

Release and prerelease PRs should:

- use the matching PR template
- update `CHANGELOG.md`
- generate or review release notes
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

- release flow
- runtime assumptions
- branch/governance policy
- auth/security behavior
- domain/HTTPS behavior

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

## Reporting bugs

Use the issue templates in `.github/ISSUE_TEMPLATE/`.

For release regressions, use the release bug template so the report includes the version, deployment path, and regression details.

For vulnerabilities, do not open a public issue. Follow `SECURITY.md` instead.
