import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Share2, Package2, Ship, Send, ExternalLink, X, Info, MessageSquare, Users, Mail, Search, Check, Ban } from 'lucide-react';
import { cn, Cargo, Vessel } from '../lib/utils';
import { useAuth, db } from '../lib/firebase';
import { collection, query, where, onSnapshot, setDoc, doc, serverTimestamp, getDocs, updateDoc } from 'firebase/firestore';

interface DeskNetworkProps {
  networkState?: any;
}

export const DeskNetwork: React.FC<DeskNetworkProps> = ({ networkState }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'FEED' | 'MY_ITEMS' | 'PROPOSALS' | 'CONTACTS' | 'INVITES'>('FEED');
  const [sharedItems, setSharedItems] = useState<any[]>([]);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [contactsIds, setContactsIds] = useState<string[]>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [showProposalModal, setShowProposalModal] = useState<any>(null);
  const [proposalMessage, setProposalMessage] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetch Connected contacts (IDs)
  useEffect(() => {
    if (!user) return;
    const unsubUser = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      const userData = docSnap.data();
      const connectedTo: string[] = Array.from(new Set(userData?.connectedTo || []));
      setContactsIds(connectedTo);
    });
    return () => unsubUser();
  }, [user]);

  // Fetch Feed
  const contactsIdsString = JSON.stringify(contactsIds);
  useEffect(() => {
    if (!user) return;
    const currentContactIds: string[] = JSON.parse(contactsIdsString);
    
    if (currentContactIds.length === 0) {
      setSharedItems([]);
      setLoading(false);
      return;
    }
    
    // Query shared items only from accepted network connections
    // Firestore 'in' query allows up to 30 items
    const chunks = [];
    for (let i = 0; i < currentContactIds.length; i += 30) {
      chunks.push(currentContactIds.slice(i, i + 30));
    }
    
    const unsubs: any[] = [];
    let allItems: any[] = [];
    
    chunks.forEach((chunk) => {
      const q = query(
        collection(db, 'sharedItems'), 
        where('status', '==', 'active'),
        where('ownerId', 'in', chunk)
      );
      
      const unsub = onSnapshot(q, (snap) => {
        const items: any[] = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        
        allItems = [...allItems.filter(i => !chunk.includes(i.ownerId)), ...items];
        // Hide our own items just in case we are in our own connectedTo
        setSharedItems(allItems.filter(i => i.ownerId !== user.uid));
        setLoading(false);
      }, (err) => {
        if (err && err.message && !err.message.includes("permission")) {
          console.error("Feed error:", err);
        }
        setLoading(false);
      });
      unsubs.push(unsub);
    });
    
    return () => {
      unsubs.forEach(u => u());
    };
  }, [user, contactsIdsString]);

  // Fetch My Items
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'sharedItems'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setMyItems(items);
    });
    return () => unsub();
  }, [user]);

  // Fetch Proposals for My Items
  useEffect(() => {
    if (!user) return;
    const fetchProposals = async () => {
      if (myItems.length === 0) {
        setProposals([]);
        return;
      }
      const allProps: any[] = [];
      for (const item of myItems) {
        try {
          const propsSnap = await getDocs(collection(db, `sharedItems/${item.id}/proposals`));
          propsSnap.forEach(d => allProps.push({ id: d.id, ...d.data() }));
        } catch (e: any) {
          if (e && e.message && !e.message.includes("permission")) {
            console.error("Error fetching proposals", e);
          }
        }
      }
      setProposals(allProps);
    };

    fetchProposals();
  }, [myItems, user]);

  // Fetch incoming invites
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/networkInvites`));
    const unsub = onSnapshot(q, (snap) => {
      const allInvites: any[] = [];
      snap.forEach(d => allInvites.push({ id: d.id, ...d.data() }));
      setInvites(allInvites);
    });
    return () => unsub();
  }, [user]);

  const handleAcceptInvite = async (invite: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/networkInvites`, invite.id), {
        status: 'accepted',
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, `users/${user.uid}/networkConnections`, invite.fromUserId), {
        connectedAt: serverTimestamp(),
        source: 'invite_accept'
      });
    } catch (e: any) {
      console.warn("Failed to accept invite:", e.message);
    }
  };

  const handleDeclineInvite = async (invite: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/networkInvites`, invite.id), {
        status: 'declined',
        updatedAt: serverTimestamp()
      });
    } catch (e: any) {
      console.warn("Failed to decline invite:", e.message);
    }
  };

  const handleSubmitProposal = async (type: string) => {
    if (!user || !showProposalModal) return;
    try {
      const propId = `PROP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      await setDoc(doc(db, `sharedItems/${showProposalModal.id}/proposals/${propId}`), {
        sharedItemId: showProposalModal.id,
        ownerId: showProposalModal.ownerId,
        creatorId: user.uid,
        proposalType: type,
        message: proposalMessage,
        relatedCargoId: null, // Basic for Step C
        relatedVesselId: null,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      setShowProposalModal(null);
      setProposalMessage('');
      alert("Proposal sent successfully");
    } catch (e: any) {
      alert("Failed to send proposal: " + e.message);
    }
  };

  const renderSharedVessel = (v: any) => (
    <div className="bg-surface-container border border-outline p-4 group relative flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-outline/30 pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 border border-primary/30 text-primary">
            <Ship className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">{v.vessel_name || v.name}</div>
            <div className="text-[9px] text-on-surface-variant font-mono uppercase italic">{v.vessel_type || 'TYPE UNKNOWN'} • {v.dwt ? `${v.dwt} DWT` : 'DWT UNKNOWN'}</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] bg-tertiary/10 text-tertiary border border-tertiary/20 px-2 py-0.5 font-bold tracking-widest rounded-sm mb-1">SHARED VESSEL</span>
          <span className="text-[9px] text-on-surface-variant font-mono">{v.ownerDisplayName}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface p-2 border border-outline/50">
          <span className="text-[8px] text-on-surface-variant uppercase block mb-1 font-mono">Open Port</span>
          <span className="text-[10px] text-primary font-bold uppercase">{v.openPort || 'OPEN'}</span>
        </div>
        <div className="bg-surface p-2 border border-outline/50">
          <span className="text-[8px] text-on-surface-variant uppercase block mb-1 font-mono">Open Date</span>
          <span className="text-[10px] text-on-surface font-bold uppercase">{v.openDate || 'PROMPT'}</span>
        </div>
      </div>
      {v.restrictions || v.gear || v.cranes ? (
         <div className="bg-surface p-2 border border-outline/50">
           {v.gear && <div className="text-[9px] font-mono text-on-surface"><span className="text-on-surface-variant">Gear:</span> {v.gear}</div>}
           {v.cranes && <div className="text-[9px] font-mono text-on-surface"><span className="text-on-surface-variant">Cranes:</span> {v.cranes}</div>}
           {v.restrictions && <div className="text-[9px] font-mono text-on-surface"><span className="text-on-surface-variant">Restrictions:</span> {v.restrictions}</div>}
         </div>
      ) : null}
      
      {activeTab === 'FEED' && (
        <div className="flex gap-2 mt-2 pt-3 border-t border-outline/30">
          <button onClick={() => setShowProposalModal(v)} className="flex-1 bg-primary/10 hover:bg-primary border border-primary/30 text-primary hover:text-on-primary py-2 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm">
            Express Interest
          </button>
          <button onClick={() => setShowProposalModal(v)} className="flex-1 bg-tertiary/10 hover:bg-tertiary border border-tertiary/30 text-tertiary hover:text-on-primary py-2 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm">
            Propose Cargo
          </button>
        </div>
      )}
    </div>
  );

  const renderSharedCargo = (c: any) => (
    <div className="bg-surface-container border border-outline p-4 group relative flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-outline/30 pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-tertiary/20 p-2 border border-tertiary/30 text-tertiary">
            <Package2 className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">{c.commodity || c.raw_commodity}</div>
            <div className="text-[9px] text-on-surface-variant font-mono uppercase italic">{c.quantity || `${c.quantity_mt || '?'} MT`}</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] bg-tertiary/10 text-tertiary border border-tertiary/20 px-2 py-0.5 font-bold tracking-widest rounded-sm mb-1">SHARED CARGO</span>
          <span className="text-[9px] text-on-surface-variant font-mono">{c.ownerDisplayName}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface p-2 border border-outline/50">
          <span className="text-[8px] text-on-surface-variant uppercase block mb-1 font-mono">Route</span>
          <span className="text-[10px] text-primary font-bold uppercase">{c.loadPort || 'ANY'} ➝ {c.dischargePort || 'ANY'}</span>
        </div>
        <div className="bg-surface p-2 border border-outline/50">
          <span className="text-[8px] text-on-surface-variant uppercase block mb-1 font-mono">Laycan / Terms</span>
          <span className="text-[10px] text-on-surface font-bold uppercase">{c.laycan || 'PROMPT'} • {c.terms || '?'}</span>
        </div>
      </div>
      {c.special_requirements ? (
         <div className="bg-surface p-2 border border-outline/50">
           <div className="text-[9px] font-mono text-on-surface"><span className="text-on-surface-variant">Reqs:</span> {c.special_requirements}</div>
         </div>
      ) : null}

      {activeTab === 'FEED' && (
        <div className="flex gap-2 mt-2 pt-3 border-t border-outline/30">
          <button onClick={() => setShowProposalModal(c)} className="flex-1 bg-primary/10 hover:bg-primary border border-primary/30 text-primary hover:text-on-primary py-2 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm">
            Express Interest
          </button>
          <button onClick={() => setShowProposalModal(c)} className="flex-1 bg-tertiary/10 hover:bg-tertiary border border-tertiary/30 text-tertiary hover:text-on-primary py-2 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm">
            Propose Vessel
          </button>
        </div>
      )}
    </div>
  );

  const renderContacts = () => {
    const filteredContacts = contactsIds.filter(id => 
      id.toLowerCase().includes(contactSearchQuery.toLowerCase())
    );

    return (
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
        <div className="relative mb-4">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant" />
          <input 
            className="w-full bg-surface-container border border-outline focus:border-primary focus:ring-0 text-on-surface font-mono text-[11px] text-on-surface/80 pl-8 py-2 placeholder:text-[#2d3f5a] rounded-sm"
            placeholder="SEARCH NETWORK CONTACTS..."
            value={contactSearchQuery}
            onChange={(e) => setContactSearchQuery(e.target.value)}
          />
        </div>
        {filteredContacts.length === 0 ? (
          <div className="text-center py-12 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
             <Users className="h-8 w-8 opacity-20" />
             No network contacts found.
          </div>
        ) : (
          filteredContacts.map(id => (
            <div key={id} className="bg-surface-container border border-outline p-4 rounded-sm flex justify-between items-center">
              <div>
                <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">Network Partner</div>
                <div className="text-[9px] text-on-surface-variant font-mono">ID: {id}</div>
                <div className="text-[8px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 inline-block mt-2 font-bold uppercase">CONNECTED</div>
              </div>
              <div className="flex gap-2">
                <button disabled className="text-[9px] uppercase font-bold text-on-surface-variant border border-outline px-2 py-1 rounded-sm opacity-50">View</button>
                <button disabled className="text-[9px] uppercase font-bold text-error border border-error/50 px-2 py-1 rounded-sm opacity-50">Remove</button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderInvites = () => (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
      {invites.length === 0 ? (
        <div className="text-center py-12 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
           <Mail className="h-8 w-8 opacity-20" />
           No connection requests.
        </div>
      ) : (
        invites.map(invite => (
          <div key={invite.id} className="bg-surface-container border border-outline p-4 rounded-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">{invite.fromName || 'Unknown Sender'}</div>
              <div className="text-[9px] text-on-surface-variant font-mono">{invite.fromCompany || 'Company N/A'} • {invite.fromEmail || 'No email provided'}</div>
              {invite.message && <div className="text-[10px] text-on-surface-variant mt-2 italic">"{invite.message}"</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              {invite.status === 'pending' ? (
                <>
                  <button onClick={() => handleDeclineInvite(invite)} className="flex items-center gap-1 text-[9px] uppercase font-bold text-error border border-error/50 px-3 py-1.5 rounded-sm hover:bg-error/10">
                    <X className="h-3 w-3" /> Decline
                  </button>
                  <button onClick={() => handleAcceptInvite(invite)} className="flex items-center gap-1 text-[9px] uppercase font-bold text-primary border border-primary/50 px-3 py-1.5 rounded-sm hover:bg-primary/10">
                    <Check className="h-3 w-3" /> Accept
                  </button>
                </>
              ) : (
                <span className={cn("text-[9px] uppercase font-bold px-2 py-1 rounded-sm", invite.status === 'accepted' ? "bg-primary/10 text-primary border border-primary/20" : "bg-error/10 text-error border border-error/20")}>
                  {invite.status}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderProposalsTab = () => (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
      {proposals.length === 0 ? (
        <div className="text-center py-12 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
           <MessageSquare className="h-8 w-8 opacity-20" />
           No proposals received yet.
        </div>
      ) : (
        proposals.map(p => (
           <div key={`${p.sharedItemId}-${p.id}`} className="p-4 border border-outline bg-surface-container rounded-sm">
             <div className="flex justify-between items-start mb-2">
               <div>
                 <div className="text-[10px] font-bold text-tertiary uppercase tracking-widest">{p.proposalType.replace('_', ' ')}</div>
                 <div className="text-[9px] text-on-surface-variant font-mono">FROM: {p.creatorId}</div>
               </div>
               <span className="text-[8px] px-2 py-0.5 bg-surface-container-high border border-outline rounded-sm uppercase tracking-widest text-on-surface-variant">
                 {p.status || 'PENDING'}
               </span>
             </div>
             <div className="text-[12px] text-on-surface bg-surface border border-outline/30 p-3 rounded-sm">
               {p.message || 'No message provided'}
             </div>
           </div>
        ))
      )}
    </div>
  );

  const TABS = [
    { id: 'FEED', label: 'Network Feed', icon: Share2 },
    { id: 'MY_ITEMS', label: 'My Shared', icon: Package2 },
    { id: 'PROPOSALS', label: 'Proposals', icon: MessageSquare },
    { id: 'CONTACTS', label: 'Contacts', icon: Users },
    { id: 'INVITES', label: 'Invites', icon: Mail }
  ] as const;

  return (
    <div className="flex flex-col md:flex-row h-full bg-surface md:border-l border-outline w-full max-w-full overflow-hidden">
      
      {/* Mobile Tabs */}
      <div className="md:hidden flex overflow-x-auto no-scrollbar border-b border-outline bg-surface-container shrink-0 w-full">
        {TABS.map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 px-4 py-3 text-[10px] uppercase font-bold tracking-widest whitespace-nowrap transition-colors border-b-2",
              activeTab === tab.id ? "text-primary border-primary bg-primary/5" : "text-on-surface-variant border-transparent hover:text-on-surface"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 border-r border-outline flex-col shrink-0 h-full">
        <div className="p-6 border-b border-outline bg-surface-container-high">
          <h2 className="text-[14px] font-bold text-on-surface uppercase tracking-widest flex items-center gap-2">
            <Share2 className="h-4 w-4 text-tertiary" /> Desk Network
          </h2>
          <p className="text-[9px] text-on-surface-variant font-mono mt-2">Secure peer-to-peer maritime intelligence sharing</p>
        </div>
        <div className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto no-scrollbar">
          {TABS.map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full text-left p-3 border text-[10px] uppercase font-bold tracking-widest transition-all flex items-center gap-2 rounded-sm",
                activeTab === tab.id ? "bg-primary/10 border-primary text-primary" : "border-outline/30 text-on-surface-variant hover:border-outline hover:text-on-surface bg-surface"
              )}
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{tab.label}</span>
              {(tab.id === 'PROPOSALS' && proposals.length > 0) && (
                 <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 rounded-full text-[8px]">{proposals.length}</span>
              )}
              {(tab.id === 'INVITES' && invites.filter(i => i.status === 'pending').length > 0) && (
                 <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded-full text-[8px]">{invites.filter(i => i.status === 'pending').length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-container-lowest h-full overflow-hidden">
        <div className="h-14 border-b border-outline bg-surface-container px-6 flex items-center justify-between shrink-0">
          <h3 className="text-[12px] font-bold text-on-surface uppercase tracking-widest">
            {TABS.find(t => t.id === activeTab)?.label || 'Network'}
          </h3>
        </div>
        
        {activeTab === 'FEED' || activeTab === 'MY_ITEMS' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
            {loading && activeTab === 'FEED' ? (
              <div className="h-full w-full flex items-center justify-center text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Loading network feed...</div>
            ) : (
              <div className="w-full grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-6 pb-20">
                {(activeTab === 'FEED' ? sharedItems : myItems).map(item => (
                  <React.Fragment key={item.id}>
                    {item.itemType === 'vessel' ? renderSharedVessel(item) : renderSharedCargo(item)}
                  </React.Fragment>
                ))}
                {(activeTab === 'FEED' ? sharedItems : myItems).length === 0 && (
                   <div className="col-span-full text-center py-24 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
                     <Share2 className="h-8 w-8 opacity-20" />
                     {activeTab === 'FEED' ? 'No incoming shared items visible in your network.' : 'You have not shared any items to the network.'}
                   </div>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'PROPOSALS' ? (
          renderProposalsTab()
        ) : activeTab === 'CONTACTS' ? (
          renderContacts()
        ) : activeTab === 'INVITES' ? (
          renderInvites()
        ) : null}
      </div>

      {/* Proposal Modal */}
      <AnimatePresence>
        {showProposalModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface-container-highest/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md bg-surface-container border border-primary shadow-2xl p-6 relative rounded-sm"
            >
              <button 
                onClick={() => setShowProposalModal(null)}
                className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-[14px] font-bold text-on-surface uppercase tracking-widest mb-4 flex items-center gap-2">
                <Send className="h-4 w-4" /> Submit Proposal
              </h2>
              <div className="mb-6 p-4 bg-surface-container-highest border border-outline rounded-sm">
                <div className="text-[9px] text-on-surface-variant font-mono uppercase mb-2">Target Item</div>
                <div className="text-[12px] font-bold text-tertiary uppercase tracking-widest">
                  {showProposalModal.itemType === 'vessel' ? showProposalModal.vessel_name : showProposalModal.commodity}
                </div>
              </div>
              <textarea
                value={proposalMessage}
                onChange={(e) => setProposalMessage(e.target.value)}
                placeholder="Enter your message or proposal details..."
                className="w-full h-32 bg-surface border border-outline/50 p-4 text-[12px] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary mb-6 resize-none rounded-sm font-sans"
              />
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handleSubmitProposal('interest')}
                  className="bg-primary hover:bg-primary/90 text-on-primary py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm flex justify-center items-center gap-2"
                >
                  Express Interest
                </button>
                <button 
                  onClick={() => handleSubmitProposal(showProposalModal.itemType === 'vessel' ? 'offer_cargo' : 'offer_vessel')}
                  className="bg-tertiary hover:bg-tertiary/90 text-on-primary py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm flex justify-center items-center gap-2"
                >
                  {showProposalModal.itemType === 'vessel' ? 'Propose Cargo' : 'Propose Vessel'}
                </button>
                <button 
                  onClick={() => handleSubmitProposal('comment')}
                  className="col-span-2 border border-outline/50 hover:bg-surface text-on-surface py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm flex justify-center items-center gap-2"
                >
                  <MessageSquare className="h-3 w-3" /> Add Comment
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
