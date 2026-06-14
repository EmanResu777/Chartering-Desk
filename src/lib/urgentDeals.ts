import { Cargo, Vessel } from './utils';

export const isActiveUrgent = (item: any) => {
  if (item.isUrgent !== true) return { active: false, expired: false, candidate: false };
  if (item.urgentStatus !== 'candidate' && item.urgentStatus !== 'active') return { active: false, expired: false, candidate: false };
  
  if (item.urgentUntil) {
    let expiry: Date;
    if (typeof item.urgentUntil?.toDate === 'function') {
      expiry = item.urgentUntil.toDate();
    } else {
      expiry = new Date(item.urgentUntil);
    }
    if (expiry < new Date()) {
      return { active: false, expired: true, candidate: false };
    }
  }
  return { active: true, expired: false, candidate: item.urgentStatus === 'candidate' };
};

export interface UrgentDeal {
  id?: string;
  dealId: string;
  vesselItemId: string;
  cargoItemId: string;
  vesselOwnerUid: string;
  cargoOwnerUid: string;
  vesselSharedItemId?: string;
  cargoSharedItemId?: string;
  status: 'detected' | 'urgent_alert_candidate' | 'interest_received' | 'contacted' | 'negotiating' | 'ready_for_approval' | 'approved_by_cargo_side' | 'approved_by_vessel_side' | 'dual_approved' | 'approval_revoked' | 'expired' | 'cancelled';
  urgencyScore: number;
  matchScore: number;
  region: string;
  reason: string;
  cargoSideUid?: string;
  vesselSideUid?: string;
  interestedByUid?: string;
  interestedAt?: Date | any;
  contactedAt?: Date | any;
  negotiatingAt?: Date | any;
  lastActionAt?: Date | any;
  approvals?: {
    cargoSide?: {
      approved: boolean;
      approvedBy?: string;
      approvedAt?: Date | any;
      revokedAt?: Date | any;
    };
    vesselSide?: {
      approved: boolean;
      approvedBy?: string;
      approvedAt?: Date | any;
      revokedAt?: Date | any;
    };
  };
  approvalStatus?: string;
  lastApprovalActionAt?: Date | any;
  lastApprovalActionBy?: string;
  dualApprovedAt?: Date | any;
  createdAt: Date | any;
  updatedAt: Date | any;
  expiresAt: Date | any;
  createdBySystem: boolean;
  auditTrail: AuditEvent[];
}

export interface AuditEvent {
  action: string;
  timestamp: Date | any;
  actorUid: string;
  safeMessage: string;
}

export interface UrgentNotification {
  id?: string;
  notificationId: string;
  dealId: string;
  type: 'urgent_vessel' | 'urgent_cargo' | 'hot_match';
  title: string;
  safeMessage: string;
  status: 'candidate' | 'sent' | 'interested' | 'contacted' | 'approval_pending' | 'cargo_side_approved' | 'vessel_side_approved' | 'dual_approved' | 'approval_revoked' | 'dismissed' | 'expired';
  relatedCargoItemId?: string;
  relatedVesselItemId?: string;
  matchScore?: number;
  urgencyScore?: number;
  createdAt: Date | any;
  updatedAt: Date | any;
  expiresAt: Date | any;
  readAt?: Date | any;
}

export interface RecapDraft {
  id?: string;
  recapId: string;
  dealId: string;
  cargoItemId: string;
  vesselItemId: string;
  cargoOwnerUid: string;
  vesselOwnerUid: string;
  cargoSideUid?: string;
  vesselSideUid?: string;
  createdBy: string;
  createdAt: Date | any;
  updatedAt: Date | any;
  status: 'draft' | 'under_review' | 'locked' | 'cancelled';
  version: number;
  templateName: string;
  templateVersion: string;
  refNo: string;
  recapData: any;
  exportFormatsAvailable: string[];
  auditTrail: AuditEvent[];
}

