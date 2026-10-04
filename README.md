# sc500-prep

Site de préparation à la certification Microsoft **SC-500** (Microsoft Certified: Cloud and AI Security Engineer Associate), basé sur Microsoft Learn.

**Site en ligne : https://tommyweemox.github.io/sc500-prep/**

Site statique en français, sans backend : la progression reste dans le navigateur (export et import JSON). Tout le contenu est original, rédigé à partir de la documentation Microsoft Learn citée page par page avec sa date de vérification. Aucune question d'examen réelle, aucun braindump.

## Ce que contient le site

| Élément | Volume |
| --- | --- |
| Leçons (une par objectif du guide d'étude, 12 objectifs, 87 sous-objectifs) | 12 |
| Questions d'entraînement (majorité de scénarios, explication par option) | 133 |
| Examen blanc chronométré (120 min, pondéré par domaine) | 50 questions |
| Flashcards (répétition espacée SM-2) | 122 |
| Labs (dont un lab fil rouge PIM juste-à-temps) | 9 |
| Fiches de synthèse imprimables | 4 (une par domaine) |
| Étude de cas transverse avec corrigé argumenté | 1 |

Fonctionnalités : parcours guidé et plan hebdomadaire jusqu'à la date d'examen saisie, test diagnostic par domaine, pré-questions et rappel actif dans chaque leçon, exercice Feynman, quiz par objectif, domaine, mélange ou « mes erreurs », examen blanc avec score par domaine, examen généré depuis la banque, flashcards avec marquage « difficile », journal d'erreurs automatique, tableau de bord (maîtrise estimée par objectif, points faibles, révisions du jour), recherche plein texte (touche `/`), thème sombre, navigation au clavier, impression des fiches.

Couverture par domaine :

| Domaine | Poids officiel | Leçons | Questions | Flashcards | Labs |
| --- | --- | --- | --- | --- | --- |
| D1 Identité, accès, gouvernance | 20-25 % | 3 | 33 | 34 | 2 + fil rouge |
| D2 Stockage, bases de données, réseau | 25-30 % | 3 | 31 | 24 | 2 |
| D3 IA, serveurs, plateforme applicative | 20-25 % | 3 | 34 | 30 | 2 |
| D4 Posture et supervision | 20-25 % | 3 | 35 | 34 | 2 |

## Lancer le site en local

Prérequis : Node.js 22 ou plus récent.

```bash
npm ci
npm run dev        # http://localhost:5173, rechargement à chaque modification de content/
```

Autres commandes :

| Commande | Rôle |
| --- | --- |
| `npm run validate` | Vérifie le contenu : champs obligatoires, rattachement de chaque question à un objectif, couverture des 87 sous-objectifs, quotas, sources Learn, absence de secrets et de tirets cadratins |
| `npm run links` | Vérifie que chaque URL citée répond (et signale les redirections) |
| `npm run to-verify` | Régénère [TO_VERIFY.md](TO_VERIFY.md) à partir des mentions « (à vérifier) » |
| `npm test` | Tests unitaires (SM-2, correction des quiz, progression, export et import, plan, rendu) |
| `npm run build` | Validation, typage, build de production dans `dist/` |
| `npm run check` | Tout ce qui précède sauf les liens, comme en CI |
| `npm run preview` | Sert `dist/` localement |

## Ajouter ou corriger du contenu

Le contenu est séparé du code, dans `content/<certification>/` :

```
content/sc-500/
  objectives.json      # domaines, objectifs, sous-objectifs, liens Learn
  path.json            # ordre recommandé, profondeur, heures
  lessons/*.md         # une leçon par objectif (front matter YAML + Markdown)
  questions/*.json     # banque d'entraînement
  flashcards/*.json
  labs/*.md
  exams/*.json         # examens blancs (questions dédiées)
  sheets/*.md          # fiches par domaine
  case-studies/*.md    # énoncé, puis <!-- corrige -->, puis corrigé
```

Règles principales (le validateur les contrôle) :

- chaque affirmation technique renvoie à une page Microsoft Learn listée dans `sources`, avec sa date de vérification ;
- ce qui n'a pas pu être confirmé porte la mention littérale `(à vérifier)` ;
- encadrés : `> [!PIEGE]`, `> [!EXAMEN]`, `> [!TERRAIN]`, `> [!INFO]`, `> [!ATTENTION]` ;
- chaque section de leçon porte l'ancre de son sous-objectif, par exemple `## Titre {#s-1-1-1}` ;
- questions : types `single`, `multiple` (nombre de réponses dans l'énoncé) et `order` (étapes écrites dans le bon ordre) ; une justification `why` par option.

Le schéma est commun à toutes les certifications : pour préparer SC-300 ou SC-100, ajoutez un dossier `content/sc-300/` avec la même structure ; le site propose alors un sélecteur dans Paramètres.

## Déploiement

Le workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) s'exécute à chaque push sur `main` : installation, validation du contenu, typage, tests, build, vérification des liens (informative), puis publication de `dist/` sur GitHub Pages. Les pull requests sont construites et testées sans être publiées.

Pour un fork : Settings > Pages > Source : **GitHub Actions**, puis pousser sur `main`.

## Documents

- [DECISIONS.md](DECISIONS.md) : choix techniques et pédagogiques, pages Learn introuvables.
- [TO_VERIFY.md](TO_VERIFY.md) : affirmations à reconfirmer sur Microsoft Learn.
- [LICENSE](LICENSE) : MIT pour le code, CC BY-SA 4.0 pour le contenu pédagogique.

Projet personnel, non affilié à Microsoft. Les noms de produits appartiennent à leurs propriétaires. L'entreprise « Brisemer Logistique » utilisée dans les scénarios est fictive.
