export const baseCorsHeaders = {
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "cache-control": "no-store",
};

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("PUBLIC_SITE_URL") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    ...baseCorsHeaders,
    ...(local || configured.includes(origin) ? { "access-control-allow-origin": origin } : {}),
    vary: "origin",
  };
}

export function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "content-type": "application/json; charset=utf-8" },
  });
}

export function problem(request: Request, error: unknown, fallbackStatus = 400): Response {
  const message = error instanceof Error ? error.message : "Не удалось выполнить запрос";
  const lower = message.toLowerCase();
  const status = lower.includes("предел") ? 429
    : lower.includes("занято") ? 409
    : lower.includes("не найд") ? 404
    : lower.includes("прав") ? 403
    : fallbackStatus;
  return json(request, { error: message }, status);
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("Нужен application/json");
  return request.json();
}
