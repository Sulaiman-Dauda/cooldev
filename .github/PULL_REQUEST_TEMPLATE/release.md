## Release PR

### Release target

- Version: `vX.Y.Z`
- Release type:
  - [ ] patch
  - [ ] minor
  - [ ] major
  - [ ] stable release

### Release preparation

- [ ] `package.json` version is correct
- [ ] `package-lock.json` updated
- [ ] `CHANGELOG.md` updated for this version
- [ ] release notes generated or reviewed
- [ ] release bundle checked
- [ ] release docs reviewed

### Validation

- [ ] `npm run release:check`
- [ ] `bash scripts/ci-smoke.sh --with-build`
- [ ] fresh-server smoke test plan reviewed

### Release assets

- [ ] `docker-compose.release.yml`
- [ ] `.env.example`
- [ ] `docs/production-release.md`
- [ ] `docs/deployment-diagram.md`
- [ ] `docs/release-hardening.md`

### Supply-chain hardening

- [ ] image signing is enabled in the release workflow
- [ ] provenance attestation is enabled in the release workflow
- [ ] SBOM generation is enabled in the release workflow
- [ ] vulnerability scan is enabled in CI and release workflows

### Notes

- Expected release commit style: `chore(release): prepare vX.Y.Z`
