const downloadButton = document.getElementById("downloadButton");
const downloadProgress = document.getElementById("downloadProgress");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const offlineStatus = document.getElementById("offlineStatus");

const AUDIO_CACHE_NAME = "immerhof-audios-v1";

const offlineFiles = [
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

if ("serviceWorker" in navigator) {
   navigator.serviceWorker.register('service-worker.js')
   .then(function(){
    console.log("Visité Téléchargée")
   })
}

downloadButton.addEventListener("click", async () => {
    downloadButton.disabled = true;
    downloadButton.textContent = "Téléchargement en cours…";

    downloadProgress.classList.remove("hidden");
    offlineStatus.classList.remove("ready");

    try {
        const cache = await caches.open(AUDIO_CACHE_NAME);

        for (let index = 0; index < offlineFiles.length; index++) {
            const file = offlineFiles[index];

            progressText.textContent =
                `Téléchargement ${index + 1} sur ${offlineFiles.length}`;

            const percentage =
                Math.round(((index + 1) / offlineFiles.length) * 100);

            progressFill.style.width = `${percentage}%`;

            const response = await fetch(file, {
                cache: "reload"
            });

            if (!response.ok) {
                throw new Error(
                    `Erreur pendant le téléchargement de ${file}`
                );
            }

            await cache.put(file, response);
        }

        localStorage.setItem("immerhofOfflineReady", "true");

        downloadButton.textContent = "Visite téléchargée";
        offlineStatus.textContent =
            "✓ Les contenus sont disponibles hors connexion.";

        offlineStatus.classList.add("ready");
    } catch (error) {
        console.error(error);

        downloadButton.disabled = false;
        downloadButton.textContent = "Réessayer le téléchargement";

        offlineStatus.textContent =
            "Le téléchargement a échoué. Vérifiez votre connexion.";
    }
});

function updateOfflineStatus() {
    const isReady =
        localStorage.getItem("immerhofOfflineReady") === "true";

    if (isReady) {
        downloadButton.textContent = "Mettre à jour la visite";

        offlineStatus.textContent =
            "✓ Une version hors connexion est déjà disponible.";

        offlineStatus.classList.add("ready");
    }
}

updateOfflineStatus();