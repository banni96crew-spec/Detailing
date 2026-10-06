import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { loadAllTenants, loadTenant } from "./lib/tenant.js";

export async function validateTenants(slug?: string): Promise<void> {
  const configs = slug ? [await loadTenant(slug)] : await loadAllTenants();
  for (const config of configs) {
    console.log(`OK ${config.slug}: ${String(config.services.length)} услуг, ${String(config.resources.length)} ресурсов`);
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  validateTenants(process.argv[2]).catch((error: unknown) => {
    if (error instanceof ZodError) {
      console.error(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  });
}
