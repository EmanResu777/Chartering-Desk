# Smart Alerts & Daily Digest

The Smart Alerts module actively traces high-value events and securely routes in-app notifications directly to the correct stakeholders.

## In-App Architecture
- Notifications are strictly **in-app only**. 
- The platform does **not** send external emails automatically.
- Integrations with external push notifications (Telegram, WhatsApp) are currently disabled.

## Alerts Center
- Accessed via the notification bell on the primary navigation rail. An unread badge displays the pending alert count.
- **Controls:** Mark as read, dismiss.
- **Routing:** Alerts link directly to the related item (e.g. Deal Room, Market Request).
- **Filtering:** Filter alerts by Unread/Read status, Priority level, or specific Categories.

## Embedded Alert Attributes
**Priorities:**
- `critical`
- `high`
- `medium`
- `low`
- `info`

**Categories:**
- `smart_radar_match`, `hot_opp`, `market_request_match`
- `deal_room_update`, `deal_room_note`
- `process_offer`, `ai_deal_brief`, `counterparty_crm`
- `recap_draft`, `recap_confirmation`, `broker_confirmation_waiting`
- `urgent_opportunity`, `system`, `billing_credits` (placeholder)

## Tracked Triggers (Alert Sources)
The platform generates alerts dynamically for:
- **Smart Radar:** Excellent/Strong matches, user-saved matches.
- **Market Requests:** New matches found, interest received, contact requested, process offer initiated.
- **Hot Opportunities:** New hot opps detected, updates.
- **Deal Rooms:** Room creation, status changes, shared notes added, ready for recap, awaiting confirmations, archived.
- **AI Deal Brief:** Brief successfully generated, regenerated, or system failure responses.
- **Counterparty CRM:** Entity linked to deal, notes added, status changed, reliability adjustments.
- **Recaps:** Recap draft created, broker-side confirmation pending, recap locked/confirmed by both sides, DOCX/PDF exports.

## Daily Digest
A summarized aggregation of relevant items intended to start the user's day:
- Includes: Today's Digest, Urgent Alerts summary, Deal Rooms needing action.
- Features manual refresh mechanisms and tracks the `generatedAt` timestamp.
- **Privacy Assurance:** The digest strictly derives from data the specific user is explicitly authorized to access. Hidden vessel names or private notes are comprehensively scrubbed from digest summaries.

## Alert Preferences
Users manage their alert channels via the Settings pane:
- **Toggles:** In-app alerts, Daily Digest activation, Urgent-only mode, and granular Category exclusions.
- **Placeholders:** Digest delivery time formatting, Email delivery options, Telegram/WhatsApp configurations (currently disabled to enforce workflow boundary boundaries).
