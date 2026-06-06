import React, { useState, useEffect } from 'react';
import { Search, User, Ship, Package2, Mail, Phone, Globe, ExternalLink, Filter, Save, MessageSquare, Plus, Trash2 } from 'lucide-react';
import { cn, Contact } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, handleFirestoreError, OperationType, db } from '../lib/firebase';
import { collection, onSnapshot, query, where, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { useWorkspace } from '../lib/WorkspaceContext';

interface ContactListProps {
  contactList: Contact[];
  onCreate: (contact: Contact) => void;
  onUpdate: (id: string, updates: Partial<Contact>) => void;
  onDelete: (id: string) => void;
}

export const ContactList: React.FC<ContactListProps> = ({ contactList, onCreate, onUpdate, onDelete }) => {
  const [activeSubTab, setActiveSubTab] = useState<'VESSEL' | 'CARGO'>('VESSEL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);

  const { currentWorkspace } = useWorkspace();
  const isViewer = currentWorkspace?.myRole === 'viewer';

  const filteredContacts = contactList.filter(contact => 
    contact.type === activeSubTab &&
    (contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     contact.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
     (contact.specialization && contact.specialization.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))))
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-surface">
      <div className="p-4 border-b border-outline bg-surface-container flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h2 className="font-display text-[18px] text-on-surface uppercase tracking-widest font-bold flex items-center gap-3">
            Contact_Registry
            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 font-mono">
              TOTAL: {contactList.length}
            </span>
          </h2>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          {!isViewer && (
            <button 
              onClick={() => setIsNewContactOpen(true)}
              className="hidden lg:flex bg-primary text-on-primary px-4 py-2 font-sans text-[9px] tracking-[0.2em] font-medium hover:bg-primary-container transition-all whitespace-nowrap items-center gap-2 shadow-sm rounded-sm shrink-0"
            >
              <Plus className="h-3.5 w-3.5 stroke-2" />
              NEW CONTACT
            </button>
          )}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant" />
            <input 
              className="w-full bg-surface-container-lowest border border-outline focus:border-primary focus:ring-0 text-on-surface font-mono text-[11px] text-on-surface/80 pl-8 py-1.5 placeholder:text-[#2d3f5a] text-[12px]"
              placeholder="SEARCH_NETWORK..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="bg-surface-container-high border border-outline text-on-surface p-2 hover:border-primary hover:text-primary transition-colors">
            <Filter className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex bg-surface border-b border-outline shrink-0">
        <button 
          onClick={() => setActiveSubTab('VESSEL')}
          className={cn(
            "flex-1 py-3 text-[11px] font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2",
            activeSubTab === 'VESSEL' ? "text-primary border-b-2 border-primary bg-primary/5" : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          <Ship className="h-4 w-4" />
          Vessel_Providers
        </button>
        <button 
          onClick={() => setActiveSubTab('CARGO')}
          className={cn(
            "flex-1 py-3 text-[11px] font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2",
            activeSubTab === 'CARGO' ? "text-tertiary border-b-2 border-tertiary bg-tertiary/5" : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          <Package2 className="h-4 w-4" />
          Cargo_Providers
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24 md:pb-4">
        <AnimatePresence mode="popLayout">
          {filteredContacts.map((contact, idx) => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: idx * 0.03 }}
              key={contact.id}
              className="bg-surface-container-high border border-outline hover:border-primary/50 group transition-all"
            >
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-surface-container-lowest border border-outline flex items-center justify-center shrink-0">
                    <User className="h-6 w-6 text-on-surface-variant" />
                  </div>
                  <div>
                    <h3 className="text-[15px] text-on-surface font-bold uppercase tracking-tight leading-tight">
                      {contact.name}
                    </h3>
                    <p className="text-[11px] text-primary font-mono font-bold uppercase mb-1">
                      {contact.company}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {contact.specialization.map(s => (
                        <span key={s} className="text-[9px] bg-surface-container-lowest text-on-surface-variant border border-outline px-1.5 py-0.5 uppercase font-bold tracking-tighter">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:flex md:items-center md:gap-8">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="font-mono">{contact.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                      <Phone className="h-3.5 w-3.5" />
                      <span className="font-mono">{contact.phone}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button className="flex-1 md:flex-none border border-outline p-2 hover:bg-primary/10 hover:border-primary transition-colors" title="Send Message">
                      <MessageSquare className="h-4 w-4 text-on-surface" />
                    </button>
                    <button className="flex-1 md:flex-none border border-outline p-2 hover:bg-primary/10 hover:border-primary transition-colors" title="Save to Local Archive">
                      <Save className="h-4 w-4 text-on-surface" />
                    </button>
                    {!isViewer && (
                      <button onClick={(e) => { e.stopPropagation(); onDelete(contact.id); }} className="flex-1 md:flex-none border border-error/50 p-2 hover:bg-error/10 text-error transition-colors" title="Delete Contact">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button className="flex-1 md:flex-none bg-primary p-2 text-on-primary hover:bg-primary/90 transition-colors" title="View Extended Profile">
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="px-4 py-2 bg-surface-container-lowest border-t border-outline flex justify-between items-center text-[9px] font-bold uppercase tracking-widest text-on-surface-variant">
                <span>LOC: {contact.country}</span>
                <span>LAST_SYNC: {contact.lastInteraction}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredContacts.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center opacity-40">
            <Globe className="h-12 w-12 mb-4 animate-pulse" />
            <p className="font-mono text-[11px] text-on-surface/80 uppercase tracking-widest text-[12px]">No entities matching query in current sector</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isNewContactOpen && (
          <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface-container border border-outline w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-outline flex justify-between items-center bg-surface-container-high shrink-0">
                <h3 className="font-display text-[16px] uppercase tracking-widest text-on-surface flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  INITIALIZE_CONTACT
                </h3>
                <button onClick={() => setIsNewContactOpen(false)} className="text-on-surface-variant hover:text-on-surface p-1">
                  <ExternalLink className="h-4 w-4 rotate-45" />
                </button>
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  onCreate({
                    id: `CNT-${Math.floor(1000 + Math.random() * 9000)}`,
                    name: fd.get('name') as string,
                    company: fd.get('company') as string,
                    email: fd.get('email') as string,
                    phone: fd.get('phone') as string,
                    country: fd.get('country') as string,
                    type: fd.get('type') as 'VESSEL' | 'CARGO',
                    specialization: (fd.get('specialization') as string).split(',').map(s => s.trim()).filter(Boolean),
                    lastInteraction: 'Just Now'
                  });
                  setIsNewContactOpen(false);
                }}
                className="p-6 flex flex-col gap-4 overflow-y-auto"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="text-[9px] uppercase tracking-widest text-on-surface-variant">Full Name *</label>
                    <input required name="name" className="w-full bg-surface-container-highest border border-outline/30 text-on-surface p-2 text-sm focus:border-primary/50 outline-none" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[9px] uppercase tracking-widest text-on-surface-variant">Company *</label>
                    <input required name="company" className="w-full bg-surface-container-highest border border-outline/30 text-on-surface p-2 text-sm focus:border-primary/50 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-on-surface-variant">Email *</label>
                    <input required name="email" type="email" className="w-full bg-surface-container-highest border border-outline/30 text-on-surface p-2 text-sm focus:border-primary/50 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-on-surface-variant">Phone *</label>
                    <input required name="phone" className="w-full bg-surface-container-highest border border-outline/30 text-on-surface p-2 text-sm focus:border-primary/50 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-on-surface-variant">Country</label>
                    <input name="country" className="w-full bg-surface-container-highest border border-outline/30 text-on-surface p-2 text-sm focus:border-primary/50 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] uppercase tracking-widest text-on-surface-variant">Contact Type</label>
                    <select name="type" className="w-full bg-surface-container-highest border border-outline/30 text-on-surface p-2 text-sm focus:border-primary/50 outline-none">
                      <option value="VESSEL">Vessel Chartering</option>
                      <option value="CARGO">Cargo / Trading</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[9px] uppercase tracking-widest text-on-surface-variant">Specialization (Comma Separated)</label>
                    <input name="specialization" placeholder="e.g. Capesize, Grains" className="w-full bg-surface-container-highest border border-outline/30 text-on-surface p-2 text-sm focus:border-primary/50 outline-none" />
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-outline flex justify-end gap-3">
                  <button type="button" onClick={() => setIsNewContactOpen(false)} className="px-4 py-2 border border-outline text-on-surface text-[10px] uppercase font-bold tracking-widest hover:bg-surface-container-highest">CANCEL</button>
                  <button type="submit" className="bg-primary text-on-primary px-6 py-2 text-[10px] uppercase font-bold tracking-widest hover:bg-primary/90 flex items-center gap-2">
                    <Save className="h-3 w-3" />
                    SAVE_RECORD
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
