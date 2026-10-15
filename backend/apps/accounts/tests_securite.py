"""Sécurité : CSRF, sessions (révocation, rotation), blocage de connexion, en-têtes, périmètre par campement, injections, contraintes."""
from django.db import IntegrityError, transaction
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.models import JetonRevoque, TentativeConnexion, Utilisateur
from apps.core.testing import AUJOURDHUI, HIER, ApiTestCase


class CsrfEtSessionsTests(ApiTestCase):
    def test_csrf_obligatoire_pour_modifier_des_donnees(self):
        client = APIClient(enforce_csrf_checks=True)
        # Sans jeton : refusé, même pour la connexion
        refus = client.post('/api/v1/auth/login/', {'username': self.admin.username, 'password': 'Motdepasse@1'}, format='json')
        self.assertEqual((refus.status_code, refus.json()['code']), (403, 'csrf'))
        jeton = client.get('/api/v1/auth/csrf/').json()['csrfToken']
        self.assertTrue(client.cookies['csrftoken'].value)
        ok = client.post('/api/v1/auth/login/', {'username': self.admin.username, 'password': 'Motdepasse@1'}, format='json',
                         HTTP_X_CSRFTOKEN=jeton)
        self.assertEqual(ok.status_code, 200)
        # Connecté (cookie de session) mais sans en-tête CSRF : une requête d'un site tiers serait refusée
        self.assertEqual(client.post('/api/v1/plantations/', {'nom': 'X', 'superficie': 1}, format='json').status_code, 403)
        self.assertEqual(client.post('/api/v1/plantations/', {'nom': 'X', 'superficie': 1}, format='json',
                                     HTTP_X_CSRFTOKEN='faux').status_code, 403)
        cree = client.post('/api/v1/plantations/', {'nom': 'Avec jeton', 'superficie': 1}, format='json', HTTP_X_CSRFTOKEN=jeton)
        self.assertEqual(cree.status_code, 201)
        # La lecture ne demande pas de jeton
        self.assertEqual(client.get('/api/v1/plantations/').status_code, 200)

    def test_origine_non_autorisee_refusee(self):
        client = APIClient(enforce_csrf_checks=True)
        jeton = client.get('/api/v1/auth/csrf/').json()['csrfToken']
        reponse = client.post('/api/v1/auth/login/', {'username': 'a', 'password': 'b'}, format='json', HTTP_X_CSRFTOKEN=jeton,
                              HTTP_ORIGIN='https://site-pirate.example')
        self.assertEqual(reponse.status_code, 403)

    def test_deconnexion_revoque_les_jetons(self):
        ancien = self.client.cookies['allakro_access'].value
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 200)
        self.assertEqual(self.client.post('/api/v1/auth/logout/').status_code, 200)
        self.assertGreaterEqual(JetonRevoque.objects.count(), 1)
        # Le jeton copié avant la déconnexion ne sert plus
        copie = APIClient()
        copie.cookies['allakro_access'] = ancien
        self.assertEqual(copie.get('/api/v1/auth/me/').status_code, 401)

    def test_rotation_du_jeton_de_rafraichissement_et_detection_de_reutilisation(self):
        premier_refresh = self.client.cookies['allakro_refresh'].value
        self.assertEqual(self.client.post('/api/v1/auth/refresh/').status_code, 200)
        nouveau_refresh = self.client.cookies['allakro_refresh'].value
        self.assertNotEqual(premier_refresh, nouveau_refresh)
        # Le jeton déjà utilisé est refusé, et toutes les sessions du compte sont alors invalidées
        voleur = APIClient()
        voleur.cookies['allakro_refresh'] = premier_refresh
        self.assertEqual(voleur.post('/api/v1/auth/refresh/').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 401)
        self.assertEqual(self.client.post('/api/v1/auth/refresh/').status_code, 401)

    def test_un_jeton_de_rafraichissement_ne_sert_pas_d_acces(self):
        refresh = self.client.cookies['allakro_refresh'].value
        copie = APIClient()
        copie.cookies['allakro_access'] = refresh
        self.assertEqual(copie.get('/api/v1/auth/me/').status_code, 401)

    def test_changement_de_mot_de_passe_ferme_les_autres_sessions(self):
        autre = APIClient()
        autre.post('/api/v1/auth/login/', {'username': self.admin.username, 'password': 'Motdepasse@1'}, format='json')
        self.assertEqual(autre.get('/api/v1/auth/me/').status_code, 200)
        self.post('auth/mot-de-passe/', {'ancien_mot_de_passe': 'Motdepasse@1', 'nouveau_mot_de_passe': 'Nouveau@Pass2026',
                                         'confirmation': 'Nouveau@Pass2026'}, status=200)
        self.assertEqual(autre.get('/api/v1/auth/me/').status_code, 401)
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 200)  # la session courante continue

    def test_role_modifie_ou_compte_desactive_ferme_les_sessions(self):
        superviseur = APIClient()
        superviseur.post('/api/v1/auth/login/', {'username': self.superviseur.username, 'password': 'Motdepasse@1'}, format='json')
        self.assertEqual(superviseur.get('/api/v1/auth/me/').status_code, 200)
        avant = Utilisateur.objects.get(pk=self.superviseur.pk).token_version
        self.patch(f'utilisateurs/{self.superviseur.pk}/', {'role': 'big_boss'})
        self.assertEqual(Utilisateur.objects.get(pk=self.superviseur.pk).token_version, avant + 1)
        self.assertEqual(superviseur.get('/api/v1/auth/me/').status_code, 401)

    def test_politique_de_mot_de_passe(self):
        for faible in ('abcdefghij', 'ABCDEFGH12', 'Court1a', '12345678901', 'motdepasse1A'[:9]):
            erreurs = self.post('utilisateurs/', {'prenom': 'A', 'nom_personne': 'B', 'bloc_id': self._bloc(), 'email': 'z@test.ci',
                                                  'role': 'superviseur', 'password': faible}, status=400)
            self.assertIn('password', erreurs, faible)

    def _bloc(self):
        if not hasattr(self, 'bloc'):
            self.referentiel()
        return self.bloc['id']


