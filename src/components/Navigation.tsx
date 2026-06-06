import React from 'react';
import { Package2, Ship, Mail, BarChart3, Settings as SettingsIcon, Users, Zap, Bot, BookOpen, ChevronDown, Plus, Search, Plug, Bell, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { useConfig } from '../lib/ConfigContext';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, logout } from '../lib/firebase';
import { useWorkspace } from '../lib/WorkspaceContext';
import { NotificationCenter } from './NotificationCenter';
import { useNotification } from '../lib/NotificationContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  notifications?: Record<string, boolean>;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, notifications = {} }) => {
  const { t } = useConfig();
  
  const navItems = [
    { id: 'cargo', icon: Package2, label: t('cargo_desk') },
    { id: 'vessel', icon: Ship, label: t('vessel_monitor') },
    { id: 'selection', icon: Zap, label: t('selection_desk') },
    { id: 'documents', icon: FileText, label: 'Drafts' },
    { id: 'inbox', icon: Mail, label: t('inbox_parser') },
    { id: 'contacts', icon: Users, label: t('contact_list') },
    { id: 'analytics', icon: BarChart3, label: t('analytics') },
    { id: 'ai', icon: Bot, label: t('ai_assistant') },
    { id: 'architecture', icon: Plug, label: 'Архитектура' },
    { id: 'docs', icon: BookOpen, label: t('documentation') || 'DOCUMENTATION' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-[80px] border-r border-outline/50 bg-transparent h-full shrink-0 z-40 py-8 items-center gap-6 overflow-y-auto no-scrollbar relative">
      <div className="absolute inset-0 bg-surface-container-low opacity-80 backdrop-blur-3xl z-[-1]"></div>
      <div className="text-primary font-display font-light text-3xl italic pb-6 border-b border-outline/30 w-full text-center shrink-0">
        C
      </div>
      
      <div className="flex-1 flex flex-col items-center gap-6 pt-4 w-full shrink-0">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-12 h-12 flex items-center justify-center transition-all duration-700 relative group",
              activeTab === item.id 
                ? "text-primary" 
                : "text-on-surface-variant hover:text-primary bg-transparent"
            )}
            title={item.label}
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <item.icon className="h-5 w-5 font-light" strokeWidth={activeTab === item.id ? 1.5 : 1} />
            </motion.div>
            
            <AnimatePresence>
              {notifications[item.id] && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="absolute top-2 right-2 w-1.5 h-1.5"
                >
                  <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary shadow-[0_0_8px_var(--color-primary)]"></span>
                </motion.div>
              )}
            </AnimatePresence>
            
            {activeTab === item.id && (
              <motion.div 
                layoutId="activeTabSidebar"
                className="absolute left-[-16px] w-[2px] h-6 bg-primary shadow-[0_0_10px_var(--color-primary)]" 
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-6 w-full pb-4 shrink-0">
        <div className="text-[9px] uppercase font-sans tracking-[0.4em] font-medium [writing-mode:vertical-lr] text-outline rotate-180 h-32 opacity-40 shrink-0">
          {t('operations') || 'OPERATIONS'}
        </div>
        
        <button
          onClick={() => setActiveTab('settings')}
          className={cn(
            "w-12 h-12 flex items-center justify-center transition-all duration-700 relative",
            activeTab === 'settings' 
              ? "text-primary" 
              : "text-on-surface-variant hover:text-primary bg-transparent"
          )}
          title={t('settings')}
        >
          <SettingsIcon className="h-5 w-5 font-light" strokeWidth={activeTab === 'settings' ? 1.5 : 1} />
          {activeTab === 'settings' && (
             <div className="absolute left-[-16px] w-[2px] h-6 bg-primary shadow-[0_0_10px_var(--color-primary)]" />
          )}
        </button>
      </div>
    </aside>
  );
};

