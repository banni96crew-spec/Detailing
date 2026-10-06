const tokenPrefix = "tenant-booking-token:";

export function saveBookingToken(slug: string, token: string): void {
  localStorage.setItem(`${tokenPrefix}${slug}`, token);
}

export function getBookingToken(slug: string): string | null {
  return localStorage.getItem(`${tokenPrefix}${slug}`);
}

export function clearBookingToken(slug: string): void {
  localStorage.removeItem(`${tokenPrefix}${slug}`);
}
