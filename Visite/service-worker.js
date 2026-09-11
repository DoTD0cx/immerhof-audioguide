const APP_CACHE = "immerhof-interface-v6";

const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.json",
  "./icone.svg"
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

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  // Les polices Google sont mises en cache à la première visite,
  // pour que l'interface garde son allure une fois sous terre.
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

  // Les audios sont gérés par le bouton « Télécharger » (cache immerhof-audios).
  // caches.match() interroge tous les caches, donc ils sont servis ici aussi.
  event.respondWith(
    caches.match(event.request).then(reponse =>
      reponse || fetch(event.request).catch(() =>
        caches.match("./index.html")
      )
    )
  );
});
