import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cancelBooking, calendarUrl, fetchBooking } from "@/booking/booking-repository";
import { findDemoRecordByToken } from "@/booking/demo-booking-store";
import { enableBookingPush } from "@/booking/push";
import { ErrorState, LoadingState } from "@/components/app-state";
import { isDemoMode } from "@/lib/env";
import { useDemoBooking, useTenant } from "@/tenant/tenant-context";

const statusLabels = {
  confirmed: "Подтверждена",
  accepted: "Автомобиль принят",
  ready: "Автомобиль готов",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не состоялась",
} as const;

const statusVariants = {
  confirmed: "accent",
  accepted: "warning",
  ready: "success",
  completed: "neutral",
  cancelled: "error",
  no_show: "error",
} as const;

export function MyBookingPage() {
  const tenant = useTenant();
  const demoBooking = useDemoBooking();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState("");
  const cancellationKey = useRef(crypto.randomUUID());
  const queryClient = useQueryClient();
  const token = demoBooking.bookingToken;

  useEffect(() => {
    const access = searchParams.get("access");
    if (!access) return;
    void demoBooking.setBookingToken(access);
    setSearchParams({}, { replace: true });
  }, [demoBooking, searchParams, setSearchParams]);

  const booking = useQuery({
    queryKey: ["booking", tenant.slug, token],
    queryFn: () => fetchBooking(tenant.slug, token!),
    enabled: Boolean(token),
    refetchInterval: 60_000,
  });
  const cancel = useMutation({
    mutationFn: () => cancelBooking(tenant.slug, token!, cancellationKey.current),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["booking", tenant.slug, token] }),
  });
  const push = useMutation({
    mutationFn: () => enableBookingPush(tenant.slug, token!),
    onSuccess: () => setNotice("Напоминание включено"),
  });
  const reset = useMutation({
    mutationFn: () => demoBooking.resetDemo(),
    onSuccess: () => {
      setNotice("Демонстрация обновлена");
      void queryClient.invalidateQueries({ queryKey: ["booking", tenant.slug] });
    },
  });

  if (!token) {
    return (
      <VStack as="article" className="graphite-page graphite-booking-page" gap={0}>
        <Section className="graphite-booking-header" variant="transparent" padding={0}>
          <Heading level={1}>Моя запись</Heading>
        </Section>
        <Section className="graphite-booking-empty" variant="transparent" padding={0}>
          <VStack gap={3}>
            <Heading level={2}>Записей пока нет</Heading>
            <Text as="p">Выберите услугу и подтвердите время — запись появится здесь без регистрации.</Text>
            <Button className="graphite-booking-primary" label="Выбрать услугу" variant="primary" href={`/s/${tenant.slug}/services`} />
          </VStack>
        </Section>
      </VStack>
    );
  }
  if (booking.isPending) return <LoadingState label="Загружаем запись" />;
  if (booking.isError) return <ErrorState title="Не удалось открыть запись" detail={booking.error.message} onRetry={() => void booking.refetch()} />;

  const value = booking.data;
  const isShowcase = isDemoMode && findDemoRecordByToken(tenant.slug, token)?.origin === "showcase";
  const dateTime = (date: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, dateStyle: "long", timeStyle: "short" }).format(new Date(date));
  const canCancel = !["cancelled", "completed", "no_show"].includes(value.status);

  return (
    <VStack as="article" className="graphite-page graphite-booking-page" gap={0}>
      <Section className="graphite-booking-header" variant="transparent" padding={0}>
        <VStack gap={2}>
          <Heading level={1}>Моя запись</Heading>
          <HStack className="graphite-booking-status" gap={2} align="center">
            <StatusDot variant={statusVariants[value.status]} label={statusLabels[value.status]} />
            <Text>{statusLabels[value.status]}</Text>
          </HStack>
          {isShowcase ? <Text color="secondary">Демонстрационная запись</Text> : null}
        </VStack>
      </Section>

      <Section className="graphite-booking-content" variant="transparent" padding={0}>
        <VStack gap={4}>
          <section className="graphite-booking-summary" aria-label="Детали записи">
            <VStack gap={3}>
              <Heading level={2}>{value.service.name}</Heading>
              <Text as="p" className="graphite-booking-arrival">{dateTime(value.startsAt)}</Text>
              <dl>
                <section><dt>Готовность по плану</dt><dd>{dateTime(value.endsAt)}</dd></section>
                <section><dt>Автомобиль</dt><dd>{value.vehicle}</dd></section>
                <section><dt>Стоимость</dt><dd>{`${(value.priceCents / 100).toLocaleString("ru-RU")}\u00a0₽`}</dd></section>
              </dl>
            </VStack>
          </section>

          {notice ? <Banner status="success" title={notice} isDismissable onDismiss={() => setNotice("")} /> : null}
          {push.isError ? <Banner status="warning" title="Напоминание не включено" description={push.error.message} /> : null}
          {cancel.isError ? <Banner status="error" title="Не удалось отменить запись" description={cancel.error.message} /> : null}

          <section className="graphite-booking-actions" aria-label="Действия с записью">
            <VStack gap={2}>
              {!isDemoMode ? <Button label="Напомнить за сутки" variant="secondary" isLoading={push.isPending} onClick={() => push.mutate()} /> : null}
              {!isDemoMode ? <Button label="Добавить в календарь" variant="secondary" href={calendarUrl(tenant.slug, token)} /> : null}
              {canCancel && !isShowcase ? <Button className="graphite-booking-secondary" label="Отменить запись" variant="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate()} /> : null}
              {isDemoMode ? <Button className="graphite-booking-remove" label="Сбросить демонстрацию" variant="ghost" isLoading={reset.isPending} onClick={() => reset.mutate()} /> : null}
              {!isDemoMode ? <Button className="graphite-booking-remove" label="Удалить доступ с устройства" variant="ghost" onClick={() => void demoBooking.setBookingToken(null)} /> : null}
            </VStack>
          </section>
        </VStack>
      </Section>
    </VStack>
  );
}
