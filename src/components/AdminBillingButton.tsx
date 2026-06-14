import React, { useState, useEffect } from 'react';
import { useAuth, db } from '../lib/firebase';
import { ExternalLink, Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';

export const AdminBillingButton: React.FC<{ targetUserId: string }> = ({ targetUserId }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Determine if the current user is an admin by fetching their usage plan
    const checkAdmin = async () => {
      if (!user) return;
      try {
        const usageDoc = await getDoc(doc(db, `users/${user.uid}/usage`, 'summary'));
        if (usageDoc.exists() && usageDoc.data().planId === 'admin_test') {
           setIsAdmin(true);
        } else {
           // Also allow if usage doc itself says admin_test (backward compat)
           const uDoc = await getDoc(doc(db, `users/${user.uid}/usage`));
           if (uDoc.exists() && uDoc.data().planId === 'admin_test') {
              setIsAdmin(true);
           }
        }
      } catch (e) {
        // PERMISSION_DENIED happens here if we can't read our own usage, which shouldn't happen, but ignore
      }
    };
    checkAdmin();
  }, [user]);

  if (!isAdmin) return null;

  const handleManage = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/billing/admin/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, '_blank');
      } else if (res.ok && data.error) {
         // Safe error handled via 200 (e.g. no Stripe customer)
         setError(data.error);
      } else {
        setError(data.error || 'Failed to open billing portal');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1 mt-2 sm:mt-0 ml-auto">
      <button
        onClick={handleManage}
        disabled={loading}
        className="px-2 py-1 bg-tertiary/10 text-tertiary border border-tertiary/30 uppercase text-[9px] font-bold tracking-widest hover:bg-tertiary/20 transition-colors flex items-center gap-1 min-w-[140px] justify-center"
        title="Admin: Manage User Billing"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <>Open Billing Portal <ExternalLink className="w-3 h-3" /></>}
      </button>
      {error && (
        <span className="text-error text-[9px] max-w-[200px] text-right font-mono leading-tight">{error}</span>
      )}
    </div>
  );
};
