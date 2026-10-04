---
id: lab-00-pim-jit
title: "Fil rouge : accès privilégié Just-in-Time avec PIM"
domain: d1
thread: true
objectives: ["1.1", "1.3"]
skills: ["1.1.1", "1.1.2", "1.1.3", "1.3.5", "1.3.7"]
duration: 2 h 30
cost: Licence Entra ID P2 en essai, ressources Azure quasi gratuites
level: Intermédiaire
summary: Rôles éligibles Entra et Azure, activation avec justification et approbation, contexte d'authentification d'accès conditionnel, revue d'accès. Le scénario Brisemer de bout en bout.
sources:
  - title: What is Privileged Identity Management?
    url: https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-configure
  - title: Configure Microsoft Entra role settings in PIM
    url: https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-how-to-change-default-settings
  - title: Eligible and time-bound role assignments in Azure RBAC
    url: https://learn.microsoft.com/en-us/azure/role-based-access-control/pim-integration
  - title: Microsoft Entra ID Governance licensing fundamentals
    url: https://learn.microsoft.com/en-us/entra/id-governance/licensing-fundamentals
  - title: Manage emergency access admin accounts
    url: https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/security-emergency-access
  - title: What are access reviews?
    url: https://learn.microsoft.com/en-us/entra/id-governance/access-reviews-overview
---

> [!ATTENTION] Tenant de test et abonnement personnel uniquement. Ce lab modifie des rôles d'administration et des politiques d'accès conditionnel. Ne le faites jamais dans le tenant de votre employeur ou d'un client, même « juste pour voir ».

## Objectif et compétence visée

Reproduire, dans un tenant de test, le projet Just-in-Time de Brisemer Logistique :

- plus aucun rôle privilégié permanent pour l'équipe d'exploitation ;
- activation limitée dans le temps, avec justification, ticket et approbation ;
- exigence d'une authentification forte **au moment de l'activation** via un contexte d'authentification ;
- revue d'accès périodique des rôles éligibles.

Compétences : PIM pour rôles Entra et rôles Azure (1.1.1), accès conditionnel et contexte d'authentification (1.1.2, 1.1.3), gestion des attributions et des droits excessifs (1.3.5, 1.3.7).

## Prérequis et coût estimé

- Un **tenant Microsoft Entra de test** dont vous êtes Global Administrator, lié à un **abonnement Azure personnel**.
- Des licences **Microsoft Entra ID P2** ou **Microsoft Entra ID Governance** : un essai gratuit peut être activé depuis le centre d'administration (durée et disponibilité de l'essai à vérifier au moment du lab (à vérifier)). Il faut une licence pour chaque utilisateur éligible, chaque approbateur et chaque réviseur.
- Azure CLI et le module PowerShell Az, ou Cloud Shell.
- **Coût Azure** : un groupe de ressources vide, aucun coût de calcul. Le coût réel est la licence si vous dépassez l'essai.

Comptes à créer (utilisateurs de test, mots de passe forts, aucun vrai nom) :

| Compte | Rôle dans le lab |
| --- | --- |
| `ops-alice@<tenant>.onmicrosoft.com` | Ingénieure d'exploitation, sera éligible |
| `lead-bruno@<tenant>.onmicrosoft.com` | Chef d'équipe, approbateur |
| `bg-01@<tenant>.onmicrosoft.com` | Compte d'accès d'urgence (concept) |

## Étapes

1. **Créer les utilisateurs et le groupe d'urgence.**

   ```powershell
   Connect-MgGraph -Scopes "User.ReadWrite.All","Group.ReadWrite.All"
   $pwd = @{ Password = "<MotDePasseLongEtUnique>"; ForceChangePasswordNextSignIn = $true }
   foreach ($u in "ops-alice","lead-bruno","bg-01") {
     New-MgUser -DisplayName $u -UserPrincipalName "$u@<tenant>.onmicrosoft.com" `
       -MailNickname $u -AccountEnabled -PasswordProfile $pwd -UsageLocation FR
   }
   New-MgGroup -DisplayName "grp-emergency-access" -MailEnabled:$false -SecurityEnabled -MailNickname "grpemergency"
   ```

   Ajoutez `bg-01` au groupe `grp-emergency-access`, puis affectez une licence P2 (essai) à `ops-alice` et `lead-bruno`.

2. **Créer le périmètre Azure.**

   ```azurecli
   az group create -n rg-pim-lab -l francecentral
   ```

3. **Créer le contexte d'authentification et sa politique d'accès conditionnel.** Dans **Entra admin center > Entra ID > Conditional Access > Authentication contexts**, créez `c1` « Activation privilégiée ». Puis créez une politique :
   - **Users** : `ops-alice` (ou un groupe des éligibles), exclure `grp-emergency-access` ;
   - **Target resources** : Authentication context `c1` ;
   - **Grant** : Require authentication strength **Multifactor authentication** (ou Phishing-resistant si vous avez une clé FIDO2) ;
   - **Session** : Sign-in frequency **Every time** ;
   - **State** : **On**.

4. **Régler le rôle Entra « Security Reader » dans PIM.** ID Governance > Privileged Identity Management > Microsoft Entra roles > Roles > Security Reader > Role settings > Edit :
   - Activation maximum duration : **2 heures** ;
   - On activation, require : **Microsoft Entra Conditional Access authentication context** = `c1` ;
   - Require justification et Require ticket information : **cochés** ;
   - Require approval to activate : **cochée**, approbateur `lead-bruno` ;
   - Assignment : interdire les attributions actives permanentes.

5. **Rendre `ops-alice` éligible** à Security Reader (Assignments > Add assignments > type **Eligible**, durée 30 jours).

6. **Rendre `ops-alice` éligible au rôle Azure Contributor** sur `rg-pim-lab`, pour 30 jours :

   ```powershell
   Connect-AzAccount
   $scope = (Get-AzResourceGroup -Name rg-pim-lab).ResourceId
   $role  = Get-AzRoleDefinition -Name "Contributor"
   $alice = (Get-AzADUser -UserPrincipalName "ops-alice@<tenant>.onmicrosoft.com").Id
   New-AzRoleEligibilityScheduleRequest -Name (New-Guid) -Scope $scope -PrincipalId $alice `
     -RoleDefinitionId "$scope/providers/Microsoft.Authorization/roleDefinitions/$($role.Id)" `
     -RequestType AdminAssign -ScheduleInfoStartDateTime (Get-Date).ToUniversalTime().ToString("o") `
     -ExpirationType AfterDuration -ExpirationDuration "P30D" -Justification "Lab fil rouge"
   ```

   Puis, dans PIM > Azure resources > `rg-pim-lab` > Settings > Contributor, exigez justification et approbation par `lead-bruno`.

