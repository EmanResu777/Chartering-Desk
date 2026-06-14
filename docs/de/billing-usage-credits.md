# Billing & Usage Credits

Chartering Desk uses a credit-based billing system to enforce margin protection across AI models.

## Usage Credits System
- **Purpose:** Protect infrastructure from unlimited AI parsing costs (Margin Protection).
- **Economics:** 
  - `creditsIncluded`: The base allocation for your billing tier.
  - `creditsUsed`: Amount consumed by successful parsing jobs over the cycle.
  - `creditsRemaining`: Available balance.
  - `resetAt`: When the counter resets for active subscriptions.
- **402 CREDIT_LIMIT_EXCEEDED:** Once usage exceeds your limit, parsing halts safely.

## Billing Tiers
- **Trial / Solo / Desk / Enterprise**
- Plans provide varied credit limits and feature gates.

## Idempotency and Safety
- **Failed AI Calls:** Users are *not* charged if an AI parsing call fails or throws an error. Deductions happen only after a successful AI response saves data.
- **Idempotency:** Billing updates use atomic increments avoiding double charges.

## Stripe Integration
- **Checkout:** Upgrading redirects securely to Stripe Checkout.
- **Billing Portal:** Manage subscriptions via Stripe Customer Portal.
- **Stripe Webhook:** Asynchronously processes `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`, updating the user's `billingStatus` (active, past_due, cancelled) securely behind the scenes.

## Admin Exemptions
- Platform admins (defined by `ADMIN_EMAILS`/`ADMIN_UIDS`) bypass the credit tracking internally to avoid blocking production testing.
- Test grants can be provided to limited test accounts without requiring active Stripe subscriptions.

## Exhausted Credits
- What users see when credits run out: Parsing temporarily halts and users receive a `Payment Required` prompt directing them to the Billing portal to upgrade or await cycle reset.
