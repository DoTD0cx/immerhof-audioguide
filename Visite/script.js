/* =====================================================================
   Audioguide — Petit ouvrage d'Immerhof / Association Le Tiburce

   POUR AJOUTER OU MODIFIER UNE STATION :
   une seule ligne à ajouter dans le tableau « stations » ci-dessous.
   La durée est facultative : elle est corrigée automatiquement dès que
   le fichier est lu. Rien d'autre à toucher dans ce fichier.

   La mise en cache hors ligne démarre dès l'ouverture de la page.
   ===================================================================== */

const stations = [
  { numero: "01", titre: "Entrée",                  audio: "./Audio/01-entree.mp3",          duree: 62  },
  { numero: "02", titre: "Chambre de tir",          audio: "./Audio/02-chambre-tir.mp3",     duree: 369 },
  { numero: "03", titre: "Radio TSF",               audio: "./Audio/03-radio-tsf.mp3",       duree: 97  },
  { numero: "04", titre: "Équipe Z",                audio: "./Audio/04-equipe-z.mp3",        duree: 110 },
  { numero: "05", titre: "Magasin",                 audio: "./Audio/05-magasin.mp3",         duree: 67  },
  { numero: "06", titre: "Bloc de défense interne", audio: "./Audio/06-defense-interne.mp3", duree: 122 },
  { numero: "07", titre: "Usine",                   audio: "./Audio/07-usine.mp3",           duree: 52  },
  { numero: "08", titre: "Cuisine",                 audio: "./Audio/08-cuisine.mp3",         duree: 34  },
  { numero: "09", titre: "Infirmerie",              audio: "./Audio/09-infirmerie.mp3",      duree: 62  },
  { numero: "10", titre: "Casernement",             audio: "./Audio/10-casernement.mp3",     duree: 54  },
  { numero: "11", titre: "Bloc 1 et Bloc 2",        audio: "./Audio/11-infanterie.mp3",      duree: 44  },
  { numero: "12", titre: "Bloc 3",                  audio: "./Audio/12-bloc-3.mp3",          duree: 104 }
];

/* ------------------------------------------------------------------ */

const CACHE_NAME = "immerhof-audios-v6";
const CLE_ECOUTES = "immerhof-ecoutees";

const ICONE_PLAY  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
const ICONE_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4h4v16h-4zM13.5 4h4v16h-4z"/></svg>';
const ICONE_PLEIN  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3H4zm11-5h5v5h-2V6h-3V4zM4 15h2v3h3v2H4v-5zm14 0h2v5h-5v-2h3v-3z"/></svg>';
const ICONE_REDUIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h2v5H6V7h3V4zm4 0h2v3h3v2h-5V4zM6 15h5v5H9v-3H6v-2zm7 0h5v2h-3v3h-2v-5z"/></svg>';

