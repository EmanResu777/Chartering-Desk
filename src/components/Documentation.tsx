import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, FileText, Settings, Key, Mail, Ship, Box, Search, BarChart3, Bot, Zap, Plug, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useConfig } from '../lib/ConfigContext';
import ReactMarkdown from 'react-markdown';

// Eagerly import all md files in docs/
// Vite handles this and bundles it safely since it's just raw strings.
const docFiles = import.meta.glob('/docs/**/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const Documentation: React.FC = () => {
  const { language, t } = useConfig();
  const [activeFile, setActiveFile] = useState<string>('README.md');

  // "active languages" mapping based on prompt
  const langMap: Record<string, string> = {
    'en': 'en',
    'zh': 'zh',
    'es': 'es',
    'fr': 'fr',
    'ru': 'ru',
    'de': 'de',
    'pt': 'pt',
    'ar': 'en', // coming soon -> fallback to en
    'ja': 'en', // coming soon
    'hi': 'en'  // coming soon
  };

  const currentDocsLang = langMap[language] || 'en';

  const order = [
    'README.md',
    'user-guide.md',
    'admin-founder-guide.md',
    'billing-usage-credits.md',
    'ai-email-parser.md',
    'gmail-email-sync.md',
    'desk-network.md',
    'urgent-deals-hot-opportunities.md',
    'oceanpact-recap-guide.md',
    'selection-desk.md',
    'manual-edit.md',
    'ai-assistant.md',
    'diagnostics-troubleshooting.md',
    'security-privacy.md',
    'deployment-environment.md',
    'faq.md',
    'legal-placeholders.md'
  ];

  const filesToDisplay = order;

  // Function to pull content: tries selected lang, falls back to EN
  const getDocContent = (filename: string) => {
    // For coming soon languages (ar, ja, hi), we show the specific language's fallback/placeholder
    // Wait, the prompt says "Arabic/ar placeholder or fallback yes/no".
    // I created README.md placeholder with "Coming Soon" for ar, ja, hi.
    // So if language is 'ar', we try `/docs/ar/${filename}`. If it doesn't exist, we fallback to EN.
    const explicitLang = ['ar', 'ja', 'hi'].includes(language) ? language : currentDocsLang;
    const path = `/docs/${explicitLang}/${filename}`;
    if (docFiles[path]) {
      return docFiles[path];
    }
    const enPath = `/docs/en/${filename}`;
    return docFiles[enPath] || `# Missing Document\n\nFallback documentation not found for ${filename}.`;
  };

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-outline/30 bg-surface-container-lowest shrink-0">
        <div>
          <h1 className="text-xl font-display font-light text-on-surface tracking-wide uppercase">
            {t('documentation') || 'DOCUMENTATION'}
          </h1>
          <p className="text-xs text-on-surface-variant font-mono mt-1 uppercase tracking-wider">{t('user_guide') || 'System Reference'}</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-outline/30 bg-surface-container-lowest overflow-y-auto hidden md:block">
          <div className="p-4 flex flex-col gap-1">
            {filesToDisplay.map((file) => (
              <button
                key={file}
                onClick={() => setActiveFile(file)}
                className={cn(
                  "text-left p-3 text-xs md:text-sm rounded-md transition-colors font-medium break-words flex items-center gap-2",
                  activeFile === file 
                    ? "bg-primary/10 text-primary" 
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                )}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{file.replace('.md', '').replaceAll('-', ' ')}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Dropdown */}
        <div className="md:hidden border-b border-outline/30 bg-surface-container p-2 shrink-0">
          <select 
            value={activeFile} 
            onChange={(e) => setActiveFile(e.target.value)}
            className="w-full bg-surface-container-lowest border border-outline/30 text-on-surface p-2 rounded text-sm"
          >
            {filesToDisplay.map(f => (
              <option key={f} value={f}>{f.replace('.md', '').replaceAll('-', ' ')}</option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-4xl mx-auto pb-20">
             <div className="markdown-body p-6 bg-surface-container-lowest border border-outline/30 rounded-xl shadow-sm">
                <ReactMarkdown>{getDocContent(activeFile)}</ReactMarkdown>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
