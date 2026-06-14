import { collection, query, where, getDocs, doc, setDoc, updateDoc, serverTimestamp, arrayUnion, onSnapshot, getDoc, orderBy } from 'firebase/firestore';
import { db } from './firebase';

export type DealRoomStatus = 'draft' | 'active' | 'negotiating' | 'recap_draft' | 'awaiting_confirmation' | 'confirmed_internal' | 'closed' | 'archived';

export interface DealRoom {
  id: string; // same as doc id
  title: string;
  status: DealRoomStatus;
  createdByUid: string;
  createdByDeskId?: string;
  participantUids: string[];
  participantDeskIds?: string[];
  visibility: 'private' | 'my_desk';

  linkedCargoId?: string;
  linkedVesselId?: string;
  linkedMarketRequestId?: string;
  linkedSmartRadarMatchId?: string;
  linkedHotOppId?: string;
  linkedOfferId?: string;
  geography?: {
     cargoLoadLocation?: import('./locationIntelligence').GeoLocation;
     cargoDischargeLocation?: import('./locationIntelligence').GeoLocation;
     vesselOpeningLocation?: import('./locationIntelligence').GeoLocation;
  };
  linkedRecapId?: string;
  linkedCounterpartyIds: string[];
  linkedDealBriefId?: string;
  
  source?: string;

  createdAt: any;
  updatedAt: any;
  audit: any[];
}

export interface DealRoomNote {
  id: string;
  dealRoomId: string;
  createdByUid: string;
  createdByDeskId?: string;
  visibility: 'private' | 'my_desk' | 'participants';
  noteType: 'general' | 'call' | 'email' | 'whatsapp' | 'negotiation' | 'recap' | 'risk' | 'follow_up';
  text: string;
  createdAt: any;
  updatedAt: any;
}

export const createDealRoom = async (data: Partial<DealRoom>) => {
  const ref = doc(collection(db, 'dealRooms'));
  const now = new Date();
  
  let actorUid = data.createdByUid || '';
  let deskId = data.createdByDeskId || '';
  
  if (actorUid && !deskId) {
    try {
      const uDoc = await getDoc(doc(db, 'users', actorUid));
      if (uDoc.exists()) deskId = uDoc.data().deskId || '';
    } catch(e) {}
  }
  
  const dealRoom: any = {
    id: ref.id,
    title: data.title || 'New Deal Room',
    status: data.status || 'draft',
    createdByUid: actorUid,
    createdByDeskId: deskId,
    participantUids: data.participantUids || [actorUid],
    participantDeskIds: data.participantDeskIds || (deskId ? [deskId] : []),
    visibility: data.visibility || 'private',
    linkedCargoId: data.linkedCargoId || null,
    linkedVesselId: data.linkedVesselId || null,
    linkedMarketRequestId: data.linkedMarketRequestId || null,
    linkedSmartRadarMatchId: data.linkedSmartRadarMatchId || null,
    linkedHotOppId: data.linkedHotOppId || null,
    linkedOfferId: data.linkedOfferId || null,
    linkedRecapId: data.linkedRecapId || null,
    linkedCounterpartyIds: data.linkedCounterpartyIds || [],
    linkedDealBriefId: data.linkedDealBriefId || null,
    source: data.source || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    audit: [{ action: 'deal room created', timestamp: now, actorUid }]
  };

  Object.keys(dealRoom).forEach(k => dealRoom[k] === null && delete dealRoom[k]);

  await setDoc(ref, dealRoom);

  // Trigger Deal Room Created and Source-specific alerts
  import('./alertService').then(async ({ createAlert }) => {
    // Notify creator
    await createAlert({
      recipientUid: actorUid,
      title: 'Deal Room Created',
      message: `You created deal room "${dealRoom.title}".`,
      priority: 'info',
      category: 'deal_room_update',
      actionRoute: '/deal-rooms'
    }).catch(console.error);

    // Notify logic for Market Request owner if applicable
    if (dealRoom.linkedMarketRequestId) {
        try {
            const reqDoc = await getDoc(doc(db, 'marketRequests', dealRoom.linkedMarketRequestId));
            if (reqDoc.exists() && reqDoc.data().createdByUid !== actorUid) {
                await createAlert({
                    recipientUid: reqDoc.data().createdByUid,
                    title: 'Process Offer Started',
                    message: `A deal room was opened for your market request.`,
                    priority: 'high',
                    category: 'process_offer',
                    actionRoute: '/deal-rooms'
                });
            }
        } catch (e) { console.error(e); }
    }

    // Notify logic for Hot Opp owner if applicable
     if (dealRoom.linkedHotOppId) {
        try {
            const reqDoc = await getDoc(doc(db, 'hotOpps', dealRoom.linkedHotOppId));
            if (reqDoc.exists() && reqDoc.data().createdByUid !== actorUid) {
                await createAlert({
                    recipientUid: reqDoc.data().createdByUid,
                    title: 'Hot Opp Action',
                    message: `A deal room was opened for your hot opportunity.`,
                    priority: 'high',
                    category: 'hot_opp',
                    actionRoute: '/deal-rooms'
                });
            }
        } catch (e) { console.error(e); }
    }
  });

  return dealRoom;
};

