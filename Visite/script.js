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
const PROTOCOLE_VISITE = 1;
const DELAI_VERIFICATION = 20000;

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
  const btnCommencer = $("btnCommencer");
  const btnTelecharger = $("btnTelecharger");
  const horsligneCarte = $("horsligneCarte");
  const horsligneTitre = $("horsligneTitre");
  const horsligneDetail = $("horsligneDetail");
  const lecteurMessage = $("lecteurMessage");
  const finVisite = $("finVisite");
  const finVisiteDetail = $("finVisiteDetail");

  const audio = new Audio();
  audio.preload = "metadata";

  const urlsLocales = new Map();
  let indexCourant = -1;
  let scrubEnCours = false;
  let miseEnCacheEnCours = false;
  let fichiersDisponibles = 0;
  let visiteNettoyee = false;
  let verificationEnCours = false;
  let nettoyageEnCours = false;
  let controleurTelechargement = null;
  let finTelechargement = Promise.resolve();
  let minuterieVerification = null;
  let enregistrementSW = null;
  // Verrou d'interface uniquement : remis à false à une nouvelle ouverture.
  let sessionTerminee = false;

  const ecoutees = new Set(lireEcoutees());

  /* ---------------------------------------------------------- Utilitaires */

  function lireEcoutees() {
    try {
      const valeurs = JSON.parse(localStorage.getItem(CLE_ECOUTES) || "[]");
      return Array.isArray(valeurs) ? valeurs.filter(n => stations.some(s => s.numero === n)) : [];
    }
    catch { return []; }
  }

  function sauverEcoutees() {
    try { localStorage.setItem(CLE_ECOUTES, JSON.stringify([...ecoutees])); }
    catch { /* navigation privée : on continue sans mémoriser */ }
  }

  // Chaque numéro prévu doit être présent ; la taille du Set ne suffit pas.
  function visiteTerminee() {
    return stations.length > 0 && stations.every(s => ecoutees.has(s.numero));
  }

  function afficherFinVisite() {
    if (!visiteTerminee() || visiteNettoyee) return;
    afficherAttenteFinale(); // Verrou visuel dès la fin réelle de toutes les stations.
    finVisite.hidden = false;
    if (!nettoyageEnCours) {
      finVisiteDetail.textContent = "Merci de votre visite. Les données restent disponibles jusqu’au retour d’une connexion Internet vérifiée.";
    }
    // Un téléchargement en vol ne doit pas écrire après le nettoyage.
    controleurTelechargement?.abort();
    programmerVerification();
  }

  function programmerVerification() {
    if (minuterieVerification !== null || visiteNettoyee || !visiteTerminee()) return;
    if (document.visibilityState === "hidden") return;
    minuterieVerification = setTimeout(() => {
      minuterieVerification = null;
      verifierFinVisite();
    }, DELAI_VERIFICATION);
  }

  // Un succès de fetch, son contenu attendu et l'absence de redirection
  // sont exigés. navigator.onLine n'est jamais une preuve de connectivité.
  async function internetAccessible() {
    const controleur = new AbortController();
    const expiration = setTimeout(() => controleur.abort(), 8000);
    try {
      const url = new URL("./connectivite.json", window.location.href);
      url.searchParams.set("verification", Date.now() + "-" + Math.random());
      const rep = await fetch(url.href, {
        cache: "no-store", redirect: "error", credentials: "omit",
        signal: controleur.signal
      });
      if (!rep.ok || rep.redirected || !rep.headers.get("content-type")?.includes("application/json")) return false;
      const preuve = await rep.json();
      return preuve.audioguide === "immerhof" && preuve.connectivite === "ok" && preuve.version === 1;
    } catch { return false; }
    finally { clearTimeout(expiration); }
  }

  async function contacterSW(type) {
    if (!("serviceWorker" in navigator)) throw new Error("Service worker indisponible");
    // register() résout sans attendre indéfiniment navigator.serviceWorker.ready.
    if (enregistrementSW) await enregistrementSW;
    const worker = navigator.serviceWorker.controller;
    if (!worker) throw new Error("Service worker pas encore actif");
    return new Promise((resolve, reject) => {
      const canal = new MessageChannel();
      const expiration = setTimeout(() => {
        canal.port1.close();
        reject(new Error("Service worker sans réponse"));
      }, 15000);
      canal.port1.onmessage = event => {
        clearTimeout(expiration);
        canal.port1.close();
        if (event.data?.protocole !== PROTOCOLE_VISITE) return reject(new Error("Service worker à actualiser"));
        resolve(event.data);
      };
      worker.postMessage({
        type, protocole: PROTOCOLE_VISITE,
        stations: stations.map(s => s.numero), ecoutees: [...ecoutees]
      }, [canal.port2]);
    });
  }

  async function preparerInterface() {
    if (visiteTerminee() || visiteNettoyee || nettoyageEnCours) return;
    try { await contacterSW("PREPARER_VISITE"); }
    catch { /* Le téléchargement audio et la lecture restent disponibles. */ }
  }

  // Deux états visuels ; aucune preuve de connectivité ou de nettoyage ici.
  let nettoyageConfirmeVisuellement = false;

  function afficherAttenteFinale() {
    if (!visiteTerminee() || visiteNettoyee) return;
    afficherEcranFinal(false);
  }

  // Transition de présentation uniquement : le contenu sortant n’est jamais interactif.
  function animerValidationFinale(ecranFinal) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!ecranFinal.hidden) {
      const sortant = ecranFinal.querySelector(".ecran-final-contenu").cloneNode(true);
      sortant.classList.add("ecran-final-sortant");
      sortant.setAttribute("aria-hidden", "true");
      sortant.inert = true;
      sortant.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
      ecranFinal.appendChild(sortant);
      const retirer = () => sortant.remove();
      sortant.addEventListener("animationend", retirer, { once: true });
      setTimeout(retirer, 1000); // Secours visuel si le navigateur suspend l’animation.
    }
    ecranFinal.classList.add("validation-animee");
  }

  function afficherEcranFinal(nettoyageReussi = true) {
    const premierAffichage = !sessionTerminee;
    sessionTerminee = true;
    audio.pause();
    const ecranFinal = $("ecranFinal");
    // hidden reste efficace même si le navigateur ne prend pas en charge inert.
    [document.querySelector(".app-shell"), lecteur, ligneProgres].forEach(zone => {
      zone.hidden = true;
      zone.inert = true;
      zone.setAttribute("aria-hidden", "true");
      zone.querySelectorAll("button, input").forEach(commande => { commande.disabled = true; });
    });
    document.documentElement.classList.add("session-terminee");
    document.body.classList.add("session-terminee");
    // Un nouveau signal réseau ne peut pas rétrograder une confirmation.
    if (nettoyageReussi && !nettoyageConfirmeVisuellement) animerValidationFinale(ecranFinal);
    nettoyageConfirmeVisuellement ||= nettoyageReussi;
    ecranFinal.dataset.etat = nettoyageConfirmeVisuellement ? "confirme" : "attente";
    ecranFinal.setAttribute("aria-busy", String(!nettoyageConfirmeVisuellement));
    $("ecranFinalMerci").textContent = nettoyageConfirmeVisuellement
      ? "Merci d’avoir découvert l’ouvrage de l’Immerhof."
      : "Merci de votre visite.";
    $("ecranFinalDetail").textContent = nettoyageConfirmeVisuellement
      ? "Vous pouvez maintenant quitter l’audioguide."
      : "Suivez maintenant votre guide, qui vous mènera vers la sortie.";
    $("ecranFinalSigne").hidden = !nettoyageConfirmeVisuellement;
    $("ecranFinalConsigne").hidden = nettoyageConfirmeVisuellement;
    ecranFinal.hidden = false;
    if (premierAffichage) ecranFinal.focus({ preventScroll: true });
  }

  function terminerNettoyageLocal() {
    // L'acknowledgement du SW arrive après la suppression vérifiée des caches.
    visiteNettoyee = true;
    nettoyageEnCours = false;
    controleurTelechargement?.abort();
    if (minuterieVerification !== null) clearTimeout(minuterieVerification);
    minuterieVerification = null;
    audio.pause();
    indexCourant = -1;
    audio.removeAttribute("src");
    audio.load();
    urlsLocales.forEach(url => URL.revokeObjectURL(url));
    urlsLocales.clear();
    lecteur.classList.remove("est-visible");
    lecteur.inert = true;
    document.body.classList.remove("lecteur-actif");
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
    let progressionSupprimee = true;
    try { localStorage.removeItem(CLE_ECOUTES); }
    catch { progressionSupprimee = false; }
    ecoutees.clear();
    majEcoutees();
    majEtatStations();
    majAvancement(0);
    finVisite.hidden = false;
    finVisiteDetail.textContent = progressionSupprimee
      ? "Les données de visite ont été supprimées de cet appareil. Vous pouvez quitter l’audioguide ou commencer une nouvelle visite."
      : "Les téléchargements ont été supprimés. Le navigateur empêche l’effacement de la progression locale ; réessayez en rouvrant l’audioguide avec une connexion.";
    horsligneDetail.textContent = "Les données ont été libérées. Un nouveau téléchargement sera proposé lors de votre prochaine visite.";
    $("texteCommencer").textContent = "Commencer une nouvelle visite";
    if (progressionSupprimee) afficherEcranFinal();
  }

  async function verifierFinVisite() {
    if (!visiteTerminee() || visiteNettoyee || verificationEnCours || miseEnCacheEnCours) return;
    if (document.visibilityState === "hidden") return;
    verificationEnCours = true;
    try {
      if (!(await internetAccessible()) || !visiteTerminee() || visiteNettoyee) return;
      afficherAttenteFinale(); // Reprise détectée par la sonde sans événement online.
      nettoyageEnCours = true;
      finVisiteDetail.textContent = "Connexion vérifiée. Libération des données de visite…";
      const resultat = await contacterSW("NETTOYER_VISITE");
      if (resultat.ok) terminerNettoyageLocal();
      else if (resultat.raison === "stockage") {
        finVisiteDetail.textContent = "Visite terminée. Le nettoyage sera réessayé automatiquement ; les données restantes sont conservées.";
      }
    } catch {
      // Pas d'acknowledgement : conserver la preuve d'écoute et réessayer.
      finVisiteDetail.textContent = "Visite terminée. Le nettoyage sera réessayé après vérification de la connexion et activation de la mise à jour.";
    } finally {
      verificationEnCours = false;
      nettoyageEnCours = false;
      if (!visiteNettoyee) programmerVerification();
    }
  }

  function demarrerNouvelleVisite() {
    if (sessionTerminee || !visiteNettoyee) return;
    visiteNettoyee = false;
    finVisite.hidden = true;
    majEcoutees();
    preparerInterface();
    toutEnregistrer(null);
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
    $("ecouteFill").style.width = (ecoutees.size / stations.length * 100) + "%";
    $("nombreStations").textContent = stations.length;
    $("texteCommencer").textContent = ecoutees.size === stations.length
      ? "Réécouter la visite" : ecoutees.size > 0 ? "Continuer la visite" : "Commencer la visite";
    if (visiteNettoyee) $("texteCommencer").textContent = "Commencer une nouvelle visite";
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
    lecteur.inert = false;
    lecteurMessage.hidden = true;
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
    if (sessionTerminee || nettoyageEnCours) return;
    if (visiteNettoyee) demarrerNouvelleVisite();
    if (i === indexCourant) {
      audio.paused ? lancerLecture() : audio.pause();
      return;
    }
    charger(i);
    lancerLecture();
  }

  function erreurLecture() {
    lecteurMessage.textContent = "Audio indisponible. Vérifiez votre connexion et réessayez.";
    lecteurMessage.hidden = false;
  }

  function lancerLecture() {
    if (sessionTerminee) return;
    lecteurMessage.hidden = true;
    audio.play().catch(erreur => {
      if (erreur.name !== "AbortError" && indexCourant >= 0) erreurLecture();
    });
  }

  audio.addEventListener("error", () => { if (indexCourant >= 0) erreurLecture(); });

  btnCommencer.addEventListener("click", () => {
    if (visiteNettoyee) demarrerNouvelleVisite();
    const prochain = stations.findIndex(s => !ecoutees.has(s.numero));
    basculer(prochain < 0 ? 0 : prochain);
  });

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
    if (s && audio.ended && !visiteNettoyee && !nettoyageEnCours) {
      ecoutees.add(s.numero); sauverEcoutees(); majEcoutees();
      if (visiteTerminee()) {
        afficherFinVisite();
        verifierFinVisite();
      }
    }
    majEtatStations();
  });

  btnPlay.addEventListener("click", () => {
    if (indexCourant < 0) return basculer(0);
    audio.paused ? lancerLecture() : audio.pause();
  });

  btnRecul.addEventListener("click",  () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  btnAvance.addEventListener("click", () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });

  btnFermer.addEventListener("click", () => {
    audio.pause();
    indexCourant = -1;
    lecteur.classList.remove("est-visible");
    lecteur.inert = true;
    document.body.classList.remove("lecteur-actif");
    majEtatStations();
    conteneur.querySelector(".station")?.focus({ preventScroll: true });
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

  // État visuel uniquement : lecture des copies existantes, aucune écriture.
  let controlePreparation = 0;
  let rappelPreparation = null;
  const ressourcesInterface = [
    "./", "./index.html", "./style.css", "./script.js", "./manifest.json",
    "./icone-192.png", "./icone-512.png", "./icone-180.png", "./icone-maskable.png"
  ]; // Même liste que APP_FILES du service worker actuel.

  async function afficherPreparationVerifiee() {
    const controle = ++controlePreparation;
    clearTimeout(rappelPreparation);
    $("visitePrete").hidden = true;
    if (sessionTerminee || visiteNettoyee || nettoyageEnCours || visiteTerminee()) return;
    let prete = stations.length > 0 && fichiersDisponibles === stations.length && !miseEnCacheEnCours;
    if (prete) {
      try {
        const ressources = [
          ...stations.map(s => [s.audio, CACHE_NAME]),
          ...ressourcesInterface.map(url => [url, "immerhof-interface-v9"])
        ];
        for (const [chemin, cacheName] of ressources) {
          const rep = await caches.match(urlAbsolue(chemin), { cacheName });
          if (!rep || !rep.ok) { prete = false; break; }
          const blob = await rep.blob();
          const longueur = rep.headers.get("content-length");
          if (!blob.size || (longueur !== null && !rep.headers.get("content-encoding") && Number(longueur) !== blob.size)) {
            prete = false; break;
          }
        }
      } catch { prete = false; }
    }
    if (controle !== controlePreparation || sessionTerminee || visiteNettoyee || nettoyageEnCours || visiteTerminee()) return;
    $("visitePrete").hidden = !prete;
    if (prete) {
      pastille.dataset.etat = "pret";
      pastilleTexte.textContent = "Prête";
      pastille.title = "Votre visite est prête";
      pastille.setAttribute("aria-label", "Votre visite est prête");
    } else if (fichiersDisponibles === stations.length && stations.length > 0) {
      pastille.dataset.etat = "encours";
      pastilleTexte.textContent = "Vérification…";
      pastille.title = "Préparation de votre visite. Touchez pour réessayer.";
      pastille.setAttribute("aria-label", pastille.title);
      rappelPreparation = setTimeout(afficherPreparationVerifiee, 1500);
    }
  }

  function majPastille(etat, texte) {
    pastille.dataset.etat = etat;
    pastilleTexte.textContent = etat === "pret" ? "Vérification…" : (texte === "En ligne" ? "Préparation…" : texte);
    const titres = {
      pret:    "Vérification de votre visite…",
      encours: "Préparation de votre visite en cours.",
      erreur:  "Préparation incomplète. Touchez pour réessayer.",
      vide:    "Préparation de votre visite. Touchez pour réessayer."
    };
    pastille.title = titres[etat] || "";
    pastille.setAttribute("aria-label", titres[etat] || "État de votre visite");
    afficherPreparationVerifiee();
    horsligneCarte.dataset.etat = etat;
    const titresCarte = {
      pret: "Les audios sont prêts hors ligne",
      encours: "Enregistrement des audios…",
      erreur: "Téléchargement à compléter",
      vide: "Préparer l’écoute hors ligne"
    };
    horsligneTitre.textContent = titresCarte[etat];
    const detailsCarte = {
      pret: `${stations.length} audios enregistrés sur cet appareil. Vous pouvez les écouter sans réseau.`,
      encours: `${fichiersDisponibles} / ${stations.length} audios enregistrés. Gardez votre connexion pendant le téléchargement.`,
      erreur: `${fichiersDisponibles} / ${stations.length} audios enregistrés. Touchez la flèche pour réessayer avec une connexion.`,
      vide: "Les audios s’enregistrent automatiquement avec une connexion Internet."
    };
    horsligneDetail.textContent = detailsCarte[etat];
    btnTelecharger.disabled = etat === "encours";
    btnTelecharger.setAttribute("aria-label", etat === "pret" ? "Vérifier les audios enregistrés" : "Enregistrer les audios pour l’écoute hors ligne");
    btnTelecharger.innerHTML = etat === "pret"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16m-6-6 6 6 6-6"/></svg>';
  }

  function majFil(dispo) {
    const pct = Math.round((dispo / stations.length) * 100);
    barreProgres.style.width = pct + "%";
    ligneProgres.classList.toggle("est-terminee", dispo === stations.length);
  }

  function majAvancement(dispo) {
    fichiersDisponibles = dispo;
    $("cacheFill").style.width = (dispo / stations.length * 100) + "%";
    majFil(dispo);
    if (dispo === stations.length) majPastille("pret", "Hors ligne");
    else if (miseEnCacheEnCours)   majPastille("encours", `${dispo}/${stations.length}`);
    else if (dispo > 0)            majPastille("vide", `${dispo}/${stations.length}`);
    else                           majPastille("vide", "En ligne");
  }

  async function chargerDepuisCache() {
    if (visiteNettoyee || nettoyageEnCours) return 0;
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

    const rep = await fetch(url, { cache: "no-store", signal: controleurTelechargement?.signal });
    if (!rep.ok) throw new Error("réponse " + rep.status);

    const blob = await rep.blob();
    if (!blob.size) throw new Error("fichier vide");
    if (visiteTerminee() || visiteNettoyee || nettoyageEnCours ||
        stations.every(s => lireEcoutees().includes(s.numero))) throw new Error("Visite terminée");

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
    if (!("caches" in window) || miseEnCacheEnCours || visiteTerminee() || visiteNettoyee || nettoyageEnCours) return;

    miseEnCacheEnCours = true;
    let signalerFin;
    finTelechargement = new Promise(resolve => { signalerFin = resolve; });
    controleurTelechargement = new AbortController();
    majPastille("encours", `${fichiersDisponibles}/${stations.length}`);

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
        if (visiteTerminee() || visiteNettoyee || nettoyageEnCours) break;
        try { await enregistrer(s.audio, cache); }
        catch { /* station réessayable via la pastille */ }
        majAvancement(await compterCache(cache));
      }

      miseEnCacheEnCours = false;
      if (visiteTerminee() || visiteNettoyee || nettoyageEnCours) return;
      const dispo = await chargerDepuisCache();

      if (dispo < stations.length) {
        majPastille("erreur", "Réessayer");
      }
    } catch {
      miseEnCacheEnCours = false;
      if (!visiteTerminee() && !visiteNettoyee && !nettoyageEnCours) majPastille("erreur", "Réessayer");
    } finally {
      miseEnCacheEnCours = false;
      controleurTelechargement = null;
      signalerFin();
      if (visiteTerminee() && !visiteNettoyee) verifierFinVisite();
    }
  }

  // La pastille sert aussi de commande manuelle : relancer, ou re-vérifier.
  function demanderEnregistrement() {
    if (sessionTerminee || nettoyageEnCours) return;
    if (visiteNettoyee) { demarrerNouvelleVisite(); return; }
    if (visiteTerminee()) { verifierFinVisite(); return; }
    if (miseEnCacheEnCours) return;
    if (!("caches" in window)) {
      majPastille("erreur", "Non disponible");
      horsligneDetail.textContent = "L’écoute hors ligne n’est pas disponible dans ce navigateur. Ouvrez le site en HTTPS dans un navigateur compatible.";
      return;
    }
    toutEnregistrer(indexCourant >= 0 ? stations[indexCourant] : null);
  }
  pastille.addEventListener("click", demanderEnregistrement);
  btnTelecharger.addEventListener("click", demanderEnregistrement);

  /* ----------------------------------------------------------- Démarrage */

  construireListe();

  if ("serviceWorker" in navigator) {
    enregistrementSW = navigator.serviceWorker.register("./service-worker.js").catch(() => null);
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (visiteTerminee()) verifierFinVisite();
      else if (!visiteNettoyee) preparerInterface();
    });
    navigator.serviceWorker.addEventListener("message", event => {
      if (event.data?.protocole !== PROTOCOLE_VISITE) return;
      if (event.data.type === "VISITE_NETTOYEE") terminerNettoyageLocal();
      else if (event.data.type === "SUSPENDRE_TELECHARGEMENTS") {
        // Une autre fenêtre a pu enregistrer la dernière écoute.
        lireEcoutees().forEach(n => ecoutees.add(n));
        if (!visiteTerminee()) { event.ports?.[0]?.postMessage({ ok: false }); return; }
        nettoyageEnCours = true;
        controleurTelechargement?.abort();
        finTelechargement.then(() => event.ports?.[0]?.postMessage({ ok: true }));
      } else if (event.data.type === "NETTOYAGE_REPORTE" && !visiteNettoyee) {
        nettoyageEnCours = false;
        afficherFinVisite();
      }
    });
  }

  const dejaLa = await chargerDepuisCache();
  majEtatStations();
  if (visiteTerminee()) { afficherFinVisite(); verifierFinVisite(); }
  else preparerInterface();

  /* La visite s'enregistre dès l'ouverture de la page, dans l'ordre des
     stations : au guichet, pendant qu'on retire les manteaux, sous l'auvent.
     C'est la seule fenêtre de réseau garantie les jours de pluie, où le groupe
     descend sans s'arrêter dehors. Aucun geste n'est nécessaire — seul le
     plein écran en demande un.                                              */
  if (!visiteTerminee() && !visiteNettoyee && dejaLa < stations.length && navigator.onLine !== false) {
    setTimeout(() => toutEnregistrer(null), 300);
  }

  // Réseau retrouvé (remontée, Wi-Fi du guichet) : on reprend là où on en était.
  window.addEventListener("online", () => {
    if (visiteNettoyee) return;
    afficherAttenteFinale(); // Affichage synchrone, avant toute vérification réseau.
    if (visiteTerminee()) { verifierFinVisite(); return; }
    if (miseEnCacheEnCours) return;
    preparerInterface();
    toutEnregistrer(indexCourant >= 0 ? stations[indexCourant] : null);
  });

  // iOS peut suspendre la page : vérifier aussi à sa réouverture et au focus.
  const auRetour = () => {
    if (visiteTerminee() && !visiteNettoyee) verifierFinVisite();
  };
  window.addEventListener("pageshow", auRetour);
  window.addEventListener("focus", auRetour);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (minuterieVerification !== null) clearTimeout(minuterieVerification);
      minuterieVerification = null;
    } else auRetour();
  });
  // Plusieurs onglets de la même visite partagent la progression.
  window.addEventListener("storage", event => {
    if (event.key !== CLE_ECOUTES || visiteNettoyee) return;
    if (event.newValue === null && visiteTerminee()) { terminerNettoyageLocal(); return; }
    ecoutees.clear();
    lireEcoutees().forEach(n => ecoutees.add(n));
    majEcoutees();
    if (visiteTerminee()) { afficherFinVisite(); verifierFinVisite(); }
  });

  window.addEventListener("beforeunload", () => {
    urlsLocales.forEach(url => URL.revokeObjectURL(url));
  });
});
