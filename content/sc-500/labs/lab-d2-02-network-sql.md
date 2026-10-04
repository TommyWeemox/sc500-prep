---
id: lab-d2-02-network-sql
title: Segmentation centrale et base SQL sans mot de passe
domain: d2
objectives: ["2.3", "2.2"]
skills: ["2.3.1", "2.3.2", "2.3.9", "2.2.1", "2.2.2"]
duration: 2 h
cost: 1 à 2 € environ (deux petites VM quelques heures, Azure SQL niveau Basic), à vérifier selon la région
level: Intermédiaire
summary: NSG et ASG, security admin rule Deny via Azure Virtual Network Manager, diagnostic par IP flow verify, Azure SQL avec Entra-only, private endpoint et audit vers Log Analytics.
sources:
  - title: Azure network security groups overview
    url: https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview
  - title: Security admin rules in Azure Virtual Network Manager
    url: https://learn.microsoft.com/en-us/azure/virtual-network-manager/concept-security-admins
  - title: IP flow verify overview
    url: https://learn.microsoft.com/en-us/azure/network-watcher/ip-flow-verify-overview
  - title: Microsoft Entra authentication for Azure SQL
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/authentication-aad-overview
  - title: Auditing for Azure SQL Database
    url: https://learn.microsoft.com/en-us/azure/azure-sql/database/auditing-overview
---

> [!ATTENTION] Abonnement personnel ou tenant de test uniquement. Une configuration Virtual Network Manager posée sur un groupe d'administration d'entreprise s'appliquerait à tous ses VNet.

## Objectif et compétence visée

Vérifier par l'expérience l'ordre d'évaluation **security admin rules puis NSG**, diagnostiquer avec Network Watcher, et déployer une base Azure SQL accessible uniquement par identités Entra, en privé, et auditée. Compétences 2.3.1, 2.3.2, 2.3.9, 2.2.1 et 2.2.2.

## Prérequis et coût estimé

- Abonnement Azure personnel, rôle Owner ; Azure CLI.
- **Coût** : deux VM `Standard_B1s` quelques heures, Azure SQL Database niveau Basic, Log Analytics (quelques Mo). Azure Virtual Network Manager peut être facturé selon le nombre d'abonnements gérés (à vérifier sur la page de prix). Supprimez tout à la fin.

## Étapes

1. **Réseau et deux VM** (sans IP publique), avec des ASG.

   ```azurecli
   RG=rg-lab-net; LOC=francecentral
   az group create -n $RG -l $LOC
   az network vnet create -g $RG -n vnet-app --address-prefixes 10.60.0.0/16 \
     --subnet-name snet-app --subnet-prefixes 10.60.1.0/24
   az network vnet subnet create -g $RG --vnet-name vnet-app -n snet-pe --address-prefixes 10.60.2.0/24
   az network asg create -g $RG -n asg-web
   az network asg create -g $RG -n asg-admin
   az network nsg create -g $RG -n nsg-app
   az network vnet subnet update -g $RG --vnet-name vnet-app -n snet-app --network-security-group nsg-app
   for n in web01 admin01; do
     az vm create -g $RG -n vm-$n --image Ubuntu2204 --size Standard_B1s --vnet-name vnet-app \
       --subnet snet-app --public-ip-address "" --nsg "" --admin-username azureuser --generate-ssh-keys
   done
   az network nic ip-config update -g $RG --nic-name vm-web01VMNic -n ipconfigvm-web01 --application-security-groups asg-web
   az network nic ip-config update -g $RG --nic-name vm-admin01VMNic -n ipconfigvm-admin01 --application-security-groups asg-admin
   ```

   Les noms de cartes réseau générés par `az vm create` peuvent différer : vérifiez avec `az network nic list -g $RG -o table`.

2. **Règle NSG** : autoriser SSH d'`asg-admin` vers `asg-web`.

   ```azurecli
   az network nsg rule create -g $RG --nsg-name nsg-app -n allow-ssh-admin --priority 200 \
     --direction Inbound --access Allow --protocol Tcp --source-asgs asg-admin \
     --destination-asgs asg-web --destination-port-ranges 22
   ```

