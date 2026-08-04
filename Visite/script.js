const AUDIO_CACHE = "immerhof-audio-v1";

const audios = [
    "Audio/entree.mp3",
    "Audio/usine.mp3"
];

const bouton = document.getElementById("downloadButton");
const statut = document.getElementById("offlineStatus");

bouton.addEventListener("click", async () => {

    bouton.disabled = true;
    statut.textContent = "Téléchargement des audios...";

    const cache = await caches.open(AUDIO_CACHE);

    for (const audio of audios) {

        const response = await fetch(audio);

        if (!response.ok) {
            statut.textContent = "Erreur : " + audio;
            bouton.disabled = false;
            return;
        }

        await cache.put(audio, response.clone());
    }

    statut.textContent = "✓ Tous les audios sont téléchargés.";
});