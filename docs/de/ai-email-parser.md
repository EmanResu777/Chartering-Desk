# AI Email Parser

The AI Email Parser translates unstructured email text into structured market requirements.

## Purpose
Automate the extraction of ship parameters, cargo details, laycan, rates, and route geometries.

## Strict Relevance Logic & Categorization
The AI categorizes emails based on firm chartering signals:
- **Cargo:** Exclusively cargo market inquiries.
- **Vessels/Tonnage:** Exclusively open vessel positions.
- **Mixed:** Both cargo and vessel details present.
- **Maybe:** Potentially relevant, requires human validation.
- **Skipped:** Newsletters, automated alerts, SaaS notifications, spam.

## Data Safety
- Non-chartering emails are immediately marked as skipped to prevent unnecessary token consumption.
- **No raw email bodies** are stored persistently in job documents. Only structured, AI-sanitized metadata is saved in Firestore.
- Raw AI prompts/responses are transient objects confined to the server request lifecycle and are excluded from billing metrics and audit trails.

## Troubleshooting Parser Results
- If an email was incorrectly "Skipped," verify if it lacked specific commercial terms triggering the minimum AI confidence threshold. 
- If an email failed to parse (stuck), check the Diagnostics/Troubleshooting page.
- Manual review allows users to adjust and salvage data.
