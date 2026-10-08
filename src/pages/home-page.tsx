import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/tenant/tenant-context";

export function HomePage() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const featuredServices = tenant.services.filter((service) => service.featured).slice(0, 3);
  const weekdayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

  return (
    <VStack as="article" className="graphite-page graphite-home-page" gap={0}>
      <Section className="graphite-home-intro" variant="transparent" padding={0}>
        <VStack gap={3}>
          <Text as="p" className="graphite-home-eyebrow">Студия детейлинга</Text>
          <Heading className="graphite-home-title" level={1}>{tenant.brand.name}</Heading>
          <Text as="p" className="graphite-home-description">{tenant.brand.description}</Text>
          <Button
            className="graphite-home-primary"
            label="Записаться"
            variant="primary"
            size="lg"
            onClick={() => navigate(`/s/${tenant.slug}/services`)}
          />
        </VStack>
      </Section>

      <Section className="graphite-home-media" variant="transparent" padding={0}>
        <VStack gap={1}>
          <figure>
            <img src={tenant.assets.hero} alt={`Автомобиль в ${tenant.brand.name}`} width="1600" height="1000" />
          </figure>
          <Button
            className="graphite-home-service-action graphite-home-works-action"
            label="Смотреть работы"
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/s/${tenant.slug}/works`)}
          />
        </VStack>
      </Section>

      <Section className="graphite-home-section" variant="transparent" padding={0}>
        <VStack gap={3}>
          <Heading level={2}>Популярные услуги</Heading>
          <Text as="p" className="graphite-home-section-copy">Выберите подходящий уход — время можно подобрать сразу.</Text>
          <ul className="graphite-home-service-list">
            {featuredServices.map((service) => (
              <li key={service.key}>
                <VStack gap={2}>
                  <HStack gap={3} justify="between" align="start">
                    <Heading level={3}>{service.name}</Heading>
                    <Text className="graphite-home-price" weight="semibold">
                      от&nbsp;{(service.priceCents / 100).toLocaleString("ru-RU")}&nbsp;₽
                    </Text>
                  </HStack>
                  <Text as="p" className="graphite-home-service-copy">{service.description}</Text>
                  <Button
                    className="graphite-home-service-action"
                    label="Выбрать"
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/s/${tenant.slug}/book/${service.key}`)}
                  />
                </VStack>
              </li>
            ))}
          </ul>
          <Button
            className="graphite-home-secondary"
            label="Все услуги"
            variant="secondary"
            onClick={() => navigate(`/s/${tenant.slug}/services`)}
          />
        </VStack>
      </Section>

      <Section className="graphite-home-section" variant="transparent" padding={0}>
        <VStack gap={3}>
          <Heading level={2}>Всё под контролем</Heading>
          <ul className="graphite-home-benefit-list">
            {tenant.infoCards.map((card) => (
              <li key={card.key}>
                <Heading level={3}>{card.title}</Heading>
                <Text as="p">{card.text}</Text>
              </li>
            ))}
          </ul>
        </VStack>
      </Section>

      <Section className="graphite-home-section graphite-home-contact" variant="transparent" padding={0}>
        <VStack gap={3}>
          <Heading level={2}>Адрес и часы</Heading>
          <Text as="p" className="graphite-home-address">{tenant.contact.address}</Text>
          <Button className="graphite-home-secondary" label="Построить маршрут" variant="secondary" href={tenant.contact.directionsUrl} />
          <dl className="graphite-home-hours">
            {tenant.hours.map((hour) => (
              <section key={hour.weekday}>
                <dt>{weekdayNames[hour.weekday]}</dt>
                <dd>{hour.closed ? "Выходной" : `${hour.opensAt}–${hour.lastArrivalAt}`}</dd>
              </section>
            ))}
          </dl>
          <Button
            className="graphite-home-service-action"
            label="Подробнее"
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/s/${tenant.slug}/contact`)}
          />
        </VStack>
      </Section>
    </VStack>
  );
}
