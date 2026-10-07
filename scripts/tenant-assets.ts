import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { BusinessConfig, PublishedBusinessConfig } from "../src/domain/business-schema.js";
import { generatedRoot, loadAllTenants, loadTenant, tenantAssetPath } from "./lib/tenant.js";

async function renderImage(source: string, destination: string, width: number, height: number): Promise<void> {
  await sharp(source)
    .resize(width, height, { fit: "cover", position: "attention" })
    .webp({ quality: 84 })
    .toFile(destination);
}

async function renderPng(source: string, destination: string, size: number, padding = 0): Promise<void> {
  const inner = Math.max(1, size - padding * 2);
  const image = sharp(source).resize(inner, inner, { fit: "contain" }).png();
  if (padding === 0) {
    await image.toFile(destination);
    return;
  }
  await image
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: { r: 9, g: 11, b: 15, alpha: 1 } })
    .toFile(destination);
}

async function renderStartup(source: string, destination: string, width: number, height: number): Promise<void> {
  const logo = await sharp(source).resize(Math.round(width * 0.32), Math.round(width * 0.32), { fit: "contain" }).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: { r: 9, g: 11, b: 15, alpha: 1 } } })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toFile(destination);
}

export async function generateTenantAssets(config: BusinessConfig): Promise<PublishedBusinessConfig> {
  const output = path.join(generatedRoot, config.slug);
  const assets = path.join(output, "assets");
  await rm(output, { recursive: true, force: true });
  await mkdir(assets, { recursive: true });

  const logo = tenantAssetPath(config, config.brand.logo);
  await Promise.all([
    renderPng(logo, path.join(output, "icon-192.png"), 192),
    renderPng(logo, path.join(output, "icon-512.png"), 512),
    renderPng(logo, path.join(output, "icon-maskable-512.png"), 512, 64),
    renderPng(logo, path.join(output, "apple-touch-icon.png"), 180),
    renderStartup(logo, path.join(output, "startup-1170x2532.png"), 1170, 2532),
    renderStartup(logo, path.join(output, "startup-1290x2796.png"), 1290, 2796),
    renderStartup(logo, path.join(output, "startup-2048x2732.png"), 2048, 2732),
    renderImage(tenantAssetPath(config, config.brand.hero), path.join(assets, "hero.webp"), 1600, 1000),
  ]);

  const gallery = await Promise.all(
    config.gallery.map(async (item, index) => {
      const filename = `gallery-${String(index + 1)}.webp`;
      await renderImage(tenantAssetPath(config, item.image), path.join(assets, filename), 1200, 800);
      return { key: item.key, image: `/generated/${config.slug}/assets/${filename}`, caption: item.caption };
    }),
  );

  const serviceImages = await Promise.all(
    config.services.map(async (service, index) => {
      if (!service.image) return null;
      const filename = `service-${String(index + 1)}.webp`;
      await renderImage(tenantAssetPath(config, service.image), path.join(assets, filename), 1200, 800);
      return { key: service.key, image: `/generated/${config.slug}/assets/${filename}` };
    }),
  );
  const services = serviceImages.filter((item): item is { key: string; image: string } => item !== null);

  const publicConfig: PublishedBusinessConfig = {
    ...config,
    assets: {
      logo: `/generated/${config.slug}/icon-192.png`,
      hero: `/generated/${config.slug}/assets/hero.webp`,
      appleTouchIcon: `/generated/${config.slug}/apple-touch-icon.png`,
      icon192: `/generated/${config.slug}/icon-192.png`,
      icon512: `/generated/${config.slug}/icon-512.png`,
      maskable512: `/generated/${config.slug}/icon-maskable-512.png`,
      gallery,
      services,
    },
  };

  const base = `/s/${config.slug}/`;
  const manifest = {
    id: base,
    name: config.pwa.name,
    short_name: config.pwa.shortName,
    description: config.pwa.description,
    start_url: base,
    scope: base,
    display: "standalone",
    orientation: "any",
    background_color: "#090b0f",
    theme_color: config.brand.accent,
    icons: [
      { src: publicConfig.assets.icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: publicConfig.assets.icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: publicConfig.assets.maskable512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  await Promise.all([
    writeFile(path.join(output, "runtime.json"), `${JSON.stringify(publicConfig, null, 2)}\n`),
    writeFile(path.join(output, "manifest.webmanifest"), `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
  return publicConfig;
}

export async function generateAllTenantAssets(slug?: string): Promise<void> {
  const configs = slug ? [await loadTenant(slug)] : await loadAllTenants();
  const published = [];
  for (const config of configs) {
    published.push(await generateTenantAssets(config));
    console.log(`Собраны файлы ${config.slug}`);
  }
  await mkdir(generatedRoot, { recursive: true });
  await writeFile(
    path.join(generatedRoot, "tenants.json"),
    `${JSON.stringify(published.map(({ slug: tenantSlug, status }) => ({ slug: tenantSlug, status })), null, 2)}\n`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  generateAllTenantAssets(process.argv[2]).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
