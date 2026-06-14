# Admin & Founder Guide

This guide details the operational and testing capabilities provided to administrators and founders.

## Admin / Founder Mode
Admin mode is automatically enabled for users whose UID or Email matches `ADMIN_UIDS` or `ADMIN_EMAILS` defined in the server-side environment variables.
- Verified on the server securely.
- Admins bypass `402 Payment Required` restrictions (Unlimited Usage).

## Admin Panel
Accessible only to verified admins containing:
- Usage Monitoring
- Stripe Monitoring
- Testing Tools
- Audit Logs
- **AI Diagnostics:** Shows provider status and health.

## Admin-only AI Configuration
- The platform uses built-in AI models integrated server-side.
- Brokers and normal users **do not** input their own API keys.
- AI provider settings, keys, and raw prompts/responses are visible/adjustable only by Admin/Founder accounts.
- BYOK (Bring Your Own Key) controls are actively restricted from normal users.
- AI keys never appear in the frontend bundle, VITE environment variables, network responses, Firestore user-readable docs, the console, audit trails, or logs.

## Granting Test Credits
Admins can grant temporary usage credits to users to test AI functionality.
- **Cap:** Maximum of 2 active test users allowed simultaneously.
- **Expiry:** Grants expire automatically (e.g., in 72 hours).
- **Revocation:** Admins can manually revoke test grants from the panel.

## System Audit & Safe Testing Checklist
- All admin actions (granting/revoking credits) are logged in the `adminAudit` Firestore collection.
- Monitor `billing_audit` collection to identify unexpected 402 behaviors.
- Monitor `Usage summary` metrics for anomaly detection.

## What NOT to Do
- **Do not** disable billing logic globally. Limit tests to specific test users.
- **Do not** expose the `ADMIN_EMAILS` or `ADMIN_UIDS` lists to the client side.
- **Do not** create shared admin accounts/passwords; mandate secure individual logins.
