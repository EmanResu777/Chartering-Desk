import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, CheckCircle2, AlertCircle, Info, X, Package, Ship, Zap, Network, ShieldAlert } from 'lucide-react';
import { cn } from './utils';
import { auth, db } from './firebase';
import { collection, query, onSnapshot, orderBy, doc, setDoc, deleteDoc, writeBatch, serverTimestamp, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';
export type NotificationCategory = 'cargo' | 'vessel' | 'match' | 'risk' | 'network' | 'system';

export interface Toast {
  id: string;
  title: string;
  message?: string;
  type: NotificationType;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message?: string;
  severity: NotificationSeverity;
  entityType: NotificationCategory;
  entityId?: string;
  source: 'gmail' | 'manual_text' | 'desk_network' | 'matching_engine' | 'memory' | 'system';
  read: boolean;
  createdAt: string;
  metadata?: any;
}

export interface NotificationSettings {
  enabled: boolean;
  mode: 'professional' | 'broker_humor' | 'silent';
  categories: {
    cargo: boolean;
    vessel: boolean;
    match: boolean;
    risk: boolean;
    network: boolean;
    system: boolean;
  };
  strongMatchThreshold: number;
  riskAlertsEnabled: boolean;
}

const defaultSettings: NotificationSettings = {
  enabled: true,
  mode: 'professional',
  categories: {
    cargo: true,
    vessel: true,
    match: true,
    risk: true,
    network: true,
    system: false
  },
  strongMatchThreshold: 80,
  riskAlertsEnabled: true
};

interface NotificationContextProps {
  notify: (notification: Omit<Toast, 'id'>) => void;
  addNotification: (notification: Omit<AppNotification, 'id' | 'userId' | 'read' | 'createdAt'>) => void;
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  clearAll: () => void;
  settings: NotificationSettings;
  updateSettings: (newSettings: Partial<NotificationSettings>) => void;
  showNotificationCenter: boolean;
  setShowNotificationCenter: (show: boolean) => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

const ICONS = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-500" />,
  info: <Info className="w-5 h-5 text-blue-400" />,
  warning: <AlertCircle className="w-5 h-5 text-orange-400" />
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);

  useEffect(() => {
    let unsubscribeNotifs: () => void;
    
    const setup = async (user: any) => {
      if (user) {
        // Load settings
        const settingsRef = doc(db, `users/${user.uid}/settings/notifications`);
        const snap = await getDoc(settingsRef);
        if (snap.exists()) {
          setSettings({ ...defaultSettings, ...snap.data() });
        }
        
        // Listen to notifications
        const q = query(collection(db, `users/${user.uid}/notifications`), orderBy('createdAt', 'desc'));
        unsubscribeNotifs = onSnapshot(q, (snapshot) => {
          const loaded: AppNotification[] = [];
          snapshot.forEach(doc => {
            loaded.push({ id: doc.id, ...doc.data() } as AppNotification);
          });
          setNotifications(loaded);
        });
      } else {
        setNotifications([]);
      }
    };
    
    const authUnsub = onAuthStateChanged(auth, setup);
    return () => {
      authUnsub();
      if (unsubscribeNotifs) unsubscribeNotifs();
    };
  }, []);

  const updateSettings = async (newSettings: Partial<NotificationSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    if (auth.currentUser) {
      await setDoc(doc(db, `users/${auth.currentUser.uid}/settings/notifications`), updated, { merge: true });
    }
  };

  const notify = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev.slice(-2), { ...toast, id }]); // max 3 visible

    setTimeout(() => {
      setToasts(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(n => n.id !== id));
  };

  const addNotification = async (notification: Omit<AppNotification, 'id' | 'userId' | 'read' | 'createdAt'>) => {
    if (!auth.currentUser || !settings.enabled) return;
    
    // Check categories
    if (!settings.categories[notification.entityType]) return;

    if (settings.mode === 'silent') {
      // Avoid showing toast, but still save
    } else {
      // Show transient toast
      const typeMap: Record<string, NotificationType> = {
        'info': 'info',
        'success': 'success',
        'warning': 'warning',
        'critical': 'error'
      };
      notify({
        title: notification.title,
        message: notification.message,
        type: typeMap[notification.severity] || 'info'
      });
    }

    // Anti-spam circular logic (handled upstream typically, but we save regardless here)
    const id = doc(collection(db, `users/${auth.currentUser.uid}/notifications`)).id;
    
    // Sanitize metadata
    let safeMetadata = undefined;
    if (notification.metadata) {
      const { 
        rawBody, rawText, sourceId, dedupeKey, access_token, refresh_token, 
        privateNotes, body, html, ...rest 
      } = notification.metadata as any;
      safeMetadata = Object.keys(rest).length > 0 ? rest : undefined;
    }

    // Construct exact payload to avoid accidentally writing unwanted fields via spread
    const dbPayload = {
      userId: auth.currentUser.uid,
      title: notification.title,
      message: notification.message || null,
      severity: notification.severity,
      entityType: notification.entityType,
      entityId: notification.entityId || null,
      source: notification.source,
      read: false,
      createdAt: new Date().toISOString()
    };
    
    if (safeMetadata) {
      (dbPayload as any).metadata = safeMetadata;
    }
    
    // Clean out any undefined/null fields for Firestore safety (though null is fine)
    const cleanPayload = Object.fromEntries(Object.entries(dbPayload).filter(([_, v]) => v !== undefined));
    
    await setDoc(doc(db, `users/${auth.currentUser.uid}/notifications/${id}`), cleanPayload);
  };

  const markAsRead = async (id: string) => {
    if (!auth.currentUser) return;
    await setDoc(doc(db, `users/${auth.currentUser.uid}/notifications/${id}`), { read: true }, { merge: true });
  };

  const markAllAsRead = async () => {
    if (!auth.currentUser) return;
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      const ref = doc(db, `users/${auth.currentUser.uid}/notifications/${n.id}`);
      batch.update(ref, { read: true });
    });
    await batch.commit();
  };

  const clearNotification = async (id: string) => {
    if (!auth.currentUser) return;
    await deleteDoc(doc(db, `users/${auth.currentUser.uid}/notifications/${id}`));
  };

  const clearAll = async () => {
    if (!auth.currentUser) return;
    const batch = writeBatch(db);
    notifications.forEach(n => {
      const ref = doc(db, `users/${auth.currentUser.uid}/notifications/${n.id}`);
      batch.delete(ref);
    });
    await batch.commit();
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notify,
      addNotification,
      notifications,
      unreadCount,
      markAsRead,
      markAllAsRead,
      clearNotification,
      clearAll,
      settings,
      updateSettings,
      showNotificationCenter,
      setShowNotificationCenter
    }}>
      {children}
      <div className="fixed top-20 right-4 sm:right-6 z-[9999] flex flex-col gap-3 pointer-events-none w-[calc(100vw-2rem)] sm:w-full sm:max-w-sm drop-shadow-2xl">
        <AnimatePresence>
          {toasts.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              layout
              className="pointer-events-auto bg-surface border border-outline border-l-4 rounded-sm shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-4 flex gap-4 overflow-hidden relative group"
              style={{
                borderLeftColor: n.type === 'success' ? '#34d399' : n.type === 'error' ? '#ef4444' : n.type === 'warning' ? '#fbbf24' : '#60a5fa'
              }}
            >
              <div className="shrink-0 pt-0.5">
                {ICONS[n.type]}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-on-surface mb-1 truncate text-[12px] font-sans tracking-widest uppercase">{n.title}</h4>
                {n.message && (
                  <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-2 font-mono">
                    {n.message}
                  </p>
                )}
              </div>
              <button 
                onClick={() => removeToast(n.id)}
                className="shrink-0 text-on-surface-variant/50 hover:text-on-surface transition-colors p-1 rounded-sm hover:bg-surface-container"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

