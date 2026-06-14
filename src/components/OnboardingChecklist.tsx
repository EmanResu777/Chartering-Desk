import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '../lib/utils';
import { isAuthenticated } from '../lib/googleAuth';

export const OnboardingChecklist = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('onboarding_checklist_dismissed');
    if (!dismissed) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('onboarding_checklist_dismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const tasks = [
    { title: 'Complete profile', completed: true },
    { title: 'Create/join organization', completed: true },
    { title: 'Add first cargo', completed: false },
    { title: 'Add first vessel/tonnage', completed: false },
    { title: 'Connect Gmail', completed: isAuthenticated() },
    { title: 'Review usage credits', completed: false },
    { title: 'Open Desk Network', completed: false },
  ];

  const completedCount = tasks.filter(t => t.completed).length;
  const progress = (completedCount / tasks.length) * 100;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 right-6 z-50 w-80 bg-surface-container-highest border border-outline/30 rounded-sm shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-outline/20 bg-surface-container-low cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
          <div>
            <h3 className="font-display font-medium text-sm text-on-surface">Getting Started</h3>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">{completedCount} of {tasks.length} complete</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={(e) => { e.stopPropagation(); handleDismiss(); }} className="p-1 hover:bg-surface rounded-sm text-on-surface-variant transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="h-1 bg-outline/20">
          <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>

        {!isMinimized && (
          <div className="p-4 bg-surface max-h-60 overflow-y-auto">
            <div className="space-y-3">
              {tasks.map((task, i) => (
                <div key={i} className="flex items-center gap-3">
                  {task.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-outline shrink-0 opacity-50" />
                  )}
                  <span className={cn(
                    "text-xs font-medium transition-colors",
                    task.completed ? "text-on-surface-variant line-through opacity-70" : "text-on-surface"
                  )}>
                    {task.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
