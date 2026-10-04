---
id: lab-d1-02-governance
title: Gouvernance par le code - Policy, verrous et rôle personnalisé
domain: d1
objectives: ["1.3"]
skills: ["1.3.1", "1.3.2", "1.3.4", "1.3.5", "1.3.6", "1.3.9"]
duration: 1 h 30
cost: Gratuit (Azure Policy, verrous, rôles), un compte de stockage de test supprimé dans la foulée
level: Intermédiaire
summary: Définition Azure Policy personnalisée en deny, initiative, exemption, remédiation deployIfNotExists, verrou CanNotDelete, rôle personnalisé et lecture du tableau de conformité.
sources:
  - title: Overview of Azure Policy
    url: https://learn.microsoft.com/en-us/azure/governance/policy/overview
  - title: Azure Policy definitions effect basics
    url: https://learn.microsoft.com/en-us/azure/governance/policy/concepts/effect-basics
  - title: Lock your Azure resources to protect your infrastructure
    url: https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/lock-resources
  - title: Azure custom roles
    url: https://learn.microsoft.com/en-us/azure/role-based-access-control/custom-roles
  - title: Improve regulatory compliance in Microsoft Defender for Cloud
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/regulatory-compliance-dashboard
---

> [!ATTENTION] Abonnement personnel ou tenant de test uniquement. Une affectation Azure Policy en deny posée sur le mauvais abonnement peut bloquer des déploiements de production.

## Objectif et compétence visée

Appliquer la gouvernance « as code » sur un groupe de ressources de lab : refuser une mauvaise configuration, mesurer, exempter proprement, corriger l'existant, protéger contre la suppression et créer un rôle sur mesure. Compétences 1.3.1, 1.3.2, 1.3.4 à 1.3.6 et 1.3.9.

## Prérequis et coût estimé

- Abonnement Azure personnel, rôle Owner.
- Azure CLI ou Cloud Shell.
- **Coût** : nul pour Policy, verrous et rôles. Un compte de stockage Standard créé quelques minutes : négligeable.

## Étapes

1. **Groupe de ressources du lab.**

   ```azurecli
   RG=rg-lab-gov; LOC=francecentral; SUB=$(az account show --query id -o tsv)
   az group create -n $RG -l $LOC
   RGID=$(az group show -n $RG --query id -o tsv)
   ```

2. **Définition personnalisée** : refuser les comptes de stockage qui autorisent l'accès anonyme aux blobs. Créez `rules.json` :

   ```json
   {
     "if": {
       "allOf": [
         { "field": "type", "equals": "Microsoft.Storage/storageAccounts" },
         { "field": "Microsoft.Storage/storageAccounts/allowBlobPublicAccess", "notEquals": false }
       ]
     },
     "then": { "effect": "[parameters('effect')]" }
   }
   ```

   et `params.json` :

   ```json
   { "effect": { "type": "String", "allowedValues": ["Audit", "Deny", "Disabled"], "defaultValue": "Audit" } }
   ```

   ```azurecli
   az policy definition create -n lab-deny-blob-public --mode All --rules rules.json --params params.json \
     --display-name "Lab - Interdire l'accès anonyme aux blobs"
   ```

3. **Initiative** contenant cette définition et la définition intégrée « Allowed locations » :

   ```azurecli
   LOCDEF=$(az policy definition list --query "[?displayName=='Allowed locations'].id | [0]" -o tsv)
   cat > set.json <<EOF
   [
     { "policyDefinitionId": "/subscriptions/$SUB/providers/Microsoft.Authorization/policyDefinitions/lab-deny-blob-public",
       "parameters": { "effect": { "value": "[parameters('blobEffect')]" } } },
     { "policyDefinitionId": "$LOCDEF",
       "parameters": { "listOfAllowedLocations": { "value": [ "francecentral" ] } } }
   ]
   EOF
   az policy set-definition create -n lab-baseline --definitions set.json \
     --params '{ "blobEffect": { "type": "String", "defaultValue": "Audit" } }'
   ```

4. **Affectation en Audit, puis passage en Deny.**

   ```azurecli
   az policy assignment create -n lab-baseline-rg --policy-set-definition lab-baseline --scope $RGID \
     --params '{ "blobEffect": { "value": "Deny" } }'
   ```

5. **Tester le refus.** Attendez quelques minutes (propagation), puis :

   ```azurecli
   az storage account create -g $RG -n stlab$RANDOM -l $LOC --sku Standard_LRS --allow-blob-public-access true
   ```

   Attendu : erreur **RequestDisallowedByPolicy**. Recommencez avec `--allow-blob-public-access false` : création acceptée. Notez son nom dans `ST`.

