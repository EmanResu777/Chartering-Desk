import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion, onSnapshot } from 'firebase/firestore';
import { useNotification } from '../lib/NotificationContext';
import { X, Save, FileText, Download, CheckCircle, ShieldAlert } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { AIDealBriefCard } from './AIDealBriefCard';
import { VoyageEstimateSection } from './VoyageEstimateSection';

export const RecapModal = ({ deal, user, onClose }: any) => {
  const { notify } = useNotification();
  const [recapData, setRecapData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!deal || !user) return;
    const recapRef = doc(db, 'deskNetworkUrgentDeals', deal.dealId || deal.id, 'recaps', 'draft');
    
    const unsubscribe = onSnapshot(recapRef, async (snap) => {
      if (snap.exists()) {
        setRecapData(snap.data());
        setLoading(false);
      } else {
        // Create initial draft
        try {
           const [cargoDoc, vesselDoc] = await Promise.all([
             deal.cargoItemId ? getDoc(doc(db, 'cargos', deal.cargoItemId)) : Promise.resolve(null),
             deal.vesselItemId ? getDoc(doc(db, 'vessels', deal.vesselItemId)) : Promise.resolve(null)
           ]);
           const c = cargoDoc?.exists() ? cargoDoc.data() : {};
           const v = vesselDoc?.exists() ? vesselDoc.data() : {};
           
           const initialData = {
               recapId: 'draft',
               dealId: deal.dealId || deal.id,
               cargoItemId: deal.cargoItemId,
               vesselItemId: deal.vesselItemId,
               cargoOwnerUid: deal.cargoOwnerUid,
               vesselOwnerUid: deal.vesselOwnerUid,
               createdBy: user.uid,
               createdAt: serverTimestamp(),
               updatedAt: serverTimestamp(),
               status: 'draft',
               version: 1,
               templateName: 'Fixture Recap Draft',
               templateVersion: '1.1',
               refNo: `REC/${new Date().getFullYear()}/${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
               recapData: {
                   subjects: 'TBA / EXPRESSLY AGREE SUBJECTS',
                   subsLiftLatest: 'TBA / EXPRESSLY AGREE',
                   fixtureStatus: 'DRAFT / NOT CONFIRMED',
                   cpForm: 'TBA / EXPRESSLY AGREE CP FORM',
                   charterers: c.charterer || 'TBA / CONFIRM CHARTERER',
                   owners: v.owner || 'TBA / CONFIRM REGISTERED OWNER',
                   commercialOperator: 'TBA / CONFIRM',
                   broker: user.displayName || user.email || 'TBA / CONFIRM BROKER',
                   brokerage: c.commission || 'TBA / EXPRESSLY AGREE',
                   freightBeneficiary: 'TBA / CONFIRM',
                   vesselName: v.name || 'TBA / CONFIRM VESSEL',
                   dwtDraft: v.dwt ? `${v.dwt} DWT / DRAFT TBA` : 'TBA / CONFIRM DWT AND DRAFT',
                   gearHolds: [v.gear, v.cranes].filter(Boolean).join(' / ') || 'TBA / CONFIRM GEAR/HOLDS',
                   openPosition: [v.openPort, v.openDate].filter(Boolean).join(' / ') || 'TBA / CONFIRM OPEN POSITION',
                   itinerary: 'TBA / CONFIRM',
                   certificates: 'TBA / EXPRESS OWNER CONFIRMATION REQUIRED',
                   suitability: 'TBA / EXPRESS OWNER CONFIRMATION REQUIRED',
                   cargo: c.commodity || 'TBA / CONFIRM CARGO',
                   quantity: c.quantity || 'TBA / CONFIRM QUANTITY AND MARGIN',
                   stowageFactor: c.stowageFactor || 'TBA / CONFIRM',
                   cargoCondition: 'TBA / CONFIRM',
                   cargoDocuments: 'TBA / CONFIRM',
                   loadPort: c.loadPort || 'TBA / CONFIRM LOAD PORT',
                   dischargePort: c.dischargePort || 'TBA / CONFIRM DISCHARGE PORT',
                   laycan: c.laycan || 'TBA / CONFIRM LAYCAN',
                   nor: 'TBA / EXPRESSLY AGREE NOR TERMS',
                   loadingRate: 'TBA / EXPRESSLY AGREE',
                   dischargingRate: 'TBA / EXPRESSLY AGREE',
                   stevedores: 'TBA / EXPRESSLY AGREE',
                   agents: 'TBA / EXPRESSLY AGREE',
                   freight: c.freightRate || c.freightIdea || 'TBA / EXPRESSLY AGREE FREIGHT',
                   freightPayable: 'TBA / EXPRESSLY AGREE PAYMENT TERMS',
                   taxesDues: 'TBA / EXPRESSLY AGREE TAXES AND DUES',
                   laytime: 'TBA / EXPRESSLY AGREE LAYTIME',
                   demurrage: 'TBA / EXPRESSLY AGREE DEMURRAGE',
                   despatch: 'TBA / EXPRESSLY AGREE DESPATCH',
                   detentionWaiting: 'TBA / EXPRESSLY AGREE WAITING/DETENTION',
                   includeBrokerChecklist: true
               },
               confirmations: {
                   cargoSide: { confirmed: false },
                   vesselSide: { confirmed: false }
               },
               confirmationStatus: 'pending',
               exportFormatsAvailable: ['docx', 'pdf'],
               auditTrail: [{ action: 'recap_created', timestamp: new Date(), actorUid: user.uid, safeMessage: 'Initial recap draft created.' }]
           };
           
           await setDoc(recapRef, initialData);
           setRecapData(initialData);
           
           // Create pointer in both users' recapDrafts (safe via new rules)
           const draftPointer = { 
             dealId: deal.dealId || deal.id, 
             cargoItemId: deal.cargoItemId,
             vesselItemId: deal.vesselItemId,
             createdAt: serverTimestamp(),
             updatedAt: serverTimestamp(),
             status: 'draft',
             cargoOwnerUid: deal.cargoOwnerUid,
             vesselOwnerUid: deal.vesselOwnerUid
           };
           
           if (deal.cargoOwnerUid && deal.cargoOwnerUid !== 'system') {
             await setDoc(doc(db, 'users', deal.cargoOwnerUid, 'recapDrafts', (deal.dealId || deal.id)), draftPointer, { merge: true });
           }
           if (deal.vesselOwnerUid && deal.vesselOwnerUid !== 'system') {
             await setDoc(doc(db, 'users', deal.vesselOwnerUid, 'recapDrafts', (deal.dealId || deal.id)), draftPointer, { merge: true });
           }

           try {
             const token = await user.getIdToken();
             const notificationResponse = await fetch('/api/recaps/notify-created', {
               method: 'POST',
               headers: {
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${token}`
               },
               body: JSON.stringify({ dealId: deal.dealId || deal.id })
             });
             if (!notificationResponse.ok) {
               console.warn(`Recap draft notification rejected: HTTP ${notificationResponse.status}`);
             }
           } catch (notificationError) {
             console.warn('Recap draft notification failed:', notificationError);
           }
           
        } catch (err: any) {
           console.log("Recap init blocked:", err.message);
        }
        setLoading(false);
      }
    }, (err) => {
        console.log("Recap read blocked:", err.message);
    });
    
    return () => unsubscribe();
  }, [deal, user]);

  const handleChange = (field: string, value: string) => {
    setRecapData((prev: any) => ({
      ...prev,
      recapData: { ...prev.recapData, [field]: value }
    }));
  };

  const handleSaveDraft = async () => {
    if (!recapData) return;
    setSaving(true);
    try {
      const recapRef = doc(db, 'deskNetworkUrgentDeals', deal.dealId || deal.id, 'recaps', 'draft');
      await updateDoc(recapRef, {
        recapData: recapData.recapData,
        updatedAt: serverTimestamp(),
        version: (recapData.version || 1) + 1,
        auditTrail: arrayUnion({ action: 'recap_updated', timestamp: new Date(), actorUid: user.uid, safeMessage: 'Recap draft updated.' })
      });
      notify({ title: "Draft Saved", message: "Recap draft has been successfully saved.", type: "success" });
    } catch (err: any) {
       notify({ title: "Save Error", message: err.message, type: "error" });
    }
    setSaving(false);
  };

  const handleToggleConfirmation = async (_side: 'cargoSide' | 'vesselSide', confirm: boolean) => {
    if (!recapData || !user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/recaps/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          dealId: deal.dealId || deal.id,
          confirm
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Unable to update recap confirmation');
      }

      notify({
        title: "Confirmation Updated",
        message: body.recapStatus === 'locked'
          ? "Both sides have confirmed. The recap is now locked."
          : confirm
            ? "Your recap confirmation was recorded."
            : "Your recap confirmation was revoked.",
        type: "success"
      });
    } catch (err: any) {
      notify({ title: "Update Error", message: err.message, type: "error" });
    }
  };

  const handleExportDocx = async () => {
    if (!recapData) return;
    try {
       const docxDocument = new Document({
           creator: "OceanPact Chartering",
           description: "Fixture Recap",
           sections: [
               {
                   properties: {},
                   children: [
                       new Paragraph({ children: [new TextRun({ text: "OCEANPACT CHARTERING", bold: true, size: 32 })] }),
                       new Paragraph({ children: [new TextRun({ text: "Fixture Recap / Working Template", italics: true })] }),
                       new Paragraph({ text: "" }),
                       new Paragraph({ children: [new TextRun({ text: `REF: ${recapData.refNo}`, bold: true })] }),
                       new Paragraph({ children: [new TextRun({ text: `STATUS: ${recapData.recapData.fixtureStatus}`, bold: true })] }),
                       new Paragraph({ children: [new TextRun({ text: "STRICTLY PRIVATE AND CONFIDENTIAL - NOT TO BE REPORTED", bold: true })] }),
                       new Paragraph({ text: "" }),
                       new Paragraph({ children: [new TextRun({ text: `Cargo: ${recapData.recapData.cargo} | Vessel: ${recapData.recapData.vesselName}` })] }),
                       new Paragraph({ text: "" }),
                       new Paragraph({ text: "CONFIRMATION STATUS:" }),
                       new Paragraph({ children: [new TextRun({ text: `Cargo Side: ${recapData.confirmations?.cargoSide?.confirmed ? 'CONFIRMED' : 'PENDING'}` })] }),
                       new Paragraph({ children: [new TextRun({ text: `Vessel Side: ${recapData.confirmations?.vesselSide?.confirmed ? 'CONFIRMED' : 'PENDING'}` })] }),
                       new Paragraph({ text: "" }),
                       new Paragraph({ text: "For Owners / Disponent Owners ____________________" }),
                       new Paragraph({ text: "For Charterers ____________________" }),
                       new Paragraph({ text: "" }),
                       new Paragraph({ children: [new TextRun({ text: "Broker-side recap confirmation confirms that both Desk Network participants agree to the working recap draft inside the platform. Final fixture, charter party and principal approvals remain subject to separate written confirmation.", italics: true })] }),
                   ],
               },
           ],
       });

       const blob = await Packer.toBlob(docxDocument);
       saveAs(blob, `OceanPact_Fixture_Recap_${recapData.refNo.replace(/\//g, '_')}_${new Date().toISOString().split('T')[0]}.docx`);
       
       const recapRef = doc(db, 'deskNetworkUrgentDeals', deal.dealId || deal.id, 'recaps', 'draft');
       await updateDoc(recapRef, {
         auditTrail: arrayUnion({ action: 'recap_exported_docx', timestamp: new Date(), actorUid: user.uid, safeMessage: 'Recap exported to DOCX.' })
       });


    } catch(err: any) {
        notify({ title: "Export Error", message: err.message, type: "error" });
    }
  };

  const handleExportPdf = async () => {
    if (!recapData) return;
    const element = document.getElementById('recap-printable-area');
    if (!element) return;
    
    try {
      const canvas = await html2canvas(element, { scale: 1.5 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`OceanPact_Fixture_Recap_${recapData.refNo.replace(/\//g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      
      const recapRef = doc(db, 'deskNetworkUrgentDeals', deal.dealId || deal.id, 'recaps', 'draft');
      await updateDoc(recapRef, {
        auditTrail: arrayUnion({ action: 'recap_exported_pdf', timestamp: new Date(), actorUid: user.uid, safeMessage: 'Recap exported to PDF.' })
      });


    } catch (err: any) {
       notify({ title: "Export Error", message: err.message, type: "error" });
    }
  };

  if (loading) {
     return (
       <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex justify-center items-center p-4">
         <div className="text-on-surface uppercase tracking-widest text-[12px]">Loading Draft...</div>
       </div>
     );
  }

  const isCargoSide = user?.uid === deal?.cargoOwnerUid;
  const isVesselSide = user?.uid === deal?.vesselOwnerUid;
  const cargoConfirmed = recapData?.confirmations?.cargoSide?.confirmed;
  const vesselConfirmed = recapData?.confirmations?.vesselSide?.confirmed;
  const bothConfirmed = cargoConfirmed && vesselConfirmed;
  const anyConfirmed = cargoConfirmed || vesselConfirmed;
  const isLockedForEditing = anyConfirmed;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col md:justify-center items-center md:p-4">
      <div className="bg-surface border-0 md:border border-outline w-full max-w-5xl h-full md:h-[90vh] flex flex-col shadow-2xl relative">
        <div className="p-3 md:p-4 border-b border-outline flex flex-col md:flex-row md:justify-between md:items-center gap-3 bg-surface-container shrink-0">
          <div className="flex gap-4 items-center">
             <h2 className="text-[12px] md:text-[14px] uppercase tracking-widest font-bold text-on-surface">OceanPact Recap</h2>
             <span className="bg-primary/20 text-primary px-2 py-0.5 text-[9px] md:text-[10px] uppercase font-bold tracking-widest">
               {bothConfirmed ? 'LOCKED' : recapData?.status || 'DRAFT'}
             </span>
             {bothConfirmed && <span className="bg-green-500/10 text-green-600 px-2 py-0.5 text-[9px] uppercase font-bold tracking-widest flex items-center gap-1"><CheckCircle size={10} /> Fully Confirmed</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
             {!bothConfirmed && (
                 <button onClick={handleSaveDraft} disabled={saving || isLockedForEditing} className="bg-primary text-on-primary px-3 py-1.5 text-[9px] md:text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50">
                   <Save size={12} /> {saving ? 'Saving...' : 'Save Draft'}
                 </button>
             )}
             <button onClick={handleExportDocx} className="bg-surface text-on-surface border border-outline px-3 py-1.5 text-[9px] md:text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-surface-container">
               <FileText size={12} /> Export DOCX
             </button>
             <button onClick={handleExportPdf} className="bg-surface text-on-surface border border-outline px-3 py-1.5 text-[9px] md:text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-surface-container hidden sm:flex">
               <Download size={12} /> Export PDF
             </button>
             <button onClick={onClose} className="p-1.5 hover:bg-surface-container ml-auto md:ml-2"><X size={16} className="text-on-surface-variant"/></button>
          </div>
        </div>
        
        {/* Confirmation Actions Bar */}
        <div className="bg-surface border-b border-outline p-3 md:p-4 flex flex-col gap-3 shrink-0">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-3 border ${cargoConfirmed ? 'border-green-500/50 bg-green-500/5' : 'border-outline/50 bg-surface'}`}>
                 <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-2">
                    <ShieldAlert size={12} className={cargoConfirmed ? 'text-green-600' : 'text-on-surface-variant'} /> 
                    Cargo Side Confirmation
                    {cargoConfirmed && <span className="ml-auto text-green-600 font-bold">CONFIRMED</span>}
                 </div>
                 {isCargoSide && !cargoConfirmed && !bothConfirmed && (
                    <button onClick={() => handleToggleConfirmation('cargoSide', true)} className="w-full bg-tertiary text-on-primary py-2 text-[10px] uppercase font-bold tracking-widest">Confirm Recap as Cargo Side</button>
                 )}
                 {isCargoSide && cargoConfirmed && !bothConfirmed && (
                    <button onClick={() => handleToggleConfirmation('cargoSide', false)} className="w-full border border-tertiary text-tertiary hover:bg-tertiary/10 py-2 text-[10px] uppercase font-bold tracking-widest">Revoke Confirmation</button>
                 )}
                 {!isCargoSide && (
                    <div className="text-[10px] text-on-surface-variant italic">{cargoConfirmed ? 'Cargo side has confirmed.' : 'Waiting for cargo side...'}</div>
                 )}
              </div>
              <div className={`p-3 border ${vesselConfirmed ? 'border-green-500/50 bg-green-500/5' : 'border-outline/50 bg-surface'}`}>
                 <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-2">
                    <ShieldAlert size={12} className={vesselConfirmed ? 'text-green-600' : 'text-on-surface-variant'} /> 
                    Vessel Side Confirmation
                    {vesselConfirmed && <span className="ml-auto text-green-600 font-bold">CONFIRMED</span>}
                 </div>
                 {isVesselSide && !vesselConfirmed && !bothConfirmed && (
                    <button onClick={() => handleToggleConfirmation('vesselSide', true)} className="w-full bg-primary text-on-primary py-2 text-[10px] uppercase font-bold tracking-widest">Confirm Recap as Vessel Side</button>
                 )}
                 {isVesselSide && vesselConfirmed && !bothConfirmed && (
                    <button onClick={() => handleToggleConfirmation('vesselSide', false)} className="w-full border border-primary text-primary hover:bg-primary/10 py-2 text-[10px] uppercase font-bold tracking-widest">Revoke Confirmation</button>
                 )}
                 {!isVesselSide && (
                    <div className="text-[10px] text-on-surface-variant italic">{vesselConfirmed ? 'Vessel side has confirmed.' : 'Waiting for vessel side...'}</div>
                 )}
              </div>
           </div>
           {isLockedForEditing && !bothConfirmed && (
              <div className="text-[10px] text-tertiary bg-tertiary/10 px-3 py-2 text-center uppercase tracking-widest font-bold">
                 Editing is locked because one or more sides have confirmed. Revoke to edit.
              </div>
           )}
           {bothConfirmed && (
              <div className="text-[10px] text-green-600 bg-green-500/10 px-3 py-2 text-center uppercase tracking-widest font-bold">
                 Broker-side recap confirmed by both sides. Recap is now read-only.
              </div>
           )}
        </div>

        {/* AI Commercial Analysis Context */}
        <div className="bg-surface border-b border-outline p-3 md:p-4 shrink-0 max-h-[300px] overflow-y-auto">
           <div className="text-[10px] uppercase font-bold text-on-surface-variant tracking-widest mb-3">AI Commercial Analysis Context</div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VoyageEstimateSection itemId={deal.dealId || deal.id} itemType="hot_opp" dealRoomId={deal.dealId || deal.id} />
              <div className="space-y-4">
                 <AIDealBriefCard itemId={recapData?.cargoItemId} itemType="cargo" dealType="Targeted Cargo Profile" />
                 <AIDealBriefCard itemId={recapData?.vesselItemId} itemType="vessel" dealType="Targeted Vessel Profile" />
              </div>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 md:p-6 bg-[#f4f4f4]">
           <div id="recap-printable-area" className="w-full max-w-[800px] mx-auto bg-white p-4 md:p-12 shadow-sm text-black font-serif text-[11px] leading-relaxed">
               {/* Document Header */}
               <div className="flex justify-between items-start mb-6 md:mb-8 border-b-2 border-black pb-4">
                  <div className="flex items-center gap-4">
                     <div className="text-2xl md:text-3xl font-black text-blue-900 tracking-tight">OP</div>
                     <div>
                        <div className="text-[14px] md:text-[16px] font-bold text-blue-900 tracking-wide">OCEANPACT CHARTERING</div>
                        <div className="text-[9px] md:text-[10px] text-gray-500 uppercase tracking-widest">Fixture Recap / Working Template</div>
                     </div>
                  </div>
                  <div className="text-right text-[8px] md:text-[10px] uppercase font-bold tracking-widest hidden sm:block">
                     <div>Dry Bulk & Project Cargo</div>
                     <div>Asia - Worldwide</div>
                  </div>
               </div>

               {/* Title Block */}
               <div className="bg-blue-900 text-white p-3 md:p-4 mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div>
                    <h1 className="text-[16px] md:text-[18px] font-bold tracking-widest">FIXTURE RECAP</h1>
                    <div className="text-[8px] md:text-[9px] mt-1">Subject to details below and final approvals</div>
                  </div>
                  <div className="text-left sm:text-right text-[9px] md:text-[10px] font-mono">
                    <div>REF: {recapData?.refNo}</div>
                    <div>DATE: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</div>
                    <div>STATUS: {recapData?.recapData.fixtureStatus}</div>
                  </div>
               </div>
               
               <div className="text-red-600 font-bold text-center text-[9px] md:text-[10px] uppercase tracking-widest mb-4">
                  STRICTLY PRIVATE AND CONFIDENTIAL - NOT TO BE REPORTED / CIRCULATED WITHOUT PRIOR AUTHORITY
               </div>
               
               <div className="mb-6 text-[10px] md:text-[11px]">
                 Good day,<br />
                 Further to authority received from both sides, we are pleased to prepare the following recap <strong>on subjects</strong>. All details below to be checked carefully by Owners / Charterers and confirmed in writing.
               </div>

               {/* Render sections block by block with minimal inputs */}
               <div className="space-y-4">
                 <Section title="1. SUBJECTS / VALIDITY">
                     <Row label="Subjects" value={recapData?.recapData.subjects} onChange={(v: any) => handleChange('subjects', v)} locked={isLockedForEditing} />
                     <Row label="Subs lift latest" value={recapData?.recapData.subsLiftLatest} onChange={(v: any) => handleChange('subsLiftLatest', v)} hint="No silent extensions" locked={isLockedForEditing} />
                     <Row label="Fixture status" value={recapData?.recapData.fixtureStatus} onChange={(v: any) => handleChange('fixtureStatus', v)} locked={isLockedForEditing} />
                     <Row label="CP form" value={recapData?.recapData.cpForm} onChange={(v: any) => handleChange('cpForm', v)} locked={isLockedForEditing} />
                 </Section>
                 
                 <Section title="2. PARTIES / BROKERS">
                     <Row label="Charterers" value={recapData?.recapData.charterers} onChange={(v: any) => handleChange('charterers', v)} locked={isLockedForEditing} />
                     <Row label="Owners" value={recapData?.recapData.owners} onChange={(v: any) => handleChange('owners', v)} locked={isLockedForEditing} />
                     <Row label="Operator" value={recapData?.recapData.commercialOperator} onChange={(v: any) => handleChange('commercialOperator', v)} locked={isLockedForEditing} />
                     <Row label="Broker" value={recapData?.recapData.broker} onChange={(v: any) => handleChange('broker', v)} locked={isLockedForEditing} />
                     <Row label="Brokerage / Addcom" value={recapData?.recapData.brokerage} onChange={(v: any) => handleChange('brokerage', v)} locked={isLockedForEditing} />
                     <Row label="Freight beneficiary" value={recapData?.recapData.freightBeneficiary} onChange={(v: any) => handleChange('freightBeneficiary', v)} locked={isLockedForEditing} />
                 </Section>
                 
                 <Section title="3. VESSEL">
                     <Row label="Vessel" value={recapData?.recapData.vesselName} onChange={(v: any) => handleChange('vesselName', v)} locked={isLockedForEditing} />
                     <Row label="DWT / Draft" value={recapData?.recapData.dwtDraft} onChange={(v: any) => handleChange('dwtDraft', v)} locked={isLockedForEditing} />
                     <Row label="Gear / Holds" value={recapData?.recapData.gearHolds} onChange={(v: any) => handleChange('gearHolds', v)} locked={isLockedForEditing} />
                     <Row label="Open position" value={recapData?.recapData.openPosition} onChange={(v: any) => handleChange('openPosition', v)} locked={isLockedForEditing} />
                     <Row label="Itinerary" value={recapData?.recapData.itinerary} onChange={(v: any) => handleChange('itinerary', v)} locked={isLockedForEditing} />
                     <Row label="Certificates" value={recapData?.recapData.certificates} onChange={(v: any) => handleChange('certificates', v)} locked={isLockedForEditing} />
                     <Row label="Suitability" value={recapData?.recapData.suitability} onChange={(v: any) => handleChange('suitability', v)} locked={isLockedForEditing} />
                 </Section>

                 <Section title="4. CARGO / QUANTITY">
                     <Row label="Cargo" value={recapData?.recapData.cargo} onChange={(v: any) => handleChange('cargo', v)} locked={isLockedForEditing} />
                     <Row label="Quantity" value={recapData?.recapData.quantity} onChange={(v: any) => handleChange('quantity', v)} locked={isLockedForEditing} />
                     <Row label="Stowage factor" value={recapData?.recapData.stowageFactor} onChange={(v: any) => handleChange('stowageFactor', v)} locked={isLockedForEditing} />
                     <Row label="Cargo condition" value={recapData?.recapData.cargoCondition} onChange={(v: any) => handleChange('cargoCondition', v)} locked={isLockedForEditing} />
                     <Row label="Cargo documents" value={recapData?.recapData.cargoDocuments} onChange={(v: any) => handleChange('cargoDocuments', v)} locked={isLockedForEditing} />
                 </Section>
                 
                 <Section title="5. LOAD / DISCHARGE">
                     <Row label="Load port(s)" value={recapData?.recapData.loadPort} onChange={(v: any) => handleChange('loadPort', v)} locked={isLockedForEditing} />
                     <Row label="Discharge port(s)" value={recapData?.recapData.dischargePort} onChange={(v: any) => handleChange('dischargePort', v)} locked={isLockedForEditing} />
                     <Row label="Laycan" value={recapData?.recapData.laycan} onChange={(v: any) => handleChange('laycan', v)} locked={isLockedForEditing} />
                     <Row label="NOR" value={recapData?.recapData.nor} onChange={(v: any) => handleChange('nor', v)} locked={isLockedForEditing} />
                     <Row label="Loading rate" value={recapData?.recapData.loadingRate} onChange={(v: any) => handleChange('loadingRate', v)} locked={isLockedForEditing} />
                     <Row label="Discharging rate" value={recapData?.recapData.dischargingRate} onChange={(v: any) => handleChange('dischargingRate', v)} locked={isLockedForEditing} />
                     <Row label="Stevedores" value={recapData?.recapData.stevedores} onChange={(v: any) => handleChange('stevedores', v)} locked={isLockedForEditing} />
                     <Row label="Agents" value={recapData?.recapData.agents} onChange={(v: any) => handleChange('agents', v)} locked={isLockedForEditing} />
                 </Section>
                 
                 <Section title="6. FREIGHT / PAYMENT / LAYTIME">
                     <Row label="Freight" value={recapData?.recapData.freight} onChange={(v: any) => handleChange('freight', v)} locked={isLockedForEditing} />
                     <Row label="Freight payable" value={recapData?.recapData.freightPayable} onChange={(v: any) => handleChange('freightPayable', v)} locked={isLockedForEditing} />
                     <Row label="Taxes / dues" value={recapData?.recapData.taxesDues} onChange={(v: any) => handleChange('taxesDues', v)} locked={isLockedForEditing} />
                     <Row label="Laytime" value={recapData?.recapData.laytime} onChange={(v: any) => handleChange('laytime', v)} locked={isLockedForEditing} />
                     <Row label="Demurrage" value={recapData?.recapData.demurrage} onChange={(v: any) => handleChange('demurrage', v)} locked={isLockedForEditing} />
                     <Row label="Despatch" value={recapData?.recapData.despatch} onChange={(v: any) => handleChange('despatch', v)} locked={isLockedForEditing} />
                     <Row label="Detention / waiting" value={recapData?.recapData.detentionWaiting} onChange={(v: any) => handleChange('detentionWaiting', v)} locked={isLockedForEditing} />
                 </Section>
                 
                 <div className="bg-blue-900 text-white font-bold text-[10px] uppercase p-1 px-2 mt-4">7. CORE TERMS / PROTECTIVE CLAUSES</div>
                 <div className="text-[9px] md:text-[10px] pl-4 list-disc list-inside space-y-1">
                   <li>All terms subject to Owners and Charterers final approval until all subjects are lifted in writing.</li>
                   <li>Cargo to be loaded, stowed, trimmed, lashed, secured and discharged as per CP terms and local port regulations.</li>
                   <li>Commission/brokerage payable on freight, deadfreight and demurrage where applicable.</li>
                 </div>
                 
                 <div className="bg-blue-900 text-white font-bold text-[10px] uppercase p-1 px-2 mt-4">8. CONFIRMATION BLOCK</div>
                 <div className="flex flex-col sm:flex-row sm:justify-between border border-gray-300 mt-2 p-3 md:p-4 gap-4 sm:gap-0">
                    <div className="w-full sm:w-1/2 sm:border-r border-gray-300 sm:pr-4">
                       <div className="font-bold border-b border-gray-200 pb-2 mb-2">For Owners / Disponent Owners</div>
                       <div className="text-[10px] mb-2 font-bold text-gray-500">
                           STATUS: {vesselConfirmed ? `CONFIRMED` : `PENDING`}
                       </div>
                       <div>Name: {vesselConfirmed ? 'Signed electronically in Desk Network' : '______________________'}</div>
                       <div className="mt-2">Title: {vesselConfirmed ? 'Authorized Representative' : '______________________'}</div>
                       <div className="mt-2">Date: {vesselConfirmed && recapData?.confirmations?.vesselSide?.confirmedAt ? new Date(recapData.confirmations.vesselSide.confirmedAt.seconds * 1000).toLocaleString() : '______________________'}</div>
                    </div>
                    <div className="w-full sm:w-1/2 sm:pl-4 border-t sm:border-t-0 border-gray-300 pt-4 sm:pt-0">
                       <div className="font-bold border-b border-gray-200 pb-2 mb-2">For Charterers</div>
                       <div className="text-[10px] mb-2 font-bold text-gray-500">
                           STATUS: {cargoConfirmed ? `CONFIRMED` : `PENDING`}
                       </div>
                       <div>Name: {cargoConfirmed ? 'Signed electronically in Desk Network' : '______________________'}</div>
                       <div className="mt-2">Title: {cargoConfirmed ? 'Authorized Representative' : '______________________'}</div>
                       <div className="mt-2">Date: {cargoConfirmed && recapData?.confirmations?.cargoSide?.confirmedAt ? new Date(recapData.confirmations.cargoSide.confirmedAt.seconds * 1000).toLocaleString() : '______________________'}</div>
                    </div>
                 </div>

                 <div className="mt-8 pt-4 border-t border-gray-300 text-[10px] md:text-[11px]">
                   <div className="font-bold">Best regards,</div>
                   <div className="font-bold">Roman Kovalevskyi</div>
                   <div>Founder & Chartering Lead</div>
                   <div className="font-bold">OceanPact Chartering</div>
                   <div>chartering@oceanpactgroup.com | +380 99 256 2468</div>
                 </div>
                 
               </div>
               
               <div className="mt-8 text-center text-[7px] md:text-[8px] text-gray-400">
                  <p>Broker-side recap confirmation confirms that both Desk Network participants agree to the working recap draft inside the platform.<br/>Final fixture, charter party and principal approvals remain subject to separate written confirmation.</p>
               </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, children }: any) => (
  <div className="mb-4">
     <div className="bg-blue-900 text-white font-bold text-[10px] uppercase p-1 px-2">{title}</div>
     <div className="border border-gray-300 border-t-0 divide-y divide-gray-200">
        {children}
     </div>
  </div>
);

const Row = ({ label, value, onChange, hint, locked }: any) => (
  <div className="flex flex-col sm:flex-row sm:items-center min-h-[32px] group">
     <div className="w-full sm:w-1/3 bg-gray-100 font-bold text-[9px] md:text-[10px] p-2 sm:self-stretch sm:border-r border-gray-200 flex items-center border-b sm:border-b-0">
       {label}
     </div>
     <div className="w-full sm:w-2/3 p-1 flex items-center gap-2">
       <input 
         value={value || ''} 
         onChange={(e) => onChange(e.target.value)} 
         disabled={locked}
         className="w-full text-[10px] p-1.5 md:p-1 font-mono outline-none bg-transparent group-hover:bg-gray-50 focus:bg-yellow-50 focus:border-yellow-200 transition-colors disabled:opacity-80 disabled:cursor-not-allowed"
       />
       {hint && <span className="text-[8px] text-gray-400 italic pr-2 whitespace-nowrap hidden sm:block">{hint}</span>}
     </div>
  </div>
);

