import { collection, doc, setDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import { Cargo, Vessel } from './utils';

export async function shareItem(type: 'cargo' | 'vessel', originalItem: any) {
  if (!auth.currentUser) throw new Error("Not authenticated");
  
  const ownerId = auth.currentUser.uid;
  const sharedItemId = `SHARED-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  let sanitizedItem: any = {};

  if (type === 'cargo') {
    sanitizedItem = {
      itemType: 'cargo',
      ownerId,
      ownerDisplayName: auth.currentUser.displayName || auth.currentUser.email || 'Unknown User',
      sourceItemId: originalItem.id,
      commodity: originalItem.commodity || '',
      quantity: originalItem.quantity || '',
      loadPort: originalItem.loadPort || '',
      dischargePort: originalItem.dischargePort || '',
      laycan: originalItem.laycan || '',
      terms: originalItem.terms || '',
      status: 'active',
      createdAt: serverTimestamp(),
      sharedAt: serverTimestamp()
    };
  } else if (type === 'vessel') {
    sanitizedItem = {
      itemType: 'vessel',
      ownerId,
      ownerDisplayName: auth.currentUser.displayName || auth.currentUser.email || 'Unknown User',
      sourceItemId: originalItem.id,
      vessel_name: originalItem.name || '',
      name: originalItem.name || '',
      vessel_type: originalItem.type || '',
      dwt: originalItem.dwt || 0,
      openPort: originalItem.openPort || '',
      openDate: originalItem.openDate || '',
      status: 'active',
      createdAt: serverTimestamp(),
      sharedAt: serverTimestamp()
    };
  }

  // Create shared item
  await setDoc(doc(db, 'sharedItems', sharedItemId), sanitizedItem);

  // Update original item
  const collectionName = type === 'cargo' ? 'cargos' : 'vessels';
  await updateDoc(doc(db, collectionName, originalItem.id), {
    visibility: 'desk_network',
    sharedItemId
  });

  // Evaluate for urgent opportunities (non-blocking)
  import('./urgentDeals').then(({ evaluateAndPersistUrgentDeal }) => {
    evaluateAndPersistUrgentDeal({ id: sharedItemId, ...sanitizedItem }, type)
      .catch(err => console.warn('Failed to evaluate urgent deal:', err));
  }).catch(() => {});

  return sharedItemId;
}

export async function updateSharedItem(type: 'cargo' | 'vessel', sharedItemId: string, updates: any) {
  if (!auth.currentUser) throw new Error("Not authenticated");
  
  let sanitizedUpdates: any = {
    updatedAt: serverTimestamp(),
    lastPublishedUpdateAt: serverTimestamp(),
  };

  const urgentFields = ['isUrgent', 'urgentReason', 'urgentUntil', 'urgentType', 'urgentNote', 'urgentMarkedBy', 'urgentMarkedAt', 'urgentStatus'];
  urgentFields.forEach(field => {
    if (updates[field] !== undefined) {
      sanitizedUpdates[field] = updates[field];
    }
  });

  if (type === 'cargo') {
    if (updates.commodity !== undefined) sanitizedUpdates.commodity = updates.commodity;
    if (updates.quantity !== undefined) sanitizedUpdates.quantity = updates.quantity;
    if (updates.loadPort !== undefined) sanitizedUpdates.loadPort = updates.loadPort;
    if (updates.dischargePort !== undefined) sanitizedUpdates.dischargePort = updates.dischargePort;
    if (updates.laycan !== undefined) sanitizedUpdates.laycan = updates.laycan;
    if (updates.terms !== undefined) sanitizedUpdates.terms = updates.terms;
    if (updates.status !== undefined) sanitizedUpdates.status = updates.status;
    if (updates.freightIdea !== undefined) sanitizedUpdates.freightIdea = updates.freightIdea;
    if (updates.rate !== undefined) sanitizedUpdates.rate = updates.rate;
    if (updates.commission !== undefined) sanitizedUpdates.commission = updates.commission;
    if (updates.addcom !== undefined) sanitizedUpdates.addcom = updates.addcom;
    if (updates.description !== undefined) sanitizedUpdates.description = updates.description;
  } else if (type === 'vessel') {
    if (updates.name !== undefined) {
      sanitizedUpdates.vessel_name = updates.name;
      sanitizedUpdates.name = updates.name;
    }
    if (updates.type !== undefined) sanitizedUpdates.vessel_type = updates.type;
    if (updates.dwt !== undefined) sanitizedUpdates.dwt = updates.dwt;
    if (updates.openPort !== undefined) sanitizedUpdates.openPort = updates.openPort;
    if (updates.openDate !== undefined) sanitizedUpdates.openDate = updates.openDate;
    if (updates.status !== undefined) sanitizedUpdates.status = updates.status;
    if (updates.notes !== undefined) sanitizedUpdates.notes = updates.notes;
  }

  await updateDoc(doc(db, 'sharedItems', sharedItemId), sanitizedUpdates);

  // Evaluate for urgent opportunities (non-blocking)
  import('./urgentDeals').then(({ evaluateAndPersistUrgentDeal }) => {
    evaluateAndPersistUrgentDeal({ id: sharedItemId, ...sanitizedUpdates, status: 'active', ownerId: auth.currentUser?.uid }, type)
      .catch(err => console.warn('Failed to evaluate urgent deal:', err));
  }).catch(() => {});
}

export async function unshareItem(type: 'cargo' | 'vessel', originalItem: any) {
  if (!auth.currentUser) throw new Error("Not authenticated");
  
  if (originalItem.sharedItemId) {
    await updateDoc(doc(db, 'sharedItems', originalItem.sharedItemId), {
      status: 'revoked'
    });
  }

  const collectionName = type === 'cargo' ? 'cargos' : 'vessels';
  await updateDoc(doc(db, collectionName, originalItem.id), {
    visibility: 'private',
    sharedItemId: null
  });
}
