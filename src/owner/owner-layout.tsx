import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { isDemoMode } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";
import { useTenant } from "@/tenant/tenant-context";

export function OwnerLayout() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const settingsActive = location.pathname.endsWith("/owner/settings");
  async function logout(): Promise<void> {
    if (!isDemoMode) await getSupabase().auth.signOut();
    queryClient.clear();
    if ("caches" in window) {
      for (const key of await caches.keys()) if (key.includes("private")) await caches.delete(key);
    }
    void navigate(`/s/${tenant.slug}/`, { replace: true });
  }
  return (
    <VStack as="article" className="graphite-owner-layout" gap={0} paddingBlockEnd={8}>
      <Section variant="transparent" padding={4}>
        <header className="owner-header">
          <VStack gap={3}>
            <HStack className="owner-title-row" justify="between" align="end" gap={3}>
              <VStack gap={1}>
                <Text className="owner-brand-label">{tenant.brand.shortName}</Text>
                <Heading level={1}>Управление</Heading>
              </VStack>
              <Button className="owner-logout" label="Выйти" variant="ghost" onClick={() => void logout()} />
            </HStack>
            <HStack className="owner-navigation" gap={1}>
              <Button className={settingsActive ? undefined : "is-active"} label="Записи" variant="ghost" href={`/s/${tenant.slug}/owner/`} />
              <Button className={settingsActive ? "is-active" : undefined} label="Настройки" variant="ghost" href={`/s/${tenant.slug}/owner/settings`} />
            </HStack>
          </VStack>
        </header>
      </Section>
      <Outlet />
    </VStack>
  );
}
