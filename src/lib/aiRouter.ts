export const AI_MODELS = {
  SIMPLE_BROWSER: "gemini-nano-browser-optional",
  BROWSER_OPTIONAL: "gemini-nano-browser-optional",
  COMPLEX_CLOUD: "gemini-2.5-flash",
  HEAVY_SERVER: "gemini-2.5-pro",
  LOCAL_PROCESSING: "no-llm"
};

export type TaskType = 
  | 'filter_cargo' | 'sort_vessels' | 'search_table' | 'highlight_missing_fields' | 'format_card' | 'validate_required_fields'
  | 'short_rewrite' | 'tone_adjustment' | 'quick_summary' | 'simple_classification' | 'local_ui_assist' | 'missing_field_hint'
  | 'redact_email' | 'remove_signature' | 'mask_phone_numbers' | 'trim_email_chain' | 'detect_prompt_injection' | 'mask_personal_emails' | 'preprocess_email_for_ai'
  | 'extract_cargo' | 'extract_vessel' | 'summarize_email' | 'generate_reply' | 'classify_email' | 'detect_missing_terms' | 'transport_specs' | 'normalize_cargo_json' | 'normalize_vessel_json'
  | 'match_cargo_vessel' | 'analyze_fixture' | 'analyze_risk' | 'compare_vessels' | 'compare_cargoes' | 'negotiation_strategy' | 'laytime_demurrage_analysis' | 'commercial_recommendation';

export function routeAITask(taskType: TaskType) {
  if (["filter_cargo", "sort_vessels", "search_table", "highlight_missing_fields", "format_card", "validate_required_fields"].includes(taskType)) {
    return {
      processingMode: "local_only",
      model: "none",
      location: "browser",
      requiresPreprocessing: false,
      riskLevel: "low"
    };
  }
  
  if (["short_rewrite", "tone_adjustment", "quick_summary", "simple_classification", "local_ui_assist", "missing_field_hint"].includes(taskType)) {
    return {
      processingMode: "browser_optional_ai",
      model: AI_MODELS.BROWSER_OPTIONAL,
      location: "browser_or_cloud",
      requiresPreprocessing: false,
      riskLevel: "low"
    };
  }

  if (["redact_email", "remove_signature", "mask_phone_numbers", "trim_email_chain", "detect_prompt_injection", "mask_personal_emails", "preprocess_email_for_ai"].includes(taskType)) {
    return {
      processingMode: "sensitive_local_processing",
      model: AI_MODELS.LOCAL_PROCESSING,
      location: "local",
      requiresPreprocessing: true,
      riskLevel: "high"
    };
  }

  if (["extract_cargo", "extract_vessel", "summarize_email", "generate_reply", "classify_email", "detect_missing_terms", "transport_specs", "normalize_cargo_json", "normalize_vessel_json"].includes(taskType)) {
    return {
      processingMode: "cloud_ai",
      model: AI_MODELS.COMPLEX_CLOUD,
      location: "cloud",
      requiresPreprocessing: true,
      riskLevel: "medium"
    };
  }

  if (["match_cargo_vessel", "analyze_fixture", "analyze_risk", "compare_vessels", "compare_cargoes", "negotiation_strategy", "laytime_demurrage_analysis", "commercial_recommendation"].includes(taskType)) {
    return {
      processingMode: "server_heavy_ai",
      model: AI_MODELS.HEAVY_SERVER,
      location: "cloud",
      requiresPreprocessing: false,
      riskLevel: "high"
    };
  }

  return {
    processingMode: "cloud_ai",
    model: AI_MODELS.COMPLEX_CLOUD,
    location: "cloud",
    requiresPreprocessing: false,
    riskLevel: "medium"
  };
}

