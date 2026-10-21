import { bookingTokenKey, notifyDemoBookingChange } from "./demo-booking-store";

export function saveBookingToken(slug: string, token: string): void {
  if (localStorage.getItem(bookingTokenKey(slug)) === token) return;
  localStorage.setItem(bookingTokenKey(slug), token);
  notifyDemoBookingChange(slug);
}

export function getBookingToken(slug: string): string | null {
  return localStorage.getItem(bookingTokenKey(slug));
}

export function clearBookingToken(slug: string): void {
  localStorage.removeItem(bookingTokenKey(slug));
  notifyDemoBookingChange(slug);
}
