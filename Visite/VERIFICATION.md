# Audioguide Immerhof — nettoyage automatique après visite

La fonctionnalité est ajoutée à la refonte existante. Aucune publication n’a été faite sur l’hébergement.

## Fichiers concernés

| Fichier | Changement |
| --- | --- |
| script.js | Fin sur `ended` avec `audio.ended`, état de visite, vérification réseau, arrêt des téléchargements, remise à zéro après réponse du worker. |
| service-worker.js | Interface v9, sonde exclusivement réseau, suspension des écritures, suppression ciblée des caches, coordination entre fenêtres. |
| index.html | Ajout du panneau « Visite terminée », invisible pendant une visite incomplète. |
| style.css | Ajout des styles du seul panneau de fin ; toutes les règles précédentes restent identiques. |
| connectivite.json | Nouvelle ressource de vérification du site. Ne doit jamais être servie depuis CacheStorage. |

Le manifeste, les quatre icônes, les 12 stations, leurs titres, durées initiales et chemins MP3 sont inchangés. Le lecteur, les sauts, le curseur, le suivi, le plein écran, l’installation et les métadonnées Media Session restent dans le code.

## Règle appliquée

Chaque station prévue doit être présente dans la progression des écoutes terminées. Le lancement, une pause et une erreur audio ne marquent aucune station. La progression utilise la clé existante `immerhof-ecoutees`, sans nouveau stockage IndexedDB.

L’état de fin est déduit de cette progression à chaque ouverture. Hors connexion, le panneau « Visite terminée » est affiché et les caches restent disponibles. On peut réécouter les stations tant que le nettoyage n’a pas commencé.

La vérification réseau demande `connectivite.json` sur le même site, avec un paramètre unique, `cache: no-store`, refus des redirections, contrôle du type MIME et des valeurs attendues. Un accès à un Wi-Fi local, `navigator.onLine=true`, une page de connexion ou une erreur serveur ne suffisent pas. Le worker refait une vérification réseau directe avant suppression.

Les contrôles reprennent sur `online`, au focus, sur `pageshow`, au retour de visibilité et toutes les 20 secondes lorsque la visite terminée est visible. Si la PWA est fermée ou suspendue, aucune exécution immédiate n’est garantie ; le contrôle reprend à sa réouverture.

## Données supprimées

- Caches CacheStorage dont les noms correspondent exactement aux familles `immerhof-audios-vN` et `immerhof-interface-vN`, versions précédentes comprises : audios, interface, icônes et éventuelles polices mises en cache par ce worker.
- La clé de progression `immerhof-ecoutees`.
- Les URL blob et références audio en mémoire, ainsi que les métadonnées de lecture.

Le programme ne vide jamais l’ensemble de localStorage, ne supprime aucune base IndexedDB étrangère, et ne touche pas au cache HTTP naturel du navigateur ni à l’historique. Cette architecture ne possède pas de base IndexedDB de visite à supprimer. L’enregistrement du service worker est conservé pour les prochaines visites ; ses lectures ne recréent aucun cache après nettoyage et ses écritures attendent la préparation d’une nouvelle visite.

Les téléchargements de toutes les fenêtres du même audioguide sont suspendus avant la suppression. Le worker attend aussi les écritures d’interface déjà engagées. Un worker ancien ou une fenêtre qui ne confirme pas sa suspension bloque le nettoyage. Si une suppression échoue, la progression n’est pas supprimée et une tentative ultérieure reprend le nettoyage. Les caches audio sont supprimés avant ceux de l’interface.

Après nettoyage, le compteur revient à 0, le panneau confirme la libération et les téléchargements automatiques restent arrêtés dans la page courante. Une nouvelle ouverture ou un appui explicite pour commencer une nouvelle visite réactive la préparation et le téléchargement.

## Vérification effectuée

Les deux scripts de production ont été exécutés dans des contextes VM distincts, reliés par un protocole de messages simulé. Le DOM, l’audio, le réseau, CacheStorage et les événements du cycle de vie sont simulés. Le scénario demandé et ses cas de sécurité passent dans ce cadre.

