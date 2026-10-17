"""Salaires (rémunérations des travaux et manuelles), paiements, dépenses, reçus, tableau de bord et rapport Excel."""
from io import StringIO

from django.core.management import call_command

from apps.accounts.models import Journal
from apps.core.testing import AUJOURDHUI, HIER, XLSX, ApiTestCase, jour, lire_classeur
from apps.finances.models import CategorieDepense, Depense, PaiementSalaire, Prevision, Salaire


class SalairesTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ids = self.referentiel()
        # Cas 1 : 3 saigneurs ensemble, 300 kg × 250 = 75 000 ; cas 2 : une seule personne, 80 kg × 250 = 20 000
        self.equipe = self.creer_travail(self.ids[:3], chef=self.ids[0], equipe_nom='Saigneurs', activite='SAIGNEE',
                                         unite='kg', quantite=300, prix_unitaire=250)
        self.seul = self.creer_travail([self.ids[3]], activite='SAIGNEE', unite='kg', quantite=80, prix_unitaire=250)
        self.salaire_equipe = Salaire.objects.get(travail_id=self.equipe['id'])
        self.salaire_seul = Salaire.objects.get(travail_id=self.seul['id'])

    def payer(self, salaire, montant, status=201, **valeurs):
        return self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': montant, 'type_paiement': 'ESPECES',
                                                **valeurs}, status=status)

    def test_remuneration_generee_par_chaque_travail(self):
        remunerations = {r['travail']['id']: r for r in self.get('salaires/') if r['travail']}
        equipe = remunerations[self.equipe['id']]
        self.assertEqual((equipe['origine'], equipe['personne_id'], equipe['montant_du'], equipe['statut'], equipe['statut_libelle']),
                         ('TRAVAIL', self.ids[0], 75000.0, 'NON_PAYEE', 'À payer'))
        self.assertEqual((equipe['equipe']['nom'], equipe['equipe']['chef_id']), ('Saigneurs', self.ids[0]))
        self.assertEqual([b['id'] for b in equipe['beneficiaires']][0], self.ids[0])  # chef proposé en premier
        self.assertEqual(remunerations[self.seul['id']]['montant_du'], 20000.0)

    def test_paiement_via_le_chef_d_equipe(self):
        paiement = self.payer(self.salaire_equipe, 75000)  # bénéficiaire par défaut : le chef
        self.assertEqual((paiement['beneficiaire_id'], paiement['via_chef'], paiement['numero']), (self.ids[0], True, 'PAY-00001'))
        remuneration = self.get(f'salaires/{self.salaire_equipe.pk}/')
        self.assertEqual((remuneration['statut'], remuneration['reste']), ('PAYEE', 0.0))
        situation = {p['personne_id']: p for p in remuneration['participants']}
        self.assertIsNone(situation[self.ids[0]]['paye_via_libelle'])
        self.assertEqual(situation[self.ids[0]]['montant_recu'], 75000.0)
        for membre in self.ids[1:3]:
            self.assertTrue(situation[membre]['paye_via_chef'])
            self.assertIn("Payé via le chef d'équipe", situation[membre]['paye_via_libelle'])
            self.assertEqual(situation[membre]['montant_recu'], 0.0)
        # Visible aussi dans l'historique du membre
        historique = self.get(f'personnes/{self.ids[1]}/historique/')
        self.assertIn("via le chef d'équipe", historique['travaux'][0]['remuneration']['paye_via_libelle'])

    def test_paiement_a_un_membre_et_beneficiaire_hors_equipe(self):
        self.payer(self.salaire_equipe, 1000, beneficiaire_id=self.ids[3], status=400)
        self.payer(self.salaire_equipe, 30000, beneficiaire_id=self.ids[2])
        situation = {p['personne_id']: p for p in self.get(f'salaires/{self.salaire_equipe.pk}/')['participants']}
        # Le chef n'a rien reçu lui-même : il apparaît « payé via » le membre bénéficiaire
        self.assertEqual(situation[self.ids[0]]['paye_via_libelle'], 'Partiellement payé via P Nom2')
        self.assertFalse(situation[self.ids[0]]['paye_via_chef'])
        self.assertIsNone(situation[self.ids[2]]['paye_via_libelle'])

    def test_paiement_borne_par_le_reste_et_personne_seule(self):
        self.assertIn('montant', self.payer(self.salaire_seul, 20001, status=400))
        paiement = self.payer(self.salaire_seul, 20000)
        self.assertEqual((paiement['beneficiaire_id'], paiement['via_chef'], paiement['mode']), (self.ids[3], False, 'INDIVIDUEL'))
        self.assertEqual(self.get(f'salaires/{self.salaire_seul.pk}/')['statut'], 'PAYEE')

    def test_remuneration_soldee_quitte_la_liste_et_revient_si_le_paiement_est_annule(self):
        """Entièrement payée, une rémunération passe dans « Paiements effectués » ; un paiement annulé la ramène dans la liste."""
        def ids(url):
            return {r['id'] for r in self.get(url)}
        liste = 'salaires/?masquer_soldees=true'
        self.assertIn(self.salaire_seul.pk, ids(liste))
        paiement = self.payer(self.salaire_seul, 20000)  # soldée
        self.assertNotIn(self.salaire_seul.pk, ids(liste))
        self.assertIn(self.salaire_equipe.pk, ids(liste))  # non payée : reste
        # Sans le paramètre, ou avec le statut « Payé » : la rémunération soldée reste consultable
        self.assertIn(self.salaire_seul.pk, ids('salaires/'))
        self.assertIn(self.salaire_seul.pk, ids('salaires/?statut=PAYEE'))
        # Les indicateurs portent sur toutes les rémunérations, masquées ou non
        self.assertEqual(self.get('salaires/totaux/?masquer_soldees=true')['paye'], self.get('salaires/totaux/')['paye'])
        self.assertEqual(self.get('salaires/totaux/?masquer_soldees=true')['paye'], 20000.0)
        # Un paiement partiel ne la fait pas quitter la liste
        self.payer(self.salaire_equipe, 1000)
        self.assertIn(self.salaire_equipe.pk, ids(liste))
        # Le paiement du paiement soldé est annulé : la rémunération revient dans la liste
        self.post(f"paiements-salaire/{paiement['id']}/annuler/", {'motif': 'Erreur de saisie'}, status=200)
        self.assertIn(self.salaire_seul.pk, ids(liste))
        self.assertEqual(self.get(f'salaires/{self.salaire_seul.pk}/')['statut'], 'NON_PAYEE')

    def test_chaque_paiement_cree_une_seule_depense(self):
        paiement = self.payer(self.salaire_seul, 5000)
        depense = Depense.objects.get(pk=paiement['depense_id'])
        self.assertEqual((depense.categorie.code, depense.montant_total, depense.statut, depense.numero_justificatif, depense.bloc_id),
                         (CategorieDepense.CODE_SALAIRES, 5000, 'PAYEE', paiement['numero'], self.bloc['id']))
        self.assertIn('P Nom3', depense.designation)
        origine = self.get(f'depenses/{depense.pk}/')['origine']
        self.assertEqual((origine['type'], origine['reference'], origine['beneficiaire_nom']), ('SALAIRE', paiement['numero'], 'P Nom3'))
        # Modifier le paiement met à jour la même dépense (pas de doublon)
        self.patch(f"paiements-salaire/{paiement['id']}/", {'montant': 7000})
        depense.refresh_from_db()
        self.assertEqual((depense.montant_total, Depense.objects.filter(categorie__code=CategorieDepense.CODE_SALAIRES).count()), (7000, 1))
        # La dépense ne se modifie ni ne se supprime directement
        self.patch(f'depenses/{depense.pk}/', {'designation': 'X'}, status=400)
        self.delete(f'depenses/{depense.pk}/', status=400)
        # Supprimer le paiement (Super admin) supprime sa dépense
        self.login(self.superviseur.username)
        self.delete(f"paiements-salaire/{paiement['id']}/", status=403)
        self.login(self.admin.username)
        self.delete(f"paiements-salaire/{paiement['id']}/")
        self.assertFalse(Depense.objects.filter(pk=depense.pk).exists())

    def test_nouveau_paiement_groupe_tout_ou_rien(self):
        manuelle = self.post('salaires/', {'personne_id': self.ids[0], 'periode': '2025-09', 'montant_brut': 60000})
        lot = {'beneficiaire_id': self.ids[0], 'date': HIER, 'type_paiement': 'ESPECES', 'lignes': [
            {'salaire_id': self.salaire_equipe.pk, 'montant': 75000}, {'salaire_id': manuelle['id'], 'montant': 60001}]}
        errors = self.post('paiements-salaire/lot/', lot, status=400)
        self.assertIn('montant', errors['lignes'][1])
        self.assertEqual(PaiementSalaire.objects.count(), 0)
        # Un bénéficiaire non concerné par une des rémunérations est refusé
        refuse = {**lot, 'beneficiaire_id': self.ids[3], 'lignes': [{'salaire_id': self.salaire_equipe.pk, 'montant': 1}]}
        self.assertIn('salaire_id', self.post('paiements-salaire/lot/', refuse, status=400)['lignes'][0])
        lot['lignes'][1]['montant'] = 60000
        crees = self.post('paiements-salaire/lot/', lot)
        self.assertEqual(len(crees), 2)
        self.assertEqual(len({p['groupe'] for p in crees}), 1)
        self.assertEqual({self.get(f"salaires/{p['salaire_id']}/")['statut'] for p in crees}, {'PAYEE'})
        self.assertEqual(Depense.objects.filter(categorie__code=CategorieDepense.CODE_SALAIRES).count(), 2)

    def test_remuneration_manuelle(self):
        base = {'personne_id': self.ids[1], 'periode': '2025-09', 'montant_brut': 60000, 'montant_ponction': 10000}
        manuelle = self.post('salaires/', base)
        self.assertEqual((manuelle['origine'], manuelle['montant_net'], manuelle['libelle']),
                         ('MANUELLE', 50000.0, 'Rémunération Septembre 2025'))
        self.assertIn('periode', self.post('salaires/', base, status=400))
        self.assertIn('montant_ponction', self.post('salaires/', {**base, 'periode': '2025-10', 'montant_ponction': 70000}, status=400))

    def test_aucune_remuneration_ne_se_modifie_directement(self):
        manuelle = self.post('salaires/', {'personne_id': self.ids[1], 'periode': '2025-09', 'montant_brut': 60000})
        for cible in (manuelle['id'], self.salaire_equipe.pk):
            self.patch(f'salaires/{cible}/', {'montant_brut': 1}, status=405)
            self.patch(f'salaires/{cible}/', {'montant_ponction': 5000}, status=405)
            self.assertEqual(self.client.put(f'/api/v1/salaires/{cible}/', {'montant_brut': 1}, format='json').status_code, 405)
        self.assertEqual(Salaire.objects.get(pk=self.salaire_equipe.pk).montant_net, 75000)
        # La correction passe par le travail : le montant de la rémunération le suit
        self.patch(f"travaux/{self.equipe['id']}/", {'quantite': 320})
        self.assertEqual(self.get(f'salaires/{self.salaire_equipe.pk}/')['montant_du'], 80000.0)

    def test_annulation_d_une_remuneration_manuelle(self):
        manuelle = self.post('salaires/', {'personne_id': self.ids[1], 'periode': '2025-09', 'montant_brut': 60000})
        annulee = self.post(f"salaires/{manuelle['id']}/annuler/", {}, status=200)
        self.assertEqual((annulee['statut'], annulee['statut_libelle'], annulee['reste']), ('ANNULEE', 'Annulé', 0.0))
        self.assertIn('annulée', self.post('paiements-salaire/', {'salaire_id': manuelle['id'], 'montant': 1,
                                                                  'type_paiement': 'ESPECES'}, status=400)['detail'][0])
        self.post(f'salaires/{self.salaire_equipe.pk}/annuler/', {}, status=400)

    def test_recu_de_paiement_pdf(self):
        paiement = self.payer(self.salaire_equipe, 25000)
        response = self.client.get(f"/api/v1/paiements-salaire/{paiement['id']}/recu/")
        self.assertEqual((response.status_code, response['Content-Type']), (200, 'application/pdf'))
        self.assertIn(f'filename="Recu_{paiement["numero"]}.pdf"', response['Content-Disposition'])
        self.assertTrue(response.content.startswith(b'%PDF'))
        self.assertTrue(Journal.objects.filter(action='Consultation', table_concernee='Reçu').exists())

    def test_tableau_de_bord(self):
        self.payer(self.salaire_equipe, 25000, date=HIER)
        kpis = self.get(f'tableau-de-bord/?periode={HIER[:7]}')['kpis']
        # Rémunérations des deux travaux du mois (75 000 + 20 000), dont 25 000 payés
        self.assertEqual((kpis['remunerationDuee'], kpis['remunerationPayee'], kpis['resteAPayer']), (95000.0, 25000.0, 70000.0))
        # Le paiement de salaire compte aussi dans les dépenses du mois
        self.assertEqual(kpis['totalDepenses'], 25000.0)

    def test_rapport_excel(self):
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        self.post('depenses/', {'designation': '=Gasoil tracteur', 'categorie_id': categorie['id'], 'bloc_id': self.bloc['id'],
                                'date': '2025-09-10', 'montant_total': 7000.5, 'statut': 'PAYEE'})
        self.post('salaires/', {'personne_id': self.ids[1], 'periode': '2025-09', 'montant_brut': 50000})
        response = self.client.get('/api/v1/rapport/?periode=2025-09')
        self.assertEqual((response.status_code, response['Content-Type']), (200, XLSX))
        self.assertIn('attachment; filename="ALLAKRO_Rapport_2025-09.xlsx"', response['Content-Disposition'])
        noms, textes, feuilles = lire_classeur(response.content)
        self.assertEqual(noms, ['Synthèse', 'Bilan financier', 'Dépenses', 'Achats particuliers',
                                'Rémunérations', 'Paiements', 'Travaux', 'Exploitation', 'Stock', 'Mouvements de stock',
                                'Journal'])
        self.assertIn('Septembre 2025', textes)
        self.assertIn('=Gasoil tracteur', textes)  # un texte saisi reste du texte, jamais une formule
        self.assertNotIn('<f>Gasoil', feuilles['Dépenses'])
        self.assertIn('<v>7000.5</v>', feuilles['Dépenses'])
        self.assertIn('<v>50000</v>', feuilles['Bilan financier'])
        self.assertIn('Nombre de plantes', textes)
        self.assertIn('<v>2860</v>', feuilles['Exploitation'])
        self.assertEqual(self.client.get('/api/v1/rapport/?periode=2025-13').status_code, 400)
        self.login(self.superviseur.username)
        self.assertNotIn('Journal', lire_classeur(self.client.get('/api/v1/rapport/').content)[0])

    def test_dates_et_periodes_renseignees_automatiquement(self):
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        depense = self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': categorie['id'],
                                          'bloc_id': self.bloc['id'], 'montant_total': 5000})
        manuelle = self.post('salaires/', {'personne_id': self.ids[2], 'montant_brut': 1000})
        travail = self.post('travaux/', {'type_travail_id': self.activite('OUVERTURES'), 'bloc_id': self.bloc['id'],
                                         'date_fin': jour(5), 'quantite': 1, 'prix_unitaire': 1, 'personnes_ids': [self.ids[0]]})
        self.assertEqual((depense['date'], travail['date_travail'], manuelle['periode']),
                         (AUJOURDHUI.isoformat(), AUJOURDHUI.isoformat(), AUJOURDHUI.strftime('%Y-%m')))
        self.assertEqual(self.personnes[0]['date_embauche'], AUJOURDHUI.isoformat())


class DepensesTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.referentiel()
        self.categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})

    def test_validations_depense(self):
        base = {'designation': 'Gasoil', 'categorie_id': self.categorie['id'], 'bloc_id': self.bloc['id'], 'montant_total': 5000}
        self.assertIn('date', self.post('depenses/', {**base, 'date': jour(1)}, status=400))
        self.assertIn('bloc_id', self.post('depenses/', {**base, 'bloc_id': None, 'date': HIER}, status=400))
        for systeme in (CategorieDepense.achat_particuliers(), CategorieDepense.salaires()):
            self.assertIn('categorie_id', self.post('depenses/', {**base, 'categorie_id': systeme.pk, 'date': HIER}, status=400))
        self.assertEqual(self.post('depenses/', {**base, 'date': HIER})['campement_id'], self.campement['id'])

    def test_modifier_et_supprimer_une_depense(self):
        depense = self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': self.categorie['id'],
                                          'bloc_id': self.bloc['id'], 'date': HIER, 'montant_total': 5000})
        modifiee = self.patch(f"depenses/{depense['id']}/", {'montant_total': 8000, 'statut': 'PAYEE'})
        self.assertEqual((modifiee['montant_total'], modifiee['prix_unitaire'], modifiee['statut'], modifiee['modifiable']),
                         (8000.0, 8000.0, 'PAYEE', True))
        self.login(self.superviseur.username)
        self.delete(f"depenses/{depense['id']}/", status=403)
        self.login(self.admin.username)
        self.delete(f"depenses/{depense['id']}/")


