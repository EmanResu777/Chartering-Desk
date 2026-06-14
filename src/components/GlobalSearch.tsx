import React, { useState, useEffect, useRef } from 'react';
import { Search, Ship, Package2, Users, X, ChevronRight, FileText, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Cargo, Vessel, Contact, Email, cn } from '../lib/utils';
import { useConfig } from '../lib/ConfigContext';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  cargoList: Cargo[];
  vesselList: Vessel[];
  contactList: Contact[];
  emailList: Email[];
  onSelectResult: (type: 'cargo' | 'vessel' | 'contact' | 'email', item: any) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ 
  isOpen, 
  onClose, 
  cargoList, 
  vesselList, 
  contactList,
  emailList,
  onSelectResult 
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const searchResults = React.useMemo(() => {
    if (!query.trim()) return { cargos: [], vessels: [], contacts: [], emails: [], total: 0 };
    
    const lowerQuery = query.toLowerCase();

    const matchedCargos = cargoList.filter(c => 
      c.commodity.toLowerCase().includes(lowerQuery) || 
      c.loadPort.toLowerCase().includes(lowerQuery) || 
      c.dischargePort.toLowerCase().includes(lowerQuery) ||
      c.charterer.toLowerCase().includes(lowerQuery) ||
      (c.privateNotes && c.privateNotes.toLowerCase().includes(lowerQuery)) ||
      (c.id && c.id.toLowerCase().includes(lowerQuery))
    );

    const matchedVessels = vesselList.filter(v => 
      v.name.toLowerCase().includes(lowerQuery) || 
      v.type.toLowerCase().includes(lowerQuery) ||
      v.owner.toLowerCase().includes(lowerQuery) ||
      v.openPort.toLowerCase().includes(lowerQuery) ||
      (v.privateNotes && v.privateNotes.toLowerCase().includes(lowerQuery)) ||
      (v.id && v.id.toLowerCase().includes(lowerQuery))
    );

    const matchedContacts = contactList.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) || 
      c.company.toLowerCase().includes(lowerQuery) ||
      c.email.toLowerCase().includes(lowerQuery) ||
      (c.id && c.id.toLowerCase().includes(lowerQuery))
    );

    const matchedEmails = emailList.filter(e => 
      e.subject.toLowerCase().includes(lowerQuery) || 
      e.sender.toLowerCase().includes(lowerQuery) ||
      e.summary.toLowerCase().includes(lowerQuery) ||
      e.rawBody.toLowerCase().includes(lowerQuery) ||
      (e.id && e.id.toLowerCase().includes(lowerQuery))
    );

    return {
      cargos: matchedCargos,
      vessels: matchedVessels,
      contacts: matchedContacts,
      emails: matchedEmails,
      total: matchedCargos.length + matchedVessels.length + matchedContacts.length + matchedEmails.length
    };
  }, [query, cargoList, vesselList, contactList, emailList]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface-container-highest/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-[15vh] left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-surface-container border border-outline shadow-2xl z-[101] flex flex-col max-h-[70vh] overflow-hidden"
          >
            <div className="flex items-center gap-3 p-4 border-b border-outline bg-surface">
              <Search className="w-5 h-5 text-primary" />
              <input 
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search across all modules, notes, and records..."
                className="flex-1 bg-transparent border-none outline-none text-on-surface font-sans text-sm placeholder:text-on-surface-variant focus:ring-0"
              />
              <button 
                onClick={onClose}
                className="p-1 rounded-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-4 bg-surface-container/50">
              {query && searchResults.total === 0 ? (
                <div className="p-8 text-center text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">
                  No results found for "{query}"
                </div>
              ) : !query ? (
                 <div className="p-8 text-center text-on-surface-variant font-mono text-[10px] uppercase tracking-widest opacity-60">
                   Start typing to explore database
                 </div>
              ) : (
                <div className="p-2 space-y-4">
                  {/* Contacts */}
                  {searchResults.contacts.length > 0 && (
                    <div>
                      <h3 className="px-3 py-2 text-[10px] font-bold text-tertiary uppercase tracking-widest flex items-center gap-2">
                        <Users className="w-3 h-3" /> Contacts ({searchResults.contacts.length})
                      </h3>
                      <div className="space-y-1">
                        {searchResults.contacts.map(contact => (
                          <button 
                            key={contact.id}
                            onClick={() => onSelectResult('contact', contact)}
                            className="w-full text-left flex items-center justify-between p-3 hover:bg-tertiary/10 border border-transparent hover:border-tertiary/30 rounded-sm transition-all group"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="text-[12px] text-on-surface font-semibold">{contact.name}</span>
                              <span className="text-[10px] text-on-surface-variant font-mono">{contact.company} • {contact.email}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cargos */}
                  {searchResults.cargos.length > 0 && (
                    <div>
                      <h3 className="px-3 py-2 text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-2">
                        <Package2 className="w-3 h-3" /> Cargos & Orders ({searchResults.cargos.length})
                      </h3>
                      <div className="space-y-1">
                        {searchResults.cargos.map(cargo => {
                          const isNoteMatch = cargo.privateNotes && cargo.privateNotes.toLowerCase().includes(query.toLowerCase());
                          return (
                            <button 
                              key={cargo.id}
                              onClick={() => onSelectResult('cargo', cargo)}
                              className="w-full text-left flex flex-col p-3 hover:bg-primary/10 border border-transparent hover:border-primary/30 rounded-sm transition-all group relative pr-10"
                            >
                              <div className="flex flex-col gap-1">
                                <span className="text-[12px] text-on-surface font-semibold">{cargo.commodity} ({cargo.quantity})</span>
                                <span className="text-[10px] text-on-surface-variant font-mono">{cargo.loadPort} → {cargo.dischargePort}</span>
                                {isNoteMatch && (
                                  <div className="mt-1 text-[10px] flex items-start gap-1 text-primary/80 bg-primary/5 p-1.5 rounded-sm">
                                    <FileText className="w-3 h-3 shrink-0" />
                                    <span className="truncate break-all inline-block max-w-[90%]">
                                      Match in notes: "...{cargo.privateNotes?.substring(Math.max(0, cargo.privateNotes.toLowerCase().indexOf(query.toLowerCase()) - 15), cargo.privateNotes.toLowerCase().indexOf(query.toLowerCase()) + 60)}..."
                                    </span>
                                  </div>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-1/2 -translate-y-1/2" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Vessels */}
                  {searchResults.vessels.length > 0 && (
                    <div>
                      <h3 className="px-3 py-2 text-[10px] font-bold text-secondary uppercase tracking-widest flex items-center gap-2">
                        <Ship className="w-3 h-3" /> Vessels ({searchResults.vessels.length})
                      </h3>
                      <div className="space-y-1">
                        {searchResults.vessels.map(vessel => {
                          const isNoteMatch = vessel.privateNotes && vessel.privateNotes.toLowerCase().includes(query.toLowerCase());
                          return (
                            <button 
                              key={vessel.id}
                              onClick={() => onSelectResult('vessel', vessel)}
                              className="w-full text-left flex flex-col p-3 hover:bg-secondary/10 border border-transparent hover:border-secondary/30 rounded-sm transition-all group relative pr-10"
                            >
                              <div className="flex flex-col gap-1">
                                <span className="text-[12px] text-on-surface font-semibold">{vessel.name}</span>
                                <span className="text-[10px] text-on-surface-variant font-mono">{vessel.type} • {vessel.dwt?.toLocaleString() || 'N/A'} DWT • Open: {vessel.openPort}</span>
                                {isNoteMatch && (
                                  <div className="mt-1 text-[10px] flex items-start gap-1 text-secondary/80 bg-secondary/5 p-1.5 rounded-sm">
                                    <FileText className="w-3 h-3 shrink-0" />
                                    <span className="truncate break-all inline-block max-w-[90%]">
                                      Match in notes: "...{vessel.privateNotes?.substring(Math.max(0, vessel.privateNotes.toLowerCase().indexOf(query.toLowerCase()) - 15), vessel.privateNotes.toLowerCase().indexOf(query.toLowerCase()) + 60)}..."
                                    </span>
                                  </div>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-secondary opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-1/2 -translate-y-1/2" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Emails */}
                  {searchResults.emails.length > 0 && (
                    <div>
                      <h3 className="px-3 py-2 text-[10px] font-bold text-[#ffb4ab] uppercase tracking-widest flex items-center gap-2">
                        <Mail className="w-3 h-3" /> Emails ({searchResults.emails.length})
                      </h3>
                      <div className="space-y-1">
                        {searchResults.emails.map(email => {
                          const isBodyMatch = email.rawBody && email.rawBody.toLowerCase().includes(query.toLowerCase());
                          return (
                            <button 
                              key={email.id}
                              onClick={() => onSelectResult('email', email)}
                              className="w-full text-left flex flex-col p-3 hover:bg-[#ffb4ab]/10 border border-transparent hover:border-[#ffb4ab]/30 rounded-sm transition-all group relative pr-10"
                            >
                              <div className="flex flex-col gap-1">
                                <span className="text-[12px] text-on-surface font-semibold truncate">{email.subject}</span>
                                <span className="text-[10px] text-on-surface-variant font-mono truncate">From: {email.sender}</span>
                                {isBodyMatch && (
                                  <div className="mt-1 text-[10px] flex items-start gap-1 text-[#ffb4ab]/80 bg-[#ffb4ab]/5 p-1.5 rounded-sm">
                                    <FileText className="w-3 h-3 shrink-0" />
                                    <span className="truncate break-all inline-block max-w-[90%]">
                                      Match in body: "...{email.rawBody?.substring(Math.max(0, email.rawBody.toLowerCase().indexOf(query.toLowerCase()) - 15), email.rawBody.toLowerCase().indexOf(query.toLowerCase()) + 60)}..."
                                    </span>
                                  </div>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-[#ffb4ab] opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-1/2 -translate-y-1/2" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="p-3 border-t border-outline bg-surface flex items-center justify-between text-[9px] uppercase tracking-[0.2em] text-on-surface-variant font-mono">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 border border-outline rounded-sm bg-surface-container-highest">ESC</span>
                to dismiss
              </div>
              <div>{searchResults.total} Results</div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
