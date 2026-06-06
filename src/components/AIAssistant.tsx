import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, Send, X, MessageSquare, FileText, GitCompare, PenTool, Sparkles, User, Loader2, Package2, Ship } from 'lucide-react';
import { cn, Cargo, Vessel } from '../lib/utils';
import { useConfig } from '../lib/ConfigContext';

type Tab = 'chat' | 'summarize' | 'match' | 'draft';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIAssistantProps {
  context?: {
    cargo: Cargo | null;
    vessel: Vessel | null;
    lastFocused: 'cargo' | 'vessel' | null;
  }
}

export const AIAssistant: React.FC<AIAssistantProps> = ({ context }) => {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Welcome to Chartering Desk Pro AI Assistant. I can help you summarize emails, find matches between cargos and vessels, draft replies, and answer questions about your desk data. How can I assist you today?'
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftTone, setDraftTone] = useState<'professional' | 'urgent' | 'friendly' | 'brief'>('professional');
  const [draftInstruction, setDraftInstruction] = useState('');

  const [summaryInput, setSummaryInput] = useState('');
  const [summaryOutput, setSummaryOutput] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useConfig();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("API Key not configured");
      }

      let systemContext = "You are a professional maritime chartering assistant. ";
      const hasCargo = !!context?.cargo;
      const hasVessel = !!context?.vessel;
      const lastFocused = context?.lastFocused;

      if (hasCargo && hasVessel) {
        systemContext += `The user is balancing two datasets. The PRIMARY focus is currently the ${lastFocused?.toUpperCase() || 'DATASET'}. `;
        systemContext += `CARGO Context: ${JSON.stringify(context.cargo)}. `;
        systemContext += `VESSEL Context: ${JSON.stringify(context.vessel)}. `;
        systemContext += "Help the user find synergies, calculate matches, or answer questions about either. ";
      } else if (hasCargo) {
        systemContext += `The user is currently focused on a specific CARGO: ${JSON.stringify(context.cargo)}. `;
      } else if (hasVessel) {
        systemContext += `The user is currently focused on a specific VESSEL: ${JSON.stringify(context.vessel)}. `;
      }

      systemContext += "Answer the user's question based on this specific maritime context and your deep shipping knowledge. Keep it professional and concise.";

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "gemini-1.5-flash",
          systemInstruction: systemContext,
          history: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          message: input
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to communicate with AI");
      }

      const result = await response.json();
      const responseText = result.text;
      
      const assistantMessage: Message = {
        role: 'assistant',
        content: responseText
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("AI Error:", error);
      const assistantMessage: Message = {
        role: 'assistant',
        content: `I'm having trouble connecting to my knowledge base right now. (Error: ${error.message}). However, I can see you are looking at ${context?.cargo ? 'Cargo: ' + context.cargo.commodity : (context?.vessel ? 'Vessel: ' + context.vessel.name : 'your dashboard')}.`
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSummarize = async () => {
    if (!summaryInput.trim()) return;
    setIsSummarizing(true);
    try {
      const prompt = `Summarize concisely: extract key insights/action items. Use bullets.\nText:\n${summaryInput}`;

      const response = await fetch('/api/ai/generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "gemini-1.5-flash",
          contents: prompt
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to communicate with AI");
      }

      const result = await response.json();
      setSummaryOutput(result.text);
    } catch (error: any) {
      console.error("Summarize Error:", error);
      setSummaryOutput(`Failed to summarize: ${error.message}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!context?.cargo && !context?.vessel) return;
    setIsDrafting(true);
    try {
      let prompt = `Draft ${draftTone} maritime email reply (~150 words).`;
      if (context.cargo) prompt += ` C:${JSON.stringify(context.cargo)}`;
      if (context.vessel) prompt += ` V:${JSON.stringify(context.vessel)}`;
      if (draftInstruction) prompt += ` Instr:${draftInstruction}`;
      
      const response = await fetch('/api/ai/generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "gemini-1.5-flash",
          contents: prompt
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to communicate with AI");
      }

      const result = await response.json();
      setDraftContent(result.text);
    } catch (error: any) {
      console.error("Draft Error:", error);
      setDraftContent(`Failed to generate draft: ${error.message}`);
    } finally {
      setIsDrafting(false);
    }
  };

  const tabs: { id: Tab; icon: any; label: string }[] = [
    { id: 'chat', icon: MessageSquare, label: 'Chat' },
    { id: 'summarize', icon: FileText, label: 'Summarize' },
    { id: 'match', icon: GitCompare, label: 'Match' },
    { id: 'draft', icon: PenTool, label: 'Draft' },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-surface relative overflow-hidden">
      <div className="absolute inset-0 bg-surface-container-lowest opacity-90 backdrop-blur-3xl z-[-1]"></div>

      {/* Header */}
      <div className="h-14 border-b border-outline/20 bg-transparent flex items-center justify-between px-6 shrink-0 relative">
        <div className="absolute inset-0 bg-surface-container-low opacity-50 backdrop-blur-3xl z-[-1]"></div>
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-primary stroke-[1.5]" />
          <span className="text-[10px] font-medium text-on-surface uppercase tracking-[0.3em]">{t('ai_assistant')}</span>
        </div>
        <button className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-low">
          <X className="h-4 w-4 stroke-1.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-outline/20 bg-transparent shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-4 text-[9px] font-medium uppercase tracking-[0.2em] transition-all relative",
              activeTab === tab.id ? "text-primary" : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-lowest/50"
            )}
          >
            <tab.icon className="h-4 w-4 stroke-1.5" />
            <span className="hidden sm:inline">{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTabAi"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary shadow-[0_0_8px_var(--color-primary)]"
              />
            )}
          </button>
        ))}
      </div>

      {/* Main Content Areas */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        <AnimatePresence mode="wait">
          {activeTab === 'chat' ? (
            <motion.div 
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6 custom-scrollbar"
              ref={scrollRef}
            >
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-3 max-w-[85%]", msg.role === 'user' ? "ml-auto flex-row-reverse" : "")}>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                    msg.role === 'assistant' ? "bg-primary/10 border-primary/20 text-primary" : "bg-surface-container-low border-outline/30 text-on-surface"
                  )}>
                    {msg.role === 'assistant' ? <Bot className="h-4 w-4 stroke-[1.5]" /> : <User className="h-4 w-4 stroke-[1.5]" />}
                  </div>
                  <div className={cn(
                    "p-4 text-[13px] leading-relaxed relative rounded-sm font-sans font-light tracking-wide shadow-sm",
                    msg.role === 'assistant' ? "bg-surface-container-lowest text-on-surface border border-outline/20" : "bg-primary/90 text-on-primary font-medium border border-primary"
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {context && (context.cargo || context.vessel) && messages.length > 0 && (
                <div className="flex flex-col items-center gap-2 my-4">
                  <div className="flex items-center gap-2">
                    {context.cargo && (
                      <div className={cn(
                        "px-3 py-1.5 flex items-center gap-2 rounded-full border transition-all duration-300",
                        context.lastFocused === 'cargo' 
                          ? "bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(var(--color-primary),0.2)]" 
                          : "bg-surface-container border-outline/20 opacity-60"
                      )}>
                        <Package2 className={cn("h-3 w-3", context.lastFocused === 'cargo' ? "text-primary" : "text-on-surface-variant")} />
                        <span className={cn("text-[8px] uppercase font-bold tracking-widest", context.lastFocused === 'cargo' ? "text-primary" : "text-on-surface-variant")}>
                          {context.cargo.commodity}
                        </span>
                      </div>
                    )}
                    {context.vessel && (
                      <div className={cn(
                        "px-3 py-1.5 flex items-center gap-2 rounded-full border transition-all duration-300",
                        context.lastFocused === 'vessel' 
                          ? "bg-secondary/10 border-secondary/30 shadow-[0_0_15px_rgba(var(--color-secondary),0.2)]" 
                          : "bg-surface-container border-outline/20 opacity-60"
                      )}>
                        <Ship className={cn("h-3 w-3", context.lastFocused === 'vessel' ? "text-secondary" : "text-on-surface-variant")} />
                        <span className={cn("text-[8px] uppercase font-bold tracking-widest", context.lastFocused === 'vessel' ? "text-secondary" : "text-on-surface-variant")}>
                          {context.vessel.name}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
                    <span className="text-[7px] text-on-surface-variant/60 uppercase tracking-[0.4em]">Live Context Link Active</span>
                  </div>
                </div>
              )}

              {isTyping && (
                <div className="flex gap-3 max-w-[85%]">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 text-primary flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(var(--color-primary),0.2)]">
                    <Loader2 className="h-4 w-4 animate-spin stroke-[1.5]" />
                  </div>
                  <div className="p-4 bg-surface-container-lowest text-on-surface-variant border border-outline/20 text-[12px] font-sans font-light rounded-sm shadow-sm">
                    <span className="animate-pulse">Analyzing maritime data...ingesting market reports...</span>
                  </div>
                </div>
              )}
            </motion.div>
          ) : activeTab === 'summarize' ? (
            <motion.div 
              key="summarize"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar space-y-6"
            >
              <div className="bg-surface-container-lowest/50 border border-outline/20 p-6 space-y-4 rounded-sm shadow-sm backdrop-blur-sm">
                <h3 className="text-on-surface text-[10px] font-medium uppercase tracking-[0.3em] flex items-center gap-3">
                  <FileText className="h-4 w-4 text-primary stroke-1.5" />
                  Text to Summarize
                </h3>
                <textarea
                  value={summaryInput}
                  onChange={(e) => setSummaryInput(e.target.value)}
                  placeholder="Paste email body, market report, or any text here..."
                  className="w-full bg-surface-container-low border border-outline/30 text-on-surface p-4 text-[13px] font-sans font-light tracking-wide leading-loose focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-[140px] resize-y rounded-sm placeholder:text-on-surface-variant/40 shadow-inner"
                />
                <button
                  onClick={handleSummarize}
                  disabled={isSummarizing || !summaryInput.trim()}
                  className="w-full py-4 bg-primary text-on-primary font-bold uppercase text-[10px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-primary-container transition-all shadow-md rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSummarizing ? <Loader2 className="h-4 w-4 animate-spin stroke-2" /> : <Sparkles className="h-4 w-4 stroke-2" />}
                  Generate Summary
                </button>
              </div>

              {summaryOutput && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-primary/5 p-6 border border-primary/20 space-y-4 rounded-sm shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-primary/20 pb-3">
                    <p className="text-[9px] text-primary font-medium uppercase tracking-[0.3em]">Key Insights</p>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(summaryOutput);
                        alert('Summary copied to clipboard');
                      }}
                      className="text-[9px] text-on-surface-variant hover:text-primary font-medium uppercase tracking-widest transition-colors flex items-center gap-1"
                    >
                      <span>Copy</span>
                    </button>
                  </div>
                  <div className="text-on-surface text-[13px] leading-relaxed font-sans font-light tracking-wide whitespace-pre-wrap">
                    {summaryOutput}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : activeTab === 'draft' ? (
            <motion.div 
              key="draft"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar"
            >
              <div className="space-y-6">
                <div className="bg-surface-container-lowest/50 border border-outline/20 p-6 rounded-sm shadow-sm backdrop-blur-sm">
                  <h3 className="text-on-surface text-[10px] font-medium uppercase tracking-[0.3em] mb-5 flex items-center gap-3">
                    <PenTool className="h-4 w-4 text-primary stroke-1.5" />
                    Draft Configuration
                  </h3>
                  
                  <div className="space-y-5">
                    <div>
                      <p className="text-[9px] text-on-surface-variant font-medium uppercase tracking-[0.2em] mb-3">Tone Selection</p>
                      <div className="flex gap-2">
                        {(['professional', 'urgent', 'friendly', 'brief'] as const).map(tone => (
                          <button
                            key={tone}
                            onClick={() => setDraftTone(tone)}
                            className={cn(
                              "flex-1 py-2 text-[9px] font-bold uppercase tracking-widest border transition-all rounded-sm",
                              draftTone === tone 
                                ? "bg-primary/20 text-primary border-primary/50 shadow-[inset_0_0_10px_rgba(var(--color-primary),0.1)]" 
                                : "bg-surface-container-low border-outline/30 text-on-surface-variant hover:border-primary/40 hover:text-on-surface"
                            )}
                          >
                            {tone}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-[9px] text-on-surface-variant font-medium uppercase tracking-[0.2em] mb-3">Specific Focus (Optional)</p>
                      <input 
                        type="text"
                        value={draftInstruction}
                        onChange={(e) => setDraftInstruction(e.target.value)}
                        placeholder="e.g. emphasize the laycan, ask about stowage..."
                        className="w-full bg-surface-container-low border border-outline/30 text-on-surface px-4 py-3 text-[13px] font-sans font-light tracking-wide focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all rounded-sm placeholder:text-on-surface-variant/40 shadow-inner"
                      />
                    </div>

                    <button
                      onClick={handleGenerateDraft}
                      disabled={isDrafting || (!context?.cargo && !context?.vessel)}
                      className="w-full bg-primary text-on-primary py-4 text-[10px] font-bold uppercase tracking-[0.2em] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary-container transition-all flex items-center justify-center gap-3 rounded-sm shadow-md"
                    >
                      {isDrafting ? <Loader2 className="h-4 w-4 animate-spin stroke-2" /> : <Sparkles className="h-4 w-4 stroke-2" />}
                      Generate Smart Draft
                    </button>
                  </div>
                </div>

                {draftContent && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-primary/5 p-6 border border-primary/20 space-y-4 rounded-sm shadow-sm"
                  >
                    <div className="flex items-center justify-between border-b border-primary/20 pb-3">
                      <p className="text-[9px] text-primary font-medium uppercase tracking-[0.3em]">Generated Response</p>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(draftContent);
                          alert('Draft copied to clipboard');
                        }}
                        className="text-[9px] text-on-surface-variant hover:text-primary font-medium uppercase tracking-widest transition-colors flex items-center gap-1"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="text-on-surface text-[13px] leading-relaxed font-sans font-light tracking-wide whitespace-pre-wrap">
                      {draftContent}
                    </div>
                  </motion.div>
                )}

                {!context?.cargo && !context?.vessel && (
                  <div className="p-5 border border-error/20 bg-error/5 text-error mt-4 text-[9px] uppercase tracking-widest text-center rounded-sm">
                    No active CARGO or VESSEL context detected. Select a record to enable drafting.
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="other"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex-1 flex items-center justify-center p-8 text-center"
            >
              <div className="max-w-md space-y-6">
                <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mx-auto border border-primary/20 shadow-[0_0_30px_rgba(var(--color-primary),0.1)]">
                  <Sparkles className="h-8 w-8 text-primary animate-pulse stroke-1" />
                </div>
                <h3 className="text-on-surface font-medium uppercase tracking-[0.3em] text-sm font-display">Autonomous Module</h3>
                <p className="text-on-surface-variant font-sans tracking-wide text-sm leading-loose">
                  The {activeTab} function is currently running in background monitoring mode. It automatically processes inbound data and stores insights in your session context.
                </p>
                <div className="pt-6 flex justify-center items-center gap-3">
                   <div className="h-2 w-2 rounded-full bg-primary/80 animate-ping" />
                   <span className="text-[9px] font-medium text-primary uppercase tracking-[0.2em]">Active Processing</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="p-4 sm:p-6 border-t border-outline/20 bg-surface-container-lowest/50 backdrop-blur-md">
          <div className="relative group">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about cargos, vessels, matches..."
              className="w-full bg-surface-container-low border border-outline/30 text-on-surface py-4 px-6 pr-14 text-[13px] font-sans font-light tracking-wide focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all rounded-full placeholder:text-on-surface-variant/40 shadow-inner"
            />
            <button 
              onClick={handleSend}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-primary/10 text-primary hover:bg-primary hover:text-on-primary transition-all rounded-full shadow-sm"
            >
              <Send className="h-4 w-4 stroke-[1.5]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