6. **Exemption documentée** pour un compte « legacy » fictif : créez l'exemption sur le compte conforme (pour l'exercice) avec une date d'expiration :

   ```azurecli
   STID=$(az storage account show -n $ST -g $RG --query id -o tsv)
   az policy exemption create -n exempt-legacy --policy-assignment \
     "$RGID/providers/Microsoft.Authorization/policyAssignments/lab-baseline-rg" \
     --exemption-category Waiver --scope $STID --expires-on 2027-03-31T00:00:00Z \
     --description "Migration prévue T1 2027"
   ```

7. **Verrou CanNotDelete** sur le groupe, puis tentative de suppression du compte :

   ```azurecli
   az lock create -n lock-lab --lock-type CanNotDelete -g $RG
   az storage account delete -n $ST -g $RG --yes
   ```

   Attendu : échec **ScopeLocked**, même en tant qu'Owner.

8. **Rôle personnalisé** « Opérateur VM lab » (fichier `role.json`, AssignableScopes = votre groupe) :

   ```json
   {
     "Name": "Operateur VM lab",
     "Description": "Lire et redémarrer des VM, rien d'autre.",
     "Actions": [
       "Microsoft.Compute/*/read",
       "Microsoft.Compute/virtualMachines/start/action",
       "Microsoft.Compute/virtualMachines/restart/action",
       "Microsoft.Resources/subscriptions/resourceGroups/read"
     ],
     "NotActions": [], "DataActions": [], "NotDataActions": [],
     "AssignableScopes": ["/subscriptions/<subId>/resourceGroups/rg-lab-gov"]
   }
   ```

   ```azurecli
   sed -i "s#<subId>#$SUB#" role.json
   az role definition create --role-definition role.json
   ```

9. **Lire la conformité.** Portail > Policy > Compliance : filtrez sur `lab-baseline-rg`. Déclenchez une évaluation immédiate :

   ```azurecli
   az policy state trigger-scan -g $RG
   ```

   Puis Defender for Cloud > Regulatory compliance : repérez le standard MCSB et un contrôle lié au stockage.

## Vérification

- `az policy state list -g $RG --query "[].{res:resourceId, state:complianceState, policy:policyDefinitionName}" -o table` liste vos ressources avec leur état.
- `az policy exemption list --scope $STID -o table` montre l'exemption et sa date d'expiration.
- `az lock list -g $RG -o table` montre `lock-lab`.
- `az role definition list --custom-role-only true --query "[].roleName"` contient « Operateur VM lab ».
- Journal d'activité du groupe : les tentatives refusées (policy et lock) apparaissent avec leur code d'erreur.

## Défi : casse puis répare

1. **Casse** : ajoutez sur le groupe une **seconde** affectation de la définition `lab-deny-blob-public` avec l'effet **Audit**, en pensant qu'elle « assouplit » la première. Recréez un compte avec accès public autorisé.
   **Observe** : refus maintenu. **Explique** par écrit le principe « cumulatif, le plus restrictif l'emporte » et la bonne méthode (exclusion de portée sur l'affectation en Deny).
2. **Variante sans aide** : écrivez une définition avec l'effet **modify** qui ajoute le tag `owner=platform` aux groupes de ressources qui ne l'ont pas. Indiquez quel rôle l'identité managée de l'affectation doit recevoir, et lancez une tâche de remédiation.
3. **Variante sans aide** : ajoutez `Microsoft.Compute/virtualMachines/restart/action` dans **NotActions** d'un second rôle et expliquez pourquoi un utilisateur ayant aussi « Operateur VM lab » peut toujours redémarrer.

## Nettoyage

1. Supprimer le verrou (sinon rien ne se supprime) : `az lock delete -n lock-lab -g $RG`.
2. Supprimer exemption, affectations, initiative et définition :

   ```azurecli
   az policy exemption delete -n exempt-legacy --scope $STID
   az policy assignment delete -n lab-baseline-rg --scope $RGID
   az policy set-definition delete -n lab-baseline
   az policy definition delete -n lab-deny-blob-public
   ```

3. Supprimer le groupe : `az group delete -n $RG --yes`.
4. Supprimer le rôle personnalisé (aucune attribution ne doit subsister) : `az role definition delete --name "Operateur VM lab"`.
5. Vérifier qu'aucune affectation de lab ne reste sur l'abonnement : `az policy assignment list --query "[?starts_with(name,'lab-')]"`.
