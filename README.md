# CoolDev

CoolDev is the product.

Install it on a server, open the bootstrap URL, create the first owner account, and deploy. The managed platform stays behind CoolDev instead of leaking tokens or infrastructure setup into the normal user journey.

## Product flow

1. Run the one-line installer on a fresh server.
2. Open the printed `server-ip:port` bootstrap URL.
3. Create the first owner account with email and password.
4. Sign in and deploy immediately on the server you just installed.
5. Set your domain later in **Settings** when DNS is ready.
6. Let CoolDev switch traffic to automatic 80/443 and HTTPS for that domain.
7. Deploy apps, databases, services, and Compose stacks from CoolDev.

## Install

Public installs should use the stamped `install.sh` asset published with the latest GitHub release for this repository.

1. Open the latest release page for this repository.
2. Download `install.sh` or the full release bundle.
3. Run the installer as root on a fresh Debian or Ubuntu server.

```bash
sudo bash install.sh
```

Optional public flags:

```bash
sudo bash install.sh --port 3001
```

What the installer does:

- installs the managed platform
- bootstraps the managed platform root tenant behind the scenes
- creates the server-side platform connection automatically
- reuses the managed platform's built-in localhost server so the first deployment target is already connected
- stores that connection under `/var/lib/cooldev`
- starts CoolDev on the bootstrap port you choose
- prints the bootstrap URL you should open immediately

After install, open the printed bootstrap URL, create the owner account, and finish the rest of setup inside CoolDev.

## Bootstrap URL and domain

CoolDev is designed to work immediately on a server IP and port after installation.

Example:

```text
http://203.0.113.10:3001
```

That bootstrap URL is the default entry point until you save a domain in **Settings**. Once your DNS points to the server, CoolDev automatically applies the 80/443 cutover, turns on HTTPS, and keeps the bootstrap URL as a fallback.

## Local development

```bash
npm install
npm run dev
```

`npm run dev` starts both processes:

- Vite for the frontend
- the CoolDev server on port `3001`

The Vite dev server proxies same-origin `/api/*` calls to the CoolDev server automatically.

Useful scripts:

- `npm run build`
- `npm run test`
- `npm run lint`
- `npm run start`

## Workspace layout

- `server` contains the small Node service for auth, sessions, CSRF, rate limiting, password reset, domain automation, and API proxying.
- `src/views` contains the main product screens.
- `src/lib/api.ts` wraps same-origin CoolDev routes and the proxied platform API.
- `install.sh` is the bootstrap entrypoint for production installs.
- `Dockerfile` builds the production image that serves the CoolDev server and static frontend together.

## Production release

See these files before shipping:

- `docs/production-release.md` for runtime requirements, firewall ports, DNS steps, SMTP setup, compose usage, and fresh-server validation
- `docs/release-versioning.md` for the version/tag flow and semantic version helpers
- `docs/commit-conventions.md` for the enforced conventional-commit policy
- `docs/branch-strategy.md` for branch protection and release branch strategy
- `docs/github-ruleset-checklist.md` for the matching GitHub ruleset checklist
- `docs/release-checklist.md` for the final release checklist
- `docs/release-hardening.md` for image signing, SBOM, provenance, and verification
- `docs/deployment-diagram.md` for the final deployment architecture and bootstrap-to-domain flow
- `CONTRIBUTING.md` for contributor workflow, PR expectations, and validation commands
- `SECURITY.md` for vulnerability reporting and supported-version policy
- `docker-compose.release.yml` for container-based shipping on top of the managed platform runtime
- `.env.example` for the release-ready runtime template
- `CHANGELOG.md` for release history

Useful release commands:

- `npm run release:check`
- `npm run release:bundle`
- `npm run release:tag`
- `npm run release:notes -- --current-ref HEAD`
- `npm run changelog:update -- --current-ref HEAD`
- `npm run version:patch`
- `npm run version:minor`
- `npm run version:major`
- `npm run version:prerelease`
- `npm run ci:commits -- --range origin/main..HEAD`
- `npm run ci:changelog -- --from <base-sha> --to <head-sha>`
- `npm run smoke:server -- --bootstrap-url http://203.0.113.10:3001`

## Notes

- The release workflow stamps the published installer asset and release bundle with the matching GitHub repository and versioned GHCR image for that release.
- If you run the source templates directly instead of the published release assets, set `COOLDEV_IMAGE` yourself before shipping.
- During bootstrap, CoolDev first tries the custom `cooldev:seed-token` artisan command when it is available on the managed platform. If that command is absent, the installer falls back to creating the bootstrap token directly through the platform's Laravel models.
- Password reset emails can be sent by setting `COOLDEV_SMTP_HOST`, `COOLDEV_SMTP_PORT`, `COOLDEV_SMTP_SECURE`, `COOLDEV_SMTP_USER`, `COOLDEV_SMTP_PASS`, and `COOLDEV_SMTP_FROM`. Without SMTP, CoolDev writes reset links to the server log for the owner.
