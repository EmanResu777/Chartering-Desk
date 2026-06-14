import { collection, doc, setDoc, getDocs, getDoc, updateDoc, query, where, orderBy, serverTimestamp, arrayUnion, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface Counterparty {
  id: string;
  createdByUid: string;
  createdByDeskId: string;
  visibility: 'private' | 'my_desk';
  status: 'active' | 'watching' | 'inactive' | 'blocked';
  type: 'Broker' | 'Charterer' | 'Owner' | 'Operator' | 'Trader' | 'Manager' | 'Agent' | 'Other';
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  messengers?: string; // WhatsApp/Telegram
  website?: string;
  country?: string;
  region?: string;
  tradingArea?: string;
  preferredCargo?: string;
  preferredTonnage?: string;
  tags: string[];
  reliability?: 'strong' | 'normal' | 'caution' | 'unknown';
  responseStatus?: 'responsive' | 'slow' | 'unknown' | 'no response';
  linkedItemIds: string[]; // generic array of IDs
  createdAt: any;
  updatedAt: any;
  auditTrail: { action: string, timestamp: string }[];
  lastInteractionDate?: string;
  lastActionType?: string;
}

export interface CounterpartyNote {
  id: string;
  counterpartyId: string;
  createdByUid: string;
  createdByDeskId: string;
  visibility: 'private' | 'my_desk';
  noteType: 'call' | 'email' | 'messenger' | 'meeting' | 'offer' | 'recap' | 'general';
  text: string;
  linkedItemId?: string;
  linkedItemType?: string;
  createdAt: any;
  updatedAt: any;
}

export const crmService = {
  subscribeCounterparties: (uid: string, deskId: string | null, callback: (counterparties: Counterparty[]) => void) => {
    // Only fetch those user can read (owns, or my_desk + same desk)
    // Because Firestore can't do an OR query efficiently on fields without composite index easily unless we use IN,
    // we fetch user's documents and desk documents if applicable.
    
    // Simplification for prototype without complex indexes:
    // Just fetch `createdByUid == uid`. If deskId is set, fetch `visibility == 'my_desk' && createdByDeskId == deskId`.
    const qUser = query(collection(db, 'counterparties'), where('createdByUid', '==', uid));
    
    return onSnapshot(qUser, (snap) => {
      const cps: Counterparty[] = [];
      snap.forEach(d => cps.push({ id: d.id, ...d.data() } as Counterparty));
      
      // If we have deskId, fetch desk cps
      if (deskId) {
        const qDesk = query(collection(db, 'counterparties'), where('visibility', '==', 'my_desk'), where('createdByDeskId', '==', deskId));
        getDocs(qDesk).then(deskSnap => {
          deskSnap.forEach(d => {
            if (d.data().createdByUid !== uid) {
              cps.push({ id: d.id, ...d.data() } as Counterparty);
            }
          });
          callback(cps);
        });
      } else {
        callback(cps);
      }
    });
  },

  createCounterparty: async (data: any, uid: string, deskId: string) => {
    const id = doc(collection(db, 'counterparties')).id;
    const now = new Date().toISOString();
    const docData = {
      id,
      createdByUid: uid,
      createdByDeskId: deskId || '',
      visibility: data.visibility || 'private',
      status: data.status || 'active',
      type: data.type || 'Other',
      name: data.name,
      company: data.company || '',
      email: data.email || '',
      phone: data.phone || '',
      messengers: data.messengers || '',
      website: data.website || '',
      country: data.country || '',
      region: data.region || '',
      tradingArea: data.tradingArea || '',
      preferredCargo: data.preferredCargo || '',
      preferredTonnage: data.preferredTonnage || '',
      tags: data.tags || [],
      reliability: data.reliability || 'unknown',
      responseStatus: data.responseStatus || 'unknown',
      linkedItemIds: data.linkedItemIds || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastInteractionDate: now,
      lastActionType: 'counterparty created',
      auditTrail: [{ action: 'counterparty created', timestamp: now }]
    };
    await setDoc(doc(db, 'counterparties', id), docData);
    return id;
  },

  updateCounterparty: async (id: string, updates: any) => {
    const now = new Date().toISOString();
    updates.updatedAt = serverTimestamp();
    updates.auditTrail = arrayUnion({ action: 'counterparty updated', timestamp: now });
    
    // Check if status/reliability is updated for alerts
    const cpRef = doc(db, 'counterparties', id);
    const snap = await getDoc(cpRef);
    if (snap.exists()) {
        const cpData = snap.data();
        if (cpData.visibility === 'my_desk' && cpData.createdByDeskId) {
            import('./alertService').then(async ({ createAlert }) => {
                const alertPromises = [];
                const membersSnap = await getDocs(query(collection(db, 'users'), where('deskId', '==', cpData.createdByDeskId)));
                if (updates.status && updates.status !== cpData.status && ['watching', 'inactive', 'blocked'].includes(updates.status)) {
                    membersSnap.forEach(d => {
                        if (d.id !== cpData.createdByUid && d.id !== updates?.lastUpdatedBy) {
                            alertPromises.push(createAlert({
                                recipientUid: d.id,
                                title: 'Counterparty Status Changed',
                                message: `Counterparty "${cpData.name}" status changed to ${updates.status}.`,
                                priority: updates.status === 'blocked' ? 'critical' : 'high',
                                category: 'counterparty_crm',
                                actionRoute: '/dashboard'
                            }));
                        }
                    });
                }
                if (updates.reliability && updates.reliability !== cpData.reliability && ['caution', 'unknown'].includes(updates.reliability)) {
                    membersSnap.forEach(d => {
                         if (d.id !== cpData.createdByUid && d.id !== updates?.lastUpdatedBy) {
                            alertPromises.push(createAlert({
                                recipientUid: d.id,
                                title: 'Counterparty Reliability Changed',
                                message: `Counterparty "${cpData.name}" reliability changed to ${updates.reliability}.`,
                                priority: 'high',
                                category: 'counterparty_crm',
                                actionRoute: '/dashboard'
                            }));
                         }
                    });
                }
                await Promise.all(alertPromises).catch(console.error);
            });
        }
    }
    await updateDoc(cpRef, updates);
  },
  
  unlinkItem: async (id: string, itemId: string) => {
    const now = new Date().toISOString();
    const cpRef = doc(db, 'counterparties', id);
    const snap = await getDoc(cpRef);
    if (snap.exists()) {
       const links = snap.data().linkedItemIds || [];
       await updateDoc(cpRef, {
          linkedItemIds: links.filter((x: string) => x !== itemId),
          auditTrail: arrayUnion({ action: `unlinked item: ${itemId}`, timestamp: now })
       });
    }
  },

  linkItem: async (id: string, itemId: string) => {
    const now = new Date().toISOString();
    const cpRef = doc(db, 'counterparties', id);
    await updateDoc(cpRef, {
      linkedItemIds: arrayUnion(itemId),
      auditTrail: arrayUnion({ action: `linked item: ${itemId}`, timestamp: now })
    });
    
    // Alert logic for linking counterparty to deal
    const snap = await getDoc(cpRef);
    if (snap.exists()) {
        const cpData = snap.data();
        if (cpData.visibility === 'my_desk' && cpData.createdByDeskId) {
            getDocs(query(collection(db, 'users'), where('deskId', '==', cpData.createdByDeskId))).then((usersSnap) => {
                import('./alertService').then(({ createAlert }) => {
                    usersSnap.forEach(d => {
                        if (d.id !== cpData.createdByUid) {
                            createAlert({
                                recipientUid: d.id,
                                title: 'Counterparty Linked',
                                message: `Counterparty "${cpData.name}" was linked to a new deal or item.`,
                                priority: 'info',
                                category: 'counterparty_crm',
                                actionRoute: '/dashboard'
                            }).catch(console.error);
                        }
                    });
                });
            });
        }
    }
  },
  
  archiveOrBlock: async (id: string, status: 'inactive' | 'blocked') => {
    const now = new Date().toISOString();
    const cpRef = doc(db, 'counterparties', id);
    
    const snap = await getDoc(cpRef);
    if (snap.exists()) {
        const cpData = snap.data();
        if (cpData.visibility === 'my_desk' && cpData.createdByDeskId) {
            getDocs(query(collection(db, 'users'), where('deskId', '==', cpData.createdByDeskId))).then((usersSnap) => {
                import('./alertService').then(({ createAlert }) => {
                    usersSnap.forEach(d => {
                        if (d.id !== cpData.createdByUid) {
                            createAlert({
                                recipientUid: d.id,
                                title: 'Counterparty Status Changed',
                                message: `Counterparty "${cpData.name}" was set to ${status}.`,
                                priority: status === 'blocked' ? 'critical' : 'high',
                                category: 'counterparty_crm',
                                actionRoute: '/dashboard'
                            }).catch(console.error);
                        }
                    });
                });
            });
        }
    }
    
    await updateDoc(cpRef, {
      status,
      updatedAt: serverTimestamp(),
      auditTrail: arrayUnion({ action: `counterparty ${status}`, timestamp: now })
    });
  },

  // Notes
  subscribeNotes: (counterpartyId: string, callback: (notes: CounterpartyNote[]) => void) => {
    const q = query(collection(db, 'counterpartyNotes'), where('counterpartyId', '==', counterpartyId), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const notes: CounterpartyNote[] = [];
      snap.forEach(d => notes.push({ id: d.id, ...d.data() } as CounterpartyNote));
      callback(notes);
    });
  },

  addNote: async (counterpartyId: string, data: any, uid: string, deskId: string) => {
    const id = doc(collection(db, 'counterpartyNotes')).id;
    const now = new Date().toISOString();
    await setDoc(doc(db, 'counterpartyNotes', id), {
      id,
      counterpartyId,
      createdByUid: uid,
      createdByDeskId: deskId || '',
      visibility: data.visibility || 'private',
      noteType: data.noteType || 'general',
      text: data.text || '',
      linkedItemId: data.linkedItemId || null,
      linkedItemType: data.linkedItemType || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Update last interaction
    const cpRef = doc(db, 'counterparties', counterpartyId);
    await updateDoc(cpRef, {
      lastInteractionDate: now,
      lastActionType: `note added: ${data.noteType}`,
      auditTrail: arrayUnion({ action: 'note added', timestamp: now })
    });
    
    if (data.visibility === 'my_desk' && deskId) {
        getDoc(cpRef).then(snap => {
            if (snap.exists()) {
                const cpData = snap.data();
                getDocs(query(collection(db, 'users'), where('deskId', '==', deskId))).then((usersSnap) => {
                    import('./alertService').then(({ createAlert }) => {
                        usersSnap.forEach(d => {
                            if (d.id !== uid) { // Exclude the note creator
                                createAlert({
                                    recipientUid: d.id,
                                    title: 'Counterparty Note Added',
                                    message: `A new shared note was added for counterparty "${cpData.name}".`,
                                    priority: 'medium',
                                    category: 'counterparty_crm',
                                    actionRoute: '/dashboard'
                                }).catch(console.error);
                            }
                        });
                    });
                });
            }
        });
    }
    return id;
  },
  
  deleteNote: async (noteId: string) => {
    await deleteDoc(doc(db, 'counterpartyNotes', noteId));
  }
};
