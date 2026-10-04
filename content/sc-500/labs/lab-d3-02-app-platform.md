---
id: lab-d3-02-app-platform
title: Une application web et un conteneur sans secret ni exposition inutile
domain: d3
objectives: ["3.3"]
skills: ["3.3.3", "3.3.4", "3.3.7"]
duration: 1 h 30
cost: Moins de deux euros si nettoyé le jour même (App Service B1, ACR Basic, Container Apps à la consommation)
level: Intermédiaire
summary: App Service durci (HTTPS only, TLS 1.2, FTP et authentification basique coupés, restrictions d'accès), référence Key Vault par identité managée, ACR sans utilisateur admin et Container App qui tire son image par identité managée.
sources:
  - title: Security in Azure App Service
    url: https://learn.microsoft.com/en-us/azure/app-service/overview-security
  - title: Use Key Vault references - Azure App Service
    url: https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references
  - title: Registry authentication options - Azure Container Registry
    url: https://learn.microsoft.com/en-us/azure/container-registry/container-registry-authentication
  - title: Managed identities in Azure Container Apps
    url: https://learn.microsoft.com/en-us/azure/container-apps/managed-identity
  - title: Networking in Azure Container Apps environment
    url: https://learn.microsoft.com/en-us/azure/container-apps/networking
---

> [!ATTENTION] Abonnement personnel ou tenant de test uniquement. Le secret créé est fictif : ne mettez jamais un vrai mot de passe dans un lab.

## Objectif et compétence visée

Appliquer la checklist de la leçon 3.3 à deux plateformes et prouver chaque point : l'application web n'accepte plus HTTP, ni FTP, ni l'authentification basique ; son secret vient de Key Vault par identité managée ; le registre n'a pas d'utilisateur admin et le conteneur s'authentifie par identité. Compétences 3.3.3, 3.3.4 et 3.3.7.

## Prérequis et coût estimé

- Abonnement Azure personnel, rôle Owner ; Azure CLI avec l'extension `containerapp` (`az extension add -n containerapp --upgrade`).
- **Coût** : plan App Service B1 à l'heure, ACR Basic à la journée, Container Apps et Key Vault à l'usage. Quelques euros au plus si vous nettoyez le jour même ; vérifiez les tarifs actuels.

## Étapes

1. **Variables et groupe.**

   ```azurecli
   RG=rg-lab-app; LOC=francecentral; N=$RANDOM
   APP=app-lab-$N; KV=kv-lab-$N; ACR=acrlab$N
   az group create -n $RG -l $LOC
   ```

2. **Application web**, puis état initial (à noter pour comparer) :

   ```azurecli
   az appservice plan create -g $RG -n plan-lab --sku B1 --is-linux
   az webapp create -g $RG -p plan-lab -n $APP --runtime "NODE:20-lts"
   az webapp show -g $RG -n $APP --query "{https:httpsOnly}"
   az webapp config show -g $RG -n $APP --query "{tls:minTlsVersion, ftps:ftpsState, debug:remoteDebuggingEnabled}"
   ```

3. **Durcissement** : HTTPS only, TLS 1.2, FTP coupé, authentification basique coupée sur FTP et SCM.

   ```azurecli
   az webapp update -g $RG -n $APP --https-only true
   az webapp config set -g $RG -n $APP --min-tls-version 1.2 --ftps-state Disabled
   for P in ftp scm; do
     az resource update -g $RG --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies \
       --parent sites/$APP -n $P --set properties.allow=false
   done
   ```

4. **Identité managée et référence Key Vault** (Key Vault en mode RBAC) :

   ```azurecli
   PID=$(az webapp identity assign -g $RG -n $APP --query principalId -o tsv)
   az keyvault create -g $RG -n $KV -l $LOC --enable-rbac-authorization true
   KVID=$(az keyvault show -n $KV --query id -o tsv)
   ME=$(az ad signed-in-user show --query id -o tsv)
   az role assignment create --role "Key Vault Secrets Officer" --assignee-object-id $ME \
     --assignee-principal-type User --scope $KVID
   az keyvault secret set --vault-name $KV -n DbPassword --value "valeur-fictive-de-lab"
   az role assignment create --role "Key Vault Secrets User" --assignee-object-id $PID \
     --assignee-principal-type ServicePrincipal --scope $KVID
   az webapp config appsettings set -g $RG -n $APP \
     --settings "DB_PASSWORD=@Microsoft.KeyVault(VaultName=$KV;SecretName=DbPassword)"
   ```

5. **Restriction d'accès** : n'autoriser que votre IP publique (toute autre source reçoit un 403).

   ```azurecli
   MYIP=$(curl -s https://api.ipify.org)
   az webapp config access-restriction add -g $RG -n $APP --rule-name mon-ip \
     --action Allow --ip-address $MYIP/32 --priority 100
   ```

6. **Registre sans admin**, image importée :

   ```azurecli
   az acr create -g $RG -n $ACR --sku Basic
   az acr show -n $ACR --query adminUserEnabled
   az acr import -n $ACR --source mcr.microsoft.com/k8se/quickstart:latest --image quickstart:v1
   ```

7. **Container App** qui tire l'image avec son identité managée système, ingress interne à l'environnement :

   ```azurecli
   az containerapp env create -g $RG -n cae-lab -l $LOC
   az containerapp create -g $RG -n ca-lab --environment cae-lab \
     --image $ACR.azurecr.io/quickstart:v1 --registry-server $ACR.azurecr.io \
     --registry-identity system --ingress internal --target-port 80
   ```

   La CLI attribue le rôle AcrPull à l'identité système (comportement à vérifier selon la version de l'extension).