class BlocageDeConnexionTests(ApiTestCase):
    def connexion(self, mot_de_passe, ip, compte=None, **extra):
        return self.client.post('/api/v1/auth/login/', {'username': compte or self.superviseur.username, 'password': mot_de_passe},
                                format='json', REMOTE_ADDR=ip, **extra)

    @override_settings(TRUSTED_PROXY_COUNT=0)
    def test_l_en_tete_x_forwarded_for_est_ignore_sans_mandataire_de_confiance(self):
        for i in range(5):
            self.assertEqual(self.connexion('mauvais', '10.0.0.9', HTTP_X_FORWARDED_FOR=f'1.2.3.{i}').status_code, 401)
        # Changer d'adresse annoncée ne contourne pas le blocage
        self.assertEqual(self.connexion('Motdepasse@1', '10.0.0.9', HTTP_X_FORWARDED_FOR='8.8.8.8').status_code, 429)
        self.assertEqual(TentativeConnexion.objects.filter(adresse_ip='10.0.0.9').count(), 5)

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_adresse_lue_chez_le_mandataire_de_confiance(self):
        self.connexion('mauvais', '10.0.0.1', HTTP_X_FORWARDED_FOR='6.6.6.6, 203.0.113.7')
        self.assertTrue(TentativeConnexion.objects.filter(adresse_ip='203.0.113.7').exists())

    def test_un_tiers_ne_peut_pas_verrouiller_le_compte_d_autrui(self):
        for _ in range(5):
            self.assertEqual(self.connexion('mauvais', '198.51.100.20').status_code, 401)
        self.assertEqual(self.connexion('Motdepasse@1', '198.51.100.20').status_code, 429)  # l'attaquant est bloqué
        self.assertEqual(self.connexion('Motdepasse@1', '203.0.113.50').status_code, 200)   # le vrai titulaire se connecte

    def test_le_big_boss_debloque_un_compte(self):
        for _ in range(5):
            self.connexion('mauvais', '198.51.100.21')
        self.assertEqual(self.connexion('Motdepasse@1', '198.51.100.21').status_code, 429)
        self.login(self.admin.username)
        reponse = self.post(f'utilisateurs/{self.superviseur.pk}/debloquer/', {}, status=200)
        self.assertEqual(reponse['echecs_effaces'], 5)
        self.assertEqual(self.connexion('Motdepasse@1', '198.51.100.21').status_code, 200)
        # Un superviseur ne peut pas débloquer
        self.assertEqual(self.client.post(f'/api/v1/utilisateurs/{self.admin.pk}/debloquer/').status_code, 403)

    def test_message_identique_pour_compte_inconnu_ou_mot_de_passe_faux(self):
        inconnu = self.connexion('x', '198.51.100.30', compte='inconnu@test.ci')
        faux = self.connexion('x', '198.51.100.31')
        self.assertEqual((inconnu.status_code, inconnu.json()), (faux.status_code, faux.json()))


