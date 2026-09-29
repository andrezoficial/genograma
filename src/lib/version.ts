declare const __APP_VERSION__: string | undefined;

/** Commit corto + fecha del build (lo define vite.config.ts). "dev" en desarrollo. */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
