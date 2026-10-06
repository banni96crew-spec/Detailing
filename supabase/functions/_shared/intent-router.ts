export type AssistantScope = "client" | "owner";
export type AssistantIntent = "availability" | "price" | "directions" | "owner_schedule" | "owner_stats" | "general";

export interface RoutedIntent {
  intent: AssistantIntent;
  dateHint?: "today" | "tomorrow" | "week";
}

export function routeIntent(message: string, scope: AssistantScope): RoutedIntent {
  const text = message.toLocaleLowerCase("ru-RU");
  const dateHint = text.includes("завтра") ? "tomorrow" : text.includes("недел") ? "week" : text.includes("сегодня") ? "today" : undefined;
  if (scope === "owner") {
    if (/сколько\s+(денег|получено)|выруч|оплат|возврат/.test(text)) return { intent: "owner_stats", ...(dateHint ? { dateHint } : {}) };
    if (/что\s+(у меня|записано)|машин|заезд|расписан|запис/.test(text)) return { intent: "owner_schedule", ...(dateHint ? { dateHint } : {}) };
  }
  if (/окн|свобод|время|запис/.test(text)) return { intent: "availability", ...(dateHint ? { dateHint } : {}) };
  if (/цен|стоит|стоимост|прайс/.test(text)) return { intent: "price" };
  if (/как\s+(найти|доехать)|адрес|находит/.test(text)) return { intent: "directions" };
  return { intent: "general", ...(dateHint ? { dateHint } : {}) };
}
