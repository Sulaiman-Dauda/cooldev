# Self-Hosting And Operations

CoolDev is designed to be self-hosted first.

## Recommended production path

Use the public `install.sh` asset from GitHub Releases for fresh-server installs.

That path is the most reliable because it:

- prepares the runtime automatically
- starts CoolDev with the expected mounts and wiring
- prints the bootstrap URL immediately

## Runtime expectations

Plan for:

- a dedicated Debian or Ubuntu host
- Docker available on the server
- network access for the bootstrap port during first setup
- ports 80 and 443 reachable when you want custom domains and HTTPS

## Release assets

Public releases should provide:

- the one-line installer
- the versioned release bundle
- the production compose file
- the runtime environment template

## Compose-based deployment

`docker-compose.release.yml` is available for advanced operator workflows.

Use it when you already know the runtime you want to plug CoolDev into and you do not need the full bootstrap flow handled for you.

## Validation after install

After a fresh install, verify:

- the CoolDev container is running
- the bootstrap `/api/healthz` endpoint is healthy
- the product shell loads from the bootstrap URL
- the runtime state files exist

The repository includes `scripts/fresh-server-smoke-test.sh` for this validation flow.

## Upgrades

The cleanest upgrade path is to move to a new tagged release, then validate the bootstrap URL and deployment surface again before routing new production traffic.

## Operational checklist

1. Keep the bootstrap URL available as a fallback path.
2. Validate DNS before expecting HTTPS to finish.
3. Review deployment history after major changes.
4. Re-run smoke validation after runtime upgrades.

## Continue reading

- [Installation](installation.md)
- [Domains and HTTPS](domains-and-https.md)
- [Deployments](deployments.md)