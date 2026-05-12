# Domains And HTTPS

CoolDev is designed to work in two stages:

1. bootstrap access on the server IP and port
2. custom-domain access once DNS is ready

## Bootstrap URL

Immediately after install, CoolDev is available on a bootstrap URL such as:

```text
http://203.0.113.10:3001
```

This lets you start using the product before DNS or certificates are configured.

## Adding a custom domain

When you are ready:

1. Open **Settings**.
2. Save the final workspace domain.
3. Point DNS to the server IP.
4. Wait for automatic HTTPS to finish.

## What CoolDev handles automatically

- switching traffic onto standard web ports
- requesting and provisioning HTTPS certificates
- showing cutover status inside the product
- keeping the bootstrap URL available as a fallback path

## When the secure URL becomes preferred

Once DNS resolves correctly and HTTPS is live, CoolDev can prefer the secure domain as the main access URL.

The bootstrap URL remains useful during:

- initial setup
- DNS propagation
- certificate provisioning
- emergency fallback access

## Common checks

If your domain is not live yet, verify:

- the DNS record points to the correct server IP
- the server can accept traffic on ports 80 and 443
- the domain saved in Settings matches the DNS record you created

## Continue reading

- [First deploy](first-deploy.md)
- [Self-hosting and operations](self-hosting.md)
