# CoolDev release tags and versioning

## Source of truth

`package.json` is the source of truth for the release version.

Examples:

- `0.1.0`
- `1.0.0`
- `1.2.0-rc.1`

## Tag format

Create annotated git tags in this format:

- `v0.1.0`
- `v1.0.0`
- `v1.2.0-rc.1`

The tag should always match `package.json`.

## Recommended release flow

Release and prerelease PR commits should follow the policy in `docs/commit-conventions.md`.


1. Bump the app version.
2. Generate the release notes and changelog section.
3. Commit the version change.
4. Run `npm run release:check`.
5. Run the release tag script.
6. Push the tag.
7. Let the release workflow build and publish the release image, changelog assets, signatures, attestations, and bundle.

## Bumping the version

Helper scripts:

```bash
npm run version:patch
npm run version:minor
npm run version:major
npm run version:prerelease
npm run version:release
```

Preview the next version without writing files:

```bash
npm run version:next -- patch
npm run version:next -- prerelease --preid rc
```

Use an explicit version:

```bash
npm run version:bump -- set --version 1.0.0
```

Then commit the resulting file changes.

## Generating release notes and changelog

Generate release notes for the current version:

```bash
npm run release:notes -- --current-ref HEAD
```

Update `CHANGELOG.md` for the current version:

```bash
npm run changelog:update -- --current-ref HEAD
```

## Creating the tag

```bash
bash scripts/create-release-tag.sh
```

Create and push in one step:

```bash
bash scripts/create-release-tag.sh --push
```

Dry run:

```bash
bash scripts/create-release-tag.sh --dry-run
```

## What the tag script verifies

Unless you pass `--skip-checks`, it runs:

- `npm test`
- `npm run build`
- `bash -n install.sh`
- `bash -n scripts/fresh-server-smoke-test.sh`
- syntax checks for versioning, changelog, and policy scripts
- changelog presence for the exact release version

It also refuses to tag:

- placeholder version `0.0.0`
- dirty working trees unless `--allow-dirty` is passed
- duplicate tags

## Release outputs

The tag-driven release process is expected to produce:

- a versioned container image
- a `latest` image for stable releases
- generated release notes
- a changelog artifact
- a release bundle tarball
- image signatures, SBOM output, and provenance attestation
- the shipping files:
  - `docker-compose.release.yml`
  - `.env.example`
  - `install.sh`
  - release docs and diagrams
