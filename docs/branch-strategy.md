# CoolDev branch protection and release branch strategy

This is the recommended repository strategy for CoolDev.

## Branch model

### `main`

Use `main` as the default integration branch.

Allowed changes:

- reviewed product work
- reviewed infrastructure/runtime changes
- reviewed docs and release-process changes
- hotfix backports merged forward from release branches

Do not push directly to `main`.

### `release/*`

Use release branches only when stabilizing an upcoming release.

Examples:

- `release/0.1`
- `release/1.0`

Allowed changes:

- release blockers
- regression fixes
- docs corrections tied to the release
- final version/changelog/release-note updates

Do not use release branches for unrelated feature work.

### `hotfix/*`

Use hotfix branches for production-critical fixes that must land quickly.

Examples:

- `hotfix/login-rate-limit-fix`
- `hotfix/bootstrap-cookie-regression`

Hotfixes should merge into the active release branch if one exists, then merge back into `main`.

### Working branches

Recommended prefixes:

- `feat/*`
- `fix/*`
- `docs/*`
- `ci/*`
- `refactor/*`
- `perf/*`
- `test/*`
- `chore/*`

## Recommended branch protection

### Protect `main`

Enable all of these on `main`:

- require a pull request before merging
- require at least 1 approval
- require CODEOWNER review
- dismiss stale approvals when new commits are pushed
- require conversation resolution before merging
- require status checks to pass before merging
- require branches to be up to date before merging
- block force pushes
- block deletions
- restrict direct pushes to administrators only if needed

Recommended required checks:

- `Test`
- `Build, smoke, and scan`
- `Dependency review`
- `Secret scanning`

### Protect `release/*`

Apply the same protection policy to `release/*` branches.

Release branches should be stricter operationally:

- only release fixes and release docs
- no unreviewed feature merges
- no direct pushes
- require the same CI checks as `main`
- require dependency review and secret scanning before merge

## Merge strategy

Recommended merge policy:

- squash merge for normal feature/fix/docs PRs
- rebase merge if you need to preserve a clean linear history for selected changes
- avoid merge commits on normal PR flow unless there is a strong reason

For release PRs, keep commit history clear and small.

## Tagging strategy

- create release tags only from `main` or an approved `release/*` branch
- tag format must be `vX.Y.Z` or `vX.Y.Z-rc.N`
- stable releases may update `latest`
- prereleases should only publish prerelease tags

## Required release PR expectations

Release and prerelease PRs should:

- use the release PR templates in `.github/PULL_REQUEST_TEMPLATE/`
- follow conventional commit subjects
- include the matching `CHANGELOG.md` update
- pass the changelog gate in CI
- pass the full release check locally before tagging

## Governance shortcuts

- `docs/commit-conventions.md`
- `docs/release-versioning.md`
- `docs/release-checklist.md`
- `docs/release-hardening.md`
- `CONTRIBUTING.md`
