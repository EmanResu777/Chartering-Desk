# Chartering Desk

Production-oriented AI workstation for dry-bulk / project-cargo chartering.

The product is designed around the broker workflow:

**Inbound → structured cargo / tonnage → matching → commercial estimate → negotiation → recap → deal tracking**

AI is decision support. Commercial approval and outbound actions remain human-controlled.

## Core capabilities

- Gmail / IMAP intake and manual text intake
- AI parsing of single and multi-cargo / multi-vessel circulars
- Cargo and vessel registers with ownership boundaries
- Matching engine with technical, position, laycan and commercial scoring
- Voyage / TCE scenario calculator
- Deal Rooms, negotiation copilot, notes, documents and recap drafts
- Counterparty CRM and Desk Network workflows
- Market Intelligence page
- AIS / location integration hooks
- Usage credits, Stripe subscriptions and account-bound trial state
- Responsive mobile navigation and mobile-first register/detail views

## Market Intelligence

The market layer uses provider abstractions instead of hard-coded "live" values.

Production endpoints:

- `GET /api/market/snapshot`
- `GET /api/market/bunkers`
- `POST /api/ai/routeTask` with `parse_market_report`

Configure licensed adapters with:

- `MARKET_SNAPSHOT_URL`
- `MARKET_DATA_API_KEY`
- `BUNKER_SNAPSHOT_URL`
- `BUNKER_DATA_API_KEY`

Development-only reference mode contains the complete Doska reference set:

- 5 Baltic-style indices
- 16 dry-bulk route references across Capesize / Panamax / Supramax / Handysize
- 23 bunker ports

Reference values are always returned as **SIMULATED** and production refuses them unless `ALLOW_SIMULATED_MARKET_DATA=true` is explicitly set.

## AI routing

Primary server AI: Gemini.

Configured failover path:

1. Gemini
2. OpenAI, when configured
3. Anthropic, when configured
4. Optional OpenAI-compatible FreeLLM router for experimentation only

FreeLLM fallback is disabled by default and is not considered a production dependency.

Important environment variables:

- `GEMINI_API_KEY`
- `OPENAI_API_KEY` (optional failover)
- `ANTHROPIC_API_KEY` (optional failover)
- `GEMINI_MODEL_FAST`
- `GEMINI_MODEL_HEAVY`
- `OPENAI_MODEL_FAST`
- `OPENAI_MODEL_HEAVY`
- `ANTHROPIC_MODEL_FAST`
- `ANTHROPIC_MODEL_HEAVY`

The browser never receives server AI secrets.

## Local development

Requirements:

- Node.js 22+
- Firebase project / Firebase Auth configuration

Install and run:

```bash
npm ci
cp .env.example .env
npm run dev
```

At minimum, configure the Firebase client project and `GEMINI_API_KEY` for AI calls.

## Verification

Run the same core gates used by Production CI:

```bash
npm ci
npm run lint
node scripts/security-regression.cjs
node scripts/production-regression.cjs
node --test tests/security/*.test.cjs
npx tsx --test tests/unit/*.test.ts
npm run build
npm audit --omit=dev --audit-level=high
docker build -t chartering-desk .
```

The production build also checks that the server Gemini secret is absent from browser assets.

## Production deployment

The repository contains a multi-stage non-root `Dockerfile`. The Node server serves the built SPA and API from the same origin.

Container contract:

- `NODE_ENV=production`
- `PORT` is honored; default is 8080 in the container
- health endpoint: `/healthz`
- readiness endpoint: `/readyz`

A production deployment should not receive traffic until `/readyz` returns HTTP 200.

### Required production groups

The exact values belong in the deployment secret manager, not Git.

**Application / security**

- `APP_BASE_URL=https://<canonical-domain>`
- `TRUST_PROXY_HOPS=1` for the normal Cloud Run proxy topology
- `JSON_BODY_LIMIT=1mb`
- `ADMIN_UIDS` / `ADMIN_EMAILS` only when required

**Firebase**

Prefer workload identity / runtime service-account IAM. `FIREBASE_SERVICE_ACCOUNT` is a fallback only.

**AI**

- `GEMINI_API_KEY`

Optional failovers may be added independently.

**Billing**

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_SOLO`
- `STRIPE_PRICE_ID_DESK`

Set `BILLING_ENABLED=false` only for a deliberately non-billing deployment.

**Email sync**

- `EMAIL_CREDENTIALS_ENCRYPTION_KEY`
- `EMAIL_WEBHOOK_SECRET`
- `EMAIL_SYNC_MODE=cloud_tasks`
- `CLOUD_TASKS_PROJECT_ID`
- `CLOUD_TASKS_LOCATION`
- `CLOUD_TASKS_QUEUE`
- `EMAIL_SYNC_WORKER_URL`
- `CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT`

**Distributed rate limiting**

Multi-instance production defaults to requiring Redis:

- `REDIS_ENABLED=true`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `DISTRIBUTED_RATE_LIMIT_REQUIRED=true`

## Billing and trial policy

Trial eligibility is server-authoritative and tied to the Firebase Auth account creation time.

- Trial: 14 days / 200 AI credits
- Creating another workspace does **not** restart the trial
- Solo and Desk entitlements are derived from Stripe webhook state
- Client URL parameters cannot unlock a paid plan
- Credit charging occurs after a successful AI operation and is transaction-protected against double charging

## Commercial safety

The application deliberately fails closed in several places:

- Missing freight or cargo MT does not become a fabricated profitable TCE
- Matching rejects impossible cargo-vs-DWT capacity cases
- Distance / ETA without coordinate evidence is labelled indicative
- Market values are never presented as live when only reference data is available
- OAuth / IMAP secrets are server-side and encrypted before storage
- Core cargo / vessel records stay private unless explicitly shared through network objects

## Deployment note

The previous static Vercel-style deployment is not sufficient for the complete product because the application requires the Node API server, OAuth callbacks, billing webhooks and durable workers. Deploy the containerized full-stack service (for example on Cloud Run) behind one canonical HTTPS origin.
