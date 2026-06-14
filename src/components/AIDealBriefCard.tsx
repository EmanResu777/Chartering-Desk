import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bot, RefreshCw, AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth, db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, getDocs, orderBy, limit } from 'firebase/firestore';
import { cn } from '../lib/utils';

interface AIDealBriefCardProps {
  itemId: string;
  itemType: 'cargo' | 'vessel' | 'marketRequest' | 'radarMatch' | 'hotOpp' | 'sharedItem';
  dealType?: string;
  contextContext?: any;
  className?: string;
}

export const AIDealBriefCard: React.FC<AIDealBriefCardProps> = ({ itemId, itemType, dealType, contextContext, className }) => {
  const { user } = useAuth();
  const [briefDoc, setBriefDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user || !itemId) return;
    
    // We only look for the most recent brief for this item created by this user
    const q = query(
      collection(db, 'dealBriefs'),
      where('sourceItemId', '==', itemId),
      where('createdByUid', '==', user.uid),
      orderBy('generatedAt', 'desc'),
      limit(1)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setBriefDoc({ id: snap.docs[0].id, ...snap.docs[0].data() });
        // Auto-expand if recently generated
        if (!briefDoc) setExpanded(true); 
      } else {
        setBriefDoc(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Deal brief snapshot error", err);
      setLoading(false);
    });

    return () => unsub();
  }, [user, itemId]);

  const [hasLoggedView, setHasLoggedView] = useState(false);

  useEffect(() => {
    if (expanded && briefDoc?.id && !hasLoggedView) {
      setHasLoggedView(true);
      auth.currentUser?.getIdToken().then(token => {
        fetch('/api/ai/dealBrief/audit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ briefId: briefDoc.id, action: 'deal brief viewed' })
        }).catch(console.error);
      });
    }
  }, [expanded, briefDoc?.id, hasLoggedView]);

  const generateBrief = async (isRegenerate: boolean = false) => {
    if (!user) return;
    setGenerating(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      
      if (contextContext && contextContext.proximitySummary) {
          import('../lib/proximityIntelligence').then(({ logProximityAudit }) => {
              logProximityAudit('proximity_used_in_ai_deal_brief', {
                  proximityLabel: contextContext.proximitySummary.substring(0, 50),
                  sourceModule: 'ai_deal_brief'
              });
          });
      }

      // Generate unique reqId for this action. Duplicate clicks in same render frame will use different IDs but React prevents it due to 'generating' state mostly.
      // Or we can just let Date.now() on backend handle it, but true idempotency means predictable ID per explicit click.
      const requestId = `dealbrief-${itemId}-${Date.now()}`;
      const res = await fetch('/api/ai/dealBrief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Request-Id': requestId
        },
        body: JSON.stringify({ itemId, itemType, dealType, contextContext, isRegenerate })
      });
      const data = await res.json();
      if (!res.ok) {
         if (res.status === 402) {
            throw new Error(data.safeMessage || 'Credit limit reached');
         }
         throw new Error(data.error || 'Failed to generate brief');
      }
      setHasLoggedView(false); // reset view log so it logs view again when it opens
      
      // Success. Trigger an alert.
      import('../lib/alertService').then(({ createAlert }) => {
          createAlert({
             recipientUid: user.uid,
             title: isRegenerate ? 'AI Deal Brief Regenerated' : 'AI Deal Brief Generated',
             message: `Your AI Deal Brief for this ${itemType} has been successfully ${isRegenerate ? 'regenerated' : 'generated'}.`,
             priority: 'info',
             category: 'ai_deal_brief',
             actionRoute: '/dashboard'
          }).catch(console.error);
      });
    } catch (err: any) {
      setError(err.message);
      import('../lib/alertService').then(({ createAlert }) => {
          createAlert({
             recipientUid: user?.uid || '',
             title: 'AI Deal Brief Failed',
             message: `Failed to generate AI Deal Brief: ${err.message}`,
             priority: 'high',
             category: 'ai_deal_brief',
             actionRoute: '/dashboard'
          }).catch(console.error);
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleActionClick = (actionName: string) => {
     if (!briefDoc?.id) return;
     auth.currentUser?.getIdToken().then(token => {
       fetch('/api/ai/dealBrief/audit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ briefId: briefDoc.id, action: `suggested action clicked: ${actionName}` })
       }).catch(console.error);
     });
     // No automatic fixture or CP created. Broker-side confirmation remains manual.
     alert(`You selected to pursue: ${actionName}. Use standard actions to proceed safely.`);
  };

  if (loading) {
    return <div className="animate-pulse h-12 bg-surface-container/50 border border-outline/20"></div>;
  }

  if (!briefDoc) {
    return (
      <div className={cn("border border-outline/30 bg-surface-container-low p-4 rounded-sm flex flex-col items-center justify-center gap-3 text-center", className)}>
         <Bot className="w-8 h-8 text-primary opacity-80" />
         <div>
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-on-surface mb-1">AI Deal Brief</h4>
            <p className="text-[10px] text-on-surface-variant max-w-xs mx-auto">Generate a professional commercial assessment, risk analysis and match explanation for this opportunity.</p>
         </div>
         <button 
           onClick={() => generateBrief(false)} 
           disabled={generating}
           className="mt-2 px-6 py-2 bg-primary text-on-primary font-bold text-[10px] uppercase tracking-widest hover:bg-primary-container transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
         >
           {generating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
           {generating ? 'Drafting Brief...' : 'Generate Brief'}
         </button>
         {error && <div className="text-[10px] text-error font-mono mt-2">{error}</div>}
      </div>
    );
  }

  const brief = briefDoc.brief;

  return (
    <div className={cn("border border-outline/30 bg-surface flex flex-col", className)}>
       {/* Header */}
       <div 
         className="px-4 py-3 bg-surface-container-low flex justify-between items-center cursor-pointer hover:bg-surface-container transition-colors"
         onClick={() => setExpanded(!expanded)}
       >
          <div className="flex items-center gap-3">
             <div className="w-6 h-6 bg-primary/20 rounded-sm flex items-center justify-center text-primary">
                <Bot className="w-3.5 h-3.5" />
             </div>
             <div>
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-on-surface leading-tight">AI Deal Brief</h4>
                <div className="text-[9px] text-on-surface-variant font-mono">{brief.title || brief.dealType}</div>
             </div>
          </div>
          <div className="flex items-center gap-3">
             {brief.commercialFit && (
                <span className={cn(
                   "text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 border rounded-sm",
                   brief.commercialFit === 'excellent' ? "bg-primary/10 text-primary border-primary/30" :
                   brief.commercialFit === 'strong' ? "bg-primary/5 text-primary border-primary/20" :
                   brief.commercialFit === 'weak' ? "bg-error/10 text-error border-error/30" :
                   "bg-outline/20 text-on-surface-variant border-outline/30"
                )}>
                   Fit: {brief.commercialFit}
                </span>
             )}
             {expanded ? <ChevronUp className="w-4 h-4 text-on-surface-variant" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant" />}
          </div>
       </div>

       {/* Expanded Content */}
       {expanded && (
          <div className="p-4 sm:p-5 flex flex-col gap-6 animate-in slide-in-from-top-2 duration-200">
             
             {/* Summary */}
             <div className="space-y-2">
                <h5 className="text-[9px] text-on-surface-variant font-medium uppercase tracking-[0.3em] flex items-center gap-2">
                   <div className="w-4 h-[1px] bg-on-surface-variant/30"></div> Analyst Summary
                </h5>
                <p className="text-[13px] text-on-surface font-sans leading-relaxed tracking-wide">
                   {brief.summary}
                </p>
             </div>

             {/* 2 Column Details */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* Key Details */}
                {brief.keyDetails && (
                   <div className="space-y-3 bg-surface-container-lowest p-4 border border-outline/20">
                      <h5 className="text-[9px] font-bold text-on-surface uppercase tracking-widest">Key Details</h5>
                      <div className="grid grid-cols-1 gap-2 text-[11px]">
                         {Object.entries(brief.keyDetails).map(([k, v]) => v ? (
                            <div key={k} className="flex justify-between items-start border-b border-outline/10 pb-1">
                               <span className="text-on-surface-variant uppercase text-[9px] tracking-wider">{k}</span>
                               <span className="font-mono text-on-surface text-right w-2/3 truncate" title={v as string}>{v as string}</span>
                            </div>
                         ) : null)}
                      </div>
                   </div>
                )}

                {/* Risk Profile */}
                <div className="space-y-3 bg-surface-container-lowest p-4 border border-outline/20">
                   <div className="flex justify-between items-center">
                      <h5 className="text-[9px] font-bold text-on-surface uppercase tracking-widest">Risk Profile</h5>
                      <span className={cn(
                        "text-[9px] uppercase font-bold tracking-widest flex items-center gap-1",
                        brief.riskLevel === 'high' ? "text-error" : brief.riskLevel === 'medium' ? "text-[#f59e0b]" : "text-primary"
                      )}>
                         {brief.riskLevel === 'high' && <AlertTriangle className="w-3 h-3" />}
                         {brief.riskLevel === 'medium' && <Activity className="w-3 h-3" />}
                         {brief.riskLevel === 'low' && <CheckCircle2 className="w-3 h-3" />}
                         {brief.riskLevel}
                      </span>
                   </div>
                   
                   {brief.riskReasons && brief.riskReasons.length > 0 && (
                      <ul className="text-[10px] space-y-1.5 text-on-surface-variant mt-2 font-mono">
                         {brief.riskReasons.map((r: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 leading-snug">
                               <span className="text-error mt-0.5">•</span> {r}
                            </li>
                         ))}
                      </ul>
                   )}
                   
                   {brief.missingInformation && brief.missingInformation.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-outline/10">
                         <h6 className="text-[8px] uppercase tracking-widest text-on-surface-variant mb-1">Missing / Unclear</h6>
                         <div className="flex flex-wrap gap-1">
                            {brief.missingInformation.map((m: string, i: number) => (
                               <span key={i} className="text-[9px] px-1.5 py-0.5 bg-error/5 text-error border border-error/10 font-mono">{m}</span>
                            ))}
                         </div>
                      </div>
                   )}
                </div>

             </div>

             {/* Match Reasons (if radar or hot opp) */}
             {brief.matchReasons && brief.matchReasons.length > 0 && (
                <div className="space-y-2">
                   <h5 className="text-[9px] text-on-surface-variant font-medium uppercase tracking-[0.3em] flex items-center gap-2">
                      <div className="w-4 h-[1px] bg-on-surface-variant/30"></div> Commercial Logic
                   </h5>
                   <div className="flex flex-wrap gap-2 mt-2">
                      {brief.matchReasons.map((r: string, i: number) => (
                         <span key={i} className="text-[10px] px-2 py-1 bg-surface-container border border-outline/30 text-on-surface font-sans">{r}</span>
                      ))}
                   </div>
                </div>
             )}

             {/* Footer Actions & Disclaimer */}
             <div className="pt-4 border-t border-outline/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-start gap-2 text-on-surface-variant opacity-70">
                   <Info className="w-3 h-3 mt-0.5 shrink-0" />
                   <p className="text-[8px] font-mono leading-tight max-w-sm uppercase tracking-widest">{brief.disclaimer}</p>
                </div>
                
                <div className="flex gap-2 w-full sm:w-auto shrink-0">
                   {error && <div className="text-[9px] text-error flex items-center">{error}</div>}
                   <button 
                      onClick={() => generateBrief(true)}
                      disabled={generating}
                      className="px-4 py-2 border border-outline/50 text-on-surface hover:border-primary text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                   >
                      {generating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Regenerate
                   </button>
                   {brief.suggestedActions?.[0] && (
                      <button 
                         onClick={() => handleActionClick(brief.suggestedActions[0])}
                         className="px-4 py-2 bg-primary text-black hover:bg-primary-container text-[9px] font-bold uppercase tracking-widest transition-colors shadow-sm"
                      >
                         {brief.suggestedActions[0]}
                      </button>
                   )}
                </div>
             </div>
          </div>
       )}
    </div>
  );
};

// Activity icon missing from lucide-react imports above
const Activity = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
);
