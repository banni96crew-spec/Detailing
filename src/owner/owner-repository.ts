import { z } from "zod";
import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { browserEnvironment, isDemoMode } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";
import { createBooking } from "@/booking/booking-repository";
import { mergeAndSaveDemoRecords, readDemoPayments, readDemoRecords, saveDemoPayments } from "@/booking/demo-booking-store";
import type { CreateBookingInput } from "@/booking/booking-types";
import { formatInTimeZone } from "date-fns-tz";

export const ownerBookingSchema = z.object({
  bookingId: z.uuid(), status: z.string(), startsAt: z.string(), endsAt: z.string(),
  priceCents: z.number(), customerName: z.string(), customerPhone: z.string(), vehicle: z.string(),
  notes: z.string().nullable().optional(), serviceName: z.string(), resourceName: z.string(), paidCents: z.number(),
  origin: z.enum(["showcase", "user"]).default("user"),
});
export const statsSchema = z.object({
  timezone: z.string(), from: z.string(), to: z.string(), arrivals: z.number(), completedOrders: z.number(), receivedCents: z.number(),
});

export type OwnerBooking = z.infer<typeof ownerBookingSchema>;
export type OwnerStats = z.infer<typeof statsSchema>;

async function ownerFetch(path: string, init?: RequestInit): Promise<unknown> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Сеанс владельца завершён");
  if (!browserEnvironment.VITE_OWNER_API_URL) throw new Error("Адрес кабинета владельца не настроен");
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");
  const response = await fetch(`${browserEnvironment.VITE_OWNER_API_URL}${path}`, {
    ...init,
    headers,
  });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? "Операция не выполнена");
  return payload;
}

export async function fetchOwnerBookings(tenant: PublishedBusinessConfig, from: string, to: string): Promise<OwnerBooking[]> {
  if (isDemoMode) {
    const payments = readDemoPayments(tenant.slug);
    return readDemoRecords(tenant.slug)
      .filter((item) => {
        const localDate = formatInTimeZone(new Date(item.startsAt), tenant.timezone, "yyyy-MM-dd");
        return localDate >= from && localDate <= to;
      })
      .map((item) => ({
        bookingId: item.bookingId, status: item.status, startsAt: item.startsAt, endsAt: item.endsAt,
        priceCents: item.priceCents, customerName: item.customerName, customerPhone: item.customerPhone,
        vehicle: item.vehicle, notes: item.notes, serviceName: item.service.name, resourceName: item.resource.name,
        paidCents: payments[item.bookingId] ?? 0,
        origin: item.origin,
      }));
  }
  const payload = await ownerFetch(`/tenant/${encodeURIComponent(tenant.slug)}/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  return ownerBookingSchema.array().parse((payload as { bookings: unknown }).bookings);
}

export async function fetchOwnerStats(tenant: PublishedBusinessConfig, from: string, to: string): Promise<OwnerStats> {
  if (isDemoMode) {
    const rows = await fetchOwnerBookings(tenant, from, to);
    return {
      timezone: tenant.timezone, from, to,
      arrivals: rows.filter((item) => item.origin !== "showcase" && item.status !== "cancelled").length,
      completedOrders: rows.filter((item) => item.origin !== "showcase" && item.status === "completed").length,
      receivedCents: rows.filter((item) => item.origin !== "showcase").reduce((sum, item) => sum + item.paidCents, 0),
    };
  }
  return statsSchema.parse(await ownerFetch(`/tenant/${encodeURIComponent(tenant.slug)}/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
}

export async function setOwnerBookingStatus(tenant: PublishedBusinessConfig, bookingId: string, status: string): Promise<void> {
  if (isDemoMode) {
    const records = readDemoRecords(tenant.slug);
    const record = records.find((item) => item.bookingId === bookingId);
    if (!record) throw new Error("Запись не найдена");
    if (record.origin === "showcase") throw new Error("Витринную запись нельзя изменять");
    mergeAndSaveDemoRecords(tenant.slug, [{ ...record, status: z.enum(["confirmed", "accepted", "ready", "completed", "cancelled", "no_show"]).parse(status) }]);
    return;
  }
  await ownerFetch(`/tenant/${encodeURIComponent(tenant.slug)}/bookings/${bookingId}/status`, {
    method: "POST", body: JSON.stringify({ status, idempotencyKey: crypto.randomUUID() }),
  });
}

export async function recordOwnerPayment(tenant: PublishedBusinessConfig, bookingId: string, amountCents: number): Promise<void> {
  if (isDemoMode) {
    const record = readDemoRecords(tenant.slug).find((item) => item.bookingId === bookingId);
    if (!record) throw new Error("Запись не найдена");
    if (record.origin === "showcase") throw new Error("Витринной записи нельзя назначить оплату");
    const values = readDemoPayments(tenant.slug);
    values[bookingId] = (values[bookingId] ?? 0) + amountCents;
    saveDemoPayments(tenant.slug, values);
    return;
  }
  await ownerFetch(`/tenant/${encodeURIComponent(tenant.slug)}/bookings/${bookingId}/payments`, {
    method: "POST",
    body: JSON.stringify({ kind: amountCents >= 0 ? "payment" : "refund", amountCents: Math.abs(amountCents), receivedAt: new Date().toISOString(), note: "", idempotencyKey: crypto.randomUUID() }),
  });
}

export async function createOwnerBooking(tenant: PublishedBusinessConfig, input: CreateBookingInput): Promise<void> {
  if (isDemoMode) {
    await createBooking(tenant, input);
    return;
  }
  await ownerFetch(`/tenant/${encodeURIComponent(tenant.slug)}/bookings`, { method: "POST", body: JSON.stringify(input) });
}
