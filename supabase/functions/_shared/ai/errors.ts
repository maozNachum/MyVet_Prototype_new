export type AiGatewayErrorCode =
  | "AI_FEATURE_DISABLED"
  | "AI_RATE_LIMITED"
  | "AI_CONFIGURATION_ERROR"
  | "AI_INPUT_INVALID"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_OUTPUT_INVALID";

const PUBLIC_MESSAGES: Record<AiGatewayErrorCode, string> = {
  AI_FEATURE_DISABLED: "VetBot is temporarily unavailable.",
  AI_RATE_LIMITED: "VetBot is receiving too many requests. Please try again shortly.",
  AI_CONFIGURATION_ERROR: "VetBot is temporarily unavailable.",
  AI_INPUT_INVALID: "The VetBot request is invalid.",
  AI_PROVIDER_TIMEOUT: "VetBot did not respond in time. Please try again.",
  AI_PROVIDER_UNAVAILABLE: "VetBot is temporarily unavailable.",
  AI_OUTPUT_INVALID: "VetBot returned an invalid response. Please try again.",
};

export class AiGatewayError extends Error {
  readonly code: AiGatewayErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AiGatewayErrorCode,
    options: { httpStatus?: number; retryable?: boolean; retryAfterSeconds?: number } = {},
  ) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "AiGatewayError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? 502;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function asAiGatewayError(error: unknown): AiGatewayError {
  if (error instanceof AiGatewayError) return error;
  return new AiGatewayError("AI_PROVIDER_UNAVAILABLE", { retryable: true });
}
