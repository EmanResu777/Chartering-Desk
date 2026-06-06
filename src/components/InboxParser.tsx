import React, { useState, useEffect } from 'react';
import { Search, Brain, CheckCircle, Mail, RotateCw, Trash2, FileSearch, LogIn, Package2, Zap, Ship, Plus, Globe, Cloud, Layout, Check, MoreVertical, MessageSquare, X, Info } from 'lucide-react';
import { Email, INITIAL_EMAILS, Cargo, Vessel, cn, determineRelevanceStatus } from '../lib/utils';
import { parseEmail } from '../lib/geminiService';
import { fetchGmailEmails } from '../lib/gmailService';
import { isAuthenticated, getAccessToken } from '../lib/googleAuth';
import { connectImapAccount, fetchImapEmails } from '../lib/imapService';
import { useConfig } from '../lib/ConfigContext';

import { motion, AnimatePresence } from 'motion/react';
import { DeskNetwork } from './DeskNetwork';
import { useNotification } from '../lib/NotificationContext';
import { useWorkspace } from '../lib/WorkspaceContext';

interface Account {
  id: string;
  email: string;
  provider: 'gmail' | 'outlook' | 'icloud' | 'imap';
  active: boolean;
}

interface InboxParserProps {
  emails: Email[];
  setEmails: React.Dispatch<React.SetStateAction<Email[]>>;
  networkState?: {
    messages: any[];
    setMessages: React.Dispatch<React.SetStateAction<any[]>>;
    contacts: any[];
    setContacts: React.Dispatch<React.SetStateAction<any[]>>;
    pendingInvites: any[];
    setPendingInvites: React.Dispatch<React.SetStateAction<any[]>>;
    userProfile: { id: string; name: string; role: string };
    cargoList: Cargo[];
    vesselList: Vessel[];
    selectedContact: any;
    setSelectedContact: (contact: any) => void;
  };
}

