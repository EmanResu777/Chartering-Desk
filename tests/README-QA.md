# Chartering Desk Pro - External QA Runner

## 1. Purpose of the External QA Runner

This QA suite is designed as a black-box testing system for the Chartering Desk Pro Hybrid AI Routing backend.

It verifies the operational and commercial accuracy of the AI analysis, extraction, matching, and risk detection endpoints without directly modifying application code, relying on internal implementations, or exposing the application to regression risks.

By testing from the outside, we ensure true end-to-end reliability of the Gemini 2.5 Flash and Gemini 2.5 Pro integrations while observing strict rate limits and fallback behavior.

⸻

## 2. Required Files

The suite relies on the following files inside the tests/ directory:

* tests/run-qa-tests.js — the central test execution script.
* tests/qa-cases.json — the test case pack with 140 controlled beta cases across Cargo, Vessel, Matching, Broker Replies, and Risk analysis.
* tests/qa-results.csv — auto-generated after test completion with detailed metrics, warnings, hallucinations, and statuses.

⸻

## 3. How to Start the App Locally

Before running the QA suite, ensure the Chartering Desk Pro backend is running locally.

```bash
# Install dependencies
npm install
# Start the dev server
npm run dev
```

The backend API should now be accessible at:

http://localhost:3000

⸻

## 4. How to Run the QA Runner

The runner takes its configuration from environment variables.

```bash
# Basic run with defaults:
# API_BASE_URL=http://localhost:3000
# No token
# QA_DELAY_MS=1500
node tests/run-qa-tests.js

# Custom run:
API_BASE_URL=https://staging-api.example.com QA_TEST_TOKEN=your_secure_token QA_DELAY_MS=2000 node tests/run-qa-tests.js
```

Environment Variables

| Variable | Description |
|---|---|
| API_BASE_URL | Base URL of the API under test. Default: http://localhost:3000. |
| QA_TEST_TOKEN | Optional authorization token sent as Authorization: Bearer <token>. |
| QA_DELAY_MS | Delay between requests to respect rate limits. Default: 1500. |

⸻

## 5. Before Running 140 Tests

Checklist:

* Confirm the server is running.
* Confirm GEMINI_API_KEY exists on the backend.
* Confirm QA_TEST_TOKEN if authentication is enabled.
* Confirm Firebase Emulator or staging Firestore is active.
* Confirm Gemini billing alerts are enabled.
* Confirm tests/qa-cases.json exists.
* Run 3 manual smoke tests before the full automated run.

⸻

## 6. Staging and Firebase Emulator

Tests must first be executed against a staging environment or a local Firebase Emulator.

Do not send bulk test traffic into a live production environment unless you have confirmed that the endpoints do not persist test data and do not trigger live external workflows.

Recommended environments:

1. Firebase Emulator — preferred.
2. Staging Firebase project — acceptable.
3. Production Firestore — only if dryRun: true and testMode: true are verified and respected by all tested endpoints.

⸻

## 7. Production Safety Warning

WARNING

Do not run these tests against the production Firestore database unless you have definitively verified that all endpoints honor dryRun: true and testMode: true.

If any endpoint writes to Firestore, run only against Firebase Emulator or a staging project.

Do not run destructive or bulk tests against production data.

⸻

## 8. How to Interpret qa-results.csv

After completion, the runner produces tests/qa-results.csv.

Important columns:

| Column | Meaning |
|---|---|
| Status | PASS means the AI output matched the critical commercial expectations. |
| Hallucination | Flags if the AI attempted to invent sensitive commercial terms such as freight rate, laycan, quantity, DWT, commission, or vessel identity. |
| Missing Field Detection | Verifies whether the AI correctly identified omitted necessary data. |
| Commercial Risk Detected | Tracks whether operational/commercial risks were flagged. |
| User Correction Needed | Estimates output friction: None, Minor, or Major. |
| Errors | Explains why a case failed. |
| Warnings | Highlights suspicious but not automatically failing behavior. |

A test should not be considered successful only because the endpoint responded.
A PASS means the response matched the critical commercial logic expected for that case.

⸻

## 9. Acceptance Thresholds