class ModificationsMetierTests(ApiTestCase):
    """11 octobre 2026 : tri par création, filtres de période, paiements (référence, observation, reçu), Prévisions retirées."""

    def setUp(self):
        super().setUp()
        self.ids = self.referentiel()
        self.categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})

    def depense(self, designation, date, montant=1000, **valeurs):
        return self.post('depenses/', {'designation': designation, 'categorie_id': self.categorie['id'], 'bloc_id': self.bloc['id'],
                                       'date': date, 'montant_total': montant, **valeurs})

    # --- Tri : le plus récemment créé d'abord (et non la date de l'opération) ---
    def test_listes_triees_par_creation_decroissante(self):
        premiere = self.depense('Première saisie', jour(-1))
        seconde = self.depense('Seconde saisie (date plus ancienne)', jour(-20))
        self.assertEqual([d['id'] for d in self.get('depenses/')][:2], [seconde['id'], premiere['id']])
        t1 = self.creer_travail([self.ids[0]])
        t2 = self.creer_travail([self.ids[1]], date_travail=jour(-30), date_fin=jour(-29))
        self.assertEqual([t['id'] for t in self.get('travaux/')][:2], [t2['id'], t1['id']])
        remunerations = self.get('salaires/')
        self.assertEqual([r['travail']['id'] for r in remunerations][:2], [t2['id'], t1['id']])
        self.assertEqual([p['id'] for p in self.get('personnes/')][:2], [self.ids[3], self.ids[2]])
        self.assertEqual([b['id'] for b in self.get('blocs/')][:2], [self.bloc2['id'], self.bloc['id']])
        # Équipes (créées par les travaux), plantations, campements : même règle
        equipe1 = self.creer_travail(self.ids[:2], chef=self.ids[0])['equipe_id']
        equipe2 = self.creer_travail(self.ids[2:4], chef=self.ids[2])['equipe_id']
        self.assertEqual([e['id'] for e in self.get('equipes/')][:2], [equipe2, equipe1])
        plantation2 = self.post('plantations/', {'nom': 'Sud', 'superficie': 50})
        self.assertEqual([p['id'] for p in self.get('plantations/')][:2], [plantation2['id'], self.plantation['id']])
        # Paiements (pas de date de création : ordre de saisie)
        s1, s2 = Salaire.objects.get(travail_id=t1['id']), Salaire.objects.get(travail_id=t2['id'])
        p1 = self.post('paiements-salaire/', {'salaire_id': s1.pk, 'montant': 100, 'type_paiement': 'ESPECES', 'date': jour(-1)})
        p2 = self.post('paiements-salaire/', {'salaire_id': s2.pk, 'montant': 100, 'type_paiement': 'ESPECES', 'date': jour(-10)})
        self.assertEqual([p['id'] for p in self.get('paiements-salaire/')], [p2['id'], p1['id']])

    def test_activites_gardent_l_ordre_metier(self):
        libelles = [a['libelle'] for a in self.get('types-travaux/')]
        self.assertEqual(libelles[0], 'OUVERTURES')
        self.assertEqual(libelles[-1], 'AUTRE')

    # --- Filtre de période appliqué par l'API ---
    def test_filtre_de_periode_des_depenses(self):
        self.depense('Septembre', '2025-09-10', 1000)
        self.depense('Début octobre', '2025-10-01', 2000)
        self.depense('Fin octobre', '2025-10-31', 4000)
        noms = lambda url: sorted(d['designation'] for d in self.get(url))  # noqa: E731
        self.assertEqual(noms('depenses/?date_debut=2025-10-01&date_fin=2025-10-31'), ['Fin octobre', 'Début octobre'][::-1])
        self.assertEqual(noms('depenses/?date_debut=2025-10-15'), ['Fin octobre'])
        self.assertEqual(noms('depenses/?date_fin=2025-09-30'), ['Septembre'])
        self.assertEqual(noms('depenses/?periode=2025-09'), ['Septembre'])
        # Combiné aux autres filtres
        autre = self.post('categories-depenses/', {'libelle': 'Engrais'})
        self.post('depenses/', {'designation': 'Engrais octobre', 'categorie_id': autre['id'], 'bloc_id': self.bloc['id'],
                                'date': '2025-10-05', 'montant_total': 500})
        self.assertEqual(noms(f"depenses/?date_debut=2025-10-01&date_fin=2025-10-31&categorie_id={autre['id']}"), ['Engrais octobre'])
        total = sum(d['montant_total'] for d in self.get('depenses/?date_debut=2025-10-01&date_fin=2025-10-31'))
        self.assertEqual(total, 6500.0)

    def test_filtre_de_periode_invalide(self):
        self.assertIn('date_debut', self.client.get('/api/v1/depenses/?date_debut=pas-une-date').json())
        reponse = self.client.get('/api/v1/depenses/?date_debut=2025-10-31&date_fin=2025-10-01')
        self.assertEqual(reponse.status_code, 400)
        self.assertIn('date_fin', reponse.json())

    def test_filtre_de_periode_des_paiements_et_remunerations(self):
        travail = self.creer_travail([self.ids[0]], date_travail=jour(-40), date_fin=jour(-40))
        salaire = Salaire.objects.get(travail_id=travail['id'])
        self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 1000, 'type_paiement': 'ESPECES', 'date': jour(-2)})
        self.assertEqual(len(self.get(f'paiements-salaire/?date_debut={jour(-3)}&date_fin={jour(-1)}')), 1)
        self.assertEqual(self.get(f'paiements-salaire/?date_debut={jour(-1)}'), [])
        self.assertEqual(len(self.get(f'salaires/?date_debut={jour(-41)}&date_fin={jour(-39)}')), 1)
        self.assertEqual(self.get(f'salaires/?date_debut={jour(-10)}'), [])

    # --- Paiements : référence, observation, situation après paiement ---
    def test_reference_et_observation_enregistrees_et_restituees(self):
        travail = self.creer_travail([self.ids[0]], quantite=10, prix_unitaire=1000)  # 10 000 FCFA
        salaire = Salaire.objects.get(travail_id=travail['id'])
        premier = self.post('paiements-salaire/', {
            'salaire_id': salaire.pk, 'montant': 4000, 'type_paiement': 'MOBILE_MONEY', 'date': jour(-3),
            'reference': 'OM-123456', 'observation': 'Acompte remis au chantier'})
        second = self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 6000, 'type_paiement': 'ESPECES', 'date': jour(-1)})
        # Enregistrées en base (PostgreSQL), pas seulement renvoyées par l'API
        enregistre = PaiementSalaire.objects.get(pk=premier['id'])
        self.assertEqual((enregistre.reference, enregistre.observation), ('OM-123456', 'Acompte remis au chantier'))
        relu = self.get(f"paiements-salaire/{premier['id']}/")
        self.assertEqual((relu['reference'], relu['observation']), ('OM-123456', 'Acompte remis au chantier'))
        # Visibles aussi dans la fiche de la rémunération (liste de ses paiements)
        fiche = self.get(f'salaires/{salaire.pk}/')['paiements']
        self.assertEqual([(p['reference'], p['observation']) for p in fiche if p['id'] == premier['id']],
                         [('OM-123456', 'Acompte remis au chantier')])
        # Situation de la rémunération juste après chaque paiement (reprise sur le reçu)
        self.assertEqual((relu['montant_du'], relu['total_paye'], relu['reste_apres']), (10000.0, 4000.0, 6000.0))
        relu2 = self.get(f"paiements-salaire/{second['id']}/")
        self.assertEqual((relu2['total_paye'], relu2['reste_apres']), (10000.0, 0.0))
        self.assertEqual((relu['periode_debut'], relu['periode_fin']), (travail['date_travail'], travail['date_fin']))
        # Modification : référence et observation suivent
        self.patch(f"paiements-salaire/{premier['id']}/", {'reference': 'OM-999', 'observation': ''})
        enregistre.refresh_from_db()
        self.assertEqual((enregistre.reference, enregistre.observation), ('OM-999', ''))
        # Le reçu PDF se génère avec la référence et l'observation
        reponse = self.client.get(f"/api/v1/paiements-salaire/{second['id']}/recu/")
        self.assertEqual((reponse.status_code, reponse['Content-Type']), (200, 'application/pdf'))

    def test_paiement_partiel_jamais_superieur_au_solde(self):
        travail = self.creer_travail([self.ids[0]], quantite=10, prix_unitaire=1000)
        salaire = Salaire.objects.get(travail_id=travail['id'])
        self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 7000, 'type_paiement': 'ESPECES'})
        erreurs = self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 3001, 'type_paiement': 'ESPECES'}, status=400)
        self.assertIn('montant', erreurs)
        self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 3000, 'type_paiement': 'ESPECES'})
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['reste'], 0.0)

    # --- Travail ↔ rémunération ---
    def test_une_seule_remuneration_par_travail(self):
        travail = self.creer_travail(self.ids[:2], chef=self.ids[0])
        for _ in range(2):
            self.patch(f"travaux/{travail['id']}/", {'quantite': 12})
        self.assertEqual(Salaire.objects.filter(travail_id=travail['id']).count(), 1)
        self.assertEqual(Salaire.objects.get(travail_id=travail['id']).montant_net, 12000)
        self.post(f"travaux/{travail['id']}/remuneration/", {}, status=400)  # déjà générée : pas de doublon

    def test_annulation_du_travail_exclut_la_remuneration_sans_effacer_l_historique(self):
        travail = self.creer_travail([self.ids[0]], date_travail=jour(2), date_fin=jour(3))
        salaire = Salaire.objects.get(travail_id=travail['id'])
        self.post(f"travaux/{travail['id']}/annuler/", {}, status=200)
        annulee = self.get(f'salaires/{salaire.pk}/')
        self.assertEqual((annulee['statut'], annulee['reste']), ('ANNULEE', 0.0))
        self.assertTrue(Salaire.objects.filter(pk=salaire.pk).exists())  # conservée : historique intact
        self.assertIn('annulée', self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 1, 'type_paiement': 'ESPECES'},
                                           status=400)['detail'][0])
        self.assertTrue(Journal.objects.filter(table_concernee='Rémunération', details__contains='annulée avec le travail').exists())
        # Hors totaux : le tableau de bord ne compte plus ce montant
        kpis = self.get(f"tableau-de-bord/?periode={jour(2)[:7]}")['kpis']
        self.assertEqual(kpis['remunerationDuee'], 0.0)
        self.post(f"travaux/{travail['id']}/retablir/", {}, status=200)
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['statut'], 'NON_PAYEE')

    def test_suppression_d_un_travail_protege_les_paiements(self):
        travail = self.creer_travail([self.ids[0]])
        self.assertTrue(self.get(f"travaux/{travail['id']}/")['peut_supprimer'])
        salaire = Salaire.objects.get(travail_id=travail['id'])
        self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 1000, 'type_paiement': 'ESPECES'})
        self.assertFalse(self.get(f"travaux/{travail['id']}/")['peut_supprimer'])
        self.assertIn('paiements', self.delete(f"travaux/{travail['id']}/", status=400).json()['detail'])
        self.assertTrue(Salaire.objects.filter(pk=salaire.pk).exists())
        libre = self.creer_travail([self.ids[1]])
        self.delete(f"travaux/{libre['id']}/")
        self.assertTrue(Journal.objects.filter(action='Suppression', table_concernee='Rémunération').exists())

    def test_generer_les_remunerations_manquantes(self):
        travail = self.creer_travail([self.ids[0]])
        Salaire.objects.filter(travail_id=travail['id']).delete()  # ancien travail sans rémunération
        sortie = StringIO()
        call_command('generer_remunerations', stdout=sortie)  # simulation : rien n'est créé
        self.assertIn('Simulation', sortie.getvalue())
        self.assertFalse(Salaire.objects.filter(travail_id=travail['id']).exists())
        call_command('generer_remunerations', '--appliquer', stdout=StringIO())
        call_command('generer_remunerations', '--appliquer', stdout=StringIO())  # relancée : aucun doublon
        self.assertEqual(Salaire.objects.filter(travail_id=travail['id']).count(), 1)

    # --- Prévisions : module retiré, données conservées ---
    def test_previsions_retirees_sans_perte_de_donnees(self):
        prevision = Prevision.objects.create(
            campement_id=self.campement['id'], categorie_id=self.categorie['id'], periode_debut='2025-09-01',
            periode_fin='2025-09-30', designation='Budget', montant_prevu=1000)
        self.assertEqual(self.client.get('/api/v1/previsions/').status_code, 404)
        self.assertNotIn('previsionsData', self.get('tableau-de-bord/'))
        self.assertTrue(Prevision.objects.filter(pk=prevision.pk).exists())
        noms, _, _ = lire_classeur(self.client.get('/api/v1/rapport/').content)
        self.assertNotIn('Prévisions', noms)


