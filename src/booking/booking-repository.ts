import { addMinutes, eachMinuteOfInterval, isBefore } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { browserEnvironment, isDemoMode } from "@/lib/env";
import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { bookingSchema, slotSchema, type BookingDetails, type BookingSlot, type CreateBookingInput } from "./booking-types";

export interface DemoRecord extends BookingDetails {
  accessToken: string;
  resourceId: string;
  bufferEndsAt: string;
  idempotencyKey: string;
}

const demoPrefix = "demo-bookings:";

export function demoRecords(slug: string): DemoRecord[] {
  const raw = localStorage.getItem(`${demoPrefix}${slug}`);
  if (!raw) return [];
  try {
    return zodDemoRecords(JSON.parse(raw));
  } catch {
    return [];
  }
}

function zodDemoRecords(value: unknown): DemoRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = bookingSchema.safeParse(item);
    if (!parsed.success || typeof item !== "object" || item === null) return [];
    const extra = item as Record<string, unknown>;
    if (typeof extra.accessToken !== "string" || typeof extra.resourceId !== "string" || typeof extra.bufferEndsAt !== "string" || typeof extra.idempotencyKey !== "string") return [];
    return [{ ...parsed.data, accessToken: extra.accessToken, resourceId: extra.resourceId, bufferEndsAt: extra.bufferEndsAt, idempotencyKey: extra.idempotencyKey }];
  });
}

export function saveDemoRecords(slug: string, records: DemoRecord[]): void {
  localStorage.setItem(`${demoPrefix}${slug}`, JSON.stringify(records));
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return isBefore(startA, endB) && isBefore(startB, endA);
}

export async function fetchSlots(tenant: PublishedBusinessConfig, serviceKey: string, localDate: string): Promise<BookingSlot[]> {
  if (!isDemoMode) {
    if (!browserEnvironment.VITE_PUBLIC_API_URL) throw new Error("Адрес сервера записи не настроен");
    const url = new URL(`${browserEnvironment.VITE_PUBLIC_API_URL}/tenant/${encodeURIComponent(tenant.slug)}/slots`);
    url.searchParams.set("service", serviceKey);
    url.searchParams.set("date", localDate);
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Не удалось получить свободное время");
    const payload: unknown = await response.json();
    return slotSchema.array().parse((payload as { slots: unknown }).slots);
  }

  const service = tenant.services.find((item) => item.key === serviceKey);
  if (!service) throw new Error("Услуга не найдена");
  const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  const hours = tenant.hours.find((item) => item.weekday === weekday);
  if (!hours || hours.closed || !hours.opensAt || !hours.lastArrivalAt) return [];
  const first = fromZonedTime(`${localDate}T${hours.opensAt}:00`, tenant.timezone);
  const last = fromZonedTime(`${localDate}T${hours.lastArrivalAt}:00`, tenant.timezone);
  const records = demoRecords(tenant.slug).filter((record) => record.status !== "cancelled" && record.status !== "no_show");
  const nowWithLead = addMinutes(new Date(), tenant.booking.minimumLeadMinutes);
  return eachMinuteOfInterval({ start: first, end: last }, { step: tenant.booking.slotIntervalMinutes }).map((startsAt) => {
    const endsAt = addMinutes(startsAt, service.durationMinutes);
    const bufferEndsAt = addMinutes(endsAt, service.bufferMinutes);
    const availableResource = service.resourceKeys.some((resourceId) => !records.some((record) => record.resourceId === resourceId && overlaps(startsAt, bufferEndsAt, new Date(record.startsAt), new Date(record.bufferEndsAt))));
    return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), available: availableResource && !isBefore(startsAt, nowWithLead) };
  });
}

