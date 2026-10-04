---
id: brisemer-plateforme
title: "Brisemer Logistique : sécuriser la plateforme de suivi et son assistant IA"
summary: Étude de cas transverse sur les quatre domaines. Une entreprise fictive de logistique ouvre une API de suivi, un assistant IA pour ses clients et un SOC. À vous de concevoir et de justifier les contrôles.
objectives: ["1.1", "1.2", "1.3", "2.1", "2.2", "2.3", "3.1", "3.2", "3.3", "4.1", "4.2", "4.3"]
sources:
  - title: Plan a Privileged Identity Management deployment
    url: https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-deployment-plan
  - title: Azure Key Vault RBAC guide
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide
  - title: Azure Storage firewall rules and network access
    url: https://learn.microsoft.com/en-us/azure/storage/common/storage-network-security
  - title: What is a private endpoint?
    url: https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview
  - title: Guardrails and controls overview - Foundry
    url: https://learn.microsoft.com/en-us/azure/foundry/guardrails/guardrails-overview
  - title: Understand just-in-time VM access
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/just-in-time-access-overview
  - title: Protect an API backend with Microsoft Entra ID - API Management
    url: https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-protect-backend-with-aad
  - title: Security explorer and attack paths in Defender for Cloud
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/concept-attack-path
  - title: Ingest syslog and CEF messages to Microsoft Sentinel with AMA
    url: https://learn.microsoft.com/en-us/azure/sentinel/connect-cef-syslog-ama
  - title: Understand authentication in Microsoft Security Copilot
    url: https://learn.microsoft.com/en-us/copilot/security/authentication
---

> [!INFO] Brisemer Logistique est une entreprise **fictive**. Tous les noms, chiffres et situations sont inventés pour l'exercice.

## Contexte

Brisemer Logistique (1 200 salariés, 3 entrepôts en France, siège à Nantes) transporte des marchandises pour des clients professionnels. Le système d'information est hybride :

- **On-premises** : Active Directory synchronisé avec Microsoft Entra ID, un SQL Server pour la paie, des pare-feu FortiGate en périphérie, 40 serveurs Windows et Linux.
- **Azure** : architecture hub-and-spoke dans **France Central**, ExpressRoute vers le siège, Azure Firewall Standard dans le hub. Un spoke « Suivi » héberge :
  - une **API de suivi des colis** sur App Service, publiée via API Management ;
  - une base **Azure SQL Database** des expéditions ;
  - un **compte de stockage** de bordereaux PDF déposés par 15 transporteurs partenaires via des SAS de compte envoyées par e-mail ;
  - trois VM d'intégration avec des IP publiques et RDP ouvert « temporairement depuis 2024 ».
- **Projet IA** : un assistant conversationnel pour les clients, construit avec **Foundry Agent Service**, qui interroge l'API de suivi (outil) et une base documentaire (conditions générales, tarifs) indexée depuis le compte de stockage. Lancement prévu dans 3 mois.
- **Microsoft 365 E5** pour tous les salariés ; Microsoft 365 Copilot en pilote auprès de 50 personnes.
- **AWS** : une filiale acquise l'an dernier exploite 4 comptes AWS dans une organisation, avec des instances EC2 et des buckets S3.

## Constats de l'audit

1. 14 comptes ont le rôle **Global Administrator** de façon permanente ; 9 personnes sont **Owner** de l'abonnement de production.
2. La chaîne de connexion SQL et la clé du compte de stockage sont dans les **paramètres d'application** de l'App Service. Le coffre Key Vault existant utilise des **access policies** ; 6 personnes ont Contributor dessus.
3. Les SAS de compte des partenaires sont valides **2 ans** ; un transporteur a quitté Brisemer il y a 6 mois.
4. L'API de suivi accepte HTTP et n'exige qu'une **clé d'abonnement APIM**.
5. Aucun journal centralisé : pas de SIEM, les FortiGate journalisent localement.
6. Defender for Cloud est en **Foundational CSPM** uniquement ; personne ne regarde les recommandations.
7. Lors d'un test, l'assistant IA a révélé le contenu d'une **grille tarifaire réservée** à un grand compte quand un client a demandé « les tarifs les plus bas que vous accordez ».
8. Dans le pilote Microsoft 365 Copilot, un commercial a obtenu un résumé d'un document RH sur les salaires stocké dans un site SharePoint partagé avec « Everyone except external users ».

