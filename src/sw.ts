/// <reference lib="webworker" />
import { clientsClaim, setCacheNameDetails } from "workbox-core";
import type { WorkboxPlugin } from "workbox-core/types";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision?: string }[] };

const tenantSlug = new URL(self.registration.scope).pathname.split("/").filter(Boolean).at(-1) ?? "unknown";
setCacheNameDetails({ prefix: `detailing-${tenantSlug}`, suffix: "v1" });
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    allowlist: [new RegExp(`^/s/${tenantSlug}/(?!owner(?:/|$))`)],
  }),
);

registerRoute(
  ({ request, url }) => request.destination === "image" && url.origin === self.location.origin,
  new StaleWhileRevalidate({
    cacheName: `detailing-${tenantSlug}-images-v1`,
    plugins: [new ExpirationPlugin({ maxEntries: 48, maxAgeSeconds: 60 * 60 * 24 * 30 }) as unknown as WorkboxPlugin],
  }),
);

registerRoute(
  ({ request, url }) => request.method === "GET"
    && url.origin === self.location.origin
    && url.pathname.startsWith(`/s/${tenantSlug}/`)
    && !url.pathname.startsWith(`/s/${tenantSlug}/owner`),
  new NetworkFirst({ cacheName: `detailing-${tenantSlug}-public-v1`, networkTimeoutSeconds: 3 }),
);

self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | undefined)?.type === "SKIP_WAITING") void self.skipWaiting();
});