| No | Scénario | Résultat |
| --- | --- | --- |
| 1 | Téléchargement automatique des 12 audios et de l’interface | Réussi |
| 2 | Lancement et faux ended sans audio.ended ne marquent aucune écoute | Réussi |
| 3 | Mode avion, lecture locale, fermeture/réouverture et progression conservée | Réussi |
| 4 | Régression : lecture/pause, sauts, curseur et fermeture du lecteur conservés | Réussi |
| 5 | Hors ligne : priorité au script actuel même si une ancienne interface reste en cache | Réussi |
| 6 | 11/12 même avec Internet : aucun nettoyage | Réussi |
| 7 | 12/12 hors ligne : fin affichée, données conservées après réouverture malgré onLine=true | Réussi |
| 8 | Portail captif, mauvaise réponse JSON, HTTP 503 et redirection : pas de nettoyage | Réussi |
| 9 | Retour Internet vérifié : caches de visite et progression supprimés, autres données intactes | Réussi |
| 10 | Sonde jamais servie ni stockée dans le cache, requête réseau unique et no-store | Réussi |
| 11 | Aucun retéléchargement après nettoyage, même après réveil du worker | Réussi |
| 12 | Nouvelle visite explicite : téléchargement et lecteur à nouveau disponibles | Réussi |
| 13 | Internet revient sans événement online : vérification périodique et nettoyage | Réussi |
| 14 | Page suspendue : aucune suppression en arrière-plan, reprise à visibilitychange | Réussi |
| 15 | Échec de suppression : preuve d’écoute conservée, nouvelle tentative réussie | Réussi |
| 16 | Nettoyage des versions précédentes de caches appartenant à Immerhof | Réussi |
| 17 | Deux fenêtres : progression partagée, téléchargement suspendu, nettoyage unique et pas de redownload | Réussi |
| 18 | PWA fermée avant retour réseau : nettoyage automatique à la prochaine ouverture | Réussi |
| 19 | Ancien worker sans protocole : pas de suppression sans acknowledgement | Réussi |
| 20 | Écriture interface en vol : nettoyage attend cache.put et aucun cache ne réapparaît | Réussi |
| 21 | Téléchargement audio en vol : annulé avant nettoyage, aucun remplissage tardif | Réussi |
| 22 | Sonde réseau bloquée : délai de 8 secondes, aucune suppression | Réussi |
| 23 | Garde du worker : demande 11/12 refusée avant toute suppression | Réussi |
| 24 | Réseau perdu après la sonde de la page : la vérification du worker bloque la suppression | Réussi |

La syntaxe JavaScript/JSON, les identifiants HTML et les ressources locales ont également été contrôlés. Le tableau des stations a été comparé à la version actuelle, le manifeste est identique, et les styles existants sont conservés.

**Limites :** aucun essai physique sur iPhone/Safari/PWA ou Android/Chrome ; aucun rendu dans un navigateur réel. Les vrais MP3 ne sont pas joints. Une simulation valide la logique, mais ne confirme pas le comportement des appareils ou de l’hébergement.

## Installation et essai réel

1. Sur l’hébergement actuel, remplacer `index.html`, `style.css`, `script.js` et `service-worker.js`. Ajouter `connectivite.json` dans le même dossier. Conserver le dossier `Audio`, le manifeste et les icônes actuels.
2. Vérifier depuis l’adresse HTTPS que `connectivite.json` renvoie le JSON attendu avec le type `application/json`. Sinon, le nettoyage reste volontairement bloqué.
3. Ouvrir l’audioguide avec une connexion et attendre le téléchargement complet. S’assurer que la nouvelle version du worker est active en rouvrant la page si nécessaire. Ne pas vider manuellement la progression d’une visite en cours.
4. Passer en mode avion, lire plusieurs audios jusqu’à leur fin, fermer complètement la PWA puis la rouvrir. Vérifier les écoutes conservées et la lecture locale.
5. Terminer seulement 11 stations : aucun panneau de fin et aucune suppression, même si le réseau est réactivé.
6. Repasser hors ligne, terminer la douzième station : le panneau de fin apparaît, les audios restent disponibles.
7. Réactiver Internet et garder l’audioguide visible. Attendre le contrôle réseau et la confirmation de suppression, avec un compteur revenu à 0. En cas de fermeture préalable, rouvrir l’audioguide avec Internet.
8. Pour une vérification technique, contrôler l’absence des caches `immerhof-audios-*` / `immerhof-interface-*` et de la clé `immerhof-ecoutees` dans les outils du navigateur.
9. Commencer une nouvelle visite : les audios et l’interface doivent pouvoir être téléchargés de nouveau.

## Références de conception

- [MDN — navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine) : cet indicateur ne prouve pas un accès Internet utilisable.
- [MDN — événement ended](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/ended_event) : événement de fin de lecture utilisé pour la progression.
- [WebKit — activité des pages et suspension sur iOS](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/) : les pages et minuteries peuvent être suspendues ou ralenties en arrière-plan.
