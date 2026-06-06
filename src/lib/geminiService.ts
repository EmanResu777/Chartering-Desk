import { auth } from "./firebase";
import { Email, Cargo, Vessel, MatchResult } from "./utils";

export async function parseEmail(email: Email, userId?: string): Promise<{ type?: string, cargo?: Partial<Cargo>, vessel?: Partial<Vessel>, cargoes?: Partial<Cargo>[], vessels?: Partial<Vessel>[], summary: string, actualProvider?: string, actualModel?: string, degraded_analysis?: boolean, cached?: boolean, memoryUsed?: Record<string, any> }> {
  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const response = await fetch('/api/ai/parseEmail', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({ email, userId })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "AI parsing failed.");
    }
    
    return await response.json();
  } catch (error: any) {
    console.error("AI Parse Error:", error);
    throw new Error(error.message || "AI parsing failed. Please try again.");
  }
}

export async function matchVessels(cargo: Cargo, vessels: Vessel[], assumptions?: any): Promise<MatchResult[]> {
  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const response = await fetch('/api/ai/matchVessels', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({ cargo, vessels, assumptions, userId: auth.currentUser?.uid })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to generate AI matches.");
    }
    
    const data = await response.json();
    return data.matches || [];
  } catch (error: any) {
    console.error("AI Match Error:", error);
    throw new Error(error.message || "Failed to generate AI matches.");
  }
}
