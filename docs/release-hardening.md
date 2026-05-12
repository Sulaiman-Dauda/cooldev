# CoolDev release hardening

This document covers image signing, SBOM generation, provenance, and verification.

## What the release workflow produces

For every tagged release, the workflow can produce:

- a pushed GHCR image
- a vulnerability scan report for the pushed image
- keyless cosign signatures for the pushed image digest
- build provenance attestation
- an SBOM artifact in SPDX JSON format
- an SBOM attestation attached to the image

## GitHub Actions permissions

The release workflow needs:

- `contents: write`
- `packages: write`
- `id-token: write`
- `attestations: write`

## Image signing

The workflow uses keyless signing with Sigstore Cosign.

This signs the pushed image digest, not just a tag.

Example verification:

```bash
IMAGE_NAME="ghcr.io/acme/cooldev"

cosign verify "${IMAGE_NAME}:v1.0.0" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp 'https://github.com/.+/.+/.github/workflows/release.yml@.+'
```

## Provenance

The release workflow enables Docker Buildx provenance and can publish a provenance attestation for the pushed image digest.

Example verification:

```bash
IMAGE_NAME="ghcr.io/acme/cooldev"

cosign verify-attestation "${IMAGE_NAME}:v1.0.0" \
  --type slsaprovenance \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp 'https://github.com/.+/.+/.github/workflows/release.yml@.+'
```

## SBOM

The release workflow generates an SPDX JSON SBOM for the pushed image and uploads it as a release artifact.

Example verification:

```bash
IMAGE_NAME="ghcr.io/acme/cooldev"

cosign verify-attestation "${IMAGE_NAME}:v1.0.0" \
  --type spdxjson \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp 'https://github.com/.+/.+/.github/workflows/release.yml@.+'
```

## Vulnerability scanning

CI builds the image locally and scans it with Trivy.
The release workflow scans the pushed image digest again and uploads the SARIF report.

The current workflow fails on:

- `HIGH`
- `CRITICAL`

while ignoring unfixed vulnerabilities to reduce false-positive release noise from upstream base images.

## Repository security automation

Pull requests also run:

- dependency review for newly introduced vulnerable runtime dependencies
- repository secret scanning with Gitleaks and SARIF upload

These checks are intended to be required in GitHub branch rulesets alongside the main CI jobs.

## Local hardening checks

Before tagging a release, run:

```bash
npm run release:check
bash scripts/ci-smoke.sh --with-build
```

## Suggested future hardening

- add policy checks for base-image updates
- add branch protection around the release workflow
- enable GitHub native secret-scanning alerts everywhere your plan supports them
- add signed-commit or verified-commit enforcement if your maintainer workflow supports it
