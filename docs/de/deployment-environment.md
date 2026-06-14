# Deployment & Environment

Managing and deploying the infrastructure typically to Google Cloud Run.

## Architecture Guidelines
- Required to run via standard Node.js package start scripts (`npm start`).
- Cloud Run provisions and binds ports via injected `PORT` automatically. 

## Mandatory Environment Variables
Ensure all the below are set in your deployment secrets:
- `NODE_ENV=production`
- **Firebase:** Standard project config keys
- **Google OAuth / Gmail OAuth:** Client ID, Secret, Redirect URIs
- **Stripe:** Secret key, Webhook secret, Price IDs (`STRIPE_PRICE_ID_SOLO`, etc.)
- **Admin Configuration:** `ADMIN_UIDS`, `ADMIN_EMAILS`
- **AI Provisioning:** Provider API keys.

## Deployment Probes
- Ensure startup health probes use `/api/healthz` and readiness reads `/api/readyz`.

## Deployment Checklist
1. Validate env variable integrity.
2. Confirm package build completion.
3. Validate Docker container start sequence.

## Common Deployment Errors
- Blank env variables causing missing server components.
- Firewalls blocking traffic (CORS misconfiguration).
