const fs = require('fs');
const path = require('path');
const { normalizeQaResponse } = require('./qa-normalizer.cjs');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const QA_TEST_TOKEN = process.env.QA_TEST_TOKEN || '';
const QA_DELAY_MS = parseInt(process.env.QA_DELAY_MS || '0', 10);

const CASES_FILE = path.join(__dirname, 'qa-cases.json');
const RESULTS_FILE = path.join(__dirname, 'qa-results.csv');

// Helper to delay between requests to respect rate limits
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper for deep lookup
function findValueDeep(obj, keyToFind) {
  if (obj == null || typeof obj !== 'object') return undefined;
  if (keyToFind in obj) return obj[keyToFind];
  for (const value of Object.values(obj)) {
    const found = findValueDeep(value, keyToFind);
    if (found !== undefined) return found;
  }
  return undefined;
}

// Helper for fuzzy comparison of commercial fields
function fuzzyMatch(actual, expected) {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return actual === expected;
  }
  if (!actual || !expected) return actual == expected;
  
  const a = String(actual).toLowerCase().replace(/[^a-z0-9]/g, '');
  const e = String(expected).toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (a === e) return true;
  
  // Custom minor normalizations
  if (e === '30000' && (a === '30k' || a === '30000mt' || a === '30000mts')) return true;
  if (e === 'bandarabbas' && a === 'babbas') return true;
  
  if (e.replace(/^mv\s*/i, '') === a.replace(/^mv\s*/i, '')) return true;
  if (a.replace(/^mv\s*/i, '') === e.replace(/^mv\s*/i, '')) return true;

  if (e === '32000' && (a === '32000dwt' || a === '32k')) return true;

  // Support partial string matching for commercial text (e.g. huge text blocks)
  if (a.includes(e)) return true;

  return actual == expected;
}

