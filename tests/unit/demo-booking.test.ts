import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { businessConfigSchema, type PublishedBusinessConfig } from "../../src/domain/business-schema";
import { createBooking, getDemoSlots } from "../../src/booking/booking-repository";
import { ensureDemoBooking, resetDemoBooking } from "../../src/booking/demo-booking-bootstrap";
import {
  bookingTokenKey,
  demoBookingsKey,
  demoPaymentsKey,
  readDemoRecords,
  saveDemoRecords,
} from "../../src/booking/demo-booking-store";

async function graphite(): Promise<PublishedBusinessConfig> {
  const value: unknown = JSON.parse(await readFile(path.resolve("tenants", "graphite", "business.json"), "utf8"));
  const config = businessConfigSchema.parse(value);
  return {
    ...config,
    assets: {
      logo: "/logo.svg",
      hero: "/hero.svg",
      appleTouchIcon: "/apple-touch-icon.png",
      icon192: "/icon-192.png",
      icon512: "/icon-512.png",
      maskable512: "/maskable-512.png",
      gallery: [],
      services: [],
    },
  };
}

describe("витринная демонстрационная запись", () => {
  beforeEach(() => localStorage.clear());

  it("создаёт одну заполненную витрину на чистом устройстве и не дублирует её", async () => {
    const tenant = await graphite();
    const first = await ensureDemoBooking(tenant);
    const second = await ensureDemoBooking(tenant);

    expect(first.record.origin).toBe("showcase");
    expect(first.accessToken).toBe(second.accessToken);
    expect(readDemoRecords(tenant.slug).filter((record) => record.origin === "showcase")).toHaveLength(1);
  });

  it("восстанавливает витрину при устаревшем токене и повреждённых данных", async () => {
    const tenant = await graphite();
    localStorage.setItem(bookingTokenKey(tenant.slug), "missing-token");
    localStorage.setItem(demoBookingsKey(tenant.slug), "not-json");

    const restored = await ensureDemoBooking(tenant);

    expect(restored.record.origin).toBe("showcase");
    expect(localStorage.getItem(bookingTokenKey(tenant.slug))).toBe(restored.accessToken);
    expect(readDemoRecords(tenant.slug)).toHaveLength(1);
  });

  it("считает старую запись без origin пользовательской и не создаёт витрину", async () => {
    const tenant = await graphite();
    const showcase = await ensureDemoBooking(tenant);
    const legacyRecord = structuredClone(showcase.record) as Record<string, unknown>;
    delete legacyRecord.showcaseKey;
    delete legacyRecord.origin;
    const oldRecord = { ...legacyRecord, bookingId: crypto.randomUUID(), accessToken: "existing-user-token", idempotencyKey: "existing-user" };
    localStorage.setItem(demoBookingsKey(tenant.slug), JSON.stringify([oldRecord]));
    localStorage.removeItem(bookingTokenKey(tenant.slug));

    const restored = await ensureDemoBooking(tenant);

    expect(restored.accessToken).toBe("existing-user-token");
    expect(restored.record.origin).toBe("user");
    expect(readDemoRecords(tenant.slug).filter((record) => record.origin === "showcase")).toHaveLength(0);
  });

  it("не делает витрину занятой и заменяет её только успешной пользовательской записью", async () => {
    const tenant = await graphite();
    const showcase = await ensureDemoBooking(tenant);
    const service = tenant.services[0];
    if (!service) throw new Error("В конфигурации нет услуги");
    const localDate = formatInTimeZone(new Date(showcase.record.startsAt), tenant.timezone, "yyyy-MM-dd");
    const slot = getDemoSlots(tenant, service.key, localDate).find((item) => item.startsAt === showcase.record.startsAt);
    expect(slot?.available).toBe(true);

    await expect(createBooking(tenant, {
      serviceKey: "missing",
      startsAt: showcase.record.startsAt,
      customerName: "Иван Петров",
      customerPhone: "+7 999 123-45-67",
      vehicle: "BMW X5",
      notes: "",
      idempotencyKey: crypto.randomUUID(),
    })).rejects.toThrow("Услуга не найдена");
    expect(readDemoRecords(tenant.slug).filter((record) => record.origin === "showcase")).toHaveLength(1);

    const created = await createBooking(tenant, {
      serviceKey: service.key,
      startsAt: showcase.record.startsAt,
      customerName: "Иван Петров",
      customerPhone: "+7 999 123-45-67",
      vehicle: "BMW X5",
      notes: "",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(created.booking.vehicle).toBe("BMW X5");
    expect(readDemoRecords(tenant.slug).filter((record) => record.origin === "showcase")).toHaveLength(0);
    expect(readDemoRecords(tenant.slug).filter((record) => record.origin === "user")).toHaveLength(1);
  });

  it("сбрасывает только ключи своей студии и создаёт новую витрину", async () => {
    const tenant = await graphite();
    await ensureDemoBooking(tenant);
    localStorage.setItem(demoPaymentsKey(tenant.slug), JSON.stringify({ payment: 100 }));
    localStorage.setItem(demoBookingsKey("other-studio"), "other-value");

    const reset = await resetDemoBooking(tenant);

    expect(reset.record.origin).toBe("showcase");
    expect(readDemoRecords(tenant.slug)).toHaveLength(1);
    expect(localStorage.getItem(demoPaymentsKey(tenant.slug))).toBeNull();
    expect(localStorage.getItem(demoBookingsKey("other-studio"))).toBe("other-value");
  });

  it("находит хотя бы один реальный доступный слот в пределах горизонта", async () => {
    const tenant = await graphite();
    const state = await ensureDemoBooking(tenant);
    expect(state.record.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    saveDemoRecords(tenant.slug, readDemoRecords(tenant.slug));
  });
});
