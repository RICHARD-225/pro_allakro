"""Authentification, droits, mots de passe, limitation des tentatives de connexion, journal."""
from django.core.cache import cache

from apps.accounts.models import Journal, TentativeConnexion, Utilisateur
from apps.core.models import Personne
from apps.core.testing import HIER, ApiTestCase


class AuthTests(ApiTestCase):
    def test_acces_refuse_sans_connexion(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.get('/api/v1/plantations/').status_code, 401)

    def test_connexion_cookie_httponly_et_profil(self):
        response = self.login('ADMIN@test.ci')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.cookies['allakro_access']['httponly'])
        self.assertEqual(self.get('auth/me/')['role'], 'big_boss')
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

    def test_journal_des_actions(self):
        self.referentiel()
        actions = set(Journal.objects.values_list('action', flat=True))
        self.assertTrue({'Connexion', 'Création'} <= actions)


class LimitationTests(ApiTestCase):
    def test_compte_bloque_apres_cinq_echecs(self):
        for _ in range(5):
            self.assertEqual(self.login(self.superviseur.username, 'mauvais').status_code, 401)
        # Même avec le bon mot de passe, le compte est bloqué temporairement
        response = self.login(self.superviseur.username)
        self.assertEqual(response.status_code, 429)
        self.assertIn('Trop de tentatives', response.json()['detail'])
        self.assertTrue(response.has_header('Retry-After'))
        # Les autres comptes ne sont pas touchés
        self.assertEqual(self.login(self.admin.username).status_code, 200)
        self.assertEqual(TentativeConnexion.objects.filter(identifiant=self.superviseur.username, reussie=False).count(), 5)

    def test_reussite_remet_le_compteur_a_zero(self):
        for _ in range(4):
            self.login(self.superviseur.username, 'mauvais')
        self.assertEqual(self.login(self.superviseur.username).status_code, 200)
        cache.clear()  # on ne teste ici que le blocage par compte, pas le débit par adresse IP
        for _ in range(4):
            self.assertEqual(self.login(self.superviseur.username, 'mauvais').status_code, 401)
        self.assertEqual(self.login(self.superviseur.username).status_code, 200)

    def test_debit_limite_par_adresse_ip(self):
        cache.clear()
        statuts = [self.login(f'inconnu{i}@test.ci', 'x').status_code for i in range(11)]
        self.assertEqual(statuts[:10], [401] * 10)
        self.assertEqual(statuts[10], 429)


class SuiviDesUtilisateursTests(ApiTestCase):
    """Le Big Boss crée un superviseur (avec sa fiche de personnel) et suit son activité."""

    def setUp(self):
        super().setUp()
        self.referentiel()

    def creer_superviseur(self, **valeurs):
        donnees = {'prenom': 'Awa', 'nom_personne': 'Coulibaly', 'bloc_id': self.bloc['id'], 'email': 'awa@test.ci',
                   'role': 'superviseur', 'password': 'Superviseur@2026'}
        donnees.update(valeurs)
        return self.post('utilisateurs/', donnees)

    def test_le_big_boss_cree_un_superviseur_avec_sa_fiche_de_personnel(self):
        compte = self.creer_superviseur()
        self.assertEqual(compte['role'], 'superviseur')
        personne = Personne.objects.get(pk=compte['personne_id'])
        self.assertEqual((personne.nom, personne.prenom, personne.bloc_id), ('Coulibaly', 'Awa', self.bloc['id']))
        self.assertEqual(Utilisateur.objects.get(pk=compte['id']).role.code, 'superviseur')
        # Il peut se connecter, mais n'accède pas à l'administration
        self.assertEqual(self.login('awa@test.ci', 'Superviseur@2026').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/utilisateurs/').status_code, 403)

    def test_creation_d_un_compte_exige_prenom_nom_bloc_et_mot_de_passe(self):
        erreurs = self.post('utilisateurs/', {'email': 'x@test.ci', 'role': 'superviseur', 'password': 'Superviseur@2026'}, status=400)
        self.assertEqual({'prenom', 'nom_personne', 'bloc_id'} <= set(erreurs), True)
        erreurs = self.post('utilisateurs/', {'prenom': 'A', 'nom_personne': 'B', 'bloc_id': self.bloc['id'], 'email': 'x@test.ci',
                                              'role': 'superviseur'}, status=400)
        self.assertIn('password', erreurs)

    def test_suivi_de_l_activite_d_un_utilisateur(self):
        compte = self.creer_superviseur()
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})  # le Big Boss gère les catégories
        self.login('awa@test.ci', 'Superviseur@2026')
        self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': categorie['id'], 'bloc_id': self.bloc['id'],
                                'date': HIER, 'montant_total': 1000})
        self.login(self.admin.username)
        suivi = self.get(f"utilisateurs/{compte['id']}/activite/")
        self.assertEqual((suivi['role'], suivi['nb_connexions'], suivi['actif']), ('superviseur', 1, True))
        self.assertGreaterEqual(suivi['nb_actions'], 1)
        self.assertEqual(suivi['dernieres_actions'][0]['action'], 'Création')
        self.assertIsNotNone(suivi['derniere_connexion'])
        # Réservé au Big Boss
        self.login('awa@test.ci', 'Superviseur@2026')
        self.assertEqual(self.client.get(f"/api/v1/utilisateurs/{compte['id']}/activite/").status_code, 403)
