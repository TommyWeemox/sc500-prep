---
id: lab-d1-01-key-vault
title: Un coffre Key Vault durci de bout en bout
domain: d1
objectives: ["1.2", "1.1"]
skills: ["1.2.1", "1.2.2", "1.2.3", "1.2.4", "1.2.5", "1.2.7", "1.1.6"]
duration: 1 h 30
cost: Quelques centimes (Key Vault Standard, Log Analytics), plus Defender for Key Vault si activé
level: Intermédiaire
summary: Coffre en RBAC avec purge protection, rôles de données, pare-feu, soft-delete et récupération, journaux AuditEvent, Defender for Key Vault.
sources:
  - title: Azure Key Vault soft-delete
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/soft-delete-overview
  - title: Azure RBAC for Key Vault
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/rbac-guide
  - title: Configure network security for Azure Key Vault
    url: https://learn.microsoft.com/en-us/azure/key-vault/general/network-security
  - title: Microsoft Defender for Key Vault
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-key-vault-introduction
---

> [!ATTENTION] Abonnement personnel ou tenant de test uniquement. N'utilisez jamais un abonnement d'entreprise : vous allez créer, supprimer et purger des secrets.

## Objectif et compétence visée

Déployer un coffre conforme aux recommandations de la leçon 1.2, puis prouver chaque protection par un test : rôle de données insuffisant, pare-feu, suppression et récupération, journalisation. Compétences 1.2.1 à 1.2.5, 1.2.7 et l'usage d'une identité managée (1.1.6).

## Prérequis et coût estimé

- Abonnement Azure personnel, rôle Owner.
- Azure CLI 2.6x ou plus, ou Cloud Shell (Bash).
- Votre adresse IP publique (par exemple via `curl -s https://api.ipify.org`).
- **Coût** : Key Vault Standard est facturé aux opérations (négligeable ici). Log Analytics : ingestion de quelques Mo. **Defender for Key Vault** est facturé selon la grille Defender for Cloud : désactivez-le au nettoyage. Vérifiez les prix actuels sur la page de tarification Azure avant de commencer.

## Étapes

1. **Variables et groupe de ressources.**

   ```azurecli
   RG=rg-lab-kv; LOC=francecentral; KV=kv-lab-$RANDOM; LAW=law-lab-kv
   ME=$(az ad signed-in-user show --query id -o tsv)
   MYIP=$(curl -s https://api.ipify.org)
   az group create -n $RG -l $LOC
   ```

2. **Déployer le coffre en Bicep** (fichier `kv.bicep`) :

   ```bicep
   param name string
   param location string = resourceGroup().location
   param myIp string

   resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
     name: name
     location: location
     properties: {
       tenantId: subscription().tenantId
       sku: { family: 'A', name: 'standard' }
       enableRbacAuthorization: true
       enableSoftDelete: true
       softDeleteRetentionInDays: 7
       enablePurgeProtection: true
       publicNetworkAccess: 'Enabled'
       networkAcls: {
         defaultAction: 'Deny'
         bypass: 'AzureServices'
         ipRules: [ { value: myIp } ]
       }
     }
   }
   output id string = kv.id
   ```

   ```azurecli
   az deployment group create -g $RG -f kv.bicep -p name=$KV myIp=$MYIP
   KVID=$(az keyvault show -n $KV --query id -o tsv)
   ```

   Rétention de 7 jours pour pouvoir observer la fin de rétention dans un lab ; en production, gardez 90.

3. **Constater qu'Owner ne suffit pas pour les données.**

   ```azurecli
   az keyvault secret set --vault-name $KV --name test --value "v1"
   ```

   Résultat attendu : **Forbidden**. Owner est un rôle du plan de contrôle.

4. **Se donner le rôle de données minimal pour gérer les secrets**, attendre une à deux minutes, réessayer :

   ```azurecli
   az role assignment create --role "Key Vault Secrets Officer" --assignee-object-id $ME \
     --assignee-principal-type User --scope $KVID
   az keyvault secret set --vault-name $KV --name sql-conn --value "Server=tcp:demo;Password=Fake" \
     --expires "2027-12-31T00:00:00Z"
   ```

