"""Tests de l'API : sécurité, validations serveur et calculs métier (base de test isolée)."""
import html
import io
import re
import zipfile
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Journal, RoleUtilisateur, Utilisateur
from apps.core.models import Fonction, MembreEquipe, Personne
from apps.finances.models import CategorieDepense, Depense, PaiementSalaire

AUJOURDHUI = timezone.localdate()
DEMAIN = (AUJOURDHUI + timedelta(days=1)).isoformat()
HIER = (AUJOURDHUI - timedelta(days=1)).isoformat()
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def lire_classeur(contenu):
    """Noms des feuilles, textes partagés et XML de chaque feuille d'un fichier .xlsx."""
    with zipfile.ZipFile(io.BytesIO(contenu)) as archive:
        noms = re.findall(r'<sheet name="([^"]+)"', archive.read('xl/workbook.xml').decode('utf-8'))
        textes = html.unescape(archive.read('xl/sharedStrings.xml').decode('utf-8'))
        feuilles = {nom: archive.read(f'xl/worksheets/sheet{i}.xml').decode('utf-8') for i, nom in enumerate(noms, start=1)}
    return noms, textes, feuilles


class ApiTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.fonction = Fonction.objects.create(libelle='Ouvrier agricole')
        boss = RoleUtilisateur.objects.create(code='big_boss', libelle='Big Boss')
        sup = RoleUtilisateur.objects.create(code='superviseur', libelle='Superviseur')
        p_admin = Personne.objects.create(nom='Admin', prenom='Test')
        p_sup = Personne.objects.create(nom='Sup', prenom='Test')
        cls.admin = Utilisateur.objects.create(personne=p_admin, role=boss, username='admin@test.ci', password_hash=make_password('Motdepasse@1'))
        cls.superviseur = Utilisateur.objects.create(personne=p_sup, role=sup, username='sup@test.ci', password_hash=make_password('Motdepasse@1'))

    def setUp(self):
        self.client = APIClient()
        self.login(self.admin.username)

    def login(self, username, password='Motdepasse@1'):
        self.client.cookies.clear()
        return self.client.post('/api/v1/auth/login/', {'username': username, 'password': password}, format='json')

    def post(self, url, data, status=201):
        response = self.client.post(f'/api/v1/{url}', data, format='json')
        self.assertEqual(response.status_code, status, response.content.decode())
        return response.json()

    def patch(self, url, data, status=200):
        response = self.client.patch(f'/api/v1/{url}', data, format='json')
        self.assertEqual(response.status_code, status, response.content.decode())
        return response.json()

    def get(self, url):
        response = self.client.get(f'/api/v1/{url}')
        self.assertEqual(response.status_code, 200, response.content.decode())
        return response.json()

    # Petit référentiel : 1 plantation, 1 campement, 2 blocs, 4 personnes, 1 équipe
    def referentiel(self):
        self.plantation = self.post('plantations/', {'nom': 'Nord', 'superficie': 100})
        self.campement = self.post('campements/', {'nom': 'Camp A', 'plantation_id': self.plantation['id'], 'superficie': 60})
        self.bloc = self.post('blocs/', {'nom': 'A1', 'campement_id': self.campement['id'], 'superficie': 20})
        self.bloc2 = self.post('blocs/', {'nom': 'A2', 'campement_id': self.campement['id'], 'superficie': 20})
        self.personnes = [
            self.post('personnes/', {'nom': f'Nom{i}', 'prenom': 'P', 'telephone': f'07 00 00 00 0{i}',
                                     'fonction_id': self.fonction.pk, 'campement_id': self.campement['id']})
            for i in range(4)
        ]
        ids = [p['id'] for p in self.personnes]
        self.equipe = self.post('equipes/', {'nom': 'Alpha', 'bloc_id': self.bloc['id'], 'chef_id': ids[0], 'membres_ids': ids[:3]})
        return ids


