/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PUBLIC_API_URL?: string;
  readonly VITE_OWNER_API_URL?: string;
  readonly VITE_ASSISTANT_API_URL?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_DEMO_MODE?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
