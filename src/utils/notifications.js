export // main.js
async function subscribeToPush() {
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
  const YOUR_PUBLIC_VAPID_KEY = "YOUR_PUBLIC_KEY_HERE";

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, // Required by browsers for security
    applicationServerKey: YOUR_PUBLIC_VAPID_KEY,
  });

  // 5. Send this subscription object to your backend database
  await fetch("/api/save-subscription", {
    method: "POST",
    body: JSON.stringify(subscription),
    headers: { "Content-Type": "application/json" },
  });

  console.log("User successfully subscribed!");
}
