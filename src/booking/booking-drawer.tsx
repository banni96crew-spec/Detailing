import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { ISODateString } from "@astryxdesign/core/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { createBooking, fetchSlots } from "./booking-repository";
import { saveBookingToken } from "./booking-storage";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

const detailsSchema = z.object({
  customerName: z.string().trim().min(2, "Укажите имя"),
  customerPhone: z.string().trim().regex(/^[+\d() -]{7,32}$/, "Проверьте номер телефона"),
  vehicle: z.string().trim().min(2, "Укажите автомобиль"),
  notes: z.string().trim().max(500, "Не более 500 символов"),
});

type Service = PublishedBusinessConfig["services"][number];

interface BookingDrawerProps {
  tenant: PublishedBusinessConfig;
  service: Service | null;
  onOpenChange: (open: boolean) => void;
}

function isoDate(tenant: PublishedBusinessConfig, offset = 0): ISODateString {
  return formatInTimeZone(addDays(new Date(), offset), tenant.timezone, "yyyy-MM-dd") as ISODateString;
}

export function BookingDrawer({ tenant, service, onOpenChange }: BookingDrawerProps) {
  const open = service !== null;
  const [step, setStep] = useState(0);
  const [date, setDate] = useState<ISODateString>(() => isoDate(tenant));
  const [startsAt, setStartsAt] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [notes, setNotes] = useState("");
  const [validationError, setValidationError] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ bookingSheet: true }, "");
    const closeFromBack = () => onOpenChange(false);
    window.addEventListener("popstate", closeFromBack, { once: true });
    return () => window.removeEventListener("popstate", closeFromBack);
  }, [open, onOpenChange]);

  useEffect(() => {
    setStep(0);
    setStartsAt("");
    setValidationError("");
    idempotencyKey.current = crypto.randomUUID();
  }, [service?.key]);

  const slots = useQuery({
    queryKey: ["slots", tenant.slug, service?.key, date],
    queryFn: () => fetchSlots(tenant, service!.key, date),
    enabled: open && Boolean(service),
    staleTime: 15_000,
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!service || !startsAt) throw new Error("Выберите свободное время");
      const parsed = detailsSchema.parse({ customerName, customerPhone, vehicle, notes });
      return createBooking(tenant, { ...parsed, serviceKey: service.key, startsAt, idempotencyKey: idempotencyKey.current });
    },
    onSuccess: async ({ accessToken }) => {
      saveBookingToken(tenant.slug, accessToken);
      await queryClient.invalidateQueries({ queryKey: ["slots", tenant.slug] });
      onOpenChange(false);
      void navigate(`/s/${tenant.slug}/my-booking`, { replace: true });
    },
  });

  function closeSheet(): void {
    const state: unknown = window.history.state;
    if (typeof state === "object" && state !== null && "bookingSheet" in state) window.history.back();
    else onOpenChange(false);
  }

  function nextFromDetails(): void {
    const parsed = detailsSchema.safeParse({ customerName, customerPhone, vehicle, notes });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "Проверьте поля");
      return;
    }
    setValidationError("");
    setStep(2);
  }

  const selectedSlot = slots.data?.find((slot) => slot.startsAt === startsAt);
  const formatTime = (value: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  const formatDateTime = (value: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, dateStyle: "long", timeStyle: "short" }).format(new Date(value));

  return (
    <Drawer open={open} onOpenChange={(value) => (value ? undefined : closeSheet())}>
      <DrawerContent aria-describedby="booking-description">
        <DrawerHeader>
          <DrawerTitle>Запись в студию</DrawerTitle>
          <DrawerDescription id="booking-description">
            {service ? `${service.name} · шаг ${step + 1} из 3` : "Выберите услугу"}
          </DrawerDescription>
        </DrawerHeader>
        <VStack className="booking-sheet-content" gap={4} padding={4}>
          {step === 0 ? (
            <>
              <DateInput
                label="Дата визита"
                value={date}
                onChange={(value) => { if (value) { setDate(value); setStartsAt(""); } }}
                min={isoDate(tenant)}
                max={isoDate(tenant, tenant.booking.horizonDays)}
                presentation="adaptive-native"
                weekStartsOn="mon"
                width="100%"
              />
              {slots.isPending ? <Text role="status">Проверяем свободное время…</Text> : null}
              {slots.isError ? <Banner status="error" title="Не удалось получить время" description={slots.error.message} endContent={<Button label="Повторить" variant="secondary" onClick={() => void slots.refetch()} />} /> : null}
              {slots.isSuccess && slots.data.length === 0 ? <Banner status="info" title="Студия не принимает автомобили в этот день" description="Выберите другую дату." /> : null}
              {slots.isSuccess && slots.data.length > 0 ? (
                <section aria-labelledby="slot-title">
                  <Heading level={3} id="slot-title">Время приёма</Heading>
                  <ul className="slot-grid">
                    {slots.data.map((slot) => (
                      <li key={slot.startsAt}>
                        <Button
                          label={`${formatTime(slot.startsAt)}${slot.available ? "" : " · занято"}`}
                          variant={startsAt === slot.startsAt ? "primary" : "secondary"}
                          width="100%"
                          isDisabled={!slot.available}
                          onClick={() => setStartsAt(slot.startsAt)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
          {step === 1 ? (
            <VStack gap={3}>
              {validationError ? <Banner status="error" title="Проверьте данные" description={validationError} /> : null}
              <TextInput label="Имя" value={customerName} onChange={setCustomerName} isRequired autoComplete="name" width="100%" />
              <TextInput label="Телефон" value={customerPhone} onChange={setCustomerPhone} isRequired autoComplete="tel" width="100%" />
              <TextInput label="Автомобиль" value={vehicle} onChange={setVehicle} isRequired placeholder="Марка и модель" width="100%" />
              <TextArea label="Комментарий" value={notes} onChange={setNotes} isOptional maxLength={500} rows={3} width="100%" />
            </VStack>
          ) : null}
          {step === 2 && service && selectedSlot ? (
            <VStack as="section" gap={3} className="booking-summary">
              <Heading level={3}>Проверьте запись</Heading>
              <dl>
                <dt>Услуга</dt><dd>{service.name}</dd>
                <dt>Приём</dt><dd>{formatDateTime(selectedSlot.startsAt)}</dd>
                <dt>Готовность по плану</dt><dd>{formatDateTime(selectedSlot.endsAt)}</dd>
                <dt>Стоимость</dt><dd>{(service.priceCents / 100).toLocaleString("ru-RU")} ₽</dd>
                <dt>Клиент</dt><dd>{customerName}</dd>
                <dt>Автомобиль</dt><dd>{vehicle}</dd>
              </dl>
              {create.isError ? <Banner status="error" title="Запись не создана" description={create.error.message} /> : null}
            </VStack>
          ) : null}
        </VStack>
        <DrawerFooter>
          <HStack gap={2} justify="between">
            {step > 0 ? <Button label="Назад" variant="secondary" onClick={() => setStep((value) => value - 1)} /> : <DrawerClose render={<Button label="Закрыть" variant="secondary" />} />}
            {step === 0 ? <Button label="Продолжить" variant="primary" isDisabled={!startsAt} onClick={() => setStep(1)} /> : null}
            {step === 1 ? <Button label="Проверить" variant="primary" onClick={nextFromDetails} /> : null}
            {step === 2 ? <Button label="Подтвердить запись" variant="primary" isLoading={create.isPending} onClick={() => create.mutate()} /> : null}
          </HStack>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
