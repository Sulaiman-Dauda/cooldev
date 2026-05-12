# CoolDev commit conventions

CoolDev enforces conventional commit subjects in CI for pull requests.

## Required pattern

```text
type(scope): summary
type: summary
type(scope)!: summary
```

Allowed types:

- `feat`
- `fix`
- `docs`
- `refactor`
- `perf`
- `test`
- `build`
- `ci`
- `chore`
- `style`
- `revert`

## Examples

```text
feat(auth): add password reset flow
fix(settings): keep bootstrap URL visible during domain cutover
docs(release): add production release checklist
ci(release): publish release bundle artifacts
chore(release): prepare v0.1.0
refactor(api)!: simplify platform bootstrap response
```

## Local validation

Check a range manually:

```bash
bash scripts/check-conventional-commits.sh --range origin/main..HEAD
```

Check two refs explicitly:

```bash
bash scripts/check-conventional-commits.sh --from <base-sha> --to <head-sha>
```

## Notes

- Merge commits are allowed by default.
- Git-generated revert commits are allowed by default.
- CI validates pull-request commit subjects before the build and smoke jobs run.
