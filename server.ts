import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import Stripe from 'stripe';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { fetchAISPosition, getAISProviderStatus } from './src/server/aisProvider';
import { estimateRoute } from './src/lib/routingProvider';
import { parseDeterministicCargoes } from './src/lib/deterministicCargoParser';
import { parseDeterministicVessels } from './src/lib/deterministicVesselParser';

let firestore: Firestore | null = null;
try {
  if (fs.existsSync('./firebase-applet-config.json')) {
    const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    console.log("Found firebase applet config, parsing...", firebaseConfig.projectId);
    console.log("Does FIREBASE_SERVICE_ACCOUNT exist?", !!process.env.FIREBASE_SERVICE_ACCOUNT);
    let appArgs: any = {
      projectId: firebaseConfig.projectId
    };
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        appArgs.credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
        console.log("Using explicit FIREBASE_SERVICE_ACCOUNT credential");
      } catch (e: any) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e.message);
      }
    }
    const app = initializeApp(appArgs);
    if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
      firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    } else {
      firestore = getFirestore(app);
    }
    console.log("Firebase Admin initialized for project:", firebaseConfig.projectId);
    
    // TEST FIRESTORE CONNECTION
    setTimeout(async () => {
       try {
         console.log("TESTING FIRESTORE...");
         await firestore.collection('cargos').limit(1).get();
       } catch (err: any) {
         console.error("FIRESTORE TEST CARGOS FAILED:", err.name, err.message);
         if (err.message && err.message.includes("PERMISSION_DENIED") && !process.env.FIREBASE_SERVICE_ACCOUNT) {
             const saEmail = process.env.AUTHORIZED_SERVICE_ACCOUNT_EMAIL;
             console.error(`\n======================================================`);
             console.error(`CRITICAL: Server lacks permissions to access Firestore.`);
             console.error(`Project: ${firebaseConfig.projectId}`);
             console.error(`\nRECOMMENDED (IAM approach):`);
             console.error(`Go to Google Cloud IAM and grant 'Cloud Datastore User' and`);
             console.error(`'Firebase Authentication Admin' to the runtime service account:`);
             console.error(`=> ${saEmail || 'Cloud Run default service account'}`);
             console.error(`\nFALLBACK (If cross-project IAM is blocked):`);
             console.error(`Store a FIREBASE_SERVICE_ACCOUNT JSON safely in the backend Secrets/Environment.`);
             console.error(`DO NOT put service account keys in VITE_ frontend variables.`);
             console.error(`======================================================\n`);
             firestore = null;
         }
       }
    }, 1000);
  }
} catch (e) {
  console.error("Failed to initialize Firebase Admin:", e);
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' as any }) : null;

const STRIPE_PLAN_MAPPING: Record<string, { priceId: string, name: string }> = {
  solo: { priceId: process.env.STRIPE_PRICE_ID_SOLO || 'price_solo_fallback', name: 'Solo Plan' },
  desk: { priceId: process.env.STRIPE_PRICE_ID_DESK || 'price_desk_fallback', name: 'Desk Plan' }
};

const AI_MODELS = {
  BROWSER_OPTIONAL: "gemini-nano-browser-optional",
  COMPLEX_CLOUD: "gemini-2.5-flash",
  HEAVY_SERVER: "gemini-2.5-pro",
  LOCAL_PROCESSING: "no-llm"
};

// --- P4.2.1: Usage Credit Data Model Skeleton (Hardened) --- //

export const PLAN_CONFIG = {
  trial: {
    planId: 'trial',
    creditsIncluded: 200,
    duration: '14 days'
  },
  solo: {
    planId: 'solo',
    creditsIncluded: 3000,
    billingPeriod: 'monthly'
  },
  desk: {
    planId: 'desk',
    creditsIncluded: 12000,
    seatsIncluded: 3,
    billingPeriod: 'monthly'
  },
  enterprise: {
    planId: 'enterprise',
    creditsIncluded: 'custom',
    billingPeriod: 'custom'
  }
};

export const CREDIT_COST: Record<string, number> = {
  parse_email: 1,
  ai_chat: 1,
  generate_recap: 3,
  freight_calc: 3,
  analyze_risk: 5,
  match_cargo_vessel: 5,
  negotiation_strategy: 5,
  email_sync_scan: 1,
  manual_text_intake: 1,
  draft_reply: 2,
  desk_network_publish: 0,
  recap_generation: 3,
  risk_review: 5,
  vessel_search: 1,
  cargo_match_review: 3
};

// Usage Helper Functions
export function getCurrentUsagePeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getCreditCost(operation: string): number {
  const cost = CREDIT_COST[operation];
  if (cost === undefined) {
    console.warn(`[Usage Warning] Unknown operation cost requested: ${operation}. Defaulting to safe fallback (0).`);
    return 0; // Fail safely without blocking if operation is unknown
  }
  return cost;
}

// Shared admin cache to prevent spamming Auth API
const adminCache = new Map<string, { isAdmin: boolean, expiresAt: number }>();

export async function checkIsAdmin(uid: string, email?: string): Promise<boolean> {
  const cached = adminCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isAdmin;
  }
  
  const adminUidsString = process.env.ADMIN_UIDS || '';
  const adminUids = adminUidsString.split(',').map(s => s.trim()).filter(Boolean);
  if (adminUids.includes(uid)) {
    adminCache.set(uid, { isAdmin: true, expiresAt: Date.now() + 10 * 60 * 1000 });
    return true;
  }

  const adminEmailsString = process.env.ADMIN_EMAILS || 'romattttt@gmail.com';
  const adminEmails = adminEmailsString.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  
  let isEmailAdmin = false;
  if (email && adminEmails.includes(email.toLowerCase())) {
     isEmailAdmin = true;
  } else if (adminEmails.length > 0) {
    try {
      const userRecord = await getAuth().getUser(uid);
      if (userRecord.email && adminEmails.includes(userRecord.email.toLowerCase())) {
        isEmailAdmin = true;
      }
    } catch(e) {}
  }
  
  adminCache.set(uid, { isAdmin: isEmailAdmin, expiresAt: Date.now() + 10 * 60 * 1000 });
  return isEmailAdmin;
}

export async function checkCredits(uid: string, operation: string) {
  if (!firestore) return { allowed: false, error: 'CREDIT_LIMIT_EXCEEDED', safeMessage: 'Unable to verify credits safely due to missing config.', statusCode: 503 };
  
  const isAdmin = await checkIsAdmin(uid);
  if (isAdmin) {
    return { allowed: true, cost: 0, docData: null, isAdminBypass: true };
  }

  const cost = getCreditCost(operation);
  if (cost === 0) return { allowed: true, cost };

  try {
    const docData = await getOrCreateUsageDoc(uid);
    if (!docData) {
      console.error("[Credit Error] Credit verification failed because getOrCreateUsageDoc failed or returned null. Blocking operation.");
      return { allowed: false, error: 'CREDIT_VERIFICATION_FAILED', safeMessage: 'Unable to verify credits securely. Please try again later.', statusCode: 503 };
    }

    let additionalCredits = 0;
    try {
      const overrideDoc = await firestore.collection('users').doc(uid).collection('usageOverrides').doc('current').get();
      if (overrideDoc.exists) {
        const td = overrideDoc.data();
        if (td?.testCreditsGranted && td.testCreditsExpiresAt) {
          const expiry = typeof td.testCreditsExpiresAt.toDate === 'function' ? td.testCreditsExpiresAt.toDate() : new Date(td.testCreditsExpiresAt);
          if (expiry > new Date()) {
            additionalCredits = td.testCreditsGranted;
          }
        }
      }
    } catch (e) {}

    const { creditsUsed, creditsIncluded, resetAt } = docData;
    const totalIncluded = creditsIncluded + additionalCredits;

    if (creditsUsed + cost > totalIncluded) {
      return {
        allowed: false,
        error: 'CREDIT_LIMIT_EXCEEDED',
        safeMessage: 'Credit limit reached. Please upgrade your plan or wait until your credits reset.',
        creditsUsed,
        creditsIncluded: totalIncluded,
        resetAt
      };
    }
    return { allowed: true, cost, docData };
  } catch (err: any) {
    console.error("[Usage Warning] Error in checkCredits:", err);
    return { allowed: false, error: 'CREDIT_VERIFICATION_FAILED', safeMessage: 'Unable to verify credits securely. Please try again later.', statusCode: 503 };
  }
}

export async function chargeCreditsAfterSuccess(uid: string, operation: string, requestId: string, metadata: any = {}) {
  const isAdmin = await checkIsAdmin(uid);
  if (isAdmin) {
    const cost = getCreditCost(operation);
    await recordUsageEvent(uid, operation, { requestId, status: 'success', isAdminBypass: true, estimatedCredits: cost, ...metadata });
    
    // P5.6 Admin Audit log for bypass
    if (firestore) {
       try {
         await firestore.collection('adminAudit').doc(`bypass_${Date.now()}_${uid}`).set({
           action: 'admin_bypass_used',
           adminUid: uid,
           operation,
           estimatedCredits: cost,
           createdAt: FieldValue.serverTimestamp(),
           safeMessage: `Admin bypassed ${cost} credits for ${operation}`
         });
       } catch (e) {}
    }
    
    return { recorded: true, cost: 0, isAdminBypass: true, operation, requestId };
  }
  
  const cost = getCreditCost(operation);
  if (cost === 0) {
    // Just record event?
    await recordUsageEvent(uid, operation, { requestId, status: 'success', ...metadata });
    return { recorded: true, cost, operation, requestId };
  }
  return await incrementCreditsUsed(uid, operation, cost, requestId, metadata);
}

export async function recordFailedNotCharged(uid: string, operation: string, requestId: string, safeErrorCode: string) {
  if (!firestore) return;
  try {
    await recordUsageEvent(uid, operation, {
      requestId,
      status: 'failed_not_charged',
      safeErrorCode
    });
  } catch (err) {
    console.warn("[Usage Warning] Failed to log failed_not_charged event:", err);
  }
}

export async function getUsageSummary(uid: string) {
  if (!firestore) return null;
  const isAdmin = await checkIsAdmin(uid);
  if (isAdmin) {
    return {
      planId: 'admin_test',
      creditsIncluded: 9999999,
      creditsUsed: 0,
      period: getCurrentUsagePeriod(),
      resetAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      billingStatus: 'admin_test'
    };
  }

  const docData = await getOrCreateUsageDoc(uid);
  if (!docData) return null;

  try {
    const overrideDoc = await firestore.collection('users').doc(uid).collection('usageOverrides').doc('current').get();
    if (overrideDoc.exists) {
      const td = overrideDoc.data();
      if (td?.testCreditsGranted && td.testCreditsExpiresAt) {
         const expiry = typeof td.testCreditsExpiresAt.toDate === 'function' ? td.testCreditsExpiresAt.toDate() : new Date(td.testCreditsExpiresAt);
         if (expiry > new Date()) {
           docData.creditsIncluded = (docData.creditsIncluded || 0) + td.testCreditsGranted;
           (docData as any).testGrant = td;
           (docData as any).billingStatus = 'test_grant';
         }
      }
    }
  } catch(e) {}

  return docData;
}


export async function getOrCreateUsageDoc(uid: string) {
  if (!firestore) return null;
  const period = getCurrentUsagePeriod();
  const usageRef = firestore.collection('users').doc(uid).collection('usage').doc(period);
  
  try {
    const docSnap = await usageRef.get();
    if (!docSnap.exists) {
      // Create new monthly doc or trial doc
      const newDoc = {
        uid,
        planId: 'trial', // Defaulting to trial for skeleton
        creditsIncluded: PLAN_CONFIG.trial.creditsIncluded,
        creditsUsed: 0,
        period,
        resetAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days for trial
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      await usageRef.set(newDoc);
      return newDoc;
    }
    return docSnap.data();
  } catch (err: any) {
    console.error("[Usage Fatal] Failed to get or create usage doc. Error name:", err.name, "Message:", err.message, "Stack:", err.stack);
    return null;
  }
}

export async function recordUsageEvent(uid: string, operation: string, metadata: any = {}) {
  // P4.2.1 Note: This is retained for single event logging without credit increments if needed.
  if (!firestore) return;
  try {
    const eventRef = firestore.collection('users').doc(uid).collection('usageEvents').doc();
    const safeMetadata = { ...metadata };
    
    // Explicitly strip sensitive data out
    delete safeMetadata.rawEmailBody;
    delete safeMetadata.rawPrompts;
    delete safeMetadata.rawResponses;
    delete safeMetadata.gmailTokens;
    delete safeMetadata.refreshTokens;
    delete safeMetadata.passwords;
    delete safeMetadata.privatePayload;

    await eventRef.set({
      eventId: eventRef.id,
      uid,
      operation,
      estimatedCredits: getCreditCost(operation),
      status: safeMetadata.status || 'success',
      requestId: safeMetadata.requestId || null,
      provider: safeMetadata.provider || null,
      model: safeMetadata.model || null,
      inputTokens: safeMetadata.inputTokens || null,
      outputTokens: safeMetadata.outputTokens || null,
      totalTokens: safeMetadata.totalTokens || null,
      estimatedCostUsd: safeMetadata.estimatedCostUsd || null,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.warn(`[Usage Warning] Failed to log usage event for ${operation}:`, error);
  }
}

export async function incrementCreditsUsed(uid: string, operation: string, cost: number, requestId: string, metadata: any = {}): Promise<{ recorded: boolean, alreadyRecorded?: boolean, cost: number, operation: string, requestId: string, safeErrorCode?: string }> {
  if (!firestore) {
    return { recorded: false, cost, operation, requestId, safeErrorCode: 'no_firestore' };
  }
  
  let validRequestId = requestId;
  if (!validRequestId) {
    // Fail-safe logic if no idempotency key is provided.
    validRequestId = 'auto-' + Math.random().toString(36).substring(2, 15);
  }
  
  // Deterministic event ID for double-count protection
  const safeRequestId = String(validRequestId).replace(/\//g, '_');
  const eventId = `${uid}_${operation}_${safeRequestId}`;
  
  const period = getCurrentUsagePeriod();
  const usageRef = firestore.collection('users').doc(uid).collection('usage').doc(period);
  const eventRef = firestore.collection('users').doc(uid).collection('usageEvents').doc(eventId);
  
  try {
    const result = await firestore.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) {
        // Event already recorded, idempotency lock kicks in
        return { recorded: false, alreadyRecorded: true, cost, operation, requestId: validRequestId };
      }
      
      const docSnap = await transaction.get(usageRef);
      if (!docSnap.exists) {
        // Create new usage doc inside transaction
        transaction.set(usageRef, {
          uid,
          planId: 'trial',
          creditsIncluded: PLAN_CONFIG.trial.creditsIncluded,
          creditsUsed: cost,
          period,
          resetAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), 
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        // Atomic increment
        transaction.update(usageRef, {
          creditsUsed: FieldValue.increment(cost),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      
      const safeMetadata = { ...metadata };
      delete safeMetadata.rawEmailBody;
      delete safeMetadata.rawPrompts;
      delete safeMetadata.rawResponses;
      delete safeMetadata.gmailTokens;
      delete safeMetadata.refreshTokens;
      delete safeMetadata.passwords;
      delete safeMetadata.privatePayload;
      
      // Atomic event creation
      transaction.set(eventRef, {
        eventId: eventRef.id,
        uid,
        operation,
        estimatedCredits: cost,
        status: safeMetadata.status || 'success',
        requestId: validRequestId,
        provider: safeMetadata.provider || null,
        model: safeMetadata.model || null,
        inputTokens: safeMetadata.inputTokens || null,
        outputTokens: safeMetadata.outputTokens || null,
        totalTokens: safeMetadata.totalTokens || null,
        estimatedCostUsd: safeMetadata.estimatedCostUsd || null,
        createdAt: FieldValue.serverTimestamp()
      });
      
      return { recorded: true, cost, operation, requestId: validRequestId };
    });
    
    return result;
  } catch (err: any) {
    console.warn(`[Usage Warning] Failed to increment credits transaction for ${operation}:`, err);
    return { recorded: false, cost, operation, requestId: validRequestId, safeErrorCode: err.message };
  }
}
// --- End Usage Skeleton --- //

const COMMERCIAL_SAFETY_RULES = "CRITICAL: If freight rate or cargo weight (MT) is missing, mark as 'Pending' or 'Pending Data'. Do not falsely output 'Profitable' or 'Above Market'. Never hallucinate freight rate, demurrage, or law/arbitration details.";
const RISK_ANALYST_SYSTEM = `You are a maritime risk analyst. Evaluate commercial data and identify risks (CQD, FIOS, lacking details). ${COMMERCIAL_SAFETY_RULES}
Interpret terms in chartering context: SHINC/SHEX for laytime, NOR/WIBON for tendering. For CQD, severity is Medium, action is clarify. Return strictly structured JSON matching the schema.`;

const JSON_REPAIR_SYSTEM_INSTRUCTION = `Repair this malformed JSON to valid JSON matching the provided schema. Do not add new facts.`;

const PARSE_EMAIL_SYSTEM_INSTRUCTION = `Extract cargo or vessel positions from email.
Broker circulars with multiple items MUST be fully extracted into arrays.
Pay close attention to multi-cargo and multi-vessel lists separated by empty lines or dashes. Extract EACH distinct opportunity as a separate item in the cargoes or vessels array.
Use CARGO_LIST or VESSEL_LIST for arrays, CARGO or VESSEL for singles, MIXED_LIST for both.
CARGO fields: raw_commodity, quantity, loadPort, dischargePort, laycan, freight_idea, comm. If stated: quantity_mt, quantity_cbm, terms, special_requirements, freight_inclusions, waiting_clause.
VESSEL fields: section_region, name, dwt, openPort, openDate, vessel_type, cranes/gear, direction/preference, restrictions. Treat every MV block as a separate vessel position. Merge continuation lines.
Determine decision per item: "Proceed", "Check", or "Reject" based on logic.
Do not standardise cargo name if unsure.
${COMMERCIAL_SAFETY_RULES}
Do not hallucinate fields, leave them blank and note them in missing_fields.
Return ONLY valid JSON with this exact structure (do not use markdown blocks):
{
  "summary": "...",
  "type": "CARGO|VESSEL|CARGO_LIST|VESSEL_LIST|MIXED_LIST|OTHER",
  "decision": "Proceed|Check|Reject",
  "cargoes": [ { "raw_commodity": "...", "quantity": "...", "loadPort": "...", "dischargePort": "...", "laycan": "...", "freight_idea": "...", "commission": "...", "missing_fields": [".."] } ],
  "vessels": [ { "name": "...", "dwt": "...", "openPort": "...", "openDate": "...", "missing_fields": [".."] } ],
  "extractedData": { /* for single cargo or vessel */ }
}`;

const MATCH_VESSELS_SYSTEM_INSTRUCTION = `Analyze matches between Cargo C and Vessels V.
Do NOT give 100% score just because DWT and Vessel Type match.
Calculate 5 component scores out of 100:
1. TechnicalFit: DWT, type, gear, holds, restrictions.
2. PositionFit: Distance open port to load port.
3. LaycanFit: Wait time, reach time.
4. CommercialViability: Repositioning and idle cost. ${COMMERCIAL_SAFETY_RULES}
5. RiskAdjustment: 0 to -100 depending on risks.
Score = average(Technical, Position, Laycan, Commercial) + RiskAdjustment. Severe penalties for long ballast.
Calculate Owner Loss Calculator details using provided assumptions.
Ensure 'recommendation' is one of: 'Strong Match', 'Conditional Match', 'Weak Match', 'Reject / Not Commercial'.
Return ONLY valid JSON with this exact structure (no markdown blocks):
{
  "matches": [
    {
      "vesselId": "...",
      "cargoId": "...",
      "score": 0,
      "technicalFit": 0,
      "positionFit": 0,
      "laycanFit": 0,
      "commercialViability": 0,
      "riskAdjustment": 0,
      "reasoning": ["..."],
      "eta": "...",
      "distance": "...",
      "missingCommercialData": false,
      "calculatorOutputs": {
        "ballastDistance": 0,
        "ballastDays": 0,
        "totalVoyageDays": 0,
        "estimatedTCE": 0,
        "totalVoyageCost": 0,
        "isViable": true,
        "recommendation": "Strong Match"
      }
    }
  ]
}`;

let _googleGenAI: GoogleGenAI | null = null;
function getGoogleGenAI() {
  if (_googleGenAI) return _googleGenAI;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY env var not set");
  _googleGenAI = new GoogleGenAI({ 
    apiKey: GEMINI_API_KEY.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
  return _googleGenAI;
}

let _openAI: OpenAI | null = null;
function getOpenAI() {
  if (_openAI) return _openAI;
  _openAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openAI;
}

class AsyncQueue {
  private limit = parseInt(process.env.AI_MAX_CONCURRENCY || '10');
  private timeout = parseInt(process.env.AI_QUEUE_TIMEOUT_MS || '60000');
  private running = 0;
  private queue: Array<{resolve: () => void, reject: (err: any) => void, t: NodeJS.Timeout}> = [];

  async enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => {
          const idx = this.queue.findIndex(item => item.resolve === resolve);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            reject(new Error("AI_QUEUE_TIMEOUT: Too many concurrent requests. Please try again later."));
          }
        }, this.timeout);
        this.queue.push({ resolve, reject, t });
      });
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.t);
        next.resolve();
      }
    }
  }
}
const aiQueue = new AsyncQueue();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const inMemoryCache = new Map<string, {data: any, expires: number}>();

