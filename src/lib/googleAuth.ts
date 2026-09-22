/// <reference types="vite/client" />

import { auth } from './firebase';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let accessToken: string | null = null;
let tokenExpiry: number = 0;
let authPromise: Promise<string> | null = null;

export const getAccessToken = async (forcePopup: boolean = false): Promise<string> => {
  if (!forcePopup && accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  if (authPromise) {
    return authPromise;
  }

  const userId = auth.currentUser?.uid;

  if (!forcePopup && userId) {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/auth/token', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          accessToken = data.access_token;
          tokenExpiry = data.expiry_date || (Date.now() + (data.expires_in || 3600) * 1000);
          return accessToken!;
        }
      }
    } catch (e) {
      console.warn("Server-side token refresh failed, falling back to popup", e);
    }
  }

  authPromise = new Promise<string>((resolve, reject) => {
    if (!CLIENT_ID) {
      authPromise = null;
      reject(new Error('VITE_GOOGLE_CLIENT_ID is not configured in environment variables.'));
      return;
    }

    // 1. Fetch the Auth URL from our server. The server derives the user from
    // the verified Firebase token and creates a one-time OAuth state.
    if (!auth.currentUser) {
      authPromise = null;
      reject(new Error('Please sign in to Chartering Desk before connecting Gmail.'));
      return;
    }

    auth.currentUser.getIdToken()
      .then(idToken => fetch('/api/auth/google-url', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      }))
      .then(res => {
        if (!res.ok) {
          return res.json().catch(() => ({})).then(body => {
            throw new Error(body.error || 'Failed to start Google authorization');
          });
        }
        return res.json();
      })
      .then(data => {
        if (!data.url) throw new Error("Failed to get authorization URL");

        // 2. Open the provider's URL directly in a popup
        const width = 500;
        const height = 600;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        
        const authWindow = window.open(
          data.url,
          'google_auth_popup',
          `width=${width},height=${height},top=${top},left=${left}`
        );

        if (!authWindow) {
          authPromise = null;
          reject(new Error("Popup blocked. Please allow popups for this site."));
          return;
        }

        let isSuccess = false;

        const cleanup = () => {
          window.removeEventListener('message', messageHandler);
          clearInterval(checkClosed);
          authPromise = null;
        };

        // 3. Listen for the message from the callback page
        const messageHandler = (event: MessageEvent) => {
          if (event.origin !== window.location.origin || event.source !== authWindow) {
            return;
          }
          if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
            console.log("Auth success message received via postMessage");
            const tokens = event.data.tokens;
            accessToken = tokens.access_token;
            
            if (tokens.expiry_date) {
              tokenExpiry = tokens.expiry_date;
            } else if (tokens.expires_in) {
              tokenExpiry = Date.now() + (tokens.expires_in * 1000);
            } else {
              tokenExpiry = Date.now() + 3600 * 1000;
            }
            
            isSuccess = true;
            cleanup();
            resolve(accessToken!);
          } else if (event.data?.type === 'GOOGLE_AUTH_ERROR') {
            console.error("Auth error message received:", event.data.error);
            cleanup();
            let errorMessage = "Authentication failed on server.";
            if (event.data.error) {
               if (typeof event.data.error === 'string') {
                 errorMessage = event.data.error;
               } else if (event.data.error.message) {
                 errorMessage = event.data.error.message;
                 if (event.data.error.requestId) {
                   errorMessage += ` (Request ID: ${event.data.error.requestId})`;
                 }
               } else {
                 try {
                   errorMessage = JSON.stringify(event.data.error);
                 } catch (e) {}
               }
            }
            reject(new Error(errorMessage));
          }
        };

        window.addEventListener('message', messageHandler);

        // 4. Polling fallback for localStorage (REMOVED FOR SECURITY)

        // 5. Track window closure
        const checkClosed = setInterval(() => {
          if (authWindow.closed) {
            console.log("Auth window detected as closed. Checking for success...");
            
            // Wait slightly longer to allow any pending messages/storage to be processed
            setTimeout(() => {
              if (!isSuccess) {
                console.warn("Auth window closed without acquiring token.");
                cleanup();
                reject(new Error("Authentication window closed. Ensure you complete the login process and allow the popup to redirect back."));
              }
            }, 2500);
          }
        }, 1000);
      })
      .catch(reject);
  });

  authPromise.finally(() => {
    authPromise = null;
  });

  return authPromise;
};

export const isAuthenticated = () => accessToken !== null && Date.now() < tokenExpiry;