export const updateDealRoom = async (dealRoomId: string, updates: Partial<DealRoom>, actorUid: string, actionName: string) => {
  const ref = doc(db, 'dealRooms', dealRoomId);
  const existingDoc = await getDoc(ref);
  const data = existingDoc.data() as DealRoom;

  await updateDoc(ref, {
    ...updates,
    updatedAt: serverTimestamp(),
    audit: arrayUnion({ action: actionName, timestamp: new Date(), actorUid })
  });

  if (updates.status && updates.status !== data?.status) {
      import('./alertService').then(({ createAlert }) => {
          createAlert({
              recipientUid: actorUid,
              title: `Deal Room Status Updated`,
              message: `Deal room "${data?.title || dealRoomId}" state changed to ${updates.status}.`,
              priority: (updates.status === 'recap_draft' || updates.status === 'confirmed_internal') ? 'high' : 'info',
              category: 'deal_room_update',
              actionRoute: `/deal-rooms`
          }).catch(console.error);
          
          if (data?.participantUids) {
              data.participantUids.forEach(pUid => {
                  if (pUid !== actorUid) {
                      createAlert({
                          recipientUid: pUid,
                          title: `Deal Room Update`,
                          message: `Deal room "${data?.title || dealRoomId}" state changed to ${updates.status}.`,
                          priority: (updates.status === 'recap_draft' || updates.status === 'confirmed_internal') ? 'high' : 'info',
                          category: 'deal_room_update',
                          actionRoute: `/deal-rooms`
                      }).catch(console.error);
                  }
              });
          }
      }).catch(console.error);
  }
};

export const addDealRoomNote = async (dealRoomId: string, data: Partial<DealRoomNote>, actorUid: string) => {
  const ref = doc(collection(db, 'dealRoomNotes'));
  let deskId = data.createdByDeskId || '';
  if (actorUid && !deskId) {
    try {
      const uDoc = await getDoc(doc(db, 'users', actorUid));
      if (uDoc.exists()) deskId = uDoc.data().deskId || '';
    } catch(e) {}
  }

  const note: any = {
    id: ref.id,
    dealRoomId,
    createdByUid: actorUid,
    createdByDeskId: deskId || null,
    visibility: data.visibility || 'private',
    noteType: data.noteType || 'general',
    text: data.text || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  
  Object.keys(note).forEach(k => note[k] === null && delete note[k]);

  await setDoc(ref, note);
  
  // Create audit event
  const drRef = doc(db, 'dealRooms', dealRoomId);
  const drDoc = await getDoc(drRef);
  await updateDoc(drRef, {
    audit: arrayUnion({ action: `note added: ${note.noteType}`, timestamp: new Date(), actorUid })
  });

  if (drDoc.exists() && data.visibility === 'participants') {
      const drData = drDoc.data() as DealRoom;
      if (drData.participantUids) {
          import('./alertService').then(({ createAlert }) => {
              drData.participantUids.forEach(pUid => {
                  if (pUid !== actorUid) {
                      createAlert({
                          recipientUid: pUid,
                          title: 'Deal Note Added',
                          message: `A new shared note was added to deal room "${drData.title || drData.id}".`,
                          priority: 'medium',
                          category: 'deal_room_note',
                          actionRoute: '/deal-rooms'
                      }).catch(console.error);
                  }
              });
          }).catch(console.error);
      }
  }
};

export const addDealRoomAudit = async (dealRoomId: string, actionName: string, actorUid: string) => {
  const ref = doc(db, 'dealRooms', dealRoomId);
  await updateDoc(ref, {
    audit: arrayUnion({ action: actionName, timestamp: new Date(), actorUid })
  });
};
