# Chartering Desk: P6 Documentation Architecture

## 1. Supported Languages
The documentation will be provided in the following languages to support the core user base:
- **English** (`en`) - Primary/Canonical
- **Russian** (`ru`) 
- **Ukrainian** (`uk`)

## 2. File Structure Plan
The documentation will be organized into language-specific directories:

```text
docs/
├── en/
│   ├── user-guide.md
│   ├── admin-guide.md
│   ├── billing-credits.md
│   ├── desk-network.md
│   ├── urgent-deals.md
│   ├── recap-guide.md
│   ├── troubleshooting.md
│   ├── security-privacy.md
│   ├── deployment.md
│   ├── faq.md
│   └── legal.md
├── ru/
│   └── ... (same structure)
└── uk/
    └── ... (same structure)
```

## 3. Documentation Outlines

### 3.1. User Guide (`user-guide.md`)
- **Account & Onboarding:** Login flows, public profiles, onboarding steps.
- **Inbox Connection:** Connecting Gmail via OAuth, required permissions.
- **Email Sync & Parsing:** How the background worker syncs emails, invokes the AI Email Parser.
- **Categorization:** How emails are classified (skipped, maybe, cargo, vessel, mixed).
- **Desk Network:** Overview of the shared market environment.
- **My Shared Cargo & Tonnage:** Managing published market requirements.
- **Mark Urgent & Hot Opps:** Triggering urgent status, viewing Hot Opportunities.
- **Deal Flow:** Interest -> Contact -> Dismiss -> Dual Approval.
- **Recap Draft:** Generating, reviewing, and confirming the OceanPact Recap Draft.
- **Export:** DOCX and PDF generation.
- **Broker-side Recap Confirmation:** The confirmation process and locking mechanisms.
- **Billing & Credits:** Understanding usage credits, billing tiers, and upgrading.
- **Testing Notes:** Note regarding admin testing mode limits (if applicable).

### 3.2. Admin / Founder Guide (`admin-guide.md`)
- **Admin Access:** Defining `ADMIN_UIDS` and `ADMIN_EMAILS`, admin bypass mechanisms.
- **Admin Panel:** Overview of the centralized administrative dashboard.
- **Test Users:** Granting test credits, managing the 2-active-user limit for testing, revoking credits.
- **Monitoring:** Viewing audit trails, credit usage monitoring, Stripe monitoring.
- **Testing Checklist:** Safe execution of tests in production variants.

### 3.3. Billing & Usage Credits (`billing-credits.md`)
- **Plans:** Trial, Solo, Desk, Enterprise tiers.
- **Credit Economics:** `creditsIncluded`, `creditsUsed`, `resetAt`.
- **Enforcement:** Behavior upon hitting the 402 (Payment Required) threshold.
- **Payment Lifecycle:** Stripe Checkout integration, Customer Billing Portal, Stripe Webhook lifecycle.
- **Admin Functions:** Test grants, admin bypass.
- **Safety Mechanisms:** Margin protection principle, failed AI calls not charged, idempotency to prevent double charging.

### 3.4. AI Email Parser & Gmail Sync (`email-sync-ai.md` - or merged into guides)
- (Covered within User Guide and Troubleshooting, but specific technical flows can live here for operators).

### 3.5. Desk Network & Urgent Deals (`desk-network.md` & `urgent-deals.md`)
- **Publishing:** Criteria for publishing cargo or tonnage to the network.
- **My Shared Items:** Managing the lifecycle of published items.
- **Urgent Deals (Hot Opps):** Manual urgent marking, expiry rules (7 days), the "Hot Opps" feed.
- **Engagement Flow:** Expressing interest, starting contact, dismissing deals.
- **Approval Flow:** Moving from `ready_for_approval` to `dual_approved`.
- **Recap Transition:** Moving a dual-approved deal into the Recap phase.
- **Legal/Product Boundary:** Explicit statement that "Broker-side confirmation is not a final charter party / final fixture."

