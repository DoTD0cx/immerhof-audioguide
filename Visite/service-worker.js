const CACHE_VERSION = "immerhof-v2";
const APP_CACHE = `${CACHE_VERSION}-application`;
const AUDIO_CACHE = `${CACHE_VERSION}-audios`;

const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./Image/entree.jpg",
    "./Image/usine.jpg"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches
            .open(APP_CACHE)
            .then(cache => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames =>
                Promise.all(
                    cacheNames
                        .filter(cacheName =>
                            cacheName.startsWith("immerhof-") &&
                            cacheName !== APP_CACHE &&
                            cacheName !== AUDIO_CACHE
                        )
                        .map(cacheName => caches.delete(cacheName))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") {
        return;
    }

    const url = new URL(request.url);

    if (url.pathname.toLowerCase().endsWith(".mp3")) {
        event.respondWith(handleAudioRequest(request));
        return;
    }

    event.respondWith(
        caches.match(request).then(cachedResponse => {
            return cachedResponse || fetch(request);
        })
    );
});

async function handleAudioRequest(request) {
    const cache = await caches.open(AUDIO_CACHE);

    const fullRequest = new Request(request.url, {
        method: "GET",
        headers: new Headers(),
        mode: "same-origin",
        credentials: "same-origin"
    });

    let cachedAudio = await cache.match(fullRequest);

    if (!cachedAudio) {
        try {
            const networkResponse = await fetch(fullRequest);

            if (!networkResponse.ok) {
                return networkResponse;
            }

            await cache.put(fullRequest, networkResponse.clone());
            cachedAudio = networkResponse;
        } catch {
            return new Response(
                "Audio indisponible hors connexion.",
                {
                    status: 503,
                    statusText: "Audio indisponible"
                }
            );
        }
    }

    const rangeHeader = request.headers.get("range");

    if (!rangeHeader) {
        return cachedAudio;
    }

    return createRangeResponse(cachedAudio, rangeHeader);
}

async function createRangeResponse(response, rangeHeader) {
    const audioBuffer = await response.arrayBuffer();
    const totalSize = audioBuffer.byteLength;

    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);

    if (!match) {
        return new Response(null, {
            status: 416,
            headers: {
                "Content-Range": `bytes */${totalSize}`
            }
        });
    }

    const start = Number(match[1]);
    const requestedEnd = match[2]
        ? Number(match[2])
        : totalSize - 1;

    const end = Math.min(requestedEnd, totalSize - 1);

    if (start >= totalSize || start > end) {
        return new Response(null, {
            status: 416,
            headers: {
                "Content-Range": `bytes */${totalSize}`
            }
        });
    }

    const slicedBuffer = audioBuffer.slice(start, end + 1);

    return new Response(slicedBuffer, {
        status: 206,
        statusText: "Partial Content",
        headers: {
            "Content-Type":
                response.headers.get("Content-Type") || "audio/mpeg",
            "Content-Length": String(slicedBuffer.byteLength),
            "Content-Range":
                `bytes ${start}-${end}/${totalSize}`,
            "Accept-Ranges": "bytes"
        }
    });
}