# Points à vérifier

Fichier généré par `npm run to-verify`. Ne pas éditer à la main.

Chaque ligne correspond à une affirmation que Microsoft Learn ne permettait pas de confirmer au moment de la rédaction (page absente, ambiguë, ou fonctionnalité en préversion qui évolue). Le site les affiche surlignées. Pour en traiter une : vérifier sur Microsoft Learn, corriger le texte, retirer la mention, relancer le script.

33 point(s) en attente.

| Fichier | Ligne | Contexte |
| --- | --- | --- |
| `content/sc-500/labs/lab-00-pim-jit.md` | 43 | …soft Entra ID Governance** : un essai gratuit peut être activé depuis le centre d'administration (durée et disponibilité de l'essai à vérifier au moment du lab (à vérifier) |
| `content/sc-500/labs/lab-d1-01-key-vault.md` | 152 | …es appels `Forbidden` de l'étape 3. Selon la configuration, les journaux peuvent arriver dans une table spécifique à la ressource plutôt que `AzureDiagnostics` (à vérifier) |
| `content/sc-500/labs/lab-d2-01-storage.md` | 92 | …La révocation peut prendre jusqu'à environ 30 secondes (à vérifier) |
| `content/sc-500/labs/lab-d2-01-storage.md` | 115 | …est antivirus standard, inoffensive) depuis une machine autorisée. Microsoft documente un test de ce type pour valider l'analyse, selon la procédure en vigueur (à vérifier) |
| `content/sc-500/labs/lab-d2-02-network-sql.md` | 8 | …cost: 1 à 2 € environ (deux petites VM quelques heures, Azure SQL niveau Basic), selon la région (à vérifier) |
| `content/sc-500/labs/lab-d2-02-network-sql.md` | 33 | …L Database niveau Basic, Log Analytics (quelques Mo). Azure Virtual Network Manager peut être facturé selon le nombre d'abonnements gérés selon la page de prix (à vérifier) |
| `content/sc-500/labs/lab-d2-02-network-sql.md` | 80 | …ègle d'admin est évaluée **avant**. Selon la version de l'outil, le résultat peut désigner la security admin rule ou nécessiter NSG diagnostics pour l'afficher (à vérifier) |
| `content/sc-500/labs/lab-d3-01-servers.md` | 94 | …Le paramètre `--subplan` dépend de la version de la CLI (à vérifier) |
| `content/sc-500/labs/lab-d3-01-servers.md` | 108 | …le portail Policy, la définition intégrée « Audit Linux machines that allow remote connections from accounts without passwords » (nom exact selon votre tenant) (à vérifier) |
| `content/sc-500/labs/lab-d3-02-app-platform.md` | 106 | …La CLI attribue le rôle AcrPull à l'identité système selon la version de l'extension (à vérifier) |
| `content/sc-500/labs/lab-d4-01-sentinel.md` | 99 | …- **Data connectors** : Azure Activity en état **Connected** ; `AzureActivity \| take 10` renvoie des lignes (comptez jusqu'à 15 minutes) (à vérifier) |
| `content/sc-500/labs/lab-d4-02-defender-posture.md` | 53 | …Les noms de plans et le paramètre `--subplan` dépendent de la version de la CLI (à vérifier) |
| `content/sc-500/labs/lab-d4-02-defender-posture.md` | 70 | …- Après quelques heures, le workspace contient des tables `SecurityRecommendation` et `SecurityRegulatoryCompliance` (noms exacts selon votre workspace) (à vérifier) |
| `content/sc-500/lessons/1.1-entra-access.md` | 293 | …tégrée ci-dessus sont ceux publiés par Microsoft ; vérifiez-les dans votre tenant avec `Get-MgDirectoryRoleTemplate` et l'API `authenticationStrength/policies` (à vérifier) |
| `content/sc-500/lessons/1.2-key-vault.md` | 132 | …\| Désactivable ? \| Non, une fois activé \| Non, une fois activée (à vérifier) |
| `content/sc-500/lessons/2.1-storage.md` | 151 | …La syntaxe exacte des extensions dans Azure CLI évolue : vérifiez la référence `az security pricing` avant usage (à vérifier) |
| `content/sc-500/lessons/2.1-storage.md` | 168 | …torage (y compris Data Lake) ; la page SAS mise à jour en 2026 l'étend à Queue, Table et Azure Files, alors que la page d'autorisation indique encore l'inverse (à vérifier) |
| `content/sc-500/lessons/2.2-databases.md` | 140 | …Noms des paramètres CLI à confirmer avec `az sql server audit-policy update --help` (à vérifier) |
| `content/sc-500/lessons/2.3-network.md` | 154 | …*. Avec Entra ID, on bénéficie de l'**accès conditionnel** et de la MFA sur la connexion VPN (client Azure VPN, protocole OpenVPN ; liste exacte des protocoles (à vérifier) |
| `content/sc-500/lessons/3.1-ai-security.md` | 159 | …Les colonnes exactes de `BehaviorInfo` pour les événements d'agents sont à confirmer dans le schéma (à vérifier) |
| `content/sc-500/lessons/3.1-ai-security.md` | 274 | …# Nom du plan dans l'API pricing (à vérifier) |
| `content/sc-500/lessons/3.2-servers-vms.md` | 142 | …\| Déploiement **private-only** (sans IP publique) \| Non \| Non \| Non \| Oui (à vérifier) |
| `content/sc-500/lessons/3.2-servers-vms.md` | 144 | …essource ; IP publique **Standard**, **statique** (sauf Developer et private-only). Le client natif et la connexion par IP nécessitent au moins le SKU Standard (à vérifier) |
| `content/sc-500/lessons/3.2-servers-vms.md` | 197 | …e réseau Azure, mises à jour OS, écarts de configuration OS (MCSB), fonctionnalités **premium MDVM**, **500 Mo d'ingestion gratuite** (par machine et par jour) (à vérifier) |
| `content/sc-500/lessons/3.3-app-platform.md` | 124 | …\| **Authentification / autorisation** \| Intégration **Microsoft Entra ID** ; **Azure RBAC pour Kubernetes** ou Kubernetes RBAC ; désactiver les comptes locaux (à vérifier) |
| `content/sc-500/lessons/3.3-app-platform.md` | 153 | …Autres contrôles : **private endpoint** et désactivation de l'accès public (SKU Premium pour Private Link) (à vérifier) |
| `content/sc-500/lessons/3.3-app-platform.md` | 254 | …sur l'en-tête **X-Azure-FDID** avec l'ID de **votre** profil, ou utilisez Front Door Premium avec Private Link, selon la documentation des restrictions d'accès (à vérifier) |
| `content/sc-500/lessons/3.3-app-platform.md` | 272 | …Les versions de rule set disponibles et la syntaxe exacte des sous-commandes `az network front-door waf-policy` évoluent : vérifiez avec `--help` avant usage (à vérifier) |
| `content/sc-500/lessons/4.1-defender-posture.md` | 125 | …# Activer Defender CSPM sur l'abonnement (nom technique du plan : CloudPosture) (à vérifier) |
| `content/sc-500/lessons/4.2-sentinel.md` | 131 | …# Activer Sentinel (onboarding state), extension sentinel de la CLI, selon la version (à vérifier) |
| `content/sc-500/lessons/4.2-sentinel.md` | 382 | …tivity**, et les tables de Defender XDR peuvent être interrogées avec celles de Sentinel dans l'advanced hunting du portail Defender, selon votre configuration (à vérifier) |
| `content/sc-500/lessons/4.3-security-copilot.md` | 103 | …// Capacité Security Copilot (type et propriétés selon la référence ARM) (à vérifier) |
| `content/sc-500/lessons/4.3-security-copilot.md` | 166 | …# Plugin personnalisé KQL (structure de manifeste selon la documentation des plugins) (à vérifier) |
