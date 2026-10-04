# Décisions

Choix faits pendant la construction, quand la consigne ne tranchait pas. Format : décision, puis raison.

## Dépôt

- **Dossier local recréé.** Le dossier contenait une ébauche d'une session précédente, sans commit. Sur demande explicite, il a été vidé puis le dépôt neuf a été cloné dedans.
- **Identité git : adresse noreply GitHub** (`158041944+TommyWeemox@users.noreply.github.com`). Le dépôt est public : on n'expose pas d'adresse e-mail personnelle dans l'historique.
- **Licence.** MIT pour le code. Contenu pédagogique original sous CC BY-SA 4.0, mentionné dans LICENSE : la consigne disait « contenu pédagogique original » sans préciser de licence, une licence ouverte avec attribution est le choix le plus simple pour un dépôt public.

## Sources

- **Source de vérité : le guide d'étude SC-500** ([lien](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/sc-500)), version Microsoft du 2026-04-26, page mise à jour le 2026-07-31, récupérée le 2026-10-04. Le texte des 73 sous-objectifs est recopié tel quel, en anglais, dans `content/sc-500/objectives.json`.
- **Vocabulaire : « objectif » = groupe de 2e niveau du guide** (ex. « Secure access to resources by using Microsoft Entra ID »), soit 12 objectifs. Les puces sous chaque groupe sont des « sous-objectifs » (73 au total). Les quotas de volume (1 leçon, 10 questions, 8 flashcards) s'appliquent aux 12 objectifs. Chaque question et flashcard est en plus rattachée à un ou plusieurs sous-objectifs, et le script de validation vérifie que les 73 sous-objectifs sont tous couverts par au moins une question.
- **Les 12 objectifs correspondent un à un aux 12 parcours du cours officiel SC-500T00-A.** Chaque objectif pointe vers son parcours Microsoft Learn.
- **URL canoniques.** Quand une page Learn redirige, on stocke l'URL finale (ex. `azure/ai-foundry/...` est devenu `azure/foundry/...`).
- **Practice Assessment officiel :** indisponible au 2026-10-04 d'après la page de la certification.
- **Page introuvable :** `azure/web-application-firewall/afd/afd-overview` renvoie 404. Remplacée par `azure/web-application-firewall/afds/afds-overview`.
- **Fichier `content/sc-500/objectives.json` plutôt que `content/objectives.json`.** La consigne demande à la fois `content/objectives.json` et un schéma réutilisable pour d'autres certifications (SC-300, SC-100). Un dossier par certification sous `content/` répond aux deux.
