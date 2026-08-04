document.addEventListener("DOMContentLoaded", async () => {
  const CACHE_NAME = "immerhof-audios-v4";

  const AUDIO_FILES = [
    "./Audio/entree.mp3",
    "./Audio/usine.mp3"
  ];

  const downloadButton = document.getElementById("downloadButton");
  const offlineStatus = document.getElementById("offlineStatus");
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");

  const localAudioUrls = new Map();

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (error) {
      console.error("Erreur du service worker :", error);
    }
  }

  const normalizeUrl = path =>
    new URL(path, window.location.href).href;

  function setProgress(current, total) {
    const percentage = Math.round((current / total) * 100);

    progressFill.style.width = `${percentage}%`;
    offlineStatus.textContent =
      `${current} audio${current > 1 ? "s" : ""} sur ${total} disponible${current > 1 ? "s" : ""} hors connexion`;
  }

  async function loadLocalAudios() {
    const cache = await caches.open(CACHE_NAME);
    let availableCount = 0;

    for (const path of AUDIO_FILES) {
      const audioUrl = normalizeUrl(path);
      const cachedResponse = await cache.match(audioUrl);

      if (!cachedResponse) {
        continue;
      }

      const blob = await cachedResponse.blob();

      if (!blob.size) {
        continue;
      }

      const localUrl = URL.createObjectURL(blob);
      localAudioUrls.set(audioUrl, localUrl);

      const player = document.querySelector(
        `audio[data-audio="${path}"]`
      );

      if (player) {
        const source = player.querySelector("source");

        if (source) {
          source.src = localUrl;
        } else {
          player.src = localUrl;
        }

        player.load();
      }

      availableCount++;
    }

    setProgress(availableCount, AUDIO_FILES.length);

    if (availableCount === AUDIO_FILES.length) {
      offlineStatus.textContent =
        "✓ Les deux audios sont disponibles hors connexion.";
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
        `${path} : erreur HTTP ${response.status}`
      );
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error(`${path} : fichier vide`);
    }

    await cache.put(
      audioUrl,
      new Response(blob, {
        status: 200,
        headers: {
          "Content-Type":
            response.headers.get("content-type") ||
            "audio/mpeg",
          "Content-Length": String(blob.size)
        }
      })
    );

    const verification = await cache.match(audioUrl);

    if (!verification) {
      throw new Error(
        `${path} : vérification impossible`
      );
    }

    const verificationBlob = await verification.blob();

    if (verificationBlob.size !== blob.size) {
      throw new Error(
        `${path} : téléchargement incomplet`
      );
    }
  }

  async function downloadAllAudios() {
    downloadButton.disabled = true;
    downloadButton.textContent =
      "Téléchargement en cours…";
    offlineStatus.textContent =
      "Préparation de la visite…";
    progressText.textContent =
      "Gardez cette page ouverte.";

    try {
      const cache = await caches.open(CACHE_NAME);

      for (const path of AUDIO_FILES) {
        await cache.delete(normalizeUrl(path));
      }

      for (
        let index = 0;
        index < AUDIO_FILES.length;
        index++
      ) {
        const path = AUDIO_FILES[index];

        progressText.textContent =
          `Téléchargement de ${path.split("/").pop()}…`;

        await downloadAudio(path, cache);
        setProgress(index + 1, AUDIO_FILES.length);
      }

      await loadLocalAudios();

      offlineStatus.textContent =
        "✓ Les deux audios sont disponibles hors connexion.";
      progressText.textContent =
        "La visite est prête. Vous pouvez passer en mode avion.";
      downloadButton.textContent =
        "Retélécharger les audios";
    } catch (error) {
      console.error(error);

      offlineStatus.textContent =
        `Erreur : ${error.message}`;
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
