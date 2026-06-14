# BASELINE-LOCK-P0-P5

## Document accepted completed phases

### P0
* Security hardening
* Rate limit / token hardening

### P1
* Backend AI queue / retry / cache resilience
* Hybrid AI provider resilience

### P2
* Observability
* Diagnostics
* Audit
* Health / readiness
* Onboarding / publicProfiles / Desk Discovery stable state

### P3
* Background Email Sync Worker
* Job status / polling
* Scaling plan
* Usage quotas plan
* Inbox classification fix

### P4
* Usage Credits / Margin Protection
* Stripe Checkout
* Stripe Webhook
* Billing Portal
* Admin / Founder testing bypass
* Test user credit grants

### P5
* Urgent Deals / Hot Opportunities
* My Shared Cargo / My Shared Tonnage
* Manual Mark Urgent
* Hot Opps
* Interest / Contact / Dismiss
* Dual Approval
* OceanPact Recap Draft
* DOCX/PDF export
* Broker-side Recap Confirmation
* Locked confirmed recap
* Deployment production candidate verification

## Known legal/product boundary
* Broker-side recap confirmation does not equal final charter party.
* Final Owners / Charterers / principals confirmation may still be required.
* No legally binding e-signature implemented.
* No final fixture status created.
* No automatic external sending implemented.

## Known limitations
* Distributed queue / Redis not implemented.
* In-process worker limitations documented from P3.
* Full legal documentation not yet written.
* Full multilingual documentation not yet written.
* Enterprise billing/custom plan details still manual.
* External e-signature not implemented.
* Final charter party/principal confirmation not implemented.
* P6 documentation pending.

## Regression snapshot
* npm run build works
* npm start works
* Cloud Run deploy works
* healthz works
* readyz works
* Login works
* Firebase session persists
* Gmail OAuth starts
* Email sync works or safely fails
* InboxParser works
* Desk Network works
* Manual Edit works
* Billing/credits works
* Stripe checkout endpoint reachable
* Stripe webhook endpoint reachable
* Usage summary works
* Admin bypass works
* P5 urgent workflow works end-to-end
* DOCX/PDF export works
* Mobile UI safe
