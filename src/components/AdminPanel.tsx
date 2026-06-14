import React, { useState, useEffect } from 'react';
import { Shield, Loader2, Slash, Search, TestTube, Check, X, ShieldAlert, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/firebase';
import { AdminBillingButton } from './AdminBillingButton';

export const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const [grants, setGrants] = useState<any[]>([]);
  const [aiStatus, setAiStatus] = useState<any>(null);
  const [routingStatus, setRoutingStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [targetEmail, setTargetEmail] = useState('');
  const [amount, setAmount] = useState('3000');
  const [duration, setDuration] = useState('14');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      // Fetch grants
      const resGrants = await fetch('/api/admin/usage/grants', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resGrants.ok) {
        const data = await resGrants.json();
        setGrants(data.grants);
      }
      
      // Fetch AI Status
      const resAi = await fetch('/api/admin/ai/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resAi.ok) {
         const data = await resAi.json();
         if (data.success) {
            setAiStatus(data);
         }
      }

      // Fetch routing diagnostics
      const resRouting = await fetch('/api/admin/routing/diagnostics', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resRouting.ok) {
         setRoutingStatus(await resRouting.json());
      }
    } catch (e) {
      console.error(e);
      setError('Network error loading admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setActionLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/usage/grant-credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetEmail,
          amount: parseInt(amount, 10),
          durationDays: parseInt(duration, 10),
          reason: 'Admin test grant'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTargetEmail('');
        await fetchData();
      } else {
        setError(data.error || 'Failed to grant');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async (uid: string) => {
    if (!user) return;
    if (!window.confirm("Revoke test grant?")) return;
    setActionLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/usage/revoke-grant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUid: uid })
      });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to revoke');
      }
    } catch (err: any) {
       setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="mt-12 space-y-8">
      {/* AI Config Section (Admin Only) */}
      <div className="p-6 border border-primary/30 bg-primary/5 relative">
        <div className="flex items-center gap-2 mb-6 text-primary">
           <Cpu className="w-5 h-5" />
           <h3 className="font-display font-medium text-lg uppercase tracking-wide">Admin: AI Configuration & Status</h3>
        </div>
        
        {loading ? (
           <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
        ) : aiStatus ? (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                 <h4 className="text-sm font-bold text-on-surface mb-4 uppercase tracking-widest border-b border-outline/30 pb-2">Providers</h4>
                 <div className="space-y-3">
                   {Object.entries(aiStatus.aiConfig.providers).map(([providerName, config]: [string, any]) => (
                      <div key={providerName} className="flex flex-col gap-1 text-sm bg-surface p-3 border border-outline/20">
                         <div className="flex justify-between items-center">
                            <span className="font-mono font-bold capitalize">{providerName}</span>
                            <span className={cn("text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-sm", config.configured ? "bg-green-500/20 text-green-600" : "bg-error/20 text-error")}>
                               {config.configured ? 'Configured' : 'Missing Key'}
                            </span>
                         </div>
                         <div className="text-xs text-on-surface-variant flex justify-between items-center mt-1">
                            <span>Key Status:</span>
                            <span className="font-mono">{config.keyMasked || 'None'}</span>
                         </div>
                      </div>
                   ))}
                 </div>
                 
                 <h4 className="text-sm font-bold text-on-surface mt-6 mb-4 uppercase tracking-widest border-b border-outline/30 pb-2">Models</h4>
                 {routingStatus && (
                    <div className="bg-surface p-3 border border-outline/20 mb-4 text-sm font-mono text-on-surface-variant flex flex-col gap-1">
                       <div className="flex justify-between items-center">
                          <span className="font-bold capitalize">Routing Provider</span>
                          <div className="flex gap-2">
                             {routingStatus.providerMode && (
                                <span className="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-sm bg-orange-500/20 text-orange-600">
                                  {routingStatus.providerMode.replace('_', ' ')}
                                </span>
                             )}
                             <span className={cn("text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-sm", routingStatus.configured ? "bg-green-500/20 text-green-600" : "bg-error/20 text-error")}>
                                {routingStatus.configured ? 'Configured' : 'Missing Key'}
                             </span>
                          </div>
                       </div>
                       <div className="text-[10px] flex justify-between mt-1">
                          <span>Last Success: {routingStatus.lastSuccess ? new Date(routingStatus.lastSuccess).toLocaleString() : 'None'}</span>
                          {routingStatus.lastError && <span className="text-error">{routingStatus.lastError}</span>}
                       </div>
                    </div>
                 )}
                 <div className="bg-surface p-3 border border-outline/20 space-y-2 text-sm font-mono text-on-surface-variant overflow-x-auto">
                    {Object.entries(aiStatus.aiConfig.models || {}).map(([key, val]) => (
                       <div key={key} className="flex gap-4">
                          <span className="w-40 font-bold opacity-80">{key}:</span>
                          <span>{val as string}</span>
                       </div>
                    ))}
                 </div>

                 <h4 className="text-sm font-bold text-on-surface mt-6 mb-4 uppercase tracking-widest border-b border-outline/30 pb-2">Provider Metrics</h4>
                 <div className="bg-surface p-3 border border-outline/20 text-[10px] uppercase tracking-widest font-mono text-on-surface-variant italic">
                    Note: Generation count, failure rate, average latency, and provider health summaries are intentionally not implemented in this phase.
                 </div>
              </div>
              
              <div>
                 <h4 className="text-sm font-bold text-on-surface mb-4 uppercase tracking-widest border-b border-outline/30 pb-2">Diagnostics</h4>
                 <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-surface p-3 border border-outline/20">
                       <div className="text-xs text-on-surface-variant uppercase tracking-widest mb-1">Rate Limit Hits</div>
                       <div className="text-xl font-bold font-mono text-error">{aiStatus.diagnostics.rateLimitHits}</div>
                    </div>
                    <div className="bg-surface p-3 border border-outline/20">
                       <div className="text-xs text-on-surface-variant uppercase tracking-widest mb-1">Cache Hits</div>
                       <div className="text-xl font-bold font-mono text-secondary">{aiStatus.diagnostics.cacheHits}</div>
                    </div>
                    <div className="bg-surface p-3 border border-outline/20">
                       <div className="text-xs text-on-surface-variant uppercase tracking-widest mb-1">Failovers</div>
                       <div className="text-xl font-bold font-mono text-tertiary">{aiStatus.diagnostics.failovers}</div>
                    </div>
                    <div className="bg-surface p-3 border border-outline/20">
                       <div className="text-xs text-on-surface-variant uppercase tracking-widest mb-1">Retries</div>
                       <div className="text-xl font-bold font-mono text-primary">{aiStatus.diagnostics.retries}</div>
                    </div>
                 </div>
                 
                 <div className="bg-surface p-3 border border-error/50 text-error space-y-2 text-sm font-mono">
                    <div className="flex justify-between">
                       <span>Parse Failures:</span>
                       <span>{aiStatus.diagnostics.parseFailures}</span>
                    </div>
                    <div className="flex justify-between">
                       <span>Schema Failures:</span>
                       <span>{aiStatus.diagnostics.schemaFailures}</span>
                    </div>
                    <div className="flex justify-between">
                       <span>Timeouts:</span>
                       <span>{aiStatus.diagnostics.timeoutCount || 0}</span>
                    </div>
                 </div>
              </div>
           </div>
        ) : (
           <div className="text-error text-sm">Failed to load AI configuration</div>
        )}
      </div>

      {/* Credit Grants Section */}
      <div className="p-6 border border-error/30 bg-error/5 relative">
        <div className="flex items-center gap-2 mb-6 text-error">
           <ShieldAlert className="w-5 h-5" />
           <h3 className="font-display font-medium text-lg uppercase tracking-wide">Admin: Test Controls</h3>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-error/20 text-error text-sm border border-error/50">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div>
              <h4 className="text-sm font-bold text-on-surface mb-4 uppercase tracking-widest">Active Test Users ({grants.length}/2)</h4>
              {loading ? (
                 <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
              ) : grants.length === 0 ? (
                 <div className="text-sm text-on-surface-variant opacity-70 italic">No active grantees.</div>
              ) : (
                 <div className="space-y-4">
                   {grants.map(grant => (
                      <div key={grant.uid} className="flex flex-col gap-2 p-3 bg-surface border border-outline/20">
                         <div className="flex justify-between items-start">
                            <div>
                              <div className="font-mono text-sm">{grant.email}</div>
                              <div className="text-xs text-on-surface-variant mt-1">Granted: <span className="text-primary font-bold">{grant.testCreditsGranted} credits</span></div>
                              <div className="text-xs text-on-surface-variant">Expires: {new Date(grant.expiresAt).toLocaleDateString()}</div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <button 
                                 onClick={() => handleRevoke(grant.uid)}
                                 disabled={actionLoading}
                                 className="text-xs flex items-center gap-1 text-error hover:text-error/80 uppercase font-bold tracking-wider"
                              >
                                <X className="w-3 h-3" /> Revoke
                              </button>
                              <AdminBillingButton targetUserId={grant.uid} />
                            </div>
                         </div>
                      </div>
                   ))}
                 </div>
              )}
           </div>

           <div>
              <h4 className="text-sm font-bold text-on-surface mb-4 uppercase tracking-widest">Grant Test Credits</h4>
              <form onSubmit={handleGrant} className="space-y-4">
                 <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-on-surface-variant mb-1">Target User Email</label>
                    <input 
                       type="email"
                       required
                       value={targetEmail}
                       onChange={e => setTargetEmail(e.target.value)}
                       className="w-full bg-surface border border-outline/30 px-3 py-2 text-sm focus:outline-none focus:border-primary"
                       placeholder="colleague@example.com"
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs uppercase tracking-widest font-bold text-on-surface-variant mb-1">Amount</label>
                      <input 
                         type="number"
                         required
                         min="1"
                         max="5000"
                         value={amount}
                         onChange={e => setAmount(e.target.value)}
                         className="w-full bg-surface border border-outline/30 px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest font-bold text-on-surface-variant mb-1">Days Valid</label>
                      <input 
                         type="number"
                         required
                         min="1"
                         max="90"
                         value={duration}
                         onChange={e => setDuration(e.target.value)}
                         className="w-full bg-surface border border-outline/30 px-3 py-2 text-sm focus:outline-none focus:border-primary font-mono"
                      />
                    </div>
                 </div>
                 <button 
                    type="submit"
                    disabled={actionLoading || grants.length >= 2}
                    className="w-full py-3 bg-error text-on-primary uppercase tracking-widest font-bold text-xs flex justify-center items-center hover:bg-error/90 disabled:opacity-50"
                 >
                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Grant Credits"}
                 </button>
              </form>
              <p className="text-[10px] text-on-surface-variant mt-3 text-center uppercase tracking-widest">
                 Max 2 active users allowed simultaneously. Max 5000 credits.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};
