import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { businessConfigSchema } from "../src/domain/business-schema.js";
import { projectRoot, tenantSlugs, tenantsRoot } from "./lib/tenant.js";

async function createTenant(): Promise<void> {
  const slug = process.argv[2];
  const nameIndex = process.argv.indexOf("--name");
  const name = nameIndex >= 0 ? process.argv[nameIndex + 1] : undefined;
  if (!slug || !name) {
    throw new Error('Использование: pnpm tenant:new <slug> --name "Название"');
  }
  if ((await tenantSlugs()).includes(slug)) {
    throw new Error(`Студия ${slug} уже существует`);
  }

  const templateRoot = path.join(tenantsRoot, "graphite");
  const targetRoot = path.join(tenantsRoot, slug);
  await mkdir(targetRoot, { recursive: false });
  await cp(path.join(templateRoot, "images"), path.join(targetRoot, "images"), { recursive: true });
  const template: unknown = JSON.parse(await readFile(path.join(templateRoot, "business.json"), "utf8"));
  const parsed = businessConfigSchema.parse(template);
  const config = businessConfigSchema.parse({
    ...parsed,
    slug,
    status: "preview",
    brand: { ...parsed.brand, name, shortName: name.slice(0, 24) },
    contact: { ...parsed.contact, phone: "+7 000 000-00-00", address: "Укажите адрес студии" },
    pwa: { ...parsed.pwa, name: `${name} — запись`, shortName: name.slice(0, 24) },
  });
  await writeFile(path.join(targetRoot, "business.json"), `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Создан tenants/${slug}. Заполните business.json и замените изображения.`);
  console.log(`Корень проекта: ${projectRoot}`);
}

createTenant().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
