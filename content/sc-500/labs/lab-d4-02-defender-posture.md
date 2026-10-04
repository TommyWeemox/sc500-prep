---
id: lab-d4-02-defender-posture
title: Mesurer et piloter la posture avec Defender for Cloud
domain: d4
objectives: ["4.1"]
skills: ["4.1.1", "4.1.2", "4.1.3", "4.1.5"]
duration: 1 h 30
cost: Defender CSPM et Defender for Servers facturés par ressource et par heure ; quelques euros si vous les désactivez le jour même avec une ou deux ressources
level: Intermédiaire
summary: Secure score par Resource Graph, activation de Defender CSPM, ajout d'un standard de conformité, cloud security explorer, règle de gouvernance, export continu vers Log Analytics et contrôle de l'analyse de vulnérabilités MDVM.
sources:
  - title: What is Cloud Security Posture Management (CSPM)
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/concept-cloud-security-posture-management
  - title: Security explorer and attack paths in Defender for Cloud
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/concept-attack-path
  - title: Improve regulatory compliance in Defender for Cloud
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/regulatory-compliance-dashboard
  - title: Enable vulnerability scanning with Microsoft Defender Vulnerability Management
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/deploy-vulnerability-assessment-defender-vulnerability-management
---

> [!ATTENTION] Abonnement personnel ou tenant de test uniquement. Les plans Defender s'activent pour **tout l'abonnement** : ne faites pas ce lab dans un abonnement partagé.

## Objectif et compétence visée

Passer d'une posture « liste de recommandations » à une posture pilotée : score mesuré, standard de conformité suivi, risques interrogés dans le graphe, responsables et échéances, historique exporté. Compétences 4.1.1, 4.1.2, 4.1.3 et 4.1.5.

## Prérequis et coût estimé

- Abonnement Azure personnel, rôle **Owner** ; Azure CLI.
- Idéalement une petite VM (par exemple celle du lab D3-01, avant son nettoyage) et un compte de stockage pour avoir des recommandations.
- Un workspace Log Analytics (celui du lab D4-01 convient).
- **Coût** : Defender CSPM et Defender for Servers sont facturés par ressource et par heure ; avec deux ressources pendant une heure ou deux, quelques euros au plus. Vérifiez la grille actuelle et désactivez les plans à la fin.

## Étapes

1. **État initial** : plans actifs et secure score.

   ```azurecli
   az security pricing list --query "value[].{plan:name, tier:pricingTier}" -o table
   az graph query -q "securityresources | where type == 'microsoft.security/securescores' | project subscriptionId, current=properties.score.current, max=properties.score.max"
   ```

   L'extension `resource-graph` de la CLI peut être requise (`az extension add -n resource-graph`).

2. **Activer Defender CSPM** (et Defender for Servers P2 si vous avez une VM) :

   ```azurecli
   az security pricing create -n CloudPosture --tier Standard
   az security pricing create -n VirtualMachines --tier Standard --subplan P2
   ```

   Les noms de plans et le paramètre `--subplan` sont à vérifier selon la version de la CLI ; sinon, portail : **Environment settings > abonnement > Defender plans**.

3. **Ajouter un standard** : **Defender for Cloud > Regulatory compliance > Manage compliance standards** (ou **Environment settings > abonnement > Security policies**), ajoutez **ISO 27001** (ou un autre). Notez que cette option n'était pas disponible avant l'activation d'un plan payant.

4. **Cloud security explorer** : construisez la requête « **Virtual machines** » + « **is exposed to the internet** » (ou « has vulnerabilities »). Puis consultez **Attack path analysis** (souvent vide dans un petit lab : c'est normal, il faut un vrai chemin vers une ressource critique).

5. **Règle de gouvernance** : **Environment settings > abonnement > Governance rules > Create** : périmètre = l'abonnement, conditions = sévérité **High**, propriétaire = votre compte, **échéance** 14 jours, notifications hebdomadaires.

6. **Export continu** de la conformité et des recommandations vers Log Analytics : **Environment settings > abonnement > Continuous export > Log Analytics workspace** : cochez *Security recommendations* et *Regulatory compliance* (flux continu et instantanés hebdomadaires), cible = votre workspace.

7. **Vulnérabilités MDVM** : **Environment settings > abonnement > Defender for Servers > Settings & monitoring** : vérifiez que **Vulnerability assessment for machines** est activé (MDVM) et que l'**analyse sans agent** est **On**.

## Vérification

- `az security pricing show -n CloudPosture --query pricingTier` renvoie `Standard`.
- Le standard ajouté apparaît dans **Regulatory compliance**, avec des contrôles réussis et en échec (les évaluations peuvent prendre jusqu'à environ 12 heures).
- La règle de gouvernance attribue un propriétaire et une échéance aux recommandations High (colonne **Owner** dans la liste des recommandations).
- Après quelques heures, le workspace contient des tables `SecurityRecommendation` et `SecurityRegulatoryCompliance` (noms à vérifier dans votre workspace) :

  ```kusto
  SecurityRegulatoryCompliance
  | summarize arg_max(TimeGenerated, *) by ComplianceStandard, ComplianceControl
  | summarize Echecs = countif(State == "Failed") by ComplianceStandard
  ```

- Sur la VM, la recommandation sur les vulnérabilités des machines affiche des résultats (après la première analyse).

## Défi : casse puis répare

1. **Casse** : attribuez à un compte de test uniquement **Security Reader** sur l'abonnement et connectez-vous avec lui.
   **Diagnostique** : que voit-il dans Recommendations ? Dans Regulatory compliance ? Pourquoi la différence ?
   **Répare** : attribuez-lui **Reader** sur l'abonnement et vérifiez.
2. **Variante sans aide** : votre responsable veut « un chiffre unique de progression » et « la liste des 3 risques à traiter en premier ». Quel outil pour chacun, et avec quel plan ?
3. **Variante sans aide** : expliquez pourquoi la VM sans capteur MDE a quand même des vulnérabilités listées, et ce qui changerait avec Defender for Servers Plan 1 seul.

## Nettoyage

1. Désactivez les plans : `az security pricing create -n CloudPosture --tier Free` et `az security pricing create -n VirtualMachines --tier Free`.
2. Supprimez la règle de gouvernance, l'export continu et le standard ajouté.
3. Supprimez l'attribution de rôle du compte de test.
4. Vérifiez le lendemain dans Cost Management qu'aucun plan Defender ne reste facturé.
