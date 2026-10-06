import { z } from "zod";

export const slotSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  available: z.boolean(),
});

export const bookingSchema = z.object({
  bookingId: z.uuid(),
  status: z.enum(["confirmed", "accepted", "ready", "completed", "cancelled", "no_show"]),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  bufferEndsAt: z.iso.datetime({ offset: true }).optional(),
  priceCents: z.number().int().positive(),
  customerName: z.string(),
  customerPhone: z.string(),
  vehicle: z.string(),
  notes: z.string().nullable().optional(),
  service: z.object({ key: z.string(), name: z.string() }),
  resource: z.object({ key: z.string(), name: z.string() }),
  tenant: z.object({ slug: z.string(), name: z.string(), timezone: z.string(), cancellationHours: z.number().int() }),
});

export interface CreateBookingInput {
  serviceKey: string;
  startsAt: string;
  customerName: string;
  customerPhone: string;
  vehicle: string;
  notes: string;
  idempotencyKey: string;
}

export type BookingSlot = z.infer<typeof slotSchema>;
export type BookingDetails = z.infer<typeof bookingSchema>;
