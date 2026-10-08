import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useTenant } from "@/tenant/tenant-context";

export function WorksPage() {
  const tenant = useTenant();

  return (
    <VStack as="article" className="graphite-page graphite-works-page" gap={0}>
      <Section className="graphite-works-header" variant="transparent" padding={0}>
        <VStack gap={2}>
          <Heading level={1}>Работы</Heading>
          <Text as="p">Результаты ухода за кузовом и салоном автомобилей наших клиентов.</Text>
        </VStack>
      </Section>

      <Section className="graphite-works-content" variant="transparent" padding={0}>
        <ol className="graphite-works-list">
          {tenant.assets.gallery.map((item, index) => (
            <li key={item.key}>
              <figure className="graphite-work-card">
                <img src={item.image} alt={item.caption} loading={index === 0 ? "eager" : "lazy"} />
                <figcaption>
                  <VStack gap={1}>
                    <Text className="graphite-work-index">Работа {String(index + 1).padStart(2, "0")}</Text>
                    <Heading level={2}>{item.caption}</Heading>
                  </VStack>
                </figcaption>
              </figure>
            </li>
          ))}
        </ol>
      </Section>
    </VStack>
  );
}