class AuthTests(ApiTestCase):
    def test_acces_refuse_sans_connexion(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.get('/api/v1/plantations/').status_code, 401)

    def test_connexion_cookie_httponly_et_profil(self):
        response = self.login('ADMIN@test.ci')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.cookies['allakro_access']['httponly'])
        me = self.get('auth/me/')
        self.assertEqual(me['role'], 'big_boss')
        self.assertTrue(Journal.objects.filter(action='Connexion').exists())

    def test_mauvais_mot_de_passe_et_compte_desactive(self):
        self.assertEqual(self.login(self.admin.username, 'faux').status_code, 401)
        Utilisateur.objects.filter(pk=self.superviseur.pk).update(actif=False)
        self.assertEqual(self.login(self.superviseur.username).status_code, 403)

    def test_rafraichissement_du_jeton(self):
        self.assertEqual(self.client.post('/api/v1/auth/refresh/').status_code, 200)

    def test_droits_superviseur(self):
        self.referentiel()
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        depense = self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': categorie['id'], 'bloc_id': self.bloc['id'],
                                          'date': HIER, 'montant_total': 1000})
        self.login(self.superviseur.username)
        self.assertEqual(self.client.get('/api/v1/utilisateurs/').status_code, 403)
        self.assertEqual(self.client.get('/api/v1/journal/').status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/depenses/{depense['id']}/").status_code, 403)

    def test_changement_de_mot_de_passe(self):
        url = 'auth/mot-de-passe/'
        errors = self.post(url, {'ancien_mot_de_passe': 'faux', 'nouveau_mot_de_passe': 'Nouveau@2025', 'confirmation': 'Nouveau@2025'}, status=400)
        self.assertIn('ancien_mot_de_passe', errors)
        errors = self.post(url, {'ancien_mot_de_passe': 'Motdepasse@1', 'nouveau_mot_de_passe': 'Nouveau@2025', 'confirmation': 'Autre@2025'}, status=400)
        self.assertIn('confirmation', errors)
        self.post(url, {'ancien_mot_de_passe': 'Motdepasse@1', 'nouveau_mot_de_passe': 'Nouveau@2025', 'confirmation': 'Nouveau@2025'}, status=200)
        self.assertEqual(self.login(self.admin.username, 'Motdepasse@1').status_code, 401)
        self.assertEqual(self.login(self.admin.username, 'Nouveau@2025').status_code, 200)

    def test_mot_de_passe_trop_faible_refuse(self):
        personne = Personne.objects.create(nom='X', prenom='Y')
        errors = self.post('utilisateurs/', {'personne_id': personne.pk, 'email': 'x@test.ci', 'role': 'superviseur',
                                             'password': '1234'}, status=400)
        self.assertIn('password', errors)


class ExploitationTests(ApiTestCase):
    def test_codes_automatiques(self):
        self.referentiel()
        self.assertEqual([self.bloc['code'], self.bloc2['code']], ['BLC-001', 'BLC-002'])
        self.assertEqual(self.personnes[0]['matricule'], 'MAT-0003')  # 2 personnes déjà créées pour les comptes
        self.assertEqual(self.get('blocs/prochain-code/')['code'], 'BLC-003')

    def test_superficies_coherentes(self):
        self.referentiel()
        errors = self.post('campements/', {'nom': 'Camp B', 'plantation_id': self.plantation['id'], 'superficie': 50}, status=400)
        self.assertIn('superficie', errors)
        errors = self.post('blocs/', {'nom': 'A3', 'campement_id': self.campement['id'], 'superficie': 30}, status=400)
        self.assertIn('superficie', errors)

    def test_nom_de_bloc_unique_dans_le_campement(self):
        self.referentiel()
        errors = self.post('blocs/', {'nom': 'a1', 'campement_id': self.campement['id']}, status=400)
        self.assertIn('nom', errors)


class PersonnelTests(ApiTestCase):
    def test_equipe_avec_membres_chef_et_bloc(self):
        ids = self.referentiel()
        self.assertEqual(self.equipe['membres_ids'], ids[:3])
        self.assertEqual(self.equipe['bloc_code'], 'BLC-001')
        personne = self.get(f'personnes/{ids[1]}/')
        self.assertEqual((personne['equipe_id'], personne['bloc_id']), (self.equipe['id'], self.bloc['id']))

    def test_chef_hors_membres_refuse(self):
        ids = self.referentiel()
        errors = self.post('equipes/', {'nom': 'Bravo', 'bloc_id': self.bloc2['id'], 'chef_id': ids[3], 'membres_ids': ids[:1]}, status=400)
        self.assertIn('chef_id', errors)

    def test_changement_d_equipe_conserve_l_historique(self):
        ids = self.referentiel()
        bravo = self.post('equipes/', {'nom': 'Bravo', 'bloc_id': self.bloc2['id'], 'chef_id': ids[1], 'membres_ids': [ids[1], ids[3]]})
        self.assertEqual(self.get(f"equipes/{self.equipe['id']}/")['membres_ids'], [ids[0], ids[2]])
        self.assertEqual(MembreEquipe.objects.filter(personne_id=ids[1]).count(), 2)
        self.assertEqual(self.get(f'personnes/{ids[1]}/')['equipe_id'], bravo['id'])

    def test_personne_affectee_prend_le_campement_de_l_equipe_et_telephone_unique(self):
        self.referentiel()
        personne = self.post('personnes/', {'nom': 'Nouveau', 'prenom': 'N', 'fonction_id': self.fonction.pk,
                                            'equipe_id': self.equipe['id']})
        self.assertEqual(personne['campement_id'], self.campement['id'])
        errors = self.post('personnes/', {'nom': 'Dup', 'prenom': 'D', 'telephone': '07 00 00 00 00',
                                          'fonction_id': self.fonction.pk, 'campement_id': self.campement['id']}, status=400)
        self.assertIn('telephone', errors)


class TravauxEtDepensesTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.referentiel()
        self.type = self.post('types-travaux/', {'libelle': 'Ouverture', 'unite_par_defaut': 'ha'})
        self.categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})

    def test_montant_du_travail_calcule_par_le_serveur(self):
        travail = self.post('travaux/', {'type_travail_id': self.type['id'], 'bloc_id': self.bloc['id'], 'equipe_id': self.equipe['id'],
                                         'date_travail': HIER, 'quantite': 12.5, 'prix_unitaire': 4000, 'montant_total': 1})
        self.assertEqual((travail['montant_total'], travail['unite']), (50000.0, 'ha'))

    def test_travail_termine_dans_le_futur_refuse(self):
        errors = self.post('travaux/', {'type_travail_id': self.type['id'], 'bloc_id': self.bloc['id'], 'equipe_id': self.equipe['id'],
                                        'date_travail': DEMAIN, 'quantite': 1, 'prix_unitaire': 1, 'statut': 'TERMINE'}, status=400)
        self.assertIn('statut', errors)

    def test_validations_depense(self):
        base = {'designation': 'Gasoil', 'categorie_id': self.categorie['id'], 'bloc_id': self.bloc['id'], 'montant_total': 5000}
        self.assertIn('date', self.post('depenses/', {**base, 'date': DEMAIN}, status=400))
        self.assertIn('bloc_id', self.post('depenses/', {**base, 'bloc_id': None, 'date': HIER}, status=400))
        achat_cat = CategorieDepense.achat_particuliers()
        self.assertIn('categorie_id', self.post('depenses/', {**base, 'categorie_id': achat_cat.pk, 'date': HIER}, status=400))
        depense = self.post('depenses/', {**base, 'date': HIER})
        self.assertEqual(depense['campement_id'], self.campement['id'])

    def test_dates_et_periodes_renseignees_automatiquement(self):
        depense = self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': self.categorie['id'],
                                          'bloc_id': self.bloc['id'], 'montant_total': 5000})
        travail = self.post('travaux/', {'type_travail_id': self.type['id'], 'bloc_id': self.bloc['id'],
                                         'equipe_id': self.equipe['id'], 'quantite': 1, 'prix_unitaire': 1})
        salaire = self.post('salaires/', {'personne_id': self.personnes[0]['id'], 'montant_brut': 1000})
        self.assertEqual((depense['date'], travail['date_travail']), (AUJOURDHUI.isoformat(), AUJOURDHUI.isoformat()))
        self.assertEqual(salaire['periode'], AUJOURDHUI.strftime('%Y-%m'))
        personne = self.post('personnes/', {'nom': 'Neuf', 'prenom': 'P', 'fonction_id': self.fonction.pk,
                                            'campement_id': self.campement['id']})
        self.assertEqual(personne['date_embauche'], AUJOURDHUI.isoformat())


