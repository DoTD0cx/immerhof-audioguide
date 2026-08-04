document.addEventListener("DOMContentLoaded", async () => {
  const CACHE_NAME = "immerhof-audios-v5";

  const stations = [
    { numero: "01", titre: "Entrée", audio: "./Audio/01-entree.mp3" },
    { numero: "02", titre: "Chambre de tir", audio: "./Audio/02-chambre-tir.mp3" },
    { numero: "03", titre: "Radio TSF", audio: "./Audio/03-radio-tsf.mp3" },
    { numero: "04", titre: "Équipe Z", audio: "./Audio/04-equipe-z.mp3" },
    { numero: "05", titre: "Magasin", audio: "./Audio/05-magasin.mp3" },
    { numero: "06", titre: "Bloc de défense interne", audio: "./Audio/06-defense-interne.mp3" },
    { numero: "07", titre: "Usine", audio: "./Audio/07-usine.mp3" }
  ];

  const stationsContainer = document.getElementById("stations");
  const downloadButton = document.getElementById("downloadButton");
  const offlineStatus = document.getElementById("offlineStatus");
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");

  const localAudioUrls = new Map();
  const audioFiles = stations.map(station => station.audio);

  function createStations() {
    stationsContainer.innerHTML = stations.map(station => `
      <article class="station-card">
        <div class="station-header">
          <div class="station-number">${station.numero}</div>
          <div class="station-title-group">
            <p class="station-label">Station ${station.numero}</p>
            <h2>${station.titre}</h2>
            <p>À lancer lorsque le guide indique cette station.</p>
          </div>
        </div>

        <audio controls preload="metadata" data-audio="${station.audio}">
          <source src="${station.audio}" type="audio/mpeg">
          Votre navigateur ne prend pas en charge l’audio.
        </audio>
      </article>
    `).join("");
  }

  createStations();

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (error) {
      console.error("Erreur du service worker :", error);
    }
  }

  const normalizeUrl = path =>
    new URL(path, window.location.href).href;

  function updateProgress(current) {
    const total = audioFiles.length;
    const percentage = Math.round((current / total) * 100);

    progressFill.style.width = `${percentage}%`;
    offlineStatus.textContent =
      `${current} audio${current > 1 ? "s" : ""} sur ${total} disponible${current > 1 ? "s" : ""} hors connexion`;
  }

  async function loadLocalAudios() {
    const cache = await caches.open(CACHE_NAME);
    let availableCount = 0;

    for (const path of audioFiles) {
      const audioUrl = normalizeUrl(path);
      const cachedResponse = await cache.match(audioUrl);

      if (!cachedResponse) continue;

      const blob = await cachedResponse.blob();
      if (!blob.size) continue;

      const previousUrl = localAudioUrls.get(audioUrl);
      if (previousUrl) URL.revokeObjectURL(previousUrl);

      const localUrl = URL.createObjectURL(blob);
      localAudioUrls.set(audioUrl, localUrl);

      const player = document.querySelector(
        `audio[data-audio="${path}"]`
      );

      if (player) {
        const source = player.querySelector("source");

        if (source) source.src = localUrl;
        else player.src = localUrl;

        player.load();
      }

      availableCount++;
    }

    updateProgress(availableCount);

    if (availableCount === audioFiles.length) {
      offlineStatus.textContent =
        `✓ Les ${audioFiles.length} audios sont disponibles hors connexion.`;
      progressText.textContent =
        "La visite est prête. Vous pouvez passer en mode avion.";
      downloadButton.textContent =
        "Retélécharger les audios";
    }

    return availableCount;
  }

  async function downloadAudio(path, cache) {
    const audioUrl = normalizeUrl(path);

    const response = await fetch(audioUrl, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `${path.split("/").pop()} : erreur HTTP ${response.status}`
      );
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error(
        `${path.split("/").pop()} : fichier vide`
      );
    }

    await cache.put(
      audioUrl,
      new Response(blob, {
        status: 200,
        headers: {
          "Content-Type":
            response.headers.get("content-type") || "audio/mpeg",
          "Content-Length": String(blob.size)
        }
      })
    );

    const verification = await cache.match(audioUrl);

    if (!verification) {
      throw new Error(
        `${path.split("/").pop()} : vérification impossible`
      );
    }

    const verificationBlob = await verification.blob();

    if (verificationBlob.size !== blob.size) {
      throw new Error(
        `${path.split("/").pop()} : téléchargement incomplet`
      );
    }
  }

  async function downloadAllAudios() {
    downloadButton.disabled = true;
    downloadButton.textContent = "Téléchargement en cours…";
    offlineStatus.textContent = "Préparation de la visite…";
    progressText.textContent = "Gardez cette page ouverte.";

    try {
      const cache = await caches.open(CACHE_NAME);

      for (const path of audioFiles) {
        await cache.delete(normalizeUrl(path));
      }

      for (let index = 0; index < audioFiles.length; index++) {
        const path = audioFiles[index];

        progressText.textContent =
          `Téléchargement de ${path.split("/").pop()}…`;

        await downloadAudio(path, cache);
        updateProgress(index + 1);
      }

      await loadLocalAudios();

      offlineStatus.textContent =
        `✓ Les ${audioFiles.length} audios sont disponibles hors connexion.`;
      progressText.textContent =
        "La visite est prête. Vous pouvez passer en mode avion.";
      downloadButton.textContent =
        "Retélécharger les audios";
    } catch (error) {
      console.error(error);

      offlineStatus.textContent = `Erreur : ${error.message}`;
      progressText.textContent =
        "Vérifiez la connexion puis réessayez.";
      downloadButton.textContent = "Réessayer";
    }

    downloadButton.disabled = false;
  }

  downloadButton.addEventListener(
    "click",
    downloadAllAudios
  );

  await loadLocalAudios();

  window.addEventListener("beforeunload", () => {
    localAudioUrls.forEach(url => {
      URL.revokeObjectURL(url);
    });
  });
});
