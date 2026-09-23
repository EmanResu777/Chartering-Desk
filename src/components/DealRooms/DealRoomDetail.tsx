import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Save, Edit2, MessageSquare, Anchor, TrendingUp, Users, FileText, CheckCircle, Package2, ArrowRight, ShieldCheck, Mail, Phone, Lock, Plus, Map as MapIcon } from 'lucide-react';
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { db, useAuth } from '../../lib/firebase';
import { DealRoom, DealRoomNote, DealRoomStatus, updateDealRoom, addDealRoomNote, addDealRoomAudit } from '../../lib/dealRoomService';
import { cn } from '../../lib/utils';
import { AIDealBriefCard } from '../AIDealBriefCard';
import { VoyageEstimateSection } from '../VoyageEstimateSection';
import { NegotiationCopilot } from './NegotiationCopilot';
import { OpportunityMap } from '../OpportunityMap';
import { useNotification } from '../../lib/NotificationContext';
import { calculateProximity } from '../../lib/proximityIntelligence';
import { getRouteEstimate, RoutingEstimate } from '../../lib/routingClient';

interface DealRoomDetailProps {
  roomId: string;
  onClose: () => void;
}

export const DealRoomDetail: React.FC<DealRoomDetailProps> = ({ roomId, onClose }) => {
  const { user } = useAuth();
  const [room, setRoom] = useState<DealRoom | null>(null);
  const [notes, setNotes] = useState<DealRoomNote[]>([]);
  const [loading, setLoading] = useState(true);
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState<'overview' | 'cargo' | 'vessel' | 'counterparties' | 'ai_brief' | 'copilot' | 'map' | 'offers' | 'notes' | 'documents' | 'recap' | 'audit'>('overview');
  const [routeObj, setRouteObj] = useState<RoutingEstimate | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const unsubRoom = onSnapshot(doc(db, 'dealRooms', roomId), (snap) => {
      if (snap.exists()) {
        setRoom({ id: snap.id, ...snap.data() } as DealRoom);
        setLoading(false);
      }
    });

    const unsubNotes = onSnapshot(
      query(collection(db, 'dealRoomNotes'), where('dealRoomId', '==', roomId), orderBy('createdAt', 'desc')),
      (snap) => {
        setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as DealRoomNote)));
      }
    );

    return () => {
      unsubRoom();
      unsubNotes();
    };
  }, [roomId]);

  useEffect(() => {
    if (!room || !room.geography?.vesselOpeningLocation || !room.geography?.cargoLoadLocation) return;
    let isActive = true;
    getRouteEstimate({
       fromCoordinates: room.geography.vesselOpeningLocation,
       toCoordinates: room.geography.cargoLoadLocation,
       dealRoomId: roomId,
       speedKnots: 12
    }).then(res => {
       if (isActive && res) setRouteObj(res);
    });
    return () => { isActive = false; };
  }, [room?.geography?.vesselOpeningLocation, room?.geography?.cargoLoadLocation, roomId]);

  if (loading || !room) {
    return (
      <motion.div 
        initial={{ x: '100%', opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0.5 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute inset-y-0 right-0 w-full lg:w-[800px] bg-surface-container-low border-l border-outline/30 shadow-2xl z-50 flex items-center justify-center p-4 sm:p-8 backdrop-blur-3xl"
      >
         <div className="w-8 h-8 border-t-2 border-primary border-solid rounded-full animate-spin"></div>
      </motion.div>
    );
  }

  let prox: any = null;
  if (room.linkedCargoId && room.linkedVesselId) {
    const mockC: any = { id: room.linkedCargoId, loadLocation: room.geography?.cargoLoadLocation };
    const mockV: any = { id: room.linkedVesselId, openingLocation: room.geography?.vesselOpeningLocation };
    prox = calculateProximity(mockV, mockC, 'deal_room');
  }

  const handleStatusChange = async (newStatus: DealRoomStatus) => {
    if (!user) return;
    try {
      await updateDealRoom(roomId, { status: newStatus }, user.uid, "Status changed to " + newStatus);
      notify({ type: 'success', title: 'Status updated', message: "Status updated to " + newStatus });
    } catch (err: any) {
      notify({ type: 'error', title: 'Error', message: err.message });
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: ShieldCheck },
    { id: 'cargo', label: 'Cargo', icon: TrendingUp, disabled: !room.linkedCargoId },
    { id: 'vessel', label: 'Vessel', icon: Anchor, disabled: !room.linkedVesselId },
    { id: 'counterparties', label: 'Counterparties', icon: Users },
    { id: 'ai_brief', label: 'AI Deal Brief', icon: BotIcon },
    { id: 'copilot', label: 'Copilot', icon: BotIcon },
    { id: 'map', label: 'Map / Location', icon: MapIcon },
    { id: 'offers', label: 'Negotiation', icon: ArrowRight },
    { id: 'notes', label: 'Notes', icon: MessageSquare },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'recap', label: 'Recap Draft', icon: Package2 },
    { id: 'audit', label: 'Audit Timeline', icon: ClockIcon },
  ];

  return (
    <motion.div 
      initial={{ x: '100%', opacity: 0.5 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.5 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="absolute inset-y-0 right-0 w-full lg:w-[900px] bg-surface-container border-l border-outline/30 z-50 flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
    >
       <div className="flex-none p-3 sm:p-6 border-b border-outline/20 bg-surface-container-low flex justify-between items-start gap-3 sticky top-0 z-10 backdrop-blur-md">
         <div>
            <div className="flex items-center gap-3 mb-2">
                <span className="px-2 py-0.5 text-[8px] uppercase tracking-widest font-bold font-mono border border-primary text-primary bg-primary/10">Deal Room</span>
                <span className="text-[10px] uppercase font-mono tracking-widest text-on-surface-variant font-bold">{room.id.substring(0,8)}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display text-on-surface font-light flex items-center gap-3 break-words">
               {room.title}
            </h2>
         </div>
         <div className="flex items-center gap-4">
            <select
              value={room.status}
              onChange={(e) => handleStatusChange(e.target.value as DealRoomStatus)}
              className="bg-surface border border-outline/30 text-on-surface text-[10px] uppercase tracking-widest font-mono p-2 pr-6 outline-none hover:border-primary/50 transition-colors"
            >
               {['draft', 'active', 'negotiating', 'recap_draft', 'awaiting_confirmation', 'confirmed_internal', 'closed', 'archived'].map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
               ))}
            </select>
            <button onClick={onClose} className="p-2 hover:bg-surface-container-highest rounded-full text-on-surface-variant hover:text-on-surface transition-colors" title="Close Drawer">
               <X className="w-5 h-5" />
            </button>
         </div>
       </div>

       <div className="flex-none bg-surface-container-low border-b border-outline/20 overflow-x-auto no-scrollbar">
          <div className="flex px-4 min-w-max">
            {tabs.map(t => (
               <button
                 key={t.id}
                 disabled={t.disabled}
                 onClick={() => !t.disabled && setActiveTab(t.id as any)}
                 className={cn(
                   "px-4 py-3 text-[10px] uppercase tracking-widest font-bold font-mono flex items-center gap-2 border-b-2 transition-all whitespace-nowrap",
                   activeTab === t.id ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface",
                   t.disabled && "opacity-30 cursor-not-allowed hover:text-on-surface-variant"
                 )}
               >
                 <t.icon className={cn("w-3.5 h-3.5", activeTab === t.id && "text-primary")} />
                 {t.label}
               </button>
            ))}
          </div>
       </div>

       <div className="flex-1 overflow-y-auto p-6 bg-surface">
         {activeTab === 'overview' && <OverviewTab room={room} onTabChange={setActiveTab} />}
         {activeTab === 'cargo' && room.linkedCargoId && <div className="p-4 border border-outline/30 text-center"><h3 className="text-xl font-display text-primary mb-2">Linked Cargo ID: {room.linkedCargoId}</h3><p className="text-on-surface-variant text-sm">Cargo preview implemented here mapping to original cargo fields.</p></div>}
         {activeTab === 'vessel' && room.linkedVesselId && <div className="p-4 border border-outline/30 text-center"><h3 className="text-xl font-display text-primary mb-2">Linked Vessel ID: {room.linkedVesselId}</h3><p className="text-on-surface-variant text-sm">Vessel preview implemented here.</p></div>}
         {activeTab === 'counterparties' && <CounterpartiesTab room={room} /> }
         {activeTab === 'ai_brief' && (
           <div className="max-w-2xl space-y-6">
             <VoyageEstimateSection 
                itemId={room.id}
                itemType="deal_room"
                dealRoomId={room.id}
                cargoId={room.linkedCargoId}
                vesselId={room.linkedVesselId}
                proximityDistanceNm={routeObj?.routeDistanceNm ?? prox?.distanceNm}
             />
             <AIDealBriefCard 
               itemId={room.linkedCargoId || room.linkedVesselId || room.id} 
               itemType={room.linkedCargoId ? 'cargo' : room.linkedVesselId ? 'vessel' : 'hotOpp'} 
               dealType="Deal Room Evaluation" 
               contextContext={prox ? { proximitySummary: `${prox.proximityLabel.toUpperCase()} - ${prox.laycanCompatibility}. ${prox.explanation}` } : {}}
             />
           </div>
         )}
         {activeTab === 'copilot' && (
           <NegotiationCopilot 
             dealRoomId={room.id}
             sourceType="dealRoom"
             sourceId={room.id}
             dealRoomStatus={room.status}
             dealBriefSummary={room.title}
             availableNotes={notes}
           />
         )}
         {activeTab === 'map' && (() => {
           let prox: any = null;
           if (room.linkedCargoId && room.linkedVesselId) {
             const mockC: any = { id: room.linkedCargoId, loadLocation: room.geography?.cargoLoadLocation };
             const mockV: any = { id: room.linkedVesselId, openingLocation: room.geography?.vesselOpeningLocation };
             prox = calculateProximity(mockV, mockC, 'deal_room');
           }
           
           return (
            <div className="space-y-4">
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-sm text-primary flex flex-col gap-4">
                 <div className="flex items-start">
                    <ShieldCheck className="w-5 h-5 mr-3 shrink-0" />
                    <div>
                       <p className="font-bold mb-1">Location intelligence is advisory only.</p>
                       <p className="text-xs">Location data is derived from structured sources. This view is restricted to Deal Room participants only. Approximate proximity distances do not guarantee final sea routing or TCE assumptions.</p>
                    </div>
                 </div>
                 
                 {prox && prox.proximityScore > 0 && (
                   <div className="bg-surface border border-outline/20 p-4 rounded-sm flex flex-col gap-2 mt-2 font-mono text-on-surface">
                     <div className="flex justify-between items-center bg-surface-container pb-2 mb-2 border-b border-outline/10 p-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-primary">Distance Confidence: {prox.distanceConfidence}</span>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-tertiary">Laycan: {prox.laycanCompatibility}</span>
                     </div>
                     <div className="grid grid-cols-2 gap-4 text-xs">
                        <div><strong className="text-on-surface-variant">Vessel Pos:</strong> {room.geography?.vesselOpeningLocation ? 'Available' : 'Unknown'}</div>
                        <div><strong className="text-on-surface-variant">Cargo Load:</strong> {room.geography?.cargoLoadLocation ? 'Available' : 'Unknown'}</div>
                        <div><strong className="text-on-surface-variant">Proximity:</strong> {prox.proximityLabel} {prox.distanceNm != null && `(${prox.distanceNm.toFixed(0)} NM)`}</div>
                        <div><strong className="text-on-surface-variant">Proximity Score:</strong> {prox.proximityScore}</div>
                     </div>
                     <p className="text-[10px] text-on-surface-variant mt-2 border-t border-outline/10 pt-2">{prox.explanation}</p>
                     <p className="text-[9px] text-tertiary mt-1 italic">{prox.assumptions}</p>
                   </div>
                 )}
              </div>
              <OpportunityMap items={[
                ...(room.linkedCargoId ? [{ id: room.linkedCargoId, commodity: room.title || 'Cargo', loadLocation: room.geography?.cargoLoadLocation, dischargeLocation: room.geography?.cargoDischargeLocation, loadPort: 'Load Port', dischargePort: 'Discharge Port' }] : []),
                ...(room.linkedVesselId ? [{ id: room.linkedVesselId, name: 'Tonnage', dwt: 10000, openingLocation: room.geography?.vesselOpeningLocation, openPort: 'Open Port' }] : [])
              ]} itemType="mixed" />
            </div>
           );
         })()}
         {activeTab === 'offers' && <OffersTab room={room} /> }
         {activeTab === 'notes' && <NotesTab room={room} notes={notes} /> }
         {activeTab === 'documents' && <DocumentsTab room={room} /> }
         {activeTab === 'recap' && <RecapTab room={room} /> }
         {activeTab === 'audit' && <AuditTab room={room} />}
       </div>
    </motion.div>
  );
};

