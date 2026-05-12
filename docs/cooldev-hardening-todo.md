# CoolDev hardening + domain automation pass

Goal: complete the product-first flow in one pass.

## Done

- [x] Auto-apply reverse proxy cutover when a domain is saved.
- [x] Reuse the managed platform proxy on 80/443 instead of exposing infrastructure steps in the UI.
- [x] Add automatic HTTPS/certificate status messaging in Settings.
- [x] Poll domain access status until DNS + HTTPS are live.
- [x] Auto-redirect to the secure domain once cutover finishes.
- [x] Keep the bootstrap URL visible as a fallback path.
- [x] Add CSRF protection for unsafe same-origin API requests.
- [x] Add auth rate limiting for register, login, password reset request, and password reset confirm.
- [x] Add password reset request + confirm flows.
- [x] Support SMTP delivery for reset emails.
- [x] Fall back to server-log reset links when SMTP is not configured.
- [x] Rename primary internal platform URL identifiers from old engine-specific names to product language.
- [x] Remove the last legacy migration key readers for old platform URL/state aliases.
- [x] Remove public legacy installer flag aliases from the product-facing installer flow.
- [x] Update installer wiring so the app can write managed proxy config and reload Caddy when needed.
- [x] Persist bootstrap URL + domain automation state under `/var/lib/cooldev`.
- [x] Clean remaining product copy in login/settings/docs around setup and domain flow.
- [x] Add server-side route tests for CSRF, rate limiting, password reset, session auth, and domain cutover routes.
- [x] Tighten production release docs for runtime mounts, ports, DNS, HTTPS, and SMTP.
- [x] Run full tests, production build, and installer syntax validation.

## Validation

- `npm test`
- `npm run build`
- `bash -n install.sh`