export async function createBooking(tenant: PublishedBusinessConfig, input: CreateBookingInput): Promise<{ booking: BookingDetails; accessToken: string }> {
  if (!isDemoMode) {
    if (!browserEnvironment.VITE_PUBLIC_API_URL) throw new Error("Адрес сервера записи не настроен");
    const response = await fetch(`${browserEnvironment.VITE_PUBLIC_API_URL}/tenant/${encodeURIComponent(tenant.slug)}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey },
      body: JSON.stringify(input),
    });
    const payload: unknown = await response.json();
    if (!response.ok) throw new Error((payload as { error?: string }).error ?? "Не удалось создать запись");
    const accessToken = (payload as { accessToken?: unknown }).accessToken;
    if (typeof accessToken !== "string") throw new Error("Сервер не вернул доступ к записи");
    const booking = await fetchBooking(tenant.slug, accessToken);
    return { booking, accessToken };
  }

  const records = demoRecords(tenant.slug);
  const existing = records.find((record) => record.idempotencyKey === input.idempotencyKey);
  if (existing) return { booking: existing, accessToken: existing.accessToken };
  const service = tenant.services.find((item) => item.key === input.serviceKey);
  if (!service) throw new Error("Услуга не найдена");
  const startsAt = new Date(input.startsAt);
  const endsAt = addMinutes(startsAt, service.durationMinutes);
  const bufferEndsAt = addMinutes(endsAt, service.bufferMinutes);
  const resourceId = service.resourceKeys.find((candidate) => !records.some((record) => record.resourceId === candidate && record.status !== "cancelled" && overlaps(startsAt, bufferEndsAt, new Date(record.startsAt), new Date(record.bufferEndsAt))));
  if (!resourceId) throw new Error("Выбранное время уже занято");
  const resource = tenant.resources.find((item) => item.key === resourceId);
  if (!resource) throw new Error("Подходящий пост не найден");
  const accessToken = crypto.randomUUID();
  const record: DemoRecord = {
    bookingId: crypto.randomUUID(), status: "confirmed", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), bufferEndsAt: bufferEndsAt.toISOString(),
    priceCents: service.priceCents, customerName: input.customerName, customerPhone: input.customerPhone,
    vehicle: input.vehicle, notes: input.notes || null, service: { key: service.key, name: service.name },
    resource: { key: resource.key, name: resource.name }, tenant: { slug: tenant.slug, name: tenant.brand.name, timezone: tenant.timezone, cancellationHours: tenant.booking.cancellationHours },
    accessToken, resourceId, idempotencyKey: input.idempotencyKey,
  };
  saveDemoRecords(tenant.slug, [...records, record]);
  return { booking: record, accessToken };
}

export async function fetchBooking(slug: string, accessToken: string): Promise<BookingDetails> {
  if (isDemoMode) {
    const record = demoRecords(slug).find((item) => item.accessToken === accessToken);
    if (!record) throw new Error("Запись не найдена на этом устройстве");
    return bookingSchema.parse(record);
  }
  if (!browserEnvironment.VITE_PUBLIC_API_URL) throw new Error("Адрес сервера записи не настроен");
  const response = await fetch(`${browserEnvironment.VITE_PUBLIC_API_URL}/tenant/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(accessToken)}`, { headers: { accept: "application/json" } });
  const payload: unknown = await response.json();
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? "Не удалось загрузить запись");
  return bookingSchema.parse(payload);
}

export async function cancelBooking(slug: string, accessToken: string, idempotencyKey: string): Promise<void> {
  if (isDemoMode) {
    const records = demoRecords(slug);
    const record = records.find((item) => item.accessToken === accessToken);
    if (!record) throw new Error("Запись не найдена");
    record.status = "cancelled";
    saveDemoRecords(slug, records);
    return;
  }
  if (!browserEnvironment.VITE_PUBLIC_API_URL) throw new Error("Адрес сервера записи не настроен");
  const response = await fetch(`${browserEnvironment.VITE_PUBLIC_API_URL}/tenant/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(accessToken)}/cancel`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey }),
  });
  if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Не удалось отменить запись");
}

export function calendarUrl(slug: string, accessToken: string): string {
  if (isDemoMode) return "";
  if (!browserEnvironment.VITE_PUBLIC_API_URL) throw new Error("Адрес сервера записи не настроен");
  return `${browserEnvironment.VITE_PUBLIC_API_URL}/tenant/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(accessToken)}/calendar.ics`;
}
