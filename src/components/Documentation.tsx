import React from 'react';
import { BookOpen, FileText, Settings, Key, Mail, Ship, Box, Search, BarChart3, Bot, Zap, Plug } from 'lucide-react';
import { cn } from '../lib/utils';
import { useConfig } from '../lib/ConfigContext';

export const Documentation: React.FC = () => {
  const { t } = useConfig();

  const sections = [
    {
      id: 'overview',
      title: 'Обзор Платформы',
      icon: BookOpen,
      content: `Chartering Desk Pro — это ИИ-платформа для морского фрахтования, созданная для оптимизации рабочих процессов фрахтовых брокеров, судовладельцев и операторов. Она интегрирует в реальном времени отслеживание судов (AIS), продвинутый парсинг электронных писем, интеллектуальный подбор груза к судну и обширную базу рыночных контактов.

Платформа разделена на несколько взаимосвязанных модулей:
1. **Cargo Desk (Грузы)**: Управление и фильтрация доступных грузов.
2. **Vessel Monitor (Мониторинг Судов)**: Отслеживание доступности судов, позиций и характеристик на карте.
3. **Selection Desk (Блок Подбора)**: ИИ-сопоставление между открытыми грузами и судами.
4. **Inbox Parser (Парсер Почты)**: Автоматическое извлечение структурированных данных из сырых текстовых писем брокеров и веб-хуков.
5. **Contact List (Контакты)**: База компаний и контактных лиц, разделенных по вашим рабочим пространствам.
6. **Analytics (Аналитика)**: Обзор рынка, графики тенденций и статистика в реальном времени.
7. **Document Generator (Генератор Документов)**: Автоматизированное создание фикс-рекапов (Recap) и чартер-партий (Gencon).
8. **AI Assistant (ИИ Помощник)**: Интерактивный чат с возможностью запросов к вашей базе данных на естественном языке, использующий Gemini 2.5 Flash.`,
    },
    {
      id: 'inbox',
      title: 'Парсер Почты и ИИ-извлечение (Inbox Parser)',
      icon: Mail,
      content: `Парсер Почты выступает в роли вашего умного ассистента. Он автоматически читает неструктурированные письма от брокеров или владельцев и преобразует их в структурированные данные (добавляет новые Грузы или Суда).

**Как это работает**:
- **Новое: Интеграция с Webhook**: Система может автоматически принимать сообщения от внешних систем через защищенный API (эндпоинт \`/api/webhooks\`).
- ИИ категоризирует сообщение как "Позиция Судна" (Vessel Position), "Ордер на Груз" (Cargo Order) или "Рыночный Отчет" (Market Report).
- Извлеченные детали (такие как даты лейкана, DWT, требования к кранам, регионы посадки) представляются в виде карточки.
- Нажмите "Extract AI Entity", чтобы просмотреть структурированный вывод и сохранить информацию напрямую в базу платформы. При сохранении данные автоматически становятся доступны всем участникам вашего Workspace.`,
    },
    {
      id: 'document-generator',
      title: 'Генератор Документов (Document Editor)',
      icon: FileText,
      content: `Новый модуль для автоматизированного создания юридических документов напрямую из данных платформы:
- **Генерация Recap / Gencon**: Внутри карточки Груза (Cargo) при успешном сопоставлении с судном (Match) вы можете сгенерировать Recap или Gencon 94 чартер-партию.
- **Подстановка Переменных**: Система подставляет данные о судне, грузе, фрахтовой ставке и контактных данных напрямую в шаблон (переменные типа \`[Vessel Name]\`, \`[LAYCAN_START]\`, \`[FREIGHT_RATE]\`).
- **Кастомные Шаблоны**: Вы можете загрузить свой собственный \`.txt\` шаблон, и система запомнит его для будущих генераций.
- **Библиотека Стандартных Оговорок (Clauses)**: Возможность применять стандартные оговорки (например, BIMCO Piracy Clause, War Risk, AIS Clause) в один клик.
- **Экспорт**: Готовый документ можно скопировать, распечатать или экспортировать в формат \`.doc\` (Word).`
    },
    {
      id: 'cargo',
      title: 'Стол Грузов (Cargo Desk)',
      icon: Box,
      content: `Управляйте грузовыми ордерами легко и просто:
- **Фильтрация и Поиск**: Используйте панель поиска, чтобы найти грузы по названию, порту погрузки или выгрузки.
- **Сортировка**: Нажимайте на заголовки колонок в таблице (например, Quantity, Laycan) для сортировки данных.
- **Экспорт**: Используйте меню действий (...) для выгрузки выбранных грузов в формате CSV или JSON.
- **Интеграция с Desk Network**: Отправляйте информацию о грузе напрямую вашим коллегам по цеху через внутреннюю шину 'Push to Network'.
- **Панель деталей**: Кликните по любому грузу в списке, чтобы просмотреть полные спецификации, включая комментарии, время на погрузку/выгрузку (laytime), идеи по ставке (freight ideas) и связанные контакты.`
    },
    {
      id: 'vessel',
      title: 'Монитор судов и Карта AIS (Vessel Monitor)',
      icon: Ship,
      content: `Отслеживайте позиции судов в реальном времени:
- **Отображение**: Переключайтесь между табличным списком и живой картой AIS, используя кнопки-переключатели сверху.
- **AIS в Реальном Времени**: Карта подключается к API AIS Stream по WebSocket. Позиции и направление движения (heading) обновляются на карте в реальном времени без необходимости перезагрузки.
- **Ручное Добавление (Init New AIS Link)**: Кнопка создания новой карточки судна (например, для судов TBN — "To Be Nominated").
- **Сохранение Настроек**: Центр вашей карты, уровень масштаба и фильтры сохраняются автоматически, так что вам не придется каждый раз настраивать представление заново.`,
    },
    {
      id: 'workspace',
      title: 'Рабочие Пространства и База Данных',
      icon: Plug,
      content: `Платформа поддерживает многопользовательскую среду через систему Workspaces (Рабочих пространств).
- **Изоляция Данных**: Грузы, суда и контакты привязываются к Рабочему Пространству. Участники пространства видят общие данные (в реальном времени, с поддержкой Firestore listener), что позволяет брокерам работать как единая команда (Desk).
- **Роли**: Владелец (Owner), Редактор (Writer) и Зритель (Viewer). Права на запись/удаление строго контролируются Firestore Rules.
- **Перезагрузка / Моковые Данные**: При использовании приложения без входа или без настроенного Firebase, оно работает в режиме \`Mock Data\`.`
    },
    {
      id: 'selection',
      title: 'Стол Подбора (Selection Desk)',
      icon: Zap,
      content: `Сердце фрахтового процесса платформы:
- Оцените лучшее судно для конкретного груза (или наоборот).
- **ИИ-оценка совместимости**: Система предлагает балл совместимости (из 100), основываясь на датах, дедвейте, регионах погрузки/выгрузки и ограничениях инфраструктуры портов (осадка, наличие кранов и т.д.).
- Нажмите "Push to Network", чтобы сымитировать отправку оффера (предложения) на рынок.`,
    },
    {
      id: 'analytics',
      title: 'Аналитика и Live Feed (Analytics)',
      icon: BarChart3,
      content: `Максимальный тариф дает доступ к Обзору рынка:
- Live Dashboard с агрегированной статистикой по количеству актуальных (OPEN) и зафиксированных (FIXED) грузов/судов.
- Автоматический подсчет активных рабочих пространств (Workspaces) в экосистеме.
- Графики тенденций (Supply vs Demand) и индексы ставок.`
    },
    {
      id: 'ai-assistant',
      title: 'ИИ Помощник (AI Assistant)',
      icon: Bot,
      content: `Умный чат-бот, глубоко интегрированный в вашу базу:
- Вы можете задавать сложные запросы: "Покажи все суда Супрамакс (Supramax), доступные в Средиземном море (Mediterranean)" или "Какие грузы подходят для судна MV Bulk Explorer?".
- ИИ сам интерпретирует запрос, обращается к данным и возвращает нужные карточки грузов или судов.
- Поиск работает на базе топовой модели **Google Gemini 2.5 Flash** для генерации текстовых ответов и создания драфтов ответов (Refine & Draft).`,
    },
    {
      id: 'apikeys',
      title: 'Настройка API и Ключи',
      icon: Key,
      content: `Чтобы платформа полностью функционировала на "боевом" уровне, требуется настроить ключи API. Для безопасности, они должны быть прописаны в переменных вашего окружения (в файле \`.env\` для локальной разработки или в менеджере секретов хостинга).

**1. Gemini API Key (ИИ от Google)**
- **Назначение**: Обеспечивает работу AI Ассистента, Парсера Почты, Поддержки в виджете обратной связи и Движка Подбора.
- **Где получить**: [Google AI Studio](https://aistudio.google.com/app/apikey)
- **Переменная**: \`GEMINI_API_KEY\`

**2. AIS Stream API**
- **Назначение**: Предоставляет WebSocket-данные для живого мониторинга позиций судов на карте.
- **Где получить**: [AISStream.io](https://aisstream.io/)
- **Переменная**: \`VITE_AISSTREAM_API_KEY\`

**3. Firebase Configuration**
- **Назначение**: Обеспечивает работу базы данных (Firestore), авторизацию и хранение Workspaces.
- **Файл**: \`firebase-applet-config.json\``
    },
    {
      id: 'settings',
      title: 'Настройки и Оформление (Settings)',
      icon: Settings,
      content: `Настройте рабочее пространство под себя:
- **Язык**: Переключение интерфейсов (Английский / Русский).
- **Тема**: Оптимизированный темный режим с высоким контрастом ("Maritime Dark"), специально разработанный для снижения нагрузки на глаза у специалистов.
- **Биллинг (Pricing)** : Управление статусом подписки для получения доступа к премиум-фичам, таким как Подбор грузов (Selection) и живой AIS мониторинг.
- **Поддержка**: Воспользуйтесь виджетом в правом нижнем углу ("AI Help") для устранения технических неполадок и отправки предложений.`,
    }
  ];

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-outline/30 bg-surface-container-lowest shrink-0">
        <div>
          <h1 className="text-xl font-display font-light text-on-surface tracking-wide uppercase">Документация</h1>
          <p className="text-xs text-on-surface-variant font-mono mt-1 uppercase tracking-wider">Руководство Пользователя & Настройка API</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-12 pb-20">
          
          <div className="p-6 bg-primary/10 border border-primary/20 rounded-lg text-primary relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[50px] -translate-y-1/2 translate-x-1/2" />
            <h2 className="text-xl font-display mb-2 relative z-10">Добро пожаловать в Chartering Desk Pro</h2>
            <p className="font-sans text-sm font-medium opacity-90 relative z-10 leading-relaxed max-w-2xl">
              Данное руководство предоставляет исчерпывающую информацию о том, как использовать все функции приложения, где настраивать ключи API и как оптимизировать ваш рабочий процесс фрахтования.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sections.map((section) => (
              <div key={section.id} className="bg-surface-container-lowest border border-outline/30 p-6 rounded-xl hover:border-outline/60 transition-colors shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary border border-outline/20">
                    <section.icon className="w-5 h-5 stroke-[1.5]" />
                  </div>
                  <h3 className="text-lg font-display text-on-surface">{section.title}</h3>
                </div>
                <div className="prose prose-sm prose-invert max-w-none text-on-surface-variant leading-relaxed">
                  {section.content.split('\n').map((paragraph, index) => {
                    if (paragraph.startsWith('- **') || paragraph.startsWith('**')) {
                       // Simple bold handling
                       const parts = paragraph.split('**');
                       return (
                         <p key={index} className="mb-2 text-sm">
                           {parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="text-on-surface">{part}</strong> : part)}
                         </p>
                       );
                    }
                    if (paragraph.startsWith('1.') || paragraph.startsWith('2.') || paragraph.startsWith('3.') || paragraph.startsWith('4.') || paragraph.startsWith('5.') || paragraph.startsWith('6.') || paragraph.startsWith('7.')) {
                        const parts = paragraph.split('**');
                       return (
                         <p key={index} className="mb-1 text-sm pl-4 relative">
                           <span className="absolute left-0 text-primary/70">{paragraph.substring(0, 2)}</span>
                           {parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="text-on-surface">{part}</strong> : (i===0? part.substring(2) : part))}
                         </p>
                       );
                    }
                    if (paragraph.startsWith('-')) {
                        const parts = paragraph.split('**');
                       return (
                         <div key={index} className="mb-1 text-sm pl-4 relative flex gap-2">
                           <span className="text-primary/70">•</span>
                           <span>{parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="text-on-surface">{part}</strong> : part.substring(i===0? 1 : 0))}</span>
                         </div>
                       );
                    }
                    if (paragraph.trim() === '') return <br key={index} />;
                    return <p key={index} className="mb-3 text-sm">{paragraph}</p>;
                  })}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
};
