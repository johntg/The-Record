export default async function createPushSubscription({
  supabase,
  vapidPublicKey,
  currentUser,
}) {
  // 1. Check if Service Workers and Push are supported
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.log("Push notifications are not supported on this browser.");
    return;
  }

  // 2. Register the service worker file
  const registration = await navigator.serviceWorker.register("/sw.js");

  // 3. Request permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.log("Permission denied.");
    return;
  }

  // 4. Subscribe the user to the browser's push service
  const YOUR_PUBLIC_VAPID_KEY =
    "BHxRyx0MQCSyNpb49ojwV4Sg98tmf7eNvN9LJLF1rb7r2XaGD0A3apLRiDrywGR75trQRIP3xrW2PFzhV4lShSw";

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, // Required by browsers for security
    applicationServerKey: vapidPublicKey, // Your VAPID public key
  });

  // 5. Send this subscription object to your backend database
  await fetch("/api/save-subscription", {
    method: "POST",
    body: JSON.stringify(subscription),
    headers: { "Content-Type": "application/json" },
  });

  console.log("User successfully subscribed!");
}
