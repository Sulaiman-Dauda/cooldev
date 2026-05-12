# Getting Started

CoolDev gives you one self-hosted workspace for shipping applications, databases, services, and Docker Compose stacks.

The goal is simple: install once, open the bootstrap URL, create the owner account, and deploy without building a control plane from scratch.

## Who CoolDev is for

CoolDev is a strong fit if you want:

- a self-hosted deployment product instead of a pile of infrastructure tooling
- one place to manage apps, databases, services, and Compose workloads
- a clean setup path that still leaves you in control of your server

## Product flow

1. Install CoolDev on a fresh server.
2. Open the printed bootstrap URL.
3. Create the first owner account.
4. Sign in and open **New Resource**.
5. Deploy an application, database, service, or Compose stack.
6. Add a custom domain when your DNS is ready.

## What you need before install

- a fresh Debian or Ubuntu server
- root or sudo access
- optional DNS access if you want a custom domain on day one
- optional Git provider access for repository-based application deploys

## Recommended install

```bash
curl -fsSL https://github.com/Sulaiman-Dauda/cooldev/releases/latest/download/install.sh | sudo bash
```

The installer prints a bootstrap URL such as:

```text
http://203.0.113.10:3001
```

That URL is the default entry point until you save a custom domain.

## What happens next

- create the first owner account
- review the workspace
- open **New Resource**
- deploy your first workload
- watch the deployment from the Deployments view

## Continue reading

- [Installation](installation.md)
- [First deploy](first-deploy.md)
- [Domains and HTTPS](domains-and-https.md)
