# Deal Room / Negotiation Room

The Deal Room is an internal collaborative workspace. It consolidates all data, notes, counterparties, and documents related to a single negotiation thread.

## Creating a Deal Room
Deal Rooms can be initialized by clicking 'Deal Room' from multiple origin points:
- Process Offer workflows
- Cargo or Vessel dashboards
- Smart Radar matches
- Hot Opportunities
- Market Requests
- Counterparty CRM Profiles

## Sections within a Deal Room
- **Overview:** Meta details about the deal.
- **Cargo / Vessel (Tonnage):** Linked origin assets.
- **Counterparties:** Linked CRM contacts.
- **AI Deal Brief:** Directly accessible summary of the deal parameters.
- **Offers / Negotiation:** Log of bid/ask values.
- **Notes:** Private timeline of team annotations.
- **Documents:** Placeholder for future attached drafts or certificates.
- **Recap Draft:** Direct access to the active recap formatting tool.
- **Confirmation Status:** Readiness indicators from both sides.
- **Audit Timeline:** Non-editable, automatic trace of system events affecting the deal.

## Statuses
- `active`
- `negotiating`
- `awaiting confirmation`
- `archived`

## Visibility & Access
- Deal Rooms use strict, desk-scoped visibility logic (`createdByDeskId`, `participantDeskIds`).
- Normal users outside of these boundary conditions cannot view the room or its contents.
- Internal Notes remain restricted according to the author's choice (Private vs Desk).

## Legal Limitations & Assurances
- **No Final Fixture / No Automatic CP:** The Deal Room structures a negotiation; it does not finalize the contract automatically.
- **No Legal E-Signature:** The app includes logic for "Broker-side Recap Confirmation" but this is an internal alignment tool, not a legally binding signature mechanism.
- **No Automatic External Sending:** Communication artifacts (Exported PDFs, DOCX) must be sent out-of-band by the users.
- **Principal Approval:** Operations assume external principal approval is still required.