5. **Identité managée en lecture seule.** Créez une identité user-assigned et donnez-lui **Key Vault Secrets User** :

   ```azurecli
   az identity create -g $RG -n id-lab-reader
   MI=$(az identity show -g $RG -n id-lab-reader --query principalId -o tsv)
   az role assignment create --role "Key Vault Secrets User" --assignee-object-id $MI \
     --assignee-principal-type ServicePrincipal --scope $KVID
   ```

6. **Journaux de diagnostic vers Log Analytics.**

   ```azurecli
   az monitor log-analytics workspace create -g $RG -n $LAW
   LAWID=$(az monitor log-analytics workspace show -g $RG -n $LAW --query id -o tsv)
   az monitor diagnostic-settings create -n diag-kv --resource $KVID --workspace $LAWID \
     --logs '[{"category":"AuditEvent","enabled":true}]'
   ```

7. **Supprimer puis récupérer un secret.**

   ```azurecli
   az keyvault secret delete --vault-name $KV --name sql-conn
   az keyvault secret list-deleted --vault-name $KV -o table
   az keyvault secret recover --vault-name $KV --name sql-conn
   ```

8. **Tenter une purge** (supprimez à nouveau le secret avant) :

   ```azurecli
   az keyvault secret delete --vault-name $KV --name sql-conn
   az keyvault secret purge --vault-name $KV --name sql-conn
   ```

   Résultat attendu : **refus** à cause de la purge protection. Récupérez le secret.

9. **Activer Defender for Key Vault** sur l'abonnement (optionnel, payant) :

   ```azurecli
   az security pricing create --name KeyVaults --tier Standard
   ```

## Vérification

- `az keyvault show -n $KV --query "properties.{rbac:enableRbacAuthorization, purge:enablePurgeProtection, retention:softDeleteRetentionInDays, acl:networkAcls.defaultAction}"` renvoie `true`, `true`, `7`, `Deny`.
- `az role assignment list --scope $KVID -o table` montre exactement **Secrets Officer** (vous) et **Secrets User** (identité).
- Requête KQL dans l'espace Log Analytics (les journaux arrivent après quelques minutes) :

  ```kusto
  AzureDiagnostics
  | where ResourceProvider == "MICROSOFT.KEYVAULT"
  | project TimeGenerated, OperationName, ResultSignature, CallerIPAddress, identity_claim_oid_g
  | order by TimeGenerated desc
  ```

  On doit voir `SecretSet`, `SecretDelete`, `SecretRecover`, la purge refusée et les appels `Forbidden` de l'étape 3. Selon la configuration, les journaux peuvent arriver dans une table spécifique à la ressource plutôt que `AzureDiagnostics` (à vérifier).

## Défi : casse puis répare

1. **Casse** : retirez votre IP du pare-feu (`az keyvault network-rule remove -n $KV --ip-address $MYIP/32`), puis lisez un secret. Erreur attendue de type **ForbiddenByFirewall**, alors que votre rôle RBAC est intact.
   **Diagnostique** sans regarder la solution : est-ce l'identité, le rôle ou le réseau ? Que montre le journal AuditEvent ?
   **Répare** : remettez la règle IP, ou mieux, imaginez la version private endpoint (zone `privatelink.vaultcore.azure.net`).
2. **Variante sans aide** : déployez un secret **via Bicep** (`Microsoft.KeyVault/vaults/secrets`) pendant que votre IP est retirée. Le déploiement passe-t-il ? Expliquez pourquoi (plan de contrôle et plan de données).
3. **Variante sans aide** : essayez de passer `softDeleteRetentionInDays` de 7 à 90 sur le coffre existant et interprétez le résultat.

## Nettoyage

1. Désactivez Defender for Key Vault si vous l'avez activé : `az security pricing create --name KeyVaults --tier Free`.
2. Supprimez le groupe : `az group delete -n $RG --yes`.
3. Le coffre reste **soft-deleted** pendant 7 jours et, avec la purge protection, **ne peut pas être purgé** avant : c'est voulu. Il n'est pas facturé dans cet état (sauf clés HSM). Vérifiez avec `az keyvault list-deleted`.
4. Vérifiez dans Cost Management qu'aucune ressource du lab ne reste active.
