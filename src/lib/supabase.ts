import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { browserEnvironment, isDemoMode } from "./env";

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (isDemoMode) throw new Error("Подключение к серверу не настроено");
  const url = browserEnvironment.VITE_SUPABASE_URL;
  const key = browserEnvironment.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Не заданы публичные параметры Supabase");
  client ??= createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  return client;
}

export async function clearPrivateSession(): Promise<void> {
  await client?.removeAllChannels();
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("private-")).map((key) => caches.delete(key)));
}
