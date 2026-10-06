import type { PublishedBusinessConfig } from "@/domain/business-schema";
import { browserEnvironment, isDemoMode } from "@/lib/env";
import { getSupabase } from "@/lib/supabase";
import { saveDemoTenantOverride } from "@/tenant/tenant-repository";

export interface ProfileUpdate {
  name: string;
  shortName: string;
  description: string;
  phone: string;
  address: string;
  directionsUrl: string;
  accentColor: string;
}

async function ownerToken(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Сеанс владельца завершён");
  return data.session.access_token;
}

async function tenantId(slug: string): Promise<string> {
  const { data, error } = await getSupabase().from("tenants").select("id").eq("slug", slug).single();
  if (error) throw error;
  return data.id as string;
}

export async function updateProfile(tenant: PublishedBusinessConfig, input: ProfileUpdate): Promise<void> {
  if (isDemoMode) {
    saveDemoTenantOverride({ ...tenant, brand: { ...tenant.brand, name: input.name, shortName: input.shortName, description: input.description, accent: input.accentColor }, contact: { phone: input.phone, address: input.address, directionsUrl: input.directionsUrl } });
    return;
  }
  if (!browserEnvironment.VITE_OWNER_API_URL) throw new Error("Адрес кабинета владельца не настроен");
  const response = await fetch(`${browserEnvironment.VITE_OWNER_API_URL}/tenant/${encodeURIComponent(tenant.slug)}/profile`, {
    method: "POST", headers: { authorization: `Bearer ${await ownerToken()}`, "content-type": "application/json" }, body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Не удалось сохранить настройки");
}

export async function updateService(tenant: PublishedBusinessConfig, serviceKey: string, values: { priceCents: number; durationMinutes: number; bufferMinutes: number; active: boolean }): Promise<void> {
  if (isDemoMode) {
    saveDemoTenantOverride({ ...tenant, services: tenant.services.map((service) => service.key === serviceKey ? { ...service, ...values } : service) });
    return;
  }
  const id = await tenantId(tenant.slug);
  const { error } = await getSupabase().from("services").update({ current_price_cents: values.priceCents, duration_minutes: values.durationMinutes, buffer_minutes: values.bufferMinutes, active: values.active, source: "owner" }).eq("tenant_id", id).eq("service_key", serviceKey);
  if (error) throw error;
}

export async function updateResource(tenant: PublishedBusinessConfig, resourceKey: string, values: { name: string; active: boolean }): Promise<void> {
  if (isDemoMode) {
    saveDemoTenantOverride({ ...tenant, resources: tenant.resources.map((resource) => resource.key === resourceKey ? { ...resource, name: values.name } : resource) });
    return;
  }
  const id = await tenantId(tenant.slug);
  const { error } = await getSupabase().from("resources").update({ name: values.name, active: values.active, source: "owner" }).eq("tenant_id", id).eq("resource_key", resourceKey);
  if (error) throw error;
}

export async function updateHours(tenant: PublishedBusinessConfig, weekday: number, values: { closed: boolean; opensAt?: string; lastArrivalAt?: string }): Promise<void> {
  if (isDemoMode) {
    saveDemoTenantOverride({ ...tenant, hours: tenant.hours.map((hour) => hour.weekday === weekday ? { weekday, closed: values.closed, ...(values.closed ? {} : { opensAt: values.opensAt, lastArrivalAt: values.lastArrivalAt }) } : hour) });
    return;
  }
  const id = await tenantId(tenant.slug);
  const { error } = await getSupabase().from("working_hours").update({ closed: values.closed, opens_at: values.closed ? null : values.opensAt, last_arrival_at: values.closed ? null : values.lastArrivalAt }).eq("tenant_id", id).eq("weekday", weekday);
  if (error) throw error;
}

export async function updateInfoCard(tenant: PublishedBusinessConfig, key: string, values: { title: string; text: string }): Promise<void> {
  if (isDemoMode) {
    saveDemoTenantOverride({ ...tenant, infoCards: tenant.infoCards.map((card) => card.key === key ? { ...card, ...values } : card) });
    return;
  }
  const id = await tenantId(tenant.slug);
  const { error } = await getSupabase().from("information_cards").update({ title: values.title, body: values.text, source: "owner" }).eq("tenant_id", id).eq("card_key", key);
  if (error) throw error;
}

async function uploadImage(tenant: PublishedBusinessConfig, file: File, folder: string): Promise<string> {
  if (isDemoMode) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Изображение имеет неподдерживаемый формат"));
      };
      reader.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      reader.readAsDataURL(file);
    });
  }
  const id = await tenantId(tenant.slug);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${id}/owner/${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await getSupabase().storage.from("tenant-public").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return getSupabase().storage.from("tenant-public").getPublicUrl(path).data.publicUrl;
}

export async function replaceGalleryImage(tenant: PublishedBusinessConfig, galleryKey: string, file: File): Promise<void> {
  const publicUrl = await uploadImage(tenant, file, "gallery");
  if (isDemoMode) {
    saveDemoTenantOverride({ ...tenant, gallery: tenant.gallery.map((item) => item.key === galleryKey ? { ...item, image: publicUrl } : item), assets: { ...tenant.assets, gallery: tenant.assets.gallery.map((item) => item.key === galleryKey ? { ...item, image: publicUrl } : item) } });
    return;
  }
  const id = await tenantId(tenant.slug);
  const { error } = await getSupabase().from("gallery_items").update({ storage_path: publicUrl, source: "owner" }).eq("tenant_id", id).eq("gallery_key", galleryKey);
  if (error) throw error;
}

export async function updateGalleryCaption(tenant: PublishedBusinessConfig, galleryKey: string, caption: string): Promise<void> {
  if (isDemoMode) {
    saveDemoTenantOverride({ ...tenant, gallery: tenant.gallery.map((item) => item.key === galleryKey ? { ...item, caption } : item), assets: { ...tenant.assets, gallery: tenant.assets.gallery.map((item) => item.key === galleryKey ? { ...item, caption } : item) } });
    return;
  }
  const id = await tenantId(tenant.slug);
  const { error } = await getSupabase().from("gallery_items").update({ caption, source: "owner" }).eq("tenant_id", id).eq("gallery_key", galleryKey);
  if (error) throw error;
}

export async function addGalleryItem(tenant: PublishedBusinessConfig, file: File, caption: string): Promise<void> {
  const publicUrl = await uploadImage(tenant, file, "gallery");
  const key = `owner-${crypto.randomUUID()}`;
  if (isDemoMode) {
    const item = { key, image: publicUrl, caption };
    saveDemoTenantOverride({ ...tenant, gallery: [...tenant.gallery, item], assets: { ...tenant.assets, gallery: [...tenant.assets.gallery, item] } });
    return;
  }
  const id = await tenantId(tenant.slug);
  const { error } = await getSupabase().from("gallery_items").insert({ tenant_id: id, gallery_key: key, position: tenant.gallery.length + 1, storage_path: publicUrl, caption, source: "owner", active: true });
  if (error) throw error;
}

export async function replaceBrandAsset(tenant: PublishedBusinessConfig, assetKey: "logo" | "hero", file: File): Promise<void> {
  const publicUrl = await uploadImage(tenant, file, assetKey);
  if (isDemoMode) {
    saveDemoTenantOverride({ ...tenant, assets: { ...tenant.assets, [assetKey]: publicUrl } });
    return;
  }
  const { error } = await getSupabase().rpc("owner_set_asset", { p_slug: tenant.slug, p_asset_key: assetKey, p_storage_path: publicUrl });
  if (error) throw error;
}
