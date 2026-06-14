import React, { useState, useEffect } from 'react';
import { Counterparty, CounterpartyNote, crmService } from '../lib/crmService';
import { motion } from 'motion/react';
import { X, Calendar, Edit, Building, Mail, Phone, ExternalLink, MapPin, Search as SearchIcon, Anchor, Package2, EyeOff, Eye, Plus, MessageSquare } from 'lucide-react';
import { useNotification } from '../lib/NotificationContext';

export const CounterpartyProfileDrawer: React.FC<{ cp: Counterparty, onClose: () => void, uid: string, deskId: string }> = ({ cp, onClose, uid, deskId }) => {
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState<'profile' | 'notes' | 'timeline' | 'links'>('profile');
  const [notes, setNotes] = useState<CounterpartyNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [noteVis, setNoteVis] = useState('private');

  useEffect(() => {
    const unsub = crmService.subscribeNotes(cp.id, (n) => setNotes(n));
    return () => unsub();
  }, [cp.id]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try {
      await crmService.addNote(cp.id, { text: newNote, noteType, visibility: noteVis }, uid, deskId);
      setNewNote('');
      notify({ type: 'success', title: 'Note Added', message: 'Interaction logged' });
    } catch (e: any) {
      notify({ type: 'error', title: 'Error', message: e.message });
    }
  };

  return (
     <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed inset-y-0 right-0 w-full max-w-xl bg-surface-container-high border-l border-outline/50 shadow-2xl z-[150] flex flex-col font-sans">
       <div className="flex items-center justify-between p-6 border-b border-outline/30 shrink-0 bg-surface">
         <div>
           <div className="flex items-center gap-3 mb-1">
             <h2 className="text-xl font-display font-medium tracking-wide text-on-surface uppercase">{cp.name}</h2>
             <span className="px-2 py-0.5 text-[9px] uppercase font-bold tracking-widest bg-primary/10 text-primary border border-primary/20">{cp.type}</span>
           </div>
           <p className="text-xs text-on-surface-variant flex items-center gap-1"><Building className="w-3 h-3"/> {cp.company || 'No Company Linked'}</p>
         </div>
         <button onClick={onClose} className="p-2 border border-outline/30 hover:border-primary/50 hover:text-primary transition-colors hover:bg-surface-container"><X className="w-5 h-5" /></button>
       </div>

       <div className="flex border-b border-outline/30 shrink-0 bg-surface">
         {['profile', 'notes', 'timeline', 'links'].map(tab => (
           <button 
             key={tab} 
             onClick={() => setActiveTab(tab as any)}
             className={`flex-1 py-3 text-[10px] uppercase font-bold tracking-widest border-b-2 hover:bg-surface-container transition-colors ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant'}`}
           >
             {tab}
           </button>
         ))}
       </div>

       <div className="flex-1 overflow-y-auto p-6 bg-surface-container-low font-mono text-sm">
          {activeTab === 'profile' && (
            <div className="space-y-6">
               <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 bg-surface border border-outline/30 flex flex-col gap-1">
                   <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">Status</span>
                   <span className="font-bold text-on-surface uppercase">{cp.status}</span>
                 </div>
                 <div className="p-4 bg-surface border border-outline/30 flex flex-col gap-1">
                   <span className="text-[9px] uppercase tracking-widest text-on-surface-variant">Visibility</span>
                   <span className="font-bold text-on-surface flex items-center gap-2 uppercase">
                      {cp.visibility === 'my_desk' ? <Eye className="w-3.5 h-3.5 text-tertiary"/> : <EyeOff className="w-3.5 h-3.5 text-on-surface-variant"/>} {cp.visibility.replace('_', ' ')}
                   </span>
                 </div>
               </div>

               <div className="p-4 bg-surface border border-outline/30 space-y-4">
                 <h3 className="text-[10px] uppercase tracking-widest text-primary font-bold border-b border-outline/30 pb-2 mb-4">Contact Details</h3>
                 {cp.email && <div className="flex items-center gap-3 text-sm text-on-surface"><Mail className="w-4 h-4 text-on-surface-variant" /> {cp.email}</div>}
                 {cp.phone && <div className="flex items-center gap-3 text-sm text-on-surface"><Phone className="w-4 h-4 text-on-surface-variant" /> {cp.phone}</div>}
                 {cp.messengers && <div className="flex items-center gap-3 text-sm text-on-surface"><MessageSquare className="w-4 h-4 text-on-surface-variant" /> {cp.messengers}</div>}
                 {cp.website && <div className="flex items-center gap-3 text-sm text-on-surface"><ExternalLink className="w-4 h-4 text-on-surface-variant" /> <a href={cp.website.startsWith('http')?cp.website:`https://${cp.website}`} target="_blank" className="hover:text-primary underline">Website</a></div>}
               </div>

               <div className="p-4 bg-surface border border-outline/30 space-y-4">
                 <h3 className="text-[10px] uppercase tracking-widest text-primary font-bold border-b border-outline/30 pb-2 mb-4">Trading Profile</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[9px] uppercase tracking-widest text-on-surface-variant">Trading Area</span>
                      <span className="block text-xs uppercase">{cp.tradingArea || '---'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-widest text-on-surface-variant">Region</span>
                      <span className="block text-xs flex items-center gap-1 uppercase"><MapPin className="w-3 h-3"/> {cp.country || '---'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-widest text-on-surface-variant">Preferred Cargo</span>
                      <span className="block text-xs uppercase">{cp.preferredCargo || '---'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-widest text-on-surface-variant">Preferred Tonnage</span>
                      <span className="block text-xs uppercase">{cp.preferredTonnage || '---'}</span>
                    </div>
                 </div>
               </div>

               <div className="p-4 bg-surface border border-outline/30 space-y-4">
                 <h3 className="text-[10px] uppercase tracking-widest text-primary font-bold border-b border-outline/30 pb-2 mb-4">Relationship Intelligence</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-[9px] uppercase tracking-widest text-on-surface-variant">Reliability Score</span>
                      <span className="block text-xs uppercase">{cp.reliability || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase tracking-widest text-on-surface-variant">Response Status</span>
                      <span className="block text-xs uppercase">{cp.responseStatus || 'Unknown'}</span>
                    </div>
                 </div>
                 <div className="text-[10px] text-on-surface-variant italic pt-2 mt-4 border-t border-outline/30 !font-sans">
                   Note: Reliability indicators are private to your workspace and not shared publicly to prevent defamation risks.
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'notes' && (
             <div className="flex flex-col h-full space-y-6">
                <div className="bg-surface p-4 border border-outline/30 flex flex-col gap-3">
                   <div className="flex gap-2">
                     <select value={noteType} onChange={e=>setNoteType(e.target.value)} className="bg-surface-container border border-outline/30 p-2 text-xs text-on-surface outline-none">
                       <option value="general">General Note</option>
                       <option value="call">Call Log</option>
                       <option value="email">Email Sent/Received</option>
                       <option value="meeting">Meeting</option>
                       <option value="offer">Offer Revision</option>
                     </select>
                     <select value={noteVis} onChange={e=>setNoteVis(e.target.value)} className="bg-surface-container border border-outline/30 p-2 text-xs text-on-surface outline-none">
                       <option value="private">Private</option>
                       <option value="my_desk">My Desk</option>
                     </select>
                   </div>
                   <textarea 
                     value={newNote} onChange={e=>setNewNote(e.target.value)} 
                     placeholder="Add interaction note..."
                     className="bg-surface-container border border-outline/30 p-3 text-xs min-h-[80px] outline-none focus:border-primary/50 text-on-surface font-sans"
                   />
                   <button onClick={handleAddNote} disabled={!newNote.trim()} className="bg-primary text-black font-bold uppercase tracking-widest text-[10px] py-2 w-32 hover:bg-primary-container disabled:opacity-50">Save Note</button>
                </div>

                <div className="flex-1 space-y-4">
                  {notes.map(n => (
                    <div key={n.id} className="bg-surface border border-outline/30 p-4">
                       <div className="flex justify-between items-start mb-2">
                         <div className="flex items-center gap-2">
                           <span className="px-1.5 py-0.5 border border-outline/50 bg-surface-container-high text-[9px] uppercase tracking-widest font-bold">{n.noteType}</span>
                           <span className="text-[10px] text-on-surface-variant"><Calendar className="w-3 h-3 inline pb-0.5"/> {n.createdAt?.toDate ? new Date(n.createdAt.toDate()).toLocaleDateString() : 'Just now'}</span>
                         </div>
                         {n.visibility === 'my_desk' ? <span title="Desk Note"><Eye className="w-3 h-3 text-tertiary" /></span> : <span title="Private Note"><EyeOff className="w-3 h-3 text-on-surface-variant" /></span>}
                       </div>
                       <p className="text-xs text-on-surface font-sans whitespace-pre-wrap">{n.text}</p>
                       {n.createdByUid !== uid && <div className="mt-2 text-[9px] text-tertiary text-right tracking-widest">Via Desk Network</div>}
                    </div>
                  ))}
                  {notes.length === 0 && <div className="text-center py-8 text-[10px] text-on-surface-variant uppercase tracking-widest border border-dashed border-outline/30">No interaction notes yet</div>}
                </div>
             </div>
          )}

          {activeTab === 'timeline' && (
             <div className="relative border-l-2 border-outline/30 ml-4 pl-6 space-y-8">
                {cp.auditTrail && [...cp.auditTrail].reverse().map((audit, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-surface-container-high border-2 border-primary z-10 box-content"></div>
                    <div className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">{new Date(audit.timestamp).toLocaleString()}</div>
                    <div className="text-xs font-bold text-on-surface">{audit.action}</div>
                  </div>
                ))}
             </div>
          )}

          {activeTab === 'links' && (
             <div className="space-y-4">
                <div className="p-4 bg-surface border border-outline/30 text-center">
                   <Package2 className="w-6 h-6 mx-auto mb-2 text-on-surface-variant" />
                   <p className="text-xs text-on-surface-variant">Linked Items (Cargos, Vessels, Market Requests, Offers, Deal Rooms).</p>
                   <button onClick={async () => {
                     const { createDealRoom } = await import('../lib/dealRoomService');
                     await createDealRoom({
                        title: `Negotiation with ${cp.name}`,
                        status: 'draft',
                        createdByUid: uid,
                        createdByDeskId: deskId,
                        linkedCounterpartyIds: [cp.id],
                        source: 'Counterparty Profile'
                     });
                     alert('Deal Room Created! Navigate to Deal Rooms tab to view.');
                   }} className="mt-4 px-4 py-2 bg-primary text-black font-bold uppercase tracking-widest text-[9px] hover:bg-primary/90">
                     Create Deal Room with Counterparty
                   </button>
                </div>
                {cp.linkedItemIds && cp.linkedItemIds.map(id => (
                  <div key={id} className="p-3 bg-surface border border-outline/30 flex justify-between items-center">
                    <span className="text-xs font-bold font-mono">{id}</span>
                  </div>
                ))}
             </div>
          )}
       </div>
     </motion.div>
  )
}