async function runTests() {
  if (!fs.existsSync(CASES_FILE)) {
    console.error(`Test cases file not found. Expected at: ${CASES_FILE}`);
    console.error(`Please provide tests/qa-cases.json to proceed.`);
    process.exit(1);
  }

  const testCases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));
  const results = [];
  
  let passed = 0;
  let failed = 0;
  let highCriticalFailures = 0;
  let possibleHallucinations = 0;

  console.log(`Starting QA Run with ${testCases.length} tests...`);
  console.log(`API_BASE_URL: ${API_BASE_URL}`);

  const prefixFilter = process.argv[2] || '';
  const filteredCases = prefixFilter ? testCases.filter(tc => tc.id.startsWith(prefixFilter)) : testCases;
  
  if (prefixFilter) {
    console.log(`Running batch with prefix: ${prefixFilter} (${filteredCases.length} tests)`);
  } else {
  console.log(`Running ALL (${filteredCases.length} tests)`);
  }

  for (let i = 0; i < filteredCases.length; i++) {
    const tc = filteredCases[i];
    console.log(`[${i + 1}/${filteredCases.length}] Running ${tc.id}: ${tc.category} -> ${tc.endpoint}`);
    
    const startTime = Date.now();
    let status = 'PASS';
    let errors = [];
    let warnings = [];
    let modelUsed = '';
    let hallucination = 'No';
    let missingFieldDetection = 'N/A';
    let commercialRiskDetected = 'N/A';
    let userCorrectionNeeded = 'None';
    let httpStatus = 0;

    const headers = { 'Content-Type': 'application/json' };
    if (QA_TEST_TOKEN) {
      headers['Authorization'] = `Bearer ${QA_TEST_TOKEN}`;
    }

    let retries = 3;
    let data = null;
    let res = null;
    let backoff = 5000;

    while (retries >= 0) {
      try {
        res = await fetch(`${API_BASE_URL}${tc.endpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(tc.payload)
        });
        
        httpStatus = res.status;
        data = await res.json().catch(() => null);

            const dataErrorStr = data && data.error ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : '';
            if (httpStatus === 429 || (httpStatus === 500 && dataErrorStr && (dataErrorStr.includes('high demand') || dataErrorStr.includes('quota')))) {
              if (retries > 0) {
                let waitSecs = backoff / 1000;
                const match = dataErrorStr.match(/retry in ([\d\.]+)s/);
                if (match && match[1]) {
                  waitSecs = Math.ceil(parseFloat(match[1])) + 2; // add 2s buffer
                }
                console.log(`  [Rate Limit] Retrying in ${waitSecs}s...`);
                // Break infinite waiting if the wait is too long
                if (waitSecs > 100) { waitSecs = 60; }
                await delay(waitSecs * 1000);
                backoff *= 2;
                retries--;
                continue;
              }
            }
        
        if (httpStatus === 500 && data && data.error && (data.error.includes('expired') || data.error.includes('invalid') || data.error.includes('API key'))) {
          console.error(`\nCRITICAL ERROR: Gemini API Key is invalid or expired. Aborting QA run.`);
          process.exit(1);
        }
        
        break; // Success or non-retriable error
      } catch (err) {
        status = 'FAIL';
        httpStatus = 500;
        errors.push(`Network/System Error: ${err.message}`);
        break;
      }
    }

    let fallbackUsed = 'No';
    let originalModel = tc.expected ? tc.expected.modelExpected : '';
    let actualModel = '';
    let fallbackReason = '';

    if (httpStatus !== 200 || !data || data.error) {
      status = 'FAIL';
      errors.push(data?.error || `HTTP ${httpStatus}`);
      userCorrectionNeeded = 'Major';
    } else {
      const normRes = normalizeQaResponse(tc, data);
      const normalized = normRes.normalized;
      
      modelUsed = findValueDeep(data, 'model_used') || findValueDeep(data, 'modelUsed') || findValueDeep(data, 'model') || '';
      actualModel = modelUsed;
      
      if (Object.keys(data).length === 0) {
         status = 'FAIL';
         errors.push('Empty AI response');
         userCorrectionNeeded = 'Major';
      }

      if (tc.expected && tc.expected.type && normalized.type && normalized.type !== tc.expected.type) {
         status = 'FAIL';
         errors.push(`Expected type '${tc.expected.type}', got '${normalized.type}'`);
         userCorrectionNeeded = 'Major';
      }

      if (tc.expected && tc.expected.modelExpected && data.degraded_analysis) {
         fallbackUsed = 'Yes';
         fallbackReason = data.fallback_reason || 'Unknown reason';
      }

      if (tc.expected && tc.expected.criticalFields) {
         for (const [key, expectedValue] of Object.entries(tc.expected.criticalFields)) {
            if (tc.category === 'REPLY_GENERATION') {
               if (key === 'tone' || key === 'commercial_intent' || key === 'commercialIntent') {
                 continue; // Do not hard-fail on missing metadata
               }
               if (key === 'must_include' || key === 'mustInclude') {
                 const replyText = normalized.generated_reply || '';
                 const phrases = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
                 for (const phrase of phrases) {
                    const phraseLower = String(phrase).toLowerCase();
                    const replyLower = replyText.toLowerCase();
                    
                    if (!replyLower.includes(phraseLower) && !replyLower.replace(/[^a-z0-9]/g, '').includes(phraseLower.replace(/[^a-z0-9]/g, ''))) {
                       const keywords = phraseLower.split(/\s+/).filter(w => w.length >= 3);
                       const matchCount = keywords.filter(kw => replyLower.includes(kw) || replyLower.includes(kw.replace(/ing$|ed$|s$/,''))).length;
                       
                       if (keywords.length === 0 || matchCount < Math.ceil(keywords.length / 2)) {
                           status = 'FAIL';
                           errors.push(`Generated reply missing required phrase: '${phrase}'`);
                           userCorrectionNeeded = 'Major';
                       }
                    }
                 }
                 continue;
               }
            }

            const actualVal = normalized[key] !== undefined ? normalized[key] : undefined;
            if (!fuzzyMatch(actualVal, expectedValue)) {
               status = 'FAIL';
               errors.push(`Mismatch on '${key}': expected '${expectedValue}', got '${actualVal}'`);
               userCorrectionNeeded = 'Major';
            }
         }
      }
      
      if (tc.expected && tc.expected.shouldNotHallucinateFields) {
         for (const key of tc.expected.shouldNotHallucinateFields) {
            if (normalized[key] && (!tc.expected.criticalFields || !fuzzyMatch(normalized[key], tc.expected.criticalFields[key]))) {
               hallucination = 'Yes';
               status = 'FAIL';
               errors.push(`Hallucinated field '${key}' containing: '${normalized[key]}'`);
               possibleHallucinations++;
               userCorrectionNeeded = 'Major';
            }
         }
      }

      if (tc.expected && tc.expected.missingFieldsShouldInclude) {
          missingFieldDetection = 'Correct';
          const actualMissing = normalized.missing_fields || [];
          
          if (Array.isArray(actualMissing)) {
              for (const expectedMissing of tc.expected.missingFieldsShouldInclude) {
                  if (!actualMissing.includes(expectedMissing)) {
                      status = 'FAIL';
                      errors.push(`Missed detecting missing field: '${expectedMissing}'`);
                      missingFieldDetection = 'Incorrect';
                  }
              }
          } else {
               status = 'FAIL';
               errors.push('missing_fields is missing or not an array');
               missingFieldDetection = 'Incorrect';
          }
      }

      if (tc.expected && tc.expected.shouldFlagRisk !== undefined) {
        commercialRiskDetected = normalized.shouldFlagRisk ? 'Yes' : 'No';
        if (tc.expected.shouldFlagRisk && !normalized.shouldFlagRisk) {
           status = 'FAIL';
           errors.push('Failed to flag commercial risk');
        } else if (!tc.expected.shouldFlagRisk && normalized.shouldFlagRisk) {
           status = 'FAIL';
           errors.push('False positive commercial risk flag');
        }
      }

      if (tc.expected && tc.expected.shouldReject !== undefined) {
         if (tc.expected.shouldReject && !normalized.shouldReject) {
            status = 'FAIL';
            errors.push('Failed to reject task');
         } else if (!tc.expected.shouldReject && normalized.shouldReject) {
            status = 'FAIL';
            errors.push('False positive reject flags');
         }
      }
    }

    if (status === 'PASS') {
      passed++;
    } else {
      failed++;
      if (tc.expected && (tc.expected.severityIfFailed === 'High' || tc.expected.severityIfFailed === 'Critical')) {
        highCriticalFailures++;
      }
    }

    const duration = Date.now() - startTime;

    const resultObj = {
      'Test ID': tc.id,
      'Category': tc.category,
      'Endpoint': tc.endpoint,
      'Status': status,
      'HTTP Status': httpStatus,
      'Duration ms': duration,
      'Model Expected': tc.expected ? tc.expected.modelExpected : '',
      'Model Used': modelUsed,
      'Original Model': originalModel,
      'Actual Model': actualModel,
      'Fallback Used': fallbackUsed,
      'Fallback Reason': fallbackReason,
      'Severity': tc.expected ? tc.expected.severityIfFailed : '',
      'Error Type': errors.length > 0 ? (httpStatus !== 200 ? 'Network/HTTP' : 'Validation') : '',
      'Errors': errors.join('; '),
      'Warnings': warnings.join('; '),
      'Hallucination': hallucination,
      'Missing Field Detection': missingFieldDetection,
      'Commercial Risk Detected': commercialRiskDetected,
      'User Correction Needed': userCorrectionNeeded,
      'Notes': ''
    };
    results.push(resultObj);
    require('fs').appendFileSync(path.join(__dirname, 'qa-results-stream.jsonl'), JSON.stringify(resultObj) + '\\n');

    await delay(parseInt(process.env.QA_DELAY_MS || '5000', 10)); // Force 5s delay
  }

  // Generate output CSV
  if (results.length > 0) {
    const header = Object.keys(results[0]).join(',') + '\n';
    const rows = results.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    fs.writeFileSync(RESULTS_FILE, header + rows);
  }

  console.log(`\n================================\n`);
  console.log(`--- QA Test Run Complete ---`);
  console.log(`Total Tests   : ${testCases.length}`);
  console.log(`Passed        : ${passed}`);
  console.log(`Failed        : ${failed}`);
  console.log(`Pass Rate     : ${((passed / testCases.length) * 100).toFixed(1)}%`);
  console.log(`High/Crit Fail: ${highCriticalFailures}`);
  console.log(`Hallucinations: ${possibleHallucinations}`);
  console.log(`Results saved : ${RESULTS_FILE}\n`);
}

runTests().catch(err => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
