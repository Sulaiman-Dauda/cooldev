# CoolDev GitHub ruleset checklist

Use this checklist to configure GitHub rulesets so they match `docs/branch-strategy.md`.

## Ruleset 1: protect `main`

Target:

- branch name pattern: `main`

Recommended protections:

- [ ] Require a pull request before merging.
- [ ] Require at least 1 approval.
- [ ] Require CODEOWNER review.
- [ ] Dismiss stale approvals when new commits are pushed.
- [ ] Require conversation resolution before merging.
- [ ] Require status checks to pass before merging.
- [ ] Require branches to be up to date before merging.
- [ ] Block force pushes.
- [ ] Block branch deletion.
- [ ] Restrict direct pushes if you want an admin-only emergency path.

Recommended required checks:

- [ ] `Test`
- [ ] `Build, smoke, and scan`
- [ ] `Dependency review`
- [ ] `Secret scanning`

Recommended repository settings:

- [ ] Allow squash merges.
- [ ] Allow rebase merges.
- [ ] Disable merge commits unless you have a strong reason to keep them.
- [ ] Enable linear history if squash/rebase-only is your policy.

## Ruleset 2: protect `release/*`

Target:

- branch name pattern: `release/*`

Use the same protection settings as `main`.

Release-branch operating rules:

- [ ] No direct pushes.
- [ ] No unrelated feature work.
- [ ] Only release blockers, regressions, and release-doc updates.
- [ ] Use the release or prerelease PR template.
- [ ] Require the same status checks as `main`.

Required checks:

- [ ] `Test`
- [ ] `Build, smoke, and scan`
- [ ] `Dependency review`
- [ ] `Secret scanning`

## Ruleset 3: optional tag protection for releases

If you want tighter release governance, add a tag ruleset.

Target:

- tag name pattern: `v*`

Recommended protections:

- [ ] Restrict who can create release tags.
- [ ] Restrict deletion of release tags.
- [ ] Limit tag creation to maintainers and approved automation.

## Required repo files before enabling strict protection

- [ ] `.github/CODEOWNERS` points to real maintainers instead of placeholders.
- [ ] `CONTRIBUTING.md` reflects the active contributor flow.
- [ ] `docs/branch-strategy.md` matches the selected merge policy.
- [ ] PR templates are in `.github/PULL_REQUEST_TEMPLATE/`.
- [ ] Issue templates are in `.github/ISSUE_TEMPLATE/`.

## Suggested GitHub security settings

- [ ] Enable Dependabot alerts.
- [ ] Enable Dependabot security updates.
- [ ] Enable dependency graph.
- [ ] Enable private vulnerability reporting / security advisories.
- [ ] Enable GitHub secret scanning if your plan supports it.

## Quick verification after enabling rulesets

- [ ] A direct push to `main` is blocked.
- [ ] A PR to `main` requires review and passing checks.
- [ ] A PR to `release/*` requires the same checks.
- [ ] CODEOWNER review is enforced.
- [ ] The required check names match the workflow job names exactly.

## Source references

- `docs/branch-strategy.md`
- `docs/commit-conventions.md`
- `docs/release-versioning.md`
- `docs/release-checklist.md`
- `SECURITY.md`