const OverviewTab = ({ room, onTabChange }: { room: DealRoom, onTabChange: (tab: any) => void }) => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border border-outline/30 bg-surface-container-low p-6 font-mono text-xs">
         <div className="flex items-center gap-2 text-error mb-4 border-b border-error/20 pb-4">
            <Lock className="w-4 h-4" />
            <span className="uppercase tracking-widest font-bold">Privacy Controls Active: Private to Participants</span>
         </div>
         <div className="grid grid-cols-2 gap-y-4">
            <div><span className="text-on-surface-variant uppercase tracking-widest">Deal Source:</span> <span className="text-primary ml-2">{room.source || 'Manual Flow'}</span></div>
            <div><span className="text-on-surface-variant uppercase tracking-widest">Created By:</span> <span className="text-on-surface ml-2">{room.createdByUid}</span></div>
            <div><span className="text-on-surface-variant uppercase tracking-widest">Participants:</span> <span className="text-on-surface ml-2">{room.participantUids?.length || 0}</span></div>
            <div><span className="text-on-surface-variant uppercase tracking-widest">Current Status:</span> <span className="text-on-surface ml-2 bg-on-surface-variant/20 px-2 py-0.5">{room.status}</span></div>
         </div>
      </div>
      
      <div className="flex gap-4">
         <button onClick={() => onTabChange('offers')} className="flex-1 bg-primary/10 border border-primary/30 p-6 flex flex-col items-center justify-center hover:bg-primary/20 transition-colors group cursor-pointer text-center">
            <ArrowRight className="w-6 h-6 text-primary mb-2" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-primary font-mono group-hover:text-primary-light">Manage Offers & Negotiation</span>
            <span className="text-[9px] uppercase tracking-widest text-on-surface-variant mt-2 font-sans opacity-70">Internal workflow tracking only</span>
         </button>
         
         <button onClick={() => onTabChange('recap')} className="flex-1 bg-surface-container-low border border-outline/50 p-6 flex flex-col items-center justify-center hover:border-primary/50 hover:bg-surface-container transition-colors group cursor-pointer text-center">
            <Package2 className="w-6 h-6 text-on-surface-variant group-hover:text-primary mb-2 transition-colors" />
            <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface font-mono group-hover:text-primary">Proceed to Recap Draft</span>
            <span className="text-[9px] uppercase tracking-widest text-on-surface-variant mt-2 font-sans opacity-70">Start broker-side confirmation</span>
         </button>
      </div>

      <div className="text-[9px] text-on-surface-variant/70 uppercase tracking-widest font-mono text-center p-4 border border-dashed border-outline/30">
          Principal approval and standard authorization workflows remain manual. Operations recorded in this Deal Room are internal tracking mechanisms.
      </div>
    </div>
  );
};

