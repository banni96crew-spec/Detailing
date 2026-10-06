declare module "liquid-gl" {
  interface LiquidGlassInstance { destroy(): void }
  interface LiquidGlassOptions {
    target: string;
    snapshot?: string;
    content?: string | boolean;
    engine?: "auto" | "webgpu" | "webgl2" | "webgl";
    resolution?: number;
    refraction?: number;
    bevelDepth?: number;
    bevelWidth?: number;
    frost?: number;
    shadow?: boolean;
    specular?: boolean;
    reveal?: "fade" | "none";
    interaction?: "none" | "fluid";
    tint?: string | null;
  }
  export default function liquidGL(options: LiquidGlassOptions): LiquidGlassInstance;
}
