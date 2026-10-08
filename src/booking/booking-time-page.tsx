import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorState } from "@/components/app-state";
import { useTenant } from "@/tenant/tenant-context";
import { fetchSlots } from "./booking-repository";

function isoDate(timezone: string, offset = 0): string {
  return formatInTimeZone(addDays(new Date(), offset), timezone, "yyyy-MM-dd");
}

function dateValue(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} мин`;
  if (!rest) return `${hours} ч`;
  return `${hours} ч ${rest} мин`;
}

function slotHour(value: string, timezone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(new Date(value)));
}

export function BookingTimePage() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const { serviceKey = "" } = useParams();
  const service = tenant.services.find((item) => item.key === serviceKey);
  const dates = useMemo(
    () => Array.from({ length: tenant.booking.horizonDays + 2 }, (_, index) => isoDate(tenant.timezone, index - 1)),
    [tenant.booking.horizonDays, tenant.timezone],
  );
  const today = isoDate(tenant.timezone);
  const [date, setDate] = useState(() => isoDate(tenant.timezone, 1));
  const [startsAt, setStartsAt] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const slots = useQuery({
    queryKey: ["slots", tenant.slug, serviceKey, date],
    queryFn: () => fetchSlots(tenant, serviceKey, date),
    enabled: Boolean(service),
    staleTime: 15_000,
  });

  if (!service) return <ErrorState title="Услуга не найдена" detail="Вернитесь к списку услуг и выберите подходящую." />;

  const monthKeys = [...new Set(dates.map((item) => item.slice(0, 7)))];
  const selectedMonth = date.slice(0, 7);
  const dateFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, weekday: "short", day: "numeric" });
  const selectedDateFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const monthFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, month: "long", year: "numeric" });
  const timeFormatter = new Intl.DateTimeFormat("ru-RU", { timeZone: tenant.timezone, hour: "2-digit", minute: "2-digit" });
  const availableSlots = slots.data?.filter((slot) => slot.available) ?? [];
  const groups = [
    { key: "morning", label: "Утро", items: availableSlots.filter((item) => slotHour(item.startsAt, tenant.timezone) < 12) },
    { key: "afternoon", label: "День", items: availableSlots.filter((item) => { const hour = slotHour(item.startsAt, tenant.timezone); return hour >= 12 && hour < 17; }) },
    { key: "evening", label: "Вечер", items: availableSlots.filter((item) => slotHour(item.startsAt, tenant.timezone) >= 17) },
  ].filter((group) => group.items.length > 0);

  function chooseDate(nextDate: string): void {
    setDate(nextDate);
    setStartsAt("");
  }

  function continueBooking(): void {
    if (!startsAt) return;
    const query = new URLSearchParams({ service: serviceKey, date, startsAt });
    void navigate(`/s/${tenant.slug}/services?${query.toString()}`, { replace: true });
  }

  return (
    <main className="booking-time-page">
      <Button
        className="booking-time-back"
        label="Назад к услугам"
        variant="secondary"
        isIconOnly
        icon={<ArrowLeftIcon aria-hidden="true" weight="bold" />}
        onClick={() => void navigate(`/s/${tenant.slug}/services`)}
      />

      <header className="booking-time-header">
        <h1>Выберите время</h1>
        <Text as="p" className="booking-time-duration" weight="semibold">{durationLabel(service.durationMinutes)}</Text>
      </header>

      <label className="booking-month-control">
        <span className="booking-visually-hidden">Месяц</span>
        <select
          value={selectedMonth}
          onChange={(event) => {
            const firstDate = dates.find((item) => item.startsWith(event.target.value) && item >= today);
            if (firstDate) chooseDate(firstDate);
          }}
        >
          {monthKeys.map((month) => (
            <option key={month} value={month}>{capitalize(monthFormatter.format(dateValue(`${month}-01`)))}</option>
          ))}
        </select>
      </label>

      <ol className="booking-date-strip" aria-label="Доступные даты">
        {dates.map((item, index) => {
          const parts = dateFormatter.formatToParts(dateValue(item));
          const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
          const day = parts.find((part) => part.type === "day")?.value ?? "";
          const isSelected = item === date;
          const isPast = item < today;
          return (
            <li key={item}>
              <button className="booking-date-cell" data-selected={isSelected || undefined} type="button" disabled={isPast} onClick={() => chooseDate(item)}>
                <small>{index === 1 ? "Сегодня" : capitalize(weekday.replace(".", ""))}</small>
                <strong>{day}</strong>
              </button>
            </li>
          );
        })}
      </ol>

      <Text as="p" className="booking-time-helper" color="secondary">Время указано по местному часовому поясу.</Text>
      <h2>{capitalize(selectedDateFormatter.format(dateValue(date)))}</h2>

      <section className="booking-time-groups" aria-live="polite">
        {slots.isPending ? <Text role="status" color="secondary">Загружаем свободное время…</Text> : null}
        {slots.isError ? <Text role="alert">Не удалось загрузить свободное время.</Text> : null}
        {slots.isSuccess && availableSlots.length === 0 ? <Text color="secondary">На эту дату свободного времени нет.</Text> : null}
        {groups.map((group) => (
          <section className="booking-time-group" key={group.key}>
            <h3>{group.label}</h3>
            <ol className="booking-slot-grid" data-remainder={group.items.length % 3}>
              {group.items.map((slot) => (
                <li key={slot.startsAt}>
                  <button
                    className="booking-slot"
                    data-selected={startsAt === slot.startsAt || undefined}
                    type="button"
                    disabled={!slot.available}
                    onClick={() => setStartsAt(slot.startsAt)}
                  >
                    {timeFormatter.format(new Date(slot.startsAt))}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </section>

      <footer className="booking-time-footer">
        <Button label="Продолжить" variant="primary" size="lg" width="100%" isDisabled={!startsAt} onClick={continueBooking} />
      </footer>
    </main>
  );
}