const CounterpartiesTab = ({ room }: { room: DealRoom }) => {
   return (
      <div className="space-y-4 max-w-3xl">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-display uppercase tracking-widest text-on-surface">Linked Counterparties</h3>
             <button className="text-[10px] font-bold uppercase tracking-widest text-primary border border-primary px-4 py-2 hover:bg-primary/10">Add Counterparty</button>
          </div>
          <div className="border border-outline/30 p-8 text-center text-on-surface-variant text-sm font-mono tracking-widest uppercase">
             {room.linkedCounterpartyIds?.length ? `Linked IDs: ${room.linkedCounterpartyIds.join(', ')}` : 'No counterparties linked yet'}
          </div>
      </div>
   );
};

const OffersTab = ({ room }: { room: DealRoom }) => {
  const { user } = useAuth();
  const { notify } = useNotification();
  
  const handleAction = async (action: string) => {
     if(!user) return;
     await addDealRoomAudit(room.id, "Negotiation Event: " + action, user.uid);
     notify({ type: 'success', title: 'Recorded', message: action });
  };

  return (
    <div className="max-w-3xl space-y-6">
        <h3 className="text-lg font-display uppercase tracking-widest text-on-surface">Offer & Workflow Tracking</h3>
        <p className="text-[10px] uppercase font-mono text-on-surface-variant max-w-xl">
           Track the negotiation state. This is for internal visibility only and does not send communication to external parties.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
           {['Offer Created', 'Interest Sent', 'Contact Requested', 'Counter Offer', 'Terms Discussed', 'Subject / Validity', 'Follow-Up Required', 'Ready for Recap', 'Ready for Confirmation'].map(act => (
              <button key={act} onClick={() => handleAction(act)} className="border border-outline/30 bg-surface-container hover:bg-primary/5 hover:border-primary/50 text-left p-4 transition-all">
                 <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase font-bold tracking-widest font-mono text-on-surface block mb-2">{act}</span>
                    <Plus className="w-3 h-3 text-primary" />
                 </div>
              </button>
           ))}
        </div>
    </div>
  );
};

