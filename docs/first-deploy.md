# First Deploy

Once CoolDev is installed, the first deployment flow is intentionally short.

## 1. Create the owner account

Open the bootstrap URL printed by the installer and create the first owner account.

This account becomes the initial owner for the workspace.

## 2. Open New Resource

Use **New Resource** as the primary entry point for shipping new workloads.

You can deploy:

- an application from Git
- a managed database
- a service from a template
- a Docker Compose stack

## 3. Choose the fastest path

For most first-time installs, start with:

- a public Git application if you already have a repository
- a service template if you want something operational immediately
- a managed database if your application needs storage first

## 4. Review the deployment

After creation, open **Deployments** to watch:

- queued work
- active deployment status
- diagnostics and next-step guidance
- raw logs when you need details

## 5. Add a domain when you are ready

You do not need DNS to start using CoolDev.

The bootstrap URL remains available while you:

- choose a production domain
- point DNS to the server
- wait for automatic HTTPS to finish

## Recommended first run

1. Deploy one application.
2. Confirm it is healthy.
3. Add a custom domain.
4. Review the deployment history.
5. Add a database or supporting service if needed.

## Continue reading

- [Resources](resources.md)
- [Domains and HTTPS](domains-and-https.md)
- [Deployments](deployments.md)
