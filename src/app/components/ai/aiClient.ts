import { supabase } from "../../../services/supabaseClient";
import { sanitizeAiContext } from "./aiSanitizer";
import type { AiAssistantRequest, AiAssistantResponse } from "./aiTypes";

function friendlyEdgeError(message?: string) {
  const text = message || "שגיאה בהפעלת העוזר החכם";

  if (text.includes("non-2xx") || text.includes("FunctionsHttpError")) {
    return "העוזר לא הצליח לקבל תשובה כרגע. נסה שוב בעוד רגע.";
  }

  if (text.includes("high demand") || text.includes("UNAVAILABLE") || text.includes("503")) {
    return "המודל עמוס כרגע. נסה שוב בעוד כמה שניות.";
  }

  return text;
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

  if (!data?.answer) throw new Error("העוזר לא החזיר תשובה תקינה");
  return data.answer;
}
