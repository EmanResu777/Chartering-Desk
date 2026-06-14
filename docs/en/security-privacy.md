# Security & Privacy

Privacy guidelines and backend enforcement policies.

## Authentication
- Handled securely via Firebase Auth.
- We rely on the server-verified `request.auth.uid` natively.
- **Client-supplied UIDs are NEVER trusted.**

## Token Security
- Gmail token handling operates entirely on the backend layer.
- Access strings are ephemeral and inaccessible to the client application.

## Data Masking & Logs
- **Email Sync Safety:** No raw email bodies persist in job document storage.
- **AI Keys & Prompts:** The platform uses built-in AI models integrated server-side. Brokers do not input their own AI keys. AI providers, settings, keys, and raw prompts/responses are restricted entirely to Admin/Founder accounts and invisible to end-users over the network.
- **Usage & General Audit Logs:** Exclude raw AI prompts/responses and raw payload data from visibility. Ensures safe operational monitoring.

## Authorization & Scope Visibility
- **Firestore Rules:** Strict rules isolate owner/participant visibility. No broad public reads exist.
- **Desk-scoped Permissions:** Access to internal deals and shared profiles relies on verifying the user's `deskId`.
- **Counterparty CRM Privacy:** CRM notes can be strictly scoped to the author or shared with their internal desk. Public ratings or reputation scoring are prohibited.
- **Deal Room Privacy:** Notes added in the Deal Room are restricted based on author and desk logic.
- **Smart Alerts & Daily Digest:** Users can read and update only their own alerts, alert preferences, and daily digests. Alert payloads are sanitized automatically to prevent sharing of private internal notes or hidden vessel names before distribution.
- **Desk Network Permissions:** Segment shared items from secure private deals.
- **Recap Privacy:** Restricted strictly to participant-only access loops. Viewer-only accesses blocked.
- **Admin / Stripe Layer:** Admin routes and Stripe secrets operate entirely server-side. Webhook signature verification validates all transactional requests.

## Known Limitations
- The system depends heavily on Google/Firebase Identity for granular verification limits.
