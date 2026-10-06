import { formatInTimeZone } from "date-fns-tz";
import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { browserEnvironment, isDemoMode } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";
import { fetchSlots } from "@/booking/booking-repository";
import { fetchOwnerBookings, fetchOwnerStats } from "@/owner/owner-repository";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function money(cents: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(cents / 100);
}

async function demoAnswer(tenant: PublishedBusinessConfig, scope: "client" | "owner", message: string): Promise<string> {
  const text = message.toLocaleLowerCase("ru-RU");
  const today = formatInTimeZone(new Date(), tenant.timezone, "yyyy-MM-dd");
  if (scope === "owner" && /(денег|получено|оплат|выруч)/.test(text)) {
    const stats = await fetchOwnerStats(tenant, today, today);
    return `Сегодня получено ${money(stats.receivedCents)}. Заездов: ${stats.arrivals}, завершённых заказов: ${stats.completedOrders}.`;
  }
  if (scope === "owner" && /(завтра|машин|запис)/.test(text)) {
    const rows = await fetchOwnerBookings(tenant, today, today);
    return rows.length ? `На выбранный день ${rows.length} записей. Полные данные находятся в списке записей.` : "На выбранный день записей нет.";
  }
  if (/(адрес|найти|доехать)/.test(text)) return `Адрес: ${tenant.contact.address}. Маршрут: ${tenant.contact.directionsUrl}`;
  if (/(цен|стоит|стоимост)/.test(text)) {
    const service = tenant.services.find((item) => item.name.toLocaleLowerCase("ru-RU").split(/\s+/).some((word) => word.length > 4 && text.includes(word)));
    return service ? `${service.name} — ${money(service.priceCents)}.` : `Услуги: ${tenant.services.map((item) => `${item.name} — ${money(item.priceCents)}`).join("; ")}.`;
  }
  if (/(окн|свобод|время)/.test(text)) {
    const service = tenant.services[0];
    if (!service) return "Услуги пока не настроены.";
    const slots = (await fetchSlots(tenant, service.key, today)).filter((slot) => slot.available).slice(0, 3);
    return slots.length ? `Для услуги «${service.name}» ближайшие окна сегодня: ${slots.map((slot) => new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(slot.startsAt))).join(", ")}.` : "На сегодня свободных окон нет. Уточните услугу и выберите другую дату в форме записи.";
  }
  return "Спросите о цене, адресе или свободном времени.";
}

export async function askAssistant(tenant: PublishedBusinessConfig, scope: "client" | "owner", message: string, history: ChatMessage[]): Promise<string> {
  if (isDemoMode) return demoAnswer(tenant, scope, message);
  if (!browserEnvironment.VITE_ASSISTANT_API_URL) throw new Error("Адрес помощника не настроен");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (scope === "owner") {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) throw new Error("Для помощника владельца нужен вход");
    headers.authorization = `Bearer ${data.session.access_token}`;
  }
  const response = await fetch(browserEnvironment.VITE_ASSISTANT_API_URL, {
    method: "POST", headers, body: JSON.stringify({ slug: tenant.slug, scope, message, history: history.slice(-10) }),
  });
  const payload = await response.json() as { answer?: string; error?: string };
  if (!response.ok || !payload.answer) throw new Error(payload.error ?? "Помощник временно недоступен");
  return payload.answer;
}
