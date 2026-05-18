"use client";

import { useEffect, useState } from "react";

// Botón "Activar notificaciones" para el panel del residente.
// Flujo:
//   1. Pide permiso al navegador.
//   2. Registra el SW si no está.
//   3. Se suscribe a pushManager con la VAPID public key.
//   4. Manda la suscripción a /api/push/subscribe para guardar.
//
// Si el navegador no soporta push (Safari/iOS < 16.4), el componente
// directamente no aparece.

function urlBase64ToBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

type Status = "checking" | "unsupported" | "granted" | "denied" | "default" | "no_vapid";

export default function EnableNotifications({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!vapidPublicKey) {
      setStatus("no_vapid");
      return;
    }
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    setStatus(Notification.permission as Status);

    // Chequear si ya está suscripto
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => undefined);
  }, [vapidPublicKey]);

  const enable = async () => {
    if (!vapidPublicKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setStatus(perm as Status);
      if (perm !== "granted") {
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(vapidPublicKey),
      });
      const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: raw.endpoint,
          keys: { p256dh: raw.keys?.p256dh, auth: raw.keys?.auth },
        }),
      });
      setSubscribed(true);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: "DELETE" },
        );
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  };

  if (status === "checking") return null;
  if (status === "unsupported" || status === "no_vapid") {
    return (
      <p className="text-xs text-zinc-400">
        Tu navegador no soporta notificaciones, o el barrio no las tiene configuradas.
      </p>
    );
  }
  if (status === "denied") {
    return (
      <p className="text-xs text-amber-300">
        Bloqueaste las notificaciones para este sitio. Habilitalas desde la configuración del navegador.
      </p>
    );
  }

  if (subscribed) {
    return (
      <button
        onClick={disable}
        disabled={busy}
        className="text-xs text-zinc-400 hover:text-rose-300 underline disabled:opacity-50"
      >
        Desactivar notificaciones de visitas
      </button>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={busy}
      className="w-full bg-sky-700 hover:bg-sky-600 font-semibold py-3 rounded-xl disabled:opacity-50"
    >
      🔔 Activar notificaciones cuando llegue mi visita
    </button>
  );
}
