import { auth } from './firebase';

export async function connectImapAccount(host: string, port: string, username: string, password: string, provider: string) {
  if (!auth.currentUser) throw new Error("User not authenticated");
  
  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/email/connect-imap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      host, port, username, password, provider, userId: auth.currentUser.uid
    })
  });
  
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to connect to IMAP server");
  }
  
  return res.json();
}

export async function fetchImapEmails(limit: number = 10, onProgress?: (status: string, data: any) => void) {
  if (!auth.currentUser) throw new Error("User not authenticated");
  
  const token = await auth.currentUser.getIdToken();
  const res = await fetch('/api/email/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      userId: auth.currentUser.uid,
      limit
    })
  });
  
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to trigger email sync");
  }
  
  const { jobId } = await res.json();
  
  if (onProgress) onProgress('queued', null);

  // Poll for completion
  return new Promise<any[]>((resolve, reject) => {
    const startTime = Date.now();
    const maxPollingTime = 6 * 60 * 1000; // 6 minutes max

    const poll = async () => {
      try {
        if (Date.now() - startTime > maxPollingTime) {
           reject(new Error("Sync timed out. Please try again."));
           return;
        }

        const statusRes = await fetch(`/api/email/sync/status/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!statusRes.ok) {
          throw new Error("Failed to check sync status");
        }
        
        const statusData = await statusRes.json();
        
        if (onProgress) onProgress(statusData.status, statusData.data);
        
        if (statusData.status === 'completed') {
          resolve(statusData.emails || []);
        } else if (statusData.status === 'failed') {
          reject(new Error(statusData.data?.safeErrorMessage || "Sync failed"));
        } else {
          // Still running/queued, poll again in 1 second
          setTimeout(poll, 1000);
        }
      } catch (err) {
        reject(err);
      }
    };
    
    setTimeout(poll, 1000);
  });
}
