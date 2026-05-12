# Deployments

The Deployments view is where you track work after you click deploy.

## What you should expect

Deployments should make it easy to answer:

- what is deploying right now
- what finished recently
- what failed
- what to do next

## Deployment history

Use deployment history to review:

- recent release attempts
- success and failure patterns
- the resource linked to each deployment
- whether a retry or redeploy is appropriate

## Diagnostics

CoolDev surfaces human-readable guidance for common failures where possible.

That includes issues such as:

- health checks that never become ready
- missing environment variables
- domain or DNS mistakes
- memory pressure and exit-code failures

## Raw logs

When the summarized guidance is not enough, open the raw logs from the same deployment surface.

The recommended workflow is:

1. review the status and guidance first
2. open the raw logs if the issue is still unclear
3. make one focused change
4. redeploy and confirm the new result

## Related workflows

- [Resources](resources.md)
- [Domains and HTTPS](domains-and-https.md)