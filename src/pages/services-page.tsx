import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ISODateString } from "@astryxdesign/core/utils";
import { Link, useSearchParams } from "react-router-dom";
import { BookingDrawer } from "@/booking/booking-drawer";
import { useTenant } from "@/tenant/tenant-context";

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} мин`;
  if (!rest) return `${hours} ч`;
  return `${hours} ч ${rest} мин`;
}

export function ServicesPage() {
  const tenant = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedService = tenant.services.find((service) => service.key === searchParams.get("service")) ?? null;
  const initialDate = (searchParams.get("date") ?? undefined) as ISODateString | undefined;
  const initialStartsAt = searchParams.get("startsAt") ?? undefined;

  return (
    <VStack as="article" className="graphite-page graphite-services-page" gap={0}>
      <Section className="graphite-services-header" variant="transparent" padding={0}>
        <VStack gap={2}>
          <Heading level={1}>Услуги</Heading>
          <Text as="p">Выберите подходящий уход и перейдите к свободному времени.</Text>
        </VStack>
      </Section>

      <Section className="graphite-services-content" variant="transparent" padding={0}>
        <ul className="graphite-services-list">
          {tenant.services.map((service) => {
            const asset = tenant.assets.services.find((item) => item.key === service.key);
            return (
              <li key={service.key}>
                <Link
                  className="graphite-service-link"
                  to={`/s/${tenant.slug}/book/${service.key}`}
                >
                  <figure className="graphite-service-card">
                    {asset ? <img src={asset.image} alt={service.name} loading="lazy" /> : null}
                    <figcaption>
                      <VStack gap={2}>
                        <Heading level={2}>{service.name}</Heading>
                        <Text as="p" className="graphite-service-description">{service.description}</Text>
                        <HStack gap={3} justify="between" align="center">
                          <Text className="graphite-service-duration">{durationLabel(service.durationMinutes)}</Text>
                          <Text className="graphite-service-price" weight="semibold">
                            от&nbsp;{(service.priceCents / 100).toLocaleString("ru-RU")}&nbsp;₽
                          </Text>
                        </HStack>
                      </VStack>
                    </figcaption>
                  </figure>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <BookingDrawer
        tenant={tenant}
        service={selectedService}
        {...(initialDate ? { initialDate } : {})}
        {...(initialStartsAt ? { initialStartsAt } : {})}
        initialStep={selectedService && initialStartsAt ? 1 : 0}
        onOpenChange={(open) => { if (!open) setSearchParams({}, { replace: true }); }}
      />
    </VStack>
  );
}
