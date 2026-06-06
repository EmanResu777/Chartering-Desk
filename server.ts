import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { OAuth2Client } from "google-auth-library";
import cookieParser from "cookie-parser";
import Stripe from 'stripe';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Firestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";

let firestore: Firestore | null = null;
try {
  if (fs.existsSync('./firebase-applet-config.json')) {
    const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    const app = initializeApp({
      projectId: firebaseConfig.projectId
    });
    if (firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)") {
      firestore = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    } else {
      firestore = getFirestore(app);
    }
    console.log("Firebase Admin initialized for project:", firebaseConfig.projectId);
  }
} catch (e) {
  console.error("Failed to initialize Firebase Admin:", e);
}

const AI_MODELS = {
  BROWSER_OPTIONAL: "gemini-nano-browser-optional",
  COMPLEX_CLOUD: "gemini-2.5-flash",
  HEAVY_SERVER: "gemini-2.5-pro",
  LOCAL_PROCESSING: "no-llm"
};

function getGoogleGenAI() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY env var not set");
  return new GoogleGenAI({ 
    apiKey: GEMINI_API_KEY.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

function getErrorMsg(error: any) {
  try {
    const parsed = JSON.parse(error.message);
    return parsed.error?.message || error.message;
  } catch(e) {
    return error.message;
  }
}

async function generateContentWithFailover(ai: GoogleGenAI, args: any): Promise<{text: string, actualModel: string, actualProvider: string, degraded: boolean}> {
  try {
     const res = await ai.models.generateContent(args);
     return { text: res.text || "", actualModel: args.model, actualProvider: 'google', degraded: false };
  } catch(error: any) {
     const errMsg = (error.message || '').toLowerCase();
     const isQuotaOrAuth = errMsg.includes('quota') || errMsg.includes('429') || errMsg.includes('500') || errMsg.includes('rate limit') || errMsg.includes('api key') || errMsg.includes('unauthorized') || errMsg.includes('403') || errMsg.includes('503') || errMsg.includes('overloaded');
     
     if (!isQuotaOrAuth) {
        throw error;
     }

     console.warn('Gemini failed due to quota/auth/temp. Failing over to OpenAI.', error.message);
     try {
         const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
         let model = 'gpt-4o-mini';
         if (args.model === 'gemini-2.5-pro') {
             // Optional: upgrade model if it was heavy
             model = 'gpt-4o'; // For this test we could just stick to mini, but pro->4o is fair
         }
         // the instructions ask for gpt-4o-mini, so maybe I just use gpt-4o-mini. Wait, instructions said "Secondary provider... : OpenAI gpt-4o-mini". I will stick to gpt-4o-mini!
         model = 'gpt-4o-mini';
         
         let system = args.config?.systemInstruction;
         let messages: any[] = [];
         if (system) messages.push({ role: 'system', content: system });
         
         let prompt = args.contents;
         if (Array.isArray(prompt)) {
            prompt = prompt.map((p: any) => typeof p === 'string' ? p : JSON.stringify(p)).join('\n');
         }
         messages.push({ role: 'user', content: prompt });
         
         const config: any = { model: 'gpt-4o-mini', messages };
         if (args.config?.responseMimeType === 'application/json') {
             config.response_format = { type: 'json_object' };
             
             let schemaStr = "";
             if (args.config.responseSchema) {
                schemaStr = JSON.stringify(args.config.responseSchema);
             }
             messages[messages.length - 1].content += "\n\nReturn strictly JSON according to the schema: " + schemaStr;
         }
         
         const res = await openai.chat.completions.create(config);
         return { text: res.choices[0].message.content || "", actualModel: config.model, actualProvider: 'openai', degraded: true };
     } catch (oaError: any) {
         console.log('OpenAI failed. Failing over to Anthropic.', oaError.message);
         if (process.env.ANTHROPIC_API_KEY) {
             const anthropicModel = 'claude-3-haiku-20240307';
             
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
             
             const r = await fetch('https://api.anthropic.com/v1/messages', {
                 method: 'POST',
                 headers: {
                    'x-api-key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                 },
                 body: JSON.stringify(reqBody)
             });
             const d = await r.json();
             if (d.error) throw new Error(d.error.message);
             return { text: d.content[0].text, actualModel: anthropicModel, actualProvider: 'anthropic', degraded: true };
         }
         throw error;
     }
  }
}

async function safeAIParseJSON(rawText: string): Promise<any> {
  try {
    return JSON.parse(rawText || '{}');
  } catch (error) {
    console.warn("JSON.parse failed. Attempting repair with Gemini 2.5 Flash...");
    try {
      const ai = getGoogleGenAI();
      const repairPrompt = `You are a strict JSON repair assistant. Fix the following structurally invalid JSON.
Return ONLY valid JSON. No markdown formatting, no explanations, no comments.
Preserve all commercial data, numbers, strings, and keys exactly as they appear.

Invalid JSON:
${rawText}`;
      
      const response = await generateContentWithFailover(ai, {
        model: AI_MODELS.COMPLEX_CLOUD,
        contents: repairPrompt,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      return JSON.parse(response.text || '{}');
    } catch (repairError) {
      console.error("AI JSON Repair failed:", repairError);
      throw new Error("Failed to parse and repair strictly expected JSON from AI output");
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', true);
  
  // Webhook needs raw body for signature verification
  app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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

    // Handle the event
    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        
        // Retrieve the user ID and tier from metadata
        const userId = session.client_reference_id;
        const tier = session.metadata?.tier;
        
        console.log(`Payment successful for user ${userId}, tier: ${tier}`);
        
        if (userId && firestore) {
          // Determine grants based on tier
          const tierStr = tier || 'basic';
          const limits = {
            basic: { features: ['basic_match'], limits: { entities: 50 } },
            premium: { features: ['basic_match', 'ai_assistant'], limits: { entities: 500 } },
            maximum: { features: ['basic_match', 'ai_assistant', 'priority_support'], limits: { entities: 10000 } }
          };
          const grants = limits[tierStr as 'basic' | 'premium' | 'maximum'] || limits.basic;

          // Update user's subscription and grants in Firestore
          await firestore.collection('users').doc(userId).set({
            subscription: tierStr,
            subscriptionUpdatedAt: FieldValue.serverTimestamp(),
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            grants: grants
          }, { merge: true });
          
          console.log(`Updated Firestore subscription and grants for user ${userId}`);
        } else {
          console.warn('No userId or firestore missing for completed checkout session.');
        }
      }
      
      res.json({ received: true });
    } catch (err) {
      console.error("Error processing webhook:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  // Standard JSON middleware for all other routes
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any }) : null;
  
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

  // API Routes
  app.get("/api/auth/google-url", (req, res) => {
    if (!CLIENT_ID) {
      return res.status(500).json({ error: "VITE_GOOGLE_CLIENT_ID not configured" });
    }

    const userId = req.query.userId || req.headers['x-user-id'] || 'demo-user';
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
       
       let refreshToken = (global as any).DEMO_REFRESH_TOKENS?.get(decodedIdToken.uid);
       
       if (!refreshToken && gmailDoc) {
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
      console.error("Failed to refresh token", error);
      res.status(500).json({ error: "Failed to refresh token: " + error.message });
    }
  });

    app.post("/api/create-checkout-session", async (req, res) => {
    const { tier, userId } = req.body;
    
    if (!stripe) {
      console.log('Stripe API Key not provided, returning demo mode success.');
      return res.json({ demoMode: true });
    }

    try {
      const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
      const protocol = (typeof host === 'string' && (host.includes('ais-dev-') || host.includes('ais-pre-') || host.includes('run.app'))) || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
      const domainURL = `${protocol}://${host}`;

      let priceId = '';
      if (tier === 'basic') priceId = 'price_basic_123'; // Replace with real price IDs
      else if (tier === 'premium') priceId = 'price_premium_123';
      else if (tier === 'maximum') priceId = 'price_maximum_123';

      // For a fully working demo, if you don't have real price IDs, you can create a one-time price dynamically:
      // But typically, you'd use existing Stripe Price IDs from your dashboard.
      const prices: Record<string, number> = {
        'basic': 9900,
        'premium': 29900,
        'maximum': 89900
      };

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        client_reference_id: userId,
        metadata: {
          tier: tier
        },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
              },
              unit_amount: prices[tier] || 9900,
            },
            quantity: 1,
          },
        ],
        mode: 'payment', // use 'subscription' if creating recurring payments
        success_url: `${domainURL}?success=true&tier=${tier}`,
        cancel_url: `${domainURL}?canceled=true`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || 'An error occurred with Stripe.' });
    }
  });

  app.get("/auth/callback", async (req, res) => {
    const { code, state } = req.query;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).send("No code provided");
    }

    try {
      let userId = 'demo-user';
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

      if (email && tokens.refresh_token) {
        // Fallback to storing in memory for this session because firebase-admin requires ADC credentials not available in sandbox
        (global as any).DEMO_REFRESH_TOKENS = (global as any).DEMO_REFRESH_TOKENS || new Map();
        (global as any).DEMO_REFRESH_TOKENS.set(userId, tokens.refresh_token);
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
              try {
                localStorage.setItem('google_auth_tokens', JSON.stringify({
                  ...tokens,
                  timestamp: Date.now()
                }));
              } catch (e) {
                console.error("Failed to write to localStorage");
              }

              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_AUTH_SUCCESS', 
                  tokens: tokens
                }, '*');
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
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_AUTH_ERROR', 
                  error: ${JSON.stringify(frontendError)} 
                }, '*');
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
    if (userId !== decodedIdToken.uid) {
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
      console.error('IMAP Connect Error:', err.message || "Unknown error");
      res.status(500).json({ error: err.message || "Failed to connect to IMAP server" });
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

    if (userId !== decodedIdToken.uid) {
       return res.status(403).json({ error: "Forbidden: userId mismatch" });
    }

    try {
      if (!firestore) throw new Error("Firestore not initialized");
      const snap = await firestore.collection(`users/${decodedIdToken.uid}/emailAccounts`).get();
      
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
            // Fetch newest limit messages
            // Assuming sequence generation. We'll fetch the last N messages
            // e.g., '1:*' gives all. We can use a relative sequence like '*:*-10' 
            const status = await client.status('INBOX', { messages: true });
            const totalMsgs = status.messages || 0;
            if (totalMsgs > 0) {
              const startFetch = Math.max(1, totalMsgs - limit);
              for await (let msg of client.fetch(`${startFetch}:*`, { source: true }, { uid: true })) {
                messages.push(msg);
              }
            }

            // Process messages
            for (let msg of messages) {
              const parsed = await simpleParser(msg.source);
              allEmails.push({
                accountId: doc.id,
                provider: acc.provider,
                subject: parsed.subject || '(No Subject)',
                sender: parsed.from?.text || 'Unknown',
                rawBody: parsed.text || '',
                timestamp: parsed.date ? new Date(parsed.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z' : new Date().toLocaleTimeString() + 'Z',
                classification: (parsed.subject?.toUpperCase().includes('CARGO') ? 'CARGO' : 
                                parsed.subject?.toUpperCase().includes('VESSEL') ? 'VESSEL' : 'MARKET INTEL')
              });
            }
          } finally {
            lock.release();
          }
          await client.logout();
        } catch (err) {
          console.error(`Error syncing account ${acc.username}:`, err);
        }
      }
      
      res.json({ emails: allEmails.reverse() });
    } catch (err: any) {
      console.error('Email Sync Error:', err);
      res.status(500).json({ error: err.message || "Failed to sync emails" });
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

  app.post('/api/ai/routeTask', express.json({ limit: '2mb' }), async (req, res) => {
    try {
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
             systemInstruction: "You are an expert maritime commercial risk analyst. Analyze the provided risk or terms. Identify the risk type, key risk exposure, recommended action or mitigation, and its severity. You must interpret terms in a maritime chartering context (e.g. CQD is Customary Quick Dispatch, SHINC/SHEX are laytime terms, NOR/WIBON/WIFPON are tendering terms, demurrage/despatch apply to fixture economics, subjects lifted means fixture certainty). When analyzing CQD, output risk_type as 'CQD Risk', key_risk as 'Owner laytime/demurrage exposure due to CQD', recommended_action as 'Clarify demurrage terms or convert to fixed laytime', severity as 'Medium', and shouldReject as false. Return output as strictly structured JSON.",
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
               systemInstruction: "You are an expert maritime commercial risk analyst. Analyze the provided risk or terms. Identify the risk type, key risk exposure, recommended action or mitigation, and its severity. You must interpret terms in a maritime chartering context (e.g. CQD is Customary Quick Dispatch, SHINC/SHEX are laytime terms, NOR/WIBON/WIFPON are tendering terms, demurrage/despatch apply to fixture economics, subjects lifted means fixture certainty). When analyzing CQD, output risk_type as 'CQD Risk', key_risk as 'Owner laytime/demurrage exposure due to CQD', recommended_action as 'Clarify demurrage terms or convert to fixed laytime', severity as 'Medium', and shouldReject as false. Return output as strictly structured JSON.",
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

  // AI Routes
  app.post('/api/ai/parseEmail', async (req, res) => {
    try {
      const { email, userId } = req.body;
      const authHeader = req.headers.authorization;
      if (!userId || !authHeader) {
        return res.status(400).json({ error: "Missing parameters or auth" });
      }
      const idToken = authHeader.split('Bearer ')[1];
      let decodedIdToken;
      try {
        decodedIdToken = await getAuth().verifyIdToken(idToken);
      } catch (error) {
        return res.status(401).json({ error: "Invalid or expired authorization token" });
      }
      if (userId !== decodedIdToken.uid) {
        return res.status(403).json({ error: "Forbidden: userId mismatch" });
      }

      const parserVersion = 'v1.2'; // Increment for cache keys
      
      const rawText = email.rawBody || email.snippet || '';
      const normText = rawText.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
      const crypto = await import('crypto');
      const textHash = crypto.createHash('sha256').update(normText.substring(0, 5000)).digest('hex');
      const cacheKey = userId ? crypto.createHash('sha256').update(`${userId}-${textHash}-${parserVersion}`).digest('hex') : null;

      let cachedResult = null;
      let usedMemoryInfo: any = {};
      let senderProfile = null;

      if (userId && firestore) {
          if (cacheKey) {
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
             actualProvider: 'local'
          });
      }

      let memHint = '';
      if (senderProfile && senderProfile.usualType) {
         memHint = `\n[MEMORY SYSTEM] High probability this sender sends: ${senderProfile.usualType}. Adapt extraction strategy appropriately.`;
      }

      const sysLog = `Extract cargo or vessel positions from this email.
Broker circulars with multiple numbered or bulleted items MUST be fully extracted, do not stop at the first item.
If the email contains multiple cargoes, return type "CARGO_LIST" and populate the "cargoes" array. Do not merge them.
If the email contains multiple vessels, return type "VESSEL_LIST" and populate the "vessels" array. Do not merge them.
If the email contains both, return type "MIXED_LIST" and populate both arrays.
If single CARGO, return type "CARGO" and populate "extractedData".
If single VESSEL, return type "VESSEL" and populate "extractedData".

For CARGO, extract: raw_commodity (exact text from email), commodity (raw or normalized if obvious), quantity, loadPort, dischargePort, laycan, freight_idea (if stated), commission (if stated). Also MUST extract if stated: quantity_mt, quantity_cbm, plus_minus, terms (like FLT Hook/hook, FIOS, CQD), special_requirements (as array), freight_inclusions (as array), waiting_clause, unit_weight, stowage. Do not standardise cargo name if unsure, do not invent cargo type.
For VESSEL, extract: section_region, name/vessel_name, dwt (numbers only), openPort, openDate, vessel_type (e.g. MPP, TWD, GRD), cranes/gear (e.g. 2x25T), direction/preference, restrictions. Also if stated, extract: holds, last_cargo, suitable_for, heavy_lift_capacity, flag, class. Treat every MV block as a separate vessel position. If a single vessel lists multiple dates/open ports, create a separate vessel entry for EACH date/position option. Extract cranes and vessel tags from DWT lines (e.g. DWT 5.600-TWD-2X60T -> DWT: 5.600, Type: TWD, Cranes: 2x60T). Merge continuation lines for direction. Do not hallucinate fields.

Extract accurately. Do not hallucinate missing fields, leave them blank and note them in per-item missing_fields.
Determine decision per item: "Proceed", "Check", or "Reject" based on logic.${memHint}

Subj:${email.subject}\nFrom:${email.sender}\nBody:${email.rawBody}`;
      
      const ai = getGoogleGenAI();
      const response = await generateContentWithFailover(ai, {
        model: AI_MODELS.COMPLEX_CLOUD,
        contents: sysLog,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              type: { type: Type.STRING, description: "CARGO, VESSEL, CARGO_LIST, VESSEL_LIST, MIXED_LIST, or OTHER" },
              decision: { type: Type.STRING, description: "Proceed, Check, or Reject (Overall)" },
              extractedData: {
                type: Type.OBJECT,
                properties: {
                  raw_commodity: { type: Type.STRING },
                  commodity: { type: Type.STRING },
                  normalized_commodity: { type: Type.STRING },
                  quantity: { type: Type.STRING },
                  quantity_mt: { type: Type.STRING },
                  quantity_cbm: { type: Type.STRING },
                  plus_minus: { type: Type.STRING },
                  terms: { type: Type.STRING },
                  special_requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
                  freight_inclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  waiting_clause: { type: Type.STRING },
                  unit_weight: { type: Type.STRING },
                  stowage: { type: Type.STRING },
                  loadPort: { type: Type.STRING },
                  dischargePort: { type: Type.STRING },
                  laycan: { type: Type.STRING },
                  section_region: { type: Type.STRING },
                  name: { type: Type.STRING },
                  dwt: { type: Type.STRING },
                  vessel_type: { type: Type.STRING },
                  gear: { type: Type.STRING },
                  cranes: { type: Type.STRING },
                  holds: { type: Type.STRING },
                  last_cargo: { type: Type.STRING },
                  suitable_for: { type: Type.STRING },
                  heavy_lift_capacity: { type: Type.STRING },
                  flag: { type: Type.STRING },
                  class: { type: Type.STRING },
                  openPort: { type: Type.STRING },
                  openDate: { type: Type.STRING },
                  direction: { type: Type.STRING },
                  restrictions: { type: Type.STRING },
                  confidence_score: { type: Type.NUMBER },
                  missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              },
              cargoes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    entry_no: { type: Type.STRING },
                    raw_commodity: { type: Type.STRING },
                    commodity: { type: Type.STRING },
                    normalized_commodity: { type: Type.STRING },
                    quantity: { type: Type.STRING },
                    quantity_mt: { type: Type.STRING },
                    quantity_cbm: { type: Type.STRING },
                    plus_minus: { type: Type.STRING },
                    terms: { type: Type.STRING },
                    special_requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
                    freight_inclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    waiting_clause: { type: Type.STRING },
                    unit_weight: { type: Type.STRING },
                    stowage: { type: Type.STRING },
                    loadPort: { type: Type.STRING },
                    dischargePort: { type: Type.STRING },
                    laycan: { type: Type.STRING },
                    freight_idea: { type: Type.STRING },
                    commission: { type: Type.STRING },
                    missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
                    decision: { type: Type.STRING, description: "Proceed, Check, or Reject" },
                    risk_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    recommended_action: { type: Type.STRING }
                  }
                }
              },
              vessels: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    entry_no: { type: Type.STRING },
                    section_region: { type: Type.STRING },
                    name: { type: Type.STRING }, // or vessel_name
                    dwt: { type: Type.STRING },
                    vessel_type: { type: Type.STRING },
                    gear: { type: Type.STRING },
                    cranes: { type: Type.STRING },
                    holds: { type: Type.STRING },
                    last_cargo: { type: Type.STRING },
                    suitable_for: { type: Type.STRING },
                    heavy_lift_capacity: { type: Type.STRING },
                    flag: { type: Type.STRING },
                    class: { type: Type.STRING },
                    openPort: { type: Type.STRING },
                    openDate: { type: Type.STRING },
                    direction: { type: Type.STRING },
                    restrictions: { type: Type.STRING },
                    missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
                    decision: { type: Type.STRING, description: "Proceed, Check, or Reject" },
                    risk_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    recommended_action: { type: Type.STRING }
                  }
                }
              }
            },
            required: ["summary", "type"]
          }
        }
      });
      const data = await safeAIParseJSON(response.text || '{}');
      
      const out = {
        type: data.type,
        decision: data.decision,
        cargo: data.type === 'CARGO' ? data.extractedData : undefined,
        vessel: data.type === 'VESSEL' ? data.extractedData : undefined,
        cargoes: data.cargoes,
        vessels: data.vessels,
        summary: data.summary,
        actualModel: response.actualModel,
        actualProvider: response.actualProvider,
        degraded_analysis: response.degraded || false,
        memoryUsed: usedMemoryInfo
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

      if (userId && cacheKey && firestore && !out.degraded_analysis) {
         try {
           await firestore.collection('users').doc(userId).collection('memory_parseCache').doc(cacheKey).set({
             resultType: out.type,
             decision: out.decision,
             cargo: out.cargo || null,
             vessel: out.vessel || null,
             cargoes: out.cargoes || null,
             vessels: out.vessels || null,
             summary: out.summary,
             rawTextHash: textHash,
             parserVersion,
             source: 'ai_parse',
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
      }

      res.json(out);
    } catch (error: any) {
      console.error("AI Parse Error:", error instanceof Error ? error.message : "Unknown error");
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
      if (userId && userId !== verifiedUid) {
        return res.status(403).json({ error: "Forbidden: userId mismatch" });
      }

      let assumptionsText = "make realistic standard maritime market estimates (e.g. bunker $600/mt, hire $10000/day, port $30000, speed 13kn).";
      if (assumptions) {
         assumptionsText = `use the provided market assumptions: Bunker Price: $${assumptions.bunkerPrice}/mt, Daily Hire: $${assumptions.dailyHire}/day, Port Costs: $${assumptions.portCost}, Canal Costs: $${assumptions.canalCost}, Ballast Speed: ${assumptions.ballastSpeed}kn, Laden Speed: ${assumptions.ladenSpeed}kn, Ballast Cons: ${assumptions.ballastConsumption}mt/day, Laden Cons: ${assumptions.ladenConsumption}mt/day, Idle Cons: ${assumptions.idleConsumption}mt/day, Waiting Days: ${assumptions.waitingDays} days.`;
      }
      
      const prompt = `Analyze matches between Cargo C and Vessels V.
C:${JSON.stringify(cargo)}
V:${JSON.stringify(vessels)}

CRITICAL: Do NOT give a blank 100% score just because DWT and Vessel Type match.
You MUST calculate 5 component scores out of 100:
1. TechnicalFit: DWT, type, gear, holds, restrictions.
2. PositionFit: Distance from open port to cargo load port. If open port is Hamburg and load is Jebel Ali, position fit must be very low (e.g. <30%)!
3. LaycanFit: Can vessel reach load port in time? Wait time?
4. CommercialViability: High repositioning distance = extreme cost. High wait time = idle cost. CRITICAL: If freight rate or cargo weight (MT) is missing from the cargo details, CommercialViability MUST be capped at 50 maximum (mark as "Pending Data").
5. RiskAdjustment: 0 to -100 depending on risks (CQD, FIOS, lacking details).
Score = average(Technical, Position, Laycan, Commercial) + RiskAdjustment. Use severe penalties for long ballast!

ALSO calculate Owner Loss Calculator details. To calculate the costs, ${assumptionsText}
Missing commercial data? Set missingCommercialData: true.

Output the full JSON matching the schema precisely.
Ensure 'recommendation' is one of: 'Strong Match', 'Conditional Match', 'Weak Match', 'Reject / Not Commercial'.`;
      const ai = getGoogleGenAI();
      
      let response;
      let degraded = false;
      let fallbackReason = undefined;
      
      const aiConfig: any = {
        model: AI_MODELS.HEAVY_SERVER,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              matches: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    vesselId: { type: Type.STRING },
                    cargoId: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    technicalFit: { type: Type.NUMBER },
                    positionFit: { type: Type.NUMBER },
                    laycanFit: { type: Type.NUMBER },
                    commercialViability: { type: Type.NUMBER },
                    riskAdjustment: { type: Type.NUMBER },
                    reasoning: { type: Type.ARRAY, items: { type: Type.STRING } },
                    eta: { type: Type.STRING },
                    distance: { type: Type.STRING },
                    missingCommercialData: { type: Type.BOOLEAN },
                    calculatorInputs: {
                      type: Type.OBJECT,
                      properties: {
                        vesselSpeedBallast: { type: Type.NUMBER },
                        vesselSpeedLaden: { type: Type.NUMBER },
                        dailyBunkerConsumptionBallast: { type: Type.NUMBER },
                        dailyBunkerConsumptionLaden: { type: Type.NUMBER },
                        idleConsumption: { type: Type.NUMBER },
                        currentBunkerPrice: { type: Type.NUMBER },
                        estimatedPortCosts: { type: Type.NUMBER },
                        canalCosts: { type: Type.NUMBER },
                        estimatedWaitingDays: { type: Type.NUMBER },
                        dailyHire: { type: Type.NUMBER },
                        freightRate: { type: Type.NUMBER }
                      }
                    },
                    calculatorOutputs: {
                      type: Type.OBJECT,
                      properties: {
                        ballastDistance: { type: Type.NUMBER },
                        ballastDays: { type: Type.NUMBER },
                        estimatedBallastBunkerCost: { type: Type.NUMBER },
                        estimatedIdleWaitingCost: { type: Type.NUMBER },
                        estimatedPortCanalCosts: { type: Type.NUMBER },
                        totalPreLoadingOwnerCost: { type: Type.NUMBER },
                        estimatedTCE: { type: Type.NUMBER },
                        ownerLossBeforeLoading: { type: Type.NUMBER },
                        recommendation: { type: Type.STRING }
                      }
                    }
                  },
                  required: ["vesselId", "cargoId", "score", "technicalFit", "positionFit", "laycanFit", "commercialViability", "riskAdjustment", "reasoning", "eta", "distance"]
                }
              }
            },
            required: ["matches"]
          }
        }
      };

      try {
        response = await generateContentWithFailover(ai, aiConfig);
      } catch (err: any) {
        // If it was a non-quota error with Pro, fallback to Flash.
        // Wait, if generateContentWithFailover fails over to OpenAI it won't throw here unless OpenAI fails too.
        // But if it's a BAD SCHEMA or something else on Gemini Pro, it will throw here.
        console.warn("Server Heavy AI failed for matchVessels, falling back to Flash", err.message);
        degraded = true;
        fallbackReason = "Failed to run heavy analysis model. Fell back to standard cloud AI.";
        aiConfig.model = AI_MODELS.COMPLEX_CLOUD;
        response = await generateContentWithFailover(ai, aiConfig);
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
          } catch (e: any) {
              console.warn("Metrics update conditionally failed:", e.message);
          }
      }

      res.json({ 
        matches: data.matches || [],
        degraded_analysis: degraded || response.degraded || false,
        actualModel: response.actualModel,
        actualProvider: response.actualProvider,
        fallback_reason: fallbackReason ? fallbackReason : (response.degraded ? 'Quota/auth fallback triggered' : undefined)
      });
    } catch (error: any) {
      console.error("AI Match Error:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ error: getErrorMsg(error) || "Failed to generate matches." });
    }
  });

  app.post('/api/ai/generateContent', async (req, res) => {
    try {
      let { model, contents } = req.body;
      if (!model || model === "gemini-1.5-flash" || model === "gemini-3.5-flash" || model === "gemini-2.5-flash") {
        model = AI_MODELS.COMPLEX_CLOUD;
      }
      const ai = getGoogleGenAI();
      const response = await generateContentWithFailover(ai, { model, contents });
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

  app.get('/api/ai/models', async (req, res) => {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=" + process.env.GEMINI_API_KEY);
      const data = await response.json();
      res.json(data);
    } catch(e:any) { res.status(500).json({error: e.message}); }
  });
  
  app.post('/api/ai/chat', async (req, res) => {
    try {
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
      const response = await chat.sendMessage({ message });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      res.status(500).json({ error: getErrorMsg(error) || "Failed to respond in chat." });
    }
  });

  // Background task to send trial expiration notifications
  setInterval(async () => {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
