import { useEffect, useRef } from "react";
import { useRegisterAiAssistant } from "./AiAssistantShell";
import type { AiConversationContextIdentity } from "./aiConversationStorage";
import type { AiAssistantMode, AiQuickAction, AiUserRole } from "./aiTypes";

type Props = {
  mode: AiAssistantMode;
  title: string;
  compactTitle?: string;
  quickActions: AiQuickAction[];
  buildContext: () => unknown | Promise<unknown>;
  userRole?: AiUserRole;
  disabledReason?: string | null;
  attentionCount?: number;
  contextIdentity: AiConversationContextIdentity;
};

export function AiAssistantCard({
  mode,
  title,
  compactTitle = "VetBot",
  quickActions,
  buildContext,
  userRole = "unknown",
  disabledReason,
  attentionCount = 0,
  contextIdentity,
}: Props) {
  const register = useRegisterAiAssistant();
  const registrationRef = useRef({
    mode,
    title,
    compactTitle,
    quickActions,
    buildContext,
    userRole,
    disabledReason,
    attentionCount,
    contextIdentity,
  });

  registrationRef.current = {
    mode,
    title,
    compactTitle,
    quickActions,
    buildContext,
    userRole,
    disabledReason,
    attentionCount,
    contextIdentity,
  };

  useEffect(
    () => register(() => registrationRef.current),
    [
      attentionCount,
      contextIdentity.key,
      contextIdentity.label,
      disabledReason,
      mode,
      register,
      userRole,
    ],
  );

  return null;
}
