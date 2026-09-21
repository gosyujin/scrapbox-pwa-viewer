// Cache-first-with-background-refresh service worker for the (single-file)
// Scrapbox viewer, so it keeps working fully offline after the first visit.
var CACHE_NAME = "sb-viewer-v1";

self.addEventListener("install", function (event) {
  var page = new URL(self.location.href).searchParams.get("page");
  var urls = ["manifest.json"];
  if (page) urls.push(page);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(urls.map(function (u) { return cache.add(u).catch(function () {}); }));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(event.request).then(function (cached) {
        var network = fetch(event.request).then(function (response) {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
