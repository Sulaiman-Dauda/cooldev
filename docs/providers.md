# Providers

CoolDev keeps provider setup focused on what you need to deploy.

## GitHub App

Use the GitHub App flow when you want a first-class GitHub integration with installation-based access.

This is the recommended path for teams that want repository installs, webhook setup, and a clean GitHub-native connection flow.

## SSH keys

Use SSH keys when you need private repository access outside the GitHub App flow.

Typical cases:

- private Git hosts
- dedicated deploy keys
- repository access that should stay isolated from personal credentials

## Webhooks

Webhook URLs let CoolDev react to new commits and queue deployments automatically.

Provider setup should give you:

- the current connection state
- the install or setup link when needed
- the webhook URL for each supported provider

## HTTPS requirement

Some provider flows require a live HTTPS workspace URL before setup can complete. If CoolDev asks you to finish domain setup first, save the workspace domain and wait for HTTPS to go live before returning to Providers.

## Continue reading

- [First deploy](first-deploy.md)
- [Deployments](deployments.md)