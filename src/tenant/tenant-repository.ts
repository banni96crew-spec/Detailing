import { businessConfigSchema, type PublishedBusinessConfig } from "@/domain/business-schema";
import { isDemoMode } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";

const demoOverrideKey = (slug: string) => `demo-tenant-override:${slug}`;

function parsePublished(value: PublishedBusinessConfig): PublishedBusinessConfig {
  const sanitized = {
    ...value,
    brand: { ...value.brand, logo: "images/logo.svg", hero: "images/hero.svg" },
    gallery: value.gallery.map((item, index) => ({ ...item, image: `images/runtime-${index + 1}.webp` })),
  };
  const parsed = businessConfigSchema.parse(sanitized);
  return { ...parsed, brand: value.brand, gallery: value.gallery, assets: value.assets };
}

export async function fetchTenant(slug: string): Promise<PublishedBusinessConfig> {
  if (isDemoMode) {
    const response = await fetch(`/generated/${encodeURIComponent(slug)}/runtime.json`, { cache: "no-store" });
    if (!response.ok) throw new Error("Демонстрационная студия не найдена");
    const generated = (await response.json()) as PublishedBusinessConfig;
    const override = localStorage.getItem(demoOverrideKey(slug));
    const value = override ? JSON.parse(override) as PublishedBusinessConfig : generated;
    return parsePublished(value);
  }

  const response = await getSupabase().rpc("public_tenant_bootstrap", { p_slug: slug });
  if (response.error) throw response.error;
  const raw: unknown = response.data;
  if (!raw) throw new Error("Студия не найдена или ещё не опубликована");
  const value = raw as PublishedBusinessConfig;
  return parsePublished(value);
}

export function saveDemoTenantOverride(value: PublishedBusinessConfig): void {
  localStorage.setItem(demoOverrideKey(value.slug), JSON.stringify(value));
}
