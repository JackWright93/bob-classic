import { supabase } from "@/lib/supabase";

// Converts the VAPID public key from base64url (how it's normally stored/shared)
// into the raw Uint8Array format the Push API's subscribe() call expects.
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

// True only when the site is running as an installed app (Home Screen icon on iOS),
// not as a regular browser tab. iOS Safari requires this before push will work at all.
export function isRunningStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export async function registerServiceWorker() {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

export async function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission; // "granted" | "denied" | "default"
}

export async function subscribeToPush(playerId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Push isn't supported on this browser." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "Notification permission was not granted." };

  const registration = await registerServiceWorker();
  if (!registration) return { ok: false, error: "Could not register the service worker." };

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return { ok: false, error: "Missing VAPID public key." };

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const subJson = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      player_id: playerId,
      endpoint: subJson.endpoint!,
      p256dh: subJson.keys!.p256dh,
      auth: subJson.keys!.auth,
    },
    { onConflict: "endpoint" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unsubscribeFromPush(playerId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Push isn't supported on this browser." };

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  } else {
    // No active browser subscription found, but clean up any orphaned DB rows for this player.
    await supabase.from("push_subscriptions").delete().eq("player_id", playerId);
  }

  return { ok: true };
}