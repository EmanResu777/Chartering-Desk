# Urgent Deals & Hot Opportunities

Navigate pressing market requirements with targeted focus.

## Urgent Marking
- Users can manually mark specific Cargo or Tonnage as **Urgent**.
- Options include an `urgentReason`, custom `urgentUntil` limit, and `urgentType`.
- Applied items display a prominent Urgent badge.

## Hot Opps
- Cross-references your items against network items logically.
- Generates a "Hot Opportunity" prospect automatically based on active needs.
- *No Broad Notification Spam:* Matches appear contextually to prevent UI spam.

## Engagement Protocol
1. **Interest:** Mark the candidate as "Interested".
2. **Contact:** Initiate negotiation.
3. **Dismiss:** Remove the candidate from your queue.

## Dual Approval Workflow
- Negotiating deals proceed to a `ready_for_approval` state.
- Both sides securely register their approval (Cargo side, Vessel side).
- Once completed, the deal state shifts to `dual_approved`.

## Product Boundaries & Properties
- **Broker-Side Alignment Only:** Dual approval implies alignment of the platform's working deal; principal approvals may still be required. It is not a final fixture.
- **Duplicate Prevention:** Redundant urgent marks update the existing state.
- **Expiry/Cancellation:** Urgent flags automatically expire and become inactive after their duration. Cancellations halt ongoing approvals and maintain an audit trail.
