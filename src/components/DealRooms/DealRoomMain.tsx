import React, { useState, useEffect } from 'react';
import { Briefcase, Search, Plus, Filter, LayoutDashboard, Clock, FileText, Anchor, TrendingUp, X } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy, getDoc, doc } from 'firebase/firestore';
import { db, useAuth } from '../../lib/firebase';
import { DealRoom, createDealRoom, updateDealRoom, addDealRoomAudit, addDealRoomNote, DealRoomStatus } from '../../lib/dealRoomService';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { DealRoomDetail } from './DealRoomDetail';

export const DealRoomMain = () => {
  const { user } = useAuth();
  const [dealRooms, setDealRooms] = useState<DealRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'dealRooms'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() } as DealRoom));
      // Client-side permission filtering for now, we also have Firestore rules
      const accessibleRooms = rooms.filter(r => 
        r.createdByUid === user.uid || 
        r.participantUids?.includes(user.uid)
      );
      setDealRooms(accessibleRooms);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const filteredRooms = dealRooms.filter(r => {
    if (filter === 'active' && !['active', 'negotiating'].includes(r.status)) return false;
    if (filter === 'negotiating' && r.status !== 'negotiating') return false;
    if (filter === 'awaiting_confirmation' && r.status !== 'awaiting_confirmation') return false;
    if (filter === 'archived' && r.status !== 'archived') return false;
    if (r.status === 'archived' && filter !== 'archived' && filter !== 'all') return false;

    if (searchQuery) {
      if (!r.title?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    }
    return true;
  });

  const handleCreateNew = async () => {
    if (!user) return;
    const newId = await createDealRoom({
      title: 'New Deal Room',
      status: 'draft',
      createdByUid: user.uid,
      participantUids: [user.uid]
    });
    setSelectedRoomId(newId.id || newId); 
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface relative overflow-hidden">
      {/* Header */}
      <div className="flex-none p-4 sm:p-8 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 text-primary mb-2">
              <Briefcase className="w-5 h-5" />
              <h1 className="text-2xl sm:text-4xl font-display tracking-tight leading-none uppercase">Deal Rooms</h1>
            </div>
            <p className="text-on-surface-variant text-sm tracking-widest uppercase font-mono mt-1 opacity-60">Complete Negotiation & Broker Workflow</p>
          </div>
          <button 
            onClick={handleCreateNew}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-black font-bold uppercase tracking-widest text-[10px] hover:bg-primary/90 transition-all hover:shadow-[0_0_20px_rgba(var(--color-primary),0.3)] shadow-[0_0_15px_rgba(var(--color-primary),0.2)] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> New Deal Room
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-surface-container-low p-2 border border-outline/30 mt-4 overflow-x-auto">
          <div className="flex items-center gap-1 w-full sm:w-auto">
            {['all', 'active', 'negotiating', 'awaiting_confirmation', 'archived'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-2 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors",
                  filter === f 
                    ? "bg-primary text-black" 
                    : "text-on-surface-variant hover:bg-surface-container-highest hover:text-primary"
                )}
              >
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>
          
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input 
              type="text" 
              placeholder="SEARCH DEALS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-container/50 border border-outline/50 focus:border-primary/50 transition-colors text-on-surface px-10 py-2 outline-none text-[10px] uppercase font-mono tracking-widest placeholder:text-on-surface-variant/50"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 pt-0">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="w-8 h-8 border-t-2 border-primary border-solid rounded-full animate-spin"></div>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full border border-dashed border-outline/30 text-center p-8">
            <LayoutDashboard className="w-12 h-12 text-on-surface-variant/20 mb-4 stroke-1" />
            <h3 className="text-on-surface text-lg font-bold uppercase tracking-widest mb-2 font-display">No Deal Rooms Found</h3>
            <p className="text-on-surface-variant/60 text-xs max-w-md mx-auto uppercase tracking-widest font-mono">
              Process offers or create a new deal room to start managing your negotiations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map(room => (
              <DealRoomCard key={room.id} room={room} onClick={() => setSelectedRoomId(room.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedRoomId && (
          <DealRoomDetail 
            roomId={selectedRoomId} 
            onClose={() => setSelectedRoomId(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const DealRoomCard = ({ room, onClick }: { room: DealRoom, onClick: () => void }) => {
  return (
    <div 
      onClick={onClick}
      className="bg-surface-container-low border border-outline/50 hover:border-primary/50 transition-colors p-6 cursor-pointer flex flex-col group h-full shadow-sm hover:shadow-md"
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-display text-on-surface font-light group-hover:text-primary transition-colors truncate pr-4">
          {room.title || 'Untitled Deal'}
        </h3>
        <span className={cn(
          "px-2 py-0.5 text-[8px] uppercase tracking-widest font-bold font-mono border whitespace-nowrap",
          room.status === 'awaiting_confirmation' ? "border-tertiary text-tertiary bg-tertiary/10" :
          room.status === 'confirmed_internal' ? "border-primary text-black bg-primary" :
          room.status === 'closed' ? "border-on-surface-variant text-on-surface-variant bg-surface" :
          "border-primary/50 text-primary bg-primary/5"
        )}>
          {room.status.replace('_', ' ')}
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mt-auto">
        <div className="flex flex-col gap-1">
          <span className="text-[8px] uppercase tracking-[0.2em] text-on-surface-variant">Source</span>
          <span className="text-[10px] font-mono text-on-surface truncate">{room.source || 'Manual'}</span>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <span className="text-[8px] uppercase tracking-[0.2em] text-on-surface-variant">Last Update</span>
          <span className="text-[10px] font-mono text-primary">
            {room.updatedAt?.toDate ? new Date(room.updatedAt.toDate()).toLocaleDateString() : 'Just now'}
          </span>
        </div>
      </div>
      
      {(room.linkedCargoId || room.linkedVesselId) && (
        <div className="mt-4 pt-4 border-t border-outline/20 flex gap-4 text-on-surface-variant">
           {room.linkedCargoId && <div className="flex items-center gap-1 text-[10px] font-mono uppercase"><TrendingUp className="w-3 h-3"/> Cargo</div>}
           {room.linkedVesselId && <div className="flex items-center gap-1 text-[10px] font-mono uppercase"><Anchor className="w-3 h-3"/> Vessel</div>}
        </div>
      )}
    </div>
  );
};
