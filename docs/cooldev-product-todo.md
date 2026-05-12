# CoolDev product completion checklist

Goal: ship CoolDev as the product and keep the deployment engine fully invisible in the default user journey.

## Product rules

- [x] Default install is bundled and automated.
- [x] The normal user flow never asks for backend URLs or access tokens.
- [x] The hidden engine name does not appear in normal user-facing UI, docs, or installer output.
- [x] Bootstrap access works immediately on `server-ip:port` after install.
- [x] Domain setup happens later inside CoolDev settings.
- [x] Server-side sessions and server-side engine credentials remain the only supported default architecture.
- [x] Advanced external-backend compatibility stays hidden and undocumented.

## One-pass implementation

### Installer and packaging
- [x] Make the installer describe only the bundled CoolDev product flow.
- [x] Keep legacy/external backend flags as hidden compatibility paths, not public product features.
- [x] Fail the install if automatic platform bootstrap cannot complete, instead of pushing token entry into the UI.
- [x] Print the bootstrap URL clearly after install.
- [x] Keep persistent server-side state under `/var/lib/cooldev`.

### Auth and bootstrap UX
- [x] Keep first-owner registration as the first screen.
- [x] Keep normal email/password sign-in as the only sign-in flow.
- [x] Replace the manual backend-setup form with an automatic “finishing setup” screen and retry path.
- [x] Auto-refresh bootstrap state while the bundled engine finishes coming online.

### Settings UX
- [x] Remove token reconnect forms and direct backend console links from the main settings UI.
- [x] Replace “Public URL” wording with domain-first product language.
- [x] Show the current bootstrap access URL and explain that it works until a domain is configured.
- [x] Keep health/version/team/security diagnostics framed as CoolDev system status.

### Product copy cleanup
- [x] Remove remaining user-facing mentions of operator mode, control plane, and backend settings.
- [x] Replace provider copy that points people to backend settings with CoolDev settings language.
- [x] Replace “from the backend” error copy in product surfaces with product-first wording.
- [x] Fix onboarding copy so it talks about workspace/server setup, not backend reuse.

### Validation
- [x] Run focused tests for auth, app shell, settings, onboarding, providers, and API.
- [x] Run the full test suite.
- [x] Run a production build.
- [x] Run `bash -n install.sh`.
