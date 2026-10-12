"""Mot de passe oublié par e-mail, notifications, clôture mensuelle."""
import re
from io import StringIO

from django.core import mail
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import Notification, ReinitialisationMotDePasse
from apps.core.testing import HIER, ApiTestCase, jour
from apps.finances.models import ClotureMensuelle, Salaire


class MotDePasseOublieTests(ApiTestCase):
    def demander(self, email):
        return self.client.post('/api/v1/auth/mot-de-passe-oublie/', {'email': email}, format='json')

    def jeton_du_courrier(self):
        corps = mail.outbox[-1].body
        return re.search(r'token=([\w-]+)', corps).group(1)

    def test_reponse_identique_que_le_compte_existe_ou_non(self):
        connu = self.demander(self.superviseur.username)
        inconnu = self.demander('personne@test.ci')
        self.assertEqual((connu.status_code, connu.json()), (inconnu.status_code, inconnu.json()))
        self.assertEqual(len(mail.outbox), 1)  # un seul courrier, pour le compte existant
        self.assertEqual(mail.outbox[0].to, [self.superviseur.username])
        self.assertIn('Réinitialisation', mail.outbox[0].subject)

    def test_parcours_complet_et_usage_unique(self):
        self.demander(self.superviseur.username)
        jeton = self.jeton_du_courrier()
        # Seule l'empreinte est stockée : le jeton lui-même n'est nulle part en base
        self.assertFalse(ReinitialisationMotDePasse.objects.filter(empreinte=jeton).exists())
        anonyme = APIClient()
        self.assertTrue(anonyme.get(f'/api/v1/auth/reinitialiser-mot-de-passe/?token={jeton}').json()['valide'])
        faible = anonyme.post('/api/v1/auth/reinitialiser-mot-de-passe/', {'token': jeton, 'nouveau_mot_de_passe': 'abc', 'confirmation': 'abc'}, format='json')
        self.assertEqual(faible.status_code, 400)
        diff = anonyme.post('/api/v1/auth/reinitialiser-mot-de-passe/', {'token': jeton, 'nouveau_mot_de_passe': 'Nouveau@Pass2026', 'confirmation': 'autre'}, format='json')
        self.assertEqual(diff.status_code, 400)
        ok = anonyme.post('/api/v1/auth/reinitialiser-mot-de-passe/', {'token': jeton, 'nouveau_mot_de_passe': 'Nouveau@Pass2026', 'confirmation': 'Nouveau@Pass2026'}, format='json')
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.login(self.superviseur.username, 'Motdepasse@1').status_code, 401)
        self.assertEqual(self.login(self.superviseur.username, 'Nouveau@Pass2026').status_code, 200)
        # Le lien ne sert qu'une fois
        deuxieme = anonyme.post('/api/v1/auth/reinitialiser-mot-de-passe/', {'token': jeton, 'nouveau_mot_de_passe': 'Autre@Pass2026x', 'confirmation': 'Autre@Pass2026x'}, format='json')
        self.assertEqual(deuxieme.status_code, 400)
        self.assertFalse(anonyme.get(f'/api/v1/auth/reinitialiser-mot-de-passe/?token={jeton}').json()['valide'])

    def test_les_sessions_ouvertes_sont_fermees(self):
        ouverte = APIClient()
        ouverte.post('/api/v1/auth/login/', {'username': self.superviseur.username, 'password': 'Motdepasse@1'}, format='json')
        self.assertEqual(ouverte.get('/api/v1/auth/me/').status_code, 200)
        self.demander(self.superviseur.username)
        APIClient().post('/api/v1/auth/reinitialiser-mot-de-passe/', {'token': self.jeton_du_courrier(), 'nouveau_mot_de_passe': 'Nouveau@Pass2026',
                                                                       'confirmation': 'Nouveau@Pass2026'}, format='json')
        self.assertEqual(ouverte.get('/api/v1/auth/me/').status_code, 401)

    def test_une_nouvelle_demande_annule_la_precedente_et_le_nombre_est_limite(self):
        self.demander(self.superviseur.username)
        premier = self.jeton_du_courrier()
        self.demander(self.superviseur.username)
        second = self.jeton_du_courrier()
        anonyme = APIClient()
        self.assertFalse(anonyme.get(f'/api/v1/auth/reinitialiser-mot-de-passe/?token={premier}').json()['valide'])
        self.assertTrue(anonyme.get(f'/api/v1/auth/reinitialiser-mot-de-passe/?token={second}').json()['valide'])
        self.demander(self.superviseur.username)
        self.demander(self.superviseur.username)  # 4e demande dans l'heure : aucun courrier de plus
        self.assertEqual(len(mail.outbox), 3)

    def test_lien_invalide_ou_expire(self):
        anonyme = APIClient()
        self.assertFalse(anonyme.get('/api/v1/auth/reinitialiser-mot-de-passe/?token=inconnu').json()['valide'])
        refus = anonyme.post('/api/v1/auth/reinitialiser-mot-de-passe/', {'token': 'inconnu', 'nouveau_mot_de_passe': 'Nouveau@Pass2026', 'confirmation': 'Nouveau@Pass2026'}, format='json')
        self.assertEqual(refus.status_code, 400)
        self.demander(self.superviseur.username)
        jeton = self.jeton_du_courrier()
        from django.utils import timezone
        ReinitialisationMotDePasse.objects.update(expire_le=timezone.now())
        self.assertFalse(anonyme.get(f'/api/v1/auth/reinitialiser-mot-de-passe/?token={jeton}').json()['valide'])

    def test_compte_desactive_ne_recoit_rien(self):
        from apps.accounts.models import Utilisateur
        Utilisateur.objects.filter(pk=self.superviseur.pk).update(actif=False)
        self.demander(self.superviseur.username)
        self.assertEqual(len(mail.outbox), 0)


class NotificationsTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ids = self.referentiel()

    def test_stock_sous_le_seuil_previent_les_autres_comptes(self):
        produit = self.post('produits/', {'nom': 'Engrais', 'unite': 'kg', 'stock_minimum': 50, 'prix_unitaire': 100})
        mvt = {'produit_id': produit['id'], 'bloc_id': self.bloc['id'], 'date': HIER, 'motif': 'Test'}
        self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'ENTREE', 'quantite': 100})
        self.assertEqual(Notification.objects.count(), 0)
        self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'SORTIE', 'quantite': 70})  # 30 < 50 : franchissement du seuil
        self.assertEqual(list(Notification.objects.values_list('utilisateur__username', flat=True)), [self.superviseur.username])
        self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'SORTIE', 'quantite': 5})   # déjà sous le seuil : pas de répétition
        self.assertEqual(Notification.objects.count(), 1)
        self.login(self.superviseur.username)
        donnees = self.get('notifications/')
        self.assertEqual((donnees['non_lues'], donnees['notifications'][0]['type']), (1, 'stock'))
        self.assertIn('Engrais', donnees['notifications'][0]['titre'])

    def test_marquer_comme_lue(self):
        Notification.objects.create(utilisateur=self.admin, type='x', titre='A')
        autre = Notification.objects.create(utilisateur=self.superviseur, type='x', titre='B')
        n = self.get('notifications/')['notifications'][0]
        self.post(f"notifications/{n['id']}/lire/", {}, status=200)
        self.assertEqual(self.get('notifications/')['non_lues'], 0)
        # Les notifications d'un autre compte sont intouchables
        self.post(f'notifications/{autre.pk}/lire/', {}, status=200)
        autre.refresh_from_db()
        self.assertFalse(autre.lue)
        Notification.objects.create(utilisateur=self.admin, type='x', titre='C')
        Notification.objects.create(utilisateur=self.admin, type='x', titre='D')
        self.assertEqual(self.post('notifications/lire-tout/', {}, status=200)['marquees'], 2)

    def test_annulation_par_le_superviseur_previent_le_big_boss(self):
        travail = self.creer_travail([self.ids[0]], quantite=10, prix_unitaire=1000)
        salaire = Salaire.objects.get(travail_id=travail['id'])
        paiement = self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 1000, 'type_paiement': 'ESPECES'})
        self.login(self.superviseur.username)
        self.post(f"paiements-salaire/{paiement['id']}/annuler/", {}, status=200)
        self.post(f"travaux/{travail['id']}/annuler/", {}, status=200)
        self.login(self.admin.username)
        titres = [n['titre'] for n in self.get('notifications/')['notifications']]
        self.assertTrue(any('annulé' in t and paiement['numero'] in t for t in titres))
        self.assertTrue(any(t.startswith('Travail annulé') for t in titres))
        # L'auteur d'une action n'est jamais prévenu de sa propre action
        self.assertEqual(Notification.objects.filter(utilisateur=self.superviseur, type='annulation').count(), 0)

    def test_rappel_quotidien_des_remunerations_a_payer(self):
        self.creer_travail([self.ids[0]], quantite=10, prix_unitaire=1000, date_travail=jour(-20), date_fin=jour(-15))
        premiere = self.get('notifications/')
        rappels = [n for n in premiere['notifications'] if n['type'] == 'salaires']
        self.assertEqual(len(rappels), 1)
        self.assertIn('10 000 FCFA', rappels[0]['message'].replace(' ', ' ').replace('\xa0', ' '))
        self.assertEqual(len([n for n in self.get('notifications/')['notifications'] if n['type'] == 'salaires']), 1)  # une fois par jour
        self.login(self.superviseur.username)
        self.assertEqual([n for n in self.get('notifications/')['notifications'] if n['type'] == 'salaires'], [])

    def test_blocage_de_connexion_previent_le_big_boss(self):
        for _ in range(5):
            self.client.post('/api/v1/auth/login/', {'username': self.superviseur.username, 'password': 'mauvais'}, format='json', REMOTE_ADDR='198.51.100.9')
        self.login(self.admin.username)
        titres = [n['titre'] for n in self.get('notifications/')['notifications']]
        self.assertTrue(any('bloquée' in t and self.superviseur.username in t for t in titres), titres)


class ClotureMensuelleTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ids = self.referentiel()
        self.categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        self.passe = jour(-45)
        self.periode = self.passe[:7]
        self.depense = self.post('depenses/', {'designation': 'Gasoil', 'categorie_id': self.categorie['id'], 'bloc_id': self.bloc['id'],
                                               'date': self.passe, 'montant_total': 5000})
        self.travail = self.creer_travail([self.ids[0]], quantite=10, prix_unitaire=1000, date_travail=self.passe, date_fin=self.passe)

    def cloturer(self, periode=None, status=201):
        return self.post('clotures/', {'periode': periode or self.periode, 'commentaire': 'Mois vérifié'}, status=status)

    def test_cloture_reservee_au_big_boss_et_aux_mois_termines(self):
        self.cloturer(jour(0)[:7], status=400)  # le mois en cours ne se clôture pas
        self.post('clotures/', {'periode': 'pas-un-mois'}, status=400)
        self.login(self.superviseur.username)
        self.post('clotures/', {'periode': self.periode}, status=403)
        self.post(f'clotures/{self.periode}/rouvrir/', {}, status=403)
        self.login(self.admin.username)
        cloture = self.cloturer()
        self.assertEqual((cloture['periode'], cloture['cloturee'], cloture['kpis']['totalDepenses']), (self.periode, True, 5000.0))
        self.cloturer(status=400)  # déjà clôturé
        # Le superviseur voit qu'un mois est clôturé, sans les chiffres
        self.login(self.superviseur.username)
        ligne = self.get('clotures/')[0]
        self.assertTrue(ligne['cloturee'])
        self.assertNotIn('kpis', ligne)

    def test_un_mois_cloture_refuse_toute_ecriture(self):
        self.cloturer()
        depense = {'designation': 'Intrus', 'categorie_id': self.categorie['id'], 'bloc_id': self.bloc['id'], 'date': self.passe, 'montant_total': 1}
        self.assertIn('clôturée', self.post('depenses/', depense, status=400)['detail'])
        self.patch(f"depenses/{self.depense['id']}/", {'montant_total': 1}, status=400)
        self.delete(f"depenses/{self.depense['id']}/", status=400)
        # Rémunération du mois clôturé : plus de paiement (même daté d'aujourd'hui), plus d'annulation du travail
        salaire = Salaire.objects.get(travail_id=self.travail['id'])
        self.assertIn('clôturée', self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 100, 'type_paiement': 'ESPECES'}, status=400)['detail'])
        self.post(f"travaux/{self.travail['id']}/annuler/", {}, status=400)
        self.delete(f"travaux/{self.travail['id']}/", status=400)
        self.patch(f"travaux/{self.travail['id']}/", {'quantite': 99}, status=400)
        # Mouvement de stock et achat de ce mois
        produit = self.post('produits/', {'nom': 'Engrais', 'unite': 'kg', 'stock_minimum': 0, 'prix_unitaire': 1})
        self.post('mouvements-stock/', {'produit_id': produit['id'], 'bloc_id': self.bloc['id'], 'date': self.passe, 'motif': 'x', 'type_mouvement': 'ENTREE', 'quantite': 5}, status=400)
        achat = {'particulier_nom': 'Koné', 'designation': 'Bois', 'poids': 1, 'prix_unitaire': 10, 'date_achat': self.passe, 'bloc_id': self.bloc['id']}
        self.post('achats-particuliers/', achat, status=400)
        # Le mois courant reste libre
        self.post('depenses/', {**depense, 'date': HIER}, status=201)

    def test_reouverture_puis_nouvelle_cloture_et_coherence(self):
        self.cloturer()
        call_command('verifier_coherence', stdout=StringIO())
        rouvert = self.post(f'clotures/{self.periode}/rouvrir/', {}, status=200)
        self.assertFalse(rouvert['cloturee'])
        self.post(f'clotures/{self.periode}/rouvrir/', {}, status=400)  # déjà ouvert
        self.patch(f"depenses/{self.depense['id']}/", {'montant_total': 7000})
        nouvelle = self.cloturer()
        self.assertEqual(nouvelle['kpis']['totalDepenses'], 7000.0)
        self.assertEqual(ClotureMensuelle.objects.count(), 1)
        # Une modification directe en base (contournant l'application) est détectée par le contrôle de cohérence
        from apps.finances.models import Depense
        Depense.objects.filter(pk=self.depense['id']).update(montant_total=1)
        sortie = StringIO()
        with self.assertRaises(Exception):
            call_command('verifier_coherence', stdout=sortie)
        self.assertIn(f'Mois clôturé {self.periode}', sortie.getvalue())

    def test_la_cloture_notifie_les_autres_comptes(self):
        self.cloturer()
        self.assertEqual(Notification.objects.filter(type='cloture', utilisateur=self.superviseur).count(), 1)
        self.assertEqual(Notification.objects.filter(type='cloture', utilisateur=self.admin).count(), 0)
