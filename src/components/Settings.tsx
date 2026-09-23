import React, { useState } from 'react';
import { Settings as SettingsIcon, Cpu, User, Zap, FileText, Save, Plus, Trash2, Key, Globe, ShieldCheck, Upload, Image as ImageIcon, CheckCircle2, AlertCircle, Check, Brain, ExternalLink, Info, CheckCircle, Activity, Users, Bell, Mail, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useConfig, Language, ThemeMode } from '../lib/ConfigContext';
import { useWorkspace } from '../lib/WorkspaceContext';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, doc, updateDoc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { useNotification, NotificationCategory } from '../lib/NotificationContext';
import { useAlerts } from '../lib/AlertContext';
import { auth, useAuth } from '../lib/firebase';
import { isAuthenticated } from '../lib/googleAuth';

import { DocumentEditor } from './DocumentEditor';

type SettingsTab = 'ai' | 'broker' | 'automation' | 'docs' | 'preferences' | 'workspace' | 'alerts';

export const Settings: React.FC<{ initialTab?: SettingsTab }> = ({ initialTab }) => {
  const { t } = useConfig();
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab || 'workspace');

  // Load initial tab if it changes (e.g. from Ticker configure click)
  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  
  // Lifted Broker Profile State
  const [brokerProfile, setBrokerProfile] = useState<any>({
    name: 'Loading...',
    company: 'Loading...',
    phone: '',
    whatsapp: '',
    website: '',
    role: '',
    region: '',
    email: '',
    deskId: '',
    commission: '1.25',
    address: '',
    showProfileInDocs: true,
    signatureImage: null as string | null,
    signatureStyle: 'font-signature-formal',
    signatureType: 'digital' as 'image' | 'digital'
  });
  
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
       if (snap.exists()) {
          const data = snap.data();
          setBrokerProfile((prev: any) => ({
             ...prev,
             name: data.displayName || prev.name,
             company: data.companyName || prev.company,
             role: data.role || prev.role,
             region: data.region || prev.region,
             phone: data.phone || prev.phone,
             whatsapp: data.whatsapp || prev.whatsapp,
             website: data.website || prev.website,
             email: data.email || prev.email,
             deskId: data.deskId || prev.deskId,
             ...data.brokerConfig
          }));
       }
    });
    return () => unsub();
  }, []);

  const handleApplyChanges = async () => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
         displayName: brokerProfile.name,
         companyName: brokerProfile.company,
         role: brokerProfile.role || '',
         region: brokerProfile.region || '',
         phone: brokerProfile.phone || '',
         whatsapp: brokerProfile.whatsapp || '',
         website: brokerProfile.website || '',
         brokerConfig: {
            commission: brokerProfile.commission,
            address: brokerProfile.address,
            showProfileInDocs: brokerProfile.showProfileInDocs,
            signatureImage: brokerProfile.signatureImage,
            signatureStyle: brokerProfile.signatureStyle,
            signatureType: brokerProfile.signatureType,
         },
         updatedAt: serverTimestamp()
      });

      if (brokerProfile.deskId) {
         const profileRef = doc(db, 'publicProfiles', brokerProfile.deskId);
         await setDoc(profileRef, {
             uid: auth.currentUser.uid,
             deskId: brokerProfile.deskId,
             displayName: brokerProfile.name,
             companyName: brokerProfile.company,
             role: brokerProfile.role || '',
             region: brokerProfile.region || '',
             updatedAt: serverTimestamp()
         }, { merge: true });
      }

      notify({ type: 'success', title: 'Settings Saved', message: 'Your profile and settings have been updated.' });
    } catch (err: any) {
      console.error(err);
      notify({ type: 'error', title: 'Error', message: 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface overflow-hidden">
      <div className="p-4 border-b border-outline bg-surface-container shrink-0 flex items-center justify-between">
        <div>
          <h2 className="font-display text-[18px] text-on-surface uppercase tracking-widest font-bold">{t('config_matrix')}</h2>
          <p className="text-on-surface-variant text-[10px] uppercase font-mono">{t('system_params')}</p>
        </div>
        <button onClick={handleApplyChanges} disabled={saving} className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 hover:opacity-90 transition-colors rounded-sm text-[12px] font-bold uppercase tracking-wider disabled:opacity-50">
          <Save className="h-4 w-4" />
          {saving ? 'SAVING...' : t('apply_changes')}
        </button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Sub-navigation */}
        <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-outline bg-surface-container flex flex-row md:flex-col p-2 md:p-4 gap-2 overflow-x-auto md:overflow-x-visible shrink-0">
          <TabButton 
            active={activeTab === 'workspace'} 
            onClick={() => setActiveTab('workspace')} 
            icon={Users} 
            label="Workspace" 
            sub="Team structure & roles"
          />
          <TabButton 
            active={activeTab === 'broker'} 
            onClick={() => setActiveTab('broker')} 
            icon={User} 
            label={t('broker_id')} 
            sub="Personal Profile"
          />
          <TabButton 
            active={activeTab === 'automation'} 
            onClick={() => setActiveTab('automation')} 
            icon={Zap} 
            label={t('automation')} 
            sub="Inbox & Auto-Replies"
          />
          <TabButton 
            active={activeTab === 'docs'} 
            onClick={() => setActiveTab('docs')} 
            icon={FileText} 
            label={t('legal_docs')} 
            sub="GECON & RECAP Specs"
          />
          <TabButton 
            active={activeTab === 'preferences'} 
            onClick={() => setActiveTab('preferences')} 
            icon={Globe} 
            label={t('preferences')} 
            sub="Language & Interface"
          />
          <TabButton 
            active={activeTab === 'alerts'} 
            onClick={() => setActiveTab('alerts')} 
            icon={Bell} 
            label="Alerts" 
            sub="Broker Notifications"
          />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-surface-container-low pb-32 md:pb-8">
          <div className="max-w-3xl mx-auto">
            {activeTab === 'workspace' && <WorkspaceConfig />}
            {activeTab === 'broker' && <BrokerConfig profile={brokerProfile} setProfile={setBrokerProfile} />}
            {activeTab === 'automation' && <AutomationConfig />}
            {activeTab === 'docs' && <DocsConfig brokerProfile={brokerProfile} />}
            {activeTab === 'preferences' && <PreferencesConfig />}
            {activeTab === 'alerts' && <AlertsConfig />}
          </div>
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon: Icon, label, sub }: any) => (
  <button 
    onClick={onClick}
    className={cn(
      "shrink-0 w-auto md:w-full p-3 md:p-4 flex items-center gap-2 md:gap-4 transition-all text-left border-b-2 md:border-b-0 md:border-l-2",
      active ? "bg-primary/10 border-primary text-on-surface" : "bg-transparent border-transparent text-on-surface-variant hover:bg-surface-dim/50"
    )}
  >
    <Icon className={cn("h-4 w-4 md:h-5 md:w-5 shrink-0", active ? "text-primary" : "text-on-surface-variant")} />
    <div className="hidden md:block">
      <div className="text-[12px] font-bold uppercase tracking-wider leading-none mb-1">{label}</div>
      <div className="text-[10px] lowercase font-mono opacity-60 leading-none">{sub}</div>
    </div>
    <div className="block md:hidden text-[10px] uppercase font-bold tracking-wider">{label}</div>
  </button>
);

