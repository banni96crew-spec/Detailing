import OpenAI from "npm:openai@7.28.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@4.1.11";
import { corsHeaders, json, problem, readJson } from "../_shared/http.ts";
import { routeIntent, type AssistantScope } from "../_shared/intent-router.ts";
import { assertRpc, consumeLimit, requestAddress, serverClient, sha256Hex } from "../_shared/server.ts";

const inputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  scope: z.enum(["client", "owner"]),
  message: z.string().trim().min(2).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(10).default([]),
});

type Business = {
  timezone: string;
  contact: { address: string; directionsUrl: string };
  services: Array<{ key: string; name: string; description: string; priceCents: number }>;
};

function localIsoDate(timezone: string, plusDays = 0): string {
  const date = new Date(Date.now() + plusDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function rubles(cents: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(cents / 100);
}

function bestService(message: string, business: Business): Business["services"][number] | undefined {
  const text = message.toLocaleLowerCase("ru-RU");
  return business.services.find((service) => {
    const words = service.name.toLocaleLowerCase("ru-RU").split(/\s+/).filter((word) => word.length > 4);
    return words.some((word) => text.includes(word));
  });
}

async function authenticatedClient(request: Request): Promise<SupabaseClient> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Для помощника владельца нужен вход");
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("Supabase не настроен");
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Сеанс владельца недействителен");
  return client;
}

async function initialToolData(
  service: SupabaseClient,
  owner: SupabaseClient | null,
  input: z.infer<typeof inputSchema>,
  business: Business,
): Promise<{ tool: string; result: unknown }> {
  const route = routeIntent(input.message, input.scope as AssistantScope);
  if (input.scope === "owner" && route.intent === "owner_stats") {
    if (!owner) throw new Error("Для статистики нужен вход владельца");
    const today = localIsoDate(business.timezone);
    const from = route.dateHint === "week" ? localIsoDate(business.timezone, -6) : today;
    return { tool: "owner_stats", result: assertRpc(await owner.rpc("owner_dashboard_stats", { p_slug: input.slug, p_from_local_date: from, p_to_local_date: today })) };
  }
  if (input.scope === "owner" && route.intent === "owner_schedule") {
    if (!owner) throw new Error("Для расписания нужен вход владельца");
    const plus = route.dateHint === "tomorrow" ? 1 : 0;
    const from = localIsoDate(business.timezone, plus);
    const to = route.dateHint === "week" ? localIsoDate(business.timezone, 6) : from;
    return { tool: "owner_schedule", result: assertRpc(await owner.rpc("owner_bookings", { p_slug: input.slug, p_from_local_date: from, p_to_local_date: to })) };
  }
  if (route.intent === "availability") {
    const serviceItem = bestService(input.message, business);
    if (serviceItem) {
      const date = localIsoDate(business.timezone, route.dateHint === "tomorrow" ? 1 : 0);
      return { tool: "available_slots", result: assertRpc(await service.rpc("public_available_slots", { p_slug: input.slug, p_service_key: serviceItem.key, p_local_date: date })) };
    }
  }
  return { tool: "business_info", result: business };
}

function fallbackAnswer(input: z.infer<typeof inputSchema>, business: Business, toolData: { tool: string; result: unknown }): string {
  const route = routeIntent(input.message, input.scope as AssistantScope);
  if (route.intent === "directions") return `Адрес: ${business.contact.address}. Маршрут: ${business.contact.directionsUrl}`;
  if (route.intent === "price") {
    const service = bestService(input.message, business);
    if (service) return `${service.name} — ${rubles(service.priceCents)}. ${service.description}`;
    return `Уточните услугу. Доступны: ${business.services.map((item) => `${item.name} — ${rubles(item.priceCents)}`).join("; ")}.`;
  }
  if (toolData.tool === "available_slots") {
    const slots = (toolData.result as Array<{ startsAt: string; available: boolean }>).filter((slot) => slot.available).slice(0, 3);
    if (!slots.length) return "На выбранный день свободных окон нет. Выберите другую дату.";
    return `Ближайшие свободные окна: ${slots.map((slot) => new Intl.DateTimeFormat("ru-RU", { timeZone: business.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(slot.startsAt))).join(", ")}.`;
  }
  if (toolData.tool === "owner_stats") {
    const stats = toolData.result as { arrivals: number; completedOrders: number; receivedCents: number };
    return `За выбранный период: заездов — ${stats.arrivals}, завершённых заказов — ${stats.completedOrders}, получено — ${rubles(stats.receivedCents)}.`;
  }
  if (toolData.tool === "owner_schedule") {
    const rows = toolData.result as unknown[];
    return rows.length ? `В расписании ${rows.length} записей. Откройте раздел «Записи», чтобы увидеть клиентов и время.` : "На выбранный период записей нет.";
  }
  return "Могу подсказать цену, адрес или свободное время. Назовите услугу и желаемый день.";
}

function modelTools(scope: AssistantScope) {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: "function" as const,
      function: {
        name: "get_business_info",
        description: "Получить услуги, цены, адрес и сведения текущей студии",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_available_slots",
        description: "Получить реальные окна текущей студии для услуги и локальной даты",
        parameters: {
          type: "object",
          properties: { serviceKey: { type: "string" }, date: { type: "string", format: "date" } },
          required: ["serviceKey", "date"],
          additionalProperties: false,
        },
      },
    },
  ];
  if (scope === "owner") {
    tools.push(
      {
        type: "function" as const,
        function: {
          name: "get_owner_schedule",
          description: "Получить реальные записи владельца за период",
          parameters: { type: "object", properties: { from: { type: "string", format: "date" }, to: { type: "string", format: "date" } }, required: ["from", "to"], additionalProperties: false },
        },
      },
      {
        type: "function" as const,
        function: {
          name: "get_owner_stats",
          description: "Получить заезды, завершённые заказы и фактически полученные деньги за период",
          parameters: { type: "object", properties: { from: { type: "string", format: "date" }, to: { type: "string", format: "date" } }, required: ["from", "to"], additionalProperties: false },
        },
      },
    );
  }
  return tools;
}

