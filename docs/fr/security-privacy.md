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
- **Usage & General Audit Logs:** Exclude raw AI prompts/responses and raw payload data from visibility. Ensures safe operational monitoring.

## Authorization
- **Firestore Rules:** Strict rules isolate owner/participant visibility.
- **Desk Network Permissions:** Segment shared items from secure private deals.
- **Recap Privacy:** Restricted strictly to participant-only access loops. Viewer-only accesses blocked.
- **Admin / Stripe Layer:** Admin routes and Stripe secrets operate entirely server-side. Webhook signature verification validates all transactional requests.

## Known Limitations
- The system depends heavily on Google/Firebase Identity for granular verification limits.