class StockTests(ApiTestCase):
    def test_stock_calcule_et_sortie_bornee(self):
        self.referentiel()
        produit = self.post('produits/', {'nom': 'Herbicide', 'unite': 'L', 'stock_minimum': 50, 'prix_unitaire': 100})
        self.assertEqual(produit['code'], 'PRD-001')
        mvt = {'produit_id': produit['id'], 'bloc_id': self.bloc['id'], 'date': HIER, 'motif': 'Test'}
        entree = self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'ENTREE', 'quantite': 100})
        self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'SORTIE', 'quantite': 70})
        errors = self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'SORTIE', 'quantite': 31}, status=400)
        self.assertIn('Stock insuffisant', errors['quantite'][0])
        produit = self.get(f"produits/{produit['id']}/")
        self.assertEqual((produit['stock_calcule'], produit['status']), (30.0, 'low'))
        # Supprimer l'entrée rendrait le stock négatif
        self.assertEqual(self.client.delete(f"/api/v1/mouvements-stock/{entree['id']}/").status_code, 400)


class AchatsTests(ApiTestCase):
    def test_achat_genere_une_depense_et_suit_les_paiements(self):
        self.referentiel()
        achat = self.post('achats-particuliers/', {
            'particulier_nom': 'Koné Awa', 'particulier_telephone': '07 55 44 33 22', 'designation': 'Régimes',
            'poids': 200, 'prix_unitaire': 300, 'date_achat': HIER, 'bloc_id': self.bloc2['id'], 'montant_verse': 20000,
        })
        self.assertEqual((achat['reference'], achat['montant_total'], achat['statut'], achat['reste']),
                         ('ACH-0001', 60000.0, 'PARTIELLE', 40000.0))
        depense = Depense.objects.get(pk=achat['depense_id'])
        self.assertEqual((depense.categorie.code, depense.montant_total, depense.statut, depense.bloc_id),
                         ('CAT-ACH', 60000, 'PARTIELLE', self.bloc2['id']))
        # Une dépense issue d'un achat ne se modifie pas directement
        self.patch(f'depenses/{depense.pk}/', {'designation': 'X'}, status=400)
        self.post(f"achats-particuliers/{achat['id']}/payer/", {'montant': 50000, 'type_paiement': 'ESPECES'}, status=400)
        payee = self.post(f"achats-particuliers/{achat['id']}/payer/", {'montant': 40000, 'type_paiement': 'ESPECES'})
        self.assertEqual(payee['statut'], 'PAYEE')
        depense.refresh_from_db()
        self.assertEqual(depense.statut, 'PAYEE')
        self.assertEqual(self.client.delete(f"/api/v1/achats-particuliers/{achat['id']}/").status_code, 204)
        self.assertFalse(Depense.objects.filter(pk=depense.pk).exists())


class RemunerationsTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ids = self.referentiel()
        self.salaires = [self.post('salaires/', {'personne_id': pid, 'periode': '2025-09', 'montant_brut': 60000, 'montant_ponction': 10000})
                         for pid in self.ids[:3]]

    def test_liste_triee_du_plus_recent_au_plus_ancien(self):
        # Les requêtes agrégées ignorent Meta.ordering : le tri doit rester explicite
        self.post('salaires/', {'personne_id': self.ids[0], 'periode': '2025-08', 'montant_brut': 1000})
        self.post('salaires/', {'personne_id': self.ids[0], 'periode': '2025-10', 'montant_brut': 1000})
        self.assertEqual([s['periode'] for s in self.get('salaires/')][:2], ['2025-10', '2025-09'])
        self.assertEqual(self.get('salaires/')[-1]['periode'], '2025-08')

    def test_net_et_validations(self):
        self.assertEqual(self.salaires[0]['montant_net'], 50000.0)
        self.assertIn('periode', self.post('salaires/', {'personne_id': self.ids[0], 'periode': '2025-09', 'montant_brut': 1}, status=400))
        self.assertIn('montant_ponction', self.post('salaires/', {'personne_id': self.ids[3], 'periode': '2025-09',
                                                                  'montant_brut': 100, 'montant_ponction': 200}, status=400))

    def test_paiement_individuel_borne_par_le_reste(self):
        base = {'personne_id': self.ids[0], 'periode': '2025-09', 'date': HIER, 'type_paiement': 'ESPECES'}
        self.post('paiements-salaire/', {**base, 'montant': 30000})
        self.assertIn('montant', self.post('paiements-salaire/', {**base, 'montant': 20001}, status=400))
        self.assertIn('periode', self.post('paiements-salaire/', {**base, 'periode': '2025-10', 'montant': 1}, status=400))
        salaire = self.get(f"salaires/{self.salaires[0]['id']}/")
        self.assertEqual((salaire['montant_paye'], salaire['reste'], salaire['statut']), (30000.0, 20000.0, 'PARTIELLE'))

    def test_paiement_groupe_tout_ou_rien(self):
        data = {'equipe_id': self.equipe['id'], 'periode': '2025-09', 'date': HIER, 'type_paiement': 'ESPECES',
                'lignes': [{'personne_id': self.ids[0], 'montant': 50000}, {'personne_id': self.ids[1], 'montant': 99999}]}
        errors = self.post('paiements-salaire/groupe/', data, status=400)
        self.assertIn('montant', errors['lignes'][1])
        self.assertEqual(PaiementSalaire.objects.count(), 0)
        data['lignes'][1]['montant'] = 50000
        paiements = self.post('paiements-salaire/groupe/', data)
        self.assertEqual({p['mode'] for p in paiements}, {'EQUIPE'})
        self.assertEqual(self.get(f"salaires/{self.salaires[1]['id']}/")['statut'], 'PAYEE')
        # Personne hors de l'équipe
        data['lignes'] = [{'personne_id': self.ids[3], 'montant': 1}]
        self.assertIn('personne_id', self.post('paiements-salaire/groupe/', data, status=400)['lignes'][0])

    def test_tableau_de_bord(self):
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': categorie['id'], 'bloc_id': self.bloc['id'],
                                'date': '2025-09-10', 'montant_total': 7000, 'statut': 'PAYEE'})
        self.post('previsions/', {'campement_id': self.campement['id'], 'categorie_id': categorie['id'], 'periode': '2025-09', 'montant_prevu': 10000})
        self.post('paiements-salaire/', {'personne_id': self.ids[0], 'periode': '2025-09', 'montant': 50000, 'date': HIER, 'type_paiement': 'ESPECES'})
        data = self.get('tableau-de-bord/?periode=2025-09')
        kpis = data['kpis']
        self.assertEqual((kpis['totalDepenses'], kpis['remunerationDuee'], kpis['remunerationPayee'], kpis['resteAPayer']),
                         (7000.0, 150000.0, 50000.0, 100000.0))
        self.assertEqual(data['previsionsData'][0]['Réalisé'], 7000.0)
        prevision = self.get('previsions/')[0]
        self.assertEqual((prevision['realise'], prevision['ecart']), (7000.0, -3000.0))
        # Filtre par bloc : rien sur le bloc 2
        self.assertEqual(self.get(f"tableau-de-bord/?periode=2025-09&bloc_id={self.bloc2['id']}")['kpis']['totalDepenses'], 0)

    def test_rapport_excel(self):
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        self.post('depenses/', {'designation': '=Gasoil tracteur', 'categorie_id': categorie['id'], 'bloc_id': self.bloc['id'],
                                'date': '2025-09-10', 'montant_total': 7000.5, 'statut': 'PAYEE'})
        response = self.client.get('/api/v1/rapport/?periode=2025-09')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], XLSX)
        self.assertIn('attachment; filename="ALLAKRO_Rapport_2025-09.xlsx"', response['Content-Disposition'])
        noms, textes, feuilles = lire_classeur(response.content)
        self.assertEqual(noms, ['Synthèse', 'Bilan financier', 'Dépenses', 'Achats particuliers', 'Prévisions',
                                'Rémunérations', 'Paiements', 'Travaux', 'Exploitation', 'Stock', 'Mouvements de stock',
                                'Journal'])
        self.assertIn('Septembre 2025', textes)
        # Un texte saisi commençant par « = » reste du texte : jamais une formule
        self.assertIn('=Gasoil tracteur', textes)
        self.assertNotIn('<f>Gasoil', feuilles['Dépenses'])
        self.assertIn('<v>7000.5</v>', feuilles['Dépenses'])
        # Rémunérations nettes dues : 3 × 50 000
        self.assertIn('<v>150000</v>', feuilles['Bilan financier'])

        # Périmètre : bloc sans dépense
        response = self.client.get(f"/api/v1/rapport/?periode=2025-09&bloc_id={self.bloc2['id']}")
        self.assertIn('ALLAKRO_Rapport_2025-09_BLC-002.xlsx', response['Content-Disposition'])
        self.assertNotIn('<v>7000.5</v>', lire_classeur(response.content)[2]['Dépenses'])
        self.assertEqual(self.client.get('/api/v1/rapport/?periode=2025-13').status_code, 400)
        self.assertEqual(self.client.get('/api/v1/rapport/?bloc_id=abc').status_code, 400)
        self.assertTrue(Journal.objects.filter(action='Consultation', table_concernee='Rapport').exists())

        # Le journal n'est pas inclus pour le superviseur
        self.login(self.superviseur.username)
        noms = lire_classeur(self.client.get('/api/v1/rapport/').content)[0]
        self.assertEqual((noms[0], 'Journal' in noms), ('Synthèse', False))

    def test_journal_des_actions(self):
        actions = set(Journal.objects.values_list('action', flat=True))
        self.assertTrue({'Connexion', 'Création'} <= actions)
