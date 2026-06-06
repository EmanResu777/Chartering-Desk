import React, { useState } from 'react';
import { Search, Plus, Calendar, ArrowRight, TrendingUp, X, Info, Scale, MapPin, FileText, Zap, Loader2, Package2, RotateCw, CheckCircle, Database, Trash2, Share2, User, Download, FileJson, FileSpreadsheet, ChevronDown, Filter } from 'lucide-react';
import { Cargo, Vessel, INITIAL_CARGO, cn, exportToCSV, exportToJSON } from '../lib/utils';
import { REGIONS, parseRegion, isDateInRange, matchMinMax } from '../lib/filterUtils';
import { motion, AnimatePresence } from 'motion/react';
import { useWorkspace } from '../lib/WorkspaceContext';
import { useConfig } from '../lib/ConfigContext';


export const CargoDesk: React.FC<{ 
  onMatch: (cargo: Cargo) => void,
  cargoList: Cargo[],
  vesselList?: Vessel[],
  onCreate: (cargo: Cargo) => void,
  onUpdate: (id: string, cargo: Partial<Cargo>) => void,
  onDelete: (id: string) => void,
  onBulkDelete: (ids: Set<string>) => void,
  onToggleVisibility?: (type: 'cargo', item: Cargo) => void,
  selectedCargo: Cargo | null,
  setSelectedCargo: React.Dispatch<React.SetStateAction<Cargo | null>>
}> = ({ onMatch, cargoList, vesselList, onCreate, onUpdate, onDelete, onBulkDelete, onToggleVisibility, selectedCargo, setSelectedCargo }) => {
  const { t } = useConfig();
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [isNewCargoModalOpen, setIsNewCargoModalOpen] = useState(false);
  
  // New Filter States
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('cargo_desk_search') || '');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>(() => (localStorage.getItem('cargo_desk_sort') as any) || 'newest');
  const [laycanFilter, setLaycanFilter] = useState<string>(() => localStorage.getItem('cargo_desk_laycan') || 'all');
  const [regionFilter, setRegionFilter] = useState<string>(() => localStorage.getItem('cargo_desk_region') || 'all');
  const [statusFilter, setStatusFilter] = useState<string>(() => localStorage.getItem('cargo_desk_status') || 'all');
  const [minQuantity, setMinQuantity] = useState<string>(() => localStorage.getItem('cargo_desk_min_qty') || '');
  const [maxQuantity, setMaxQuantity] = useState<string>(() => localStorage.getItem('cargo_desk_max_qty') || '');

  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  React.useEffect(() => {
    localStorage.setItem('cargo_desk_search', searchQuery);
  }, [searchQuery]);
  React.useEffect(() => {
    localStorage.setItem('cargo_desk_sort', sortBy);
  }, [sortBy]);
  React.useEffect(() => {
    localStorage.setItem('cargo_desk_laycan', laycanFilter);
  }, [laycanFilter]);
  React.useEffect(() => {
    localStorage.setItem('cargo_desk_region', regionFilter);
  }, [regionFilter]);
  React.useEffect(() => {
    localStorage.setItem('cargo_desk_status', statusFilter);
  }, [statusFilter]);
  React.useEffect(() => {
    localStorage.setItem('cargo_desk_min_qty', minQuantity);
  }, [minQuantity]);
  React.useEffect(() => {
    localStorage.setItem('cargo_desk_max_qty', maxQuantity);
  }, [maxQuantity]);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCatOpen, setIsCatOpen] = useState(false);
  const [isExpOpen, setIsExpOpen] = useState(false);

  const { currentWorkspace } = useWorkspace();
  const isViewer = currentWorkspace?.myRole === 'viewer';

  let filteredCargo = cargoList.filter(c => {
    const matchesCategory = activeCategory === 'ALL' || c.category === activeCategory;
    const matchesSearch = (c.commodity || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                         (c.loadPort || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (c.dischargePort || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (c.id || '').toLowerCase().includes(searchQuery.toLowerCase());
                         
    const matchesLaycan = laycanFilter === 'all' || isDateInRange(c.laycan || '', laycanFilter);
    const matchesRegion = regionFilter === 'all' || [parseRegion(c.loadPort || ''), parseRegion(c.dischargePort || '')].includes(regionFilter);
    const matchesStatus = statusFilter === 'all' || (c.status || '').toLowerCase() === statusFilter.toLowerCase();
    const matchesQuantity = matchMinMax(c.quantity, minQuantity, maxQuantity);
    
    return matchesCategory && matchesSearch && matchesLaycan && matchesRegion && matchesStatus && matchesQuantity;
  });

  filteredCargo.sort((a: any, b: any) => {
    let aVal = a.createdAt || a.id;
    let bVal = b.createdAt || b.id;
    
    let cmp = 0;
    if (aVal > bVal) cmp = 1;
    else if (aVal < bVal) cmp = -1;
    
    return sortBy === 'newest' ? -cmp : cmp;
  });

  const activeFilterCount = (laycanFilter !== 'all' ? 1 : 0) + (regionFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (activeCategory !== 'ALL' ? 1 : 0) + (minQuantity || maxQuantity ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery('');
    setLaycanFilter('all');
    setRegionFilter('all');
    setStatusFilter('all');
    setActiveCategory('ALL');
    setMinQuantity('');
    setMaxQuantity('');
  };

  const [confirmAction, setConfirmAction] = useState<{type: 'delete' | 'push' | 'unshare', target: 'bulk' | 'single', id?: string} | null>(null);

  const toggleSelectAll = () => {
    const allFilteredIds = filteredCargo.map(c => c.id);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedIds.has(id));
    
    if (areAllSelected) {
      const newSelected = new Set(selectedIds);
      allFilteredIds.forEach(id => newSelected.delete(id));
      setSelectedIds(newSelected);
    } else {
      const newSelected = new Set(selectedIds);
      allFilteredIds.forEach(id => newSelected.add(id));
      setSelectedIds(newSelected);
    }
  };

  const toggleSelectOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleConfirmAction = () => {
    if (!confirmAction) return;
    
    if (confirmAction.type === 'delete') {
      if (confirmAction.target === 'bulk') {
        onBulkDelete(selectedIds);
        setSelectedIds(new Set());
        if (selectedCargo && selectedIds.has(selectedCargo.id)) {
          setSelectedCargo(null);
        }
      } else if (confirmAction.target === 'single' && confirmAction.id) {
        onDelete(confirmAction.id);
        if (selectedCargo?.id === confirmAction.id) setSelectedCargo(null);
        const newSelected = new Set(selectedIds);
        newSelected.delete(confirmAction.id);
        setSelectedIds(newSelected);
      }
    } else if (confirmAction.type === 'push') {
       if (confirmAction.target === 'bulk') {
          const cargosToPush = cargoList.filter(c => selectedIds.has(c.id));
          cargosToPush.forEach(cargo => {
            if (onToggleVisibility) onToggleVisibility('cargo', cargo);
          });
          setSelectedIds(new Set());
       } else if (confirmAction.target === 'single' && confirmAction.id) {
          const cargo = cargoList.find(c => c.id === confirmAction.id);
          if (cargo && onToggleVisibility) onToggleVisibility('cargo', cargo);
       }
    } else if (confirmAction.type === 'unshare') {
       if (confirmAction.target === 'single' && confirmAction.id) {
          const cargo = cargoList.find(c => c.id === confirmAction.id);
          if (cargo && onToggleVisibility) onToggleVisibility('cargo', cargo);
       }
    }
    setConfirmAction(null);
  };

  const handleBulkDeleteClicked = () => {
    setConfirmAction({ type: 'delete', target: 'bulk' });
  };

  const handleBulkPushToNetworkClicked = () => {
    setConfirmAction({ type: 'push', target: 'bulk' });
  };

  const cargoCategories = [
    { id: 'ALL', label: 'All', icon: Package2 },
    { id: 'DRY BULK', label: 'Dry Bulk', icon: Scale },
    { id: 'PROJECT CARGO', label: 'Project', icon: Zap },
    { id: 'TANKER', label: 'Tanker', icon: RotateCw },
  ];

  const handleCreateCargo = (newCargo: Cargo) => {
    onCreate(newCargo);
    setIsNewCargoModalOpen(false);
  };

  const handleCargoDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmAction({ type: 'delete', target: 'single', id });
  };

  const handleStatusChange = (id: string, newStatus: Cargo['status']) => {
    onUpdate(id, { status: newStatus });
    if (selectedCargo?.id === id) {
      setSelectedCargo(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!selectedCargo) return;
    const newNotes = e.target.value;
    
    setSelectedCargo({ ...selectedCargo, privateNotes: newNotes });
    onUpdate(selectedCargo.id, { privateNotes: newNotes });
  };

  const fetchAiInsights = async (commodity: string) => {
    if (!process.env.GEMINI_API_KEY) {
      setAiInsights("AI API Key not configured.");
      return;
    }
    
    setIsAiLoading(true);
    setAiInsights(null);
    try {
      const response = await fetch('/api/ai/generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "gemini-1.5-flash",
          contents: `Provide transport specs for "${commodity}": SF range, hazards(IMDG/IMSBC), moisture limits, ventilation needs. Keep it short.`
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to communicate with AI");
      }

      const result = await response.json();
      setAiInsights(result.text || "No insights found.");
    } catch (error: any) {
      console.error("AI Fetch error:", error);
      setAiInsights(`Error: ${error.message || "Failed to fetch auxiliary data."}`);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCargoClick = (cargo: Cargo) => {
    setSelectedCargo(cargo);
    setAiInsights(null);
    if (cargo.commodity) {
      fetchAiInsights(cargo.commodity);
    }
  };

  return (
    <div className="flex-1 flex flex-row min-w-0 h-full overflow-hidden bg-surface relative">
      {/* Main List */}
      <div className="flex-1 overflow-y-auto min-w-0 h-full relative"> 
        <div className="absolute inset-0 bg-surface opacity-80 backdrop-blur-3xl z-[-1]"></div>
        <div className="p-3 sm:p-6 border-b border-outline/30 bg-surface/80 backdrop-blur-xl flex flex-col gap-3 sm:gap-4 sticky top-0 z-[40] shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-r from-surface-container-low/50 to-transparent z-[-1]"></div>
          
          <div className="flex flex-row justify-between items-start sm:items-center gap-2 w-full relative z-20">
            <div className="flex flex-col flex-1 min-w-0">
              <h2 className="font-display text-2xl sm:text-4xl text-on-surface tracking-tight font-light bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent truncate w-full">{t('cargo_interface')}</h2>
              <div className="font-mono text-[8px] sm:text-[10px] text-on-surface-variant tracking-[0.3em] uppercase flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0"></span>
                <span className="truncate">{t('active_records')}: {cargoList.length} PKTS</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div 
                className="relative"
                onMouseLeave={() => setIsCatOpen(false)}
              >
                 <button 
                  onClick={() => setIsCatOpen(!isCatOpen)}
                  onMouseEnter={() => setIsCatOpen(true)}
                  className="bg-surface-container-lowest border border-outline/30 text-on-surface-variant hover:text-on-surface hover:border-primary/50 transition-all px-2.5 sm:px-3 h-8 rounded-sm flex items-center justify-center gap-2 shadow-sm"
                 >
                    {cargoCategories.find(c => c.id === activeCategory)?.icon && React.createElement(cargoCategories.find(c => c.id === activeCategory)!.icon, { className: "h-3.5 w-3.5" })}
                    <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-widest">{cargoCategories.find(c => c.id === activeCategory)?.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-50" />
                 </button>
                 <div className={cn(
                   "absolute right-0 top-full mt-1 w-40 bg-surface-container-high border border-outline/30 rounded-sm shadow-xl transition-all z-[70] overflow-hidden",
                   isCatOpen ? "opacity-100 visible" : "opacity-0 invisible"
                 )}>
                    {cargoCategories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setActiveCategory(cat.id);
                          setIsCatOpen(false);
                        }}
                        className={cn(
                          "w-full px-4 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest transition-colors flex items-center gap-2",
                          activeCategory === cat.id ? "bg-primary/10 text-primary" : "text-on-surface-variant hover:bg-surface hover:text-on-surface"
                        )}
                      >
                        <cat.icon className="h-3.5 w-3.5 shrink-0" />
                        {cat.label}
                      </button>
                    ))}
                 </div>
              </div>

              <div 
                className="relative"
                onMouseLeave={() => setIsExpOpen(false)}
              >
                <button 
                  onClick={() => setIsExpOpen(!isExpOpen)}
                  onMouseEnter={() => setIsExpOpen(true)}
                  className="bg-surface-container-lowest border border-outline/30 text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all px-2.5 sm:px-3 h-8 rounded-sm flex items-center justify-center gap-2 shadow-sm"
                  title="Export Data"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-widest">{t('export')}</span>
                </button>
                <div className={cn(
                  "absolute right-0 top-full mt-1 w-32 bg-surface-container-high border border-outline/30 rounded-sm shadow-xl transition-all z-[70] overflow-hidden",
                  isExpOpen ? "opacity-100 visible" : "opacity-0 invisible"
                )}>
                  <button 
                     onClick={() => {
                       exportToCSV(filteredCargo, 'cargo_export');
                       setIsExpOpen(false);
                     }}
                     className="w-full px-4 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                   >
                     <FileSpreadsheet className="h-3 w-3" />
                     CSV
                   </button>
                   <button 
                     onClick={() => {
                       exportToJSON(filteredCargo, 'cargo_export');
                       setIsExpOpen(false);
                     }}
                     className="w-full px-4 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2 border-t border-outline/10"
                   >
                     <FileJson className="h-3 w-3" />
                     JSON
                   </button>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-2 w-full relative z-10">
            <div className="flex flex-row items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant/50 font-light" strokeWidth={1.5} />
                <input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline/30 focus:border-primary/50 transition-all focus:ring-1 focus:ring-primary/20 text-on-surface font-sans tracking-wide text-[13px] sm:text-[11px] pl-9 pr-4 h-9 sm:h-10 placeholder:text-on-surface-variant/40 rounded-sm shadow-sm outline-none"
                  placeholder={t('search_cargo')}
                />
              </div>
              <button
                className="lg:hidden w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-surface-container border border-outline/30 text-on-surface flex items-center justify-center rounded-sm transition-all shadow-sm relative"
                onClick={() => setIsMobileFilterOpen(!isMobileFilterOpen)}
              >
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-primary text-on-primary rounded-full text-[8px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              {!isViewer && (
                <button 
                  onClick={() => setIsNewCargoModalOpen(true)}
                  className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-primary text-on-primary flex items-center justify-center rounded-sm hover:bg-primary-container transition-all shadow-[0_0_15px_rgba(212,175,55,0.2)] hover:shadow-[0_0_25px_rgba(212,175,55,0.4)] relative"
                  title="New Cargo"
                >
                  <Plus className="h-5 w-5 sm:h-5 sm:w-5 stroke-[2] sm:stroke-2" />
                </button>
              )}
            </div>

            {/* Desktop Filters Bar */}
            <div className="hidden lg:flex flex-wrap gap-2 items-center text-[10px] uppercase tracking-wider font-bold">
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50">
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
              <select value={laycanFilter} onChange={e => setLaycanFilter(e.target.value)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50">
                <option value="all">Any Laycan</option>
                <option value="prompt">Prompt / Spot</option>
                <option value="this_week">This Week</option>
                <option value="next_7">Next 7 Days</option>
                <option value="next_14">Next 14 Days</option>
                <option value="next_30">Next 30 Days</option>
                <option value="expired">Expired / Past</option>
              </select>
              <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50 max-w-[200px]">
                <option value="all">Any Region</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50">
                <option value="all">Any Status</option>
                <option value="active">Active</option>
                <option value="on hold">On Hold</option>
                <option value="negotiating">Negotiating</option>
                <option value="firm">Firm</option>
                <option value="completed">Completed</option>
              </select>
              <div className="flex items-center gap-1 bg-surface-container border border-outline/30 rounded-sm h-8 px-2">
                <input type="number" placeholder="Min Qty" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} className="bg-transparent outline-none w-[50px] text-on-surface placeholder:text-on-surface-variant/50" />
                <span className="text-on-surface-variant/50">-</span>
                <input type="number" placeholder="Max Qty" value={maxQuantity} onChange={(e) => setMaxQuantity(e.target.value)} className="bg-transparent outline-none w-[50px] text-on-surface placeholder:text-on-surface-variant/50" />
              </div>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-error hover:text-error/80 px-2 h-8 flex items-center">
                  <X className="h-3 w-3 mr-1" /> Clear All
                </button>
              )}
            </div>
            
            {/* Mobile Filters Drawer */}
            <AnimatePresence>
              {isMobileFilterOpen && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="lg:hidden flex flex-col gap-2 overflow-hidden bg-surface-container-low p-3 rounded-sm border border-outline/20 mt-1"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Filters</span>
                    <button onClick={clearFilters} className="text-[10px] font-bold uppercase tracking-widest text-error">Clear All</button>
                  </div>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="w-full bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none">
                    <option value="newest">Sort: Newest First</option>
                    <option value="oldest">Sort: Oldest First</option>
                  </select>
                  <select value={laycanFilter} onChange={e => setLaycanFilter(e.target.value)} className="w-full bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none">
                    <option value="all">Laycan: All</option>
                    <option value="prompt">Prompt / Spot</option>
                    <option value="this_week">This Week</option>
                    <option value="next_7">Next 7 Days</option>
                    <option value="next_14">Next 14 Days</option>
                    <option value="next_30">Next 30 Days</option>
                    <option value="expired">Expired / Past</option>
                  </select>
                  <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="w-full bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none">
                    <option value="all">Region: All</option>
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none">
                     <option value="all">Status: All</option>
                     <option value="active">Active</option>
                     <option value="on hold">On Hold</option>
                     <option value="negotiating">Negotiating</option>
                     <option value="firm">Firm</option>
                     <option value="completed">Completed</option>
                  </select>
                  <div className="flex items-center gap-2 w-full">
                    <input type="number" placeholder="Min Qty" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} className="flex-1 bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none" />
                    <input type="number" placeholder="Max Qty" value={maxQuantity} onChange={(e) => setMaxQuantity(e.target.value)} className="flex-1 bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1 lg:hidden">
                {sortBy !== 'newest' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{sortBy}</span>}
                {laycanFilter !== 'all' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{laycanFilter}</span>}
                {regionFilter !== 'all' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{regionFilter}</span>}
                {statusFilter !== 'all' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{statusFilter}</span>}
                {(minQuantity || maxQuantity) && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">Qty Filtered</span>}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-2 pb-32 lg:pb-8">
          <AnimatePresence>
            {isNewCargoModalOpen && (
              <CargoDraftModal onClose={() => setIsNewCargoModalOpen(false)} onSubmit={handleCreateCargo} />
            )}
          </AnimatePresence>

          {/* Table Header */}
          <div className="hidden lg:grid grid-cols-[40px_1.2fr_2fr_1fr_1.5fr_1.5fr_1fr] gap-4 px-6 py-4 border-b border-outline/30 font-sans tracking-[0.3em] uppercase text-[9px] text-on-surface-variant/80 font-bold bg-surface-container-lowest/50 backdrop-blur-sm sticky top-0 z-[30] rounded-t-md mx-2">
            <div className="flex items-center justify-center">
              <input 
                type="checkbox" 
                checked={filteredCargo.length > 0 && selectedIds.size === filteredCargo.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded-sm border-outline/40 bg-surface-container text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer transition-colors hover:border-primary/50"
              />
            </div>
            <div className="flex items-center">{t('id_tag')}</div>
            <div className="flex items-center">{t('commodity')}</div>
            <div className="flex items-center">{t('quantity')}</div>
            <div className="flex items-center">{t('load_port')}</div>
            <div className="flex items-center">{t('discharge_port')}</div>
            <div className="text-right flex items-center justify-end">{t('actions')}</div>
          </div>

          <div className="space-y-3 mt-4 mx-2">
            {filteredCargo.map((cargo, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ 
                  opacity: cargo.status === 'COMPLETED' ? 0.4 : 1, 
                  y: 0,
                  scale: cargo.status === 'COMPLETED' ? 0.99 : 1
                }}
                transition={{ 
                  delay: idx * 0.04,
                  duration: 0.5,
                  ease: [0.16, 1, 0.3, 1]
                }}
                layout
                key={cargo.id}
                onClick={() => handleCargoClick(cargo)}
                className={cn(
                  "lg:grid lg:grid-cols-[40px_1.2fr_2fr_1fr_1.5fr_1.5fr_1fr] flex flex-col gap-4 p-5 lg:px-6 lg:py-5 lg:items-center border transition-all duration-300 cursor-pointer relative group rounded-xl md:rounded-lg overflow-hidden",
                  selectedCargo?.id === cargo.id 
                    ? "bg-primary/10 border-primary/40 shadow-[0_4px_24px_-8px_rgba(212,175,55,0.25)] ring-1 ring-primary/20" 
                    : "bg-surface-container-lowest border-outline/20 hover:bg-surface-container-low hover:border-outline/40 hover:shadow-lg hover:shadow-white/5",
                  selectedIds.has(cargo.id) && "bg-primary/5 border-primary/30",
                  cargo.status === 'COMPLETED' && "grayscale-[0.5]"
                )}
              >
                <div className="hidden lg:flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(cargo.id)}
                    onChange={(e) => toggleSelectOne(e as any, cargo.id)}
                    className="w-4 h-4 rounded-sm border-outline/40 bg-surface-container-lowest text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer transition-colors hover:border-primary/50"
                  />
                </div>
                {cargo.priority === 'HOT' && !selectedCargo?.id.includes(cargo.id) && cargo.status !== 'COMPLETED' && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#ffb4ab]/60"></div>
                )}
                
                <div className="hidden lg:flex font-mono text-[10px] text-primary/90 font-medium items-center gap-3">
                  <div className={cn(
                    "h-2 w-2 rounded-full shrink-0 shadow-[0_0_6px_currentColor]",
                    cargo.status === 'COMPLETED' ? "bg-tertiary/50" : (
                      cargo.category === 'DRY BULK' ? "bg-amber-500" : 
                      cargo.category === 'PROJECT CARGO' ? "bg-primary" :
                      cargo.category === 'TANKER' ? "bg-indigo-400" : "bg-gray-400"
                    )
                  )} />
                  {cargo.id}
                </div>
                
                <div className="hidden lg:flex items-center gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className={cn(
                      "font-display text-2xl text-on-surface font-light tracking-tight group-hover:text-primary transition-colors",
                      cargo.status === 'COMPLETED' && "line-through opacity-70 group-hover:text-on-surface"
                    )}>{cargo.commodity}</span>
                    <span className="text-[9px] text-on-surface-variant font-sans tracking-[0.2em] uppercase font-medium">{cargo.category.replace('_', ' ')}</span>
                  </div>
                  {cargo.priority === 'HOT' && cargo.status !== 'COMPLETED' && (
                    <span className="text-[8px] bg-error/10 text-[#ffb4ab] border border-error/20 px-2 py-0.5 font-bold tracking-widest rounded-sm">HOT</span>
                  )}
                  {cargo.visibility === 'desk_network' && (
                    <span className="text-[8px] bg-tertiary/10 text-tertiary border border-tertiary/20 px-2 py-0.5 font-bold tracking-widest rounded-sm flex items-center gap-1"><Share2 className="w-2.5 h-2.5" /> SHARED</span>
                  )}
                  {cargo.status === 'COMPLETED' && (
                    <CheckCircle className="h-4 w-4 text-tertiary opacity-70" strokeWidth={1.5} />
                  )}
                </div>

                <div className="lg:hidden space-y-4 w-full">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 mb-1">
                         <div className="flex items-center justify-center p-2 -ml-2" onClick={(e) => e.stopPropagation()}>
                           <input 
                             type="checkbox" 
                             checked={selectedIds.has(cargo.id)}
                             onChange={(e) => toggleSelectOne(e as any, cargo.id)}
                             className="w-5 h-5 rounded-sm border-outline/30 bg-surface-container text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                           />
                         </div>
                         <div className={cn(
                           "h-1.5 w-1.5 rounded-full shrink-0",
                           cargo.status === 'COMPLETED' ? "bg-tertiary/50" : (
                             cargo.category === 'DRY BULK' ? "bg-amber-500/70" : 
                             cargo.category === 'PROJECT CARGO' ? "bg-primary/70" :
                             cargo.category === 'TANKER' ? "bg-indigo-400/70" : "bg-gray-400/70"
                           )
                         )} />
                         <span className="text-[11px] text-primary/70 font-mono tracking-widest leading-none pt-0.5">{cargo.id}</span>
                         {cargo.priority === 'HOT' && cargo.status !== 'COMPLETED' && (
                           <span className="text-[8px] bg-error/10 text-[#ffb4ab] border border-error/20 px-1.5 py-0.5 font-bold tracking-widest rounded-sm ml-1">HOT</span>
                         )}
                         {cargo.status === 'COMPLETED' && (
                           <CheckCircle className="h-4 w-4 text-tertiary opacity-70 ml-1" strokeWidth={1.5} />
                         )}
                      </div>
                      <span className={cn(
                        "font-display text-2xl text-on-surface font-light tracking-tight",
                        cargo.status === 'COMPLETED' && "line-through opacity-70"
                      )}>{cargo.commodity}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-sm text-on-surface font-medium">{cargo.quantity}</span>
                      <span className="text-[9px] text-on-surface-variant tracking-widest uppercase opacity-80 mt-1">{cargo.category.replace('_', ' ')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-surface-container-low p-3.5 rounded-sm border border-outline/10 w-full mb-1">
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-[8px] text-on-surface-variant uppercase tracking-widest font-bold">Loading</span>
                      <span className="text-[12px] text-on-surface font-mono truncate font-medium">{cargo.loadPort.split(',')[0].toUpperCase()}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-on-surface-variant/40 shrink-0 mx-1" />
                    <div className="flex-1 flex flex-col gap-1 text-right min-w-0">
                      <span className="text-[8px] text-on-surface-variant uppercase tracking-widest font-bold">Discharge</span>
                      <span className="text-[12px] text-on-surface font-mono truncate font-medium">{cargo.dischargePort.split(',')[0].toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] tracking-widest uppercase font-medium">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-on-surface-variant font-mono">LAYCAN: <span className="text-tertiary">{cargo.laycan}</span></span>
                      <span className="text-on-surface-variant font-mono">ST: <span className={cn(cargo.status === 'ACTIVE' ? "text-tertiary" : "text-on-surface-variant")}>{cargo.status}</span></span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onMatch(cargo);
                        }}
                        className="px-6 py-3 md:px-3 md:py-1.5 bg-primary/10 text-primary border border-primary/20 text-[10px] md:text-[8px] font-bold tracking-widest rounded-sm active:bg-primary/20 transition-colors"
                      >
                        MATCH
                      </button>
                    </div>
                  </div>
                </div>

                {/* Desktop layout fields */}
                <div className="hidden lg:block font-mono text-[12px] text-on-surface font-medium">{cargo.quantity}</div>
                
                <div className="hidden lg:flex flex-col gap-1">
                  <span className="font-mono text-[12px] text-on-surface font-medium">{cargo.loadPort.split(',')[0].toUpperCase()}</span>
                  <span className="text-[9px] text-on-surface-variant tracking-widest uppercase truncate opacity-80">{cargo.loadPort}</span>
                </div>

                <div className="hidden lg:flex flex-col gap-1">
                  <span className="font-mono text-[12px] text-on-surface font-medium">{cargo.dischargePort.split(',')[0].toUpperCase()}</span>
                  <span className="text-[9px] text-on-surface-variant tracking-widest uppercase truncate opacity-80">{cargo.dischargePort}</span>
                </div>

                <div className="hidden lg:flex justify-end gap-3 items-center">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onMatch(cargo);
                    }}
                    className={cn(
                      "px-5 py-2.5 font-sans text-[9px] font-bold tracking-[0.2em] uppercase transition-all duration-300 border rounded-md",
                      "border-primary/30 text-primary hover:bg-primary hover:text-black shadow-sm"
                    )}
                  >
                    Match
                  </button>
                  {!isViewer && (
                    <button 
                      onClick={(e) => handleCargoDelete(e, cargo.id)}
                      className="w-9 h-9 rounded-full flex items-center justify-center border border-transparent text-on-surface-variant hover:bg-error/10 hover:border-error/30 hover:text-error transition-all duration-300 opacity-0 group-hover:opacity-100"
                      title="Delete Record"
                    >
                      <Trash2 className="h-4 w-4 stroke-[1.5]" />
                    </button>
                  )}
                </div>

                {/* Mobile expansion removed in favor of direct mobile layout above */}
              </motion.div>
            ))}
          </div>

          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div 
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-6 px-8 py-4 bg-surface-container-high border border-primary/30 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              >
                <div className="flex items-center gap-3 pr-6 border-r border-outline/30">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-mono text-sm">
                    {selectedIds.size}
                  </div>
                  <span className="text-[10px] text-on-surface font-medium uppercase tracking-[0.2em]">Selected</span>
                </div>
                
                <div className="flex items-center gap-4">
                  <button 
                    onClick={handleBulkPushToNetworkClicked}
                    className="flex items-center gap-2 px-4 py-2 text-[9px] font-bold text-tertiary uppercase tracking-widest hover:bg-tertiary/10 transition-colors rounded-sm"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share to Network
                  </button>
                  {!isViewer && (
                    <button 
                      onClick={handleBulkDeleteClicked}
                      className="flex items-center gap-2 px-4 py-2 text-[9px] font-bold text-error uppercase tracking-widest hover:bg-error/10 transition-colors rounded-sm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Selected
                    </button>
                  )}
                  <button 
                    onClick={() => setSelectedIds(new Set())}
                    className="p-2 text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {confirmAction && (
              <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="w-full max-w-md bg-surface-container-lowest border border-outline/30 rounded-sm shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden"
                >
                  <div className="px-6 py-4 border-b border-outline/20 bg-surface-container/30">
                    <h2 className="text-[11px] text-on-surface font-medium uppercase tracking-[0.2em] flex items-center gap-2">
                      {confirmAction.type === 'delete' ? <Trash2 className="h-4 w-4 text-error" /> : (confirmAction.type === 'unshare' ? <X className="h-4 w-4 text-error" /> : <Share2 className="h-4 w-4 text-tertiary" />)}
                      Confirm {confirmAction.type === 'delete' ? 'Deletion' : (confirmAction.type === 'unshare' ? 'Revoke Visibility' : 'Share to Desk Network')}
                    </h2>
                  </div>
                  <div className="p-6 bg-surface-container-lowest">
                    <p className="text-[13px] text-on-surface-variant font-sans tracking-wide leading-relaxed">
                      {confirmAction.type === 'delete' 
                        ? `Are you sure you want to permanently delete ${confirmAction.target === 'bulk' ? selectedIds.size + ' selected records' : 'this record'}? This action cannot be undone.`
                        : (confirmAction.type === 'unshare'
                          ? `Are you sure you want to revoke network visibility for this record? It will be removed from the Desk Network feed.`
                          : `Share this cargo with your Desk Network?`)
                      }
                    </p>
                  </div>
                  <div className="px-6 py-4 border-t border-outline/20 flex justify-end gap-3 bg-surface-container/30">
                    <button 
                      onClick={() => setConfirmAction(null)}
                      className="px-4 py-2 text-[10px] uppercase font-bold text-on-surface-variant hover:text-on-surface transition-colors tracking-widest"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleConfirmAction}
                      className={cn(
                        "px-6 py-2.5 text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 shadow-md rounded-sm transition-colors",
                        (confirmAction.type === 'delete' || confirmAction.type === 'unshare')
                          ? "bg-error text-on-surface hover:bg-error/90" 
                          : "bg-tertiary text-on-primary hover:bg-tertiary/90"
                      )}
                    >
                      {(confirmAction.type === 'delete' || confirmAction.type === 'unshare') ? 'Confirm' : 'Confirm Share'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Side Details Panel */}
      <AnimatePresence>
        {selectedCargo && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 250 }}
            className="absolute top-0 right-0 w-full md:w-[480px] h-full bg-surface-container/95 backdrop-blur-3xl border-l border-outline/30 z-50 flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.5)]"
          >
            <div className="px-8 py-6 border-b border-outline/20 flex items-center justify-between bg-transparent">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Package2 className="h-5 w-5 text-primary stroke-[1.5]" />
                </div>
                <h2 className="font-display text-[11px] text-on-surface font-medium uppercase tracking-[0.3em]">
                  {t('cargo_specs')}
                </h2>
              </div>
              <button 
                onClick={() => setSelectedCargo(null)}
                className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-low"
              >
                <X className="h-5 w-5 stroke-1" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10">
              {/* Profile Header */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-surface-container-low text-primary text-[9px] font-medium uppercase tracking-[0.2em] border border-outline/30 rounded-sm">
                    {selectedCargo.id}
                  </span>
                  <span className={cn(
                    "text-[9px] font-medium uppercase tracking-[0.2em] flex items-center gap-2",
                    selectedCargo.status === 'ACTIVE' ? "text-tertiary" : 
                    selectedCargo.status === 'COMPLETED' ? "text-tertiary opacity-70" : "text-amber-500"
                  )}>
                    <div className="w-1.5 h-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]"></div>
                    {t('status')}: {selectedCargo.status}
                  </span>
                </div>
                <h3 className="text-5xl font-display font-light text-on-surface tracking-tight leading-none">
                  {selectedCargo.commodity}
                </h3>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-px bg-outline/20 border border-outline/20 rounded-sm overflow-hidden">
                <div className="bg-surface-container-low p-6">
                  <p className="text-[8px] text-on-surface-variant font-medium uppercase tracking-[0.2em] mb-2">{t('total_quantity')}</p>
                  <p className="text-2xl font-mono text-on-surface font-light tracking-tight">{selectedCargo.quantity}</p>
                </div>
                <div className="bg-surface-container-low p-6">
                  <p className="text-[8px] text-on-surface-variant font-medium uppercase tracking-[0.2em] mb-2">{t('stowage_factor')}</p>
                  <p className="text-2xl font-mono text-primary font-light tracking-tight">{selectedCargo.stowageFactor || 'N/A'}</p>
                </div>
              </div>

              {/* Detailed Specs */}
              <div className="space-y-6">
                <h4 className="text-[9px] text-primary font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                  <div className="w-8 h-[1px] bg-primary/30"></div>
                  {t('logistics_protocol')}
                </h4>
                
                <div className="space-y-5 bg-surface-container-low p-6 border border-outline/20 rounded-sm">
                  <div className="flex justify-between items-start">
                     <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">Loading</span>
                     <span className="text-on-surface text-[12px] font-medium font-sans tracking-wide text-right max-w-[200px]">{selectedCargo.loadPort}</span>
                  </div>
                  
                  <div className="flex justify-between items-start">
                     <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">Discharge</span>
                     <span className="text-on-surface text-[12px] font-medium font-sans tracking-wide text-right max-w-[200px]">{selectedCargo.dischargePort}</span>
                  </div>

                  <div className="flex justify-between items-center">
                     <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">{t('laycan')}</span>
                     <span className="text-tertiary text-[12px] font-medium font-mono">{selectedCargo.laycan}</span>
                  </div>

                  <div className="flex justify-between items-center">
                     <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">{t('charterer')}</span>
                     <span className="text-on-surface text-[12px] font-medium font-sans tracking-wide">{selectedCargo.charterer}</span>
                  </div>

                  {selectedCargo.terms && (
                    <div className="flex justify-between items-center">
                       <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">{t('terms')}</span>
                       <span className="text-on-surface text-[12px] font-medium font-sans tracking-wide">{selectedCargo.terms}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Matched Vessel Section */}
              {selectedCargo.assignedVesselId && (
                <div className="space-y-6">
                  <h4 className="text-[9px] text-[#1d9bf0] font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                    <div className="w-8 h-[1px] bg-[#1d9bf0]/30"></div>
                    ASSIGNED TONNAGE
                  </h4>
                  <div className="bg-surface-container-low p-6 border border-outline/20 rounded-sm space-y-4">
                    <div className="flex justify-between items-center">
                       <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">Vessel</span>
                       <span className="text-[#1d9bf0] text-[12px] font-bold font-sans tracking-wide uppercase">
                         {vesselList?.find(v => v.id === selectedCargo.assignedVesselId)?.name || 'Unknown Vessel'}
                       </span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">ETA</span>
                       <span className="text-on-surface text-[12px] font-medium font-mono">{selectedCargo.vesselETA || 'Pending calculation...'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Insights Section */}
              <div className="space-y-6">
                <h4 className="text-[9px] text-tertiary font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                  <div className="w-8 h-[1px] bg-tertiary/30"></div>
                  {t('ai_profiler')}
                </h4>
                
                <div className="bg-surface-container-low p-6 border border-outline/20 rounded-sm relative min-h-[140px]">
                  {isAiLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-surface-container-low/80 backdrop-blur-sm z-10">
                      <Loader2 className="h-6 w-6 text-tertiary animate-spin stroke-1" />
                    </div>
                  ) : aiInsights ? (
                    <div className="text-[12px] text-on-surface font-sans font-light leading-loose whitespace-pre-wrap opacity-90">
                      {aiInsights}
                    </div>
                  ) : (
                    <div className="text-[11px] text-on-surface-variant italic text-center py-8 opacity-70">
                      Requesting intelligence from global maritime databases...
                    </div>
                  )}
                </div>
              </div>

              {selectedCargo.description && (
                <div className="space-y-4">
                  <h4 className="text-[9px] text-on-surface-variant font-medium uppercase tracking-[0.3em]">{t('owner_comments')}</h4>
                  <p className="text-[13px] text-on-surface-variant italic font-display px-4">
                    "{selectedCargo.description}"
                  </p>
                </div>
              )}

              {/* Private Notes */}
              <div className="space-y-6">
                <h4 className="text-[9px] text-primary font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                  <div className="w-8 h-[1px] bg-primary/30"></div>
                  {t('private_notes')}
                </h4>
                <textarea
                  className="w-full bg-surface-container-lowest border border-outline/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 text-on-surface p-5 text-[12px] font-sans font-light leading-loose min-h-[120px] resize-y placeholder:text-on-surface-variant/40 transition-all outline-none rounded-sm disabled:opacity-50"
                  placeholder="Add private notes for this cargo. These notes are only visible to you..."
                  value={selectedCargo.privateNotes || ''}
                  onChange={handleNotesChange}
                  disabled={isViewer}
                />
              </div>
            </div>

            <div className="p-8 bg-surface-container-low border-t border-outline/20 flex flex-col gap-4">
              <button 
                onClick={() => onMatch(selectedCargo)}
                className="w-full bg-primary text-on-primary py-4 font-bold uppercase tracking-[0.2em] hover:bg-primary-container transition-all flex items-center justify-center gap-3 text-[10px] rounded-sm shadow-md"
              >
                {t('match_tonnage')}
              </button>
              <div className="flex gap-4">
                <button 
                  className={cn(
                    "flex-1 py-3 text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border rounded-sm",
                    selectedCargo.status === 'COMPLETED' 
                      ? "bg-tertiary text-on-primary border-tertiary" 
                      : "bg-surface-container border-outline/30 text-on-surface-variant hover:bg-tertiary/5 hover:text-tertiary hover:border-tertiary/30",
                    isViewer && "opacity-50 cursor-not-allowed hover:bg-surface-container hover:text-on-surface-variant hover:border-outline/30"
                  )}
                  onClick={() => !isViewer && handleStatusChange(selectedCargo.id, selectedCargo.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED')}
                  disabled={isViewer}
                >
                  <CheckCircle className="h-3.5 w-3.5 stroke-2" />
                  {selectedCargo.status === 'COMPLETED' ? t('mark_active') : t('mark_completed')}
                </button>
                <button 
                  className={cn(
                    "w-12 border transition-all flex items-center justify-center rounded-sm",
                    selectedCargo.visibility === 'desk_network' 
                      ? "border-tertiary/50 text-tertiary hover:bg-error/10 hover:text-error hover:border-error/50" 
                      : "border-outline/30 text-on-surface-variant hover:bg-surface-container hover:text-tertiary"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmAction({ type: selectedCargo.visibility === 'desk_network' ? 'unshare' : 'push', target: 'single', id: selectedCargo.id });
                  }}
                  title={selectedCargo.visibility === 'desk_network' ? "Revoke Visibility" : "Share to Desk Network"}
                >
                  {selectedCargo.visibility === 'desk_network' ? <X className="h-4 w-4 stroke-1.5" /> : <Share2 className="h-4 w-4 stroke-1.5" />}
                </button>
                {!isViewer && (
                  <button 
                    onClick={(e) => handleCargoDelete(e, selectedCargo.id)}
                    className="w-12 border border-outline/30 text-error/60 hover:bg-error/5 hover:text-error hover:border-error/30 transition-all flex items-center justify-center rounded-sm"
                    title="DELETE_RECORD"
                  >
                    <Trash2 className="h-4 w-4 stroke-1.5" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import { ManualIntakeMode } from './ManualIntakeMode';

const CargoDraftModal = ({ onClose, onSubmit }: { onClose: () => void, onSubmit: (cargo: Cargo) => void }) => {
  const [activeTab, setActiveTab] = useState<'MANUAL' | 'TEXT'>('MANUAL');
  const [formData, setFormData] = useState<Partial<Cargo>>({
    commodity: '',
    quantity: '',
    category: 'DRY BULK',
    loadPort: '',
    dischargePort: '',
    laycan: '',
    charterer: '',
    status: 'ACTIVE',
    priority: 'NORMAL',
    stowageFactor: '',
    terms: '',
    description: ''
  });

  const categoriesSet = [
    { id: 'DRY BULK', label: 'Dry Bulk', desc: 'Grain, Ore, Coal, etc.' },
    { id: 'PROJECT CARGO', label: 'Project', desc: 'Heavy Lift, Breakbulk, Wind.' },
    { id: 'TANKER', label: 'Tanker', desc: 'Oil, Chemicals, LNG.' },
    { id: 'GENERAL', label: 'General', desc: 'Palletized, Steel, Bags.' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newCargo: Cargo = {
      ...formData as Cargo,
      id: `CRG-${Math.floor(1000 + Math.random() * 9000)}-${formData.category?.[0] || 'G'}`,
      confidence: 100
    };
    onSubmit(newCargo);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="w-full max-w-3xl bg-surface border border-outline/30 shadow-2xl flex flex-col max-h-[90vh] rounded-md overflow-hidden relative"
      >
        <div className="absolute inset-0 bg-surface-container-low opacity-50 z-[-1]"></div>
        
        <div className="px-8 py-6 border-b border-outline/20 bg-transparent flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <Database className="h-4 w-4 text-primary stroke-[1.5]" />
              </div>
              <h3 className="text-2xl font-display font-light text-on-surface tracking-tight leading-none">Cargo Draft</h3>
              <div className="flex items-center gap-2 border border-outline/50 rounded-full p-1 bg-surface/50 ml-4">
                 <button 
                    onClick={() => setActiveTab('MANUAL')}
                    className={cn("px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-all rounded-full", activeTab === 'MANUAL' ? "bg-primary text-black" : "text-on-surface-variant hover:text-on-surface")}
                 >
                    Manual Form
                 </button>
                 <button 
                    onClick={() => setActiveTab('TEXT')}
                    className={cn("px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-all rounded-full", activeTab === 'TEXT' ? "bg-primary text-black" : "text-on-surface-variant hover:text-on-surface")}
                 >
                    Paste text
                 </button>
              </div>
           </div>
           <button type="button" onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-2 rounded-full hover:bg-surface-container-low">
              <X className="h-5 w-5 stroke-1" />
           </button>
        </div>

        {activeTab === 'MANUAL' ? (
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto flex flex-col">
          <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10">
           {/* Category Selection */}
           <div className="space-y-4">
              <label className="text-[9px] font-medium text-primary uppercase tracking-[0.3em] flex items-center gap-3">
                <div className="w-6 h-[1px] bg-primary/30"></div>
                Select Classification
              </label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                 {categoriesSet.map((cat) => (
                   <button
                     key={cat.id}
                     type="button"
                     onClick={() => setFormData({...formData, category: cat.id as any})}
                     className={cn(
                       "p-4 border text-left transition-all duration-300 relative group rounded-sm",
                       formData.category === cat.id 
                         ? "border-primary bg-primary/5 shadow-[inset_0_0_20px_rgba(212,175,55,0.05)]" 
                         : "border-outline/30 bg-surface-container-lowest hover:border-outline/60 hover:bg-surface-container-low"
                     )}
                   >
                     <div className={cn(
                       "text-[10px] font-bold uppercase tracking-widest mb-1.5 transition-colors",
                       formData.category === cat.id ? "text-primary" : "text-on-surface"
                     )}>{cat.label}</div>
                     <div className="text-[10px] items-center text-on-surface-variant font-sans font-light leading-snug opacity-70">{cat.desc}</div>
                     {formData.category === cat.id && <CheckCircle className="absolute top-4 right-4 h-4 w-4 text-primary stroke-1.5" />}
                   </button>
                 ))}
              </div>
           </div>

           <div className="space-y-4">
              <label className="text-[9px] font-medium text-primary uppercase tracking-[0.3em] flex items-center gap-3">
                <div className="w-6 h-[1px] bg-primary/30"></div>
                Primary Details
              </label>
              <div className="grid grid-cols-2 gap-6">
                <FormInput label="Commodity" value={formData.commodity} onChange={(v: any) => setFormData({...formData, commodity: v})} placeholder="Ex: Wheat, Steel Pipes..." required />
                <FormInput label="Quantity" value={formData.quantity} onChange={(v: any) => setFormData({...formData, quantity: v})} placeholder="Ex: 25,000 MT" required />
                <FormInput label="Loading Port" value={formData.loadPort} onChange={(v: any) => setFormData({...formData, loadPort: v})} placeholder="Ex: Hamburg (DEHAM)" required />
                <FormInput label="Discharge Port" value={formData.dischargePort} onChange={(v: any) => setFormData({...formData, dischargePort: v})} placeholder="Ex: Singapore (SGSIN)" required />
                <FormInput label="Laycan" value={formData.laycan} onChange={(v: any) => setFormData({...formData, laycan: v})} placeholder="Ex: 15-25 Nov 2024" required />
                <FormInput label="Charterer" value={formData.charterer} onChange={(v: any) => setFormData({...formData, charterer: v})} placeholder="Ex: Glencore" required />
              </div>
           </div>

           <div className="grid grid-cols-2 gap-6 pt-4 border-t border-outline/20">
              <div className="space-y-2">
                 <label className="text-[9px] font-medium text-on-surface-variant uppercase tracking-[0.2em]">Condition</label>
                 <select 
                   value={formData.status}
                   onChange={e => setFormData({...formData, status: e.target.value as any})}
                   className="w-full bg-surface-container-lowest border border-outline/30 text-on-surface p-3 text-[12px] font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-sm transition-all"
                 >
                    <option value="ACTIVE">ACTIVE SPOT</option>
                    <option value="FIRM">FIRM ORDER</option>
                    <option value="NEGOTIATING">NEGOTIATING</option>
                    <option value="ON HOLD">ON HOLD</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[9px] font-medium text-on-surface-variant uppercase tracking-[0.2em]">Priority</label>
                 <select 
                   value={formData.priority}
                   onChange={e => setFormData({...formData, priority: e.target.value as any})}
                   className="w-full bg-surface-container-lowest border border-outline/30 text-on-surface p-3 text-[12px] font-sans focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 rounded-sm transition-all"
                 >
                    <option value="NORMAL">ROUTINE LEVEL</option>
                    <option value="HOT">URGENT ACTION</option>
                 </select>
              </div>
           </div>

           <div className="space-y-2">
              <label className="text-[9px] font-medium text-on-surface-variant uppercase tracking-[0.2em]">Additional Comments</label>
              <textarea 
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                className="w-full h-24 bg-surface-container-lowest border border-outline/30 text-on-surface p-4 text-[12px] font-sans font-light focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none rounded-sm transition-all placeholder:text-on-surface-variant/40"
                placeholder="Specific cargo requirements, Stowage Factor, Chartering terms..."
              />
           </div>
        </div>

        <div className="px-8 py-6 border-t border-outline/20 bg-surface-container-low flex justify-end gap-4">
           <button type="button" onClick={onClose} className="px-6 py-3 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors">
              Abort
           </button>
           <button type="submit" className="px-8 py-3 bg-primary text-on-primary text-[9px] font-bold uppercase tracking-widest hover:bg-primary-container transition-all rounded-sm shadow-md">
              Initialize Registry
           </button>
        </div>
        </form>
        ) : (
           <div className="flex-1 overflow-hidden">
               <ManualIntakeMode onClose={onClose} defaultType="CARGO" />
           </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const FormInput = ({ label, value, onChange, placeholder, required }: any) => (
  <div className="space-y-2">
    <label className="text-[9px] font-medium text-on-surface-variant uppercase tracking-[0.2em]">{label}</label>
    <input 
      type="text"
      required={required}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-surface-container-lowest border border-outline/30 text-on-surface p-3 text-[12px] font-sans font-light focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/30 rounded-sm"
      placeholder={placeholder}
    />
  </div>
);

