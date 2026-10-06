import { z } from "zod";

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

const browserEnvironmentSchema = z
  .object({
    VITE_SUPABASE_URL: optionalUrl,
    VITE_SUPABASE_ANON_KEY: z.string().optional(),
    VITE_PUBLIC_API_URL: optionalUrl,
    VITE_OWNER_API_URL: optionalUrl,
    VITE_ASSISTANT_API_URL: optionalUrl,
    VITE_VAPID_PUBLIC_KEY: z.string().optional(),
    VITE_DEMO_MODE: z.enum(["true", "false"]).default("true"),
  })
  .superRefine((value, context) => {
    if (value.VITE_DEMO_MODE === "false" && (!value.VITE_SUPABASE_URL || !value.VITE_SUPABASE_ANON_KEY)) {
      context.addIssue({ code: "custom", message: "Для рабочего режима нужны VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY" });
    }
  });

export const browserEnvironment = browserEnvironmentSchema.parse(import.meta.env);
export const isDemoMode = browserEnvironment.VITE_DEMO_MODE === "true";
