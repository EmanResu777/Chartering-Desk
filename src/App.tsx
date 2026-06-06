import React, { useState, useEffect } from 'react';
import { Sidebar, TopBar } from './components/Navigation';
import { CargoDesk } from './components/CargoDesk';
import { VesselMonitor } from './components/VesselMonitor';
import { InboxParser } from './components/InboxParser';
import { MatchingEngine } from './components/MatchingEngine';
import { ContactList } from './components/ContactList';
import { Analytics } from './components/Analytics';
import { SelectionDesk } from './components/SelectionDesk';
import { AIAssistant } from './components/AIAssistant';
import { DraftList } from './components/DraftList';
import { Settings } from './components/Settings';
import { Documentation } from './components/Documentation';
import { ArchitectureStack } from './components/ArchitectureStack';
import { Ticker } from './components/Ticker';
import { Pricing } from './components/Pricing';
import { GlobalSearch } from './components/GlobalSearch';
import { NotificationCenter } from './components/NotificationCenter';
import { Cargo, Vessel, Contact, Email, INITIAL_CARGO, INITIAL_VESSELS, INITIAL_EMAILS, cn } from './lib/utils';
import { Package2, Ship, Mail, Settings as SettingsIcon, Users, BarChart3, Zap, Bot, X, FileText } from 'lucide-react';
import { ConfigProvider, useConfig, Language } from './lib/ConfigContext';
import { NotificationProvider, useNotification } from './lib/NotificationContext';
import { WorkspaceProvider, useWorkspace } from './lib/WorkspaceContext';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, loginWithGoogle, logout, handleFirestoreError, OperationType, db } from './lib/firebase';
import { collection, onSnapshot, query, where, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { shareItem, unshareItem } from './lib/networkService';

type Tab = 'cargo' | 'vessel' | 'selection' | 'inbox' | 'analytics' | 'settings' | 'match' | 'contacts' | 'ai' | 'architecture' | 'docs' | 'documents';

import { FeedbackWidget } from './components/FeedbackWidget';

export default function App() {
  return (
    <ConfigProvider>
      <NotificationProvider>
        <WorkspaceProvider>
          <AppContent />
          <FeedbackWidget />
        </WorkspaceProvider>
      </NotificationProvider>
    </ConfigProvider>
  );
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace, loading: workspaceLoading } = useWorkspace();
  const { notify, addNotification, settings } = useNotification();
  const { t, subscription, setSubscription, language, setLanguage } = useConfig();
  const [activeTab, setActiveTab] = useState<Tab>('cargo');
  const [showPricing, setShowPricing] = useState(false);
  const [selectedCargo, setSelectedCargo] = useState<Cargo | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [lastFocusedContext, setLastFocusedContext] = useState<'cargo' | 'vessel' | null>(null);
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  const [showTrialWelcome, setShowTrialWelcome] = useState(false);

  useEffect(() => {
    if (currentWorkspace && currentWorkspace.trialEndsAt) {
      const hasSeenTrialWelcome = localStorage.getItem(`trial_welcome_seen_${currentWorkspace.id}`);
      if (!hasSeenTrialWelcome) {
        setShowTrialWelcome(true);
      }
    }
  }, [currentWorkspace]);

  const handleCloseTrialWelcome = () => {
    if (currentWorkspace) {
      localStorage.setItem(`trial_welcome_seen_${currentWorkspace.id}`, 'true');
    }
    setShowTrialWelcome(false);
  };

  useEffect(() => {
    if (selectedCargo) setLastFocusedContext('cargo');
  }, [selectedCargo]);

  useEffect(() => {
    if (selectedVessel) setLastFocusedContext('vessel');
  }, [selectedVessel]);

  useEffect(() => {
    // Check for Stripe success URL parameters
    const queryStr = new URLSearchParams(window.location.search);
    if (queryStr.get('success') === 'true') {
      const tier = queryStr.get('tier');
      if (tier === 'basic' || tier === 'premium' || tier === 'maximum') {
        setSubscription(tier);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [setSubscription]);

  // Network Proposal Listener for Notifications
  useEffect(() => {
    if (!user) return;
    
    // Track seen proposals to avoid notifying on mount
    const seenProposals = new Set<string>();
    let isInitialLoad = true;
    
    let unsubs: Record<string, () => void> = {};
    
    const unsubscribeItems = onSnapshot(
      query(collection(db, 'sharedItems'), where('ownerId', '==', user.uid)), 
      (snap) => {
        const currentItemIds = new Set<string>();
        
        snap.forEach(d => {
          const itemId = d.id;
          currentItemIds.add(itemId);
          
          if (!unsubs[itemId]) {
            unsubs[itemId] = onSnapshot(collection(db, `sharedItems/${itemId}/proposals`), (pSnap) => {
              pSnap.docChanges().forEach(change => {
                if (change.type === 'added') {
                  const pData = change.doc.data();
                  if (isInitialLoad || seenProposals.has(change.doc.id)) {
                    seenProposals.add(change.doc.id);
                    return; // Skip on first load or if already seen
                  }
                  
                  seenProposals.add(change.doc.id);
                  
                  // Prevent notifying if I am the creator
                  if (pData.creatorId === user.uid) return;
                  
                  const title = settings?.mode === 'broker_humor'
                    ? "🤝 Network inbound — don't leave them hanging, firm it up."
                    : "Desk Network Proposal Received";
                    
                  addNotification({
                    title,
                    message: `New proposal received on your shared item.`,
                    severity: 'info',
                    entityType: 'network',
                    entityId: itemId,
                    source: 'desk_network'
                  });
                }
              });
            }, (err) => {
              if (err && err.message && !err.message.includes("permission")) {
                console.error(`Proposals snapshot error for item ${itemId}:`, err);
              }
            });
          }
        });
        
        // Clean up unsubs for removed items
        Object.keys(unsubs).forEach(itemId => {
          if (!currentItemIds.has(itemId)) {
            unsubs[itemId]();
            delete unsubs[itemId];
          }
        });
        
        setTimeout(() => { isInitialLoad = false; }, 2000);
      },
      (err) => {
        if (!err.message.includes("permission")) {
          console.error("SharedItems snapshot error:", err);
        }
      }
    );
    
    return () => {
      unsubscribeItems();
      Object.values(unsubs).forEach(u => u());
    };
  }, [user, settings?.mode]); // also requires settings to be correctly passed, but maybe it changes often.

  // Sync subscription from Firestore
  useEffect(() => {
    if (user) {
      const unsubUser = onSnapshot(doc(db, 'users', user.uid), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          if (data.subscription && (data.subscription === 'basic' || data.subscription === 'premium' || data.subscription === 'maximum')) {
            setSubscription(data.subscription);
          }
        }
      }, (err) => console.error("user snap pop", err));
      return () => unsubUser();
    }
  }, [user, setSubscription]);

  // Listen for persistent remote notifications (e.g. trial expiration)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('read', '==', false)
    );
    const unsubNotifications = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const notifData = change.doc.data();
          notify({
            title: notifData.title || 'Notification',
            message: notifData.message,
            type: notifData.type || 'info'
          });
          // Mark as read so we don't show it again on refresh
          updateDoc(doc(db, 'users', user.uid, 'notifications', change.doc.id), {
            read: true
          }).catch(console.error);
        }
      });
    }, (error) => {
      console.error("Error fetching notifications:", error);
    });
    return () => unsubNotifications();
  }, [user, notify]);

  // Clear notification when switching to a tab
  useEffect(() => {
    if (notifications[activeTab]) {
      setNotifications(prev => ({ ...prev, [activeTab]: false }));
    }
  }, [activeTab]);

  // Global lists state
  const [cargoList, setCargoList] = useState<Cargo[]>([]);
  const [vesselList, setVesselList] = useState<Vessel[]>([]);
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [emails, setEmails] = useState<Email[]>(INITIAL_EMAILS);

  useEffect(() => {
    if (!user || !currentWorkspace) {
      setCargoList([]);
      setVesselList([]);
      setContactList([]);
      return;
    }

    const qCargo = query(collection(db, 'cargos'), where("workspaceId", "==", currentWorkspace.id));
    const unsubCargo = onSnapshot(qCargo, (snapshot) => {
      const cargos: Cargo[] = [];
      snapshot.forEach((doc) => {
        cargos.push({ id: doc.id, ...doc.data() } as Cargo);
      });
      setCargoList(cargos);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cargos');
    });

    const qVessel = query(collection(db, 'vessels'), where("workspaceId", "==", currentWorkspace.id));
    const unsubVessel = onSnapshot(qVessel, (snapshot) => {
      const vessels: Vessel[] = [];
      snapshot.forEach((doc) => {
        vessels.push({ id: doc.id, ...doc.data() } as Vessel);
      });
      setVesselList(vessels);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'vessels');
    });

    const qContact = query(collection(db, 'contacts'), where("workspaceId", "==", currentWorkspace.id));
    const unsubContact = onSnapshot(qContact, (snapshot) => {
      const parsedContacts: Contact[] = [];
      snapshot.forEach((doc) => {
        parsedContacts.push({ id: doc.id, ...doc.data() } as Contact);
      });
      setContactList(parsedContacts);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contacts');
    });

    return () => {
      unsubCargo();
      unsubVessel();
      unsubContact();
    };
  }, [user, currentWorkspace]);

  // User Identity
  const [userProfile] = useState({
    id: `#DSK-${Math.floor(1000 + Math.random() * 8999)}`,
    name: 'You (Me)',
    role: 'Senior Broker'
  });

  // Network State
  const [networkMessages, setNetworkMessages] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [pendingInvites, setPendingInvites] = useState<any[]>([
    { id: '3', name: 'Dimitris Papadopoulos', role: 'Owner Rep', online: false, status: 'pending_received' },
  ]);

  // Set initial contact
  useEffect(() => {
    if (!selectedContact && contactList.length > 0) {
      setSelectedContact(contactList[0]);
    }
  }, [contactList]);

  const handleToggleVisibility = async (type: 'vessel' | 'cargo', data: any) => {
    await safeFirestoreCall(async () => {
      if (data.visibility === 'desk_network') {
        await unshareItem(type, data);
      } else {
        await shareItem(type, data);
      }
    }, OperationType.UPDATE, type === 'cargo' ? `cargos/${data.id}` : `vessels/${data.id}`, 
    data.visibility === 'desk_network' ? `${type === 'cargo'?'Cargo':'Vessel'} removed from Desk Network feed` : `${type === 'cargo'?'Cargo':'Vessel'} shared to Desk Network`);
  };

  // Handle thrown JSON error and notify
  const safeFirestoreCall = async (operation: () => Promise<void>, opType: OperationType, path: string, successMsg?: string) => {
    try {
      await operation();
      if (successMsg) notify({ type: 'success', title: 'Success', message: successMsg });
    } catch (e) {
      try {
        handleFirestoreError(e, opType, path);
      } catch (formattedError) {
        let msg = 'Database error occurred';
        try {
          if (formattedError instanceof Error) {
            const parsed = JSON.parse(formattedError.message);
            msg = parsed.error || msg;
          }
        } catch {
          msg = formattedError instanceof Error ? formattedError.message : String(formattedError);
        }
        notify({ type: 'error', title: 'Action Failed', message: msg });
      }
    }
  };

  // CRUD Handlers for Firestore
  const handleCargoCreate = async (cargo: Cargo) => {
    if (!user || !currentWorkspace) return;
    await safeFirestoreCall(async () => {
      const docRef = doc(db, 'cargos', cargo.id);
      await setDoc(docRef, { ...cargo, workspaceId: currentWorkspace.id, userId: user.uid });
      
      const title = settings?.mode === 'broker_humor' 
        ? "📦 New cargo on deck — worth a look before the market eats it." 
        : `New Cargo: ${cargo.commodity}`;
        
      addNotification({
        title,
        message: `${cargo.quantity} MT ${cargo.commodity} from ${cargo.loadPort} to ${cargo.dischargePort}.`,
        severity: 'info',
        entityType: 'cargo',
        entityId: cargo.id,
        source: 'manual_text'
      });
      
    }, OperationType.CREATE, 'cargos', 'Cargo created successfully');
  };

  const handleCargoUpdate = async (id: string, updates: Partial<Cargo>) => {
    if (!user) return;
    await safeFirestoreCall(async () => {
      const docRef = doc(db, 'cargos', id);
      await setDoc(docRef, updates, { merge: true });
    }, OperationType.UPDATE, `cargos/${id}`, 'Cargo updated successfully');
  };

  const handleCargoDelete = async (id: string) => {
    await safeFirestoreCall(async () => {
      await deleteDoc(doc(db, 'cargos', id));
    }, OperationType.DELETE, `cargos/${id}`, 'Cargo deleted successfully');
  };

  const handleCargoBulkDelete = async (ids: Set<string>) => {
    await safeFirestoreCall(async () => {
      for (const id of Array.from(ids)) {
        await deleteDoc(doc(db, 'cargos', id));
      }
    }, OperationType.DELETE, 'cargos', 'Selected cargos deleted');
  };

  const handleVesselCreate = async (vessel: Vessel) => {
    if (!user || !currentWorkspace) return;
    await safeFirestoreCall(async () => {
      const docRef = doc(db, 'vessels', vessel.id);
      await setDoc(docRef, { ...vessel, workspaceId: currentWorkspace.id, userId: user.uid });
      
      const title = settings?.mode === 'broker_humor' 
        ? "🚢 Fresh tonnage detected. Could be a winner, could be another TBN ghost." 
        : `New Vessel: ${vessel.name}`;
        
      addNotification({
        title,
        message: `${vessel.dwt} DWT Space open at ${vessel.openPort} around ${vessel.openDate}.`,
        severity: 'info',
        entityType: 'vessel',
        entityId: vessel.id,
        source: 'manual_text'
      });
    }, OperationType.CREATE, 'vessels', 'Vessel created successfully');
  };

  const handleVesselUpdate = async (id: string, updates: Partial<Vessel>) => {
    if (!user) return;
    await safeFirestoreCall(async () => {
      const docRef = doc(db, 'vessels', id);
      await setDoc(docRef, updates, { merge: true });
    }, OperationType.UPDATE, `vessels/${id}`, 'Vessel updated successfully');
  };

  const handleVesselDelete = async (id: string) => {
    await safeFirestoreCall(async () => {
      await deleteDoc(doc(db, 'vessels', id));
    }, OperationType.DELETE, `vessels/${id}`, 'Vessel deleted successfully');
  };

  const handleVesselBulkDelete = async (ids: Set<string>) => {
    await safeFirestoreCall(async () => {
      for (const id of Array.from(ids)) {
        await deleteDoc(doc(db, 'vessels', id));
      }
    }, OperationType.DELETE, 'vessels', 'Selected vessels deleted');
  };

  const handleContactCreate = async (contact: Contact) => {
    if (!user || !currentWorkspace) return;
    await safeFirestoreCall(async () => {
      const docRef = doc(db, 'contacts', contact.id);
      await setDoc(docRef, { ...contact, workspaceId: currentWorkspace.id, userId: user.uid });
    }, OperationType.CREATE, 'contacts', 'Contact created successfully');
  };

  const handleContactUpdate = async (id: string, updates: Partial<Contact>) => {
    if (!user) return;
    await safeFirestoreCall(async () => {
      const docRef = doc(db, 'contacts', id);
      await setDoc(docRef, updates, { merge: true });
    }, OperationType.UPDATE, `contacts/${id}`, 'Contact updated successfully');
  };

  const handleContactDelete = async (id: string) => {
    await safeFirestoreCall(async () => {
      await deleteDoc(doc(db, 'contacts', id));
    }, OperationType.DELETE, `contacts/${id}`, 'Contact deleted successfully');
  };

  // Global Import Listeners
  useEffect(() => {
    const handleToggleVisibilityEvent = (e: any) => {
      const { type, data } = e.detail;
      handleToggleVisibility(type, data);
    };

    const handleImportCargoAsync = async (e: any) => {
      if (!user) return;
      const data = e.detail;
      const newCargo: Cargo = {
        id: `NET-${Math.floor(1000 + Math.random() * 9000)}`,
        commodity: data.commodity || 'UNNAMED_CARGO',
        quantity: data.quantity || 'TBN',
        loadPort: data.loadPort || 'TBN',
        dischargePort: data.dischargePort || 'TBN',
        laycan: data.laycan || 'PTLY',
        charterer: data.charterer || 'NETWORK_CONTACT',
        category: data.category || 'DRY BULK',
        status: data.status || 'ACTIVE',
        priority: data.priority || 'NORMAL',
        confidence: 90
      };
      await handleCargoCreate(newCargo);
      
      const title = settings?.mode === 'broker_humor'
        ? "🤝 New Desk Network interest received — someone’s knocking on your cargo."
        : "Desk Network Proposal Received";
        
      addNotification({
        title,
        message: `Network inbound cargo: ${newCargo.quantity} MT ${newCargo.commodity}`,
        severity: 'info',
        entityType: 'network',
        entityId: newCargo.id,
        source: 'desk_network'
      });
      
      // Set notification if not on cargo tab
      if (activeTab !== 'cargo') {
        setNotifications(prev => ({ ...prev, cargo: true }));
      }
    };

    const handleImportVesselAsync = async (e: any) => {
      if (!user || !currentWorkspace) return;
      const data = e.detail;
      const newVessel: Vessel = {
        id: `NET-V-${Math.floor(1000 + Math.random() * 9000)}`,
        name: data.name || 'UNKNOWN_SHIP',
        type: data.type || 'Handymax',
        dwt: data.dwt || 50000,
        grt: data.grt || 30000,
        nrt: data.nrt || 18000,
        builtYear: data.builtYear || 2020,
        status: data.status || 'OPEN',
        openPort: data.openPort || 'TBN',
        openDate: data.openDate || 'PTLY',
        owner: data.owner || 'PRIVATE_OWNER',
        updatedAt: 'LIVE_NOW',
        confidence: 95
      };
      
      await safeFirestoreCall(async () => {
        await setDoc(doc(db, 'vessels', newVessel.id), { ...newVessel, workspaceId: currentWorkspace.id, userId: user.uid });
      }, OperationType.CREATE, 'vessels', `Vessel ${newVessel.name} imported successfully`);

      // Set notification if not on vessel tab
      if (activeTab !== 'vessel') {
        setNotifications(prev => ({ ...prev, vessel: true }));
      }
    };

    window.addEventListener('IMPORT_CARGO', handleImportCargoAsync);
    window.addEventListener('IMPORT_VESSEL', handleImportVesselAsync);
    window.addEventListener('TOGGLE_VISIBILITY', handleToggleVisibilityEvent);
    return () => {
      window.removeEventListener('IMPORT_CARGO', handleImportCargoAsync);
      window.removeEventListener('IMPORT_VESSEL', handleImportVesselAsync);
      window.removeEventListener('TOGGLE_VISIBILITY', handleToggleVisibilityEvent);
    };
  }, [activeTab, user, currentWorkspace]); // Depend on activeTab to check if we should notify

  const handleCargoMatch = (cargo: Cargo) => {
    setSelectedCargo(cargo);
    setActiveTab('match');
  };

  const [settingsInitialTab, setSettingsInitialTab] = useState<string>('ai');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleGlobalSearchSelect = (type: 'cargo' | 'vessel' | 'contact' | 'email', item: any) => {
    setIsSearchOpen(false);
    if (type === 'cargo') {
      setSelectedCargo(item);
      setActiveTab('cargo');
    } else if (type === 'vessel') {
      setSelectedVessel(item);
      setActiveTab('vessel');
    } else if (type === 'contact') {
      setActiveTab('contacts');
    } else if (type === 'email') {
      setActiveTab('inbox');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('SELECT_EMAIL', { detail: item }));
      }, 100);
    }
  };

  if (authLoading || workspaceLoading) {
    return (
      <div className="flex h-screen bg-surface items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen bg-surface flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface-container border border-outline/20 p-8 rounded-sm shadow-xl flex flex-col items-center text-center">
          <Ship className="h-12 w-12 text-primary mb-4" />
          <h1 className="text-2xl font-display font-light text-on-surface mb-2 tracking-tight">Cargo Desk App</h1>
          <p className="text-on-surface-variant font-sans text-sm mb-8 leading-relaxed">
            Please log in to your account or create a new one to start tracking vessels and cargos.
          </p>
          <button 
            onClick={loginWithGoogle}
            className="bg-primary text-on-primary px-8 py-3 rounded-sm font-bold uppercase tracking-widest text-[10px] hover:bg-primary-container transition-all shadow-md w-full max-w-[200px]"
          >
            Access Desk
          </button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const isTrialExpired = (() => {
      if (!currentWorkspace || !currentWorkspace.trialEndsAt) return false;
      let trialEnds;
      if (typeof currentWorkspace.trialEndsAt.toDate === 'function') {
        trialEnds = currentWorkspace.trialEndsAt.toDate();
      } else {
        trialEnds = new Date(currentWorkspace.trialEndsAt);
      }
      return new Date() > trialEnds;
    })();

    const isBasicAndTrialExpired = subscription === 'basic' && isTrialExpired;

    if (isBasicAndTrialExpired && activeTab !== 'settings' && activeTab !== 'docs') {
      return (
        <div className="flex flex-col flex-1 items-center justify-center p-8 text-center text-on-surface relative overflow-hidden">
          <div className="absolute inset-0 bg-surface/50 backdrop-blur-3xl z-[-1]"></div>
           <div className="w-24 h-24 mb-8 bg-error/5 rounded-full flex items-center justify-center border border-error/20 shadow-[0_0_30px_rgba(var(--color-error),0.1)]">
             <Zap className="w-10 h-10 text-error/80 stroke-1" />
           </div>
           <h2 className="text-3xl font-display font-light text-error mb-4 tracking-tight">{t('trial_expired_title')}</h2>
           <p className="text-on-surface-variant max-w-md mb-10 font-sans font-light tracking-wide leading-relaxed">
             {t('trial_expired_message')}
           </p>
           <button onClick={() => setShowPricing(true)} className="px-8 py-4 bg-primary text-on-primary font-medium uppercase tracking-[0.2em] text-[10px] hover:bg-primary-container transition-all shadow-md rounded-sm">{t('choose_plan')}</button>
        </div>
      );
    }
    
    // Override subscription level if in trial
    const effectiveSubscription = isTrialExpired ? subscription : 'maximum';

    switch (activeTab) {
      case 'documents':
        return <DraftList />;
      case 'cargo':
        return <CargoDesk 
          onMatch={handleCargoMatch} 
          cargoList={cargoList}
          vesselList={vesselList}
          onCreate={handleCargoCreate}
          onUpdate={handleCargoUpdate}
          onDelete={handleCargoDelete}
          onBulkDelete={handleCargoBulkDelete}
          onToggleVisibility={handleToggleVisibility} 
          selectedCargo={selectedCargo} 
          setSelectedCargo={setSelectedCargo} 
        />;
      case 'vessel':
        return effectiveSubscription === 'basic' ? (
           <div className="flex flex-col flex-1 items-center justify-center p-8 text-center text-on-surface relative overflow-hidden">
             <div className="absolute inset-0 bg-surface/50 backdrop-blur-3xl z-[-1]"></div>
             <div className="w-24 h-24 mb-8 bg-primary/5 rounded-full flex items-center justify-center border border-primary/20 shadow-[0_0_30px_rgba(var(--color-primary),0.1)]">
               <Zap className="w-10 h-10 text-primary/80 stroke-1" />
             </div>
             <h2 className="text-3xl font-display font-light text-primary mb-4 tracking-tight">Premium Feature</h2>
             <p className="text-on-surface-variant max-w-md mb-10 font-sans font-light tracking-wide leading-relaxed">Live AIS Vessel Tracking and Monitor is only available on Premium and Maximum plans.</p>
             <button onClick={() => setShowPricing(true)} className="px-8 py-4 bg-primary text-on-primary font-medium uppercase tracking-[0.2em] text-[10px] hover:bg-primary-container transition-all shadow-md rounded-sm">Upgrade Required</button>
           </div>
        ) : <VesselMonitor 
          vesselList={vesselList} 
          onCreate={handleVesselCreate}
          onUpdate={handleVesselUpdate} 
          onDelete={handleVesselDelete} 
          onBulkDelete={handleVesselBulkDelete} 
          onToggleVisibility={handleToggleVisibility} 
          selectedVessel={selectedVessel} 
          setSelectedVessel={setSelectedVessel} 
        />;
      case 'selection':
        return effectiveSubscription === 'basic' ? (
           <div className="flex flex-col flex-1 items-center justify-center p-8 text-center text-on-surface relative overflow-hidden">
             <div className="absolute inset-0 bg-surface/50 backdrop-blur-3xl z-[-1]"></div>
             <div className="w-24 h-24 mb-8 bg-primary/5 rounded-full flex items-center justify-center border border-primary/20 shadow-[0_0_30px_rgba(var(--color-primary),0.1)]">
               <Zap className="w-10 h-10 text-primary/80 stroke-1" />
             </div>
             <h2 className="text-3xl font-display font-light text-primary mb-4 tracking-tight">Premium Feature</h2>
             <p className="text-on-surface-variant max-w-md mb-10 font-sans font-light tracking-wide leading-relaxed">The Selection Desk is restricted to Premium and Maximum plans.</p>
             <button onClick={() => setShowPricing(true)} className="px-8 py-4 bg-primary text-on-primary font-medium uppercase tracking-[0.2em] text-[10px] hover:bg-primary-container transition-all shadow-md rounded-sm">Upgrade Required</button>
           </div>
        ) : <SelectionDesk cargoes={cargoList} vessels={vesselList} selectedCargo={selectedCargo} setSelectedCargo={setSelectedCargo} selectedVessel={selectedVessel} setSelectedVessel={setSelectedVessel} />;
      case 'inbox':
        return (
          <InboxParser 
            emails={emails}
            setEmails={setEmails}
            networkState={{
              messages: networkMessages,
              setMessages: setNetworkMessages,
              contacts: contactList,
              setContacts: setContactList as any,
              pendingInvites,
              setPendingInvites,
              userProfile,
              cargoList,
              vesselList,
              selectedContact,
              setSelectedContact
            }}
          />
        );
      case 'contacts':
        return <ContactList 
          contactList={contactList} 
          onCreate={handleContactCreate} 
          onUpdate={handleContactUpdate} 
          onDelete={handleContactDelete} 
        />;
      case 'analytics':
        return effectiveSubscription !== 'maximum' ? (
           <div className="flex flex-col flex-1 items-center justify-center p-8 text-center text-on-surface relative overflow-hidden">
             <div className="absolute inset-0 bg-surface/50 backdrop-blur-3xl z-[-1]"></div>
             <div className="w-24 h-24 mb-8 bg-tertiary/5 rounded-full flex items-center justify-center border border-tertiary/20 shadow-[0_0_30px_rgba(var(--color-tertiary),0.1)]">
               <Bot className="w-10 h-10 text-tertiary/80 stroke-1" />
             </div>
             <h2 className="text-3xl font-display font-light text-tertiary mb-4 tracking-tight">Maximum Feature</h2>
             <p className="text-on-surface-variant max-w-md mb-10 font-sans font-light tracking-wide leading-relaxed">Advanced Analytics and predictive modelling are only available on the Maximum plan.</p>
             <button onClick={() => setShowPricing(true)} className="px-8 py-4 bg-tertiary text-on-primary font-medium uppercase tracking-[0.2em] text-[10px] hover:bg-tertiary/90 transition-all shadow-md rounded-sm">Upgrade to Maximum</button>
           </div>
        ) : <Analytics vesselList={vesselList} cargoList={cargoList} />;
      case 'ai':
        return <AIAssistant context={{ cargo: selectedCargo, vessel: selectedVessel, lastFocused: lastFocusedContext }} />;
      case 'match':
        return selectedCargo ? (
          <MatchingEngine 
            activeCargo={selectedCargo} 
            vesselList={vesselList}
            onBack={() => setActiveTab('cargo')}
            onAssign={(vesselId, eta) => {
              handleCargoUpdate(selectedCargo.id, { assignedVesselId: vesselId, vesselETA: eta });
              setActiveTab('cargo');
            }}
          />
        ) : <CargoDesk 
              onMatch={handleCargoMatch} 
              cargoList={cargoList}
              vesselList={vesselList}
              onCreate={handleCargoCreate}
              onUpdate={handleCargoUpdate}
              onDelete={handleCargoDelete}
              onBulkDelete={handleCargoBulkDelete} 
              selectedCargo={selectedCargo} 
              setSelectedCargo={setSelectedCargo} 
            />;
      case 'settings':
        return <Settings initialTab={settingsInitialTab as any} />;
      case 'architecture':
        return <ArchitectureStack />;
      case 'docs':
        return <Documentation />;
      default:
        return <div className="p-8 text-on-surface terminal-data uppercase">Feature_Under_Development</div>;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-on-surface">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} notifications={notifications} />
      
      <div className="flex-1 flex flex-col min-w-0 h-full relative border-l border-outline/50 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
        <Ticker onConfigure={() => {
          setSettingsInitialTab('preferences');
          setActiveTab('settings');
        }} />
        <TopBar activeTabLabel={activeTab} onUpgradeClick={() => setShowPricing(true)} onSearchClick={() => setIsSearchOpen(true)} />
        
        <main className="flex-1 overflow-hidden relative bg-gradient-to-br from-surface to-surface-container-low">
          <GlobalSearch 
            isOpen={isSearchOpen} 
            onClose={() => setIsSearchOpen(false)} 
            cargoList={cargoList} 
            vesselList={vesselList} 
            contactList={contactList} 
            emailList={emails}
            onSelectResult={handleGlobalSearchSelect} 
          />
          <NotificationCenter />
          <AnimatePresence>
            {showTrialWelcome ? (
              <motion.div 
                 initial={{ opacity: 0, scale: 0.9 }} 
                 animate={{ opacity: 1, scale: 1 }} 
                 exit={{ opacity: 0, scale: 0.9 }}
                 className="absolute inset-0 z-50 bg-surface/80 backdrop-blur-sm flex items-center justify-center p-4"
              >
                <div className="bg-surface-container-highest border border-outline/30 shadow-2xl rounded-sm p-8 max-w-md w-full text-center relative overflow-hidden">
                  <div className="w-16 h-16 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 shadow-[0_0_20px_rgba(var(--color-primary),0.2)]">
                    <Zap className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-display font-bold text-on-surface mb-4">
                    {t('trial_welcome_title')}
                  </h2>
                  <p className="text-on-surface-variant font-sans text-sm mb-8 leading-relaxed">
                    {t('trial_welcome_message')}
                  </p>

                  <div className="flex justify-center gap-2 mb-8">
                    <select 
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as Language)}
                      className="bg-surface-container border border-outline text-on-surface text-xs rounded-sm px-3 py-2 outline-none cursor-pointer"
                    >
                      <option value="en">English</option>
                      <option value="ru">Русский</option>
                      <option value="zh">中文</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                      <option value="ar">العربية</option>
                      <option value="de">Deutsch</option>
                      <option value="pt">Português</option>
                      <option value="ja">日本語</option>
                      <option value="hi">हिन्दी</option>
                    </select>
                  </div>

                  <button 
                    onClick={handleCloseTrialWelcome}
                    className="w-full py-4 bg-primary text-on-primary font-bold uppercase tracking-widest text-[11px] hover:bg-primary-container transition-all rounded-sm shadow-md"
                  >
                    {t('trial_welcome_button')}
                  </button>
                </div>
              </motion.div>
            ) : null}
            {showPricing ? (
              <motion.div 
                initial={{ opacity: 0, y: 50 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: 50 }}
                className="absolute inset-0 z-50 bg-surface/95 backdrop-blur-3xl flex flex-col"
              >
                <div className="flex justify-end p-4">
                  <button 
                    onClick={() => setShowPricing(false)}
                    className="p-2 bg-surface-container border border-outline text-on-surface-variant hover:text-on-surface rounded-full transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <Pricing onClose={() => setShowPricing(false)} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.99 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute inset-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 flex flex-col h-full"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile Navbar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 w-full z-50 flex justify-around items-stretch h-[calc(4.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-surface-container-highest border-t border-outline/30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <button 
            onClick={() => setActiveTab('cargo')}
            className={cn("flex-1 flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'cargo' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
          >
            <div className="relative">
              <Package2 strokeWidth={activeTab === 'cargo' ? 2 : 1.5} className="h-5 w-5" />
              {notifications.cargo && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.8)]" />}
            </div>
            <span className="text-[9px] tracking-widest uppercase font-medium">{t('cargo')}</span>
            {activeTab === 'cargo' && (
              <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('vessel')}
            className={cn("flex-1 flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'vessel' ? "text-primary flex-1" : "text-on-surface-variant hover:text-on-surface")}
          >
            <div className="relative">
              <Ship strokeWidth={activeTab === 'vessel' ? 2 : 1.5} className="h-5 w-5" />
              {notifications.vessel && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.8)]" />}
            </div>
            <span className="text-[9px] tracking-widest uppercase font-medium">{t('vessel')}</span>
            {activeTab === 'vessel' && (
              <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('selection')}
            className={cn("flex-1 flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'selection' ? "text-primary flex-1" : "text-on-surface-variant hover:text-on-surface")}
          >
            <div className="relative">
              <Zap strokeWidth={activeTab === 'selection' ? 2 : 1.5} className="h-5 w-5" />
              {notifications.selection && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.8)]" />}
            </div>
            <span className="text-[9px] tracking-widest uppercase font-medium">{t('selection')}</span>
            {activeTab === 'selection' && (
              <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('inbox')}
            className={cn("flex-1 flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'inbox' ? "text-primary flex-1" : "text-on-surface-variant hover:text-on-surface")}
          >
            <div className="relative">
              <Mail strokeWidth={activeTab === 'inbox' ? 2 : 1.5} className="h-5 w-5" />
              {notifications.inbox && <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.8)]" />}
            </div>
            <span className="text-[9px] tracking-widest uppercase font-medium">{t('inbox')}</span>
            {activeTab === 'inbox' && (
              <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('documents')}
            className={cn("flex-1 flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'documents' ? "text-primary flex-1" : "text-on-surface-variant hover:text-on-surface")}
          >
            <div className="relative">
              <FileText strokeWidth={activeTab === 'documents' ? 2 : 1.5} className="h-5 w-5" />
            </div>
            <span className="text-[9px] tracking-widest uppercase font-medium">Drafts</span>
            {activeTab === 'documents' && (
              <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={cn("flex-1 flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'settings' ? "text-primary flex-1" : "text-on-surface-variant hover:text-on-surface")}
          >
            <SettingsIcon strokeWidth={activeTab === 'settings' ? 2 : 1.5} className="h-5 w-5" />
            <span className="text-[9px] tracking-widest uppercase font-medium">{t('settings')}</span>
            {activeTab === 'settings' && (
              <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
            )}
          </button>
        </nav>
      </div>
    </div>
  );
}
