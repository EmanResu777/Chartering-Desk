import React, { useState, useEffect } from 'react';
import { Sidebar, TopBar } from './components/Navigation';
import { CargoDesk } from './components/CargoDesk';
import { VesselMonitor } from './components/VesselMonitor';
import { InboxParser } from './components/InboxParser';
import { MatchingEngine } from './components/MatchingEngine';
import { CounterpartyCRM } from './components/CounterpartyCRM';
import { Analytics } from './components/Analytics';
import { SelectionDesk } from './components/SelectionDesk';
import { AIAssistant } from './components/AIAssistant';
import { DraftList } from './components/DraftList';
import { Settings } from './components/Settings';
import { OnboardingModal } from './components/OnboardingModal';
import { Documentation } from './components/Documentation';
import { ArchitectureStack } from './components/ArchitectureStack';
import { SmartRadar } from './components/SmartRadar';
import { DealRoomMain } from './components/DealRooms/DealRoomMain';
import { Dashboard } from './components/Dashboard';
import { MarketIntel } from './components/MarketIntel';
import { Ticker } from './components/Ticker';
import { Pricing } from './components/Pricing';
import { GlobalSearch } from './components/GlobalSearch';
import { AlertsCenter } from './components/AlertsCenter';

import { AuthScreen } from './components/AuthScreen';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import { Cargo, Vessel, Contact, Email, cn } from './lib/utils';
import { Package2, Ship, Mail, Settings as SettingsIcon, Users, BarChart3, Zap, Bot, X, FileText, LayoutDashboard, LineChart, Briefcase } from 'lucide-react';
import { ConfigProvider, useConfig, Language } from './lib/ConfigContext';
import { NotificationProvider, useNotification } from './lib/NotificationContext';
import { AlertProvider, useAlerts } from './lib/AlertContext';
import { WorkspaceProvider, useWorkspace } from './lib/WorkspaceContext';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, loginWithGoogle, logout, handleFirestoreError, OperationType, db } from './lib/firebase';
import { collection, onSnapshot, query, where, setDoc, doc, deleteDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { shareItem, unshareItem, updateSharedItem } from './lib/networkService';

type Tab = 'dashboard' | 'cargo' | 'vessel' | 'selection' | 'inbox' | 'analytics' | 'settings' | 'match' | 'contacts' | 'ai' | 'architecture' | 'docs' | 'documents' | 'radar' | 'deal-rooms' | 'market';

import { FeedbackWidget } from './components/FeedbackWidget';

export default function App() {
  return (
    <ConfigProvider>
      <NotificationProvider>
        <AlertProvider>
          <WorkspaceProvider>
            <AppContent />
            <FeedbackWidget />
          </WorkspaceProvider>
        </AlertProvider>
      </NotificationProvider>
    </ConfigProvider>
  );
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace, loading: workspaceLoading } = useWorkspace();
  const { notify, addNotification, settings } = useNotification();
  const { showAlertsCenter, setShowAlertsCenter } = useAlerts();
  const { t, subscription, setSubscription, language, setLanguage } = useConfig();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [showPricing, setShowPricing] = useState(false);
  const [selectedCargo, setSelectedCargo] = useState<Cargo | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [lastFocusedContext, setLastFocusedContext] = useState<'cargo' | 'vessel' | null>(null);
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});
  const [showTrialWelcome, setShowTrialWelcome] = useState(false);
  const [usageAccess, setUsageAccess] = useState<{ planId: string; billingStatus: string; resetAt?: string; loading: boolean }>({
    planId: 'unknown',
    billingStatus: 'loading',
    loading: true,
  });

  useEffect(() => {
    if (!user) {
      setUsageAccess({ planId: 'unknown', billingStatus: 'signed_out', loading: false });
      return;
    }

    let cancelled = false;
    const loadUsageAccess = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/usage/summary', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Unable to resolve account access');
        if (!cancelled) {
          setUsageAccess({
            planId: String(body.planId || 'unknown'),
            billingStatus: String(body.billingStatus || 'unknown'),
            resetAt: body.resetAt,
            loading: false,
          });
          if (body.planId === 'desk') setSubscription('maximum');
          else if (body.planId === 'solo') setSubscription('premium');
          else if (body.planId === 'free' || body.billingStatus === 'trial_expired' || body.billingStatus === 'past_due') setSubscription('basic');
        }
      } catch (error) {
        if (!cancelled) {
          setUsageAccess({ planId: 'unknown', billingStatus: 'unavailable', loading: false });
        }
      }
    };

    loadUsageAccess();
    const timer = window.setInterval(loadUsageAccess, 2 * 60 * 1000);
    window.addEventListener('focus', loadUsageAccess);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', loadUsageAccess);
    };
  }, [user, setSubscription]);

  useEffect(() => {
    const trialActive = usageAccess.planId === 'trial' && usageAccess.billingStatus === 'trial';
    if (trialActive && user) {
      const key = `trial_welcome_seen_${user.uid}`;
      if (!localStorage.getItem(key)) setShowTrialWelcome(true);
    } else {
      setShowTrialWelcome(false);
    }
  }, [usageAccess.planId, usageAccess.billingStatus, user]);

  useEffect(() => {
    const handleShowPricing = () => setShowPricing(true);
    window.addEventListener('show-pricing', handleShowPricing);
    return () => window.removeEventListener('show-pricing', handleShowPricing);
  }, []);

  const handleCloseTrialWelcome = () => {
    if (user) {
      localStorage.setItem(`trial_welcome_seen_${user.uid}`, 'true');
    }
    setShowTrialWelcome(false);
  };

  useEffect(() => {
    const handleNavigate = (e: Event) => {
       const path = (e as CustomEvent).detail;
       if (path === '/deal-rooms') setActiveTab('deal-rooms');
       if (path === '/cargo') setActiveTab('cargo');
       if (path === '/vessel') setActiveTab('vessel');
       if (path === '/radar') setActiveTab('radar');
       if (path === '/market') setActiveTab('market');
       if (path === '/dashboard') setActiveTab('dashboard');
       if (path === '/settings') setActiveTab('settings');
    };
    window.addEventListener('navigate-to', handleNavigate);
    return () => window.removeEventListener('navigate-to', handleNavigate);
  }, []);

  useEffect(() => {
    if (selectedCargo) setLastFocusedContext('cargo');
  }, [selectedCargo]);

  useEffect(() => {
    if (selectedVessel) setLastFocusedContext('vessel');
  }, [selectedVessel]);

  useEffect(() => {
    // Check for Stripe success URL parameters
    const queryStr = new URLSearchParams(window.location.search);
    if (queryStr.get('success') === 'true' || queryStr.get('canceled') === 'true') {
      // Entitlements are server-controlled via Stripe webhook + Firestore.
      // Never unlock paid UI solely from redirect query parameters.
      window.history.replaceState({}, document.title, window.location.pathname);
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

                  import('./lib/alertService').then(({ createAlert }) => {
                     createAlert({
                        recipientUid: user.uid,
                        title: title,
                        message: `New network proposal received on your shared item.`,
                        priority: 'high',
                        category: 'network',
                        actionRoute: `/dashboard`
                     }).catch(console.error);
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

  // Sync user profile and subscription from Firestore
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    if (user) {
      const syncDeskId = async () => {
         const userRef = doc(db, 'users', user.uid);
         const userSnap = await getDoc(userRef);
         let deskId = '';
         let displayName = user.displayName || 'Broker';
         let companyName = 'Independent Broker';
         let role = 'broker';
         let needsBatch = false;

         const { writeBatch } = await import('firebase/firestore');
         const batch = writeBatch(db);

         if (!userSnap.exists()) {
             deskId = `CDP-${Math.floor(Math.random()*1000000).toString(16).toUpperCase()}`;
             batch.set(userRef, {
                 deskId,
                 displayName: user.displayName || '',
                 email: user.email,
                 createdAt: serverTimestamp(),
                 updatedAt: serverTimestamp(),
             });
             needsBatch = true;
         } else {
             const data = userSnap.data();
             deskId = data.deskId;
             if (!deskId) {
                 deskId = `CDP-${Math.floor(Math.random()*1000000).toString(16).toUpperCase()}`;
                 batch.update(userRef, { deskId });
                 needsBatch = true;
             }
             displayName = data.displayName || displayName;
             companyName = data.companyName || companyName;
             role = data.role || role;
         }
         
         if (deskId) {
             const profileRef = doc(db, 'publicProfiles', deskId);
             if (needsBatch) {
                 batch.set(profileRef, {
                     uid: user.uid,
                     deskId,
                     displayName,
                     companyName,
                     role,
                     verifiedCompany: false,
                     updatedAt: serverTimestamp(),
                     createdAt: serverTimestamp(),
                 }, { merge: true });
                 try {
                     await batch.commit();
                 } catch (e: any) {
                     console.error("publicProfiles batch sync failed:", e.message);
                 }
             } else {
                 try {
                    await setDoc(profileRef, {
                        uid: user.uid,
                        deskId,
                        displayName,
                        companyName,
                        role,
                        verifiedCompany: false,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                 } catch (e: any) {
                    console.error("publicProfiles sync failed:", e.message);
                 }
             }
         }
      };
      syncDeskId();

      const unsubUser = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.onboardingCompleted === undefined || data.onboardingCompleted === false) {
             setShowOnboarding(true);
          } else {
             setShowOnboarding(false);
          }
        } else {
           setShowOnboarding(true);
        }
        setOnboardingChecked(true);
      }, (err) => {
         console.error("user snap pop", err);
         setOnboardingChecked(true);
      });
      return () => unsubUser();
    } else {
      setOnboardingChecked(true);
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
  const [emails, setEmails] = useState<Email[]>([]);

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

  // User identity shown in legacy network UI. Use authenticated data only.
  const userProfile = {
    id: user.uid,
    name: user.displayName || user.email || 'Broker',
    role: currentWorkspace?.myRole || 'broker'
  };

  // Network State
  const [networkMessages, setNetworkMessages] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);

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
      const existing = cargoList.find(c => c.id === id);
      
      const newUpdates = { 
        ...updates, 
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z',
        lastEditedBy: user.email || user.displayName || 'Unknown'
      };
      
      await setDoc(docRef, newUpdates, { merge: true });

      if (existing?.visibility === 'desk_network' && existing.sharedItemId) {
        try {
          await updateSharedItem('cargo', existing.sharedItemId, newUpdates);
        } catch (err) {
          console.warn("Desk Network sync failed", err);
          notify({ type: 'error', title: 'Network Warning', message: 'Local save succeeded, but Desk Network sync failed.' });
        }
      }
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
      const existing = vesselList.find(v => v.id === id);
      
      const newUpdates = { 
        ...updates, 
        updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z',
        lastEditedBy: user.email || user.displayName || 'Unknown'
      };
      
      await setDoc(docRef, newUpdates, { merge: true });

      if (existing?.visibility === 'desk_network' && existing.sharedItemId) {
        try {
          await updateSharedItem('vessel', existing.sharedItemId, newUpdates);
        } catch (err) {
          console.warn("Desk Network sync failed", err);
          notify({ type: 'error', title: 'Network Warning', message: 'Local save succeeded, but Desk Network sync failed.' });
        }
      }
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
      const data = e.detail || {};
      if (!data.commodity || !data.quantity || !data.loadPort || !data.dischargePort) {
        notify({
          type: 'error',
          title: 'Network Import Rejected',
          message: 'Cargo import requires commodity, quantity, load port and discharge port.'
        });
        return;
      }

      const newCargo: Cargo = {
        id: `NET-${crypto.randomUUID()}`,
        commodity: String(data.commodity),
        quantity: String(data.quantity),
        loadPort: String(data.loadPort),
        dischargePort: String(data.dischargePort),
        laycan: data.laycan ? String(data.laycan) : 'TBD',
        charterer: data.charterer ? String(data.charterer) : 'NETWORK_CONTACT',
        category: data.category || 'DRY BULK',
        status: data.status || 'ACTIVE',
        priority: data.priority || 'NORMAL',
        confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0
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
      
      if (activeTab !== 'cargo') {
        setNotifications(prev => ({ ...prev, cargo: true }));
      }
    };

    const handleImportVesselAsync = async (e: any) => {
      if (!user || !currentWorkspace) return;
      const data = e.detail || {};
      const parsedDwt = Number(data.dwt);

      if (!data.name || !Number.isFinite(parsedDwt) || parsedDwt <= 0) {
        notify({
          type: 'error',
          title: 'Network Import Rejected',
          message: 'Vessel import requires a vessel name and valid DWT.'
        });
        return;
      }

      const newVessel: Vessel = {
        id: `NET-V-${crypto.randomUUID()}`,
        name: String(data.name),
        type: data.type ? String(data.type) : 'Bulk Carrier',
        dwt: parsedDwt,
        grt: Number.isFinite(Number(data.grt)) ? Number(data.grt) : 0,
        nrt: Number.isFinite(Number(data.nrt)) ? Number(data.nrt) : 0,
        builtYear: Number.isFinite(Number(data.builtYear)) ? Number(data.builtYear) : 0,
        status: data.status || 'OPEN',
        openPort: data.openPort ? String(data.openPort) : 'TBD',
        openDate: data.openDate ? String(data.openDate) : 'TBD',
        owner: data.owner ? String(data.owner) : 'NETWORK_CONTACT',
        updatedAt: new Date().toISOString(),
        confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : 0
      };
      
      await safeFirestoreCall(async () => {
        await setDoc(doc(db, 'vessels', newVessel.id), { ...newVessel, workspaceId: currentWorkspace.id, userId: user.uid });
      }, OperationType.CREATE, 'vessels', `Vessel ${newVessel.name} imported successfully`);

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

  const [settingsInitialTab, setSettingsInitialTab] = useState<string>('workspace');
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
    return <AuthScreen />;
  }

  if (!onboardingChecked) {
    return (
      <div className="flex h-screen bg-surface items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (showOnboarding && user) {
     return <OnboardingModal user={user} onComplete={() => setShowOnboarding(false)} />;
  }

  const renderContent = () => {
    const trialActive = usageAccess.planId === 'trial' && usageAccess.billingStatus === 'trial';
    const trialExpired = usageAccess.billingStatus === 'trial_expired';
    const accessSuspended = usageAccess.planId === 'free' || usageAccess.billingStatus === 'past_due' || usageAccess.billingStatus === 'cancelled';
    const isBasicAndTrialExpired = subscription === 'basic' && (trialExpired || accessSuspended);

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
    const effectiveSubscription = trialActive ? 'maximum' : subscription;

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard setActiveTab={setActiveTab} />;
      case 'radar':
        if (effectiveSubscription !== 'premium' && effectiveSubscription !== 'maximum') {
           return (
             <div className="flex-1 flex flex-col items-center justify-center p-8 bg-surface text-center font-mono">
               <Bot className="w-16 h-16 text-primary mb-6 animate-pulse shadow-[0_0_20px_var(--color-primary)]" />
               <div className="text-[10px] font-bold tracking-[0.3em] text-primary uppercase mb-2">Premium Feature</div>
               <h2 className="text-2xl font-display uppercase tracking-wider mb-4">Smart Radar</h2>
               <p className="text-sm font-sans text-on-surface-variant max-w-md mx-auto mb-8">
                 Access automated deal matching, saved watchlists, and intelligent opportunity detection.
               </p>
               <button onClick={() => setShowPricing(true)} className="px-8 py-4 bg-primary text-on-primary font-medium uppercase tracking-[0.2em] text-[10px] hover:bg-primary-container transition-all shadow-md rounded-sm">Upgrade Required</button>
             </div>
           );
        }
        return <SmartRadar />;
      case 'deal-rooms':
        return <DealRoomMain />;
      case 'market':
        return <MarketIntel />;
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
          cargoList={cargoList}
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
        return <CounterpartyCRM />;
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
              // Server endpoint already updated assignedVesselId
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
        return <Documentation />;
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
          {/* We rely on global toast from NotificationProvider, but replaced NotificationCenter with AlertsCenter overlay */}
          <AlertsCenter isOpen={showAlertsCenter} onClose={() => setShowAlertsCenter(false)} />
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

          <OnboardingChecklist />
        </main>

        {/* Mobile Navbar */}
        <nav aria-label="Mobile navigation" className="md:hidden fixed bottom-0 left-0 right-0 w-full z-50 flex justify-start items-stretch overflow-x-auto no-scrollbar h-[calc(4.5rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] bg-surface-container-highest border-t border-outline/30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
          <button
            onClick={() => setActiveTab('dashboard')}
            aria-label="Dashboard"
            className={cn("min-w-[68px] flex-none flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'dashboard' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
          >
            <LayoutDashboard strokeWidth={activeTab === 'dashboard' ? 2 : 1.5} className="h-5 w-5" />
            <span className="text-[9px] tracking-widest uppercase font-medium">Home</span>
            {activeTab === 'dashboard' && <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('cargo')}
            className={cn("min-w-[68px] flex-none flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'cargo' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
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
            className={cn("min-w-[68px] flex-none flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'vessel' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
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
            className={cn("min-w-[68px] flex-none flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'selection' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
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
            className={cn("min-w-[68px] flex-none flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'inbox' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
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
            onClick={() => setActiveTab('radar')}
            className={cn("min-w-[68px] flex-none px-1 flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'radar' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
          >
            <div className="relative">
              <Bot strokeWidth={activeTab === 'radar' ? 2 : 1.5} className="h-5 w-5" />
            </div>
            <span className="text-[9px] tracking-widest uppercase font-medium">Radar</span>
            {activeTab === 'radar' && (
              <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
            )}
          </button>
          <button 
            onClick={() => setActiveTab('documents')}
            className={cn("min-w-[68px] flex-none hidden sm:flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'documents' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
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
            onClick={() => setActiveTab('market')}
            aria-label="Market intelligence"
            className={cn("min-w-[68px] flex-none flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'market' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
          >
            <LineChart strokeWidth={activeTab === 'market' ? 2 : 1.5} className="h-5 w-5" />
            <span className="text-[9px] tracking-widest uppercase font-medium">Market</span>
            {activeTab === 'market' && <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full" />}
          </button>
          <button
            onClick={() => setActiveTab('deal-rooms')}
            aria-label="Deal rooms"
            className={cn("min-w-[68px] flex-none flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'deal-rooms' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
          >
            <Briefcase strokeWidth={activeTab === 'deal-rooms' ? 2 : 1.5} className="h-5 w-5" />
            <span className="text-[9px] tracking-widest uppercase font-medium">Deals</span>
            {activeTab === 'deal-rooms' && <motion.div layoutId="mobileNavIndicator" className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-b-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={cn("min-w-[68px] flex-none flex flex-col items-center justify-center gap-1.5 relative transition-colors", activeTab === 'settings' ? "text-primary" : "text-on-surface-variant hover:text-on-surface")}
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
