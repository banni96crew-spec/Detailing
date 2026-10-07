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
  const action = (booking: OwnerBooking) => {
    if (booking.status === "confirmed") return { label: "Принять автомобиль", status: "accepted" };
    if (booking.status === "accepted") return { label: "Отметить готовым", status: "ready" };
    if (booking.status === "ready") return { label: "Завершить заказ", status: "completed" };
    return null;
  };
  return (
    <Section variant="transparent" padding={4}>
      <VStack as="main" gap={5}>
        <HStack gap={2} wrap="wrap">
          <Button label="Сегодня" variant={period === "today" ? "primary" : "secondary"} onClick={() => setPeriod("today")} />
          <Button label="7 дней" variant={period === "week" ? "primary" : "secondary"} onClick={() => setPeriod("week")} />
          <Button label="Добавить запись" variant="secondary" href={`/s/${tenant.slug}/owner/new`} />
        </HStack>
        {stats.isPending ? <Text role="status">Считаем показатели…</Text> : null}
        {stats.isError ? <Banner status="error" title="Не удалось получить показатели" description={stats.error.message} /> : null}
        {stats.data ? (
          <dl className="owner-stats">
            <section><dt>Заезды</dt><dd>{stats.data.arrivals}</dd></section>
            <section><dt>Завершено</dt><dd>{stats.data.completedOrders}</dd></section>
            <section><dt>Получено</dt><dd>{money(stats.data.receivedCents)}</dd></section>
          </dl>
        ) : null}
        <VStack gap={2}>
          <Heading level={2}>Записи</Heading>
          {bookings.isPending ? <Text role="status">Загружаем записи…</Text> : null}
          {bookings.isError ? <Banner status="error" title="Не удалось получить записи" description={bookings.error.message} endContent={<Button label="Повторить" variant="secondary" onClick={() => void bookings.refetch()} />} /> : null}
          {bookings.data?.length === 0 ? <Banner status="info" title="Записей на период нет" /> : null}
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
                          <Text color="secondary">{booking.serviceName} · {booking.resourceName}</Text>
                        </VStack>
                        <Text weight="semibold">{dateTime(booking.startsAt)}</Text>
                      </HStack>
                      <Text>{booking.customerName} · {booking.customerPhone}</Text>
                      <Text color="secondary">Получено: {money(booking.paidCents)} из {money(booking.priceCents)}</Text>
                      <HStack gap={2} wrap="wrap">
                        {next ? <Button label={next.label} variant="secondary" isLoading={update.isPending} onClick={() => update.mutate({ bookingId: booking.bookingId, status: next.status })} /> : null}
                        {booking.paidCents < booking.priceCents && booking.status !== "cancelled" ? <Button label="Внести оплату" variant="secondary" isLoading={payment.isPending} onClick={() => payment.mutate({ bookingId: booking.bookingId, cents: booking.priceCents - booking.paidCents })} /> : null}
                        {booking.status !== "cancelled" && booking.status !== "completed" ? <Button label="Отменить" variant="ghost" onClick={() => update.mutate({ bookingId: booking.bookingId, status: "cancelled" })} /> : null}
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