export const InboxParser: React.FC<InboxParserProps> = ({ networkState, emails, setEmails }) => {
  const { notify, addNotification, settings } = useNotification();
  const { currentWorkspace } = useWorkspace();
  const isViewer = currentWorkspace?.myRole === 'viewer';
  const { t } = useConfig();
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(isAuthenticated());
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('RELEVANT');
  const [scanLimit, setScanLimit] = useState<number>(() => {
    const saved = localStorage.getItem('inbox_scan_limit');
    return saved ? parseInt(saved, 10) : 50;
  });
  const handleScanLimitChange = (limit: number) => {
    setScanLimit(limit);
    localStorage.setItem('inbox_scan_limit', limit.toString());
  };
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<'gmail' | 'outlook' | 'icloud' | 'imap' | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [newAccForm, setNewAccForm] = useState({ email: '', host: '', port: '993', username: '', password: '' });
  
  const [selectedCargos, setSelectedCargos] = useState<Set<number>>(new Set());
  const [selectedVessels, setSelectedVessels] = useState<Set<number>>(new Set());

  const [accounts, setAccounts] = useState<Account[]>([
    { id: 'acc-1', email: 'vessels@gmail.com', provider: 'gmail', active: true }
  ]);

  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    const interval = setInterval(() => {
      // Use the window object or omit the handleFetchEmails dependency issue
      window.dispatchEvent(new CustomEvent('AUTO_POLL_EMAILS'));
    }, 60000);
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  useEffect(() => {
    const handleAutoPoll = () => {
      if (!loading) {
        handleFetchEmails(true);
      }
    };
    window.addEventListener('AUTO_POLL_EMAILS', handleAutoPoll);
    return () => window.removeEventListener('AUTO_POLL_EMAILS', handleAutoPoll);
  }, [loading]);

  useEffect(() => {
    const handleSelectEmail = (e: any) => {
      setSelectedEmail(e.detail);
    };
    window.addEventListener('SELECT_EMAIL', handleSelectEmail);
    return () => window.removeEventListener('SELECT_EMAIL', handleSelectEmail);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    import('firebase/firestore').then(({ collection, query, onSnapshot }) => {
      import('../lib/firebase').then(({ db, auth }) => {
        if (!auth.currentUser) return;
        const q = query(collection(db, `users/${auth.currentUser.uid}/emailAccounts`));
        const unsub = onSnapshot(q, (snapshot) => {
          const loadedAccounts: Account[] = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            loadedAccounts.push({
              id: doc.id,
              email: data.email || data.username,
              provider: data.provider,
              active: data.active !== false
            });
          });
          // Merge with any demo accounts or default
          setAccounts(prev => {
            const defaults = prev.filter(a => a.id === 'acc-1');
            const merged = [...defaults];
            loadedAccounts.forEach(acc => {
              if (!merged.find(m => m.email === acc.email)) {
                merged.push(acc);
              }
            });
            return merged;
          });
        }, (error) => {
          console.error("Error fetching email accounts:", error);
        });
        return unsub;
      });
    });
  }, [isLoggedIn]);

  const handleConnectNew = async () => {
    if (!newAccForm.email) return;
    
    setIsVerifying(true);
    try {
      if (connectingProvider === 'imap' || connectingProvider === 'outlook' || connectingProvider === 'icloud') {
        let host = newAccForm.host;
        let port = newAccForm.port;
        if (connectingProvider === 'outlook') {
            host = 'outlook.office365.com';
            port = '993';
        } else if (connectingProvider === 'icloud') {
            host = 'imap.mail.me.com';
            port = '993';
        }

        const result = await connectImapAccount(
          host, 
          port, 
          newAccForm.email, 
          newAccForm.password, 
          connectingProvider
        );
        notify({ title: 'Account Connected', message: `Connected to ${newAccForm.email} successfully!`, type: 'success' });
        
        const newAcc: Account = {
          id: `acc-${Date.now()}`,
          email: newAccForm.email,
          provider: connectingProvider || 'imap',
          active: true
        };
        setAccounts(prev => [...prev, newAcc]);
        
        await handleFetchEmails();
      } else {
        // Fallback for others
        setTimeout(() => {
          const newAcc: Account = {
            id: `acc-${Date.now()}`,
            email: newAccForm.email,
            provider: connectingProvider || 'imap',
            active: true
          };
          setAccounts(prev => [...prev, newAcc]);
          notify({ title: 'Account Added', message: `Account ${newAccForm.email} added (mocked).`, type: 'info' });
        }, 1000);
      }
    } catch (e: any) {
      notify({ title: 'Connection Failed', message: e.message || 'Failed to verify account', type: 'error' });
    } finally {
      setIsVerifying(false);
      setConnectingProvider(null);
      setNewAccForm({ email: '', host: '', port: '993', username: '', password: '' });
    }
  };

  const categories = [
    { id: 'RELEVANT', label: 'Relevant', icon: CheckCircle },
    { id: 'CARGO', label: 'Cargo', icon: Package2 },
    { id: 'VESSEL', label: 'Vessels', icon: Ship },
    { id: 'MIXED', label: 'Mixed', icon: MoreVertical },
    { id: 'MAYBE', label: 'Maybe', icon: FileSearch },
    { id: 'SKIPPED', label: 'Skipped', icon: Trash2 },
    { id: 'ALL', label: 'All', icon: Mail }
  ];

  const subCategories = Array.from(new Set(emails.map(e => e.subCategory).filter(Boolean))) as string[];

  const [viewMode, setViewMode] = useState<'LIST' | 'SECTIONS'>('LIST');
  const [inboxView, setInboxView] = useState<'FEED' | 'NETWORK'>('FEED');

  const toggleAccount = async (id: string, email: string) => {
    // Optimistic update
    setAccounts(prev => prev.map(acc => 
      acc.id === id ? { ...acc, active: !acc.active } : acc
    ));
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db, auth } = await import('../lib/firebase');
      if (auth.currentUser && id !== 'acc-1') {
        const accTarget = accounts.find(a => a.id === id);
        if (accTarget) {
          await updateDoc(doc(db, `users/${auth.currentUser.uid}/emailAccounts/${email}`), {
            active: !accTarget.active
          });
        }
      }
    } catch (err) {
      console.error("Failed to toggle:", err);
    }
  };

  const removeAccount = async (id: string, email: string) => {
    setAccounts(prev => prev.filter(acc => acc.id !== id));
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const { db, auth } = await import('../lib/firebase');
      if (auth.currentUser && id !== 'acc-1') {
        await deleteDoc(doc(db, `users/${auth.currentUser.uid}/emailAccounts/${email}`));
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const activeAccountIds = accounts.filter(a => a.active).map(a => a.id);

  const filteredEmails = emails.filter(email => {
    let matchesCategory = false;
    const rel = email.relevanceStatus || 'maybe_relevant';
    
    if (activeCategory === 'ALL') {
      matchesCategory = true;
    } else if (activeCategory === 'RELEVANT') {
      matchesCategory = rel === 'likely_cargo' || rel === 'likely_vessel' || rel === 'likely_mixed';
    } else if (activeCategory === 'CARGO') {
      matchesCategory = rel === 'likely_cargo';
    } else if (activeCategory === 'VESSEL') {
      matchesCategory = rel === 'likely_vessel';
    } else if (activeCategory === 'MIXED') {
      matchesCategory = rel === 'likely_mixed';
    } else if (activeCategory === 'MAYBE') {
      matchesCategory = rel === 'maybe_relevant';
    } else if (activeCategory === 'SKIPPED') {
      matchesCategory = rel === 'irrelevant' || rel === 'already_processed';
    }
    
    const matchesAccount = !email.accountId || activeAccountIds.includes(email.accountId);
    return matchesCategory && matchesAccount;
  });

  const groupedEmails = filteredEmails.reduce((acc, email) => {
    const key = email.subCategory || email.category || 'GENERAL';
    if (!acc[key]) acc[key] = [];
    acc[key].push(email);
    return acc;
  }, {} as Record<string, Email[]>);

  const providerIcons = {
    gmail: { icon: Mail, color: 'text-red-500' },
    outlook: { icon: Layout, color: 'text-blue-500' },
    icloud: { icon: Cloud, color: 'text-sky-400' },
    imap: { icon: Globe, color: 'text-slate-400' }
  };

  const renderEmailItem = (email: Email, isCompact = false) => {
    const providerKey = email.provider as keyof typeof providerIcons;
    const Provider = providerKey ? providerIcons[providerKey] : null;
    
    return (
      <div 
        key={email.id}
        onClick={() => { setSelectedEmail(email); setExtractionResult(null); }}
        className={cn(
          "p-4 border-b border-outline/50 cursor-pointer transition-all group",
          selectedEmail?.id === email.id ? "bg-primary/10 border-l-2 border-l-[#1d9bf0]" : "hover:bg-surface-container border-l-2 border-l-transparent",
          isCompact && "py-2"
        )}
      >
        <div className="flex justify-between items-start mb-2 gap-4">
          <div className="flex flex-wrap items-center gap-2 md:gap-4 shrink-0 max-w-[60%]">
             {!isCompact && (
               <input 
                 type="checkbox" 
                 checked={selectedForBatch.has(email.id)}
                 onClick={(e) => { e.stopPropagation(); toggleSelectBatch(email.id); }}
                 className="mt-0.5"
               />
             )}
             <span className="font-mono text-[10px] text-on-surface-variant uppercase font-bold">NODE: {email.id.substring(0, 8)}</span>
             {!isCompact && <span className="font-mono text-[10px] text-on-surface-variant whitespace-nowrap">{email.timestamp}</span>}
          </div>
          
          <div className="flex items-center gap-2 shrink-0 justify-end">
             {Provider && <Provider.icon className={cn("h-3 w-3", Provider.color)} />}
             {email.category && (
               <div className="flex items-center gap-1.5 text-right">
                  <div className="h-1 w-1 rounded-full bg-primary ml-auto animate-pulse" />
                  <div className="flex flex-col">
                    <span className="text-[8px] font-bold text-primary uppercase tracking-tighter opacity-70 group-hover:opacity-100 transition-opacity leading-none">
                       AI_{email.category.replace(' ', '_')}
                    </span>
                    {email.subCategory && (
                      <span className="text-[7px] text-on-surface-variant uppercase font-mono leading-none mt-0.5">{email.subCategory}</span>
                    )}
                  </div>
               </div>
             )}
          </div>
        </div>
        
        <h3 className={cn(
          "font-display text-on-surface font-medium truncate uppercase tracking-tight",
          isCompact ? "text-[11px] mb-0" : "text-[13px] mb-1"
        )}>{email.subject}</h3>
        {!isCompact && <p className="font-mono text-[11px] text-on-surface/80 text-on-surface-variant text-[11px] line-clamp-2 italic">{email.rawBody}</p>}
        
        {!isCompact && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={cn(
                "font-sans text-[10px] font-semibold tracking-[0.15em] uppercase px-1 py-0.5 border text-[8px]",
                email.classification === 'CARGO' ? "border-primary text-primary bg-primary/10" : "border-[#8899a6] text-on-surface-variant"
              )}>
                {email.category || email.classification}
              </span>
              {email.classification === 'CARGO' && (
                 <div className="flex items-center gap-1">
                   <span className="font-mono text-[11px] text-on-surface/80 text-[9px] text-tertiary">[AI_RECOGNIZED]</span>
                   {email.subCategory && <span className="text-[8px] text-on-surface-variant bg-surface-dim/50 px-1 border border-outline/20 uppercase">{email.subCategory}</span>}
                 </div>
              )}
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); handleParse(email); }}
              disabled={parsingId === email.id}
              className="bg-transparent border border-outline hover:border-primary text-primary font-sans text-[10px] font-semibold tracking-[0.15em] uppercase px-3 py-1 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {parsingId === email.id ? <RotateCw className="h-3 w-3 animate-spin" /> : "> START_PARSING"}
            </button>
          </div>
        )}
      </div>
    );
  };

  const handleFetchEmails = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      setGlobalError(null);
      
      let allFetchedEmails: Email[] = [];
      
      // Try querying Firebase Webhooks
      try {
        const { collection, getDocs, limit, orderBy, query } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');
        const webhooksQ = query(collection(db, 'incoming_webhooks'), orderBy('receivedAt', 'desc'), limit(15));
        const whSnap = await getDocs(webhooksQ);
        
        const whEmails: Email[] = [];
        whSnap.forEach(doc => {
          const data = doc.data();
          const p = data.payload || {};
          whEmails.push({
            id: doc.id,
            accountId: accounts.find(a => a.provider === 'imap')?.id || 'acc-3',
            sender: p.from || p.sender || 'webhook@ingestion',
            subject: p.subject || 'Webhook Transmission',
            rawBody: p.text || p.body || JSON.stringify(p),
            summary: p.subject || 'Webhook Processing',
            timestamp: data.receivedAt ? new Date(data.receivedAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z' : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z',
            classification: 'CARGO',
            confidence: 90,
            provider: 'imap'
          });
        });
        allFetchedEmails = [...allFetchedEmails, ...whEmails];
      } catch (err) {
        console.warn("Webhook fetch skipped:", err);
      }

      // Try IMAP first
      try {
        const fetchLimit = isBackground ? 10 : scanLimit;
        const imapEmails = await fetchImapEmails(fetchLimit);
        const mappedImap = imapEmails.map((im: any) => ({
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          accountId: im.accountId,
          sender: im.sender,
          subject: im.subject,
          rawBody: im.rawBody,
          summary: im.subject,
          timestamp: im.timestamp,
          classification: im.classification || 'MARKET INTEL',
          confidence: 85,
          provider: im.provider || 'imap',
          relevanceStatus: determineRelevanceStatus(im.subject, im.sender, (im.rawBody || '').substring(0, 500))
        }));
        allFetchedEmails = [...allFetchedEmails, ...mappedImap];
      } catch (err: any) {
        console.warn('IMAP fetch skipped or failed:', err);
      }
      
      // Then Gmail
      try {
        if (import.meta.env.VITE_GOOGLE_CLIENT_ID) {
          const fetchLimit = isBackground ? 10 : scanLimit;
          const gmailEmails = await fetchGmailEmails(fetchLimit);
          allFetchedEmails = [...allFetchedEmails, ...gmailEmails];
        }
      } catch (err: any) {
        console.warn('Gmail fetch skipped or failed:', err);
      }
      
      if (allFetchedEmails.length > 0) {
        setLastChecked(new Date());
        setEmails(prev => {
          const newEmails = [...allFetchedEmails];
          const uniqueExisting = prev.filter(e => !newEmails.some(ne => ne.id === e.id));
          return [...newEmails, ...uniqueExisting];
        });
        setIsLoggedIn(true);
      } else {
        throw new Error('No OAuth configured, IMAP empty, Webhooks empty. Using mock.');
      }
    } catch (error: any) {
      console.error('Fetch error:', error);
      if (error.message?.includes('VITE_GOOGLE_CLIENT_ID') || error.message?.includes('Authentication window closed') || error.message?.includes('Using mock')) {
        // Fallback to mock data for demo purposes
        console.warn("Using mock data because OAuth/IMAP is not configured or failed.");
        const mockEmails: Email[] = [
          {
            id: `msg-${Date.now()}-1`,
            accountId: accounts.find(a => a.provider === 'gmail')?.id || 'acc-1',
            sender: 'charter@pacific-materials.com',
            subject: 'URGENT: 50,000 MT COAL IDO/N.D.A',
            rawBody: 'Please offer firm for 50,000 MT +/- 10% MOLOO Coal in bulk from Richards Bay to Kandla. Laycan 15-25 May. 15,000 SHINC / 15,000 SHINC. Freight idea: Try mid 20s.',
            summary: '50k MT Coal from Richards Bay to Kandla. Laycan May 15-25.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z',
            classification: 'CARGO',
            confidence: 98,
            category: 'DRY BULK',
            provider: 'gmail',
            relevanceStatus: 'likely_cargo'
          },
          ...INITIAL_EMAILS
        ];
        
        setLastChecked(new Date());
        setEmails(prev => {
          const uniqueExisting = prev.filter(e => !mockEmails.some(ne => ne.id === e.id));
          return [...mockEmails, ...uniqueExisting];
        });
        setIsLoggedIn(true);
        if (!isBackground) notify({ title: 'Demo Mode', message: "Running in Demo Mode: OAuth is not configured, showing mock data.", type: 'info' });
      } else {
        setGlobalError(error.message || "Failed to fetch emails.");
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const handleSignIn = async () => {
    try {
      setGlobalError(null);
      if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
        throw new Error('VITE_GOOGLE_CLIENT_ID not configured');
      }
      await getAccessToken();
      setIsLoggedIn(true);
      handleFetchEmails();
    } catch (error: any) {
      console.error('Auth error:', error);
      if (error.message?.includes('VITE_GOOGLE_CLIENT_ID') || error.message?.includes('Client Secret') || error.message?.includes('Authentication window closed')) {
        // Option to show guide or fallback
        if (!accounts.find(a => a.provider === 'gmail')) {
            setAccounts(prev => [...prev, { id: `acc-${Date.now()}`, email: 'demo@gmail.com', provider: 'gmail', active: true }]);
        }
        
        // Use demo mode
        console.warn("Using mock data because OAuth is not configured or failed.");
        const mockEmails: Email[] = [
          {
            id: `msg-${Date.now()}-1`,
            accountId: accounts.find(a => a.provider === 'gmail')?.id || 'acc-1',
            sender: 'charter@pacific-materials.com',
            subject: 'URGENT: 50,000 MT COAL IDO/N.D.A',
            rawBody: 'Please offer firm for 50,000 MT +/- 10% MOLOO Coal in bulk from Richards Bay to Kandla. Laycan 15-25 May. 15,000 SHINC / 15,000 SHINC. Freight idea: Try mid 20s.',
            summary: '50k MT Coal from Richards Bay to Kandla. Laycan May 15-25.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z',
            classification: 'CARGO',
            confidence: 98,
            category: 'DRY BULK',
            provider: 'gmail',
            relevanceStatus: 'likely_cargo'
          },
          ...INITIAL_EMAILS
        ];
        setEmails(mockEmails as any);
        setIsLoggedIn(true);
      } else {
        setGlobalError(error.message || "Authentication failed.");
      }
    }
  };

  const handleParseMultiple = async (emailsToParse: Email[]) => {
    if (emailsToParse.length === 0) return;
    notify({
      title: 'Batch Parse Started',
      message: `Parsing ${emailsToParse.length} emails...`,
      type: 'info'
    });
    for (const email of emailsToParse) {
      if (email.relevanceStatus === 'already_processed') continue;
      await handleParse(email, true);
    }
  };

  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  
  const toggleSelectBatch = (id: string) => {
    setSelectedForBatch(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleParse = async (email: Email, isBatch: boolean = false) => {
    setParsingId(email.id);
    setSelectedEmail(email);
    notify({
      title: 'AI Processing',
      message: `Extracting structured data from message...`,
      type: 'info'
    });
    
    try {
      const { auth } = await import('../lib/firebase');
      const result = await parseEmail(email, auth.currentUser?.uid);
      setExtractionResult(result);
      
      const cList = result.cargoes || (result.cargo ? [result.cargo] : []);
      setSelectedCargos(new Set(cList.map((_: any, i: number) => i)));

      const vList = result.vessels || (result.vessel ? [result.vessel] : []);
      setSelectedVessels(new Set(vList.map((_: any, i: number) => i)));

      notify({
        title: 'Extraction Complete',
        message: 'Successfully structured cargo/vessel parameters.',
        type: 'success'
      });

      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, relevanceStatus: 'already_processed' } : e));
    } catch (e: any) {
      notify({
        title: 'Parsing Failed',
        message: e.message || 'An error occurred during AI processing',
        type: 'error'
      });
    } finally {
      setParsingId(null);
    }
  };

  const normalizeStr = (str: any) => {
    if (str == null) return '';
    return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
  };

  const handlePublish = async () => {
    if (!extractionResult || isPublishing) return;
    setIsPublishing(true);
    try {
      const { collection, addDoc, doc, setDoc, query, where, getDocs } = await import('firebase/firestore');
      const { db, auth } = await import('../lib/firebase');
      if (!auth.currentUser) throw new Error("Not logged in");

      let createdCargos = 0;
      let skippedCargos = 0;
      let createdVessels = 0;
      let skippedVessels = 0;

      // Handle CARGO or CARGO_LIST
      if (extractionResult.type === 'CARGO' || extractionResult.type === 'CARGO_LIST' || extractionResult.type === 'MIXED_LIST') {
        const cargosToPublish = (extractionResult.cargoes || (extractionResult.cargo ? [extractionResult.cargo] : []))
          .filter((_: any, i: number) => selectedCargos.has(i));
        
        for (let i = 0; i < cargosToPublish.length; i++) {
          const item = cargosToPublish[i];
          const dedupeKey = [
             selectedEmail?.id || '',
             item.entry_no || String(i),
             item.commodity || item.cargo_type || '',
             item.quantity || '',
             item.loadPort || '',
             item.dischargePort || '',
             item.laycan || ''
          ].map(normalizeStr).join('|');

          const q = query(collection(db, 'cargos'), where('userId', '==', auth.currentUser.uid), where('dedupeKey', '==', dedupeKey));
          const existing = await getDocs(q);
          
          if (!existing.empty) {
             skippedCargos++;
             continue;
          }

          const cargoData = {
            userId: auth.currentUser.uid,
            workspaceId: currentWorkspace?.id || null,
            dedupeKey,
            sourceEmailId: selectedEmail?.id || null,
            entry_no: item.entry_no || String(i),
            raw_commodity: String(item.raw_commodity || item.commodity || item.cargo_type || 'Unknown').substring(0, 100),
            commodity: String(item.commodity || item.cargo_type || 'Unknown').substring(0, 100),
            normalized_commodity: item.normalized_commodity ? String(item.normalized_commodity).substring(0, 100) : null,
            quantity: String(item.quantity || 'TBN').substring(0, 100),
            quantity_mt: item.quantity_mt ? String(item.quantity_mt).substring(0, 50) : null,
            quantity_cbm: item.quantity_cbm ? String(item.quantity_cbm).substring(0, 50) : null,
            plus_minus: item.plus_minus ? String(item.plus_minus).substring(0, 50) : null,
            terms: item.terms ? String(item.terms).substring(0, 100) : null,
            special_requirements: Array.isArray(item.special_requirements) ? item.special_requirements : [],
            freight_inclusions: Array.isArray(item.freight_inclusions) ? item.freight_inclusions : [],
            waiting_clause: item.waiting_clause ? String(item.waiting_clause).substring(0, 100) : null,
            unit_weight: item.unit_weight ? String(item.unit_weight).substring(0, 100) : null,
            stowage: item.stowage ? String(item.stowage).substring(0, 100) : null,
            loadPort: String(item.loadPort || 'TBN').substring(0, 100),
            dischargePort: String(item.dischargePort || 'TBN').substring(0, 100),
            laycan: String(item.laycan || 'TBD').substring(0, 100),
            charterer: String(selectedEmail?.sender || 'Unknown').substring(0, 150),
            category: String(selectedEmail?.category || 'DRY BULK').substring(0, 100),
            status: 'ACTIVE',
            description: String(extractionResult.summary || '').substring(0, 1000),
            createdAt: new Date().toISOString()
          };

          const docRef = await addDoc(collection(db, 'cargos'), cargoData);
          await setDoc(docRef, { id: docRef.id }, { merge: true });
          createdCargos++;

          // Check for risk terms
          const combinedStr = `${item.laycan || ''} ${item.terms || ''} ${item.dischargePort || ''}`.toUpperCase();
          if (combinedStr.includes('CQD')) {
            const title = settings?.mode === 'broker_humor'
              ? "🟠 CQD detected — laytime fog ahead. Clarify before fixing."
              : "Risk Term Detected: CQD";
            addNotification({
              title,
              message: `Cargo ${item.commodity || item.cargo_type} contains CQD terms.`,
              severity: 'warning',
              entityType: 'risk',
              entityId: docRef.id,
              source: 'system'
            });
          }
        }
        
        if (createdCargos > 0 || skippedCargos > 0) {
          if (createdCargos === 1) {
            addNotification({
              title: settings?.mode === 'broker_humor' 
                ? "📦 New cargo on deck — worth a look before the market eats it." 
                : "New Cargo Added",
              message: "Processed 1 cargo from email.",
              severity: 'info',
              entityType: 'cargo',
              source: 'system'
            });
          } else if (createdCargos > 1) {
            addNotification({
              title: settings?.mode === 'broker_humor' 
                ? `📦 Circular overload. ${createdCargos} cargos dumped on the desk.` 
                : `Circular Processed: ${createdCargos} Cargos`,
              message: `Extracted ${createdCargos} cargos from circular email.`,
              severity: 'info',
              entityType: 'cargo',
              source: 'system'
            });
          }

          if (skippedCargos > 0) {
            const title = settings?.mode === 'broker_humor'
              ? "♻️ Duplicate skipped. The desk remembers — unlike some charterers."
              : "Duplicate Cargo Skipped";
            addNotification({
              title,
              message: `Omitted ${skippedCargos} previously existing cargo records.`,
              severity: 'info',
              entityType: 'system',
              source: 'system'
            });
          }

          notify({
            title: 'Cargo Published',
            message: `${createdCargos} Cargo(es) added. ${skippedCargos > 0 ? `(${skippedCargos} skipped as duplicates)` : ''}`,
            type: 'success'
          });
        }
      } 
      
      // Handle VESSEL or VESSEL_LIST
      if (extractionResult.type === 'VESSEL' || extractionResult.type === 'VESSEL_LIST' || extractionResult.type === 'MIXED_LIST') {
        const vesselsToPublish = (extractionResult.vessels || (extractionResult.vessel ? [extractionResult.vessel] : []))
          .filter((_: any, i: number) => selectedVessels.has(i));
        
        for (let i = 0; i < vesselsToPublish.length; i++) {
          const item = vesselsToPublish[i];
          const dedupeKey = [
             selectedEmail?.id || '',
             item.entry_no || String(i),
             item.name || item.vessel_name || '',
             item.dwt || '',
             item.openPort || '',
             item.openDate || ''
          ].map(normalizeStr).join('|');

          const q = query(collection(db, 'vessels'), where('userId', '==', auth.currentUser.uid), where('dedupeKey', '==', dedupeKey));
          const existing = await getDocs(q);
          
          if (!existing.empty) {
             skippedVessels++;
             continue;
          }

          const vesselData = {
            userId: auth.currentUser.uid,
            workspaceId: currentWorkspace?.id || null,
            dedupeKey,
            sourceEmailId: selectedEmail?.id || null,
            entry_no: item.entry_no || String(i),
            section_region: item.section_region ? String(item.section_region).substring(0, 100) : null,
            name: String(item.name || item.vessel_name || 'TBN').substring(0, 100),
            dwt: Number(String(item.dwt || '').replace(/[^0-9.]/g, '')) || 0,
            openPort: String(item.openPort || 'TBN').substring(0, 100),
            openDate: String(item.openDate || 'TBD').substring(0, 50),
            gear: String(item.gear || '').substring(0, 100),
            direction: String(item.direction || '').substring(0, 100),
            type: String(item.type || item.vessel_type || 'Bulk Carrier').substring(0, 100),
            owner: String(selectedEmail?.sender || 'Unknown').substring(0, 150),
            holds: item.holds ? String(item.holds).substring(0, 100) : null,
            cranes: item.cranes ? String(item.cranes).substring(0, 100) : null,
            last_cargo: item.last_cargo ? String(item.last_cargo).substring(0, 100) : null,
            suitable_for: item.suitable_for ? String(item.suitable_for).substring(0, 200) : null,
            heavy_lift_capacity: item.heavy_lift_capacity ? String(item.heavy_lift_capacity).substring(0, 100) : null,
            flag: item.flag ? String(item.flag).substring(0, 50) : null,
            class: item.class ? String(item.class).substring(0, 50) : null,
            restrictions: item.restrictions ? String(item.restrictions).substring(0, 200) : null,
            description: String(extractionResult.summary || '').substring(0, 1000),
            status: 'OPEN',
            createdAt: new Date().toISOString()
          };

          const docRef = await addDoc(collection(db, 'vessels'), vesselData);
          await setDoc(docRef, { id: docRef.id }, { merge: true });
          createdVessels++;
        }
        
        if (createdVessels > 0 || skippedVessels > 0) {
          if (createdVessels === 1) {
            addNotification({
              title: settings?.mode === 'broker_humor' 
                ? "🚢 Fresh tonnage detected. Could be a winner, could be another TBN ghost." 
                : "New Vessel Added",
              message: "Processed 1 vessel from email.",
              severity: 'info',
              entityType: 'vessel',
              source: 'system'
            });
          } else if (createdVessels > 1) {
            addNotification({
              title: settings?.mode === 'broker_humor' 
                ? `🚢 Circular tonnage dump. ${createdVessels} vessels seeking employment.` 
                : `Circular Processed: ${createdVessels} Vessels`,
              message: `Extracted ${createdVessels} vessels from circular email.`,
              severity: 'info',
              entityType: 'vessel',
              source: 'system'
            });
          }

          if (skippedVessels > 0) {
            const title = settings?.mode === 'broker_humor'
              ? "♻️ Duplicate skipped. The desk remembers — unlike some charterers."
              : "Duplicate Vessel Skipped";
            addNotification({
              title,
              message: `Omitted ${skippedVessels} previously existing vessel records.`,
              severity: 'info',
              entityType: 'system',
              source: 'system'
            });
          }

          notify({
            title: 'Vessel Published',
            message: `${createdVessels} Vessel(s) added. ${skippedVessels > 0 ? `(${skippedVessels} skipped as duplicates)` : ''}`,
            type: 'success'
          });
        }
      }

      setExtractionResult(null);
      setSelectedEmail(null);
    } catch (err: any) {
      console.error("Publishing error:", err);
      notify({
        title: 'Error Publishing',
        message: err.message,
        type: 'error'
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-surface">
      {/* View Toggle Header */}
      <div className="bg-surface-container-lowest border-b border-outline p-1 flex items-center shrink-0">
        <button 
          onClick={() => setInboxView('FEED')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-all",
            inboxView === 'FEED' ? "text-primary bg-primary/10" : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          <Mail className="h-3.5 w-3.5" />
          Inbox_Feed
        </button>
        <div className="w-[1px] h-4 bg-[#2d3f5a]" />
        <button 
          onClick={() => setInboxView('NETWORK')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-all",
            inboxView === 'NETWORK' ? "text-primary bg-primary/10" : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Desk_Network
          <div className="w-1.5 h-1.5 bg-tertiary rounded-full animate-pulse" />
        </button>
      </div>

      {inboxView === 'NETWORK' ? (
        <DeskNetwork networkState={networkState} />
      ) : (
        <div className="flex flex-1 overflow-hidden">
        {/* Inbox List */}
        <div className={cn(
          "flex flex-col border-r border-outline bg-surface overflow-hidden transition-all duration-300",
          selectedEmail ? "w-0 md:w-[400px]" : "w-full"
        )}>
          <div className="p-4 border-b border-outline bg-surface-container-high flex items-center justify-between shrink-0">
            <h2 className="font-display text-[18px] text-on-surface uppercase tracking-widest font-bold">{t('inbox_parser')}</h2>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button 
                  onClick={() => setShowAccountSelector(!showAccountSelector)}
                  className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface p-2 hover:bg-surface-container-highest transition-colors border border-outline"
                >
                  <Plus className="h-3 w-3" />
                  <span className="text-[10px] font-bold uppercase hidden sm:inline">{t('manage_sources')}</span>
                </button>
                
                <AnimatePresence>
                  {showAccountSelector && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="absolute right-0 mt-2 w-72 bg-surface-container border border-primary shadow-[0_0_50px_rgba(29,155,240,0.15)] z-50 p-6 space-y-6 overflow-hidden"
                    >
                      {/* Header with back button if connecting */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {connectingProvider && (
                            <button onClick={() => setConnectingProvider(null)} className="p-1 hover:bg-surface-dim/50 text-on-surface-variant">
                              <RotateCw className="h-3 w-3 rotate-180" />
                            </button>
                          )}
                          <h4 className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
                            {connectingProvider ? `CONNECT_${connectingProvider.toUpperCase()}` : "EMAIL_NODES"}
                          </h4>
                        </div>
                        <button onClick={() => { setShowAccountSelector(false); setConnectingProvider(null); }} className="text-on-surface-variant hover:text-on-surface">
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {!connectingProvider ? (
                        <>
                          <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar pr-1">
    {accounts.map(acc => {
      const Prov = providerIcons[acc.provider as keyof typeof providerIcons] || { icon: Mail, color: 'text-gray-500' };
      return (
        <div key={acc.id} className="flex items-center justify-between p-2.5 bg-surface border border-outline group hover:border-primary/40 transition-all">
          <div className="flex items-center gap-3 overflow-hidden">
            <Prov.icon className={cn("h-3.5 w-3.5 shrink-0", Prov.color)} />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] text-on-surface font-bold truncate uppercase">{acc.email}</span>
              <span className={cn("text-[8px] font-mono uppercase tracking-widest", acc.active ? "text-tertiary" : "text-on-surface-variant")}>
                {acc.provider}::{acc.active ? 'ACTIVE' : 'PAUSED'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); removeAccount(acc.id, acc.email); }}
              className="h-5 w-5 rounded-sm border border-outline text-on-surface-variant hover:text-red-500 hover:border-red-500/50 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
              title="Remove Account"
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <button 
              onClick={() => toggleAccount(acc.id, acc.email)}
              className={cn(
                "h-5 w-5 rounded-sm border flex items-center justify-center transition-all",
                acc.active ? "bg-primary border-primary text-on-primary" : "border-outline text-[#2d3f5a] hover:border-primary/50"
              )}
              title={acc.active ? "Pause Sync" : "Resume Sync"}
            >
              {acc.active && <Check className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      );
    })}
                          </div>

                          <div className="pt-4 border-t border-outline">
                            <p className="text-[8px] font-bold text-on-surface-variant font-mono uppercase mb-3 tracking-widest">Add_Incoming_Feed</p>
                            <div className="grid grid-cols-2 gap-2">
                              {(['gmail', 'outlook', 'icloud', 'imap'] as const).map((key) => {
                                const value = providerIcons[key];
                                return (
                                  <button 
                                    key={key}
                                    className="p-3 border border-outline hover:border-primary hover:bg-primary/5 transition-all flex flex-col items-center gap-2 group"
                                    onClick={() => {
                                      if (key === 'gmail') handleSignIn();
                                      else setConnectingProvider(key);
                                    }}
                                  >
                                    <value.icon className={cn("h-5 w-5", value.color)} />
                                    <span className="text-[8px] font-bold text-on-surface-variant group-hover:text-on-surface uppercase tracking-widest">{key}</span>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-4">
                              <button
                                onClick={() => {
                                  if (!accounts.find(a => a.provider === 'gmail')) {
                                      setAccounts(prev => [...prev, { id: `acc-${Date.now()}`, email: 'demo@gmail.com', provider: 'gmail', active: true }]);
                                  }
                                  setGlobalError(null);
                                  setIsLoggedIn(true);
                                  handleFetchEmails();
                                  setShowSetupGuide(false);
                                }}
                                className="w-full flex items-center justify-center gap-2 p-3 bg-surface-container-high hover:bg-surface-container-highest border border-outline text-[10px] font-bold text-[#b4c6e4] hover:text-on-surface uppercase tracking-widest transition-all"
                              >
                                🚀 Load Demo Data (Bypass Auth)
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <label className="text-[8px] font-bold text-on-surface-variant uppercase font-mono tracking-widest">Email_Address</label>
                              <input 
                                type="email"
                                value={newAccForm.email}
                                onChange={e => setNewAccForm(f => ({ ...f, email: e.target.value }))}
                                placeholder="cargo@private.com"
                                className="w-full bg-surface border border-outline p-2 text-[11px] text-on-surface focus:border-primary outline-none font-mono"
                              />
                            </div>
                            
                            {connectingProvider === 'imap' && (
                              <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2 space-y-1">
                                  <label className="text-[8px] font-bold text-on-surface-variant uppercase font-mono tracking-widest">IMAP_Host</label>
                                  <input 
                                    type="text"
                                    value={newAccForm.host}
                                    onChange={e => setNewAccForm(f => ({ ...f, host: e.target.value }))}
                                    placeholder="imap.server.com"
                                    className="w-full bg-surface border border-outline p-2 text-[11px] text-on-surface focus:border-primary outline-none font-mono"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[8px] font-bold text-on-surface-variant uppercase font-mono tracking-widest">Port</label>
                                  <input 
                                    type="text"
                                    value={newAccForm.port}
                                    onChange={e => setNewAccForm(f => ({ ...f, port: e.target.value }))}
                                    className="w-full bg-surface border border-outline p-2 text-[11px] text-on-surface focus:border-primary outline-none font-mono"
                                  />
                                </div>
                              </div>
                            )}

                            <div className="space-y-1">
                              <label className="text-[8px] font-bold text-on-surface-variant uppercase font-mono tracking-widest">Password / Key</label>
                              <input 
                                type="password"
                                value={newAccForm.password}
                                onChange={e => setNewAccForm(f => ({ ...f, password: e.target.value }))}
                                placeholder="••••••••"
                                className="w-full bg-surface border border-outline p-2 text-[11px] text-on-surface focus:border-primary outline-none font-mono"
                              />
                            </div>
                          </div>

                          <button 
                            disabled={!newAccForm.email || isVerifying}
                            onClick={handleConnectNew}
                            className="w-full h-10 bg-primary text-on-primary font-bold text-[10px] uppercase tracking-widest hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                          >
                            {isVerifying ? (
                              <>
                                <RotateCw className="h-4 w-4 animate-spin" /> Verifying Connection...
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" /> Finalize_Integration
                              </>
                            )}
                          </button>

                          <div className="bg-surface-dim p-2 border border-primary/20 flex items-center gap-2">
                             <Info className="h-3 w-3 text-primary" />
                             <span className="text-[7px] text-on-surface-variant uppercase font-mono leading-tight">
                               TLS/SSL secure handshake will be performed via Mesh_Relay.
                             </span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button 
                className={cn(
                  "hidden lg:flex items-center gap-2 text-[9px] font-bold border px-2 py-1 transition-colors uppercase tracking-widest",
                  viewMode === 'SECTIONS' ? "bg-secondary/10 border-secondary text-[#7856ff]" : "text-on-surface-variant border-outline hover:bg-[#2d3f5a]"
                )}
                onClick={() => setViewMode(viewMode === 'LIST' ? 'SECTIONS' : 'LIST')}
              >
                <Layout className="h-3 w-3" />
                <span className="hidden xl:inline">{viewMode === 'LIST' ? 'Distribute_AI' : 'Flat_List'}</span>
              </button>
              <button 
                className="hidden lg:flex items-center gap-2 text-tertiary text-[9px] font-bold border border-tertiary/30 px-2 py-1 bg-tertiary/5 hover:bg-tertiary/10 transition-colors uppercase tracking-widest"
                onClick={() => {
                  setLoading(true);
                  setTimeout(() => setLoading(false), 800);
                }}
              >
                <Brain className="h-3 w-3" />
                <span className="hidden xl:inline">Smart_Categorize</span>
              </button>
              <button 
                onClick={() => handleFetchEmails(false)}
                title={lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString()}` : "Refresh"}
                className="text-on-surface-variant hover:text-on-surface p-1 hover:bg-[#2d3f5a] transition-colors"
                disabled={loading}
              >
                <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {globalError && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-red-500/10 border-b border-red-500/30 p-2 overflow-hidden"
              >
                <div className="flex items-center justify-between px-2">
                  <span className="text-[10px] text-red-500 font-mono font-bold uppercase truncate pr-2">
                    ERROR: {globalError}
                  </span>
                  <button onClick={() => setGlobalError(null)} className="text-red-500 hover:text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-3 border-b border-outline bg-surface-container-lowest shrink-0 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[10px] uppercase font-mono tracking-wider text-on-surface-variant">
              <div className="flex flex-wrap items-center gap-2">
                Scanning:
                <select 
                  className="bg-transparent border border-outline text-on-surface text-[10px] p-1 outline-none focus:border-primary"
                  value={scanLimit}
                  onChange={(e) => handleScanLimitChange(Number(e.target.value))}
                >
                  <option value={10}>Last 10</option>
                  <option value={25}>Last 25</option>
                  <option value={50}>Last 50</option>
                  <option value={100}>Last 100</option>
                </select>
                <div className="w-px h-3 bg-outline/50 mx-1" />
                <span className="shrink-0">{emails.length} scanned</span>
                <span className="shrink-0">&middot; {emails.filter(e => e.relevanceStatus?.startsWith('likely_')).length} relevant</span>
                <span className="shrink-0">&middot; {emails.filter(e => e.relevanceStatus === 'irrelevant').length} skipped</span>
                <span className="shrink-0">&middot; {emails.filter(e => e.relevanceStatus === 'already_processed').length} processed</span>
              </div>
              
              <div className="flex space-x-2 shrink-0">
                <button 
                  onClick={() => handleParseMultiple(emails.filter(e => selectedForBatch.has(e.id)))}
                  disabled={selectedForBatch.size === 0}
                  className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all disabled:opacity-50"
                  title="Parse Selected"
                >
                  Parse Selected ({selectedForBatch.size})
                </button>
                <button 
                  onClick={() => handleParseMultiple(emails.filter(e => e.relevanceStatus?.startsWith('likely_')))}
                  className="px-2 py-1 bg-surface-container-highest border border-outline hover:border-primary transition-all text-on-surface"
                  title="Parse All Relevant"
                >
                  Parse All Relevant
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant" />
              <input 
                className="w-full bg-transparent border-0 border-b border-outline pl-8 pr-3 py-1.5 font-mono text-[11px] text-on-surface/80 text-on-surface focus:ring-0 focus:border-primary placeholder:text-[#2d3f5a] transition-colors"
                placeholder="Grep incoming stream..."
              />
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
               {categories.map((cat) => (
                 <button
                   key={cat.id}
                   onClick={() => setActiveCategory(cat.id)}
                   className={cn(
                     "px-3 py-1.5 flex items-center gap-2 border transition-all whitespace-nowrap",
                     activeCategory === cat.id 
                       ? "bg-primary/20 border-primary text-primary" 
                       : "bg-surface-container-highest/20 border-outline text-on-surface-variant hover:border-[#8899a6]/50"
                   )}
                 >
                   <cat.icon className="h-3 w-3" />
                   <span className="text-[10px] font-bold uppercase tracking-wider">{cat.label}</span>
                 </button>
               ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar pb-32 sm:pb-4">
            {filteredEmails.length === 0 && (
              <div className="flex flex-col items-center justify-center p-12 opacity-30">
                <Mail className="h-12 w-12 mb-4" />
                <p className="font-mono text-[11px] text-on-surface/80 text-center uppercase tracking-widest">No matching packets found</p>
              </div>
            )}
            
            {viewMode === 'LIST' ? (
              filteredEmails.map((email) => renderEmailItem(email))
            ) : (
              <div className="space-y-6 p-2">
                {Object.entries(groupedEmails).map(([group, groupEmails]) => (
                  <div key={group} className="space-y-2">
                    <div className="flex items-center justify-between px-2 py-1 border-b border-outline/30">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 bg-secondary rounded-full animate-pulse" />
                        <h4 className="text-[10px] font-bold text-on-surface uppercase tracking-[0.2em]">{group.replace('_', ' ')}</h4>
                      </div>
                      <span className="text-[8px] text-on-surface-variant font-mono">{groupEmails.length} ITEMS</span>
                    </div>
                    <div className="space-y-1">
                      {groupEmails.map(email => renderEmailItem(email, true))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Parsing Workspace */}
        <AnimatePresence>
          {selectedEmail && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="flex-1 flex flex-col bg-surface-container-lowest z-10"
            >
              <div className="p-4 border-b border-outline bg-surface-container-high flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedEmail(null)} className="md:hidden text-on-surface-variant hover:text-on-surface transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                  <h2 className="font-display text-[14px] font-bold text-on-surface uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary animate-pulse"></div>
                    AI_PARSING_ENGINE
                  </h2>
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <span className="font-sans text-[10px] font-semibold tracking-[0.15em] uppercase text-tertiary text-[9px] border border-tertiary/30 px-2 py-0.5 bg-tertiary/10 animate-pulse">COMPUTING</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono">
                 <div className="bg-surface border border-outline p-4 text-[11px] text-tertiary space-y-2">
                    <p className="mb-2">&gt;&gt; INCOMING EMAIL STREAM: {selectedEmail.id}</p>
                    <div className="opacity-70 border-l border-outline pl-3 py-1 space-y-1">
                      <p>FROM: {selectedEmail.sender}</p>
                      <p>SUBJ: {selectedEmail.subject}</p>
                      <p>BODY_DUMP: {selectedEmail.rawBody.substring(0, 300)}...</p>
                    </div>
                </div>

                {!extractionResult && parsingId !== selectedEmail.id ? (
                  <div className="flex flex-col items-center justify-center py-20 opacity-30 space-y-4">
                    <FileSearch className="h-10 w-10 text-on-surface-variant" />
                    <p className="font-mono text-[11px] text-on-surface/80 text-center w-64 uppercase tracking-[0.2em] text-[10px]">
                      Awaiting entity extraction command...
                    </p>
                    <button 
                      onClick={() => handleParse(selectedEmail)}
                      className="bg-primary text-on-primary py-2 px-8 font-sans text-[10px] font-semibold tracking-[0.15em] uppercase font-bold hover:opacity-90 transition-transform active:scale-95"
                    >
                      &gt; INIT_LOGIC_GATE
                    </button>
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    {parsingId === selectedEmail.id && (
                       <div className="p-8 flex flex-col items-center justify-center gap-4 text-[#7856ff]">
                         <RotateCw className="h-8 w-8 animate-spin" />
                         <span className="font-sans text-[10px] font-semibold tracking-[0.15em] uppercase animate-pulse">DECODING_SCHEMA...</span>
                       </div>
                    )}

                    {extractionResult && (
                      <>
                        <div className="bg-surface-container border border-outline p-4 relative">
                           <div className="font-sans text-[10px] font-semibold tracking-[0.15em] uppercase text-on-surface-variant mb-3 flex items-center gap-2 text-[10px]">
                             <Brain className="h-3 w-3 text-[#7856ff]" />
                             AI_REASONING_OUTPUT:
                             {extractionResult.cached && (
                                <span className="ml-2 bg-secondary/20 text-secondary border border-secondary/30 px-2 py-0.5 rounded-sm flex items-center gap-1 normal-case font-mono"><Check className="h-3 w-3" /> Cached</span>
                             )}
                             {extractionResult.memoryUsed?.senderProfileUsed && !extractionResult.cached && (
                                <span className="ml-2 bg-tertiary/20 text-tertiary border border-tertiary/30 px-2 py-0.5 rounded-sm normal-case font-mono border-dashed">Sender Known</span>
                             )}
                           </div>
                           <p className="text-[12px] leading-relaxed text-on-surface italic border-l-2 border-secondary pl-3">
                             {extractionResult.summary}
                           </p>
                        </div>

                        <div className="bg-surface border border-outline p-4">
                          <div className="font-sans text-[10px] font-semibold tracking-[0.15em] uppercase text-primary mb-4 border-b border-outline pb-2 flex items-center justify-between font-bold">
                            <span>EXTRACTED_ENTITIES</span>
                            <div className="font-mono text-[11px] text-on-surface/80 text-[8px] text-tertiary">[MATCH_INDEX: 94%]</div>
                          </div>
                          
                          <div className="space-y-4">
                            {extractionResult.cargoes && extractionResult.cargoes.length > 0 && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between mb-2">
                                     <div className="text-[10px] text-tertiary">CARGOES</div>
                                     <div className="flex gap-2">
                                        <button onClick={() => setSelectedCargos(new Set(extractionResult.cargoes.map((_:any,i:number)=>i)))} className="text-[9px] text-primary hover:underline">Select All</button>
                                        <button onClick={() => setSelectedCargos(new Set())} className="text-[9px] text-primary hover:underline">Deselect All</button>
                                     </div>
                                  </div>
                                  {extractionResult.cargoes.map((cargo: any, idx: number) => (
                                     <div key={`cargo-${idx}`} className={cn("bg-surface-container border p-2 space-y-2 relative transition-all", selectedCargos.has(idx) ? "border-primary" : "border-outline opacity-50")}>
                                        <div className="absolute top-2 left-2 z-10 cursor-pointer" onClick={() => {
                                           const newSet = new Set(selectedCargos);
                                           if (newSet.has(idx)) newSet.delete(idx);
                                           else newSet.add(idx);
                                           setSelectedCargos(newSet);
                                        }}>
                                           <div className={cn("w-4 h-4 border flex items-center justify-center", selectedCargos.has(idx) ? "bg-primary border-primary text-black" : "border-outline bg-transparent")}>
                                              {selectedCargos.has(idx) && <Check className="w-3 h-3" />}
                                           </div>
                                        </div>
                                        <div className="pl-6">
                                          <div className="absolute top-0 right-0 bg-primary/20 text-primary px-2 py-0.5 text-[8px] font-bold">CARGO {idx + 1}</div>
                                          <div className="grid grid-cols-2 gap-2 mt-4">
                                            {Object.entries(cargo).filter(([k, v]) => v && k !== 'missing_fields' && k !== 'entry_no' && (typeof v !== 'object' || Array.isArray(v))).map(([key, value]) => (
                                              <div key={key} className="bg-surface p-1.5 border border-outline/50">
                                                <div className="text-on-surface-variant text-[7px] uppercase mb-0.5">{key.replace(/([A-Z])/g, '_$1')}</div>
                                                <div className="text-on-surface text-[10px] font-bold truncate tracking-tight">{Array.isArray(value) ? value.join(', ') : String(value)}</div>
                                              </div>
                                            ))}
                                          </div>
                                          {cargo.missing_fields && cargo.missing_fields.length > 0 && (
                                             <div className="text-[8px] text-red-400 mt-2">Missing: {cargo.missing_fields.join(', ')}</div>
                                          )}
                                        </div>
                                     </div>
                                  ))}
                                </div>
                            )}

                            {extractionResult.vessels && extractionResult.vessels.length > 0 && (
                                <div className="space-y-2 mt-4">
                                  <div className="flex items-center justify-between mb-2">
                                     <div className="text-[10px] text-tertiary">VESSELS</div>
                                     <div className="flex gap-2">
                                        <button onClick={() => setSelectedVessels(new Set(extractionResult.vessels.map((_:any,i:number)=>i)))} className="text-[9px] text-secondary hover:underline">Select All</button>
                                        <button onClick={() => setSelectedVessels(new Set())} className="text-[9px] text-secondary hover:underline">Deselect All</button>
                                     </div>
                                  </div>
                                  {extractionResult.vessels.map((vessel: any, idx: number) => (
                                     <div key={`vessel-${idx}`} className={cn("bg-surface-container border p-2 space-y-2 relative transition-all", selectedVessels.has(idx) ? "border-secondary" : "border-outline opacity-50")}>
                                        <div className="absolute top-2 left-2 z-10 cursor-pointer" onClick={() => {
                                           const newSet = new Set(selectedVessels);
                                           if (newSet.has(idx)) newSet.delete(idx);
                                           else newSet.add(idx);
                                           setSelectedVessels(newSet);
                                        }}>
                                           <div className={cn("w-4 h-4 border flex items-center justify-center", selectedVessels.has(idx) ? "bg-secondary border-secondary text-black" : "border-outline bg-transparent")}>
                                              {selectedVessels.has(idx) && <Check className="w-3 h-3" />}
                                           </div>
                                        </div>
                                        <div className="pl-6">
                                          <div className="absolute top-0 right-0 bg-secondary/20 text-secondary px-2 py-0.5 text-[8px] font-bold">VESSEL {idx + 1}</div>
                                          <div className="grid grid-cols-2 gap-2 mt-4">
                                            {Object.entries(vessel).filter(([k, v]) => v && k !== 'missing_fields' && k !== 'entry_no' && (typeof v !== 'object' || Array.isArray(v))).map(([key, value]) => (
                                              <div key={key} className="bg-surface p-1.5 border border-outline/50">
                                                <div className="text-on-surface-variant text-[7px] uppercase mb-0.5">{key.replace(/([A-Z])/g, '_$1')}</div>
                                                <div className="text-on-surface text-[10px] font-bold truncate tracking-tight">{Array.isArray(value) ? value.join(', ') : String(value)}</div>
                                              </div>
                                            ))}
                                          </div>
                                          {vessel.missing_fields && vessel.missing_fields.length > 0 && (
                                             <div className="text-[8px] text-red-400 mt-2">Missing: {vessel.missing_fields.join(', ')}</div>
                                          )}
                                        </div>
                                     </div>
                                  ))}
                                </div>
                            )}

                             {(!extractionResult.cargoes || extractionResult.cargoes.length === 0) &&
                              (!extractionResult.vessels || extractionResult.vessels.length === 0) && 
                              extractionResult.type === 'CARGO' && extractionResult.cargo ? (
                              <div className="grid grid-cols-2 gap-3">
                                {Object.entries(extractionResult.cargo).filter(([k, v]) => v && k !== 'missing_fields' && k !== 'entry_no' && (typeof v !== 'object' || Array.isArray(v))).map(([key, value]) => (
                                   <div key={key} className="bg-surface-container p-2 border border-outline">
                                     <div className="text-on-surface-variant text-[8px] uppercase mb-0.5">{key.replace(/([A-Z])/g, '_$1')}</div>
                                     <div className="text-on-surface text-[11px] font-bold truncate tracking-tight">{Array.isArray(value) ? value.join(', ') : String(value)}</div>
                                   </div>
                                ))}
                              </div>
                            ) : (!extractionResult.cargoes || extractionResult.cargoes.length === 0) && 
                                (!extractionResult.vessels || extractionResult.vessels.length === 0) && 
                                extractionResult.type === 'VESSEL' && extractionResult.vessel ? (
                              <div className="grid grid-cols-2 gap-3">
                                {Object.entries(extractionResult.vessel).filter(([k, v]) => v && k !== 'missing_fields' && k !== 'entry_no' && (typeof v !== 'object' || Array.isArray(v))).map(([key, value]) => (
                                   <div key={key} className="bg-surface-container p-2 border border-outline">
                                     <div className="text-on-surface-variant text-[8px] uppercase mb-0.5">{key.replace(/([A-Z])/g, '_$1')}</div>
                                     <div className="text-on-surface text-[11px] font-bold truncate tracking-tight">{Array.isArray(value) ? value.join(', ') : String(value)}</div>
                                   </div>
                                ))}
                              </div>
                            ) : (!extractionResult.cargoes || extractionResult.cargoes.length === 0) && (!extractionResult.vessels || extractionResult.vessels.length === 0) && (
                              <div className="text-center py-4 text-on-surface-variant italic">No structured data found</div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-4">
                           {!isViewer && (
                             <button
                               onClick={handlePublish}
                               disabled={isPublishing || (selectedCargos.size === 0 && selectedVessels.size === 0 && (!extractionResult.cargo && !extractionResult.vessel))}
                               className={cn("w-full h-12 flex items-center justify-center bg-primary text-on-primary font-bold uppercase tracking-widest text-[12px] shadow-[0_4px_20px_rgba(29,155,240,0.2)] hover:opacity-90 transition-all", (isPublishing || (selectedCargos.size === 0 && selectedVessels.size === 0 && (!extractionResult.cargo && !extractionResult.vessel))) && "opacity-50 cursor-not-allowed")}
                             >
                               {(() => {
                                 const cLen = selectedCargos.size;
                                 const vLen = selectedVessels.size;
                                 const cTotal = extractionResult.cargoes?.length || 0;
                                 const vTotal = extractionResult.vessels?.length || 0;

                                 if (cTotal > 0 || vTotal > 0) {
                                   const selections = [];
                                   if (cLen > 0) selections.push(`${cLen} CARGOES`);
                                   if (vLen > 0) selections.push(`${vLen} VESSELS`);
                                   return selections.length > 0 ? `PUBLISH SELECTED (${selections.join(' & ')})` : 'PUBLISH SELECTED';
                                 }
                                 
                                 return extractionResult.type === 'VESSEL' ? 'APPROVE & PUBLISH VESSEL' : 'APPROVE & PUBLISH CARGO';
                               })()}
                             </button>
                           )}
                           <button onClick={() => setExtractionResult(null)} className="w-full h-10 border border-outline text-on-surface-variant font-sans text-[10px] font-semibold tracking-[0.15em] uppercase hover:bg-surface-container">
                             REJECT_EXTRACTION
                           </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
                
                <div className="h-8 md:h-4" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* OAuth Setup Guide Modal */}
        <AnimatePresence>
          {showSetupGuide && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-dim/80 p-4 backdrop-blur-sm"
            >
              <div className="bg-surface-container border border-primary max-w-lg w-full p-8 font-mono relative text-center">
                <h3 className="text-primary font-bold uppercase tracking-widest mb-4">Fallback Mode</h3>
                <p className="text-on-surface-variant font-sans text-sm mb-6">Running in Mock Data mode because VITE_GOOGLE_CLIENT_ID is not configured in the platform settings. This ensures the UI remains accessible for testing.</p>
                <button 
                  onClick={() => setShowSetupGuide(false)}
                  className="bg-primary text-on-primary py-2 px-8 font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                >
                  Continue in Demo Mode
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}
    </div>
  );
};