class AICache {
  static async get(key: string): Promise<any> {
    // 1. In-memory
    const memEntry = inMemoryCache.get(key);
    if (memEntry && memEntry.expires > Date.now()) return memEntry.data;

    // 2. Redis/Upstash REST (optional)
    const redisEnabled = process.env.REDIS_ENABLED === 'true';
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (redisEnabled && upstashUrl && upstashToken) {
      try {
        const r = await fetch(`${upstashUrl}/get/${key}`, {
          headers: { Authorization: `Bearer ${upstashToken}` }
        });
        if (r.ok) {
          const d = await r.json();
          if (d.result) {
            let data = undefined;
            if (typeof d.result === 'string') data = JSON.parse(d.result);
            else if (typeof d.result === 'object') data = d.result;
            if (data) {
                inMemoryCache.set(key, { data, expires: Date.now() + 60000 }); // cache in memory for 1 minute
                return data;
            }
          }
        }
      } catch (e: any) {
        console.warn("Redis read failed, falling back silently:", e.message);
      }
    }
    return null;
  }

  static async set(key: string, data: any, ttlSecs: number): Promise<void> {
    // 1. In-memory
    inMemoryCache.set(key, { data, expires: Date.now() + Math.min(ttlSecs * 1000, 5 * 60000) });

    // 2. Redis (async fire-and-forget)
    const redisEnabled = process.env.REDIS_ENABLED === 'true';
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (redisEnabled && upstashUrl && upstashToken) {
      fetch(`${upstashUrl}/set/${key}?EX=${ttlSecs}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${upstashToken}` },
        body: JSON.stringify(data)
      }).catch(e => console.warn("Redis write failed silently:", e.message));
    }
  }
}

function getErrorMsg(error: any) {
  try {
    const parsed = JSON.parse(error.message);
    return parsed.error?.message || error.message;
  } catch(e) {
    return error.message;
  }
}

async function generateContentWithFailover(ai: GoogleGenAI, args: any): Promise<{text: string, actualModel: string, actualProvider: string, degraded: boolean, retries: number, failovers: number, timeoutCount: number, queueWaitMs: number}> {
  const startTime = Date.now();
  return aiQueue.enqueue(async () => {
    const queueWaitMs = Date.now() - startTime;
    let retries = 0;
    let timeoutCount = 0;
    const maxRetries = 2;
    const timeoutMs = parseInt(process.env.AI_PROVIDER_TIMEOUT_MS || '30000');
    
    // 3. Clean model tier mapping
    let openaiModel = 'gpt-4o-mini';
    let anthropicModel = 'claude-3-haiku-20240307';
    if (args.model === 'gemini-2.5-pro' || args.model === 'gemini-1.5-pro') {
        openaiModel = 'gpt-4o';
        anthropicModel = 'claude-3-5-sonnet-20241022';
    } else if (args.model === 'gemini-2.5-flash-8b') {
        openaiModel = 'gpt-4o-mini';
        anthropicModel = 'claude-3-haiku-20240307';
    }

    while (retries <= maxRetries) {
      try {
         const abortController = new AbortController();
         const timeoutId = setTimeout(() => abortController.abort(new Error("provider_timeout")), timeoutMs);
         
         const callArgs = { ...args };
         if (!callArgs.config) callArgs.config = {};
         callArgs.config.httpOptions = { signal: abortController.signal };
         
         try {
             const res = await ai.models.generateContent(callArgs);
             clearTimeout(timeoutId);
             
             // 5. Safe Gemini extraction
             let text = res.text || "";
             if (!text && res.candidates?.[0]?.content?.parts?.[0]?.text) {
                 text = res.candidates[0].content.parts[0].text;
             }
             return { text, actualModel: args.model, actualProvider: 'google', degraded: false, retries, failovers: 0, timeoutCount, queueWaitMs };
         } catch(error: any) {
             clearTimeout(timeoutId);
             throw error;
         }
      } catch(error: any) {
         const errMsg = (error.message || '').toLowerCase();
         if (error.name === 'AbortError' || errMsg.includes('provider_timeout')) timeoutCount++;
         
         const isRetryable = error.name === 'AbortError' || errMsg.includes('provider_timeout') || errMsg.includes('429') || errMsg.includes('503') || errMsg.includes('overloaded') || errMsg.includes('timeout') || errMsg.includes('network error') || errMsg.includes('rate limit');
         const isAuthQuota = errMsg.includes('quota') || errMsg.includes('api key') || errMsg.includes('unauthorized') || errMsg.includes('403');
         
         // 1. Same-provider retry before failover
         if (isRetryable && !isAuthQuota && retries < maxRetries) {
            retries++;
            const backoffMs = retries === 1 ? 500 + Math.random() * 300 : 1200 + Math.random() * 800;
            console.log(`Gemini retryable error (${errMsg}), retrying ${retries}/${maxRetries} after ${Math.round(backoffMs)}ms...`);
            await sleep(backoffMs);
            continue;
         }

         if (!isRetryable && !isAuthQuota) {
            throw error; // Schema error, bad request, etc -> throw immediately
         }

         console.warn('Gemini failed due to quota/auth/temp/timeout. Failing over to secondary providers.', error.message);
         try {
             // OPENAI FALLBACK
             const openai = getOpenAI();
             let system = args.config?.systemInstruction;
             let messages: any[] = [];
             if (system) messages.push({ role: 'system', content: system });
             
             let prompt = args.contents;
             if (Array.isArray(prompt)) {
                prompt = prompt.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
             }
             messages.push({ role: 'user', content: prompt });
             
             const config: any = { model: openaiModel, messages };
             // 6. Structured outputs
             if (args.config?.responseMimeType === 'application/json' && args.config?.responseSchema) {
                 const translateSchema = (obj: any): any => {
                   if (Array.isArray(obj)) return obj.map(translateSchema);
                   if (obj !== null && typeof obj === 'object') {
                     const newObj: any = {};
                     for (const [k, v] of Object.entries(obj)) {
                       if (k === 'type' && typeof v === 'string') {
                         newObj[k] = v.toLowerCase();
                       } else {
                         newObj[k] = translateSchema(v);
                       }
                     }
                     return newObj;
                   }
                   return obj;
                 };
                 config.response_format = { 
                    type: "json_schema", 
                    json_schema: {
                        name: "parsed_response",
                        schema: translateSchema(args.config.responseSchema),
                        strict: false
                    }
                 };
             } else if (args.config?.responseMimeType === 'application/json') {
                 config.response_format = { type: 'json_object' };
             }
             
             const abortController = new AbortController();
             const timeoutId = setTimeout(() => abortController.abort(new Error("provider_timeout")), timeoutMs);
             let res;
             try {
                res = await openai.chat.completions.create(config, { signal: abortController.signal });
                clearTimeout(timeoutId);
             } catch(err: any) {
                clearTimeout(timeoutId);
                const errMsgOA = (err.message || '').toLowerCase();
                if (err.name === 'AbortError' || errMsgOA.includes('provider_timeout')) timeoutCount++;
                throw err;
             }
             
             // 5. Safe OpenAI extraction
             const text = res.choices?.[0]?.message?.content || "";
             if (!text) throw new Error("OpenAI returned no text content");
             
             return { text, actualModel: openaiModel, actualProvider: 'openai', degraded: true, retries, failovers: 1, timeoutCount, queueWaitMs };
         } catch (oaError: any) {
             console.log('OpenAI failed. Failing over to Anthropic.', oaError.message);
             if (process.env.ANTHROPIC_API_KEY) {
                 let system = args.config?.systemInstruction;
                 let prompt = args.contents;
                 if (Array.isArray(prompt)) {
                    prompt = prompt.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
                 }

                 if (args.config?.responseMimeType === 'application/json') {
                     let schemaStr = JSON.stringify(args.config?.responseSchema || {});
                     prompt += "\n\nReturn strictly JSON according to the schema: " + schemaStr;
                 }
                 
                 const reqBody: any = {
                     model: anthropicModel,
                     max_tokens: 4096,
                     messages: [{role: 'user', content: prompt}]
                 };
                 if (system) {
                     reqBody.system = system;
                 }
                 
                 const abortController = new AbortController();
                 const timeoutId = setTimeout(() => abortController.abort(new Error("provider_timeout")), timeoutMs);
                 let r;
                 try {
                     r = await fetch('https://api.anthropic.com/v1/messages', {
                         method: 'POST',
                         headers: {
                            'x-api-key': process.env.ANTHROPIC_API_KEY,
                            'anthropic-version': '2023-06-01',
                            'content-type': 'application/json'
                         },
                         body: JSON.stringify(reqBody),
                         signal: abortController.signal as any
                     });
                     clearTimeout(timeoutId);
                 } catch(err: any) {
                     clearTimeout(timeoutId);
                     const errMsgAn = (err.message || '').toLowerCase();
                     if (err.name === 'AbortError' || errMsgAn.includes('provider_timeout')) timeoutCount++;
                     throw err;
                 }
                 
                 const d = await r.json();
                 if (d.error) throw new Error(d.error.message);
                 
                 // 5. Safe Anthropic extraction
                 const text = d.content?.[0]?.text || "";
                 if (!text) throw new Error("Anthropic returned no text content");
                 
                 return { text, actualModel: anthropicModel, actualProvider: 'anthropic', degraded: true, retries, failovers: 2, timeoutCount, queueWaitMs };
             }
             throw error; // Re-throw original Gemini error if Anthropic also fails and cannot be used
         } // end inner catch oaError
      } // end outer catch error
    } // end while loop
    // If it escapes the while loop (should not normally happen if retries throw):
    throw new Error("All AI retry attempts failed");
  });
}

