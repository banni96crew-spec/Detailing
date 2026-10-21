import type { BookingDetails } from "./booking-types.js";

export type DemoBookingOrigin = "showcase" | "user";

export interface DemoRecord extends BookingDetails {
  accessToken: string;
  resourceId: string;
  bufferEndsAt: string;
  idempotencyKey: string;
  origin: DemoBookingOrigin;
  showcaseKey?: string;
}