To be cleared for full operational rollout, the AI endpoints must achieve:

| Metric | Threshold |
|---|---|
| Cargo Extraction Accuracy | >= 90% |
| Vessel Extraction Accuracy | >= 90% |
| Useful Matching Recommendations | >= 80% |
| Broker Replies Usable | >= 80% |
| Critical Hallucinations | 0 |
| Critical Risk Misses | 0 |

⸻

## 10. Immediate Stop Criteria

The Controlled Beta and QA run must be paused immediately if any of the following occur:

* Critical hallucination involving quantity, freight rate, laycan, port, DWT, commission, or vessel identity.
* Sensitive data or PII appears in unfiltered operational logs.
* Firestore permission leakage or unauthorized document access is observed.
* Repeated wrong or nonsensical matching recommendations exceed 20% of the sample size.
* Gemini API cost exceeds the agreed daily beta budget.
* The model output generates an unsafe or commercially misleading broker recommendation without adequate risk flags.

⸻

## 11. Manual cURL Examples

The Authorization header is required only if backend authentication is enabled.

Test /api/ai/parseEmail

Cargo extraction example:

```bash
curl -X POST http://localhost:3000/api/ai/parseEmail \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{
    "testMode": true,
    "dryRun": true,
    "email": {
      "subject": "Firm Cargo",
      "sender": "broker@test.com",
      "rawBody": "30,000 mts urea in bulk, Bandar Abbas to Mersin, laycan 15-20 June, 2.5% addcom, load/disch CQD."
    }
  }'
```

Expected behavior:

* Returns structured cargo JSON.
* Uses Gemini 2.5 Flash.
* Does not use Gemini 2.5 Pro.
* Does not write test data to Firestore if dryRun / testMode are respected.

⸻

Test /api/ai/matchVessels

Matching example:

```bash
curl -X POST http://localhost:3000/api/ai/matchVessels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{
    "testMode": true,
    "dryRun": true,
    "cargo": {
      "cargo_name": "UREA",
      "quantity": 30000,
      "load_port": "Bandar Abbas"
    },
    "vessels": [
      {
        "vessel_name": "MV PACIFIC",
        "dwt": 58000,
        "open_port": "Dubai"
      }
    ]
  }'
```

Expected behavior:

* Uses Gemini 2.5 Pro for heavy matching analysis.
* Returns match reasoning, risks, and recommendation.
* If Pro fails, fallback to Flash must include:
    * degraded_analysis: true
    * fallback_reason

⸻

Test /api/ai/routeTask

Task router example:

```bash
curl -X POST http://localhost:3000/api/ai/routeTask \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -d '{
    "testMode": true,
    "dryRun": true,
    "taskType": "short_rewrite",
    "payload": {
      "contents": "Pls fix this."
    }
  }'
```

Expected behavior:

* Routes according to task type.
* Simple tasks should use browser/local/fallback logic where applicable.
* Operational cloud tasks should use Gemini 2.5 Flash.
* Heavy server tasks should use Gemini 2.5 Pro.

⸻

## 12. Reviewing High/Critical Failures

For cases flagged as FAIL with High or Critical severity in the CSV:

1. Copy the payload from tests/qa-cases.json based on the test ID.
2. Open Postman, Insomnia, or cURL.
3. Send the request to the same endpoint on local or staging.
4. Inspect:
    * raw AI response;
    * HTTP status;
    * model used;
    * response time;
    * backend logs;
    * whether missing_fields was populated correctly;
    * whether any commercial value was hallucinated.
5. Classify the failure:
    * prompt issue;
    * schema issue;
    * endpoint response shape issue;
    * model reasoning issue;
    * test case expectation issue.

Do not immediately change prompts or code for every failure.
First group failures by pattern and fix only high-impact recurring issues.

⸻

## 13. Reminder

Do not modify production prompts, routing logic, schema, or application code just to force tests to pass or to manually trigger malformed JSON during production execution.

The application should handle edge cases gracefully with its default production architecture.

The purpose of this QA runner is not to make every case green at any cost.
The purpose is to reveal where the AI is commercially unsafe, incomplete, or unreliable before real users rely on it.