## Contraintes

- Budget sécurité **limité** : chaque plan payant doit être justifié.
- Pas d'interruption de l'API de suivi en journée (6 h à 22 h).
- Le RSSI veut un modèle **sans accès privilégié permanent**, aligné sur le projet « accès juste-à-temps » déjà lancé avec PIM.
- Les journaux de sécurité doivent être conservés **3 ans** (exigence contractuelle de grands clients), avec 90 jours d'analyse rapide.
- L'équipe SOC (4 analystes, 1 ingénieur) veut utiliser **Security Copilot** dès que possible.

## Travail demandé

Pour chaque question, proposez une solution **argumentée** : services et paramètres précis, ordre de mise en œuvre, et ce que vous **n'avez pas** retenu et pourquoi. Visez 5 à 10 lignes par question.

1. **Accès privilégiés** (constat 1, fil rouge) : quel modèle cible pour les rôles Entra et Azure ? Comment éviter le verrouillage du tenant ?
2. **Secrets et coffre** (constat 2) : comment supprimer les secrets de l'App Service et sécuriser le coffre ?
3. **Partenaires et stockage** (constat 3) : comment remplacer les SAS de compte, révoquer le transporteur parti, et bloquer les PDF malveillants ?
4. **Réseau et VM** (constat 4 et VM d'intégration) : comment fermer l'exposition sans casser l'exploitation ?
5. **API de suivi** (constat 4) : quels contrôles devant et sur l'API ?
6. **Assistant IA** (constat 7) : quelles causes possibles et quels contrôles avant le lancement ?
7. **Microsoft 365 Copilot** (constat 8) : comment traiter la surexposition sans bloquer le pilote ?
8. **Posture** (constat 6 et filiale AWS) : quels plans activer en priorité, avec quelle justification budgétaire ?
9. **SOC** (constat 5 et contraintes) : architecture Sentinel, collecte, rétention, automatisation.
10. **Security Copilot** : déploiement minimal, accès et garde-fous.

<!-- corrige -->

## Corrigé argumenté

Ce corrigé propose **une** solution défendable. D'autres choix sont acceptables s'ils sont justifiés avec les mêmes critères : moindre privilège, absence de secret, défense en profondeur, coût.

### 1. Accès privilégiés

- **Rôles Entra** : passer les 14 Global Administrators en **éligibles** dans PIM ; viser 2 à 4 personnes éligibles à Global Administrator, les autres sur des rôles moins privilégiés (Security Administrator, User Administrator...). Paramètres : activation **1 à 4 heures**, **MFA** ou contexte d'authentification exigeant une **méthode résistante au phishing**, justification, **approbation** pour Global Administrator et Privileged Role Administrator, avec **approbateurs désignés** (au moins deux).
- **Rôles Azure** : Owner de production éligible pour 2 personnes ; les autres reçoivent Contributor ou des rôles spécifiques, éligibles, sur des portées réduites (groupes de ressources).
- **Anti-verrouillage** : deux **comptes d'urgence** actifs permanents, exclus des politiques d'accès conditionnel bloquantes, surveillés par une alerte Sentinel à chaque connexion.
- **Licences** : Entra ID P2 inclus dans E5 pour les utilisateurs éligibles, approbateurs et réviseurs.
- **Revue d'accès** trimestrielle sur les rôles privilégiés.
- Non retenu : rendre éligible l'identité managée du pipeline (elle ne peut pas activer) : on réduit plutôt sa portée.

### 2. Secrets et coffre

- **Identité managée** de l'App Service et authentification **Entra** vers Azure SQL (utilisateur créé dans la base) et vers le stockage (rôle de données). Les secrets restants passent en **références Key Vault**.
- Coffre : bascule vers le **modèle RBAC** après avoir préparé les attributions équivalentes (la bascule invalide les access policies). L'App Service reçoit **Key Vault Secrets User**, l'exploitation **Key Vault Contributor** (gestion sans lecture des secrets). Les 6 Contributors actuels pouvaient s'ajouter une access policy : risque supprimé.
- **Purge protection** activée ; **pare-feu** du coffre ou **private endpoint**.
- **Defender for Key Vault** si le budget le permet.

### 3. Partenaires et stockage

- **Révocation immédiate** : régénérer la clé ayant signé les SAS de compte (révoque toutes les SAS) en coordonnant une nouvelle distribution.
- **Cible** : un conteneur par partenaire et des **user delegation SAS** courtes, ou des SAS de service liées à une **stored access policy** par partenaire (révocation individuelle). Mieux encore à terme : **interdire la clé partagée** (après inventaire via les journaux), ce qui rend l'audit et l'accès conditionnel possibles.
- **Defender for Storage** avec **malware scanning on-upload** sur ce compte, **plafond mensuel**, et une réponse automatisée (Event Grid) qui déplace les fichiers en quarantaine.
- Pare-feu de stockage : accès public restreint ; private endpoint pour l'App Service et l'indexation IA.

### 4. Réseau et VM

- Supprimer les IP publiques des 3 VM ; déployer **Azure Bastion** dans le hub (AzureBastionSubnet /26), **JIT VM access** (Defender for Servers **P2**) sur RDP, et l'éligibilité PIM du rôle nécessaire : PIM pour avoir le droit, JIT pour ouvrir le port, Bastion pour ne pas l'exposer.
- Attention : JIT ne s'applique pas derrière un Azure Firewall géré par **Firewall Manager** ; ici les règles du hub sont classiques ou les VM sont filtrées par NSG.
- **Encryption at host** et **Trusted Launch** pour les nouvelles VM.
- Une **security admin rule Deny** (AVNM) sur RDP/SSH depuis Internet pour tous les spokes : aucune équipe ne pourra rouvrir.

### 5. API de suivi

- App Service : **HTTPS only**, **TLS 1.2** minimum, FTP et authentification basique désactivés, **restrictions d'accès** n'autorisant que l'APIM (ou private endpoint).
- APIM : **validate-jwt** (ou validate-azure-ad-token) avec audience, émetteur et **rôle applicatif** des clients ; la clé d'abonnement reste un complément, pas une authentification. Vers le backend : **authentication-managed-identity**.
- Devant APIM : **Front Door Premium** avec WAF (Default Rule Set, Bot Manager), d'abord en **Detection**, puis **Prevention** après traitement des faux positifs.
- Mise en œuvre hors des heures d'activité, avec bascule progressive.

### 6. Assistant IA

- **Causes probables** : la grille réservée est indexée avec le reste et l'outil de recherche n'applique pas les droits de l'utilisateur ; aucun contrôle de sortie.
- **Données** : sortir les documents réservés de l'index public, ou filtrer par droits d'accès ; étiquettes de sensibilité.
- **Guardrails** Foundry sur l'agent : contrôles sur **user input**, **tool response** (attaques indirectes depuis les documents) et **output**. Le guardrail de l'agent **remplace** celui du modèle : il doit couvrir tous les points voulus.
- **AI Gateway** (APIM v2) : limites de jetons par projet, journalisation.
- **Defender for AI Services** sur l'abonnement : détection de jailbreak et de fuite de données, corrélée dans Defender XDR (essai de 30 jours pour mesurer avant d'acheter).
- **Identité de l'agent** gouvernée : sponsor, permissions minimales, accès conditionnel sur l'identité d'agent.

