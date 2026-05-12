# CoolDev production release notes

Use this checklist before shipping a public CoolDev image or installer.

Reference files:

- `.env.example`
- `docker-compose.release.yml`
- `CHANGELOG.md`
- `scripts/fresh-server-smoke-test.sh`
- `scripts/build-release-bundle.sh`
- `scripts/generate-release-notes.sh`
- `scripts/update-changelog.sh`
- `docs/deployment-diagram.md`
- `docs/release-versioning.md`
- `docs/commit-conventions.md`
- `docs/release-checklist.md`
- `docs/release-hardening.md`

## Release notes and changelog

Generate release notes:

```bash
npm run release:notes -- --current-ref HEAD
```

Update the changelog:

```bash
npm run changelog:update -- --current-ref HEAD
```

## Release environment template

Use `.env.example` as the baseline runtime template for:

- the CoolDev server container
- SMTP/password-reset delivery
- installer defaults when you want to predefine them in automation

Only keep the values you actually need for your release.

## Required release changes

Before publishing a public release, make sure the installer and release bundle are stamped with:

- the GitHub repository slug, for example `acme/cooldev`
- the versioned GHCR image for that release, for example `ghcr.io/acme/cooldev:v1.2.3`
- the tagged installer asset URL for that release, for example `https://github.com/acme/cooldev/releases/download/v1.2.3/install.sh`

The GitHub release workflow resolves these values automatically.
If you build a public release bundle manually, pass them explicitly:

```bash
bash scripts/build-release-bundle.sh \
  --version 1.2.3 \
  --repository acme/cooldev \
  --image ghcr.io/acme/cooldev:v1.2.3 \
  --installer-url https://github.com/acme/cooldev/releases/download/v1.2.3/install.sh
```

## Shipping options

You can ship CoolDev with either:

- `install.sh` for the one-line bootstrap flow
- `docker-compose.release.yml` when the managed platform is already installed and you want a compose-based product deployment

## Runtime requirements

The production container expects these mounts:

- `/var/lib/cooldev:/var/lib/cooldev`
- `/var/run/docker.sock:/var/run/docker.sock`
- `/data/coolify/proxy:/var/lib/cooldev/platform-proxy`

The installer wires those mounts automatically. The compose file expects you to provide the same mounts yourself.

## Ports

- Bootstrap access: the port you pass to `install.sh --port`
- Automatic domain access: `80` and `443` on the host, served by the managed platform proxy

Make sure your firewall allows:

- the bootstrap port during first setup
- `80/tcp`
- `443/tcp`
- `443/udp` if your proxy/runtime needs it

## DNS and HTTPS

1. Install CoolDev.
2. Open the bootstrap URL.
3. Create the first owner account.
4. Save the final domain in **Settings**.
5. Point the domain DNS record to the server IP.
6. Wait for CoolDev to report automatic HTTPS as ready.

The bootstrap URL remains available as a fallback path while DNS and HTTPS finish.

## Password reset delivery

To send reset links by email, set:

- `COOLDEV_SMTP_HOST`
- `COOLDEV_SMTP_PORT`
- `COOLDEV_SMTP_SECURE`
- `COOLDEV_SMTP_USER`
- `COOLDEV_SMTP_PASS`
- `COOLDEV_SMTP_FROM`

If SMTP is not configured, CoolDev writes reset links to the server log.

## Compose-based release deployment

Start from the release template:

```bash
cp .env.example .env
```

Then deploy:

```bash
docker compose -f docker-compose.release.yml --env-file .env up -d
```

Expected external Docker networks:

- `coolify`
- `coolify-proxy`

## Fresh-server smoke test

After installing on a new server, run:

```bash
bash scripts/fresh-server-smoke-test.sh \
  --bootstrap-url http://203.0.113.10:3001
```

After the secure domain is live, run:

```bash
bash scripts/fresh-server-smoke-test.sh \
  --bootstrap-url http://203.0.113.10:3001 \
  --secure-url https://cooldev.example.com
```

The smoke test checks:

- CoolDev container is running
- required runtime mounts exist
- bootstrap `/api/healthz` is healthy
- bootstrap UI shell loads
- CSRF cookie is issued
- secure-domain health works when you pass `--secure-url`

## Release bundle

Build the shipping bundle locally with:

```bash
bash scripts/build-release-bundle.sh
```

This writes a tarball to `dist/release/` containing:

- `docker-compose.release.yml`
- `.env.example`
- `Dockerfile.release`
- `install.sh`
- `package.json` and `package-lock.json`
- `dist/` production assets
- release docs and diagrams
- the smoke test script

The published `install.sh` asset is stamped with the versioned GHCR image for its release, so public installs pull that image directly.

When you run `install.sh` from inside the extracted release bundle on a fresh server, the installer can still build a local CoolDev image from that bundled runtime context if you intentionally need an offline or same-bundle fallback.

## Recommended validation before release

Run all of these from the repo root:

```bash
npm run release:check
bash scripts/ci-smoke.sh --with-build
```

Then verify manually on a fresh server:

1. installer completes without asking for platform tokens
2. bootstrap URL opens immediately
3. owner registration works
4. login works
5. password reset works
6. domain save triggers automatic 80/443 + HTTPS cutover
7. secure domain becomes the preferred URL
8. bootstrap URL still works as fallback

## Production posture

The intended customer path is:

- one install command
- bootstrap URL
- owner registration
- sign in
- save domain
- connect server
- deploy

No customer should need to see engine names, internal platform URLs, or platform tokens.
