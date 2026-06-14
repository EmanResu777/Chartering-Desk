# User Guide

Welcome to Chartering Desk. This guide explains how to navigate and use the platform effectively.

## What is Chartering Desk?
Chartering Desk is a platform designed for dry bulk chartering professionals. It integrates with your email to automatically extract and structure cargo and vessel inquiries using AI, and allows you to collaborate with other brokers via the Desk Network.

## Account, Login & Onboarding
- Access the platform and log in using an authorized account.
- **Login Options:** Email/Password or Google Sign-In. Apple Sign-In is technically supported but pending external developer configuration before exposure.
- **Onboarding Process:** Follow the guided checklist to set up your profile, create/join an organization (desk), select a plan or trial, and finally enter the platform. 
- **Checklist Steps:** Complete Profile, Create/Join Organization, Add First Cargo, Add First Vessel, Connect Gmail (optional during initial flow), Review Credits, and Open Desk Network.
- *Note:* Registration is completely separated from Gmail integration. Gmail can be connected later at any time from your Inbox or Settings.

## Premium Features
The platform offers advanced premium modules tracking your data across the board:
- [Market Requests](market-requests.md): Active search broadcasts for Cargo and Tonnage.
- [Smart Radar & Watchlist](smart-radar-watchlist.md): Continuous AI monitoring of trading parameters against the active network and parsing engine.
- [AI Deal Brief](ai-deal-brief.md): Instant risk and commercial compatibility assessments.
- [Counterparty CRM](counterparty-crm.md): Manage historical interactions and relationship tracking.
- [Deal Room](deal-room.md): A centralized, collaborative environment specifically tracking the timeline of a negotiation.
- [Smart Alerts & Daily Digest](smart-alerts-daily-digest.md): In-app push notifications and daily deal summaries.

## Main Navigation
- **Inbox:** View AI-parsed emails and structured market data.
- **Desk Network:** Share and explore market requirements.
- **Urgent Deals:** Track hot opportunities.
- **Recaps:** Manage your working recap drafts.
- **Settings/Billing:** Manage your usage plan and credits.

## Inbox & Email Connection
1. Click "Connect Gmail" to authorize read-only access to your emails.
2. The Background Email Sync worker will automatically poll your inbox for new messages and queue them for AI parsing.

## AI Email Parser Classification
Emails are parsed and categorized into:
- **Cargo:** Pure cargo requirements.
- **Vessels/Tonnage:** Pure vessel open positions.
- **Mixed:** Both cargo and vessel data.
- **Maybe:** Potentially relevant chartering emails.
- **Skipped:** Irrelevant emails (e.g., newsletters, SaaS alerts).

## Desk Network
- **My Shared Cargo / Tonnage:** View the items you've published to the network.
- **Network Feed:** Browse items shared by other participants.
- Manage visibility and access at any time.

## Urgent Deals & Hot Opportunities
- **Mark Urgent:** Highlight critical cargo or vessel requirements (valid for up to 7 days).
- **Hot Opps:** When corresponding requirements exist on the network, they appear here.
- **Flow:** Express *Interest* -> *Contact* -> *Dismiss*.
- **Dual Approval:** Progress a deal through `ready_for_approval` iteratively until both Cargo side and Vessel side approve it. 

## OceanPact Recap Draft
- Once a deal is `dual_approved`, an OceanPact Recap Draft becomes available.
- Provides a structured template for the agreement.
- Editable and versioned.
- **DOCX / PDF Export:** Export the draft format for offline sharing.
- **Broker-side Confirmation:** Both sides can confirm the recap inside the platform. *This is not a final fixture or legally binding e-signature.*

## Credits & Billing
You require Usage Credits to process AI requests. 
- You can monitor your limits and upgrade your plan via the Billing tab.
- Admin/Founder accounts operate securely without 402 restrictions during testing.

## Mobile Usage
The platform provides a responsive mobile interface with accessible navigation and modal safety for working on-the-go.
