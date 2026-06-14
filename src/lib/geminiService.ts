import { auth } from "./firebase";
import { Email, Cargo, Vessel, MatchResult } from "./utils";

export async function parseEmail(email: Email, userId?: string, expectedType?: string): Promise<{ type?: string, cargo?: Partial<Cargo>, vessel?: Partial<Vessel>, cargoes?: Partial<Cargo>[], vessels?: Partial<Vessel>[], summary: string, actualProvider?: string, actualModel?: string, degraded_analysis?: boolean, cached?: boolean, memoryUsed?: Record<string, any>, _diagnostic?: any }> {
  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const response = await fetch('/api/ai/parseEmail', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({ email, userId, expectedType })
    });
    
    if (response.status === 402) {
      window.dispatchEvent(new Event('show-pricing'));
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Credit Limit: ${errorData.safeMessage || 'Exceeded credits'}`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      let errMsg = errorData.safeMessage || errorData.error || "AI parsing failed.";
      
      // Hard fix for raw schema/pattern error from Google API/SDK
      if (typeof errMsg === 'string' && (
          errMsg.includes("The string did not match the expected pattern") || 
          errMsg.includes("Could not extract data from the provided text") ||
          errMsg.includes("Invalid JSON") ||
          errMsg.includes("DOMException") ||
          errMsg.includes("responseSchema") ||
          errMsg.includes("schema validation") ||
          errMsg.includes("schema") ||
          errMsg.includes("expected pattern")
      )) {
          errMsg = "Not enough cargo information to create a cargo draft. Please review the missing fields and try again.";
      }
      
      throw new Error(errMsg);
    }
    
    return await response.json();
  } catch (error: any) {
    const errorMsg = error.message || "AI parsing failed. Please try again.";
    
    // Completely suppress the confusing raw schema warning from Google GenAI SDK from the browser console
    if (typeof errorMsg === 'string' && (
      errorMsg.includes("Not enough cargo") ||
      errorMsg.includes("The string did not match the expected pattern") ||
      errorMsg.includes("DOMException")
    )) {
      console.warn("AI Parse Warning: Incomplete deterministic intake.");
    } else {
      console.error("AI Parse Error:", error);
    }
    
    throw new Error(errorMsg);
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
    
    if (response.status === 402) {
      window.dispatchEvent(new Event('show-pricing'));
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Credit Limit: ${errorData.safeMessage || 'Exceeded credits'}`);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.safeMessage || errorData.error || "Failed to generate AI matches.");
    }
    
    const data = await response.json();
    return data.matches || [];
  } catch (error: any) {
    console.error("AI Match Error:", error);
    throw new Error(error.message || "Failed to generate AI matches.");
  }
}
