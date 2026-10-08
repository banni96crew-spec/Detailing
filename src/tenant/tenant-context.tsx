import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Theme, defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { fetchTenant } from "./tenant-repository";
import { ErrorState, LoadingState } from "@/components/app-state";

const TenantContext = createContext<PublishedBusinessConfig | null>(null);

function registerTenantWorker(slug: string): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register(`/s/${slug}/sw.js`, { scope: `/s/${slug}/` });
}

export function TenantProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const query = useQuery({
    queryKey: ["tenant", slug],
    queryFn: () => {
      return fetchTenant(slug);
    },
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    registerTenantWorker(slug);
  }, [slug]);
  const theme = useMemo(
    () =>
      query.data
        ? defineTheme({
            name: `tenant-${query.data.slug}`,
            extends: neutralTheme,
            tokens: {
              "--color-accent": [query.data.brand.accent, query.data.brand.accent],
              "--color-on-accent": ["#07111d", "#07111d"],
              "--color-background-body": ["#07111d", "#07111d"],
              "--color-background-surface": ["#0d1a29", "#0d1a29"],
              "--color-background-muted": ["#142232", "#142232"],
              "--color-background-card": ["#101e2d", "#101e2d"],
              "--color-text-primary": ["#f5f8fb", "#f5f8fb"],
              "--color-text-secondary": ["#aab6c3", "#aab6c3"],
              "--color-border": ["rgba(185, 207, 228, 0.16)", "rgba(185, 207, 228, 0.16)"],
              "--color-border-emphasized": ["rgba(207, 225, 242, 0.28)", "rgba(207, 225, 242, 0.28)"],
              "--font-family-body": ["Inter, ui-sans-serif, system-ui, sans-serif", "Inter, ui-sans-serif, system-ui, sans-serif"],
            },
            components: {
              button: {
                base: { borderRadius: query.data.slug === "graphite" ? "10px" : "9999px", fontWeight: "700" },
              },
            },
          })
        : neutralTheme,
    [query.data],
  );

  if (query.isPending) return <LoadingState label="Загружаем студию" />;
  if (query.isError) return <ErrorState title="Не удалось открыть студию" detail={query.error.message} onRetry={() => void query.refetch()} />;

  return (
    <Theme theme={theme} mode="dark">
      <TenantContext.Provider value={query.data}>{children}</TenantContext.Provider>
    </Theme>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTenant(): PublishedBusinessConfig {
  const value = useContext(TenantContext);
  if (!value) throw new Error("useTenant must be used within TenantProvider");
  return value;
}
