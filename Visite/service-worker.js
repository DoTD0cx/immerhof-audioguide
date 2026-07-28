const APP_CACHE = "immerhof-application-v1";
const AUDIO_CACHE = "immerhof-audios-v1";

const applicationFiles = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./Audio/entree.mp3",
    "./Audio/usine.mp3",
    "./Image/entree.jpg",
    "./Image/usine.jpg"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches
            .open(APP_CACHE)
            .then(cache => cache.addAll(applicationFiles))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    const validCaches = [
        APP_CACHE,
        AUDIO_CACHE
    ];

    event.waitUntil(
        caches
            .keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (!validCaches.includes(cacheName)) {
                            return caches.delete(cacheName);
                        }

                        return Promise.resolve();
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then(networkResponse => {
                if (
                    !networkResponse ||
                    networkResponse.status !== 200
                ) {
                    return networkResponse;
                }

                const responseCopy = networkResponse.clone();

                caches.open(APP_CACHE).then(cache => {
                    cache.put(event.request, responseCopy);
                });

                return networkResponse;
            });
        })
    );
});