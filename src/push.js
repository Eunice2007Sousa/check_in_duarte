// src/push.js
// Funções de apoio às notificações push no browser.

import { supabase } from "./supabaseClient";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function isIOS() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

export function pushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// register() é idempotente: se já estiver registado, devolve o existente.
async function getRegistration() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

async function saveSubscription(session, sub) {
  const json = sub.toJSON();

  const { error } = await supabase.rpc("fn_push_guardar_subscricao", {
    p_numero_id: session.numero_id,
    p_codigo: session.codigo,
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent,
  });

  if (error) throw error;
}

/**
 * Devolve um destes estados:
 *  "needs-install" - iPhone, mas a app não foi aberta a partir do ecrã principal
 *  "unsupported"   - o browser não suporta push
 *  "denied"        - o atleta bloqueou as notificações
 *  "enabled"       - ativas neste dispositivo
 *  "disabled"      - podem ser ativadas
 */
export async function getPushState() {
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";

  if (Notification.permission === "granted") {
    const reg = await getRegistration();
    const sub = await reg.pushManager.getSubscription();
    return sub ? "enabled" : "disabled";
  }

  return "disabled";
}

// Tem de ser chamada a partir de um toque do utilizador (exigência do iPhone).
export async function enablePush(session) {
  if (!VAPID_PUBLIC_KEY) throw new Error("VAPID_EM_FALTA");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await getRegistration();

  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await saveSubscription(session, sub);

  return "enabled";
}

export async function disablePush(session) {
  const reg = await getRegistration();
  const sub = await reg.pushManager.getSubscription();

  if (!sub) return;

  await supabase.rpc("fn_push_remover_subscricao", {
    p_numero_id: session.numero_id,
    p_codigo: session.codigo,
    p_endpoint: sub.endpoint,
  });

  await sub.unsubscribe();
}

// Mantém o servidor em sincronia (ex.: outro atleta usou o mesmo telemóvel).
export async function syncPush(session) {
  const reg = await getRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (sub) await saveSubscription(session, sub);
}
