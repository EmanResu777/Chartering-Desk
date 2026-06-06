import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare,
  Bot,
  X,
  Send,
  Smile,
  Frown,
  Sparkles,
  Loader2,
  User,
} from "lucide-react";
import { cn } from "../lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export const FeedbackWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [activeTab, setActiveTab] = useState<"feedback" | "support">("feedback");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerActivity = () => {
    setIsActive(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsActive(false);
    }, 4000);
  };

  useEffect(() => {
    triggerActivity();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isOpen]);

  // Feedback state
  const [feedbackType, setFeedbackType] = useState<
    "positive" | "negative" | null
  >(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // Chat state
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Здравствуйте! Я ИИ-ассистент платформы. Если у вас возникли вопросы по приложению, вы нашли баг или не знаете как работает та или иная функция — просто напишите мне об этом!",
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === "support" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, activeTab]);

  const handleFeedbackSubmit = () => {
    if (!feedbackText.trim() && !feedbackType) return;
    // In a real app, send to backend. Here we just show success.
    console.log("Feedback submitted:", {
      type: feedbackType,
      text: feedbackText,
    });
    setFeedbackSubmitted(true);
    setTimeout(() => {
      setIsOpen(false);
      setTimeout(() => {
        setFeedbackSubmitted(false);
        setFeedbackText("");
        setFeedbackType(null);
      }, 300);
    }, 2000);
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    try {
      const systemInstruction = "Support AI for 'Chartering Desk Pro'. Reply in Russian. Be polite, concise, technical.";

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: "gemini-1.5-flash",
          systemInstruction,
          history: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
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

      const assistantMessage: Message = {
        role: "assistant",
        content: result.text,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error("AI Error:", error);
      const assistantMessage: Message = {
        role: "assistant",
        content: `К сожалению, я не могу подключиться к своей базе знаний. Ошибка: ${error.message}. Пожалуйста, попробуйте позже.`,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div
      className="fixed bottom-24 right-0 md:bottom-10 z-[100] flex flex-col items-end gap-4 pointer-events-none"
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-80 md:w-96 bg-surface-container-high border border-outline/30 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col h-[500px] max-h-[80vh] pointer-events-auto mr-4 md:mr-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-outline/20 bg-surface">
              <div className="flex gap-2 bg-surface-container-low p-1 rounded-lg relative z-10">
                <button
                  onClick={() => setActiveTab("feedback")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                    activeTab === "feedback"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Отзыв
                </button>
                <button
                  onClick={() => setActiveTab("support")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                    activeTab === "support"
                      ? "bg-primary text-on-primary shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface",
                  )}
                >
                  <Bot className="w-3.5 h-3.5" />
                  Поддержка
                </button>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors"
                title="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>


            {/* Content body */}
            <div className="flex-1 overflow-hidden flex flex-col bg-surface relative">
              <AnimatePresence mode="wait">
                {activeTab === "feedback" ? (
                  <motion.div
                    key="feedback"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 flex flex-col p-5 overflow-y-auto"
                  >
                    {feedbackSubmitted ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                          <Sparkles className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="text-lg font-medium text-on-surface">
                          Спасибо!
                        </h3>
                        <p className="text-sm text-on-surface-variant">
                          Ваш отзыв помогает нам улучшать платформу.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <h3 className="text-sm font-medium text-on-surface">
                            Как вам наше приложение?
                          </h3>
                          <div className="flex gap-3">
                            <button
                              onClick={() => setFeedbackType("positive")}
                              className={cn(
                                "flex-1 p-3 rounded-lg border transition-all flex flex-col items-center gap-2",
                                feedbackType === "positive"
                                  ? "bg-primary/10 border-primary text-primary"
                                  : "bg-surface-container-lowest border-outline/30 text-on-surface-variant hover:border-outline hover:text-on-surface",
                              )}
                            >
                              <Smile className="w-6 h-6" />
                              <span className="text-xs font-medium">
                                Отлично
                              </span>
                            </button>
                            <button
                              onClick={() => setFeedbackType("negative")}
                              className={cn(
                                "flex-1 p-3 rounded-lg border transition-all flex flex-col items-center gap-2",
                                feedbackType === "negative"
                                  ? "bg-error/10 border-error text-error"
                                  : "bg-surface-container-lowest border-outline/30 text-on-surface-variant hover:border-outline hover:text-on-surface",
                              )}
                            >
                              <Frown className="w-6 h-6" />
                              <span className="text-xs font-medium">
                                Есть проблемы
                              </span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 flex-1 flex flex-col">
                          <h3 className="text-sm font-medium text-on-surface">
                            Детали
                          </h3>
                          <textarea
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            placeholder="Что вам нравится? А что можно улучшить или исправить?"
                            className="w-full flex-1 min-h-[120px] resize-none bg-surface-container-lowest border border-outline/30 rounded-lg p-3 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-on-surface-variant/50"
                          />
                        </div>

                        <button
                          onClick={handleFeedbackSubmit}
                          disabled={!feedbackType && !feedbackText.trim()}
                          className="w-full py-2.5 bg-primary text-on-primary font-medium text-sm rounded-lg hover:bg-primary-container transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                          Отправить отзыв
                        </button>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="support"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 flex flex-col overflow-hidden"
                  >
                    <div
                      ref={scrollRef}
                      className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
                    >
                      {messages.map((msg, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex gap-3 max-w-[85%]",
                            msg.role === "user"
                              ? "ml-auto flex-row-reverse"
                              : "",
                          )}
                        >
                          <div
                            className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border",
                              msg.role === "assistant"
                                ? "bg-primary/10 border-primary/20 text-primary"
                                : "bg-surface-container-low border-outline/30 text-on-surface",
                            )}
                          >
                            {msg.role === "assistant" ? (
                              <Bot className="h-4 w-4 stroke-[1.5]" />
                            ) : (
                              <User className="h-4 w-4 stroke-[1.5]" />
                            )}
                          </div>
                          <div
                            className={cn(
                              "p-3 text-xs leading-relaxed relative rounded-lg",
                              msg.role === "assistant"
                                ? "bg-surface-container-lowest text-on-surface border border-outline/20"
                                : "bg-primary/90 text-on-primary",
                            )}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))}
                      {isTyping && (
                        <div className="flex gap-3 max-w-[85%]">
                          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/30 text-primary flex items-center justify-center shrink-0">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                          <div className="p-3 bg-surface-container-lowest text-on-surface border border-outline/20 text-xs rounded-lg">
                            <span className="animate-pulse">Анализирую...</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Chat Input */}
                    <div className="p-3 border-t border-outline/20 bg-surface">
                      <div className="relative">
                        <input
                          type="text"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSend()}
                          placeholder="Опишите вашу проблему..."
                          className="w-full bg-surface-container-lowest border border-outline/30 text-on-surface py-2.5 pl-4 pr-10 text-sm focus:outline-none focus:border-primary rounded-lg"
                        />
                        <button
                          onClick={handleSend}
                          disabled={!input.trim()}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-primary disabled:opacity-50 hover:bg-primary/10 rounded-md transition-colors"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        className="relative flex flex-col items-center gap-2 pointer-events-auto cursor-pointer"
        onPointerMove={triggerActivity}
        onPointerDown={triggerActivity}
        onClick={() => {
           if (!isOpen && !isActive) {
               triggerActivity();
           } else if (!isOpen) {
               triggerActivity();
               setIsOpen(true);
           }
        }}
        animate={{
          x: (!isOpen && !isActive) ? "calc(100% - 10px)" : "-16px"
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isOpen && !isActive) {
               triggerActivity();
            } else {
               triggerActivity();
               setIsOpen(!isOpen);
            }
          }}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all relative border",
            isOpen
              ? "bg-surface-container border-outline/30 text-on-surface-variant hover:text-on-surface"
              : "bg-primary border-primary text-on-primary hover:bg-primary/90",
          )}
        >
          {isOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <MessageSquare className="w-6 h-6" />
          )}
        </button>
        
        {!isOpen && (
          <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-error border-2 border-surface rounded-full z-10 animate-pulse pointer-events-none"></div>
        )}
      </motion.div>
    </div>
  );
};
