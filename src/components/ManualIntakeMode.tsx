import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { parseEmail } from '../lib/geminiService';
import { cn, Cargo, Vessel } from '../lib/utils';
import { doc, setDoc, serverTimestamp, getDocs, collection, query, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useNotification } from '../lib/NotificationContext';
import { useWorkspace } from '../lib/WorkspaceContext';

const hashString = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
};

export const ManualIntakeMode = ({ 
    onClose, 
    defaultType = 'CARGO' 
}: { 
    onClose: () => void, 
    defaultType?: 'CARGO' | 'VESSEL' 
}) => {
  const { notify, addNotification, settings } = useNotification();
  const { currentWorkspace } = useWorkspace();
  const [text, setText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  
  const [selectedCargos, setSelectedCargos] = useState<Set<number>>(new Set());
  const [selectedVessels, setSelectedVessels] = useState<Set<number>>(new Set());

  const handleParse = async () => {
    if (!text.trim() || isParsing) return;
    setIsParsing(true);
    try {
      const fakeEmail: any = {
        id: `manual-${Date.now()}`,
        sender: 'Manual Entry',
        subject: 'Manual Broker Text',
        timestamp: new Date().toISOString(),
        summary: '',
        snippet: '',
        rawBody: text,
        isRead: true,
        labels: []
      };

      const result = await parseEmail(fakeEmail, auth.currentUser?.uid);
      setExtractionResult(result);

      const cList = result.cargoes || (result.cargo ? [result.cargo] : []);
      setSelectedCargos(new Set(cList.map((_: any, i: number) => i)));

      const vList = result.vessels || (result.vessel ? [result.vessel] : []);
      setSelectedVessels(new Set(vList.map((_: any, i: number) => i)));

      notify({
        title: 'Extraction Complete',
        message: 'Successfully structured content from text.',
        type: 'success'
      });
    } catch (e) {
      console.error(e);
      notify({
        title: 'Parse Error',
        message: 'Could not extract data from the provided text.',
        type: 'error'
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handlePublish = async () => {
    if (!extractionResult || isPublishing) return;
    if (!auth.currentUser) {
        notify({ title: 'Auth Error', message: 'You must be logged in.', type: 'error' });
        return;
    }

    setIsPublishing(true);
    try {
      const userId = auth.currentUser.uid;
      let created = 0;
      let skipped = 0;
      let failed = 0;

      const rawTextHash = hashString(text.substring(0, 1000));

      // Handle CARGO
      if (extractionResult.type === 'CARGO' || extractionResult.type === 'CARGO_LIST' || extractionResult.type === 'MIXED_LIST') {
        const cargosToPublish = (extractionResult.cargoes || (extractionResult.cargo ? [extractionResult.cargo] : []))
          .filter((_: any, i: number) => selectedCargos.has(i));
        
        for (let i = 0; i < cargosToPublish.length; i++) {
          const item = cargosToPublish[i];
          if (!item.commodity && !item.loadPort && !item.dischargePort) {
            failed++;
            continue;
          }

          const entryNo = item.entry_no || (i + 1);
          const dedupeKey = `user-${userId}-text-${rawTextHash}-cargo-${entryNo}`;

          const existingQuery = query(collection(db, 'cargos'), where('sourceId', '==', dedupeKey));
          const existingDocs = await getDocs(existingQuery);
          
          if (!existingDocs.empty) {
            skipped++;
            continue;
          }

          const id = `CRG-${Math.floor(1000 + Math.random() * 9000)}-TXT`;
          
          const cleanItem = { ...item };
          delete cleanItem.missing_fields;
          delete cleanItem.entry_no;
          delete cleanItem.raw_commodity;

          await setDoc(doc(db, 'cargos', id), {
            commodity: '',
            loadPort: '',
            dischargePort: '',
            laycan: '',
            quantity: '',
            terms: '',
            ...cleanItem,
            id,
            userId,
            ownerId: userId,
            workspaceId: currentWorkspace?.id || userId,
            source: 'manual_text',
            sourceId: dedupeKey,
            rawText: text.substring(0, 5000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            status: 'ACTIVE',
            confidence: item.missing_fields ? Math.max(10, 100 - (item.missing_fields.length * 15)) : 100
          });
          created++;

          // Check for risk terms
          const combinedStr = `${item.laycan || ''} ${item.terms || ''} ${item.dischargePort || ''}`.toUpperCase();
          if (combinedStr.includes('CQD')) {
            const title = settings?.mode === 'broker_humor'
              ? "🟠 CQD detected — laytime fog ahead. Clarify before fixing."
              : "Risk Term Detected: CQD";
            addNotification({
              title,
              message: `Cargo ${item.commodity} contains CQD terms.`,
              severity: 'warning',
              entityType: 'risk',
              entityId: id,
              source: 'system'
            });
          }
        }
      }
      
      // Handle VESSEL
      if (extractionResult.type === 'VESSEL' || extractionResult.type === 'VESSEL_LIST' || extractionResult.type === 'MIXED_LIST') {
        const vesselsToPublish = (extractionResult.vessels || (extractionResult.vessel ? [extractionResult.vessel] : []))
          .filter((_: any, i: number) => selectedVessels.has(i));
        
        for (let i = 0; i < vesselsToPublish.length; i++) {
          const item = vesselsToPublish[i];
          if (!item.name && !item.dwt && !item.openPort) {
            failed++;
            continue;
          }

          const entryNo = item.entry_no || (i + 1);
          const dedupeKey = `user-${userId}-text-${rawTextHash}-vessel-${entryNo}`;

          const existingQuery = query(collection(db, 'vessels'), where('sourceId', '==', dedupeKey));
          const existingDocs = await getDocs(existingQuery);
          
          if (!existingDocs.empty) {
            skipped++;
            continue;
          }

          const id = `VSL-${Math.floor(1000 + Math.random() * 9000)}-TXT`;
          
          const cleanItem = { ...item };
          delete cleanItem.missing_fields;
          delete cleanItem.entry_no;

          await setDoc(doc(db, 'vessels', id), {
            name: '',
            type: '',
            openPort: '',
            openDate: '',
            dwt: '',
            gear: '',
            ...cleanItem,
            id,
            userId,
            ownerId: userId,
            workspaceId: currentWorkspace?.id || userId,
            source: 'manual_text',
            sourceId: dedupeKey,
            rawText: text.substring(0, 5000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            status: 'OPEN',
            confidence: item.missing_fields ? Math.max(10, 100 - (item.missing_fields.length * 15)) : 100
          });
          created++;
        }
      }

      if (skipped > 0) {
        const title = settings?.mode === 'broker_humor'
          ? "♻️ Duplicate skipped. The desk remembers — unlike some charterers."
          : "Duplicate Item Skipped";
        addNotification({
          title,
          message: `Omitted ${skipped} previously existing records.`,
          severity: 'info',
          entityType: 'system',
          source: 'system'
        });
      }

      notify({
        title: 'Publish Complete',
        message: `Created: ${created} | Skipped (Dedupe): ${skipped} | Failed: ${failed}`,
        type: 'success'
      });
      onClose();

    } catch (e) {
      console.error(e);
      notify({
        title: 'Error Publishing',
        message: 'An error occurred while saving the data.',
        type: 'error'
      });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface">
        {!extractionResult ? (
            <div className="p-6 flex flex-col h-full space-y-4">
                <div className="text-sm font-bold text-on-surface uppercase tracking-wider">Paste Broker Text</div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                    Paste raw text from WhatsApp, Telegram, or any broker circular.
                    Our AI will structure the content into exact Cargo and Vessel properties.
                </p>
                <textarea 
                    value={text} 
                    onChange={e => setText(e.target.value)} 
                    placeholder="E.g. MV PACIFIC 50,000 dwt open Singapore 20-25 June..."
                    className="flex-1 w-full bg-surface-container border border-outline p-4 text-xs text-on-surface focus:border-primary focus:outline-none resize-none font-mono"
                />
                <button 
                    onClick={handleParse}
                    disabled={isParsing || !text.trim()}
                    className={cn(
                        "w-full h-12 bg-primary text-on-primary font-bold uppercase tracking-widest text-[12px] flex items-center justify-center gap-2",
                        (isParsing || !text.trim()) && "opacity-50 cursor-not-allowed"
                    )}
                >
                    {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isParsing ? 'PARSING...' : 'PARSE CONTENT'}
                </button>
            </div>
        ) : (
            <div className="flex flex-col h-full relative overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-24">
                     <div className="flex items-center justify-between pb-4 border-b border-outline">
                        <div>
                           <div className="text-sm font-bold text-on-surface uppercase tracking-wider flex items-center gap-2">
                               <Sparkles className="h-4 w-4 text-primary" />
                               Extraction Result
                               {extractionResult.cached && (
                                   <span className="ml-2 text-[9px] bg-secondary/20 text-secondary border border-secondary/30 px-2 py-0.5 rounded-sm uppercase tracking-widest font-mono flex items-center gap-1">
                                      <Check className="h-3 w-3" /> Cached
                                   </span>
                               )}
                               {extractionResult.memoryUsed?.senderProfileUsed && !extractionResult.cached && (
                                   <span className="ml-2 text-[9px] bg-tertiary/20 text-tertiary border border-tertiary/30 px-2 py-0.5 rounded-sm uppercase tracking-widest font-mono">
                                      Sender Known
                                   </span>
                               )}
                           </div>
                           <div className="text-xs text-on-surface-variant mt-1 max-w-lg truncate pr-4">
                               {extractionResult.summary || 'Content identified successfully.'}
                           </div>
                        </div>
                        <button onClick={() => setExtractionResult(null)} className="text-[10px] text-tertiary uppercase tracking-widest hover:text-on-surface transition-colors whitespace-nowrap">
                            Edit Text
                        </button>
                     </div>

                     {extractionResult.cargoes && extractionResult.cargoes.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-[10px] font-bold text-primary tracking-widest uppercase">CARGOES</div>
                                <div className="flex gap-2">
                                <button onClick={() => setSelectedCargos(new Set(extractionResult.cargoes.map((_:any,i:number)=>i)))} className="text-[9px] text-primary hover:underline uppercase tracking-wider">Select All</button>
                                <button onClick={() => setSelectedCargos(new Set())} className="text-[9px] text-primary hover:underline uppercase tracking-wider">Deselect All</button>
                                </div>
                            </div>
                            {extractionResult.cargoes.map((cargo: any, idx: number) => (
                                <div key={`cargo-${idx}`} className={cn("bg-surface border p-3 space-y-2 relative transition-all", selectedCargos.has(idx) ? "border-primary shadow-[0_0_10px_rgba(29,155,240,0.1)]" : "border-outline opacity-50")}>
                                <div className="absolute top-3 left-3 z-10 cursor-pointer" onClick={() => {
                                    const newSet = new Set(selectedCargos);
                                    if (newSet.has(idx)) newSet.delete(idx);
                                    else newSet.add(idx);
                                    setSelectedCargos(newSet);
                                }}>
                                    <div className={cn("w-4 h-4 border flex items-center justify-center transition-colors", selectedCargos.has(idx) ? "bg-primary border-primary text-black" : "border-outline bg-transparent")}>
                                        {selectedCargos.has(idx) && <Check className="w-3 h-3" />}
                                    </div>
                                </div>
                                <div className="pl-6">
                                    <div className="absolute top-0 right-0 bg-primary/20 text-primary px-2 py-0.5 text-[8px] font-bold">CARGO {idx + 1}</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                                    {Object.entries(cargo).filter(([k, v]) => v && k !== 'missing_fields' && k !== 'entry_no' && (typeof v !== 'object' || Array.isArray(v))).map(([key, value]) => (
                                        <div key={key} className="bg-surface-container p-2 border border-outline/50">
                                        <div className="text-on-surface-variant text-[8px] tracking-wider uppercase mb-1">{key.replace(/([A-Z])/g, '_$1')}</div>
                                        <div className="text-on-surface text-[11px] font-bold truncate tracking-tight">{Array.isArray(value) ? value.join(', ') : String(value)}</div>
                                        </div>
                                    ))}
                                    </div>
                                    {cargo.missing_fields && cargo.missing_fields.length > 0 && (
                                        <div className="text-[9px] text-red-400/80 mt-3 font-mono">⚠️ Missing: {cargo.missing_fields.join(', ')}</div>
                                    )}
                                </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {extractionResult.vessels && extractionResult.vessels.length > 0 && (
                        <div className="space-y-2 mt-6">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-[10px] font-bold text-secondary tracking-widest uppercase">VESSELS</div>
                                <div className="flex gap-2">
                                <button onClick={() => setSelectedVessels(new Set(extractionResult.vessels.map((_:any,i:number)=>i)))} className="text-[9px] text-secondary hover:underline uppercase tracking-wider">Select All</button>
                                <button onClick={() => setSelectedVessels(new Set())} className="text-[9px] text-secondary hover:underline uppercase tracking-wider">Deselect All</button>
                                </div>
                            </div>
                            {extractionResult.vessels.map((vessel: any, idx: number) => (
                                <div key={`vessel-${idx}`} className={cn("bg-surface border p-3 space-y-2 relative transition-all", selectedVessels.has(idx) ? "border-secondary shadow-[0_0_10px_rgba(30,215,96,0.1)]" : "border-outline opacity-50")}>
                                <div className="absolute top-3 left-3 z-10 cursor-pointer" onClick={() => {
                                    const newSet = new Set(selectedVessels);
                                    if (newSet.has(idx)) newSet.delete(idx);
                                    else newSet.add(idx);
                                    setSelectedVessels(newSet);
                                }}>
                                    <div className={cn("w-4 h-4 border flex items-center justify-center transition-colors", selectedVessels.has(idx) ? "bg-secondary border-secondary text-black" : "border-outline bg-transparent")}>
                                        {selectedVessels.has(idx) && <Check className="w-3 h-3" />}
                                    </div>
                                </div>
                                <div className="pl-6">
                                    <div className="absolute top-0 right-0 bg-secondary/20 text-secondary px-2 py-0.5 text-[8px] font-bold">VESSEL {idx + 1}</div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                                    {Object.entries(vessel).filter(([k, v]) => v && k !== 'missing_fields' && k !== 'entry_no' && (typeof v !== 'object' || Array.isArray(v))).map(([key, value]) => (
                                        <div key={key} className="bg-surface-container p-2 border border-outline/50">
                                        <div className="text-on-surface-variant text-[8px] tracking-wider uppercase mb-1">{key.replace(/([A-Z])/g, '_$1')}</div>
                                        <div className="text-on-surface text-[11px] font-bold truncate tracking-tight">{Array.isArray(value) ? value.join(', ') : String(value)}</div>
                                        </div>
                                    ))}
                                    </div>
                                    {vessel.missing_fields && vessel.missing_fields.length > 0 && (
                                        <div className="text-[9px] text-red-400/80 mt-3 font-mono">⚠️ Missing: {vessel.missing_fields.join(', ')}</div>
                                    )}
                                </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {extractionResult.type === 'INQUIRY' && (
                        <div className="p-4 bg-tertiary/10 border border-tertiary text-tertiary text-xs">
                          This content appears to be an inquiry, question, or general chat. No structured cargo or vessel details could be found.
                        </div>
                    )}

                    {!(extractionResult.cargoes?.length) && !(extractionResult.vessels?.length) && extractionResult.type !== 'INQUIRY' && (
                        <div className="p-4 bg-surface text-on-surface-variant text-xs text-center border border-outline border-dashed">
                           No structured data matched. Only clear Cargo and Vessel positions are currently saved.
                        </div>
                    )}
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-surface-container via-surface-container to-transparent pt-12">
                     <button
                        onClick={handlePublish}
                        disabled={isPublishing || (selectedCargos.size === 0 && selectedVessels.size === 0)}
                        className={cn("w-full h-14 flex items-center justify-center bg-primary text-on-primary font-bold uppercase tracking-widest text-[12px] shadow-[0_4px_20px_rgba(29,155,240,0.2)] hover:opacity-90 transition-all", (isPublishing || (selectedCargos.size === 0 && selectedVessels.size === 0)) && "opacity-50 cursor-not-allowed")}
                        >
                        {(() => {
                            if (isPublishing) return <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> PUBLISHING...</>;

                            const cLen = selectedCargos.size;
                            const vLen = selectedVessels.size;
                            
                            if (cLen > 0 || vLen > 0) {
                            const selections = [];
                            if (cLen > 0) selections.push(`${cLen} CARGOES`);
                            if (vLen > 0) selections.push(`${vLen} VESSELS`);
                            return `PUBLISH SELECTED (${selections.join(' & ')})`;
                            }
                            
                            return 'PUBLISH SELECTED';
                        })()}
                     </button>
                </div>
            </div>
        )}
    </div>
  );
};