class AnnulationEtRepartitionTests(ApiTestCase):
    """Annulation des paiements, annulation d'un travail terminé, Excel rattaché au lieu, répartition du bilan."""

    def setUp(self):
        super().setUp()
        self.ids = self.referentiel()

    def travail_paye(self, montant_paye=10000, **valeurs):
        travail = self.creer_travail([self.ids[0]], quantite=10, prix_unitaire=1000, **valeurs)  # 10 000 FCFA
        salaire = Salaire.objects.get(travail_id=travail['id'])
        paiement = self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': montant_paye, 'type_paiement': 'ESPECES'})
        return travail, salaire, paiement

    # --- Annuler un paiement ---
    def test_annuler_un_paiement_rend_le_reste_et_conserve_l_historique(self):
        travail, salaire, paiement = self.travail_paye(6000)
        depense_id = PaiementSalaire.objects.get(pk=paiement['id']).depense_id
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['reste'], 4000.0)
        annule = self.post(f"paiements-salaire/{paiement['id']}/annuler/", {'motif': 'Erreur de saisie'}, status=200)
        self.assertEqual((annule['annule'], annule['motif_annulation'], annule['depense_id']), (True, 'Erreur de saisie', None))
        # Le paiement reste en base (historique), sa dépense disparaît, le reste est revenu
        self.assertTrue(PaiementSalaire.objects.filter(pk=paiement['id'], annule=True).exists())
        self.assertFalse(Depense.objects.filter(pk=depense_id).exists())
        remuneration = self.get(f'salaires/{salaire.pk}/')
        self.assertEqual((remuneration['montant_paye'], remuneration['reste'], remuneration['statut']), (0.0, 10000.0, 'NON_PAYEE'))
        self.assertEqual([p['annule'] for p in remuneration['paiements']], [True])  # visible dans l'historique
        # Hors totaux : tableau de bord et rapport ne comptent plus ce paiement
        kpis = self.get(f"tableau-de-bord/?periode={HIER[:7]}")['kpis']
        self.assertEqual((kpis['remunerationPayee'], kpis['totalDepenses']), (0.0, 0.0))
        self.assertTrue(Journal.objects.filter(action='Annulation', table_concernee='Paiement', details__contains='Erreur de saisie').exists())
        # Déjà annulé : refusé ; plus de modification ; le reçu existe toujours (marqué annulé) ; on peut repayer
        self.post(f"paiements-salaire/{paiement['id']}/annuler/", {}, status=400)
        self.patch(f"paiements-salaire/{paiement['id']}/", {'montant': 100}, status=400)
        reponse = self.client.get(f"/api/v1/paiements-salaire/{paiement['id']}/recu/")
        self.assertEqual((reponse.status_code, reponse['Content-Type']), (200, 'application/pdf'))
        self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 10000, 'type_paiement': 'ESPECES'})
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['statut'], 'PAYEE')

    def test_le_superviseur_peut_annuler_et_reactiver_mais_pas_supprimer_un_paiement(self):
        travail, salaire, paiement = self.travail_paye(3000)
        self.login(self.superviseur.username)
        self.delete(f"paiements-salaire/{paiement['id']}/", status=403)
        self.post(f"paiements-salaire/{paiement['id']}/annuler/", {}, status=200)
        self.post(f"paiements-salaire/{paiement['id']}/reactiver/", {}, status=200)
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['montant_paye'], 3000.0)
        # Annuler / rétablir un travail payé (avec ses paiements) : permis aux deux rôles
        self.assertTrue(self.get(f"travaux/{travail['id']}/")['peut_annuler'])
        self.post(f"travaux/{travail['id']}/annuler/", {}, status=200)
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['montant_paye'], 0.0)
        self.post(f"travaux/{travail['id']}/retablir/", {}, status=200)
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['montant_paye'], 3000.0)

    # --- Annuler / supprimer un travail ---
    def test_annuler_un_travail_termine_et_paye_annule_ses_paiements_avec_lui(self):
        travail, salaire, paiement = self.travail_paye(10000)  # terminé (hier) et payé
        travail = self.get(f"travaux/{travail['id']}/")
        self.assertEqual((travail['statut'], travail['peut_annuler'], travail['peut_supprimer'], travail['nb_paiements']), ('TERMINE', True, False, 1))
        depense_id = PaiementSalaire.objects.get(pk=paiement['id']).depense_id
        annule = self.post(f"travaux/{travail['id']}/annuler/", {}, status=200)
        self.assertEqual((annule['statut'], annule['peut_annuler']), ('ANNULE', False))
        # Plus compté, plus payable : rémunération annulée, paiement annulé, dépense supprimée, hors tableau de bord
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['statut'], 'ANNULEE')
        self.assertTrue(PaiementSalaire.objects.filter(pk=paiement['id'], annule=True, motif_annulation='Travail annulé').exists())
        self.assertFalse(Depense.objects.filter(pk=depense_id).exists())
        kpis = self.get(f"tableau-de-bord/?periode={HIER[:7]}")['kpis']
        self.assertEqual((kpis['remunerationDuee'], kpis['remunerationPayee'], kpis['totalDepenses'], kpis['nbTravaux']), (0.0, 0.0, 0.0, 0))
        self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 1000, 'type_paiement': 'ESPECES'}, status=400)
        self.assertIn('historique', self.delete(f"travaux/{travail['id']}/", status=400).json()['detail'])
        call_command('verifier_coherence', stdout=StringIO())
        # Rétabli : le travail, sa rémunération et ses paiements annulés avec lui reprennent effet
        self.post(f"travaux/{travail['id']}/retablir/", {}, status=200)
        remuneration = self.get(f'salaires/{salaire.pk}/')
        self.assertEqual((remuneration['statut'], remuneration['montant_paye']), ('PAYEE', 10000.0))
        self.assertEqual(Depense.objects.filter(montant_total=10000).count(), 1)
        call_command('verifier_coherence', stdout=StringIO())

    def test_un_paiement_annule_a_la_main_reste_annule_au_retablissement(self):
        travail, salaire, paiement = self.travail_paye(4000)
        self.post(f"paiements-salaire/{paiement['id']}/annuler/", {'motif': 'Erreur'}, status=200)
        self.post(f"travaux/{travail['id']}/annuler/", {}, status=200)
        self.post(f"travaux/{travail['id']}/retablir/", {}, status=200)
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['montant_paye'], 0.0)

    def test_un_travail_termine_sans_paiement_s_annule_et_se_supprime(self):
        termine = self.creer_travail([self.ids[1]])
        self.assertEqual((termine['statut'], termine['peut_annuler'], termine['peut_supprimer']), ('TERMINE', True, True))
        self.assertEqual(self.post(f"travaux/{termine['id']}/annuler/", {}, status=200)['statut'], 'ANNULE')
        self.delete(f"travaux/{termine['id']}/")

    # --- Stock : suppression d'un produit et d'un mouvement ---
    def test_supprimer_un_produit_avec_ses_mouvements_et_un_mouvement(self):
        produit = self.post('produits/', {'nom': 'Engrais', 'unite': 'kg', 'stock_minimum': 5, 'prix_unitaire': 100})
        mvt = {'produit_id': produit['id'], 'bloc_id': self.bloc['id'], 'date': HIER, 'motif': 'Test'}
        entree = self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'ENTREE', 'quantite': 100})
        self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'SORTIE', 'quantite': 70})
        self.assertEqual(self.get(f"produits/{produit['id']}/")['nb_mouvements'], 2)
        # Supprimer l'entrée est permis (confirmation côté écran) ; le stock devient négatif et le journal le signale
        self.delete(f"mouvements-stock/{entree['id']}/")
        self.assertEqual(self.get(f"produits/{produit['id']}/")['stock_calcule'], -70.0)
        self.assertTrue(Journal.objects.filter(details__contains='négatif').exists())
        # Le produit part avec ses mouvements : Super admin uniquement
        self.login(self.superviseur.username)
        self.delete(f"produits/{produit['id']}/", status=403)
        self.login(self.admin.username)
        self.delete(f"produits/{produit['id']}/")
        self.assertEqual(self.get('mouvements-stock/'), [])
        self.assertTrue(Journal.objects.filter(table_concernee='Mouvement de stock', details__contains='supprimé(s) avec le produit').exists())

    # --- Bilan : répartition des dépenses ---
    def test_repartition_des_depenses_par_bloc_et_activite(self):
        self.travail_paye(10000, activite='SAIGNEE')
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': categorie['id'], 'bloc_id': self.bloc2['id'],
                                'date': HIER, 'montant_total': 2500})
        donnees = self.get(f'tableau-de-bord/?periode={HIER[:7]}')
        par_activite = {a['name']: a['value'] for a in donnees['depensesParActivite']}
        self.assertEqual(par_activite, {'SAIGNEE': 10000.0, 'Hors travaux': 2500.0})
        par_bloc = {b['name']: (b['campement'], b['value']) for b in donnees['depensesParBloc']}
        self.assertEqual(par_bloc[f"{self.bloc['code']} — A1"], ('Camp A', 10000.0))
        self.assertEqual(par_bloc[f"{self.bloc2['code']} — A2"], ('Camp A', 2500.0))
        self.assertEqual(sum(c['value'] for c in donnees['depensesParCampement']), 12500.0)
        self.assertEqual({c['name'] for c in donnees['depensesParCategorie']}, {'Salaires et rémunérations', 'Carburant'})

    # --- Excel : chaque donnée rattachée à son campement, son responsable et son bloc ---
    def test_excel_rattache_les_donnees_au_campement_responsable_et_bloc(self):
        from apps.core.models import Campement, Personne
        responsable = Personne.objects.get(pk=self.ids[2])
        Campement.objects.filter(pk=self.campement['id']).update(responsable=responsable)
        self.travail_paye(4000)
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': categorie['id'], 'bloc_id': self.bloc['id'],
                                'date': HIER, 'montant_total': 2500})
        noms, textes, feuilles = lire_classeur(self.client.get(f'/api/v1/rapport/?periode={HIER[:7]}').content)
        self.assertIn(responsable.nom_complet, textes)
        self.assertIn('Responsable du campement', textes)
        for titre in ('Dépenses par bloc', 'Dépenses par activité', 'Dépenses par campement', 'Hors travaux'):
            self.assertIn(titre, textes)