export function detectUrgentOpportunity(
  newOrUpdatedItem: Partial<Cargo> | Partial<Vessel>,
  itemType: 'cargo' | 'vessel',
  oppositeItems: Array<Partial<Cargo> | Partial<Vessel>>
): Omit<UrgentDeal, 'id' | 'createdAt' | 'updatedAt' | 'auditTrail' | 'status' | 'dealId'> | null {
  // Simple deterministic scoring
  let urgencyScore = 0;
  let reason = '';
  let matchScore = 0;
  
  const now = Date.now();
  
  if (itemType === 'vessel') {
    const vessel = newOrUpdatedItem as Partial<Vessel>;
    if (!vessel.status || vessel.status === 'ARCHIVED' || vessel.status !== 'OPEN') return null;

    if ((vessel as any).priority === 'HOT' || (vessel.notes && vessel.notes.toLowerCase().includes('urgent'))) {
      urgencyScore += 50;
      reason = 'Manually marked urgent or hot priority. ';
    }

    const openDateStr = vessel.openDate?.toLowerCase() || '';
    if (openDateStr.includes('spot') || openDateStr.includes('prompt') || openDateStr.includes('now')) {
      urgencyScore += 50;
      reason += 'Vessel is prompt/spot. ';
    }
  } else {
    const cargo = newOrUpdatedItem as Partial<Cargo>;
    if (!cargo.status || cargo.status === 'COMPLETED' || cargo.status === 'ON HOLD' || cargo.status === 'FIRM') return null;

    if (cargo.priority === 'HOT' || (cargo.privateNotes && cargo.privateNotes.toLowerCase().includes('urgent'))) {
      urgencyScore += 50;
      reason = 'Manually marked urgent or hot priority. ';
    }

    const laycanStr = cargo.laycan?.toLowerCase() || '';
    if (laycanStr.includes('spot') || laycanStr.includes('prompt')) {
      urgencyScore += 50;
      reason += 'Cargo is prompt/spot. ';
    }
  }

  // Not urgent enough
  if (urgencyScore < 40) return null;

  // Find best match among oppositeItems
  let bestMatch: any = null;
  let bestMatchScore = 0;

  for (const opp of oppositeItems) {
    let currentMatchScore = 0;
    
    if (itemType === 'vessel') {
      const v = newOrUpdatedItem as Partial<Vessel>;
      const c = opp as Partial<Cargo>;
      
      if (c.status === 'COMPLETED' || c.status === 'ON HOLD' || c.status === 'FIRM') continue;

      // Type/category check
      if (v.type && c.category) {
        if (v.type.toLowerCase().includes('tanker') && c.category !== 'TANKER') continue;
        if (c.category === 'TANKER' && !v.type.toLowerCase().includes('tanker')) continue;
      }

      // Proximity (super basic)
      const vLocation = (v.openPort || '').toLowerCase();
      const cLoad = (c.loadPort || '').toLowerCase();
      if (vLocation && cLoad && (vLocation.includes(cLoad) || cLoad.includes(vLocation))) {
        currentMatchScore += 40;
      }

      bestMatchScore = Math.max(bestMatchScore, currentMatchScore);
      if (currentMatchScore === bestMatchScore) {
        bestMatch = c;
      }
    } else {
       const c = newOrUpdatedItem as Partial<Cargo>;
       const v = opp as Partial<Vessel>;

       if (v.status === 'ARCHIVED' || v.status !== 'OPEN') continue;

       // Type/category check
       if (v.type && c.category) {
         if (v.type.toLowerCase().includes('tanker') && c.category !== 'TANKER') continue;
         if (c.category === 'TANKER' && !v.type.toLowerCase().includes('tanker')) continue;
       }

       // Proximity
       const vLocation = (v.openPort || '').toLowerCase();
       const cLoad = (c.loadPort || '').toLowerCase();
       if (vLocation && cLoad && (vLocation.includes(cLoad) || cLoad.includes(vLocation))) {
         currentMatchScore += 40;
       }

       bestMatchScore = Math.max(bestMatchScore, currentMatchScore);
       if (currentMatchScore === bestMatchScore) {
         bestMatch = v;
       }
    }
  }

  if (!bestMatch || bestMatchScore < 20) return null; // No reasonable match found

  const vItem = itemType === 'vessel' ? newOrUpdatedItem as any : bestMatch as any;
  const cItem = itemType === 'cargo' ? newOrUpdatedItem as any : bestMatch as any;

  // Assuming items have userId and id 
  if (!vItem.id || !cItem.id) return null;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 3); // Valid for 3 days

  return {
    vesselItemId: vItem.id,
    cargoItemId: cItem.id,
    vesselOwnerUid: vItem.userId || 'system',
    cargoOwnerUid: cItem.userId || 'system',
    vesselSharedItemId: vItem.sharedItemId,
    cargoSharedItemId: cItem.sharedItemId,
    urgencyScore,
    matchScore: bestMatchScore,
    region: cItem.loadPort || vItem.openPort || 'Unknown',
    reason,
    createdBySystem: true,
    expiresAt,
  };
}

