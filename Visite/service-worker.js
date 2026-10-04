const APP_CACHE = "immerhof-interface-v9";
const PROTOCOLE_VISITE = 1;
const APP_FILES = [
  "./", "./index.html", "./style.css", "./script.js", "./manifest.json",
  "./icone-192.png", "./icone-512.png", "./icone-180.png", "./icone-maskable.png"
];
const URL_CONNECTIVITE = new URL("./connectivite.json", self.registration.scope);
const EST_CACHE_VISITE = nom => /^immerhof-(audios|interface)-v\d+$/.test(nom);
const POLICES = /^https:\/\/fonts\.(googleapis|gstatic)\.com/;
const EST_INTERFACE = url => url.origin === self.location.origin &&
  /(\/|\.html|\.css|\.js|\.json)$/.test(url.pathname);

// Après un redémarrage du worker, la lecture des caches reste possible, mais
// aucune écriture spontanée n'est autorisée : la page prépare une visite.
// Ce choix empêche un worker réveillé après nettoyage de recréer les caches.
const clientsAutorises = new Set();
const stockagesEnCours = new Set();
let nettoyageEnCours = null;
let cacheSuspendu = false;

async function chercherEnCache(requete, interfaceSeulement = false) {
  // Privilégier la nouvelle interface : conserver une ancienne version jusqu'à
  // la fin de visite ne doit pas lui permettre de servir un script obsolète.
  const actuelle = await caches.match(requete, { cacheName: APP_CACHE });
  if (actuelle) return actuelle;
  const noms = (await caches.keys())
    .filter(nom => nom !== APP_CACHE && EST_CACHE_VISITE(nom) &&
      (!interfaceSeulement || nom.startsWith("immerhof-interface-")))
    .sort((a, b) => Number(b.match(/v(\d+)$/)[1]) - Number(a.match(/v(\d+)$/)[1]));
  for (const nom of noms) {
    // CacheStorage.match avec cacheName ne crée aucun cache s'il a été supprimé.
    const rep = await caches.match(requete, { cacheName: nom });
    if (rep) return rep;
  }
}

function suivre(promise) {
  stockagesEnCours.add(promise);
  promise.then(() => stockagesEnCours.delete(promise), () => stockagesEnCours.delete(promise));
  return promise;
}

function enregistrerInterface(requete, reponse, clientId, force = false) {
  if (cacheSuspendu || (!force && !clientsAutorises.has(clientId))) return Promise.resolve();
  const copie = reponse.clone();
  return suivre((async () => {
    const cache = await caches.open(APP_CACHE);
    // La suspension peut intervenir pendant caches.open().
    if (cacheSuspendu || (!force && !clientsAutorises.has(clientId))) return;
    await cache.put(requete, copie);
  })());
}

async function requeteBornee(url, options = {}) {
  const controleur = new AbortController();
  const expiration = setTimeout(() => controleur.abort(), 8000);
  try { return await fetch(url, { ...options, signal: controleur.signal }); }
  finally { clearTimeout(expiration); }
}

function preparerCacheInterface(clientId, force = false) {
  return suivre(Promise.all(APP_FILES.map(async chemin => {
    if (cacheSuspendu || (!force && !clientsAutorises.has(clientId))) return;
    const url = new URL(chemin, self.registration.scope).href;
    try {
      const rep = await requeteBornee(url, { cache: "reload" });
      if (rep.ok) await enregistrerInterface(url, rep, clientId, force);
    } catch { /* Une ressource manquante ne bloque pas la lecture. */ }
  })));
}

