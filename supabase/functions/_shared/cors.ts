function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function corsHeaders(request: Request) {
  const origin = normalizeOrigin(request.headers.get("origin") || "");
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  // Keep local development convenient, but fail closed in production when the
  // deployment forgot to configure ALLOWED_ORIGINS. Authentication is still
  // required separately by the Edge Function gateway.
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  // Local development remains available even when production origins are
  // configured. Production and preview deployments still need an explicit
  // allowlist entry.
  const allowOrigin =
    localOrigin || configured.includes(origin)
      ? origin
      : "";

  if (origin && !allowOrigin) {
    console.warn("VetBot CORS rejected origin", {
      origin,
      allowedOriginCount: configured.length,
    });
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
