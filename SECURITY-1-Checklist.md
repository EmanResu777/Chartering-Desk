# Chartering Desk Security Audit Checklist

## Authentication
- [x] Firebase ID token required on all sensitive endpoints.
- [x] client UID never trusted.
- [x] verified UID used server-side.
- [x] admin/founder role checks server-side.

## Authorization
- [x] owner/desk/participant access enforced server-side.
- [x] no same-desk leakage unless visibility allows.
- [x] different-desk user blocked.
- [x] unauthenticated blocked.
- [x] invalid direct access blocked.

## Firestore
- [x] no public reads.
- [x] no public writes.
- [x] strict collection rules.
- [x] no client-side-only access control.
- [x] no hidden vessel/private cargo/contact/notes leakage.

## Secrets
- [x] no VITE secret leakage.
- [x] no AIS provider key in frontend.
- [x] no Stripe secret in frontend.
- [x] no Firebase Admin key in frontend.
- [x] no AI provider keys exposed.
- [x] no secrets in logs/audit/admin diagnostics.

## AI security
- [x] no raw prompts exposed.
- [x] no raw provider responses exposed.
- [x] prompt injection resistance.
- [x] sanitized context only.
- [x] hidden/private data not sent to AI.
- [x] private notes only by explicit opt-in.
- [x] AI output advisory only.

## API security
- [x] rate limits.
- [x] safe 401/403/429 responses.
- [x] no arbitrary provider proxy.
- [x] no open AIS lookup.
- [x] no open audit write endpoint.
- [x] input validation.
- [x] payload size limits.
- [x] script/html injection sanitization.

## Billing
- [x] credits deducted only after successful generation.
- [x] failed AI not charged.
- [x] idempotency prevents double charge.
- [x] insufficient credits safe 402.
- [x] Stripe untouched unless required.

## Workflow boundaries
- [x] no final fixture automatically.
- [x] no charter party automatically.
- [x] no legal e-signature.
- [x] no automatic external sending.
- [x] Broker-side Recap Confirmation not bypassed.
