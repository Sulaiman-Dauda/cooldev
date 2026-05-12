# Security policy

## Supported versions

Use the newest supported release whenever possible.

| Version line | Supported |
| --- | --- |
| `main` | Yes |
| latest stable release | Yes |
| older unsupported releases | No |

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities, secrets, or exploit details.

Use GitHub Security Advisories or private vulnerability reporting for this repository.

Please include:

- affected CoolDev version or tag
- deployment path (`install.sh`, `docker-compose.release.yml`, local dev, or other)
- impact summary
- reproduction steps or proof of concept
- whether credentials, tokens, sessions, or user data may be exposed
- any suggested mitigation or workaround

## What to expect

Maintainers should aim to:

- acknowledge reports within 3 business days
- provide a first triage/update within 7 business days
- coordinate a fix, mitigation, or release path as quickly as possible

## Scope examples

This policy covers security issues in areas such as:

- owner auth, sessions, CSRF, and password reset
- server-side access to the workspace runtime
- domain cutover and HTTPS automation
- installer/runtime wiring
- container image publishing and release artifacts
- CI/release supply-chain automation

## Disclosure guidance

Please give maintainers reasonable time to validate and patch a vulnerability before public disclosure.

If a fix ships, maintainers should publish:

- the affected version range
- the fixed version
- any required operator action
- any relevant verification guidance

## Release verification

CoolDev release automation is designed to publish:

- vulnerability scan results
- cosign signatures
- provenance attestations
- SBOM artifacts
