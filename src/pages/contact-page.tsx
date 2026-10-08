import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useTenant } from "@/tenant/tenant-context";

const weekdayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];

export function ContactPage() {
  const tenant = useTenant();

  return (
    <VStack as="article" className="graphite-page graphite-contact-page" gap={0}>
      <Section className="graphite-contact-header" variant="transparent" padding={0}>
        <VStack gap={2}>
          <Heading level={1}>Адрес и часы</Heading>
          <Text as="p">Всё необходимое для визита в студию.</Text>
        </VStack>
      </Section>

      <Section className="graphite-contact-content" variant="transparent" padding={0}>
        <VStack gap={4}>
          <section className="graphite-contact-address">
            <VStack gap={3}>
              <Text className="graphite-contact-label">Адрес</Text>
              <Heading level={2}>{tenant.contact.address}</Heading>
              <Button
                className="graphite-contact-route"
                label="Построить маршрут"
                variant="secondary"
                href={tenant.contact.directionsUrl}
              />
            </VStack>
          </section>

          <section className="graphite-contact-section">
            <VStack gap={3}>
              <Heading level={2}>Часы приёма</Heading>
              <dl className="graphite-contact-hours">
                {tenant.hours.map((hour) => (
                  <section key={hour.weekday}>
                    <dt>{weekdayNames[hour.weekday]}</dt>
                    <dd>{hour.closed ? "Выходной" : `${hour.opensAt}–${hour.lastArrivalAt}`}</dd>
                  </section>
                ))}
              </dl>
            </VStack>
          </section>

          <section className="graphite-contact-section">
            <VStack gap={2}>
              <Heading level={2}>Связаться</Heading>
              <a className="graphite-contact-phone" href={`tel:${tenant.contact.phone.replace(/[^+\d]/g, "")}`}>
                {tenant.contact.phone}
              </a>
            </VStack>
          </section>
        </VStack>
      </Section>
    </VStack>
  );
}
