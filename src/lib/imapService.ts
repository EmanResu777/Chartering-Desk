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

export async function fetchImapEmails(limit: number = 10) {
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
    throw new Error(data.error || "Failed to sync emails");
  }
  
  const data = await res.json();
  return data.emails;
}
