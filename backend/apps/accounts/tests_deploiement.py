"""Déploiement : adresse de base de données (DATABASE_URL) et premier démarrage d'une base vide (comptes Big Boss)."""
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.accounts.models import RoleUtilisateur, Utilisateur
from apps.core.config_db import base_depuis_url


class AdresseBaseTests(SimpleTestCase):
    def test_adresse_neon_avec_options_et_caracteres_speciaux(self):
        reglage = base_depuis_url('postgresql://neondb_owner:p%40ss%2Fw0rd@ep-cool-123-pooler.eu-west-2.aws.neon.tech/allakro?sslmode=require&channel_binding=require')
        self.assertEqual(reglage['NAME'], 'allakro')
        self.assertEqual(reglage['USER'], 'neondb_owner')
        self.assertEqual(reglage['PASSWORD'], 'p@ss/w0rd')
        self.assertEqual(reglage['HOST'], 'ep-cool-123-pooler.eu-west-2.aws.neon.tech')
        self.assertEqual(reglage['PORT'], '5432')
        self.assertEqual(reglage['OPTIONS'], {'sslmode': 'require', 'channel_binding': 'require'})
        self.assertTrue(reglage['DISABLE_SERVER_SIDE_CURSORS'])  # répartiteur de connexions

    def test_adresse_directe_et_port(self):
        reglage = base_depuis_url('postgres://u:p@db.interne:6543/base')
        self.assertEqual((reglage['HOST'], reglage['PORT'], reglage['OPTIONS']), ('db.interne', '6543', {}))
        self.assertNotIn('DISABLE_SERVER_SIDE_CURSORS', reglage)

    def test_adresse_invalide_refusee(self):
        for url in ('mysql://u:p@h/b', 'postgresql://u:p@h/', 'postgresql:///base', 'n importe quoi'):
            with self.assertRaises(ValueError, msg=url):
                base_depuis_url(url)


ENV = {'BIG_BOSS_1_EMAIL': 'Moi@Exemple.CI', 'BIG_BOSS_1_MOT_DE_PASSE': 'Premier@Pass2026', 'BIG_BOSS_1_PRENOM': 'Richard', 'BIG_BOSS_1_NOM': 'K',
       'BIG_BOSS_2_EMAIL': 'client@exemple.ci', 'BIG_BOSS_2_MOT_DE_PASSE': 'Client@Pass2026', 'BIG_BOSS_2_PRENOM': 'Awa', 'BIG_BOSS_2_NOM': 'Client'}


class PremierDemarrageTests(TestCase):
    def lancer(self, env=ENV):
        sortie = StringIO()
        with mock.patch.dict('os.environ', env, clear=False):
            call_command('initialiser_production', stdout=sortie)
        return sortie.getvalue()

    def test_cree_les_roles_et_les_deux_comptes_qui_peuvent_se_connecter(self):
        sortie = self.lancer()
        self.assertEqual(set(RoleUtilisateur.objects.values_list('code', flat=True)), {'big_boss', 'superviseur'})
        self.assertEqual(Utilisateur.objects.count(), 2)
        self.assertNotIn('Pass2026', sortie)  # les mots de passe ne sont jamais affichés
        client = APIClient()
        for email, mdp in (('moi@exemple.ci', 'Premier@Pass2026'), ('client@exemple.ci', 'Client@Pass2026')):
            reponse = client.post('/api/v1/auth/login/', {'username': email, 'password': mdp}, format='json')
            self.assertEqual(reponse.status_code, 200, reponse.content.decode())
            self.assertEqual(client.get('/api/v1/auth/me/').json()['role'], 'big_boss')
            client.cookies.clear()

    def test_sans_danger_a_chaque_demarrage_et_ne_touche_pas_aux_comptes_existants(self):
        self.lancer()
        compte = Utilisateur.objects.get(username='moi@exemple.ci')
        ancien = compte.password_hash
        self.lancer({**ENV, 'BIG_BOSS_1_MOT_DE_PASSE': 'Autre@Pass2026xyz'})  # même e-mail, autre mot de passe : ignoré
        self.assertEqual(Utilisateur.objects.count(), 2)
        compte.refresh_from_db()
        self.assertEqual(compte.password_hash, ancien)
        self.assertEqual(RoleUtilisateur.objects.count(), 2)

    def test_mot_de_passe_trop_faible_ou_absent_refuse(self):
        vide = {k: '' for k in ENV}
        with self.assertRaises(CommandError):
            self.lancer({**vide, 'BIG_BOSS_1_EMAIL': 'a@b.ci', 'BIG_BOSS_1_MOT_DE_PASSE': '1234'})
        with self.assertRaises(CommandError):
            self.lancer({**vide, 'BIG_BOSS_1_EMAIL': 'a@b.ci'})
        self.assertEqual(Utilisateur.objects.count(), 0)

    def test_sans_variables_les_roles_sont_crees_et_un_avertissement_est_donne(self):
        sortie = self.lancer({k: '' for k in ENV})
        self.assertEqual(RoleUtilisateur.objects.count(), 2)
        self.assertIn('personne ne pourra se connecter', sortie)