export const TopBar: React.FC<{ activeTabLabel: string, onUpgradeClick: () => void, onSearchClick: () => void }> = ({ activeTabLabel, onUpgradeClick, onSearchClick }) => {
  const { subscription, t } = useConfig();
  const { user } = useAuth();
  const { workspaces, currentWorkspace, setCurrentWorkspace, createWorkspace } = useWorkspace();
  const { unreadCount, showNotificationCenter, setShowNotificationCenter } = useNotification();
  
  const initials = user?.displayName
    ? user.displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
    : user?.email ? user.email.substring(0, 2).toUpperCase() : '??';

  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = React.useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
  const [showNewWorkspaceModal, setShowNewWorkspaceModal] = React.useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = React.useState('');

  const handleCreateWorkspace = () => {
    if (newWorkspaceName.trim()) {
      createWorkspace(newWorkspaceName.trim()).then(() => {
        setNewWorkspaceName('');
        setShowNewWorkspaceModal(false);
        setShowWorkspaceMenu(false);
      });
    }
  };

  return (
    <header className="flex justify-between items-center w-full px-4 sm:px-8 h-14 sm:h-20 bg-transparent border-b border-outline/30 z-50 shrink-0 relative">
      <div className="absolute inset-0 bg-surface-container-low opacity-80 backdrop-blur-3xl z-[-1]"></div>
      <AnimatePresence>
        {showNewWorkspaceModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-surface-container-highest/80 p-4 backdrop-blur-sm"
          >
            <div className="bg-surface-container border border-primary max-w-sm w-full p-8 font-mono relative">
              <h3 className="text-primary font-bold uppercase tracking-widest mb-6">Create New Workspace</h3>
              <div className="mb-8">
                <label className="block text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Workspace Name</label>
                <input 
                  type="text" 
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="e.g. Navig8 Chartering"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateWorkspace();
                  }}
                  className="w-full bg-surface-container-low border border-outline/30 focus:border-primary/50 transition-colors focus:ring-0 text-on-surface font-sans text-sm px-4 py-3 outline-none"
                />
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowNewWorkspaceModal(false)}
                  className="flex-1 bg-surface-container-highest text-on-surface py-2.5 border border-outline font-bold uppercase tracking-widest text-[10px] hover:border-current transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateWorkspace}
                  disabled={!newWorkspaceName.trim()}
                  className="flex-1 bg-primary text-black py-2.5 font-bold uppercase tracking-widest text-[10px] hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(197,168,128,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-dim/80 p-4 backdrop-blur-sm"
          >
            <div className="bg-surface-container border border-primary max-w-sm w-full p-8 font-mono relative text-center">
              <h3 className="text-primary font-bold uppercase tracking-widest mb-4">Logout Status</h3>
              <p className="text-on-surface-variant font-sans text-sm mb-8">Are you sure you want to log out of the Chartering Desk interface? Your session will be terminated.</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 bg-surface-container-highest text-on-surface py-2 border border-outline font-bold uppercase tracking-widest hover:border-current transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setShowLogoutConfirm(false);
                    logout();
                  }}
                  className="flex-1 bg-primary text-black py-2 font-bold uppercase tracking-widest hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(197,168,128,0.3)]"
                >
                  Confirm Exit
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-4 sm:gap-8">
        <div className="flex flex-col">
          <div className="text-primary font-display text-xl sm:text-3xl tracking-tight font-light leading-none whitespace-nowrap overflow-visible">Chartering Desk</div>
          <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-2">
             <div className="text-[7px] sm:text-[9px] text-on-surface-variant font-sans font-medium tracking-[0.2em] sm:tracking-[0.3em] uppercase hidden sm:block">Premium Broker Interface</div>
             <button 
               onClick={onUpgradeClick}
               className={cn(
                 "text-[7px] sm:text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 border rounded-sm transition-all shadow-sm",
                 subscription === 'maximum' ? "border-tertiary text-tertiary bg-tertiary/5" :
                 subscription === 'premium' ? "border-primary text-primary bg-primary/5" :
                 "border-outline text-on-surface-variant bg-surface"
               )}
             >
                {subscription.toUpperCase()}
             </button>
          </div>
        </div>
        <div className="h-12 w-[1px] bg-outline/40 hidden sm:block"></div>
        <div className="hidden sm:flex gap-8">
          <div className="text-[10px] font-medium tracking-[0.2em] text-on-surface-variant uppercase flex items-center gap-2">
            STATUS <div className="w-1.5 h-1.5 rounded-full bg-tertiary shadow-[0_0_8px_var(--color-tertiary)]"></div> <span className="text-on-surface">ONLINE</span>
          </div>
          <div className="text-[10px] font-medium tracking-[0.2em] text-on-surface-variant uppercase flex items-center gap-2">
            NODE <span className="text-on-surface">GLOBAL-01</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2 sm:gap-6 text-[11px] font-mono">
        <div className="hidden md:block text-on-surface-variant tracking-widest opacity-80">2026-04-27 14:52 GMT</div>
        
        <div className="relative">
          <button 
            onClick={() => setShowNotificationCenter(!showNotificationCenter)}
            title="Notifications"
            className="flex items-center justify-center border border-outline/50 bg-surface w-7 h-7 sm:w-8 sm:h-8 rounded-sm hover:bg-surface-container-highest hover:border-primary/50 transition-all group sm:mr-2 relative"
          >
            <Bell className="w-3.5 h-3.5 text-on-surface-variant group-hover:text-primary transition-colors" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full text-[7px] font-bold text-black flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
        
        <div className="relative">
          <button 
            onClick={onSearchClick}
            title="Global Search"
            className="flex items-center gap-2 border border-outline/50 bg-surface px-2 sm:px-4 py-1.5 rounded-sm hover:bg-surface-container-highest hover:border-primary/50 transition-all font-sans text-[10px] uppercase tracking-widest font-bold text-on-surface-variant group sm:mr-2"
          >
            <Search className="w-3.5 h-3.5 group-hover:text-primary transition-colors" />
            <span className="hidden lg:inline group-hover:text-primary transition-colors">{t('search') || 'Search'}</span>
            <span className="hidden lg:inline bg-surface-container-high px-1.5 py-0.5 rounded-sm text-[8px] border border-outline ml-1 opacity-60">⌘K</span>
          </button>
        </div>

        <div className="relative">
          <button 
            onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
            className="flex items-center gap-2 border border-outline/50 bg-surface px-3 py-1.5 rounded-sm hover:bg-surface-container hover:border-primary/50 transition-all font-sans text-[10px] uppercase tracking-widest font-bold"
          >
            <Users className="w-3.5 h-3.5 text-tertiary" />
            <span className="max-w-[100px] truncate">{currentWorkspace?.name || 'Loading...'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant" />
          </button>
          
          <AnimatePresence>
            {showWorkspaceMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowWorkspaceMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-surface-container-high border border-outline shadow-2xl z-50 flex flex-col p-1"
                >
                  <div className="px-3 py-2 text-[9px] uppercase tracking-widest text-on-surface-variant border-b border-outline/50 mb-1">Organizations</div>
                  {workspaces.map(w => (
                    <button
                      key={w.id}
                      onClick={() => {
                        setCurrentWorkspace(w);
                        setShowWorkspaceMenu(false);
                      }}
                      className={cn(
                        "text-left px-3 py-2 text-[10px] tracking-widest uppercase transition-colors truncate flex items-center justify-between",
                        currentWorkspace?.id === w.id 
                          ? "bg-primary/20 text-primary font-bold" 
                          : "text-on-surface hover:bg-surface-container-highest"
                      )}
                    >
                      {w.name}
                      {currentWorkspace?.id === w.id && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </button>
                  ))}
                  
                  <div className="border-t border-outline/50 mt-1 pt-1">
                    <button 
                      onClick={() => setShowNewWorkspaceModal(true)}
                      className="w-full text-left px-3 py-2 text-[10px] tracking-widest uppercase text-tertiary hover:bg-tertiary/10 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-3 h-3" /> New Workspace
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <div 
            onClick={() => setShowUserMenu(!showUserMenu)}
            title="User Menu"
            className="w-8 h-8 sm:w-12 sm:h-12 rounded-full border border-outline/50 flex items-center justify-center font-display font-light tracking-widest text-primary text-sm sm:text-base shadow-[inset_0_0_15px_var(--color-outline)] cursor-pointer hover:bg-primary/5 transition-all duration-500"
          >
            {initials}
          </div>
          
          <AnimatePresence>
            {showUserMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-4 w-48 bg-surface-container-high border border-outline shadow-2xl z-50 p-2 flex flex-col gap-1"
                >
                  <div className="px-3 py-2 border-b border-outline/50 mb-1">
                    <div className="font-mono text-[10px] text-on-surface-variant uppercase truncate" title={user?.email || ''}>
                      {user?.email || 'Unknown User'}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowLogoutConfirm(true);
                    }}
                    className="w-full text-left px-3 py-2 text-[10px] tracking-widest font-bold uppercase text-error hover:bg-error/10 transition-colors flex items-center justify-between"
                  >
                    Logout
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
};