const NotesTab = ({ room, notes }: { room: DealRoom, notes: DealRoomNote[] }) => {
   const [noteText, setNoteText] = useState('');
   const [noteType, setNoteType] = useState<DealRoomNote['noteType']>('general');
   const { user } = useAuth();

   const handleAddNote = async () => {
      if(!user || !noteText.trim()) return;
      await addDealRoomNote(room.id, { text: noteText, noteType, visibility: 'participants' }, user.uid);
      setNoteText('');
   };

   return (
      <div className="max-w-2xl space-y-6 h-full flex flex-col">
         <div className="flex-none border border-outline/30 bg-surface-container p-4">
            <select value={noteType} onChange={(e) => setNoteType(e.target.value as any)} className="w-full bg-surface border border-outline/30 p-2 mb-3 text-[10px] uppercase tracking-widest font-mono text-on-surface outline-none">
               {['general', 'call', 'email', 'whatsapp', 'negotiation', 'recap', 'risk', 'follow_up'].map(t => (
                  <option key={t} value={t}>{t} Note</option>
               ))}
            </select>
            <textarea 
               value={noteText}
               onChange={e => setNoteText(e.target.value)}
               placeholder="Write a secure note visible to deal participants..."
               className="w-full h-24 bg-surface-container-low border border-outline/50 p-3 text-on-surface text-sm font-sans focus:border-primary/50 outline-none resize-none transition-colors mb-3"
            />
            <button disabled={!noteText.trim()} onClick={handleAddNote} className="px-6 py-2 bg-primary text-black font-bold uppercase tracking-widest text-[10px] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90">Add Note</button>
         </div>

         <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {notes.map(n => (
               <div key={n.id} className="border border-outline/20 bg-surface-container-low p-4 relative group">
                   <div className="flex justify-between items-center mb-2">
                      <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-primary font-mono">{n.noteType} Note</span>
                      <span className="text-[9px] text-on-surface-variant font-mono">{new Date(n.createdAt?.toDate ? n.createdAt.toDate() : Date.now()).toLocaleString()}</span>
                   </div>
                   <p className="text-sm font-sans text-on-surface whitespace-pre-wrap">{n.text}</p>
               </div>
            ))}
            {notes.length === 0 && <div className="text-center p-8 text-on-surface-variant text-[10px] uppercase tracking-widest font-mono border border-dashed border-outline/20">No internal notes yet.</div>}
         </div>
      </div>
   );
};

