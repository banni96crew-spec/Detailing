import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { businessConfigSchema, type BusinessConfig } from "../../src/domain/business-schema.js";

export const projectRoot = path.resolve(import.meta.dirname, "../..");
export const tenantsRoot = path.join(projectRoot, "tenants");
export const generatedRoot = path.join(projectRoot, "public", "generated");

export async function tenantSlugs(): Promise<string[]> {
  const entries = await readdir(tenantsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export async function loadTenant(slug: string): Promise<BusinessConfig> {
  const filename = path.join(tenantsRoot, slug, "business.json");
  const raw: unknown = JSON.parse(await readFile(filename, "utf8"));
  const config = businessConfigSchema.parse(raw);
  if (config.slug !== slug) {
    throw new Error(`Папка ${slug} не совпадает со slug ${config.slug}`);
  }
  await validateAssets(config);
  return config;
}

export async function loadAllTenants(): Promise<BusinessConfig[]> {
  const configs = await Promise.all((await tenantSlugs()).map(loadTenant));
  const unique = new Set(configs.map((config) => config.slug));
  if (unique.size !== configs.length) {
    throw new Error("Найдены повторяющиеся slug студий");
  }
  return configs;
}

export function tenantAssetPath(config: BusinessConfig, relativePath: string): string {
  const root = path.resolve(tenantsRoot, config.slug);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Путь выходит за пределы tenants/${config.slug}: ${relativePath}`);
  }
  return resolved;
}

async function validateAssets(config: BusinessConfig): Promise<void> {
  const assetPaths = [
    config.brand.logo,
    config.brand.hero,
    ...config.gallery.map((item) => item.image),
  ];
  await Promise.all(assetPaths.map((asset) => access(tenantAssetPath(config, asset))));
}

export function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Не задана переменная ${name}`);
  }
  return value;
}

export function htmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
