import React, { useState, useEffect } from 'react';
import { useAuth } from '../../lib/firebase';
import { useNotification } from '../../lib/NotificationContext';
import { generateNegotiationSuggestion, saveNegotiationSuggestion, getNegotiationSuggestions, NegotiationSuggestion } from '../../lib/negotiationCopilotService';
import { Bot, Copy, Save, CheckCircle, Trash2, ShieldAlert, Sparkles, RefreshCw, Layers } from 'lucide-react';
import { VoyageEstimate } from '../../lib/voyageEstimate';
import { cn } from '../../lib/utils';
import { useConfig } from '../../lib/ConfigContext';
import { Timestamp } from 'firebase/firestore';

interface NegotiationCopilotProps {
  dealRoomId: string;
  sourceType: string;
  sourceId: string;
  cargoSummary?: any;
  vesselSummary?: any;
  voyageEstimateSummary?: Partial<VoyageEstimate>;
  dealBriefSummary?: any;
  proximitySummary?: string;
  dealRoomStatus?: string;
  offerEvents?: any[];
  recapDraftTerms?: any;
  availableNotes?: any[];
}

const OUTPUT_TYPES = [
  'Generate broker-style reply',
  'Generate counter offer',
  'Generate polite follow-up',
  'Generate firm follow-up',
  'Generate risk objection',
  'Generate missing information request',
  'Generate recap-ready terms',
  'Generate negotiation summary',
  'Generate next-step recommendation'
];

const TONES = ['professional', 'concise', 'firm', 'diplomatic', 'premium', 'urgent', 'cautious'];