7. **Activer en tant qu'Alice.** Dans une fenêtre InPrivate, connectez-vous avec `ops-alice`, ouvrez **My roles** (PIM), activez Security Reader : saisissez une justification et un ticket fictif `CHG-0001`. Notez le message sur la politique d'accès conditionnel et la réauthentification.

8. **Approuver en tant que Bruno.** Dans une autre fenêtre InPrivate, connectez-vous avec `lead-bruno`, PIM > **Approve requests**, approuvez avec une justification.

9. **Faire de même pour Contributor** sur `rg-pim-lab`, puis, en tant qu'Alice, créez un compte de stockage de test dans `rg-pim-lab` pour prouver l'accès (supprimez-le juste après).

10. **Programmer une revue d'accès** : PIM > Microsoft Entra roles > Access reviews > New : rôle Security Reader, réviseur `lead-bruno`, fréquence unique, action automatique « Remove access » si refus.

## Vérification

- PIM > Microsoft Entra roles > **Assignments** : Alice apparaît dans **Eligible assignments**, et dans **Active assignments** seulement pendant la fenêtre d'activation.
- Commande :

  ```powershell
  Get-AzRoleEligibilitySchedule -Scope (Get-AzResourceGroup rg-pim-lab).ResourceId
  Get-AzRoleAssignmentSchedule -Scope (Get-AzResourceGroup rg-pim-lab).ResourceId
  ```

  La première montre l'éligibilité ; la seconde n'affiche Contributor qu'après activation.
- PIM > **Resource audit** et **My audit** : on voit la demande, la justification, le ticket, l'approbation et l'activation.
- Entra > Sign-in logs pour Alice : la connexion de l'activation montre la politique d'accès conditionnel appliquée sur le contexte `c1`.
- Après 2 heures (ou désactivation manuelle), Alice perd le rôle sans intervention.

## Défi : casse puis répare

1. **Casse** : passez la politique d'accès conditionnel du contexte `c1` en **Report-only**, puis activez de nouveau le rôle en tant qu'Alice.
   **Observe** : l'activation se fait sans réauthentification. Microsoft documente que le mécanisme de secours (MFA forcée) ne se déclenche **pas** si la politique est en report-only, désactivée, ou si l'utilisateur en est exclu.
   **Répare** : remettez la politique sur **On**, et ajoutez une alerte (Sentinel ou Azure Monitor) sur toute modification des politiques d'accès conditionnel.

2. **Variante sans aide** : retirez `lead-bruno` comme approbateur sans en désigner d'autre, et expliquez par écrit qui devient approbateur par défaut, puis pourquoi la situation serait dangereuse si **tous** les Global Administrators étaient éligibles. Rétablissez l'approbateur.

3. **Variante sans aide** : expliquez pourquoi `bg-01` doit être **actif permanent** Global Administrator, exclu de `c1` et de toute politique qui bloque, et surveillé par une alerte sur `SigninLogs`.

## Nettoyage

À faire **impérativement** dans cet ordre :

1. Supprimer l'éligibilité Azure :

   ```powershell
   New-AzRoleEligibilityScheduleRequest -Name (New-Guid) -Scope $scope -PrincipalId $alice `
     -RoleDefinitionId "$scope/providers/Microsoft.Authorization/roleDefinitions/$($role.Id)" `
     -RequestType AdminRemove
   ```

2. Retirer les attributions PIM Entra d'Alice, arrêter et supprimer la revue d'accès.
3. Supprimer la politique d'accès conditionnel puis le contexte d'authentification `c1` (désactivez-le d'abord dans PIM).
4. Supprimer le groupe de ressources : `az group delete -n rg-pim-lab --yes`.
5. Supprimer les utilisateurs de test et le groupe, retirer les licences d'essai si vous ne poursuivez pas.
6. Vérifier dans **Cost Management** qu'aucune ressource ne reste facturée.
