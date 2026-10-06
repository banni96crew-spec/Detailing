import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

export function LoadingState({ label }: { label: string }) {
  return (
    <Section variant="transparent" minHeight="100dvh" padding={6}>
      <VStack gap={3} hAlign="center" vAlign="center" minHeight="80dvh">
        <Text type="large">{label}</Text>
      </VStack>
    </Section>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail: string; onRetry?: () => void }) {
  return (
    <Section variant="transparent" minHeight="100dvh" padding={6}>
      <VStack gap={4} hAlign="center" vAlign="center" minHeight="80dvh" maxWidth="40rem">
        <Heading level={1}>{title}</Heading>
        <Text color="secondary">{detail}</Text>
        {onRetry ? <Button label="Повторить" variant="primary" onClick={onRetry} /> : null}
      </VStack>
    </Section>
  );
}
