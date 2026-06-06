import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, onSnapshot, doc, deleteDoc, updateDoc, orderBy } from 'firebase/firestore';
import { FileText, Loader2, Edit, Trash2, Clock, Check, AlertCircle, Copy, Download, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { DocumentEditor } from './DocumentEditor';
import { useNotification } from '../lib/NotificationContext';

export const DraftList: React.FC = () => {
  const [drafts, setDrafts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDraft, setActiveDraft] = useState<any | null>(null);
  const [filter, setFilter] = useState<'all' | 'draft' | 'review_required' | 'ready' | 'archived'>('all');
  const { notify } = useNotification();

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, `users/${auth.currentUser.uid}/recapDrafts`),
      orderBy('updatedAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const dbDrafts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDrafts(dbDrafts);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser) return;
    if (confirm("Are you sure you want to delete this draft?")) {
      try {
        await deleteDoc(doc(db, `users/${auth.currentUser.uid}/recapDrafts`, id));
        notify({ title: 'Draft deleted', message: 'The draft was removed successfully.', type: 'success' });
      } catch (err: any) {
        notify({ title: 'Error', message: 'Failed to delete draft', type: 'error' });
      }
    }
  };

  const handleArchive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, `users/${auth.currentUser.uid}/recapDrafts`, id), {
        status: 'archived'
      });
      notify({ title: 'Draft archived', message: 'The draft has been archived.', type: 'success' });
    } catch (err: any) {
      notify({ title: 'Error', message: 'Failed to archive draft', type: 'error' });
    }
  };
  
  const handleMarkStatus = async (id: string, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, `users/${auth.currentUser.uid}/recapDrafts`, id), {
        status: newStatus
      });
      notify({ title: 'Status updated', message: `Draft marked as ${newStatus.replace('_', ' ')}.`, type: 'success' });
    } catch (err: any) {
      notify({ title: 'Error', message: 'Failed to update status', type: 'error' });
    }
  };

  const filteredDrafts = drafts.filter(d => {
    if (filter === 'all') return d.status !== 'archived';
    return d.status === filter;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface h-full relative z-0">
      <div className="flex-none p-6 md:p-10 border-b border-outline/20">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-display uppercase tracking-widest text-on-surface mb-2">Recap Drafts</h1>
          <p className="text-on-surface-variant font-mono text-xs md:text-sm tracking-widest uppercase">
            {filteredDrafts.length} Active Documents
          </p>
        </div>
      </div>

      <div className="flex px-6 md:px-10 py-4 gap-4 overflow-x-auto border-b border-outline/10 shrink-0 custom-scrollbar">
        {['all', 'review_required', 'ready', 'archived'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={cn(
              "px-4 py-2 rounded-sm text-[10px] uppercase tracking-widest font-medium transition-colors whitespace-nowrap",
              filter === f 
                ? "bg-primary/10 text-primary border border-primary/20" 
                : "text-on-surface-variant hover:text-on-surface border border-transparent"
            )}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar pb-32">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredDrafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center h-full max-h-[400px]">
             <FileText className="h-12 w-12 text-outline mb-4" />
             <h3 className="text-lg font-display uppercase tracking-widest mb-2">No Drafts Found</h3>
             <p className="text-sm font-mono text-on-surface-variant max-w-sm">
               You haven't saved any recap drafts yet, or none match the selected filter.
             </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredDrafts.map(draft => (
              <motion.div
                key={draft.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setActiveDraft(draft)}
                className="group p-5 bg-surface-container/30 border border-outline/20 hover:border-primary/30 rounded-sm cursor-pointer transition-all flex flex-col h-[240px]"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-[10px] font-mono tracking-widest uppercase text-on-surface-variant">
                      {draft.recapReference || 'DRAFT'}
                    </span>
                  </div>
                  <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => handleDelete(draft.id, e)}
                      className="p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error rounded-sm transition-colors"
                      title="Delete Draft"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    {draft.status !== 'archived' && (
                       <button 
                         onClick={(e) => handleArchive(draft.id, e)}
                         className="p-1.5 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface rounded-sm transition-colors"
                         title="Archive"
                       >
                         <Archive className="h-3 w-3" />
                       </button>
                    )}
                  </div>
                </div>

                <h3 className="font-medium text-sm mb-auto line-clamp-2 leading-relaxed">
                  {draft.title}
                </h3>

                <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-outline/10">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest">
                    <span className="text-on-surface-variant flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {draft.updatedAt?.toDate().toLocaleDateString() || 'Just now'}
                    </span>
                    <span className={cn(
                      "px-2 py-1 flex items-center gap-1 rounded-sm",
                      draft.status === 'ready' ? "bg-tertiary/10 text-tertiary" : 
                      draft.status === 'review_required' ? "bg-error/10 text-error" : 
                      "bg-surface-container-high text-on-surface-variant"
                    )}>
                      {draft.status === 'ready' && <Check className="w-3 h-3" />}
                      {draft.status === 'review_required' && <AlertCircle className="w-3 h-3" />}
                      {draft.status?.replace('_', ' ')}
                    </span>
                  </div>
                  
                  {draft.status === 'review_required' && (
                     <div className="flex flex-col gap-1 w-full mt-2">
                       <button 
                         onClick={(e) => handleMarkStatus(draft.id, 'ready', e)}
                         className="w-full py-1.5 text-[9px] uppercase tracking-widest border border-outline/20 hover:border-tertiary/30 hover:bg-tertiary/10 hover:text-tertiary transition-colors"
                       >
                         Mark as Ready
                       </button>
                     </div>
                  )}
                  {draft.status === 'ready' && (
                     <div className="flex flex-col gap-1 w-full mt-2">
                       <button 
                         onClick={(e) => handleMarkStatus(draft.id, 'review_required', e)}
                         className="w-full py-1.5 text-[9px] uppercase tracking-widest border border-outline/20 hover:border-error/30 hover:bg-error/10 hover:text-error transition-colors"
                       >
                         Mark Review Req
                       </button>
                     </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {activeDraft && (
          <DocumentEditor 
            type={activeDraft.title.includes('GENCON') ? 'GENCON' : 'RECAP'}
            data={{ 
              draftId: activeDraft.id,
              contentOverride: activeDraft.content,
              cargo: activeDraft.cargoId ? { id: activeDraft.cargoId } : null,
              vessel: activeDraft.vesselId ? { id: activeDraft.vesselId } : null
            }}
            onClose={() => setActiveDraft(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
