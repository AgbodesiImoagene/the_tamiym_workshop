# Roadmap Tamiym Workshop

Ordre de travail proposé au 6 novembre 2026. Il part de la revue du 21 octobre 2026 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`) et des réponses du client.

Chaque ligne des tableaux est un ticket autonome, à confier à un agent. Les fichiers sont dans ce dossier.

## Comment confier les tickets aux agents

**On suit les N° dans l'ordre.** La roadmap se lit de haut en bas : le plus petit N° sans case cochée est le prochain ticket à faire. Un ticket fini garde son N°. Les tickets déjà finis avant ce classement n'en ont pas.

**Le lot dit ce qui peut tourner en même temps.** `2A` veut dire phase 2, lot A. Les tickets d'un même lot peuvent être confiés à plusieurs agents en parallèle : ils ne touchent pas les mêmes zones du code, et au plus l'un d'eux change la base de données.

- On termine et on fusionne un lot avant de lancer le suivant.
- On ne lance pas un ticket si sa colonne « Attend » contient un ticket pas fini.
- Si un ticket attend une question du client (Q..), l'agent s'arrête et te prévient. Tu choisis alors : attendre la réponse, ou autoriser la valeur « Par défaut proposé ». Quand la réponse arrive, retire la question de l'en-tête du ticket, de la colonne « Attend » et du tableau des décisions.
- **Chaque agent travaille dans son propre worktree.** Deux conversations dans le même dossier se gênent : la branche change sous leurs pieds, et leurs changements se mélangent.
- Quand un ticket est fini, on coche sa case ici et on met à jour `README.md`.

Texte à donner à un agent, en remplaçant le chemin. Le reste des règles est dans `AGENTS.md`, y compris l'obligation de s'arrêter et de te prévenir pour toute décision du client :

```text
Travaille sur le ticket docs/tickets/ttw-XXX-....md, dans ton propre worktree, sur une branche créée depuis main.
Arrête-toi à un commit local : ne pousse rien et n'ouvre pas de PR.
```

## L'ordre en bref

| Phase | But                                      | Tickets | Heures (Excel)             |
| ----- | ---------------------------------------- | ------- | -------------------------- |
| 0     | Fiabiliser la base et la CI              | 7       | hors Excel                 |
| 1     | Fermer les failles sécurité et argent    | 7       | 20–35 h                    |
| 2     | Comptes et achat d'un produit            | 10      | 73–122 h                   |
| 3     | Commander son design et l'imprimer       | 8       | 108–171 h                  |
| 4     | Produire, expédier, facturer             | 5       | 36–58 h                    |
| 5     | Outils d'administration                  | 12      | 41–65 h                    |
| 6     | Données personnelles, légal, site public | 11      | 47–79 h                    |
| 7     | Fundraising                              | 21      | 174–277 h                  |
| 8     | Recette et mise en ligne                 | 5       | 10–20 h, plus le catalogue |
| 9     | Après le lancement                       | 16      | 89–144 h                   |

Pourquoi cet ordre :

1. **La base d'abord.** Beaucoup de tickets changent la structure de la base de données. Le schéma et les migrations doivent d'abord être alignés.
2. **Les failles ensuite.** Elles sont courtes et dangereuses.
3. **Le parcours principal avant le fundraising.** Un client doit pouvoir créer un compte, acheter, commander son design et être livré. Le fundraising repose sur tout cela, et le client envisage de le repousser (Q23 et Q25).
4. **Le fonctionnel avant la maquette.** La refonte visuelle du Workshop (TTW-105) vient après les fonctions, pour ne pas la refaire.

Comment les tickets sont classés dans une phase :

- Les tickets déjà faits sont en haut du tableau, sans numéro.
- Les autres suivent l'ordre des lots.
- Dans un lot : d'abord celui qui débloque le plus de tickets, puis le risque le plus élevé, puis le numéro de ticket.
- Un ticket qui attend le client va dans un lot en fin de phase, pour ne pas retenir ce qui peut avancer. La phase 7 fait exception : presque tout y attend Q23 et Q25.

## Décisions à obtenir du client

Ces questions restent ouvertes : le client doit répondre ou demande d'abord du contexte. Elles bloquent des tickets, ou changent ce qu'ils doivent faire. La dernière colonne indique ce que je propose si on doit avancer sans réponse. Le message à lui envoyer est dans `revue-client/client-message-open-questions.md`.

| Question | Sujet                                                               | Bloque           | Par défaut proposé                                                                                |
| -------- | ------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| Q23, Q25 | **Le fundraising est-il repoussé après le lancement ?**             | Toute la phase 7 | Le garder en phase 7. S'il est repoussé, faire seulement TTW-146                                  |
| Q16      | Paiement tardif : le client demande du contexte                     | TTW-088          | Rembourser un paiement arrivé après annulation, sans changer le délai de 30 min                   |
| Q38      | Paliers de prix : le client demande du contexte                     | TTW-095          | Palier calculé sur le total du produit, toutes tailles et couleurs. Le supplément de taille reste |
| Q5       | Saisie du vrai catalogue : la question a été mal comprise           | Phase 8          | Reposer la question : qui saisit les produits de base, photos et prix ?                           |
| Q46      | Réseaux sociaux et contacts officiels                               | TTW-125          | Masquer les icônes tant qu'on n'a pas les adresses                                                |
| Q41      | Délai de modération et personne qui modère                          | —                | Sans effet sur le code, à noter pour la remise au client                                          |
| Q19      | Retours : 7 jours, pas de « changement d'avis » sur le personnalisé | TTW-117, TTW-149 | Écrire cette règle dans le texte légal, le client la fait confirmer                               |
| Q36, Q34 | Compte Paystack, frais de virement                                  | TTW-131          | Frais déduits de l'organisateur et affichés (réponse Q34)                                         |
| Q30      | Remboursement après versement à l'organisateur                      | TTW-132          | Déduire des prochains versements                                                                  |
| Q33      | Vérification d'identité des organisateurs                           | TTW-128          | À trancher avec Q23                                                                               |
| Q35      | Rythme des versements                                               | TTW-134, TTW-141 | Hebdomadaire, comme le client le suggère                                                          |
| Q17      | Fin de campagne et production                                       | TTW-141          | Production au fil de l'eau tant que Q17 est ouverte                                               |
| Q18      | Livraison des campagnes                                             | TTW-138          | Envoi à chaque soutien (hypothèse du client)                                                      |
| Q39      | Délai de l'option express                                           | TTW-153          | Attendre la réponse                                                                               |
| Nouvelle | Fichiers et licence web des polices Mundial et Neuffila Grotesk     | TTW-177          | Attendre la réponse ; sans licence, lui demander une police de remplacement validée               |
| Nouvelle | Logos de paiement du pied de page (PayPal non accepté)              | TTW-178          | Retirer PayPal, garder les cartes acceptées par Paystack en version lisible sur fond bleu         |

### Déjà répondues : rien à attendre

| Question | Réponse du client                                                            | Effet                                                                     |
| -------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Q21      | Les tarifs de livraison doivent être réglables                               | TTW-098 ne l'attend plus                                                  |
| Q28      | Designs personnels : on imprime, et on peut refuser et rembourser avec motif | TTW-058 applique cette règle, à faire confirmer au client                 |
| Q37      | Remises cumulables entre niveaux                                             | TTW-096 ne l'attend plus. Il faut lui dire que ce n'est pas encore le cas |
| Q42, Q47 | Il nous laisse comparer et recommander                                       | TTW-147 et TTW-124 commencent par cette comparaison                       |
| Q24      | La prolongation d'une campagne est acceptée                                  | Dans TTW-141                                                              |
| Q8       | Redirection vers Paystack acceptée                                           | Aucun travail                                                             |
| Q29      | Modération par IA préférée, lancement possible sans                          | Aucun travail : elle existe déjà                                          |
| TTW-166  | L'image d'une variante supprimée reste sur le produit, sur « All variants »  | TTW-166 ne l'attend plus                                                  |

## Phase 0 : Fiabiliser la base et la CI

| Fait | N°  | Ticket                                                        | Lot | Travail                                                           | Excel | Risque   | Heures | Attend |
| ---- | --- | ------------------------------------------------------------- | --- | ----------------------------------------------------------------- | ----- | -------- | ------ | ------ |
| [x]  | —   | [TTW-005](ttw-005-reconcile-prisma-schema-with-migrations.md) | 0A  | Aligner le schéma de la base et les migrations                    | —     | Élevé    | —      | —      |
| [x]  | —   | [TTW-080](ttw-080-make-open-handle-proof-fail-fast.md)        | 0A  | Faire échouer vite le contrôle de la CI qui peut rester bloqué    | —     | Faible   | —      | —      |
| [x]  | —   | [TTW-163](ttw-163-bound-bulk-tier-quantities.md)              | 0A  | Refuser les quantités de palier que la base ne peut pas stocker   | —     | Faible   | —      | —      |
| [x]  | —   | [TTW-164](ttw-164-ignore-generated-files-in-format-check.md)  | 0A  | Empêcher le contrôle de format d'échouer sur les fichiers générés | —     | Faible   | —      | —      |
| [x]  | —   | [TTW-170](ttw-170-align-playwright-gates-with-strategy.md)    | 0A  | Aligner les contrôles Playwright de la CI sur la stratégie écrite | —     | Standard | —      | —      |
| [x]  | —   | [TTW-081](ttw-081-enforce-unique-refund-provider-ref.md)      | 0A  | Interdire deux remboursements pour un même identifiant Paystack   | —     | Critique | —      | —      |
| [ ]  | 2   | [TTW-176](ttw-176-run-browser-matrix-in-ci.md)                | 0A  | Tester aussi Safari, Firefox et le mobile dans la CI              | —     | Standard | —      | —      |

## Phase 1 : Fermer les failles sécurité et argent

| Fait | N°  | Ticket                                                            | Lot | Travail                                                                     | Excel | Risque   | Heures | Attend       |
| ---- | --- | ----------------------------------------------------------------- | --- | --------------------------------------------------------------------------- | ----- | -------- | ------ | ------------ |
| [ ]  | 3   | [TTW-085](ttw-085-validate-production-mail-settings.md)           | 1A  | Vérifier au démarrage les réglages e-mail de production                     | 10.5  | Standard | 1–2    | —            |
| [ ]  | 4   | [TTW-082](ttw-082-link-google-sign-in-to-confirmed-emails.md)     | 1A  | Google : ne relier un compte que si l'e-mail est confirmé                   | 1.8   | Élevé    | 1–2    | —            |
| [ ]  | 5   | [TTW-084](ttw-084-create-default-site-settings.md)                | 1A  | Créer les réglages du site par défaut, pour que la TVA ne soit jamais à 0 % | 8.6   | Élevé    | 1–2    | —            |
| [ ]  | 6   | [TTW-086](ttw-086-reject-addresses-outside-shipping-zones.md)     | 1B  | Refuser une adresse hors zone de livraison                                  | 5.6   | Élevé    | 3–5    | —            |
| [ ]  | 7   | [TTW-083](ttw-083-hash-password-reset-and-verification-tokens.md) | 1B  | Stocker les jetons de réinitialisation et de vérification hachés            | 1.7   | Élevé    | 2–4    | —            |
| [ ]  | 8   | [TTW-087](ttw-087-offer-states-and-lgas-at-checkout.md)           | 1C  | Proposer États et LGA en liste au paiement                                  | 4.9   | Élevé    | 4–6    | TTW-086      |
| [ ]  | 9   | [TTW-088](ttw-088-refund-payments-captured-after-cancellation.md) | 1D  | Rembourser un paiement arrivé après annulation                              | 4.6   | Critique | 8–14   | TTW-081, Q16 |

## Phase 2 : Comptes et achat d'un produit

| Fait | N°  | Ticket                                                             | Lot | Travail                                                       | Excel    | Risque   | Heures | Attend           |
| ---- | --- | ------------------------------------------------------------------ | --- | ------------------------------------------------------------- | -------- | -------- | ------ | ---------------- |
| [ ]  | 10  | [TTW-092](ttw-092-build-product-detail-page.md)                    | 2A  | Fiche produit : galerie, taille, couleur, quantité par taille | 2.2, 2.1 | Standard | 25–40  | —                |
| [ ]  | 11  | [TTW-089](ttw-089-add-forgot-and-reset-password-pages.md)          | 2A  | Pages « mot de passe oublié » et réinitialisation             | 1.1      | Élevé    | 6–10   | TTW-083          |
| [ ]  | 12  | [TTW-094](ttw-094-let-admins-enter-size-and-print-surcharges.md)   | 2A  | Saisir les suppléments de taille et de face imprimée          | 2.7      | Élevé    | 8–14   | —                |
| [ ]  | 13  | [TTW-097](ttw-097-complete-shipping-zone-administration.md)        | 2A  | Corriger et supprimer tarifs et zones de livraison            | 8.2      | Élevé    | 6–10   | —                |
| [ ]  | 14  | [TTW-091](ttw-091-remove-fake-profile-picture.md)                  | 2A  | Retirer la fausse photo de profil et son bouton               | 1.2      | Faible   | 1      | —                |
| [ ]  | 15  | [TTW-090](ttw-090-show-email-verification-state-and-resend.md)     | 2B  | Message « e-mail non vérifié » et renvoi du lien              | 1.4      | Élevé    | 3–5    | TTW-089          |
| [ ]  | 16  | [TTW-093](ttw-093-use-real-categories-and-paginate-catalogue.md)   | 2B  | Vraies catégories et pagination du catalogue                  | 2.3      | Standard | 4–8    | TTW-092          |
| [ ]  | 17  | [TTW-098](ttw-098-make-shipping-rates-weight-or-quantity-based.md) | 2B  | Tarif de livraison selon le poids ou la quantité              | 5.7      | Élevé    | 6–10   | TTW-097, TTW-086 |
| [ ]  | 18  | [TTW-095](ttw-095-compute-bulk-tiers-on-total-product-quantity.md) | 2C  | Palier de prix calculé sur le total du produit                | 8.5      | Élevé    | 4–8    | TTW-094, Q38     |
| [ ]  | 19  | [TTW-096](ttw-096-apply-product-and-order-discounts.md)            | 2D  | Faire fonctionner les remises produit et commande             | 8.1      | Élevé    | 10–16  | TTW-095          |

## Phase 3 : Commander son design et l'imprimer

| Fait | N°  | Ticket                                                           | Lot | Travail                                                        | Excel     | Risque   | Heures | Attend           |
| ---- | --- | ---------------------------------------------------------------- | --- | -------------------------------------------------------------- | --------- | -------- | ------ | ---------------- |
| [ ]  | 20  | [TTW-099](ttw-099-make-customer-uploads-private.md)              | 3A  | Rendre les fichiers clients privés, avec des liens temporaires | 11.3, 9.7 | Élevé    | 8–14   | —                |
| [ ]  | 21  | [TTW-102](ttw-102-add-delete-undo-and-layers-to-the-workshop.md) | 3A  | Supprimer un élément, annuler, liste des calques               | 3.3       | Standard | 10–16  | —                |
| [ ]  | 22  | [TTW-100](ttw-100-validate-design-content-on-the-server.md)      | 3B  | Valider le contenu d'un design côté serveur                    | 3.7       | Élevé    | 10–16  | TTW-099          |
| [ ]  | 23  | [TTW-103](ttw-103-load-the-fonts-the-workshop-offers.md)         | 3B  | Charger réellement les polices proposées                       | 3.11      | Standard | 4–6    | TTW-102          |
| [ ]  | 24  | [TTW-058](ttw-058-order-saved-designs-from-the-workshop.md)      | 3C  | Ajouter un design au panier et le commander                    | 3.1, 3.8  | Élevé    | 22–33  | TTW-100, TTW-092 |
| [ ]  | 25  | [TTW-101](ttw-101-give-the-workshop-its-print-files.md)          | 3D  | Donner à l'atelier les fichiers d'impression                   | 3.2       | Élevé    | 20–35  | TTW-058, TTW-099 |
| [ ]  | 26  | [TTW-104](ttw-104-warn-about-low-resolution-images.md)           | 3D  | Alerter si l'image est trop petite pour bien s'imprimer        | 3.10      | Standard | 4–6    | TTW-103          |
| [ ]  | 27  | [TTW-105](ttw-105-align-workshop-layout-with-figma.md)           | 3E  | Aligner la mise en page du Workshop sur Figma                  | 3.4       | Standard | 30–45  | TTW-104          |

## Phase 4 : Produire, expédier, facturer

| Fait | N°  | Ticket                                                         | Lot | Travail                                          | Excel | Risque   | Heures | Attend |
| ---- | --- | -------------------------------------------------------------- | --- | ------------------------------------------------ | ----- | -------- | ------ | ------ |
| [ ]  | 28  | [TTW-106](ttw-106-build-the-admin-shipment-screen.md)          | 4A  | Écran d'expédition : marquer expédié et livré    | 5.1   | Élevé    | 15–25  | —      |
| [ ]  | 29  | [TTW-107](ttw-107-let-customers-cancel-unpaid-orders.md)       | 4A  | Annuler soi-même une commande non payée          | 5.2   | Critique | 3–5    | —      |
| [ ]  | 30  | [TTW-110](ttw-110-build-failed-email-screens.md)               | 4A  | Renvoyer les e-mails en échec depuis l'admin     | 10.2  | Élevé    | 8–12   | —      |
| [ ]  | 31  | [TTW-109](ttw-109-send-design-approved-and-rejected-emails.md) | 4A  | Envoyer les e-mails « design approuvé / refusé » | 9.2   | Standard | 2–4    | —      |
| [ ]  | 32  | [TTW-108](ttw-108-add-downloadable-vat-invoices.md)            | 4B  | Facture téléchargeable conforme à la TVA         | 4.8   | Élevé    | 8–12   | —      |

## Phase 5 : Outils d'administration

| Fait | N°  | Ticket                                                       | Lot | Travail                                                               | Excel | Risque   | Heures | Attend  |
| ---- | --- | ------------------------------------------------------------ | --- | --------------------------------------------------------------------- | ----- | -------- | ------ | ------- |
| [x]  | —   | [TTW-165](ttw-165-fix-image-variant-select-crash.md)         | 5A  | Fiche produit admin : plantage dès qu'il y a une image                | —     | Faible   | —      | —       |
| [ ]  | 33  | [TTW-174](ttw-174-keep-variants-when-adding-an-option.md)    | 5A  | Fiche produit admin : garder les variantes quand on ajoute une option | —     | Élevé    | 8–14   | —       |
| [ ]  | 34  | [TTW-111](ttw-111-let-admins-suspend-users.md)               | 5A  | Suspendre un utilisateur                                              | 1.9   | Élevé    | 6–10   | —       |
| [ ]  | 35  | [TTW-114](ttw-114-build-paystack-reconciliation-screens.md)  | 5A  | Écrans de rapprochement Paystack                                      | 10.1  | Élevé    | 20–30  | —       |
| [ ]  | 36  | [TTW-113](ttw-113-fix-admin-google-sign-in.md)               | 5A  | Réparer ou retirer la connexion Google des admins                     | 1.3   | Élevé    | 6–10   | —       |
| [ ]  | 37  | [TTW-115](ttw-115-show-queue-counters-on-admin-dashboard.md) | 5A  | Compteurs de files d'attente sur le tableau de bord admin             | 9.6   | Standard | 3–5    | —       |
| [ ]  | 38  | [TTW-116](ttw-116-add-missing-admin-alerts.md)               | 5A  | Alertes admin manquantes                                              | 10.8  | Standard | 4–6    | —       |
| [ ]  | 39  | [TTW-166](ttw-166-stop-variant-changes-deleting-images.md)   | 5B  | Fiche produit admin : images perdues avec une variante                | —     | Élevé    | 3–5    | TTW-174 |
| [ ]  | 40  | [TTW-112](ttw-112-add-admin-two-factor-reset-screen.md)      | 5B  | Écran de réinitialisation de la double authentification               | 1.10  | Élevé    | 2–4    | TTW-111 |
| [ ]  | 41  | [TTW-168](ttw-168-report-failed-admin-product-saves.md)      | 5C  | Fiche produit admin : signaler les changements refusés                | —     | Faible   | —      | —       |
| [ ]  | 42  | [TTW-173](ttw-173-document-image-update-contract.md)         | 5C  | Documenter dans l'API comment délier une image d'une variante         | —     | Faible   | —      | —       |
| [ ]  | 43  | [TTW-169](ttw-169-tighten-image-variant-journey.md)          | 5D  | Resserrer le test image et variante                                   | —     | Faible   | —      | —       |

## Phase 6 : Données personnelles, légal, site public

| Fait | N°  | Ticket                                                      | Lot | Travail                                            | Excel | Risque   | Heures | Attend           |
| ---- | --- | ----------------------------------------------------------- | --- | -------------------------------------------------- | ----- | -------- | ------ | ---------------- |
| [ ]  | 44  | [TTW-119](ttw-119-build-data-rights-screens.md)             | 6A  | Écrans export, suppression de compte, préférences  | 11.1  | Élevé    | 12–18  | —                |
| [ ]  | 45  | [TTW-120](ttw-120-erase-files-of-deleted-accounts.md)       | 6A  | Effacer vraiment les fichiers d'un compte supprimé | 11.2  | Élevé    | 6–10   | TTW-099          |
| [ ]  | 46  | [TTW-123](ttw-123-add-public-catalogue-and-site-menu.md)    | 6A  | Catalogue public et menu cohérent                  | 2.4   | Standard | 15–25  | TTW-092          |
| [ ]  | 47  | [TTW-118](ttw-118-remove-unproven-about-page-figures.md)    | 6A  | Retirer les faux chiffres de la page About         | 12.6  | Faible   | 0      | —                |
| [ ]  | 48  | [TTW-126](ttw-126-compress-homepage-photos.md)              | 6A  | Alléger les photos d'accueil                       | 12.5  | Faible   | 1–2    | —                |
| [ ]  | 49  | [TTW-127](ttw-127-add-global-error-page.md)                 | 6A  | Page d'erreur globale du site public               | 12.7  | Faible   | 1–2    | —                |
| [ ]  | 50  | [TTW-121](ttw-121-recalibrate-account-deletion-blockers.md) | 6B  | Revoir ce qui bloque la suppression d'un compte    | 11.6  | Élevé    | 3–5    | TTW-106, TTW-120 |
| [ ]  | 51  | [TTW-122](ttw-122-add-unsubscribe-links.md)                 | 6B  | Lien de désinscription dans les e-mails            | 10.9  | Standard | 2–4    | TTW-119          |
| [ ]  | 52  | [TTW-124](ttw-124-add-audience-measurement.md)              | 6B  | Mesure d'audience                                  | 12.4  | Standard | 4–8    | —                |
| [ ]  | 53  | [TTW-117](ttw-117-draft-and-publish-legal-texts.md)         | 6C  | Rédiger et intégrer les textes légaux              | 11.4  | Standard | 2–4    | Q19              |
| [ ]  | 54  | [TTW-125](ttw-125-replace-fake-social-links.md)             | 6C  | Vrais liens sociaux et contacts                    | 12.2  | Faible   | 1      | Q46              |
| [ ]  | —   | [TTW-177](ttw-177-ship-brand-fonts.md)                      | 6C  | Charger les polices de la marque sur tout le site  | —     | Standard | —      | Polices (client) |
| [ ]  | —   | [TTW-178](ttw-178-fix-footer-payment-logos.md)              | 6C  | Logos de paiement lisibles, sans PayPal            | —     | Faible   | 1–2    | Logos (client)   |

## Phase 7 : Fundraising

**Si le client repousse le fundraising :** cette phase passe après le lancement, et on fait seulement [TTW-146](ttw-146-hide-fundraising-until-launch.md), qui masque ces pages et coupe les versements. Le ticket [TTW-146](ttw-146-hide-fundraising-until-launch.md) est le seul de cette phase à ne pas compter dans le total.

| Fait | N°  | Ticket                                                                    | Lot | Travail                                                     | Excel          | Risque   | Heures | Attend                      |
| ---- | --- | ------------------------------------------------------------------------- | --- | ----------------------------------------------------------- | -------------- | -------- | ------ | --------------------------- |
| [x]  | —   | [TTW-167](ttw-167-filter-banks-without-a-code.md)                         | 7A  | Liste des banques : écarter les banques sans code           | —              | Élevé    | —      | —                           |
| [ ]  | 55  | [TTW-175](ttw-175-fix-bank-selector-choices.md)                           | 7A  | Banques proposées : virement possible et bon nom enregistré | —              | Élevé    | —      | clé de test Paystack        |
| [ ]  | 56  | [TTW-039](ttw-039-seed-sellable-fundraiser-offer-and-checkout-journey.md) | 7A  | Campagne de démo et test du parcours d'un soutien           | —              | Standard | —      | Q23, Q25                    |
| [ ]  | 57  | [TTW-128](ttw-128-build-organiser-approval-screen.md)                     | 7A  | Écran d'approbation des organisateurs                       | 6.1, 7.7       | Élevé    | 10–15  | Q23, Q33, Q25               |
| [ ]  | 58  | [TTW-142](ttw-142-freeze-live-campaigns.md)                               | 7A  | Figer la campagne une fois en ligne                         | 9.5            | Élevé    | 4–8    | Q23, Q25                    |
| [ ]  | 59  | [TTW-143](ttw-143-show-moderators-a-real-render.md)                       | 7A  | Vrai rendu du design pour les modérateurs                   | 9.3            | Élevé    | 4–8    | TTW-101, Q23, Q25           |
| [ ]  | 60  | [TTW-140](ttw-140-add-campaign-resume-button.md)                          | 7A  | Bouton de reprise d'une campagne en pause                   | 6.10           | Faible   | 1–2    | Q23, Q25                    |
| [ ]  | 61  | [TTW-129](ttw-129-build-bank-account-verification-queue.md)               | 7B  | Vérifier les comptes bancaires des organisateurs            | 7.1, 6.11      | Critique | 8–12   | TTW-128, Q23, Q25           |
| [ ]  | 62  | [TTW-131](ttw-131-correct-the-campaign-money-split.md)                    | 7C  | Corriger le partage de l'argent d'une campagne              | 6.2, 6.14, 7.6 | Critique | 25–40  | TTW-129, Q36, Q34, Q23, Q25 |
| [ ]  | 63  | [TTW-130](ttw-130-check-account-holder-name-with-paystack.md)             | 7C  | Contrôler le nom du titulaire avec Paystack                 | 7.2            | Élevé    | 6–10   | TTW-129, Q23, Q25           |
| [ ]  | 64  | [TTW-136](ttw-136-allow-guest-fundraiser-checkout.md)                     | 7D  | Paiement sans compte pour les soutiens                      | 4.7            | Critique | 20–30  | TTW-039, TTW-131, Q23, Q25  |
| [ ]  | 65  | [TTW-134](ttw-134-show-organisers-their-money.md)                         | 7D  | Montrer aux organisateurs leur solde et leurs versements    | 7.9            | Élevé    | 8–12   | TTW-131, Q35, Q23, Q25      |
| [ ]  | 66  | [TTW-144](ttw-144-show-campaign-end-date-and-sales.md)                    | 7D  | Date de fin et ventes sur la page publique                  | 6.9            | Standard | 3–5    | TTW-131, Q23, Q25           |
| [ ]  | 67  | [TTW-132](ttw-132-define-refund-recovery-after-payout.md)                 | 7D  | Règle de remboursement après versement                      | 6.13           | Critique | 6–10   | TTW-131, Q30, Q23, Q25      |
| [ ]  | 68  | [TTW-133](ttw-133-cap-one-off-payouts.md)                                 | 7D  | Plafonner le versement manuel et exiger deux admins         | 7.8            | Critique | 4–8    | TTW-131, Q23, Q25           |
| [ ]  | 69  | [TTW-135](ttw-135-let-organisers-edit-bank-accounts.md)                   | 7D  | Modifier ou supprimer son compte bancaire                   | 7.3            | Élevé    | 4–6    | TTW-130, Q23, Q25           |
| [ ]  | 70  | [TTW-141](ttw-141-complete-campaign-end-handling.md)                      | 7D  | Fin de campagne et page archivée                            | 6.12           | Élevé    | 6–10   | TTW-131, Q17, Q35, Q23, Q25 |
| [ ]  | 71  | [TTW-137](ttw-137-add-fundraiser-donations.md)                            | 7E  | Dons libres dans le paiement                                | 4.5            | Critique | 40–60  | TTW-136, Q23, Q25           |
| [ ]  | 72  | [TTW-139](ttw-139-show-organisers-their-campaign-orders.md)               | 7E  | Écran des commandes de la campagne pour l'organisateur      | 5.9            | Élevé    | 6–10   | TTW-134, Q23, Q25           |
| [ ]  | 73  | [TTW-138](ttw-138-add-campaign-delivery-options.md)                       | 7F  | Options de livraison d'une campagne                         | 5.4            | Élevé    | 15–25  | TTW-131, Q18, Q23, Q25      |
| [ ]  | 74  | [TTW-145](ttw-145-add-campaign-headline-and-video.md)                     | 7G  | Titre et vidéo optionnelle de campagne                      | 6.8            | Standard | 4–6    | TTW-144, Q23, Q25           |

## Phase 8 : Recette et mise en ligne

| Fait | N°  | Ticket                                                                                                                                            | Lot | Travail                                        | Excel | Risque   | Heures | Attend      |
| ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------------------------------- | ----- | -------- | ------ | ----------- |
| [ ]  | 75  | [TTW-147](ttw-147-choose-and-configure-email-provider.md)                                                                                         | 8A  | Choisir et configurer le fournisseur d'e-mail  | —     | Élevé    | —      | TTW-085     |
| [ ]  | 76  | [TTW-061](ttw-061-establish-iac-foundation.md), [TTW-062](ttw-062-provision-network-dns-edge.md), [TTW-063](ttw-063-deploy-production-runtime.md) | 8A  | Terminer les relectures d'infra et déployer    | —     | Élevé    | —      | —           |
| [ ]  | 77  | pas de ticket                                                                                                                                     | 8B  | Saisir le vrai catalogue                       | 2.9   | Standard | 20–60  | Q5, TTW-174 |
| [ ]  | 78  | [TTW-148](ttw-148-run-end-to-end-tests-and-client-acceptance.md)                                                                                  | 8C  | Tests de bout en bout et recette par le client | 13.3  | Élevé    | 10–20  | TTW-147     |

## Phase 9 : Après le lancement

Priorité P2 de l'Excel, sauf indication contraire : à classer selon les retours des vrais utilisateurs.

| Fait | N°  | Ticket                                                          | Lot | Travail                                                      | Excel | Risque   | Heures | Attend  |
| ---- | --- | --------------------------------------------------------------- | --- | ------------------------------------------------------------ | ----- | -------- | ------ | ------- |
| [ ]  | 79  | [TTW-150](ttw-150-build-moderation-appeal-screens.md)           | 9A  | Écrans d'appel de modération                                 | 9.1   | Élevé    | 15–20  | —       |
| [ ]  | 80  | [TTW-154](ttw-154-add-audit-log-screen.md)                      | 9A  | Consulter le journal d'audit                                 | 10.4  | Élevé    | 6–10   | —       |
| [ ]  | 81  | [TTW-158](ttw-158-add-active-sessions-screen.md)                | 9A  | Écran « sessions actives »                                   | 1.5   | Élevé    | 4–8    | —       |
| [ ]  | 82  | [TTW-151](ttw-151-complete-admin-analytics.md)                  | 9A  | Graphiques et filtres des statistiques                       | 10.3  | Standard | 8–14   | —       |
| [ ]  | 83  | [TTW-152](ttw-152-add-workshop-earnings-metric.md)              | 9A  | Métrique de gain de l'atelier                                | 10.7  | Standard | 4–6    | TTW-131 |
| [ ]  | 84  | [TTW-155](ttw-155-paginate-admin-orders.md)                     | 9A  | Pagination des commandes côté admin                          | 5.8   | Standard | 4–8    | —       |
| [ ]  | 85  | [TTW-159](ttw-159-add-share-link-management.md)                 | 9A  | Écran de gestion des liens de partage                        | 3.6   | Standard | 3–5    | —       |
| [ ]  | 86  | [TTW-161](ttw-161-allow-local-courier-tracking-links.md)        | 9A  | Liens de suivi pour les coursiers locaux                     | 5.10  | Standard | 1–2    | —       |
| [ ]  | 87  | [TTW-156](ttw-156-add-search-to-admin-products.md)              | 9A  | Recherche et pagination des produits côté admin              | 2.8   | Faible   | 2–4    | —       |
| [ ]  | 88  | [TTW-157](ttw-157-expose-catalogue-search-and-filters.md)       | 9A  | Recherche, tri et filtre prix du catalogue                   | 2.6   | Faible   | 4–6    | —       |
| [ ]  | 89  | [TTW-162](ttw-162-darken-green-button-colour.md)                | 9A  | Assombrir le vert des boutons                                | 12.8  | Faible   | 1–3    | —       |
| [ ]  | 90  | [TTW-171](ttw-171-limit-bulk-tier-prices.md)                    | 9A  | Refuser les prix de palier que la base ne peut pas stocker   | —     | Faible   | —      | —       |
| [ ]  | 91  | [TTW-172](ttw-172-reject-unknown-bulk-tier-references.md)       | 9B  | Refuser devise, produit et variante inconnus sur les paliers | —     | Faible   | —      | —       |
| [ ]  | 92  | [TTW-160](ttw-160-align-order-summary-with-figma.md)            | 9B  | Récapitulatif plus proche de Figma                           | 4.4   | Faible   | 4–8    | —       |
| [ ]  | 93  | [TTW-149](ttw-149-add-returns-and-claims.md)                    | 9C  | Retours et réclamations                                      | 5.3   | Critique | 30–45  | Q19     |
| [ ]  | 94  | [TTW-153](ttw-153-show-delivery-estimate-and-express-option.md) | 9C  | Délai estimé et option express                               | 8.7   | Élevé    | 3–5    | Q39     |

**Options repoussées par le client** (50–90 h, sans ticket tant que le client ne les redemande pas) :

- 1.11 Rôles admin séparés : 15–25 h (Q26, à faire quand l'équipe grandit).
- 3.9 Fichiers vectoriels SVG et PDF : 10–20 h (Q27, seulement si c'est peu coûteux).
- 3.5 Plusieurs produits dans une session : 15–25 h (Q6, pas nécessaire).
- 5.5 Regrouper la production d'une campagne : 10–20 h (Q17, en attente du propriétaire).

**Tickets reportés après la v1** : [TTW-044](ttw-044-integrate-carrier-labels-and-webhooks.md) (transporteurs), [TTW-045](ttw-045-support-partial-and-multi-package-shipments.md) (plusieurs colis), [TTW-046](ttw-046-handle-chargebacks-and-payment-disputes.md) (litiges de paiement), [TTW-047](ttw-047-automate-reverse-logistics.md) (étiquettes de retour), [TTW-048](ttw-048-productionize-notification-providers.md) (secours entre fournisseurs), [TTW-049](ttw-049-add-consented-marketing-segmentation.md) (segmentation marketing), [TTW-055](ttw-055-unify-standard-catalogue-cart-and-checkout.md) (panier unifié sur le site), [TTW-056](ttw-056-reconcile-bank-and-accounting-records.md) (banque et comptabilité), [TTW-057](ttw-057-support-international-money-and-payouts.md) (international).

## Ce qu'on ne fait pas

| Excel | Sujet                                  | Raison                                                   |
| ----- | -------------------------------------- | -------------------------------------------------------- |
| 2.5   | Avis produits                          | Q7 : non                                                 |
| 4.1   | Codes promo saisis par le client       | Q12 : non                                                |
| 4.2   | Paiement à la livraison                | Q11 : en ligne seulement, le client reviendra dessus     |
| 6.3   | Assistant de campagne en 3 étapes      | Q9 : page unique acceptée (35–60 h économisées)          |
| 4.3   | Commandes en double                    | Déjà corrigé (TTW-037)                                   |
| 8.4   | Calculs en nombres à virgule flottante | Information, risque faible en naira, aucun travail prévu |
| 13.4  | Couverture de tests moyenne            | Information : chaque correctif ajoute ses propres tests  |

## Limites de ce document

- Les lignes Excel datent du 21 octobre. Chaque ticket demande de revérifier le problème dans le code avant de commencer.
- Les lots sont calculés à partir des zones de code prévues. Ils ont été revérifiés le 6 novembre 2026, mais seulement sur les chemins de fichiers cités dans les tickets, et une partie des tickets n'en cite aucun. Un agent qui découvre un chevauchement doit le signaler avant de continuer.
- Les heures sont des estimations de la revue. Elles ne comptent ni les tickets sans ligne Excel, ni la rédaction des textes légaux.
- Les tickets à risque élevé ou critique prendront plus de temps de relecture.
