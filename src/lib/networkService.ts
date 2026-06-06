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

  return sharedItemId;
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
