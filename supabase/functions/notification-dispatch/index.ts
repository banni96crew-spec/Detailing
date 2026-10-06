import webpush from "npm:web-push@3.6.7";
import { serverClient } from "../_shared/server.ts";
import { json } from "../_shared/http.ts";

type LeasedRow = {
  job_id: string;
  lease_token: string;
  tenant_id: string;
  booking_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  endpoint: string | null;
  p256dh: string | null;
  auth_secret: string | null;
};

const labels: Record<string, { title: string; body: string }> = {
  booking_created: { title: "Запись подтверждена", body: "Подробности записи доступны в приложении." },
  booking_rescheduled: { title: "Запись перенесена", body: "Откройте приложение, чтобы проверить новое время." },
  booking_cancelled: { title: "Запись отменена", body: "Занятое время освобождено." },
  booking_reminder: { title: "Напоминание о записи", body: "До визита осталось около суток." },
  booking_accepted: { title: "Автомобиль принят", body: "Работы начались." },
  booking_ready: { title: "Автомобиль готов", body: "Можно планировать получение автомобиля." },
  booking_completed: { title: "Работы завершены", body: "Спасибо за визит." },
};

Deno.serve(async (request) => {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || request.headers.get("x-cron-secret") !== expected) return json(request, { error: "Доступ запрещён" }, 403);
  const subject = Deno.env.get("VAPID_SUBJECT");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!subject || !publicKey || !privateKey) return json(request, { error: "VAPID не настроен" }, 503);
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const client = serverClient();
  const { data, error } = await client.rpc("server_lease_notification_jobs", { p_limit: 50, p_lease_seconds: 120 });
  if (error) return json(request, { error: error.message }, 500);
  const groups = new Map<string, LeasedRow[]>();
  for (const row of (data ?? []) as LeasedRow[]) groups.set(row.job_id, [...(groups.get(row.job_id) ?? []), row]);
  let sent = 0;
  let failed = 0;
  for (const rows of groups.values()) {
    const first = rows[0]!;
    const destinations = rows.filter((row) => row.endpoint && row.p256dh && row.auth_secret);
    let failure: string | null = null;
    let disabledEndpoint: string | null = null;
    for (const row of destinations) {
      try {
        const message = labels[row.event_type] ?? { title: "Обновление записи", body: "Откройте приложение, чтобы увидеть подробности." };
        await webpush.sendNotification(
          { endpoint: row.endpoint!, keys: { p256dh: row.p256dh!, auth: row.auth_secret! } },
          JSON.stringify({ ...message, tag: `${row.booking_id}:${row.event_type}`, data: row.payload }),
          { TTL: 86_400, urgency: row.event_type === "booking_reminder" ? "normal" : "high" },
        );
      } catch (cause) {
        const statusCode = typeof cause === "object" && cause && "statusCode" in cause ? Number(cause.statusCode) : 0;
        failure = cause instanceof Error ? cause.message : "Не удалось отправить push";
        if (statusCode === 404 || statusCode === 410) disabledEndpoint = row.endpoint;
        break;
      }
    }
    const completed = failure === null;
    const finish = await client.rpc("server_finish_notification_job", {
      p_job_id: first.job_id,
      p_lease_token: first.lease_token,
      p_sent: completed,
      p_error: failure,
      p_disable_endpoint: disabledEndpoint,
    });
    if (finish.error) failure = finish.error.message;
    if (failure) failed += 1; else sent += 1;
  }
  return json(request, { leased: groups.size, sent, failed });
});