import { collection, query, where, getDocs, doc, setDoc, serverTimestamp, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export async function evaluateAndPersistUrgentDeal(
  sharedItem: any, 
  itemType: 'cargo' | 'vessel'
) {
  if (!auth.currentUser) return;
  const currentUid = auth.currentUser.uid;

  // Convert shared item to generic model
  const newOrUpdatedItem: any = {
    id: sharedItem.sourceItemId || sharedItem.id,
    sharedItemId: sharedItem.id,
    userId: sharedItem.ownerId,
    status: sharedItem.status === 'active' ? (itemType === 'vessel' ? 'OPEN' : 'ACTIVE') : 'ARCHIVED',
    priority: sharedItem.priority,
    notes: sharedItem.notes || sharedItem.description || '',
    openPort: sharedItem.openPort || '',
    openDate: sharedItem.openDate || '',
    loadPort: sharedItem.loadPort || '',
    laycan: sharedItem.laycan || '',
    type: sharedItem.vessel_type || '',
    category: sharedItem.category || '',
  };

  // Skip inactive or revoked network items
  if (sharedItem.status !== 'active') return;

  // Fetch opposite items from network
  const oppositeType = itemType === 'cargo' ? 'vessel' : 'cargo';
  const q = query(
    collection(db, 'sharedItems'), 
    where('itemType', '==', oppositeType),
    where('status', '==', 'active')
  );
  
  const snap = await getDocs(q);
  const oppositeItems = snap.docs.map((d: any) => {
    const data = d.data();
    return {
      id: data.sourceItemId || d.id,
      sharedItemId: d.id,
      userId: data.ownerId,
      status: data.status === 'active' ? (oppositeType === 'vessel' ? 'OPEN' : 'ACTIVE') : 'ARCHIVED',
      priority: data.priority,
      notes: data.notes || data.description || '',
      openPort: data.openPort || '',
      openDate: data.openDate || '',
      loadPort: data.loadPort || '',
      laycan: data.laycan || '',
      type: data.vessel_type || '',
      category: data.category || '',
    } as any;
  });

  const candidate = detectUrgentOpportunity(newOrUpdatedItem, itemType, oppositeItems);
  if (!candidate) return;

  const dealId = `${candidate.vesselItemId}_${candidate.cargoItemId}`;
  const dealRef = doc(db, 'deskNetworkUrgentDeals', dealId);
  const existingDoc = await getDoc(dealRef);

  let status: UrgentDeal['status'] = 'urgent_alert_candidate';
  let auditTrail: AuditEvent[] = [];

  if (existingDoc.exists()) {
    const data = existingDoc.data() as UrgentDeal;
    if (data.status === 'cancelled' || data.status === 'expired') {
       // reuse existing doc but mark active again if data changed significantly
       status = 'detected';
       auditTrail = data.auditTrail || [];
       auditTrail.push({ action: 'deal_reopened', timestamp: new Date(), actorUid: 'system', safeMessage: 'Urgent deal re-opened due to updated matching info.' });
    } else {
       // already active, perhaps just update scores
       await updateDoc(dealRef, {
         urgencyScore: candidate.urgencyScore,
         matchScore: candidate.matchScore,
         updatedAt: serverTimestamp(),
       });

       // Create update alerts if score increased
       if (candidate.matchScore > (data.matchScore || 0) || candidate.urgencyScore > (data.urgencyScore || 0)) {
           import('./alertService').then(({ createAlert }) => {
               if (data.vesselOwnerUid && data.vesselOwnerUid !== 'system') {
                   createAlert({
                      recipientUid: data.vesselOwnerUid,
                      title: 'Hot Opp Updated',
                      message: `A hot opportunity you're tracking has become stronger (Match: ${candidate.matchScore}%, Hot: ${candidate.urgencyScore}%).`,
                      priority: 'medium',
                      category: 'hot_opp',
                      actionRoute: '/dashboard'
                   }).catch(console.error);
               }
               if (data.cargoOwnerUid && data.cargoOwnerUid !== 'system' && data.cargoOwnerUid !== data.vesselOwnerUid) {
                   createAlert({
                      recipientUid: data.cargoOwnerUid,
                      title: 'Hot Opp Updated',
                      message: `A hot opportunity you're tracking has become stronger (Match: ${candidate.matchScore}%, Hot: ${candidate.urgencyScore}%).`,
                      priority: 'medium',
                      category: 'hot_opp',
                      actionRoute: '/dashboard'
                   }).catch(console.error);
               }
           });
       }

       return;
    }
  } else {
    status = 'detected';
    auditTrail.push({ action: 'deal_detected', timestamp: new Date(), actorUid: 'system', safeMessage: 'Urgent deal logic detected a hot match.' });
  }

  // Create or set the deal doc
  const dealDoc: UrgentDeal = {
    ...candidate,
    dealId,
    status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    auditTrail
  };

  await setDoc(dealRef, dealDoc);
  
  // also create user-scoped notification candidates
  const createNotification = async (uid: string, type: 'urgent_vessel' | 'urgent_cargo' | 'hot_match', relatedCargoId?: string, relatedVesselId?: string) => {
      const notifRef = doc(collection(db, `users/${uid}/urgentNotifications`));
      const notif: UrgentNotification = {
          notificationId: notifRef.id,
          dealId,
          type,
          title: `Hot Opportunity: ${candidate.reason}`,
          safeMessage: 'A highly compatible urgent position was detected in the Desk Network.',
          status: 'candidate',
          relatedCargoItemId: relatedCargoId,
          relatedVesselItemId: relatedVesselId,
          matchScore: candidate.matchScore,
          urgencyScore: candidate.urgencyScore,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          expiresAt: candidate.expiresAt,
      };
      try {
        await setDoc(notifRef, notif);

        import('./alertService').then(({ createAlert }) => {
            createAlert({
               recipientUid: uid,
               title: 'New Hot Opportunity',
               message: `Hot opportunity detected: ${candidate.reason}`,
               priority: 'high',
               category: 'hot_opp',
               actionRoute: '/dashboard'
            }).catch(console.error);
        });
      } catch (err) {
        console.warn('Failed to set notification (may be cross-user restriction):', err);
      }
  };

  // Add event to audit trail
  auditTrail.push({ action: 'notification_candidate_created', timestamp: new Date(), actorUid: 'system', safeMessage: 'Candidate notifications prepared for owners.' });
  dealDoc.auditTrail = auditTrail;
  await updateDoc(dealRef, { auditTrail });

  if (candidate.vesselOwnerUid !== 'system') {
      await createNotification(candidate.vesselOwnerUid, itemType === 'cargo' ? 'urgent_cargo' : 'hot_match', candidate.cargoItemId, candidate.vesselItemId);
  }
  if (candidate.cargoOwnerUid !== 'system' && candidate.cargoOwnerUid !== candidate.vesselOwnerUid) {
      await createNotification(candidate.cargoOwnerUid, itemType === 'vessel' ? 'urgent_vessel' : 'hot_match', candidate.cargoItemId, candidate.vesselItemId);
  }
}

