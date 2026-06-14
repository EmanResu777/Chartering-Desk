# Diagnostics & Troubleshooting

Typical deployment, operational, and user-facing resolutions.

## Infrastructure Health
- Use `/api/healthz` and `/api/readyz` endpoints to check backend service health and readiness state.
- Audit visibility available to Admins.
- **Cloud Run Deployment Issues:** Often related to container build errors or missing configuration.
- **NODE_ENV=production:** Ensure set for optimized performance.

## Common Interface Issues
- **Gmail button does nothing:** Indicates OAuth missing or improperly configured domains in Google Auth Console. Fix redirect URIs or OAuth callback issues.
- **Email Sync Stuck:** Job hangs in `running` status; check polling functionality.
- **Parser skips too many emails:** Validate spam filters; AI strictly ignores non-chartering inquiries based on strict relevance tuning.
- **Urgent item not visible:** May have expired or been dismissed.
- **Bottom sheet mobile overlap:** Managed safely via padding, verify browser limits and zoom.
- **Mobile layout issues:** Layout is designed responsively, refresh if viewport glitches.
- **Blank Screen:** Can sometimes be a severe frontend crash or network loading failure.

## Account / Access Issues
- **No credits / 402:** Out of credits. Upgrade via Billing.
- **Admin panel not visible:** Ensure user UID matches backend `ADMIN_UIDS`.
- **Firestore Permission Denied:** Caused by trying to view recaps/items belonging to others. Security rules enforce privacy.
- **DOCX / PDF Export issue:** Check browser popup blockers.

## Stripe Integration Issues
- **Stripe checkout issue:** Check Stripe Secret environment variable.
- **Webhook not updating plan:** Verify the `STRIPE_WEBHOOK_SECRET` matches the Stripe Dashboard configuration accurately.
