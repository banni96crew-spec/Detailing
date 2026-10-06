import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Нужен цвет в формате #RRGGBB");
const assetPath = z.string().regex(/^images\/[a-z0-9][a-z0-9._/-]*$/i, "Файл должен находиться в images/");
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Нужно время ЧЧ:ММ");
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Только строчные латинские буквы, цифры и дефисы");

export const businessConfigSchema = z
  .object({
    version: z.literal(1),
    slug,
    status: z.enum(["preview", "live"]),
    timezone: z.string().min(1),
    brand: z.object({
      name: z.string().min(2).max(80),
      shortName: z.string().min(2).max(24),
      description: z.string().min(20).max(300),
      accent: hexColor,
      logo: assetPath,
      hero: assetPath,
    }),
    contact: z.object({
      phone: z.string().min(5).max(32),
      address: z.string().min(5).max(180),
      directionsUrl: z.url(),
    }),
    booking: z.object({
      slotIntervalMinutes: z.number().int().min(5).max(120),
      minimumLeadMinutes: z.number().int().min(0).max(43_200),
      horizonDays: z.number().int().min(1).max(365),
      cancellationHours: z.number().int().min(0).max(720),
    }),
    hours: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          closed: z.boolean(),
          opensAt: clockTime.optional(),
          lastArrivalAt: clockTime.optional(),
        }),
      )
      .length(7),
    resources: z
      .array(
        z.object({
          key: slug,
          name: z.string().min(2).max(80),
          kind: z.enum(["bay", "lift", "mobile-team"]),
        }),
      )
      .min(1),
    services: z
      .array(
        z.object({
          key: slug,
          name: z.string().min(2).max(100),
          description: z.string().min(10).max(300),
          priceCents: z.number().int().positive(),
          durationMinutes: z.number().int().min(15).max(43_200),
          bufferMinutes: z.number().int().min(0).max(1_440),
          resourceKeys: z.array(slug).min(1),
          featured: z.boolean().default(false),
        }),
      )
      .min(1),
    infoCards: z
      .array(
        z.object({
          key: slug,
          title: z.string().min(2).max(80),
          text: z.string().min(10).max(240),
        }),
      )
      .length(3),
    gallery: z
      .array(
        z.object({
          key: slug,
          image: assetPath,
          caption: z.string().min(2).max(120),
        }),
      )
      .min(1),
    pwa: z.object({
      name: z.string().min(2).max(80),
      shortName: z.string().min(2).max(24),
      description: z.string().min(10).max(180),
    }),
  })
  .superRefine((config, context) => {
    const weekdays = new Set(config.hours.map((item) => item.weekday));
    if (weekdays.size !== 7) {
      context.addIssue({ code: "custom", path: ["hours"], message: "Каждый день недели должен быть указан один раз" });
    }

    for (const [index, item] of config.hours.entries()) {
      if (!item.closed && (!item.opensAt || !item.lastArrivalAt)) {
        context.addIssue({
          code: "custom",
          path: ["hours", index],
          message: "Для рабочего дня нужны opensAt и lastArrivalAt",
        });
      }
    }

    const resources = new Set(config.resources.map((item) => item.key));
    for (const [index, service] of config.services.entries()) {
      for (const resourceKey of service.resourceKeys) {
        if (!resources.has(resourceKey)) {
          context.addIssue({
            code: "custom",
            path: ["services", index, "resourceKeys"],
            message: `Неизвестный ресурс: ${resourceKey}`,
          });
        }
      }
    }
  });

export type BusinessConfig = z.infer<typeof businessConfigSchema>;

export type PublishedBusinessConfig = BusinessConfig & {
  assets: {
    logo: string;
    hero: string;
    appleTouchIcon: string;
    icon192: string;
    icon512: string;
    maskable512: string;
    gallery: { key: string; image: string; caption: string }[];
  };
};