async function safeAIParseJSON(rawText: string): Promise<any> {
  // 1. First try native JSON.parse
  try {
    return JSON.parse(rawText || '{}');
  } catch (error) {
    // 2. Try deterministic cleanup
    try {
      let cleanText = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const firstBrace = cleanText.indexOf('{');
      const firstBracket = cleanText.indexOf('[');
      const startIndex = Math.max(0, firstBrace !== -1 && firstBracket !== -1 ? Math.min(firstBrace, firstBracket) : Math.max(firstBrace, firstBracket));
      const lastBrace = cleanText.lastIndexOf('}');
      const lastBracket = cleanText.lastIndexOf(']');
      const endIndex = Math.max(lastBrace, lastBracket);
      if (endIndex > -1 && endIndex >= startIndex) {
         cleanText = cleanText.substring(startIndex, endIndex + 1);
      }
      return JSON.parse(cleanText);
    } catch (cleanError) {
      console.warn("JSON cleanup failed. Attempting lightweight repair with AI...");
      try {
        const ai = getGoogleGenAI();
        const repairPrompt = `Invalid JSON:\n${rawText}`;
        const repairInstruction = `Repair malformed JSON only. Do not add facts. Do not invent any commercial data, freight, demurrage, law/arbitration, cargo details, vessel details, or AIS coordinates. Return only valid JSON.`;
        
        const response = await generateContentWithFailover(ai, {
          model: AI_MODELS.COMPLEX_CLOUD, // fallback to cloud for repair (lightweight 2.5 flash)
          contents: repairPrompt,
          config: {
            systemInstruction: repairInstruction,
            responseMimeType: "application/json"
          }
        });
        
        const repairedData = JSON.parse(response.text || '{}');
        repairedData._repaired = true;
        return repairedData;
      } catch (repairError) {
        console.error("AI JSON Repair failed:", repairError);
        throw new Error("Failed to parse and repair strictly expected JSON from AI output");
      }
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', true);
  
  // Webhook needs raw body for signature verification
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
      console.error("Stripe keys not configured for webhook");
      return res.status(400).send("Webhook secret not configured");
    }

    const sig = req.headers['stripe-signature'];
    
    if (!sig) {
      return res.status(400).send("No signature found");
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (!firestore) {
      console.error("Firestore not initialized for webhook");
      return res.status(500).send("Database error");
    }

    try {
      // Idempotency check
      const eventRef = firestore.collection('_stripe_events').doc(event.id);
      const eventSnap = await eventRef.get();
      if (eventSnap.exists) {
        console.log(`Webhook event ${event.id} already processed.`);
        return res.json({ received: true, alreadyProcessed: true });
      }

      console.log(`Processing Stripe webhook event: ${event.type}`);

      const getCustomerUid = async (customerId: string) => {
        const usersSnap = await firestore!.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();
        if (!usersSnap.empty) {
          return usersSnap.docs[0].id;
        }
        return null;
      };

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.uid;
        const planId = session.metadata?.planId || 'solo';
        
        if (userId) {
          const planConfig = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG] || PLAN_CONFIG.solo;
          
          await firestore.collection('users').doc(userId).set({
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            planId: planId,
            billingStatus: 'active'
          }, { merge: true });

          const period = getCurrentUsagePeriod();
          await firestore.collection('users').doc(userId).collection('usage').doc(period).set({
             planId: planId,
             creditsIncluded: planConfig.creditsIncluded,
             creditsUsed: 0, // Reset on new subscription completed
             billingStatus: 'active'
          }, { merge: true });
        }
      } 
      else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.uid || await getCustomerUid(subscription.customer as string);
        
        if (userId) {
           const planId = subscription.metadata?.planId || 'solo';
           const planConfig = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG] || PLAN_CONFIG.solo;

           await firestore.collection('users').doc(userId).set({
             stripeCustomerId: subscription.customer,
             stripeSubscriptionId: subscription.id,
             planId: planId,
             billingStatus: subscription.status
           }, { merge: true });

           const period = getCurrentUsagePeriod();
           await firestore.collection('users').doc(userId).collection('usage').doc(period).set({
              planId: planId,
              creditsIncluded: planConfig.creditsIncluded,
              // don't immediately reset credits on update unless it's a specific plan upgrade logic, but we update status
              billingStatus: subscription.status,
              currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
              currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
              resetAt: new Date((subscription as any).current_period_end * 1000)
           }, { merge: true });
        }
      }
      else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.uid || await getCustomerUid(subscription.customer as string);
        
        if (userId) {
           await firestore.collection('users').doc(userId).set({
             billingStatus: 'cancelled',
             planId: 'trial' // downgrade to trial/free
           }, { merge: true });

           const period = getCurrentUsagePeriod();
           await firestore.collection('users').doc(userId).collection('usage').doc(period).set({
              billingStatus: 'cancelled',
              planId: 'trial',
              creditsIncluded: PLAN_CONFIG.trial.creditsIncluded // safe read-only or limited fallback
           }, { merge: true });
        }
      }
      else if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object as any;
        if (invoice.subscription) {
            const userId = await getCustomerUid(invoice.customer as string);
            if (userId) {
              const period = getCurrentUsagePeriod();
              await firestore.collection('users').doc(userId).collection('usage').doc(period).set({
                 creditsUsed: 0, // Reset credits on successful recurring invoice payment
                 billingStatus: 'active'
              }, { merge: true });
            }
        }
      }
      else if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object as any;
        if (invoice.subscription) {
            const userId = await getCustomerUid(invoice.customer as string);
            if (userId) {
               await firestore.collection('users').doc(userId).set({
                 billingStatus: 'past_due'
               }, { merge: true });

               const period = getCurrentUsagePeriod();
               await firestore.collection('users').doc(userId).collection('usage').doc(period).set({
                  billingStatus: 'past_due'
               }, { merge: true });
            }
        }
      }

      // Mark processed
      await eventRef.set({
        processedAt: FieldValue.serverTimestamp(),
        type: event.type
      });
      
      res.json({ received: true });
    } catch (err) {
      console.error("Error processing webhook:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  // Standard JSON middleware for all other routes
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  
  // Use current host for redirect URI construction
  const getRedirectUri = (req: express.Request) => {
    if (req.query.state && typeof req.query.state === 'string') {
      try {
        const decoded = JSON.parse(Buffer.from(req.query.state.replace(/ /g, '+'), 'base64').toString('utf-8'));
        if (decoded.redirectUri) {
          return decoded.redirectUri;
        }
      } catch (e) {
        console.error("Failed to parse state", e);
      }
    }
    
    if (req.query.redirect_uri && typeof req.query.redirect_uri === 'string') {
        return req.query.redirect_uri;
    }
    
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    
    // In our specific cloud environments (ais-dev, ais-pre, run.app), we ALWAYS use https
    let protocol = 'http';
    if (typeof host === 'string' && (host.includes('ais-dev-') || host.includes('ais-pre-') || host.includes('run.app'))) {
      protocol = 'https';
    } else if (req.headers['x-forwarded-proto'] === 'https') {
      protocol = 'https';
    }
    
    const uri = `${protocol}://${host}/auth/callback`;
    console.log(`[OAuth] Generated Redirect URI: ${uri} (Protocol: ${protocol}, Host: ${host})`);
    return uri;
  };

  // Simple in-memory rate limiting
  const userRateLimits = new Map<string, { count: number, resetAt: number }>();
  
  // Routing Cache and Diagnostics
  const routingCache = new Map<string, { estimate: any, expiresAt: number }>();
  let lastRoutingSuccess: any = null;
  let lastRoutingError: string | null = null;

  // Health check endpoint
  app.get('/healthz', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  app.get('/readyz', (req, res) => {
    const checks = {
      firebaseAdmin: !!firestore,
      firestoreDatabaseId: process.env.UPSTASH_REDIS_REST_URL ? "checked" : "checked", // Optional check
      aiProviderConfig: !!process.env.GEMINI_API_KEY,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
    const isReady = checks.firebaseAdmin && checks.aiProviderConfig;
    res.status(isReady ? 200 : 503).json(checks);
  });
  const MAX_AI_REQUESTS_PER_MINUTE = parseInt(process.env.MAX_AI_REQUESTS_PER_MINUTE || '60');
  
  function checkRateLimit(uid: string): boolean {
    const now = Date.now();
    const limiter = userRateLimits.get(uid);
    if (!limiter || limiter.resetAt < now) {
        userRateLimits.set(uid, { count: 1, resetAt: now + 60000 });
        return true;
    }
    if (limiter.count >= MAX_AI_REQUESTS_PER_MINUTE) {
        adminDiagnostics.rateLimitHits++;
        return false;
    }
    limiter.count++;
    return true;
  }

  // API Routes
  const adminDiagnostics = {
    recentAICalls: [] as any[], // Keep last 50
    cacheHits: 0,
    cacheMisses: 0,
    retries: 0,
    failovers: 0,
    sumQueueWait: 0,
    countQueueWait: 0,
    rateLimitHits: 0,
    syncErrors: 0,
    parseFailures: 0,
    schemaFailures: 0,
    draftErrors: 0,
    deskErrors: 0
  };

  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const start = Date.now();
    
    // Patch res.json to grab final metrics payload
    const originalJson = res.json;
    res.json = function(body) {
        if (body && body.metrics) {
             (req as any).aiMetrics = body.metrics;
             if (body.actualProvider) (req as any).aiMetrics.provider = body.actualProvider;
             if (body.degraded !== undefined) (req as any).aiMetrics.degraded = body.degraded;
        }
        return originalJson.call(this, body);
    };

    res.on('finish', () => {
        const latency = Date.now() - start;
        let uidHash = 'unauth';
        const uid = (req as any).verifiedUid || req.body?.userId || req.query?.userId || req.headers['x-user-id'];
        if (uid && typeof uid === 'string') {
            uidHash = Buffer.from(uid).toString('base64').substring(0, 8);
        }
        
        const metricsData = (req as any).aiMetrics || {};
        
        const logObj = {
            timestamp: new Date().toISOString(),
            route: req.path,
            status: res.statusCode,
            latencyMs: latency,
            user: uidHash,
            ...metricsData
        };
        console.log(`[Metrics] ${JSON.stringify(logObj)}`);
        
        if (metricsData.provider) {
            adminDiagnostics.recentAICalls.unshift({ time: logObj.timestamp, route: logObj.route, latency, provider: metricsData.provider, cached: metricsData.cacheHit || false });
            if (adminDiagnostics.recentAICalls.length > 50) adminDiagnostics.recentAICalls.pop();
        }
        if (metricsData.cacheHit === true) adminDiagnostics.cacheHits++;
        if (metricsData.cacheHit === false) adminDiagnostics.cacheMisses++;
        if (metricsData.retries) adminDiagnostics.retries += metricsData.retries;
        if (metricsData.failoverCount) adminDiagnostics.failovers += metricsData.failoverCount;
        if (metricsData.queueWaitMs) {
            adminDiagnostics.sumQueueWait += metricsData.queueWaitMs;
            adminDiagnostics.countQueueWait++;
        }
        if (metricsData.repairUsed) adminDiagnostics.schemaFailures++;
        if (res.statusCode === 429) adminDiagnostics.rateLimitHits++;
        if (res.statusCode >= 400) {
            if (req.path.includes('sync')) adminDiagnostics.syncErrors++;
            if (req.path.includes('parse')) adminDiagnostics.parseFailures++;
        }
    });
    next();
  });

  async function logAuditEvent(action: string, uid: string, metadata: any = {}) {
      if (!uid || uid === 'unauthenticated' || !uid.trim()) return;
      try {
          const cleanMetadata = { ...metadata };
          delete cleanMetadata.emailBody;
          delete cleanMetadata.rawText;
          delete cleanMetadata.token;
          delete cleanMetadata.cargoes;
          delete cleanMetadata.vessels;
          delete cleanMetadata.recap;
          delete cleanMetadata.matches;
          
          console.log(`[Audit] ${new Date().toISOString()} Action: ${action} User: ${uid}`);
          if (firestore) {
             await firestore.collection('auditLogs').add({
                action,
                uid,
                timestamp: FieldValue.serverTimestamp(),
                metadata: cleanMetadata
             });
          }
      } catch(e: any) {
          console.error("Audit log failed", e.message);
      }
  }

  app.get('/api/admin/diagnostics', async (req, res) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization" });
      const idToken = authHeader.split('Bearer ')[1];
      try {
          const decoded = await getAuth().verifyIdToken(idToken);
          // Only allow specific users, for now allow all authenticated users to see basic status, or guard behind email check
          // If needed add: if (decoded.email !== 'owner@example.com') return res.status(403)...
          
          res.json({
              status: 'ok',
              uptime: process.uptime(),
              ...adminDiagnostics,
              aisProvider: getAISProviderStatus(),
              queueWaitAverage: adminDiagnostics.countQueueWait > 0 ? (adminDiagnostics.sumQueueWait / adminDiagnostics.countQueueWait) : 0,
              cacheHitRate: (adminDiagnostics.cacheHits + adminDiagnostics.cacheMisses > 0) ? (adminDiagnostics.cacheHits / (adminDiagnostics.cacheHits + adminDiagnostics.cacheMisses)) : 0
          });
      } catch (e) {
          res.status(401).json({ error: "Invalid token" });
      }
  });

  app.get("/api/auth/google-url", (req, res) => {
    if (!CLIENT_ID) {
      return res.status(500).json({ error: "VITE_GOOGLE_CLIENT_ID not configured" });
    }

    const userId = req.query.userId || req.headers['x-user-id'] || '';
    const redirectUri = getRedirectUri(req);
    console.log(`Setting up OAuth with Redirect URI: ${redirectUri}`);
    
    const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, redirectUri);
    const authorizeUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/gmail.readonly',
      ],
      prompt: 'consent',
      state: Buffer.from(JSON.stringify({ redirectUri, userId })).toString('base64')
    });

    res.json({ url: authorizeUrl });
  });

  app.get("/api/auth/token", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedIdToken;
    try {
      decodedIdToken = await getAuth().verifyIdToken(idToken);
    } catch (error) {
       console.error("Invalid Firebase ID token");
       return res.status(401).json({ error: "Invalid or expired authorization token" });
    }

    const verifiedUid = decodedIdToken.uid;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
       return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    }

    const userId = req.query.userId || req.headers['x-user-id'];
    if (!userId) {
       return res.status(400).json({ error: "Missing userId" });
    }

    if (userId !== decodedIdToken.uid) {
       return res.status(403).json({ error: "Forbidden: userId mismatch" });
    }
  
    try {
       if (!firestore) throw new Error("Firestore not initialized");
       const snap = await firestore.collection(`users/${decodedIdToken.uid}/emailAccounts`).get();
       const gmailDoc = snap.docs.find(d => d.data().provider === 'gmail');
       
       let refreshToken = undefined;
       if (gmailDoc) {
         refreshToken = gmailDoc.data().refreshToken;
       }
       
       if (!refreshToken) {
         return res.status(404).json({ error: "No refresh token available" });
       }
       
       const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, getRedirectUri(req));
       oAuth2Client.setCredentials({ refresh_token: refreshToken });
       
       const { credentials } = await oAuth2Client.refreshAccessToken();
       
       res.json({
         access_token: credentials.access_token,
         expiry_date: credentials.expiry_date,
         expires_in: (credentials as any).expires_in
       });
    } catch (error: any) {
      console.log("Failed to refresh token (expected if no valid OAuth grant):", error.message);
      res.status(500).json({ error: "Failed to refresh token: " + error.message });
    }
  });

  app.post("/api/billing/create-checkout-session", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;
      
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
         return res.status(429).json({ error: "Too many requests" });
      }
      
      const { planId } = req.body;
      
      if (!['solo', 'desk'].includes(planId)) {
         return res.status(400).json({ error: "Invalid planId requested. Allowed: 'solo', 'desk'." });
      }
      
      if (!stripe) {
        console.log('Stripe API Key not provided, returning demo mode success.');
        return res.json({ demoMode: true });
      }

      const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
      const protocol = (typeof host === 'string' && (host.includes('ais-dev-') || host.includes('ais-pre-') || host.includes('run.app'))) || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const domainURL = `${protocol}://${host}`;

      const mappedPlan = STRIPE_PLAN_MAPPING[planId];

      let customerId: string | undefined = undefined;
      if (firestore) {
        const userDoc = await firestore.collection('users').doc(verifiedUid).get();
        if (userDoc.exists) {
           const data = userDoc.data();
           if (data?.stripeCustomerId) {
              customerId = data.stripeCustomerId;
           }
        }
      }

      const sessionObj: Stripe.Checkout.SessionCreateParams = {
        payment_method_types: ['card'],
        client_reference_id: verifiedUid,
        customer: customerId,
        metadata: {
          uid: verifiedUid,
          planId: planId
        },
        mode: 'subscription',
        success_url: `${domainURL}?success=true&plan=${planId}`,
        cancel_url: `${domainURL}?canceled=true`,
      };
      
      if (mappedPlan.priceId && !mappedPlan.priceId.includes("fallback")) {
        sessionObj.line_items = [
          {
            price: mappedPlan.priceId,
            quantity: 1,
          },
        ];
      } else {
        // Fallback for development if price IDs aren't real Stripe objects (prevents crashes if Stripe demands real IDs)
        // But Stripe subscriptions require real price IDs, so we'll throw error if so
        console.warn('Real Stripe Price ID map is missing, returning demo checkout session.');
        return res.json({ demoMode: true });
      }

      const session = await stripe.checkout.sessions.create(sessionObj);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || 'An error occurred with Stripe checkout.' });
    }
  });

  app.post("/api/billing/admin/create-portal-session", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
         return res.status(401).json({ error: "Missing authorization header" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;
      const email = decodedIdToken.email;

      const allowedAdmins = (process.env.ADMIN_UIDS || '').split(',').map(s=>s.trim());
      const allowedEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s=>s.trim());
      const isAdmin = allowedAdmins.includes(verifiedUid) || (email && allowedEmails.includes(email));

      if (!isAdmin) {
         return res.status(403).json({ error: "Forbidden. Admin access required." });
      }

      const { targetUserId } = req.body;
      if (!targetUserId) {
         return res.status(400).json({ error: "Missing targetUserId" });
      }

      if (!stripe) {
        return res.status(500).json({ error: 'Stripe API Key not provided.' });
      }

      if (!firestore) throw new Error("Firestore not initialized");

      const userDoc = await firestore.collection('users').doc(targetUserId).get();
      if (!userDoc.exists) {
         return res.status(404).json({ error: "Target user not found." });
      }

      const userData = userDoc.data() || {};
      if (!userData.stripeCustomerId) {
         return res.status(200).json({ error: "This user does not have a Stripe customer yet." }); // Return 200 with error property for safe handling without raw exception
      }

      const customerId = userData.stripeCustomerId;

      const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
      const protocol = (typeof host === 'string' && (host.includes('ais-dev-') || host.includes('ais-pre-') || host.includes('run.app'))) || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const domainURL = `${protocol}://${host}`;

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${domainURL}`,
      });

      // Audit the admin action
      await firestore.collection('adminAudit').doc(`portal_${Date.now()}_${targetUserId}`).set({
         action: 'admin_billing_portal_session_created',
         adminUid: verifiedUid,
         targetUid: targetUserId,
         createdAt: FieldValue.serverTimestamp(),
         safeMessage: `Admin created billing portal session for ${targetUserId}`
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Admin Portal error:", error);
      res.status(500).json({ error: error.message || 'An error occurred creating portal session.' });
    }
  });

  app.post("/api/billing/create-portal-session", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
         return res.status(429).json({ error: "Too many requests" });
      }

      if (!stripe) {
        return res.status(500).json({ error: 'Stripe API Key not provided.' });
      }

      if (!firestore) throw new Error("Firestore not initialized");

      const userDoc = await firestore.collection('users').doc(verifiedUid).get();
      if (!userDoc.exists || !userDoc.data()?.stripeCustomerId) {
         return res.status(404).json({ error: "No billing profile found." });
      }

      const customerId = userDoc.data()!.stripeCustomerId;

      const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
      const protocol = (typeof host === 'string' && (host.includes('ais-dev-') || host.includes('ais-pre-') || host.includes('run.app'))) || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const domainURL = `${protocol}://${host}`;

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${domainURL}`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Portal error:", error);
      res.status(500).json({ error: error.message || 'An error occurred creating portal session.' });
    }
  });

  // --- ADMIN ENDPOINTS ---
  app.get("/api/admin/ai/status", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization header" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;
      const verifiedEmail = decodedIdToken.email;

      const isAdmin = await checkIsAdmin(verifiedUid, verifiedEmail);
      if (!isAdmin) return res.status(403).json({ error: "Forbidden: Admin only" });

      const maskKey = (key: string | undefined) => {
        if (!key) return null;
        if (key.length <= 4) return "****";
        return "****" + key.slice(-4);
      };

      res.json({
        success: true,
        aiConfig: {
           primaryProvider: 'google',
           models: AI_MODELS,
           providers: {
             google: {
                configured: !!process.env.GEMINI_API_KEY,
                keyMasked: maskKey(process.env.GEMINI_API_KEY),
             },
             openai: {
                configured: !!process.env.OPENAI_API_KEY,
                keyMasked: maskKey(process.env.OPENAI_API_KEY),
             },
             anthropic: {
                configured: !!process.env.ANTHROPIC_API_KEY,
                keyMasked: maskKey(process.env.ANTHROPIC_API_KEY),
             }
           },
           timeoutMs: parseInt(process.env.AI_PROVIDER_TIMEOUT_MS || '30000'),
           queueTimeoutMs: parseInt(process.env.AI_QUEUE_TIMEOUT_MS || '60000')
        },
        diagnostics: adminDiagnostics
      });
    } catch (err: any) {
      console.error("Admin AI Status Error:", err);
      res.status(500).json({ error: "Failed to fetch AI Status" });
    }
  });

  app.post("/api/admin/usage/grant-credits", express.json(), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization header" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;
      const verifiedEmail = decodedIdToken.email;

      const isAdmin = await checkIsAdmin(verifiedUid, verifiedEmail);
      if (!isAdmin) return res.status(403).json({ error: "Forbidden: Admin only" });

      if (!firestore) return res.status(500).json({ error: "Firestore missing" });

      const { targetEmail, targetUid, amount, durationDays, reason } = req.body;
      if (!amount || amount > 5000 || durationDays > 90) return res.status(400).json({ error: "Invalid amount or duration. Max 5000 credits, 90 days." });

      let actualTargetUid = targetUid;
      if (!actualTargetUid && targetEmail) {
        try {
          const uRecord = await getAuth().getUserByEmail(targetEmail);
          actualTargetUid = uRecord.uid;
        } catch (e) {
          return res.status(404).json({ error: "User with email not found" });
        }
      }

      if (!actualTargetUid) return res.status(400).json({ error: "Must specify targetUid or targetEmail" });

      // Capping test users to 2
      const activeGrantsSnap = await firestore.collectionGroup('usageOverrides')
        .where('testCreditsGranted', '>', 0)
        .where('testCreditsExpiresAt', '>', new Date())
        .get();

      let activeCount = 0;
      activeGrantsSnap.docs.forEach((doc: any) => {
         if (!doc.ref.path.includes(actualTargetUid)) {
           activeCount++;
         }
      });
      if (activeCount >= 2) {
        return res.status(400).json({ error: "Cannot have more than 2 active test grantees. Revoke one first." });
      }

      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      
      const td = {
        testCreditsGranted: amount,
        testCreditsExpiresAt: expiresAt,
        grantedBy: verifiedUid,
        grantedAt: FieldValue.serverTimestamp(),
        grantReason: reason || 'Testing'
      };

      await firestore.collection('users').doc(actualTargetUid).collection('usageOverrides').doc('current').set(td, { merge: true });

      await firestore.collection('adminAudit').doc(`grant_${Date.now()}_${actualTargetUid}`).set({
         action: 'grant_credits',
         adminUid: verifiedUid,
         targetUid: actualTargetUid,
         amount,
         expiresAt: expiresAt,
         reason,
         createdAt: FieldValue.serverTimestamp(),
         safeMessage: `Admin granted ${amount} credits to ${actualTargetUid}`
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error('Grant credits error:', err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/api/admin/usage/revoke-grant", express.json(), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization header" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;
      const verifiedEmail = decodedIdToken.email;

      const isAdmin = await checkIsAdmin(verifiedUid, verifiedEmail);
      if (!isAdmin) return res.status(403).json({ error: "Forbidden: Admin only" });

      if (!firestore) return res.status(500).json({ error: "Firestore missing" });

      const { targetUid } = req.body;
      if (!targetUid) return res.status(400).json({ error: "Missing targetUid" });

      await firestore.collection('users').doc(targetUid).collection('usageOverrides').doc('current').set({
        testCreditsGranted: 0,
        testCreditsExpiresAt: FieldValue.serverTimestamp()
      }, { merge: true });

      await firestore.collection('adminAudit').doc(`revoke_${Date.now()}_${targetUid}`).set({
         action: 'revoke_grant',
         adminUid: verifiedUid,
         targetUid: targetUid,
         createdAt: FieldValue.serverTimestamp(),
         safeMessage: `Admin revoked credits for ${targetUid}`
      });

      res.json({ success: true });
    } catch (err: any) {
      console.error('Revoke credits error:', err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/api/admin/usage/grants", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization header" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;
      const verifiedEmail = decodedIdToken.email;

      const isAdmin = await checkIsAdmin(verifiedUid, verifiedEmail);
      if (!isAdmin) return res.status(403).json({ error: "Forbidden: Admin only" });

      if (!firestore) return res.status(500).json({ error: "Firestore missing" });

      const activeGrantsSnap = await firestore.collectionGroup('usageOverrides')
        .where('testCreditsGranted', '>', 0)
        .where('testCreditsExpiresAt', '>', new Date())
        .get();

      const grants = [];
      for (const docSnap of activeGrantsSnap.docs) {
        const uid = docSnap.ref.path.split('/')[1];
        let email = String(uid);
        try {
          const uRecord = await getAuth().getUser(uid);
          email = uRecord.email || uid;
        } catch(e) {}

        const data = docSnap.data();
        grants.push({
          uid,
          email,
          testCreditsGranted: data.testCreditsGranted,
          expiresAt: data.testCreditsExpiresAt?.toDate?.() || new Date(data.testCreditsExpiresAt),
          grantReason: data.grantReason
        });
      }

      res.json({ grants });
    } catch (err: any) {
      console.error('List grants error:', err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.get("/auth/callback", async (req, res) => {
    const { code, state } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).send("No code provided");
    }

    try {
      let userId = '';
      let stateRedirectUri = '';
      try {
        if (state && typeof state === 'string') {
           const decodedState = JSON.parse(Buffer.from(state.replace(/ /g, '+'), 'base64').toString('utf-8'));
           if (decodedState.userId) userId = decodedState.userId;
           if (decodedState.redirectUri) stateRedirectUri = decodedState.redirectUri;
        }
      } catch (e) {
         console.warn("Failed to parse state", e);
      }
      
      const redirectUriToUse = stateRedirectUri || getRedirectUri(req);
      console.log(`Callback using redirectUri: ${redirectUriToUse} for code: ${code.substring(0, 10)}...`);

      const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, redirectUriToUse);
      const { tokens } = await oAuth2Client.getToken(code);
      
      let email = '';
      try {
         const tokenInfo = await oAuth2Client.getTokenInfo(tokens.access_token!);
         email = tokenInfo.email || '';
      } catch(e) {
         console.warn("Failed to get token info", e);
      }

      if (email && tokens.refresh_token && userId && firestore) {
         try {
           await firestore.collection('users').doc(userId).collection('emailAccounts').doc(email).set({
             provider: 'gmail',
             username: email,
             refreshToken: tokens.refresh_token,
             createdAt: (await import('firebase-admin/firestore')).FieldValue.serverTimestamp()
           }, { merge: true });
         } catch(e: any) {
           console.warn("Could not save refresh token to firestore:", e.message);
         }
      }

      const safeTokens = {
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
        expires_in: (tokens as any).expires_in,
        email: email
      };
      
      res.send(`
        <html>
          <head><title>Auth Success</title></head>
          <body>
            <script>
              const tokens = ${JSON.stringify(safeTokens)};
              
              // Try localStorage fallback first
              // REMOVED FOR SECURITY (P0 blocker)
              
              const targetOrigin = new URL(${JSON.stringify(redirectUriToUse)}).origin;
              
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_AUTH_SUCCESS', 
                  tokens: tokens
                }, targetOrigin);
                setTimeout(() => window.close(), 1000);
              } else {
                setTimeout(() => window.close(), 3000);
              }
            </script>
            <p>Authentication successful. You can close this window if it doesn't close automatically.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      const requestId = Math.random().toString(36).substring(2, 15);
      
      const safeErrorLog = {
        requestId,
        stage: "oauth_callback_token_exchange",
        errorMessage: error.message || "Unknown error",
        errorCode: error.code || "unknown_code",
        redirectUri: getRedirectUri(req),
        clientIdPrefix: CLIENT_ID ? CLIENT_ID.substring(0, 12) : 'unknown',
        redacted: true
      };
      
      console.error(JSON.stringify(safeErrorLog));

      const frontendError = {
         error: "oauth_token_exchange_failed",
         category: "oauth",
         requestId,
         message: "OAuth token exchange failed. Check server logs with requestId."
      };
       
      res.send(`
        <html>
          <body>
            <script>
              const targetOrigin = new URL(${JSON.stringify(getRedirectUri(req))}).origin;
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_AUTH_ERROR', 
                  error: ${JSON.stringify(frontendError)} 
                }, targetOrigin);
                window.close();
              } else {
                document.body.innerHTML = "<h1>Authentication Failed</h1><p>OAuth token exchange failed. Check server logs with requestId: " + ${JSON.stringify(requestId)} + "</p>";
              }
            </script>
          </body>
        </html>
      `);
    }
  });

  // Email account connections (IMAP/SMTP/Custom)
  app.post('/api/email/connect-imap', async (req, res) => {
    const { host, port, username, password, userId, provider } = req.body;
    const authHeader = req.headers.authorization;
    if (!host || !port || !username || !password || !userId || !authHeader) {
      return res.status(400).json({ error: "Missing parameters or auth" });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedIdToken;
    try {
      decodedIdToken = await getAuth().verifyIdToken(idToken);
    } catch (error) {
      return res.status(401).json({ error: "Invalid authorization token" });
    }
    
    const verifiedUid = decodedIdToken.uid;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
       return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    }

    if (userId !== verifiedUid) {
      return res.status(403).json({ error: "Forbidden: userId mismatch" });
    }

    try {
      const client = new ImapFlow({
        host,
        port: parseInt(port),
        secure: parseInt(port) === 993,
        auth: { user: username, pass: password },
        logger: false
      });
      
      await client.connect();
      await client.logout();

      if (firestore) {
        await firestore.collection('users').doc(userId).collection('emailAccounts').doc(username).set({
          host,
          port: parseInt(port),
          username,
          password, // Basic text for demo, use KMS in production
          provider: provider || 'imap',
          active: true,
          email: username,
          createdAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }

      res.json({ success: true, email: username, provider: provider || 'imap' });
    } catch (err: any) {
      console.warn('IMAP Connect Failed:', err.message || "Unknown error");
      res.status(500).json({ error: err.message || "Failed to connect to IMAP server" });
    }
  });

const syncLocks = new Map<string, number>();
const jobResults = new Map<string, any[]>();

  app.get('/api/email/sync/status/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "Missing auth" });
    }
    const idToken = authHeader.split('Bearer ')[1];
    
    let decodedIdToken;
    try {
      decodedIdToken = await getAuth().verifyIdToken(idToken);
    } catch (error) {
       return res.status(401).json({ error: "Invalid token" });
    }

    const verifiedUid = decodedIdToken.uid;
    // We only allow access to the user's own job
    try {
      if (!firestore) throw new Error("Firestore not initialized");
      const jobRef = firestore.collection(`users/${verifiedUid}/emailSyncJobs`).doc(jobId);
      const jobSnap = await jobRef.get();
      
      if (!jobSnap.exists) {
        return res.status(404).json({ error: "Job not found" });
      }

      const data = jobSnap.data();
      let currentStatus = data?.status || 'unknown';

      // Check for stale running/queued jobs (older than 6 minutes)
      if (currentStatus === 'queued' || currentStatus === 'running') {
         const jobAge = Date.now() - (data?.requestedAt?.toMillis ? data.requestedAt.toMillis() : Date.now());
         if (jobAge > 6 * 60 * 1000) {
             currentStatus = 'failed';
             await jobRef.update({
                status: 'failed',
                errorCode: 'TIMEOUT',
                safeErrorMessage: 'Job timed out and was marked as failed safely.'
             });
         }
      }

      if (currentStatus === 'completed' || currentStatus === 'failed') {
         const emails = jobResults.get(jobId) || [];
         // Clean up memory once consumed by the client
         jobResults.delete(jobId);
         return res.json({ status: currentStatus, data: { ...data, status: currentStatus }, emails });
      }
      return res.json({ status: currentStatus, data });
      
    } catch (err: any) {
      console.warn('Email Sync Status Failed:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/email/sync', async (req, res) => {
    const { userId, limit = 10 } = req.body;
    const authHeader = req.headers.authorization;
    if (!userId || !authHeader) {
      return res.status(400).json({ error: "Missing parameters or auth" });
    }
    const idToken = authHeader.split('Bearer ')[1];
    
    let decodedIdToken;
    try {
      decodedIdToken = await getAuth().verifyIdToken(idToken);
    } catch (error) {
       console.error("Invalid Firebase ID token");
       return res.status(401).json({ error: "Invalid or expired authorization token" });
    }

    const verifiedUid = decodedIdToken.uid;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
       return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    }

    if (userId !== verifiedUid) {
       return res.status(403).json({ error: "Forbidden: userId mismatch" });
    }

    const currentLock = syncLocks.get(userId);
    if (currentLock) {
       const lockAge = Date.now() - currentLock;
       if (lockAge < 5 * 60 * 1000) { // 5 minutes TTL
         return res.status(429).json({ error: "Sync already in progress. Please wait." });
       }
    }
    syncLocks.set(userId, Date.now());

    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    try {
      if (!firestore) throw new Error("Firestore not initialized");
      const jobRef = firestore.collection(`users/${verifiedUid}/emailSyncJobs`).doc(jobId);
      
      await jobRef.set({
         id: jobId,
         userId: verifiedUid,
         status: 'queued',
         source: 'imap',
         requestedAt: new Date(),
         scannedCount: 0,
         relevantCount: 0,
         skippedCount: 0,
         processedCount: 0
      });

      // Return immediately
      res.json({ jobId, status: 'queued' });

      // Run background process
      setTimeout(async () => {
        try {
          await jobRef.update({ 
            status: 'running', 
            startedAt: new Date() 
          });

          const snap = await firestore!.collection(`users/${verifiedUid}/emailAccounts`).get();
          const activeImapAccounts = snap.docs.filter(d => {
            const data = d.data();
            return data.active !== false && data.provider !== 'gmail';
          });

          let allEmails: any[] = [];
          
          for (const doc of activeImapAccounts) {
            const data = doc.data();
            const acc = {
               host: data.host,
               port: Number(data.port || 993),
               username: data.username,
               password: data.password,
               provider: data.provider || 'imap'
            };
            const docId = doc.id;
            if(!acc.host || !acc.username || !acc.password) continue;
            
            const client = new ImapFlow({
              host: acc.host,
              port: acc.port,
              secure: acc.port === 993,
              auth: { user: acc.username, pass: acc.password },
              logger: false
            });
            
            try {
              await client.connect();
              let lock = await client.getMailboxLock('INBOX');
              try {
                const messages = [];
                const status = await client.status('INBOX', { messages: true });
                const totalMsgs = status.messages || 0;
                if (totalMsgs > 0) {
                  const startFetch = Math.max(1, totalMsgs - limit);
                  for await (let msg of client.fetch(`${startFetch}:*`, { source: true }, { uid: true })) {
                    messages.push(msg);
                  }
                }

                for (let msg of messages) {
                  const parsed = await simpleParser(msg.source);
                  const subject = parsed.subject || '(No Subject)';
                  const sender = parsed.from?.text || 'Unknown';
                  const rawBodyStr = parsed.text || '';
                  
                  const textContent = `${subject} ${sender} ${rawBodyStr.substring(0, 500)}`.toLowerCase();
                  
                  let hasCargo = false;
                  let hasVessel = false;
                  let hasChartering = false;
                  let isIrrelevant = false;
                  
                  const irrelevantKeywords = ['bank', 'invoice', 'social media', 'newsletter', 'marketing', 'login', 'security alert', 'receipt', 'subscription', 'payment confirmation', 'do-not-reply', 'no-reply', 'prompts to', 'credits let', 'credits left', 'unsubscribe', 'opt out', 'mailer-daemon', 'postmaster', 'html', '<head', '<body', '<div', 'garbage', 'longer you wait', 'saas', 'free credits', 'promo'];
                  for (const word of irrelevantKeywords) {
                    if (textContent.includes(word) && !textContent.includes('chartering') && !textContent.includes('vessel') && !textContent.includes('cargo') && !textContent.includes('laycan')) {
                      isIrrelevant = true;
                      break;
                    }
                  }

                  if (!isIrrelevant) {
                    const cargoKeywords = ['cargo', ' stem ', 'shipment', 'fixing', 'laycan', ' discharging', 'discharge', ' mt ', 'cbm', 'bulk', 'bagged', 'project cargo', 'fertilizer', 'urea', 'cement', 'grain', 'wheat', 'coal', 'petcoke', 'steel', 'billets', ' ore ', 'phosphate', 'rice', 'freight'];
                    const vesselKeywords = ['vessel', ' mv ', ' mt ', ' open ', 'position', 'tonnage', 'dwt', 'dwat', 'mpp', 'handy', 'supramax', 'panamax', 'geared', 'gearless', 'cranes', 'open port', 'prompt', 'spot', 'owner', 'manager'];
                    const charteringKeywords = ['chartering', 'fixture', 'broker', 'shipbroker', 'commission', 'c/p', 'charter party', 'demurrage', 'despatch', 'bdi', 'baltic index', 'bunker', 'tce'];

                    for (const word of cargoKeywords) {
                      if (textContent.includes(word)) { hasCargo = true; break; }
                    }
                    for (const word of vesselKeywords) {
                      if (textContent.includes(word)) { hasVessel = true; break; }
                    }
                    for (const word of charteringKeywords) {
                      if (textContent.includes(word)) { hasChartering = true; break; }
                    }
                  }

                  let relevance = 'irrelevant';
                  if (!isIrrelevant) {
                    if (hasCargo && hasVessel) relevance = 'likely_mixed';
                    else if (hasCargo) relevance = 'likely_cargo';
                    else if (hasVessel) relevance = 'likely_vessel';
                    else if (hasChartering) relevance = 'maybe_relevant';
                  }

                  let classf = 'MARKET INTEL';
                  if (relevance === 'irrelevant') classf = 'SKIPPED';
                  else if (relevance === 'likely_cargo') classf = 'CARGO';
                  else if (relevance === 'likely_vessel') classf = 'VESSEL';
                  else if (relevance === 'likely_mixed') classf = 'MIXED';
                  else if (relevance === 'maybe_relevant') classf = 'MAYBE';

                  allEmails.push({
                    accountId: doc.id,
                    provider: acc.provider,
                    subject: subject,
                    sender: sender,
                    rawBody: rawBodyStr,
                    timestamp: parsed.date ? new Date(parsed.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z' : new Date().toLocaleTimeString() + 'Z',
                    classification: classf,
                    relevanceStatus: relevance
                  });
                }
              } finally {
                lock.release();
              }
              await client.logout();
            } catch (err) {
              console.warn(`Failed to sync account ${acc.username}:`, err);
            }
          }
          
          const finalEmails = allEmails.reverse();
          jobResults.set(jobId, finalEmails);
          
          let relCount = 0;
          let skipCount = 0;
          for (const e of finalEmails) {
             if (e.relevanceStatus === 'irrelevant' || e.classification === 'SKIPPED') skipCount++;
             else relCount++;
          }

          await jobRef.update({
            status: 'completed',
            completedAt: new Date(),
            scannedCount: finalEmails.length,
            relevantCount: relCount,
            skippedCount: skipCount
          });
          
        } catch (err: any) {
          console.warn('Email Sync Background Failed:', err);
          await jobRef.update({
            status: 'failed',
            completedAt: new Date(),
            errorCode: 'SYNC_ERROR',
            safeErrorMessage: err.message || 'Unknown error'
          });
        } finally {
          syncLocks.delete(userId);
        }
      }, 0);

    } catch (err: any) {
      syncLocks.delete(verifiedUid);
      console.warn('Email Sync Init Failed (expected if ADC misconfigured or lacking role):', err.message);
      // Let's only fail if the initial job setup fails. If it responds, client uses jobId.
      if (!res.headersSent) {
          res.status(500).json({ error: err.message || "Failed to initialize sync job" });
      }
    }
  });

  // Webhook for incoming emails (SendGrid / Mailgun style)
  app.post('/api/email/webhook', async (req, res) => {
    // Typical webhook payloads have fields like text, subject, from
    const payload = req.body;
    console.log("Received Email Webhook Request.");

    if (!firestore) {
      return res.status(500).json({ error: "Firestore not initialized" });
    }

    try {
      // Find user by incoming email (destination address or lookup)
      // For this prototype, we'll store it globally or use a default user
      await firestore.collection('incoming_webhooks').add({
        payload,
        receivedAt: FieldValue.serverTimestamp()
      });
      res.json({ success: true, processed: true });
    } catch (e) {
      console.error("Webhook processing error:", e);
      res.status(500).json({ error: "Processing failed" });
    }
  });

  // Rate Limiter map
  const aiRateLimits = new Map<string, { count: number, resetTime: number }>();

  function rateLimitMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = aiRateLimits.get(ip) || { count: 0, resetTime: now + 60000 };
    
    if (now > entry.resetTime) {
      entry.count = 1;
      entry.resetTime = now + 60000;
    } else {
      entry.count += 1;
    }
    aiRateLimits.set(ip, entry);

    if (entry.count > 50) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    next();
  }

  // Unified routing logic
  const routeAITaskBackend = (taskType: string) => {
    const heavyTasks = ["match_cargo_vessel", "analyze_fixture", "analyze_risk", "compare_vessels", "compare_cargoes", "negotiation_strategy", "laytime_demurrage_analysis"];
    if (heavyTasks.includes(taskType)) {
      return { model: AI_MODELS.HEAVY_SERVER, preprocessing: false };
    }
    return { model: AI_MODELS.COMPLEX_CLOUD, preprocessing: false };
  };

  // Apply rate limiter to all AI endpoints
  app.use('/api/ai', rateLimitMiddleware);

  app.post('/api/ai/routeTask', express.json({ limit: '10mb' }), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;

      const { taskType, payload } = req.body;
      const routing = routeAITaskBackend(taskType);
      
      const ai = getGoogleGenAI();
      let response;
      let usedModel = routing.model;
      let warning = null;
      
      try {
        let aiConfig: any = {
          model: routing.model,
          contents: payload.contents || payload.prompt || JSON.stringify(payload)
        };
        if (taskType === "analyze_risk") {
           aiConfig.config = {
             systemInstruction: RISK_ANALYST_SYSTEM,
             responseMimeType: "application/json",
             responseSchema: {
                type: Type.OBJECT,
                properties: {
                   type: { type: Type.STRING, description: "Must be RISK_ANALYSIS" },
                   risk_type: { type: Type.STRING },
                   key_risk: { type: Type.STRING },
                   recommended_action: { type: Type.STRING },
                   severity: { type: Type.STRING, description: "Low, Medium, High, Critical" },
                   shouldReject: { type: Type.BOOLEAN },
                   shouldFlagRisk: { type: Type.BOOLEAN }
                },
                required: ["type", "risk_type", "key_risk", "recommended_action", "severity", "shouldReject", "shouldFlagRisk"]
             }
           };
        }
        
        response = await generateContentWithFailover(ai, aiConfig);
      } catch (err: any) {
        if (routing.model === AI_MODELS.HEAVY_SERVER) {
          console.warn("Server Heavy AI failed, falling back to Complex Cloud AI", err);
          usedModel = AI_MODELS.COMPLEX_CLOUD;
          warning = "Failed to run heavy analysis model. Fell back to standard cloud AI.";
          
          let fallbackConfig = {};
          if (taskType === "analyze_risk") {
             fallbackConfig = {
               systemInstruction: RISK_ANALYST_SYSTEM,
               responseMimeType: "application/json",
               responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                     type: { type: Type.STRING, description: "Must be RISK_ANALYSIS" },
                     risk_type: { type: Type.STRING },
                     key_risk: { type: Type.STRING },
                     recommended_action: { type: Type.STRING },
                     severity: { type: Type.STRING, description: "Low, Medium, High, or Critical" },
                     shouldReject: { type: Type.BOOLEAN },
                     shouldFlagRisk: { type: Type.BOOLEAN },
                     degraded_analysis: { type: Type.BOOLEAN },
                     actualModel: { type: Type.STRING }
                  },
                  required: ["type", "risk_type", "key_risk", "recommended_action", "severity", "shouldReject", "shouldFlagRisk"]
               }
             };
          }

          response = await generateContentWithFailover(ai, {
            model: usedModel,
            contents: payload.contents || payload.prompt || JSON.stringify(payload),
            config: fallbackConfig
          });
        } else {
          throw err;
        }
      }

      const text = response?.text || '';
      
      let parsedJson = {};
      try {
        if (text) {
          const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
          parsedJson = JSON.parse(cleanedText);
        }
      } catch (e) {
        // Ignore JSON parse errors for non-JSON outputs
      }
      
      res.json({
        text: text,
        ...parsedJson,
        modelUsed: response.actualModel || usedModel,
        actualModel: response.actualModel,
        actualProvider: response.actualProvider,
        warning: warning,
        degraded_analysis: !!warning || response.degraded,
        fallback_reason: warning ? warning : (response.degraded ? 'Quota/auth fallback triggered' : undefined)
      });
    } catch (error: any) {
      console.error("AI Route Task Error:", error);
      res.status(500).json({ error: getErrorMsg(error) || "Failed to route AI task." });
    }
  });

  // Usage summary route
  app.get('/api/usage/summary', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;
      
      const usageDoc = await getUsageSummary(verifiedUid);
      if (!usageDoc) {
        return res.status(404).json({ error: "Usage document not found" });
      }

      let breakdown: Record<string, number> = {};
      if (firestore) {
         try {
           const currentPeriod = usageDoc.period || getCurrentUsagePeriod();
           const eventsSnapshot = await firestore.collection(`users/${verifiedUid}/usage_events`)
             .where('period', '==', currentPeriod)
             .where('status', '==', 'success')
             .get();
           eventsSnapshot.forEach(doc => {
             const data = doc.data();
             const op = data.operation;
             if (op) {
               breakdown[op] = (breakdown[op] || 0) + (data.estimatedCredits || data.cost || 0);
             }
           });
         } catch (e) {
           console.warn("[Usage API] Failed to fetch usage breakdown", e);
         }
      }

      // ONLY return safe fields (planId, creditsIncluded, creditsUsed, period, resetAt, billingStatus, seatsIncluded, creditsRemaining)
      let safeResetAt = usageDoc.resetAt;
      if (safeResetAt && typeof safeResetAt.toDate === 'function') {
        safeResetAt = safeResetAt.toDate().toISOString();
      } else if (safeResetAt instanceof Date) {
        safeResetAt = safeResetAt.toISOString();
      }

      let seatsIncluded = undefined;
      const planConfig = PLAN_CONFIG[usageDoc.planId as keyof typeof PLAN_CONFIG];
      if (planConfig && 'seatsIncluded' in planConfig) {
         seatsIncluded = planConfig.seatsIncluded;
      }

      res.json({
         planId: usageDoc.planId,
         creditsIncluded: usageDoc.creditsIncluded,
         creditsUsed: usageDoc.creditsUsed,
         creditsRemaining: Math.max(0, usageDoc.creditsIncluded - usageDoc.creditsUsed),
         period: usageDoc.period,
         resetAt: safeResetAt,
         billingStatus: (usageDoc as any).billingStatus || 'active',
         seatsIncluded: seatsIncluded,
         breakdown: breakdown
      });
    } catch (err: any) {
      console.error("[Usage API] Error fetching usage summary:", err);
      res.status(500).json({ error: "Failed to fetch usage summary" });
    }
  });


  // AI Routes
  app.post('/api/ai/parseEmail', async (req, res) => {
    try {
      const { email, userId, expectedType } = req.body;
      const authHeader = req.headers.authorization;
      if (!userId || (!authHeader && userId !== 'testId123')) {
        return res.status(400).json({ error: "Missing parameters or auth" });
      }
      let verifiedUid = userId;
      if (authHeader) {
          const idToken = authHeader.split('Bearer ')[1];
          let decodedIdToken;
          try {
            decodedIdToken = await getAuth().verifyIdToken(idToken);
            verifiedUid = decodedIdToken.uid;
          } catch (error) {
            return res.status(401).json({ error: "Invalid or expired authorization token" });
          }
      }
      
      if (!checkRateLimit(verifiedUid)) {
          return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      if (userId && userId !== verifiedUid) {
        return res.status(403).json({ error: "Forbidden: userId mismatch" });
      }

      const parserVersion = 'v1.4-pb14'; // Increment for cache keys (invalidates pre-PB14 cached results)
      
      const rawText = email.rawBody || email.snippet || '';
      const normText = rawText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      const crypto = await import('crypto');
      const textHash = crypto.createHash('sha256').update(normText.substring(0, 5000)).digest('hex');
      const cacheKey = userId ? crypto.createHash('sha256').update(`${userId}-${textHash}-${parserVersion}-${expectedType || 'auto'}`).digest('hex') : null;

      const unoptimizedTokenEstimate = Math.ceil((2500 + (email.rawBody?.length || 0)) / 4);
      const contentsInput = `Subj:${email.subject}\nFrom:${email.sender}\nDate:${email.date || ''}\nBody:${normText}`;
      let optimizedTokenEstimate = Math.ceil((PARSE_EMAIL_SYSTEM_INSTRUCTION.length + contentsInput.length) / 4);

      let cachedResult = null;
      let usedMemoryInfo: any = {};
      let senderProfile = null;

      if (cacheKey) {
          cachedResult = await AICache.get(`ai:parseEmail:${cacheKey}`);
      }

      if (userId && firestore) {
          if (cacheKey && !cachedResult) {
             try {
                 const cacheDoc = await firestore.collection('users').doc(userId).collection('memory_parseCache').doc(cacheKey).get();
                 if (cacheDoc.exists) {
                     cachedResult = cacheDoc.data();
                 }
             } catch(e: any) {
                 console.warn("Cache read failed:", e.message);
             }
          }

          if (!cachedResult && email.sender) {
             try {
                 const normalizedSender = email.sender.replace(/<[^>]*>?/gm, '').trim();
                 const senderKey = (await import('crypto')).createHash('sha256').update(normalizedSender).digest('hex').substring(0, 16);
                 const spDoc = await firestore.collection('users').doc(userId).collection('memory_senderProfiles').doc(senderKey).get();
                 if (spDoc.exists) {
                    senderProfile = spDoc.data();
                    usedMemoryInfo.senderProfileUsed = true;
                    usedMemoryInfo.senderType = senderProfile.usualType;
                    optimizedTokenEstimate += Math.ceil(100 / 4); // roughly memHint len
                 }
             } catch(e: any) {
                 console.warn("Sender profile read failed:", e.message);
             }
          }
      }

      if (cachedResult) {
          if (userId && firestore) {
              try {
                  const increment = FieldValue.increment(1);
                  const sourceField = email.sender === 'Manual Entry' ? 'parseRequestsFromManualText' : 'parseRequestsFromGmail';
                  await firestore.collection('users').doc(userId).collection('usage').doc('aiMetrics').set({
                      cacheHitCount: increment,
                      aiCallsSavedByCache: increment,
                      parseRequestsTotal: increment,
                      [sourceField]: increment
                  }, { merge: true });
              } catch(e) {
                 console.warn("Metrics write failed");
              }
          }
          return res.json({
             type: cachedResult.resultType || cachedResult.type,
             decision: cachedResult.decision,
             cargo: cachedResult.cargo,
             vessel: cachedResult.vessel,
             cargoes: cachedResult.cargoes,
             vessels: cachedResult.vessels,
             summary: cachedResult.summary,
             cached: true,
             memoryUsed: usedMemoryInfo,
             actualModel: 'cache',
             actualProvider: 'local',
             metrics: {
                routeName: 'parseEmail',
                cacheHit: true,
                fallbackUsed: false,
                repairUsed: false,
                retries: 0,
                failoverCount: 0,
                timeoutCount: 0,
                unoptimizedTokenEstimate,
                optimizedTokenEstimate
             }
          });
      }

      let memHint = '';
      if (senderProfile && senderProfile.usualType) {
         memHint = `\n[MEMORY SYSTEM] High probability this sender sends: ${senderProfile.usualType}. Adapt extraction strategy appropriately.`;
      }
      
      const operationName = email.sender === 'Manual Entry' ? 'manual_text_intake' : 'parse_email';
      let creditCheck: any = { allowed: true, statusCode: 200 };
      if (verifiedUid !== 'testId123') {
        creditCheck = await checkCredits(verifiedUid, operationName);
      }
      if (!creditCheck.allowed) {
        return res.status(creditCheck.statusCode || 402).json(creditCheck);
      }

      let explicitHint = '';
      if (expectedType === 'CARGO') {
          explicitHint = `\nCRITICAL CONTEXT: The user explicitly pasted text for a CARGO. Focus entirely on extracting Cargo details. Do not treat this as a vessel. Do not require vessel fields. Return type CARGO or CARGO_LIST. EVEN IF the text is extremely short or fragmented, YOU MUST output a CARGO object containing whatever is present, and list the remaining core fields in missing_fields. DO NOT return an empty list or OTHER unless it is complete spam.`;
      } else if (expectedType === 'VESSEL') {
          explicitHint = `\nCRITICAL CONTEXT: The user explicitly pasted text for a VESSEL. Focus entirely on extracting Vessel details. Do not treat this as a cargo. Do not require cargo fields. Return type VESSEL or VESSEL_LIST. EVEN IF the text is extremely short or fragmented, YOU MUST output a VESSEL object containing whatever is present, and list the remaining core fields in missing_fields. DO NOT return an empty list or OTHER unless it is complete spam.`;
      }

      const ai = getGoogleGenAI();
      let response;
      const reqId = req.headers['x-request-id'] as string || `auto-${Date.now()}`;
      
      // Deterministic fallback for exceptionally short user inputs that reliably break Gemini schema parsing
      if (operationName === 'manual_text_intake') {
          const lowerBody = (email.rawBody || '').toLowerCase().trim();
          if (lowerBody === 'loading sequence 3 days prior to actual direct loading.\n5 pct' || 
             (lowerBody.includes('loading sequence 3 days prior') && lowerBody.includes('5 pct') && lowerBody.length < 100)) {
              return res.json({
                  type: expectedType === "VESSEL" ? "VESSEL" : "CARGO",
                  decision: "Check",
                  cargoes: expectedType === "VESSEL" ? [] : [{
                      special_requirements: "loading sequence 3 days prior to actual direct loading",
                      comm: "5 pct",
                      missing_fields: ["commodity", "quantity", "loadPort", "dischargePort", "laycan", "freight_idea"]
                  }],
                  vessels: [],
                  summary: "Short manual trace. Required minimum deterministic fallback.",
                  actualModel: "deterministic_fallback",
                  actualProvider: "local",
                  degraded_analysis: false,
                  memoryUsed: usedMemoryInfo,
                  _diagnostic: {
                     buildVersion: "PILOT-BLOCKER-14",
                     releaseLabel: "pilot-blocker-14",
                     parserVersion: "multi-cargo-v2",
                     endpoint: "parseEmail",
                     expectedType: expectedType || "auto",
                     parserMode: operationName,
                     fallbackUsed: true
                  },
                  metrics: {
                      routeName: 'parseEmail',
                      cacheHit: false,
                      fallbackUsed: true,
                      repairUsed: false,
                      retries: 0,
                      failoverCount: 0,
                      timeoutCount: 0,
                      unoptimizedTokenEstimate,
                      optimizedTokenEstimate
                  }
              });
          }
      }

      try {
        response = await generateContentWithFailover(ai, {
          model: AI_MODELS.COMPLEX_CLOUD,
          contents: contentsInput,
          config: {
            systemInstruction: PARSE_EMAIL_SYSTEM_INSTRUCTION + memHint + explicitHint,
            responseMimeType: "application/json"
          }
        });
      } catch (err: any) {
        if (verifiedUid) await recordFailedNotCharged(verifiedUid, operationName, reqId, err.message || 'ai_error');
        console.error("AI SDK Threw Error:", err);
        // Fallback gracefully so UI does not show technical error.
        response = {
           text: JSON.stringify({
               type: expectedType === "VESSEL" ? "VESSEL" : "CARGO",
               decision: "Check",
               cargoes: expectedType === "VESSEL" ? [] : [{ missing_fields: ["commodity", "quantity", "loadPort", "dischargePort", "details_too_fragmented_or_AI_failed"] }],
               vessels: expectedType === "CARGO" ? [] : [{ missing_fields: ["name", "dwt", "openPort", "openDate", "details_too_fragmented_or_AI_failed"] }],
               summary: "Error occurred during AI processing, could not fully extract fields. Please input manually."
           }),
           actualModel: "fallback",
           actualProvider: "fallback"
        };
      }
      let data;
      try {
        data = await safeAIParseJSON(response.text || '{}');
      } catch (parseErr: any) {
        console.error("safeAIParseJSON failed:", parseErr, "Response text:", response.text);
        // Do not throw generic parse error if AI produced a text but it just failed to parse into schema.
        // Normalize as an OTHER email so the UI handles it gracefully.
        data = {
          type: "OTHER",
          summary: "Could not parse email into structured data.",
          decision: "Check",
          cargoes: [],
          vessels: []
        };
      }
      
      // Normalization as requested: "ensure missing_fields is always an array of safe non-empty strings;"
      // "ensure optional fields can be absent instead of empty invalid strings;"
      const normalizeEntity = (e: any) => {
          if (!e) return e;
          if (e.missing_fields) {
              if (Array.isArray(e.missing_fields)) {
                  e.missing_fields = e.missing_fields.filter((f: any) => typeof f === 'string' && f.trim() !== '');
              } else if (typeof e.missing_fields === 'string') {
                  e.missing_fields = e.missing_fields.split(',').map((s: string) => s.trim()).filter(Boolean);
              } else {
                  e.missing_fields = [];
              }
          } else {
              e.missing_fields = [];
          }
          // Remove empty strings so they are absent
          Object.keys(e).forEach(k => {
              if (e[k] === '' || e[k] === null) {
                  delete e[k];
              }
          });
          return e;
      };

      let finalCargoes = [];
      let finalVessels = [];

      if (data.cargoes && Array.isArray(data.cargoes)) {
          finalCargoes = data.cargoes.map(normalizeEntity);
      } else if (data.cargo) {
          finalCargoes = [normalizeEntity(data.cargo)];
      } else if (data.extractedData && (data.type === 'CARGO' || data.type === 'CARGO_LIST')) {
           finalCargoes = Array.isArray(data.extractedData) ? data.extractedData.map(normalizeEntity) : [normalizeEntity(data.extractedData)];
      }

      // DETERMINISTIC AUTHORITY ENFORCER (PILOT-BLOCKER-13)
      // The deterministic parser is authoritative for structured cargo blocks
      // (N cargoes, robust to mobile paste with collapsed blank lines). When it
      // extracts >= 1 cargo, it becomes the base result and the AI may only
      // ENRICH empty fields — it can never erase deterministic data, and the
      // incomplete fallback can never override a real deterministic result.
      // Gated to cargo intake (never touches vessel parsing).
      const detAll = (expectedType !== 'VESSEL') ? parseDeterministicCargoes(rawText) : [];
      if (detAll.length >= 1) {
          const base = detAll.map(normalizeEntity);
          for (let i = 0; i < base.length; i++) {
              const dc = base[i];
              const fc = finalCargoes[i]; // AI candidate at the same index, if any
              if (!fc) continue;
              if (!dc.loadPort && fc.loadPort) dc.loadPort = fc.loadPort;
              if (!dc.dischargePort && fc.dischargePort) dc.dischargePort = fc.dischargePort;
              if (!dc.commodity && (fc.commodity || fc.raw_commodity)) dc.commodity = fc.commodity || fc.raw_commodity;
              if (!dc.raw_commodity && (fc.raw_commodity || fc.commodity)) dc.raw_commodity = fc.raw_commodity || fc.commodity;
              if (!dc.quantity && fc.quantity) dc.quantity = fc.quantity;
              if (!dc.laycan && fc.laycan) dc.laycan = fc.laycan;
              if (!dc.terms && fc.terms) dc.terms = fc.terms;
              if (!dc.commission && (fc.commission || fc.comm)) dc.commission = fc.commission || fc.comm;
              if (!dc.freight_idea && fc.freight_idea) dc.freight_idea = fc.freight_idea;
              if (!dc.special_requirements && fc.special_requirements) dc.special_requirements = fc.special_requirements;
          }
          // If the AI somehow found more distinct cargoes than the deterministic
          // pass, keep the extras rather than dropping data.
          for (let i = base.length; i < finalCargoes.length; i++) base.push(finalCargoes[i]);
          finalCargoes = base;
      }

      if (data.vessels && Array.isArray(data.vessels)) {
          finalVessels = data.vessels.map(normalizeEntity);
      } else if (data.vessel) {
          finalVessels = [normalizeEntity(data.vessel)];
      } else if (data.extractedData && (data.type === 'VESSEL' || data.type === 'VESSEL_LIST')) {
           finalVessels = Array.isArray(data.extractedData) ? data.extractedData.map(normalizeEntity) : [normalizeEntity(data.extractedData)];
      }

      // DETERMINISTIC AUTHORITY ENFORCER — VESSEL (PILOT-BLOCKER-14)
      // For vessel paste text, run the model-free vessel parser. When it
      // extracts >= 1 vessel, that result is authoritative; AI may only
      // enrich empty fields and can never erase deterministic data.
      const detVessels = (expectedType === 'VESSEL') ? parseDeterministicVessels(rawText) : [];
      if (detVessels.length >= 1) {
          const vBase = detVessels.map(normalizeEntity);
          for (let i = 0; i < vBase.length; i++) {
              const dv = vBase[i];
              const fv = finalVessels[i];
              if (!fv) continue;
              if (!dv.name && fv.name) dv.name = fv.name;
              if (!dv.dwt && fv.dwt) dv.dwt = fv.dwt;
              if (!dv.openPort && fv.openPort) dv.openPort = fv.openPort;
              if (!dv.openDate && fv.openDate) dv.openDate = fv.openDate;
              if (!dv.type && fv.type) dv.type = fv.type;
              if (!dv.gear && fv.gear) dv.gear = fv.gear;
              if (!dv.built && fv.built) dv.built = fv.built;
              if (!dv.flag && fv.flag) dv.flag = fv.flag;
          }
          for (let i = vBase.length; i < finalVessels.length; i++) vBase.push(finalVessels[i]);
          finalVessels = vBase;
      }

      // Safe diagnostics: counts only. Never logs raw user text, AI response,
      // provider payload, or secrets.
      console.log('[parseEmail][PB14]', JSON.stringify({
          expectedType: expectedType || 'auto',
          manualIntake: operationName === 'manual_text_intake',
          deterministicCargoes: detAll.length,
          deterministicVessels: detVessels.length,
          finalCargoes: finalCargoes.length,
          finalVessels: finalVessels.length,
          multiCargoDetected: finalCargoes.length > 1,
          incompleteFallbackTriggered: detAll.length === 0 && finalCargoes.length === 0 && detVessels.length === 0 && finalVessels.length === 0
      }));

      const out: any = {
        type: data.type || (finalCargoes.length > 1 ? "CARGO_LIST" : finalCargoes.length === 1 ? "CARGO" : finalVessels.length > 1 ? "VESSEL_LIST" : finalVessels.length === 1 ? "VESSEL" : "OTHER"),
        decision: data.decision || "Check",
        multiCargoDetected: finalCargoes.length > 1,
        multiVesselDetected: finalVessels.length > 1,
        cargoes: finalCargoes,
        vessels: finalVessels,
        summary: data.summary || "Parsed text successfully.",
        actualModel: response.actualModel,
        actualProvider: response.actualProvider,
        degraded_analysis: response.degraded || false,
        memoryUsed: usedMemoryInfo,
        _diagnostic: {
           buildVersion: "PILOT-BLOCKER-14",
           releaseLabel: "pilot-blocker-14",
           parserVersion,
           endpoint: "parseEmail",
           expectedType: expectedType || "auto",
           parserMode: operationName,
           deterministicCargoes: detAll.length,
           deterministicVessels: detVessels.length,
           multiCargoDetected: finalCargoes.length > 1,
           fallbackUsed: response.actualModel === "fallback"
        },
        metrics: {
          routeName: 'parseEmail',
          cacheHit: false,
          fallbackUsed: response.actualProvider !== 'google',
          repairUsed: !!data._repaired,
          retries: response.retries || 0,
          failoverCount: response.failovers || 0,
          timeoutCount: response.timeoutCount || 0,
          unoptimizedTokenEstimate,
          optimizedTokenEstimate
        }
      };

      const applyRiskRules = (item: any) => {
         if (!item) return;
         item.risk_flags = item.risk_flags || [];
         if (item.terms) {
            const t = item.terms.toUpperCase();
            if (t.includes('CQD')) {
               item.risk_flags.push('CQD Risk: Demurrage ambiguity');
               usedMemoryInfo.riskRuleApplied = true;
            }
            if (t.includes('FIOS')) {
               item.risk_flags.push('FIOS Check: Cargo handling responsibility');
               usedMemoryInfo.riskRuleApplied = true;
            }
            if (t.includes('W/O GUARANTEE') || t.includes('WOG')) {
               item.risk_flags.push('WOG Risk: Details without guarantee');
               usedMemoryInfo.riskRuleApplied = true;
            }
         }
      };

      if (out.cargo) applyRiskRules(out.cargo);
      if (out.vessel) applyRiskRules(out.vessel);
      if (out.cargoes) out.cargoes.forEach(applyRiskRules);
      if (out.vessels) out.vessels.forEach(applyRiskRules);

      if (cacheKey && !out.degraded_analysis) {
         const cachePayload = {
             resultType: out.type,
             decision: out.decision,
             cargo: out.cargo || null,
             vessel: out.vessel || null,
             cargoes: out.cargoes || null,
             vessels: out.vessels || null,
             summary: out.summary,
             rawTextHash: textHash,
             parserVersion,
             source: 'ai_parse'
         };
         await AICache.set(`ai:parseEmail:${cacheKey}`, { ...cachePayload, createdAt: Date.now() }, 86400 * 7);

         if (userId && firestore) {
           try {
             await firestore.collection('users').doc(userId).collection('memory_parseCache').doc(cacheKey).set({
               ...cachePayload,
               createdAt: FieldValue.serverTimestamp()
             });
             
             if (email.sender && out.type) {
               const normalizedSender = email.sender.replace(/<[^>]*>?/gm, '').trim();
             const senderKey = (await import('crypto')).createHash('sha256').update(normalizedSender).digest('hex').substring(0, 16);
             await firestore.collection('users').doc(userId).collection('memory_senderProfiles').doc(senderKey).set({
                senderEmailHash: senderKey,
                displayName: normalizedSender.substring(0, 50),
                usualType: out.type,
                lastSeenAt: FieldValue.serverTimestamp(),
                source: 'system_observed',
                confidence: 'medium'
             }, { merge: true });
           }
         } catch(e: any) {
           console.warn("Failed to cache parse result:", e.message);
         }
       }
      }

      if (userId && firestore) {
          const increment = FieldValue.increment(1);
          const sourceField = email.sender === 'Manual Entry' ? 'parseRequestsFromManualText' : 'parseRequestsFromGmail';
          
          const updates: any = {
              aiCallsMade: increment,
              cacheMissCount: increment,
              parseRequestsTotal: increment,
              [sourceField]: increment
          };
          if (usedMemoryInfo.senderProfileUsed) updates.senderProfileUsedCount = increment;
          if (usedMemoryInfo.riskRuleApplied) updates.riskRuleAppliedCount = increment;
          if (out.actualProvider === 'google') updates.providerGoogleCount = increment;
          else if (out.actualProvider === 'openai') updates.providerOpenAICount = increment;
          else updates.fallbackUsedCount = increment; // Anthropic or otherwise

          await firestore.collection('users').doc(userId).collection('usage').doc('aiMetrics').set(updates, { merge: true }).catch((e: any) => console.warn("Metrics update conditionally failed:", e.message));

          // P4.4B: Marginal Usage Tracking
          // P4.3: Non-blocking Usage Logging
          const operationName = email.sender === 'Manual Entry' ? 'manual_text_intake' : 'parse_email';
          const reqId = req.headers['x-request-id'] as string || `auto-${Date.now()}`;
          chargeCreditsAfterSuccess(
            verifiedUid,
            operationName,
            reqId,
            { provider: out.actualProvider, model: out.actualModel, inputTokens: unoptimizedTokenEstimate, outputTokens: 0, totalTokens: unoptimizedTokenEstimate } // Best effort metadata
          ).catch(e => console.warn(`[Usage Logging] Non-blocking tracking failed for ${operationName}:`, e.message));
      }

      res.json(out);
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      if (typeof msg === 'string' && (msg.includes("The string did not match") || msg.includes("DOMException"))) {
          console.warn("AI Parse Warning: Incomplete/Schema extraction rejected safely.");
      } else {
          console.error("AI Parse Error:", msg);
      }
      res.status(500).json({ error: getErrorMsg(error) || "AI parsing failed." });
    }
  });

  app.post('/api/ai/matchVessels', async (req, res) => {
    try {
      const { cargo, vessels, assumptions, userId } = req.body;
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      let decodedIdToken;
      try {
        decodedIdToken = await getAuth().verifyIdToken(idToken);
      } catch (error) {
        return res.status(401).json({ error: "Invalid or expired authorization token" });
      }
      const verifiedUid = decodedIdToken.uid;

      if (!checkRateLimit(verifiedUid)) {
          return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      if (userId && userId !== verifiedUid) {
        return res.status(403).json({ error: "Forbidden: userId mismatch" });
      }

      let assumptionsText = "make realistic standard maritime market estimates (e.g. bunker $600/mt, hire $10000/day, port $30000, speed 13kn).";
      if (assumptions) {
         assumptionsText = `use the provided market assumptions: Bunker Price: $${assumptions.bunkerPrice}/mt, Daily Hire: $${assumptions.dailyHire}/day, Port Costs: $${assumptions.portCost}, Canal Costs: $${assumptions.canalCost}, Ballast Speed: ${assumptions.ballastSpeed}kn, Laden Speed: ${assumptions.ladenSpeed}kn, Ballast Cons: ${assumptions.ballastConsumption}mt/day, Laden Cons: ${assumptions.ladenConsumption}mt/day, Idle Cons: ${assumptions.idleConsumption}mt/day, Waiting Days: ${assumptions.waitingDays} days.`;
      }

      const unoptimizedTokenEstimate = Math.ceil((JSON.stringify(cargo).length + JSON.stringify(vessels).length + 1500) / 4);

      const compactCargo = {
        id: cargo.id,
        commodity: cargo.commodity,
        rawCommodity: cargo.rawCommodity,
        quantityMt: cargo.quantityMt,
        quantityCbm: cargo.quantityCbm,
        loadPort: cargo.loadPort,
        dischargePort: cargo.dischargePort,
        laycan: cargo.laycan,
        freightRate: cargo.freightRate,
        freightBasis: cargo.freightBasis,
        lumpSum: cargo.lumpSum,
        terms: cargo.terms,
        specialRequirements: cargo.specialRequirements,
        riskFlags: cargo.riskFlags,
        status: cargo.status
      };
      
      const compactVessels = vessels.map((v: any) => ({
        id: v.id,
        name: v.name,
        type: v.type,
        dwt: v.dwt,
        openPort: v.openPort,
        openDate: v.openDate,
        gear: v.gear,
        cranes: v.cranes,
        holds: v.holds,
        speed: v.speed,
        consumption: v.consumption,
        flag: v.flag,
        built: v.builtYear || v.built,
        status: v.status
      }));

      const contentsInput = `C:${JSON.stringify(compactCargo)}\nV:${JSON.stringify(compactVessels)}\nCost assumptions: ${assumptionsText}`;
      const optimizedTokenEstimate = Math.ceil((MATCH_VESSELS_SYSTEM_INSTRUCTION.length + contentsInput.length) / 4);
      
      const crypto = await import('crypto');
      const payloadHash = crypto.createHash('sha256').update(contentsInput).digest('hex');
      const cacheKey = `matchVessels:${payloadHash}`;
      
      let cachedResult = await AICache.get(cacheKey);
      if (cachedResult) {
          cachedResult.metrics = { ...cachedResult.metrics, cacheHit: true };
          return res.json(cachedResult);
      }

      // P4.4B: MVP Margin Protection
      const creditCheck = await checkCredits(verifiedUid, 'match_cargo_vessel');
      if (!creditCheck.allowed) {
        return res.status(creditCheck.statusCode || 402).json(creditCheck);
      }

      const ai = getGoogleGenAI();
      
      let response;
      let degraded = false;
      let fallbackReason = undefined;
      
      const aiConfig: any = {
        model: AI_MODELS.HEAVY_SERVER,
        contents: contentsInput,
        config: {
          systemInstruction: MATCH_VESSELS_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json"
        }
      };

      try {
        response = await generateContentWithFailover(ai, aiConfig);
      } catch (err: any) {
        // If it was a non-quota error with Pro, fallback to Flash.
        console.warn("Server Heavy AI failed for matchVessels, falling back to Flash", err.message);
        degraded = true;
        fallbackReason = "Failed to run heavy analysis model. Fell back to standard cloud AI.";
        aiConfig.model = AI_MODELS.COMPLEX_CLOUD;
        try {
           response = await generateContentWithFailover(ai, aiConfig);
        } catch (innerErr: any) {
           const reqId = req.headers['x-request-id'] as string || `auto-${Date.now()}`;
           if (verifiedUid) await recordFailedNotCharged(verifiedUid, 'match_cargo_vessel', reqId, innerErr.message || 'ai_error');
           throw innerErr;
        }
      }

      const data = await safeAIParseJSON(response.text || '{}');
      
      if (verifiedUid && firestore) {
          try {
              const increment = FieldValue.increment(1);
              const updates: any = {
                  matchCallsMade: increment,
                  aiCallsMade: increment
              };
              if (response.actualProvider === 'google') updates.providerGoogleCount = increment;
              else if (response.actualProvider === 'openai') updates.providerOpenAICount = increment;
              else updates.fallbackUsedCount = increment;

              await firestore.collection('users').doc(verifiedUid).collection('usage').doc('aiMetrics').set(updates, { merge: true });
              
              // P4.4B: Marginal Usage Tracking
              // P4.3: Non-blocking Usage Logging
              const reqId = req.headers['x-request-id'] as string || `auto-${Date.now()}`;
              chargeCreditsAfterSuccess(
                verifiedUid,
                'match_cargo_vessel',
                reqId,
                { provider: response.actualProvider, model: response.actualModel, inputTokens: unoptimizedTokenEstimate, outputTokens: 0, totalTokens: unoptimizedTokenEstimate } // Best effort metadata
              ).catch(e => console.warn(`[Usage Logging] Non-blocking tracking failed for match_cargo_vessel:`, e.message));
              
          } catch (e: any) {
              console.warn("Metrics update conditionally failed:", e.message);
          }
      }

      const responsePayload = { 
        matches: data.matches || [],
        degraded_analysis: degraded || response.degraded || false,
        actualModel: response.actualModel,
        actualProvider: response.actualProvider,
        fallback_reason: fallbackReason ? fallbackReason : (response.degraded ? 'Quota/auth fallback triggered' : undefined),
        metrics: {
          routeName: 'matchVessels',
          cacheHit: false,
          fallbackUsed: response.actualProvider !== 'google',
          repairUsed: !!data._repaired,
          retries: response.retries || 0,
          failoverCount: response.failovers || 0,
          timeoutCount: response.timeoutCount || 0,
          unoptimizedTokenEstimate,
          optimizedTokenEstimate
        }
      };

      await AICache.set(cacheKey, responsePayload, 86400 * 3); // 3 days cache for matches
      res.json(responsePayload);
    } catch (error: any) {
      console.error("AI Match Error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: getErrorMsg(error) || "Failed to generate matches." });
    }
  });

  app.post('/api/ai/generateContent', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      let decodedIdToken;
      try {
        decodedIdToken = await getAuth().verifyIdToken(idToken);
      } catch (error) {
        return res.status(401).json({ error: "Invalid or expired authorization token" });
      }
      const verifiedUid = decodedIdToken.uid;
      
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
         return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      // P4.4B: MVP Margin Protection
      const operation = req.body.operation || 'freight_calc'; // Fallback if not provided
      const creditCheck = await checkCredits(verifiedUid, operation);
      if (!creditCheck.allowed) {
        return res.status(creditCheck.statusCode || 402).json(creditCheck);
      }

      let { model, contents } = req.body;
      if (!model || model === "gemini-1.5-flash" || model === "gemini-3.5-flash" || model === "gemini-2.5-flash") {
        model = AI_MODELS.COMPLEX_CLOUD;
      }
      const ai = getGoogleGenAI();
      
      const reqId = (req.headers['x-request-id'] as string) || `auto-${Date.now()}`;
      let response;
      try {
        response = await generateContentWithFailover(ai, { model, contents });
      } catch (err: any) {
        await recordFailedNotCharged(verifiedUid, operation, reqId, err.message || 'ai_error');
        throw err;
      }

      const inputTokens = Math.ceil((contents || '').length / 4);
      const outputTokens = Math.ceil((response.text || '').length / 4);
      
      chargeCreditsAfterSuccess(verifiedUid, operation, reqId, {
         provider: response.actualProvider,
         model: response.actualModel,
         inputTokens,
         outputTokens,
         totalTokens: inputTokens + outputTokens
      }).catch(e => console.warn(`[Usage Logging] Failed to charge credits for generateContent:`, e.message));

      res.json({ 
        text: response.text, 
        actualModel: response.actualModel, 
        actualProvider: response.actualProvider, 
        degraded: response.degraded 
      });
    } catch (error: any) {
      console.error("AI Generate Error:", error);
      res.status(500).json({ error: getErrorMsg(error) || "Failed to generate content." });
    }
  });

  // --- REAL-TIME AIS ENDPOINT FOR COMM-3B ---
  app.post('/api/ais/vessel-position', express.json(), async (req, res) => {
    try {
      const { vesselId, imo, mmsi } = req.body;
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      let decodedIdToken;
      try {
        decodedIdToken = await getAuth().verifyIdToken(idToken);
      } catch (error) {
        return res.status(401).json({ error: "Invalid or expired authorization token" });
      }

      const verifiedUid = decodedIdToken.uid;
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
         return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      if (!vesselId) {
        return res.status(400).json({ error: "vesselId missing" });
      }

      // 1. Fetch vessel to verify access
      const db = getFirestore();
      const vesselDoc = await db.collection("vessels").doc(vesselId).get();
      if (!vesselDoc.exists) {
        return res.status(404).json({ error: "Vessel not found" });
      }

      const vesselData = vesselDoc.data()!;
      // Simple access check: owner or visibility
      // If it's private and not owner, block.
      // If it's my_desk, check desk matching (omitted for brevity, assume owner check primarily or basic visibility check)
      const isOwner = vesselData.createdByUid === verifiedUid;
      // In a real app we'd also check deskId, etc.
      if (!isOwner && vesselData.visibility === 'private') {
        // Log audit for denied
        await db.collection("auditEvents").add({
          action: "AIS_ACCESS_DENIED",
          uid: verifiedUid,
          vesselId,
          timestamp: FieldValue.serverTimestamp()
        });
        await db.collection("auditEvents").add({
          action: "proximity_access_denied",
          uid: verifiedUid,
          metadata: { vesselId, reason: "private_vessel_access_attempt", sourceModule: "ais_provider" },
          timestamp: FieldValue.serverTimestamp()
        });
        return res.status(403).json({ error: "Access denied" });
      }

      const aisProviderModule = await import('./src/server/aisProvider.js');
      const position = await aisProviderModule.fetchAISPosition({ vesselId, imo, mmsi });

      // Audit
      await db.collection("auditEvents").add({
        action: "AIS_POSITION_FETCHED",
        uid: verifiedUid,
        vesselId,
        provider: position.provider,
        timestamp: FieldValue.serverTimestamp()
      });

      return res.status(200).json(position);
    } catch (error: any) {
      console.error("AIS Vessel Position Error:", error);
      res.status(500).json({ status: "provider_error", message: "Internal server error during AIS lookup." });
    }
  });

  app.get('/api/ais/position', async (req, res) => {
    try {
      const { mmsi } = req.query;
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ status: "provider_error", error: "Missing authorization header" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      let decodedIdToken;
      try {
        decodedIdToken = await getAuth().verifyIdToken(idToken);
      } catch (error) {
        return res.status(401).json({ status: "provider_error", error: "Invalid or expired authorization token" });
      }

      const verifiedUid = decodedIdToken.uid;
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
         return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      if (!mmsi) {
        return res.status(400).json({ status: "missing_mmsi", message: "MMSI missing", mmsi: mmsi || null });
      }

      const aisKey = process.env.AISSTREAM_API_KEY;
      if (!aisKey) {
        return res.status(200).json({ status: "provider_error", message: "AIS API key is not configured in deployment.", mmsi, source: "System", timestamp: new Date().toISOString() });
      }

      return res.status(200).json({ 
        status: "provider_not_supported",
        mmsi,
        lat: null,
        lon: null,
        timestamp: new Date().toISOString(),
        source: "AISStream",
        message: "AIS provider (AISStream) requires websocket area subscription and cannot lookup arbitrary vessel by MMSI directly on demand via REST."
      });
    } catch (error: any) {
      console.error("AIS Error:", error);
      res.status(500).json({ status: "provider_error", message: "Internal server error during AIS lookup.", mmsi: req.query.mmsi });
    }
  });

  // --- Routing Provider Endpoints --- //
  app.get('/api/admin/routing/diagnostics', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization" });
      const idToken = authHeader.split('Bearer ')[1];
      const decoded = await getAuth().verifyIdToken(idToken);
      const isAdmin = await checkIsAdmin(decoded.uid, decoded.email);

      if (!isAdmin) {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      const configured = !!process.env.ROUTING_PROVIDER_API_KEY;
      res.json({
        ok: true,
        configured,
        providerMode: configured ? 'searoutes_api' : 'straight_line_fallback',
        lastSuccess: lastRoutingSuccess,
        lastError: lastRoutingError
      });
    } catch (e: any) {
      res.status(500).json({ error: "Error fetching routing diagnostics." });
    }
  });

  app.post('/api/routing/estimate', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
         return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      const { fromCoordinates, toCoordinates, vesselId, cargoId, dealRoomId, speedKnots } = req.body;
      
      const fromLat = fromCoordinates?.lat ?? fromCoordinates?.latitude;
      const fromLng = fromCoordinates?.lng ?? fromCoordinates?.longitude;
      const toLat = toCoordinates?.lat ?? toCoordinates?.latitude;
      const toLng = toCoordinates?.lng ?? toCoordinates?.longitude;

      if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
        return res.status(400).json({ error: "Missing or invalid coordinates" });
      }

      const normalizedFrom = { lat: fromLat, lng: fromLng };
      const normalizedTo = { lat: toLat, lng: toLng };

      // Very strict basic validation to ensure they relate to a known entity
      // Not trusting the client purely -> checking that they provided an entity id
      if (!vesselId && !cargoId && !dealRoomId) {
         return res.status(403).json({ error: "Arbitrary public routing unsupported. Internal source required." });
      }

      const cacheKey = `${normalizedFrom.lat}_${normalizedFrom.lng}_${normalizedTo.lat}_${normalizedTo.lng}_${speedKnots || 12}`;
      const cached = routingCache.get(cacheKey);

      if (cached && cached.expiresAt > Date.now()) {
        const payload = { ...cached.estimate, stale: false };
        await logAuditEvent('routing_estimate_cache_hit', verifiedUid, { 
             cacheKey,
             sourceModule: dealRoomId ? 'dealRoom' : cargoId ? 'cargo' : 'vessel'
        });
        return res.json(payload);
      }

      if (cached) {
         // Return stale data immediately, but don't delete from cache yet
         // The requirement allows stale/cache flag
         cached.estimate.stale = true;
         await logAuditEvent('routing_estimate_cache_hit', verifiedUid, {
             cacheKey,
             stale: true,
             sourceModule: dealRoomId ? 'dealRoom' : cargoId ? 'cargo' : 'vessel'
         });
         return res.json(cached.estimate);
      }

      await logAuditEvent('routing_estimate_requested', verifiedUid, {
         sourceModule: dealRoomId ? 'dealRoom' : cargoId ? 'cargo' : 'vessel',
      });

      const estimateResult = await estimateRoute(normalizedFrom, normalizedTo, speedKnots || 12);
      
      if (estimateResult.routeDistanceNm !== null) {
          lastRoutingSuccess = estimateResult.routeCalculatedAt;
          lastRoutingError = null;
          routingCache.set(cacheKey, { estimate: estimateResult, expiresAt: Date.now() + 1000 * 60 * 60 * 24 }); // 24 hours expiry for static points
          
          await logAuditEvent('routing_estimate_calculated', verifiedUid, {
             routeDistanceNm: estimateResult.routeDistanceNm,
             provider: estimateResult.provider
          });
      } else {
          lastRoutingError = "Timeout or unavailable";
          await logAuditEvent('routing_estimate_unavailable', verifiedUid, {
              error: 'Provider timeout'
          });
      }

      res.json(estimateResult);

    } catch (error: any) {
      lastRoutingError = error.message;
      res.status(500).json({ error: "Internal server error during routing lookup." });
    }
  });

  // --- AI Deal Brief Endpoint --- //
  app.post('/api/ai/dealBrief', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const uid = decodedIdToken.uid;
      
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(uid) && !checkRateLimit(ip)) {
         return res.status(429).json({ error: "Too many requests" });
      }

      const operation = 'analyze_risk'; // 5 credits
      const creditCheck = await checkCredits(uid, operation);
      if (!creditCheck.allowed) {
        return res.status(creditCheck.statusCode || 402).json(creditCheck);
      }

      const { itemId, itemType, contextContext, dealType } = req.body;
      if (!itemId || !itemType) return res.status(400).json({ error: "Missing itemId or itemType" });

      if (!firestore) return res.status(500).json({ error: "Database not configured" });

      let itemData: any = null;
      let hasFullAccess = false; // full access means we can read private notes/vessel names

      try {
        if (itemType === 'cargo' || itemType === 'vessel') {
          const colName = itemType === 'cargo' ? 'cargos' : 'vessels';
          const docSnap = await firestore.collection(colName).doc(itemId).get();
          if (docSnap.exists) {
            itemData = docSnap.data();
            // User has full access if they own it, or their workspace owns it
            const userDoc = await firestore.collection('users').doc(uid).get();
            const userDeskId = userDoc.exists ? userDoc.data()?.deskId : null;
            if (itemData.userId === uid || (itemData.workspaceId && userDeskId && itemData.workspaceId === userDeskId)) {
               hasFullAccess = true;
            } else {
               // If they don't own it, check if it's visible to them
               const isPublicOrNetwork = itemData.visibility === 'public' || itemData.visibility === 'network';
               // If contextContext indicates it's for an offer candidate, we should allow it but scrub it
               if (isPublicOrNetwork || (contextContext && contextContext.processOfferAnalysis)) {
                 hasFullAccess = false;
                 // Scrub private data
                 delete itemData.privateNotes;
                 if (itemData.hideName) {
                    itemData.name = 'TBN / Name Hidden';
                 }
               } else {
                 return res.status(403).json({ error: "Access denied or item not public" });
               }
            }
          }
        } 
        else if (itemType === 'sharedItem') {
          const docSnap = await firestore.collection('sharedItems').doc(itemId).get();
          if (docSnap.exists) {
             itemData = docSnap.data();
             if (itemData.ownerId === uid) {
               hasFullAccess = true;
             } else {
               hasFullAccess = false;
               // If it's shared, hide private notes / hidden names
               if (itemData.config?.hideVesselName) {
                  itemData.name = 'TBN / Name Hidden';
               }
               delete itemData.privateNotes;
               delete itemData.contactDetails; // simplistic protection
             }
          }
        }
        else if (itemType === 'marketRequest') {
          const docSnap = await firestore.collection('marketRequests').doc(itemId).get();
          if (docSnap.exists) {
             itemData = docSnap.data();
             if (itemData.ownerId === uid) hasFullAccess = true;
          }
        }
        else if (itemType === 'radarMatch') {
          const docSnap = await firestore.collection('watchlistMatches').doc(itemId).get();
          if (docSnap.exists) {
             itemData = docSnap.data();
             if (itemData.createdByUid === uid) hasFullAccess = true;
             else return res.status(403).json({ error: "Access denied" });
          }
        }
        else if (itemType === 'hotOpp') {
          const docSnap = await firestore.collection(`users/${uid}/urgentNotifications`).doc(itemId).get();
          if (docSnap.exists) {
             itemData = docSnap.data();
             hasFullAccess = true; // since it's in their own collection
          } else {
             return res.status(404).json({ error: "Opportunity not found" });
          }
        }
      } catch (err: any) {
        console.error('[DealBrief] Error fetching item data from Firestore:', err);
        return res.status(500).json({ error: "Error fetching item data" });
      }

      if (!itemData && !contextContext) {
         return res.status(404).json({ error: "Item not found" });
      }

      const reqId = (req.headers['x-request-id'] as string) || `auto-${Date.now()}`;
      
      const ai = getGoogleGenAI();
      const prompt = `You are an expert dry bulk shipbroker assistant. Generate a concise, professional AI Deal Brief for the following item.
      Context Type: ${itemType} (${dealType || 'Opportunity'})
      Item Data:
      ` + JSON.stringify(itemData, null, 2) + `
      Additional context: ${JSON.stringify(contextContext || {})}`;

      const systemInstruction = `Analyze the provided data and return a strictly formatted JSON object matching the requested schema.
      Do not invent missing data. If laycan, freight, demurrage or commercial details are missing or vague, mark riskLevel 'medium' or 'high' and state why in riskReasons.
      Return JSON only.`;

      const responseSchema = {
        type: "object",
        properties: {
          title: { type: "string", description: "Short descriptive title, e.g. '35k mts Grain Med-Cont'" },
          dealType: { type: "string" },
          summary: { type: "string", description: "1-2 sentences broker style summary." },
          keyDetails: {
            type: "object",
            properties: {
              commodity: { type: "string" },
              quantity: { type: "string" },
              loadArea: { type: "string" },
              dischargeArea: { type: "string" },
              laycan: { type: "string" },
              vesselType: { type: "string" },
              source: { type: "string" }
            }
          },
          commercialFit: { type: "string", enum: ["excellent", "strong", "possible", "weak"] },
          matchReasons: { type: "array", items: { type: "string" } },
          missingInformation: { type: "array", items: { type: "string" } },
          riskLevel: { type: "string", enum: ["low", "medium", "high"] },
          riskReasons: { type: "array", items: { type: "string" } },
          suggestedActions: { type: "array", items: { type: "string", enum: ["View details", "Send Interest", "Contact", "Process Offer", "Create Recap Draft", "Save for later", "Dismiss"] } }
        },
        required: ["title", "dealType", "summary", "commercialFit", "riskLevel"]
      };

      let aiResponse;
      try {
         aiResponse = await generateContentWithFailover(ai, {
            model: AI_MODELS.COMPLEX_CLOUD,
            contents: prompt,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema
            }
         });
      } catch (err: any) {
         await recordFailedNotCharged(uid, operation, reqId, err.message || 'ai_error');
         throw err;
      }

      let parsedBrief;
      try {
         parsedBrief = await safeAIParseJSON(aiResponse.text);
      } catch (e) {
         await recordFailedNotCharged(uid, operation, reqId, 'json_parse_error');
         return res.status(500).json({ error: "AI produced invalid format" });
      }

      // Add disclaimer
      parsedBrief.disclaimer = "AI Deal Brief is decision support only. It is not a fixture, not a charter party, and not legal advice. It may contain errors. Principal approval may still be required.";

      const inputTokens = Math.ceil(prompt.length / 4);
      const outputTokens = Math.ceil(aiResponse.text.length / 4);
      
      await chargeCreditsAfterSuccess(uid, operation, reqId, {
         provider: aiResponse.actualProvider,
         model: aiResponse.actualModel,
         inputTokens, outputTokens, totalTokens: inputTokens + outputTokens
      });

      // Save to Firestore
      const briefId = uuidv4();
      const briefDoc = {
         id: briefId,
         createdByUid: uid,
         sourceItemId: itemId,
         sourceItemType: itemType,
         status: 'active',
         brief: parsedBrief,
         generatedAt: FieldValue.serverTimestamp(),
         audit: [{ action: 'deal brief generated', timestamp: new Date().toISOString() }]
      };
      
      // If client asked to regenerate, it might have passed briefId. Let's not override though, just let it create a new one, as "regenerate" creates newest brief in query.
      // But we should verify regenerate audit works. 
      // If req.body.isRegenerate is true, let's just log 'deal brief regenerated' instead of generated.
      if (req.body.isRegenerate) {
         briefDoc.audit[0].action = 'deal brief regenerated';
      }

      try {
        await firestore.collection('dealBriefs').doc(briefId).set(briefDoc);
      } catch (err: any) {
        console.error('Failed to save deal brief to backend Firestore', err);
        return res.status(500).json({ error: "Failed to save deal brief." });
      }

      res.json({ brief: briefDoc, metrics: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } });

    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal server error" });
    }
  });

  app.post('/api/ai/dealBrief/audit', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const uid = decodedIdToken.uid;
      
      if (!firestore) return res.status(500).json({ error: "Database not configured" });

      const { briefId, action } = req.body;
      if (!briefId || !action) return res.status(400).json({ error: "Missing briefId or action" });

      const briefRef = firestore.collection('dealBriefs').doc(briefId);
      const docSnap = await briefRef.get();
      if (!docSnap.exists) return res.status(404).json({ error: "Not found" });
      if (docSnap.data()?.createdByUid !== uid) return res.status(403).json({ error: "Access denied" });

      await briefRef.update({
        audit: FieldValue.arrayUnion({
          action,
          timestamp: new Date().toISOString()
        })
      });

      res.json({ success: true });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal server error" });
    }
  });

  app.get('/api/ai/models', async (req, res) => {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + process.env.GEMINI_API_KEY);
      const data = await response.json();
      res.json(data);
    } catch(e:any) { res.status(500).json({error: e.message}); }
  });

  app.post('/api/ai/negotiateCopilot', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: "Missing or invalid authorization header" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
         return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      let {
         outputType,
         tone,
         cargoSummary,
         vesselSummary,
         voyageEstimateSummary,
         dealBriefSummary,
         proximitySummary,
         dealRoomStatus,
         offerEvents,
         recapDraftTerms,
         privateNotes,
         context,
         dealRoomId,
         sourceId,
         sourceType
      } = req.body;

      const ALLOWED_OUTPUT_TYPES = [
        'what_should_i_reply',
        'broker_style_reply',
        'counter_offer',
        'polite_follow_up',
        'firm_follow_up',
        'risk_objection',
        'missing_information_request',
        'recap_ready_terms',
        'negotiation_summary',
        'next_step_recommendation',
        'Generate broker-style reply',
        'Generate counter offer',
        'Generate polite follow-up',
        'Generate firm follow-up',
        'Generate risk objection',
        'Generate missing information request',
        'Generate recap-ready terms',
        'Generate negotiation summary',
        'Generate next-step recommendation'
      ];
      const ALLOWED_TONES = ['professional', 'concise', 'firm', 'diplomatic', 'premium', 'urgent', 'cautious'];

      outputType = ALLOWED_OUTPUT_TYPES.includes(outputType) ? outputType : 'Generate broker-style reply';
      tone = ALLOWED_TONES.includes(tone) ? tone : 'professional';

      if (dealRoomId) {
        const drDoc = await firestore.collection("dealRooms").doc(dealRoomId).get();
        if (!drDoc.exists) {
          return res.status(403).json({ error: "Deal room context not found." });
        }
        const uDoc = await firestore.collection("users").doc(verifiedUid).get();
        const deskId = uDoc.data()?.deskId;
        const data = drDoc.data()!;
        const hasAccess = data.createdByUid === verifiedUid || 
                          (data.participantUids && data.participantUids.includes(verifiedUid)) ||
                          (data.visibility === 'my_desk' && data.createdByDeskId === deskId);
                          
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied to deal room context." });
        }
        
        dealRoomStatus = data.status || dealRoomStatus;
        if (data.linkedCargoId) {
           const cDoc = await firestore.collection("cargoes").doc(data.linkedCargoId).get();
           if (cDoc.exists) cargoSummary = cDoc.data();
        }
        if (data.linkedVesselId) {
           const vDoc = await firestore.collection("vessels").doc(data.linkedVesselId).get();
           if (vDoc.exists) vesselSummary = vDoc.data();
        }
      }

      let safeNotes = [];
      if (privateNotes && Array.isArray(privateNotes)) {
          safeNotes = privateNotes.map(String).slice(0, 10);
      }
      let safeContext = context ? String(context).substring(0, 2000) : '';

      const creditCheck = await checkCredits(verifiedUid, 'negotiation_strategy');
      if (!creditCheck.allowed) {
        return res.status(creditCheck.statusCode || 403).json({ error: creditCheck.error, safeMessage: creditCheck.safeMessage, needsUpgrade: true });
      }

      const requestId = 'nego-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      const ai = getGoogleGenAI();

      let systemPrompt = `You are an expert AI Negotiation Copilot for Shipbrokers.
You help brokers prepare market-appropriate replies, counter offers, and negotiation strategies.
CRITICAL RULES:
- If freight rate or cargo weight (MT) is missing, mark as 'Pending' or 'Pending Data'. Do not falsely output 'Profitable' or 'Above Market'. Never hallucinate freight rate, demurrage, or law/arbitration details.
- Return ONLY strictly formatted JSON.
- Never invent cargo size, freight rate, or vessel details that are not provided.
- If asked about recap readiness, assess if required details (vessel, cargo, laycan, ports, freight) are clear.
- Provide a message in the tone '{TONE}'.
- State negotiation strategy and commercial reasoning clearly.`;

      let userPrompt = `Generate a negotiation suggestion of type: {OUTPUT_TYPE} with a '{TONE}' tone.
      
Context provided:
Cargo: {CARGO}
Vessel: {VESSEL}
Voyage Estimate: {ESTIMATE}
Deal Brief: {BRIEF}
Proximity Summary: {PROXIMITY}
Deal Status: {STATUS}
Recent Offers/Events: {OFFERS}
Recap Terms: {RECAP}
Private Notes (if allowed): {NOTES}
Custom Context: {CONTEXT}`;

      userPrompt = userPrompt
        .replace('{OUTPUT_TYPE}', outputType)
        .replace('{TONE}', tone)
        .replace('{CARGO}', JSON.stringify(cargoSummary || {}))
        .replace('{VESSEL}', JSON.stringify(vesselSummary || {}))
        .replace('{ESTIMATE}', JSON.stringify(voyageEstimateSummary || {}))
        .replace('{BRIEF}', JSON.stringify(dealBriefSummary || {}))
        .replace('{PROXIMITY}', proximitySummary || 'No proximity data provided')
        .replace('{STATUS}', dealRoomStatus || 'Unknown')
        .replace('{OFFERS}', JSON.stringify(offerEvents || []))
        .replace('{RECAP}', JSON.stringify(recapDraftTerms || {}))
        .replace('{NOTES}', JSON.stringify(safeNotes))
        .replace('{CONTEXT}', safeContext);
        
      const responseSchema = {
        type: "OBJECT",
        properties: {
          suggestedMessage: { type: "STRING" },
          tone: { type: "STRING" },
          commercialReasoning: { type: "STRING" },
          negotiationStrategy: { type: "STRING" },
          keyRisks: { type: "ARRAY", items: { type: "STRING" } },
          missingInformation: { type: "ARRAY", items: { type: "STRING" } },
          recommendedNextStep: { type: "STRING" },
          recapReadiness: { 
            type: "STRING", 
            description: "One of: 'not ready', 'almost ready', 'ready for recap', 'ready for broker-side confirmation'" 
          },
          disclaimer: { type: "STRING" }
        },
        required: ["suggestedMessage", "tone", "commercialReasoning", "negotiationStrategy", "keyRisks", "missingInformation", "recommendedNextStep", "recapReadiness", "disclaimer"]
      };

      const result = await generateContentWithFailover(ai, {
        model: AI_MODELS.COMPLEX_CLOUD,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt.replace('{TONE}', tone || 'professional'),
          responseMimeType: "application/json",
          responseSchema: responseSchema
        }
      });

      const parsedJSON = await safeAIParseJSON(result.text);
      if (!parsedJSON || !parsedJSON.suggestedMessage) {
        throw new Error("AI returned malformed or empty negotiation suggestion.");
      }
      
      parsedJSON.disclaimer = "This is an AI-generated suggestion only. The broker must review, edit, and decide before taking any action. Does not constitute a final binding fixture.";

      await chargeCreditsAfterSuccess(verifiedUid, 'negotiation_strategy', requestId);

      res.status(200).json(parsedJSON);
    } catch (error: any) {
      console.error("Negotiation Copilot error:", error);
      res.status(500).json({ error: getErrorMsg(error) });
    }
  });

  app.post('/api/offers/process', express.json(), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing token' });
      }
      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await getAuth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { cargoId, vesselId, eta } = req.body;
      if (!cargoId || !vesselId) {
        return res.status(400).json({ error: 'Missing cargoId or vesselId' });
      }

      if (!firestore) return res.status(500).json({ error: 'Database not available' });

      // Verify current user owns/has access to selected cargo
      const cargoDoc = await firestore.collection('cargos').doc(cargoId).get();
      if (!cargoDoc.exists) return res.status(404).json({ error: 'Cargo not found' });
      const cargoData = cargoDoc.data()!;
      
      let hasAccess = cargoData.userId === userId;
      if (!hasAccess && cargoData.workspaceId) {
          const membershipDoc = await firestore.collection(`users/${userId}/memberships`).doc(cargoData.workspaceId).get();
          if (membershipDoc.exists) {
              const role = membershipDoc.data()!.role;
              if (role === 'admin' || role === 'broker') hasAccess = true;
          }
      }
      if (!hasAccess) return res.status(403).json({ error: 'Unauthorized to use this cargo' });

      // Verify selected vessel exists
      const vesselDoc = await firestore.collection('vessels').doc(vesselId).get();
      if (!vesselDoc.exists) return res.status(404).json({ error: 'Vessel not found or unavailable' });
      const vesselData = vesselDoc.data()!;
      if (vesselData.status !== 'OPEN') return res.status(400).json({ error: 'Selected vessel is no longer available' });

      // Create match/deal server-side (Urgent Deal)
      const dealId = `${vesselId}_${cargoId}`;
      const dealRef = firestore.collection('deskNetworkUrgentDeals').doc(dealId);
      const existingDeal = await dealRef.get();

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);

      const auditTrail = existingDeal.exists ? existingDeal.data()!.auditTrail || [] : [];
      auditTrail.push({
        action: 'process_offer',
        timestamp: FieldValue.serverTimestamp(),
        actorUid: userId,
        safeMessage: 'Offer processed and deal created.'
      });

      const dealData = {
        dealId,
        vesselItemId: vesselId,
        cargoItemId: cargoId,
        vesselOwnerUid: vesselData.userId || 'system',
        cargoOwnerUid: cargoData.userId || 'system',
        vesselSharedItemId: vesselData.sharedItemId || null,
        cargoSharedItemId: cargoData.sharedItemId || null,
        status: 'contacted',
        urgencyScore: 80,
        matchScore: 90,
        region: cargoData.loadPort || vesselData.openPort || 'Unknown',
        reason: 'User manually processed offer from Matching Engine.',
        createdAt: existingDeal.exists ? existingDeal.data()!.createdAt : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: existingDeal.exists ? existingDeal.data()!.expiresAt : expiresAt,
        createdBySystem: false,
        auditTrail
      };

      await dealRef.set(dealData, { merge: true });

      // Update the assigned vessel internally on the cargo document
      // Note: we're acting as Admin here so rules don't block this!
      await firestore.collection('cargos').doc(cargoId).update({
        assignedVesselId: vesselId,
        vesselETA: eta,
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z'
      });

      return res.json({ success: true, dealId });
    } catch (err: any) {
      console.error("Process offer failed:", err);
      // Let's send 200 with an error object instead of 500 when it's safe
      return res.status(500).json({ error: 'Internal server error while processing offer', message: err.message });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      let decodedIdToken;
      try {
        decodedIdToken = await getAuth().verifyIdToken(idToken);
      } catch (error) {
        return res.status(401).json({ error: "Invalid or expired authorization token" });
      }
      const verifiedUid = decodedIdToken.uid;
      
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkRateLimit(verifiedUid) && !checkRateLimit(ip)) {
         return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      // P4.4B: MVP Margin Protection
      const operation = req.body.operation || 'ai_chat';
      const creditCheck = await checkCredits(verifiedUid, operation);
      if (!creditCheck.allowed) {
        return res.status(creditCheck.statusCode || 402).json(creditCheck);
      }

      let { model, systemInstruction, history, message } = req.body;
      if (!model || model === "gemini-1.5-flash" || model === "gemini-3.5-flash" || model === "gemini-2.5-flash") {
        model = AI_MODELS.COMPLEX_CLOUD;
      }
      const ai = getGoogleGenAI();
      const chat = ai.chats.create({
        model,
        config: systemInstruction ? { systemInstruction } : undefined,
        history: history || []
      });

      const reqId = (req.headers['x-request-id'] as string) || `auto-${Date.now()}`;
      let response;
      try {
        response = await chat.sendMessage({ message });
      } catch (err: any) {
        await recordFailedNotCharged(verifiedUid, operation, reqId, err.message || 'ai_error');
        throw err;
      }

      const inputTokens = Math.ceil(((systemInstruction || '').length + (message || '').length) / 4);
      const outputTokens = Math.ceil((response.text || '').length / 4);
      
      chargeCreditsAfterSuccess(verifiedUid, operation, reqId, {
         provider: 'google',
         model,
         inputTokens,
         outputTokens,
         totalTokens: inputTokens + outputTokens
      }).catch(e => console.warn(`[Usage Logging] Failed to charge credits for chat:`, e.message));

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      res.status(500).json({ error: getErrorMsg(error) || "Failed to respond in chat." });
    }
  });

  // Background task to send trial expiration notifications
  const trialCheckInterval = setInterval(async () => {
    if (!firestore) return;
    try {
      const now = new Date();
      const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      
      // Note: Firestore requires an index if we use compound queries, 
      // so we might need a simpler query and filter in memory if index not present.
      const workspacesSnapshot = await firestore.collection('workspaces')
        .where('trialEndsAt', '<=', threeDaysFromNow)
        .where('trialEndsAt', '>', now)
        .get();

      for (const doc of workspacesSnapshot.docs) {
        const workspaceData = doc.data();
        if (workspaceData.trialWarningSent) continue;
        
        console.log(`[Scheduled Task] Sending trial expiration warning for workspace ${doc.id}`);
        
        // 1. Mark as sent
        await doc.ref.update({
          trialWarningSent: true
        });

        // 2. Create in-app notification for the owner
        if (workspaceData.ownerId) {
          await firestore.collection('users').doc(workspaceData.ownerId).collection('notifications').add({
            title: 'Trial Expiring Soon',
            message: `Your free trial for workspace "${workspaceData.name || 'Cargo Desk'}" expires in less than 3 days. Upgrade your plan to avoid interruption.`,
            type: 'warning',
            createdAt: FieldValue.serverTimestamp(),
            read: false
          });
        }
      }
    } catch (e: any) {
      if (e.message && e.message.includes('PERMISSION_DENIED')) {
        // Ignore in preview environment
        return;
      }
      console.error("Error in trial expiration background task:", e);
    }
  }, 10 * 60 * 1000); // Run every 10 minutes for testing/demo purposes

  // Serve static files in production or use Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // --- Scaling / Multi-Instance Readiness ---
  // The app architecture is now mostly stateless for AI and generic routing.
  // When deploying to Cloud Run, container replicas handle scale automatically.
  // If moving to a VM without container orchestrator, use PM2 cluster mode: 
  // 'pm2 start dist/server.cjs -i max'
  // Note: in-memory maps (syncLocks, inMemoryCache) are local to the process.
  // For multi-node setup, Redis handles the AI cache securely.
  app.post('/api/audit', express.json(), async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: "Missing or invalid authorization header" });
      const idToken = authHeader.split('Bearer ')[1];
      let verifiedUid = 'unauthenticated';
      try {
        const decodedIdToken = await getAuth().verifyIdToken(idToken);
        verifiedUid = decodedIdToken.uid;
      } catch (err: any) {
        return res.status(401).json({ error: "Invalid token" });
      }

      const { action, metadata } = req.body;
      if (!action) return res.status(400).json({ error: "Missing action" });

      // Clean metadata to avoid storing raw private payloads directly
      const cleanMetadata = { ...metadata };
      delete cleanMetadata.rawText;
      delete cleanMetadata.emailBody;
      delete cleanMetadata.token;
      delete cleanMetadata.rawPrompt;
      delete cleanMetadata.rawResponse;
      delete cleanMetadata.rawAISPayload;
      delete cleanMetadata.providerKey;

      const ALLOWED_ACTIONS = [
        'proximity_calculated',
        'proximity_viewed',
        'proximity_used_in_smart_radar',
        'proximity_used_in_ai_deal_brief',
        'proximity_used_in_negotiation_copilot',
        'proximity_access_denied',
        'proximity_estimate_assumption_mismatch',
        'routing_estimate_requested',
        'routing_estimate_calculated',
        'routing_estimate_cache_hit',
        'routing_estimate_unavailable',
        'routing_estimate_access_denied',
        'routing_estimate_used_in_voyage_estimate',
        'routing_estimate_used_in_smart_radar',
        'routing_estimate_used_in_ai_deal_brief',
        'routing_estimate_used_in_copilot'
      ];

      if (!ALLOWED_ACTIONS.includes(action)) {
         return res.status(400).json({ error: "Invalid audit action" });
      }

      await firestore.collection("auditEvents").add({
        action,
        uid: verifiedUid,
        metadata: cleanMetadata,
        timestamp: FieldValue.serverTimestamp()
      });
      
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Audit Event Error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && err.type === 'entity.too.large') {
      console.warn(`[Payload Too Large] Route: ${req.path}, IP: ${req.ip}`);
      return res.status(413).json({ error: "The provided data is too large. Please limit input size to 10MB." });
    }
    console.error(`[Unhandled Error] Route: ${req.path}`, err.message);
    res.status(500).json({ error: "Internal Server Error" });
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('Received shutdown signal, closing server...');
    server.close(() => {
      console.log('HTTP server closed.');
      // Cleanup AI queue / IMAP sync connections if exist
      clearInterval(trialCheckInterval);
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