document.addEventListener("DOMContentLoaded", async () => {
  const $ = id => document.getElementById(id);

  const conteneur     = $("stations");
  const compteurTotal = $("compteurTotal");
  const pastille      = $("statusDot");
  const pastilleTexte = $("statusText");
  const ligneProgres  = $("ligneProgres");
  const barreProgres  = $("progressFill");

  const lecteur    = $("lecteur");
  const lecTitre   = $("lecteurTitre");
  const lecTemps   = $("lecteurTemps");
  const scrub      = $("scrub");
  const btnPlay    = $("btnPlay");
  const btnRecul   = $("btnRecul");
  const btnAvance  = $("btnAvance");
  const btnFermer  = $("btnFermer");
  const btnPlein   = $("btnPlein");

  const audio = new Audio();
  audio.preload = "metadata";

  const urlsLocales = new Map();
  let indexCourant = -1;
  let scrubEnCours = false;
  let miseEnCacheEnCours = false;

  const ecoutees = new Set(lireEcoutees());

  /* ---------------------------------------------------------- Utilitaires */

  function lireEcoutees() {
    try { return JSON.parse(localStorage.getItem(CLE_ECOUTES) || "[]"); }
    catch { return []; }
  }

  function sauverEcoutees() {
    try { localStorage.setItem(CLE_ECOUTES, JSON.stringify([...ecoutees])); }
    catch { /* navigation privée : on continue sans mémoriser */ }
  }

  const mmss = s => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    return m + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  };

  const urlAbsolue = chemin => new URL(chemin, window.location.href).href;

  /* ------------------------------------------------------------ Affichage */

  function construireListe() {
    conteneur.innerHTML = stations.map((s, i) => `
      <button class="station" type="button" data-index="${i}" aria-current="false"
              aria-label="Station ${s.numero}, ${s.titre}">
        <span class="station-plaque">${s.numero}</span>
        <span class="station-corps">
          <span class="station-titre">${s.titre}</span>
          <span class="station-meta">
            <span class="duree-affichee" data-duree="${i}">${mmss(s.duree || 0)}</span>
            <span class="vu" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="ecoute" data-ecoute="${i}" hidden>écoutée</span>
          </span>
        </span>
        <span class="station-icone">${ICONE_PLAY}</span>
      </button>
    `).join("");

    conteneur.querySelectorAll(".station").forEach(el => {
      el.addEventListener("click", () => basculer(Number(el.dataset.index)));
    });

    majEcoutees();
  }

  function majEcoutees() {
    stations.forEach((s, i) => {
      const el = conteneur.querySelector(`.station[data-index="${i}"]`);
      if (!el) return;
      const vue = ecoutees.has(s.numero);
      el.classList.toggle("est-ecoutee", vue);
      const tag = el.querySelector(`[data-ecoute="${i}"]`);
      if (tag) tag.hidden = !vue;
    });
    compteurTotal.textContent = `${ecoutees.size} / ${stations.length} écoutées`;
  }

  function majEtatStations() {
    conteneur.querySelectorAll(".station").forEach(el => {
      const i = Number(el.dataset.index);
      const actif = i === indexCourant;
      el.setAttribute("aria-current", actif ? "true" : "false");
      el.dataset.lecture = (actif && !audio.paused) ? "1" : "0";
      el.querySelector(".station-icone").innerHTML =
        (actif && !audio.paused) ? ICONE_PAUSE : ICONE_PLAY;
    });
    btnPlay.innerHTML = audio.paused ? ICONE_PLAY : ICONE_PAUSE;
    btnPlay.setAttribute("aria-label", audio.paused ? "Lire" : "Mettre en pause");
  }

  /* -------------------------------------------------------------- Lecture */

  function sourcePour(station) {
    return urlsLocales.get(urlAbsolue(station.audio)) || station.audio;
  }

  function charger(i) {
    const s = stations[i];
    indexCourant = i;
    audio.src = sourcePour(s);
    audio.load();

    lecTitre.innerHTML = `<b>${s.numero}</b>${s.titre}`;
    scrub.value = 0;
    scrub.style.setProperty("--avancement", "0%");
    lecTemps.textContent = `0:00 / ${mmss(s.duree || 0)}`;
    lecteur.classList.add("est-visible");
    document.body.classList.add("lecteur-actif");

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${s.numero} — ${s.titre}`,
        artist: "Audioguide Immerhof",
        album: "Association Le Tiburce"
      });
    }
  }

  function basculer(i) {
    if (i === indexCourant) {
      audio.paused ? audio.play().catch(() => {}) : audio.pause();
      return;
    }
    charger(i);
    audio.play().catch(() => {});
  }

  audio.addEventListener("play",  majEtatStations);
  audio.addEventListener("pause", majEtatStations);

  audio.addEventListener("loadedmetadata", () => {
    const s = stations[indexCourant];
    if (s && isFinite(audio.duration)) {
      s.duree = audio.duration;
      const cell = conteneur.querySelector(`[data-duree="${indexCourant}"]`);
      if (cell) cell.textContent = mmss(audio.duration);
    }
  });

  audio.addEventListener("timeupdate", () => {
    if (scrubEnCours || !isFinite(audio.duration)) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    scrub.value = pct;
    scrub.style.setProperty("--avancement", pct + "%");
    lecTemps.textContent = `${mmss(audio.currentTime)} / ${mmss(audio.duration)}`;
  });

  audio.addEventListener("ended", () => {
    const s = stations[indexCourant];
    if (s) { ecoutees.add(s.numero); sauverEcoutees(); majEcoutees(); }
    majEtatStations();
  });

  btnPlay.addEventListener("click", () => {
    if (indexCourant < 0) return basculer(0);
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  });

  btnRecul.addEventListener("click",  () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  btnAvance.addEventListener("click", () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });

  btnFermer.addEventListener("click", () => {
    audio.pause();
    indexCourant = -1;
    lecteur.classList.remove("est-visible");
    document.body.classList.remove("lecteur-actif");
    majEtatStations();
  });

  scrub.addEventListener("input", () => {
    scrubEnCours = true;
    scrub.style.setProperty("--avancement", scrub.value + "%");
    if (isFinite(audio.duration)) {
      lecTemps.textContent = `${mmss(audio.duration * scrub.value / 100)} / ${mmss(audio.duration)}`;
    }
  });

  scrub.addEventListener("change", () => {
    if (isFinite(audio.duration)) audio.currentTime = audio.duration * scrub.value / 100;
    scrubEnCours = false;
  });

  /* ---------------------------------------------------------- Plein écran

     Aucun navigateur n'accepte de passer en plein écran au chargement : il
     exige un geste de l'utilisateur. On le déclenche donc au tout premier
     appui sur la page — le même appui qui lance la station. C'est le plus
     proche de « automatique » que la plateforme autorise.
     Safari sur iPhone ne le permet pas du tout depuis une page web : le
     bouton y reste masqué, et l'ajout à l'écran d'accueil prend le relais.  */

  const racine = document.documentElement;

  const demandePlein = racine.requestFullscreen
    || racine.webkitRequestFullscreen
    || racine.mozRequestFullScreen
    || racine.msRequestFullscreen;

  const quittePlein = document.exitFullscreen
    || document.webkitExitFullscreen
    || document.mozCancelFullScreen
    || document.msExitFullscreen;

  const estPlein = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  // déjà installé sur l'écran d'accueil : il n'y a pas de barre à masquer
  const estInstalle = window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || window.navigator.standalone === true;

  function entrerPlein() {
    if (!demandePlein) return Promise.reject();
    try { return Promise.resolve(demandePlein.call(racine, { navigationUI: "hide" })); }
    catch { return Promise.reject(); }
  }

  function majBoutonPlein() {
    if (!demandePlein || estInstalle) { btnPlein.hidden = true; return; }
    btnPlein.hidden = false;
    const dedans = estPlein();
    btnPlein.innerHTML = dedans ? ICONE_REDUIT : ICONE_PLEIN;
    btnPlein.setAttribute("aria-label", dedans ? "Quitter le plein écran" : "Passer en plein écran");
  }

  btnPlein.addEventListener("click", event => {
    event.stopPropagation();
    if (estPlein()) { quittePlein && quittePlein.call(document); }
    else { entrerPlein().catch(() => {}); }
  });

  document.addEventListener("fullscreenchange", majBoutonPlein);
  document.addEventListener("webkitfullscreenchange", majBoutonPlein);

  // Premier geste sur la page, quel qu'il soit : on bascule en plein écran.
  let pleinTente = false;
  function pleinAuPremierGeste() {
    if (pleinTente) return;
    pleinTente = true;
    document.removeEventListener("pointerdown", pleinAuPremierGeste, true);
    if (!demandePlein || estInstalle || estPlein()) return;
    entrerPlein().catch(() => {});
  }
  if (demandePlein && !estInstalle) {
    document.addEventListener("pointerdown", pleinAuPremierGeste, true);
  }

  majBoutonPlein();

  /* --------------------------------------------------- Écoute hors ligne */

  function majPastille(etat, texte) {
    pastille.dataset.etat = etat;
    pastilleTexte.textContent = texte;
    const titres = {
      pret:    "Les audios sont enregistrés sur ce téléphone : la visite fonctionne sans réseau.",
      encours: "Enregistrement des audios en cours. Restez à portée de réseau.",
      erreur:  "L'enregistrement a échoué. Touchez pour réessayer.",
      vide:    "Les audios ne sont pas encore enregistrés. Touchez pour les enregistrer."
    };
    pastille.title = titres[etat] || "";
  }

  function majFil(dispo) {
    const pct = Math.round((dispo / stations.length) * 100);
    barreProgres.style.width = pct + "%";
    ligneProgres.classList.toggle("est-terminee", dispo === stations.length);
  }

  function majAvancement(dispo) {
    majFil(dispo);
    if (dispo === stations.length) majPastille("pret", "Hors ligne");
    else if (miseEnCacheEnCours)   majPastille("encours", `${dispo}/${stations.length}`);
    else if (dispo > 0)            majPastille("vide", `${dispo}/${stations.length}`);
    else                           majPastille("vide", "En ligne");
  }

  async function chargerDepuisCache() {
    if (!("caches" in window)) { majAvancement(0); return 0; }

    let cache;
    try { cache = await caches.open(CACHE_NAME); }
    catch { majAvancement(0); return 0; }

    let dispo = 0;

    for (const s of stations) {
      const url = urlAbsolue(s.audio);
      const rep = await cache.match(url);
      if (!rep) continue;

      const blob = await rep.blob();
      if (!blob.size) continue;

      const ancienne = urlsLocales.get(url);
      if (ancienne) URL.revokeObjectURL(ancienne);
      urlsLocales.set(url, URL.createObjectURL(blob));
      dispo++;
    }

    // Si la station en cours vient d'être enregistrée, on bascule sa source
    // sur la copie locale — mais seulement à l'arrêt, pour ne pas couper le son.
    if (indexCourant >= 0 && audio.paused) {
      const t = audio.currentTime;
      audio.src = sourcePour(stations[indexCourant]);
      audio.currentTime = t || 0;
    }

    majAvancement(dispo);
    return dispo;
  }

  async function compterCache(cache) {
    let n = 0;
    for (const s of stations) {
      if (await cache.match(urlAbsolue(s.audio))) n++;
    }
    return n;
  }

  async function enregistrer(chemin, cache) {
    const url = urlAbsolue(chemin);

    const rep = await fetch(url, { cache: "no-store" });
    if (!rep.ok) throw new Error("réponse " + rep.status);

    const blob = await rep.blob();
    if (!blob.size) throw new Error("fichier vide");

    await cache.put(url, new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": rep.headers.get("content-type") || "audio/mpeg",
        "Content-Length": String(blob.size)
      }
    }));

    const verif = await cache.match(url);
    if (!verif || (await verif.blob()).size !== blob.size) {
      await cache.delete(url);
      throw new Error("téléchargement incomplet");
    }
  }

  /* Enregistre les stations manquantes, une par une, sans bloquer la lecture.
     « prioritaire » est la station en cours d'écoute : on la garde pour la fin
     afin de ne pas se battre avec le flux qu'elle est en train de lire. */
  async function toutEnregistrer(prioritaire) {
    if (!("caches" in window) || miseEnCacheEnCours) return;

    miseEnCacheEnCours = true;

    try {
      const cache = await caches.open(CACHE_NAME);

      const aFaire = [];
      for (const s of stations) {
        const dejaLa = await cache.match(urlAbsolue(s.audio));
        if (!dejaLa) aFaire.push(s);
      }

      // la station en cours de lecture passe en dernier
      aFaire.sort((a, b) => (a === prioritaire ? 1 : 0) - (b === prioritaire ? 1 : 0));

      for (const s of aFaire) {
        try { await enregistrer(s.audio, cache); }
        catch { /* station réessayable via la pastille */ }
        majAvancement(await compterCache(cache));
      }

      miseEnCacheEnCours = false;
      const dispo = await chargerDepuisCache();

      if (dispo < stations.length) {
        majPastille("erreur", "Réessayer");
      }
    } catch {
      miseEnCacheEnCours = false;
      majPastille("erreur", "Réessayer");
    }
  }

  // La pastille sert aussi de commande manuelle : relancer, ou re-vérifier.
  pastille.addEventListener("click", () => {
    if (miseEnCacheEnCours) return;
    majPastille("encours", "…");
    toutEnregistrer(indexCourant >= 0 ? stations[indexCourant] : null);
  });

  /* ----------------------------------------------------------- Démarrage */

  construireListe();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  const dejaLa = await chargerDepuisCache();
  majEtatStations();

  /* La visite s'enregistre dès l'ouverture de la page, dans l'ordre des
     stations : au guichet, pendant qu'on retire les manteaux, sous l'auvent.
     C'est la seule fenêtre de réseau garantie les jours de pluie, où le groupe
     descend sans s'arrêter dehors. Aucun geste n'est nécessaire — seul le
     plein écran en demande un.                                              */
  if (dejaLa < stations.length && navigator.onLine !== false) {
    setTimeout(() => toutEnregistrer(null), 300);
  }

  // Réseau retrouvé (remontée, Wi-Fi du guichet) : on reprend là où on en était.
  window.addEventListener("online", () => {
    if (miseEnCacheEnCours) return;
    toutEnregistrer(indexCourant >= 0 ? stations[indexCourant] : null);
  });

  window.addEventListener("beforeunload", () => {
    urlsLocales.forEach(url => URL.revokeObjectURL(url));
  });
});