class StatutsDepensesEtCoherenceTests(ApiTestCase):
    """Statuts des dépenses (Avance / Payée), réactivation d'un paiement, Excel sans annulés, remise à zéro propre."""

    def setUp(self):
        super().setUp()
        self.ids = self.referentiel()
        self.categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})

    def travail_avance(self, avance=3000):
        travail = self.creer_travail(self.ids[:2], chef=self.ids[0], quantite=10, prix_unitaire=1000,  # 10 000 FCFA
                                     avance={'montant': avance, 'type_paiement': 'ESPECES'})
        return travail, Salaire.objects.get(travail_id=travail['id'])

    def statuts(self, salaire):
        return sorted(PaiementSalaire.objects.filter(salaire=salaire, annule=False).values_list('depense__statut', flat=True))

    def test_depense_saisie_a_la_main_toujours_payee_sans_choix_du_statut(self):
        depense = self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': self.categorie['id'], 'bloc_id': self.bloc['id'],
                                          'date': HIER, 'montant_total': 5000, 'statut': 'AVANCE'})
        self.assertEqual(depense['statut'], 'PAYEE')
        self.assertEqual(self.patch(f"depenses/{depense['id']}/", {'montant_total': 6000, 'statut': 'AVANCE'})['statut'], 'PAYEE')

    def test_depense_d_une_avance_reste_avance_puis_devient_payee_quand_soldee(self):
        travail, salaire = self.travail_avance(3000)
        self.assertEqual(self.statuts(salaire), ['AVANCE'])
        self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 4000, 'type_paiement': 'ESPECES'})
        self.assertEqual(self.statuts(salaire), ['AVANCE', 'PAYEE'])  # reste 3 000 : l'avance n'est pas soldée
        dernier = self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 3000, 'type_paiement': 'ESPECES'})
        self.assertEqual(self.statuts(salaire), ['PAYEE', 'PAYEE', 'PAYEE'])  # soldée : l'avance devient « Payée »
        kpis = self.get(f"tableau-de-bord/?periode={AUJOURDHUI.isoformat()[:7]}")['kpis']
        self.assertEqual((kpis['depensesAvances'], kpis['depensesPayees']), (0.0, 10000.0))
        # Annuler le dernier paiement : la rémunération n'est plus soldée, l'avance redevient « Avance »
        self.post(f"paiements-salaire/{dernier['id']}/annuler/", {}, status=200)
        self.assertEqual(self.statuts(salaire), ['AVANCE', 'PAYEE'])
        self.post(f"paiements-salaire/{dernier['id']}/reactiver/", {}, status=200)
        self.assertEqual(self.statuts(salaire), ['PAYEE', 'PAYEE', 'PAYEE'])
        call_command('verifier_coherence', stdout=StringIO())

    def test_reactiver_un_paiement_annule(self):
        travail, salaire = self.travail_avance(3000)
        paiement = PaiementSalaire.objects.get(salaire=salaire)
        self.post(f'paiements-salaire/{paiement.pk}/reactiver/', {}, status=400)  # pas annulé
        self.post(f'paiements-salaire/{paiement.pk}/annuler/', {}, status=200)
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['reste'], 10000.0)
        # Entre-temps, la rémunération est payée en entier : l'ancien paiement ne rentre plus
        autre = self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 10000, 'type_paiement': 'ESPECES'})
        self.post(f'paiements-salaire/{paiement.pk}/reactiver/', {}, status=400)
        self.post(f"paiements-salaire/{autre['id']}/annuler/", {}, status=200)
        reactive = self.post(f'paiements-salaire/{paiement.pk}/reactiver/', {}, status=200)
        self.assertEqual((reactive['annule'], reactive['depense_id'] is not None), (False, True))
        self.assertEqual(self.get(f'salaires/{salaire.pk}/')['reste'], 7000.0)
        # Une rémunération annulée ne se réactive pas
        self.post(f"travaux/{travail['id']}/annuler/", {}, status=200)
        self.post(f'paiements-salaire/{paiement.pk}/reactiver/', {}, status=400)

    def test_excel_sans_paiement_annule(self):
        travail, salaire = self.travail_avance(3000)
        garde = PaiementSalaire.objects.get(salaire=salaire)
        autre = self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 2000, 'type_paiement': 'ESPECES'})
        self.post(f"paiements-salaire/{autre['id']}/annuler/", {}, status=200)
        _, textes, _ = lire_classeur(self.client.get(f"/api/v1/rapport/?periode={AUJOURDHUI.isoformat()[:7]}").content)
        # Le numéro seul n'est une cellule que dans la feuille des paiements (le journal le cite dans des phrases)
        self.assertIn(f'<t>{garde.numero}</t>', textes)
        self.assertNotIn(f"<t>{autre['numero']}</t>", textes)

    def test_stock_retirer_un_produit_sans_le_supprimer(self):
        produit = self.post('produits/', {'nom': 'Engrais', 'unite': 'kg', 'stock_minimum': 50, 'prix_unitaire': 100})
        self.assertIn(produit['id'], [a['id'] for a in self.get('tableau-de-bord/')['stockAlerts']])
        self.assertFalse(self.patch(f"produits/{produit['id']}/", {'actif': False})['actif'])
        self.assertNotIn(produit['id'], [a['id'] for a in self.get('tableau-de-bord/')['stockAlerts']])
        self.assertTrue(self.patch(f"produits/{produit['id']}/", {'actif': True})['actif'])

    def test_remise_a_zero_propre_et_coherente(self):
        self.travail_avance(3000)
        with self.assertRaises(Exception):
            call_command('reinitialiser_base', stdout=StringIO())  # --confirmer obligatoire
        sortie = StringIO()
        call_command('reinitialiser_base', '--confirmer', stdout=sortie)
        self.assertIn('aucune incohérence', sortie.getvalue())
        from apps.achats.models import AchatParticulier
        from apps.core.models import Bloc, Campement, Plantation
        from apps.exploitation.models import Travail
        from apps.stock.models import MouvementStock, Produit
        systeme = [CategorieDepense.CODE_SALAIRES, CategorieDepense.CODE_ACHAT_PARTICULIERS]
        compteurs = [Plantation.objects.count(), Campement.objects.count(), Bloc.objects.count(), Travail.objects.count(),
                     Salaire.objects.count(), PaiementSalaire.objects.count(), AchatParticulier.objects.count(),
                     Produit.objects.count(), MouvementStock.objects.count(),
                     Depense.objects.exclude(categorie__code__in=systeme).count()]
        self.assertEqual(compteurs, [3] * 10)
        self.assertEqual(Depense.objects.count(), 9)  # 3 saisies + 3 paiements de salaire + 3 achats
        self.login(self.admin.username)  # les comptes sont conservés
        self.assertEqual(self.get('auth/me/')['role'], 'big_boss')

    def test_le_controle_de_coherence_detecte_un_ecart(self):
        travail, salaire = self.travail_avance(3000)
        call_command('verifier_coherence', stdout=StringIO())
        Depense.objects.filter(paiement_salaire__salaire=salaire).update(montant_total=1)
        with self.assertRaises(Exception) as ctx:
            call_command('verifier_coherence', stdout=StringIO())
        self.assertIn('incohérence', str(ctx.exception))
