import { useEffect } from "react";

/** Registra el service worker (modo sin conexión). Solo en producción, para no cachear en desarrollo. */
export function RegisterSW() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    const onLoad = () => void navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
