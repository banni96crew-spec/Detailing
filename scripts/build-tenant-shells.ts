import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generatedRoot, htmlEscape, loadAllTenants, projectRoot } from "./lib/tenant.js";

function tenantHtml(baseHtml: string, name: string, description: string, accent: string, slug: string): string {
  const head = [
    `<meta name="description" content="${htmlEscape(description)}" />`,
    `<meta name="theme-color" content="${htmlEscape(accent)}" />`,
    `<link rel="manifest" href="/generated/${slug}/manifest.webmanifest" />`,
    `<link rel="icon" type="image/png" href="/generated/${slug}/icon-192.png" />`,
    `<link rel="apple-touch-icon" href="/generated/${slug}/apple-touch-icon.png" />`,
    `<link rel="apple-touch-startup-image" href="/generated/${slug}/startup-1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" />`,
    `<link rel="apple-touch-startup-image" href="/generated/${slug}/startup-1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />`,
    `<link rel="apple-touch-startup-image" href="/generated/${slug}/startup-2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />`,
  ].join("\n    ");
  return baseHtml
    .replace(/<title>.*?<\/title>/s, `<title>${htmlEscape(name)}</title>`)
    .replace(/<meta name="theme-color"[^>]*>/, "")
    .replace("</head>", `    ${head}\n  </head>`);
}

async function buildTenantShells(): Promise<void> {
  const dist = path.join(projectRoot, "dist");
  const baseHtml = await readFile(path.join(dist, "index.html"), "utf8");
  const worker = path.join(dist, "sw.js");
  const redirects: string[] = [];

  for (const config of await loadAllTenants()) {
    const root = path.join(dist, "s", config.slug);
    const owner = path.join(root, "owner");
    await Promise.all([mkdir(root, { recursive: true }), mkdir(owner, { recursive: true })]);
    const html = tenantHtml(baseHtml, config.pwa.name, config.pwa.description, config.brand.accent, config.slug);
    await Promise.all([
      writeFile(path.join(root, "index.html"), html),
      writeFile(path.join(owner, "index.html"), html),
      copyFile(worker, path.join(root, "sw.js")),
    ]);
    redirects.push(`/s/${config.slug}/owner/* /s/${config.slug}/owner/index.html 200`);
    redirects.push(`/s/${config.slug}/* /s/${config.slug}/index.html 200`);
    const manifest = path.join(generatedRoot, config.slug, "manifest.webmanifest");
    await readFile(manifest, "utf8");
  }
  redirects.push("/* /index.html 200");
  await writeFile(path.join(dist, "_redirects"), `${redirects.join("\n")}\n`);
}

buildTenantShells().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
