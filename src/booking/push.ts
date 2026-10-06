import { browserEnvironment, isDemoMode } from "@/lib/env";

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.padEnd(Math.ceil(value.length / 4) * 4, "=").replaceAll("-", "+").replaceAll("_", "/");
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  return new Uint8Array(bytes.buffer);
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

export async function enableBookingPush(slug: string, accessToken: string): Promise<void> {
  if (isDemoMode) throw new Error("В образце уведомления не отправляются");
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Push-уведомления недоступны в этом браузере");
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !isStandalone()) throw new Error("На iPhone сначала добавьте приложение на экран «Домой»");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разрешение на уведомления не выдано");
  const publicKey = browserEnvironment.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) throw new Error("Открытый ключ уведомлений не настроен");
  if (!browserEnvironment.VITE_PUBLIC_API_URL) throw new Error("Адрес сервера записи не настроен");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(publicKey) });
  const response = await fetch(`${browserEnvironment.VITE_PUBLIC_API_URL}/tenant/${encodeURIComponent(slug)}/bookings/${encodeURIComponent(accessToken)}/push`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Не удалось включить напоминание");
}
