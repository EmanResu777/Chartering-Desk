# Gmail / Email Sync

Chartering Desk offers seamless Gmail integration via Google Workspace APIs.

## Connection Flow
Users securely authorize Chartering Desk to index recent incoming messages during onboarding using Google OAuth.

## The Sync Job Queue
Emails are managed in background processes.
- **Job Statuses:**
   - `queued`: Awaiting processing.
   - `running`: Currently polling and classifying.
   - `completed`: Successfully synced.
   - `partial`: Ran into transient failures but finished partially.
   - `failed`: Job crashed (e.g., token revoked).

## Sync Features
- **Polling:** The background worker polls the sync queue via safe intervals.
- **Sync Banner:** Visual top-bar indicating current job state and processed counts (Scanned / Relevant / Skipped).
- **Token Safety:** Gmail OAuth tokens are *never* stored or exposed to the client interface. Safe errors are handled securely.

## Common Issues
- **Gmail button does nothing:** Make sure OAuth redirect URIs are correct in Google Cloud Console.
- **OAuth redirect mismatch:** Typically happens if the URL does not match the valid Redirect URIs exactly.
- **Sync running too long:** The job might have encountered rate limits or failures; the system will attempt to reconcile.
- **Failed token refresh:** Go to settings and click "Disconnect" then "Connect Gmail" again.
- **No relevant emails found:** Ensure your inbox actively receives chartering circulation.
