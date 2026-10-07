import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/VStack";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate } from "react-router-dom";
import { isDemoMode } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";
import { useTenant } from "@/tenant/tenant-context";

export function OwnerLayout() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  async function logout(): Promise<void> {
    if (!isDemoMode) await getSupabase().auth.signOut();
    queryClient.clear();
    if ("caches" in window) {
      for (const key of await caches.keys()) if (key.includes("private")) await caches.delete(key);
    }
    void navigate(`/s/${tenant.slug}/`, { replace: true });
  }
  return (
    <VStack as="article" gap={0} paddingBlockEnd={8}>
      <Section variant="transparent" padding={4}>
        <header className="owner-header">
          <VStack gap={1}>
            <Heading level={1}>{tenant.brand.shortName}</Heading>
            <HStack gap={2} wrap="wrap">
              <Button label="Записи" variant="ghost" href={`/s/${tenant.slug}/owner/`} />
              <Button label="Настройки" variant="ghost" href={`/s/${tenant.slug}/owner/settings`} />
              <Button label="Выйти" variant="ghost" onClick={() => void logout()} />
            </HStack>
          </VStack>
        </header>
      </Section>
      <Outlet />
    </VStack>
  );
}
