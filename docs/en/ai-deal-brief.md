# AI Deal Brief

The AI Deal Brief uses the platform's embedded generative AI to provide a rapid, analytical summary of a proposed transaction. 

## Supported Input Sources
AI Deal Briefs can synthesize context from:
- Single Cargo or Vessel items.
- Market Requests.
- Available Vessel / Open Tonnage listings.
- Smart Radar matches.
- Hot Opportunities.
- Deal Rooms and Recap Drafts.

## Structured Output Details
The generative response provides a highly structured breakdown:
- **Title and Deal Type:** High-level summary of the entity.
- **Key Details:** Extracted metrics (laycan, cargo size, routing).
- **Commercial Fit:** Compatibility analysis.
- **Match Explanation:** Why the context represents a viable deal.
- **Missing / Uncertain Fields:** Identifies gaps in data that require human clarification.
- **Risk Level & Reasons:** Highlights potential commercial or logistical hazards.
- **Suggested Action:** Next steps.
- **Broker-style Summary:** A short, professional synthesis of the deal state.
- **Disclaimer:** A mandatory block stating that AI is an assistant, not legal representation.

## Credits & Invoicing Logic
- Generating an AI Deal Brief consumes Usage Credits.
- Credits are deducted *only after* a successful generation. Failed generations are not charged.
- A cached view of an already-generated brief is not charged.
- **Regenerate:** Users can prompt the AI to regenerate the brief (which will consume new credits).

## Privacy & Security Limitations
- Raw AI prompts and completion responses are entirely hidden from the frontend user and cannot be audited directly by end-users.
- The brief does not provide legal advice, does not constitute a charter party claim, and cannot legally bind counterparties.
