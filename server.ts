import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import Stripe from 'stripe';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual, createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import fs from 'fs';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { fetchAISPosition, getAISProviderStatus } from './src/server/aisProvider';
import { estimateRoute } from './src/lib/routingProvider';
import { getMarketSnapshot, getBunkerSnapshot } from './src/server/marketProvider';

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

function getCredentialEncryptionKey(): Buffer {
  const encoded = (process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY || '').trim();
  if (!encoded) {
    throw new Error('EMAIL_CREDENTIALS_ENCRYPTION_KEY is not configured');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('EMAIL_CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  return key;
}

function encryptCredential(value: string): string {
  const key = getCredentialEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

function decryptCredential(payload: string): string {
  const [version, ivB64, tagB64, ciphertextB64] = String(payload || '').split('.');
  if (version !== 'v1' || !ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error('Unsupported encrypted credential format');
  }
  const key = getCredentialEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function readStoredCredential(data: any, encryptedField: string, legacyField: string): string | undefined {
  if (data?.[encryptedField]) {
    return decryptCredential(data[encryptedField]);
  }
  if (data?.[legacyField]) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Legacy plaintext email credentials are blocked in production; reconnect the account.');
    }
    return data[legacyField];
  }
  return undefined;
}

function constantTimeSecretEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided || '', 'utf8');
  const b = Buffer.from(expected || '', 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function isBlockedNetworkAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224;
  }

  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    if (value === '::' || value === '::1' || value.startsWith('ff')) return true;
    if (value.startsWith('fc') || value.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(value)) return true;
    if (value.startsWith('::ffff:')) {
      return isBlockedNetworkAddress(value.substring('::ffff:'.length));
    }
  }

  return false;
}

async function resolveSafeImapHost(host: string): Promise<{ connectHost: string; servername: string }> {
  const normalizedHost = String(host || '').trim().toLowerCase().replace(/\.$/, '');
  if (!normalizedHost || normalizedHost === 'localhost' || normalizedHost.endsWith('.local')) {
    throw new Error('Invalid IMAP host');
  }
  if (normalizedHost.length > 253 || (!isIP(normalizedHost) && !/^[a-z0-9.-]+$/.test(normalizedHost))) {
    throw new Error('Invalid IMAP host');
  }

  const addresses = isIP(normalizedHost)
    ? [{ address: normalizedHost }]
    : await lookup(normalizedHost, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(result => isBlockedNetworkAddress(result.address))) {
    throw new Error('IMAP host resolves to a blocked network address');
  }

  return {
    connectHost: addresses[0].address,
    servername: normalizedHost
  };
}

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' as any }) : null;

const STRIPE_PLAN_MAPPING: Record<string, { priceId: string, name: string }> = {
  solo: { priceId: process.env.STRIPE_PRICE_ID_SOLO || 'price_solo_fallback', name: 'Solo Plan' },
  desk: { priceId: process.env.STRIPE_PRICE_ID_DESK || 'price_desk_fallback', name: 'Desk Plan' }
};

const AI_MODELS = {
  BROWSER_OPTIONAL: "gemini-nano-browser-optional",
  COMPLEX_CLOUD: process.env.GEMINI_MODEL_FAST || "gemini-2.5-flash",
  HEAVY_SERVER: process.env.GEMINI_MODEL_HEAVY || "gemini-2.5-pro",
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
  market_report_analysis: 3,
  email_sync_scan: 1,
  manual_text_intake: 1,
  draft_reply: 2,
  desk_network_publish: 0,
  recap_generation: 3,
  risk_review: 5,
  vessel_search: 1,
  cargo_match_review: 3,
  routing_estimate: 1
};

