import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, useAuth } from './firebase';
import { collection, query, onSnapshot, setDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useNotification } from './NotificationContext';

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  myRole?: string;
  trialEndsAt?: any;
}

export interface WorkspaceMember {
  userId: string;
  role: 'admin' | 'broker' | 'viewer';
  email: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  loading: boolean;
  createWorkspace: (name: string) => Promise<string>;
  inviteMember: (email: string, role: string) => Promise<void>;
  updateMemberRole: (userId: string, role: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  currentWorkspace: null,
  setCurrentWorkspace: () => {},
  loading: true,
  createWorkspace: async () => '',
  inviteMember: async () => {},
  updateMemberRole: async () => {},
  removeMember: async () => {}
});

export const useWorkspace = () => useContext(WorkspaceContext);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const { notify } = useNotification();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setLoading(false);
      return;
    }

    // We fetch all workspaces where the user is a member
    // In Firestore, creating a collectionGroup or just finding all workspaces might require an index, 
    // but the easiest approach is to have a "userWorkspaces" index or store workspaceIds on the user document.
    // For now, let's keep it simple: fetch user profile, get their workspaceIds, then fetch those workspaces.
    
    let unsubUser: (() => void) | null = null;
    let unsubWorkspaces: (() => void)[] = [];

    const setupUser = async () => {
      // Create user doc if not exists
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          email: user.email,
          createdAt: serverTimestamp()
        }, { merge: true });
        
        // Auto create personal workspace
        await createNewWorkspace("My Organization");
      }

      // Maintain email-to-uid mapping for invitations
      if (user.email) {
        await setDoc(doc(db, 'userEmails', user.email.toLowerCase()), { uid: user.uid }, { merge: true });
      }
    };

    const subscribeToWorkspaces = () => {
      // Instead of complex queries, let's just query the user's workspaces
      const q = query(collection(db, `users/${user.uid}/memberships`));
      unsubUser = onSnapshot(q, async (snapshot) => {
        const workspaceIds = snapshot.docs.map(d => d.id);
        
        if (workspaceIds.length === 0 && !loading) {
            setWorkspaces([]);
            if (currentWorkspace) setCurrentWorkspace(null);
            return;
        }

        const loadedWorkspaces: Workspace[] = [];
        const promises = snapshot.docs.map(async (membershipDoc) => {
          const id = membershipDoc.id;
          const role = membershipDoc.data().role || 'broker';
          const wDoc = await getDoc(doc(db, 'workspaces', id));
          if (wDoc.exists()) {
             loadedWorkspaces.push({ id: wDoc.id, ...wDoc.data(), myRole: role } as Workspace);
          }
        });
        
        await Promise.all(promises);
        setWorkspaces(loadedWorkspaces);
        
        if (!currentWorkspace && loadedWorkspaces.length > 0) {
          setCurrentWorkspace(loadedWorkspaces[0]);
        } else if (currentWorkspace && !loadedWorkspaces.find(w => w.id === currentWorkspace.id)) {
            setCurrentWorkspace(loadedWorkspaces[0] || null);
        }
        
        setLoading(false);
      }, (err) => console.error("workspaces snap error", err));
    };

    setLoading(true);
    setupUser().then(() => {
        subscribeToWorkspaces();
    });

    return () => {
      if (unsubUser) unsubUser();
    };
  }, [user, authLoading]);

  const createNewWorkspace = async (name: string) => {
    if (!user) return '';
    try {
      const workspaceRef = doc(collection(db, 'workspaces'));
      
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);

      await setDoc(workspaceRef, {
        name,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        trialEndsAt: trialEndsAt
      });

      // Add user to workspace members
      await setDoc(doc(db, `workspaces/${workspaceRef.id}/members`, user.uid), {
        role: 'admin',
        email: user.email,
        createdAt: serverTimestamp()
      });

      // Track membership in user's profile
      await setDoc(doc(db, `users/${user.uid}/memberships`, workspaceRef.id), {
        role: 'admin',
        joinedAt: serverTimestamp()
      });

      notify({ type: 'success', title: 'Workspace created', message: 'Successfully created new workspace' });
      return workspaceRef.id;
    } catch (e: any) {
      console.error("Failed to create workspace:", e);
      notify({ type: 'error', title: 'Action Failed', message: "Error: " + (e.message || "Could not create workspace") });
      return '';
    }
  };

  const inviteMember = async (email: string, role: string) => {
    if (!currentWorkspace) return;
    try {
      const emailDoc = await getDoc(doc(db, 'userEmails', email.toLowerCase()));
      if (!emailDoc.exists()) {
        notify({ type: 'error', title: 'Invitation failed', message: "User with that email has not signed up yet." });
        return;
      }
      const newUserId = emailDoc.data().uid;

      await setDoc(doc(db, `workspaces/${currentWorkspace.id}/members`, newUserId), {
        role,
        email,
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, `users/${newUserId}/memberships`, currentWorkspace.id), {
        role,
        joinedAt: serverTimestamp()
      }, { merge: true });

      notify({ type: 'success', title: 'Success', message: 'User invited successfully!' });
    } catch (e: any) {
      console.error("Failed to invite user:", e);
      notify({ type: 'error', title: 'Action Failed', message: "Error: " + (e.message || "Could not invite user") });
    }
  };

  const updateMemberRole = async (userId: string, role: string) => {
    if (!currentWorkspace) return;
    try {
      await setDoc(doc(db, `workspaces/${currentWorkspace.id}/members`, userId), { role }, { merge: true });
      await setDoc(doc(db, `users/${userId}/memberships`, currentWorkspace.id), { role }, { merge: true });
      notify({ type: 'success', title: 'Success', message: 'Role updated successfully' });
    } catch (e: any) {
      console.error("Failed to update role:", e);
      notify({ type: 'error', title: 'Action Failed', message: "Error: " + (e.message || "Could not update role") });
    }
  };

  const removeMember = async (userId: string) => {
    if (!currentWorkspace) return;
    try {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, `workspaces/${currentWorkspace.id}/members`, userId));
      await deleteDoc(doc(db, `users/${userId}/memberships`, currentWorkspace.id));
      notify({ type: 'success', title: 'Removed', message: 'Member removed successfully' });
    } catch (e: any) {
      console.error("Failed to remove member:", e);
      notify({ type: 'error', title: 'Action Failed', message: "Error: " + (e.message || "Could not remove member") });
    }
  };

  return (
    <WorkspaceContext.Provider value={{ 
      workspaces, 
      currentWorkspace, 
      setCurrentWorkspace, 
      loading: authLoading || loading, 
      createWorkspace: createNewWorkspace,
      inviteMember,
      updateMemberRole,
      removeMember
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
