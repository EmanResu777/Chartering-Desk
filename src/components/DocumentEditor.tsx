import React, { useState } from 'react';
import { FileText, Download, Copy, Check, X, Printer, Share2, Mail, Plus, UserPlus, Users, MessageSquare, Upload, Info, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useNotification } from '../lib/NotificationContext';
import { db, auth } from '../lib/firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface DocumentEditorProps {
  type: 'RECAP' | 'GENCON';
  data: any;
  templates?: { recap: string, gencon: string };
  onClose: () => void;
}

const NETWORK_CONTACTS = [
  { id: '#DSK-8821', name: 'Marina Petrova', role: 'Chartering', online: true },
  { id: '#DSK-4490', name: 'James Wilson', role: 'Shipowner', online: true },
  { id: '#DSK-3112', name: 'Helga Schmidt', role: 'Broker', online: false },
  { id: '#DSK-9901', name: 'David Lee', role: 'Operations', online: true },
  { id: '#DSK-1225', name: 'Sofia Rossi', role: 'Owner Rep', online: true },
];

export const DocumentEditor: React.FC<DocumentEditorProps> = ({ type, data, templates, onClose }) => {
  const { notify } = useNotification();
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(data.draftId || null);
  const [selectedClauses, setSelectedClauses] = useState<string[]>(() => {
    if (data.clauses) return data.clauses;
    try {
      const stored = localStorage.getItem('documentClauses');
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return [];
  });

  React.useEffect(() => {
    localStorage.setItem('documentClauses', JSON.stringify(selectedClauses));
  }, [selectedClauses]);
  const [showNetworkShare, setShowNetworkShare] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

  const VARIABLES_LIST = [
    '[CHARTERER_NAME]', '[Vessel Name]', '[CARGO_DESCRIPTION]', '[CARGO_QUANTITY]', 
    '[Load Port]', '[DISCHARGE_PORT]', '[LAYCAN_START]', '[LAYCAN_END]', 
    '[FREIGHT_RATE]', '[ARBITRATION_TERMS]', '[OWNER_NAME]', '[OWNER_ADDRESS]', 
    '[BROKER_COMPANY]', '[BROKER_NAME]', '[BROKER_ADDRESS]', '[BROKER_CONTACT]', 
    '[CURRENT_DATE]', '[VESSEL_IMO]', '[VESSEL_FLAG]', '[VESSEL_DWT]', 
    '[VESSEL_POSITION]', '[BROKER_COMMISSION]'
  ];

  const clausesList = [
    { id: 'Piracy', label: 'BIMCO Piracy Clause 2013' },
    { id: 'War Risk', label: 'War Risk Clause (CONWORTIME)' },
    { id: 'AIS', label: 'AIS Data Monitoring Clause' }
  ];

  const toggleClause = (id: string) => {
    setSelectedClauses(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const replacePlaceholders = (templateText: string) => {
    let brokerData = data.broker;
    if (!brokerData) {
      try {
        const stored = localStorage.getItem('brokerProfile');
        if (stored) brokerData = JSON.parse(stored);
      } catch (e) {}
    }
    if (!brokerData) {
       brokerData = {};
    }

    const d = new Date();
    const isFreightMissing = !data.overrides?.freightRate && !data.cargo?.freightRate && !data.cargo?.freightLumpSum;
    let freightStr = 'TBA / Pending confirmation';
    if (!isFreightMissing) {
      if (data.overrides?.freightRate) freightStr = `$${data.overrides.freightRate} / mt`;
      else if (data.cargo?.freightRate) freightStr = `$${data.cargo.freightRate} / mt`;
      else if (data.cargo?.freightLumpSum) freightStr = `$${data.cargo.freightLumpSum} Lump Sum`;
    }

    const brokerCompany = brokerData?.showProfileInDocs && brokerData.company ? brokerData.company : '';
    const brokerName = brokerData?.showProfileInDocs && brokerData.name ? brokerData.name : '';
    const brokerFull = brokerCompany && brokerName ? `${brokerCompany} - ${brokerName}` : (brokerCompany || brokerName || 'TBA / To be confirmed');

    const replacements: Record<string, string> = {
      '[CURRENT_DATE]': d.toLocaleDateString(),
      '[RECAP_REF]': `REC-${d.getFullYear()}-${Math.floor(Math.random() * 900) + 100}`,

      '[OWNER_NAME]': data.vessel?.owner || 'TBA / To be confirmed',
      '[CHARTERER_NAME]': data.cargo?.charterer || 'TBA / To be confirmed',
      '[BROKER_COMPANY]': brokerCompany || 'TBA / To be confirmed',
      '[BROKER_NAME]': brokerName || 'TBA / To be confirmed',
      '[BROKER_FULL]': brokerFull,
      
      '[Vessel Name]': data.vessel?.name || 'TBA / To be confirmed',
      '[VESSEL_FLAG]': data.vessel?.flag || 'TBA / To be confirmed',
      '[VESSEL_IMO]': data.vessel?.imo ? String(data.vessel.imo) : 'TBA / To be confirmed',
      '[VESSEL_BUILT]': data.vessel?.builtYear ? String(data.vessel.builtYear) : 'TBA / To be confirmed',
      '[VESSEL_DWT]': data.vessel?.dwt ? String(data.vessel.dwt) : 'TBA / To be confirmed',
      '[VESSEL_CAPACITY]': 'TBA / To be confirmed',
      '[VESSEL_DRAFT]': data.vessel?.draft ? String(data.vessel.draft) : 'TBA / To be confirmed',
      '[VESSEL_LOA_BEAM]': (data.vessel?.loa || 'TBA') + ' / ' + (data.vessel?.beam || 'TBA'),
      '[VESSEL_GEAR]': data.vessel?.gear || 'TBA / To be confirmed',
      '[VESSEL_SPEED_CONS]': (data.overrides?.consumptionLaden ? `${data.overrides.consumptionLaden}mt/day (Assumed)` : 'TBA / To be confirmed'),

      '[CARGO_DESCRIPTION]': data.cargo?.commodity || 'TBA / To be confirmed',
      '[CARGO_QUANTITY]': data.overrides?.cargoWeightMt ? `${data.overrides.cargoWeightMt} MT (Assumed)` : (data.cargo?.quantity || 'TBA / To be confirmed'),
      '[CARGO_SF]': data.overrides?.stowageFactor ? `${data.overrides.stowageFactor} CBM/MT (Assumed)` : (data.cargo?.stowageFactor || 'TBA / To be confirmed'),
      '[CARGO_HAZMAT]': 'TBA / To be confirmed',

      '[Load Port]': data.cargo?.loadPort || 'TBA / To be confirmed',
      '[DISCHARGE_PORT]': data.cargo?.dischargePort || 'TBA / To be confirmed',
      '[VOYAGE_DESC]': '1 Safe Port / 1 Safe Berth TBA',

      '[LAYCAN_START]': data.cargo?.laycan?.split('-')[0]?.trim() || 'TBA',
      '[LAYCAN_END]': data.cargo?.laycan?.split('-')[1]?.trim() || 'TBA',

      '[NOR_TERMS]': 'TBA / As per CP',
      '[TT_TERMS]': 'TBA / As per CP',

      '[LD_RATE]': data.cargo?.loadTerms || 'TBA / To be agreed',
      '[DIS_RATE]': data.cargo?.dischargeTerms || 'TBA / To be agreed',
      '[LAYTIME_TERMS]': 'TBA / To be agreed',
      '[DEM_DESP]': 'TBA / To be agreed',
      '[WWD_TERMS]': 'TBA / To be agreed',

      '[FREIGHT_RATE]': freightStr,
      '[FREIGHT_PAYMENT]': 'TBA / To be agreed',
      '[FREIGHT_CURRENCY]': 'USD',

      '[ADD_COMM]': 'TBA',
      '[BROKER_COMMISSION]': brokerData?.commission || 'TBA',
      '[ARBITRATION_TERMS]': data.arbitration || 'TBA / To be agreed',
      '[SUBJECTS]': 'TBA / To be agreed',
      
      // Fallback variables not explicitly mapped in strictly new Recap but needed for GENCON
      '[VESSEL_POSITION]': data.vessel?.position || 'TRADING',
      '[OWNER_ADDRESS]': data.owner?.address || 'TBA',
      '[BROKER_CONTACT]': brokerData?.showProfileInDocs ? ((brokerData.phone || '') + (brokerData.email ? ` / ${brokerData.email}` : '')) : '',
      '[BROKER_ADDRESS]': brokerData?.showProfileInDocs ? (brokerData.address || '') : '',
    };

    let result = templateText;
    for (const [tag, value] of Object.entries(replacements)) {
      result = result.split(tag).join(value);
    }
    return result;
  };

  const [customTemplate, setCustomTemplate] = useState<string | null>(() => {
    return localStorage.getItem(`customTemplate_${type}`) || null;
  });

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCustomTemplate(text);
      localStorage.setItem(`customTemplate_${type}`, text);
      setContent(generateContent(selectedClauses, text));
    };
    reader.readAsText(file);
  };

  const handleClearTemplate = () => {
    setCustomTemplate(null);
    localStorage.removeItem(`customTemplate_${type}`);
    setContent(generateContent(selectedClauses, null));
  };

  const generateContent = (currentClauses: string[], templateOverride?: string | null) => {
    const currentTemplate = templateOverride !== undefined ? templateOverride : customTemplate;

    const fallbackRecap = `RECAP (FIXTURE RECAP)

Date: [CURRENT_DATE]
Recap Reference: [RECAP_REF]

Parties:
* Shipowner: [OWNER_NAME]
* Charterer: [CHARTERER_NAME]
* Broker: [BROKER_FULL]

Vessel Parameters:
* Vessel Name: [Vessel Name]
* Flag: [VESSEL_FLAG]
* IMO Number: [VESSEL_IMO]
* Built: [VESSEL_BUILT]
* Deadweight Tonnage (DWT): [VESSEL_DWT]
* Cargo Capacity: [VESSEL_CAPACITY]
* Draft: [VESSEL_DRAFT]
* LOA/Beam: [VESSEL_LOA_BEAM]
* Gear: [VESSEL_GEAR]
* Speed/Consumption: [VESSEL_SPEED_CONS]

Cargo:
* Description: [CARGO_DESCRIPTION]
* Quantity: [CARGO_QUANTITY]
* Stowage Factor: [CARGO_SF]
* Hazardous: [CARGO_HAZMAT]

Route and Ports:
* Loading Port(s): [Load Port]
* Discharging Port(s): [DISCHARGE_PORT]
* Voyage Description: [VOYAGE_DESC]

Laycan:
* Laydays/Cancelling: [LAYCAN_START] - [LAYCAN_END]

NOR Terms:
* Notice of Readiness: [NOR_TERMS]
* Turning Time: [TT_TERMS]

L/D Conditions:
* Loading Rate: [LD_RATE]
* Discharging Rate: [DIS_RATE]
* Laytime: [LAYTIME_TERMS]
* Demurrage/Despatch: [DEM_DESP]
* Weather Working Days: [WWD_TERMS]

Freight:
* Rate: [FREIGHT_RATE]
* Payment: [FREIGHT_PAYMENT]
* Currency: [FREIGHT_CURRENCY]

Commissions:
* Address Commission: [ADD_COMM]
* Brokerage: [BROKER_COMMISSION]%

Brokerage Clause:
Brokers are entitled to [BROKER_COMMISSION]% brokerage on gross freight, deadfreight, and demurrage earned hereunder, payable by Owners upon receipt of freight. Brokers have a lien on the cargo for their commission.

Governing Law and Arbitration:
[ARBITRATION_TERMS]

Subjects:
[SUBJECTS]

Otherwise:
As per GENCON 94 with logical amendments to be agreed between parties, unless otherwise agreed.

Confirmed by:
Shipowner: _______________________ Date: __________
Charterer: _______________________ Date: __________
Broker: _______________________ Date: __________`;

    const fallbackGencon = `GENCON 94 - STANDARD CHARTER PARTY
PART I

1. Shipbroker
   [BROKER_COMPANY]
   [BROKER_NAME]
   [BROKER_CONTACT]

2. Place and date
   [CURRENT_DATE]

3. Owners/Place of business
   [OWNER_NAME]
   [OWNER_ADDRESS]

4. Charterers/Place of business
   [CHARTERER_NAME]

5. Vessel's name
   [Vessel Name]
   IMO: [VESSEL_IMO] / Flag: [VESSEL_FLAG]

6. GRT/NRT
   AS PER REGISTER

7. DWT on summer load line in metric tons
   [VESSEL_DWT]

8. Present position
   [VESSEL_POSITION]

9. Expected ready to load (abt.)
   [LAYCAN_START]

10. Loading port or place
    [Load Port]

11. Discharging port or place
    [DISCHARGE_PORT]

12. Cargo (also state quantity and margin)
    [CARGO_QUANTITY] MT [CARGO_DESCRIPTION]

13. Freight rate (also state whether freight prepaid or payable on delivery)
    [FREIGHT_RATE] FIOST 1/1

14. Freight payment
    100% WITHIN 3 BANKING DAYS FROM SIGNING BS/L

15. State if vessel's cargo handling gear shall not be used
    N/A

16. Laytime (if separate days for load/discharge)
    AS PER CHARTER PARTY FIXTURE RECAP

17. Shippers/Receivers
    TBA

18. Agents (loading)
    CHARTERERS' AGENTS

19. Agents (discharging)
    CHARTERERS' AGENTS

20. Demurrage rate and manner of payable
    AS AGREED PDPR

21. Cancelling date
    [LAYCAN_END]

22. General Average to be adjusted at
    LONDON

23. Freight Tax
    FOR CHARTERERS ACCOUNT

24. Brokerage commission and to whom payable
    [BROKER_COMMISSION]% TO [BROKER_COMPANY]

25. Law and Arbitration
    [ARBITRATION_TERMS]

26. Additional clauses covering special provisions, if agreed
    AS PER RIDER ATTACHED
`;

    if (type === 'RECAP') {
      const clausesText = currentClauses.length > 0 
        ? `\n\nAdditional Clauses:\n${currentClauses.map(c => `* ${c}`).join('\n')}\n`
        : '';

      const recapText = currentTemplate || templates?.recap || fallbackRecap;
      const replacedText = replacePlaceholders(recapText);

      return `${replacedText}${clausesText}`;
    }

    if (type === 'GENCON') {
      let clausesText = '';
      if (currentClauses.includes('Piracy')) {
        clausesText += `
Clause 15. BIMCO Piracy Clause 2013 (Applied)
If, in the reasonable judgement of the Master and/or the Owners, any 
port, place, area or zone, or any waterway or canal on the route 
of the Vessel is dangerous to the Vessel...
`;
      }
      if (currentClauses.includes('War Risk')) {
        clausesText += `
Clause 16. War Risk Clause (CONWORTIME) (Applied)
The Vessel shall not be obliged to proceed or required to continue 
to or through, any port, place, area or zone, or any waterway or canal...
`;
      }
      if (currentClauses.includes('AIS')) {
        clausesText += `
Clause 17. AIS Data Monitoring Clause (Applied)
Charterers shall not at any time request the Master to switch off 
the Vessel's Automatic Identification System (AIS) or to take any 
action which would inhibit its proper functioning...
`;
      }

      const genconText = currentTemplate || templates?.gencon || fallbackGencon;

      return `${replacePlaceholders(genconText)}
------------------------------------------------------
PART II - STANDARD CLAUSES & RIDERS
------------------------------------------------------

Clause 1. Loading/Discharging
The cargo shall be brought, loaded, stowed, trimmed, tallied, discharged 
and taken from the alongside and from the hold free of any risk, 
liability and expense whatsoever to the Owners.

Clause 2. Owners' Responsibility Clause
Owners are to be responsible for loss of or damage to the goods or for 
delay in delivery of the goods only in case the loss, damage or delay 
has been caused by personal want of due diligence on the part of the 
Owners or their Manager.

Clause 3. Deviation Clause
The Vessel has liberty to call at any port or ports in any order, 
for any purpose, to sail without pilots, to tow and/or assist vessels 
in all situations, and also to deviate for the purpose of saving life 
and/or property.
${clausesText}
++++++++++++++++++++++++++++++++++++++++++++++++++++++
E. & O.E.
++++++++++++++++++++++++++++++++++++++++++++++++++++++`;
    }
    return '';
  };

  const [content, setContent] = useState(() => data.contentOverride || generateContent(selectedClauses));

  React.useEffect(() => {
    if (!data.contentOverride) {
      setContent(generateContent(selectedClauses));
    }
  }, [selectedClauses]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    notify({
      title: 'Copied to Clipboard',
      message: 'Document content has been copied.',
      type: 'success'
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Legal Document: ${type} - ${data?.vessel?.name || 'Fixture'}`);
    const body = encodeURIComponent(content);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleExportDoc = () => {
    const blob = new Blob([content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_FIXTURE_${data.vessel?.name?.replace(/\s+/g, '_') || 'TBA'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify({
      title: 'Export Successful',
      message: `Document saved as .doc`,
      type: 'success'
    });
  };

  const handleSendToNetwork = (contactName: string) => {
    notify({
      title: 'Sent to Network',
      message: `Document sent to ${contactName}.`,
      type: 'success'
    });
    setShowNetworkShare(false);
  };

  const handleSaveDraft = async () => {
    if (!auth.currentUser) {
      notify({ title: 'Authentication required', message: 'You must be logged in to save drafts.', type: 'error' });
      return;
    }
    setIsExporting(true);
    try {
      const dbRef = collection(db, `users/${auth.currentUser.uid}/recapDrafts`);
      const payloadId = draftId || doc(dbRef).id;
      const ref = doc(db, `users/${auth.currentUser.uid}/recapDrafts/${payloadId}`);
      
      const missingCountTemp = (content.match(/TBA|To be confirmed|Pending confirmation/g) || []).length;
      const assumedCountTemp = (content.match(/Assumed/g) || []).length;
      const confirmedCountTemp = VARIABLES_LIST.length - missingCountTemp - assumedCountTemp;

      const payload = {
        userId: auth.currentUser.uid,
        draftId: payloadId,
        title: `${type} - ${data.vessel?.name || 'TBA'} / ${data.cargo?.commodity || 'TBA'}`,
        recapReference: content.match(/Recap Reference: (.*)/)?.[1] || '',
        content,
        status: (missingCountTemp > 0 || assumedCountTemp > 0) ? 'review_required' : 'ready',
        createdAt: draftId ? undefined : serverTimestamp(),
        updatedAt: serverTimestamp(),
        cargoId: data.cargo?.id || null,
        vesselId: data.vessel?.id || null,
        missingFieldsCount: missingCountTemp,
        assumedFieldsCount: assumedCountTemp,
        confirmedFieldsCount: confirmedCountTemp,
        source: 'selection_desk'
      };

      if (!draftId) {
        setDraftId(payloadId);
      }

      await setDoc(ref, Object.fromEntries(Object.entries(payload).filter(([_, v]) => v !== undefined)), { merge: true });
      notify({
        title: 'Draft Saved',
        message: 'Your document draft has been successfully saved to your workspace.',
        type: 'success'
      });
      onClose();
    } catch (e: any) {
      console.error(e);
      notify({
        title: 'Failed to save draft',
        message: e.message || 'An error occurred while saving the draft.',
        type: 'error'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const isFreightMissing = (content.match(/Pending confirmation/g) || []).length > 0;
  const isLawMissing = !data.arbitration;
  const isDemurrageMissing = !data.cargo?.demurrage;
  const isHazmatUnknown = !data.cargo?.hazardous;
  const isCargoQtyMissing = !data.cargo?.quantity && !data.overrides?.cargoWeightMt;

  const missingCount = (content.match(/TBA|To be confirmed|Pending confirmation/g) || []).length;
  const assumedCount = (content.match(/Assumed/g) || []).length;
  const confirmedCount = VARIABLES_LIST.length - missingCount - assumedCount;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', damping: 30, stiffness: 200 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface/90 backdrop-blur-sm print:bg-white print:p-0"
    >
      <div className="w-full max-w-5xl h-[85vh] print:h-auto print:max-w-full bg-surface-container-lowest border border-outline/20 flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.5)] print:shadow-none print:border-none rounded-sm overflow-hidden relative">
        <div className="absolute inset-0 bg-surface/50 opacity-90 z-[-1] pointer-events-none"></div>

        {/* Header (hidden in print) */}
        <div className="p-6 border-b border-outline/20 bg-surface-container/50 backdrop-blur-md flex items-center justify-between print:hidden">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shadow-[0_0_15px_rgba(var(--color-primary),0.1)]">
               <FileText className="h-5 w-5 text-primary stroke-[1.5]" />
             </div>
             <div>
                <h3 className="text-[12px] font-medium text-on-surface uppercase tracking-[0.3em] font-display">{type} GENERATOR</h3>
                <p className="text-[9px] text-on-surface-variant font-mono uppercase tracking-widest mt-1">Drafting Session: {Math.random().toString(36).substring(7).toUpperCase()}</p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors rounded-full">
            <X className="h-5 w-5 stroke-1.5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden print:overflow-visible bg-transparent">
          <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-outline/20 bg-surface-container-low/50 backdrop-blur-md flex flex-row md:flex-col overflow-x-auto md:overflow-hidden print:hidden shrink-0">
            <div className="hidden md:block p-6 border-b border-outline/20 bg-transparent">
               <h5 className="text-[10px] font-medium text-primary uppercase tracking-[0.3em] flex items-center gap-3">
                 <Plus className="h-4 w-4 stroke-1.5" />
                 Clause Library
               </h5>
            </div>
            <div className="hidden md:block flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
               {clausesList.map(clause => (
                 <button 
                  key={clause.id}
                  onClick={() => toggleClause(clause.id)}
                  className={cn(
                    "w-full p-4 text-left transition-all duration-300 relative group rounded-sm border",
                    selectedClauses.includes(clause.id) 
                      ? "border-tertiary/40 bg-tertiary/10 text-on-surface shadow-[0_0_15px_rgba(var(--color-tertiary),0.05)]" 
                      : "border-outline/20 bg-surface-container-lowest/50 text-on-surface-variant hover:border-primary/30 hover:bg-surface-container-lowest"
                  )}
                 >
                   <div className="text-[11px] font-medium font-sans tracking-wide mb-2 text-on-surface">{clause.label}</div>
                   <div className="text-[9px] opacity-70 font-mono text-on-surface-variant uppercase tracking-widest">Standard maritime rider</div>
                   {selectedClauses.includes(clause.id) && (
                     <Check className="h-4 w-4 text-tertiary absolute top-4 right-4 stroke-[2]" />
                   )}
                 </button>
               ))}
            </div>

            <div className="p-2 md:p-6 md:border-t border-outline/20 flex flex-row md:flex-col justify-start md:justify-stretch items-center md:items-stretch gap-2 md:gap-0 space-y-0 md:space-y-2 relative bg-transparent flex-1 md:flex-none">
              {customTemplate ? (
                <ActionButton icon={Trash2} label="Clear Custom Template" onClick={handleClearTemplate} />
              ) : (
                <label title="Upload Template (.txt)" className="w-auto md:w-full flex items-center justify-center md:justify-start gap-3 p-3 rounded-sm text-[11px] font-medium tracking-wide transition-colors cursor-pointer text-on-surface-variant hover:text-primary hover:bg-primary/5">
                  <Upload className="h-4 w-4" />
                  <span className="hidden md:inline">Upload Template (.txt)</span>
                  <input type="file" accept=".txt" className="hidden" onChange={handleTemplateUpload} />
                </label>
              )}
              <ActionButton icon={Info} label="Template Variables" onClick={() => setShowVariables(true)} />
              
              <div className="flex flex-row md:flex-col gap-2 md:gap-0 md:mt-4 md:pt-4 md:border-t border-outline/20 space-y-0 md:space-y-2">
                <ActionButton icon={Copy} label={copied ? "Copied" : "Copy Text"} onClick={handleCopy} active={copied} />
                <ActionButton icon={Printer} label="Print / PDF" onClick={handlePrint} />
                <ActionButton icon={Download} label="Export .doc" onClick={handleExportDoc} />
              </div>
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 bg-surface-container-lowest/80 p-6 sm:p-10 overflow-y-auto print:overflow-visible print:bg-white print:text-black font-mono text-[13px] leading-loose text-on-surface tracking-wide whitespace-pre-wrap custom-scrollbar flex flex-col">
            {type === 'RECAP' && (
               <div className="mb-6 p-4 border border-outline/20 bg-surface-container/50 rounded-sm flex flex-col gap-3 font-sans print:hidden shrink-0">
                 <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[10px] uppercase tracking-widest font-mono font-medium">
                    <span className="text-tertiary bg-tertiary/10 px-2 py-1 rounded-sm">Confirmed: {confirmedCount}</span>
                    <span className="text-error bg-error/10 px-2 py-1 rounded-sm">Missing: {missingCount}</span>
                    <span className="text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-sm">Assumed: {assumedCount}</span>
                 </div>
                 {(missingCount > 0 || assumedCount > 0) && (
                   <div className="text-error text-[11px] p-2 bg-error/5 border border-error/20 rounded-sm font-medium">
                     ⚠️ This recap contains missing or assumed commercial/legal terms. Review before sending.
                   </div>
                 )}
                 {(isFreightMissing || isLawMissing || isDemurrageMissing || isHazmatUnknown || isCargoQtyMissing) && (
                   <div className="flex flex-col gap-1 text-[11px]">
                      {isFreightMissing && <span className="text-error/80">• Freight is missing or pending confirmation.</span>}
                      {isLawMissing && <span className="text-error/80">• Governing Law & Arbitration is missing.</span>}
                      {isDemurrageMissing && <span className="text-error/80">• Demurrage / Despatch rate is missing.</span>}
                      {isHazmatUnknown && <span className="text-error/80">• Hazardous status is unknown.</span>}
                      {isCargoQtyMissing && <span className="text-error/80">• Cargo quantity basis is incomplete.</span>}
                   </div>
                 )}
               </div>
            )}
             <textarea 
               value={content}
               onChange={(e) => setContent(e.target.value)}
               className="w-full flex-1 min-h-[600px] bg-transparent border-none focus:ring-0 resize-none p-0 selection:bg-primary/30 print:hidden outline-none font-mono"
               spellCheck={false}
             />
             <div className="hidden print:block whitespace-pre-wrap font-mono text-[10px] text-black">
               {content}
             </div>
          </div>
        </div>

        {/* Footer (hidden in print) */}
        <div className="p-4 sm:p-6 border-t border-outline/20 bg-surface-container/50 backdrop-blur-md flex flex-col sm:flex-row justify-between items-center print:hidden gap-4 sm:gap-0">
           <div className="flex gap-4 sm:gap-8 w-full sm:w-auto overflow-x-auto custom-scrollbar pb-2 sm:pb-0">
              <div className="flex flex-col gap-1 shrink-0">
                 <span className="text-[9px] text-on-surface-variant font-medium tracking-[0.3em] uppercase">Status</span>
                 <span className={cn("text-[10px] font-mono tracking-widest uppercase", (missingCount > 0 || assumedCount > 0) ? "text-error" : "text-tertiary")}>
                   {(missingCount > 0 || assumedCount > 0) ? 'Draft — Review Required' : 'Ready for Signing'}
                 </span>
              </div>
              <div className="w-px bg-outline/30 shrink-0"></div>
              <div className="flex flex-col gap-1 shrink-0">
                 <span className="text-[9px] text-on-surface-variant font-medium tracking-[0.3em] uppercase">Compliance</span>
                 <span className="text-[10px] text-on-surface font-mono tracking-widest uppercase">BIMCO Verified</span>
              </div>
           </div>
           
           <button 
             onClick={handleSaveDraft}
             disabled={isExporting}
             className="w-full sm:w-auto bg-primary text-on-primary px-4 sm:px-8 py-3 rounded-sm font-medium uppercase tracking-[0.2em] text-[10px] hover:bg-primary-container transition-all flex justify-center items-center gap-3 shadow-md border border-primary/20 shrink-0"
           >
             {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Final Draft'}
           </button>
        </div>

        {/* Network Share Modal */}
        <AnimatePresence>
          {showNetworkShare && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-surface/80 backdrop-blur-md z-50 flex items-center justify-center p-4 print:hidden"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-md bg-surface-container-lowest border border-outline/30 shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-8 rounded-sm overflow-hidden relative"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <MessageSquare className="w-48 h-48 stroke-1" />
                </div>
                <div className="flex justify-between items-center mb-8 relative">
                  <h4 className="text-[11px] font-medium text-on-surface uppercase tracking-[0.3em] flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-primary stroke-1.5" />
                    Share via Desk Network
                  </h4>
                  <button onClick={() => setShowNetworkShare(false)} className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-low">
                    <X className="h-5 w-5 stroke-1.5" />
                  </button>
                </div>
                
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar relative">
                  {NETWORK_CONTACTS.map(contact => (
                    <button 
                      key={contact.id}
                      onClick={() => handleSendToNetwork(contact.name)}
                      className="w-full flex items-center gap-4 p-4 bg-surface-container-low border border-outline/20 hover:border-primary/50 transition-all group rounded-sm"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 bg-surface border border-outline/30 rounded-full flex items-center justify-center group-hover:border-primary/50 transition-all">
                          <Users className="h-4 w-4 text-on-surface-variant group-hover:text-primary transition-colors stroke-1.5" />
                        </div>
                        {contact.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-tertiary border-2 border-surface-container-low rounded-full" />}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-[12px] font-medium font-sans text-on-surface uppercase tracking-wide truncate">{contact.name}</div>
                        <div className="text-[9px] text-on-surface-variant font-mono uppercase tracking-widest">{contact.role}</div>
                      </div>
                      <span className="text-[9px] text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium uppercase tracking-[0.2em] px-3 py-1 bg-primary/10 rounded-sm">
                        Send
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Variables Modal */}
        <AnimatePresence>
          {showVariables && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-surface/80 backdrop-blur-md z-50 flex items-center justify-center p-4 print:hidden"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-xl bg-surface-container-lowest border border-outline/30 shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-8 rounded-sm overflow-hidden relative flex flex-col"
              >
                <div className="flex justify-between items-center mb-6 relative">
                  <h4 className="text-[11px] font-medium text-on-surface uppercase tracking-[0.3em] flex items-center gap-3">
                    <Info className="h-5 w-5 text-primary stroke-1.5" />
                    Available Template Variables
                  </h4>
                  <button onClick={() => setShowVariables(false)} className="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-low">
                    <X className="h-5 w-5 stroke-1.5" />
                  </button>
                </div>
                
                <p className="text-[11px] text-on-surface-variant mb-4 leading-relaxed font-mono">
                  You can upload a custom <code>.txt</code> file to be used as a template. The system will automatically replace the following variables with data from the current fixture. Click any variable to copy it.
                </p>

                <div className="flex-1 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar grid grid-cols-2 gap-2">
                  {VARIABLES_LIST.map(v => (
                    <button 
                      key={v}
                      onClick={() => {
                        navigator.clipboard.writeText(v);
                        // Could add a toast here
                      }}
                      className="p-3 bg-surface-container-low border border-outline/20 hover:border-primary/50 text-[10px] font-mono text-primary text-center hover:bg-primary/5 transition-all rounded-sm active:scale-95"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
};

const ActionButton = ({ icon: Icon, label, onClick, active }: any) => (
  <button 
    onClick={onClick}
    title={label}
    className={cn(
      "w-auto md:w-full px-4 py-3 flex items-center justify-center md:justify-start gap-3 text-[9px] font-medium uppercase tracking-[0.2em] transition-all duration-300 rounded-sm border shrink-0",
      active ? "text-tertiary border-tertiary/20 bg-tertiary/10" : "text-on-surface-variant border-transparent md:hover:bg-surface-container md:hover:text-on-surface"
    )}
  >
    <Icon className="h-4 w-4 stroke-1.5" />
    <span className="hidden md:inline">{label}</span>
  </button>
);
