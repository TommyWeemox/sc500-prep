---
id: lab-d4-01-sentinel
title: Un SOC minimal dans Sentinel, de la collecte à l'automatisation
domain: d4
objectives: ["4.2"]
skills: ["4.2.1", "4.2.2", "4.2.3", "4.2.4", "4.2.7", "4.2.8", "4.2.9"]
duration: 2 h
cost: Quelques euros au plus (ingestion de quelques Mo, rétention), à condition de supprimer le workspace le jour même
level: Intermédiaire
summary: Workspace et Sentinel, rôles analyste, solution Azure Activity depuis le content hub, règle d'analyse, table personnalisée, règle d'automatisation avec expiration et rétention par table, avec lien vers les activations PIM du fil rouge.
sources:
  - title: Onboard to Microsoft Sentinel
    url: https://learn.microsoft.com/en-us/azure/sentinel/quickstart-onboard
  - title: Roles and permissions in the Microsoft Sentinel platform
    url: https://learn.microsoft.com/en-us/azure/sentinel/roles
  - title: Automate threat response with automation rules
    url: https://learn.microsoft.com/en-us/azure/sentinel/automate-incident-handling-with-automation-rules
  - title: Add or delete tables and columns in Azure Monitor Logs
    url: https://learn.microsoft.com/en-us/azure/azure-monitor/logs/create-custom-table
  - title: Manage data retention in a Log Analytics workspace
    url: https://learn.microsoft.com/en-us/azure/azure-monitor/logs/data-retention-configure
---

> [!ATTENTION] Abonnement personnel ou tenant de test uniquement. Sentinel est un service payant : le volume de ce lab est minime, mais supprimez tout à la fin.

## Objectif et compétence visée

Monter le socle SOC du projet fil rouge : un workspace Sentinel, des accès d'analyste au moindre privilège, la collecte du journal d'activité Azure, une détection sur les attributions de rôles, une table personnalisée et une automatisation qui ferme le bruit d'un test planifié. Compétences 4.2.1 à 4.2.4, 4.2.7 à 4.2.9.

## Prérequis et coût estimé

- Abonnement Azure personnel, rôle **Owner** (nécessaire pour accorder à Sentinel les droits sur les playbooks) ; Azure CLI ou Cloud Shell.
- Un second compte de test (utilisateur fictif) pour jouer l'analyste.
- **Coût** : ingestion de quelques Mo au tarif Sentinel, rétention incluse ; quelques euros au plus. Vérifiez les tarifs actuels.

## Étapes

1. **Workspace et Sentinel.**

   ```azurecli
   RG=rg-lab-soc; LOC=francecentral; LAW=law-lab-soc
   az group create -n $RG -l $LOC
   az monitor log-analytics workspace create -g $RG -n $LAW -l $LOC --retention-time 90
   ```

   Puis portail : **Microsoft Sentinel > Create > $LAW > Add**. Si le portail vous redirige vers le portail Defender, poursuivez là-bas (Microsoft Sentinel > Configuration).

2. **Rôles de l'analyste** (compte de test) au niveau du groupe de ressources :

   ```azurecli
   ANALYSTE=$(az ad user show --id analyste@<votre-tenant-de-test>.onmicrosoft.com --query id -o tsv)
   RGID=$(az group show -n $RG --query id -o tsv)
   for R in "Microsoft Sentinel Responder" "Microsoft Sentinel Playbook Operator"; do
     az role assignment create --role "$R" --assignee-object-id $ANALYSTE --assignee-principal-type User --scope $RGID
   done
   ```

3. **Content hub** : installez la solution **Azure Activity**. Dans **Data connectors > Azure Activity > Open connector page > Launch Azure Policy Assignment Wizard** : portée = votre abonnement, paramètre **Primary Log Analytics workspace** = $LAW, **Create**.

