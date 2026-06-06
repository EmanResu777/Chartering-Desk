import React, { useState, useMemo } from 'react';
import { Search, Ship, Anchor, Globe, MoreHorizontal, X, Calendar, MapPin, User, TrendingUp, Info, ChevronUp, ChevronDown, Trash2, Share2, Download, FileJson, FileSpreadsheet, List, Map as MapIcon, FileText, Upload, Filter } from 'lucide-react';
import { Vessel, INITIAL_VESSELS, cn, exportToCSV, exportToJSON } from '../lib/utils';
import { REGIONS, parseRegion, isDateInRange, matchMinMax, parseGearCategory } from '../lib/filterUtils';
import { motion, AnimatePresence } from 'motion/react';
import { AISMap } from './AISMap';
import { useWorkspace } from '../lib/WorkspaceContext';
import { useConfig } from '../lib/ConfigContext';

export const VesselMonitor: React.FC<{
  vesselList: Vessel[],
  onCreate: (vessel: Vessel) => void,
  onUpdate: (id: string, vessel: Partial<Vessel>) => void,
  onDelete: (id: string) => void,
  onBulkDelete: (ids: Set<string>) => void,
  onToggleVisibility?: (type: 'vessel', data: Vessel) => void,
  selectedVessel: Vessel | null,
  setSelectedVessel: React.Dispatch<React.SetStateAction<Vessel | null>>
}> = ({ vesselList, onCreate, onUpdate, onDelete, onBulkDelete, onToggleVisibility, selectedVessel, setSelectedVessel }) => {

  const { currentWorkspace } = useWorkspace();
  const { t } = useConfig();
  const isViewer = currentWorkspace?.myRole === 'viewer';

  const [hoveredVesselId, setHoveredVesselId] = useState<string | null>(null);
  
  // New Filter States
  const [searchQuery, setSearchQuery] = useState(() => localStorage.getItem('vessel_monitor_search') || '');
  const [sortBy, setSortBy] = useState<keyof Vessel | 'builtYear' | 'newest' | 'oldest'>(() => (localStorage.getItem('vessel_monitor_sort_by') as any) || 'newest');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => (localStorage.getItem('vessel_monitor_sort_order') as any) || 'desc');
  const [viewMode, setViewMode] = useState<'list' | 'map'>(() => (localStorage.getItem('vessel_monitor_view_mode') as any) || 'list');
  
  const [openDateFilter, setOpenDateFilter] = useState<string>(() => localStorage.getItem('vessel_monitor_open_date') || 'all');
  const [regionFilter, setRegionFilter] = useState<string>(() => localStorage.getItem('vessel_monitor_region') || 'all');
  const [statusFilter, setStatusFilter] = useState<string>(() => localStorage.getItem('vessel_monitor_status') || 'all');
  const [typeFilter, setTypeFilter] = useState<string>(() => localStorage.getItem('vessel_monitor_type') || 'all');
  const [minDwt, setMinDwt] = useState<string>(() => localStorage.getItem('vessel_monitor_min_dwt') || '');
  const [maxDwt, setMaxDwt] = useState<string>(() => localStorage.getItem('vessel_monitor_max_dwt') || '');
  const [gearFilter, setGearFilter] = useState<string>(() => localStorage.getItem('vessel_monitor_gear') || 'all');
  
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isNewVesselModalOpen, setIsNewVesselModalOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'overview' | 'insurance'>('overview');
  const [isExpOpen, setIsExpOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_search', searchQuery);
  }, [searchQuery]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_sort_by', sortBy);
  }, [sortBy]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_sort_order', sortOrder);
  }, [sortOrder]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_view_mode', viewMode);
  }, [viewMode]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_open_date', openDateFilter);
  }, [openDateFilter]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_region', regionFilter);
  }, [regionFilter]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_status', statusFilter);
  }, [statusFilter]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_type', typeFilter);
  }, [typeFilter]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_min_dwt', minDwt);
  }, [minDwt]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_max_dwt', maxDwt);
  }, [maxDwt]);
  React.useEffect(() => {
    localStorage.setItem('vessel_monitor_gear', gearFilter);
  }, [gearFilter]);

  const filteredVessels = vesselList.filter(v => {
    const matchesSearch = (v.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (v.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (v.openPort || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (v.gear || '').toLowerCase().includes(searchQuery.toLowerCase());
                          
    const matchesOpenDate = openDateFilter === 'all' || isDateInRange(v.openDate || '', openDateFilter);
    const matchesRegion = regionFilter === 'all' || [parseRegion(v.openPort || '')].includes(regionFilter);
    const matchesStatus = statusFilter === 'all' || (v.status || '').toLowerCase() === statusFilter.toLowerCase();
    
    // Type checking using partial matches since Vessel 'type' can be descriptive
    const matchesType = typeFilter === 'all' || (typeFilter === 'Other' 
        ? !['Bulk Carrier', 'MPP', 'General Cargo', 'Tweendecker', 'Heavy Lift', 'TBN'].some(t => (v.type || '').toLowerCase().includes(t.toLowerCase()))
        : (v.type || '').toLowerCase().includes(typeFilter.toLowerCase()));

    const matchesDwt = matchMinMax(v.dwt, minDwt, maxDwt);
    const matchesGear = gearFilter === 'all' || parseGearCategory(v.gear) === gearFilter;

    return matchesSearch && matchesOpenDate && matchesRegion && matchesStatus && matchesType && matchesDwt && matchesGear;
  });

  const [confirmAction, setConfirmAction] = useState<{type: 'delete' | 'push' | 'unshare', target: 'bulk' | 'single', id?: string} | null>(null);

  const toggleSelectAll = () => {
    const allFilteredIds = sortedVessels.map(v => v.id);
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
        if (selectedVessel && selectedIds.has(selectedVessel.id)) {
          setSelectedVessel(null);
        }
      } else if (confirmAction.target === 'single' && confirmAction.id) {
         onDelete(confirmAction.id);
         if (selectedVessel?.id === confirmAction.id) {
           setSelectedVessel(null);
         }
         const newSelected = new Set(selectedIds);
         newSelected.delete(confirmAction.id);
         setSelectedIds(newSelected);
      }
    } else if (confirmAction.type === 'push') {
       if (confirmAction.target === 'bulk') {
          const vesselsToPush = vesselList.filter(v => selectedIds.has(v.id));
          vesselsToPush.forEach(vessel => {
            if (onToggleVisibility) onToggleVisibility('vessel', vessel);
          });
          setSelectedIds(new Set());
       } else if (confirmAction.target === 'single' && confirmAction.id) {
          const vessel = vesselList.find(v => v.id === confirmAction.id);
          if (vessel && onToggleVisibility) onToggleVisibility('vessel', vessel);
       }
    } else if (confirmAction.type === 'unshare') {
       if (confirmAction.target === 'single' && confirmAction.id) {
          const vessel = vesselList.find(v => v.id === confirmAction.id);
          if (vessel && onToggleVisibility) onToggleVisibility('vessel', vessel);
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

  const handleDeleteVessel = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmAction({ type: 'delete', target: 'single', id });
  };

  const getStatusColor = (status: Vessel['status']) => {
    switch (status) {
      case 'OPEN': return '#00ba7c';
      case 'FIXED': return '#f44336';
      case 'ON SUB': return '#ff9800';
      default: return '#8899a6';
    }
  };

  const StatusBadge = ({ status, className }: { status: Vessel['status'], className?: string }) => {
    const color = getStatusColor(status);
    return (
      <div 
        className={cn("flex items-center gap-1.5 px-2 py-0.5 border bg-opacity-10", className)}
        style={{ 
          borderColor: `${color}4D`, // 30% opacity hex
          backgroundColor: `${color}1A`, // 10% opacity hex
          color: color
        }}
      >
        <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color }} />
        <span className="text-[9px] font-bold uppercase tracking-widest">{status}</span>
      </div>
    );
  };

  const sortedVessels = useMemo(() => {
    const result = [...filteredVessels];
    result.sort((a: any, b: any) => {
      if (sortBy === 'newest') {
        let aVal = a.createdAt || a.id;
        let bVal = b.createdAt || b.id;
        return aVal > bVal ? -1 : 1;
      }
      if (sortBy === 'oldest') {
        let aVal = a.createdAt || a.id;
        let bVal = b.createdAt || b.id;
        return aVal > bVal ? 1 : -1;
      }
      
      let aVal = a[sortBy as keyof Vessel];
      let bVal = b[sortBy as keyof Vessel];

      if (aVal === undefined) aVal = '';
      if (bVal === undefined) bVal = '';

      if (aVal === bVal) return 0;
      
      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return result;
  }, [filteredVessels, sortBy, sortOrder]);

  const toggleSort = (field: keyof Vessel) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const activeFilterCount = (openDateFilter !== 'all' ? 1 : 0) + (regionFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0) + (gearFilter !== 'all' ? 1 : 0) + (minDwt || maxDwt ? 1 : 0);

  const clearFilters = () => {
    setSearchQuery('');
    setOpenDateFilter('all');
    setRegionFilter('all');
    setStatusFilter('all');
    setTypeFilter('all');
    setGearFilter('all');
    setMinDwt('');
    setMaxDwt('');
    setSortBy('newest');
  };

  const SortIcon = ({ field }: { field: keyof Vessel }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const handleAISLink = (e: React.MouseEvent, vessel: Vessel) => {
    e.stopPropagation();
    const { name, imo, mmsi } = vessel;
    
    // MarineTraffic direct details URL construction
    // Priority 1: IMO (Most specific hull identifier)
    // Priority 2: MMSI (Radio identification)
    // Priority 3: Name Search (Fallback)
    
    if (imo || mmsi) {
      let detailPath = '';
      if (imo) detailPath = `imo:${imo}`;
      else if (mmsi) detailPath = `mmsi:${mmsi}`;
      
      // Optionally add vessel name to the path for better URL readability/specificity if MT supports it
      const nameSlug = name ? `/vessel:${encodeURIComponent(name.toUpperCase().replace(/\s+/g, '_'))}` : '';
      
      window.open(`https://www.marinetraffic.com/en/ais/details/ships/${detailPath}${nameSlug}`, '_blank');
    } else {
      // Fallback to keyword search if no identifiers are available
      const query = encodeURIComponent(name.trim());
      window.open(`https://www.marinetraffic.com/en/ais/index/search/all/keyword:${query}`, '_blank');
    }
  };

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!selectedVessel) return;
    const newNotes = e.target.value;
    
    // Update local selected state
    setSelectedVessel({ ...selectedVessel, privateNotes: newNotes });
    
    // Update main list state
    onUpdate(selectedVessel.id, { privateNotes: newNotes });
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
              <h1 className="font-display text-2xl sm:text-4xl text-on-surface tracking-tight font-light bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent truncate w-full">
                {t('vessel_interface')}
              </h1>
              <div className="font-mono text-[8px] sm:text-[10px] text-on-surface-variant tracking-[0.3em] uppercase flex items-center gap-2 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0"></span>
                <span className="truncate">{t('active_records')}: {vesselList.length} UNITS</span>
              </div>
            </div>
          
            <div className="flex items-center gap-1.5 shrink-0 mt-2 sm:mt-0">
              <div 
                className="relative"
                onMouseLeave={() => setIsExpOpen(false)}
              >
                <button 
                  onClick={() => setIsExpOpen(!isExpOpen)}
                  onMouseEnter={() => setIsExpOpen(true)}
                  className="bg-surface-container-lowest border border-outline/30 text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all px-2.5 sm:px-3 h-8 rounded-sm flex items-center justify-center gap-2 shadow-sm tooltip-trigger"
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
                      exportToCSV(sortedVessels, 'vessel_export');
                      setIsExpOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                  >
                    <FileSpreadsheet className="h-3 w-3" />
                    CSV
                  </button>
                  <button 
                    onClick={() => {
                      exportToJSON(sortedVessels, 'vessel_export');
                      setIsExpOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2 border-t border-outline/10"
                  >
                    <FileJson className="h-3 w-3" />
                    JSON
                  </button>
                </div>
              </div>

              <div 
                className="relative"
                onMouseLeave={() => setIsMenuOpen(false)}
              >
                <button 
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  onMouseEnter={() => setIsMenuOpen(true)}
                  className="bg-surface-container-lowest border border-outline/30 text-on-surface-variant px-2.5 sm:px-3 h-8 hover:border-primary/50 hover:text-primary transition-all rounded-sm shadow-sm flex items-center justify-center tooltip-trigger shrink-0"
                  title="More Actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                <div className={cn(
                  "absolute right-0 top-full mt-1 w-40 bg-surface-container-high border border-outline/30 rounded-sm shadow-xl transition-all z-[70] overflow-hidden",
                  isMenuOpen ? "opacity-100 visible" : "opacity-0 invisible"
                )}>
                  {!isViewer && (
                    <button 
                      onClick={() => {
                        setIsNewVesselModalOpen(true);
                        setIsMenuOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-[9px] font-bold uppercase tracking-widest text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
                    >
                      <Ship className="h-3.5 w-3.5" />
                      {t('new_vessel')}
                    </button>
                  )}
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
                  className="w-full bg-surface-container-lowest border border-outline/30 focus:border-primary/50 transition-colors focus:ring-0 text-on-surface font-sans tracking-wide text-[13px] sm:text-[11px] pl-9 pr-4 h-9 sm:h-10 placeholder:text-on-surface-variant/40 rounded-sm shadow-sm outline-none"
                  placeholder={t('search_vessel')}
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
              
              <div className="flex bg-surface-container-lowest border border-outline/30 rounded-sm p-0.5 shadow-sm items-center h-9 sm:h-10 shrink-0">
                  <button 
                    onClick={() => setViewMode('list')}
                    className={cn("px-2.5 sm:px-3 h-full rounded-sm flex items-center justify-center gap-2 transition-all tooltip-trigger", viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-primary')}
                    title="List View"
                  >
                    <List className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </button>
                  <div className="w-[1px] h-4 bg-outline/30 mx-0.5"></div>
                  <button 
                    onClick={() => setViewMode('map')}
                    className={cn("px-2.5 sm:px-3 h-full rounded-sm flex items-center justify-center gap-2 transition-all tooltip-trigger", viewMode === 'map' ? 'bg-primary/10 text-primary' : 'text-on-surface-variant hover:text-primary')}
                    title="Map View"
                  >
                    <MapIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </button>
              </div>
            </div>

            {/* Desktop Filters Bar */}
            <div className="hidden lg:flex flex-wrap gap-2 items-center text-[10px] uppercase tracking-wider font-bold">
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50">
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="dwt">DWT Size</option>
                <option value="builtYear">Built Year</option>
              </select>
              <select value={openDateFilter} onChange={e => setOpenDateFilter(e.target.value)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50">
                <option value="all">Any Open Date</option>
                <option value="prompt">Prompt / Spot</option>
                <option value="this_week">This Week</option>
                <option value="next_7">Next 7 Days</option>
                <option value="next_14">Next 14 Days</option>
                <option value="next_30">Next 30 Days</option>
                <option value="expired">Expired / Past</option>
              </select>
              <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50 max-w-[160px]">
                <option value="all">Any Region</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50">
                <option value="all">Any Type</option>
                <option value="Bulk Carrier">Bulk Carrier</option>
                <option value="MPP">MPP</option>
                <option value="General Cargo">General Cargo</option>
                <option value="Heavy Lift">Heavy Lift</option>
                <option value="Other">Other</option>
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50">
                <option value="all">Any Status</option>
                <option value="open">Open</option>
                <option value="on sub">On Sub</option>
                <option value="fixed">Fixed</option>
              </select>
              <select value={gearFilter} onChange={e => setGearFilter(e.target.value)} className="bg-surface-container border border-outline/30 text-on-surface rounded-sm h-8 px-2 outline-none focus:border-primary/50">
                <option value="all">Any Gear</option>
                <option value="geared">Geared (Cranes)</option>
                <option value="gearless">Gearless</option>
                <option value="heavy_lift">Heavy Lift (&gt;150t)</option>
                <option value="unknown">Unknown</option>
              </select>
              <div className="flex items-center gap-1 bg-surface-container border border-outline/30 rounded-sm h-8 px-2">
                <input type="number" placeholder="Min DWT" value={minDwt} onChange={(e) => setMinDwt(e.target.value)} className="bg-transparent outline-none w-[60px] text-on-surface placeholder:text-on-surface-variant/50" />
                <span className="text-on-surface-variant/50">-</span>
                <input type="number" placeholder="Max DWT" value={maxDwt} onChange={(e) => setMaxDwt(e.target.value)} className="bg-transparent outline-none w-[60px] text-on-surface placeholder:text-on-surface-variant/50" />
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
                    <option value="dwt">Sort: DWT Size</option>
                    <option value="builtYear">Sort: Built Year</option>
                  </select>
                  <select value={openDateFilter} onChange={e => setOpenDateFilter(e.target.value)} className="w-full bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none">
                    <option value="all">Open Date: All</option>
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
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="w-full bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none">
                    <option value="all">Type: All</option>
                    <option value="Bulk Carrier">Bulk Carrier</option>
                    <option value="MPP">MPP</option>
                    <option value="General Cargo">General Cargo</option>
                    <option value="Heavy Lift">Heavy Lift</option>
                    <option value="Other">Other</option>
                  </select>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none">
                     <option value="all">Status: All</option>
                     <option value="open">Open</option>
                     <option value="on sub">On Sub</option>
                     <option value="fixed">Fixed</option>
                  </select>
                  <select value={gearFilter} onChange={e => setGearFilter(e.target.value)} className="w-full bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none">
                     <option value="all">Gear: All</option>
                     <option value="geared">Geared (Cranes)</option>
                     <option value="gearless">Gearless</option>
                     <option value="heavy_lift">Heavy Lift (&gt;150t)</option>
                     <option value="unknown">Unknown</option>
                  </select>
                  <div className="flex items-center gap-2 w-full">
                    <input type="number" placeholder="Min DWT" value={minDwt} onChange={(e) => setMinDwt(e.target.value)} className="flex-1 bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none" />
                    <input type="number" placeholder="Max DWT" value={maxDwt} onChange={(e) => setMaxDwt(e.target.value)} className="flex-1 bg-surface-container border border-outline/30 text-on-surface rounded-sm h-9 px-2 text-[11px] outline-none" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1 lg:hidden">
                {sortBy !== 'newest' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{sortBy}</span>}
                {openDateFilter !== 'all' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{openDateFilter}</span>}
                {regionFilter !== 'all' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{regionFilter}</span>}
                {typeFilter !== 'all' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{typeFilter}</span>}
                {statusFilter !== 'all' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{statusFilter}</span>}
                {gearFilter !== 'all' && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">{gearFilter}</span>}
                {(minDwt || maxDwt) && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider">DWT Filtered</span>}
              </div>
            )}
          </div>
        </div>

        {viewMode === 'map' ? (
          <div className="h-[calc(100vh-16rem)] w-full border-t border-outline/30 relative z-0">
            <AISMap vessels={filteredVessels} onSelectVessel={(v) => {
              setSearchQuery(''); // Ensure it's not filtered out
              setSelectedVessel(v);
              setViewMode('list');
              setTimeout(() => {
                const el = document.getElementById(`vessel-${v.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 300);
            }} hoveredVesselId={hoveredVesselId} />
          </div>
        ) : (
          <div className="flex w-full border-t border-outline/30 min-h-[calc(100vh-16rem)]">
            <div className="w-full xl:w-2/3 p-4 sm:p-6 space-y-2 pb-32 lg:pb-8 flex-1">
              {/* Table Header */}
              <div className="hidden md:grid grid-cols-[40px_1fr_2fr_0.8fr_0.8fr_1.5fr_1fr_0.8fr] gap-4 px-6 py-4 border-b border-outline/30 font-sans tracking-[0.3em] uppercase text-[8px] text-on-surface-variant/70 font-bold bg-transparent items-center">
                <div className="flex items-center justify-center">
                <input 
                  type="checkbox" 
                  checked={sortedVessels.length > 0 && selectedIds.size === sortedVessels.length}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded-sm border-outline/30 bg-surface-container text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
              </div>
              <div>{t('id_tag')}</div>
              <button onClick={() => toggleSort('name')} className="flex items-center gap-2 hover:text-primary transition-colors uppercase text-left">
                {t('vessel_name')} <SortIcon field="name" />
              </button>
              <button onClick={() => toggleSort('dwt')} className="flex items-center gap-2 hover:text-primary transition-colors uppercase text-left">
                {t('dwt')} <SortIcon field="dwt" />
              </button>
              <button onClick={() => toggleSort('builtYear')} className="flex items-center gap-2 hover:text-primary transition-colors uppercase text-left">
                {t('built')} <SortIcon field="builtYear" />
              </button>
              <button onClick={() => toggleSort('openPort')} className="flex items-center gap-2 hover:text-primary transition-colors uppercase text-left">
                {t('open_port')} <SortIcon field="openPort" />
              </button>
              <button onClick={() => toggleSort('openDate')} className="flex items-center gap-2 hover:text-primary transition-colors uppercase text-left">
                {t('open_date')} <SortIcon field="openDate" />
              </button>
              <div className="text-right">AIS Link</div>
            </div>

            <div className="space-y-1 mt-2">
              {sortedVessels.map((vessel, idx) => (
                <motion.div 
                  id={`vessel-${vessel.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    delay: idx * 0.03,
                    duration: 0.5,
                    ease: [0.16, 1, 0.3, 1]
                  }}
                  key={vessel.id}
                  onClick={() => setSelectedVessel(vessel)}
                  onMouseEnter={() => setHoveredVesselId(vessel.id)}
                  onMouseLeave={() => setHoveredVesselId(null)}
                  className={cn(
                    "md:grid md:grid-cols-[40px_1fr_2fr_0.8fr_0.8fr_1.5fr_1fr_0.8fr] flex flex-col gap-4 p-4 md:px-6 md:py-5 md:items-center border border-transparent transition-all duration-300 font-sans cursor-pointer group rounded-sm relative",
                    selectedVessel?.id === vessel.id 
                      ? "bg-primary/5 border-primary/20 shadow-[inset_4px_0_0_var(--color-primary)]" 
                      : "bg-surface-container-lowest hover:bg-surface-container-low hover:border-outline/30",
                    selectedIds.has(vessel.id) && "bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-center hidden md:flex" onClick={(e) => e.stopPropagation()}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.has(vessel.id)}
                    onChange={(e) => toggleSelectOne(e as any, vessel.id)}
                    className="w-3.5 h-3.5 rounded-sm border-outline/30 bg-surface-container text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                </div>
                <div className="font-mono text-[10px] text-primary/80 font-medium hidden md:block">{vessel.id}</div>
                
                <div className="hidden md:flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-xl text-on-surface font-light tracking-tight">{vessel.name}</span>
                    {vessel.visibility === 'desk_network' && (
                      <span className="text-[8px] bg-tertiary/10 text-tertiary border border-tertiary/20 px-2 py-0.5 font-bold tracking-widest rounded-sm flex items-center gap-1"><Share2 className="w-2.5 h-2.5" /> SHARED</span>
                    )}
                    <StatusBadge status={vessel.status} />
                  </div>
                  <span className="text-[8px] text-on-surface-variant font-mono tracking-widest uppercase opacity-80">TYPE: {vessel.type}</span>
                </div>

                <div className="md:hidden space-y-4 w-full pt-1">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 mb-1">
                         <div className="flex items-center justify-center p-2 -ml-2" onClick={(e) => e.stopPropagation()}>
                           <input 
                             type="checkbox" 
                             checked={selectedIds.has(vessel.id)}
                             onChange={(e) => toggleSelectOne(e as any, vessel.id)}
                             className="w-5 h-5 rounded-sm border-outline/30 bg-surface-container text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                           />
                         </div>
                         <span className="text-[11px] text-primary/70 font-mono tracking-widest leading-none pt-0.5">{vessel.id}</span>
                         {vessel.visibility === 'desk_network' && (
                            <span className="text-[8px] bg-tertiary/10 text-tertiary border border-tertiary/20 px-1.5 py-0.5 font-bold tracking-widest rounded-sm flex items-center gap-1 ml-1"><Share2 className="w-2.5 h-2.5" /></span>
                         )}
                      </div>
                      <span className="font-display text-2xl text-on-surface font-light tracking-tight">{vessel.name}</span>
                    </div>
                    <StatusBadge status={vessel.status} className="mt-1" />
                  </div>

                  <div className="flex items-center gap-2 bg-surface-container-low p-3.5 rounded-sm border border-outline/10 text-[10px] w-full mb-1">
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <span className="text-[8px] text-on-surface-variant uppercase tracking-widest font-bold">Open Port</span>
                      <span className="text-[12px] text-on-surface font-mono truncate font-medium">{vessel.openPort.split(',')[0].toUpperCase()}</span>
                    </div>
                    <MapPin className="h-4 w-4 text-on-surface-variant/40 shrink-0 mx-1" />
                    <div className="flex-1 flex flex-col gap-1 text-right min-w-0">
                      <span className="text-[8px] text-on-surface-variant uppercase tracking-widest font-bold">Date</span>
                      <span className="text-[12px] text-tertiary font-mono truncate font-medium">{vessel.openDate.toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] tracking-widest uppercase font-medium">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-mono text-on-surface leading-none mt-1 p-0">{vessel.dwt?.toLocaleString() || 'N/A'} DWT</span>
                      <span className="text-[9px] text-on-surface-variant font-mono tracking-widest uppercase opacity-80">TYPE: {vessel.type}</span>
                    </div>
                    <div className="flex gap-2">
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           handleAISLink(e, vessel);
                         }}
                         className="px-6 py-3 md:px-3 md:py-1.5 bg-surface-container border border-outline/30 text-on-surface-variant hover:text-on-surface text-[10px] md:text-[8px] font-bold tracking-widest rounded-sm transition-colors active:bg-surface-container-high"
                       >
                         AIS
                       </button>
                    </div>
                  </div>
                </div>

                {/* Desktop layout fields */}
                <div className="hidden md:block font-mono text-[11px] text-on-surface tracking-wide">{vessel.dwt?.toLocaleString() || 'N/A'}</div>

                <div className="hidden md:block font-mono text-[11px] text-on-surface-variant tracking-wide">{vessel.builtYear}</div>
                
                <div className="hidden md:flex flex-col">
                  <span className="font-mono text-[11px] text-on-surface tracking-wide">{vessel.openPort.toUpperCase()}</span>
                </div>

                <div className="hidden md:block font-mono text-[11px] text-tertiary font-medium tracking-wide">{vessel.openDate.toUpperCase()}</div>

                <div className="hidden md:flex justify-end gap-3">
                  <button 
                    onClick={(e) => handleAISLink(e, vessel)}
                    className="bg-transparent border border-outline/30 text-on-surface-variant hover:border-primary/50 hover:text-primary px-4 py-2 font-sans text-[8px] font-bold tracking-[0.2em] transition-all duration-300 uppercase flex items-center gap-2 rounded-sm shadow-sm"
                  >
                    <Globe className="h-3 w-3 stroke-1.5" />
                    AIS
                  </button>
                  <button 
                    onClick={(e) => handleDeleteVessel(e, vessel.id)}
                    className="w-8 h-8 rounded-full border border-transparent text-on-surface-variant hover:bg-error/10 hover:border-error/20 hover:text-error transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100"
                    title="DELETE_RECORD"
                  >
                    <Trash2 className="h-3.5 w-3.5 stroke-[1.5]" />
                  </button>
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
                          : `Share this vessel with your Desk Network?`)
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

          <button 
            onClick={() => setIsNewVesselModalOpen(true)}
            className="w-full border border-dashed border-outline/20 bg-surface-container-lowest/50 backdrop-blur-sm p-6 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:bg-surface-container-low transition-all group mt-8 rounded-sm"
          >
            <Anchor className="h-5 w-5 text-on-surface-variant group-hover:text-primary stroke-1.5 transition-colors" />
            <span className="font-sans text-[9px] text-on-surface-variant group-hover:text-primary tracking-[0.4em] font-medium uppercase transition-colors">INIT NEW AIS LINK</span>
          </button>
        </div>
        <div className="hidden xl:block xl:w-1/3 border-l border-outline/30 relative z-0">
          <AISMap vessels={filteredVessels} onSelectVessel={(v) => {
            setSearchQuery(''); // Ensure it's not filtered out
            setSelectedVessel(v);
          }} hoveredVesselId={hoveredVesselId} />
        </div>
      </div>
      )}
    </div>

    {/* Side Details Panel */}
      <AnimatePresence>
        {selectedVessel && (
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
                  <Ship className="h-5 w-5 text-primary stroke-[1.5]" />
                </div>
                <h2 className="font-display text-[11px] text-on-surface font-medium uppercase tracking-[0.3em]">
                  {t('vessel_specs')}
                </h2>
              </div>
              <button 
                onClick={() => setSelectedVessel(null)}
                className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-low"
              >
                <X className="h-5 w-5 stroke-1" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8 space-y-10">
              {/* Profile Header */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-surface-container-low text-primary text-[9px] font-medium uppercase tracking-[0.2em] border border-outline/30 rounded-sm">
                      {selectedVessel.id}
                    </span>
                    <span className="text-on-surface-variant text-[9px] font-medium uppercase tracking-[0.2em]">
                      Built {selectedVessel.builtYear}
                    </span>
                  </div>
                  <StatusBadge status={selectedVessel.status} className="mt-1" />
                </div>
                <h3 className="text-5xl font-display font-light text-on-surface tracking-tight leading-none">
                  {selectedVessel.name}
                </h3>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-px bg-outline/20 border border-outline/20 rounded-sm overflow-hidden">
                <div className="bg-surface-container-low p-6">
                  <p className="text-[8px] text-on-surface-variant font-medium uppercase tracking-[0.2em] mb-2">{t('vessel_capacity')}</p>
                  <p className="text-2xl font-mono text-on-surface font-light tracking-tight">{selectedVessel.dwt?.toLocaleString() || 'N/A'}</p>
                </div>
                <div className="bg-surface-container-low p-6">
                  <p className="text-[8px] text-on-surface-variant font-medium uppercase tracking-[0.2em] mb-2">{t('grt_nrt')}</p>
                  <p className="text-xl font-mono text-on-surface font-light tracking-tight">{selectedVessel.grt?.toLocaleString() || 'N/A'} <span className="text-on-surface-variant text-sm">/ {selectedVessel.nrt?.toLocaleString() || 'N/A'}</span></p>
                </div>
                <div className="bg-surface-container-low p-6">
                  <p className="text-[8px] text-on-surface-variant font-medium uppercase tracking-[0.2em] mb-2">Vessel Type</p>
                  <p className="text-lg font-mono text-primary font-light tracking-tight truncate">{selectedVessel.type}</p>
                </div>
                <div className="bg-surface-container-low p-6">
                  <p className="text-[8px] text-on-surface-variant font-medium uppercase tracking-[0.2em] mb-2">{t('holds_vol')}</p>
                  <p className="text-lg font-mono text-on-surface font-light tracking-tight truncate">{selectedVessel.holds || 'N/A'} <span className="text-on-surface-variant text-sm">/ {selectedVessel.cubicCapacity || 'N/A'}</span></p>
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="flex border-b border-outline/30 mt-4">
                <button
                  onClick={() => setDetailsTab('overview')}
                  className={cn(
                    "flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors",
                    detailsTab === 'overview' 
                      ? "text-primary border-b-2 border-primary" 
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  Overview
                </button>
                <button
                  onClick={() => setDetailsTab('insurance')}
                  className={cn(
                    "flex-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-colors",
                    detailsTab === 'insurance' 
                      ? "text-primary border-b-2 border-primary" 
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  Insurance
                </button>
              </div>

              {detailsTab === 'overview' ? (
                <>
                  {/* Detailed Specs */}
                  <div className="space-y-6">
                    <h4 className="text-[9px] text-primary font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-8 h-[1px] bg-primary/30"></div>
                      Technical Specifications
                    </h4>
                    
                    <div className="space-y-5 bg-surface-container-low p-6 border border-outline/20 rounded-sm">
                      <div className="flex justify-between items-start">
                         <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">Open Position</span>
                         <span className="text-on-surface text-[12px] font-medium font-sans tracking-wide text-right">{selectedVessel.openPort}</span>
                      </div>
                      
                      <div className="flex justify-between items-start">
                         <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">Laycan Avail</span>
                         <span className="text-tertiary text-[12px] font-medium font-mono text-right">{selectedVessel.openDate}</span>
                      </div>

                      <div className="flex justify-between items-center">
                         <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">Vessel Owner</span>
                         <span className="text-on-surface text-[12px] font-medium font-sans tracking-wide">{selectedVessel.owner}</span>
                      </div>

                      <div className="flex justify-between items-center">
                         <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">IMO / MMSI</span>
                         <span className="text-on-surface text-[12px] font-medium font-mono">{selectedVessel.imo || 'N/A'} <span className="text-on-surface-variant mx-2">/</span> {selectedVessel.mmsi || 'N/A'}</span>
                      </div>

                      <div className="flex justify-between items-center">
                         <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">Flag State</span>
                         <span className="text-on-surface text-[12px] font-medium font-sans tracking-wide">{selectedVessel.flag || 'N/A'}</span>
                      </div>

                      <div className="flex justify-between items-center">
                         <span className="text-on-surface-variant text-[10px] uppercase tracking-widest font-medium">Update Recency</span>
                         <span className="text-primary text-[12px] font-medium font-mono">{selectedVessel.updatedAt}</span>
                      </div>
                    </div>
                  </div>

                  {/* Private Notes */}
                  <div className="space-y-6">
                    <h4 className="text-[9px] text-primary font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                      <div className="w-8 h-[1px] bg-primary/30"></div>
                      Private Notes
                    </h4>
                    <textarea
                      className="w-full bg-surface-container-lowest border border-outline/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 text-on-surface p-5 text-[12px] font-sans font-light leading-loose min-h-[120px] resize-y placeholder:text-on-surface-variant/40 transition-all outline-none rounded-sm disabled:opacity-50"
                      placeholder="Add private notes for this vessel. These notes are only visible to you..."
                      value={selectedVessel.privateNotes || ''}
                      onChange={handleNotesChange}
                      disabled={isViewer}
                    />
                  </div>

                  {/* Status Indicator */}
                  <div className="p-6 bg-primary/5 border border-primary/20 rounded-sm">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[9px] text-primary font-medium uppercase tracking-[0.2em]">Market Status</span>
                      <StatusBadge status={selectedVessel.status} />
                    </div>
                    <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full transition-all duration-1000 ease-out" style={{ width: `${selectedVessel.confidence || 100}%` }} />
                    </div>
                    <p className="text-[9px] text-on-surface-variant mt-3 font-mono tracking-widest">AIS Confidence Score: {selectedVessel.confidence || 100}%</p>
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <h4 className="text-[9px] text-primary font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                    <div className="w-8 h-[1px] bg-primary/30"></div>
                    Insurance Details
                  </h4>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Provider / P&I Club</label>
                      <input 
                        value={selectedVessel.insurance?.provider || ''}
                        onChange={(e) => onUpdate(selectedVessel.id, { insurance: { ...selectedVessel.insurance, provider: e.target.value } as any })}
                        disabled={isViewer}
                        placeholder="e.g. Britannia P&I"
                        className="w-full bg-surface-container-lowest border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Policy Number</label>
                      <input 
                        value={selectedVessel.insurance?.policyNumber || ''}
                        onChange={(e) => onUpdate(selectedVessel.id, { insurance: { ...selectedVessel.insurance, policyNumber: e.target.value } as any })}
                        disabled={isViewer}
                        placeholder="e.g. POL-2026-X89"
                        className="w-full bg-surface-container-lowest border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all disabled:opacity-50"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Premium</label>
                        <input 
                          value={selectedVessel.insurance?.premium || ''}
                          onChange={(e) => onUpdate(selectedVessel.id, { insurance: { ...selectedVessel.insurance, premium: e.target.value } as any })}
                          disabled={isViewer}
                          placeholder="$1,200,000"
                          className="w-full bg-surface-container-lowest border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all font-mono disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Expiry Date</label>
                        <input 
                          type="date"
                          value={selectedVessel.insurance?.expiryDate || ''}
                          onChange={(e) => onUpdate(selectedVessel.id, { insurance: { ...selectedVessel.insurance, expiryDate: e.target.value } as any })}
                          disabled={isViewer}
                          className="w-full bg-surface-container-lowest border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all font-mono disabled:opacity-50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Coverage Details</label>
                      <textarea 
                        value={selectedVessel.insurance?.coverageDetails || ''}
                        onChange={(e) => onUpdate(selectedVessel.id, { insurance: { ...selectedVessel.insurance, coverageDetails: e.target.value } as any })}
                        disabled={isViewer}
                        placeholder="Hull & Machinery (H&M), Protection and Indemnity (P&I)..."
                        className="w-full bg-surface-container-lowest border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all min-h-[80px] resize-y disabled:opacity-50"
                      />
                    </div>

                    <div className="pt-4 border-t border-outline/20">
                      <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-3 ml-1">Policy Documents</label>
                      {selectedVessel.insurance?.documentName ? (
                        <div className="flex items-center justify-between bg-surface-container-low border border-outline/30 px-4 py-3 rounded-sm">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-tertiary" />
                            <span className="text-sm text-on-surface font-medium">{selectedVessel.insurance.documentName}</span>
                          </div>
                          {!isViewer && (
                            <button 
                              onClick={() => {
                                if (confirm('Are you sure you want to remove this document?')) {
                                  onUpdate(selectedVessel.id, { insurance: { ...selectedVessel.insurance, documentName: '', documentUrl: '' } as any });
                                }
                              }}
                              className="text-on-surface-variant hover:text-error transition-colors p-1"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="border border-dashed border-outline/30 rounded-sm p-6 flex flex-col items-center justify-center gap-3 bg-surface-container-lowest/50 group hover:border-primary/50 hover:bg-surface-container-low transition-all relative">
                          <Upload className="h-5 w-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                          <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-medium">Upload Policy PDF</span>
                          {!isViewer && (
                            <input 
                              type="file" 
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              accept=".pdf,.doc,.docx"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  onUpdate(selectedVessel.id, { insurance: { ...selectedVessel.insurance, documentName: file.name, documentUrl: URL.createObjectURL(file) } as any });
                                }
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-surface-container-low border-t border-outline/20 flex flex-col gap-4">
              <button 
                onClick={(e) => handleAISLink(e, selectedVessel)}
                className="w-full bg-primary text-on-primary py-4 font-bold uppercase tracking-[0.2em] hover:bg-primary-container transition-all flex items-center justify-center gap-3 text-[10px] rounded-sm shadow-md"
              >
                <Globe className="h-4 w-4 stroke-2" />
                Track on MarineTraffic
              </button>
              <div className="flex gap-4">
                <button 
                  className={cn(
                    "flex-1 border transition-all py-3 flex items-center justify-center gap-2 rounded-sm text-[9px] font-bold uppercase tracking-widest",
                    selectedVessel.visibility === 'desk_network' 
                      ? "border-tertiary/50 text-tertiary hover:bg-error/10 hover:text-error hover:border-error/50"
                      : "bg-surface-container border-outline/30 text-tertiary hover:border-tertiary/50 hover:bg-tertiary/5"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmAction({ type: selectedVessel.visibility === 'desk_network' ? 'unshare' : 'push', target: 'single', id: selectedVessel.id });
                  }}
                >
                  {selectedVessel.visibility === 'desk_network' ? <X className="h-4 w-4 stroke-1.5" /> : <Share2 className="h-4 w-4 stroke-1.5" />}
                  {selectedVessel.visibility === 'desk_network' ? 'Revoke Visibility' : 'Share to Desk Network'}
                </button>
                {!isViewer && (
                  <button 
                    onClick={(e) => handleDeleteVessel(e, selectedVessel.id)}
                    className="w-12 border border-outline/30 text-error/60 hover:bg-error/5 hover:text-error hover:border-error/30 transition-all flex items-center justify-center rounded-sm"
                    title="DELETE RECORD"
                  >
                    <Trash2 className="h-4 w-4 stroke-1.5" />
                  </button>
                )}
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNewVesselModalOpen && (
          <VesselDraftModal 
            onClose={() => setIsNewVesselModalOpen(false)}
            onSubmit={(vessel) => {
              onCreate(vessel);
              setIsNewVesselModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

import { ManualIntakeMode } from './ManualIntakeMode';

const VesselDraftModal = ({ onClose, onSubmit }: { onClose: () => void, onSubmit: (vessel: Vessel) => void }) => {
  const [activeTab, setActiveTab] = useState<'MANUAL' | 'TEXT'>('MANUAL');
  const [formData, setFormData] = useState<Partial<Vessel>>({
    name: '',
    type: 'Supramax',
    dwt: 0,
    grt: 0,
    nrt: 0,
    builtYear: new Date().getFullYear(),
    status: 'OPEN',
    openPort: '',
    openDate: '',
    owner: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.dwt || !formData.openPort) return;
    
    onSubmit({
      id: `VSL-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      name: formData.name as string,
      type: formData.type as 'Handysize' | 'Supramax' | 'Ultramax' | 'Panamax' | 'Capesize',
      dwt: Number(formData.dwt),
      grt: Number(formData.grt) || 0,
      nrt: Number(formData.nrt) || 0,
      builtYear: Number(formData.builtYear),
      status: formData.status as 'OPEN' | 'FIXED' | 'ON SUB',
      openPort: formData.openPort as string,
      openDate: formData.openDate as string,
      owner: formData.owner || 'Unknown',
      flag: 'TBA',
      confidence: 100,
      updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z',
    });
  };

  return (
    <div className="fixed inset-0 bg-surface/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-3xl bg-surface-container-lowest border border-outline/30 rounded-sm shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh] overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-outline/20 flex justify-between items-center bg-surface-container/30 flex-none">
          <div className="flex items-center gap-4">
              <h2 className="text-[11px] text-on-surface font-medium uppercase tracking-[0.2em] flex items-center gap-2">
                <Anchor className="h-4 w-4 stroke-[1.5] text-primary" />
                INIT NEW AIS LINK
              </h2>
              <div className="flex items-center gap-2 border border-outline/50 rounded-full p-1 bg-surface ml-4">
                 <button 
                    onClick={() => setActiveTab('MANUAL')}
                    className={cn("px-4 py-1 text-[9px] font-bold uppercase tracking-widest transition-all rounded-full", activeTab === 'MANUAL' ? "bg-primary text-black" : "text-on-surface-variant hover:text-on-surface")}
                 >
                    Manual Form
                 </button>
                 <button 
                    onClick={() => setActiveTab('TEXT')}
                    className={cn("px-4 py-1 text-[9px] font-bold uppercase tracking-widest transition-all rounded-full", activeTab === 'TEXT' ? "bg-primary text-black" : "text-on-surface-variant hover:text-on-surface")}
                 >
                    Paste text
                 </button>
              </div>
          </div>
          <button onClick={onClose} className="p-2 text-on-surface-variant hover:text-on-surface transition-colors">
            <X className="h-4 w-4 stroke-[1.5]" />
          </button>
        </div>

        {activeTab === 'MANUAL' ? (
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto flex flex-col">
          <div className="p-6 grid grid-cols-2 gap-6 flex-1 overflow-y-auto">
            <div className="space-y-4">
              <div>
                <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Vessel Name</label>
                <input 
                  autoFocus required
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-surface-container border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all"
                  placeholder="e.g., MV Bulk Explorer"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Vessel Type</label>
                  <select 
                    value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})}
                    className="w-full bg-surface-container border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all"
                  >
                    <option value="Handysize">Handysize</option>
                    <option value="Supramax">Supramax</option>
                    <option value="Ultramax">Ultramax</option>
                    <option value="Panamax">Panamax</option>
                    <option value="Capesize">Capesize</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">DWT</label>
                  <input 
                    required type="number"
                    value={formData.dwt} onChange={e => setFormData({...formData, dwt: parseInt(e.target.value)})}
                    className="w-full bg-surface-container border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all font-mono"
                    placeholder="e.g., 58000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Built Year</label>
                    <input 
                      type="number"
                      value={formData.builtYear} onChange={e => setFormData({...formData, builtYear: parseInt(e.target.value)})}
                      className="w-full bg-surface-container border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all font-mono"
                      placeholder="e.g., 2012"
                    />
                 </div>
                 <div>
                  <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Status</label>
                  <select 
                    value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})}
                    className="w-full bg-surface-container border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all"
                  >
                    <option value="OPEN">OPEN</option>
                    <option value="ON SUB">ON SUB</option>
                    <option value="FIXED">FIXED</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Open Port</label>
                <input 
                  required
                  value={formData.openPort} onChange={e => setFormData({...formData, openPort: e.target.value})}
                  className="w-full bg-surface-container border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all"
                  placeholder="e.g., Singapore"
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Open Date / Laycan</label>
                <input 
                  required
                  value={formData.openDate} onChange={e => setFormData({...formData, openDate: e.target.value})}
                  className="w-full bg-surface-container border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all"
                  placeholder="e.g., 15-20 Aug"
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-widest text-on-surface-variant mb-1 ml-1">Owner / Operator</label>
                <input 
                  value={formData.owner} onChange={e => setFormData({...formData, owner: e.target.value})}
                  className="w-full bg-surface-container border border-outline/30 px-3 py-2 text-sm text-on-surface focus:border-primary/50 outline-none rounded-sm transition-all"
                  placeholder="e.g., Pacific Bulk"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-outline/20">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-[10px] uppercase tracking-widest font-bold text-on-surface-variant hover:text-on-surface transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-6 py-2.5 bg-primary text-on-primary text-[10px] uppercase tracking-widest font-bold flex items-center gap-2 hover:bg-primary-container transition-colors shadow-md rounded-sm">
              <Anchor className="h-3.5 w-3.5" /> Initialize Unit
            </button>
          </div>
        </form>
        ) : (
           <div className="flex-1 overflow-hidden">
               <ManualIntakeMode onClose={onClose} defaultType="VESSEL" />
           </div>
        )}
      </motion.div>
    </div>
  );
};

