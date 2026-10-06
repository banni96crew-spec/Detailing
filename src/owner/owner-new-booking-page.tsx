import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ISODateString } from "@astryxdesign/core/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchSlots } from "@/booking/booking-repository";
import { useTenant } from "@/tenant/tenant-context";
import { createOwnerBooking } from "./owner-repository";

export function OwnerNewBookingPage() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const [serviceKey, setServiceKey] = useState(tenant.services[0]?.key ?? "");
  const [date, setDate] = useState(formatInTimeZone(new Date(), tenant.timezone, "yyyy-MM-dd") as ISODateString);
  const [startsAt, setStartsAt] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [notes, setNotes] = useState("");
  const idempotencyKey = useRef(crypto.randomUUID());
  const slots = useQuery({ queryKey: ["owner-slots", tenant.slug, serviceKey, date], queryFn: () => fetchSlots(tenant, serviceKey, date), enabled: Boolean(serviceKey) });
  const create = useMutation({
    mutationFn: () => createOwnerBooking(tenant, { serviceKey, startsAt, customerName, customerPhone, vehicle, notes, idempotencyKey: idempotencyKey.current }),
    onSuccess: () => navigate(`/s/${tenant.slug}/owner/`),
  });
  const formatTime = (value: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return (
    <Section variant="transparent" padding={4}>
      <VStack as="main" gap={4}>
        <Heading level={2}>Добавить запись</Heading>
        <Selector label="Услуга" options={tenant.services.map((service) => ({ value: service.key, label: service.name }))} value={serviceKey} onChange={(value) => { setServiceKey(value); setStartsAt(""); }} presentation="adaptive" width="100%" />
        <DateInput label="Дата" value={date} onChange={(value) => { if (value) { setDate(value); setStartsAt(""); } }} min={formatInTimeZone(new Date(), tenant.timezone, "yyyy-MM-dd") as ISODateString} max={formatInTimeZone(addDays(new Date(), tenant.booking.horizonDays), tenant.timezone, "yyyy-MM-dd") as ISODateString} width="100%" />
        {slots.isPending ? <Text role="status">Проверяем время…</Text> : null}
        {slots.isError ? <Banner status="error" title="Время не загружено" description={slots.error.message} /> : null}
        {slots.data ? <ul className="slot-grid">{slots.data.map((slot) => <li key={slot.startsAt}><Button label={`${formatTime(slot.startsAt)}${slot.available ? "" : " · занято"}`} variant={startsAt === slot.startsAt ? "primary" : "secondary"} isDisabled={!slot.available} width="100%" onClick={() => setStartsAt(slot.startsAt)} /></li>)}</ul> : null}
        <TextInput label="Имя клиента" value={customerName} onChange={setCustomerName} width="100%" />
        <TextInput label="Телефон" value={customerPhone} onChange={setCustomerPhone} width="100%" />
        <TextInput label="Автомобиль" value={vehicle} onChange={setVehicle} width="100%" />
        <TextArea label="Комментарий" value={notes} onChange={setNotes} width="100%" />
        {create.isError ? <Banner status="error" title="Запись не создана" description={create.error.message} /> : null}
        <Button label="Создать запись" variant="primary" isDisabled={!startsAt || !customerName || !customerPhone || !vehicle} isLoading={create.isPending} onClick={() => create.mutate()} />
      </VStack>
    </Section>
  );
}
