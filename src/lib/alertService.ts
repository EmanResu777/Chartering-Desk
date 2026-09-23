import { doc, getDoc, setDoc, collection, getDocs, query, where, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from './firebase';

export interface AlertPreference {
  userId: string;
  inAppAlertsEnabled: boolean;
  dailyDigestEnabled: boolean;
  urgentOnlyMode: boolean;
  categories: {
    smart_radar_match: boolean;
    market_request_match: boolean;
    hot_opp: boolean;
    deal_room_update: boolean;
    deal_room_note: boolean;
    process_offer: boolean;
    ai_deal_brief: boolean;
    counterparty_crm: boolean;
    recap_draft: boolean;
    recap_confirmation: boolean;
    broker_confirmation_waiting: boolean;
    system: boolean;
    urgent_opportunity: boolean;
  };
  digestTimePlaceholder: string;
  emailDigestPlaceholderDisabled: boolean;
  telegramWhatsappPlaceholderDisabled: boolean;
  updatedAt: number;
}

export type AlertPriority = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Alert {
  id: string;
  recipientUid: string;
  recipientDeskId?: string;
  createdBySystem: boolean;
  category: string;
  priority: AlertPriority;
  title: string;
  message: string;
  sourceType: string;
  sourceId: string;
  dealRoomId?: string;
  relatedItemIds?: string[];
  actionLabel: string;
  actionRoute: string; // The app route exactly
  read: boolean;
  dismissed: boolean;
  createdAt: number;
  readAt?: number | null;
  dismissedAt?: number | null;
  expiresAt?: number | null;
  visibility: 'private' | 'my_desk';
}

export const defaultAlertPreferences: Omit<AlertPreference, 'userId'> = {
  inAppAlertsEnabled: true,
  dailyDigestEnabled: true,
  urgentOnlyMode: false,
  categories: {
    smart_radar_match: true,
    market_request_match: true,
    hot_opp: true,
    deal_room_update: true,
    deal_room_note: true,
    process_offer: true,
    ai_deal_brief: true,
    counterparty_crm: true,
    recap_draft: true,
    recap_confirmation: true,
    broker_confirmation_waiting: true,
    system: true,
    urgent_opportunity: true
  },
  digestTimePlaceholder: '08:00',
  emailDigestPlaceholderDisabled: true,
  telegramWhatsappPlaceholderDisabled: true,
  updatedAt: Date.now()
};

export async function getAlertPreferences(uid: string): Promise<AlertPreference> {
  const ref = doc(db, 'alertPreferences', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data() as AlertPreference;
  }
  const defaultPrefs = { userId: uid, ...defaultAlertPreferences };
  await setDoc(ref, defaultPrefs);
  return defaultPrefs;
}

export async function updateAlertPreferences(uid: string, updates: Partial<AlertPreference>) {
  const ref = doc(db, 'alertPreferences', uid);
  await setDoc(ref, { ...updates, updatedAt: Date.now() }, { merge: true });
  await writeAudit(uid, 'preferences_updated', `Preferences updated for user ${uid}`);
}

export async function writeAudit(uid: string, action: string, details: string) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) return;
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        action,
        metadata: { details: String(details).slice(0, 1000) }
      })
    });
    if (!response.ok) {
      console.warn(`[AUDIT] Server rejected ${action}: HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn(`[AUDIT] Failed to persist ${action}`, error);
  }
}

export type CreateAlertInput = Omit<Alert, 'id' | 'read' | 'dismissed' | 'createdAt' | 'readAt' | 'dismissedAt' | 'visibility' | 'sourceId' | 'sourceType' | 'createdBySystem' | 'actionLabel'> & {
  visibility?: 'private' | 'my_desk';
  sourceId?: string;
  sourceType?: string;
  createdBySystem?: boolean;
  actionLabel?: string;
};

export async function createAlert(alertInput: CreateAlertInput) {
  if (alertInput.recipientUid) {
    const prefs = await getAlertPreferences(alertInput.recipientUid);
    if (!prefs.inAppAlertsEnabled) return null;
    if (prefs.urgentOnlyMode && !['critical', 'high'].includes(alertInput.priority)) return null;
    
    const cat = alertInput.category as keyof AlertPreference['categories'];
    // billing is a special case, otherwise check category pref
    if (cat !== ('billing_credits' as any) && prefs.categories[cat] === false) {
      return null;
    }
  }

  const alertRef = doc(collection(db, 'alerts'));
  const newAlert: Alert = {
    ...alertInput,
    visibility: alertInput.visibility || 'private',
    sourceId: alertInput.sourceId || 'system',
    sourceType: alertInput.sourceType || 'system_generated',
    createdBySystem: alertInput.createdBySystem !== undefined ? alertInput.createdBySystem : true,
    actionLabel: alertInput.actionLabel || 'View',
    id: alertRef.id,
    read: false,
    dismissed: false,
    createdAt: Date.now()
  };

  await setDoc(alertRef, newAlert);
  
  if (alertInput.recipientUid) await writeAudit(alertInput.recipientUid, 'alert_created', `Alert ${alertRef.id} created for ${alertInput.recipientUid}`);
  return newAlert;
}

export async function markAlertAsRead(alertId: string, uid: string) {
  await updateDoc(doc(db, 'alerts', alertId), { read: true, readAt: Date.now() });
  await writeAudit(uid, 'alert_read', `Alert ${alertId} read`);
}

export async function dismissAlert(alertId: string, uid: string) {
  await updateDoc(doc(db, 'alerts', alertId), { dismissed: true, dismissedAt: Date.now() });
  await writeAudit(uid, 'alert_dismissed', `Alert ${alertId} dismissed`);
}

export async function generateDailyDigest(uid: string, deskId: string) {
  const digestId = doc(collection(db, 'dailyDigests')).id;
  const ts = Date.now();
  const since = ts - 24 * 60 * 60 * 1000;

  const [matchesSnap, alertsSnap] = await Promise.all([
    getDocs(query(collection(db, 'watchlistMatches'), where('createdByUid', '==', uid))),
    getDocs(query(collection(db, 'alerts'), where('recipientUid', '==', uid)))
  ]);

  const topMatches = matchesSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(match => match.status !== 'dismissed' && Number.isFinite(Number(match.score)))
    .sort((a, b) => Number(b.score) - Number(a.score))
    .slice(0, 3)
    .map(match => ({
      id: match.id,
      title: String(match.itemDetails?.title || match.source || 'Matched opportunity').slice(0, 200),
      percent: Math.max(0, Math.min(100, Number(match.score)))
    }));

  const recentAlerts = alertsSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(alert => !alert.dismissed && Number(alert.createdAt || 0) >= since);

  const urgentItems = recentAlerts
    .filter(alert => ['critical', 'high'].includes(String(alert.priority)))
    .slice(0, 5)
    .map(alert => ({ id: alert.id, title: String(alert.title || 'Urgent item').slice(0, 200) }));

  const actionCategories = new Set(['deal_room_update', 'broker_confirmation_waiting', 'recap_confirmation', 'recap_draft']);
  const dealRoomsNeedingAction = recentAlerts
    .filter(alert => actionCategories.has(String(alert.category)))
    .slice(0, 5)
    .map(alert => ({ id: alert.id, title: String(alert.title || 'Deal room action').slice(0, 200) }));

  const suggestedActions: string[] = [];
  if (urgentItems.length) suggestedActions.push(`Review ${urgentItems.length} high-priority alert${urgentItems.length === 1 ? '' : 's'}`);
  if (dealRoomsNeedingAction.length) suggestedActions.push(`Review ${dealRoomsNeedingAction.length} deal-room action item${dealRoomsNeedingAction.length === 1 ? '' : 's'}`);
  if (topMatches.length) suggestedActions.push(`Review top ${topMatches.length} current Smart Radar match${topMatches.length === 1 ? '' : 'es'}`);

  const digest = {
    id: digestId,
    recipientUid: uid,
    recipientDeskId: deskId,
    date: new Date(ts).toISOString().split('T')[0],
    topMatches,
    urgentItems,
    dealRoomsNeedingAction,
    recapConfirmations: [],
    counterpartyUpdates: [],
    suggestedActions,
    generatedAt: ts,
    source: 'workspace_activity'
  };
  
  await setDoc(doc(db, 'dailyDigests', digestId), digest);
  await writeAudit(uid, 'daily_digest_generated', `Generated daily digest ${digestId} from current workspace activity`);
  return digest;
}
