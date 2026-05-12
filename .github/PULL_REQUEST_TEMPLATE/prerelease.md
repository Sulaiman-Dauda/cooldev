## Prerelease PR

### Prerelease target

- Version: `vX.Y.Z-rc.N`
- Prerelease type:
  - [ ] release candidate
  - [ ] beta
  - [ ] alpha

### Prerelease preparation

- [ ] `package.json` version is correct
- [ ] `package-lock.json` updated
- [ ] `CHANGELOG.md` updated for this prerelease
- [ ] release notes generated or reviewed
- [ ] prerelease image tags reviewed

### Validation

- [ ] `npm run release:check`
- [ ] `bash scripts/ci-smoke.sh --with-build`
- [ ] bootstrap and domain transition behavior reviewed

### Supply-chain hardening

- [ ] image signing remains enabled
- [ ] provenance remains enabled
- [ ] SBOM generation remains enabled
- [ ] vulnerability scan passes for the prerelease image

### Notes

- Expected prerelease commit style: `chore(release): prepare vX.Y.Z-rc.N`