const DocumentsTab = ({ room }: { room: DealRoom }) => (
   <div className="max-w-3xl space-y-4">
      <h3 className="text-lg font-display uppercase tracking-widest text-on-surface">Documents</h3>
      {room.linkedRecapId && (
        <div className="border border-outline/30 p-4 bg-surface-container-low flex justify-between items-center">
           <div>
             <div className="text-[10px] uppercase tracking-widest text-primary font-bold">Recap Draft Linked</div>
             <div className="text-sm font-mono text-on-surface mt-1">{room.linkedRecapId}</div>
           </div>
           <button className="px-3 py-1.5 border border-outline/50 hover:bg-surface text-[9px] uppercase tracking-widest font-bold">View Source</button>
        </div>
      )}
      <div className="border border-dashed border-outline/30 p-12 flex flex-col items-center justify-center text-center group hover:border-primary/50 transition-colors cursor-not-allowed cursor-pointer">
         <FileText className="w-8 h-8 text-on-surface-variant group-hover:text-primary mb-4 opacity-50" />
         <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface font-mono">Document Management Placeholder (Not Implemented)</p>
         <p className="text-[9px] uppercase tracking-widest text-on-surface-variant font-mono mt-2">Exported DOCX/PDF References and External Uploads will appear here.</p>
      </div>
   </div>
);

