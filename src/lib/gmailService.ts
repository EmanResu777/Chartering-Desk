import { getAccessToken } from './googleAuth';
import { Email, determineRelevanceStatus } from './utils';

export async function fetchGmailEmails(maxLimit = 50): Promise<Email[]> {
  const token = await getAccessToken();
  
  // 1. Fetch message IDs
  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxLimit}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!listRes.ok) {
    throw new Error('Failed to fetch Gmail messages list');
  }
  
  const listData = await listRes.json();
  const messages = listData.messages || [];
  
  // 2. Fetch full content for each message
  const emailPromises = messages.map(async (msg: any) => {
    const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!detailRes.ok) return null;
    
    const data = await detailRes.json();
    const headers = data.payload.headers;
    
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
    const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';
    
    const decodeBase64 = (data: string) => {
      let base64 = (data || '').replace(/-/g, '+').replace(/_/g, '/');
      base64 = base64.replace(/[^A-Za-z0-9+/=]/g, ''); // Remove EVERYTHING not base64 chars
      while (base64.length % 4) {
        base64 += '=';
      }
      try {
        return decodeURIComponent(escape(atob(base64)));
      } catch (e) {
        try {
          return atob(base64);
        } catch (e2) {
          return '';
        }
      }
    };

    const extractDecodedText = (payload: any): string => {
      if (!payload) return '';
      
      const mimeType = payload.mimeType || '';

      if (mimeType === 'multipart/alternative') {
        const parts = payload.parts || [];
        const textPart = parts.find((p: any) => p.mimeType === 'text/plain');
        if (textPart) return extractDecodedText(textPart);
        
        const htmlPart = parts.find((p: any) => p.mimeType === 'text/html');
        if (htmlPart) return extractDecodedText(htmlPart);
        
        return '';
      }

      if (mimeType.startsWith('multipart/') || mimeType === 'message/rfc822') {
        let combined = '';
        const parts = payload.parts || [];
        for (const part of parts) {
          const partText = extractDecodedText(part);
          if (partText) combined += partText + '\n\n';
        }
        return combined.trim();
      }

      if (mimeType === 'text/plain' || mimeType === 'text/html') {
        if (payload.body && payload.body.data) {
          let decoded = decodeBase64(payload.body.data);
          if (mimeType === 'text/html') {
            decoded = decoded.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
                             .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ');
          }
          return decoded;
        }
      }

      return '';
    };

    let fullBodyHTML = extractDecodedText(data.payload);
    
    // Strip HTML to reduce token usage and improve AI latency
    let body = fullBodyHTML
               .replace(/<\/?[a-z][^>]*>/gi, ' ')
               .replace(/&nbsp;/gi, ' ')
               .replace(/\n\s*\n/g, '\n\n')
               .trim();
    
    return {
      id: data.id,
      sender: from,
      subject: subject,
      timestamp: new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + 'Z',
      summary: body.substring(0, 100) + '...',
      classification: (subject.toUpperCase().includes('CARGO') ? 'CARGO' : 
                       subject.toUpperCase().includes('VESSEL') ? 'VESSEL' : 'MARKET INTEL') as any,
      confidence: 90,
      rawBody: body,
      relevanceStatus: determineRelevanceStatus(subject, from, body.substring(0, 500))
    } as Email;
  });
  
  const fetchedEmails = await Promise.all(emailPromises);
  return fetchedEmails.filter((e): e is Email => e !== null);
}
