# P5 Urgent Deals / Hot Opportunities Plan

## 1. Product Concept
The goal of this feature is to seamlessly connect urgent market positions within the Desk Network. When a broker publishes an urgent vessel position (e.g., prompt or open spot) and another broker publishes an urgent cargo laycan (closing soon) in a compatible area, the Desk Network should automatically detect this hot opportunity and proactively notify the relevant users to initiate a fast-tracked fixing dialogue.

### Examples:
* Vessel is open spot / prompt / has short validity.
* Cargo laycan is closing soon.
* Vessel and cargo are in the same general geographic region or route.
* Specs are potentially compatible (DWT matches cargo volume, etc.).
* An urgent "possible match" notification is routed ONLY to relevant Desk Network users to prevent spam.

## 2. Urgency Detection Model
### Vessel Urgency Signals:
* Open spot or "prompt" dates.
* Short validity of the position.
* Open date falls within a predefined threshold (e.g., X days from today).
* Vessel is sitting idle/open in a specific region.
* Direction or routing is highly compatible with urgent cargo paths.
* Owner/broker manually flags the position as "Urgent".

### Cargo Urgency Signals:
* Laycan window starts very soon.
* Laycan window is ending soon without a corresponding vessel.
* Cargo is explicitly "prompt".
* Short validity of the cargo requirement.
* Cargo owner is soliciting urgent freight inquiries.
* Broker manually flags the cargo as "Urgent".

## 3. Matching Criteria
Future background matching logic will assess:
* Region / Port proximity (Load area vs Vessel open area).
* Cargo quantity vs Vessel DWT/DWCC.
* Cargo type vs Vessel type (Bulk, Tanker, Container, etc.).
* Gear requirements vs Vessel gear configuration.
* Laycan window vs Vessel open dates.
* Direction/trade route preferences.
* Sanctions/restriction flags (to be implemented in future phases).
* Overall Confidence Score derived from the variables above.

## 4. Notification Rules
* **Target Audience:** Notifications are sent ONLY to relevant users.
  * Users in the same region.
  * Trusted/connected Desk Network contacts of the publishing broker.
  * Users holding explicit interests (saved searches/matching cargos or vessels).
  * Users who opted into receiving "Urgent Alerts" for specific trade routes.
* **Anti-Spam Controls:**
  * Cooldown timer per item.
  * Maximum number of urgent alerts pushed per day, per user.
  * Limits on how many manual "urgent" flags a broker can trigger.
  * Minimum confidence threshold required to trigger the alert.
  * Deduplication logic to prevent receiving the same context alert multiple times.

## 5. Workflow Statuses
Lifecycle of an urgent deal:
* `detected`: System identified the match.
* `urgent_alert_sent`: Users were notified.
* `interested`: One or both parties indicated interest.
* `negotiating`: Both parties are exchanging terms.
* `approved_by_vessel_side`: Vessel stakeholder accepted the base terms.
* `approved_by_cargo_side`: Cargo stakeholder accepted the base terms.
* `dual_approved`: Both sides approved (Proceed to recap).
* `recap_draft_opened`: Recap document generated to formalize terms.
* `recap_confirmed_by_one_side`: Initial draft signed/confirmed.
* `recap_confirmed_by_both_sides`: Second party signs the draft.
* `fixture_pending_principals`: Technical internal fix; pending real-world principal endorsement.
* `cancelled`: Deal died.
* `expired`: Time window lapsed before action taken.

## 6. Two-Party Approval
* The vessel-side publisher (or authorized owner) can approve terms.
* The cargo-side publisher (or authorized owner) can approve terms.
* BOTH approvals are strictly required before the Recap window is accessible.
* Either party can revoke approval before the final dual confirmation.
* Full audit trail records action types, timestamps, and the exact user ID.
* Viewers/passive network participants CANNOT approve.
* System enforces that only the authorized owner/publisher/participant acts.

## 7. Recap Window
Upon dual approval, the system generates a recap form encapsulating:
* Cargo details.
* Vessel details.
* Load and discharge ports.
* Laycan.
* Agreed Freight/Rate.
* Commission / Addcom.
* Terms.
* Subjects (Subs).
* Broker parties involved.
* Notes and Timestamp.
* Version tracking/history.

## 8. Dual Confirmation / Signature
* Each side verifies and formally confirms the generated recap.
* The recap becomes read-only (locked) after both confirmations are captured.
* An audit trail records the "digital signature" detailing exactly who confirmed and when.
* **Legal Disclaimer Check:** All UI elements and notifications must emphasize that the internal Desk Network confirmation is NOT a final binding charter party unless explicitly confirmed by the principals outside the system. Final shipowner or cargo owner approval may still be required.

## 9. Firestore Data Model Plan
Future collections to support this architecture:

### `deskNetworkUrgentDeals/{dealId}`
Tracks the high-level deal metadata.
Fields:
* `dealId` (String)
* `vesselItemId` (String)
* `cargoItemId` (String)
* `vesselOwnerUid` (String)
* `cargoOwnerUid` (String)
* `status` (String, enum mapped to workflow statuses)
* `urgencyScore` (Number)
* `matchScore` (Number)
* `region` (String)
* `createdAt` (Timestamp)
* `updatedAt` (Timestamp)
* `expiresAt` (Timestamp)
* `approvals` (Map of vesselSide and cargoSide objects tracking boolean states, userIds, timestamps)
* `recapId` (String, reference to recap subcollection)
* `auditTrail` (Array of objects recording state transitions)

### `urgentNotifications/{notificationId}`
Or scoped as `users/{uid}/urgentNotifications/{notificationId}` depending on query optimization.

### `recaps/{recapId}`
Or nested as `deskNetworkUrgentDeals/{dealId}/recaps/{recapId}`.

## 10. Permissions
* Only record owners (or designated publishers) can act (e.g., approve their side of the deal).
* Recipients can flag interest, but CANNOT overwrite the original source item (vessel or cargo specs).
* Viewers are denied approval permissions completely.
* Cross-user horizontal access is strictly rejected at the Firestore Rules layer.
* The Audit Trail is strictly append-only.
* Recaps are fully locked after dual confirmation.
* Unauthorized edits of a confirmed recap are rejected by the rules layer.

## 11. UI Plan
* **Urgent Badges**: Distinct highlighting for urgent positions on Cargo/Vessel map cards.
* **Hot Opportunities Panel**: A dedicated sidebar or dashboard widget listing active high-confidence matches.
* **Toasts**: Non-intrusive urgent toast notifications alerting users of a high-value match.
* **Interest & Approval Actions**: "I'm interested" and "Approve/Agreed" action buttons dynamically rendered based on authorization state.
* **Dual Approval Indicator**: Visual state indicating one vs dual approvals.
* **Recap Modal**: Clean modal window capturing freight, lays, terms, with prominent "Confirm" actions.
* **Audit Timeline**: A graphical or list timeline showing the exact time of actions by participants.

## 12. Risks
* **Notification Spam**: False positive matches or aggressive urgency flags leading to notification fatigue.
* **Weak Matches**: High volume of low-confidence pairing frustrating power users.
* **Data Abuse**: Brokers artificially flagging their items as urgent to game the visibility metrics.
* **Legal Binding Misunderstanding**: Users assuming the digital dual approval implies a fully executed, legal charter party.
* **Data Freshness**: Proceeding with stale vessel/cargo positions that are no longer strictly available.
* **Ghosting/Cancellation**: Users cancelling deals post-approval without clear systemic warnings.
* **Record Conflicts**: Conflicting manual edits occurring in parallel to the recap window being opened.