4. **Générer de l'activité** : créez puis supprimez une attribution de rôle de test, par exemple :

   ```azurecli
   az role assignment create --role "Reader" --assignee-object-id $ANALYSTE --assignee-principal-type User --scope $RGID
   az role assignment delete --role "Reader" --assignee $ANALYSTE --scope $RGID
   ```

5. **Règle d'analyse planifiée** (Analytics > Create > Scheduled query rule), toutes les 5 minutes sur 1 heure, création d'incident activée :

   ```kusto
   AzureActivity
   | where OperationNameValue =~ "Microsoft.Authorization/roleAssignments/write"
   | where ActivityStatusValue =~ "Success"
   | project TimeGenerated, Caller, CallerIpAddress, ResourceGroup, _ResourceId
   ```

   Mappez l'entité **Account** sur `Caller` et **IP** sur `CallerIpAddress`.

6. **Règle d'automatisation** « Pentest novembre » : déclencheur **When incident is created**, condition **IP address equals** votre IP publique, actions **Add tag** `pentest` puis **Change status > Closed (Benign Positive)**, **expiration** dans 2 jours.

7. **Table personnalisée** pour de futurs événements de badge, en plan Analytics, et rétention par table :

   ```azurecli
   az monitor log-analytics workspace table create -g $RG --workspace-name $LAW -n BadgeAccess_CL \
     --plan Analytics --columns TimeGenerated=datetime Badge=string Porte=string Resultat=string
   az monitor log-analytics workspace table update -g $RG --workspace-name $LAW -n AzureActivity \
     --retention-time 90 --total-retention-time 730
   ```

8. **Lien avec le fil rouge** (si vous avez fait le lab PIM et ajouté le connecteur Microsoft Entra ID avec AuditLogs) : chassez les activations PIM.

   ```kusto
   AuditLogs
   | where OperationName has "PIM activation"
   | project TimeGenerated, OperationName, InitiatedBy, TargetResources
   ```

## Vérification

- **Data connectors** : Azure Activity en état **Connected** ; `AzureActivity | take 10` renvoie des lignes (comptez jusqu'à 15 minutes, à vérifier).
- Après l'étape 4 et le passage de la règle : un incident « attribution de rôle » existe, avec les entités Account et IP.
- Grâce à la règle d'automatisation, cet incident est **fermé** et porte le tag `pentest` (son historique montre l'action de la règle).
- Connecté avec le compte analyste : il peut **assigner** et **fermer** un incident, mais **pas** modifier la règle d'analyse.
- `az monitor log-analytics workspace table show -g $RG --workspace-name $LAW -n AzureActivity --query "{a:retentionInDays,t:totalRetentionInDays}"` renvoie 90 et 730.

## Défi : casse puis répare

1. **Casse** : créez un playbook Logic App (déclencheur incident Sentinel) dans un **nouveau** groupe `rg-lab-soar`, puis essayez de l'ajouter comme action **Run playbook** à votre règle d'automatisation.
   **Diagnostique** : pourquoi est-il grisé ? Quel rôle manque, à qui, et sur quelle portée ?
   **Répare** : **Manage playbook permissions**, cochez `rg-lab-soar`, appliquez (il faut être Owner du groupe).
2. **Variante sans aide** : l'analyste doit pouvoir créer des workbooks. Quel rôle supplémentaire, et pourquoi pas Sentinel Contributor ?
3. **Variante sans aide** : on vous demande 7 ans de rétention analytique sur `AzureActivity`. Répondez avec les bons chiffres et proposez la configuration correcte.

## Nettoyage

1. Supprimez l'affectation Azure Policy créée par le connecteur Azure Activity (**Policy > Assignments**).
2. Supprimez les attributions de rôle de l'analyste.
3. `az group delete -n $RG --yes` (et `rg-lab-soar` si créé) : supprime workspace, Sentinel, règles et playbooks.
4. Vérifiez le lendemain dans Cost Management qu'aucune ingestion ne reste facturée.
