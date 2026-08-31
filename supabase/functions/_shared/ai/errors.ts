export type AiGatewayErrorCode =
  | "AI_FEATURE_DISABLED"
  | "AI_RATE_LIMITED"
  | "AI_CONFIGURATION_ERROR"
  | "AI_INPUT_INVALID"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_OUTPUT_INVALID"
  | "ACCESS_DENIED"
  | "CLIENT_SUMMARY_APPROVED_SOURCE_REQUIRED"
  | "DIGITALCARE_ACCESS_DENIED"
  | "DIGITALCARE_CAPTURE_START_FAILED"
  | "DIGITALCARE_CONSENT_REQUIRED"
  | "DIGITALCARE_FILE_NOT_AVAILABLE"
  | "DIGITALCARE_RECORDING_CONSENT_REQUIRED"
  | "DIGITALCARE_SUMMARY_STORE_FAILED"
  | "DIGITALCARE_TRANSCRIPT_NOT_READY"
  | "DIGITALCARE_TRANSCRIPT_STORE_FAILED"
  | "DIGITALCARE_UPLOAD_FAILED"
  | "DIGITALCARE_UPLOAD_MISSING"
  | "DIGITALCARE_VISIT_CREATE_FAILED"
  | "FOLLOW_UP_ACCESS_DENIED"
  | "FOLLOW_UP_APPROVED_SOURCE_REQUIRED"
  | "RAG_ACCESS_DENIED"
  | "RAG_INDEX_UNAVAILABLE"
  | "RAG_SEARCH_UNAVAILABLE";

const PUBLIC_MESSAGES: Record<AiGatewayErrorCode, string> = {
  AI_FEATURE_DISABLED: "VetBot is temporarily unavailable.",
  AI_RATE_LIMITED: "VetBot is receiving too many requests. Please try again shortly.",
  AI_CONFIGURATION_ERROR: "VetBot is temporarily unavailable.",
  AI_INPUT_INVALID: "The VetBot request is invalid.",
  AI_PROVIDER_TIMEOUT: "VetBot did not respond in time. Please try again.",
  AI_PROVIDER_UNAVAILABLE: "VetBot is temporarily unavailable.",
  AI_OUTPUT_INVALID: "VetBot returned an invalid response. Please try again.",
  ACCESS_DENIED: "The requested operation is not available.",
  CLIENT_SUMMARY_APPROVED_SOURCE_REQUIRED: "An approved medical summary is required.",
  DIGITALCARE_ACCESS_DENIED: "The DigitalCare session is not available.",
  DIGITALCARE_CAPTURE_START_FAILED: "DigitalCare capture could not be started.",
  DIGITALCARE_CONSENT_REQUIRED: "Consent is required before transcription.",
  DIGITALCARE_FILE_NOT_AVAILABLE: "The DigitalCare file is not available.",
  DIGITALCARE_RECORDING_CONSENT_REQUIRED: "Consent is required before recording.",
  DIGITALCARE_SUMMARY_STORE_FAILED: "The DigitalCare summary could not be stored.",
  DIGITALCARE_TRANSCRIPT_NOT_READY: "The DigitalCare transcript is not ready.",
  DIGITALCARE_TRANSCRIPT_STORE_FAILED: "The DigitalCare transcript could not be stored.",
  DIGITALCARE_UPLOAD_FAILED: "The DigitalCare file could not be uploaded.",
  DIGITALCARE_UPLOAD_MISSING: "The DigitalCare upload is missing.",
  DIGITALCARE_VISIT_CREATE_FAILED: "The DigitalCare visit could not be created.",
  FOLLOW_UP_ACCESS_DENIED: "The follow-up source is not available.",
  FOLLOW_UP_APPROVED_SOURCE_REQUIRED: "An approved source is required for follow-up suggestions.",
  RAG_ACCESS_DENIED: "The requested medical record is not available.",
  RAG_INDEX_UNAVAILABLE: "Medical record indexing is temporarily unavailable.",
  RAG_SEARCH_UNAVAILABLE: "Medical record search is temporarily unavailable.",
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