const RecapTab = ({ room }: { room: DealRoom }) => (
  <div className="max-w-3xl border border-outline/30 bg-surface-container-low p-8 text-center space-y-6">
      <ShieldCheck className="w-12 h-12 text-tertiary mx-auto mb-4 stroke-1 opacity-80" />
      <h3 className="text-2xl font-display text-tertiary mb-2">Broker-Side Confirmation Status</h3>
      
      {room.linkedRecapId ? (
         <div className="bg-surface p-6 border border-outline/30 text-left max-w-xl mx-auto space-y-4">
            <div className="flex justify-between items-center border-b border-outline/30 pb-4">
               <div>
                 <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Linked Recap Profile</span>
                 <p className="font-mono text-sm text-on-surface mt-1">{room.linkedRecapId}</p>
               </div>
               <span className="bg-tertiary/20 text-tertiary border border-tertiary/30 px-2 py-1 text-[10px] font-bold tracking-widest uppercase">
                 Pending Signatures
               </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="p-3 border border-outline/30 bg-surface-container-low">
                  <span className="text-[9px] uppercase tracking-widest text-on-surface-variant block mb-1">Cargo Side</span>
                  <span className="text-xs font-bold text-on-surface">PENDING / UNKNOWN</span>
               </div>
               <div className="p-3 border border-outline/30 bg-surface-container-low">
                  <span className="text-[9px] uppercase tracking-widest text-on-surface-variant block mb-1">Vessel Side</span>
                  <span className="text-xs font-bold text-on-surface">PENDING / UNKNOWN</span>
               </div>
            </div>
            <div className="pt-2 text-[9px] uppercase tracking-widest text-on-surface-variant font-mono">
               Awaiting final signatures from principals.
            </div>
         </div>
      ) : (
         <div className="p-6 border border-dashed border-outline/30 bg-surface-container-lowest max-w-xl mx-auto">
            <p className="text-sm text-on-surface-variant font-sans mb-4">No recap confirmation started yet.</p>
            <p className="text-[10px] text-on-surface-variant font-mono uppercase tracking-widest">Initiate the Broker-side Recap Confirmation workflow from this deal room to lock terms and create a draft.</p>
         </div>
      )}

      {!room.linkedRecapId && (
        <button className="px-6 py-3 bg-surface-container hover:bg-tertiary/10 text-on-surface border border-outline hover:border-tertiary text-[10px] uppercase tracking-widest font-bold transition-all shadow-sm">
           Create Recap Draft 
        </button>
      )}

      <div className="text-[9px] text-on-surface-variant italic mt-8 font-serif px-8">
        Disclaimer: This Deal Room is for negotiation and planning. It does not natively construct a final fixture or generate binding charter parties. Principal approval is always required.
      </div>
  </div>
);

const AuditTab = ({ room }: { room: DealRoom }) => {
   const sortedAudit = [...(room.audit || [])].sort((a, b) => b.timestamp - a.timestamp);
   return (
      <div className="max-w-2xl space-y-4">
         {sortedAudit.map((a, i) => (
             <div key={i} className="flex gap-4 border-l-2 border-outline pl-4 py-2 opacity-80 hover:opacity-100 transition-opacity">
                <div className="w-24 shrink-0 text-[9px] uppercase tracking-widest text-on-surface-variant font-mono mt-1">
                   {a.timestamp?.toDate ? new Date(a.timestamp.toDate()).toLocaleTimeString() : new Date(a.timestamp).toLocaleTimeString()}
                </div>
                <div>
                   <p className="text-sm text-on-surface font-sans">{a.action}</p>
                   <p className="text-[9px] uppercase font-mono tracking-widest text-on-surface-variant mt-1">By: {a.actorUid}</p>
                </div>
             </div>
         ))}
         {!sortedAudit.length && <div className="text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">No audit events found.</div>}
      </div>
   );
};

const BotIcon = (p: any) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>;
const ClockIcon = (p: any) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
