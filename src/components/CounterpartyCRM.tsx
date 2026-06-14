import React, { useState, useEffect } from 'react';
import { crmService, Counterparty, CounterpartyNote } from '../lib/crmService';
import { useAuth } from '../lib/firebase';
import { useWorkspace } from '../lib/WorkspaceContext';
import { useNotification } from '../lib/NotificationContext';
import { Plus, Search, Tag, Eye, EyeOff, Edit, Trash2, Clock, MapPin, Building, Phone, Mail as MailIcon, MoreHorizontal, User, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { CounterpartyProfileDrawer } from './CounterpartyProfileDrawer';

export const CounterpartyCRM: React.FC = () => {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { notify } = useNotification();
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [deskId, setDeskId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [tradingAreaFilter, setTradingAreaFilter] = useState('');
  const [preferredCargoFilter, setPreferredCargoFilter] = useState('');
  const [preferredTonnageFilter, setPreferredTonnageFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCounterparty, setSelectedCounterparty] = useState<Counterparty | null>(null);

  useEffect(() => {
    if (!user) return;
    import('firebase/firestore').then(({ getDoc, doc }) => {
      import('../lib/firebase').then(({ db }) => {
        getDoc(doc(db, 'users', user.uid)).then(snap => {
           if (snap.exists()) setDeskId(snap.data().deskId || null);
        });
      });
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = crmService.subscribeCounterparties(user.uid, deskId, (data) => {
       setCounterparties(data);
    });
    return () => unsub();
  }, [user, deskId]);

  const filtered = counterparties.filter(cp => {
    if (searchQuery) {
       const q = searchQuery.toLowerCase();
       const matchesName = cp.name.toLowerCase().includes(q);
       const matchesCompany = cp.company?.toLowerCase().includes(q);
       const matchesEmail = cp.email?.toLowerCase().includes(q);
       const matchesTag = cp.tags?.some(t => t.toLowerCase().includes(q));
       if (!matchesName && !matchesCompany && !matchesEmail && !matchesTag) return false;
    }
    if (typeFilter && cp.type !== typeFilter) return false;
    if (statusFilter && cp.status !== statusFilter) return false;
    if (regionFilter && cp.region?.toLowerCase() !== regionFilter.toLowerCase()) return false;
    if (tradingAreaFilter && cp.tradingArea?.toLowerCase() !== tradingAreaFilter.toLowerCase()) return false;
    if (preferredCargoFilter && cp.preferredCargo?.toLowerCase() !== preferredCargoFilter.toLowerCase()) return false;
    if (preferredTonnageFilter && cp.preferredTonnage?.toLowerCase() !== preferredTonnageFilter.toLowerCase()) return false;
    if (tagFilter && !cp.tags?.includes(tagFilter)) return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col pt-4">
      <div className="px-6 flex items-center justify-between shrink-0 mb-6 w-full">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary/10 flex items-center justify-center border border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.1)]">
            <User className="h-6 w-6 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-2xl font-display uppercase tracking-wider text-primary">Counterparty CRM</h1>
            <p className="text-sm font-sans tracking-wide text-on-surface-variant">Relationship intelligence and contact directory.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-primary text-black px-6 py-3 font-bold uppercase tracking-widest text-xs hover:bg-primary-container transition-all shadow-[0_0_20px_rgba(197,168,128,0.2)]"
        >
          <Plus className="w-4 h-4" /> Add Counterparty
        </button>
      </div>

      <div className="px-6 pb-6 flex flex-col gap-4 shrink-0">
        <div className="flex items-center gap-4">
            <div className="relative flex-[2]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, company, email, tag..."
                className="w-full bg-surface-container border border-outline/30 focus:border-primary/50 text-on-surface p-2.5 pl-10 text-xs font-sans outline-none"
              />
            </div>
            <select 
              value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-surface-container border border-outline/30 text-on-surface p-2.5 text-xs font-sans outline-none flex-1 min-w-[120px]"
            >
              <option value="">All Types</option>
              <option value="Broker">Broker</option>
              <option value="Charterer">Charterer</option>
              <option value="Owner">Owner</option>
              <option value="Operator">Operator</option>
              <option value="Trader">Trader</option>
              <option value="Manager">Manager</option>
              <option value="Agent">Agent</option>
              <option value="Other">Other</option>
            </select>
            <select 
              value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-surface-container border border-outline/30 text-on-surface p-2.5 text-xs font-sans outline-none flex-1 min-w-[120px]"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="watching">Watching</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked / Caution</option>
            </select>
        </div>
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-2">
            <div className="flex items-center gap-2 bg-surface border border-outline/20 p-1 pl-3 text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">
               <Filter className="w-3 h-3" /> Filters
            </div>
            <input value={regionFilter} onChange={e=>setRegionFilter(e.target.value)} placeholder="Region..." className="bg-surface-container border border-outline/30 text-on-surface p-2 text-xs font-sans outline-none w-32" />
            <input value={tradingAreaFilter} onChange={e=>setTradingAreaFilter(e.target.value)} placeholder="Trading Area..." className="bg-surface-container border border-outline/30 text-on-surface p-2 text-xs font-sans outline-none w-32" />
            <input value={preferredCargoFilter} onChange={e=>setPreferredCargoFilter(e.target.value)} placeholder="Pref. Cargo..." className="bg-surface-container border border-outline/30 text-on-surface p-2 text-xs font-sans outline-none w-32" />
            <input value={preferredTonnageFilter} onChange={e=>setPreferredTonnageFilter(e.target.value)} placeholder="Pref. Tonnage..." className="bg-surface-container border border-outline/30 text-on-surface p-2 text-xs font-sans outline-none w-32" />
            <input value={tagFilter} onChange={e=>setTagFilter(e.target.value)} placeholder="Tag..." className="bg-surface-container border border-outline/30 text-on-surface p-2 text-xs font-sans outline-none w-32" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-20 no-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(cp => (
            <div 
              key={cp.id}
              onClick={() => setSelectedCounterparty(cp)}
              className="bg-surface-container-low border border-outline/30 hover:border-primary/50 p-5 cursor-pointer transition-colors flex flex-col group relative"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-on-surface text-sm uppercase tracking-wide group-hover:text-primary transition-colors">{cp.name}</h3>
                  <div className="text-xs text-on-surface-variant flex items-center gap-2 mt-1">
                     <Building className="w-3 h-3" /> {cp.company || 'Unknown Company'}
                  </div>
                </div>
                <div className={cn(
                  "px-2 py-0.5 text-[9px] uppercase tracking-widest font-bold border rounded-sm",
                  cp.status === 'blocked' ? "border-error text-error bg-error/5" :
                  cp.status === 'watching' ? "border-tertiary text-tertiary bg-tertiary/5" :
                  cp.status === 'inactive' ? "border-outline text-on-surface-variant bg-surface" :
                  "border-primary text-primary bg-primary/5"
                )}>
                  {cp.status}
                </div>
              </div>
              <div className="text-xs text-on-surface-variant flex flex-wrap gap-x-4 gap-y-2 mb-4">
                 {cp.email && <span className="flex items-center gap-1"><MailIcon className="w-3 h-3"/> {cp.email}</span>}
                 {cp.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3"/> {cp.phone}</span>}
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-outline/30 pt-3">
                 <div className="flex items-center gap-2">
                   <div className="text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container px-1.5 py-0.5">{cp.type}</div>
                   {cp.visibility === 'my_desk' ? <span title="Desk Visibility"><Eye className="w-3.5 h-3.5 text-tertiary" /></span> : <span title="Private"><EyeOff className="w-3.5 h-3.5 text-on-surface-variant" /></span>}
                 </div>
                 {cp.lastInteractionDate && (
                    <div className="text-[9px] font-mono text-on-surface-variant uppercase flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {cp.lastActionType?.slice(0,20)}
                    </div>
                 )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-on-surface-variant border border-dashed border-outline/50 bg-surface-container-low/30">
              <User className="w-8 h-8 opacity-50 mx-auto mb-3" />
              <div className="text-[10px] uppercase font-bold tracking-widest">No counterparties found</div>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAddModal && <AddCounterpartyModal onClose={() => setShowAddModal(false)} uid={user?.uid!} deskId={deskId!} onSuccess={(cp) => { setShowAddModal(false); setSelectedCounterparty(cp); }} />}
        {selectedCounterparty && <CounterpartyProfileDrawer cp={selectedCounterparty} onClose={() => setSelectedCounterparty(null)} uid={user?.uid!} deskId={deskId!} />}
      </AnimatePresence>
    </div>
  );
};

const AddCounterpartyModal: React.FC<{ onClose: () => void, uid: string, deskId: string, onSuccess: (cp: any) => void }> = ({ onClose, uid, deskId, onSuccess }) => {
  const { notify } = useNotification();
  const [data, setData] = useState<any>({ type: 'Broker', status: 'active', visibility: 'private' });

  const handleSave = async () => {
    if (!data.name) return notify({ type: 'error', title: 'Validation', message: 'Name is required' });
    try {
      const id = await crmService.createCounterparty(data, uid, deskId);
      notify({ type: 'success', title: 'Success', message: 'Counterparty added' });
      onSuccess({ id, ...data, createdByUid: uid, createdByDeskId: deskId, auditTrail: [], createdAt: null, updatedAt: null, linkedItemIds: [] });
    } catch (e: any) {
      notify({ type: 'error', title: 'Error', message: e.message });
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-dim/80 backdrop-blur-sm">
       <div className="bg-surface-container border border-primary/50 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto font-mono text-sm relative">
          <h2 className="text-xl font-display uppercase tracking-widest text-primary mb-6">Add Counterparty</h2>
          
          <div className="space-y-4">
             <div>
               <label className="block text-[10px] uppercase text-on-surface-variant mb-1">Name</label>
               <input value={data.name || ''} onChange={e=>setData({...data, name: e.target.value})} className="w-full bg-surface border border-outline/30 p-2 text-on-surface outline-none focus:border-primary/50" />
             </div>
             <div>
               <label className="block text-[10px] uppercase text-on-surface-variant mb-1">Company</label>
               <input value={data.company || ''} onChange={e=>setData({...data, company: e.target.value})} className="w-full bg-surface border border-outline/30 p-2 text-on-surface outline-none focus:border-primary/50" />
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-[10px] uppercase text-on-surface-variant mb-1">Type</label>
                 <select value={data.type} onChange={e=>setData({...data, type: e.target.value})} className="w-full bg-surface border border-outline/30 p-2 text-on-surface outline-none">
                   {['Broker','Charterer','Owner','Operator','Trader','Manager','Agent','Other'].map(t=><option key={t} value={t}>{t}</option>)}
                 </select>
               </div>
               <div>
                 <label className="block text-[10px] uppercase text-on-surface-variant mb-1">Status</label>
                 <select value={data.status} onChange={e=>setData({...data, status: e.target.value})} className="w-full bg-surface border border-outline/30 p-2 text-on-surface outline-none">
                   <option value="active">Active</option>
                   <option value="watching">Watching</option>
                   <option value="inactive">Inactive</option>
                   <option value="blocked">Blocked / Caution</option>
                 </select>
               </div>
             </div>
             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-[10px] uppercase text-on-surface-variant mb-1">Email</label>
                 <input value={data.email || ''} onChange={e=>setData({...data, email: e.target.value})} className="w-full bg-surface border border-outline/30 p-2 text-on-surface outline-none focus:border-primary/50" />
               </div>
               <div>
                 <label className="block text-[10px] uppercase text-on-surface-variant mb-1">Phone</label>
                 <input value={data.phone || ''} onChange={e=>setData({...data, phone: e.target.value})} className="w-full bg-surface border border-outline/30 p-2 text-on-surface outline-none focus:border-primary/50" />
               </div>
             </div>
             <div>
                 <label className="block text-[10px] uppercase text-on-surface-variant mb-1">Visibility</label>
                 <select value={data.visibility} onChange={e=>setData({...data, visibility: e.target.value})} className="w-full bg-surface border border-outline/30 p-2 text-on-surface outline-none">
                   <option value="private">Private (Only Me)</option>
                   <option value="my_desk">My Desk (Same Desk ID)</option>
                 </select>
             </div>
          </div>

          <div className="flex gap-4 mt-8">
             <button onClick={onClose} className="flex-1 py-3 border border-outline hover:bg-surface-container-high transition-colors uppercase tracking-widest text-[10px] font-bold">Cancel</button>
             <button onClick={handleSave} className="flex-1 py-3 bg-primary text-black transition-colors uppercase tracking-widest text-[10px] font-bold shadow-md hover:bg-primary/90">Save Counterparty</button>
          </div>
       </div>
    </motion.div>
  );
};
