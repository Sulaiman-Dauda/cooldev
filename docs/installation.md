# Installation

CoolDev is designed to install cleanly on a fresh Debian or Ubuntu server.

## Recommended installation

Use the latest public installer asset:

```bash
curl -fsSL https://github.com/Sulaiman-Dauda/cooldev/releases/latest/download/install.sh | sudo bash
```

To choose a specific bootstrap port:

```bash
curl -fsSL https://github.com/Sulaiman-Dauda/cooldev/releases/latest/download/install.sh | sudo bash -s -- --port 3001
```

## What the installer does

- prepares Docker when it is missing
- provisions the bundled runtime services CoolDev needs
- creates the server-side workspace connection automatically
- writes CoolDev runtime state under `/var/lib/cooldev`
- starts the CoolDev container
- prints the bootstrap URL for first access

## Pinning a specific release

For a fixed version, use the tagged installer asset:

```bash
curl -fsSL https://github.com/Sulaiman-Dauda/cooldev/releases/download/vX.Y.Z/install.sh | sudo bash
```

## Release bundle install

If you prefer to inspect the release before running it, download the release bundle from GitHub Releases and extract it on the target server.

The bundle includes:

- `install.sh`
- `.env.example`
- `docker-compose.release.yml`
- the production build output
- the product docs

## After installation

1. Open the printed bootstrap URL.
2. Create the first owner account.
3. Sign in and deploy your first resource.
4. Save a custom domain later in **Settings** when DNS is ready.

## Advanced deployment path

CoolDev also ships `docker-compose.release.yml` for advanced operator workflows. The installer remains the recommended public path because it wires the runtime, connection state, and bootstrap URL automatically.

## Next steps

- [First deploy](first-deploy.md)
- [Self-hosting and operations](self-hosting.md)
