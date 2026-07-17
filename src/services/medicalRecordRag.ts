import { supabase } from "./supabaseClient";

export type MedicalRecordRagStatus = {
  actorKind: "staff" | "owner";
  actorRole: string;
  canIndex: boolean;
  canQuery: boolean;
  indexedChunks: number;
};

export type MedicalRecordRagSource = {
  type: string;
  typeLabel: string;
  date: string | null;
  title: string;
  route: string;
};

export type MedicalRecordRagAnswer = {
  status: "answered" | "insufficient" | "conflict";
  answer: string;
  sources: MedicalRecordRagSource[];
};

type RagActionBody = { action: "status" | "index" | "ask"; petId: number; question?: string };

const RAG_REQUEST_TIMEOUT_MS = 25_000;

async function invokeWithTimeout<T>(body: RagActionBody) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("RAG_REQUEST_TIMEOUT")), RAG_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      supabase.functions.invoke<T>("medical-record-rag", { body }),
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function invoke<T>(body: RagActionBody): Promise<T> {
  const { data, error } = await invokeWithTimeout<T>(body);
  if (error) {
    let code = "";
    if (error.context instanceof Response) {
      if (error.context.status === 404) throw new Error("RAG_SERVICE_NOT_DEPLOYED");
      try {
        const payload = await error.context.clone().json() as { error?: unknown };
        code = typeof payload.error === "string" ? payload.error : "";
      } catch { /* keep the public fallback */ }
    }
    throw new Error(code || "RAG_UNAVAILABLE");
  }
  if (!data) throw new Error("RAG_UNAVAILABLE");
  return data;
}

export function loadMedicalRecordRagStatus(petId: number) {
  return invoke<MedicalRecordRagStatus>({ action: "status", petId });
}

export function refreshMedicalRecordRag(petId: number) {
  return invoke<{ sourceCount: number; changedSources: number; storedChunks: number }>({
    action: "index",
    petId,
  });
}

export function askMedicalRecordRag(petId: number, question: string) {
  return invoke<MedicalRecordRagAnswer>({ action: "ask", petId, question });
}
