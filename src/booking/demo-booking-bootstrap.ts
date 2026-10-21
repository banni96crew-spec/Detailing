import { addDays, addMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { getBookingToken, saveBookingToken } from "./booking-storage";
import { findDemoAvailableResource, getDemoSlots } from "./demo-availability";
import {
  findDemoRecordByToken,
  mergeAndSaveDemoRecords,
  readDemoRecords,
  resetDemoStorage,
  showcaseKeyFor,
  withDemoBookingLock,
} from "./demo-booking-store";
import type { DemoRecord } from "./demo-booking-types";

export interface DemoBookingState {
  record: DemoRecord;
  accessToken: string;
}

function byStartAscending(left: DemoRecord, right: DemoRecord): number {
  return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
}

function resolveExistingRecord(tenant: PublishedBusinessConfig, requestedToken: string | null | undefined): DemoRecord | null {
  const requested = findDemoRecordByToken(tenant.slug, requestedToken);
  if (requested) return requested;
  const records = readDemoRecords(tenant.slug);
  const now = Date.now();
  const futureUser = records
    .filter((record) => record.origin === "user" && new Date(record.startsAt).getTime() >= now)
    .sort(byStartAscending)[0];
  if (futureUser) return futureUser;
  const user = records.filter((record) => record.origin === "user").sort(byStartAscending)[0];
  if (user) return user;
  return records.find((record) => record.origin === "showcase" && record.showcaseKey === showcaseKeyFor(tenant.slug))
    ?? records.find((record) => record.origin === "showcase")
    ?? null;
}

function createShowcaseRecord(tenant: PublishedBusinessConfig): DemoRecord {
  for (const service of tenant.services) {
    for (let dayOffset = 0; dayOffset <= tenant.booking.horizonDays; dayOffset += 1) {
      const localDate = formatInTimeZone(addDays(new Date(), dayOffset), tenant.timezone, "yyyy-MM-dd");
      const records = readDemoRecords(tenant.slug);
      const slot = getDemoSlots(tenant, service.key, localDate, records).find((candidate) => candidate.available);
      if (!slot) continue;
      const startsAt = new Date(slot.startsAt);
      const resourceId = findDemoAvailableResource(tenant, service, startsAt, records);
      const resource = resourceId ? tenant.resources.find((item) => item.key === resourceId) : null;
      if (!resourceId || !resource) continue;
      const endsAt = new Date(slot.endsAt);
      return {
        bookingId: crypto.randomUUID(),
        status: "confirmed",
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        bufferEndsAt: addMinutes(endsAt, service.bufferMinutes).toISOString(),
        priceCents: service.priceCents,
        customerName: "Демонстрационный клиент",
        customerPhone: "+7 900 000-00-00",
        vehicle: "Демонстрационный автомобиль",
        notes: "Витринная запись. Данные не принадлежат реальному клиенту.",
        service: { key: service.key, name: service.name },
        resource: { key: resource.key, name: resource.name },
        tenant: { slug: tenant.slug, name: tenant.brand.name, timezone: tenant.timezone, cancellationHours: tenant.booking.cancellationHours },
        accessToken: crypto.randomUUID(),
        resourceId,
        idempotencyKey: showcaseKeyFor(tenant.slug),
        origin: "showcase",
        showcaseKey: showcaseKeyFor(tenant.slug),
      };
    }
  }
  throw new Error("Нет доступных окон для витринной записи");
}

export async function ensureDemoBooking(tenant: PublishedBusinessConfig, requestedToken = getBookingToken(tenant.slug)): Promise<DemoBookingState> {
  return withDemoBookingLock(tenant.slug, () => {
    const existing = resolveExistingRecord(tenant, requestedToken);
    if (existing) {
      saveBookingToken(tenant.slug, existing.accessToken);
      return { record: existing, accessToken: existing.accessToken };
    }
    const showcase = createShowcaseRecord(tenant);
    const records = mergeAndSaveDemoRecords(tenant.slug, [showcase]);
    const saved = records.find((record) => record.origin === "showcase" && record.showcaseKey === showcase.showcaseKey) ?? showcase;
    saveBookingToken(tenant.slug, saved.accessToken);
    return { record: saved, accessToken: saved.accessToken };
  });
}

export async function resetDemoBooking(tenant: PublishedBusinessConfig): Promise<DemoBookingState> {
  resetDemoStorage(tenant.slug);
  return ensureDemoBooking(tenant, null);
}
