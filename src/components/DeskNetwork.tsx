import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Share2, Package2, Ship, Send, ExternalLink, X, Info, MessageSquare, Users, Mail, Search, Check, Ban, Zap, FileText, Bot } from 'lucide-react';
import { cn, Cargo, Vessel } from '../lib/utils';
import { useAuth, db } from '../lib/firebase';
import { unshareItem, updateSharedItem } from '../lib/networkService';
import { isActiveUrgent } from '../lib/urgentDeals';
import { useNotification } from '../lib/NotificationContext';
import { collection, query, where, onSnapshot, setDoc, doc, serverTimestamp, getDocs, updateDoc, getDoc, orderBy, arrayUnion } from 'firebase/firestore';

import { RecapModal } from './RecapModal';
import { MarketRequestsTab } from './MarketRequests/MarketRequestsTab';
import { AIDealBriefCard } from './AIDealBriefCard';
import { CounterpartyLinker } from './CounterpartyLinker';
import { VoyageEstimateSection } from './VoyageEstimateSection';
import { OpportunityMap } from './OpportunityMap';

interface DeskNetworkProps {
  networkState?: any;
}

export const DeskNetwork: React.FC<DeskNetworkProps> = ({ networkState }) => {
  const { user } = useAuth();
  const { notify } = useNotification();
  const [activeTab, setActiveTab] = useState<'FEED' | 'SEARCH_REQUESTS' | 'AVAILABLE_VESSELS' | 'MY_CARGO' | 'MY_TONNAGE' | 'PROPOSALS' | 'CONTACTS' | 'INVITES' | 'SEARCH' | 'HOT_OPPS' | 'RECAPS'>('FEED');
  const [sharedItems, setSharedItems] = useState<any[]>([]);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [contactsIds, setContactsIds] = useState<string[]>([]);
  const [networkSearchQuery, setNetworkSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [showProposalModal, setShowProposalModal] = useState<any>(null);
  const [proposalMessage, setProposalMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [recaps, setRecaps] = useState<any[]>([]);
  const [showRecapModal, setShowRecapModal] = useState<any>(null); // holds deal object
  const [recapDraftData, setRecapDraftData] = useState<any>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [urgentOpps, setUrgentOpps] = useState<any[]>([]);
  const [filterByWatchlist, setFilterByWatchlist] = useState<boolean>(false);
  const [activeWatchlists, setActiveWatchlists] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, 'watchlists'), where('createdByUid', '==', user.uid), where('status', '==', 'active')), (snap) => {
       setActiveWatchlists(snap.docs.map(d => d.data()));
    });
    return () => unsub();
  }, [user]);
  const [marketMatches, setMarketMatches] = useState<any[]>([]);

  // Selection state
  const [selectedMyItem, setSelectedMyItem] = useState<any>(null);
  const [showUrgentModal, setShowUrgentModal] = useState(false);
  const [urgentReason, setUrgentReason] = useState('');
  const [urgentUntil, setUrgentUntil] = useState('');
  const [urgentType, setUrgentType] = useState('prompt');
  const [urgentNote, setUrgentNote] = useState('');
  const [urgentDeals, setUrgentDeals] = useState<any[]>([]);

  // Handle Tab Switch
  useEffect(() => {
    setSelectedMyItem(null);
  }, [activeTab]);

  // Fetch Market Matches
  useEffect(() => {
    if (!user) return;
    const unsubVessel = onSnapshot(
      query(collection(db, 'marketMatches'), where('vesselOwnerUid', '==', user.uid)),
      (snap) => {
        const matches: any[] = [];
        snap.forEach(d => matches.push({ ...d.data(), id: d.id }));
        setMarketMatches(prev => {
          const others = prev.filter(p => p.vesselOwnerUid !== user.uid);
          return [...others, ...matches];
        });
      }
    );
    const unsubCargo = onSnapshot(
      query(collection(db, 'marketMatches'), where('cargoOwnerUid', '==', user.uid)),
      (snap) => {
        const matches: any[] = [];
        snap.forEach(d => matches.push({ ...d.data(), id: d.id }));
        setMarketMatches(prev => {
          const others = prev.filter(p => p.cargoOwnerUid !== user.uid);
          return [...others, ...matches];
        });
      }
    );
    return () => { unsubVessel(); unsubCargo(); };
  }, [user]);

  // Fetch Urgent Opps & Deals
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, `users/${user.uid}/urgentNotifications`),
      orderBy('createdAt', 'desc')
    );
    const unsubNotif = onSnapshot(q, (snap: any) => {
      const opps: any[] = [];
      snap.forEach((d: any) => opps.push({id: d.id, ...d.data()}));
      setUrgentOpps(opps);
    }, (err: any) => console.log('Urgent opps fetch error:', err));

    const dealQVessel = query(collection(db, 'deskNetworkUrgentDeals'), where('vesselOwnerUid', '==', user.uid));
    const dealQCargo = query(collection(db, 'deskNetworkUrgentDeals'), where('cargoOwnerUid', '==', user.uid));
    
    let dealsMap = new Map();
    const handleDeals = (snap: any) => {
       snap.forEach((d: any) => dealsMap.set(d.id, {id: d.id, ...d.data()}));
       setUrgentDeals(Array.from(dealsMap.values()).sort((a: any, b: any) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
    };
    const unsubVessel = onSnapshot(dealQVessel, handleDeals);
    const unsubCargo = onSnapshot(dealQCargo, handleDeals);

    return () => { unsubNotif(); unsubVessel(); unsubCargo(); };
  }, [user]);

  const handleRevokeVisibility = async () => {
    if (!selectedMyItem || !user) return;
    try {
      if (confirm(`Are you sure you want to revoke network visibility for ${selectedMyItem.itemType}?`)) {
         await unshareItem(selectedMyItem.itemType, { id: selectedMyItem.sourceItemId, sharedItemId: selectedMyItem.id });
         setSelectedMyItem(null);
      }
    } catch (e: any) {
      console.error(e);
      alert('Error revoking visibility: ' + e.message);
    }
  };

  const handleMarkAsUrgent = async () => {
    if (!selectedMyItem || !user) return;
    if (!urgentReason || !urgentUntil) {
       notify({
         title: "Validation Error",
         message: "Reason and expiry (Until) are required.",
         type: "warning"
       });
       return;
    }
    
    try {
      await updateSharedItem(selectedMyItem.itemType, selectedMyItem.id, {
        isUrgent: true,
        urgentReason,
        urgentUntil,
        urgentType,
        urgentNote,
        urgentMarkedBy: user.uid,
        urgentMarkedAt: serverTimestamp(),
        urgentStatus: 'active'
      });
      setShowUrgentModal(false);
      setUrgentReason('');
      setUrgentUntil('');
      setUrgentNote('');
      notify({
        title: "Marked as Urgent",
        message: `Urgent ${selectedMyItem.itemType} is now active until ${new Date(urgentUntil).toLocaleDateString()}`,
        type: "success"
      });
      // Clear selectedMyItem after marking urgent
      setSelectedMyItem(null);
    } catch (e: any) {
      console.error("Mark urgent error:", e);
      notify({
        title: "Update Failed",
        message: "Failed to mark as urgent: " + e.message,
        type: "error"
      });
    }
  };

  const handleDismissNotification = async (opp: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/urgentNotifications`, opp.id), {
        status: 'dismissed',
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'deskNetworkUrgentDeals', opp.dealId), {
        auditTrail: arrayUnion({ action: 'notification_dismissed', timestamp: new Date(), actorUid: user.uid, safeMessage: 'User dismissed the urgent notification.' }),
        lastActionAt: serverTimestamp()
      });
    } catch (err) {
      console.warn("Dismiss err", err);
    }
  };

  const handleMatchInterest = async (match: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'marketMatches', match.id), {
         status: 'interested',
         interestedBy: arrayUnion(user.uid),
         audit: arrayUnion({ action: 'interest sent', timestamp: new Date().toISOString(), actor: user.uid })
      });
      notify({ type: 'success', title: 'Interest Sent', message: 'Counterpart has been notified of your interest.' });

      // Identify counterpart
      const counterpartUid = match.vesselOwnerUid === user.uid ? match.cargoOwnerUid : match.vesselOwnerUid;
      import('../lib/alertService').then(({ createAlert }) => {
          createAlert({
             recipientUid: counterpartUid,
             title: 'Market Match Interest',
             message: 'A counterpart has expressed interest in your market match.',
             priority: 'medium',
             category: 'market_request_match',
             actionRoute: '/dashboard'
          }).catch(console.error);
      });
    } catch (e: any) {
      notify({ type: 'error', title: 'Action Failed', message: e.message });
    }
  };

  const handleMatchContact = async (match: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'marketMatches', match.id), {
         status: 'negotiating',
         contactedBy: arrayUnion(user.uid),
         audit: arrayUnion(
           { action: 'contact requested', timestamp: new Date().toISOString(), actor: user.uid },
           { action: 'negotiation started', timestamp: new Date().toISOString(), actor: user.uid }
         )
      });
      // the match document was created from an item
      // itemType 'vessel' means the user who shared it shared a vessel. If the counterparty is contacting them, they are sending a proposal regarding that shared item.
      const counterpartUid = match.vesselOwnerUid === user.uid ? match.cargoOwnerUid : match.vesselOwnerUid;
      const ownerId = match.cargoOwnerUid === user.uid && match.requestType === 'tonnage_search' ? match.vesselOwnerUid : match.cargoOwnerUid === user.uid && match.requestType === 'cargo_search' ? match.vesselOwnerUid : counterpartUid; // fallback

      setShowProposalModal({
         id: match.sharedItemId,
         itemType: match.requestType === 'cargo_search' ? 'vessel' : 'cargo',
         ownerId: counterpartUid,
         commodity: 'Market Match Negotiation',
         vessel_name: 'Market Match Negotiation',
         isMarketMatch: true,
         matchId: match.id
      });

      notify({ type: 'success', title: 'Contact Requested', message: 'You have started negotiations.' });

      import('../lib/alertService').then(({ createAlert }) => {
          createAlert({
             recipientUid: counterpartUid,
             title: 'Contact Requested',
             message: 'A counterpart requested contact regarding your market match.',
             priority: 'high',
             category: 'market_request_match',
             actionRoute: '/dashboard'
          }).catch(console.error);
      });
    } catch (e: any) {
      notify({ type: 'error', title: 'Action Failed', message: e.message });
    }
  };

  const handleMatchDismiss = async (match: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'marketMatches', match.id), {
         dismissedBy: arrayUnion(user.uid),
         audit: arrayUnion({ action: 'dismissed', timestamp: new Date().toISOString(), actor: user.uid })
      });
    } catch (e: any) {
      console.warn("Dismiss err", e);
    }
  };

  const handleExpressInterest = async (opp: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/urgentNotifications`, opp.id), {
        status: 'interested',
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'deskNetworkUrgentDeals', opp.dealId), {
        status: 'interest_received',
        interestedByUid: user.uid,
        interestedAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
        auditTrail: arrayUnion({ action: 'interest_created', timestamp: new Date(), actorUid: user.uid, safeMessage: 'User expressed interest in the hot opportunity.' })
      });
      alert('Interest expressed successfully!');

      import('../lib/alertService').then(({ createAlert }) => {
          createAlert({
             recipientUid: opp.creatorUid || opp.ownerUid,
             title: 'Hot Opp Interest',
             message: 'Someone expressed interest in your hot opportunity.',
             priority: 'medium',
             category: 'hot_opp',
             actionRoute: '/dashboard'
          }).catch(console.error);
      });
    } catch (err: any) {
      alert("Failed: " + err.message);
    }
  };

  const handleContact = async (opp: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/urgentNotifications`, opp.id), {
        status: 'contacted',
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'deskNetworkUrgentDeals', opp.dealId), {
        status: 'contacted',
        contactedAt: serverTimestamp(),
        lastActionAt: serverTimestamp(),
        auditTrail: arrayUnion({ action: 'contact_started', timestamp: new Date(), actorUid: user.uid, safeMessage: 'User started contact for negotiation.' })
      });
      alert('Contact started. (Discussion placeholder)');

      import('../lib/alertService').then(({ createAlert }) => {
          createAlert({
             recipientUid: opp.creatorUid || opp.ownerUid,
             title: 'Hot Opp Contact',
             message: 'Someone requested contact for your hot opportunity.',
             priority: 'high',
             category: 'hot_opp',
             actionRoute: '/dashboard'
          }).catch(console.error);
      });
    } catch (err: any) {
      alert("Failed: " + err.message);
    }
  };

  const handleApprove = async (deal: any, side: 'cargoSide' | 'vesselSide') => {
    if (!user) return;
    try {
      const isCargoSide = side === 'cargoSide';
      const oppositeSide = isCargoSide ? 'vesselSide' : 'cargoSide';
      const alreadyDual = deal.approvalStatus === 'dual_approved';
      if (alreadyDual) return;
      
      const newApprovalState = {
        approved: true,
        approvedBy: user.uid,
        approvedAt: new Date()
      };
      
      const otherSideApproved = deal.approvals?.[oppositeSide]?.approved === true;
      let newStatus = deal.status;
      if (otherSideApproved) {
        newStatus = 'dual_approved';
      } else {
        newStatus = isCargoSide ? 'approved_by_cargo_side' : 'approved_by_vessel_side';
      }
      
      await updateDoc(doc(db, 'deskNetworkUrgentDeals', deal.id), {
        status: newStatus,
        [`approvals.${side}`]: newApprovalState,
        approvalStatus: newStatus,
        lastApprovalActionAt: serverTimestamp(),
        lastApprovalActionBy: user.uid,
        ...(otherSideApproved ? { dualApprovedAt: serverTimestamp() } : {}),
        auditTrail: arrayUnion({ action: `${side === 'cargoSide' ? 'cargo' : 'vessel'}_side_approved`, timestamp: new Date(), actorUid: user.uid, safeMessage: `User approved ${side === 'cargoSide' ? 'cargo' : 'vessel'} side.` }),
        ...(otherSideApproved ? { auditTrail: arrayUnion({ action: 'dual_approved', timestamp: new Date(), actorUid: 'system', safeMessage: 'Both sides have approved. Deal is dual approved.' }) } : {})
      });
      
      notify({
        title: "Side Approved",
        message: `${side === 'cargoSide' ? 'Cargo' : 'Vessel'} side approved successfully.`,
        type: "success"
      });
    } catch (err: any) {
      notify({
        title: "Approval Failed",
        message: err.message,
        type: "error"
      });
    }
  };

  const handleRevokeApproval = async (deal: any, side: 'cargoSide' | 'vesselSide') => {
    if (!user) return;
    try {
      const alreadyDual = deal.approvalStatus === 'dual_approved';
      if (alreadyDual) {
        notify({ title: "Locked", message: "Cannot revoke after dual approval.", type: "warning" });
        return;
      }
      
      const newApprovalState = {
        approved: false,
        approvedBy: user.uid,
        revokedAt: new Date()
      };
      
      await updateDoc(doc(db, 'deskNetworkUrgentDeals', deal.id), {
        status: 'ready_for_approval', // or negotiating
        [`approvals.${side}`]: newApprovalState,
        approvalStatus: 'approval_revoked',
        lastApprovalActionAt: serverTimestamp(),
        lastApprovalActionBy: user.uid,
        auditTrail: arrayUnion({ action: `${side === 'cargoSide' ? 'cargo' : 'vessel'}_side_approval_revoked`, timestamp: new Date(), actorUid: user.uid, safeMessage: `User revoked ${side === 'cargoSide' ? 'cargo' : 'vessel'} side approval.` })
      });
      
      notify({
        title: "Approval Revoked",
        message: `${side === 'cargoSide' ? 'Cargo' : 'Vessel'} side approval was revoked.`,
        type: "success"
      });
    } catch (err: any) {
      notify({
        title: "Revoke Failed",
        message: err.message,
        type: "error"
      });
    }
  };

  const handlePushToApproval = async (opp: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'deskNetworkUrgentDeals', opp.dealId || opp.id), {
        status: 'ready_for_approval',
        lastActionAt: serverTimestamp(),
        auditTrail: arrayUnion({ action: 'status_changed', timestamp: new Date(), actorUid: user.uid, safeMessage: 'Deal moved to ready_for_approval.' })
      });
      notify({ title: "Moved to Approval", message: "Deal is ready for dual approval.", type: "success" });
    } catch (err: any) {
      notify({ title: "Failed", message: err.message, type: "error" });
    }
  };

  // Accepted Desk Network connections are stored in the private networkConnections subcollection.
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/networkConnections`));
    const unsubConnections = onSnapshot(q, (snap) => {
      setContactsIds(Array.from(new Set(snap.docs.map(d => d.id).filter(Boolean))));
    }, (err) => {
      console.error("Connection list error:", err);
      setContactsIds([]);
    });
    return () => unsubConnections();
  }, [user]);

  // Fetch Feed
  const contactsIdsString = JSON.stringify(contactsIds);
  useEffect(() => {
    if (!user) return;
    const currentContactIds: string[] = JSON.parse(contactsIdsString);
    
    if (currentContactIds.length === 0) {
      setSharedItems([]);
      setLoading(false);
      return;
    }
    
    // Query shared items only from accepted network connections
    // Firestore 'in' query allows up to 30 items
    const chunks = [];
    for (let i = 0; i < currentContactIds.length; i += 30) {
      chunks.push(currentContactIds.slice(i, i + 30));
    }
    
    const unsubs: any[] = [];
    let allItems: any[] = [];
    
    chunks.forEach((chunk) => {
      const q = query(
        collection(db, 'sharedItems'), 
        where('status', '==', 'active'),
        where('ownerId', 'in', chunk)
      );
      
      const unsub = onSnapshot(q, (snap) => {
        const items: any[] = [];
        snap.forEach(d => items.push({ id: d.id, ...d.data() }));
        
        allItems = [...allItems.filter(i => !chunk.includes(i.ownerId)), ...items];
        // Hide our own items just in case we are in our own connectedTo
        setSharedItems(allItems.filter(i => i.ownerId !== user.uid));
        setLoading(false);
      }, (err) => {
        if (err && err.message && !err.message.includes("permission")) {
          console.error("Feed error:", err);
        }
        setLoading(false);
      });
      unsubs.push(unsub);
    });
    
    return () => {
      unsubs.forEach(u => u());
    };
  }, [user, contactsIdsString]);

  // Fetch My Items
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'sharedItems'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setMyItems(items);
    });
    return () => unsub();
  }, [user]);

  // Fetch Recap Drafts
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/recapDrafts`), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const draftList: any[] = [];
      snap.forEach(d => draftList.push({ id: d.id, ...d.data() }));
      setRecaps(draftList);
      setRecapLoading(false);
    }, (err) => {
      console.log("recap drafts snap blocked:", err.message);
      setRecapLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Fetch Proposals for My Items
  useEffect(() => {
    if (!user) return;
    const fetchProposals = async () => {
      if (myItems.length === 0) {
        setProposals([]);
        return;
      }
      const allProps: any[] = [];
      for (const item of myItems) {
        try {
          const propsSnap = await getDocs(collection(db, `sharedItems/${item.id}/proposals`));
          propsSnap.forEach(d => allProps.push({ id: d.id, ...d.data() }));
        } catch (e: any) {
          if (e && e.message && !e.message.includes("permission")) {
            console.error("Error fetching proposals", e);
          }
        }
      }
      setProposals(allProps);
    };

    fetchProposals();
  }, [myItems, user]);

  // Fetch incoming invites
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/networkInvites`));
    const unsub = onSnapshot(q, (snap) => {
      const allInvites: any[] = [];
      snap.forEach(d => allInvites.push({ id: d.id, ...d.data() }));
      setInvites(allInvites);
    });
    return () => unsub();
  }, [user]);

  const handleAcceptInvite = async (invite: any) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/network/invites/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ inviteId: invite.id })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Unable to accept invite');
      notify({ title: 'Desk Connected', message: 'Network connection accepted for both desks.', type: 'success' });
    } catch (e: any) {
      console.warn("Failed to accept invite:", e.message);
      notify({ title: 'Connection Failed', message: e.message || 'Unable to accept invite', type: 'error' });
    }
  };

  const handleDeclineInvite = async (invite: any) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/networkInvites`, invite.id), {
        status: 'declined',
        updatedAt: serverTimestamp()
      });
    } catch (e: any) {
      console.warn("Failed to decline invite:", e.message);
    }
  };

  const handleSearchNetwork = async () => {
     if (!networkSearchQuery.trim() || !user) return;
     setIsSearching(true);
     setSearchResults([]);
     try {
       const targetId = networkSearchQuery.toUpperCase().trim();
       const docRef = doc(db, 'publicProfiles', targetId);
       const snap = await getDoc(docRef);
       if (snap.exists()) {
          setSearchResults([snap.data()]);
       } else {
          setSearchResults([]);
       }
     } catch (e) {
       console.error("Search failed", e);
     }
     setIsSearching(false);
  };

  const handleSendInvite = async (targetUid: string) => {
    if (!user) return;
    if (targetUid === user.uid) {
        alert("You cannot invite yourself.");
        return;
    }
    
    const inviteId = `INV-${crypto.randomUUID()}`;
    try {
       const senderSnap = await getDoc(doc(db, 'users', user.uid));
       const senderProfile = senderSnap.exists() ? senderSnap.data() : {};
       await setDoc(doc(db, `users/${targetUid}/networkInvites`, inviteId), {
          id: inviteId,
          fromUserId: user.uid,
          fromName: senderProfile.displayName || user.displayName || user.email || 'Broker',
          fromCompany: senderProfile.companyName || '',
          fromEmail: user.email || '',
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          message: 'Would like to connect on Desk Network',
          source: 'desk_id_search'
       });
       alert("Invite sent!");
    } catch (e: any) {
       console.error("Invite send error", e);
       alert("Failed to send invite: " + e.message);
    }
  };

  const handleSubmitProposal = async (type: string) => {
    if (!user || !showProposalModal) return;
    try {
      const propId = `PROP-${crypto.randomUUID()}`;
      await setDoc(doc(db, `sharedItems/${showProposalModal.id}/proposals/${propId}`), {
        sharedItemId: showProposalModal.id,
        ownerId: showProposalModal.ownerId,
        creatorId: user.uid,
        proposalType: type,
        message: proposalMessage,
        relatedCargoId: null, // Basic for Step C
        relatedVesselId: null,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      setShowProposalModal(null);
      setProposalMessage('');
      alert("Proposal sent successfully");
    } catch (e: any) {
      alert("Failed to send proposal: " + e.message);
    }
  };

  const renderSharedVessel = (v: any) => {
    const { active, expired } = isActiveUrgent(v);
    
    return (
    <div 
      onClick={() => activeTab === 'MY_TONNAGE' && setSelectedMyItem(v)}
      className={cn("bg-surface-container border border-outline p-4 group relative flex flex-col gap-3", activeTab === 'MY_TONNAGE' && "cursor-pointer hover:border-primary/50 transition-colors", selectedMyItem?.id === v.id && "border-primary", active && "border-error/50 bg-error/5 shadow-[0_0_15px_rgba(255,100,100,0.1)]")}
    >
      <div className="flex items-center justify-between border-b border-outline/30 pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 border border-primary/30 text-primary">
            <Ship className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">{v.vessel_name || v.name}</div>
              {active && <span className="flex items-center gap-1 bg-error/20 text-error px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold border border-error/30"><Zap size={10} /> Urgent</span>}
              {expired && <span className="bg-surface border border-outline/50 text-on-surface-variant px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold opacity-70">Expired</span>}
            </div>
            <div className="text-[9px] text-on-surface-variant font-mono uppercase italic">{v.vessel_type || 'TYPE UNKNOWN'} • {v.dwt ? `${v.dwt} DWT` : 'DWT UNKNOWN'}</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] bg-tertiary/10 text-tertiary border border-tertiary/20 px-2 py-0.5 font-bold tracking-widest rounded-sm mb-1">SHARED VESSEL</span>
          <span className="text-[9px] text-on-surface-variant font-mono">{v.ownerDisplayName}</span>
        </div>
      </div>
      {active && (
         <div className="bg-error/10 border border-error/20 p-2 text-[9px] font-mono text-error/90 flex flex-col gap-1">
            <span className="uppercase font-bold tracking-widest text-[8px]">⚡ Urgent Requirement</span>
            <span>{v.urgentReason}</span>
            {v.urgentUntil && <span className="opacity-70 mt-1">Valid until: {new Date(v.urgentUntil).toLocaleString()}</span>}
         </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface p-2 border border-outline/50">
          <span className="text-[8px] text-on-surface-variant uppercase block mb-1 font-mono">Open Port</span>
          <span className="text-[10px] text-primary font-bold uppercase">{v.openPort || 'OPEN'}</span>
        </div>
        <div className="bg-surface p-2 border border-outline/50">
          <span className="text-[8px] text-on-surface-variant uppercase block mb-1 font-mono">Open Date</span>
          <span className="text-[10px] text-on-surface font-bold uppercase">{v.openDate || 'PROMPT'}</span>
        </div>
      </div>
      {v.restrictions || v.gear || v.cranes ? (
         <div className="bg-surface p-2 border border-outline/50">
           {v.gear && <div className="text-[9px] font-mono text-on-surface"><span className="text-on-surface-variant">Gear:</span> {v.gear}</div>}
           {v.cranes && <div className="text-[9px] font-mono text-on-surface"><span className="text-on-surface-variant">Cranes:</span> {v.cranes}</div>}
           {v.restrictions && <div className="text-[9px] font-mono text-on-surface"><span className="text-on-surface-variant">Restrictions:</span> {v.restrictions}</div>}
         </div>
      ) : null}
      
      {activeTab === 'FEED' && (
        <div className="flex gap-2 mt-2 pt-3 border-t border-outline/30">
          <button onClick={(e) => { e.stopPropagation(); setShowProposalModal(v); }} className="flex-1 bg-primary/10 hover:bg-primary border border-primary/30 text-primary hover:text-on-primary py-2 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm">
            Express Interest
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowProposalModal(v); }} className="flex-1 bg-tertiary/10 hover:bg-tertiary border border-tertiary/30 text-tertiary hover:text-on-primary py-2 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm">
            Propose Cargo
          </button>
        </div>
      )}
    </div>
  );
  };

  const renderSharedCargo = (c: any) => {
    const { active, expired } = isActiveUrgent(c);
    
    return (
    <div 
      onClick={() => activeTab === 'MY_CARGO' && setSelectedMyItem(c)}
      className={cn("bg-surface-container border border-outline p-4 group relative flex flex-col gap-3", activeTab === 'MY_CARGO' && "cursor-pointer hover:border-primary/50 transition-colors", selectedMyItem?.id === c.id && "border-primary", active && "border-error/50 bg-error/5 shadow-[0_0_15px_rgba(255,100,100,0.1)]")}
    >
      <div className="flex items-center justify-between border-b border-outline/30 pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-tertiary/20 p-2 border border-tertiary/30 text-tertiary">
            <Package2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">{c.commodity || c.raw_commodity}</div>
              {active && <span className="flex items-center gap-1 bg-error/20 text-error px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold border border-error/30"><Zap size={10} /> Urgent</span>}
              {expired && <span className="bg-surface border border-outline/50 text-on-surface-variant px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold opacity-70">Expired</span>}
            </div>
            <div className="text-[9px] text-on-surface-variant font-mono uppercase italic">{c.quantity || `${c.quantity_mt || '?'} MT`}</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] bg-tertiary/10 text-tertiary border border-tertiary/20 px-2 py-0.5 font-bold tracking-widest rounded-sm mb-1">SHARED CARGO</span>
          <span className="text-[9px] text-on-surface-variant font-mono">{c.ownerDisplayName}</span>
        </div>
      </div>
      {active && (
         <div className="bg-error/10 border border-error/20 p-2 text-[9px] font-mono text-error/90 flex flex-col gap-1">
            <span className="uppercase font-bold tracking-widest text-[8px]">⚡ Urgent Requirement</span>
            <span>{c.urgentReason}</span>
            {c.urgentUntil && <span className="opacity-70 mt-1">Valid until: {new Date(c.urgentUntil).toLocaleString()}</span>}
         </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-surface p-2 border border-outline/50">
          <span className="text-[8px] text-on-surface-variant uppercase block mb-1 font-mono">Route</span>
          <span className="text-[10px] text-primary font-bold uppercase">{c.loadPort || 'ANY'} ➝ {c.dischargePort || 'ANY'}</span>
        </div>
        <div className="bg-surface p-2 border border-outline/50">
          <span className="text-[8px] text-on-surface-variant uppercase block mb-1 font-mono">Laycan / Terms</span>
          <span className="text-[10px] text-on-surface font-bold uppercase">{c.laycan || 'PROMPT'} • {c.terms || '?'}</span>
        </div>
      </div>
      {c.special_requirements ? (
         <div className="bg-surface p-2 border border-outline/50">
           <div className="text-[9px] font-mono text-on-surface"><span className="text-on-surface-variant">Reqs:</span> {c.special_requirements}</div>
         </div>
      ) : null}

      {activeTab === 'FEED' && (
        <div className="flex gap-2 mt-2 pt-3 border-t border-outline/30">
          <button onClick={(e) => { e.stopPropagation(); setShowProposalModal(c); }} className="flex-1 bg-primary/10 hover:bg-primary border border-primary/30 text-primary hover:text-on-primary py-2 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm">
            Express Interest
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowProposalModal(c); }} className="flex-1 bg-tertiary/10 hover:bg-tertiary border border-tertiary/30 text-tertiary hover:text-on-primary py-2 text-[9px] font-bold uppercase tracking-widest transition-all rounded-sm">
            Propose Vessel
          </button>
        </div>
      )}
    </div>
  );
  };

  const renderContacts = () => {
    const filteredContacts = contactsIds.filter(id => 
      id.toLowerCase().includes(contactSearchQuery.toLowerCase())
    );

    return (
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
        <div className="relative mb-4">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant" />
          <input 
            className="w-full bg-surface-container border border-outline focus:border-primary focus:ring-0 text-on-surface font-mono text-[11px] text-on-surface/80 pl-8 py-2 placeholder:text-[#2d3f5a] rounded-sm"
            placeholder="SEARCH NETWORK CONTACTS..."
            value={contactSearchQuery}
            onChange={(e) => setContactSearchQuery(e.target.value)}
          />
        </div>
        {filteredContacts.length === 0 ? (
          <div className="text-center py-12 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
             <Users className="h-8 w-8 opacity-20" />
             No network contacts found.
          </div>
        ) : (
          filteredContacts.map(id => (
            <div key={id} className="bg-surface-container border border-outline p-4 rounded-sm flex justify-between items-center">
              <div>
                <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">Network Partner</div>
                <div className="text-[9px] text-on-surface-variant font-mono">ID: {id}</div>
                <div className="text-[8px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 inline-block mt-2 font-bold uppercase">CONNECTED</div>
              </div>
              <div className="flex gap-2">
                <button disabled className="text-[9px] uppercase font-bold text-on-surface-variant border border-outline px-2 py-1 rounded-sm opacity-50">View</button>
                <button disabled className="text-[9px] uppercase font-bold text-error border border-error/50 px-2 py-1 rounded-sm opacity-50">Remove</button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderInvites = () => (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
      {invites.length === 0 ? (
        <div className="text-center py-12 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
           <Mail className="h-8 w-8 opacity-20" />
           No connection requests.
        </div>
      ) : (
        invites.map(invite => (
          <div key={invite.id} className="bg-surface-container border border-outline p-4 rounded-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">{invite.fromName || 'Unknown Sender'}</div>
              <div className="text-[9px] text-on-surface-variant font-mono">{invite.fromCompany || 'Company N/A'} • {invite.fromEmail || 'No email provided'}</div>
              {invite.message && <div className="text-[10px] text-on-surface-variant mt-2 italic">"{invite.message}"</div>}
            </div>
            <div className="flex gap-2 shrink-0">
              {invite.status === 'pending' ? (
                <>
                  <button onClick={() => handleDeclineInvite(invite)} className="flex items-center gap-1 text-[9px] uppercase font-bold text-error border border-error/50 px-3 py-1.5 rounded-sm hover:bg-error/10">
                    <X className="h-3 w-3" /> Decline
                  </button>
                  <button onClick={() => handleAcceptInvite(invite)} className="flex items-center gap-1 text-[9px] uppercase font-bold text-primary border border-primary/50 px-3 py-1.5 rounded-sm hover:bg-primary/10">
                    <Check className="h-3 w-3" /> Accept
                  </button>
                </>
              ) : (
                <span className={cn("text-[9px] uppercase font-bold px-2 py-1 rounded-sm", invite.status === 'accepted' ? "bg-primary/10 text-primary border border-primary/20" : "bg-error/10 text-error border border-error/20")}>
                  {invite.status}
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderProposalsTab = () => (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
      {proposals.length === 0 ? (
        <div className="text-center py-12 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
           <MessageSquare className="h-8 w-8 opacity-20" />
           No proposals received yet.
        </div>
      ) : (
        proposals.map(p => (
           <div key={`${p.sharedItemId}-${p.id}`} className="p-4 border border-outline bg-surface-container rounded-sm">
             <div className="flex justify-between items-start mb-2">
               <div>
                 <div className="text-[10px] font-bold text-tertiary uppercase tracking-widest">{p.proposalType.replace('_', ' ')}</div>
                 <div className="text-[9px] text-on-surface-variant font-mono">FROM: {p.creatorId}</div>
               </div>
               <span className="text-[8px] px-2 py-0.5 bg-surface-container-high border border-outline rounded-sm uppercase tracking-widest text-on-surface-variant">
                 {p.status || 'PENDING'}
               </span>
             </div>
             <div className="text-[12px] text-on-surface bg-surface border border-outline/30 p-3 rounded-sm">
               {p.message || 'No message provided'}
             </div>
           </div>
        ))
      )}
    </div>
  );

  const renderSearch = () => (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
      <div className="flex flex-col gap-2 max-w-md mx-auto mb-6 text-center">
        <p className="text-[10px] text-on-surface-variant font-mono uppercase tracking-widest mb-2">
          Ask another broker for their Broker ID / Desk ID.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter Desk ID (e.g., CDP-7K9Q)"
            value={networkSearchQuery}
            onChange={(e) => setNetworkSearchQuery(e.target.value)}
            className="flex-1 bg-surface-container border border-outline px-3 py-2 text-[12px] font-mono text-on-surface focus:border-primary outline-none uppercase"
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearchNetwork(); }}
          />
          <button 
            onClick={handleSearchNetwork}
            className="bg-primary text-on-primary px-4 py-2 text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 transition-colors hover:opacity-90 rounded-sm"
          >
            {isSearching ? <div className="h-3 w-3 border-2 border-on-primary border-t-transparent rounded-full animate-spin" /> : <Search className="h-4 w-4" />}
            Find
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto space-y-3">
        {searchResults.length === 0 && !isSearching && networkSearchQuery.trim() !== '' && (
          <div className="text-center py-12 text-[10px] text-on-surface-variant font-mono italic">
             No broker found with this Desk ID.
          </div>
        )}
        {searchResults.map(profile => {
           const isSelf = user && profile.uid === user.uid;
           return (
             <div key={profile.deskId} className="p-4 border border-outline bg-surface-container rounded-sm flex items-center justify-between">
               <div>
                 <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">{profile.displayName || 'Unknown Name'}</div>
                 <div className="text-[9px] text-on-surface-variant font-mono">
                    {profile.companyName || 'Independent Broker'} • {profile.role || 'Broker'} 
                    {profile.region ? ` • ${profile.region}` : ''}
                 </div>
                 <div className="text-[10px] text-primary font-mono font-bold mt-1 uppercase tracking-widest">ID: {profile.deskId}</div>
               </div>
               <button 
                 onClick={() => handleSendInvite(profile.uid)}
                 disabled={contactsIds.includes(profile.uid) || isSelf}
                 className={cn(
                   "text-[9px] uppercase font-bold px-3 py-1.5 rounded-sm transition-colors",
                   isSelf || contactsIds.includes(profile.uid) 
                     ? "bg-surface-container-high border border-outline text-on-surface-variant cursor-not-allowed" 
                     : "bg-tertiary/10 text-tertiary border border-tertiary/30 hover:bg-tertiary hover:text-on-primary cursor-pointer"
                 )}
               >
                 {isSelf ? 'This is You' : contactsIds.includes(profile.uid) ? 'Connected' : 'Connect'}
               </button>
             </div>
           );
        })}
      </div>
    </div>
  );

  const renderHotOpps = () => {
    const activeOpps = urgentOpps.filter(o => o.status !== 'dismissed');
    const myDealsOfInterest = urgentDeals.filter(d => (d.status === 'interest_received' || d.status === 'contacted') && d.interestedByUid !== user?.uid);
    const dealsForApproval = urgentDeals.filter(d => ['ready_for_approval', 'approved_by_cargo_side', 'approved_by_vessel_side', 'dual_approved', 'approval_revoked'].includes(d.status));
    
    const activeMarketMatches = marketMatches.filter(m => !(m.dismissedBy || []).includes(user?.uid) && m.status !== 'closed');

    return (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
      
      <div className="mb-4">
        <OpportunityMap items={activeOpps.map(o => ({ 
          id: o.id, 
          name: o.title || (o.commodity ? o.commodity : o.name) || 'Hot Opp', 
          commodity: o.commodity,
          visibility: 'desk_network',
          loadLocation: o.loadLocation,
          dischargeLocation: o.dischargeLocation,
          openingLocation: o.openingLocation,
          loadPort: o.loadPort,
          dischargePort: o.dischargePort,
          openPort: o.openPort,
        }))} itemType="hotOpp" />
      </div>

      {dealsForApproval.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline/30 pb-2">Deals Under Approval</h3>
          {dealsForApproval.map(deal => {
             const isCargoOwner = deal.cargoOwnerUid === user?.uid;
             const isVesselOwner = deal.vesselOwnerUid === user?.uid;
             const isParticipant = isCargoOwner || isVesselOwner;
             const cargoApproved = deal.approvals?.cargoSide?.approved;
             const vesselApproved = deal.approvals?.vesselSide?.approved;
             const isDualApproved = deal.approvalStatus === 'dual_approved';
             
             return (
               <div key={deal.id} className="bg-surface-container border border-outline/50 p-4 rounded-sm flex flex-col gap-3">
                 <div className="flex justify-between items-start">
                   <div>
                     <div className="flex items-center gap-2">
                       <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">
                         {isDualApproved ? '✅ DUAL APPROVED' : 'APPROVAL PENDING'}
                       </div>
                     </div>
                     {isDualApproved && (
                       <div className="text-[9px] text-primary/80 font-mono mt-1 w-full max-w-sm">
                         Dual approval confirms broker-side alignment inside Desk Network. Final shipowner/cargo owner confirmation may still be required.
                       </div>
                     )}
                     <div className="text-[9px] text-on-surface-variant font-mono mt-1">Status: {deal.status.replace(/_/g, ' ').toUpperCase()}</div>
                   </div>
                 </div>
                 <div className="text-[9px] bg-surface/50 p-2 border border-outline/30 font-mono text-on-surface-variant flex flex-col gap-1">
                    <span>Refs: Cargo {deal.cargoItemId} • Vessel {deal.vesselItemId}</span>
                    <div className="flex gap-4 mt-2">
                       <span className={cn("px-2 py-1 border", cargoApproved ? "bg-primary/20 text-primary border-primary/30" : "bg-surface text-on-surface-variant border-outline")}>
                         Cargo Side: {cargoApproved ? 'APPROVED' : 'PENDING'}
                       </span>
                       <span className={cn("px-2 py-1 border", vesselApproved ? "bg-primary/20 text-primary border-primary/30" : "bg-surface text-on-surface-variant border-outline")}>
                         Vessel Side: {vesselApproved ? 'APPROVED' : 'PENDING'}
                       </span>
                    </div>
                 </div>
                 <div className="flex gap-2 mt-2">
                    {isCargoOwner && !cargoApproved && !isDualApproved && (
                      <button onClick={() => handleApprove(deal, 'cargoSide')} className="bg-primary hover:bg-primary/90 text-on-primary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                        Approve Cargo Side
                      </button>
                    )}
                    {isCargoOwner && cargoApproved && !isDualApproved && (
                      <button onClick={() => handleRevokeApproval(deal, 'cargoSide')} className="bg-surface border border-outline hover:bg-error/10 hover:text-error hover:border-error/30 text-on-surface px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                        Revoke Cargo Approval
                      </button>
                    )}
                    {isVesselOwner && !vesselApproved && !isDualApproved && (
                      <button onClick={() => handleApprove(deal, 'vesselSide')} className="bg-primary hover:bg-primary/90 text-on-primary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                        Approve Vessel Side
                      </button>
                    )}
                    {isVesselOwner && vesselApproved && !isDualApproved && (
                      <button onClick={() => handleRevokeApproval(deal, 'vesselSide')} className="bg-surface border border-outline hover:bg-error/10 hover:text-error hover:border-error/30 text-on-surface px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                        Revoke Vessel Approval
                      </button>
                    )}
                    {isDualApproved && (
                      <button onClick={() => setShowRecapModal(deal)} className="bg-tertiary hover:bg-tertiary/90 text-on-primary border border-tertiary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors flex items-center gap-2">
                        <FileText size={10} /> Open Recap Draft
                      </button>
                    )}
                 </div>
               </div>
             );
          })}
        </div>
      )}

      {myDealsOfInterest.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline/30 pb-2">Incoming Interests</h3>
          {myDealsOfInterest.map(deal => (
            <div key={deal.id} className="bg-primary/5 border border-primary/30 p-4 rounded-sm flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                     <div className="text-[12px] font-bold text-primary uppercase tracking-widest">Someone is interested!</div>
                     {deal.status === 'contacted' && <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">Contacted</span>}
                  </div>
                  <div className="text-[9px] text-on-surface-variant font-mono mt-1">They want to start a discussion about this deal.</div>
                </div>
              </div>
              <div className="text-[9px] bg-surface/50 p-2 border border-outline/30 font-mono text-on-surface-variant">
                 Refs: Cargo {deal.cargoItemId} <br/> Vessel {deal.vesselItemId}
              </div>
              <div className="flex gap-2 mt-2">
                 <button className="bg-primary hover:bg-primary/90 text-on-primary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                    Reply / Message
                 </button>
                 {deal.status === 'contacted' && (
                   <button onClick={() => handlePushToApproval(deal)} className="bg-tertiary/10 hover:bg-tertiary border border-tertiary/20 text-tertiary hover:text-on-primary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                     Ready for Approval
                   </button>
                 )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {myDealsOfInterest.length > 0 && <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline/30 pb-2">Your Opportunities</h3>}
        {(activeOpps.length === 0 && activeMarketMatches.length === 0) ? (
          <div className="text-center py-12 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
             <Zap className="h-8 w-8 opacity-20" />
             No hot opportunities or market matches detected yet.
          </div>
        ) : (
          <>
          {activeOpps.map(opp => (
            <div key={opp.id} className="bg-surface-container border border-error/50 bg-error/5 shadow-[0_0_15px_rgba(255,100,100,0.1)] p-4 rounded-sm flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                     <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">{opp.title}</div>
                     <span className="flex items-center gap-1 bg-error/20 text-error px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold border border-error/30"><Zap size={10} /> Urgent</span>
                     {opp.status === 'candidate' && <span className="bg-error/20 text-error px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">New</span>}
                     {opp.status === 'interested' && <span className="bg-primary/20 text-primary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">Interested</span>}
                     {opp.status === 'contacted' && <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">Contacted</span>}
                  </div>
                  <div className="text-[9px] text-on-surface-variant font-mono mt-1">{opp.safeMessage}</div>
                </div>
                <div className="text-[9px] text-on-surface-variant font-mono">
                   {opp.createdAt?.toDate ? new Date(opp.createdAt.toDate()).toLocaleDateString() : ''}
                </div>
              </div>
              
              <div className="text-[9px] bg-surface p-2 border border-outline/30 font-mono text-on-surface-variant flex justify-between items-center">
                 <div>
                   Refs: Cargo {opp.relatedCargoItemId} <br/> Vessel {opp.relatedVesselItemId}
                 </div>
                 <div className="flex gap-2 text-right">
                   {opp.matchScore !== undefined && <span className="bg-primary/10 text-primary border border-primary/20 px-1 py-0.5">Match {Math.round(opp.matchScore)}%</span>}
                   {opp.urgencyScore !== undefined && <span className="bg-error/10 text-error border border-error/20 px-1 py-0.5">Hot {Math.round(opp.urgencyScore)}%</span>}
                 </div>
              </div>

              <div className="mt-2 space-y-4">
                 <CounterpartyLinker itemId={opp.id} itemType="hotOpp" />
                 <VoyageEstimateSection itemId={opp.id} itemType="hot_opp" />
                 <AIDealBriefCard itemId={opp.id} itemType="hotOpp" dealType="Urgent Opportunity" />
              </div>

              <div className="flex flex-wrap gap-2 mt-2">
                 {opp.status === 'candidate' && (
                   <>
                     <button onClick={async () => {
                        const { createDealRoom } = await import('../lib/dealRoomService');
                        await createDealRoom({
                           title: `Hot Opp: ${opp.title}`,
                           status: 'draft',
                           createdByUid: user?.uid || '',
                           linkedHotOppId: opp.id,
                           source: 'Hot Opp'
                        });
                        alert('Deal Room Created! Navigate to Deal Rooms tab to view.');
                     }} className="bg-surface hover:bg-surface-container border border-outline px-3 py-1.5 text-on-surface text-[9px] uppercase tracking-widest font-bold transition-colors">
                        Open Deal Rm
                     </button>
                     <button onClick={() => handleExpressInterest(opp)} className="bg-primary/10 hover:bg-primary border border-primary/20 text-primary hover:text-on-primary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                        I'm Interested
                     </button>
                     <button onClick={() => handleContact(opp)} className="bg-tertiary/10 hover:bg-tertiary border border-tertiary/20 text-tertiary hover:text-on-primary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                        Contact / Start Discussion
                     </button>
                   </>
                 )}
                 {opp.status === 'interested' && (
                   <button onClick={() => handleContact(opp)} className="bg-tertiary/10 hover:bg-tertiary border border-tertiary/20 text-tertiary hover:text-on-primary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                      Make Offer / Contact
                   </button>
                 )}
                 <button onClick={() => handleDismissNotification(opp)} className="bg-surface border border-outline px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold hover:bg-surface-container-high transition-colors">
                    Dismiss
                 </button>
              </div>
            </div>
          ))}
          {activeMarketMatches.map(match => (
             <div key={match.id} className="bg-surface-container border border-primary/30 p-4 rounded-sm flex flex-col gap-3">
                 <div className="flex justify-between items-start">
                   <div>
                     <div className="flex items-center gap-2">
                        <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">
                           {match.requestType === 'cargo_search' ? 'Cargo Search Match' : match.requestType === 'tonnage_search' ? 'Tonnage Search Match' : 'Available Vessel Match'}
                        </div>
                        <span className="bg-primary/20 text-primary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">
                           {match.label || 'Possible Match'}
                        </span>
                        {match.status === 'active' && <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">New</span>}
                        {match.status === 'interested' && match.interestedBy?.includes(user?.uid) && <span className="bg-primary/20 text-primary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">You are interested</span>}
                        {match.status === 'interested' && !match.interestedBy?.includes(user?.uid) && <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">Counterparty is interested</span>}
                        {match.status === 'negotiating' && <span className="bg-secondary/20 text-secondary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">Negotiating</span>}
                     </div>
                     <div className="text-[9px] text-on-surface-variant font-mono mt-1">Found a match for your recent market request or listing.</div>
                   </div>
                   <div className="text-[9px] text-on-surface-variant font-mono">
                      {new Date(match.createdAt).toLocaleDateString()}
                   </div>
                 </div>
                 
                 <div className="text-[9px] bg-surface p-2 border border-outline/30 font-mono text-on-surface-variant flex justify-between items-center">
                    <div>
                      Match Score: {match.matchScore}%
                    </div>
                 </div>

                 <div className="flex flex-wrap gap-2 mt-2">
                    {match.status === 'active' && !match.interestedBy?.includes(user?.uid) && (
                      <button onClick={() => handleMatchInterest(match)} className="bg-primary/10 hover:bg-primary border border-primary/20 text-primary hover:text-on-primary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                         I'm Interested
                      </button>
                    )}
                    {(match.status === 'active' || match.status === 'interested') && !match.contactedBy?.includes(user?.uid) && (
                      <button onClick={() => handleMatchContact(match)} className="bg-tertiary/10 hover:bg-tertiary border border-tertiary/20 text-tertiary hover:text-on-primary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors">
                         Contact / Start Discussion
                      </button>
                    )}
                    {(match.status === 'active' || match.status === 'interested') && (
                      <button onClick={() => handleMatchDismiss(match)} className="bg-surface border border-outline px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold hover:bg-surface-container-high transition-colors">
                         Dismiss
                      </button>
                    )}
                 </div>
             </div>
          ))}
          </>
        )}
      </div>
    </div>
  )};

  const renderRecaps = () => (
    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
      <h3 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline/30 pb-2">Your Recap Drafts</h3>
      {recaps.length === 0 ? (
          <div className="text-center py-12 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
             <FileText className="h-8 w-8 opacity-20" />
             No drafts available.
          </div>
      ) : (
          recaps.map(r => (
            <div key={r.id} className="bg-surface-container border border-outline/50 p-4 rounded-sm flex flex-col gap-3">
              <div className="flex justify-between items-start">
                  <div>
                     <div className="flex items-center gap-2">
                        <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest">
                           RECAP DRAFT: {r.dealId}
                        </div>
                        <span className="bg-secondary/20 text-secondary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">
                           {r.status === 'locked' ? 'LOCKED / CONFIRMED' : r.status || 'DRAFT'}
                        </span>
                        {r.confirmationStatus && r.confirmationStatus !== 'pending' && r.status !== 'locked' && (
                            <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold">
                               1 SIDE CONFIRMED
                            </span>
                        )}
                     </div>
                     <div className="text-[9px] text-on-surface-variant font-mono mt-1 w-full max-w-sm">
                        Last Updated: {r.updatedAt ? new Date(r.updatedAt?.toMillis ? r.updatedAt.toMillis() : Date.now()).toLocaleString() : 'Just now'}
                     </div>
                  </div>
              </div>
              <div className="flex gap-2 mt-2">
                  <button onClick={() => setShowRecapModal(r)} className="bg-tertiary hover:bg-tertiary/90 text-on-primary border border-tertiary px-3 py-1.5 text-[9px] uppercase tracking-widest font-bold transition-colors flex items-center gap-2">
                     <FileText size={10} /> Open Recap Draft
                  </button>
              </div>
            </div>
          ))
      )}
    </div>
  );

  const TABS = [
    { id: 'FEED', label: 'Network Feed', icon: Share2 },
    { id: 'SEARCH_REQUESTS', label: 'Search Requests', icon: Search },
    { id: 'AVAILABLE_VESSELS', label: 'Available Vessels', icon: Ship },
    { id: 'HOT_OPPS', label: 'Hot Opps', icon: Zap },
    { id: 'MY_CARGO', label: 'My Cargo', icon: Package2 },
    { id: 'MY_TONNAGE', label: 'My Tonnage', icon: Ship },
    { id: 'RECAPS', label: 'Recaps', icon: FileText },
    { id: 'PROPOSALS', label: 'Proposals', icon: MessageSquare },
    { id: 'CONTACTS', label: 'Contacts', icon: Users },
    { id: 'INVITES', label: 'Invites', icon: Mail },
    { id: 'SEARCH', label: 'Find Desk', icon: Search }
  ] as const;

  return (
    <div className="flex flex-col md:flex-row h-full bg-surface md:border-l border-outline w-full max-w-full overflow-hidden">
      
      {/* Mobile Tabs */}
      <div className="md:hidden flex overflow-x-auto no-scrollbar border-b border-outline bg-surface-container shrink-0 w-full">
        {TABS.map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 px-4 py-3 text-[10px] uppercase font-bold tracking-widest whitespace-nowrap transition-colors border-b-2",
              activeTab === tab.id ? "text-primary border-primary bg-primary/5" : "text-on-surface-variant border-transparent hover:text-on-surface"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 border-r border-outline flex-col shrink-0 h-full">
        <div className="p-6 border-b border-outline bg-surface-container-high">
          <h2 className="text-[14px] font-bold text-on-surface uppercase tracking-widest flex items-center gap-2">
            <Share2 className="h-4 w-4 text-tertiary" /> Desk Network
          </h2>
          <p className="text-[9px] text-on-surface-variant font-mono mt-2">Secure peer-to-peer maritime intelligence sharing</p>
        </div>
        <div className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto no-scrollbar">
          {TABS.map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full text-left p-3 border text-[10px] uppercase font-bold tracking-widest transition-all flex items-center gap-2 rounded-sm",
                activeTab === tab.id ? "bg-primary/10 border-primary text-primary" : "border-outline/30 text-on-surface-variant hover:border-outline hover:text-on-surface bg-surface"
              )}
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{tab.label}</span>
              {(tab.id === 'PROPOSALS' && proposals.length > 0) && (
                 <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 rounded-full text-[8px]">{proposals.length}</span>
              )}
              {(tab.id === 'INVITES' && invites.filter(i => i.status === 'pending').length > 0) && (
                 <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded-full text-[8px]">{invites.filter(i => i.status === 'pending').length}</span>
              )}
              {(tab.id === 'HOT_OPPS' && urgentOpps.filter(i => i.status === 'candidate').length > 0) && (
                 <span className="bg-tertiary/20 text-tertiary px-1.5 py-0.5 rounded-full text-[8px]">{urgentOpps.filter(i => i.status === 'candidate').length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-container-lowest h-full overflow-hidden">
        <div className="h-14 border-b border-outline bg-surface-container px-6 flex items-center justify-between shrink-0">
          <h3 className="text-[12px] font-bold text-on-surface uppercase tracking-widest flex items-center gap-4">
            {TABS.find(t => t.id === activeTab)?.label || 'Network'}
            {activeTab === 'FEED' && activeWatchlists.length > 0 && (
              <button
                onClick={() => setFilterByWatchlist(!filterByWatchlist)}
                className={cn("text-[9px] px-2 py-1 border rounded-sm font-bold flex items-center gap-1 transition-colors", filterByWatchlist ? "bg-primary border-primary text-black" : "border-outline text-on-surface-variant hover:border-primary")}
              >
                <Bot className="w-3 h-3" /> Matched to Watchlists
              </button>
            )}
          </h3>
        </div>
        
        {activeTab === 'FEED' || activeTab === 'MY_CARGO' || activeTab === 'MY_TONNAGE' ? (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar relative">
            {loading && activeTab === 'FEED' ? (
              <div className="h-full w-full flex items-center justify-center text-on-surface-variant font-mono text-[10px] uppercase tracking-widest">Loading network feed...</div>
            ) : (
              <div className="w-full grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-6 pb-20">
                {(activeTab === 'FEED' 
                  ? sharedItems.filter((item: any) => {
                       if (!filterByWatchlist) return true;
                       return activeWatchlists.some(wl => {
                          if (wl.type === 'cargo' && item.itemType === 'vessel') return false;
                          if (wl.type === 'tonnage' && item.itemType === 'cargo') return false;
                          if (wl.filters?.commodity && item.itemType === 'cargo' && item.commodity && !item.commodity.toLowerCase().includes(wl.filters.commodity.toLowerCase())) return false;
                          if (wl.filters?.loadArea && item.loadPort && !item.loadPort.toLowerCase().includes(wl.filters.loadArea.toLowerCase())) return false;
                          if (wl.filters?.dischargeArea && item.dischargePort && !item.dischargePort.toLowerCase().includes(wl.filters.dischargeArea.toLowerCase())) return false;
                          return true;
                       });
                    })
                  : myItems.filter(item => activeTab === 'MY_CARGO' ? item.itemType === 'cargo' : item.itemType === 'vessel')
                ).map(item => (
                  <React.Fragment key={item.id}>
                    {item.itemType === 'vessel' ? renderSharedVessel(item) : renderSharedCargo(item)}
                  </React.Fragment>
                ))}
                {(activeTab === 'FEED' 
                  ? sharedItems.filter((item: any) => {
                       if (!filterByWatchlist) return true;
                       return activeWatchlists.some(wl => {
                          if (wl.type === 'cargo' && item.itemType === 'vessel') return false;
                          if (wl.type === 'tonnage' && item.itemType === 'cargo') return false;
                          if (wl.filters?.commodity && item.itemType === 'cargo' && item.commodity && !item.commodity.toLowerCase().includes(wl.filters.commodity.toLowerCase())) return false;
                          if (wl.filters?.loadArea && item.loadPort && !item.loadPort.toLowerCase().includes(wl.filters.loadArea.toLowerCase())) return false;
                          if (wl.filters?.dischargeArea && item.dischargePort && !item.dischargePort.toLowerCase().includes(wl.filters.dischargeArea.toLowerCase())) return false;
                          return true;
                       });
                    })
                  : myItems.filter(item => activeTab === 'MY_CARGO' ? item.itemType === 'cargo' : item.itemType === 'vessel')
                ).length === 0 && (
                   <div className="col-span-full text-center py-24 text-[10px] text-on-surface-variant font-mono italic flex flex-col items-center gap-3">
                     <Share2 className="h-8 w-8 opacity-20" />
                     {activeTab === 'FEED' ? 'No incoming shared items visible in your network.' : 'You have not shared any items of this type to the network.'}
                   </div>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'PROPOSALS' ? (
          renderProposalsTab()
        ) : activeTab === 'CONTACTS' ? (
          renderContacts()
        ) : activeTab === 'INVITES' ? (
          renderInvites()
        ) : activeTab === 'HOT_OPPS' ? (
          renderHotOpps()
        ) : activeTab === 'RECAPS' ? (
          renderRecaps()
        ) : activeTab === 'SEARCH' ? (
          renderSearch()
        ) : activeTab === 'SEARCH_REQUESTS' ? (
          <div className="p-4 sm:p-6 overflow-y-auto w-full"><MarketRequestsTab type="search_requests" /></div>
        ) : activeTab === 'AVAILABLE_VESSELS' ? (
          <div className="p-4 sm:p-6 overflow-y-auto w-full"><MarketRequestsTab type="available_vessels" /></div>
        ) : null}
      </div>
      
      {showRecapModal && (
         <RecapModal deal={showRecapModal} user={user} onClose={() => setShowRecapModal(null)} />
      )}

      {/* Proposal Modal */}
      <AnimatePresence>
        {showProposalModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface-container-highest/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md bg-surface-container border border-primary shadow-2xl p-6 relative rounded-sm"
            >
              <button 
                onClick={() => setShowProposalModal(null)}
                className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-[14px] font-bold text-on-surface uppercase tracking-widest mb-4 flex items-center gap-2">
                <Send className="h-4 w-4" /> Submit Proposal
              </h2>
              <div className="mb-6 p-4 bg-surface-container-highest border border-outline rounded-sm">
                <div className="text-[9px] text-on-surface-variant font-mono uppercase mb-2">Target Item</div>
                <div className="text-[12px] font-bold text-tertiary uppercase tracking-widest">
                  {showProposalModal.itemType === 'vessel' ? showProposalModal.vessel_name : showProposalModal.commodity}
                </div>
              </div>
              <textarea
                value={proposalMessage}
                onChange={(e) => setProposalMessage(e.target.value)}
                placeholder="Enter your message or proposal details..."
                className="w-full h-32 bg-surface border border-outline/50 p-4 text-[12px] text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary mb-6 resize-none rounded-sm font-sans"
              />
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handleSubmitProposal('interest')}
                  className="bg-primary hover:bg-primary/90 text-on-primary py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm flex justify-center items-center gap-2"
                >
                  Express Interest
                </button>
                <button 
                  onClick={() => handleSubmitProposal(showProposalModal.itemType === 'vessel' ? 'offer_cargo' : 'offer_vessel')}
                  className="bg-tertiary hover:bg-tertiary/90 text-on-primary py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm flex justify-center items-center gap-2"
                >
                  {showProposalModal.itemType === 'vessel' ? 'Propose Cargo' : 'Propose Vessel'}
                </button>
                <button 
                  onClick={() => handleSubmitProposal('comment')}
                  className="col-span-2 border border-outline/50 hover:bg-surface text-on-surface py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm flex justify-center items-center gap-2"
                >
                  <MessageSquare className="h-3 w-3" /> Add Comment
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Urgent Modal */}
      <AnimatePresence>
        {showUrgentModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-surface-container-highest/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md bg-surface-container border border-error shadow-2xl p-6 relative rounded-sm"
            >
              <button 
                onClick={() => setShowUrgentModal(false)}
                className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface"
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-[14px] font-bold text-on-surface uppercase tracking-widest mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4 text-error" /> Mark as Urgent
              </h2>
              
              <div className="space-y-4 mb-6">
                 <div>
                   <label className="text-[9px] text-on-surface-variant uppercase font-bold tracking-widest mb-1.5 block">Urgent Reason</label>
                   <input value={urgentReason} onChange={e => setUrgentReason(e.target.value)} type="text" placeholder="e.g. Spot open tmrw" className="w-full bg-surface border border-outline px-3 py-2 text-[12px] text-on-surface block focus:border-error focus:ring-0 rounded-sm" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <label className="text-[9px] text-on-surface-variant uppercase font-bold tracking-widest mb-1.5 block">Expires At</label>
                     <input value={urgentUntil} onChange={e => setUrgentUntil(e.target.value)} type="date" className="w-full bg-surface border border-outline px-3 py-2 text-[12px] text-on-surface block focus:border-error focus:ring-0 rounded-sm" />
                   </div>
                   <div>
                     <label className="text-[9px] text-on-surface-variant uppercase font-bold tracking-widest mb-1.5 block">Urgent Type</label>
                     <select value={urgentType} onChange={e => setUrgentType(e.target.value)} className="w-full bg-surface border border-outline px-3 py-2 text-[12px] text-on-surface block focus:border-error focus:ring-0 rounded-sm">
                       <option value="prompt">Prompt</option>
                       <option value="laycan_closing">Laycan Closing</option>
                       <option value="spot_open">Spot Open</option>
                       <option value="short_validity">Short Validity</option>
                       <option value="manually_marked">Other</option>
                     </select>
                   </div>
                 </div>
                 <div>
                   <label className="text-[9px] text-on-surface-variant uppercase font-bold tracking-widest mb-1.5 block">Note (Optional)</label>
                   <textarea value={urgentNote} onChange={e => setUrgentNote(e.target.value)} placeholder="Will take lower rate to fix..." className="w-full h-16 bg-surface border border-outline px-3 py-2 text-[12px] text-on-surface block focus:border-error focus:ring-0 rounded-sm resize-none" />
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setShowUrgentModal(false)}
                  className="border border-outline/50 hover:bg-surface text-on-surface py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm flex justify-center items-center gap-2"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleMarkAsUrgent}
                  className="bg-error hover:bg-error/90 text-on-primary py-3 text-[10px] font-bold uppercase tracking-widest transition-all rounded-sm flex justify-center items-center gap-2"
                >
                  Confirm Urgent
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Bar for My Items Selection */}
      <AnimatePresence>
        {selectedMyItem && (() => {
          const { active: selectedActive } = isActiveUrgent(selectedMyItem);
          return (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 lg:left-64 bg-surface-container-high border-t border-primary/20 p-3 md:p-4 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-[90] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 md:gap-0"
          >
            <div className="flex-1 flex items-center gap-4 min-w-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                 {selectedMyItem.itemType === 'vessel' ? <Ship className={cn("h-5 w-5 shrink-0", selectedActive ? "text-error" : "text-primary")} /> : <Package2 className={cn("h-5 w-5 shrink-0", selectedActive ? "text-error" : "text-tertiary")} />}
                 <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-on-surface-variant font-mono uppercase">Selected Item</div>
                    <div className="text-[12px] font-bold text-on-surface uppercase tracking-widest flex items-center gap-2 min-w-0">
                       <span className="truncate">{selectedMyItem.commodity || selectedMyItem.vessel_name || 'Item'}</span>
                       {selectedActive && <span className="shrink-0 flex items-center gap-1 bg-error/20 text-error px-1.5 py-0.5 text-[8px] uppercase tracking-widest font-bold border border-error/30"><Zap size={10} /> Urgent</span>}
                    </div>
                 </div>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto shrink-0 pb-1 md:pb-0 scrollbar-hide">
               <button onClick={() => setSelectedMyItem(null)} className="text-on-surface-variant p-2 mr-2 shrink-0"><X className="h-4 w-4" /></button>
               
               <button 
                  onClick={handleRevokeVisibility}
                  className="bg-error/10 border border-error/50 px-4 py-2 text-[9px] uppercase font-bold text-error whitespace-nowrap hover:bg-error/20 transition-colors shrink-0"
               >
                 Revoke Visibility
               </button>
               <button 
                  onClick={() => setShowUrgentModal(true)}
                  className="bg-error text-on-primary px-4 py-2 text-[9px] uppercase font-bold whitespace-nowrap hover:bg-error/90 transition-colors flex items-center gap-1 shrink-0"
               >
                 <Zap className="h-3 w-3" /> {selectedActive ? 'Update Urgent' : 'Mark Urgent'}
               </button>
            </div>
          </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};
