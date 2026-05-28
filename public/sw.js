// sw.js

// Listen for the incoming push event
self.addEventListener("push", (event) => {
  let data = { title: "New Update", body: "Something happened!" };

  if (event.data) {
    // Assuming your backend sends a JSON payload
    data = event.data.json();
  }

  const options = {
    body: data.body,
    icon: "/record-192.png",
    vibrate: [100, 50, 100],
    data: {
      // Open the app and land on the Messages (inbox) page
      url: data.url || (self.registration.scope + "?page=inbox"),
    },
  };

  // Keep the service worker alive until the notification is shown
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle what happens when the user clicks the notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close(); // Close the notification banner

  const targetUrl = event.notification.data.url;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If a tab is already open, focus it
        for (let client of windowClients) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window/tab
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