class EnTetesEtExpositionTests(ApiTestCase):
    def test_en_tetes_de_securite(self):
        reponse = self.client.get('/api/v1/auth/me/')
        self.assertEqual(reponse['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(reponse['X-Frame-Options'], 'DENY')
        self.assertEqual(reponse['Referrer-Policy'], 'same-origin')
        self.assertEqual(reponse['Cross-Origin-Opener-Policy'], 'same-origin')
        csp = reponse['Content-Security-Policy']
        for directive in ("default-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"):
            self.assertIn(directive, csp)

    def test_cookies_de_session_httponly_et_jeton_csrf_lisible(self):
        self.assertTrue(self.client.cookies['allakro_access']['httponly'])
        self.assertTrue(self.client.cookies['allakro_refresh']['httponly'])
        self.assertEqual(self.client.cookies['allakro_refresh']['path'], '/api/v1/auth/')
        self.assertEqual(self.client.cookies['allakro_access']['samesite'], 'Lax')

    def test_interface_d_administration_django_absente(self):
        self.assertEqual(self.client.get('/admin/').status_code, 404)

    def test_sonde_de_sante_publique_sans_donnee(self):
        anonyme = APIClient()
        reponse = anonyme.get('/api/v1/sante/')
        self.assertEqual((reponse.status_code, reponse.json()), (200, {'ok': True}))

    def test_seul_le_json_est_accepte(self):
        reponse = self.client.post('/api/v1/plantations/', {'nom': 'X'}, format='multipart')
        self.assertEqual(reponse.status_code, 415)

    def test_toute_route_de_donnees_exige_une_connexion(self):
        anonyme = APIClient()
        for url in ('plantations', 'campements', 'blocs', 'personnes', 'types-travaux', 'travaux', 'salaires', 'paiements-salaire',
                    'depenses', 'categories-depenses', 'produits', 'mouvements-stock', 'particuliers', 'achats-particuliers',
                    'utilisateurs', 'journal', 'roles', 'equipes', 'tableau-de-bord', 'rapport', 'auth/me'):
            self.assertEqual(anonyme.get(f'/api/v1/{url}/').status_code, 401, url)

    def test_limitation_du_rapport(self):
        reponses = [self.client.get('/api/v1/rapport/') for _ in range(14)]
        self.assertIn(429, [r.status_code for r in reponses])


class InjectionsEtContraintesTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.referentiel()

    def test_octet_nul_refuse_en_entree_au_lieu_d_une_erreur_500(self):
        for url in ('depenses/?page=1&q=%00', 'travaux/?statut=a%00b', 'depenses/?ordering=%00', 'plantations/%00/'):
            self.assertEqual(self.client.get(f'/api/v1/{url}').status_code, 400, url)
        self.assertEqual(self.post('plantations/', {'nom': 'A\u0000B', 'superficie': 1}, status=400).get('nom') is not None, True)

    def test_parametres_d_url_malveillants_refuses_sans_toucher_la_base(self):
        for url in ("travaux/?bloc_id=1 OR 1=1", "travaux/?campement_id=1;DROP TABLE travail", "depenses/?periode=2025-01'; DELETE FROM depense;--",
                    "depenses/?date_debut=2025-01-01' OR '1'='1", "salaires/?personne_id=1 UNION SELECT * FROM utilisateur",
                    "personnes/?bloc_id=%27%20OR%20%271%27=%271"):
            reponse = self.client.get(f'/api/v1/{url}')
            self.assertEqual(reponse.status_code, 400, url)
        # Un filtre texte reçoit la valeur comme paramètre SQL, jamais comme code : aucun résultat, aucune erreur
        reponse = self.client.get("/api/v1/travaux/?statut=' OR '1'='1")
        self.assertEqual((reponse.status_code, reponse.json()), (200, []))
        self.assertEqual(self.client.get("/api/v1/produits/?produit_id=1;SELECT pg_sleep(5)").status_code, 200)
        self.assertEqual(self.client.get('/api/v1/plantations/').status_code, 200)  # les tables existent toujours

    def test_texte_html_stocke_tel_quel_et_renvoye_en_json_inerte(self):
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        piege = '<script>alert(document.cookie)</script><img src=x onerror=alert(1)>'
        depense = self.post('depenses/', {'designation': piege, 'categorie_id': categorie['id'], 'bloc_id': self.bloc['id'],
                                          'date': HIER, 'montant_total': 100})
        self.assertEqual(depense['designation'], piege)  # jamais interprété côté serveur ; React l'affiche comme du texte
        reponse = self.client.get('/api/v1/depenses/')
        self.assertEqual(reponse['Content-Type'], 'application/json')
        self.assertEqual(reponse['X-Content-Type-Options'], 'nosniff')

    def test_recu_pdf_avec_texte_html_dans_les_champs(self):
        from apps.finances.models import Salaire
        travail = self.creer_travail([self.ids_personnes()[0]], quantite=10, prix_unitaire=1000)
        salaire = Salaire.objects.get(travail_id=travail['id'])
        paiement = self.post('paiements-salaire/', {'salaire_id': salaire.pk, 'montant': 1000, 'type_paiement': 'ESPECES',
                                                    'reference': '<b>&</b>', 'observation': '<script>x</script> & <i>'})
        reponse = self.client.get(f"/api/v1/paiements-salaire/{paiement['id']}/recu/")
        self.assertEqual((reponse.status_code, reponse['Content-Type']), (200, 'application/pdf'))

    def ids_personnes(self):
        return [p['id'] for p in self.personnes]

    def test_la_base_refuse_les_valeurs_aberrantes_meme_hors_application(self):
        from apps.finances.models import CategorieDepense, Depense, PaiementSalaire
        from apps.stock.models import MouvementStock, Produit
        categorie = CategorieDepense.objects.create(libelle='Test')
        base = {'campement_id': self.campement['id'], 'categorie': categorie, 'date_depense': AUJOURDHUI, 'designation': 'x'}
        for valeurs in ({'montant_total': -5}, {'montant_total': 5, 'quantite': -1}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                Depense.objects.bulk_create([Depense(**base, **valeurs)])
        produit = Produit.objects.create(nom='P', unite='kg')
        for valeurs in ({'type_mouvement': 'ENTREE', 'quantite': -3}, {'type_mouvement': 'SORTIE', 'quantite': 0}):
            with self.assertRaises(IntegrityError), transaction.atomic():
                MouvementStock.objects.create(produit=produit, date_mouvement=AUJOURDHUI, **valeurs)
        travail = self.creer_travail([self.ids_personnes()[0]])
        from apps.finances.models import Salaire
        salaire = Salaire.objects.get(travail_id=travail['id'])
        with self.assertRaises(IntegrityError), transaction.atomic():
            PaiementSalaire.objects.create(salaire=salaire, montant=0, date_paiement=AUJOURDHUI, type_paiement='ESPECES')


class PerimetreParCampementTests(ApiTestCase):
    """Un superviseur ne voit, ne crée et ne modifie que les données de son campement ; le Big Boss voit tout."""

    def setUp(self):
        super().setUp()
        self.referentiel()  # campement A (celui du superviseur)
        self.campement_b = self.post('campements/', {'nom': 'Camp B', 'plantation_id': self.plantation['id'], 'superficie': 40,
                                                          'responsable_id': self.admin.personne_id})
        self.bloc_b = self.post('blocs/', {'nom': 'B1', 'campement_id': self.campement_b['id'], 'superficie': 10, 'nombre_plantes': 1000})
        self.personne_b = self.post('personnes/', {'nom': 'Etranger', 'prenom': 'B', 'telephone': '07 11 11 11 11',
                                                   'fonction_id': self.fonction.pk, 'bloc_id': self.bloc_b['id']})
        self.travail_b = self.creer_travail([self.personne_b['id']], bloc_id=self.bloc_b['id'])
        self.travail_a = self.creer_travail([self.personnes[0]['id']])
        categorie = self.post('categories-depenses/', {'libelle': 'Carburant'})
        self.depense_a = self.post('depenses/', {'designation': 'Gasoil A', 'categorie_id': categorie['id'], 'bloc_id': self.bloc['id'],
                                                 'date': HIER, 'montant_total': 1000})
        self.depense_b = self.post('depenses/', {'designation': 'Gasoil B', 'categorie_id': categorie['id'], 'bloc_id': self.bloc_b['id'],
                                                 'date': HIER, 'montant_total': 2000})
        self.categorie = categorie
        self.login(self.superviseur.username)

    def ids(self, url):
        return {x['id'] for x in self.get(url)}

    def test_les_listes_sont_limitees_au_campement_du_superviseur(self):
        self.assertEqual(self.ids('campements/'), {self.campement['id']})
        self.assertEqual(self.ids('blocs/'), {self.bloc['id'], self.bloc2['id']})
        self.assertNotIn(self.personne_b['id'], self.ids('personnes/'))
        self.assertEqual(self.ids('travaux/'), {self.travail_a['id']})
        self.assertEqual(self.ids('depenses/'), {self.depense_a['id']})
        self.assertEqual(len(self.get('salaires/')), 1)
        self.assertEqual(len(self.get('plantations/')), 1)
        # Le Big Boss voit tout
        self.login(self.admin.username)
        self.assertEqual(self.ids('depenses/'), {self.depense_a['id'], self.depense_b['id']})
        self.assertEqual(self.ids('travaux/'), {self.travail_a['id'], self.travail_b['id']})

    def test_objets_d_un_autre_campement_introuvables(self):
        for url in (f"travaux/{self.travail_b['id']}/", f"depenses/{self.depense_b['id']}/", f"blocs/{self.bloc_b['id']}/",
                    f"personnes/{self.personne_b['id']}/", f"campements/{self.campement_b['id']}/"):
            self.assertEqual(self.client.get(f'/api/v1/{url}').status_code, 404, url)
        self.assertEqual(self.client.patch(f"/api/v1/depenses/{self.depense_b['id']}/", {'montant_total': 1}, format='json').status_code, 404)
        self.assertEqual(self.client.post(f"/api/v1/travaux/{self.travail_b['id']}/annuler/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/v1/travaux/{self.travail_b['id']}/historique/").status_code, 404)

    def test_ecriture_hors_campement_refusee_et_annulee(self):
        avant = self.client.get('/api/v1/depenses/').json()
        refus = self.client.post('/api/v1/depenses/', {'designation': 'Intrus', 'categorie_id': self.categorie['id'],
                                                       'bloc_id': self.bloc_b['id'], 'date': HIER, 'montant_total': 5}, format='json')
        self.assertEqual(refus.status_code, 403)
        self.assertEqual(self.client.get('/api/v1/depenses/').json(), avant)
        self.login(self.admin.username)
        self.assertEqual(len(self.get('depenses/')), 2)  # rien n'a été enregistré en base
        self.login(self.superviseur.username)
        # Travail dans un bloc d'un autre campement, ou avec une personne d'un autre campement
        donnees = {'type_travail_id': self.activite('OUVERTURES'), 'date_travail': HIER, 'date_fin': HIER, 'quantite': 1, 'prix_unitaire': 1}
        self.assertEqual(self.client.post('/api/v1/travaux/', {**donnees, 'bloc_id': self.bloc_b['id'],
                                                               'personnes_ids': [self.personne_b['id']]}, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/v1/travaux/', {**donnees, 'bloc_id': self.bloc['id'],
                                                               'personnes_ids': [self.personne_b['id']]}, format='json').status_code, 403)
        self.login(self.admin.username)
        self.assertEqual(len(self.get('travaux/')), 2)

    def test_paiement_sur_une_remuneration_hors_campement_refuse(self):
        from apps.finances.models import Salaire
        salaire_b = Salaire.objects.get(travail_id=self.travail_b['id'])
        refus = self.client.post('/api/v1/paiements-salaire/', {'salaire_id': salaire_b.pk, 'montant': 100, 'type_paiement': 'ESPECES'},
                                 format='json')
        self.assertEqual(refus.status_code, 403)
        self.login(self.admin.username)
        self.assertEqual(self.get('paiements-salaire/'), [])

    def test_structure_reservee_au_big_boss(self):
        for url, donnees in (('plantations/', {'nom': 'P'}), ('campements/', {'nom': 'C', 'plantation_id': self.plantation['id']}),
                             ('categories-depenses/', {'libelle': 'Nouvelle'}), ('types-travaux/', {'libelle': 'AUTRE2'})):
            self.assertEqual(self.client.post(f'/api/v1/{url}', donnees, format='json').status_code, 403, url)
        for url in ('utilisateurs', 'journal', 'equipes'):
            self.assertEqual(self.client.get(f'/api/v1/{url}/').status_code, 403, url)

    def test_tableau_de_bord_et_rapport_limites_au_campement(self):
        kpis = self.get(f'tableau-de-bord/?periode={HIER[:7]}')['kpis']
        self.assertEqual(kpis['totalDepenses'], 1000.0)  # seulement la dépense du campement A
        self.assertEqual(self.client.get(f"/api/v1/tableau-de-bord/?campement_id={self.campement_b['id']}").status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/tableau-de-bord/?bloc_id={self.bloc_b['id']}").status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/rapport/?campement_id={self.campement_b['id']}").status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/rapport/?bloc_id={self.bloc_b['id']}").status_code, 403)
        self.assertEqual(self.client.get(f"/api/v1/rapport/?campement_id={self.campement['id']}").status_code, 200)
        self.login(self.admin.username)
        self.assertEqual(self.get(f'tableau-de-bord/?periode={HIER[:7]}')['kpis']['totalDepenses'], 3000.0)

    def test_superviseur_sans_campement_ne_voit_rien(self):
        from apps.core.models import Campement
        # Il n'est plus responsable d'aucun campement : le Big Boss en devient responsable
        Campement.objects.filter(pk=self.campement['id']).update(responsable_id=self.admin.personne_id)
        self.assertEqual(self.get('depenses/'), [])
        self.assertEqual(self.get('travaux/'), [])
        self.assertEqual(self.client.get('/api/v1/tableau-de-bord/').status_code, 403)

    def test_un_superviseur_ne_peut_pas_deplacer_une_personne_vers_un_campement_qu_il_ne_gere_pas(self):
        ouvrier = self.personnes[0]['id']
        refus = self.client.patch(f'/api/v1/personnes/{ouvrier}/', {'campement_id': self.campement_b['id']}, format='json')
        self.assertEqual(refus.status_code, 403)
        from apps.core.models import Personne
        self.assertEqual(Personne.objects.get(pk=ouvrier).campement_id, self.campement['id'])

    # ---- Responsables de campements et droits du superviseur (13 octobre 2026) ----

    def test_seuls_les_superviseurs_actifs_sont_proposes_comme_responsables(self):
        self.assertEqual(self.client.get('/api/v1/campements/responsables/').status_code, 403)  # superviseur
        self.login(self.admin.username)
        propose = {p['id'] for p in self.get('campements/responsables/')}
        # Superviseurs et Big Boss (qui peut aussi être responsable) : jamais les ouvriers sans compte
        self.assertEqual(propose, {self.superviseur.personne_id, self.admin.personne_id})
        # Une personne sans compte est refusée par l'API, même si l'interface ne la propose pas
        refus = self.client.post('/api/v1/campements/', {'nom': 'Camp C', 'plantation_id': self.plantation['id'], 'superficie': 1,
                                                          'responsable_id': self.personne_b['id']}, format='json')
        self.assertEqual(refus.status_code, 400)
        self.assertIn('responsable_id', refus.json())
        # Un compte désactivé n'est plus proposé
        Utilisateur.objects.filter(pk=self.superviseur.pk).update(actif=False)
        self.assertEqual({p['id'] for p in self.get('campements/responsables/')}, {self.admin.personne_id})

    def test_un_responsable_gere_plusieurs_campements(self):
        self.login(self.admin.username)
        responsable = self.superviseur.personne_id
        c1 = self.post('campements/', {'nom': 'Camp C', 'plantation_id': self.plantation['id'], 'superficie': 0, 'responsable_id': responsable})
        c2 = self.post('campements/', {'nom': 'Camp D', 'plantation_id': self.plantation['id'], 'superficie': 0, 'responsable_id': responsable})
        ligne = [p for p in self.get('campements/responsables/') if p['id'] == responsable][0]
        self.assertEqual(sorted(ligne['campements']), ['Camp A', 'Camp C', 'Camp D'])
        # Son périmètre = son campement d'affectation + les campements dont il est responsable (pas les autres)
        self.login(self.superviseur.username)
        self.assertEqual(self.ids('campements/'), {self.campement['id'], c1['id'], c2['id']})
        self.assertNotIn(self.campement_b['id'], self.ids('campements/'))
        self.assertEqual(self.client.get(f"/api/v1/campements/{self.campement_b['id']}/").status_code, 404)
        # Il peut choisir l'un de ses campements dans le tableau de bord, pas celui d'un autre
        ok = self.client.get(f"/api/v1/tableau-de-bord/?campement_id={c2['id']}")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.client.get(f"/api/v1/tableau-de-bord/?campement_id={self.campement_b['id']}").status_code, 403)

    def test_le_superviseur_n_a_pas_les_droits_du_big_boss(self):
        """Structure, comptes, journal, clôture, suppression : tout cela reste réservé au Big Boss (l'API répond 403)."""
        attendu_403 = [
            ('post', 'plantations/', {'nom': 'X', 'superficie': 1}),
            ('patch', f"plantations/{self.plantation['id']}/", {'nom': 'Renommée'}),
            ('delete', f"plantations/{self.plantation['id']}/", None),
            ('post', 'campements/', {'nom': 'X', 'plantation_id': self.plantation['id'], 'superficie': 1}),
            ('patch', f"campements/{self.campement['id']}/", {'nom': 'Renommé'}),
            ('delete', f"campements/{self.campement['id']}/", None),
            ('get', 'campements/responsables/', None),
            ('delete', f"blocs/{self.bloc['id']}/", None),
            ('post', 'types-travaux/', {'libelle': 'Nouvelle activité'}),
            ('post', 'categories-depenses/', {'libelle': 'Nouvelle catégorie'}),
            ('delete', f"depenses/{self.depense_a['id']}/", None),
            ('delete', f"travaux/{self.travail_a['id']}/", None),
            ('get', 'utilisateurs/', None),
            ('post', 'utilisateurs/', {'email': 'x@test.ci', 'role': 'big_boss', 'password': 'Motdepasse@1'}),
            ('patch', f"utilisateurs/{self.superviseur.pk}/", {'role': 'big_boss'}),
            ('post', f"utilisateurs/{self.admin.pk}/debloquer/", None),
            ('get', 'journal/', None),
            ('post', 'clotures/', {'periode': '2020-01'}),
            ('post', 'clotures/2020-01/rouvrir/', None),
        ]
        for methode, url, donnees in attendu_403:
            reponse = getattr(self.client, methode)(f'/api/v1/{url}', **({'data': donnees, 'format': 'json'} if donnees is not None else {}))
            self.assertEqual(reponse.status_code, 403, f'{methode.upper()} {url} -> {reponse.status_code} (attendu 403)')
        # Rien n'a changé
        self.login(self.admin.username)
        self.assertEqual(self.get(f"plantations/{self.plantation['id']}/")['nom'], self.plantation['nom'])
        self.assertEqual(Utilisateur.objects.get(pk=self.superviseur.pk).role.code, 'superviseur')

    # ---- Exploitation : responsable obligatoire, blocs et ouvriers au niveau du campement (15 octobre 2026) ----

    def test_un_campement_a_toujours_un_responsable(self):
        self.login(self.admin.username)
        donnees = {'nom': 'Camp Z', 'plantation_id': self.plantation['id'], 'superficie': 0}
        self.assertIn('responsable_id', self.post('campements/', donnees, status=400))
        # Une personne sans compte n'est pas un responsable valide
        self.assertEqual(self.client.post('/api/v1/campements/', {**donnees, 'responsable_id': self.personne_b['id']}, format='json').status_code, 400)
        # Le Big Boss peut l'être
        cree = self.post('campements/', {**donnees, 'responsable_id': self.admin.personne_id})
        self.assertEqual(cree['responsable_id'], self.admin.personne_id)
        # On ne retire jamais le responsable : on en désigne un autre
        self.assertEqual(self.client.patch(f"/api/v1/campements/{cree['id']}/", {'responsable_id': None}, format='json').status_code, 400)
        self.assertEqual(self.patch(f"campements/{cree['id']}/", {'responsable_id': self.superviseur.personne_id})['responsable_id'],
                         self.superviseur.personne_id)

    def test_un_responsable_ne_peut_pas_etre_desactive_tant_qu_il_gere_un_campement(self):
        self.login(self.admin.username)
        refus = self.client.patch(f'/api/v1/utilisateurs/{self.superviseur.pk}/', {'actif': False}, format='json')
        self.assertEqual(refus.status_code, 400)
        self.assertIn('actif', refus.json())
        refus = self.client.patch(f'/api/v1/personnes/{self.superviseur.personne_id}/', {'actif': False}, format='json')
        self.assertEqual(refus.status_code, 400)
        self.assertTrue(Utilisateur.objects.get(pk=self.superviseur.pk).actif)
        # Après avoir désigné un remplaçant sur tous ses campements, c'est permis
        self.patch(f"campements/{self.campement['id']}/", {'responsable_id': self.admin.personne_id})
        self.patch(f'utilisateurs/{self.superviseur.pk}/', {'actif': False})
        self.assertFalse(Utilisateur.objects.get(pk=self.superviseur.pk).actif)

    def test_le_responsable_cree_des_blocs_dans_ses_campements_seulement(self):
        cree = self.post('blocs/', {'nom': 'A3', 'campement_id': self.campement['id'], 'superficie': 5, 'nombre_plantes': 100})
        self.assertEqual(self.patch(f"blocs/{cree['id']}/", {'nombre_plantes': 150})['nombre_plantes'], 150)
        refus = self.client.post('/api/v1/blocs/', {'nom': 'B2', 'campement_id': self.campement_b['id'], 'superficie': 5,
                                                     'nombre_plantes': 10}, format='json')
        self.assertEqual(refus.status_code, 403)
        self.assertEqual(self.client.delete(f"/api/v1/blocs/{cree['id']}/").status_code, 403)  # la suppression reste au Big Boss
        self.login(self.admin.username)
        self.assertEqual(len([b for b in self.get('blocs/') if b['campement_id'] == self.campement_b['id']]), 1)  # rien créé chez B

    def test_le_responsable_enregistre_les_ouvriers_au_niveau_du_campement(self):
        ouvrier = self.post('personnes/', {'nom': 'Nouveau', 'prenom': 'Ouvrier', 'telephone': '07 55 55 55 55',
                                           'fonction_id': self.fonction.pk, 'campement_id': self.campement['id']})
        self.assertEqual((ouvrier['bloc_id'], ouvrier['campement_id']), (None, self.campement['id']))
        # Il travaille sur n'importe quel bloc du campement
        for bloc in (self.bloc, self.bloc2):
            self.creer_travail([ouvrier['id']], bloc_id=bloc['id'])
        # Pas dans un campement qu'il ne gère pas
        refus = self.client.post('/api/v1/personnes/', {'nom': 'Intrus', 'prenom': 'X', 'telephone': '07 66 66 66 66',
                                                         'fonction_id': self.fonction.pk, 'campement_id': self.campement_b['id']}, format='json')
        self.assertEqual(refus.status_code, 403)

    def test_un_compte_superviseur_sans_campement_puis_on_lui_en_confie(self):
        self.login(self.admin.username)
        compte = self.post('utilisateurs/', {'prenom': 'Koffi', 'nom_personne': 'Attente', 'email': 'koffi@test.ci',
                                             'role': 'superviseur', 'password': 'Superviseur@2026'})
        self.login('koffi@test.ci', 'Superviseur@2026')
        self.assertEqual(self.get('campements/'), [])
        self.login(self.admin.username)
        self.patch(f"utilisateurs/{compte['id']}/", {'campements_ids': [self.campement_b['id']]})
        self.assertEqual(self.get(f"campements/{self.campement_b['id']}/")['responsable_id'], compte['personne_id'])
        self.login('koffi@test.ci', 'Superviseur@2026')
        self.assertEqual(self.ids('campements/'), {self.campement_b['id']})
