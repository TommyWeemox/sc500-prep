---
id: lab-d3-01-servers
title: Une VM sans IP publique, chiffrée à l'hôte, joignable en JIT via Bastion
domain: d3
objectives: ["3.2"]
skills: ["3.2.1", "3.2.2", "3.2.3", "3.2.5", "3.2.8", "3.2.9"]
duration: 2 h
cost: Quelques euros si nettoyé le jour même (VM B2s, Azure Bastion Basic à l'heure, Defender for Servers Plan 2 au prorata horaire)
level: Intermédiaire
summary: Trusted Launch avec Secure Boot, vTPM et Guest Attestation, encryption at host, Azure Bastion, JIT VM access avec Defender for Servers Plan 2, et un audit Machine Configuration.
sources:
  - title: Overview of managed disk encryption options
    url: https://learn.microsoft.com/en-us/azure/virtual-machines/disk-encryption-overview
  - title: Trusted Launch for Azure virtual machines
    url: https://learn.microsoft.com/en-us/azure/virtual-machines/trusted-launch
  - title: Azure Bastion configuration settings
    url: https://learn.microsoft.com/en-us/azure/bastion/configuration-settings
  - title: Understand just-in-time virtual machine access
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/just-in-time-access-overview
  - title: Overview of Defender for Servers
    url: https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-servers-overview
  - title: Understand Azure Machine Configuration
    url: https://learn.microsoft.com/en-us/azure/governance/machine-configuration/overview/01-overview-concepts
---

> [!ATTENTION] Abonnement personnel ou tenant de test uniquement. Defender for Servers Plan 2 s'active pour tout l'abonnement : ne faites pas ce lab dans un abonnement partagé.

## Objectif et compétence visée

Construire la VM d'administration du projet fil rouge : aucun port exposé, chiffrement complet du disque temporaire et des caches, démarrage vérifié, accès réseau ouvert seulement sur demande et pour une durée limitée. Compétences 3.2.1, 3.2.2, 3.2.3, 3.2.5, 3.2.8 et 3.2.9. Ce lab prolonge le lab PIM : la demande JIT exige un rôle, que vous pouvez rendre éligible dans PIM.

## Prérequis et coût estimé

- Abonnement Azure personnel, rôle Owner ; Azure CLI 2.60 ou plus récent, ou Cloud Shell.
- Une paire de clés SSH (créée par la commande si absente).
- **Coût** : VM B2s et disque (quelques centimes par heure), Azure Bastion Basic (facturé à l'heure, de loin le poste principal), Defender for Servers Plan 2 au prorata. Vérifiez les tarifs actuels et faites le nettoyage le jour même.

## Étapes

1. **Encryption at host** : la fonctionnalité doit être enregistrée sur l'abonnement (une seule fois).

   ```azurecli
   az feature register --namespace Microsoft.Compute --name EncryptionAtHost
   az feature show --namespace Microsoft.Compute --name EncryptionAtHost --query properties.state -o tsv
   # attendre "Registered", puis :
   az provider register -n Microsoft.Compute
   ```

2. **Réseau** : un VNet, un sous-réseau pour la VM avec un NSG, et le sous-réseau Bastion en /26.

   ```azurecli
   RG=rg-lab-vm; LOC=francecentral
   az group create -n $RG -l $LOC
   az network vnet create -g $RG -n vnet-admin --address-prefixes 10.60.0.0/16 \
     --subnet-name snet-vm --subnet-prefixes 10.60.1.0/24
   az network nsg create -g $RG -n nsg-vm
   az network vnet subnet update -g $RG --vnet-name vnet-admin -n snet-vm --network-security-group nsg-vm
   az network vnet subnet create -g $RG --vnet-name vnet-admin -n AzureBastionSubnet \
     --address-prefixes 10.60.255.0/26
   ```

3. **VM Trusted Launch, sans IP publique, chiffrée à l'hôte.**

   ```azurecli
   az vm create -g $RG -n vm-admin --image Ubuntu2204 --size Standard_B2s \
     --vnet-name vnet-admin --subnet snet-vm --public-ip-address "" --nsg "" \
     --security-type TrustedLaunch --enable-secure-boot true --enable-vtpm true \
     --encryption-at-host true --admin-username azureuser --generate-ssh-keys
   ```

   `--nsg ""` évite un NSG par carte : c'est le NSG du sous-réseau qui s'applique.

4. **Guest Attestation** pour la surveillance de l'intégrité du démarrage :

   ```azurecli
   az vm extension set -g $RG --vm-name vm-admin -n GuestAttestation \
     --publisher Microsoft.Azure.Security.LinuxAttestation
   ```

5. **Azure Bastion Basic** (IP publique Standard statique obligatoire). Le déploiement prend plusieurs minutes.

   ```azurecli
   az network public-ip create -g $RG -n pip-bastion --sku Standard --allocation-method Static
   az network bastion create -g $RG -n bas-admin --vnet-name vnet-admin \
     --public-ip-address pip-bastion --sku Basic -l $LOC
   ```

6. **Defender for Servers Plan 2** sur l'abonnement :

   ```azurecli
   az security pricing create -n VirtualMachines --tier Standard --subplan P2
   ```

   Le paramètre `--subplan` dépend de la version de la CLI (à vérifier) ; sinon, portail : **Defender for Cloud > Environment settings > abonnement > Servers > On, Plan 2**.

7. **JIT VM access** (portail) : **Defender for Cloud > Workload protections > Just-in-time VM access > Not configured**, sélectionnez `vm-admin`, **Enable JIT on 1 VM**. Gardez seulement le port **22**, durée maximale **1 heure**, IP source autorisées « Per request ». Enregistrez.

8. **Demander l'accès** : sur la VM, **Connect > Request access** (ou dans la page JIT), port 22, votre IP, 1 heure. Puis connectez-vous via **Connect > Bastion** (SSH, clé privée générée à l'étape 3).

9. **Machine Configuration en audit** : affectez au groupe de ressources la définition intégrée de prérequis puis une définition d'audit Linux.

   ```azurecli
   az policy set-definition list --query "[?contains(displayName,'Deploy prerequisites to enable Guest Configuration')].{n:name,d:displayName}" -o table
   az policy assignment create -n mc-prereq --scope $(az group show -n $RG --query id -o tsv) \
     --policy-set-definition <nom-affiché-ci-dessus> --mi-system-assigned -l $LOC
   ```

   Ajoutez ensuite, depuis le portail Policy, la définition intégrée « Audit Linux machines that allow remote connections from accounts without passwords » (nom à vérifier dans votre tenant). Les résultats apparaissent après l'évaluation (jusqu'à environ 30 minutes, à vérifier).