const MemoryMetrics = () => {
  const [metrics, setMetrics] = useState<any>(null);

  React.useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(query(collection(db, `users/${auth.currentUser.uid}/usage`)), (snap) => {
      let data = {};
      snap.forEach(doc => {
        if (doc.id === 'aiMetrics') {
          data = doc.data();
        }
      });
      setMetrics(data);
    }, (err) => console.error("usage snap error", err));
    return () => unsub();
  }, []);

  if (!metrics) return null;

  const hitRate = metrics.parseRequestsTotal > 0 ? Math.round((metrics.cacheHitCount || 0) / metrics.parseRequestsTotal * 100) : 0;

  return (
    <div className="mt-8 bg-surface-container border border-outline/50 p-4 rounded-sm">
      <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest mb-4 flex items-center gap-2">
        <Brain className="h-4 w-4 text-tertiary" /> Broker Memory & Usage Metrics
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-3 bg-surface border border-outline/30">
          <div className="text-[8px] text-on-surface-variant font-mono uppercase mb-1">AI Calls Made</div>
          <div className="text-[14px] font-bold text-on-surface">{metrics.aiCallsMade || 0}</div>
        </div>
        <div className="p-3 bg-tertiary/10 border border-tertiary/30">
          <div className="text-[8px] text-tertiary font-mono uppercase mb-1">AI Calls Saved (Cache)</div>
          <div className="text-[14px] font-bold text-tertiary">{metrics.aiCallsSavedByCache || 0}</div>
        </div>
        <div className="p-3 bg-surface border border-outline/30">
          <div className="text-[8px] text-on-surface-variant font-mono uppercase mb-1">Cache Hit Rate</div>
          <div className="text-[14px] font-bold text-on-surface">{hitRate}%</div>
        </div>
        <div className="p-3 bg-surface border border-outline/30">
          <div className="text-[8px] text-on-surface-variant font-mono uppercase mb-1">Sender Profile Hits</div>
          <div className="text-[14px] font-bold text-on-surface">{metrics.senderProfileUsedCount || 0}</div>
        </div>
        <div className="p-3 bg-surface border border-outline/30">
          <div className="text-[8px] text-on-surface-variant font-mono uppercase mb-1">Risk Rule Hits</div>
          <div className="text-[14px] font-bold text-on-surface">{metrics.riskRuleAppliedCount || 0}</div>
        </div>
        <div className="p-3 bg-surface border border-outline/30">
          <div className="text-[8px] text-on-surface-variant font-mono uppercase mb-1">Total Parses</div>
          <div className="text-[14px] font-bold text-on-surface">{metrics.parseRequestsTotal || 0}</div>
        </div>
      </div>
    </div>
  );
};



const BrokerConfig = ({ profile, setProfile }: { profile: any, setProfile: any }) => {
  const [deskId, setDeskId] = useState<string>('');
  
  React.useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      if (snap.exists()) {
         setDeskId(snap.data().deskId || '');
      }
    });
    return () => unsub();
  }, []);

  const handleCopyDeskId = () => {
    if (deskId) {
      navigator.clipboard.writeText(deskId);
      alert('Desk ID copied to clipboard!');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfile({ ...profile, signatureImage: reader.result as string, signatureType: 'image' });
      };
      reader.readAsDataURL(file);
    }
  };

  const signatureStyles = [
    { id: 'font-signature-formal', name: 'Formal Script' },
    { id: 'font-signature-casual', name: 'Handwritten' },
    { id: 'font-signature-elegant', name: 'Elegant Calligraphy' },
    { id: 'font-mono', name: 'Digital Typed' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <SectionHeader title="Broker_Profile_Registry" sub="Standardize your company identity for legal document generation." />
      
      {/* Desk ID Panel */}
      <div className="p-6 bg-surface-container border border-outline rounded-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h5 className="text-[12px] font-bold text-on-surface uppercase tracking-widest mb-1 flex items-center gap-2">
            <User className="h-4 w-4 text-primary" /> Global Desk ID
          </h5>
          <p className="text-[10px] text-on-surface-variant font-mono uppercase">Your public identifier for Desk Network connections</p>
        </div>
        <div className="flex items-center gap-2 bg-surface p-2 border border-outline/30 rounded-sm w-full sm:w-auto">
          <div className="px-3 font-mono text-[14px] font-bold text-primary tracking-widest flex-1 text-center sm:text-left select-all">
            {deskId || 'LOADING...'}
          </div>
          <button 
            onClick={handleCopyDeskId}
            disabled={!deskId}
            className="p-2 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary transition-colors rounded-sm ml-2"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Visibility Toggle */}
      <div className="p-4 bg-primary/5 border border-primary/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
           <Zap className="h-5 w-5 text-primary" />
           <div>
              <h5 className="text-[12px] font-bold text-on-surface uppercase mb-1">Share_Profile_Data</h5>
              <p className="text-[10px] text-on-surface-variant font-mono uppercase">Include Name, Company, and Contact in shared documents</p>
           </div>
        </div>
        <Toggle 
          active={profile.showProfileInDocs} 
          onToggle={() => setProfile({ ...profile, showProfileInDocs: !profile.showProfileInDocs })} 
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InputGroup 
          label="Full Name" 
          value={profile.name}
          onChange={(e: any) => setProfile({ ...profile, name: e.target.value })}
          placeholder="Ex: John Harrison" 
          icon={User} 
        />
        <InputGroup 
          label="Company Name" 
          value={profile.company}
          onChange={(e: any) => setProfile({ ...profile, company: e.target.value })}
          placeholder="Ex: Meridian Shipbrokers Ltd" 
          icon={Globe} 
        />
        <InputGroup 
          label="Role / Title" 
          value={profile.role || ''}
          onChange={(e: any) => setProfile({ ...profile, role: e.target.value })}
          placeholder="Shipbroker" 
        />
        <InputGroup 
          label="Email Account" 
          value={profile.email}
          onChange={() => {}}
          placeholder="j.harrison@meridian.com" 
          disabled
        />
        <InputGroup 
          label="Region / Country" 
          value={profile.region || ''}
          onChange={(e: any) => setProfile({ ...profile, region: e.target.value })}
          placeholder="London, UK" 
        />
        <InputGroup 
          label="Website" 
          value={profile.website || ''}
          onChange={(e: any) => setProfile({ ...profile, website: e.target.value })}
          placeholder="https://meridian.com" 
        />
        <InputGroup 
          label="Phone Number" 
          value={profile.phone}
          onChange={(e: any) => setProfile({ ...profile, phone: e.target.value })}
          placeholder="+44 20 7946 0958" 
        />
        <InputGroup 
          label="WhatsApp" 
          value={profile.whatsapp || ''}
          onChange={(e: any) => setProfile({ ...profile, whatsapp: e.target.value })}
          placeholder="+44 7700 900077" 
        />
        <InputGroup 
          label="Default Commission (%)" 
          value={profile.commission}
          onChange={(e: any) => setProfile({ ...profile, commission: e.target.value })}
          placeholder="1.25" 
        />
        <InputGroup 
          label="Address" 
          value={profile.address}
          onChange={(e: any) => setProfile({ ...profile, address: e.target.value })}
          placeholder="Level 24, The Shard, London" 
        />
      </div>

      <div className="space-y-6">
         <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest px-1">Signature_Authentication</h4>
            <div className="flex bg-surface-container p-1 border border-outline rounded-sm">
               <button 
                 onClick={() => setProfile({ ...profile, signatureType: 'digital' })}
                 className={cn(
                   "px-3 py-1 text-[9px] uppercase font-bold transition-all",
                   profile.signatureType === 'digital' ? "bg-primary text-on-primary" : "text-on-surface-variant"
                 )}
               >
                 Digital
               </button>
               <button 
                 onClick={() => setProfile({ ...profile, signatureType: 'image' })}
                 className={cn(
                   "px-3 py-1 text-[9px] uppercase font-bold transition-all",
                   profile.signatureType === 'image' ? "bg-primary text-on-primary" : "text-on-surface-variant"
                 )}
               >
                 Image Upload
               </button>
            </div>
         </div>

         {profile.signatureType === 'image' ? (
           <div className="space-y-4">
              <div 
                className={cn(
                  "h-32 border-2 border-dashed border-outline transition-all flex flex-col items-center justify-center p-4 relative group overflow-hidden",
                  profile.signatureImage ? "bg-white" : "bg-surface-dim"
                )}
              >
                {profile.signatureImage ? (
                  <>
                    <img src={profile.signatureImage} alt="Signature" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                    <div className="absolute inset-0 bg-surface-container-highest/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <label className="cursor-pointer bg-primary text-on-primary px-4 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Replace_Image
                          <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                       </label>
                    </div>
                  </>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
                    <Upload className="h-8 w-8" />
                    <span className="text-[10px] uppercase font-mono font-bold tracking-widest">Upload_Signature (PNG/JPG/WEBP)</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                  </label>
                )}
              </div>
              <p className="text-[9px] text-on-surface-variant font-mono italic">Recommended: Transparent PNG with high contrast dark ink.</p>
           </div>
         ) : (
           <div className="space-y-6">
              <div className="h-32 bg-white flex items-center justify-center p-4 shadow-inner border-y-4 border-primary/20">
                 <span className={cn("text-black text-[32px] select-none", profile.signatureStyle)}>
                    {profile.name || "John Harrison"}
                 </span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                 {signatureStyles.map((style) => (
                   <button
                     key={style.id}
                     onClick={() => setProfile({ ...profile, signatureStyle: style.id })}
                     className={cn(
                       "p-3 border transition-all text-left flex flex-col gap-2 relative",
                       profile.signatureStyle === style.id 
                         ? "border-primary bg-primary/10" 
                         : "border-outline bg-surface-container hover:border-primary/50"
                     )}
                   >
                     <span className={cn("text-on-surface text-[16px] truncate", style.id)}>Signature</span>
                     <span className="text-[8px] text-on-surface-variant font-mono uppercase font-bold">{style.name}</span>
                     {profile.signatureStyle === style.id && (
                       <CheckCircle2 className="h-3 w-3 text-primary absolute top-1 right-1" />
                     )}
                   </button>
                 ))}
              </div>
           </div>
         )}
      </div>
    </div>
  );
};

