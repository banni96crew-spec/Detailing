import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@4.1.11";
import { corsHeaders, json, problem, readJson } from "../_shared/http.ts";
import { assertRpc, canonicalJson, sha256Hex } from "../_shared/server.ts";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const uuid = z.string().uuid();
const localDate = z.iso.date();
const manualBooking = z.object({
  serviceKey: slug,
  startsAt: z.iso.datetime({ offset: true }),
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(7).max(32),
  vehicle: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).default(""),
  idempotencyKey: uuid,
});
const statusInput = z.object({
  status: z.enum(["accepted", "ready", "completed", "cancelled", "no_show"]),
  idempotencyKey: uuid,
});
const rescheduleInput = z.object({ startsAt: z.iso.datetime({ offset: true }), idempotencyKey: uuid });
const paymentInput = z.object({
  kind: z.enum(["payment", "refund"]),
  amountCents: z.number().int().positive(),
  receivedAt: z.iso.datetime({ offset: true }),
  note: z.string().trim().max(300).default(""),
  idempotencyKey: uuid,
});
const blockInput = z.object({
  resourceKey: slug,
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  label: z.string().trim().min(2).max(120),
  idempotencyKey: uuid,
});
const profileInput = z.object({
  name: z.string().trim().min(2).max(80),
  shortName: z.string().trim().min(2).max(24),
  description: z.string().trim().min(20).max(300),
  phone: z.string().trim().min(5).max(32),
  address: z.string().trim().min(5).max(180),
  directionsUrl: z.url(),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i),
});

function pathParts(request: Request): string[] {
  const marker = "/owner-api/";
  const path = new URL(request.url).pathname;
  return path.slice(path.indexOf(marker) + marker.length).split("/").filter(Boolean).map(decodeURIComponent);
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) return `+7${digits.slice(1)}`;
  if (digits.length >= 7 && digits.length <= 15) return `+${digits}`;
  throw new Error("Проверьте номер телефона");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return json(request, { error: "Требуется вход владельца" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) throw new Error("Supabase не настроен");
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return json(request, { error: "Сеанс владельца недействителен" }, 401);

    const parts = pathParts(request);
    if (parts[0] !== "tenant") throw new Error("Маршрут не найден");
    const tenantSlug = slug.parse(parts[1]);
    const urlData = new URL(request.url);

    if (request.method === "GET" && parts[2] === "bookings") {
      const from = localDate.parse(urlData.searchParams.get("from"));
      const to = localDate.parse(urlData.searchParams.get("to"));
      return json(request, { bookings: assertRpc(await client.rpc("owner_bookings", { p_slug: tenantSlug, p_from_local_date: from, p_to_local_date: to })) });
    }
    if (request.method === "GET" && parts[2] === "stats") {
      const from = localDate.parse(urlData.searchParams.get("from"));
      const to = localDate.parse(urlData.searchParams.get("to"));
      return json(request, assertRpc(await client.rpc("owner_dashboard_stats", { p_slug: tenantSlug, p_from_local_date: from, p_to_local_date: to })));
    }
    if (request.method === "POST" && parts[2] === "bookings" && parts.length === 3) {
      const body = manualBooking.parse(await readJson(request));
      const requestHash = await sha256Hex(canonicalJson(body));
      const data = assertRpc(await client.rpc("owner_create_booking", {
        p_slug: tenantSlug, p_service_key: body.serviceKey, p_starts_at: body.startsAt,
        p_customer_name: body.customerName, p_customer_phone_e164: normalizePhone(body.customerPhone),
        p_vehicle: body.vehicle, p_notes: body.notes,
        p_access_token_hash: await sha256Hex(crypto.randomUUID()),
        p_idempotency_key: body.idempotencyKey, p_request_hash: requestHash,
      }));
      return json(request, data, 201);
    }
    if (request.method === "POST" && parts[2] === "bookings" && uuid.safeParse(parts[3]).success && parts[4] === "status") {
      const body = statusInput.parse(await readJson(request));
      const data = assertRpc(await client.rpc("owner_set_booking_status", {
        p_slug: tenantSlug, p_booking_id: parts[3], p_status: body.status,
        p_idempotency_key: body.idempotencyKey,
        p_request_hash: await sha256Hex(canonicalJson(body)),
      }));
      return json(request, data);
    }
    if (request.method === "POST" && parts[2] === "bookings" && uuid.safeParse(parts[3]).success && parts[4] === "reschedule") {
      const body = rescheduleInput.parse(await readJson(request));
      const data = assertRpc(await client.rpc("owner_reschedule_booking", {
        p_slug: tenantSlug, p_booking_id: parts[3], p_starts_at: body.startsAt,
        p_idempotency_key: body.idempotencyKey,
        p_request_hash: await sha256Hex(canonicalJson(body)),
      }));
      return json(request, data);
    }
    if (request.method === "POST" && parts[2] === "bookings" && uuid.safeParse(parts[3]).success && parts[4] === "payments") {
      const body = paymentInput.parse(await readJson(request));
      const data = assertRpc(await client.rpc("owner_record_payment", {
        p_slug: tenantSlug, p_booking_id: parts[3], p_kind: body.kind,
        p_amount_cents: body.amountCents, p_received_at: body.receivedAt,
        p_note: body.note, p_idempotency_key: body.idempotencyKey,
      }));
      return json(request, data, 201);
    }
    if (request.method === "POST" && parts[2] === "blocks") {
      const body = blockInput.parse(await readJson(request));
      const data = assertRpc(await client.rpc("owner_block_resource", {
        p_slug: tenantSlug, p_resource_key: body.resourceKey, p_starts_at: body.startsAt,
        p_ends_at: body.endsAt, p_label: body.label, p_idempotency_key: body.idempotencyKey,
      }));
      return json(request, data, 201);
    }
    if (request.method === "POST" && parts[2] === "profile") {
      const body = profileInput.parse(await readJson(request));
      assertRpc(await client.rpc("owner_update_profile", {
        p_slug: tenantSlug, p_name: body.name, p_short_name: body.shortName,
        p_description: body.description, p_phone: body.phone, p_address: body.address,
        p_directions_url: body.directionsUrl, p_accent_color: body.accentColor,
      }));
      return json(request, { saved: true });
    }
    throw new Error("Маршрут не найден");
  } catch (error) {
    return problem(request, error);
  }
});