async function executeAssistantTool(
  name: string,
  rawArguments: string,
  input: z.infer<typeof inputSchema>,
  business: Business,
  service: SupabaseClient,
  owner: SupabaseClient | null,
): Promise<unknown> {
  const args: unknown = JSON.parse(rawArguments || "{}");
  if (name === "get_business_info") return business;
  if (name === "get_available_slots") {
    const parsed = z.object({ serviceKey: z.string(), date: z.iso.date() }).parse(args);
    if (!business.services.some((item) => item.key === parsed.serviceKey)) throw new Error("Услуга не принадлежит текущей студии");
    return assertRpc(await service.rpc("public_available_slots", { p_slug: input.slug, p_service_key: parsed.serviceKey, p_local_date: parsed.date }));
  }
  if (name === "get_owner_schedule" || name === "get_owner_stats") {
    if (input.scope !== "owner" || !owner) throw new Error("Инструмент владельца недоступен клиенту");
    const parsed = z.object({ from: z.iso.date(), to: z.iso.date() }).parse(args);
    if (name === "get_owner_schedule") return assertRpc(await owner.rpc("owner_bookings", { p_slug: input.slug, p_from_local_date: parsed.from, p_to_local_date: parsed.to }));
    return assertRpc(await owner.rpc("owner_dashboard_stats", { p_slug: input.slug, p_from_local_date: parsed.from, p_to_local_date: parsed.to }));
  }
  throw new Error("Неизвестный серверный инструмент");
}

async function runToolLoop(
  openai: OpenAI,
  model: string,
  system: string,
  input: z.infer<typeof inputSchema>,
  business: Business,
  initial: { tool: string; result: unknown },
  service: SupabaseClient,
  owner: SupabaseClient | null,
): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...input.history,
    { role: "system", content: `Сервер уже выполнил инструмент ${initial.tool}. Результат: ${JSON.stringify(initial.result)}` },
    { role: "user", content: input.message },
  ];
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const completion = await openai.chat.completions.create({ model, max_tokens: 500, messages, tools: modelTools(input.scope) });
    const message = completion.choices[0]?.message;
    if (!message) throw new Error("Модель не вернула ответ");
    if (!message.tool_calls?.length) {
      const answer = message.content?.trim();
      if (!answer) throw new Error("Модель не вернула текст ответа");
      return answer;
    }
    messages.push(message);
    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") throw new Error("Неподдерживаемый вызов инструмента");
      const result = await executeAssistantTool(toolCall.function.name, toolCall.function.arguments, input, business, service, owner);
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
    }
  }
  throw new Error("Помощник превысил предел вызовов инструментов");
}

