import { useEffect } from "react";

export function useLiquidGlass(selector: string): void {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let disposed = false;
    let destroy: (() => void) | undefined;
    const frame = requestAnimationFrame(() => {
      void import("liquid-gl").then(({ default: liquidGL }) => {
        if (disposed || !document.querySelector(selector)) return;
        const instance = liquidGL({
          target: selector,
          snapshot: "body",
          engine: "auto",
          resolution: Math.min(window.devicePixelRatio, 2),
          refraction: 0.012,
          bevelDepth: 0.08,
          bevelWidth: 0.18,
          frost: 2,
          shadow: true,
          specular: true,
          reveal: "fade",
          interaction: "fluid",
          tint: "rgba(9, 12, 18, 0.24)",
        });
        destroy = () => instance.destroy();
      }).catch(() => undefined);
    });
    return () => { disposed = true; cancelAnimationFrame(frame); destroy?.(); };
  }, [selector]);
}