## Vérification

- `az vm show -g $RG -n vm-admin --query "{type:securityProfile.securityType, sb:securityProfile.uefiSettings.secureBootEnabled, vtpm:securityProfile.uefiSettings.vTpmEnabled, host:securityProfile.encryptionAtHost}"` renvoie `TrustedLaunch`, `true`, `true`, `true`.
- `az vm list-ip-addresses -g $RG -n vm-admin -o table` : aucune IP publique.
- `az network nsg rule list -g $RG --nsg-name nsg-vm -o table` : une règle **deny** sur 22 créée par JIT ; pendant votre accès, une règle **allow** de priorité plus haute limitée à votre IP, qui disparaît à l'expiration.
- **Defender for Cloud > Just-in-time VM access > Configured** : la VM et l'historique de la demande, avec votre identité.
- Après évaluation : l'état de conformité Machine Configuration de la VM dans **Policy > Compliance**.

## Défi : casse puis répare

1. **Casse** : ajoutez au NSG une règle `Allow` sur le port 22 depuis `Internet`, priorité 100.
   **Diagnostique** : la VM est-elle exposée alors qu'elle n'a pas d'IP publique ? Que va remonter Defender for Cloud, et pourquoi JIT perd-il son intérêt ?
   **Répare** : supprimez la règle et vérifiez que seules les règles JIT restent.
2. **Variante sans aide** : votre collègue veut activer Defender for Servers Plan 2 sur cette seule VM. Expliquez pourquoi ce n'est pas possible et ce qu'il peut faire à la place.
3. **Variante sans aide** : citez ce que l'encryption at host chiffre de plus que le chiffrement côté serveur, et pourquoi on ne choisit plus Azure Disk Encryption pour une nouvelle VM.

## Nettoyage

1. Supprimez l'affectation Policy : `az policy assignment delete -n mc-prereq --scope $(az group show -n $RG --query id -o tsv)`.
2. `az group delete -n $RG --yes` (VM, disques, Bastion, IP publique, VNet).
3. Repassez Defender for Servers en gratuit si vous ne le gardez pas : `az security pricing create -n VirtualMachines --tier Free`.
4. Vérifiez dans Cost Management, le lendemain, qu'aucun Bastion ni IP publique ne reste facturé.
