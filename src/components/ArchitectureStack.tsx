import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Info, X } from 'lucide-react';

export const ArchitectureStack: React.FC = () => {
  const [selectedLayer, setSelectedLayer] = useState<number | null>(null);

  const layers = [
    { name: 'Фронтенд', color: 'bg-[#F2A900]', textColor: 'text-on-surface', desc: 'React 18, TypeScript, Tailwind CSS, и Vite. Адаптивный UI и быстрая перерисовка.' },
    { name: 'API и бэкенд-логика', color: 'bg-[#0073CF]', textColor: 'text-on-surface', desc: 'Node.js и Express.js. REST API, интеграция с Gemini LLM и обработка бизнес-логики.' },
    { name: 'База данных и хранение', color: 'bg-[#2E8B57]', textColor: 'text-on-surface', desc: 'Firebase Firestore для persistent данных и локальный кэш (состояние React).' },
    { name: 'Аутентификация и права', color: 'bg-[#556B2F]', textColor: 'text-on-surface', desc: 'Надежная аутентификация через токены и проверка прав доступа на уровне ролей.' },
    { name: 'Хостинг и деплой', color: 'bg-[#404040]', textColor: 'text-on-surface', desc: 'Google Cloud Run (Serverless). Автоматическое развертывание контейнеров.' },
    { name: 'Облачные сервисы', color: 'bg-[#808080]', textColor: 'text-on-surface', subtitle: 'и вычисления', desc: 'Бэкенд в облаке Google (GCP). Интеграция с Google Workspace и внешними API.' },
    { name: 'CI/CD и контроль версий', color: 'bg-[#FF8C00]', textColor: 'text-on-surface', desc: 'Непрерывная интеграция, автоматизированные сборки (npm run build) в AI Studio.' },
    { name: 'Безопасность и RLS', color: 'bg-[#D35400]', textColor: 'text-on-surface', desc: 'Row Level Security. Правила безопасности Firestore, защита API и изоляция контейнеров.' },
    { name: 'Ограничение частоты', color: 'bg-[#C0392B]', textColor: 'text-on-surface', subtitle: 'запросов', desc: 'Rate limiting на уровне ingress-шлюза для предотвращения DDoS и перегрузок API.' },
    { name: 'Кэширование и CDN', color: 'bg-[#8E44AD]', textColor: 'text-on-surface', desc: 'Использование GCP CDN для раздачи статических ассетов (изображения, стили, бандлы JS).' },
    { name: 'Балансировка нагрузки', color: 'bg-[#900C3F]', textColor: 'text-on-surface', subtitle: 'и масштабирование', desc: 'Авто-масштабирование (Autoscaling) Cloud Run под нагрузку от 0 до сотен экземпляров.' },
    { name: 'Отслеживание ошибок', color: 'bg-[#C0392B]', textColor: 'text-on-surface', subtitle: 'и логирование', desc: 'Сбор логов в Cloud Logging, перехват фронтенд-ошибок через Error Boundaries.' },
    { name: 'Доступность и восстановление', color: 'bg-[#2980B9]', textColor: 'text-on-surface', desc: 'Мультизональное распределение. Отказоустойчивость и автоматический перезапуск при сбоях.' }
  ];

  return (
    <div className="flex flex-col h-full bg-surface-container-highest relative overflow-hidden">
      <div className="flex items-center justify-between px-8 py-5 border-b border-outline/30 bg-surface-container-lowest shrink-0 z-10">
        <div>
          <h1 className="text-xl font-display font-light text-on-surface tracking-wide uppercase">Архитектура платформы</h1>
          <p className="text-xs text-on-surface-variant font-mono mt-1">ОБЗОР СИСТЕМНЫХ УРОВНЕЙ</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar flex flex-col md:flex-row gap-8 pb-20 justify-center">
        
        {/* Stack View */}
        <div className="flex flex-col items-center w-full max-w-sm gap-0 relative perspective-[1000px] mt-4 flex-shrink-0">
          {layers.map((layer, index) => {
            const isSelected = selectedLayer === index;
            return (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  scale: isSelected ? 1.05 : 1,
                  x: isSelected ? -10 : 0
                }}
                transition={{ delay: index * 0.05, type: 'spring', damping: 15 }}
                key={index}
                onClick={() => setSelectedLayer(index)}
                className={cn(
                  "w-full h-[60px] md:h-[65px] rounded-[50%] flex flex-col items-center justify-center font-sans font-bold text-lg mb-[-20px] md:mb-[-22px] relative cursor-pointer hover:brightness-110 transition-all",
                  layer.color, layer.textColor
                )}
                style={{
                  zIndex: 100 - index,
                  boxShadow: isSelected 
                    ? `0 0 20px rgba(255,255,255,0.4), inset 0 10px 15px rgba(255,255,255,0.3), inset 0 -10px 15px rgba(0,0,0,0.5), 0 15px 25px rgba(0,0,0,0.8)`
                    : `inset 0 10px 15px rgba(255,255,255,0.2), inset 0 -10px 15px rgba(0,0,0,0.4), 0 5px 10px rgba(0,0,0,0.5)`,
                  borderBottom: '8px solid rgba(0,0,0,0.3)',
                  borderTop: isSelected ? '2px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.2)',
                }}
              >
                <div className="flex flex-col items-center justify-center h-full drop-shadow-md select-none" style={{ transform: 'translateY(-2px)' }}>
                  <span className="text-[14px] md:text-[15px] tracking-wide text-center leading-tight px-4">{layer.name}</span>
                  {layer.subtitle && <span className="text-[11px] md:text-[12px] font-medium leading-tight opacity-90">{layer.subtitle}</span>}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Info Panel View */}
        <div className="w-full md:max-w-md flex flex-col mt-4 md:mt-20">
          <AnimatePresence>
            {selectedLayer !== null ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-surface-container border border-outline/30 rounded-sm p-6 relative overflow-hidden"
              >
                <div className={cn("absolute top-0 left-0 w-1.5 h-full", layers[selectedLayer].color)}></div>
                <button 
                  onClick={() => setSelectedLayer(null)}
                  className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shadow-lg", layers[selectedLayer].color)}>
                    <Info className="w-5 h-5 text-on-surface" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-sans text-on-surface leading-tight">
                      {layers[selectedLayer].name}
                    </h3>
                    {layers[selectedLayer].subtitle && (
                      <p className="text-sm font-medium text-on-surface-variant leading-tight">
                        {layers[selectedLayer].subtitle}
                      </p>
                    )}
                  </div>
                </div>
                <div className="bg-surface-dim p-4 rounded-sm border border-outline/10">
                  <p className="text-sm text-on-surface leading-relaxed font-sans">
                    {layers[selectedLayer].desc}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex items-center justify-center border border-dashed border-outline/30 rounded-sm p-8 text-center"
              >
                <p className="text-sm text-on-surface-variant font-mono tracking-widest uppercase">
                  Выберите слой для<br/>подробной информации
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
      </div>
    </div>
  );
};
