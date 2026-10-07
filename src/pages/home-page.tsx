import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/tenant/tenant-context";
import { CalendarPlusIcon } from "@phosphor-icons/react";

export function HomePage() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const weekdayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  return (
    <VStack as="article" gap={6} paddingBlockEnd={10}>
      <Section variant="transparent" padding={0}>
        <figure className="hero">
          <img src={tenant.assets.hero} alt={`Автомобиль в ${tenant.brand.name}`} width="1600" height="1000" />
          <figcaption className="hero-copy">
            <Heading level={1} type="display-2" textWrap="balance">{tenant.brand.name}</Heading>
            <Text as="p" type="large">{tenant.brand.description}</Text>
            <aside className="hero-booking-glass">
              <Button label="Записаться" icon={<CalendarPlusIcon aria-hidden="true" />} variant="primary" size="lg" width="100%" onClick={() => navigate(`/s/${tenant.slug}/services`)} />
            </aside>
          </figcaption>
        </figure>
      </Section>
      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Запись в студию</Heading>
          <Text as="p" color="secondary">Выберите услугу и свободное время. Регистрация не нужна.</Text>
          <ul className="service-list">
            {tenant.services.filter((service) => service.featured).map((service) => (
              <li key={service.key} className="service-row">
                <HStack gap={3} justify="between" align="start">
                  <VStack gap={1}><Heading level={3}>{service.name}</Heading><Text color="secondary">{service.description}</Text></VStack>
                  <Text weight="semibold">{`${(service.priceCents / 100).toLocaleString("ru-RU")}\u00a0₽`}</Text>
                </HStack>
              </li>
            ))}
          </ul>
          <Button label="Выбрать услугу и время" variant="primary" onClick={() => navigate(`/s/${tenant.slug}/services`)} />
        </VStack>
      </Section>
      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Почему к нам возвращаются</Heading>
          <ul className="info-grid">{tenant.infoCards.map((card) => <li key={card.key}><Heading level={3}>{card.title}</Heading><Text color="secondary">{card.text}</Text></li>)}</ul>
        </VStack>
      </Section>
      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Работы</Heading>
          <ul className="gallery-grid">{tenant.gallery.map((item) => {
            const source = item.image.startsWith("images/") ? (tenant.assets.gallery.find((asset) => asset.key === item.key)?.image ?? item.image) : item.image;
            return <li key={item.key}><figure><img src={source} alt={item.caption} loading="lazy" /><figcaption>{item.caption}</figcaption></figure></li>;
          })}</ul>
        </VStack>
      </Section>
      <Section variant="transparent" padding={4}>
        <VStack gap={3}>
          <Heading level={2}>Адрес и часы приёма</Heading>
          <Text>{tenant.contact.address}</Text>
          <Button label="Построить маршрут" variant="secondary" href={tenant.contact.directionsUrl} />
          <dl className="hours-list">{tenant.hours.map((hour) => <section key={hour.weekday}><dt>{weekdayNames[hour.weekday]}</dt><dd>{hour.closed ? "Выходной" : `${hour.opensAt}–${hour.lastArrivalAt}`}</dd></section>)}</dl>
          <Button label="Кабинет владельца" variant="ghost" href={`/s/${tenant.slug}/owner/`} />
        </VStack>
      </Section>
    </VStack>
  );
}
