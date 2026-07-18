self.addEventListener("push", (event) => {
  let data = { title: "The Bob Classic", body: "New activity in the feed" };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    // fall back to default text above if the payload isn't valid JSON
  }

  const options = {
    body: data.body,
    icon: "https://kqtipluvrwczlorccmlb.supabase.co/storage/v1/object/public/assets/TBC%20Main.png",
    badge: "https://kqtipluvrwczlorccmlb.supabase.co/storage/v1/object/public/assets/TBC%20Main.png",
    data: { url: data.url || "/feed" },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/feed";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});