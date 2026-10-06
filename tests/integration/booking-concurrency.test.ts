import { createClient } from "@supabase/supabase-js";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_SUPABASE_INTEGRATION === "true";
const url = process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const client = enabled ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
const created: string[] = [];

afterAll(async () => {
  if (client && created.length) await client.from("bookings").delete().in("id", created);
});

describe.skipIf(!enabled)("booking concurrency against Supabase", () => {
  it("allows only one concurrent booking for a single eligible resource", async () => {
    if (!client) throw new Error("Integration client is not configured");
    const bootstrap = await client.rpc("public_tenant_bootstrap", { p_slug: "graphite" });
    if (bootstrap.error) throw bootstrap.error;
    const timezone = (bootstrap.data as { timezone: string }).timezone;
    let startsAt: string | undefined;
    for (let offset = 2; offset < 16 && !startsAt; offset += 1) {
      const date = formatInTimeZone(addDays(new Date(), offset), timezone, "yyyy-MM-dd");
      const slots = await client.rpc("public_available_slots", { p_slug: "graphite", p_service_key: "ceramic", p_local_date: date });
      if (slots.error) throw slots.error;
      startsAt = (slots.data as { startsAt: string; available: boolean }[]).find((slot) => slot.available)?.startsAt;
    }
    expect(startsAt).toBeTruthy();
    const makeRequest = (suffix: string) => client.rpc("server_create_booking", {
      p_slug: "graphite",
      p_service_key: "ceramic",
      p_starts_at: startsAt,
      p_customer_name: `Конкурентный тест ${suffix}`,
      p_customer_phone_e164: `+7999000000${suffix}`,
      p_vehicle: `Тест ${suffix}`,
      p_notes: "",
      p_access_token_hash: suffix.repeat(64),
      p_idempotency_key: `00000000-0000-4000-8000-00000000001${suffix}`,
      p_request_hash: (Number(suffix) + 2).toString().repeat(64),
    });
    const responses = await Promise.all([makeRequest("1"), makeRequest("2")]);
    for (const response of responses) {
      if (response.data) created.push((response.data as { bookingId: string }).bookingId);
    }
    expect(responses.filter((response) => !response.error)).toHaveLength(1);
    expect(responses.filter((response) => response.error)).toHaveLength(1);
    expect(responses.find((response) => response.error)?.error?.message).toContain("занято");
  });
});
