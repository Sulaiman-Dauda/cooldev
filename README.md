# CoolDev

CoolDev is an open-source self-hosted deployment workspace for applications, databases, services, and Docker Compose stacks.

It is built for teams that want a clean product experience on their own infrastructure: install on a fresh server, open the bootstrap URL, create the first owner account, and start shipping without assembling a control plane by hand.

## Why Teams Use CoolDev

- One installation path from a fresh server to a working deployment workspace.
- One product surface for apps, databases, services, domains, HTTPS, providers, and deployment history.
- One clear workflow from first bootstrap access to a production domain.
- Self-hosted by default, with public release assets and predictable upgrade paths.

## What CoolDev Covers

- Git-based application deploys from public or private repositories.
- Managed databases with a guided setup path.
- Reusable services for supporting workloads and operational building blocks.
- Docker Compose stacks when you need direct control.
- Deployment history, diagnostics, and raw logs in the same workspace.

## Quick Start

Install the latest public release:

```bash
curl -fsSL https://github.com/Sulaiman-Dauda/cooldev/releases/latest/download/install.sh | sudo bash
```

Choose a custom bootstrap port if needed:

```bash
curl -fsSL https://github.com/Sulaiman-Dauda/cooldev/releases/latest/download/install.sh | sudo bash -s -- --port 3001
```

After install:

1. Open the printed bootstrap URL.
2. Create the first owner account.
3. Open **New Resource**.
4. Deploy your first workload.
5. Add a custom domain when DNS is ready.

## Documentation

- [Docs home](docs/README.md)
- [Getting started](docs/getting-started.md)
- [Installation](docs/installation.md)
- [First deploy](docs/first-deploy.md)
- [Resources](docs/resources.md)
- [Domains and HTTPS](docs/domains-and-https.md)
- [Providers](docs/providers.md)
- [Deployments](docs/deployments.md)
- [Self-hosting and operations](docs/self-hosting.md)

## Public Releases

Every tagged release is expected to publish:

- `install.sh`
- `cooldev-release-bundle-<version>.tar.gz`
- `docker-compose.release.yml`
- `.env.example`
- release notes, changelog, and verification artifacts

The release bundle contains the production runtime, product docs, and operational files required to ship CoolDev cleanly.

## Contributing And Security

If you want to contribute, run locally, or work on release automation, start with [CONTRIBUTING.md](CONTRIBUTING.md).

For vulnerability reporting and supported-version policy, see [SECURITY.md](SECURITY.md).
