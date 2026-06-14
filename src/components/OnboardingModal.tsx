import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Mail, Briefcase, Building, MapPin, Loader2, ArrowRight, CheckCircle2, Zap, Ship } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OnboardingModalProps {
  user: User;
  onComplete: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ user, onComplete }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [deskId, setDeskId] = useState('');
  
  const [formData, setFormData] = useState({
    displayName: user.displayName || '',
    companyName: '',
    role: '',
    region: ''
  });
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data.onboardingCompleted) {
             onComplete();
             return;
          }
          setFormData({
            displayName: data.displayName || user.displayName || '',
            companyName: data.companyName === 'Independent Broker' ? '' : (data.companyName || ''),
            role: data.role === 'broker' ? '' : (data.role || ''),
            region: data.region || ''
          });
          if (data.deskId) setDeskId(data.deskId);
        }
      } catch (err) {
        console.error("Failed to load user info:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user, onComplete]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { displayName, companyName, role, region } = formData;
    
    if (!displayName.trim() || !companyName.trim() || !role.trim()) {
      setError("Please fill in Name, Company, and Role.");
      return;
    }

    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      
      let newDeskId = deskId;
      if (!userSnap.exists()) {
         newDeskId = `CDP-${Math.floor(Math.random()*1000000).toString(16).toUpperCase()}`;
         await setDoc(userRef, {
             deskId: newDeskId,
             displayName,
             companyName,
             role,
             email: user.email,
             region,
             onboardingCompleted: false, // not fully complete yet
             createdAt: serverTimestamp(),
             updatedAt: serverTimestamp(),
         });

         const metricsRef = doc(db, `users/${user.uid}/usage/aiMetrics`);
         await setDoc(metricsRef, {
             aiCallsMade: 0,
             aiCallsSavedByCache: 0,
             cacheHitCount: 0,
             riskRuleAppliedCount: 0,
             senderProfileUsedCount: 0,
             parseRequestsTotal: 0
         }, { merge: true });
      } else {
         const data = userSnap.data();
         newDeskId = data.deskId || `CDP-${Math.floor(Math.random()*1000000).toString(16).toUpperCase()}`;
         await updateDoc(userRef, {
             deskId: newDeskId,
             displayName,
             companyName,
             role,
             region,
             updatedAt: serverTimestamp()
         });
      }

      setDeskId(newDeskId);
      if (newDeskId) {
         const profileRef = doc(db, 'publicProfiles', newDeskId);
         await setDoc(profileRef, {
             uid: user.uid,
             deskId: newDeskId,
             displayName,
             companyName,
             role,
             region: region || '',
             verifiedCompany: false,
             updatedAt: serverTimestamp(),
             createdAt: serverTimestamp(),
         }, { merge: true });
      }
      
      setStep(2);
    } catch (err: any) {
      console.error("Failed to save profile:", err);
      setError(err.message || "Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
          onboardingCompleted: true,
          updatedAt: serverTimestamp()
      });
      onComplete();
    } catch (err: any) {
      console.error("Failed to complete onboarding:", err);
      onComplete(); // try proceeding anyway
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-surface z-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-surface flex flex-col pt-12 items-center overflow-y-auto overflow-x-hidden p-4 sm:p-6 pb-20">
      <div className="w-full max-w-md bg-surface-container rounded-sm border border-outline shadow-xl relative mt-4 sm:mt-10 mb-auto overflow-hidden">
        
        {/* Progress bar */}
        <div className="flex h-1 bg-outline/20">
          <div className="bg-primary transition-all duration-500 ease-out" style={{ width: `${(step / 4) * 100}%` }} />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="p-6 border-b border-outline/30 bg-surface-container-low">
                <h2 className="text-2xl font-display font-light text-on-surface mb-2 tracking-tight">Complete Profile</h2>
                <p className="text-sm text-on-surface-variant font-sans font-light">Tell us a bit about your desk.</p>
              </div>
              
              <form onSubmit={handleProfileSubmit} className="p-6 space-y-5">
                {error && <div className="bg-error/10 text-error p-3 rounded-sm text-xs border border-error/20">{error}</div>}
                
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1 ml-1 font-medium">Work Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50" />
                    <input type="email" value={user.email || ''} readOnly className="w-full pl-9 pr-4 py-2 bg-surface text-on-surface-variant border border-outline/50 rounded-sm text-sm opacity-70 cursor-not-allowed" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-on-surface-variant mb-1 ml-1 font-medium">Full Name <span className="text-error">*</span></label>
                  <input type="text" required value={formData.displayName} onChange={(e) => setFormData({...formData, displayName: e.target.value})} className="w-full px-4 py-2 bg-surface text-on-surface border border-outline rounded-sm text-sm focus:border-primary transition-colors" placeholder="John Doe" />
                </div>

                <div>
                  <label className="block text-xs text-on-surface-variant mb-1 ml-1 font-medium">Company Name <span className="text-error">*</span></label>
                  <input type="text" required value={formData.companyName} onChange={(e) => setFormData({...formData, companyName: e.target.value})} className="w-full px-4 py-2 bg-surface text-on-surface border border-outline rounded-sm text-sm focus:border-primary transition-colors" placeholder="Global Chartering Inc." />
                </div>

                <div>
                  <label className="block text-xs text-on-surface-variant mb-1 ml-1 font-medium">Role <span className="text-error">*</span></label>
                  <select required value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="w-full px-4 py-2 bg-surface text-on-surface border border-outline rounded-sm text-sm focus:border-primary transition-colors">
                    <option value="">Select a role...</option>
                    <option value="Shipbroker">Shipbroker</option>
                    <option value="Charterer">Charterer</option>
                    <option value="Owner / Operator">Owner / Operator</option>
                    <option value="Trader">Trader</option>
                    <option value="Founder / Admin">Founder / Admin</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <button type="submit" disabled={saving} className="w-full mt-4 py-3 bg-on-surface text-surface uppercase tracking-widest text-[11px] font-bold rounded-sm flex items-center justify-center gap-2 hover:bg-on-surface/90 transition-all">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
              </form>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Building className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-light text-on-surface mb-4">Organization Desk</h2>
                <p className="text-sm text-on-surface-variant mb-8 leading-relaxed">
                  Your desk environment has been initialized. You can invite your team members or join another desk later from Settings.
                </p>
                <div className="bg-surface-container-low border border-outline/30 rounded-sm p-4 mb-8 flex flex-col items-center">
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-mono mb-2">Your Desk ID</span>
                  <span className="text-xl font-mono text-on-surface">{deskId}</span>
                </div>
                <button onClick={() => setStep(3)} className="w-full py-3 bg-on-surface text-surface uppercase tracking-widest text-[11px] font-bold rounded-sm flex items-center justify-center gap-2">
                  Continue <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-tertiary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Zap className="w-8 h-8 text-tertiary" />
                </div>
                <h2 className="text-2xl font-display font-light text-on-surface mb-4">Plan & Trial Status</h2>
                <p className="text-sm text-on-surface-variant mb-8 leading-relaxed">
                  You are currently on the <strong className="text-on-surface">Maximum Tier (Trial)</strong> plan. You have full access to all AI parsing, analytics, and network capabilities.
                </p>
                <div className="bg-surface-container-low border border-outline/30 rounded-sm p-4 text-left mb-8 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Credits Included</span>
                    <span className="font-mono text-on-surface">1,000</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Credits Remaining</span>
                    <span className="font-mono text-on-surface">1,000</span>
                  </div>
                </div>
                <button onClick={() => setStep(4)} className="w-full py-3 bg-on-surface text-surface uppercase tracking-widest text-[11px] font-bold rounded-sm flex items-center justify-center gap-2">
                  Continue <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Ship className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-display font-light text-on-surface mb-4">Welcome aboard</h2>
                <p className="text-sm text-on-surface-variant mb-8 leading-relaxed">
                  Your platform is ready. <br/><br/>
                  <span className="text-on-surface">Connect your Gmail later</span> from the Inbox or Settings to let our AI parser automatically extract cargo and vessel opportunities.
                </p>
                
                <button onClick={handleComplete} disabled={saving} className="w-full py-4 bg-primary text-on-primary uppercase tracking-widest text-[11px] font-bold rounded-sm flex items-center justify-center gap-2 hover:bg-primary-hover shadow-md">
                   {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Enter Terminal <ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
};
