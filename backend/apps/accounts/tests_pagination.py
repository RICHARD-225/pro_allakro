"""Listes paginées par le serveur : page, recherche (sans accents), tri, filtres, indicateurs sur toutes les lignes filtrées."""
from apps.core.testing import HIER, ApiTestCase, jour
from apps.finances.models import Salaire


class PaginationDepensesTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.referentiel()
        self.carburant = self.post('categories-depenses/', {'libelle': 'Carburant'})
        self.entretien = self.post('categories-depenses/', {'libelle': 'Entretien'})
        for i in range(30):
            self.post('depenses/', {'designation': f'Dépense {i:02d}' + (' Réparation' if i % 5 == 0 else ''), 'categorie_id': (self.carburant if i % 2 else self.entretien)['id'],
                                    'bloc_id': self.bloc['id'], 'date': HIER, 'montant_total': 1000 + i})

    def test_pages_et_totaux(self):
        premiere = self.get('depenses/?page=1&page_size=10')
        self.assertEqual((premiere['count'], premiere['page'], premiere['pages'], len(premiere['results'])), (30, 1, 3, 10))
        derniere = self.get('depenses/?page=3&page_size=10')
        self.assertEqual(len(derniere['results']), 10)
        ids = {r['id'] for p in (1, 2, 3) for r in self.get(f'depenses/?page={p}&page_size=10')['results']}
        self.assertEqual(len(ids), 30)  # aucune ligne en double ni oubliée
        # Au-delà de la dernière page : la dernière page
        self.assertEqual(self.get('depenses/?page=99&page_size=10')['page'], 3)
        # Sans `page` : liste complète, comme avant
        self.assertEqual(len(self.get('depenses/')), 30)
        totaux = self.get('depenses/totaux/')
        self.assertEqual((totaux['nombre'], totaux['total'], totaux['payees'], totaux['avances']), (30, 30 * 1000 + sum(range(30)), 30 * 1000 + sum(range(30)), 0))

    def test_recherche_sans_accents_ni_majuscules_et_tous_les_mots(self):
        self.assertEqual(self.get('depenses/?page=1&q=reparation')['count'], 6)           # « Réparation » trouvé sans l'accent
        self.assertEqual(self.get('depenses/?page=1&q=REPARATION 05')['count'], 1)       # tous les mots
        self.assertEqual(self.get('depenses/?page=1&q=carbur')['count'], 15)             # catégorie
        self.assertEqual(self.get('depenses/?page=1&q=introuvable')['count'], 0)
        totaux = self.get('depenses/totaux/?q=reparation')
        self.assertEqual(totaux['nombre'], 6)

    def test_tri_et_filtres(self):
        croissant = [r['montant_total'] for r in self.get('depenses/?page=1&page_size=5&ordering=montant_total')['results']]
        decroissant = [r['montant_total'] for r in self.get('depenses/?page=1&page_size=5&ordering=-montant_total')['results']]
        self.assertEqual(croissant, [1000.0, 1001.0, 1002.0, 1003.0, 1004.0])
        self.assertEqual(decroissant, [1029.0, 1028.0, 1027.0, 1026.0, 1025.0])
        self.assertEqual(self.get('depenses/?page=1&page_size=5&ordering=colonne_inconnue')['count'], 30)  # clé inconnue ignorée
        self.assertEqual(self.get(f"depenses/?page=1&categorie_id={self.carburant['id']}")['count'], 15)
        self.assertEqual(self.get(f"depenses/totaux/?categorie_id={self.carburant['id']}")['nombre'], 15)
        self.assertEqual(self.get(f"depenses/?page=1&bloc_id={self.bloc2['id']}")['count'], 0)
        self.assertEqual(self.get(f'depenses/?page=1&date_debut={jour(5)}')['count'], 0)

    def test_parametres_invalides_et_taille_plafonnee(self):
        self.assertEqual(self.client.get('/api/v1/depenses/?page=abc').status_code, 400)
        self.assertEqual(self.client.get('/api/v1/depenses/?page=1&page_size=zzz').status_code, 400)
        self.assertEqual(self.get('depenses/?page=1&page_size=100000')['page_size'], 200)  # plafond
        self.assertEqual(self.client.get('/api/v1/depenses/?q=%27%20OR%201%3D1%3B--').status_code, 200)  # texte inerte, aucune injection

    def test_le_perimetre_du_superviseur_s_applique_aux_pages_et_aux_totaux(self):
        campement_b = self.post('campements/', {'nom': 'Camp B', 'plantation_id': self.plantation['id'], 'superficie': 10})
        bloc_b = self.post('blocs/', {'nom': 'B1', 'campement_id': campement_b['id'], 'superficie': 5, 'nombre_plantes': 10})
        self.post('depenses/', {'designation': 'Ailleurs', 'categorie_id': self.carburant['id'], 'bloc_id': bloc_b['id'], 'date': HIER, 'montant_total': 777})
        self.assertEqual(self.get('depenses/?page=1')['count'], 31)
        self.login(self.superviseur.username)
        self.assertEqual(self.get('depenses/?page=1')['count'], 30)
        self.assertEqual(self.get('depenses/totaux/')['nombre'], 30)
        self.assertEqual(self.get('depenses/?page=1&q=ailleurs')['count'], 0)


class PaginationAutresListesTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ids = self.referentiel()

    def test_remunerations_statuts_totaux_et_a_payer(self):
        a = self.creer_travail([self.ids[0]], quantite=10, prix_unitaire=1000)   # 10 000
        b = self.creer_travail([self.ids[1]], quantite=20, prix_unitaire=1000)   # 20 000
        c = self.creer_travail([self.ids[2]], quantite=30, prix_unitaire=1000)   # 30 000
        sa, sb, sc = (Salaire.objects.get(travail_id=t['id']) for t in (a, b, c))
        self.post('paiements-salaire/', {'salaire_id': sa.pk, 'montant': 10000, 'type_paiement': 'ESPECES'})     # payée
        self.post('paiements-salaire/', {'salaire_id': sb.pk, 'montant': 5000, 'type_paiement': 'ESPECES'})      # partielle
        self.post(f"travaux/{c['id']}/annuler/", {}, status=200)                                                   # annulée
        d = self.creer_travail([self.ids[3]], quantite=40, prix_unitaire=1000)                                     # non payée
        for statut, attendu in (('PAYEE', 1), ('PARTIELLE', 1), ('ANNULEE', 1), ('NON_PAYEE', 1)):
            liste = self.get(f'salaires/?page=1&statut={statut}')
            self.assertEqual(liste['count'], attendu, statut)
            self.assertEqual({r['statut'] for r in liste['results']}, {statut})
        self.assertEqual(self.client.get('/api/v1/salaires/?page=1&statut=BIDON').status_code, 400)
        # Indicateurs : rémunérations non annulées (10 000 + 20 000 + 40 000 dus ; 15 000 payés ; 55 000 de reste ; 2 à régler)
        totaux = self.get('salaires/totaux/')
        self.assertEqual((totaux['du'], totaux['paye'], totaux['reste'], totaux['a_payer']), (70000.0, 15000.0, 55000.0, 2))
        self.assertEqual(self.get('salaires/?page=1&a_payer=1')['count'], 2)
        # Tri par reste décroissant
        restes = [r['reste'] for r in self.get('salaires/?page=1&ordering=-reste&a_payer=1')['results']]
        self.assertEqual(restes, sorted(restes, reverse=True))
        # Totaux qui suivent les filtres
        self.assertEqual(self.get('salaires/totaux/?statut=NON_PAYEE')['du'], 40000.0)
        self.assertEqual(d['montant_total'], 40000.0)

    def test_paiements_pagines_et_totaux(self):
        travail = self.creer_travail([self.ids[0]], quantite=10, prix_unitaire=1000)
        salaire = Salaire.objects.get(travail_id=travail['id'])
        premier = self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 3000, 'type_paiement': 'ESPECES', 'reference': 'REF-A'})
        self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 2000, 'type_paiement': 'ESPECES'})
        self.post(f"paiements-salaire/{premier['id']}/annuler/", {}, status=200)
        totaux = self.get('paiements-salaire/totaux/')
        self.assertEqual((totaux['valides'], totaux['annules'], totaux['montant']), (1, 1, 2000.0))
        liste = self.get('paiements-salaire/?page=1&page_size=10&ordering=-montant')
        self.assertEqual([r['montant'] for r in liste['results']], [3000.0, 2000.0])
        self.assertEqual(self.get(f"paiements-salaire/?page=1&q={premier['numero']}")['count'], 1)

    def test_achats_statuts_et_totaux(self):
        base = {'particulier_nom': 'Koné', 'designation': 'Bois', 'unite_poids': 'kg', 'date_achat': HIER, 'bloc_id': self.bloc['id']}
        self.post('achats-particuliers/', {**base, 'poids': 10, 'prix_unitaire': 100, 'montant_verse': 1000})           # payé
        self.post('achats-particuliers/', {**base, 'particulier_nom': 'Yao', 'poids': 20, 'prix_unitaire': 100, 'montant_verse': 500})  # partiel
        self.post('achats-particuliers/', {**base, 'particulier_nom': 'Brou', 'poids': 30, 'prix_unitaire': 100})        # non payé
        for statut in ('PAYEE', 'PARTIELLE', 'NON_PAYEE'):
            self.assertEqual(self.get(f'achats-particuliers/?page=1&statut={statut}')['count'], 1, statut)
        totaux = self.get('achats-particuliers/totaux/')
        self.assertEqual((totaux['nombre'], totaux['total'], totaux['reste'], totaux['kg'], totaux['vendeurs']), (3, 6000.0, 4500.0, 60.0, 3))
        self.assertEqual(self.get('achats-particuliers/?page=1&q=kone')['count'], 1)  # « Koné » sans accent
        self.assertEqual(self.get('achats-particuliers/totaux/?statut=NON_PAYEE')['total'], 3000.0)

    def test_personnes_filtre_fonction_recherche_et_pas_de_doublon(self):
        autre = self.post('fonctions/', {'libelle': 'Chef de chantier'})
        self.post('personnes/', {'nom': 'Zadi', 'prenom': 'Paul', 'telephone': '07 55 55 55 55', 'fonction_id': autre['id'], 'bloc_id': self.bloc['id']})
        tous = self.get('personnes/?page=1&page_size=50')
        self.assertEqual(tous['count'], 7)  # 2 comptes + 4 personnes du référentiel + Zadi
        self.assertEqual(len({r['id'] for r in tous['results']}), 7)
        self.assertEqual(self.get(f"personnes/?page=1&fonction_id={autre['id']}")['count'], 1)
        self.assertEqual(self.get('personnes/?page=1&q=chef chantier')['count'], 1)   # recherche sur la fonction
        self.assertEqual(self.get('personnes/?page=1&q=zadi')['count'], 1)
        self.assertEqual(self.get('personnes/totaux/')['nombre'], 7)
        self.assertEqual([r['nom'] for r in self.get('personnes/?page=1&ordering=-nom&page_size=1')['results']], ['Zadi'])

    def test_mouvements_de_stock_totaux_et_recherche(self):
        produit = self.post('produits/', {'nom': 'Engrais', 'unite': 'kg', 'stock_minimum': 0, 'prix_unitaire': 1})
        mvt = {'produit_id': produit['id'], 'bloc_id': self.bloc['id'], 'date': HIER, 'motif': 'Réception'}
        self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'ENTREE', 'quantite': 100})
        self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'SORTIE', 'quantite': 10, 'motif': 'Épandage'})
        self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'AJUSTEMENT', 'quantite': -5, 'motif': 'Inventaire'})
        totaux = self.get('mouvements-stock/totaux/')
        self.assertEqual((totaux['nombre'], totaux['entrees'], totaux['sorties'], totaux['ajustements']), (3, 1, 1, 1))
        self.assertEqual(self.get('mouvements-stock/?page=1&q=epandage')['count'], 1)
        self.assertEqual(self.get('mouvements-stock/?page=1&type_mouvement=ENTREE')['count'], 1)

    def test_travaux_pages_recherche_et_tri(self):
        for i in range(12):
            self.creer_travail([self.ids[i % 4]], quantite=i + 1, prix_unitaire=100)
        page = self.get('travaux/?page=2&page_size=5&ordering=-montant_total')
        self.assertEqual((page['count'], page['pages'], len(page['results'])), (12, 3, 5))
        montants = [r['montant_total'] for r in self.get('travaux/?page=1&page_size=12&ordering=-montant_total')['results']]
        self.assertEqual(montants, sorted(montants, reverse=True))
        self.assertEqual(self.get('travaux/?page=1&q=ouvertures')['count'], 12)
        self.assertEqual(self.get('travaux/?page=1&q=A1')['count'], 12)  # code du bloc (recherche sur le nom du bloc)

    def test_journal_pagine_et_recherche(self):
        self.post('plantations/', {'nom': 'Plantation Journal Essai', 'superficie': 1})
        page = self.get('journal/?page=1&page_size=5')
        self.assertEqual(len(page['results']), 5)
        self.assertGreater(page['count'], 5)
        self.assertGreaterEqual(self.get('journal/?page=1&q=journal essai')['count'], 1)
        self.assertEqual(self.get('journal/?page=1&page_size=3&ordering=-timestamp')['results'][0]['id'], self.get('journal/')[0]['id'])
        self.login(self.superviseur.username)
        self.assertEqual(self.client.get('/api/v1/journal/?page=1').status_code, 403)
