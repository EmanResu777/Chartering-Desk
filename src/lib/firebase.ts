import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, OAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { useState, useEffect } from 'react';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); // CRITICAL
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Custom hook to use Auth
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, loading };
}

export async function loginWithEmail(email: string) {
  alert("Email-based auth not yet configured. Please sign in with Google.");
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (e: any) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      return; // User cancelled
    }
    console.error("Login failed:", e);
    alert("Login failed: " + e.message + "\n\nIf you're using this inside a pop-up blocker or iframe, please open the application in a new tab using the Open in New Tab button at the top right.");
  }
}

export async function loginWithApple() {
  const provider = new OAuthProvider('apple.com');
  
  /* 
   * Developer Note for Apple Sign-In Configuration:
   * 1. Apple Developer account required with "Sign in with Apple" capability enabled on App ID.
   * 2. Service ID configured with Web Authentication, specifying authorized Return URLs matching Firebase (e.g. https://your-project.firebaseapp.com/__/auth/handler).
   * 3. Firebase Auth configured with Apple provider (using Service ID, Team ID, Key ID, and Private Key).
   * 4. App domain must be authorized in both Firebase Authentication settings and Apple Developer Console.
   */

  try {
    provider.addScope('email');
    provider.addScope('name');
    await signInWithPopup(auth, provider);
  } catch (e: any) {
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
      return; // User cancelled
    }
    console.error("Apple Login failed:", e);
    alert("Apple Sign-In is not fully configured or failed. Please check developer settings or try Google sign-in.");
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("Logout failed:", e);
  }
}
