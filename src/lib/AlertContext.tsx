import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db, useAuth } from './firebase';
import { collection, query, where, onSnapshot, orderBy, writeBatch, doc } from 'firebase/firestore';
import { Alert, markAlertAsRead, dismissAlert, AlertPreference, getAlertPreferences, writeAudit } from './alertService';

interface AlertContextProps {
  alerts: Alert[];
  unreadCount: number;
  preferences: AlertPreference | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  refreshPreferences: () => Promise<void>;
  logActionClick: (id: string) => Promise<void>;
  showAlertsCenter: boolean;
  setShowAlertsCenter: (s: boolean) => void;
}

const AlertContext = createContext<AlertContextProps | undefined>(undefined);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [preferences, setPreferences] = useState<AlertPreference | null>(null);
  const [showAlertsCenter, setShowAlertsCenter] = useState(false);

  useEffect(() => {
    let unsubscribe: () => void;
    
    const setup = async () => {
      if (user) {
        const prefs = await getAlertPreferences(user.uid);
        setPreferences(prefs);

        const q = query(
          collection(db, 'alerts'),
          where('recipientUid', '==', user.uid),
          where('dismissed', '==', false)
        );
        
        unsubscribe = onSnapshot(q, (snapshot) => {
          const loaded: Alert[] = [];
          snapshot.forEach(d => {
             loaded.push(d.data() as Alert);
          });
          loaded.sort((a,b) => b.createdAt - a.createdAt);
          setAlerts(loaded);
        });
      } else {
        setAlerts([]);
        setPreferences(null);
      }
    };
    
    setup();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

  const markAsRead = async (id: string) => {
    if (user) await markAlertAsRead(id, user.uid);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    alerts.filter(a => !a.read).forEach(a => {
      batch.update(doc(db, 'alerts', a.id), { read: true, readAt: Date.now() });
    });
    await batch.commit();
    await writeAudit(user.uid, 'alert_read_all', 'All alerts marked as read');
  };

  const dismiss = async (id: string) => {
    if (user) await dismissAlert(id, user.uid);
  };

  const refreshPreferences = async () => {
    if (user) {
       const prefs = await getAlertPreferences(user.uid);
       setPreferences(prefs);
    }
  };

  const logActionClick = async (alertId: string) => {
    if (user) await writeAudit(user.uid, 'alert_action_clicked', `Action clicked for alert ${alertId}`);
  };

  const unreadCount = alerts.filter(a => !a.read).length;

  return (
    <AlertContext.Provider value={{
      alerts, unreadCount, preferences, markAsRead, markAllAsRead, dismiss, refreshPreferences, logActionClick, showAlertsCenter, setShowAlertsCenter
    }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlerts must be used within AlertProvider');
  return context;
};
