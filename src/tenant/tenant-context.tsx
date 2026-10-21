import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Theme, defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { ensureDemoBooking, resetDemoBooking } from "@/booking/demo-booking-bootstrap";
import { clearBookingToken, getBookingToken, saveBookingToken } from "@/booking/booking-storage";
import { bookingTokenKey, demoBookingsKey, demoPaymentsKey } from "@/booking/demo-booking-store";
import { isDemoMode } from "@/lib/env";
import { fetchTenant } from "./tenant-repository";
import { ErrorState, LoadingState } from "@/components/app-state";

const TenantContext = createContext<PublishedBusinessConfig | null>(null);
interface DemoBookingContextValue {
  bookingToken: string | null;
  revision: number;
  setBookingToken: (token: string | null) => Promise<void>;
  resetDemo: () => Promise<void>;
}
const DemoBookingContext = createContext<DemoBookingContextValue | null>(null);

function registerTenantWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  // Скопированный в /s/<slug>/ Worker получает неверные относительные пути
  // к ресурсам и оставляет navigator.serviceWorker.ready в ожидании.
  void navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export function TenantProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["tenant", slug],
    queryFn: () => {
      return fetchTenant(slug);
    },
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    registerTenantWorker();
  }, []);
  const [demoReady, setDemoReady] = useState(!isDemoMode);
  const [demoError, setDemoError] = useState<Error | null>(null);
  const [demoState, setDemoState] = useState({ bookingToken: null as string | null, revision: 0 });

  const invalidateDemoQueries = useCallback((tenant: PublishedBusinessConfig) => {
    void queryClient.invalidateQueries({ queryKey: ["booking", tenant.slug] });
    void queryClient.invalidateQueries({ queryKey: ["owner-bookings", tenant.slug] });
    void queryClient.invalidateQueries({ queryKey: ["owner-stats", tenant.slug] });
    void queryClient.invalidateQueries({ queryKey: ["slots", tenant.slug] });
    void queryClient.invalidateQueries({ queryKey: ["owner-slots", tenant.slug] });
  }, [queryClient]);

  useEffect(() => {
    const tenant = query.data;
    if (!tenant) return;
    let active = true;
    setDemoError(null);
    setDemoReady(false);
    const prepare = async () => {
      try {
        const token = isDemoMode
          ? (await ensureDemoBooking(tenant)).accessToken
          : getBookingToken(tenant.slug);
        if (!active) return;
        setDemoState((current) => ({ bookingToken: token, revision: current.revision + 1 }));
        setDemoReady(true);
      } catch (error) {
        if (!active) return;
        setDemoError(error instanceof Error ? error : new Error("Не удалось подготовить демонстрацию"));
        setDemoReady(true);
      }
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [query.data]);

  useEffect(() => {
    const tenant = query.data;
    if (!isDemoMode || !tenant || !demoReady || demoError) return;
    let active = true;
    const synchronize = () => {
      void ensureDemoBooking(tenant)
        .then(({ accessToken }) => {
          if (!active) return;
          setDemoState((current) => ({ bookingToken: accessToken, revision: current.revision + 1 }));
          invalidateDemoQueries(tenant);
        })
        .catch((error: unknown) => {
          if (active) setDemoError(error instanceof Error ? error : new Error("Не удалось синхронизировать демонстрацию"));
        });
    };
    const onStorage = (event: StorageEvent) => {
      if (![bookingTokenKey(tenant.slug), demoBookingsKey(tenant.slug), demoPaymentsKey(tenant.slug)].includes(event.key ?? "")) return;
      synchronize();
    };
    const onDemoChange = (event: Event) => {
      const detail = (event as CustomEvent<{ slug?: string }>).detail;
      if (detail.slug === tenant.slug) synchronize();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("demo-bookings-changed", onDemoChange);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("demo-bookings-changed", onDemoChange);
    };
  }, [demoError, demoReady, invalidateDemoQueries, query.data]);

  const setBookingToken = useCallback(async (token: string | null) => {
    const tenant = query.data;
    if (!tenant) return;
    if (!token) {
      clearBookingToken(tenant.slug);
      setDemoState((current) => ({ bookingToken: null, revision: current.revision + 1 }));
      return;
    }
    if (isDemoMode) {
      const { accessToken } = await ensureDemoBooking(tenant, token);
      setDemoState((current) => ({ bookingToken: accessToken, revision: current.revision + 1 }));
      return;
    }
    saveBookingToken(tenant.slug, token);
    setDemoState((current) => ({ bookingToken: token, revision: current.revision + 1 }));
  }, [query.data]);
  const resetDemo = useCallback(async () => {
    const tenant = query.data;
    if (!tenant || !isDemoMode) return;
    const { accessToken } = await resetDemoBooking(tenant);
    setDemoState((current) => ({ bookingToken: accessToken, revision: current.revision + 1 }));
    invalidateDemoQueries(tenant);
  }, [invalidateDemoQueries, query.data]);
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
  if (!demoReady) return <LoadingState label="Подготавливаем демонстрацию" />;
  if (demoError) return <ErrorState title="Не удалось подготовить запись" detail={demoError.message} onRetry={() => void query.refetch()} />;

  return (
    <Theme theme={theme} mode="dark">
      <TenantContext.Provider value={query.data}>
        <DemoBookingContext.Provider value={{ ...demoState, setBookingToken, resetDemo }}>
          {children}
        </DemoBookingContext.Provider>
      </TenantContext.Provider>
    </Theme>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTenant(): PublishedBusinessConfig {
  const value = useContext(TenantContext);
  if (!value) throw new Error("useTenant must be used within TenantProvider");
  return value;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDemoBooking(): DemoBookingContextValue {
  const value = useContext(DemoBookingContext);
  if (!value) throw new Error("useDemoBooking must be used within TenantProvider");
  return value;
}
