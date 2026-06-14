import { db, auth } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';

export interface NegotiationSuggestion {
  id: string;
  createdByUid: string;
  createdByDeskId?: string;
  visibility: 'private' | 'my_desk' | 'participants';
  participantUids?: string[];
  dealRoomId?: string;
  sourceType: string;
  sourceId: string;
  outputType: string;
  tone: string;
  sanitizedInputSummary?: any;
  
  suggestedMessage: string;
  commercialReasoning: string;
  negotiationStrategy: string;
  keyRisks: string[];
  missingInformation: string[];
  recommendedNextStep: string;
  recapReadiness: 'not ready' | 'almost ready' | 'ready for recap' | 'ready for broker-side confirmation';
  disclaimer: string;
  
  status: 'draft' | 'saved' | 'used' | 'discarded';
  createdAt: any;
  updatedAt: any;
  auditTrail: any[];
}

export async function generateNegotiationSuggestion(payload: any): Promise<any> {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Not authenticated");
    
    payload.outputType = payload.outputType || 'Generate broker-style reply';
    payload.tone = payload.tone || 'professional';

    const res = await fetch('/api/ai/negotiateCopilot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || err.safeMessage || 'Failed to generate negotiation suggestion');
    }

    return await res.json();
}

export async function saveNegotiationSuggestion(data: Partial<NegotiationSuggestion>): Promise<string> {
  const isNew = !data.id;
  const ref = isNew ? doc(collection(db, 'negotiationSuggestions')) : doc(db, 'negotiationSuggestions', data.id!);
  
  const now = Timestamp.now();
  const payload = {
    ...data,
    updatedAt: now,
  } as any;

  if (isNew) {
    payload.id = ref.id;
    payload.createdAt = now;
    payload.auditTrail = [{
      action: 'created',
      timestamp: now,
      uid: data.createdByUid
    }];
  } else {
    payload.auditTrail = [
      ...(data.auditTrail || []),
      {
        action: 'updated',
        timestamp: now,
        uid: data.createdByUid
      }
    ];
  }

  await setDoc(ref, payload, { merge: true });
  return ref.id;
}

export async function getNegotiationSuggestions(dealRoomId: string): Promise<NegotiationSuggestion[]> {
  const q = query(
    collection(db, 'negotiationSuggestions'),
    where('dealRoomId', '==', dealRoomId)
  );
  const snap = await getDocs(q);
  const docs = snap.docs.map(d => ({ ...d.data(), id: d.id } as NegotiationSuggestion));
  docs.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
  return docs;
}