## Vérification

- `az webapp show -g $RG -n $APP --query httpsOnly` renvoie `true` ; `curl -sI http://$APP.azurewebsites.net` renvoie une redirection vers HTTPS.
- `az webapp config show -g $RG -n $APP --query "{tls:minTlsVersion, ftps:ftpsState}"` renvoie `1.2` et `Disabled`.
- `az resource show -g $RG --namespace Microsoft.Web --resource-type basicPublishingCredentialsPolicies --parent sites/$APP -n scm --query properties.allow` renvoie `false`.
- Portail : **App Service > Environment variables** : `DB_PASSWORD` porte une coche verte « Key vault Reference ».
- `az acr show -n $ACR --query adminUserEnabled` renvoie `false` ; `az role assignment list --scope $(az acr show -n $ACR --query id -o tsv) -o table` montre **AcrPull** pour l'identité de `ca-lab`.
- `az containerapp show -g $RG -n ca-lab --query properties.runningStatus` renvoie `Running`, et l'application n'a pas d'URL publique.

## Défi : casse puis répare

1. **Casse** : supprimez l'attribution « Key Vault Secrets User » de l'identité de l'application, puis redémarrez l'application (`az webapp restart`).
   **Diagnostique** : quel statut affiche la référence Key Vault dans le portail ? Que lit l'application dans `DB_PASSWORD` ?
   **Répare** : recréez l'attribution, redémarrez, vérifiez la coche verte (la résolution peut prendre quelques minutes).
2. **Variante sans aide** : un développeur réactive l'utilisateur admin ACR « pour aller plus vite ». Rédigez en trois lignes pourquoi vous refusez et ce que vous proposez à la place, pour lui et pour le pipeline.
3. **Variante sans aide** : décrivez ce qu'il faudrait changer pour que la sortie Internet du conteneur passe par un Azure Firewall (type d'environnement, sous-réseau, route).

## Nettoyage

1. `az group delete -n $RG --yes` (application, plan, coffre, registre, environnement).
2. Key Vault reste en **soft delete** : `az keyvault purge -n $KV` si la purge protection n'est pas activée (elle ne l'est pas dans ce lab).
3. Vérifiez dans Cost Management qu'aucun plan App Service ni registre ne reste facturé.
