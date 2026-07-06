import { supabase } from "../../../services/supabaseClient";
import { sanitizeAiContext } from "./aiSanitizer";
import type { AiAssistantRequest, AiAssistantResponse } from "./aiTypes";

function friendlyEdgeError(message?: string) {
  const text = message || "לא הצלחנו להפעיל את העוזר כרגע.";

  if (text.includes("high demand") || text.includes("UNAVAILABLE") || text.includes("503") || text.includes("RESOURCE_EXHAUSTED")) {
    return "העוזר עמוס כרגע. נסה שוב בעוד כמה שניות.";
  }

  if (text.includes("Missing question")) {
    return "חסרה שאלה לעוזר.";
  }

  if (text.includes("Missing GEMINI_API_KEY") || text.includes("Unauthorized") || text.includes("non-2xx") || text.includes("FunctionsHttpError") || text.includes("Failed to fetch")) {
    return "העוזר לא זמין כרגע. נסה שוב בעוד רגע.";
  }

  return "לא הצלחנו לקבל תשובה מהעוזר כרגע. נסה שוב.";
}

export async function askAiAssistant(request: AiAssistantRequest): Promise<string> {
  const safeRequest: AiAssistantRequest = {
    ...request,
    context: sanitizeAiContext(request.context ?? {}),
    history: sanitizeAiContext((request.history ?? []).slice(-6)),
  };

  const { data, error } = await supabase.functions.invoke<AiAssistantResponse>("ai-assistant", {
    body: safeRequest,
  });

  if (error) {
    console.error("AI assistant error", error);
    throw new Error(friendlyEdgeError(error.message));
  }

  if (!data?.answer) throw new Error("העוזר לא החזיר תשובה תקינה. נסה שוב.");
  return data.answer;
}
