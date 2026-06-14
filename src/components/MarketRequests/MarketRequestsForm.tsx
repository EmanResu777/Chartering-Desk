import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, AlertCircle } from 'lucide-react';
import { MarketRequestType, MarketRequestVisibility } from '../../lib/utils';
import { useAuth, db } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where, arrayUnion } from 'firebase/firestore';

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
    try {
      const q = query(collection(db, 'deskNetworkSharedItems'), where('visibility', '==', 'desk_network'));
      const snap = await getDocs(q);
      const matches: any[] = [];
      snap.forEach(d => {
        const item = d.data();
        if (item.userId === user?.uid) return;
        let score = 0;

        const compareDates = (reqStart: string, reqEnd: string, itemStart: string, itemEnd: string) => {
           if (!reqStart && !reqEnd && !itemStart && !itemEnd) return 5;
           const rS = reqStart ? new Date(reqStart).getTime() : 0;
           const rE = reqEnd ? new Date(reqEnd).getTime() : Infinity;
           const iS = itemStart ? new Date(itemStart).getTime() : 0;
           const iE = itemEnd ? new Date(itemEnd).getTime() : Infinity;
           if (isNaN(rS) || isNaN(rE) || isNaN(iS) || isNaN(iE)) return 0;
           if (rE < iS || rS > iE) return 0;
           if (rS >= iS && rE <= iE) return 30;
           return 15;
        };

        const compareQuantity = (reqMin: number, reqMax: number, itemNum: number) => {
           if (!reqMin && !reqMax && !itemNum) return 5;
           if (!itemNum) return 0;
           const rm = reqMin || 0;
           const rM = reqMax || Infinity;
           if (itemNum >= rm && itemNum <= rM) return 30;
           if (itemNum >= rm * 0.8 && itemNum <= rM * 1.2) return 15;
           return 0;
        };
        
        // Basic Deterministic Score logic
        if (reqData.type === 'cargo_search' && item.itemType === 'vessel') {
           if (item.vesselData?.openPort && reqData.loadArea && item.vesselData.openPort.toLowerCase().includes(reqData.loadArea.toLowerCase())) score += 30;
           if (item.vesselData?.type && reqData.vesselType && item.vesselData.type.toLowerCase().includes(reqData.vesselType.toLowerCase())) score += 20;
           score += compareDates(reqData.dateFrom, reqData.dateTo, item.vesselData?.openDate, item.vesselData?.openDate); // using openDate twice for a point in time
           score += compareQuantity(reqData.quantityMin, reqData.quantityMax, item.vesselData?.dwt);
        } else if (reqData.type === 'tonnage_search' && item.itemType === 'cargo') {
           if (item.cargoData?.loadPort && reqData.loadArea && item.cargoData.loadPort.toLowerCase().includes(reqData.loadArea.toLowerCase())) score += 30;
           if (item.cargoData?.commodity && reqData.cargoType && item.cargoData.commodity.toLowerCase().includes(reqData.cargoType.toLowerCase())) score += 20;
           score += compareDates(reqData.dateFrom, reqData.dateTo, item.cargoData?.laycanFrom, item.cargoData?.laycanTo);
           score += compareQuantity(item.cargoData?.quantity, item.cargoData?.quantity, reqData.dwtMax); // reverse check
        } else if (reqData.type === 'available_vessel' && item.itemType === 'cargo') {
           if (item.cargoData?.loadPort && reqData.loadArea && item.cargoData.loadPort.toLowerCase().includes(reqData.loadArea.toLowerCase())) score += 30;
           if (item.cargoData?.commodity && reqData.cargoType && item.cargoData.commodity.toLowerCase().includes(reqData.cargoType.toLowerCase())) score += 20;
           score += compareDates(reqData.dateFrom, reqData.dateFrom, item.cargoData?.laycanFrom, item.cargoData?.laycanTo);
           score += compareQuantity(item.cargoData?.quantity, item.cargoData?.quantity, reqData.dwtMax);
        }

        if (score >= 40) {
          score = Math.min(score, 100);
          matches.push({
            id: `MATCH-${Math.random().toString(36).substring(2,9)}`,
            requestId,
            sharedItemId: d.id,
            requestType: reqData.type,
            vesselOwnerUid: item.itemType === 'vessel' ? item.userId : user?.uid,
            cargoOwnerUid: item.itemType === 'cargo' ? item.userId : user?.uid,
            matchScore: score,
            label: score >= 80 ? 'strong match' : (score >= 60 ? 'possible match' : 'weak match'),
            status: 'active',
            createdAt: new Date().toISOString(),
            audit: [{ action: 'match generated', timestamp: new Date().toISOString(), actor: 'system' }]
          });
        }
      });

      for (const match of matches) {
         await setDoc(doc(db, 'marketMatches', match.id), match);
         
         // Trigger alert for the counterpart (owner of the shared item)
         const counterpartUid = match.vesselOwnerUid === user?.uid ? match.cargoOwnerUid : match.vesselOwnerUid;
         if (counterpartUid) {
             import('../../lib/alertService').then(({ createAlert }) => {
                 createAlert({
                     recipientUid: counterpartUid,
                     title: 'New Market Match',
                     message: `A new market request matches your shared item with score ${Math.round(match.matchScore)}%.`,
                     priority: match.matchScore >= 80 ? 'high' : 'info',
                     category: 'market_request_match',
                     actionRoute: '/dashboard'
                 }).catch(console.error);
             });
         }
      }
    } catch (err) {
      console.warn("Failed to generate matches:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError('');

    try {
      const id = `REQ-${Math.floor(Math.random() * 1000000).toString(16).toUpperCase()}`;
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
        createdByDeskId: profile?.deskId || 'UNKNOWN',
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
