# Décisions

Choix faits pendant la construction, quand la consigne ne tranchait pas. Format : décision, puis raison.

## Dépôt

- **Dossier local recréé.** Le dossier contenait une ébauche d'une session précédente, sans commit. Sur demande explicite, il a été vidé puis le dépôt neuf a été cloné dedans.
- **Identité git : adresse noreply GitHub** (`158041944+TommyWeemox@users.noreply.github.com`). Le dépôt est public : on n'expose pas d'adresse e-mail personnelle dans l'historique.
- **Licence.** MIT pour le code. Contenu pédagogique original sous CC BY-SA 4.0, mentionné dans LICENSE : la consigne disait « contenu pédagogique original » sans préciser de licence, une licence ouverte avec attribution est le choix le plus simple pour un dépôt public.

## Sources

- **Source de vérité : le guide d'étude SC-500** ([lien](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/sc-500)), version Microsoft du 2026-04-26, page mise à jour le 2026-07-31, récupérée le 2026-10-04. Le texte des 87 sous-objectifs est recopié tel quel, en anglais, dans `content/sc-500/objectives.json`.
- **Vocabulaire : « objectif » = groupe de 2e niveau du guide** (ex. « Secure access to resources by using Microsoft Entra ID »), soit 12 objectifs. Les puces sous chaque groupe sont des « sous-objectifs » (87 au total). Les quotas de volume (1 leçon, 10 questions, 8 flashcards) s'appliquent aux 12 objectifs. Chaque question et flashcard est en plus rattachée à un ou plusieurs sous-objectifs, et le script de validation vérifie que les 87 sous-objectifs sont tous couverts par au moins une question.
- **Les 12 objectifs correspondent un à un aux 12 parcours du cours officiel SC-500T00-A.** Chaque objectif pointe vers son parcours Microsoft Learn.
- **URL canoniques.** Quand une page Learn redirige, on stocke l'URL finale (ex. `azure/ai-foundry/...` est devenu `azure/foundry/...`).
- **Practice Assessment officiel :** indisponible au 2026-10-04 d'après la page de la certification.
- **Page introuvable :** `azure/web-application-firewall/afd/afd-overview` renvoie 404. Remplacée par `azure/web-application-firewall/afds/afds-overview`.
- **Fichier `content/sc-500/objectives.json` plutôt que `content/objectives.json`.** La consigne demande à la fois `content/objectives.json` et un schéma réutilisable pour d'autres certifications (SC-300, SC-100). Un dossier par certification sous `content/` répond aux deux.

## Stack technique

- **Vite + TypeScript, sans framework.** Le site est une poignée de vues (leçon, quiz, flashcards, examen, tableau de bord) sur des données statiques. Un framework (React, Astro...) ajouterait des dépendances et des montées de version sans bénéfice ici. Vite donne le serveur de dev, le bundling et le découpage du code ; TypeScript sécurise la logique (SM-2, correction, plan).
- **Dépendances d'exécution : deux.** `minisearch` (recherche plein texte côté client, ~7 Ko gzip) et `mermaid` (schémas, chargé à la demande uniquement sur les pages qui en contiennent). `marked` et `yaml` ne servent qu'au build.
- **Markdown rendu au build, pas dans le navigateur.** `scripts/lib/build.mjs` compile `content/` en JSON dans `public/data/` (HTML déjà rendu, encadrés, ancres, index de recherche). Le navigateur charge chaque leçon à la demande.
- **Routage par hash** (`#/cours/1.1`) : fonctionne sur GitHub Pages sans configuration de réécriture d'URL, et avec `base: './'` le même build marche en local et sous `/sc500-prep/`.
- **Tests : Vitest + jsdom** sur la logique pure (SM-2, correction, sessions, pondérations, plan, maîtrise, stockage, export et import, rendu Markdown).

## Schéma de contenu (réutilisable pour SC-300, SC-100...)

- Un dossier par certification : `content/<cert>/` avec `objectives.json`, `path.json` (profil et ordre recommandé), `lessons/*.md`, `questions/*.json`, `flashcards/*.json`, `labs/*.md`, `exams/*.json`, `case-studies/*.md`, `sheets/*.md`. Ajouter une certification = ajouter un dossier ; le site affiche alors un sélecteur dans Paramètres.
- **Encadrés** en syntaxe d'alerte Markdown : `> [!PIEGE]`, `> [!EXAMEN]`, `> [!TERRAIN]` (« Dans la vraie vie »), `> [!INFO]`, `> [!ATTENTION]`.
- **Ancres de sous-objectifs** : chaque leçon a une section `{#s-1-1-1}` par sous-objectif, pour que questions et pages pointent au bon endroit.
- **« À vérifier »** : écrire littéralement `(à vérifier)` dans le texte. Le site le surligne et `npm run to-verify` régénère TO_VERIFY.md.
- **Questions d'ordre** : les étapes sont écrites dans le bon ordre dans le JSON ; le site les mélange à l'affichage (jamais dans l'ordre correct).
- **Examen blanc** : questions dédiées, absentes des quiz (le validateur le vérifie), pour mesurer sans effet de mémorisation. Un mode « examen généré » tire aussi dans la banque d'entraînement selon les pondérations.

## Pédagogie et algorithmes

- **SM-2** pour flashcards et questions ratées. Boutons : À revoir (q=1), Difficile (q=3), Bien (q=4), Facile (q=5, avec un bonus d'intervalle x1.3). Une carte « À revoir » revient en fin de session.
- **Journal d'erreurs** : toute réponse fausse y entre et planifie une révision ; deux bonnes réponses d'affilée la marquent résolue. Correction en tout ou rien, comme à l'examen.
- **Nouvelles flashcards : 20 par jour par défaut** (réglable), pour éviter l'avalanche de révisions.
- **Maîtrise estimée** = 65 % réponses récentes (20 dernières, décroissance 0,85), 20 % rétention des flashcards, 15 % leçon lue ; tirée vers le bas sous 5 réponses. Le diagnostic sert de donnée de départ tant qu'il n'y a pas d'autres réponses.
- **Plan** : 25 % du temps hebdomadaire réservé aux révisions et quiz mélangés à partir de la 2e semaine ; les dernières semaines (15 %, au moins une) servent à l'examen blanc, l'étude de cas et les points faibles. Le diagnostic ajuste les heures (+30 % sous 50 %, -30 % à partir de 80 %) et remonte les objectifs faibles d'une ou deux places.
- **Score d'examen blanc sur 1000** : simple proportion de bonnes réponses, affichée comme indicative. Le barème réel de Microsoft n'est pas public.
