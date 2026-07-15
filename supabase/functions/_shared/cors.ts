export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const configured = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  // Keep local development convenient, but fail closed in production when the
  // deployment forgot to configure ALLOWED_ORIGINS. Authentication is still
  // required separately by the Edge Function gateway.
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowOrigin = configured.length === 0
    ? localOrigin ? origin : ""
    : configured.includes(origin) ? origin : "";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