async function runJsonIntentFallback(
  openai: OpenAI,
  model: string,
  system: string,
  input: z.infer<typeof inputSchema>,
  business: Business,
  initial: { tool: string; result: unknown },
  service: SupabaseClient,
  owner: SupabaseClient | null,
): Promise<string> {
  const allowed = modelTools(input.scope).flatMap((tool) => tool.type === "function" ? [tool.function.name] : []);
  const routing = await openai.chat.completions.create({
    model,
    max_tokens: 180,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `Выбери один разрешённый серверный инструмент: ${allowed.join(", ")}. Верни только JSON {"intent":"имя","arguments":{}}. tenant_id и slug выбирать нельзя.` },
      { role: "user", content: input.message },
    ],
  });
  const routeRaw = routing.choices[0]?.message.content;
  if (!routeRaw) throw new Error("Модель не вернула JSON-намерение");
  const route = z.object({ intent: z.enum(allowed as [string, ...string[]]), arguments: z.record(z.string(), z.unknown()).default({}) }).parse(JSON.parse(routeRaw));
  const routedResult = await executeAssistantTool(route.intent, JSON.stringify(route.arguments), input, business, service, owner);
  const completion = await openai.chat.completions.create({
    model,
    max_tokens: 500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `${system} Верни только JSON {"answer":"..."}.` },
      { role: "system", content: `Первичный инструмент ${initial.tool}: ${JSON.stringify(initial.result)}. Инструмент ${route.intent}: ${JSON.stringify(routedResult)}.` },
      { role: "user", content: input.message },
    ],
  });
  const answerRaw = completion.choices[0]?.message.content;
  if (!answerRaw) throw new Error("Модель не вернула JSON-ответ");
  return z.object({ answer: z.string().min(1).max(2000) }).parse(JSON.parse(answerRaw)).answer;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  try {
    if (request.method !== "POST") throw new Error("Метод не поддерживается");
    const input = inputSchema.parse(await readJson(request));
    const service = serverClient();
    const owner = input.scope === "owner" ? await authenticatedClient(request) : null;
    const actor = input.scope === "owner" ? request.headers.get("authorization")!.slice(-24) : requestAddress(request);
    await consumeLimit(service, `assistant-${input.scope}`, `${input.slug}:${actor}`, input.scope === "owner" ? 60 : 20, 3600);

    const business = assertRpc<Business | null>(await service.rpc("public_tenant_bootstrap", { p_slug: input.slug }));
    if (!business) throw new Error("Студия не найдена");
    const toolData = await initialToolData(service, owner, input, business);
    const baseURL = Deno.env.get("LLM_BASE_URL");
    const apiKey = Deno.env.get("LLM_API_KEY");
    const model = Deno.env.get("LLM_MODEL");
    if (!baseURL || !apiKey || !model) return json(request, { answer: fallbackAnswer(input, business, toolData), mode: "fallback", source: toolData.tool });

    const dailyBudget = Number(Deno.env.get("LLM_DAILY_TOKEN_BUDGET") ?? "50000");
    await consumeLimit(service, "llm-daily-budget", `${input.slug}:${localIsoDate(business.timezone)}`, dailyBudget, 86_400, 600);
    const openai = new OpenAI({ apiKey, baseURL });
    const system = input.scope === "owner"
      ? "Ты помощник владельца автосервиса. Отвечай кратко по-русски только по переданным данным. Не меняй данные и не выдумывай записи, деньги или клиентов. Различай заезды, завершённые заказы и фактически полученные платежи."
      : "Ты помощник клиента автосервиса. Отвечай кратко по-русски только по переданным данным студии. Не раскрывай персональные данные и не выдумывай свободное время.";
    let answer: string;
    try {
      answer = await runToolLoop(openai, model, system, input, business, toolData, service, owner);
    } catch (toolError) {
      console.warn("Tool loop unavailable; using JSON response fallback", toolError);
      answer = await runJsonIntentFallback(openai, model, system, input, business, toolData, service, owner);
    }
    return json(request, { answer, mode: "llm", source: toolData.tool });
  } catch (error) {
    return problem(request, error);
  }
});
