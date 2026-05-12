# CoolDev release checklist

## Version + tag

- [ ] Update `package.json` to the intended release version.
- [ ] Generate the release notes.
- [ ] Update `CHANGELOG.md`.
- [ ] Release/prerelease PR commit subjects follow the conventional-commit policy.
- [ ] Commit the version bump and changelog.
- [ ] Create the annotated release tag with `bash scripts/create-release-tag.sh --push`.

## CI

- [ ] GitHub Actions CI passes for test, build, shell checks, and smoke validation.
- [ ] Pull-request dependency review passes.
- [ ] Pull-request secret scanning passes.
- [ ] Tag-driven release workflow publishes the container image and release bundle.
- [ ] Tag-driven release workflow publishes generated release notes and changelog artifacts.
- [ ] Tag-driven release workflow scans the pushed image for vulnerabilities.
- [ ] Tag-driven release workflow signs the pushed image digest.
- [ ] Tag-driven release workflow publishes SBOM and provenance attestations.

## Shipping artifacts

- [ ] `docker-compose.release.yml`
- [ ] `.env.example`
- [ ] `install.sh`
- [ ] generated release notes artifact
- [ ] generated changelog artifact
- [ ] `docs/production-release.md`
- [ ] `docs/deployment-diagram.md`
- [ ] `docs/release-versioning.md`
- [ ] `docs/release-hardening.md`
- [ ] `CHANGELOG.md`

## Runtime assumptions

- [ ] managed platform already installed
- [ ] external Docker networks exist: `coolify`, `coolify-proxy`
- [ ] host ports `80`, `443`, and bootstrap port are reachable
- [ ] `/data/coolify/proxy` is mounted into CoolDev
- [ ] `/var/run/docker.sock` is mounted into CoolDev

## Final verification

- [ ] fresh server install works
- [ ] bootstrap URL works
- [ ] owner registration works
- [ ] login works
- [ ] password reset works
- [ ] domain cutover works
- [ ] HTTPS becomes ready
- [ ] secure domain becomes preferred URL
- [ ] bootstrap URL remains fallback