3. **Tester avec IP flow verify** (Network Watcher doit être activé dans la région) :

   ```azurecli
   WEBIP=$(az vm show -d -g $RG -n vm-web01 --query privateIps -o tsv)
   ADMIP=$(az vm show -d -g $RG -n vm-admin01 --query privateIps -o tsv)
   az network watcher test-ip-flow -g $RG --vm vm-web01 --direction Inbound --protocol TCP \
     --local $WEBIP:22 --remote $ADMIP:50000
   ```

   Attendu : **Allow**, règle `allow-ssh-admin`.

4. **Virtual Network Manager** limité à votre abonnement, groupe réseau statique contenant `vnet-app`, configuration de security admin avec une règle **Deny** TCP 22 entrante, puis **déploiement** (commit) dans la région. Le plus simple est le portail : Network managers > Create (scope : votre abonnement, fonctionnalité Security admin) > Network groups > Configurations > Security admin configuration > Rule collection > Deploy.

5. **Rejouer IP flow verify** après quelques minutes (cohérence à terme). Observez que le NSG autorise toujours SSH mais que le trafic est refusé : la règle d'admin est évaluée **avant**. Selon la version de l'outil, le résultat peut désigner la security admin rule ou nécessiter NSG diagnostics pour l'afficher (à vérifier).

6. **Azure SQL sans mot de passe** :

   ```azurecli
   ME=$(az ad signed-in-user show --query id -o tsv); UPN=$(az ad signed-in-user show --query userPrincipalName -o tsv)
   SQL=sql-lab-$RANDOM
   az sql server create -g $RG -n $SQL -l $LOC --enable-ad-only-auth \
     --external-admin-principal-type User --external-admin-name $UPN --external-admin-sid $ME
   az sql db create -g $RG -s $SQL -n db-lab --service-objective Basic
   az sql server update -g $RG -n $SQL --enable-public-network false
   ```

7. **Private endpoint SQL** dans `snet-pe` avec la zone `privatelink.database.windows.net` (même méthode qu'au lab de stockage, `--group-id sqlServer`).

8. **Audit vers Log Analytics** :

   ```azurecli
   az monitor log-analytics workspace create -g $RG -n law-lab-net
   LAW=$(az monitor log-analytics workspace show -g $RG -n law-lab-net --query id -o tsv)
   az sql server audit-policy update -g $RG -n $SQL --state Enabled \
     --log-analytics-target-state Enabled --log-analytics-workspace-resource-id $LAW
   ```

## Vérification

- `az network nsg rule list -g $RG --nsg-name nsg-app -o table` : la règle 200 est présente.
- IP flow verify : **Allow** avant l'étape 4, **Deny** après le déploiement de la configuration d'admin.
- `az sql server show -g $RG -n $SQL --query "{entraOnly:administrators.azureAdOnlyAuthentication, public:publicNetworkAccess}"` renvoie `true` et `Disabled`.
- Après une connexion à la base depuis une machine du VNet (par exemple avec `sqlcmd` et l'authentification Entra), la requête KQL `search "SQLSecurityAuditEvents" | take 20` dans l'espace montre les événements (délai de quelques minutes).

## Défi : casse puis répare

1. **Casse** : dans la configuration Virtual Network Manager, changez l'action de la règle en **Allow**, redéployez, et ajoutez dans `nsg-app` une règle Deny SSH priorité 100.
   **Prédis** le résultat avant de tester IP flow verify, puis vérifie. Recommence avec **Always Allow**. Explique la différence par écrit.
2. **Variante sans aide** : essayez de vous connecter à la base avec un login SQL créé auparavant (ou avec l'admin SQL si vous en aviez défini un). Expliquez l'erreur.
3. **Variante sans aide** : citez où chercher un échec de connexion d'un utilisateur Entra à cette base, et pourquoi il n'est pas dans l'audit SQL.

## Nettoyage

1. Supprimez le **déploiement** de la configuration de security admin (Network manager > Deployments > retirer la configuration de la région), puis le Network manager. Un network manager avec des déploiements actifs peut bloquer la suppression du groupe.
2. `az group delete -n $RG --yes`.
3. Vérifiez dans Cost Management l'absence de VM, de base SQL et de private endpoints résiduels.
