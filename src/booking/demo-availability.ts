import { addMinutes, eachMinuteOfInterval, isBefore } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { PublishedBusinessConfig } from "../domain/business-schema.js";
import type { BookingSlot } from "./booking-types.js";
import type { DemoRecord } from "./demo-booking-types.js";

type Service = PublishedBusinessConfig["services"][number];

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return isBefore(startA, endB) && isBefore(startB, endA);
}

function activeRecords(records: DemoRecord[]): DemoRecord[] {
  return records.filter((record) => record.origin !== "showcase" && record.status !== "cancelled" && record.status !== "no_show");
}

export function findDemoAvailableResource(tenant: PublishedBusinessConfig, service: Service, startsAt: Date, records: DemoRecord[]): string | null {
  const endsAt = addMinutes(startsAt, service.durationMinutes);
  const bufferEndsAt = addMinutes(endsAt, service.bufferMinutes);
  const active = activeRecords(records);
  return service.resourceKeys.find((resourceId) => !active.some((record) => record.resourceId === resourceId && overlaps(startsAt, bufferEndsAt, new Date(record.startsAt), new Date(record.bufferEndsAt)))) ?? null;
}

export function getDemoSlots(tenant: PublishedBusinessConfig, serviceKey: string, localDate: string, records: DemoRecord[]): BookingSlot[] {
  const service = tenant.services.find((item) => item.key === serviceKey);
  if (!service) throw new Error("Услуга не найдена");
  const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  const hours = tenant.hours.find((item) => item.weekday === weekday);
  if (!hours || hours.closed || !hours.opensAt || !hours.lastArrivalAt) return [];
  const first = fromZonedTime(`${localDate}T${hours.opensAt}:00`, tenant.timezone);
  const last = fromZonedTime(`${localDate}T${hours.lastArrivalAt}:00`, tenant.timezone);
  if (isBefore(last, first)) return [];
  const nowWithLead = addMinutes(new Date(), tenant.booking.minimumLeadMinutes);
  return eachMinuteOfInterval({ start: first, end: last }, { step: tenant.booking.slotIntervalMinutes }).map((startsAt) => ({
    startsAt: startsAt.toISOString(),
    endsAt: addMinutes(startsAt, service.durationMinutes).toISOString(),
    available: Boolean(findDemoAvailableResource(tenant, service, startsAt, records)) && !isBefore(startsAt, nowWithLead),
  }));
}
