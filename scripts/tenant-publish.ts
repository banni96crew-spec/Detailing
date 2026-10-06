import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generateTenantAssets } from "./tenant-assets.js";
import { generatedRoot, loadTenant, requireEnvironment } from "./lib/tenant.js";

async function filesUnder(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const filename = path.join(current, entry.name);
      return entry.isDirectory() ? filesUnder(root, filename) : Promise.resolve([path.relative(root, filename)]);
    }),
  );
  return nested.flat();
}

function contentType(filename: string): string {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".webmanifest")) return "application/manifest+json";
  return "application/json";
}

async function publish(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) throw new Error("Использование: pnpm tenant:publish <slug> [--live] [--dry-run]");
  const config = await loadTenant(slug);
  const published = await generateTenantAssets(config);
  if (process.argv.includes("--dry-run")) {
    console.log(`Проверка публикации ${slug} завершена без обращения к Supabase`);
    return;
  }

  const supabase = createClient(requireEnvironment("SUPABASE_URL"), requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const assetRoot = path.join(generatedRoot, slug);
  for (const filename of await filesUnder(assetRoot)) {
    const body = await readFile(path.join(assetRoot, filename));
    const { error } = await supabase.storage.from("tenant-public").upload(`${slug}/published/${filename.replaceAll("\\", "/")}`, body, {
      upsert: true,
      contentType: contentType(filename),
      cacheControl: "3600",
    });
    if (error) throw error;
  }

  const { error } = await supabase.rpc("admin_publish_tenant", {
    p_config: published,
    p_activate_live: process.argv.includes("--live"),
  });
  if (error) throw error;
  console.log(`Конфигурация ${slug} опубликована${process.argv.includes("--live") ? " в live" : " в preview"}`);
}

publish().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
