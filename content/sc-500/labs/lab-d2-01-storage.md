---
id: lab-d2-01-storage
title: Un compte de stockage sans clé ni accès public
domain: d2
objectives: ["2.1", "2.3"]
skills: ["2.1.1", "2.1.2", "2.1.3", "2.1.4", "2.3.6"]
duration: 1 h 30
cost: Quelques centimes (stockage, private endpoint à l'heure), plus Defender for Storage si activé
level: Intermédiaire
summary: Clé partagée interdite, RBAC sur les données, user delegation SAS, stored access policy, private endpoint avec DNS privé, Defender for Storage et analyse antimalware.
sources:
  - title: Authorize operations for data access - Azure Storage
    url: https://learn.microsoft.com/en-us/azure/storage/common/authorize-data-access
  - title: Grant limited access with SAS
    url: https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview
  - title: Azure Storage firewall rules and network access
    url: https://learn.microsoft.com/en-us/azure/storage/common/storage-network-security
  - title: What is a private endpoint?
    url: https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview
  - title: What is Microsoft Defender for Storage
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-storage-introduction
---

> [!ATTENTION] Abonnement personnel ou tenant de test uniquement. Le lab crée des données de test fictives : n'y déposez jamais de données réelles.

## Objectif et compétence visée

Construire un compte de stockage conforme aux recommandations de la leçon 2.1 et prouver chaque contrôle : la clé ne marche plus, RBAC décide de l'accès, une SAS sans clé fonctionne, une SAS liée à une stored access policy se révoque, le réseau passe par un private endpoint. Compétences 2.1.1 à 2.1.4 et 2.3.6.

## Prérequis et coût estimé

- Abonnement Azure personnel, rôle Owner ; Azure CLI ou Cloud Shell.
- **Coût** : compte Standard LRS (centimes), un private endpoint facturé à l'heure (quelques centimes pour la durée du lab), Defender for Storage selon la grille Defender for Cloud. Vérifiez les tarifs actuels avant de commencer et faites le nettoyage.

## Étapes

1. **Variables, groupe, VNet de test.**

   ```azurecli
   RG=rg-lab-st; LOC=francecentral; ST=stlab$RANDOM
   ME=$(az ad signed-in-user show --query id -o tsv)
   az group create -n $RG -l $LOC
   az network vnet create -g $RG -n vnet-lab --address-prefixes 10.50.0.0/16 \
     --subnet-name snet-pe --subnet-prefixes 10.50.1.0/24
   ```

2. **Compte durci** : HTTPS, TLS 1.2, pas d'accès anonyme, **clé partagée autorisée pour l'instant** (on la coupera à l'étape 6).

   ```azurecli
   az storage account create -n $ST -g $RG -l $LOC --sku Standard_LRS --kind StorageV2 \
     --https-only true --min-tls-version TLS1_2 --allow-blob-public-access false
   STID=$(az storage account show -n $ST -g $RG --query id -o tsv)
   az storage container create --account-name $ST -n factures --auth-mode key
   echo "facture fictive" > f.txt
   az storage blob upload --account-name $ST -c factures -n f.txt -f f.txt --auth-mode key
   ```

3. **Accès par Entra ID** : vous êtes Owner, mais testez la lecture en mode `login`.

   ```azurecli
   az storage blob list --account-name $ST -c factures --auth-mode login -o table
   ```

   Attendu : **refus** tant que vous n'avez pas de rôle de **données**. Ajoutez-le, attendez une à deux minutes, réessayez :

   ```azurecli
   az role assignment create --role "Storage Blob Data Contributor" --assignee-object-id $ME \
     --assignee-principal-type User --scope $STID
   ```

4. **User delegation SAS** valable 1 heure, sans clé de compte :

   ```azurecli
   EXP=$(date -u -d "+1 hour" '+%Y-%m-%dT%H:%MZ')
   UDSAS=$(az storage blob generate-sas --account-name $ST -c factures -n f.txt --permissions r \
     --expiry $EXP --auth-mode login --as-user --https-only -o tsv)
   curl -s "https://$ST.blob.core.windows.net/factures/f.txt?$UDSAS"
   ```

5. **Stored access policy** pour un « partenaire », et SAS de service qui la référence :

   ```azurecli
   az storage container policy create --account-name $ST -c factures -n partenaire-a \
     --permissions r --expiry 2026-12-31T00:00Z --auth-mode key
   PSAS=$(az storage blob generate-sas --account-name $ST -c factures -n f.txt \
     --policy-name partenaire-a --https-only --auth-mode key -o tsv)
   curl -s -o /dev/null -w "%{http_code}\n" "https://$ST.blob.core.windows.net/factures/f.txt?$PSAS"   # 200
   az storage container policy delete --account-name $ST -c factures -n partenaire-a --auth-mode key
   sleep 30; curl -s -o /dev/null -w "%{http_code}\n" "https://$ST.blob.core.windows.net/factures/f.txt?$PSAS"   # 403
   ```

   La révocation peut prendre jusqu'à environ 30 secondes (à vérifier).

6. **Interdire la clé partagée.**

   ```azurecli
   az storage account update -n $ST -g $RG --allow-shared-key-access false
   az storage blob list --account-name $ST -c factures --auth-mode key -o table   # refus attendu
   az storage blob list --account-name $ST -c factures --auth-mode login -o table # OK
   ```

7. **Private endpoint et DNS privé**, puis fermeture de l'accès public :

   ```azurecli
   az network private-endpoint create -g $RG -n pe-blob --vnet-name vnet-lab --subnet snet-pe \
     --private-connection-resource-id $STID --group-id blob --connection-name pe-blob
   az network private-dns zone create -g $RG -n privatelink.blob.core.windows.net
   az network private-dns link vnet create -g $RG -z privatelink.blob.core.windows.net -n link-lab \
     -v vnet-lab -e false
   az network private-endpoint dns-zone-group create -g $RG --endpoint-name pe-blob -n default \
     --private-dns-zone privatelink.blob.core.windows.net --zone-name blob
   az storage account update -n $ST -g $RG --public-network-access Disabled
   ```

8. **Defender for Storage** (optionnel, payant) avec malware scanning sur ce seul compte, puis téléversement du fichier de test EICAR (chaîne de test antivirus standard, inoffensive) depuis une machine autorisée. Microsoft documente un test de ce type pour valider l'analyse, selon la procédure en vigueur (à vérifier).

## Vérification

- `az storage account show -n $ST -g $RG --query "{sharedKey:allowSharedKeyAccess, public:publicNetworkAccess, anon:allowBlobPublicAccess, tls:minimumTlsVersion}"` renvoie `false`, `Disabled`, `false`, `TLS1_2`.
- `az network private-endpoint show -g $RG -n pe-blob --query "privateLinkServiceConnections[0].privateLinkServiceConnectionState.status"` renvoie `Approved`.
- `az network private-dns record-set a list -g $RG -z privatelink.blob.core.windows.net -o table` contient votre compte avec une IP en `10.50.1.x`.
- Depuis votre poste (hors VNet), toute requête aux données échoue désormais : c'est attendu.
- Defender for Cloud > Security alerts : une alerte malware si vous avez fait le test de l'étape 8.

## Défi : casse puis répare

1. **Casse** : supprimez le lien de la zone DNS privée vers `vnet-lab` (`az network private-dns link vnet delete ...`). Depuis une VM ou Cloud Shell attaché au VNet (si vous en avez un), résolvez `$ST.blob.core.windows.net`.
   **Diagnostique** : vers quelle IP pointe le nom ? Pourquoi l'application échouerait-elle alors que le private endpoint existe ?
   **Répare** : recréez le lien.
2. **Variante sans aide** : un partenaire a reçu une SAS de **compte**. Écrivez la seule méthode de révocation possible et ses effets de bord.
3. **Variante sans aide** : expliquez pourquoi une user delegation SAS cesse de fonctionner si l'on retire votre rôle « Storage Blob Data Contributor ».

## Nettoyage

1. Si activé, désactivez Defender for Storage sur le compte ou l'abonnement.
2. `az group delete -n $RG --yes` (supprime compte, private endpoint, zone DNS et VNet).
3. Vérifiez dans Cost Management qu'aucun private endpoint ne reste facturé.
