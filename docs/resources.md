# Resources

CoolDev treats every workload as a resource so you can manage different deployment types from one product surface.

## Applications

Use applications for repository-based deploys.

Best for:

- websites
- APIs
- internal tools
- background workers packaged with an app repository

Typical inputs:

- repository URL
- branch
- base directory when the project is not at repository root
- environment variables if the app needs them
- optional custom domain

## Databases

Use managed databases when you want a faster path to storage without hand-building container wiring.

Best for:

- PostgreSQL
- MySQL or MariaDB
- Redis and similar managed runtime services, depending on the release surface

The resource inspector shows engine and connection details so you can verify the database quickly after creation.

## Services

Use services for operational components and common building blocks.

Best for:

- storage services
- monitoring tools
- queues and sidecars
- internal supporting workloads

## Docker Compose

Use Docker Compose when you need to bring an existing multi-service stack into CoolDev.

Best for:

- existing self-hosted stacks
- multi-service environments that already ship as Compose
- workloads that are easier to move as a complete unit

## Resource inspectors

Every resource should give you a fast read on:

- current status
- important connection or access details
- safe actions such as open, redeploy, or delete

## Next steps

- [First deploy](first-deploy.md)
- [Providers](providers.md)
- [Deployments](deployments.md)