### 7. Microsoft 365 Copilot

- **Immédiat** : **Restricted Content Discovery** sur les sites RH et sensibles (Copilot ne les fait plus remonter), en sachant que les permissions ne changent pas.
- **Correction** : rapports **Data access governance** (EEEU, permissions), **Restricted access control** sur les sites RH, **Site access review** par les propriétaires.
- **DSPM for AI** (Purview, Audit activé) : évaluation de surexposition et **DLP** pour l'emplacement Copilot qui exclut les contenus étiquetés « Confidentiel RH ».
- Le pilote continue sur des sites assainis.

### 8. Posture

- **Defender CSPM** en priorité : chemins d'attaque, cloud security explorer, gouvernance (propriétaire et échéance pour chaque recommandation High), analyse sans agent, intégration EASM. Il transforme 600 recommandations en une dizaine de risques à traiter. Justification budgétaire : facturé sur un nombre limité de ressources (VM, stockage, bases).
- **Connecteur AWS** au niveau du **compte de gestion** (comptes membres actuels et futurs), sans secret stocké, avec Defender CSPM ; Defender for Servers sur les EC2 critiques (Arc + SSM).
- **Defender for Servers P2** sur l'abonnement de production (JIT, sans agent, MDVM premium), désactivé sur les VM de test.
- **Conformité** : ajouter ISO 27001 (possible dès qu'un plan payant est actif) pour répondre aux grands clients ; export continu vers Log Analytics.
- Non retenu dans l'immédiat : Defender EASM autonome (l'intégration CSPM couvre le besoin de départ).

