'use strict';

self.addEventListener('push', function(event) {
  if (!event.data) return;

  var data = event.data.json();
  var title   = data.title   || '夫婦の共有予定帳';
  var body    = data.body    || '';
  var icon    = data.icon    || '/icon-192.png';
  var badge   = data.badge   || '/icon-192.png';
  var url     = data.url     || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body:  body,
      icon:  icon,
      badge: badge,
      tag:   data.tag || 'fufu-yotei',
      data:  { url: url },
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url === url && 'focus' in list[i]) {
          return list[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