const AutomationConfig = () => {
  const [isGmailConnected, setIsGmailConnected] = useState(isAuthenticated());
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleConnectGmail = async () => {
    setConnecting(true);
    setConnectionError(null);
    try {
      const { getAccessToken } = await import('../lib/googleAuth');
      await getAccessToken(true);
      setIsGmailConnected(true);
    } catch (e: any) {
      console.error(e);
      setConnectionError(e.message || "Could not connect Gmail");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <SectionHeader
        title="Workflow_Automation"
        sub="Production controls are intentionally conservative: AI may parse and draft, but outbound communication always requires human approval."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 border border-outline bg-surface-container flex flex-col gap-4">
          <div>
            <h5 className="text-[12px] font-bold text-on-surface uppercase mb-1">Email Integration</h5>
            <p className="text-[10px] text-on-surface-variant leading-relaxed">
              Connect Gmail for authenticated inbox ingestion. IMAP sources can be configured from the Inbox source manager.
            </p>
          </div>
          {isGmailConnected ? (
            <div className="px-4 py-3 bg-primary/10 text-primary border border-primary/30 text-[10px] font-bold uppercase tracking-widest text-center">
              Gmail Connected
            </div>
          ) : (
            <button
              onClick={handleConnectGmail}
              disabled={connecting}
              className="min-h-11 px-6 py-3 bg-on-surface text-surface hover:bg-on-surface/90 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {connecting ? 'Connecting...' : 'Connect Gmail'}
            </button>
          )}
          {connectionError && (
            <div className="border border-error/30 bg-error/5 p-3 text-[10px] text-error">{connectionError}</div>
          )}
        </div>

        <div className="p-4 border border-tertiary/30 bg-tertiary/5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-tertiary" />
            <h5 className="text-[12px] font-bold text-on-surface uppercase">Human Approval Gate</h5>
          </div>
          <p className="text-[10px] text-on-surface-variant leading-relaxed">
            Automatic outbound email is disabled by design. AI can classify messages, extract cargo/tonnage, prepare risk notes and draft replies; a broker must review and explicitly send any external communication.
          </p>
          <div className="text-[9px] font-mono uppercase tracking-widest text-tertiary">
            OUTBOUND_MODE: MANUAL_APPROVAL_ONLY
          </div>
        </div>
      </div>

      <div className="border border-outline bg-surface-container p-4 sm:p-5">
        <h4 className="text-[11px] font-bold text-on-surface uppercase tracking-widest mb-4">Production Workflow</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            ['1', 'Ingest', 'Gmail / IMAP / manual text enters the private workspace.'],
            ['2', 'Analyze', 'AI extracts structured cargo or vessel fields and flags uncertainty.'],
            ['3', 'Approve', 'Broker reviews extracted data, matching, economics and any drafted response before action.']
          ].map(([step, title, body]) => (
            <div key={step} className="border border-outline/40 bg-surface-container-low p-4">
              <div className="text-[9px] font-mono text-primary uppercase tracking-widest mb-2">Step {step}</div>
              <div className="text-[12px] font-bold text-on-surface uppercase mb-2">{title}</div>
              <p className="text-[10px] leading-relaxed text-on-surface-variant">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-outline bg-surface-container-low p-4">
        <div className="flex items-start gap-3">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface">No synthetic automation telemetry</div>
            <p className="mt-1 text-[10px] leading-relaxed text-on-surface-variant">
              This screen does not fabricate CPU load, inbox scans, matches, rules or sent replies. Operational state comes from the actual inbox, usage, alerts and deployment diagnostics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const DocsConfig = ({ brokerProfile }: { brokerProfile: any }) => {
  const [activePreview, setActivePreview] = useState<'RECAP' | 'GENCON' | null>(null);
  const [livePreviewType, setLivePreviewType] = useState<'RECAP' | 'GENCON'>('GENCON');
  const [aiCharterer, setAiCharterer] = useState(true);
  const [hoveredClause, setHoveredClause] = useState<string | null>(null);
  const [ownerDetails, setOwnerDetails] = useState({
    name: 'Global Maritime Holdings',
    address: 'Rue du Rhône 42, Geneva, Switzerland',
    signee: 'Capt. Erik Sørensen'
  });

  const [selectedClauses, setSelectedClauses] = useState<string[]>(['Piracy', 'War Risk']);
  const [arbitration, setArbitration] = useState('London / LMAA');

  const arbitrationOptions = [
    { id: 'London / LMAA', label: 'London / LMAA Terms' },
    { id: 'New York / SMA', label: 'New York / SMA Terms' },
    { id: 'Singapore / SCMA', label: 'Singapore / SCMA' }
  ];

  const arbitrationLabel = arbitrationOptions.find(o => o.id === arbitration)?.label || arbitration || 'AS PER GENCON 94';

  const [clausesList, setClausesList] = useState([
    { id: 'Piracy', title: 'BIMCO Piracy Clause 2013', text: 'If, in the reasonable judgement of the Master, any port, place, area or zone is dangerous...' },
    { id: 'War Risk', title: 'War Risk Clause (CONWORTIME)', text: 'The Vessel shall not be obliged to proceed or required to continue to or through any port...' },
    { id: 'AIS', title: 'AIS Data Monitoring Clause', text: 'Charterers shall not at any time request the Master to switch off the Vessel\'s Automatic Identification System...' }
  ]);

  const [isAddingClause, setIsAddingClause] = useState(false);
  const [newClause, setNewClause] = useState({ title: '', text: '' });

  const toggleClause = (id: string) => {
    setSelectedClauses(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const handleAddClause = () => {
    if (!newClause.title || !newClause.text) return;
    const newId = `custom-${Date.now()}`;
    setClausesList(prev => [...prev, { id: newId, title: newClause.title, text: newClause.text }]);
    setSelectedClauses(prev => [...prev, newId]);
    setIsAddingClause(false);
    setNewClause({ title: '', text: '' });
  };

  const previewRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (previewRef.current && (selectedClauses.length > 0 || hoveredClause)) {
      const scrollHeight = previewRef.current.scrollHeight;
      previewRef.current.scrollTo({
        top: scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [selectedClauses, hoveredClause]);

  const [templates, setTemplates] = useState({
    recap: `ACCOUNT: [CHARTERER_NAME]
VESSEL: [Vessel Name]
CARGO: [CARGO_DESCRIPTION]
L/P: [Load Port]
D/P: [DISCHARGE_PORT]
LAYCAN: [LAYCAN_START] - [LAYCAN_END]
FREIGHT: [FREIGHT_RATE]
ARBITRATION: [ARBITRATION_TERMS]
BROKER: [BROKER_COMPANY] - [BROKER_NAME]`,
    gencon: `GENCON 94 - STANDARD CHARTER PARTY
PART I

1. Shipbroker
   [BROKER_COMPANY]
   [BROKER_NAME]
   [BROKER_CONTACT]

2. Place and date
   [CURRENT_DATE]

3. Owners/Place of business
   [OWNER_NAME]
   [OWNER_ADDRESS]

4. Charterers/Place of business
   [CHARTERER_NAME]

5. Vessel's name
   [Vessel Name]
   IMO: [VESSEL_IMO] / Flag: [VESSEL_FLAG]

6. GRT/NRT
   AS PER REGISTER

7. DWT on summer load line in metric tons
   [VESSEL_DWT]

8. Present position
   [VESSEL_POSITION]

9. Expected ready to load (abt.)
   [LAYCAN_START]

10. Loading port or place
    [Load Port]

11. Discharging port or place
    [DISCHARGE_PORT]

12. Cargo (also state quantity and margin)
    [CARGO_QUANTITY] MT [CARGO_DESCRIPTION]

13. Freight rate (also state whether freight prepaid or payable on delivery)
    [FREIGHT_RATE] FIOST 1/1

14. Freight payment
    100% WITHIN 3 BANKING DAYS FROM SIGNING BS/L

15. State if vessel's cargo handling gear shall not be used
    N/A

16. Laytime (if separate days for load/discharge)
    AS PER CHARTER PARTY FIXTURE RECAP

17. Shippers/Receivers
    TBA

18. Agents (loading)
    CHARTERERS' AGENTS

19. Agents (discharging)
    CHARTERERS' AGENTS

20. Demurrage rate and manner of payable
    AS AGREED PDPR

21. Cancelling date
    [LAYCAN_END]

22. General Average to be adjusted at
    LONDON

23. Freight Tax
    FOR CHARTERERS ACCOUNT

24. Brokerage commission and to whom payable
    [BROKER_COMMISSION]% TO [BROKER_COMPANY]

25. Law and Arbitration
    [ARBITRATION_TERMS]

26. Additional clauses covering special provisions, if agreed
    AS PER RIDER ATTACHED
`
  });

  // Sample data for preview
  const sampleData = {
    cargo: { commodity: 'Iron Ore', quantity: '150,000 MT', loadPort: 'Tubarao', dischargePort: 'Qingdao', laycan: '10-20 Dec' },
    vessel: { name: 'MV OCEAN TITAN', type: 'Capesize', dwt: 180000, builtYear: 2018 },
    calculation: { estimatedFreight: '$24.50' }
  };

  const replacePlaceholders = (templateText: string, data: any, arbLabel: string) => {
    if (!templateText) return '';
    const replacements: Record<string, string> = {
      '[CHARTERER_NAME]': data.aiCharterer ? 'PACIFIC MATERIALS TRADING' : '[TBN]',
      '[Vessel Name]': data.vessel?.name || 'TBA',
      '[CARGO_DESCRIPTION]': data.cargo ? data.cargo.commodity : '',
      '[CARGO_QUANTITY]': data.cargo ? data.cargo.quantity : '',
      '[Load Port]': data.cargo?.loadPort || 'TBA',
      '[DISCHARGE_PORT]': data.cargo?.dischargePort || 'TBA',
      '[LAYCAN_START] - [LAYCAN_END]': data.cargo?.laycan || 'TBA',
      '[LAYCAN_START]': data.cargo?.laycan?.split('-')[0] || 'TBA',
      '[LAYCAN_END]': data.cargo?.laycan?.split('-')[1]?.trim() || 'TBA',
      '[FREIGHT_RATE]': data.calculation?.estimatedFreight || 'TBA',
      '[ARBITRATION_TERMS]': arbLabel,
      '[OWNER_NAME]': data.owner?.name || '[REGISTERED_OWNER]',
      '[OWNER_ADDRESS]': data.owner?.address || '[OWNER_LEGAL_ADDRESS]',
      '[BROKER_COMPANY]': data.broker?.showProfileInDocs ? (data.broker.company || 'Meridian Shipbrokers Ltd') : 'Direct',
      '[BROKER_NAME]': data.broker?.showProfileInDocs ? (data.broker.name || 'John Harrison') : '',
      '[BROKER_ADDRESS]': data.broker?.showProfileInDocs ? (data.broker.address || '') : '',
      '[BROKER_CONTACT]': data.broker?.showProfileInDocs ? ((data.broker.phone || '') + (data.broker.email ? ` / ${data.broker.email}` : '')) : '',
      '[AI_IDENTIFIED_ENTITY]': data.aiCharterer ? 'AI_IDENTIFIED: PACIFIC MATERIALS TRADING' : '[CHARTERER_UNIDENTIFIED]',
      '[CURRENT_DATE]': new Date().toLocaleDateString(),
      '[VESSEL_IMO]': data.vessel?.imo || 'TBA',
      '[VESSEL_FLAG]': data.vessel?.flag || 'TBA',
      '[VESSEL_DWT]': data.vessel?.dwt || 'TBA',
      '[VESSEL_POSITION]': data.vessel?.position || 'TRADING',
      '[BROKER_COMMISSION]': data.broker?.commission || '1.25',
    };

    let result = templateText;
    for (const [tag, value] of Object.entries(replacements)) {
      result = result.split(tag).join(value);
    }
    return result;
  };

  const getLiveDocumentContent = (type: 'RECAP' | 'GENCON') => {
    const data = { 
      ...sampleData, 
      owner: ownerDetails, 
      aiCharterer,
      clauses: selectedClauses,
      arbitration: arbitration,
      broker: brokerProfile
    };

    if (type === 'RECAP') {
      const replacedRecap = replacePlaceholders(templates.recap, data, arbitrationLabel);
      
      return (
        <div className="space-y-4">
          <div>
            {"++++++++++++++++++++++++++++++++++++++++++++++++++++++\n"}
            {"RECAP OF FIXTURE - [LIVE_PREVIEW]\n"}
            {`DATE: ${new Date().toLocaleDateString()}\n`}
            {"++++++++++++++++++++++++++++++++++++++++++++++++++++++\n"}
          </div>
          
          <div>
            {replacedRecap}
          </div>

          <div className="border-t border-tertiary/10 pt-2 mt-2">
            <span className="text-[8px] opacity-60">ADDITIONAL CLAUSES:</span>
            {data.clauses.map(c => (
               <div key={c} className="text-tertiary ml-2">✓ {c}</div>
            ))}
            {data.clauses.length === 0 && <div className="text-on-surface-variant ml-2 opacity-40">NONE</div>}
          </div>

          {"++++++++++++++++++++++++++++++++++++++++++++++++++++++"}
        </div>
      );
    }

    if (type === 'GENCON') {
      const replacedGencon = replacePlaceholders(templates.gencon, data, arbitrationLabel);
      
      const renderClause = (clauseId: string, title: string, text: string, clauseNum: number) => {
        const isSelected = data.clauses.includes(clauseId);
        const isHovered = hoveredClause === clauseId;

        if (!isSelected && !isHovered) return null;

        return (
          <div 
            key={clauseId}
            className={cn(
              "p-2 my-1 border-l-2 transition-all",
              isSelected ? "border-tertiary bg-tertiary/10" : "border-primary bg-primary/10 animate-pulse"
            )}
          >
            <div className="font-bold uppercase mb-1">
              {isSelected ? '[SELECTED] ' : '[PREVIEW] '}
              Clause {clauseNum}. {title}
            </div>
            <div className="opacity-80 italic">{text}</div>
          </div>
        );
      };

      return (
        <div className="space-y-4">
          <div className="font-bold text-center border-b border-tertiary/20 pb-2 mb-4">
            GENCON 94 CHARTER PARTY (DRAFT)
          </div>
          
          <div>
            {replacedGencon}
          </div>

          <div className="border-t border-tertiary/20 pt-4 mt-4">
            <div className="font-bold uppercase mb-2">STANDARD CLAUSES & RIDERS</div>
            <div className="space-y-2">
              {clausesList.map((clause, idx) => 
                renderClause(clause.id, clause.title, clause.text, 15 + idx)
              )}
              {(!data.clauses.length && !hoveredClause) && <div className="opacity-30 italic">No additional clauses selected.</div>}
            </div>
          </div>
          <div className="mt-4 text-center">++++++++++++++++++++++++++++++++++++++++++++++++++++++</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <SectionHeader title="Document_Generation_Specs" sub="Templates and legal clauses for GECON and RECAP outputs." />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest px-1">Registered_Owner_Details</h4>
            <div className="space-y-3 bg-surface-container p-4 border border-outline">
               <InputGroup label="Entity Name" value={ownerDetails.name} onChange={(e: any) => setOwnerDetails({...ownerDetails, name: e.target.value})} />
               <InputGroup label="Address" value={ownerDetails.address} onChange={(e: any) => setOwnerDetails({...ownerDetails, address: e.target.value})} />
               <InputGroup label="Authorized Signee" value={ownerDetails.signee} onChange={(e: any) => setOwnerDetails({...ownerDetails, signee: e.target.value})} />
            </div>
         </div>

         <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest px-1">AI_Configuration</h4>
            <div className="p-4 border border-outline bg-surface-container flex items-center justify-between">
               <div>
                  <h5 className="text-[12px] font-bold text-on-surface uppercase mb-1">AI Charterer Identification</h5>
                  <p className="text-[10px] text-on-surface-variant">Automatically extract and verify charterer legal names.</p>
               </div>
               <Toggle active={aiCharterer} onToggle={() => setAiCharterer(!aiCharterer)} />
            </div>
            
            <div className="p-4 bg-primary/5 border border-primary/20 flex items-start gap-3">
               <Brain className="h-4 w-4 text-primary shrink-0" />
               <p className="text-[10px] text-on-surface-variant leading-relaxed">
                  When enabled, Voyage-Cortex will cross-reference email signatures with market intelligence databases to populate Box 4 of the GENCON form.
               </p>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="p-4 border border-outline bg-surface-container">
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-[11px] font-bold text-on-surface uppercase group-hover:text-primary transition-colors">Additional Clauses Library</h5>
              </div>
              <div className="space-y-1 mb-3">
                {clausesList.map(clause => (
                  <button 
                    key={clause.id}
                    onClick={() => toggleClause(clause.id)}
                    onMouseEnter={() => setHoveredClause(clause.id)}
                    onMouseLeave={() => setHoveredClause(null)}
                    className={cn(
                      "w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-mono transition-colors",
                      selectedClauses.includes(clause.id) ? "text-primary bg-primary/5 border-l border-primary" : "text-on-surface-variant hover:text-on-surface border-l border-transparent"
                    )}
                  >
                    <span className="text-left truncate max-w-[80%]">• {clause.title}</span>
                    {selectedClauses.includes(clause.id) && <Check className="h-3 w-3 shrink-0" />}
                  </button>
                ))}
              </div>
              
              {isAddingClause ? (
                <div className="space-y-3 pt-3 border-t border-outline">
                  <input
                    type="text"
                    value={newClause.title}
                    onChange={(e) => setNewClause({ ...newClause, title: e.target.value })}
                    placeholder="Clause Title (e.g., Force Majeure)"
                    className="w-full bg-surface-container-highest border border-outline text-on-surface px-2 py-1 flex items-center text-[10px] focus:outline-none focus:border-primary font-mono placeholder:text-on-surface/20"
                  />
                  <textarea
                    value={newClause.text}
                    onChange={(e) => setNewClause({ ...newClause, text: e.target.value })}
                    placeholder="Clause Text..."
                    rows={4}
                    className="w-full bg-surface-container-highest border border-outline text-on-surface p-2 text-[10px] focus:outline-none focus:border-primary font-mono resize-none placeholder:text-on-surface/20"
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      onClick={() => setIsAddingClause(false)}
                      className="px-2 py-1 text-[9px] font-bold uppercase text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleAddClause}
                      className="px-3 py-1 bg-primary text-black text-[9px] font-bold uppercase tracking-widest rounded-sm hover:bg-primary/90 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Add Custom Clause
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setIsAddingClause(true)}
                  className="w-full py-2 border border-dashed border-outline text-primary text-[9px] font-bold uppercase tracking-widest hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
                >
                  <Plus className="h-3 w-3" />
                  Define New Clause
                </button>
              )}
            </div>
            <div className="p-4 border border-outline bg-surface-container">
              <h5 className="text-[11px] font-bold text-on-surface uppercase mb-2">Arbitration & Law</h5>
              <div className="space-y-1">
                {arbitrationOptions.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setArbitration(opt.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-mono transition-colors",
                      arbitration === opt.id ? "text-[#7856ff] bg-secondary/5 border-l border-secondary" : "text-on-surface-variant hover:text-on-surface"
                    )}
                  >
                    <span>{opt.label}</span>
                    {arbitration === opt.id ? (
                      <span className="text-[#7856ff] text-[8px] border border-secondary/20 px-1">ACTIVE</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Preview Panel */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">Live_Document_Stream</h4>
            <div className="flex bg-surface-container p-0.5 border border-outline rounded-sm">
              <button 
                onClick={() => setLivePreviewType('GENCON')}
                className={cn(
                  "px-3 py-1 text-[8px] uppercase font-bold transition-all",
                  livePreviewType === 'GENCON' ? "bg-primary text-on-surface" : "text-on-surface-variant"
                )}
              >
                GENCON
              </button>
              <button 
                onClick={() => setLivePreviewType('RECAP')}
                className={cn(
                  "px-3 py-1 text-[8px] uppercase font-bold transition-all",
                  livePreviewType === 'RECAP' ? "bg-primary text-on-surface" : "text-on-surface-variant"
                )}
              >
                RECAP
              </button>
            </div>
          </div>
          
          <div className="relative group">
            <div className="absolute inset-0 bg-primary/5 animate-pulse rounded-sm pointer-events-none" />
            <div 
              ref={previewRef}
              className="p-4 bg-surface-container-highest border border-outline h-[340px] overflow-y-auto font-mono text-[9px] leading-relaxed text-tertiary whitespace-pre-wrap"
            >
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-tertiary/20">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-tertiary rounded-full" />
                  REAL_TIME_BUFFER_STREAM
                </span>
                <span className="opacity-50 uppercase">v1.0.4-LITE</span>
              </div>
              {getLiveDocumentContent(livePreviewType)}
              <div className="mt-4 pt-4 border-t border-tertiary/20 text-[8px] opacity-40">
                // SYSTEM_NOTE: Drafting changes applied in real-time basis user configuration.
              </div>
            </div>
            
            <button 
               onClick={() => setActivePreview(livePreviewType)}
               className="absolute bottom-4 right-4 bg-primary text-on-surface px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2"
            >
               Open_Full_Editor <Plus className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-outline">
        <div className="p-4 border border-outline bg-surface-container space-y-4">
          <div className="flex items-center justify-between mb-2">
             <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h5 className="text-[12px] font-bold text-on-surface uppercase tracking-widest">RECAP_Template_Dedicated_Editor</h5>
             </div>
             <span className="text-[9px] font-mono text-on-surface-variant">AUTO_SYNC_ENABLED</span>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { label: 'Account', tag: '[CHARTERER_NAME]' },
                { label: 'Vessel', tag: '[Vessel Name]' },
                { label: 'Cargo', tag: '[CARGO_DESCRIPTION]' },
                { label: 'Load/Discharge Ports', tag: '[Load Port]/[DISCHARGE_PORT]' },
                { label: 'Laycan', tag: '[LAYCAN_START] - [LAYCAN_END]' },
                { label: 'Freight Rate', tag: '[FREIGHT_RATE]' },
                { label: 'Arbitration', tag: '[ARBITRATION_TERMS]' },
                { label: 'Broker Co', tag: '[BROKER_COMPANY]' },
                { label: 'Broker Name', tag: '[BROKER_NAME]' },
                { label: 'Broker Contact', tag: '[BROKER_CONTACT]' }
              ].map(p => (
                <button 
                  key={p.label}
                  onClick={() => {
                    const textarea = document.getElementById('recap-editor') as HTMLTextAreaElement;
                    if (textarea) {
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const newText = templates.recap.substring(0, start) + p.tag + templates.recap.substring(end);
                      setTemplates({ ...templates, recap: newText });
                      setTimeout(() => {
                        textarea.focus();
                        textarea.setSelectionRange(start + p.tag.length, start + p.tag.length);
                      }, 0);
                    } else {
                      setTemplates({ ...templates, recap: templates.recap + '\n' + p.label.toUpperCase() + ': ' + p.tag });
                    }
                  }}
                  className="px-2 py-1 bg-primary/10 border border-primary/30 text-primary text-[8px] font-bold uppercase rounded-sm hover:bg-primary/20 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <textarea 
              id="recap-editor"
              className="w-full h-48 bg-surface-container-highest border border-[#1c2025] p-4 text-[10px] font-mono text-on-surface-variant focus:outline-none focus:border-primary/40 resize-none leading-relaxed"
              value={templates.recap}
              onChange={(e) => setTemplates({...templates, recap: e.target.value})}
              placeholder="Define your RECAP structure here using [PLACEHOLDERS]..."
            />
          </div>
          <div className="p-3 bg-primary/5 border border-primary/10 flex items-center gap-3">
            <Info className="h-3 w-3 text-primary" />
            <p className="text-[9px] text-on-surface-variant">
              Placeholders in square brackets will be dynamically replaced by AI-extracted and calculated voyage data during final document generation.
            </p>
          </div>
        </div>

        <div className="p-4 border border-outline bg-surface-container space-y-4 opacity-80 hover:opacity-100 transition-opacity">
          <div className="flex items-center justify-between mb-2">
             <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#7856ff]" />
                <h5 className="text-[12px] font-bold text-on-surface uppercase">GENCON_94_Standard_Matrix</h5>
             </div>
          </div>
          <textarea 
            className="w-full h-32 bg-surface-container-highest border border-[#1c2025] p-3 text-[10px] font-mono text-on-surface-variant focus:outline-none focus:border-primary/40"
            value={templates.gencon}
            onChange={(e) => setTemplates({...templates, gencon: e.target.value})}
          />
        </div>
      </div>

      <AnimatePresence>
        {activePreview && (
          <DocumentEditor 
            type={activePreview} 
            data={{ 
              ...sampleData, 
              owner: ownerDetails, 
              aiCharterer,
              clauses: selectedClauses,
              arbitration: arbitrationLabel,
              broker: brokerProfile
            }} 
            templates={templates}
            onClose={() => setActivePreview(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const PreferencesConfig = () => {
  const { language, themeMode, setLanguage, setThemeMode, t, tickerItems, setTickerItems } = useConfig();
  const [notifications, setNotifications] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const languages = [
    { label: 'English (US)', value: 'en' },
    { label: 'Mandarin Chinese (中文)', value: 'zh' },
    { label: 'Spanish (Español)', value: 'es' },
    { label: 'French (Français)', value: 'fr' },
    { label: 'Russian (Русский)', value: 'ru' },
    { label: 'German (Deutsch)', value: 'de' },
    { label: 'Portuguese (Português)', value: 'pt' },
    { label: 'Arabic (العربية) - Coming Soon', value: 'ar', disabled: true },
    { label: 'Japanese (日本語) - Coming Soon', value: 'ja', disabled: true },
    { label: 'Hindi (हिन्दी) - Coming Soon', value: 'hi', disabled: true }
  ];

  const themes = [
    { label: 'System Default', value: 'system' },
    { label: 'Day Mode', value: 'day' },
    { label: 'Night Mode', value: 'night' }
  ];

  const handleApply = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
    }, 1000);
  };


  const toggleTickerItem = (id: string) => {
    setTickerItems(prev => prev.map(item => item.id === id ? { ...item, isVisible: !item.isVisible } : item));
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between">
        <SectionHeader title={t('preferences')} sub="Manage application interface, localization, and environmental settings." />
        <button 
          onClick={handleApply}
          disabled={isSaving}
          className="flex items-center gap-2 bg-primary text-on-primary px-6 py-2 hover:opacity-90 transition-all rounded-sm text-[12px] font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <CheckCircle className="h-4 w-4 animate-pulse" />
              Applying...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {t('apply_changes')}
            </>
          )}
        </button>
      </div>
      
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SelectGroup 
            label={t('interface_language')} 
            value={language}
            onChange={(e: any) => setLanguage(e.target.value)}
            options={languages.map(l => ({ label: l.label, value: l.value, disabled: l.disabled }))} 
          />
          <SelectGroup 
            label={t('ui_theme_variant')} 
            value={themeMode}
            onChange={(e: any) => setThemeMode(e.target.value)}
            options={themes.map(ti => ({ label: ti.label, value: ti.value }))} 
          />
        </div>

        <div className="p-4 border border-outline bg-surface-container flex items-center justify-between hover:border-primary/20 transition-colors">
          <div>
            <h5 className="text-[12px] font-bold text-on-surface uppercase mb-1">{t('notifications')}</h5>
            <p className="text-[10px] text-on-surface-variant">Enable browser alerts for high-confidence cargo matches.</p>
          </div>
          <Toggle active={notifications} onToggle={() => setNotifications(!notifications)} />
        </div>

        <div className="space-y-4 pt-4 border-t border-outline">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h4 className="text-[11px] font-bold text-on-surface uppercase tracking-widest">{t('live_market_ticker')}</h4>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
             {tickerItems.map(item => (
                <div 
                  key={item.id} 
                  className={cn(
                    "p-3 border transition-colors cursor-pointer flex items-center justify-between group",
                    item.isVisible ? "bg-primary/5 border-primary/30" : "bg-surface-container border-outline/50 opacity-60 hover:opacity-100"
                  )}
                  onClick={() => toggleTickerItem(item.id)}
                >
                   <div className="flex flex-col">
                      <span className={cn("text-[11px] font-mono mb-1", item.isVisible ? "text-primary font-bold" : "text-on-surface-variant")}>{item.label}</span>
                      <span className="text-[10px] text-on-surface flex items-center gap-1">
                         {item.price}
                         <span className={item.isUp ? 'text-tertiary' : 'text-error'}>{item.change}</span>
                      </span>
                   </div>
                   <Toggle active={item.isVisible} onToggle={() => {}} />
                </div>
             ))}
          </div>
        </div>

        <div className="p-4 bg-primary/5 border border-primary/20 flex items-start gap-3">
          <Globe className="h-4 w-4 text-primary shrink-0" />
          <p className="text-[10px] text-on-surface-variant leading-relaxed font-mono">
            {t('localization_note')} 
          </p>
        </div>

        <div className="space-y-4 pt-4">
          <div className="flex items-center gap-2 px-1">
            <SettingsIcon className="h-4 w-4 text-primary" />
            <h4 className="text-[11px] font-bold text-on-surface uppercase tracking-widest">{t('global_display_units')}</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 border border-outline bg-surface-container/50">
               <h6 className="text-[9px] font-bold text-on-surface-variant uppercase mb-1">{t('weight')}</h6>
               <span className="text-[12px] text-on-surface font-mono">Metric Tons (MT)</span>
            </div>
            <div className="p-3 border border-outline bg-surface-container/50">
               <h6 className="text-[9px] font-bold text-on-surface-variant uppercase mb-1">{t('distance')}</h6>
               <span className="text-[12px] text-on-surface font-mono">Nautical Miles (NM)</span>
            </div>
            <div className="p-3 border border-outline bg-surface-container/50">
               <h6 className="text-[9px] font-bold text-on-surface-variant uppercase mb-1">{t('currency')}</h6>
               <span className="text-[12px] text-on-surface font-mono">USD ($)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const SectionHeader = ({ title, sub }: any) => (
  <div className="border-b border-outline pb-4 mb-6">
    <h3 className="text-[16px] font-bold font-display text-on-surface uppercase tracking-widest">{title}</h3>
    <p className="text-[11px] text-on-surface-variant mt-1">{sub}</p>
  </div>
);

const InputGroup = ({ label, type = "text", placeholder, icon: Icon, note, value, onChange }: any) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center px-1">
      <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{label}</label>
      {note && <span className="text-[9px] text-on-surface-variant italic">{note}</span>}
    </div>
    <div className="relative">
      {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant" />}
      <input 
        type={type}
        value={value}
        onChange={onChange}
        className={cn(
          "w-full bg-surface-container border border-outline text-on-surface p-3 text-[12px] focus:outline-none focus:border-primary transition-colors",
          Icon && "pl-10"
        )}
        placeholder={placeholder}
      />
    </div>
  </div>
);

const SelectGroup = ({ label, options, value, onChange }: any) => (
  <div className="space-y-2">
    <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest px-1">{label}</label>
    <select 
      value={value}
      onChange={onChange}
      className="w-full bg-surface-container border border-outline text-on-surface p-3 text-[12px] focus:outline-none focus:border-primary transition-colors cursor-pointer appearance-none"
    >
      {options.map((opt: any) => {
        const val = typeof opt === 'object' ? opt.value : opt;
        const lab = typeof opt === 'object' ? opt.label : opt;
        const dis = typeof opt === 'object' ? opt.disabled : false;
        return <option key={val} value={val} disabled={dis}>{lab}</option>;
      })}
    </select>
  </div>
);

const Toggle = ({ active, onToggle }: { active: boolean, onToggle: () => void }) => (
  <div 
    onClick={onToggle}
    className={cn(
      "w-10 h-5 rounded-full relative cursor-pointer p-1 transition-colors",
      active ? "bg-primary" : "bg-outline"
    )}
  >
    <div className={cn(
      "w-3 h-3 bg-white rounded-full transition-transform",
      active ? "translate-x-5" : "translate-x-0"
    )} />
  </div>
);

import { AdminBillingButton } from './AdminBillingButton';

interface WorkspaceConfigProps {
  usage?: any;
}

const WorkspaceConfig = ({ usage }: WorkspaceConfigProps) => {
  const { currentWorkspace, inviteMember, updateMemberRole, removeMember } = useWorkspace();
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('broker');
  const [isInviting, setIsInviting] = useState(false);

  React.useEffect(() => {
    if (!currentWorkspace?.id) return;
    const q = query(collection(db, `workspaces/${currentWorkspace.id}/members`), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("members snap error", err));
    return () => unsub();
  }, [currentWorkspace?.id]);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setIsInviting(true);
    await inviteMember(inviteEmail, inviteRole);
    setInviteEmail('');
    setIsInviting(false);
  };

  if (!currentWorkspace) {
    return (
      <div className="p-8 text-center text-on-surface-variant font-mono">
        No active organization workspace selected.
      </div>
    );
  }

  const isAdmin = currentWorkspace.myRole === 'admin';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <SectionHeader title={`Workspace: ${currentWorkspace.name}`} sub="Manage your team structure, invitations, and role-based access limits." />

      {isAdmin ? (
        <div className="p-4 bg-primary/5 border border-primary/20 flex flex-col gap-4">
          <h4 className="text-[11px] font-bold text-on-surface uppercase tracking-widest flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Invite Team Member
          </h4>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <InputGroup 
                label="User Email" 
                value={inviteEmail}
                onChange={(e: any) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com" 
                icon={User} 
              />
            </div>
            <div className="w-full sm:w-48">
              <SelectGroup 
                label="Assigned Role" 
                value={inviteRole}
                onChange={(e: any) => setInviteRole(e.target.value)}
                options={[
                  { label: 'Admin (Full Access)', value: 'admin' },
                  { label: 'Broker (Standard)', value: 'broker' },
                  { label: 'Viewer (Read Only)', value: 'viewer' }
                ]} 
              />
            </div>
            <button 
              onClick={handleInvite}
              disabled={isInviting || !inviteEmail}
              className="w-full sm:w-auto px-6 h-12 bg-primary text-black font-bold uppercase tracking-widest text-[10px] whitespace-nowrap hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-sm"
            >
              {isInviting ? 'Inviting...' : 'Send Invite'}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-surface-container border border-outline flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-on-surface-variant shrink-0" />
          <p className="text-[11px] text-on-surface-variant leading-relaxed">
            You are a <strong>{currentWorkspace.myRole?.toUpperCase() || 'MEMBER'}</strong> in this workspace. Admin access is required to invite or remove members.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-outline pb-2 px-1">
          <h4 className="text-[11px] font-bold text-on-surface uppercase tracking-widest">Active Members</h4>
          <span className="text-[9px] text-tertiary uppercase font-mono tracking-widest">{members.length} Users</span>
        </div>

        <div className="bg-surface-container border border-outline divide-y divide-outline">
          {members.map(member => (
            <div key={member.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[12px] font-bold text-on-surface">{member.email}</span>
                <span className="text-[9px] font-mono text-on-surface-variant uppercase tracking-widest">ID: {member.id}</span>
              </div>
              
              <div className="flex items-center gap-4 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                <select
                  value={member.role}
                  disabled={!isAdmin || member.id === currentWorkspace.ownerId}
                  onChange={(e) => updateMemberRole(member.id, e.target.value)}
                  className="bg-surface-container-highest border border-outline text-on-surface p-2 text-[10px] uppercase font-bold focus:outline-none focus:border-primary transition-colors cursor-pointer rounded-sm disabled:opacity-50"
                >
                  <option value="admin">Admin</option>
                  <option value="broker">Broker</option>
                  <option value="viewer">Viewer</option>
                </select>

                <AdminBillingButton targetUserId={member.id} />

                <button 
                  onClick={() => {
                    if (confirm(`Are you sure you want to remove ${member.email} from ${currentWorkspace.name}?`)) {
                      removeMember(member.id);
                    }
                  }}
                  disabled={!isAdmin || member.id === currentWorkspace.ownerId}
                  className="p-2 text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors rounded-sm ml-auto sm:ml-0 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-current"
                  title="Remove User"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <div className="p-8 text-center text-on-surface-variant font-mono text-[10px] uppercase">
              No active members found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AlertsConfig = () => {
  const { settings, updateSettings } = useNotification();
  const { preferences, refreshPreferences } = useAlerts();
  const { user } = useAuth();

  const handleUpdate = async (updates: any) => {
     if (user) {
        const { updateAlertPreferences } = await import('../lib/alertService');
        await updateAlertPreferences(user.uid, updates);
        await refreshPreferences();
     }
  };

  if (!preferences) return <div className="p-8 text-center text-on-surface-variant font-mono text-[10px]">Loading Preferences...</div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4 border-b border-outline/30 pb-4">
        <div className="w-10 h-10 bg-primary/10 rounded-sm flex items-center justify-center border border-primary/20">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-display text-on-surface uppercase tracking-widest">Notification Engine & Smart Alerts</h3>
          <p className="text-on-surface-variant font-mono text-[10px] uppercase">Control deal flow alerts and daily digests</p>
        </div>
      </div>

      <div className="bg-surface-container border border-outline/50 p-6 rounded-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-on-surface font-bold text-[12px] uppercase tracking-widest mb-1">In-App Events Enabled</h4>
            <p className="text-on-surface-variant text-[10px] font-mono">Enable live alerts on the notification bell.</p>
          </div>
          <button 
            onClick={() => handleUpdate({ inAppAlertsEnabled: !preferences.inAppAlertsEnabled })}
            className={cn("w-12 h-6 flex items-center rounded-full transition-colors px-1", preferences.inAppAlertsEnabled ? "bg-primary" : "bg-outline/30")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-surface shadow-sm transition-transform", preferences.inAppAlertsEnabled ? "translate-x-6" : "")} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-on-surface font-bold text-[12px] uppercase tracking-widest mb-1">Daily Digest Enabled</h4>
            <p className="text-on-surface-variant text-[10px] font-mono">Receive an executive brief summarizing matches and action items.</p>
          </div>
          <button 
            onClick={() => handleUpdate({ dailyDigestEnabled: !preferences.dailyDigestEnabled })}
            className={cn("w-12 h-6 flex items-center rounded-full transition-colors px-1", preferences.dailyDigestEnabled ? "bg-primary" : "bg-outline/30")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-surface shadow-sm transition-transform", preferences.dailyDigestEnabled ? "translate-x-6" : "")} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-on-surface font-bold text-[12px] uppercase tracking-widest mb-1 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-error" /> Urgent-Only Mode</h4>
            <p className="text-on-surface-variant text-[10px] font-mono">Silence all notifications except high/critical priority.</p>
          </div>
          <button 
            onClick={() => handleUpdate({ urgentOnlyMode: !preferences.urgentOnlyMode })}
            className={cn("w-12 h-6 flex items-center rounded-full transition-colors px-1", preferences.urgentOnlyMode ? "bg-error" : "bg-outline/30")}
          >
            <div className={cn("w-4 h-4 rounded-full bg-surface shadow-sm transition-transform", preferences.urgentOnlyMode ? "translate-x-6" : "")} />
          </button>
        </div>

        <div className="h-px bg-outline/30 w-full" />

        <div>
          <h4 className="text-on-surface font-bold text-[12px] uppercase tracking-widest mb-3">Copy Style (Toasts)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { id: 'professional', label: 'Professional', desc: 'Direct, clear updates limit to facts' },
              { id: 'broker_humor', label: 'Broker Style', desc: 'Sharp, maritime flavor, slightly arrogant' },
              { id: 'silent', label: 'Silent Mode', desc: 'Saves to center without toasts' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => updateSettings({ mode: m.id as any })}
                className={cn(
                  "p-3 rounded-sm border text-left transition-all",
                  settings.mode === m.id ? "border-primary bg-primary/5 text-primary" : "border-outline/50 hover:border-outline text-on-surface-variant"
                )}
              >
                <div className="font-bold text-[11px] uppercase tracking-wider mb-1">{m.label}</div>
                <div className="text-[9px] font-mono opacity-80 leading-relaxed">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-outline/30 w-full" />

        <div>
          <h4 className="text-on-surface font-bold text-[12px] uppercase tracking-widest mb-3">Alert Categories</h4>
          <div className="space-y-3">
            {[
              { id: 'smart_radar_match', label: 'Smart Radar', desc: 'System-generated deal matches' },
              { id: 'market_request_match', label: 'Market Requests', desc: 'Direct search request matches' },
              { id: 'hot_opp', label: 'Hot Opps', desc: 'Urgent market opportunities' },
              { id: 'deal_room_update', label: 'Deal Rooms', desc: 'Negotiation updates and stages' },
              { id: 'deal_room_note', label: 'Deal Notes', desc: 'Notes and attachments added' },
              { id: 'ai_deal_brief', label: 'AI Deal Briefs', desc: 'Auto-generated summaries' },
              { id: 'counterparty_crm', label: 'Counterparty CRM', desc: 'CRM linking and notes' }
            ].map((c) => (
              <div key={c.id} className="flex flex-row items-center justify-between bg-surface-container-high p-3 border border-outline/30 rounded-sm">
                <div>
                  <div className="text-[11px] font-bold text-on-surface uppercase tracking-widest">{c.label}</div>
                  <div className="text-[9px] font-mono text-on-surface-variant">{c.desc}</div>
                </div>
                <button 
                  onClick={() => handleUpdate({ categories: { ...preferences.categories, [c.id]: !(preferences.categories as any)[c.id] } })}
                  className={cn("w-10 h-5 flex items-center rounded-full transition-colors px-0.5", (preferences.categories as any)[c.id] ? "bg-primary" : "bg-outline/30")}
                >
                  <div className={cn("w-4 h-4 rounded-full bg-surface shadow-sm transition-transform", (preferences.categories as any)[c.id] ? "translate-x-5" : "")} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px bg-outline/30 w-full" />
        
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-on-surface font-bold text-[12px] uppercase tracking-widest">Strong Match Threshold</h4>
            <span className="text-primary font-mono text-[11px]">{settings.strongMatchThreshold || 80}%</span>
          </div>
          <p className="text-on-surface-variant text-[10px] font-mono mb-4">Minimum percentage required to trigger a "Strong Match Detected" alert.</p>
          <input 
            type="range" 
            min="50" 
            max="95" 
            step="5"
            value={settings.strongMatchThreshold || 80}
            onChange={(e) => updateSettings({ strongMatchThreshold: parseInt(e.target.value) })}
            className="w-full h-1 bg-outline/30 rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-on-surface-variant mt-2">
            <span>More Alerts (50%)</span>
            <span>Premium Only (95%)</span>
          </div>
        </div>

      </div>
    </div>
  );
};