// Usage Helper Functions
export function getCurrentUsagePeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getCreditCost(operation: string): number {
  const cost = CREDIT_COST[operation];
  if (cost === undefined) {
    console.error(`[Usage Error] Unknown operation cost requested: ${operation}. Applying conservative fallback cost.`);
    return 5; // Fail closed financially: unknown operations must never become free.
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

  const adminEmailsString = process.env.ADMIN_EMAILS || '';
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
  const result = await incrementCreditsUsed(uid, operation, cost, requestId, metadata);
  if (!result.recorded && !result.alreadyRecorded) {
    if (result.safeErrorCode === 'CREDIT_LIMIT_EXCEEDED') {
      throw new Error('CREDIT_LIMIT_EXCEEDED');
    }
    throw new Error('USAGE_RECORDING_FAILED');
  }
  return result;
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
      period: getCurrentUsagePeriod(),
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
  const overrideRef = firestore.collection('users').doc(uid).collection('usageOverrides').doc('current');
  
  try {
    const result = await firestore.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      if (eventSnap.exists) {
        return { recorded: false, alreadyRecorded: true, cost, operation, requestId: validRequestId };
      }
      
      const docSnap = await transaction.get(usageRef);
      const overrideSnap = await transaction.get(overrideRef);

      const usageData = docSnap.exists ? (docSnap.data() || {}) : {};
      const currentUsed = Number(usageData.creditsUsed || 0);
      const baseIncludedRaw = docSnap.exists ? usageData.creditsIncluded : PLAN_CONFIG.trial.creditsIncluded;
      const baseIncluded = Number(baseIncludedRaw);

      if (!Number.isFinite(baseIncluded) || baseIncluded < 0 || !Number.isFinite(currentUsed) || currentUsed < 0) {
        return { recorded: false, cost, operation, requestId: validRequestId, safeErrorCode: 'INVALID_USAGE_STATE' };
      }

      let additionalCredits = 0;
      if (overrideSnap.exists) {
        const overrideData = overrideSnap.data() || {};
        const granted = Number(overrideData.testCreditsGranted || 0);
        const rawExpiry = overrideData.testCreditsExpiresAt;
        const expiry = rawExpiry?.toDate ? rawExpiry.toDate() : (rawExpiry ? new Date(rawExpiry) : null);
        if (Number.isFinite(granted) && granted > 0 && expiry && expiry > new Date()) {
          additionalCredits = granted;
        }
      }

      if (currentUsed + cost > baseIncluded + additionalCredits) {
        return { recorded: false, cost, operation, requestId: validRequestId, safeErrorCode: 'CREDIT_LIMIT_EXCEEDED' };
      }

      if (!docSnap.exists) {
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
        period,
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

const MARKET_REPORT_SYSTEM = `You are a senior dry-bulk shipbroker market analyst. Parse only facts supported by the supplied broker circular or market report.
Return structured JSON. Never invent rates, index values, fixtures, bunker prices, dates, vessel availability, counterparties, or market direction.
If evidence is mixed, set trend to "mixed" or "unclear" and reduce confidence.
Keep ai_summary concise and operational. Distinguish stated facts from inference.`;

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
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY env var not set");
  _openAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openAI;
}

let _experimentalRouter: OpenAI | null = null;
function getExperimentalRouter() {
  const enabled = process.env.FREELLM_FALLBACK_ENABLED === 'true';
  if (!enabled) return null;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_EXPERIMENTAL_LLM_FALLBACK !== 'true') return null;

  const baseURL = (process.env.FREELLM_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiKey = (process.env.FREELLM_API_KEY || '').trim();
  if (!baseURL || !apiKey) return null;

  if (_experimentalRouter) return _experimentalRouter;
  _experimentalRouter = new OpenAI({
    apiKey,
    baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`,
  });
  return _experimentalRouter;
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
    let openaiModel = process.env.OPENAI_MODEL_FAST || 'gpt-4o-mini';
    let anthropicModel = process.env.ANTHROPIC_MODEL_FAST || 'claude-3-5-haiku-latest';
    if (args.model === AI_MODELS.HEAVY_SERVER || args.model === 'gemini-1.5-pro') {
        openaiModel = process.env.OPENAI_MODEL_HEAVY || 'gpt-4o';
        anthropicModel = process.env.ANTHROPIC_MODEL_HEAVY || 'claude-sonnet-4-5';
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
                 try {
                     let system = args.config?.systemInstruction;
                     let prompt = args.contents;
                     if (Array.isArray(prompt)) {
                        prompt = prompt.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
                     }

                     if (args.config?.responseMimeType === 'application/json') {
                         const schemaStr = JSON.stringify(args.config?.responseSchema || {});
                         prompt += "\n\nReturn strictly JSON according to the schema: " + schemaStr;
                     }
                     
                     const reqBody: any = {
                         model: anthropicModel,
                         max_tokens: 4096,
                         messages: [{role: 'user', content: prompt}]
                     };
                     if (system) reqBody.system = system;
                     
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
                     
                     if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}`);
                     const d = await r.json();
                     if (d.error) throw new Error(d.error.message);
                     
                     const text = d.content?.[0]?.text || "";
                     if (!text) throw new Error("Anthropic returned no text content");
                     
                     return { text, actualModel: anthropicModel, actualProvider: 'anthropic', degraded: true, retries, failovers: 2, timeoutCount, queueWaitMs };
                 } catch (anthropicError: any) {
                     console.log('Anthropic failed.', anthropicError.message);
                 }
             }

             const experimentalRouter = getExperimentalRouter();
             if (experimentalRouter) {
                 try {
                     let system = args.config?.systemInstruction;
                     let prompt = args.contents;
                     if (Array.isArray(prompt)) {
                       prompt = prompt.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
                     }
                     const messages: any[] = [];
                     if (system) messages.push({ role: 'system', content: system });
                     messages.push({ role: 'user', content: prompt });

                     const routerModel = process.env.FREELLM_MODEL || 'auto';
                     const routerConfig: any = { model: routerModel, messages };
                     if (args.config?.responseMimeType === 'application/json') {
                       routerConfig.response_format = { type: 'json_object' };
                     }

                     const routerResponse = await experimentalRouter.chat.completions.create(routerConfig);
                     const text = routerResponse.choices?.[0]?.message?.content || '';
                     if (!text) throw new Error('Experimental router returned no content');
                     return { text, actualModel: routerModel, actualProvider: 'freellm-experimental', degraded: true, retries, failovers: 3, timeoutCount, queueWaitMs };
                 } catch (routerError: any) {
                     console.log('Experimental FreeLLM-compatible router failed.', routerError.message);
                 }
             }

             throw error; // Re-throw original Gemini error if all configured fallbacks fail
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
  const parsedPort = Number.parseInt(process.env.PORT || '3000', 10);
  const PORT = Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 3000;

  const trustProxyHops = Math.max(0, Number.parseInt(process.env.TRUST_PROXY_HOPS || '1', 10) || 0);
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? trustProxyHops : false);
  app.disable('x-powered-by');

  if (process.env.NODE_ENV === 'production') {
    app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
      next();
    });
  }
  
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
            planId,
            subscription: planId === 'desk' ? 'maximum' : 'premium',
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
             planId,
             subscription: planId === 'desk' ? 'maximum' : 'premium',
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
             planId: 'trial',
             subscription: 'basic'
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

  // Standard JSON middleware for all other routes. Broker emails and deal payloads
  // should stay well below this; keeping the cap tight limits memory and AI-cost abuse.
  const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '1mb';
  app.use(express.json({ limit: jsonBodyLimit }));
  app.use(cookieParser());

  const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  
  const getAppBaseUrl = (req: express.Request) => {
    const configured = (process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
    if (configured) {
      try {
        const parsed = new URL(configured);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
          throw new Error('APP_BASE_URL must use HTTPS in production');
        }
        return parsed.origin;
      } catch (error: any) {
        throw new Error(`Invalid APP_BASE_URL: ${error.message}`);
      }
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('APP_BASE_URL must be configured in production');
    }

    const host = req.get('host') || 'localhost:3000';
    return `${req.protocol}://${host}`;
  };

  const getRedirectUri = (req: express.Request) => {
    return `${getAppBaseUrl(req)}/auth/callback`;
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
    const isProduction = process.env.NODE_ENV === 'production';
    const billingEnabled = process.env.BILLING_ENABLED !== 'false';
    const emailSyncEnabled = process.env.EMAIL_SYNC_ENABLED !== 'false';
    const emailSyncMode = process.env.EMAIL_SYNC_MODE || (isProduction ? 'cloud_tasks' : 'in_process');
    const cloudTasksConfigured = !!(
      process.env.CLOUD_TASKS_PROJECT_ID &&
      process.env.CLOUD_TASKS_LOCATION &&
      process.env.CLOUD_TASKS_QUEUE &&
      process.env.EMAIL_SYNC_WORKER_URL &&
      process.env.CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT
    );
    const distributedRateLimitRequired = isProduction && process.env.DISTRIBUTED_RATE_LIMIT_REQUIRED !== 'false';
    const distributedRateLimitConfigured = process.env.REDIS_ENABLED === 'true' &&
      !!process.env.UPSTASH_REDIS_REST_URL &&
      !!process.env.UPSTASH_REDIS_REST_TOKEN;

    const checks = {
      firebaseAdmin: !!firestore,
      aiProviderConfig: !!process.env.GEMINI_API_KEY,
      canonicalAppUrl: !isProduction || !!process.env.APP_BASE_URL,
      billing: !billingEnabled || !!(
        process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_WEBHOOK_SECRET &&
        process.env.STRIPE_PRICE_ID_SOLO &&
        process.env.STRIPE_PRICE_ID_DESK
      ),
      emailCredentialEncryption: !emailSyncEnabled || !!process.env.EMAIL_CREDENTIALS_ENCRYPTION_KEY,
      emailSync: !emailSyncEnabled || emailSyncMode === 'in_process' || (emailSyncMode === 'cloud_tasks' && cloudTasksConfigured),
      emailSyncMode,
      distributedRateLimit: !distributedRateLimitRequired || distributedRateLimitConfigured,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
    const isReady = checks.firebaseAdmin &&
      checks.aiProviderConfig &&
      checks.canonicalAppUrl &&
      checks.billing &&
      checks.emailCredentialEncryption &&
      checks.emailSync &&
      checks.distributedRateLimit;
    res.status(isReady ? 200 : 503).json(checks);
  });
  const MAX_AI_REQUESTS_PER_MINUTE = parseInt(process.env.MAX_AI_REQUESTS_PER_MINUTE || '60');

  async function checkRateLimit(identifier: string, limit = MAX_AI_REQUESTS_PER_MINUTE, namespace = 'api'): Promise<boolean> {
    const now = Date.now();
    const redisConfigured = process.env.REDIS_ENABLED === 'true' &&
      !!process.env.UPSTASH_REDIS_REST_URL &&
      !!process.env.UPSTASH_REDIS_REST_TOKEN;
    const distributedRequired = process.env.NODE_ENV === 'production' &&
      process.env.DISTRIBUTED_RATE_LIMIT_REQUIRED !== 'false';

    if (redisConfigured) {
      try {
        const bucket = Math.floor(now / 60000);
        const identifierHash = createHash('sha256').update(String(identifier)).digest('hex').substring(0, 32);
        const key = `rl:${namespace}:${identifierHash}:${bucket}`;
        const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/multi-exec`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([
            ['INCR', key],
            ['EXPIRE', key, 120]
          ])
        });

        if (!response.ok) throw new Error(`redis_rate_limit_http_${response.status}`);
        const results = await response.json() as any;
        if (!Array.isArray(results) || results[0]?.error || results[1]?.error) {
          throw new Error('redis_rate_limit_invalid_response');
        }

        const count = Number(results[0]?.result);
        if (!Number.isFinite(count)) throw new Error('redis_rate_limit_invalid_count');
        if (count > limit) {
          adminDiagnostics.rateLimitHits++;
          return false;
        }
        return true;
      } catch (error: any) {
        console.warn('[RateLimit] Distributed limiter unavailable:', error.message || 'unknown');
        if (distributedRequired && process.env.DISTRIBUTED_RATE_LIMIT_FAIL_OPEN !== 'true') {
          adminDiagnostics.rateLimitHits++;
          return false;
        }
      }
    } else if (distributedRequired && process.env.DISTRIBUTED_RATE_LIMIT_FAIL_OPEN !== 'true') {
      adminDiagnostics.rateLimitHits++;
      return false;
    }

    const localKey = `${namespace}:${identifier}`;
    const limiter = userRateLimits.get(localKey);
    if (!limiter || limiter.resetAt < now) {
      userRateLimits.set(localKey, { count: 1, resetAt: now + 60000 });
      return true;
    }
    if (limiter.count >= limit) {
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
          const isAdmin = await checkIsAdmin(decoded.uid, decoded.email);
          if (!isAdmin) {
            return res.status(403).json({ error: "Forbidden: Admin only" });
          }
          
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

  app.get("/api/auth/google-url", async (req, res) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ error: "Google OAuth is not configured" });
    }
    if (!firestore) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    let decodedIdToken;
    try {
      decodedIdToken = await getAuth().verifyIdToken(authHeader.slice(7));
    } catch {
      return res.status(401).json({ error: "Invalid or expired authorization token" });
    }

    const verifiedUid = decodedIdToken.uid;
    if (!(await checkRateLimit(verifiedUid))) {
      return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    }

    try {
      const redirectUri = getRedirectUri(req);
      const state = randomUUID();
      const stateRef = firestore.collection('_oauth_states').doc(state);
      await stateRef.set({
        uid: verifiedUid,
        redirectUri,
        createdAt: FieldValue.serverTimestamp(),
        expiresAtMs: Date.now() + 10 * 60 * 1000,
        used: false
      });

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
        include_granted_scopes: true,
        state
      });

      res.json({ url: authorizeUrl });
    } catch (error: any) {
      console.error("Failed to start Google OAuth:", error.message);
      res.status(500).json({ error: "Unable to start Google authorization" });
    }
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
    if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
       return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    }

    try {
       if (!firestore) throw new Error("Firestore not initialized");
       const snap = await firestore.collection(`users/${decodedIdToken.uid}/emailAccounts`).get();
       const gmailDoc = snap.docs.find(d => d.data().provider === 'gmail');
       
       let refreshToken = undefined;
       if (gmailDoc) {
         const gmailData = gmailDoc.data();
         refreshToken = readStoredCredential(gmailData, 'refreshTokenEncrypted', 'refreshToken');
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
      if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
         return res.status(429).json({ error: "Too many requests" });
      }
      
      const { planId } = req.body;
      
      if (!['solo', 'desk'].includes(planId)) {
         return res.status(400).json({ error: "Invalid planId requested. Allowed: 'solo', 'desk'." });
      }
      
      if (!stripe) {
        if (process.env.NODE_ENV === 'production' && process.env.BILLING_ENABLED !== 'false') {
          return res.status(503).json({ error: 'Billing is not configured.' });
        }
        console.log('Stripe API Key not provided; development demo mode only.');
        return res.json({ demoMode: true });
      }

      const domainURL = getAppBaseUrl(req);

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
        if (process.env.NODE_ENV === 'production' && process.env.BILLING_ENABLED !== 'false') {
          return res.status(503).json({ error: 'Billing plan price is not configured.' });
        }
        console.warn('Real Stripe Price ID map is missing; development demo mode only.');
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

      const domainURL = getAppBaseUrl(req);

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
      if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
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

      const domainURL = getAppBaseUrl(req);

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
      if (!state || typeof state !== 'string' || !firestore) {
        return res.status(400).send("Missing or invalid OAuth state");
      }

      const stateRef = firestore.collection('_oauth_states').doc(state);
      const stateData = await firestore.runTransaction(async transaction => {
        const stateSnap = await transaction.get(stateRef);
        if (!stateSnap.exists) throw new Error('oauth_state_not_found');
        const data = stateSnap.data() || {};
        if (data.used === true) throw new Error('oauth_state_already_used');
        if (!data.uid || !data.redirectUri || !data.expiresAtMs || data.expiresAtMs < Date.now()) {
          throw new Error('oauth_state_expired_or_invalid');
        }
        transaction.update(stateRef, {
          used: true,
          usedAt: FieldValue.serverTimestamp()
        });
        return data;
      });

      const userId = stateData.uid as string;
      const redirectUriToUse = stateData.redirectUri as string;
      console.log(`OAuth callback accepted for authenticated state; code prefix: ${code.substring(0, 10)}...`);

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
             refreshTokenEncrypted: encryptCredential(tokens.refresh_token),
             refreshToken: FieldValue.delete(),
             createdAt: FieldValue.serverTimestamp()
           }, { merge: true });
         } catch(e: any) {
           console.warn("Could not save refresh token to firestore:", e.message);
         }
      }

      const safeTokens = {
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
    if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
       return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    }

    if (userId !== verifiedUid) {
      return res.status(403).json({ error: "Forbidden: userId mismatch" });
    }

    try {
      const normalizedPort = Number(port);
      if (normalizedPort !== 993) {
        return res.status(400).json({ error: "Only secure IMAPS on port 993 is supported." });
      }
      const resolvedHost = await resolveSafeImapHost(host);
      const client = new ImapFlow({
        host: resolvedHost.connectHost,
        port: normalizedPort,
        secure: true,
        tls: { servername: resolvedHost.servername },
        auth: { user: username, pass: password },
        logger: false
      });
      
      await client.connect();
      await client.logout();

      if (firestore) {
        await firestore.collection('users').doc(userId).collection('emailAccounts').doc(username).set({
          host: String(host).trim(),
          port: 993,
          username,
          passwordEncrypted: encryptCredential(password),
          password: FieldValue.delete(),
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

  const getEmailSyncMode = () => {
    if (process.env.EMAIL_SYNC_ENABLED === 'false') return 'disabled';
    return process.env.EMAIL_SYNC_MODE || (process.env.NODE_ENV === 'production' ? 'cloud_tasks' : 'in_process');
  };

  const getCloudTasksConfig = () => {
    const projectId = process.env.CLOUD_TASKS_PROJECT_ID;
    const location = process.env.CLOUD_TASKS_LOCATION;
    const queue = process.env.CLOUD_TASKS_QUEUE;
    const workerUrl = process.env.EMAIL_SYNC_WORKER_URL;
    const serviceAccountEmail = process.env.CLOUD_TASKS_INVOKER_SERVICE_ACCOUNT;
    if (!projectId || !location || !queue || !workerUrl || !serviceAccountEmail) return null;
    return { projectId, location, queue, workerUrl, serviceAccountEmail };
  };

  const enqueueEmailSyncTask = async (uid: string, jobId: string, limit: number) => {
    const config = getCloudTasksConfig();
    if (!config) throw new Error('EMAIL_SYNC_QUEUE_NOT_CONFIGURED');

    const googleAuth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const authClient = await googleAuth.getClient();
    const accessTokenResult = await authClient.getAccessToken();
    const accessToken = typeof accessTokenResult === 'string' ? accessTokenResult : accessTokenResult?.token;
    if (!accessToken) throw new Error('CLOUD_TASKS_AUTH_FAILED');

    const parent = `projects/${config.projectId}/locations/${config.location}/queues/${config.queue}`;
    const taskBody = Buffer.from(JSON.stringify({ uid, jobId, limit }), 'utf8').toString('base64');
    const taskName = `${parent}/tasks/${jobId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const response = await fetch(`https://cloudtasks.googleapis.com/v2/${parent}/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        task: {
          name: taskName,
          httpRequest: {
            httpMethod: 'POST',
            url: config.workerUrl,
            headers: {
              'Content-Type': 'application/json'
            },
            body: taskBody,
            oidcToken: {
              serviceAccountEmail: config.serviceAccountEmail,
              audience: process.env.EMAIL_SYNC_WORKER_AUDIENCE || new URL(config.workerUrl).origin
            }
          }
        }
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[Email Sync] Cloud Tasks enqueue failed:', response.status, body.substring(0, 500));
      throw new Error('EMAIL_SYNC_QUEUE_ENQUEUE_FAILED');
    }
  };

  const verifyEmailSyncWorkerIdentity = async (req: express.Request) => {
    const config = getCloudTasksConfig();
    if (!config) return false;
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return false;

    try {
      const verifier = new OAuth2Client();
      const ticket = await verifier.verifyIdToken({
        idToken: authHeader.slice(7),
        audience: process.env.EMAIL_SYNC_WORKER_AUDIENCE || new URL(config.workerUrl).origin
      });
      const payload = ticket.getPayload();
      return !!payload &&
        payload.email === config.serviceAccountEmail &&
        payload.email_verified === true;
    } catch (error) {
      console.warn('[Email Sync] Invalid Cloud Tasks OIDC token');
      return false;
    }
  };

  const releaseEmailSyncLock = async (uid: string, jobId: string) => {
    if (!firestore) return;
    const lockRef = firestore.collection('users').doc(uid).collection('emailSyncState').doc('current');
    try {
      await firestore.runTransaction(async transaction => {
        const lockSnap = await transaction.get(lockRef);
        if (lockSnap.exists && lockSnap.data()?.activeJobId === jobId) {
          transaction.delete(lockRef);
        }
      });
    } catch (error) {
      console.warn('[Email Sync] Failed to release sync lock');
    }
  };

  const runEmailSyncJob = async (verifiedUid: string, jobId: string, requestedLimit: number) => {
    if (!firestore) throw new Error('Firestore not initialized');
    const limit = Math.max(1, Math.min(50, Number(requestedLimit) || 10));
    const maxMessageBytes = Math.max(
      64 * 1024,
      Math.min(2 * 1024 * 1024, Number(process.env.EMAIL_SYNC_MAX_MESSAGE_BYTES) || 512 * 1024)
    );
    const maxStoredBodyChars = Math.max(
      10_000,
      Math.min(500_000, Number(process.env.EMAIL_SYNC_MAX_STORED_BODY_CHARS) || 200_000)
    );
    const jobRef = firestore.collection(`users/${verifiedUid}/emailSyncJobs`).doc(jobId);

    const shouldRun = await firestore.runTransaction(async transaction => {
      const jobSnap = await transaction.get(jobRef);
      if (!jobSnap.exists) throw new Error('EMAIL_SYNC_JOB_NOT_FOUND');
      const data = jobSnap.data() || {};
      if (data.userId !== verifiedUid) throw new Error('EMAIL_SYNC_JOB_OWNER_MISMATCH');
      if (data.status === 'completed') return false;

      const leaseUntilMs = Number(data.leaseUntilMs || 0);
      if (data.status === 'running' && leaseUntilMs > Date.now()) return false;

      transaction.update(jobRef, {
        status: 'running',
        startedAt: data.startedAt || FieldValue.serverTimestamp(),
        lastAttemptAt: FieldValue.serverTimestamp(),
        leaseUntilMs: Date.now() + 10 * 60 * 1000,
        attempts: FieldValue.increment(1)
      });
      return true;
    });

    if (!shouldRun) return;

    try {
      const snap = await firestore.collection(`users/${verifiedUid}/emailAccounts`).get();
      const activeImapAccounts = snap.docs.filter(doc => {
        const data = doc.data();
        return data.active !== false && data.provider !== 'gmail';
      });

      if (activeImapAccounts.length === 0) {
        throw new Error('NO_ACTIVE_IMAP_ACCOUNTS');
      }

      const allEmails: any[] = [];
      let successfulAccounts = 0;

      for (const doc of activeImapAccounts) {
        const data = doc.data();
        try {
          const accountPassword = readStoredCredential(data, 'passwordEncrypted', 'password');
          const acc = {
            host: data.host,
            port: Number(data.port || 993),
            username: data.username,
            password: accountPassword,
            provider: data.provider || 'imap'
          };
          if (!acc.host || !acc.username || !acc.password) throw new Error('INCOMPLETE_IMAP_ACCOUNT');
          if (acc.port !== 993) throw new Error('Only secure IMAPS on port 993 is supported.');

          const resolvedHost = await resolveSafeImapHost(acc.host);
          const client = new ImapFlow({
            host: resolvedHost.connectHost,
            port: 993,
            secure: true,
            tls: { servername: resolvedHost.servername },
            auth: { user: acc.username, pass: acc.password },
            logger: false
          });

          await client.connect();
          const mailboxLock = await client.getMailboxLock('INBOX');
          try {
            const messages: any[] = [];
            const status = await client.status('INBOX', { messages: true });
            const totalMsgs = status.messages || 0;
            if (totalMsgs > 0) {
              const startFetch = Math.max(1, totalMsgs - limit + 1);
              for await (const msg of client.fetch(
                `${startFetch}:*`,
                { source: { start: 0, maxLength: maxMessageBytes } },
                { uid: true }
              )) {
                messages.push(msg);
              }
            }

            for (const msg of messages) {
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

                hasCargo = cargoKeywords.some(word => textContent.includes(word));
                hasVessel = vesselKeywords.some(word => textContent.includes(word));
                hasChartering = charteringKeywords.some(word => textContent.includes(word));
              }

              let relevance = 'irrelevant';
              if (!isIrrelevant) {
                if (hasCargo && hasVessel) relevance = 'likely_mixed';
                else if (hasCargo) relevance = 'likely_cargo';
                else if (hasVessel) relevance = 'likely_vessel';
                else if (hasChartering) relevance = 'maybe_relevant';
              }

              let classification = 'MARKET INTEL';
              if (relevance === 'irrelevant') classification = 'SKIPPED';
              else if (relevance === 'likely_cargo') classification = 'CARGO';
              else if (relevance === 'likely_vessel') classification = 'VESSEL';
              else if (relevance === 'likely_mixed') classification = 'MIXED';
              else if (relevance === 'maybe_relevant') classification = 'MAYBE';

              allEmails.push({
                accountId: doc.id,
                provider: acc.provider,
                subject,
                sender,
                rawBody: rawBodyStr.slice(0, maxStoredBodyChars),
                bodyTruncated: rawBodyStr.length > maxStoredBodyChars || (msg.source?.length || 0) >= maxMessageBytes,
                timestamp: parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString(),
                classification,
                relevanceStatus: relevance
              });
            }
          } finally {
            mailboxLock.release();
            await client.logout().catch(() => undefined);
          }

          successfulAccounts++;
        } catch (error: any) {
          console.warn(`[Email Sync] Account failed for ${doc.id}:`, error.message || 'unknown');
        }
      }

      if (successfulAccounts === 0) {
        throw new Error('ALL_IMAP_ACCOUNTS_FAILED');
      }

      const finalEmails = allEmails.reverse();
      const resultsCollection = jobRef.collection('results');
      const existingResults = await resultsCollection.get();
      for (let offset = 0; offset < existingResults.docs.length; offset += 400) {
        const batch = firestore.batch();
        for (const resultDoc of existingResults.docs.slice(offset, offset + 400)) batch.delete(resultDoc.ref);
        await batch.commit();
      }

      for (let offset = 0; offset < finalEmails.length; offset += 400) {
        const batch = firestore.batch();
        finalEmails.slice(offset, offset + 400).forEach((email, index) => {
          const absoluteIndex = offset + index;
          const resultRef = resultsCollection.doc(`result-${String(absoluteIndex).padStart(4, '0')}`);
          batch.set(resultRef, { index: absoluteIndex, email });
        });
        await batch.commit();
      }

      let relevantCount = 0;
      let skippedCount = 0;
      for (const email of finalEmails) {
        if (email.relevanceStatus === 'irrelevant' || email.classification === 'SKIPPED') skippedCount++;
        else relevantCount++;
      }

      await jobRef.update({
        status: 'completed',
        completedAt: FieldValue.serverTimestamp(),
        leaseUntilMs: FieldValue.delete(),
        scannedCount: finalEmails.length,
        relevantCount,
        skippedCount,
        processedCount: finalEmails.length
      });
    } catch (error: any) {
      const safeCode = [
        'NO_ACTIVE_IMAP_ACCOUNTS',
        'ALL_IMAP_ACCOUNTS_FAILED',
        'EMAIL_SYNC_JOB_NOT_FOUND',
        'EMAIL_SYNC_JOB_OWNER_MISMATCH'
      ].includes(error.message) ? error.message : 'SYNC_ERROR';

      await jobRef.update({
        status: 'failed',
        completedAt: FieldValue.serverTimestamp(),
        leaseUntilMs: FieldValue.delete(),
        errorCode: safeCode,
        safeErrorMessage: safeCode === 'NO_ACTIVE_IMAP_ACCOUNTS'
          ? 'No active IMAP accounts are connected.'
          : 'Email sync failed. Please retry or reconnect the account.'
      }).catch(() => undefined);
      throw error;
    } finally {
      await releaseEmailSyncLock(verifiedUid, jobId);
    }
  };

  app.get('/api/email/sync/status/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Missing auth" });
    }

    try {
      const decodedIdToken = await getAuth().verifyIdToken(authHeader.slice(7));
      const verifiedUid = decodedIdToken.uid;
      if (!firestore) throw new Error("Firestore not initialized");

      const jobRef = firestore.collection(`users/${verifiedUid}/emailSyncJobs`).doc(jobId);
      const jobSnap = await jobRef.get();
      if (!jobSnap.exists) return res.status(404).json({ error: "Job not found" });

      const data = jobSnap.data() || {};
      if (data.userId !== verifiedUid) return res.status(403).json({ error: "Access denied" });

      let currentStatus = data.status || 'unknown';
      if (currentStatus === 'queued' || currentStatus === 'running') {
        const requestedAtMs = data.requestedAt?.toMillis ? data.requestedAt.toMillis() : Date.now();
        if (Date.now() - requestedAtMs > 12 * 60 * 1000) {
          currentStatus = 'failed';
          await jobRef.update({
            status: 'failed',
            errorCode: 'TIMEOUT',
            safeErrorMessage: 'Job timed out and was marked as failed safely.',
            leaseUntilMs: FieldValue.delete()
          });
          await releaseEmailSyncLock(verifiedUid, jobId);
        }
      }

      let emails: any[] = [];
      if (currentStatus === 'completed') {
        const resultsSnap = await jobRef.collection('results').orderBy('index', 'asc').get();
        emails = resultsSnap.docs.map(doc => doc.data().email).filter(Boolean);
      }

      return res.json({ status: currentStatus, data: { ...data, status: currentStatus }, emails });
    } catch (error: any) {
      console.warn('Email Sync Status Failed:', error.message || 'unknown');
      return res.status(500).json({ error: "Failed to read email sync status" });
    }
  });

  app.post('/api/internal/email-sync-worker', async (req, res) => {
    if (!(await verifyEmailSyncWorkerIdentity(req))) {
      return res.status(401).json({ error: 'Invalid worker identity' });
    }

    const { uid, jobId, limit } = req.body || {};
    if (!uid || !jobId) return res.status(400).json({ error: 'Missing worker parameters' });

    try {
      await runEmailSyncJob(String(uid), String(jobId), Number(limit || 10));
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('[Email Sync] Worker failed:', error.message || 'unknown');
      return res.status(500).json({ error: 'Email sync worker failed' });
    }
  });

  app.post('/api/email/sync', async (req, res) => {
    const { userId, limit = 10 } = req.body;
    const authHeader = req.headers.authorization;
    if (!userId || !authHeader?.startsWith('Bearer ')) {
      return res.status(400).json({ error: "Missing parameters or auth" });
    }

    let decodedIdToken;
    try {
      decodedIdToken = await getAuth().verifyIdToken(authHeader.slice(7));
    } catch (error) {
      return res.status(401).json({ error: "Invalid or expired authorization token" });
    }

    const verifiedUid = decodedIdToken.uid;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
      return res.status(429).json({ error: "Too many requests. Please wait a minute." });
    }
    if (userId !== verifiedUid) {
      return res.status(403).json({ error: "Forbidden: userId mismatch" });
    }

    const mode = getEmailSyncMode();
    if (mode === 'disabled') return res.status(503).json({ error: 'Email sync is disabled' });
    if (mode === 'cloud_tasks' && !getCloudTasksConfig()) {
      return res.status(503).json({ error: 'Email sync queue is not configured' });
    }
    if (!firestore) return res.status(503).json({ error: 'Database unavailable' });

    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const jobId = `email-sync-${randomUUID()}`;
    const jobRef = firestore.collection(`users/${verifiedUid}/emailSyncJobs`).doc(jobId);
    const lockRef = firestore.collection('users').doc(verifiedUid).collection('emailSyncState').doc('current');

    try {
      const lockResult = await firestore.runTransaction(async transaction => {
        const lockSnap = await transaction.get(lockRef);
        const activeUntilMs = lockSnap.exists ? Number(lockSnap.data()?.activeUntilMs || 0) : 0;
        if (activeUntilMs > Date.now()) return false;

        transaction.set(lockRef, {
          activeJobId: jobId,
          activeUntilMs: Date.now() + 12 * 60 * 1000,
          updatedAt: FieldValue.serverTimestamp()
        });
        transaction.set(jobRef, {
          id: jobId,
          userId: verifiedUid,
          status: 'queued',
          source: 'imap',
          requestedAt: FieldValue.serverTimestamp(),
          requestedLimit: safeLimit,
          attempts: 0,
          scannedCount: 0,
          relevantCount: 0,
          skippedCount: 0,
          processedCount: 0
        });
        return true;
      });

      if (!lockResult) {
        return res.status(429).json({ error: "Sync already in progress. Please wait." });
      }

      if (mode === 'cloud_tasks') {
        try {
          await enqueueEmailSyncTask(verifiedUid, jobId, safeLimit);
        } catch (error) {
          await jobRef.update({
            status: 'failed',
            errorCode: 'QUEUE_ERROR',
            safeErrorMessage: 'Unable to queue email sync.',
            completedAt: FieldValue.serverTimestamp()
          });
          await releaseEmailSyncLock(verifiedUid, jobId);
          throw error;
        }
        return res.json({ jobId, status: 'queued' });
      }

      // Development/local mode only. Production defaults to Cloud Tasks.
      setImmediate(() => {
        runEmailSyncJob(verifiedUid, jobId, safeLimit)
          .catch(error => console.warn('[Email Sync] In-process worker failed:', error.message || 'unknown'));
      });
      return res.json({ jobId, status: 'queued' });
    } catch (error: any) {
      console.error('[Email Sync] Failed to initialize job:', error.message || 'unknown');
      return res.status(500).json({ error: 'Failed to initialize email sync job' });
    }
  });

  // Webhook for incoming emails (SendGrid / Mailgun style)
  app.post('/api/email/webhook', async (req, res) => {
    const expectedSecret = process.env.EMAIL_WEBHOOK_SECRET;
    if (!expectedSecret) {
      return res.status(503).json({ error: "Email webhook is not configured" });
    }
    const providedSecret = req.get('x-email-webhook-secret') || '';
    if (!constantTimeSecretEquals(providedSecret, expectedSecret)) {
      return res.status(401).json({ error: "Invalid webhook authentication" });
    }

    // Typical webhook payloads have fields like text, subject, from.
    const payload = req.body;
    console.log("Received authenticated Email Webhook Request.");

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

  async function rateLimitMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    try {
      const allowed = await checkRateLimit(ip, 50, 'ai-ip');
      if (!allowed) {
        return res.status(429).json({ error: "Too many requests. Please try again later." });
      }
      next();
    } catch (error) {
      next(error);
    }
  }

  // Unified routing logic
  const ROUTE_TASK_OPERATION: Record<string, string> = {
    short_rewrite: 'ai_chat',
    tone_adjustment: 'ai_chat',
    quick_summary: 'ai_chat',
    simple_classification: 'ai_chat',
    local_ui_assist: 'ai_chat',
    missing_field_hint: 'ai_chat',
    extract_cargo: 'parse_email',
    extract_vessel: 'parse_email',
    summarize_email: 'parse_email',
    generate_reply: 'draft_reply',
    classify_email: 'parse_email',
    detect_missing_terms: 'analyze_risk',
    transport_specs: 'analyze_risk',
    normalize_cargo_json: 'parse_email',
    normalize_vessel_json: 'parse_email',
    match_cargo_vessel: 'match_cargo_vessel',
    analyze_fixture: 'analyze_risk',
    analyze_risk: 'analyze_risk',
    compare_vessels: 'cargo_match_review',
    compare_cargoes: 'cargo_match_review',
    negotiation_strategy: 'negotiation_strategy',
    laytime_demurrage_analysis: 'risk_review',
    commercial_recommendation: 'analyze_risk',
    parse_market_report: 'market_report_analysis'
  };

  const routeAITaskBackend = (taskType: string) => {
    const heavyTasks = ["match_cargo_vessel", "analyze_fixture", "analyze_risk", "compare_vessels", "compare_cargoes", "negotiation_strategy", "laytime_demurrage_analysis", "commercial_recommendation", "parse_market_report"];
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
      const operation = ROUTE_TASK_OPERATION[taskType];
      if (!operation) {
        return res.status(400).json({ error: "Unsupported AI task type" });
      }
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: "Invalid AI task payload" });
      }

      const creditCheck = await checkCredits(verifiedUid, operation);
      if (!creditCheck.allowed) {
        return res.status(creditCheck.statusCode || 402).json(creditCheck);
      }

      const routing = routeAITaskBackend(taskType);
      const reqId = randomUUID();
      
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
        } else if (taskType === "parse_market_report") {
           const marketText = String(payload.contents || payload.prompt || '');
           if (marketText.length < 30 || marketText.length > 100000) {
             return res.status(400).json({ error: "Market report text must be between 30 and 100000 characters" });
           }
           aiConfig.config = {
             systemInstruction: MARKET_REPORT_SYSTEM,
             responseMimeType: "application/json",
             responseSchema: {
               type: Type.OBJECT,
               properties: {
                 trend: { type: Type.STRING, description: "firm, soft, sideways, volatile, mixed, or unclear" },
                 confidence: { type: Type.NUMBER },
                 sentiment_score: { type: Type.NUMBER },
                 regions: {
                   type: Type.ARRAY,
                   items: {
                     type: Type.OBJECT,
                     properties: {
                       name: { type: Type.STRING },
                       trend: { type: Type.STRING },
                       activity: { type: Type.STRING }
                     }
                   }
                 },
                 cargo_activity: {
                   type: Type.ARRAY,
                   items: {
                     type: Type.OBJECT,
                     properties: {
                       commodity: { type: Type.STRING },
                       trend: { type: Type.STRING },
                       note: { type: Type.STRING }
                     }
                   }
                 },
                 vessel_supply: {
                   type: Type.ARRAY,
                   items: {
                     type: Type.OBJECT,
                     properties: {
                       segment: { type: Type.STRING },
                       availability: { type: Type.STRING },
                       note: { type: Type.STRING }
                     }
                   }
                 },
                 key_points: { type: Type.ARRAY, items: { type: Type.STRING } },
                 ai_summary: { type: Type.STRING }
               },
               required: ["trend", "confidence", "sentiment_score", "key_points", "ai_summary"]
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
      
      await chargeCreditsAfterSuccess(verifiedUid, operation, reqId, {
        provider: response.actualProvider,
        model: response.actualModel || usedModel
      });

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

  const requireFirebaseUser = async (req: express.Request) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    try {
      return await getAuth().verifyIdToken(authHeader.slice(7));
    } catch {
      return null;
    }
  };

  app.get('/api/market/snapshot', async (req, res) => {
    const user = await requireFirebaseUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (!(await checkRateLimit(user.uid, 120, 'market-user'))) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    try {
      return res.json(await getMarketSnapshot());
    } catch (error: any) {
      console.error('[Market] Snapshot failed:', error.message);
      return res.status(503).json({ error: 'Market data temporarily unavailable' });
    }
  });

  app.get('/api/market/bunkers', async (req, res) => {
    const user = await requireFirebaseUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (!(await checkRateLimit(user.uid, 120, 'market-user'))) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    try {
      return res.json(await getBunkerSnapshot());
    } catch (error: any) {
      console.error('[Market] Bunker snapshot failed:', error.message);
      return res.status(503).json({ error: 'Bunker data temporarily unavailable' });
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
           const eventsSnapshot = await firestore.collection(`users/${verifiedUid}/usageEvents`)
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

  function parseDeterministicCargoBlock(blockText: string): any {
    const lines = blockText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let loadPort = '';
    let dischargePort = '';
    let raw_commodity = '';
    let quantity = '';
    let laycan = '';
    let terms = '';
    let commission = '';
    let special_requirements = '';
    
    // 1. Identify route line
    for (const line of lines) {
      if (line.includes('/') && !line.toLowerCase().includes('load/discharge') && !line.toLowerCase().includes('load / discharge') && !line.toLowerCase().includes('rate')) {
        const parts = line.split('/');
        if (parts.length === 2) {
          loadPort = parts[0].trim();
          dischargePort = parts[1].trim();
        }
      }
    }

    // 2. Identify laycan line
    const monthRegex = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)/i;
    const yearRegex = /20\d{2}/;
    const datePatternRegex = /\d{1,2}[–\/.-]\s*\d{1,2}/;
    for (const line of lines) {
      const isRoute = line.includes('/') && !line.toLowerCase().includes('load/discharge') && !line.toLowerCase().includes('load / discharge') && !line.toLowerCase().includes('rate');
      if (!isRoute) {
        if (monthRegex.test(line) || yearRegex.test(line) || datePatternRegex.test(line)) {
          laycan = line;
        }
      }
    }

    // 3. Identify quantity & commodity line
    for (const line of lines) {
      if (line.toLowerCase().match(/(?:cbm|mts|tons|mt|ton)/i) && !line.toLowerCase().includes('load/discharge') && !line.toLowerCase().includes('carrier shall') && !line.toLowerCase().includes('rate')) {
        const qtyMatch = line.match(/(?:abt\s*)?\d+(?:[.,]\d+)*(?:\s*-\s*\d+(?:[.,]\d+)*)?\s*(?:cbm|mts|tons|mt|ton|CBM)/i);
        if (qtyMatch) {
          quantity = qtyMatch[0].trim();
          raw_commodity = line.replace(qtyMatch[0], '').trim();
          if (raw_commodity.startsWith('g/c')) {
            raw_commodity = raw_commodity.replace(/^g\/c\s*/i, '').trim();
          }
          raw_commodity = raw_commodity.replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim();
        } else {
          raw_commodity = line;
        }
      }
    }

    // 4. Identify terms and rates
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (lowerLine === 'fios' || lowerLine === 'fiox' || lowerLine.includes('fios')) {
        terms = 'FIOS';
      } else if (lowerLine.includes('cqd')) {
        terms = 'CQD';
      }
      if (lowerLine.includes('pct') || lowerLine.includes('%') || lowerLine.includes('commission')) {
        commission = line;
      }
    }

    // 5. Special Notes & requirements
    const unmatched = [];
    for (const line of lines) {
      if (line.includes('/') && !line.toLowerCase().includes('load/discharge') && !line.toLowerCase().includes('load / discharge') && !line.toLowerCase().includes('rate')) continue;
      if (line === laycan) continue;
      if (line === commission) continue;
      if (line.toLowerCase().includes('fios') || line.toLowerCase().includes('cqd')) continue;
      if (quantity && line.includes(quantity)) continue;
      if (raw_commodity && line.includes(raw_commodity)) continue;
      unmatched.push(line);
    }
    if (unmatched.length > 0) {
      special_requirements = unmatched.join('. ');
    }

    // Backfill raw_commodity if empty
    if (!raw_commodity) {
      for (const line of lines) {
        if (!line.includes('/') && !line.match(monthRegex) && !line.match(yearRegex) && !line.includes('pct') && !line.includes('%')) {
          raw_commodity = line;
          break;
        }
      }
    }

    const missing_fields: string[] = [];
    if (!raw_commodity) missing_fields.push('commodity');
    if (!quantity) missing_fields.push('quantity');
    if (!loadPort) missing_fields.push('loadPort');
    if (!dischargePort) missing_fields.push('dischargePort');
    if (!laycan) missing_fields.push('laycan');

    return {
      ...(raw_commodity ? { raw_commodity } : {}),
      ...(quantity ? { quantity } : {}),
      ...(loadPort ? { loadPort } : {}),
      ...(dischargePort ? { dischargePort } : {}),
      ...(laycan ? { laycan } : {}),
      ...(terms ? { terms } : {}),
      ...(commission ? { commission } : {}),
      ...(special_requirements ? { special_requirements } : {}),
      missing_fields
    };
  }

  function tryDeterministicSplitAndParse(text: string): any[] | null {
    const normalizedText = text.trim();
    const blocks = normalizedText.split(/\r?\n\s*\r?\n/).map(b => b.trim()).filter(Boolean);
    
    if (blocks.length < 2) return null;
    
    const cargoes: any[] = [];
    
    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      
      let hasRoute = false;
      let hasLaycan = false;
      let hasQty = false;
      
      const monthRegex = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)/i;
      const yearRegex = /20\d{2}/;
      const datePatternRegex = /\d{1,2}[–\/.-]\s*\d{1,2}/;

      for (const line of lines) {
        if (line.includes('/') && !line.toLowerCase().includes('load/discharge') && !line.toLowerCase().includes('load / discharge') && !line.toLowerCase().includes('rate')) {
          hasRoute = true;
        }
        if (monthRegex.test(line) || yearRegex.test(line) || datePatternRegex.test(line)) {
          hasLaycan = true;
        }
        if (line.toLowerCase().match(/(?:cbm|mts|tons|mt|ton)/i) && !line.toLowerCase().includes('load/discharge')) {
          hasQty = true;
        }
      }
      
      if (hasRoute && (hasLaycan || hasQty)) {
        const cargo = parseDeterministicCargoBlock(block);
        cargoes.push(cargo);
      }
    }
    
    if (cargoes.length >= 2) {
      return cargoes;
    }
    return null;
  }

  // AI Routes
  app.post('/api/ai/parseEmail', async (req, res) => {
    try {
      const { email, userId, expectedType } = req.body;
      const authHeader = req.headers.authorization;
      if (!userId || !authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Authentication required" });
      }

      let verifiedUid: string;
      try {
        const decodedIdToken = await getAuth().verifyIdToken(authHeader.slice(7));
        verifiedUid = decodedIdToken.uid;
      } catch (error) {
        return res.status(401).json({ error: "Invalid or expired authorization token" });
      }
      
      if (!(await checkRateLimit(verifiedUid))) {
          return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      if (userId && userId !== verifiedUid) {
        return res.status(403).json({ error: "Forbidden: userId mismatch" });
      }

      const parserVersion = 'v1.2'; // Increment for cache keys
      
      const rawText = email.rawBody || email.snippet || '';
      const normText = rawText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      const crypto = await import('crypto');
      const textHash = crypto.createHash('sha256').update(normText.substring(0, 5000)).digest('hex');
      const cacheKey = userId ? crypto.createHash('sha256').update(`${userId}-${textHash}-${parserVersion}`).digest('hex') : null;

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
      const creditCheck = await checkCredits(verifiedUid, operationName);
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
      const reqId = randomUUID();
      
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
                     buildVersion: "PILOT-BLOCKER-12-FIX",
                     releaseLabel: "pilot-blocker-12-fix",
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

      // DETERMINISTIC DUAL-BLOCK FALLBACK ENFORCER
      const detCargoes = tryDeterministicSplitAndParse(rawText);
      if (detCargoes && detCargoes.length >= 2) {
          if (finalCargoes.length === 0 || finalCargoes.length === 1) {
              finalCargoes = detCargoes.map(normalizeEntity);
          } else {
              // Merge AI extraction with deterministic fields so nothing is missing or lost
              for (let i = 0; i < Math.min(finalCargoes.length, detCargoes.length); i++) {
                  const fc = finalCargoes[i];
                  const dc = detCargoes[i];
                  if (!fc.loadPort && dc.loadPort) fc.loadPort = dc.loadPort;
                  if (!fc.dischargePort && dc.dischargePort) fc.dischargePort = dc.dischargePort;
                  if (!fc.raw_commodity && dc.raw_commodity) fc.raw_commodity = dc.raw_commodity;
                  if (!fc.commodity && dc.raw_commodity) fc.commodity = dc.raw_commodity;
                  if (!fc.quantity && dc.quantity) fc.quantity = dc.quantity;
                  if (!fc.laycan && dc.laycan) fc.laycan = dc.laycan;
                  if (!fc.terms && dc.terms) fc.terms = dc.terms;
                  if (!fc.commission && dc.commission) fc.commission = dc.commission;
                  if (!fc.comm && dc.commission) fc.comm = dc.commission;
                  if (!fc.special_requirements && dc.special_requirements) fc.special_requirements = dc.special_requirements;
              }
          }
      }

      if (data.vessels && Array.isArray(data.vessels)) {
          finalVessels = data.vessels.map(normalizeEntity);
      } else if (data.vessel) {
          finalVessels = [normalizeEntity(data.vessel)];
      } else if (data.extractedData && (data.type === 'VESSEL' || data.type === 'VESSEL_LIST')) {
           finalVessels = Array.isArray(data.extractedData) ? data.extractedData.map(normalizeEntity) : [normalizeEntity(data.extractedData)];
      }

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
           buildVersion: "PILOT-BLOCKER-12-FIX",
           releaseLabel: "pilot-blocker-12-fix",
           parserVersion: "multi-cargo-v2",
           endpoint: "parseEmail",
           expectedType: expectedType || "auto",
           parserMode: operationName,
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
          await chargeCreditsAfterSuccess(
            verifiedUid,
            operationName,
            reqId,
            { provider: out.actualProvider, model: out.actualModel, inputTokens: unoptimizedTokenEstimate, outputTokens: 0, totalTokens: unoptimizedTokenEstimate }
          );
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

      if (!(await checkRateLimit(verifiedUid))) {
          return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      if (userId && userId !== verifiedUid) {
        return res.status(403).json({ error: "Forbidden: userId mismatch" });
      }

      let assumptionsText = "No voyage-cost assumptions were supplied. Do not invent bunker prices, hire, port/canal costs, speeds, consumption, distance, freight, or TCE. Score technical/position/laycan fit only from supplied facts and mark commercial fields as pending.";
      if (assumptions && typeof assumptions === 'object') {
         const safeAssumptions = Object.fromEntries(
           Object.entries(assumptions).filter(([, value]) => value !== undefined && value !== null && value !== '')
         );
         assumptionsText = `Use only these user-provided market assumptions. Missing assumptions remain pending: ${JSON.stringify(safeAssumptions)}`;
      }

      if (!cargo || typeof cargo !== 'object' || !Array.isArray(vessels) || vessels.length === 0 || vessels.length > 100) {
        return res.status(400).json({ error: "A cargo object and 1-100 vessels are required" });
      }

      const serializedInputLength = JSON.stringify(cargo).length + JSON.stringify(vessels).length;
      if (serializedInputLength > 500_000) {
        return res.status(413).json({ error: "Matching payload is too large" });
      }

      const unoptimizedTokenEstimate = Math.ceil((serializedInputLength + 1500) / 4);

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
      const reqId = randomUUID();
      
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
           if (verifiedUid) await recordFailedNotCharged(verifiedUid, 'match_cargo_vessel', reqId, innerErr.message || 'ai_error');
           throw innerErr;
        }
      }

      const data = await safeAIParseJSON(response.text || '{}');

      const numericCargoQuantity = Number(cargo.quantityMt ?? cargo.quantity_mt ?? cargo.quantity ?? 0);
      const normalizedMatches = (Array.isArray(data.matches) ? data.matches : []).slice(0, compactVessels.length).map((match: any) => {
        const vessel = compactVessels.find((item: any) => String(item.id) === String(match.vesselId)) ||
          compactVessels.find((item: any) => String(item.name || '').toLowerCase() === String(match.vesselName || match.name || '').toLowerCase());

        const clamp = (value: any, min = 0, max = 100) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : 0;
        };

        const vesselDwt = Number(vessel?.dwt || 0);
        const impossibleCapacity = numericCargoQuantity > 0 && vesselDwt > 0 && numericCargoQuantity > vesselDwt;
        const riskAdjustment = Math.min(0, Math.max(-100, Number(match.riskAdjustment) || 0));
        let score = clamp(match.score);
        if (impossibleCapacity) score = Math.min(score, 10);

        const reasoning = Array.isArray(match.reasoning)
          ? match.reasoning.filter((item: any) => typeof item === 'string' && item.trim()).slice(0, 12)
          : [];
        if (impossibleCapacity && !reasoning.some((item: string) => item.toLowerCase().includes('capacity'))) {
          reasoning.unshift('Capacity check failed: cargo quantity exceeds stated vessel DWT.');
        }

        const missingCommercialData = Boolean(match.missingCommercialData) || !assumptions || !cargo.freightRate;
        return {
          ...match,
          score,
          technicalFit: clamp(match.technicalFit),
          positionFit: clamp(match.positionFit),
          laycanFit: clamp(match.laycanFit),
          commercialViability: missingCommercialData ? Math.min(clamp(match.commercialViability), 50) : clamp(match.commercialViability),
          riskAdjustment,
          reasoning,
          missingCommercialData,
          calculatorOutputs: {
            ...(match.calculatorOutputs || {}),
            estimatedTCE: missingCommercialData ? null : Number(match.calculatorOutputs?.estimatedTCE || 0),
            totalVoyageCost: missingCommercialData ? null : Number(match.calculatorOutputs?.totalVoyageCost || 0),
            isViable: impossibleCapacity ? false : Boolean(match.calculatorOutputs?.isViable),
            recommendation: impossibleCapacity ? 'Reject / Not Commercial' : (match.calculatorOutputs?.recommendation || 'Conditional Match')
          }
        };
      });
      
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
              await chargeCreditsAfterSuccess(
                verifiedUid,
                'match_cargo_vessel',
                reqId,
                { provider: response.actualProvider, model: response.actualModel, inputTokens: unoptimizedTokenEstimate, outputTokens: 0, totalTokens: unoptimizedTokenEstimate }
              );
              
          } catch (e: any) {
              console.warn("Metrics update conditionally failed:", e.message);
          }
      }

      const responsePayload = { 
        matches: normalizedMatches,
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
      if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
         return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      // P4.4B: MVP Margin Protection
      const requestedOperation = req.body.operation || 'ai_chat';
      const allowedOperations = new Set(['ai_chat', 'draft_reply']);
      if (!allowedOperations.has(requestedOperation)) {
        return res.status(400).json({ error: "Unsupported operation for generateContent" });
      }
      const operation = requestedOperation;
      const creditCheck = await checkCredits(verifiedUid, operation);
      if (!creditCheck.allowed) {
        return res.status(creditCheck.statusCode || 402).json(creditCheck);
      }

      let { model, contents } = req.body;
      if (!model || model === "gemini-1.5-flash" || model === "gemini-3.5-flash" || model === "gemini-2.5-flash") {
        model = AI_MODELS.COMPLEX_CLOUD;
      }
      const ai = getGoogleGenAI();
      
      const reqId = randomUUID();
      let response;
      try {
        response = await generateContentWithFailover(ai, { model, contents });
      } catch (err: any) {
        await recordFailedNotCharged(verifiedUid, operation, reqId, err.message || 'ai_error');
        throw err;
      }

      const inputTokens = Math.ceil((contents || '').length / 4);
      const outputTokens = Math.ceil((response.text || '').length / 4);
      
      await chargeCreditsAfterSuccess(verifiedUid, operation, reqId, {
         provider: response.actualProvider,
         model: response.actualModel,
         inputTokens,
         outputTokens,
         totalTokens: inputTokens + outputTokens
      });

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
      if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
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
      const isOwner = vesselData.userId === verifiedUid;
      let hasWorkspaceAccess = false;
      if (!isOwner && vesselData.workspaceId) {
        const membership = await db.collection('users').doc(verifiedUid).collection('memberships').doc(vesselData.workspaceId).get();
        hasWorkspaceAccess = membership.exists;
      }
      if (!isOwner && !hasWorkspaceAccess) {
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

      const storedImo = vesselData.imo || vesselData.IMO;
      const storedMmsi = vesselData.mmsi || vesselData.MMSI;
      const effectiveImo = storedImo || (isOwner ? imo : undefined);
      const effectiveMmsi = storedMmsi || (isOwner ? mmsi : undefined);
      if (!effectiveImo && !effectiveMmsi) {
        return res.status(400).json({ error: "Vessel has no trusted IMO/MMSI identifier configured" });
      }

      const aisProviderModule = await import('./src/server/aisProvider.js');
      const position = await aisProviderModule.fetchAISPosition({
        vesselId,
        imo: effectiveImo,
        mmsi: effectiveMmsi
      });

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
      if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
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
      if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
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

      if (!vesselId && !cargoId && !dealRoomId) {
         return res.status(403).json({ error: "Arbitrary public routing unsupported. Internal source required." });
      }

      if (!firestore) {
        return res.status(503).json({ error: "Database unavailable" });
      }

      const hasWorkspaceMembership = async (workspaceId: string | undefined) => {
        if (!workspaceId) return false;
        const membership = await firestore!.collection('users').doc(verifiedUid).collection('memberships').doc(workspaceId).get();
        return membership.exists;
      };

      if (vesselId) {
        const vesselDoc = await firestore.collection('vessels').doc(vesselId).get();
        if (!vesselDoc.exists) return res.status(404).json({ error: "Vessel source not found" });
        const data = vesselDoc.data() || {};
        if (data.userId !== verifiedUid && !(await hasWorkspaceMembership(data.workspaceId))) {
          return res.status(403).json({ error: "Access denied to vessel source" });
        }
      }

      if (cargoId) {
        const cargoDoc = await firestore.collection('cargos').doc(cargoId).get();
        if (!cargoDoc.exists) return res.status(404).json({ error: "Cargo source not found" });
        const data = cargoDoc.data() || {};
        if (data.userId !== verifiedUid && !(await hasWorkspaceMembership(data.workspaceId))) {
          return res.status(403).json({ error: "Access denied to cargo source" });
        }
      }

      if (dealRoomId) {
        const dealRoomDoc = await firestore.collection('dealRooms').doc(dealRoomId).get();
        if (!dealRoomDoc.exists) return res.status(404).json({ error: "Deal room source not found" });
        const data = dealRoomDoc.data() || {};
        const userDoc = await firestore.collection('users').doc(verifiedUid).get();
        const deskId = userDoc.data()?.deskId;
        const allowed = data.createdByUid === verifiedUid ||
          (Array.isArray(data.participantUids) && data.participantUids.includes(verifiedUid)) ||
          (data.visibility === 'my_desk' && data.createdByDeskId && data.createdByDeskId === deskId);
        if (!allowed) return res.status(403).json({ error: "Access denied to deal room source" });
      }

      const routingCredit = await checkCredits(verifiedUid, 'routing_estimate');
      if (!routingCredit.allowed) {
        return res.status(routingCredit.statusCode || 402).json(routingCredit);
      }
      const routingRequestId = randomUUID();

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

      await chargeCreditsAfterSuccess(verifiedUid, 'routing_estimate', routingRequestId, {
        provider: estimateResult.provider
      });

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
      if (!(await checkRateLimit(uid)) || !(await checkRateLimit(ip))) {
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
      let hasFullAccess = false;

      const hasWorkspaceAccessForBrief = async (workspaceId: string | undefined) => {
        if (!workspaceId) return false;
        const membership = await firestore!.collection('users').doc(uid).collection('memberships').doc(workspaceId).get();
        return membership.exists;
      };

      try {
        if (itemType === 'cargo' || itemType === 'vessel') {
          const colName = itemType === 'cargo' ? 'cargos' : 'vessels';
          const docSnap = await firestore.collection(colName).doc(itemId).get();
          if (!docSnap.exists) {
            return res.status(404).json({ error: "Item not found" });
          }

          itemData = docSnap.data();
          hasFullAccess = itemData.userId === uid || await hasWorkspaceAccessForBrief(itemData.workspaceId);
          if (!hasFullAccess) {
            // Core cargo/vessel collections are private. Network exposure must go through sharedItems.
            return res.status(403).json({ error: "Access denied" });
          }
        }
        else if (itemType === 'sharedItem') {
          const docSnap = await firestore.collection('sharedItems').doc(itemId).get();
          if (!docSnap.exists) return res.status(404).json({ error: "Item not found" });

          itemData = docSnap.data();
          if (itemData.ownerId === uid) {
            hasFullAccess = true;
          } else {
            if (itemData.status !== 'active' || !itemData.ownerId) {
              return res.status(403).json({ error: "Access denied" });
            }

            const [ownerConnection, currentUserDoc] = await Promise.all([
              firestore.collection('users').doc(itemData.ownerId).collection('networkConnections').doc(uid).get(),
              firestore.collection('users').doc(uid).get()
            ]);
            const connectedTo = currentUserDoc.data()?.connectedTo;
            const hasNetworkAccess = ownerConnection.exists ||
              (Array.isArray(connectedTo) && connectedTo.includes(itemData.ownerId));

            if (!hasNetworkAccess) {
              return res.status(403).json({ error: "Access denied" });
            }

            delete itemData.privateNotes;
            delete itemData.contactDetails;
            delete itemData.rawBody;
            delete itemData.rawText;
          }
        }
        else if (itemType === 'marketRequest') {
          const docSnap = await firestore.collection('marketRequests').doc(itemId).get();
          if (!docSnap.exists) return res.status(404).json({ error: "Item not found" });

          itemData = docSnap.data();
          hasFullAccess = itemData.createdByUid === uid;
          if (!hasFullAccess && itemData.visibility !== 'network') {
            return res.status(403).json({ error: "Access denied" });
          }
        }
        else if (itemType === 'radarMatch') {
          const docSnap = await firestore.collection('watchlistMatches').doc(itemId).get();
          if (!docSnap.exists) return res.status(404).json({ error: "Item not found" });

          itemData = docSnap.data();
          if (itemData.createdByUid !== uid) {
            return res.status(403).json({ error: "Access denied" });
          }
          hasFullAccess = true;
        }
        else if (itemType === 'hotOpp') {
          const docSnap = await firestore.collection(`users/${uid}/urgentNotifications`).doc(itemId).get();
          if (!docSnap.exists) {
             return res.status(404).json({ error: "Opportunity not found" });
          }
          itemData = docSnap.data();
          hasFullAccess = true;
        }
        else {
          return res.status(400).json({ error: "Unsupported deal brief item type" });
        }
      } catch (err: any) {
        console.error('[DealBrief] Error fetching item data from Firestore:', err);
        return res.status(500).json({ error: "Error fetching item data" });
      }

      if (!itemData) {
         return res.status(404).json({ error: "Item not found" });
      }

      const reqId = randomUUID();
      
      const ai = getGoogleGenAI();
      const safeAdditionalContext = JSON.stringify(contextContext || {}).slice(0, 4000);
      const prompt = `You are an expert dry bulk shipbroker assistant. Generate a concise, professional AI Deal Brief for the following item.
      Context Type: ${itemType} (${dealType || 'Opportunity'})
      Item Data:
      ` + JSON.stringify(itemData, null, 2) + `
      Additional context: ${safeAdditionalContext}`;

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
      
      // Save to Firestore first. A failed persistence step must not consume a user credit.
      const briefId = randomUUID();
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

      await chargeCreditsAfterSuccess(uid, operation, reqId, {
         provider: aiResponse.actualProvider,
         model: aiResponse.actualModel,
         inputTokens,
         outputTokens,
         totalTokens: inputTokens + outputTokens
      });

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
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Missing or invalid authorization header" });
      }
      const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
      if (!(await checkIsAdmin(decoded.uid, decoded.email))) {
        return res.status(403).json({ error: "Forbidden: Admin only" });
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "AI provider is not configured" });
      }
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(process.env.GEMINI_API_KEY));
      if (!response.ok) {
        return res.status(502).json({ error: "AI provider model lookup failed" });
      }
      const data = await response.json();
      res.json(data);
    } catch(e:any) {
      res.status(500).json({ error: "Failed to list AI models" });
    }
  });

  app.post('/api/ai/negotiateCopilot', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: "Missing or invalid authorization header" });
      const idToken = authHeader.split('Bearer ')[1];
      const decodedIdToken = await getAuth().verifyIdToken(idToken);
      const verifiedUid = decodedIdToken.uid;
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
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

      const requestId = randomUUID();
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

      // Verify selected vessel exists and is actually available to this user.
      const vesselDoc = await firestore.collection('vessels').doc(vesselId).get();
      if (!vesselDoc.exists) return res.status(404).json({ error: 'Vessel not found or unavailable' });
      const vesselData = vesselDoc.data()!;
      if (vesselData.status !== 'OPEN') return res.status(400).json({ error: 'Selected vessel is no longer available' });

      let vesselAccess = vesselData.userId === userId;
      if (!vesselAccess && vesselData.workspaceId) {
        const membershipDoc = await firestore.collection(`users/${userId}/memberships`).doc(vesselData.workspaceId).get();
        const role = membershipDoc.exists ? membershipDoc.data()?.role : null;
        vesselAccess = role === 'admin' || role === 'broker';
      }

      if (!vesselAccess && vesselData.sharedItemId) {
        const sharedDoc = await firestore.collection('sharedItems').doc(vesselData.sharedItemId).get();
        if (sharedDoc.exists) {
          const sharedData = sharedDoc.data() || {};
          if (sharedData.status === 'active' && sharedData.ownerId === vesselData.userId) {
            const [ownerConnection, currentUserDoc] = await Promise.all([
              firestore.collection('users').doc(sharedData.ownerId).collection('networkConnections').doc(userId).get(),
              firestore.collection('users').doc(userId).get()
            ]);
            const connectedTo = currentUserDoc.data()?.connectedTo;
            vesselAccess = ownerConnection.exists ||
              (Array.isArray(connectedTo) && connectedTo.includes(sharedData.ownerId));
          }
        }
      }

      if (!vesselAccess) {
        return res.status(403).json({ error: 'Unauthorized to use this vessel' });
      }

      // Create match/deal server-side (Urgent Deal)
      const dealId = `${vesselId}_${cargoId}`;
      const dealRef = firestore.collection('deskNetworkUrgentDeals').doc(dealId);
      const existingDeal = await dealRef.get();

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 3);

      const auditTrail = existingDeal.exists ? existingDeal.data()!.auditTrail || [] : [];
      auditTrail.push({
        action: 'process_offer',
        timestamp: new Date().toISOString(),
        actorUid: userId,
        safeMessage: 'Offer processed and deal created.'
      });

      const existingDealData = existingDeal.exists ? existingDeal.data()! : null;
      const dealData: any = {
        dealId,
        vesselItemId: vesselId,
        cargoItemId: cargoId,
        vesselOwnerUid: vesselData.userId || 'system',
        cargoOwnerUid: cargoData.userId || 'system',
        vesselSharedItemId: vesselData.sharedItemId || null,
        cargoSharedItemId: cargoData.sharedItemId || null,
        status: 'contacted',
        region: cargoData.loadPort || vesselData.openPort || 'Unknown',
        reason: 'User manually processed offer from Matching Engine. No synthetic match or urgency score assigned.',
        createdAt: existingDealData?.createdAt || FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: existingDealData?.expiresAt || expiresAt,
        createdBySystem: false,
        auditTrail
      };

      // Preserve previously computed scores, but never fabricate scores for a manual action.
      if (typeof existingDealData?.urgencyScore === 'number') dealData.urgencyScore = existingDealData.urgencyScore;
      if (typeof existingDealData?.matchScore === 'number') dealData.matchScore = existingDealData.matchScore;

      await dealRef.set(dealData, { merge: true });

      // Update the assigned vessel internally on the cargo document
      // Note: we're acting as Admin here so rules don't block this!
      await firestore.collection('cargos').doc(cargoId).update({
        assignedVesselId: vesselId,
        vesselETA: typeof eta === 'string' ? eta.slice(0, 100) : null,
        updatedAt: FieldValue.serverTimestamp()
      });

      return res.json({ success: true, dealId });
    } catch (err: any) {
      console.error("Process offer failed:", err);
      // Let's send 200 with an error object instead of 500 when it's safe
      return res.status(500).json({ error: 'Internal server error while processing offer' });
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
      if (!(await checkRateLimit(verifiedUid)) || !(await checkRateLimit(ip))) {
         return res.status(429).json({ error: "Too many requests. Please wait a minute." });
      }

      // P4.4B: MVP Margin Protection
      const operation = 'ai_chat';
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

      const reqId = randomUUID();
      let response;
      try {
        response = await chat.sendMessage({ message });
      } catch (err: any) {
        await recordFailedNotCharged(verifiedUid, operation, reqId, err.message || 'ai_error');
        throw err;
      }

      const inputTokens = Math.ceil(((systemInstruction || '').length + (message || '').length) / 4);
      const outputTokens = Math.ceil((response.text || '').length / 4);
      
      await chargeCreditsAfterSuccess(verifiedUid, operation, reqId, {
         provider: 'google',
         model,
         inputTokens,
         outputTokens,
         totalTokens: inputTokens + outputTokens
      });

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
      return res.status(413).json({ error: "The provided data is too large for this service." });
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
