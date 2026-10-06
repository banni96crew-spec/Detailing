import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cancelBooking, calendarUrl, fetchBooking } from "@/booking/booking-repository";
import { clearBookingToken, getBookingToken, saveBookingToken } from "@/booking/booking-storage";
import { enableBookingPush } from "@/booking/push";
import { ErrorState, LoadingState } from "@/components/app-state";
import { isDemoMode } from "@/lib/env";
import { useTenant } from "@/tenant/tenant-context";

const statusLabels = {
  confirmed: "Подтверждена",
  accepted: "Автомобиль принят",
  ready: "Автомобиль готов",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не состоялась",
} as const;

export function MyBookingPage() {
  const tenant = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const [token, setToken] = useState(() => searchParams.get("access") ?? getBookingToken(tenant.slug));
  const [notice, setNotice] = useState("");
  const cancellationKey = useRef(crypto.randomUUID());
  const queryClient = useQueryClient();

  useEffect(() => {
    const access = searchParams.get("access");
    if (!access) return;
    saveBookingToken(tenant.slug, access);
    setToken(access);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, tenant.slug]);

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

  if (!token) {
    return (
      <Section variant="transparent" padding={4}>
        <VStack gap={3} paddingBlockEnd={10}>
          <Heading level={1}>Моя запись</Heading>
          <Banner status="info" title="Записи на этом устройстве нет" description="Выберите услугу и подтвердите время — запись появится здесь без регистрации." />
          <Button label="Выбрать услугу" variant="primary" href={`/s/${tenant.slug}/services`} />
        </VStack>
      </Section>
    );
  }
  if (booking.isPending) return <LoadingState label="Загружаем запись" />;
  if (booking.isError) return <ErrorState title="Не удалось открыть запись" detail={booking.error.message} onRetry={() => void booking.refetch()} />;
  const value = booking.data;
  const dateTime = (date: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, dateStyle: "long", timeStyle: "short" }).format(new Date(date));
  const canCancel = !["cancelled", "completed", "no_show"].includes(value.status);

  return (
    <Section variant="transparent" padding={4}>
      <VStack gap={4} paddingBlockEnd={10}>
        <Heading level={1}>Моя запись</Heading>
        <Text as="p" color="secondary">Статус: {statusLabels[value.status]}</Text>
        <section className="booking-summary" aria-label="Детали записи">
          <dl>
            <dt>Услуга</dt><dd>{value.service.name}</dd>
            <dt>Приём</dt><dd>{dateTime(value.startsAt)}</dd>
            <dt>Готовность по плану</dt><dd>{dateTime(value.endsAt)}</dd>
            <dt>Автомобиль</dt><dd>{value.vehicle}</dd>
            <dt>Стоимость</dt><dd>{(value.priceCents / 100).toLocaleString("ru-RU")} ₽</dd>
          </dl>
        </section>
        {notice ? <Banner status="success" title={notice} isDismissable onDismiss={() => setNotice("")} /> : null}
        {push.isError ? <Banner status="warning" title="Напоминание не включено" description={push.error.message} /> : null}
        {cancel.isError ? <Banner status="error" title="Не удалось отменить запись" description={cancel.error.message} /> : null}
        <Button label={isDemoMode ? "Напоминания недоступны в образце" : "Напомнить за сутки"} variant="secondary" isDisabled={isDemoMode} isLoading={push.isPending} onClick={() => push.mutate()} />
        {!isDemoMode ? <Button label="Добавить в календарь" variant="secondary" href={calendarUrl(tenant.slug, token)} /> : null}
        {canCancel ? <Button label="Отменить запись" variant="secondary" isLoading={cancel.isPending} onClick={() => cancel.mutate()} /> : null}
        <Button label="Удалить доступ с устройства" variant="ghost" onClick={() => { clearBookingToken(tenant.slug); setToken(null); }} />
      </VStack>
    </Section>
  );
}
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