### 3.6. OceanPact Recap Guide (`recap-guide.md`)
- **Template Overview:** The structure of the OceanPact fixture template.
- **Draft Creation:** Auto-filling fields from parsed AI data and deal metadata.
- **Editing & Saving:** Manual edits, versioning, and auto-save behaviors (draft state).
- **Broker-side Confirmation:** How cargo and vessel sides confirm the draft.
- **Locked State:** Behavior when both sides confirm (read-only enforcement).
- **Exporting:** DOCX and PDF generation details.
- **Disclaimers:** Principal approval disclaimer presence, confirmation that no documents are automatically sent to external parties.

### 3.7. Troubleshooting (`troubleshooting.md`)
- **Integration:** Gmail button unresponsiveness, OAuth redirect/callback loop or mismatch.
- **Sync/Parse:** Email sync stuck (queued/running/failed), no relevant emails found, non-chartering emails correctly routing to "skipped".
- **Network:** Urgent items not visible (expired or filtered).
- **Billing:** Out of credits / 402 errors, Stripe checkout failures, webhook syncing delays.
- **Admin:** Admin panel access denied.
- **Recap:** DOCX/PDF export generation errors.
- **Infrastructure:** Firestore "Permission Denied" errors, Cloud Run deployment issues, `NODE_ENV=production` edge cases, mobile layout overlap.

### 3.8. Security & Privacy (`security-privacy.md`)
- **Authentication:** Firebase Auth, relying strictly on server-verified UIDs (no client-trusted UIDs).
- **Token Security:** Secure storage and lifecycle of Gmail OAuth tokens.
- **Data Protection:** No raw email body data persisted in job docs, no raw AI prompts/responses stored in billing tables or general audit trails.
- **Database Rules:** Firestore owner/participant-only read/write rules, Desk Network isolated permissions, recap specific participant access control.
- **Server-Side Enforcement:** Admin routes and Stripe secrets restricted strictly to the Node/Express backend.
- **Audit:** General audit trail architecture.

### 3.9. Deployment & Environment Variabes (`deployment.md`)
- **Required ENV variables:**
  - `NODE_ENV=production`
  - Firebase Admin SDK config / service accounts
  - Google / Gmail OAuth config keys
  - Stripe Secret Keys, Webhook Secrets, Price IDs
  - Admin controls (`ADMIN_UIDS`, `ADMIN_EMAILS`)
  - AI Provider API keys (Gemini, etc.)
- **Infrastructure:** Deploying to Google Cloud Run.
- **Probes:** Using `/api/healthz` and `/api/readyz`.
- **Common Errors:** Typical deployment pitfalls and fixes.

---

## 4. Legal & IP Section Outline (`legal.md`)

*Note: This section contains placeholders only. Final legal wording requires review and confirmation from the founder and legal counsel.*

- **Company Name:** `[Exact Legal Company Name]`
- **Jurisdiction:** `[Applicable Legal Jurisdiction, e.g., UK / US / EU]`
- **Owner / Founder:** Roman Kovalevskyi
- **Platform Name:** Chartering Desk
- **Operating Brand:** `[OceanPact Chartering - If Applicable]`
- **Intellectual Property Ownership:** `[Statement reserving all rights to the platform logic and structure]`
- **Software Ownership:** `[Statement of copyright and proprietary software boundaries]`
- **Documentation Ownership:** `[Statement protecting user guides and manuals]`
- **Trademarks:** `[Chartering Desk™ / OceanPact™ placeholders]`
- **License Restrictions:** `[Prohibitions against reverse engineering, reselling, or scraping]`
- **Acceptable Use:** `[Rules against misuse, spamming, or fraudulent charters]`
- **Liability Limitation:** `[Standard B2B SaaS liability cap placeholder]`
- **Data/Privacy Disclaimer:** `[Statement regarding processing of shipping documents and email metadata]`
- **No Legal/Financial/Shipping Advice Disclaimer:** `[Platform is a software tool, not an acting principal]`
- **Broker-Side Recap Confirmation Disclaimer:** `[Confirmation confirms platform working draft alignment only]`
- **Final Charter Party Disclaimer:** `[Platform does not constitute legally binding entity signature for final fixture]`
- **Governing Law:** `[Governing Law Placeholder]`
