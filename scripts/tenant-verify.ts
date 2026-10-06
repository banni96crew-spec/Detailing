import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { loadTenant, projectRoot } from "./lib/tenant.js";

function verifyJson(configSlug: string, raw: string): void {
  const value = JSON.parse(raw) as { id?: string; start_url?: string; scope?: string; icons?: unknown[] };
  const expected = `/s/${configSlug}/`;
  if (value.id !== expected || value.start_url !== expected || value.scope !== expected) {
    throw new Error(`Manifest ${configSlug} имеет неверные id/start_url/scope`);
  }
  if (!Array.isArray(value.icons) || value.icons.length < 3) {
    throw new Error(`Manifest ${configSlug} не содержит все иконки`);
  }
}

async function verify(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) throw new Error("Использование: pnpm tenant:verify <slug> [--url https://example.com]");
  const config = await loadTenant(slug);
  const urlIndex = process.argv.indexOf("--url");
  const baseUrl = urlIndex >= 0 ? process.argv[urlIndex + 1]?.replace(/\/$/, "") : undefined;

  if (baseUrl) {
    const [home, owner, manifest, worker] = await Promise.all([
      fetch(`${baseUrl}/s/${slug}/`),
      fetch(`${baseUrl}/s/${slug}/owner/`),
      fetch(`${baseUrl}/generated/${slug}/manifest.webmanifest`),
      fetch(`${baseUrl}/s/${slug}/sw.js`),
    ]);
    for (const response of [home, owner, manifest, worker]) {
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}: ${response.url}`);
    }
    const homeText = await home.text();
    if (!homeText.includes(config.pwa.name)) throw new Error("В HTML нет метаданных нужной студии");
    verifyJson(slug, await manifest.text());
  } else {
    const dist = path.join(projectRoot, "dist");
    const home = await readFile(path.join(dist, "s", slug, "index.html"), "utf8");
    if (!home.includes(config.pwa.name)) throw new Error("В локальном HTML нет метаданных нужной студии");
    verifyJson(slug, await readFile(path.join(dist, "generated", slug, "manifest.webmanifest"), "utf8"));
    await access(path.join(dist, "s", slug, "sw.js"));
    await Promise.all([
      access(path.join(dist, "generated", slug, "icon-maskable-512.png")),
      access(path.join(dist, "generated", slug, "apple-touch-icon.png")),
      access(path.join(dist, "generated", slug, "startup-1170x2532.png")),
      access(path.join(dist, "generated", slug, "startup-1290x2796.png")),
      access(path.join(dist, "generated", slug, "startup-2048x2732.png")),
    ]);
  }
  console.log(`Готовность ${slug} подтверждена${baseUrl ? `: ${baseUrl}` : " локально"}`);
}

verify().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
