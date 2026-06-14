# P4.1 Billing / Usage Credits Architecture Plan

## 1. Pricing Model Based on Cost

The pricing structure must cover AI token costs, hosting, Stripe fees (~3%), IMAP/email sync overhead, database storage, and operational support. The price is structured for healthy gross margins.

### Indicative Plan Structure

*   **Trial**
    *   **Limits:** 200 credits / 14 days
    *   **Estimated max AI cost:** ~$2
    *   **Price:** $0
    *   **Purpose:** User acquisition and platform testing.
*   **Solo**
    *   **Limits:** 3,000 credits / month
    *   **Estimated max AI cost:** ~$30
    *   **Price:** $99/month
    *   **Margin:** ~$69 gross margin before general infrastructure/support costs.
*   **Desk**
    *   **Limits:** 12,000 credits / month (up to 3 seats)
    *   **Estimated max AI cost:** ~$120
    *   **Price:** $299/month
    *   **Margin:** ~$179 gross margin before infrastructure costs.
*   **Enterprise**
    *   **Limits:** Custom credits & custom terms
    *   **Price:** Starting from $800/month
    *   **Purpose:** Negotiated limits for heavy brokerages with dedicated margin calculations.

## 2. Server-Side CREDIT_COST Table

Operations consume credits proportionally to their computational/token load. 

### Core AI Operations
*   `parse_email`: 1 credit
*   `ai_chat`: 1 credit
*   `generate_recap`: 3 credits
*   `freight_calc`: 3 credits
*   `analyze_risk`: 5 credits
*   `match_cargo_vessel`: 5 credits
*   `negotiation_strategy`: 5 credits

### Additional Suggested Chartering Operations
*   `email_sync_scan`: 1 credit per batch
*   `manual_text_intake`: 1 credit 
*   `draft_reply`: 2 credits
*   `desk_network_publish`: 0 credits (viral loop/engagement)
*   `vessel_search`: 1 credit
*   `cargo_match_review`: 3 credits

## 3. Firestore Usage Balance Model

Usage limits will be tracked via a deterministic ledger in Firestore.

**Document Path:** `users/{userId}/usage/{period}`

**Fields:**
*   `planId`: String (e.g., 'solo', 'desk_tier1')
*   `creditsIncluded`: Number
*   `creditsUsed`: Number
*   `resetAt`: Timestamp
*   `period`: String (e.g., '2024-11')
*   `updatedAt`: Timestamp
*   `createdAt`: Timestamp

**Optional Extensions:**
*   `seatsIncluded`: Number
*   `overageAllowed`: Boolean
*   `billingStatus`: String (active, past_due, canceled)
*   `stripeCustomerId`: String
*   `stripeSubscriptionId`: String
*   `currentPeriodStart`: Timestamp
*   `currentPeriodEnd`: Timestamp

## 4. Middleware Design: Check and Deduct

All protected API endpoints will use a cost-enforcement middleware:

1.  **Authentication:** Verify Firebase ID token. Derive UID STRICTLY from the verified token.
2.  **Cost Assessment:** Identify operation cost from the server-side `CREDIT_COST` map.
3.  **Balance Check:** Read the current user's usage balance.
4.  **Enforcement:** If `creditsUsed + cost > creditsIncluded`, return `402 Payment Required`.
5.  **Execution:** Execute the AI operation only if sufficient credits exist.
6.  **Atomic Deduction:** AFTER successful AI response, atomically increment `creditsUsed` using `FieldValue.increment(cost)`.
7.  **Failure Handling:** Do NOT charge credits for failed AI calls.
8.  **Idempotency:** Use idempotency keys on write/heavy operations to prevent double-charging on network retries.

## 5. Actual Cost Logging

Detailed telemetry for token usage and actual cost, strictly separated from sensitive data.

**Document Path:** `users/{userId}/events/{eventId}`

**Fields:**
*   `uid`: String
*   `operation`: String
*   `provider`: String (e.g., 'gemini')
*   `model`: String
*   `estimatedCredits`: Number
*   `inputTokens`: Number
*   `outputTokens`: Number
*   `totalTokens`: Number
*   `estimatedCostUsd`: Number
*   `createdAt`: Timestamp
*   `requestId`: String
*   `status`: String (success/failed)

**CRITICAL DATA EXCLUSIONS:**
The following MUST NEVER be stored in usage logs:
*   Raw email bodies.
*   Raw AI prompts/responses (unless explicitly opted-in / sanitized later).
*   Gmail OAuth tokens or refresh tokens.
*   Passwords or direct integration credentials.
*   The full private JSON payload of requests.

## 6. Stripe Integration Plan

Billing records act as the source of truth for the Firestore usage allocations.

*   **Webhook Verification:** Secure Stripe webhook endpoint.
*   **Provisioning:** `customer.subscription.created` and `updated` events set the `planId` and `creditsIncluded`.
*   **Timeframes:** Use Stripe's `current_period_start` and `current_period_end` to define the Firestore reset period.
*   **Monthly Reset:** A CRON or webhook trigger sets `creditsUsed` to `0` upon successful invoice payment for the new period.
*   **Cancellation:** Moves user to a Free/Trial-safe limit or enforced read-only mode at period end.
*   **Failed Payments:** Immediately restrict heavy/expensive AI operations until resolved.
*   **Idempotency:** Webhook processing must be idempotent.
*   **Data Locality:** `stripeCustomerId` and `stripeSubscriptionId` must be stored securely server-side.

## 7. UI Plan

Surfacing usage directly to the user to prevent surprise blocks.

*   **Header Widget:** "Credits Remaining" progress bar/indicator in the main navigation.
*   **Usage Dashboard:** A page detailing usage by day and by action type.
*   **Warning Banner:** Non-intrusive warning when usage hits 80%.
*   **Upgrade Prompt:** Hard stop modal with an upgrade CTA when 100% limit is reached.
*   **Plan Badge:** Display active tier (Trial / Solo / Desk / Enterprise) in settings.
*   **Top-Ups:** Future action flow to "Buy 1,000 extra credits" for mid-cycle bumps.
*   **Admin View:** Internal dashboard for our team to monitor heavy users.

## 8. Benefits

*   **Predictability:** Hard ceiling on AI provider costs.
*   **Protection:** Shields infrastructure from abuse, runaway loops, or token exhaustion attacks.
*   **Rate Limiting:** Acts as a natural economic rate limit.
*   **Revenue Growth:** Clear, friction-free upsell path for power users.
*   **Metrics:** Granular analytics to identify which features drive the most value/cost.
*   **Enterprise Scaling:** Foundations are laid for custom enterprise SSO/Volume billing.

## 9. Risks and Controls

*   **Concurrency/Race Conditions:** Users spamming multiple tabs for expensive AI calls. 
    *   *Control:* Atomic increment locks or distributed Redis counters (future).
*   **Double Charging:** Retried requests acting as new charges. 
    *   *Control:* Strict idempotency key usage.
*   **Model Cost Drift:** Provider costs change, but credits remain static. 
    *   *Control:* Server-side `CREDIT_COST` map allows live adjustments without breaking client code.
*   **Team Account Abuse:** One user burning a shared 'Desk' quota rapidly. 
    *   *Control:* Future "per-seat" limit configurations.
*   **Failed Call Resentment:** Charging for a gateway error.
    *   *Control:* Strict post-success deduction only.
*   **Privacy:** GDPR concerns regarding usage tracking.
    *   *Control:* Aggregated credit counting, zero PII or raw prompt logging.
