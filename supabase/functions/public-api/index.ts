import { z } from "npm:zod@4.1.11";
import { corsHeaders, json, problem, readJson } from "../_shared/http.ts";
import { assertRpc, canonicalJson, consumeLimit, hmacToken, requestAddress, serverClient, sha256Hex } from "../_shared/server.ts";

const uuid = z.string().uuid();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const bookingInput = z.object({
  serviceKey: slug,
  startsAt: z.iso.datetime({ offset: true }),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(7).max(32),
  vehicle: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).default(""),
  idempotencyKey: uuid,
});
const mutateInput = z.object({ idempotencyKey: uuid });
const rescheduleInput = mutateInput.extend({ startsAt: z.iso.datetime({ offset: true }) });
const pushInput = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(20).max(512), auth: z.string().min(8).max(256) }),
});

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) return `+7${digits.slice(1)}`;
  if (digits.length >= 7 && digits.length <= 15) return `+${digits}`;
  throw new Error("Проверьте номер телефона");
}

function pathParts(request: Request): string[] {
  const marker = "/public-api/";
  const path = new URL(request.url).pathname;
  return path.slice(path.indexOf(marker) + marker.length).split("/").filter(Boolean).map(decodeURIComponent);
}

function escapeIcs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll(/\r?\n/g, "\\n");
}

function icsDate(value: string): string {
  return new Date(value).toISOString().replaceAll(/[-:]/g, "").replace(".000", "");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const parts = pathParts(request);
  const client = serverClient();
  try {
    if (parts[0] !== "tenant") throw new Error("Маршрут не найден");
    const tenantSlug = slug.parse(parts[1]);
    await consumeLimit(client, "public", `${tenantSlug}:${requestAddress(request)}`, 90, 60);

    if (request.method === "GET" && parts[2] === "slots") {
      const url = new URL(request.url);
      const serviceKey = slug.parse(url.searchParams.get("service"));
      const date = z.iso.date().parse(url.searchParams.get("date"));
      const data = assertRpc(await client.rpc("public_available_slots", { p_slug: tenantSlug, p_service_key: serviceKey, p_local_date: date }));
      return json(request, { slots: data });
    }

    if (request.method === "POST" && parts[2] === "bookings" && parts.length === 3) {
      await consumeLimit(client, "booking-create", `${tenantSlug}:${requestAddress(request)}`, 5, 600);
      const body = bookingInput.parse(await readJson(request));
      const secret = Deno.env.get("BOOKING_TOKEN_SECRET");
      if (!secret || secret.length < 32) throw new Error("Серверный секрет доступа к записям не настроен");
      const accessToken = await hmacToken(secret, `${tenantSlug}:${body.idempotencyKey}`);
      const accessTokenHash = await sha256Hex(accessToken);
      const requestHash = await sha256Hex(canonicalJson(body));
      const data = assertRpc(await client.rpc("server_create_booking", {
        p_slug: tenantSlug,
        p_service_key: body.serviceKey,
        p_starts_at: body.startsAt,
        p_customer_name: body.customerName,
        p_customer_phone_e164: normalizePhone(body.customerPhone),
        p_vehicle: body.vehicle,
        p_notes: body.notes,
        p_access_token_hash: accessTokenHash,
        p_idempotency_key: body.idempotencyKey,
        p_request_hash: requestHash,
      }));
      return json(request, { ...data, accessToken }, 201);
    }

    if (parts[2] !== "bookings" || !parts[3]) throw new Error("Маршрут не найден");
    const accessToken = z.string().min(32).max(128).parse(parts[3]);
    const tokenHash = await sha256Hex(accessToken);

    if (request.method === "GET" && parts.length === 4) {
      const data = assertRpc(await client.rpc("server_booking_by_token", { p_slug: tenantSlug, p_access_token_hash: tokenHash }));
      if (!data) throw new Error("Запись не найдена");
      return json(request, data);
    }

    if (request.method === "POST" && parts[4] === "cancel") {
      const body = mutateInput.parse(await readJson(request));
      const requestHash = await sha256Hex(canonicalJson(body));
      const data = assertRpc(await client.rpc("server_cancel_booking", {
        p_slug: tenantSlug, p_access_token_hash: tokenHash,
        p_idempotency_key: body.idempotencyKey, p_request_hash: requestHash,
      }));
      return json(request, data);
    }

    if (request.method === "POST" && parts[4] === "reschedule") {
      const body = rescheduleInput.parse(await readJson(request));
      const requestHash = await sha256Hex(canonicalJson(body));
      const data = assertRpc(await client.rpc("server_reschedule_booking_by_token", {
        p_slug: tenantSlug, p_access_token_hash: tokenHash, p_starts_at: body.startsAt,
        p_idempotency_key: body.idempotencyKey, p_request_hash: requestHash,
      }));
      return json(request, data);
    }

    if (request.method === "POST" && parts[4] === "push") {
      const body = pushInput.parse(await readJson(request));
      const data = assertRpc(await client.rpc("server_register_booking_push", {
        p_slug: tenantSlug,
        p_access_token_hash: tokenHash,
        p_endpoint: body.endpoint,
        p_endpoint_hash: await sha256Hex(body.endpoint),
        p_p256dh: body.keys.p256dh,
        p_auth_secret: body.keys.auth,
      }));
      return json(request, { subscriptionId: data }, 201);
    }

    if (request.method === "GET" && parts[4] === "calendar.ics") {
      const data = assertRpc<Record<string, unknown> | null>(await client.rpc("server_booking_by_token", { p_slug: tenantSlug, p_access_token_hash: tokenHash }));
      if (!data) throw new Error("Запись не найдена");
      const service = data.service as { name: string };
      const tenant = data.tenant as { name: string };
      const content = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Detailing Booking//RU", "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT", `UID:${data.bookingId}@detailing-booking`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
        `DTSTART:${icsDate(String(data.startsAt))}`, `DTEND:${icsDate(String(data.endsAt))}`,
        `SUMMARY:${escapeIcs(`${service.name} — ${tenant.name}`)}`,
        `DESCRIPTION:${escapeIcs(`Автомобиль: ${String(data.vehicle)}`)}`,
        "END:VEVENT", "END:VCALENDAR", "",
      ].join("\r\n");
      return new Response(content, {
        headers: { ...corsHeaders(request), "content-type": "text/calendar; charset=utf-8", "content-disposition": "attachment; filename=booking.ics" },
      });
    }

    throw new Error("Маршрут не найден");
  } catch (error) {
    return problem(request, error);
  }
});
