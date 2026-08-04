document.addEventListener("DOMContentLoaded", async () => {
    const CACHE_NAME = "immerhof-audios-v3";

    const AUDIO_FILES = [
        "./Audio/entree.mp3",
        "./Audio/usine.mp3"
    ];

    const downloadButton = document.getElementById("downloadButton");
    const offlineStatus = document.getElementById("offlineStatus");
    const progressText = document.getElementById("progressText");
    const progressFill = document.getElementById("progressFill");

    const localAudioUrls = new Map();

    // Installation du service worker
    if ("serviceWorker" in navigator) {
        try {
            await navigator.serviceWorker.register("./service-worker.js");
        } catch (error) {
            console.error("Erreur du service worker :", error);
        }
    }

    function setStatus(message) {
        if (offlineStatus) {
            offlineStatus.textContent = message;
        }

        console.log(message);
    }

    function setProgress(current, total) {
        const percentage = Math.round((current / total) * 100);

        if (progressText) {
            progressText.textContent =
                `${current} audio${current > 1 ? "s" : ""} sur ${total}`;
        }

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
    }

    function normalizeUrl(path) {
        return new URL(path, window.location.href).href;
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

        const audioBlob = await response.blob();

        if (audioBlob.size === 0) {
            throw new Error(`${path} : fichier vide`);
        }

        const contentLength = response.headers.get("content-length");

        if (
            contentLength &&
            audioBlob.size !== Number(contentLength)
        ) {
            throw new Error(
                `${path} : téléchargement incomplet`
            );
        }

        const cachedResponse = new Response(audioBlob, {
            status: 200,
            headers: {
                "Content-Type":
                    response.headers.get("content-type") ||
                    "audio/mpeg",
                "Content-Length": String(audioBlob.size),
                "Accept-Ranges": "bytes"
            }
        });

        await cache.put(audioUrl, cachedResponse);

        // Vérification immédiate
        const verification = await cache.match(audioUrl);

        if (!verification) {
            throw new Error(
                `${path} : absent du stockage hors ligne`
            );
        }

        const verificationBlob = await verification.blob();

        if (verificationBlob.size !== audioBlob.size) {
            throw new Error(
                `${path} : vérification incorrecte`
            );
        }

        return audioBlob.size;
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

            if (blob.size === 0) {
                continue;
            }

            const localUrl = URL.createObjectURL(blob);
            localAudioUrls.set(audioUrl, localUrl);

            const players = document.querySelectorAll("audio");

            players.forEach(player => {
                const sourceElement =
                    player.querySelector("source");

                const sourceValue = sourceElement
                    ? sourceElement.getAttribute("src")
                    : player.getAttribute("src");

                if (!sourceValue) {
                    return;
                }

                const playerUrl = normalizeUrl(sourceValue);

                if (playerUrl !== audioUrl) {
                    return;
                }

                if (sourceElement) {
                    sourceElement.src = localUrl;
                } else {
                    player.src = localUrl;
                }

                player.load();
            });

            availableCount++;
        }

        return availableCount;
    }

    async function verifyOfflineAudios() {
        const cache = await caches.open(CACHE_NAME);

        for (const path of AUDIO_FILES) {
            const audioUrl = normalizeUrl(path);
            const response = await cache.match(audioUrl);

            if (!response) {
                return false;
            }

            const blob = await response.blob();

            if (blob.size === 0) {
                return false;
            }
        }

        return true;
    }

    async function downloadAllAudios() {
        if (!("caches" in window)) {
            setStatus(
                "Le stockage hors connexion n’est pas disponible."
            );
            return;
        }

        downloadButton.disabled = true;
        downloadButton.textContent = "Téléchargement en cours…";

        setStatus("Ne quittez pas cette page.");
        setProgress(0, AUDIO_FILES.length);

        try {
            const cache = await caches.open(CACHE_NAME);

            // On supprime l’ancienne version pour éviter
            // de conserver un MP3 incomplet.
            await Promise.all(
                AUDIO_FILES.map(path =>
                    cache.delete(normalizeUrl(path))
                )
            );

            for (
                let index = 0;
                index < AUDIO_FILES.length;
                index++
            ) {
                const path = AUDIO_FILES[index];

                setStatus(
                    `Téléchargement de ${path.split("/").pop()}…`
                );

                const size = await downloadAudio(path, cache);
                const sizeMb = (size / 1024 / 1024).toFixed(1);

                console.log(
                    `${path} téléchargé : ${sizeMb} Mo`
                );

                setProgress(index + 1, AUDIO_FILES.length);
            }

            const complete = await verifyOfflineAudios();

            if (!complete) {
                throw new Error(
                    "La vérification finale a échoué."
                );
            }

            await loadLocalAudios();

            setStatus(
                `✓ ${AUDIO_FILES.length} audios sur ` +
                `${AUDIO_FILES.length} disponibles hors connexion.`
            );

            downloadButton.textContent = "Visite téléchargée";
        } catch (error) {
            console.error(error);

            setStatus(`Erreur : ${error.message}`);

            downloadButton.disabled = false;
            downloadButton.textContent = "Réessayer";
        }
    }

    if (downloadButton) {
        downloadButton.addEventListener(
            "click",
            downloadAllAudios
        );
    }

    // À chaque ouverture, on utilise directement
    // les fichiers déjà stockés.
    try {
        const availableCount = await loadLocalAudios();

        if (availableCount === AUDIO_FILES.length) {
            setStatus(
                `✓ ${availableCount} audios disponibles hors connexion.`
            );

            if (downloadButton) {
                downloadButton.textContent =
                    "Retélécharger les audios";
            }
        } else {
            setStatus(
                `${availableCount} audio sur ` +
                `${AUDIO_FILES.length} disponible hors connexion.`
            );
        }
    } catch (error) {
        console.error(
            "Impossible de charger les audios locaux :",
            error
        );
    }

    window.addEventListener("beforeunload", () => {
        localAudioUrls.forEach(url => {
            URL.revokeObjectURL(url);
        });
    });
});