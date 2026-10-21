import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getDemoSlots } from "../src/booking/demo-availability.js";
import type { PublishedBusinessConfig } from "../src/domain/business-schema.js";
import { loadAllTenants, loadTenant } from "./lib/tenant.js";

function verifyTenant(tenant: PublishedBusinessConfig): void {
  for (const service of tenant.services) {
    for (let dayOffset = 0; dayOffset <= tenant.booking.horizonDays; dayOffset += 1) {
      const date = formatInTimeZone(addDays(new Date(), dayOffset), tenant.timezone, "yyyy-MM-dd");
      if (getDemoSlots(tenant, service.key, date, []).some((slot) => slot.available)) return;
    }
  }
  throw new Error(`${tenant.slug}: нет доступного слота для витринной записи в пределах horizonDays`);
}

async function main(): Promise<void> {
  const slug = process.argv[2];
  const configs = slug ? [await loadTenant(slug)] : await loadAllTenants();
  for (const config of configs) {
    verifyTenant(config as PublishedBusinessConfig);
    console.log(`OK ${config.slug}: доступный слот для витринной записи найден`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
