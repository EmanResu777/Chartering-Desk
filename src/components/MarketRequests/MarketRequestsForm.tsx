import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, AlertCircle } from 'lucide-react';
import { MarketRequestType, MarketRequestVisibility } from '../../lib/utils';
import { useAuth, db } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where } from 'firebase/firestore';

interface MarketRequestsFormProps {
  type: MarketRequestType;
  onClose: () => void;
}

export const MarketRequestsForm: React.FC<MarketRequestsFormProps> = ({ type, onClose }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  React.useEffect(() => {
    if (!user) return;
    import('firebase/firestore').then(({ getDoc, doc }) => {
      getDoc(doc(db, 'users', user.uid)).then(snap => {
         if (snap.exists()) setProfile(snap.data());
      });
    });
  }, [user]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    vesselType: '',
    cargoType: '',
    quantityMin: '',
    quantityMax: '',
    dwtMin: '',
    dwtMax: '',
    loadArea: '',
    dischargeArea: '',
    dateFrom: '',
    dateTo: '',
    charterType: 'voyage',
    vesselName: '',
    yearBuilt: '',
    remarks: '',
    urgency: 'normal',
    visibility: 'network' as MarketRequestVisibility
  });

  const generateDeterministicMatches = async (requestId: string, reqData: any) => {
    if (!user) return;

    const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
    const contains = (value: unknown, wanted: unknown) => {
      const needle = normalize(wanted);
      return !needle || normalize(value).includes(needle);
    };
    const firstNumber = (value: unknown): number | null => {
      const match = String(value || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
      if (!match) return null;
      const parsed = Number(match[0]);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const parseDate = (value: unknown): number | null => {
      const text = String(value || '').trim();
      if (!text || ['TBD', 'TBA', 'UNKNOWN'].includes(text.toUpperCase())) return null;
      const parsed = new Date(text).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    };
    const dateFit = (reqStart: unknown, reqEnd: unknown, candidateDate: unknown) => {
      const candidate = parseDate(candidateDate);
      if (candidate == null) return 0;
      const start = parseDate(reqStart);
      const end = parseDate(reqEnd);
      if (start == null && end == null) return 0;
      if (start != null && candidate < start) return 0;
      if (end != null && candidate > end) return 0;
      return 20;
    };

    try {
      const connectionsSnap = await getDocs(collection(db, `users/${user.uid}/networkConnections`));
      const connectedOwnerIds = connectionsSnap.docs.map(d => d.id).filter(Boolean);

      const sharedItems: any[] = [];
      for (const ownerId of connectedOwnerIds) {
        const sharedQuery = query(
          collection(db, 'sharedItems'),
          where('ownerId', '==', ownerId),
          where('status', '==', 'active')
        );
        const sharedSnap = await getDocs(sharedQuery);
        sharedSnap.forEach(d => sharedItems.push({ id: d.id, ...d.data() }));
      }

      const matches: any[] = [];
      for (const item of sharedItems) {
        let score = 0;
        const reasons: string[] = [];
        let relevant = false;

        if (reqData.type === 'cargo_search' && item.itemType === 'cargo') {
          relevant = true;
          if (reqData.cargoType) {
            if (!contains(item.commodity, reqData.cargoType)) continue;
            score += 25;
            reasons.push(`commodity: ${item.commodity}`);
          }
          if (reqData.loadArea) {
            if (!contains(item.loadPort, reqData.loadArea)) continue;
            score += 20;
            reasons.push(`load: ${item.loadPort}`);
          }
          if (reqData.dischargeArea) {
            if (!contains(item.dischargePort, reqData.dischargeArea)) continue;
            score += 15;
            reasons.push(`discharge: ${item.dischargePort}`);
          }
          const qty = firstNumber(item.quantity);
          if (qty != null && (reqData.quantityMin || reqData.quantityMax)) {
            const min = Number(reqData.quantityMin || 0);
            const max = Number(reqData.quantityMax || Infinity);
            if (qty < min || qty > max) continue;
            score += 20;
            reasons.push(`quantity: ${item.quantity}`);
          }
          const laycanScore = dateFit(reqData.dateFrom, reqData.dateTo, item.laycan);
          if (laycanScore) {
            score += laycanScore;
            reasons.push(`date candidate: ${item.laycan}`);
          }
        } else if (reqData.type === 'tonnage_search' && item.itemType === 'vessel') {
          relevant = true;
          if (reqData.vesselType) {
            if (!contains(item.vessel_type || item.type, reqData.vesselType)) continue;
            score += 30;
            reasons.push(`vessel type: ${item.vessel_type || item.type}`);
          }
          if (reqData.loadArea) {
            if (!contains(item.openPort, reqData.loadArea)) continue;
            score += 30;
            reasons.push(`open area: ${item.openPort}`);
          }
          const openDateScore = dateFit(reqData.dateFrom, reqData.dateTo, item.openDate);
          if (openDateScore) {
            score += openDateScore;
            reasons.push(`open date candidate: ${item.openDate}`);
          }
        } else if (reqData.type === 'available_vessel' && item.itemType === 'cargo') {
          relevant = true;
          if (reqData.loadArea) {
            if (!contains(item.loadPort, reqData.loadArea)) continue;
            score += 35;
            reasons.push(`load area: ${item.loadPort}`);
          }
          const vesselDwt = Number(reqData.dwtMin || 0);
          const cargoQty = firstNumber(item.quantity);
          if (vesselDwt > 0 && cargoQty != null) {
            if (cargoQty > vesselDwt) continue;
            score += 15;
            reasons.push('quantity is below declared DWT; intake/stowage still requires manual check');
          }
          const laycanScore = dateFit(reqData.dateFrom, reqData.dateTo, item.laycan);
          if (laycanScore) {
            score += laycanScore;
            reasons.push(`laycan candidate: ${item.laycan}`);
          }
        }

        if (!relevant || score < 40) continue;

        const matchId = `MATCH-${crypto.randomUUID()}`;
        const userIsVesselSide = reqData.type === 'cargo_search' || reqData.type === 'available_vessel';
        matches.push({
          id: matchId,
          requestId,
          sharedItemId: item.id,
          requestType: reqData.type,
          vesselOwnerUid: userIsVesselSide ? user.uid : item.ownerId,
          cargoOwnerUid: userIsVesselSide ? item.ownerId : user.uid,
          matchScore: Math.min(score, 100),
          scoreType: 'deterministic_criteria_fit_not_probability',
          label: 'screening candidate',
          reasons,
          status: 'active',
          createdAt: new Date().toISOString(),
          audit: [{ action: 'deterministic criteria screen', timestamp: new Date().toISOString(), actor: user.uid }]
        });
      }

      const token = await user.getIdToken();
      for (const match of matches) {
        await setDoc(doc(db, 'marketMatches', match.id), match);
        try {
          const response = await fetch('/api/market/matches/notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ matchId: match.id })
          });
          if (!response.ok) {
            console.warn(`Market match notification rejected: HTTP ${response.status}`);
          }
        } catch (notifyError) {
          console.warn('Market match notification failed:', notifyError);
        }
      }
    } catch (err) {
      console.warn("Failed to generate market request screening matches:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      const id = `REQ-${crypto.randomUUID()}`;
      const requestRef = doc(db, 'marketRequests', id);
      
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30); // 30 days default expiry

      const data = {
        id,
        type,
        vesselType: formData.vesselType,
        cargoType: formData.cargoType,
        quantityMin: formData.quantityMin ? Number(formData.quantityMin) : null,
        quantityMax: formData.quantityMax ? Number(formData.quantityMax) : null,
        dwtMin: formData.dwtMin ? Number(formData.dwtMin) : null,
        dwtMax: formData.dwtMax ? Number(formData.dwtMax) : null,
        loadArea: formData.loadArea,
        dischargeArea: formData.dischargeArea,
        dateFrom: formData.dateFrom,
        dateTo: formData.dateTo,
        charterType: formData.charterType,
        vesselName: formData.vesselName,
        yearBuilt: formData.yearBuilt ? Number(formData.yearBuilt) : null,
        remarks: formData.remarks,
        urgency: formData.urgency,
        visibility: formData.visibility,
        status: 'active',
        expiryAt: expiry.toISOString(),
        createdByUid: user.uid,
        createdByDeskId: profile?.deskId || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        audit: [{ action: `${type} created`, timestamp: new Date().toISOString(), actor: user.uid }]
      };

      await setDoc(requestRef, data);

      if (data.visibility === 'network') {
        await generateDeterministicMatches(id, data);
      }

      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error saving request');
    } finally {
      setLoading(false);
    }
  };

  const titleMap = {
    'cargo_search': 'Create Cargo Search Request',
    'tonnage_search': 'Create Tonnage Search Request',
    'available_vessel': 'Add Open Tonnage / Available Vessel'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-lg bg-surface border border-outline/30 shadow-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline/20 bg-surface-container-low">
          <h3 className="font-display font-medium text-on-surface">{titleMap[type]}</h3>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:bg-surface-container rounded-sm transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto" style={{ flex: 1 }}>
          {error && (
            <div className="mb-4 p-3 bg-error/10 border border-error/20 flex gap-2 items-start">
              <AlertCircle className="w-5 h-5 text-error shrink-0" />
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          <form id="marketRequestForm" onSubmit={handleSubmit} className="space-y-4">
            {(type === 'tonnage_search' || type === 'available_vessel') && (
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Vessel Type</label>
                <input 
                  type="text" 
                  value={formData.vesselType}
                  onChange={e => setFormData({...formData, vesselType: e.target.value})}
                  placeholder="e.g. Handysize, Ultramax" 
                  className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow"
                  required
                />
              </div>
            )}
            
            {type === 'available_vessel' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Vessel Name (Optional)</label>
                  <input 
                    type="text" 
                    value={formData.vesselName}
                    onChange={e => setFormData({...formData, vesselName: e.target.value})}
                    placeholder="Private by default" 
                    className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">DWT</label>
                  <input 
                    type="number" 
                    value={formData.dwtMin}
                    onChange={e => setFormData({...formData, dwtMin: e.target.value})}
                    placeholder="e.g. 35000" 
                    className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    required
                  />
                </div>
              </div>
            )}

            {(type === 'cargo_search' || type === 'tonnage_search') && (
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Cargo / Commodity</label>
                <input 
                  type="text" 
                  value={formData.cargoType}
                  onChange={e => setFormData({...formData, cargoType: e.target.value})}
                  placeholder="e.g. Grain, Steel, General" 
                  className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  required={type === 'cargo_search'}
                />
              </div>
            )}

            {type === 'cargo_search' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Min Quantity (MT)</label>
                  <input 
                    type="number" 
                    value={formData.quantityMin}
                    onChange={e => setFormData({...formData, quantityMin: e.target.value})}
                    className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Max Quantity (MT)</label>
                  <input 
                    type="number" 
                    value={formData.quantityMax}
                    onChange={e => setFormData({...formData, quantityMax: e.target.value})}
                    className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">{type === 'available_vessel' ? 'Open Area / Port' : 'Load Area / Port'}</label>
                <input 
                  type="text" 
                  value={formData.loadArea}
                  onChange={e => setFormData({...formData, loadArea: e.target.value})}
                  className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  required
                />
              </div>
              {type === 'cargo_search' && (
                <div className="space-y-2">
                  <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Discharge Area / Port</label>
                  <input 
                    type="text" 
                    value={formData.dischargeArea}
                    onChange={e => setFormData({...formData, dischargeArea: e.target.value})}
                    className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Dates From</label>
                <input 
                  type="date" 
                  value={formData.dateFrom}
                  onChange={e => setFormData({...formData, dateFrom: e.target.value})}
                  className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Dates To</label>
                <input 
                  type="date" 
                  value={formData.dateTo}
                  onChange={e => setFormData({...formData, dateTo: e.target.value})}
                  className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Visibility</label>
              <select 
                value={formData.visibility}
                onChange={e => setFormData({...formData, visibility: e.target.value as MarketRequestVisibility})}
                className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              >
                <option value="private">Private (Only You/Your Desk)</option>
                <option value="network">Desk Network (Visible to Matches)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-bold text-on-surface-variant tracking-widest">Remarks (Optional)</label>
              <textarea 
                value={formData.remarks}
                onChange={e => setFormData({...formData, remarks: e.target.value})}
                rows={3}
                placeholder="Any additional details..."
                className="w-full bg-surface-container border border-outline p-2 text-sm text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none"
              />
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-outline/20 bg-surface flex justify-end gap-3 shrink-0">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 border border-outline hover:bg-surface-container-high transition-colors text-sm font-medium text-on-surface-variant rounded-sm"
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            form="marketRequestForm"
            disabled={loading}
            className="px-6 py-2 bg-primary text-on-primary hover:bg-primary/90 transition-colors text-sm font-medium rounded-sm flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"/> : <Save className="w-4 h-4" />}
            Publish
          </button>
        </div>
      </motion.div>
    </div>
  );
};
