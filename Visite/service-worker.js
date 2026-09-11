const APP_CACHE = "immerhof-interface-v7";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icone-192.png",
  "./icone-512.png",
  "./icone-180.png",
  "./icone-maskable.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      // addAll() échoue en bloc si un seul fichier manque : on installe
      // fichier par fichier pour rester tolérant.
      .then(cache => Promise.all(
        APP_FILES.map(f => cache.add(f).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(noms => Promise.all(
        noms
          .filter(nom => nom.startsWith("immerhof-interface-") && nom !== APP_CACHE)
          .map(nom => caches.delete(nom))
      ))
      .then(() => self.clients.claim())
  );
});

const POLICES = /^https:\/\/fonts\.(googleapis|gstatic)\.com/;

// Fichiers d'interface : ceux que vous modifiez quand vous ajoutez une station.
const EST_INTERFACE = url =>
  url.origin === self.location.origin &&
  /(\/|\.html|\.css|\.js|\.json)$/.test(url.pathname);

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Polices Google : en cache dès la première visite, pour que l'interface
  // garde son allure une fois sous terre.
  if (POLICES.test(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then(reponse =>
        reponse || fetch(event.request).then(rep => {
          const copie = rep.clone();
          caches.open(APP_CACHE).then(c => c.put(event.request, copie)).catch(() => {});
          return rep;
        }).catch(() => new Response("", { status: 504 }))
      )
    );
    return;
  }

  // Interface : le RÉSEAU D'ABORD, le cache seulement en secours.
  // C'est ce qui fait qu'une station ajoutée dans script.js apparaît sur les
  // téléphones dès la visite suivante, sans avoir à vider quoi que ce soit.
  // Hors ligne, le fetch échoue tout de suite et la copie en cache prend le relais.
  if (EST_INTERFACE(url)) {
    event.respondWith(
      fetch(event.request)
        .then(rep => {
          if (rep && rep.ok) {
            const copie = rep.clone();
            caches.open(APP_CACHE).then(c => c.put(event.request, copie)).catch(() => {});
          }
          return rep;
        })
        .catch(() =>
          caches.match(event.request).then(r => r || caches.match("./index.html"))
        )
    );
    return;
  }

  // Tout le reste — audios, icônes : le cache d'abord, c'est du contenu figé.
  // Les audios vivent dans le cache « immerhof-audios », que caches.match()
  // interroge aussi.
  event.respondWith(
    caches.match(event.request).then(reponse =>
      reponse || fetch(event.request)
    )
  );
});
