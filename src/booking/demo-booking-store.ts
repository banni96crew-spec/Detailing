import { bookingSchema } from "./booking-types";
import type { DemoBookingOrigin, DemoRecord } from "./demo-booking-types";

export type { DemoBookingOrigin, DemoRecord } from "./demo-booking-types";

export const showcaseKeyFor = (slug: string): string => `showcase:${slug}:v1`;
export const demoBookingsKey = (slug: string): string => `demo-bookings:${slug}`;
export const demoPaymentsKey = (slug: string): string => `demo-payments:${slug}`;
export const bookingTokenKey = (slug: string): string => `tenant-booking-token:${slug}`;

function notify(slug: string): void {
  window.dispatchEvent(new CustomEvent("demo-bookings-changed", { detail: { slug } }));
}

export function notifyDemoBookingChange(slug: string): void {
  notify(slug);
}

function parseRecord(value: unknown): DemoRecord | null {
  const parsed = bookingSchema.safeParse(value);
  if (!parsed.success || typeof value !== "object" || value === null) return null;
  const extra = value as Record<string, unknown>;
  if (
    typeof extra.accessToken !== "string"
    || typeof extra.resourceId !== "string"
    || typeof extra.bufferEndsAt !== "string"
    || typeof extra.idempotencyKey !== "string"
  ) return null;
  const origin: DemoBookingOrigin = extra.origin === "showcase" ? "showcase" : "user";
  const showcaseKey = origin === "showcase" && typeof extra.showcaseKey === "string" ? extra.showcaseKey : undefined;
  return {
    ...parsed.data,
    accessToken: extra.accessToken,
    resourceId: extra.resourceId,
    bufferEndsAt: extra.bufferEndsAt,
    idempotencyKey: extra.idempotencyKey,
    origin,
    ...(showcaseKey ? { showcaseKey } : {}),
  };
}

function normalizeRecords(value: unknown): DemoRecord[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => {
    const parsed = parseRecord(item);
    return parsed ? [parsed] : [];
  });
}

function deduplicateShowcases(records: DemoRecord[]): DemoRecord[] {
  const showcases = new Map<string, DemoRecord>();
  const nonShowcases: DemoRecord[] = [];
  for (const record of records) {
    if (record.origin !== "showcase") {
      nonShowcases.push(record);
      continue;
    }
    const key = record.showcaseKey ?? showcaseKeyFor(record.tenant.slug);
    if (!showcases.has(key)) showcases.set(key, { ...record, showcaseKey: key });
  }
  return [...nonShowcases, ...showcases.values()];
}

function writeRecords(slug: string, records: DemoRecord[]): DemoRecord[] {
  const normalized = deduplicateShowcases(records);
  localStorage.setItem(demoBookingsKey(slug), JSON.stringify(normalized));
  notify(slug);
  return normalized;
}

export function readDemoRecords(slug: string): DemoRecord[] {
  const raw = localStorage.getItem(demoBookingsKey(slug));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const records = normalizeRecords(parsed);
    if (records === null) {
      localStorage.removeItem(demoBookingsKey(slug));
      notify(slug);
      return [];
    }
    if (records.length !== parsed.length) return writeRecords(slug, records);
    return deduplicateShowcases(records);
  } catch {
    localStorage.removeItem(demoBookingsKey(slug));
    notify(slug);
    return [];
  }
}

export function saveDemoRecords(slug: string, records: DemoRecord[]): DemoRecord[] {
  return writeRecords(slug, records);
}

export function mergeAndSaveDemoRecords(slug: string, updates: DemoRecord[], options: { removeShowcase?: boolean } = {}): DemoRecord[] {
  const current = readDemoRecords(slug);
  const merged = new Map(current.map((record) => [record.bookingId, record]));
  for (const record of updates) merged.set(record.bookingId, record);
  const values = [...merged.values()].filter((record) => !options.removeShowcase || record.origin !== "showcase");
  return writeRecords(slug, values);
}

export function findDemoRecordByToken(slug: string, token: string | null | undefined): DemoRecord | null {
  if (!token) return null;
  return readDemoRecords(slug).find((record) => record.accessToken === token) ?? null;
}

export function readDemoPayments(slug: string): Record<string, number> {
  const raw = localStorage.getItem(demoPaymentsKey(slug));
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("invalid payments");
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "number" && Number.isFinite(value)));
  } catch {
    localStorage.removeItem(demoPaymentsKey(slug));
    notify(slug);
    return {};
  }
}

export function saveDemoPayments(slug: string, values: Record<string, number>): void {
  localStorage.setItem(demoPaymentsKey(slug), JSON.stringify(values));
  notify(slug);
}

export function resetDemoStorage(slug: string): void {
  localStorage.removeItem(bookingTokenKey(slug));
  localStorage.removeItem(demoBookingsKey(slug));
  localStorage.removeItem(demoPaymentsKey(slug));
  notify(slug);
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T> | T): Promise<T>;
}

export function withDemoBookingLock<T>(slug: string, operation: () => Promise<T> | T): Promise<T> {
  const locks = Reflect.get(navigator, "locks") as LockManagerLike | undefined;
  if (!locks) return Promise.resolve(operation());
  return locks.request(`demo-bookings:${slug}`, operation);
}
