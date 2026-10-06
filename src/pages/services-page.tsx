import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useState } from "react";
import { useTenant } from "@/tenant/tenant-context";
import { BookingDrawer } from "@/booking/booking-drawer";

export function ServicesPage() {
  const tenant = useTenant();
  const [selectedService, setSelectedService] = useState<(typeof tenant.services)[number] | null>(null);
  return (
    <Section variant="transparent" padding={4}>
      <VStack gap={6} paddingBlockEnd={10}>
        <Heading level={1}>Услуги</Heading>
        <ul className="service-list">
          {tenant.services.map((service) => (
            <li key={service.key} className="service-row">
              <VStack gap={1}>
                <Heading level={2}>{service.name}</Heading>
                <Text as="p" color="secondary">{service.description}</Text>
                <Text weight="semibold">от {(service.priceCents / 100).toLocaleString("ru-RU")} ₽</Text>
                <Button label="Выбрать" variant="secondary" onClick={() => setSelectedService(service)} />
              </VStack>
            </li>
          ))}
        </ul>
      </VStack>
      <BookingDrawer tenant={tenant} service={selectedService} onOpenChange={(open) => { if (!open) setSelectedService(null); }} />
    </Section>
  );
}
import { Button } from "@astryxdesign/core/Button";