export function NegotiationCopilot({
  dealRoomId,
  sourceType,
  sourceId,
  cargoSummary,
  vesselSummary,
  voyageEstimateSummary,
  dealBriefSummary,
  proximitySummary,
  dealRoomStatus,
  offerEvents,
  recapDraftTerms,
  availableNotes
}: NegotiationCopilotProps) {
  const { user } = useAuth();
  const { notify } = useNotification();
  const { t } = useConfig();
  
  const [outputType, setOutputType] = useState(OUTPUT_TYPES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeVoyageEstimate, setIncludeVoyageEstimate] = useState(true);
  const [includeAIDealBrief, setIncludeAIDealBrief] = useState(true);
  const [includeRecapDraft, setIncludeRecapDraft] = useState(true);
  
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<Partial<NegotiationSuggestion> | null>(null);
  
  const [history, setHistory] = useState<NegotiationSuggestion[]>([]);

  const loadHistory = async () => {
    try {
      const h = await getNegotiationSuggestions(dealRoomId);
      setHistory(h);
    } catch (e) {
      console.warn("Could not load negotiation history.", e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [dealRoomId]);

  const handleGenerate = async () => {
    if (!user) return;
    setLoading(true);
    setSuggestion(null);
    try {
      const payload = {
         dealRoomId,
         sourceId,
         sourceType,
         outputType,
         tone,
         cargoSummary,
         vesselSummary,
         voyageEstimateSummary: includeVoyageEstimate ? voyageEstimateSummary : undefined,
         dealBriefSummary: includeAIDealBrief ? dealBriefSummary : undefined,
         proximitySummary: includeAIDealBrief ? proximitySummary : undefined,
         dealRoomStatus,
         offerEvents,
         recapDraftTerms: includeRecapDraft ? recapDraftTerms : undefined,
         privateNotes: includeNotes ? availableNotes?.map(n => (n.text || n.content || JSON.stringify(n))) : []
      };
      
      if (includeAIDealBrief && proximitySummary) {
          import('../../lib/proximityIntelligence').then(({ logProximityAudit }) => {
              logProximityAudit('proximity_used_in_negotiation_copilot', {
                  proximityLabel: proximitySummary.substring(0, 50),
                  dealRoomId,
                  sourceModule: 'negotiation_copilot'
              });
          });
      }

      const res = await generateNegotiationSuggestion(payload);
      
      setSuggestion({
        ...res,
        sourceType,
        sourceId,
        dealRoomId,
        outputType,
        tone,
        status: 'draft',
        createdAt: Timestamp.now()
      });
      
    } catch (e: any) {
      notify({ title: 'Error', type: 'error', message: e.message || 'Error generating suggestion' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveState = async (status: 'saved' | 'used' | 'discarded') => {
    if (!user || !suggestion) return;
    
    try {
      const toSave = {
        ...suggestion,
        createdByUid: user.uid,
        status,
        visibility: 'participants' as any,
        participantUids: [user.uid] // ideally pull participants from room
      };
      
      await saveNegotiationSuggestion(toSave);
      notify({ title: 'Saved', type: status === 'discarded' ? 'info' : 'success', message: `Suggestion marked as ${status}` });
      if (status !== 'saved') {
         setSuggestion(null);
      }
      loadHistory();
    } catch(e: any) {
       notify({ title: 'Error', type: 'error', message: "Failed to save state: " + e.message });
    }
  };

  const handleCopy = () => {
    if (suggestion?.suggestedMessage) {
      navigator.clipboard.writeText(suggestion.suggestedMessage);
      notify({ title: 'Success', type: 'success', message: "Copied to clipboard" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-outline rounded-xl p-4 md:p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-display text-on-surface">AI Negotiation Copilot</h3>
            <p className="text-sm text-on-surface-variant">Generate broker-style replies, strategies, and counter offers.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1 uppercase tracking-wider">Output Type</label>
            <select
              title="Select Output Type"
              className="w-full bg-background border border-outline rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
              value={outputType}
              onChange={(e) => setOutputType(e.target.value)}
            >
              {OUTPUT_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1 uppercase tracking-wider">Tone</label>
            <select
              title="Select Tone"
              className="w-full bg-background border border-outline rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary capitalize"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              {TONES.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-6 space-y-2">
          {voyageEstimateSummary && (
            <div className="flex items-center space-x-2">
              <input type="checkbox" checked={includeVoyageEstimate} onChange={e => setIncludeVoyageEstimate(e.target.checked)} className="rounded border-outline" />
              <span className="text-sm text-on-surface">Include Voyage Estimate summary</span>
            </div>
          )}
          {dealBriefSummary && (
            <div className="flex items-center space-x-2">
              <input type="checkbox" checked={includeAIDealBrief} onChange={e => setIncludeAIDealBrief(e.target.checked)} className="rounded border-outline" />
              <span className="text-sm text-on-surface">Include AI Deal Brief context</span>
            </div>
          )}
          {recapDraftTerms && Object.keys(recapDraftTerms).length > 0 && (
            <div className="flex items-center space-x-2">
              <input type="checkbox" checked={includeRecapDraft} onChange={e => setIncludeRecapDraft(e.target.checked)} className="rounded border-outline" />
              <span className="text-sm text-on-surface">Include Recap Draft terms</span>
            </div>
          )}
          {availableNotes && availableNotes.length > 0 && (
            <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-outline">
              <input 
                title="Include private notes"
                type="checkbox" 
                className="rounded border-outline bg-background" 
                checked={includeNotes} 
                onChange={e => setIncludeNotes(e.target.checked)} 
              />
              <span className="text-sm text-on-surface">Include private Deal Room notes in AI context</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-primary text-on-primary rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {suggestion ? "Regenerate" : "What should I reply?"}
          </button>
        </div>
      </div>

      {suggestion && (
        <div className="bg-surface border border-outline rounded-xl p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-start mb-4">
            <h4 className="font-display text-lg text-primary">Generated Suggestion</h4>
            <div className="flex items-center space-x-2">
               <span className={cn(
                 "px-2 py-1 text-[10px] uppercase tracking-wider font-medium rounded-full",
                 suggestion.recapReadiness === 'ready for recap' || suggestion.recapReadiness === 'ready for broker-side confirmation' ? "bg-green-100 text-green-700" :
                 suggestion.recapReadiness === 'almost ready' ? "bg-yellow-100 text-yellow-700" :
                 "bg-red-100 text-red-700"
               )}>
                 {suggestion.recapReadiness}
               </span>
            </div>
          </div>
          
          <div className="bg-background rounded-lg border border-outline p-4 mb-4 relative group">
            <p className="text-on-surface whitespace-pre-wrap">{suggestion.suggestedMessage}</p>
            <button
               onClick={handleCopy}
               className="absolute top-2 right-2 p-2 hover:bg-surface rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
               title="Copy to clipboard"
            >
              <Copy className="w-4 h-4 text-on-surface-variant" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-on-surface-variant mb-2">Strategy & Reasoning</div>
              <p className="text-sm text-on-surface">{suggestion.negotiationStrategy}</p>
              <p className="text-sm text-on-surface-variant mt-2">{suggestion.commercialReasoning}</p>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-on-surface-variant mb-2 flex items-center">
                <ShieldAlert className="w-3 h-3 mr-1" /> Risks & Missing Info
              </div>
              <ul className="list-disc list-inside text-sm text-on-surface-variant space-y-1">
                 {suggestion.keyRisks?.map((r, i) => <li key={i}>{r}</li>)}
                 {suggestion.missingInformation?.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </div>

          <div className="flex items-center p-3 bg-secondary/30 rounded-lg text-xs text-on-surface-variant mb-4 border border-outline">
            {suggestion.disclaimer}
          </div>

          <div className="flex items-center space-x-3 pt-4 border-t border-outline">
             <button onClick={() => handleSaveState('saved')} className="flex items-center px-4 py-2 hover:bg-surface border border-outline rounded-lg transition-colors text-sm font-medium"><Save className="w-4 h-4 mr-2" /> Save to Room</button>
             <button onClick={() => handleSaveState('used')} className="flex items-center px-4 py-2 hover:bg-green-50 hover:text-green-700 hover:border-green-200 border border-outline rounded-lg transition-colors text-sm font-medium"><CheckCircle className="w-4 h-4 mr-2" /> Mark as Used</button>
             <button onClick={() => handleSaveState('discarded')} className="flex items-center px-4 py-2 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-outline rounded-lg transition-colors text-sm font-medium"><Trash2 className="w-4 h-4 mr-2" /> Discard</button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-4">
           <h4 className="text-sm uppercase tracking-wider font-bold text-on-surface-variant">Suggestion History</h4>
           <div className="grid gap-3">
             {history.map(h => (
               <div key={h.id} className="bg-surface border border-outline p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between">
                 <div className="mb-3 md:mb-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className={cn(
                        "text-[10px] uppercase font-bold px-2 py-0.5 rounded-full",
                        h.status === 'used' ? "bg-green-100 text-green-700" :
                        h.status === 'discarded' ? "bg-red-100 text-red-700" :
                        "bg-primary/10 text-primary"
                      )}>{h.status}</span>
                      <span className="text-sm font-medium text-on-surface">{h.outputType} ({h.tone})</span>
                    </div>
                    <p className="text-sm text-on-surface-variant line-clamp-2">{h.suggestedMessage}</p>
                 </div>
                 <div className="flex items-center space-x-2 shrink-0">
                    <button onClick={() => { navigator.clipboard.writeText(h.suggestedMessage); notify({ title: 'Success', type: 'success', message: "Copied" }); }} className="p-2 border border-outline rounded-lg hover:bg-background"><Copy className="w-4 h-4"/></button>
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}
    </div>
  );
}