self.addEventListener("install", event => {
  event.waitUntil(preparerCacheInterface(null, true).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  // Les anciennes versions de caches seront supprimées avec la visite,
  // uniquement après toutes les écoutes et une connexion réellement vérifiée.
  event.waitUntil(self.clients.claim());
});

async function internetAccessible() {
  const url = new URL(URL_CONNECTIVITE);
  url.searchParams.set("verification", Date.now() + "-" + Math.random());
  const controleur = new AbortController();
  const expiration = setTimeout(() => controleur.abort(), 8000);
  try {
    // fetch() dans le worker atteint le réseau directement, sans son propre
    // gestionnaire fetch ni aucun fallback vers CacheStorage.
    const rep = await fetch(url.href, {
      cache: "no-store", redirect: "error", credentials: "omit", signal: controleur.signal
    });
    if (!rep.ok || rep.redirected || !rep.headers.get("content-type")?.includes("application/json")) return false;
    const preuve = await rep.json();
    return preuve.audioguide === "immerhof" && preuve.connectivite === "ok" && preuve.version === 1;
  } catch { return false; }
  finally { clearTimeout(expiration); }
}

async function nettoyerVisite() {
  if (!(await internetAccessible())) return { ok: false, raison: "internet" };
  cacheSuspendu = true;
  clientsAutorises.clear();
  const fenetres = (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
    .filter(client => client.url.startsWith(self.registration.scope));
  // Ne pas effacer un cache pendant qu'une autre fenêtre y écrit des audios.
  const accords = await Promise.all(fenetres.map(client => new Promise(resolve => {
    const canal = new MessageChannel();
    const expiration = setTimeout(() => { canal.port1.close(); resolve(false); }, 8000);
    canal.port1.onmessage = event => {
      clearTimeout(expiration);
      canal.port1.close();
      resolve(event.data?.ok === true);
    };
    client.postMessage({ type: "SUSPENDRE_TELECHARGEMENTS", protocole: PROTOCOLE_VISITE }, [canal.port2]);
  })));
  const reporter = raison => {
    fenetres.forEach(client => client.postMessage({ type: "NETTOYAGE_REPORTE", protocole: PROTOCOLE_VISITE }));
    return { ok: false, raison };
  };
  if (accords.some(ok => !ok)) return reporter("fenetre");
  // Attendre les cache.put() déjà démarrés et les préparations de l'interface.
  // Les réponses réseau tardives ne peuvent plus démarrer d'écriture.
  while (stockagesEnCours.size) await Promise.allSettled([...stockagesEnCours]);
  if (!(await internetAccessible())) return reporter("internet");
  try {
    const noms = (await caches.keys()).filter(EST_CACHE_VISITE)
      .sort((a, b) => Number(a.startsWith("immerhof-interface-")) - Number(b.startsWith("immerhof-interface-")));
    for (const nom of noms) await caches.delete(nom);
    if ((await caches.keys()).some(EST_CACHE_VISITE)) throw new Error("Cache restant");
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if (client.url.startsWith(self.registration.scope)) {
        client.postMessage({ type: "VISITE_NETTOYEE", protocole: PROTOCOLE_VISITE });
      }
    }
    return { ok: true };
  } catch { return reporter("stockage"); }
}

self.addEventListener("message", event => {
  const donnees = event.data;
  const port = event.ports?.[0];
  if (!port || donnees?.protocole !== PROTOCOLE_VISITE ||
      !event.source?.url?.startsWith(self.registration.scope)) return;
  const repondre = resultat => port.postMessage({ protocole: PROTOCOLE_VISITE, ...resultat });
  if (donnees.type === "PREPARER_VISITE") {
    event.waitUntil((async () => {
      if (nettoyageEnCours) { repondre({ ok: false, raison: "nettoyage" }); return; }
      cacheSuspendu = false;
      clientsAutorises.add(event.source.id);
      await preparerCacheInterface(event.source.id);
      repondre({ ok: true });
    })().catch(() => repondre({ ok: false, raison: "stockage" })));
  } else if (donnees.type === "NETTOYER_VISITE") {
    // Seconde garde : jamais un simple nombre d'écoutes ou navigator.onLine.
    const prevues = donnees.stations;
    const ecoutees = donnees.ecoutees;
    if (!Array.isArray(prevues) || !prevues.length || !Array.isArray(ecoutees) ||
        !prevues.every(numero => ecoutees.includes(numero))) {
      repondre({ ok: false, raison: "incomplete" }); return;
    }
    if (!nettoyageEnCours) {
      nettoyageEnCours = nettoyerVisite().finally(() => { nettoyageEnCours = null; });
    }
    event.waitUntil(nettoyageEnCours.then(repondre, () => repondre({ ok: false, raison: "stockage" })));
  }
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin === URL_CONNECTIVITE.origin && url.pathname === URL_CONNECTIVITE.pathname) {
    // Cette ressource ne doit JAMAIS être mise en cache ou servie hors ligne.
    event.respondWith(fetch(event.request, { cache: "no-store", redirect: "error" }));
    return;
  }
  if (POLICES.test(event.request.url)) {
    event.respondWith(chercherEnCache(event.request, true).then(async rep => {
      if (rep) return rep;
      try {
        const reseau = await fetch(event.request);
        await enregistrerInterface(event.request, reseau, event.clientId).catch(() => {});
        return reseau;
      } catch { return new Response("", { status: 504 }); }
    }));
    return;
  }
  if (EST_INTERFACE(url)) {
    event.respondWith(fetch(event.request).then(async rep => {
      if (rep.ok) await enregistrerInterface(event.request, rep, event.clientId).catch(() => {});
      return rep;
    }).catch(() => chercherEnCache(event.request, true).then(async rep =>
      rep || await chercherEnCache(new URL("./index.html", self.registration.scope).href, true) ||
      new Response("Connexion requise pour une nouvelle visite.", { status: 503 })
    )));
    return;
  }
  // Audios et icônes : conserver la stratégie cache-first d'origine.
  event.respondWith(chercherEnCache(event.request).then(rep => rep || fetch(event.request)));
});
