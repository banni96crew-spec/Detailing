import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { useState } from "react";
import { fetchOwnerBookings, fetchOwnerStats, recordOwnerPayment, setOwnerBookingStatus, type OwnerBooking } from "./owner-repository";
import { useTenant } from "@/tenant/tenant-context";

function money(cents: number): string {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(cents / 100);
}

const statusLabel: Record<string, string> = {
  confirmed: "Подтверждена",
  accepted: "Автомобиль принят",
  ready: "Готов",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не состоялась",
};

export function OwnerDashboardPage() {
  const tenant = useTenant();
  const [period, setPeriod] = useState<"today" | "week">("today");
  const queryClient = useQueryClient();
  const today = formatInTimeZone(new Date(), tenant.timezone, "yyyy-MM-dd");
  const to = period === "week" ? formatInTimeZone(addDays(new Date(), 6), tenant.timezone, "yyyy-MM-dd") : today;
  const bookings = useQuery({ queryKey: ["owner-bookings", tenant.slug, today, to], queryFn: () => fetchOwnerBookings(tenant, today, to), refetchInterval: 30_000 });
  const stats = useQuery({ queryKey: ["owner-stats", tenant.slug, today, to], queryFn: () => fetchOwnerStats(tenant, today, to), refetchInterval: 30_000 });
  const refreshOwner = () => {
    void queryClient.invalidateQueries({ queryKey: ["owner-bookings", tenant.slug] });
    void queryClient.invalidateQueries({ queryKey: ["owner-stats", tenant.slug] });
  };
  const update = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: string }) => setOwnerBookingStatus(tenant, bookingId, status),
    onSuccess: refreshOwner,
  });
  const payment = useMutation({
    mutationFn: ({ bookingId, cents }: { bookingId: string; cents: number }) => recordOwnerPayment(tenant, bookingId, cents),
    onSuccess: refreshOwner,
  });
  const dateTime = (value: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const periodTitle = period === "today"
    ? new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date())
    : "Ближайшие 7 дней";
  const action = (booking: OwnerBooking) => {
    if (booking.status === "confirmed") return { label: "Принять автомобиль", status: "accepted" };
    if (booking.status === "accepted") return { label: "Отметить готовым", status: "ready" };
    if (booking.status === "ready") return { label: "Завершить заказ", status: "completed" };
    return null;
  };
  return (
    <Section className="owner-dashboard-section" variant="transparent" padding={0}>
      <VStack as="main" className="graphite-owner-dashboard" gap={5}>
        <VStack className="owner-overview" gap={3}>
          <HStack className="owner-overview-heading" justify="between" align="end" gap={3}>
            <VStack gap={1}>
              <Text className="owner-section-label">Расписание</Text>
              <Heading level={2}>{periodTitle}</Heading>
            </VStack>
            <Button className="owner-add-booking" label="+ Запись" variant="secondary" href={`/s/${tenant.slug}/owner/new`} />
          </HStack>
          <HStack className="owner-dashboard-toolbar" gap={1}>
            <Button className={period === "today" ? "owner-period-button is-active" : "owner-period-button"} label="Сегодня" variant="secondary" onClick={() => setPeriod("today")} />
            <Button className={period === "week" ? "owner-period-button is-active" : "owner-period-button"} label="7 дней" variant="secondary" onClick={() => setPeriod("week")} />
          </HStack>
        </VStack>
        {stats.isPending ? <Text role="status">Считаем показатели…</Text> : null}
        {stats.isError ? <Banner status="error" title="Не удалось получить показатели" description={stats.error.message} /> : null}
        {stats.data ? (
          <dl className="owner-stats">
            <section><dt>Заезды</dt><dd>{stats.data.arrivals}</dd></section>
            <section><dt>Завершено</dt><dd>{stats.data.completedOrders}</dd></section>
            <section><dt>Получено</dt><dd>{money(stats.data.receivedCents)}</dd></section>
          </dl>
        ) : null}
        <VStack className="owner-bookings-section" gap={2}>
          <HStack justify="between" align="center">
            <Heading level={2}>Записи</Heading>
            {bookings.data ? <Text className="owner-bookings-count">{bookings.data.length}</Text> : null}
          </HStack>
          {bookings.isPending ? <Text role="status">Загружаем записи…</Text> : null}
          {bookings.isError ? <Banner status="error" title="Не удалось получить записи" description={bookings.error.message} endContent={<Button label="Повторить" variant="secondary" onClick={() => void bookings.refetch()} />} /> : null}
          {bookings.data?.length === 0 ? (
            <VStack className="owner-booking-empty" gap={2}>
              <Text className="owner-empty-label">Свободное время</Text>
              <Heading level={3}>Записей пока нет</Heading>
              <Text>Добавьте клиента вручную или переключитесь на ближайшие семь дней.</Text>
              <Button className="owner-empty-action" label="Добавить запись" variant="secondary" href={`/s/${tenant.slug}/owner/new`} />
            </VStack>
          ) : null}
          {bookings.data?.length ? (
            <ul className="owner-booking-list">
              {bookings.data.map((booking) => {
                const next = action(booking);
                return (
                  <li key={booking.bookingId} className="owner-booking-row">
                    <VStack gap={2}>
                      <HStack gap={2} justify="between" align="start">
                        <VStack gap={1}>
                          <Heading level={3}>{booking.vehicle}</Heading>
                          <Text className="owner-booking-service" color="secondary">{booking.serviceName} · {booking.resourceName}</Text>
                        </VStack>
                        <Text className="owner-booking-time" weight="semibold">{dateTime(booking.startsAt)}</Text>
                      </HStack>
                      <Text className={`owner-booking-status is-${booking.status}`}>{statusLabel[booking.status] ?? booking.status}</Text>
                      <Text className="owner-booking-customer">{booking.customerName} · {booking.customerPhone}</Text>
                      <Text className="owner-booking-payment-line" color="secondary">Получено: {money(booking.paidCents)} из {money(booking.priceCents)}</Text>
                      <HStack className="owner-booking-actions" gap={2} wrap="wrap">
                        {next ? <Button className="owner-booking-next" label={next.label} variant="secondary" isLoading={update.isPending} onClick={() => update.mutate({ bookingId: booking.bookingId, status: next.status })} /> : null}
                        {booking.paidCents < booking.priceCents && booking.status !== "cancelled" ? <Button className="owner-booking-payment" label="Внести оплату" variant="secondary" isLoading={payment.isPending} onClick={() => payment.mutate({ bookingId: booking.bookingId, cents: booking.priceCents - booking.paidCents })} /> : null}
                        {booking.status !== "cancelled" && booking.status !== "completed" ? <Button className="owner-booking-cancel" label="Отменить" variant="ghost" onClick={() => update.mutate({ bookingId: booking.bookingId, status: "cancelled" })} /> : null}
                      </HStack>
                    </VStack>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </VStack>
      </VStack>
    </Section>
  );
}
