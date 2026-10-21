import { addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { browserEnvironment, isDemoMode } from "@/lib/env";
import {
  findDemoRecordByToken,
  mergeAndSaveDemoRecords,
  readDemoRecords,
} from "./demo-booking-store";
import type { DemoRecord } from "./demo-booking-types";
import { findDemoAvailableResource, getDemoSlots as calculateDemoSlots } from "./demo-availability";
import { bookingSchema, slotSchema, type BookingDetails, type BookingSlot, type CreateBookingInput } from "./booking-types";

export { readDemoRecords as demoRecords, saveDemoRecords } from "./demo-booking-store";
export type { DemoRecord } from "./demo-booking-types";

type Service = PublishedBusinessConfig["services"][number];

export function getDemoSlots(tenant: PublishedBusinessConfig, serviceKey: string, localDate: string, records = readDemoRecords(tenant.slug)): BookingSlot[] {
  return calculateDemoSlots(tenant, serviceKey, localDate, records);
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
  return getDemoSlots(tenant, serviceKey, localDate);
}

function createDemoRecord(tenant: PublishedBusinessConfig, input: CreateBookingInput, service: Service, resourceId: string, accessToken: string): DemoRecord {
  const startsAt = new Date(input.startsAt);
  const endsAt = addMinutes(startsAt, service.durationMinutes);
  const bufferEndsAt = addMinutes(endsAt, service.bufferMinutes);
  const resource = tenant.resources.find((item) => item.key === resourceId);
  if (!resource) throw new Error("Подходящий пост не найден");
  return {
    bookingId: crypto.randomUUID(),
    status: "confirmed",
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    bufferEndsAt: bufferEndsAt.toISOString(),
    priceCents: service.priceCents,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    vehicle: input.vehicle,
    notes: input.notes || null,
    service: { key: service.key, name: service.name },
    resource: { key: resource.key, name: resource.name },
    tenant: { slug: tenant.slug, name: tenant.brand.name, timezone: tenant.timezone, cancellationHours: tenant.booking.cancellationHours },
    accessToken,
    resourceId,
    idempotencyKey: input.idempotencyKey,
    origin: "user",
  };
}

function validateDemoSlot(tenant: PublishedBusinessConfig, service: Service, startsAt: Date, records: DemoRecord[]): string {
  if (Number.isNaN(startsAt.getTime())) throw new Error("Некорректное время записи");
  const localDate = formatInTimeZone(startsAt, tenant.timezone, "yyyy-MM-dd");
  const slot = getDemoSlots(tenant, service.key, localDate, records).find((item) => item.startsAt === startsAt.toISOString());
  if (!slot?.available) throw new Error("Выбранное время уже занято");
  const resourceId = findDemoAvailableResource(tenant, service, startsAt, records);
  if (!resourceId) throw new Error("Выбранное время уже занято");
  return resourceId;
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

  const existing = readDemoRecords(tenant.slug).find((record) => record.idempotencyKey === input.idempotencyKey);
  if (existing) return { booking: existing, accessToken: existing.accessToken };
  const service = tenant.services.find((item) => item.key === input.serviceKey);
  if (!service) throw new Error("Услуга не найдена");
  const startsAt = new Date(input.startsAt);

  // Последняя проверка перед сохранением защищает от одновременной записи в другой вкладке.
  const latestRecords = readDemoRecords(tenant.slug);
  const latestExisting = latestRecords.find((record) => record.idempotencyKey === input.idempotencyKey);
  if (latestExisting) return { booking: latestExisting, accessToken: latestExisting.accessToken };
  const resourceId = validateDemoSlot(tenant, service, startsAt, latestRecords);
  const accessToken = crypto.randomUUID();
  const record = createDemoRecord(tenant, input, service, resourceId, accessToken);
  mergeAndSaveDemoRecords(tenant.slug, [record], { removeShowcase: true });
  return { booking: record, accessToken };
}

export async function fetchBooking(slug: string, accessToken: string): Promise<BookingDetails> {
  if (isDemoMode) {
    const record = findDemoRecordByToken(slug, accessToken);
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
    const record = findDemoRecordByToken(slug, accessToken);
    if (!record) throw new Error("Запись не найдена");
    if (record.origin === "showcase") throw new Error("Витринную запись нельзя отменить");
    mergeAndSaveDemoRecords(slug, [{ ...record, status: "cancelled", idempotencyKey }]);
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