### 9. SOC

- **Un workspace** Sentinel en France Central (un seul tenant, pas de contrainte multi-région), embarqué dans le **portail Defender** (le portail Azure ne sera plus pris en charge après le 31 mars 2027).
- **Rôles** : analystes **Responder + Playbook Operator**, ingénieur **Contributor + Logic App Contributor**, sur le groupe de ressources.
- **Collecte** : connecteurs Defender XDR, Entra ID, Azure Activity (Azure Policy), Defender for Cloud ; **FortiGate en CEF** vers un forwarder Linux (serveur **Arc** on-premises) avec AMA, table CommonSecurityLog, facilities séparées pour éviter les doublons ; **Windows Security Events via AMA** (jeu Common ou XPath) pour les serveurs ; solutions du **content hub** (Fortinet, Windows, Entra).
- **Rétention** : 90 jours d'analytique, **3 ans de rétention totale** (long terme ou data lake), pas 3 ans d'analytique (maximum 2 ans et coûteux).
- **Automatisation** : règles d'automatisation (tri, propriétaire, tâches), playbook de désactivation de compte avec identité managée ; droits de Sentinel sur le groupe de ressources des playbooks.
- **Détection fil rouge** : alerte sur toute activation PIM de Global Administrator hors heures ouvrées et sur toute connexion d'un compte d'urgence.

### 10. Security Copilot

- Capacité incluse avec **Microsoft 365 E5** (400 SCU par mois pour 1 000 licences, soit environ 480 pour 1 200) : démarrer sans achat supplémentaire.
- Un **workspace** avec stockage **EU** ; évaluation des prompts dans la région si les contrats l'exigent.
- **Accès** : groupe assignable à des rôles **Copilot contributor** pour les 4 analystes, owners limités (rôles hérités + responsable SOC). Rappel : Copilot interroge Sentinel **on-behalf-of**, les analystes gardent donc leurs rôles Sentinel.
- **Plugins** : préinstallés Microsoft activés ; plugins personnalisés réservés aux owners pour l'organisation.
- **Agents** : agent identity dédiée plutôt qu'un compte utilisateur ; agents partenaires seulement après approbation d'un Global Administrator.
- Routage de Defender XDR vers ce workspace.

### Ordre de mise en œuvre proposé

| Semaine | Actions |
| --- | --- |
| 1 | Comptes d'urgence, révocation des SAS (régénération de clé), fermeture RDP Internet (security admin rule) |
| 2-3 | PIM (Entra puis Azure), Bastion + JIT, identité managée de l'App Service, coffre en RBAC |
| 4-6 | Sentinel (collecte, rétention, automatisation), Defender CSPM, connecteur AWS |
| 7-10 | API (APIM validate-jwt, WAF en Detection puis Prevention), Defender for Storage |
| 10-12 | Assistant IA : index assaini, guardrails, AI Gateway, Defender for AI Services ; Copilot M365 : DAG, RAC, DSPM for AI ; Security Copilot |