export function processSensitiveDataLocal(text: string): string {
  if (!text) return text;
  let processed = text;
  
  let sigCount = 0;
  let phoneCount = 0;
  let emailCount = 0;
  let quoteCount = 0;
  let injectionWarning = false;

  // Prompt injection detection
  const injectionPatterns = [/ignore all previous instructions/i, /forget previous/i, /system prompt/i, /bypass/i];
  for (const pattern of injectionPatterns) {
    if (pattern.test(processed)) {
      injectionWarning = true;
      processed = processed.replace(pattern, "[SUSPECTED_INJECTION_REMOVED]");
    }
  }

  // Remove email signatures (e.g. anything after "-- ")
  const sigRegex = /--\s*\n[\s\S]*/g;
  if (sigRegex.test(processed)) {
    sigCount++;
    processed = processed.replace(sigRegex, "");
  }

  // Mask phone numbers naive approach
  const phoneRegex = /\b\+?[0-9\-\s\(\)]{10,15}\b/g;
  const matchesPhone = processed.match(phoneRegex);
  if (matchesPhone) {
    phoneCount += matchesPhone.length;
    processed = processed.replace(phoneRegex, "[MASKED_PHONE]");
  }

  // Mask personal emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const matchesEmail = processed.match(emailRegex);
  if (matchesEmail) {
    emailCount += matchesEmail.length;
    processed = processed.replace(emailRegex, "[MASKED_EMAIL]");
  }

  // Trim long quoted email chains
  const replyIndex = processed.indexOf("From:");
  if (replyIndex > 0 && replyIndex > 500) {
    quoteCount++;
    processed = processed.substring(0, replyIndex) + "\n[TRIMMED_QUOTED_CHAIN]";
  }

  console.log(`[AI Routing] Redactions applied - Signatures: ${sigCount}, Phones: ${phoneCount}, Emails: ${emailCount}, Quoted Chains: ${quoteCount}, Prompt Injection Detected: ${injectionWarning}`);

  return processed;
}

export async function executeHybridAIRequest(taskType: TaskType, payload: any, fetchFunction: typeof fetch) {
  const routing = routeAITask(taskType);
  
  if (routing.processingMode === 'local_only' || routing.processingMode === 'sensitive_local_processing') {
    return { content: payload.contents || '', processedLocally: true };
  }

  let processedPayload = { ...payload };

  if (routing.requiresPreprocessing && typeof processedPayload.contents === 'string') {
    processedPayload.contents = processSensitiveDataLocal(processedPayload.contents);
  }

  if (routing.processingMode === 'browser_optional_ai') {
      try {
          // Локальный ИИ в браузере (Chrome Built-in AI / Gemini Nano): 
          // Мы можем интегрировать экспериментальную технологию Google Chrome (window.ai), 
          // которая запускает нейросеть прямо на устройстве пользователя. 
          // Это полностью бесплатно, работает офлайн и очень быстро, но пока доступно 
          // только в Chrome Dev/Canary со специальными флагами.
          if ('ai' in window && 'languageModel' in (window as any).ai) {
             // Wrap in a robust try-catch with timeout protection to prevent hanging operations
             const capabilities = await Promise.race<any>([
                 (window as any).ai.languageModel.capabilities(),
                 new Promise((_, reject) => setTimeout(() => reject(new Error("Capabilities check timed out")), 2000))
             ]);
             
             if (capabilities.available === 'readily' || capabilities.available === 'after-download') {
                 const session = await Promise.race<any>([
                     (window as any).ai.languageModel.create(),
                     new Promise((_, reject) => setTimeout(() => reject(new Error("Session creation timed out")), 5000))
                 ]);
                 
                 const result = await Promise.race<any>([
                     session.prompt(processedPayload.contents),
                     new Promise((_, reject) => setTimeout(() => reject(new Error("Prompt execution timed out")), 10000))
                 ]);
                 
                 return { text: result, source: 'browser_nano', warning: null };
             }
          }
      } catch (e) {
          // Graceful fallback mechanism: catch crash during init/execution and seamlessly continue to cloud endpoint
          console.warn("Browser AI (window.ai) encountered an error or crashed during initialization/execution. Automatically falling back to cloud endpoint.", e);
      }
  }
  
  const response = await fetchFunction('/api/ai/routeTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskType: taskType,
      payload: processedPayload
    })
  });
  
  if (!response.ok) {
     const errorData = await response.json().catch(() => ({}));
     throw new Error(errorData.error || "Failed to communicate with AI");
  }
  
  return await response.json();
}
