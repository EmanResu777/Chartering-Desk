import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Network, Ship, CheckCircle, Package2, ShieldAlert } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface DeskNetworkPromoProps {
  onDismiss: () => void;
}

export const DeskNetworkPromo: React.FC<DeskNetworkPromoProps> = ({ onDismiss }) => {
  const [promoState, setPromoState] = useState<'viewed' | 'interested' | 'not_interested' | 'maybe_later' | 'submitted' | null>(() => {
    return (localStorage.getItem('desk_network_promo_state') as any) || 'viewed';
  });

  const [formData, setFormData] = useState({
    companyDesk: '',
    cargoFocus: '',
    vesselFocus: '',
    tradeAreas: '',
    testFocus: ''
  });

  useEffect(() => {
    if (promoState === 'viewed') {
      saveState('viewed');
    }
  }, []);

  const saveState = async (status: string, additionalData?: any) => {
    setPromoState(status as any);
    localStorage.setItem('desk_network_promo_state', status);
    
    // Save to Firestore
    try {
      if (auth.currentUser) {
         await setDoc(doc(db, 'users', auth.currentUser.uid, 'deskNetworkTests', 'test_promo'), {
            userId: auth.currentUser.uid,
            status,
            timestamp: serverTimestamp(),
            source: 'desk_network_promo_test',
            email: auth.currentUser.email,
            ...additionalData
         }, { merge: true });
      }
    } catch (e) {
      console.error("Failed to save test responses", e);
    }
  };

  const handleInterested = () => {
    saveState('interested');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveState('submitted', { feedback: formData });
    setTimeout(() => {
      onDismiss();
    }, 1500);
  };

  if (promoState === 'submitted' || promoState === 'not_interested' || promoState === 'maybe_later') {
    return null; 
  }

  return (
    <div className="absolute inset-0 z-50 bg-surface-container-highest/60 backdrop-blur-md flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-2xl bg-surface-container border border-primary/30 shadow-[0_0_50px_rgba(29,155,240,0.15)] overflow-hidden"
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-outline">
            <div className="w-12 h-12 bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <Network className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface uppercase tracking-widest">Early Access Testing</h2>
              <div className="text-primary font-mono text-xs uppercase tracking-wider mt-1">Cargo Desk Network</div>
            </div>
          </div>

          {promoState === 'viewed' ? (
            <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="text-on-surface text-[13px] leading-relaxed mb-6 space-y-4">
                <p>
                  We are preparing a controlled pilot for <strong>Cargo Desk</strong>, an AI-powered chartering workspace for shipbrokers, owners, operators and project cargo desks.
                </p>
                <div className="bg-surface p-4 border border-outline border-l-4 border-l-tertiary text-on-surface-variant italic">
                  The current focus is to test how Desk Network handles broker-to-broker communication, shared cargo/vessel visibility, interest signals and early workflow feedback.
                </div>
              </div>

              <div className="flex items-center gap-4 mt-8">
                <button 
                  onClick={handleInterested}
                  className="bg-primary text-on-primary px-6 py-3 text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" /> Join Test Group
                </button>
                <div className="flex gap-2 ml-auto">
                  <button 
                    onClick={() => { saveState('maybe_later'); onDismiss(); }}
                    className="text-on-surface-variant bg-surface border border-outline hover:border-primary/50 hover:text-on-surface px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    Maybe Later
                  </button>
                  <button 
                    onClick={() => { saveState('not_interested'); onDismiss(); }}
                    className="text-on-surface-variant hover:text-red-400 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors"
                  >
                    Not Interested
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="text-sm font-bold text-on-surface uppercase mb-4 tracking-wider">Confirm Your Profile Focus</div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Company / Desk Type</label>
                    <input required value={formData.companyDesk} onChange={e => setFormData({ ...formData, companyDesk: e.target.value })} 
                      className="w-full bg-surface border border-outline p-2 text-xs text-on-surface focus:border-primary focus:outline-none" placeholder="(e.g. Brokerage, Owner, etc.)"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Preferred Trade Areas</label>
                    <input required value={formData.tradeAreas} onChange={e => setFormData({ ...formData, tradeAreas: e.target.value })} 
                      className="w-full bg-surface border border-outline p-2 text-xs text-on-surface focus:border-primary focus:outline-none" placeholder="(e.g. Med, Cont, USG)"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Cargo Focus</label>
                    <input value={formData.cargoFocus} onChange={e => setFormData({ ...formData, cargoFocus: e.target.value })} 
                      className="w-full bg-surface border border-outline p-2 text-xs text-on-surface focus:border-primary focus:outline-none" placeholder="(e.g. Steel, Grains)"/>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">Vessel Focus</label>
                    <input value={formData.vesselFocus} onChange={e => setFormData({ ...formData, vesselFocus: e.target.value })} 
                      className="w-full bg-surface border border-outline p-2 text-xs text-on-surface focus:border-primary focus:outline-none" placeholder="(e.g. Handy, Supramax)"/>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-[10px] font-mono text-on-surface-variant uppercase mb-1">What do you want to test?</label>
                  <textarea value={formData.testFocus} onChange={e => setFormData({ ...formData, testFocus: e.target.value })} 
                    className="w-full bg-surface border border-outline p-2 text-xs text-on-surface focus:border-primary focus:outline-none h-20 resize-none" 
                    placeholder="Cargo parsing, vessel parsing, matching or recap workflow..."/>
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t border-outline">
                  <div className="flex items-center gap-2 text-[10px] text-tertiary flex-1">
                    <ShieldAlert className="h-4 w-4" />
                    <span>No data is sent externally yet. Private testing sandbox.</span>
                  </div>
                  <button type="submit" className="bg-primary text-on-primary px-6 py-3 text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all">
                    Submit test profile
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
