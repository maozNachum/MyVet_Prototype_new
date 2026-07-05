import { supabase } from "../../../services/supabaseClient";
import { sanitizeAiContext } from "./aiSanitizer";
import type { AiAssistantRequest, AiAssistantResponse } from "./aiTypes";

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
    throw new Error(error.message || "שגיאה בהפעלת העוזר החכם");
  }

  if (!data?.answer) throw new Error("העוזר לא החזיר תשובה תקינה");
  return data.answer;
}
